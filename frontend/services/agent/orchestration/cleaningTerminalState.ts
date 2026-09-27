import { createCleaningRun, updateCleaningRun } from '../cleaningRunState';
import { buildCleaningVerificationReport, getWideCrosstabReason, verifyCleanedDatasetShape } from '../cleaningVerification';
import type { StoreApi } from '../types';
import { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV, buildWorkspaceCsv } from '../workspaceFileUtils';
import { createChatMessage } from '../../../utils/messageState';
import { ensureDuckDbSessionSync } from '../../duckdb/storeSessionSync';
import { profileDataWithWorker } from '../../workers/dataWorkerClient';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import type { CleaningStrategyDecision } from './cleaningStrategyResolver';
import type { CleaningFailureCode, CleaningRuntimeState } from './cleaningRuntimePolicy';
import { buildCleaningFailureMessage } from './cleaningRuntimePolicy';
import { handleAiAction } from '../actionHandler';

const LOG_PREFIX = '[CleaningOrchestrator]';

type RuntimeVerificationState = Pick<CleaningRuntimeState, 'inspectedRaw' | 'dominantBlockResolved'>;

const cloneCsvData = <T extends { data: Array<Record<string, unknown>>; metadataRows?: unknown[][]; headerLayers?: unknown[][]; summaryRows?: Array<Record<string, unknown>> }>(data: T): T => ({
    ...data,
    data: data.data.map(row => ({ ...row })),
    metadataRows: [...(data.metadataRows ?? [])].map(row => [...row]),
    headerLayers: [...(data.headerLayers ?? [])].map(row => [...row]),
    summaryRows: [...(data.summaryRows ?? [])].map(row => ({ ...row })),
});

const getVerificationSignal = (
    report: ReturnType<typeof buildCleaningVerificationReport>,
    key: string,
) => report.signals.find(signal => signal.key === key) ?? null;

export const getWideCrosstabCorrection = (store: StoreApi) => {
    const reason = getWideCrosstabReason(store.getState().rawCsvData, store.getState().csvData);
    if (!reason) return null;
    return `${reason} Use data.mutate with deterministic operations, preferably unpivot_columns, to convert identifier columns such as Code and Description into a long table with one key/value pair per row.`;
};

export const canCompleteCleaningWithoutEdit = (
    store: StoreApi,
    runtimeState?: RuntimeVerificationState | null,
) =>
    verifyCleanedDatasetShape(
        store.getState().rawCsvData,
        store.getState().csvData,
        store.getState().dataPreparationPlan,
        runtimeState,
    ).passed;

export const failCleaningRun = (store: StoreApi, code: CleaningFailureCode, detail?: string | null) => {
    const { explanation, chatMessage } = buildCleaningFailureMessage(code, detail);
    const state = store.getState();
    const message = detail ? `${code}: ${detail}` : code;
    console.error(`${LOG_PREFIX} Cleaning run failed: ${message}`);
    state.logTelemetryEvent?.({
        stage: 'executor_error',
        responseType: 'ai_cleaning_failure',
        detail: chatMessage,
        meta: {
            code,
            cleaningRunId: state.cleaningRun?.runId ?? null,
            resolved: false,
        },
    });
    state.logAgentToolUsage({
        tool: 'cleaning_runtime',
        description: `Cleaning run failed: ${code}`,
        stage: 'cleaning',
        category: 'conversation',
        risk: 'medium',
        policyDecision: 'allowed',
        policyReason: detail ?? chatMessage,
        detail: {
            code,
            detail: detail ?? null,
            chatMessage,
            cleaningRunId: state.cleaningRun?.runId ?? null,
            resolved: false,
        },
    });
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            status: 'failed',
            lastError: detail ? `${code}: ${detail}` : code,
            shouldAutoResume: false,
        }),
        dataPreparationPlan: prev.dataPreparationPlan
            ? {
                ...prev.dataPreparationPlan,
                explanation,
                outputColumns: prev.columnProfiles,
            }
            : prev.dataPreparationPlan,
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'ai',
                text: chatMessage,
                timestamp: new Date(),
                type: 'ai_cleaning_failure',
                isError: true,
                cleaningRunId: prev.cleaningRun?.runId,
                resolved: false,
                suggestedActions: [
                    { label: 'Continue cleaning', action: 'resume cleaning' },
                    { label: 'Restart cleaning', action: 'restart cleaning' },
                ],
            }),
        ],
    }));
};

