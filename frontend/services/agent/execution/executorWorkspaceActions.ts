import { createId } from '../../../utils/createId';
import type { AppStore } from '../../../store/useAppStore';
import type { AiAction, CsvData, ToolName, WorkspaceActionHistoryEntry, WorkspaceFileAction } from '../../../types';
import { buildWorkspaceBundle } from '../buildWorkspaceBundle';
import { appendCleaningRunStep } from '../cleaningRunState';
import type { StoreApi } from '../types';
import {
    isWorkspaceDatasetWritePath,
    isWorkspaceReadablePath,
    isWorkspaceWritablePath,
    parseWorkspaceCsv,
    truncateWorkspaceOutput,
    WORKSPACE_ACTION_OUTPUT_LIMIT,
    WORKSPACE_DATASET_CLEAN_CSV,
    WORKSPACE_DATASET_RAW_CSV,
    WORKSPACE_HISTORY_LIMIT,
    WORKSPACE_LIST_LIMIT,
    WORKSPACE_SEARCH_DEFAULT_LIMIT,
    WORKSPACE_SEARCH_MAX_LIMIT,
} from '../workspaceFileUtils';
import { buildWorkspaceTree, diffWorkspaceFiles, grepWorkspaceFiles, headWorkspaceFile } from '../workspaceRetrieval';
import { profileDataWithWorker } from '../../workers/dataWorkerClient';
import { isRuntimeAbortError, throwIfAborted } from '../runtime/runtimeAbort';
import { getToolGovernanceMeta } from './executorGovernance';
import { createChatMessage } from '../../../utils/messageState';
import { ensureDuckDbSessionSync } from '../../duckdb/storeSessionSync';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';

const buildWorkspaceEntry = (
    action: AiAction,
    details: {
        path: string;
        success: boolean;
        message: string;
        output?: string;
        durationMs: number;
        stage?: WorkspaceActionHistoryEntry['stage'];
        toolCategory?: WorkspaceActionHistoryEntry['toolCategory'];
        policyDecision?: WorkspaceActionHistoryEntry['policyDecision'];
        policyReason?: WorkspaceActionHistoryEntry['policyReason'];
    },
): WorkspaceActionHistoryEntry => ({
    timestamp: new Date(),
    operation: action.type === 'tool_call' && action.toolName.startsWith('workspace.')
        ? action.toolName.replace('workspace.', '') as WorkspaceActionHistoryEntry['operation']
        : 'read',
    path: details.path || 'unknown',
    success: details.success,
    message: details.message,
    output: details.output ?? '',
    durationMs: details.durationMs,
    stage: details.stage,
    toolCategory: details.toolCategory,
    policyDecision: details.policyDecision,
    policyReason: details.policyReason,
});

const parseWorkspaceWriteDataSet = (_path: string, content: string, currentData: CsvData | null): CsvData => ({
    fileName: currentData?.fileName ?? 'cleaned.csv',
    data: parseWorkspaceCsv(content),
    metadataRows: currentData?.metadataRows ?? [],
    headerLayers: currentData?.headerLayers ?? [],
    summaryRows: currentData?.summaryRows ?? [],
    headerDepth: currentData?.headerDepth,
    summaryRowCount: currentData?.summaryRowCount,
});

const normalizeWorkspaceOutput = (value: unknown) => truncateWorkspaceOutput(typeof value === 'string' ? value : JSON.stringify(value));
const resolveWorkspaceSearchLimit = (requested?: number) => !Number.isFinite(requested as number) || requested == null ? WORKSPACE_SEARCH_DEFAULT_LIMIT : Math.min(WORKSPACE_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(requested)));
const resolveWorkspaceListLimit = (requested?: number) => !Number.isFinite(requested as number) || requested == null ? WORKSPACE_LIST_LIMIT : Math.min(WORKSPACE_LIST_LIMIT, Math.max(1, Math.floor(requested)));

