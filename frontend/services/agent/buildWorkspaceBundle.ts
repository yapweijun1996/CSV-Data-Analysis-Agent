import type { AppStore } from '../../store/useAppStore';
import type { WorkspaceBundle, WorkspaceFile } from '../../types';
import { buildCleaningInspectionBundle } from './buildCleaningInspectionBundle';
import { buildChartReviewBundle } from './buildChartReviewBundle';
import { buildDataPreparationWorkflowBundle } from './buildDataPreparationWorkflowBundle';
import { buildBuiltinToolRegistry, resolveAllowedTools } from './tools/toolRegistry';
import { buildToolAvailabilityContext, buildToolGovernanceSnapshot } from './tools/toolGovernance';
import {
    WORKSPACE_DATASET_CLEAN_CSV,
    WORKSPACE_DATASET_RAW_CSV,
    WORKSPACE_HISTORY_LIMIT,
    WORKSPACE_INTAKE_IR_JSON,
    WORKSPACE_REPORT_CONTEXT_JSON,
    WORKSPACE_RUNTIME_TABLE_ASSESSMENT_JSON,
    buildWorkspaceCsv,
    getWorkspaceFileLanguage,
    isWorkspaceReadablePath,
    isWorkspaceWritablePath,
} from './workspaceFileUtils';
import { toCorrelationRecord } from './correlation';

const MAX_CHAT_MESSAGES = 40;
const MAX_CONTEXT_EVENTS = 40;