export const completeCleaningRun = async (
    store: StoreApi,
    runtimeState?: RuntimeVerificationState | null,
    options?: { noEdit?: boolean },
): Promise<{ completed: boolean; reason?: string | null }> => {
    const dataset = store.getState().csvData;
    if (!dataset) {
        return { completed: false, reason: 'No cleaned dataset is loaded.' };
    }

    const verification = verifyCleanedDatasetShape(
        store.getState().rawCsvData,
        store.getState().csvData,
        store.getState().dataPreparationPlan,
        runtimeState,
    );
    if (!verification.passed) {
        return { completed: false, reason: verification.reason ?? 'Cleaning verification failed.' };
    }

    const verificationReport = buildCleaningVerificationReport(
        store.getState().rawCsvData,
        store.getState().csvData,
        store.getState().dataPreparationPlan,
        runtimeState,
    );
    const repeatedHeaderLeakageRate = Number(getVerificationSignal(verificationReport, 'repeated_header_leakage_rate')?.value ?? 1);
    const noiseLeakageRate = Number(getVerificationSignal(verificationReport, 'noise_leakage_rate')?.value ?? 1);
    const numericParseRate = Number(getVerificationSignal(verificationReport, 'numeric_parse_rate')?.value ?? 1);
    const suspiciousCollapseScore = Number(getVerificationSignal(verificationReport, 'suspicious_collapse_score')?.value ?? 1);
    if (repeatedHeaderLeakageRate > 0.02) {
        return { completed: false, reason: 'Dataset still contains repeated header rows after cleaning.' };
    }
    if (noiseLeakageRate > 0.02) {
        return { completed: false, reason: 'Dataset still contains header, footer, or blank noise rows after cleaning.' };
    }
    if (numericParseRate < 0.95) {
        return { completed: false, reason: 'The cleaned dataset still contains non-numeric measure values after reshaping.' };
    }
    if (suspiciousCollapseScore > 0.2) {
        return { completed: false, reason: 'The cleaned dataset appears collapsed and is not ready for downstream analysis.' };
    }

    const sync = await ensureDuckDbSessionSync(store, dataset, createWorkerDiagnosticsTelemetryReporter(store));
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            status: 'completed',
            shouldAutoResume: false,
            lastError: null,
        }),
        dataPreparationPlan: prev.dataPreparationPlan
            ? {
                ...prev.dataPreparationPlan,
                explanation: options?.noEdit
                    ? `AI cleaning session completed. cleaned.csv already passed verification and required no file edits before database analysis with ${dataset.data.length} rows.`
                    : `AI cleaning session completed. cleaned.csv was staged through deterministic mutations and is ready for database analysis with ${dataset.data.length} rows.`,
                outputColumns: prev.columnProfiles,
            }
            : prev.dataPreparationPlan,
        chatHistory: [
            ...prev.chatHistory.map(message => (
                message.type === 'ai_cleaning_failure' && message.resolved !== true
                    ? { ...message, resolved: true, isError: false, suggestedActions: [] }
                    : message
            )),
            createChatMessage({
                sender: 'ai',
                text: options?.noEdit
                    ? `Cleaning handoff complete. Runtime verified that \`cleaned.csv\` was already query-ready and no file edits were needed before database querying with ${dataset.data.length} rows.`
                    : `Cleaning handoff complete. Runtime verified the staged deterministic mutations and \`cleaned.csv\` is ready for database querying with ${dataset.data.length} rows.`,
                timestamp: new Date(),
                type: 'ai_cleaning_step',
                cleaningStep: {
                    stepId: `commit-${Date.now()}`,
                    kind: 'commit',
                    toolName: 'duckdb.sync',
                    path: WORKSPACE_DATASET_CLEAN_CSV,
                    diffSummary: options?.noEdit
                        ? `Verified ${dataset.data.length} rows in DuckDB (${sync.engine ?? 'unknown'}) without editing cleaned.csv.`
                        : `Committed ${dataset.data.length} rows to DuckDB (${sync.engine ?? 'unknown'}).`,
                    status: 'done',
                },
            }),
        ],
    }));
    return { completed: true };
};

