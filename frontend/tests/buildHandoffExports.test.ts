import { describe, expect, it } from 'vitest';
import {
    buildAiDebugBundle,
    buildFailureHandoffExport,
    buildPlannerFailureBundleExport,
    buildRecentPayloadSnapshotsExport,
    buildRuntimeLogsExport,
    buildSqlExecutorFailureBundleExport,
} from '../services/agent/buildHandoffExports';
import type { AppStore } from '../store/useAppStore';
import { createTestSettings } from './testSettings';
import { makeActiveSpreadsheetFilter, makeAgentTurn } from './testFactories';

const createState = (overrides: Partial<AppStore> = {}): AppStore => ({
    sessionId: 'session-test',
    currentDatasetId: 'dataset-test',
    currentView: 'analysis_dashboard',
    isAppInitializing: false,
    isBusy: false,
    settings: createTestSettings({
        provider: 'google',
        geminiApiKey: 'key',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'Mandarin',
        autoConfirmGoal: false,
    }),
    progressMessages: [],
    csvData: null,
    rawCsvData: null,
    rawIntakeIr: null,
    reportStructureResolution: null,
    canonicalCsvData: null,
    canonicalBuildMeta: null,
    canonicalizationStatus: 'idle',
    pipelineOutcome: null,
    columnProfiles: [],
    analysisCards: [],
    chatHistory: [
        {
            sender: 'ai',
            text: 'Cleaning stopped after inspection only. No edits were written to `cleaned.csv`.',
            timestamp: new Date('2026-03-11T01:00:00.000Z'),
            type: 'ai_cleaning_failure',
            isError: true,
            cleaningRunId: 'run-1',
            resolved: false,
        },
    ],
    finalSummary: null,
    aiCoreAnalysisSummary: null,
    dataPreparationPlan: null,
    initialDataSample: null,
    vectorStoreDocuments: [],
    spreadsheetFilterFunction: null,
    activeDataQuery: null,
    activeSpreadsheetFilter: null,
    aiFilterExplanation: null,
    pendingClarification: null,
    pendingMutationConfirmation: null,
    aiTaskStatus: null,
    agentEvents: [],
    agentToolLogs: [],
    confirmedAnalysisGoal: null,
    goalState: 'idle',
    agentMemoryRun: null,
    liveAgentMemoryRun: null,
    agentMemoryHistory: [],
    selectedMemoryRunId: null,
    dataQualityIssues: null,
    isChangingGoal: false,
    planQueue: [],
    contextualSummary: null,
    telemetryEvents: [],
    isGeneratingReport: false,
    reportGenerationProgress: null,
    sessionCreatedAt: null,
    cardEnhancementSuggestions: [],
    isCardReviewInProgress: false,
    workspaceFiles: {},
    workspaceActionHistory: [],
    cleaningRun: null,
    queryHistory: [],
    ...overrides,
} as AppStore);