const toIso = (value: Date | string | null | undefined) => {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

const formatNdjson = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n');

const createFile = (
    path: string,
    language: WorkspaceFile['language'],
    content: string,
    group: WorkspaceFile['group'],
    badges: WorkspaceFile['badges'] = ['virtual'],
): WorkspaceFile => ({
    path,
    label: path.split('/').filter(Boolean).slice(-1)[0] ?? path,
    language,
    content,
    group,
    badges,
});

const getWorkspaceFileGroup = (path: string): WorkspaceFile['group'] => {
    if (path.startsWith('/dataset/')) return 'dataset';
    if (path.startsWith('/workspace/')) return 'workspace';
    return 'debug';
};

export const buildWorkspaceBundle = (state: AppStore): WorkspaceBundle => {
    const inspection = buildCleaningInspectionBundle(state);
    const chartReviewBundle = buildChartReviewBundle(state);
    const workflow = buildDataPreparationWorkflowBundle(state);
    const files: WorkspaceFile[] = [];
    const workspaceSnapshot = { ...(state.workspaceFiles ?? {}) };
    // Build intake IR sidecar — provisional structure evidence from intake
    const intakeIrSidecar = state.rawIntakeIr
        ? formatJson({
            fileName: state.rawIntakeIr.fileName,
            columnCount: state.rawIntakeIr.columnCount,
            provisionalTable: state.rawIntakeIr.provisionalTable,
            diagnostics: state.rawIntakeIr.diagnostics,
            segmentCount: state.rawIntakeIr.segments.length,
        })
        : null;

    // Build runtime table assessment sidecar — confirmed structure from runtime inspect
    const runtimeAssessmentSidecar = state.cleaningRun?.runtimeTableAssessment
        ? formatJson(state.cleaningRun.runtimeTableAssessment)
        : null;

    const datasetFiles = [
        {
            path: WORKSPACE_DATASET_RAW_CSV,
            content: buildWorkspaceCsv(state.rawCsvData ?? state.csvData),
        },
        {
            path: WORKSPACE_DATASET_CLEAN_CSV,
            content: buildWorkspaceCsv(state.csvData),
        },
        {
            path: WORKSPACE_REPORT_CONTEXT_JSON,
            content: formatJson(inspection.reportContext),
        },
        ...(intakeIrSidecar ? [{
            path: WORKSPACE_INTAKE_IR_JSON,
            content: intakeIrSidecar,
        }] : []),
        ...(runtimeAssessmentSidecar ? [{
            path: WORKSPACE_RUNTIME_TABLE_ASSESSMENT_JSON,
            content: runtimeAssessmentSidecar,
        }] : []),
    ];

    datasetFiles.forEach(file => {
        if (file.content) {
            workspaceSnapshot[file.path] = file.content;
        }
    });

    const chatActions = state.chatHistory.slice(-MAX_CHAT_MESSAGES).map(message => ({
        timestamp: toIso(message.timestamp),
        sender: message.sender,
        type: message.type,
        text: message.text,
    }));
    const safeWorkspaceHistory = [...(state.workspaceActionHistory ?? [])]
        .slice(-WORKSPACE_HISTORY_LIMIT)
        .map(entry => ({
            ...entry,
            timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp),
        }));
    const cardSummaries = state.analysisCards.map(card => ({
        id: card.id,
        title: card.plan.title,
        description: card.plan.description,
        summary: card.summary.text,
        summaryLanguage: card.summary.language,
        chartType: card.displayChartType,
        rowCount: card.aggregatedData.length,
        groupByColumn: card.plan.groupByColumn ?? null,
        valueColumn: card.plan.valueColumn ?? null,
        aggregation: card.plan.aggregation ?? null,
        previewRows: card.aggregatedData.slice(0, 10),
    }));
    const queryHistory = (state.queryHistory ?? []).slice(-10).map(entry => ({
        id: entry.id,
        correlation: {
            ...toCorrelationRecord(entry),
            datasetId: state.currentDatasetId ?? null,
            cleaningRunId: state.cleaningRun?.runId ?? null,
            requestId: null,
        },
        phase: entry.phase,
        explanation: entry.explanation,
        engine: entry.engine,
        sqlPreview: entry.sqlPreview,
        tableName: entry.tableName,
        loadVersion: entry.loadVersion,
        fallbackReason: entry.fallbackReason ?? null,
        appliedAt: toIso(entry.appliedAt),
        toolCategory: entry.toolCategory ?? 'data',
        policyDecision: entry.policyDecision ?? 'allowed',
        policyReason: entry.policyReason ?? null,
        result: entry.result,
    }));
    const contextTelemetry = state.telemetryEvents
        .filter(event => event.meta?.callType === 'data_prep' || event.meta?.callType === 'chat')
        .slice(-MAX_CONTEXT_EVENTS)
        .map(event => ({
            id: event.id,
            timestamp: toIso(event.timestamp),
            correlation: toCorrelationRecord(event),
            stage: event.stage,
            responseType: event.responseType,
            detail: event.detail,
            meta: event.meta ?? null,
        }));
    const toolContext = buildToolAvailabilityContext(state, {
        toolStage: !state.cleaningRun || state.cleaningRun.status === 'completed' ? 'analysis' : 'cleaning',
    });
    const resolvedRegistry = resolveAllowedTools(buildBuiltinToolRegistry(toolContext.columnNames), toolContext);
    const toolPolicySnapshot = buildToolGovernanceSnapshot({
        stage: resolvedRegistry.stage,
        allowedTools: resolvedRegistry.allowedTools,
        blockedTools: resolvedRegistry.blockedTools,
        diagnostics: resolvedRegistry.diagnostics,
    });

    files.push(createFile('/cleaning/session-summary.json', 'json', formatJson({
        explanation: inspection.cleaning.explanation,
        status: inspection.cleaning.status,
        planStatus: inspection.cleaning.planStatus,
        consistencyIssues: inspection.cleaning.consistencyIssues,
        outputColumns: inspection.cleaning.outputColumns,
        loopCount: state.cleaningRun?.loopCount ?? 0,
        inspectionStatus: inspection.rowInspection.inspectionStatus,
        residualUnknownRowCount: inspection.rowInspection.residualUnknownRowCount,
        residualSummaryLikeRowCount: inspection.rowInspection.residualSummaryLikeRowCount,
    }), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/intake-diagnostics.json', 'json', formatJson(inspection.intakeDiagnostics), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/report-shape.json', 'json', formatJson(inspection.reportShape.profile), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/reshape-hypotheses.json', 'json', formatJson(inspection.reportShape.hypotheses), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/row-inspection.json', 'json', formatJson(inspection.rowInspection.latest), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/row-classification.json', 'json', formatJson(inspection.rowInspection.latest?.rows ?? []), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/cleaning-loop-history.json', 'json', formatJson(inspection.loopHistory), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/cleaning/verification-signals.json', 'json', formatJson(inspection.verification.shapeVerification), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/chat/actions.ndjson', 'ndjson', formatNdjson(chatActions), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/chat/spreadsheet-filter.json', 'json', formatJson({
        active: Boolean(state.activeSpreadsheetFilter ?? state.spreadsheetFilterFunction),
        correlation: {
            ...toCorrelationRecord({
                sessionId: state.sessionId,
                datasetId: state.currentDatasetId,
                turnId: state.activeTurn?.turnId,
                stepId: state.activeTurn?.steps.at(-1)?.stepId,
                cleaningRunId: state.cleaningRun?.runId,
                requestId: state.activeSpreadsheetFilter?.requestId,
            }),
        },
        requestId: state.activeSpreadsheetFilter?.requestId ?? null,
        origin: state.activeSpreadsheetFilter?.origin ?? null,
        query: state.activeSpreadsheetFilter?.query ?? null,
        finalReply: state.activeSpreadsheetFilter?.finalReply ?? state.aiFilterExplanation ?? null,
        operation: state.activeSpreadsheetFilter?.operation ?? state.spreadsheetFilterFunction ?? null,
        observation: state.activeSpreadsheetFilter?.observation ?? null,
        appliedAt: toIso(state.activeSpreadsheetFilter?.appliedAt),
    }), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/chat/data-query.json', 'json', formatJson({
        active: Boolean(state.activeDataQuery),
        correlation: {
            ...toCorrelationRecord(state.activeDataQuery),
            datasetId: state.currentDatasetId ?? null,
            cleaningRunId: state.cleaningRun?.runId ?? null,
            requestId: null,
        },
        explanation: state.activeDataQuery?.explanation ?? null,
        engine: state.activeDataQuery?.engine ?? null,
        sqlPreview: state.activeDataQuery?.sqlPreview ?? null,
        tableName: state.activeDataQuery?.tableName ?? null,
        loadVersion: state.activeDataQuery?.loadVersion ?? null,
        fallbackReason: state.activeDataQuery?.fallbackReason ?? null,
        toolCategory: 'data',
        policyDecision: 'allowed',
        policyReason: null,
        plan: state.activeDataQuery?.plan ?? null,
        result: state.activeDataQuery?.result
            ? {
                totalMatchedRows: state.activeDataQuery.result.totalMatchedRows,
                returnedRows: state.activeDataQuery.result.returnedRows,
                truncated: state.activeDataQuery.result.truncated,
                selectedColumns: state.activeDataQuery.result.selectedColumns,
                appliedOrderBy: state.activeDataQuery.result.appliedOrderBy,
                appliedLimit: state.activeDataQuery.result.appliedLimit,
                durationMs: state.activeDataQuery.result.durationMs,
                previewRows: state.activeDataQuery.result.rows.slice(0, 20),
            }
            : null,
    }), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/chat/query-history.json', 'json', formatJson(queryHistory), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/analysis/cards.json', 'json', formatJson(cardSummaries.map(card => ({
        id: card.id,
        title: card.title,
        chartType: card.chartType,
        rowCount: card.rowCount,
        groupByColumn: card.groupByColumn,
        valueColumn: card.valueColumn,
        aggregation: card.aggregation,
    }))), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/analysis/card-snapshot.json', 'json', formatJson(cardSummaries), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/analysis/chart-review-bundle.json', 'json', formatJson(chartReviewBundle), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/context/data-prep-context.ndjson', 'ndjson', formatNdjson(contextTelemetry.filter(event => event.meta?.callType === 'data_prep')), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/context/chat-context.ndjson', 'ndjson', formatNdjson(contextTelemetry.filter(event => event.meta?.callType === 'chat')), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/context/tool-policy.json', 'json', formatJson(toolPolicySnapshot), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/context/tool-diagnostics.json', 'json', formatJson(resolvedRegistry.diagnostics), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/logs/agent-events.ndjson', 'ndjson', formatNdjson(inspection.logs.pipeline), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/logs/agent-tool-logs.ndjson', 'ndjson', formatNdjson(inspection.logs.toolLogs), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/logs/telemetry.ndjson', 'ndjson', formatNdjson(inspection.logs.telemetry), 'debug', ['virtual', 'generated', 'debug']));
    files.push(createFile('/workspace/actions.ndjson', 'ndjson', formatNdjson(safeWorkspaceHistory), 'debug', ['virtual', 'generated', 'debug']));

    Object.entries(workspaceSnapshot).forEach(([path, content]) => {
        if (!path || !isWorkspaceReadablePath(path)) return;
        const group = getWorkspaceFileGroup(path);
        const badges: NonNullable<WorkspaceFile['badges']> = [
            'virtual',
            ...(path.startsWith('/dataset/') ? ['generated'] as const : []),
            ...(isWorkspaceWritablePath(path) ? ['editable'] as const : []),
            ...(group === 'debug' ? ['debug'] as const : []),
        ];
        const existingIndex = files.findIndex(file => file.path === path);
        const nextFile: WorkspaceFile = {
            path,
            label: path.split('/').filter(Boolean).slice(-1)[0] ?? path,
            language: getWorkspaceFileLanguage(path),
            content: String(content),
            group,
            badges,
        };
        if (existingIndex >= 0) {
            files[existingIndex] = nextFile;
        } else {
            files.push(nextFile);
        }
    });

    const summary = {
        sessionId: state.sessionId,
        datasetId: state.currentDatasetId,
        reportTitle: inspection.reportContext.effective.reportTitle,
        activeGoal: state.confirmedAnalysisGoal,
        provider: state.settings.provider,
        model: state.settings.complexModel,
        rawRowCount: inspection.importFacts.rawRowCount,
        cleanedRowCount: inspection.importFacts.cleanedRowCount,
        rawColumnCount: inspection.profiling.originalSchema.length || inspection.samples.rawSample.columns.length,
        cleanedColumnCount: inspection.profiling.outputSchema.length || inspection.samples.cleanedSample.columns.length,
        latestMutationStatus: inspection.cleaning.status,
        preparationState: workflow.summary.preparationState,
        overallStatus: workflow.verification.overallStatus,
        analysisState: workflow.summary.analysisState,
        availableFiles: [] as string[],
    };

    files.unshift(createFile('/session/summary.json', 'json', formatJson(summary), 'debug', ['virtual', 'generated', 'debug']));
    summary.availableFiles = files.map(file => file.path);
    files[0] = createFile('/session/summary.json', 'json', formatJson(summary), 'debug', ['virtual', 'generated', 'debug']);

    const primaryFiles = files.filter(file => file.group !== 'debug');
    const debugFiles = files.filter(file => file.group === 'debug');
    const editableFiles = files.filter(file => isWorkspaceWritablePath(file.path));

    return {
        summary,
        files,
        primaryFiles,
        debugFiles,
        editableFiles,
    };
};