const appendWorkspaceTraceMessage = (store: StoreApi, detail: { toolName: string; path: string; kind: 'inspect' | 'edit' | 'verify' | 'commit'; status: 'done' | 'error'; diffSummary?: string; text: string; isError?: boolean }) => {
    store.setState(prev => ({
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'ai',
                text: detail.text,
                timestamp: new Date(),
                type: 'ai_cleaning_step',
                isError: detail.isError,
                cleaningStep: {
                    stepId: createId(detail.toolName),
                    kind: detail.kind,
                    toolName: detail.toolName,
                    path: detail.path,
                    diffSummary: detail.diffSummary,
                    status: detail.status,
                },
            }),
        ],
        cleaningRun: prev.cleaningRun ? appendCleaningRunStep(prev.cleaningRun, { kind: detail.kind, toolName: detail.toolName, path: detail.path, diffSummary: detail.diffSummary, status: detail.status }) : prev.cleaningRun,
    }));
};

const resolveCleaningFailureCards = (chatHistory: AppStore['chatHistory'], runId?: string | null) =>
    chatHistory.map(message => (
        message.type === 'ai_cleaning_failure' && message.resolved !== true && (!runId || !message.cleaningRunId || message.cleaningRunId === runId)
            ? { ...message, resolved: true, isError: false, suggestedActions: [] }
            : message
    ));

const toPath = (rawPath: string) => rawPath.replace(/\\/g, '/');

const toWorkspaceOperation = (toolName: ToolName): WorkspaceFileAction['operation'] =>
    toolName.replace('workspace.', '') as WorkspaceFileAction['operation'];

const withActionHistory = async (
    store: StoreApi,
    action: AiAction,
    path: string,
    run: () => Promise<{ successMessage: string; output?: string; diffSummary?: string; payload?: Record<string, unknown> }>,
    abortSignal?: AbortSignal,
) => {
    const start = Date.now();
    const toolName = action.type === 'tool_call' ? action.toolName : 'workspace.read';
    const governance = getToolGovernanceMeta(store, toolName as ToolName);
    const kind = ['workspace.read', 'workspace.list', 'workspace.tree', 'workspace.search', 'workspace.grep', 'workspace.head', 'workspace.diff'].includes(toolName) ? 'inspect' : 'edit';
    try {
        throwIfAborted(abortSignal);
        const result = await run();
        throwIfAborted(abortSignal);
        const entry = buildWorkspaceEntry(action, { path, success: true, message: result.successMessage, output: result.output, durationMs: Date.now() - start, stage: governance.stage, toolCategory: governance.descriptor?.category ?? 'unknown', policyDecision: governance.decision?.allowed === false ? 'blocked' : 'allowed', policyReason: governance.decision?.reason ?? null });
        const current = store.getState().workspaceActionHistory ?? [];
        store.setState({ workspaceActionHistory: [...current, entry].slice(-WORKSPACE_HISTORY_LIMIT) });
        store.getState().logAgentToolUsage({ tool: toolName, description: `workspace success: ${entry.operation} ${entry.path}`, stage: governance.stage, category: governance.descriptor?.category ?? 'unknown', risk: governance.descriptor?.risk ?? 'unknown', policyDecision: governance.decision?.allowed === false ? 'blocked' : 'allowed', policyReason: governance.decision?.reason ?? null, detail: { path: entry.path, operation: entry.operation, success: entry.success, stage: governance.stage, policyDecision: governance.decision?.allowed === false ? 'blocked' : 'allowed', policyReason: governance.decision?.reason ?? null } });
        appendWorkspaceTraceMessage(store, { toolName, path, kind, status: 'done', diffSummary: result.diffSummary, text: `**${toolName}** \`${path}\`\n${result.diffSummary ?? result.successMessage}` });
        return result;
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        const entry = buildWorkspaceEntry(action, { path, success: false, message: error instanceof Error ? error.message : String(error), durationMs: Date.now() - start, stage: governance.stage, toolCategory: governance.descriptor?.category ?? 'unknown', policyDecision: governance.decision?.allowed === false ? 'blocked' : 'allowed', policyReason: governance.decision?.reason ?? null });
        const current = store.getState().workspaceActionHistory ?? [];
        store.setState({ workspaceActionHistory: [...current, entry].slice(-WORKSPACE_HISTORY_LIMIT) });
        store.getState().logAgentToolUsage({ tool: toolName, description: `workspace failed: ${entry.operation} ${entry.path}`, stage: governance.stage, category: governance.descriptor?.category ?? 'unknown', risk: governance.descriptor?.risk ?? 'unknown', policyDecision: governance.decision?.allowed === false ? 'blocked' : 'allowed', policyReason: governance.decision?.reason ?? entry.message, detail: { path: entry.path, operation: entry.operation, error: entry.message, stage: governance.stage, policyDecision: governance.decision?.allowed === false ? 'blocked' : 'allowed', policyReason: governance.decision?.reason ?? null } });
        appendWorkspaceTraceMessage(store, { toolName, path, kind, status: 'error', text: `**${toolName}** \`${path}\`\nFailed: ${entry.message}`, isError: true });
        throw error;
    }
};