describe('buildRuntimeLogsExport', () => {
    it('includes unresolved chat cleaning failures in runtime export payload', () => {
        const exportText = buildRuntimeLogsExport(createState({
            analysisCards: [
                {
                    id: 'card-1',
                    plan: {
                        title: 'Revenue by Project',
                        description: 'Compare revenue by project.',
                        chartType: 'bar',
                        groupByColumn: 'SeriesLabelL1',
                        valueColumn: 'Value',
                        aggregation: 'sum',
                    },
                    aggregatedData: [{ SeriesLabelL1: 'BDB LAB DESIGN', Value: 1200 }],
                    summary: { language: 'Mandarin', text: '摘要' },
                    displayChartType: 'bar',
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                    hiddenLabels: [],
                },
            ],
        }));

        expect(exportText).toContain('Chat failures: 1');
        expect(exportText).toContain('"chatFailures"');
        expect(exportText).toContain('"type": "ai_cleaning_failure"');
        expect(exportText).toContain('"resolved": false');
        expect(exportText).toContain('"cleaningRunId": "run-1"');
        expect(exportText).toContain('"stabilitySummary"');
        expect(exportText).toContain('"irDiagnostics"');
        expect(exportText).toContain('"semanticRole": "business_dimension"');
    });

    it('includes planner stability signal counts and cleaning recovery paths in runtime export payload', () => {
        const exportText = buildRuntimeLogsExport(createState({
            telemetryEvents: [
                {
                    id: 'telemetry-1',
                    provider: 'google',
                    stage: 'planner_ready',
                    responseType: 'planner_stability_signal',
                    detail: 'Presentation timeout fallback used.',
                    meta: {
                        reasonCode: 'presentation_timeout_fallback',
                        reasonCodes: ['presentation_timeout_fallback', 'planner_degraded_non_blocking'],
                    },
                    timestamp: new Date('2026-03-11T01:04:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
            cleaningRun: {
                runId: 'run-1',
                status: 'completed',
                currentStep: 1,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-11T01:10:00.000Z'),
                updatedAt: new Date('2026-03-11T01:10:00.000Z'),
                targetPath: '/cleaned.csv',
                iterationArtifacts: [
                    {
                        round: 1,
                        inspectionStatus: 'completed',
                        rowCountBefore: 10,
                        rowCountAfter: 8,
                        droppedRowIndexes: [8, 9],
                        residualUnknownRowCount: 0,
                        residualSummaryLikeRowCount: 1,
                        usedAi: false,
                        verificationPassed: false,
                        verificationReason: 'Noise rows remain.',
                        failureSignalKey: 'noise_leakage_rate',
                        recoveryPath: 'deterministic_cleanup',
                        noiseLeakageRate: 0.12,
                        repeatedHeaderLeakageRate: 0,
                        artifactPaths: [],
                        summary: 'summary_like=1',
                    },
                ],
            },
        }));

        expect(exportText).toContain('"plannerReasonCounts"');
        expect(exportText).toContain('"presentation_timeout_fallback": 1');
        expect(exportText).toContain('"cleaningRecoveryCounts"');
        expect(exportText).toContain('"deterministic_cleanup": 1');
    });

    it('does not crash when chatHistory is missing from a partial modal snapshot', () => {
        const state = createState() as AppStore & { chatHistory?: AppStore['chatHistory'] };
        delete state.chatHistory;

        const exportText = buildRuntimeLogsExport(state as AppStore);

        expect(exportText).toContain('Chat failures: 0');
        expect(exportText).toContain('"chatFailures": []');
    });

    it('includes recent payload snapshots for tool, telemetry, and agent events', () => {
        const exportText = buildRecentPayloadSnapshotsExport(createState({
            agentToolLogs: [
                {
                    id: 'tool-1',
                    timestamp: new Date('2026-03-11T01:05:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    turnId: 'turn-1',
                    stepId: 'step-1',
                    requestId: 'request-1',
                    tool: 'data.query',
                    description: 'Executed read-only data query',
                    detail: { sql: 'select * from dataset limit 10' },
                    stage: 'analysis',
                    category: 'data',
                    risk: 'low',
                    policyDecision: 'allowed',
                    policyReason: null,
                },
            ],
            telemetryEvents: [
                {
                    id: 'telemetry-1',
                    provider: 'google',
                    stage: 'context_prepared',
                    responseType: 'summary',
                    detail: 'Prepared context window',
                    chunkSize: 2,
                    meta: { estimatedPromptTokens: 420 },
                    timestamp: new Date('2026-03-11T01:04:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
            agentEvents: [
                {
                    id: 'event-1',
                    phase: 'execution',
                    step: 'query_complete',
                    status: 'done',
                    message: 'Finished read-only query',
                    detail: { rowCount: 10 },
                    timestamp: new Date('2026-03-11T01:03:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
        }));

        expect(exportText).toContain('Recent payload snapshots: 3');
        expect(exportText).toContain('Scope: dataset dataset-test');
        expect(exportText).toContain('"recentPayloads"');
        expect(exportText).toContain('"scope"');
        expect(exportText).toContain('"source": "agentToolLogs"');
        expect(exportText).toContain('"source": "telemetryEvents"');
        expect(exportText).toContain('"source": "agentEvents"');
        expect(exportText).toContain('"sql": "select * from dataset limit 10"');
        expect(exportText).toContain('"estimatedPromptTokens": 420');
        expect(exportText).toContain('"rowCount": 10');
        expect(exportText).toContain('"correlation"');
        expect(exportText).toContain('"requestId": "request-1"');
        expect(exportText).toContain('"irDiagnostics"');
    });

    it('prefers current cleaning run scope over older dataset entries in recent payload export', () => {
        const exportText = buildRecentPayloadSnapshotsExport(createState({
            cleaningRun: {
                runId: 'cleaning-run-current',
                status: 'running',
                currentStep: 1,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-11T01:10:00.000Z'),
                updatedAt: new Date('2026-03-11T01:10:00.000Z'),
                targetPath: '/cleaned.csv',
                lastError: null,
                shouldAutoResume: false,
            },
            agentToolLogs: [
                {
                    id: 'tool-old',
                    timestamp: new Date('2026-03-11T01:05:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-old',
                    tool: 'data.query',
                    description: 'Old run tool log',
                    detail: { sql: 'select 1' },
                    stage: 'analysis',
                    category: 'data',
                    risk: 'low',
                    policyDecision: 'allowed',
                    policyReason: null,
                },
                {
                    id: 'tool-current',
                    timestamp: new Date('2026-03-11T01:06:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-current',
                    tool: 'data.mutate',
                    description: 'Current run tool log',
                    detail: { operation: 'drop_blank_rows' },
                    stage: 'cleaning',
                    category: 'data',
                    risk: 'low',
                    policyDecision: 'allowed',
                    policyReason: null,
                },
            ],
            telemetryEvents: [
                {
                    id: 'telemetry-old',
                    provider: 'google',
                    stage: 'worker_diagnostics',
                    responseType: 'duckdb.initDuckDb',
                    detail: 'Old run telemetry',
                    timestamp: new Date('2026-03-11T01:05:30.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-old',
                },
                {
                    id: 'telemetry-current',
                    provider: 'google',
                    stage: 'worker_diagnostics',
                    responseType: 'duckdb.loadCleanDataset',
                    detail: 'Current run telemetry',
                    timestamp: new Date('2026-03-11T01:06:30.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-current',
                },
            ],
            agentEvents: [
                {
                    id: 'event-old',
                    phase: 'file',
                    step: 'pipeline_cleaning',
                    status: 'error',
                    message: 'Old run failed.',
                    timestamp: new Date('2026-03-11T01:07:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-old',
                },
                {
                    id: 'event-current',
                    phase: 'file',
                    step: 'pipeline_cleaning',
                    status: 'in_progress',
                    message: 'Current run started.',
                    timestamp: new Date('2026-03-11T01:07:30.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-current',
                },
            ],
        }));

        expect(exportText).toContain('Scope: cleaning_run cleaning-run-current');
        expect(exportText).toContain('"cleaning-run-current"');
        expect(exportText).not.toContain('"cleaning-run-old"');
        expect(exportText).toContain('Current run tool log');
        expect(exportText).not.toContain('Old run failed.');
    });

    it('omits debug modal open logs from recent payload export', () => {
        const exportText = buildRecentPayloadSnapshotsExport(createState({
            agentToolLogs: [
                {
                    id: 'tool-open',
                    timestamp: new Date('2026-03-19T14:04:27.902Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    tool: 'workspace_builder',
                    description: 'Opened debug logs modal.',
                    detail: { datasetId: 'dataset-test' },
                },
                {
                    id: 'tool-real',
                    timestamp: new Date('2026-03-19T14:04:28.902Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    tool: 'duckdb_query_engine',
                    description: 'DuckDB analyst workspace session is ready.',
                    detail: { tableName: 'session_clean_dataset' },
                },
            ],
        }));

        expect(exportText).toContain('Recent payload snapshots: 1');
        expect(exportText).toContain('DuckDB analyst workspace session is ready.');
        expect(exportText).not.toContain('Opened debug logs modal.');
    });

    it('prefers the active request scope over a stale cleaning run in recent payload export', () => {
        const exportText = buildRecentPayloadSnapshotsExport(createState({
            activeSpreadsheetFilter: makeActiveSpreadsheetFilter({ requestId: 'request-current' }),
            activeTurn: makeAgentTurn({ turnId: 'turn-current', runId: 'run-current' }),
            cleaningRun: {
                runId: 'cleaning-run-stale',
                status: 'running',
                currentStep: 1,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-11T01:10:00.000Z'),
                updatedAt: new Date('2026-03-11T01:10:00.000Z'),
                targetPath: '/cleaned.csv',
                lastError: null,
                shouldAutoResume: false,
            },
            agentToolLogs: [
                {
                    id: 'tool-stale-cleaning',
                    timestamp: new Date('2026-03-11T01:05:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-stale',
                    tool: 'data.mutate',
                    description: 'Stale cleaning run tool log',
                    detail: { operation: 'drop_blank_rows' },
                    stage: 'cleaning',
                    category: 'data',
                    risk: 'low',
                    policyDecision: 'allowed',
                    policyReason: null,
                },
                {
                    id: 'tool-request-current',
                    timestamp: new Date('2026-03-11T01:06:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    turnId: 'turn-current',
                    requestId: 'request-current',
                    tool: 'spreadsheet.filter',
                    description: 'Current request tool log',
                    detail: { query: 'contains TUAS ROAD' },
                    stage: 'analysis',
                    category: 'spreadsheet',
                    risk: 'low',
                    policyDecision: 'allowed',
                    policyReason: null,
                },
            ],
        }));

        expect(exportText).toContain('Scope: request request-current');
        expect(exportText).toContain('Current request tool log');
        expect(exportText).not.toContain('Stale cleaning run tool log');
    });

    it('drops debug modal self-observation entries from recent payload export', () => {
        const exportText = buildRecentPayloadSnapshotsExport(createState({
            agentToolLogs: [
                {
                    id: 'tool-modal-open',
                    timestamp: new Date('2026-03-11T01:06:30.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    tool: 'workspace_builder',
                    description: 'Opened debug logs modal.',
                    detail: { datasetId: 'dataset-test' },
                },
                {
                    id: 'tool-real',
                    timestamp: new Date('2026-03-11T01:06:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    tool: 'data.query',
                    description: 'Executed read-only data query',
                    detail: { sql: 'select * from dataset limit 10' },
                    stage: 'analysis',
                    category: 'data',
                    risk: 'low',
                    policyDecision: 'allowed',
                    policyReason: null,
                },
            ],
        }));

        expect(exportText).toContain('Recent payload snapshots: 1');
        expect(exportText).toContain('Executed read-only data query');
        expect(exportText).not.toContain('Opened debug logs modal.');
    });

    it('preserves the event reason code inside recent payload trace contracts', () => {
        const exportText = buildRecentPayloadSnapshotsExport(createState({
            agentEvents: [
                {
                    id: 'event-1',
                    phase: 'execution',
                    step: 'auto_analysis_paused',
                    status: 'done',
                    message: 'Automatic analysis paused.',
                    detail: { reasonCode: 'header_shape_drift' },
                    timestamp: new Date('2026-03-11T01:03:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
        }));

        expect(exportText).toContain('"reasonCode": "header_shape_drift"');
    });

    it('builds planner and SQL failure bundles with standardized sections', () => {
        const state = createState({
            confirmedAnalysisGoal: 'Evaluate Project Profitability',
            settings: createTestSettings({
                provider: 'google',
                geminiApiKey: 'key',
                simpleModel: 'gemini-3-flash-preview',
                complexModel: 'gemini-3-flash-preview',
                language: 'Mandarin',
                autoConfirmGoal: false,
            }),
            columnProfiles: [
                { name: 'Project Name', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'Actual Cost (H)', type: 'numerical', missingPercentage: 0, valueRange: [0, 10] },
            ],
            duckDbSessionStatus: {
                status: 'error',
                engine: 'duckdb',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-test',
                fallbackReason: 'DuckDB query failed',
                lastSyncedAt: null,
            },
            queryHistory: [
                {
                    id: 'query-1',
                    sessionId: 'session-test',
                    turnId: 'turn-1',
                    stepId: 'step-1',
                    phase: 'analysis',
                    origin: 'analysis',
                    explanation: 'Automatic SQL-first analysis',
                    plan: { select: ['Project Name', 'Actual Cost (H)'] },
                    engine: 'duckdb',
                    sqlPreview: 'SELECT "Project Name", "Actual Cost (H)" FROM session_clean_dataset',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-test',
                    fallbackReason: null,
                    appliedAt: new Date('2026-03-11T01:04:30.000Z'),
                    result: {
                        totalMatchedRows: 0,
                        returnedRows: 0,
                        truncated: false,
                        selectedColumns: ['Project Name', 'Actual Cost (H)'],
                        appliedOrderBy: [],
                        appliedLimit: 50,
                        durationMs: 12,
                        previewRows: [],
                    },
                },
            ],
            agentToolLogs: [
                {
                    id: 'tool-context',
                    timestamp: new Date('2026-03-11T01:04:00.000Z'),
                    tool: 'context_manager',
                    description: 'Prepared planner context',
                    detail: { callType: 'planner' },
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
                {
                    id: 'tool-sql',
                    timestamp: new Date('2026-03-11T01:05:00.000Z'),
                    tool: 'duckdb_query_engine',
                    description: 'SQL execution failed',
                    detail: { sqlPreview: 'SELECT 1', error: 'Query failed' },
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
            telemetryEvents: [
                {
                    id: 'telemetry-planner',
                    provider: 'google',
                    stage: 'context_prepared',
                    responseType: 'planner',
                    detail: 'Prepared planner context',
                    meta: { callType: 'planner' },
                    timestamp: new Date('2026-03-11T01:04:10.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
            agentEvents: [
                {
                    id: 'planner-error',
                    phase: 'planning',
                    step: 'plan_topic',
                    status: 'error',
                    message: 'SQL-first planning failed for topic "Projects exceeding budget": invalid plan',
                    detail: { failureStage: 'planning_invalid' },
                    timestamp: new Date('2026-03-11T01:04:20.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
                {
                    id: 'sql-error',
                    phase: 'planning',
                    step: 'plan_topic',
                    status: 'error',
                    message: 'SQL-first planning failed for topic "Actual Cost by Project": query failed',
                    detail: { failureStage: 'duckdb_query_failed' },
                    timestamp: new Date('2026-03-11T01:05:20.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
        });

        const plannerBundle = buildPlannerFailureBundleExport(state);
        const sqlBundle = buildSqlExecutorFailureBundleExport(state);

        expect(plannerBundle).toContain('Planner Failure Bundle Export');
        expect(plannerBundle).toContain('"summary"');
        expect(plannerBundle).toContain('"session"');
        expect(plannerBundle).toContain('"context"');
        expect(plannerBundle).toContain('"logs"');
        expect(plannerBundle).toContain('"artifacts"');
        expect(plannerBundle).toContain('"failureType": "planning_invalid"');
        expect(plannerBundle).toContain('"correlation"');

        expect(sqlBundle).toContain('SQL Executor Failure Bundle Export');
        expect(sqlBundle).toContain('"failureType": "duckdb_query_failed"');
        expect(sqlBundle).toContain('"sqlPreview": "SELECT \\"Project Name\\", \\"Actual Cost (H)\\" FROM session_clean_dataset"');
        expect(sqlBundle).toContain('"duckDbStatus"');
    });

    it('buildAiDebugBundle returns markdown starting with # AI Debug Bundle', () => {
        const result = buildAiDebugBundle(createState() as AppStore);
        expect(result).toMatch(/^# AI Debug Bundle/);
    });

    it('buildAiDebugBundle includes all major section headings when state has data', () => {
        const state = createState({
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 5, missingPercentage: 0 },
            ],
            agentEvents: [
                {
                    id: 'err-1',
                    phase: 'planning',
                    step: 'plan_topic',
                    status: 'error',
                    message: 'Planning failed',
                    detail: { failureStage: 'planning_invalid' },
                    timestamp: new Date('2026-03-11T01:00:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
            runtimeEvents: [
                {
                    id: 're-1',
                    type: 'turn_started',
                    message: 'Turn started',
                    timestamp: new Date('2026-03-11T01:01:00.000Z'),
                    sessionId: 'session-test',
                },
            ],
            runtimeRunHistory: [
                {
                    runId: 'run-abc',
                    turnId: 'turn-1',
                    sessionId: 'session-test',
                    userMessage: 'Analyze revenue',
                    lifecycleState: 'completed',
                    outcomeKind: 'accepted',
                    retryCount: 0,
                    toolSequence: ['data.query'],
                    finalObservationSummary: 'Completed analysis',
                    createdAt: new Date('2026-03-11T01:02:00.000Z'),
                },
            ],
        });

        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Data Schema');
        expect(result).toContain('## Data Preparation');
        expect(result).toContain('## Errors & Failures');
        expect(result).toContain('## Runtime Events');
        expect(result).toContain('## Runtime Run History');
        expect(result).toContain('## Bundle Guide');
    });

    it('buildAiDebugBundle header includes session ID, dataset ID, and provider', () => {
        const state = createState({
            sessionId: 'session-xyz',
            currentDatasetId: 'dataset-abc',
            settings: createTestSettings({
                provider: 'openai',
                complexModel: 'gpt-4o',
                language: 'Mandarin',
                autoConfirmGoal: false,
            }),
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('session-xyz');
        expect(result).toContain('dataset-abc');
        expect(result).toContain('openai');
    });

    it('buildAiDebugBundle renders column profiles as markdown table', () => {
        const state = createState({
            columnProfiles: [
                { name: 'Revenue', type: 'numerical', uniqueValues: 100, missingPercentage: 0.05 },
                { name: 'Region', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            ],
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('| Column | Type |');
        expect(result).toContain('Revenue');
        expect(result).toContain('Region');
    });

    it('buildAiDebugBundle formats missing percentages once in the schema table', () => {
        const state = createState({
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 5, missingPercentage: 25, hasFormattedNumbers: false },
            ],
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('| Region | categorical | 5 | 25.0% | no |');
        expect(result).not.toContain('2500.0%');
    });

    it('buildAiDebugBundle handles empty/minimal state without crashing', () => {
        const state = createState();
        const result = buildAiDebugBundle(state as AppStore);
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^# AI Debug Bundle/);
    });

    it('buildAiDebugBundle renders Data Sample section with first 3 rows truncated to 50 chars', () => {
        const longValue = 'A'.repeat(80);
        const state = createState({
            csvData: {
                fileName: 'test.csv',
                data: [
                    { Region: 'East', Revenue: 1200, Note: longValue },
                    { Region: 'West', Revenue: 900, Note: 'Short' },
                    { Region: 'North', Revenue: 450, Note: 'Also short' },
                    { Region: 'South', Revenue: 300, Note: 'Row 4 — must not appear' },
                ],
            },
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Data Sample');
        expect(result).toContain('| Region | Revenue | Note |');
        expect(result).toContain('East');
        expect(result).toContain('West');
        expect(result).toContain('North');
        expect(result).not.toContain('Row 4');
        // longValue truncated to 50 chars + ellipsis
        expect(result).toContain('A'.repeat(50) + '…');
        expect(result).not.toContain('A'.repeat(51));
    });

    it('buildAiDebugBundle omits Data Sample section when csvData has no rows', () => {
        const state = createState({ csvData: null });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).not.toContain('## Data Sample');
    });

    it('buildAiDebugBundle renders Harness Directives section from semanticUnderstanding', () => {
        const state = createState({
            latestAnalysisSession: {
                sessionId: 'session-test',
                runId: 'run-test',
                origin: 'auto_analysis',
                status: 'completed',
                maxSteps: 20,
                stepsUsed: 8,
                currentStepId: null,
                stopReason: null,
                analysisMode: 'business',
                analysisModeReason: null,
                harnessSummary: 'Hierarchy detected in Description column. Label-code pairs blocked.',
                harnessCoverage: null,
                semanticUnderstanding: {
                    businessGrains: ['Project', 'Region'],
                    candidateMetrics: ['Revenue', 'Cost'],
                    timeGrains: [],
                    helperDimensions: ['Period'],
                    blockedDimensions: ['Description Code', 'Category Code'],
                    detailRowPolicy: 'exclude_non_detail_rows',
                    businessGlossary: [],
                    businessGrainConfidence: 'high',
                    unsafeForBusinessNarrative: false,
                },
                hypotheses: [],
                acceptedOutputs: [],
                rejectedOutputs: [],
                queryHistory: [],
                trace: [],
                summary: null,
            },
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Harness Directives');
        expect(result).toContain('**businessGrains** (promoted): Project, Region');
        expect(result).toContain('**blockedDimensions**: Description Code, Category Code');
        expect(result).toContain('← dimensions excluded from groupBy');
        expect(result).toContain('**helperDimensions**: Period');
        expect(result).toContain('**candidateMetrics**: Revenue, Cost');
        expect(result).toContain('exclude_non_detail_rows');
        expect(result).toContain('Hierarchy detected in Description column');
    });

    it('buildAiDebugBundle omits Harness Directives when semanticUnderstanding is null', () => {
        const state = createState({
            latestAnalysisSession: {
                sessionId: 'session-test',
                runId: 'run-test',
                origin: 'auto_analysis',
                status: 'completed',
                maxSteps: 20,
                stepsUsed: 1,
                currentStepId: null,
                stopReason: null,
                analysisMode: 'business',
                analysisModeReason: null,
                harnessSummary: null,
                harnessCoverage: null,
                semanticUnderstanding: null,
                hypotheses: [],
                acceptedOutputs: [],
                rejectedOutputs: [],
                queryHistory: [],
                trace: [],
                summary: null,
            },
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).not.toContain('## Harness Directives');
    });

    it('buildAiDebugBundle includes conflict warnings in Harness Directives when conflicts present', () => {
        const state = createState({
            latestAnalysisSession: {
                sessionId: 'session-test',
                runId: 'run-test',
                origin: 'auto_analysis',
                status: 'completed',
                maxSteps: 20,
                stepsUsed: 5,
                currentStepId: null,
                stopReason: null,
                analysisMode: 'business',
                analysisModeReason: null,
                harnessSummary: null,
                harnessCoverage: null,
                semanticUnderstanding: {
                    businessGrains: ['Project'],
                    candidateMetrics: ['Amount'],
                    timeGrains: [],
                    helperDimensions: [],
                    blockedDimensions: ['Description Code'],
                    detailRowPolicy: 'preserve_all_rows',
                    businessGlossary: [],
                    businessGrainConfidence: 'medium',
                    unsafeForBusinessNarrative: false,
                    conflicts: [
                        {
                            targetType: 'column',
                            targetKey: 'Description Code',
                            aiValue: 'dimension',
                            deterministicValue: 'label_code',
                            resolvedValue: 'label_code',
                            severity: 'warn',
                            reason: 'label counterpart exists: Description',
                        },
                    ],
                },
                hypotheses: [],
                acceptedOutputs: [],
                rejectedOutputs: [],
                queryHistory: [],
                trace: [],
                summary: null,
            },
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Harness Directives');
        expect(result).toContain('**conflicts** (hierarchy/label warnings): 1');
        expect(result).toContain('label counterpart exists');
    });

    it('buildAiDebugBundle renders Cleaning Run section with status and step count', () => {
        const state = createState({
            cleaningRun: {
                runId: 'cleaning-run-1',
                status: 'failed',
                currentStep: 3,
                steps: [
                    { stepId: 's1', kind: 'inspect', status: 'done', timestamp: new Date('2026-03-11T01:00:00Z') },
                    { stepId: 's2', kind: 'edit', status: 'error', timestamp: new Date('2026-03-11T01:01:00Z'), toolName: 'file_edit', diffSummary: 'Drop blank rows failed' },
                    { stepId: 's3', kind: 'verify', status: 'blocked', timestamp: new Date('2026-03-11T01:02:00Z') },
                ],
                lastModelResponse: null,
                startedAt: new Date('2026-03-11T01:00:00Z'),
                updatedAt: new Date('2026-03-11T01:02:00Z'),
                targetPath: '/cleaned.csv',
                lastError: 'Verification blocked: row count mismatch',
                shouldAutoResume: false,
                loopCount: 2,
                strategyKind: 'llm_guided',
                lastFailedStage: 'verify',
                inspectionStatus: 'completed',
                residualUnknownRowCount: 4,
                residualSummaryLikeRowCount: 1,
            },
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Cleaning Run');
        expect(result).toContain('**status**: failed');
        expect(result).toContain('**steps**: 3 total, 2 failed');
        expect(result).toContain('**loopCount**: 2');
        expect(result).toContain('**strategyKind**: llm_guided');
        expect(result).toContain('**lastFailedStage**: verify');
        expect(result).toContain('Verification blocked: row count mismatch');
        expect(result).toContain('**inspectionStatus**: completed');
        expect(result).toContain('residualUnknown=4');
        expect(result).toContain('**Failed steps (last 2):**');
        expect(result).toContain('Drop blank rows failed');
    });

    it('buildAiDebugBundle omits Cleaning Run section when cleaningRun is null', () => {
        const state = createState({ cleaningRun: null });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).not.toContain('## Cleaning Run');
    });

    it('buildAiDebugBundle includes runtimeRunHistory entries when provided', () => {
        const state = createState({
            runtimeRunHistory: [
                {
                    runId: 'run-999',
                    turnId: 'turn-2',
                    sessionId: 'session-test',
                    userMessage: 'Show top customers',
                    lifecycleState: 'completed',
                    outcomeKind: 'accepted',
                    retryCount: 1,
                    toolSequence: ['data.query', 'analysis.create_plan'],
                    finalObservationSummary: 'Generated analysis card',
                    createdAt: new Date('2026-03-11T02:00:00.000Z'),
                    failureClass: undefined,
                    reason: undefined,
                },
            ],
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Runtime Run History');
        expect(result).toContain('run-999');
        expect(result).toContain('data.query');
    });

    it('buildAiDebugBundle errors section appears when agentEvents contain status=error entries', () => {
        const state = createState({
            agentEvents: [
                {
                    id: 'err-2',
                    phase: 'execution',
                    step: 'execute_sql',
                    status: 'error',
                    message: 'SQL failed: column not found',
                    detail: { failureStage: 'duckdb_query_failed' },
                    timestamp: new Date('2026-03-11T01:30:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                },
            ],
        });
        const result = buildAiDebugBundle(state as AppStore);
        expect(result).toContain('## Errors & Failures');
        expect(result).toContain('SQL failed: column not found');
    });

    it('buildAiDebugBundle omits trailing sections when the export exceeds the bundle budget', () => {
        const oversizedRuntimeEvents = Array.from({ length: 30 }, (_, index) => ({
            id: `runtime-${index}`,
            type: 'decision_received' as const,
            stage: 'selecting' as const,
            message: `Observed event ${index} ${'x'.repeat(1800)}`,
            timestamp: new Date(`2026-03-11T01:${String(index).padStart(2, '0')}:00.000Z`),
            sessionId: 'session-test',
        }));

        const result = buildAiDebugBundle(createState({
            runtimeEvents: oversizedRuntimeEvents,
        }) as AppStore);

        expect(result).toContain('## Bundle Truncation');
        expect(result).toContain('~50KB debug bundle budget');
        expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(50 * 1024);
    });

    it('includes intake diagnostics in the cleaning failure handoff export', () => {
        const exportText = buildFailureHandoffExport(createState({
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 1200 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            rawCsvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: '1200' }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
                intakeDetection: {
                    strategy: 'papaparse_auto_fallback',
                    confidence: 'low',
                    delimiter: ';',
                    quoteChar: null,
                    warnings: [
                        {
                            code: 'parse_errors',
                            message: 'Fallback parser was used after parse errors were detected.',
                        },
                    ],
                    candidateCount: 5,
                    parserErrorCount: 2,
                    sampledNonEmptyLines: 1,
                    topScore: 0.62,
                    runnerUpScore: 0.58,
                },
            },
        }));

        expect(exportText).toContain('Cleaning Failure Bundle Export');
        expect(exportText).toContain('"intakeDiagnostics"');
        expect(exportText).toContain('"/cleaning/intake-diagnostics.json"');
        expect(exportText).toContain('"/cleaning/row-inspection.json"');
        expect(exportText).toContain('"/cleaning/row-classification.json"');
        expect(exportText).toContain('"/cleaning/cleaning-loop-history.json"');
        expect(exportText).toContain('"strategy": "papaparse_auto_fallback"');
        expect(exportText).toContain('"confidence": "low"');
        expect(exportText).toContain('"delimiter": ";"');
    });
});