export const resetCleanedDatasetToRawSnapshot = async (store: StoreApi) => {
    const rawData = store.getState().rawCsvData;
    if (!rawData) {
        return { ok: false as const, reason: 'Raw dataset is unavailable for recovery.' };
    }

    const nextData = cloneCsvData(rawData);
    const profileResult = await profileDataWithWorker(nextData.data);
    store.setState(prev => ({
        csvData: nextData,
        columnProfiles: profileResult.profiles,
        activeDataQuery: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        workspaceFiles: {
            ...(prev.workspaceFiles ?? {}),
            [WORKSPACE_DATASET_RAW_CSV]: buildWorkspaceCsv(rawData),
            [WORKSPACE_DATASET_CLEAN_CSV]: buildWorkspaceCsv(nextData),
        },
        dataPreparationPlan: prev.dataPreparationPlan
            ? {
                ...prev.dataPreparationPlan,
                explanation: 'AI cleaning reset cleaned.csv to the original raw snapshot before applying a raw-based recovery.',
                operations: [],
                outputColumns: profileResult.profiles,
                planStatus: 'schema_only',
                consistencyIssues: [],
            }
            : prev.dataPreparationPlan,
    }));

    return { ok: true as const };
};

export const recoverNoEditCleaningRun = async (
    store: StoreApi,
    runtime: CleaningRuntimeState,
    decision: CleaningStrategyDecision,
    allowDeterministicRecovery: boolean,
    reason: string | null,
): Promise<{ resolved: boolean; failureCode?: CleaningFailureCode; reason?: string | null }> => {
    if (canCompleteCleaningWithoutEdit(store, runtime)) {
        const completed = await completeCleaningRun(store, runtime, { noEdit: true });
        if (completed.completed) {
            return { resolved: true };
        }
        return {
            resolved: false,
            failureCode: 'failed_verification',
            reason: completed.reason,
        };
    }

    if (!allowDeterministicRecovery || decision.preferredAction?.type !== 'tool_call') {
        return {
            resolved: false,
            failureCode: reason?.startsWith('Repeated ') ? 'failed_stalled' : 'failed_no_edit',
            reason: decision.verificationGap ?? reason,
        };
    }

    if (decision.preferredActionSource === 'raw') {
        const resetResult = await resetCleanedDatasetToRawSnapshot(store);
        if (!resetResult.ok) {
            return {
                resolved: false,
                failureCode: 'failed_verification',
                reason: resetResult.reason,
            };
        }
    }

    const fallbackResult = await handleAiAction(decision.preferredAction, store, { toolStage: 'cleaning' });
    if (fallbackResult.status !== 'success') {
        return {
            resolved: false,
            failureCode: 'failed_verification',
            reason: fallbackResult.message,
        };
    }

    const completed = await completeCleaningRun(store, runtime);
    if (completed.completed) {
        return { resolved: true };
    }

    return {
        resolved: false,
        failureCode: 'failed_verification',
        reason: completed.reason ?? 'Deterministic strategy recovery did not pass verification.',
    };
};

export const startCleaningRun = (store: StoreApi, resume: boolean) => {
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(
            prev.cleaningRun ?? createCleaningRun(),
            {
                status: 'running',
                shouldAutoResume: false,
                lastError: null,
                targetPath: WORKSPACE_DATASET_CLEAN_CSV,
                startedAt: prev.cleaningRun?.startedAt ?? new Date(),
                strategyKind: undefined,
                targetShape: undefined,
                lastVerificationReason: null,
            },
        ),
        chatHistory: resume
            ? prev.chatHistory.map(message => (
                message.type === 'ai_cleaning_failure' && message.resolved !== true
                    ? { ...message, resolved: true, isError: false, suggestedActions: [] }
                    : message
            ))
            : [
                ...prev.chatHistory.map(message => (
                    message.type === 'ai_cleaning_failure' && message.resolved !== true
                        ? { ...message, resolved: true, isError: false, suggestedActions: [] }
                        : message
                )),
                createChatMessage({
                    sender: 'ai',
                    text: 'AI cleaning started. Runtime will inspect `cleaned.csv`, apply an edit if needed, verify the result, then hand off to analysis.',
                    timestamp: new Date(),
                    type: 'ai_plan_start',
                }),
            ],
    }));
};