export const executeWorkspaceFileAction = async (
    action: AiAction,
    store: StoreApi,
    options?: { abortSignal?: AbortSignal },
) => {
    const { getState, setState } = store;
    if (action.type !== 'tool_call' || !action.toolName.startsWith('workspace.')) return;
    const workspaceAction: WorkspaceFileAction = {
        ...(action.args ?? {}),
        operation: toWorkspaceOperation(action.toolName),
    };
    const operation = workspaceAction.operation;
    const defaultPath = ['list', 'tree', 'search', 'grep'].includes(operation) ? '/' : operation === 'diff' ? WORKSPACE_DATASET_CLEAN_CSV : '/workspace';
    const normalizedPath = (() => { const path = toPath(String(workspaceAction.path || defaultPath)); return path.startsWith('/') ? path : `/${path}`; })();
    const currentData = getState().csvData;
    if (!isWorkspaceReadablePath(normalizedPath) && !['list', 'tree'].includes(operation)) throw new Error(`Workspace path not allowed: ${normalizedPath}`);

    return withActionHistory(store, action, normalizedPath, async () => {
        throwIfAborted(options?.abortSignal);
        const bundle = buildWorkspaceBundle(getState());
        const allFiles = bundle.files;
        const exactMatch = allFiles.find(file => file.path === normalizedPath);
        if (operation === 'list') {
            const base = normalizedPath === '/' || normalizedPath === '' ? '/' : normalizedPath;
            const recursive = Boolean(workspaceAction.recursive);
            const limit = resolveWorkspaceListLimit(workspaceAction.limit as number | undefined);
            const matched = allFiles.filter(file => { if (!file.path.startsWith(base === '/' ? '/' : `${base}/`)) return false; if (!recursive) { const relative = file.path.slice(base === '/' ? 1 : base.length + 1); return relative.length > 0 && !relative.includes('/'); } return true; }).map(file => ({ path: file.path, pathType: 'file' }));
            return { successMessage: `Listed ${matched.length} workspace file(s).`, output: normalizeWorkspaceOutput({ operation, path: base, recursive, files: matched.slice(0, limit) }), payload: { workspace: { operation, path: base, changed: false, affectsCleanedDataset: false } } };
        }
        if (operation === 'tree') {
            const base = normalizedPath === '/' || normalizedPath === '' ? '/' : normalizedPath;
            return { successMessage: `Built workspace tree for ${base}.`, output: normalizeWorkspaceOutput({ operation, path: base, tree: buildWorkspaceTree(allFiles, base) }), payload: { workspace: { operation, path: base, changed: false, affectsCleanedDataset: false } } };
        }
        if (operation === 'read') {
            if (!exactMatch) throw new Error(`File not found: ${normalizedPath}`);
            return { successMessage: `Read ${normalizedPath}.`, output: truncateWorkspaceOutput(exactMatch.content, WORKSPACE_ACTION_OUTPUT_LIMIT), payload: { workspace: { operation, path: normalizedPath, changed: false, affectsCleanedDataset: false } } };
        }
        if (operation === 'search') {
            const query = String(workspaceAction.query || '');
            if (!query) throw new Error('search requires a non-empty query.');
            const caseSensitive = Boolean(workspaceAction.caseSensitive);
            const queryNeedle = caseSensitive ? query : query.toLowerCase();
            const limit = resolveWorkspaceSearchLimit(workspaceAction.limit as number | undefined);
            const scope = normalizedPath === '/' || normalizedPath === '' ? '/' : normalizedPath;
            const matches = allFiles.filter(file => file.path.startsWith(scope === '/' ? '/' : `${scope}/`)).map(file => ((caseSensitive ? file.content : file.content.toLowerCase()).includes(queryNeedle) ? { path: file.path, match: true, pathPreview: file.path } : null)).filter((item): item is { path: string; match: boolean; pathPreview: string } => item !== null).slice(0, limit);
            return { successMessage: `Search completed for "${query}"`, output: normalizeWorkspaceOutput(matches), payload: { workspace: { operation, path: scope, changed: false, affectsCleanedDataset: false } } };
        }
        if (operation === 'grep') {
            const query = String(workspaceAction.query || '');
            if (!query) throw new Error('grep requires a non-empty query.');
            const scope = normalizedPath === '/' || normalizedPath === '' ? '/' : normalizedPath;
            return { successMessage: `Grep completed for "${query}".`, output: normalizeWorkspaceOutput({ operation, path: scope, matches: grepWorkspaceFiles(allFiles, scope, query, resolveWorkspaceSearchLimit(workspaceAction.limit as number | undefined), Boolean(workspaceAction.caseSensitive)) }), payload: { workspace: { operation, path: scope, changed: false, affectsCleanedDataset: false } } };
        }
        if (operation === 'head') {
            if (!exactMatch) throw new Error(`File not found: ${normalizedPath}`);
            const head = headWorkspaceFile(exactMatch, Math.min(50, Math.max(1, Number(workspaceAction.limit ?? 10))));
            return { successMessage: `Read the first ${head.lines.length} line(s) from ${normalizedPath}.`, output: normalizeWorkspaceOutput(head), payload: { workspace: { operation, path: normalizedPath, changed: false, affectsCleanedDataset: false } } };
        }
        if (operation === 'diff') {
            if (!exactMatch) throw new Error(`File not found: ${normalizedPath}`);
            const compareNormalizedPath = (() => { const comparePath = toPath(String(workspaceAction.comparePath || WORKSPACE_DATASET_RAW_CSV)); return comparePath.startsWith('/') ? comparePath : `/${comparePath}`; })();
            if (!isWorkspaceReadablePath(compareNormalizedPath)) throw new Error(`Workspace path not allowed: ${compareNormalizedPath}`);
            const compareFile = allFiles.find(file => file.path === compareNormalizedPath);
            if (!compareFile) throw new Error(`Compare file not found: ${compareNormalizedPath}`);
            const diff = diffWorkspaceFiles(compareNormalizedPath, compareFile.content, normalizedPath, exactMatch.content, Math.min(40, Math.max(1, Number(workspaceAction.limit ?? 20))));
            return { successMessage: `Diff completed between ${compareNormalizedPath} and ${normalizedPath}.`, output: normalizeWorkspaceOutput(diff), payload: { workspace: { operation, path: normalizedPath, comparePath: compareNormalizedPath, changedLines: diff.changedLines, changed: false, affectsCleanedDataset: false } } };
        }

        if (!isWorkspaceWritablePath(normalizedPath)) throw new Error(`Write permission denied for ${normalizedPath}`);
        if (operation === 'write' && workspaceAction.content === undefined) throw new Error('write requires content.');
        if (operation === 'append' && workspaceAction.content === undefined) throw new Error('append requires content.');
        if (operation === 'replace' && (workspaceAction.oldText == null || workspaceAction.newText == null)) throw new Error('replace requires oldText and newText.');

        const existingContent = exactMatch?.content ?? '';
        let nextContent = existingContent;
        if (operation === 'write') nextContent = String(workspaceAction.content || '');
        if (operation === 'append') nextContent = `${existingContent}${String(workspaceAction.content || '')}`;
        if (operation === 'replace') {
            const oldText = String(workspaceAction.oldText);
            const newText = String(workspaceAction.newText);
            if (!existingContent.includes(oldText)) throw new Error(`replace target not found in ${normalizedPath}`);
            nextContent = Boolean(workspaceAction.replaceAll) ? existingContent.split(oldText).join(newText) : existingContent.replace(oldText, newText);
        }

        const nextWorkspaceFiles = { ...(getState().workspaceFiles ?? {}), [normalizedPath]: nextContent };
        const lineCountBefore = existingContent.length === 0 ? 0 : existingContent.split('\n').length;
        const lineCountAfter = nextContent.length === 0 ? 0 : nextContent.split('\n').length;
        const diffSummary = operation === 'replace' ? `Updated ${normalizedPath} with targeted replacements. ${lineCountBefore} -> ${lineCountAfter} lines.` : operation === 'append' ? `Appended new content to ${normalizedPath}. ${lineCountBefore} -> ${lineCountAfter} lines.` : `Overwrote ${normalizedPath}. ${lineCountBefore} -> ${lineCountAfter} lines.`;

        if (isWorkspaceDatasetWritePath(normalizedPath)) {
            if (!currentData) throw new Error('No cleaned dataset loaded. Cannot apply cleaned dataset edit.');
            const nextData = parseWorkspaceWriteDataSet(normalizedPath, nextContent, currentData);
            throwIfAborted(options?.abortSignal);
            const profileResult = await profileDataWithWorker(nextData.data, options?.abortSignal);
            throwIfAborted(options?.abortSignal);
            setState({
                csvData: { ...currentData, ...nextData },
                workspaceFiles: nextWorkspaceFiles,
                columnProfiles: profileResult.profiles,
                activeDataQuery: null,
                activeSpreadsheetFilter: null,
                spreadsheetFilterFunction: null,
                aiFilterExplanation: null,
                dataPreparationPlan: getState().dataPreparationPlan ? { ...getState().dataPreparationPlan, explanation: 'AI workspace cleaning edited cleaned.csv.', outputColumns: profileResult.profiles, planStatus: 'operations', consistencyIssues: [] } : { explanation: 'AI workspace cleaning edited cleaned.csv.', operations: [], outputColumns: profileResult.profiles, planStatus: 'operations', consistencyIssues: [] },
                chatHistory: resolveCleaningFailureCards(getState().chatHistory, getState().cleaningRun?.runId),
            });
            throwIfAborted(options?.abortSignal);
            const duckDbSync = await ensureDuckDbSessionSync(store, { ...currentData, ...nextData }, createWorkerDiagnosticsTelemetryReporter(store));
            throwIfAborted(options?.abortSignal);
            if (duckDbSync.status === 'ready') {
                getState().logAgentToolUsage({ tool: 'duckdb_query_engine', description: 'Synced cleaned dataset after workspace_file edit.', detail: { tableName: duckDbSync.tableName, loadVersion: duckDbSync.loadVersion } });
            } else if (duckDbSync.fallbackStage === 'bind_failed' || duckDbSync.fallbackStage === 'query_failed') {
                getState().logAgentToolUsage({ tool: 'duckdb_query_engine', description: 'DuckDB dataset sync failed after workspace edit.', detail: { tableName: duckDbSync.tableName, loadVersion: duckDbSync.loadVersion, fallbackStage: duckDbSync.fallbackStage, error: duckDbSync.fallbackReason } });
            }
            throwIfAborted(options?.abortSignal);
            await getState().regenerateAnalyses({ ...currentData, ...nextData });
        } else {
            throwIfAborted(options?.abortSignal);
            setState({ workspaceFiles: nextWorkspaceFiles });
        }

        return { successMessage: `${operation} completed on ${normalizedPath}`, output: normalizeWorkspaceOutput({ path: normalizedPath, content: nextContent }), diffSummary, payload: { workspace: { operation, path: normalizedPath, changed: nextContent !== existingContent, affectsCleanedDataset: isWorkspaceDatasetWritePath(normalizedPath), lineCountBefore, lineCountAfter } } };
    }, options?.abortSignal);
};
