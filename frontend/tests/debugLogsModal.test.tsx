import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebugLogsModal } from '../components/modals/DebugLogsModal';

const { copyTextMock, loadRecentLocalDiagnosticsMock, useAppStoreMock } = vi.hoisted(() => ({
    copyTextMock: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()),
    loadRecentLocalDiagnosticsMock: vi.fn(async () => []),
    useAppStoreMock: vi.fn(),
}));

vi.mock('../services/utils/copyText', () => ({
    copyText: copyTextMock,
}));

vi.mock('../services/observability/localDiagnostics', () => ({
    loadRecentLocalDiagnostics: loadRecentLocalDiagnosticsMock,
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

const createStoreState = (overrides: Record<string, unknown> = {}) => ({
    isDebugLogsModalOpen: true,
    setIsDebugLogsModalOpen: vi.fn(),
    setIsDataPreparationModalOpen: vi.fn(),
    setIsWorkspaceModalOpen: vi.fn(),
    sessionId: 'session-1',
    activeTurn: null,
    cleaningRun: null,
    activeSpreadsheetFilter: null,
    confirmedAnalysisGoal: 'Inspect rows',
    settings: {
        provider: 'google',
        complexModel: 'gemini-3-flash-preview',
    },
    csvData: null,
    columnProfiles: [],
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
            summary: { language: 'English', text: 'Summary' },
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
            hiddenLabels: [],
        },
    ],
    queryHistory: [],
    duckDbSessionStatus: { status: 'ready', engine: 'duckdb', tableName: 'session_clean_dataset', loadVersion: 'dataset-1', fallbackReason: null, lastSyncedAt: null },
    chatHistory: [],
    dataPreparationPlan: null,
    agentToolLogs: [
        {
            id: 'tool-1',
            timestamp: new Date('2026-03-11T02:00:00.000Z'),
            tool: 'spreadsheet.filter',
            requestId: 'spreadsheet-filter-1',
            description: 'Built spreadsheet filter final reply.',
            detail: {
                requestId: 'spreadsheet-filter-1',
                flowStage: 'final_reply',
                finalReply: 'I applied a temporary data filter in the raw data explorer for rows where Address contains "36 TUAS ROAD". It matched 1 row.',
            },
            stage: 'analysis' as const,
            category: 'spreadsheet' as const,
            risk: 'low' as const,
            policyDecision: 'allowed' as const,
            policyReason: null,
        },
    ],
    telemetryEvents: [
        {
            id: 'telemetry-1',
            provider: 'google' as const,
            stage: 'context_prepared',
            responseType: 'summary',
            detail: 'Prepared context window',
            chunkSize: 2,
            meta: { estimatedPromptTokens: 420 },
            timestamp: new Date('2026-03-11T01:59:00.000Z'),
        },
    ],
    agentEvents: [
        {
            id: 'event-1',
            timestamp: new Date('2026-03-11T01:58:00.000Z'),
            phase: 'execution' as const,
            step: 'spreadsheet_filter_observation',
            status: 'done' as const,
            message: 'Observed spreadsheet filter result',
            detail: {
                requestId: 'spreadsheet-filter-1',
                flowStage: 'observation',
                origin: 'chat',
                query: '36 TUAS ROAD',
                toolName: 'spreadsheet.filter',
                observation: {
                    matchedRowCount: 1,
                    selectedColumn: 'Address',
                    operator: 'contains',
                    value: '36 TUAS ROAD',
                },
            },
        },
    ],
    currentDatasetId: 'dataset-1',
    runtimeEvents: [
        {
            id: 'runtime-1',
            type: 'retry_scheduled' as const,
            message: 'Retrying after provider timeout',
            reason: 'timeout_model_call',
            retryable: true,
            failureClass: 'provider' as const,
            detail: {
                contractVersion: 'runtime_v1',
                reasonCode: 'timeout_model_call',
                retryClass: 'provider_timeout_recovery',
                retryAttempt: 1,
                retryCeiling: 2,
                abortMode: 'transport_abort',
                abortSource: 'provider_chat_completion',
                abortPropagationStatus: 'propagated',
            },
            timestamp: new Date('2026-03-11T02:01:30.000Z'),
        },
    ],
    runtimeRunHistory: [
        {
            runId: 'run-1',
            turnId: 'turn-1',
            sessionId: 'session-1',
            userMessage: 'Why did the report slow down?',
            lifecycleState: 'completed' as const,
            outcomeKind: 'accepted' as const,
            reason: 'Recovered after provider timeout',
            retryCount: 1,
            toolSequence: ['analysis.query'],
            finalObservationSummary: 'Recovered',
            createdAt: new Date('2026-03-11T02:02:00.000Z'),
            recoveryTrace: {
                recoveryStatus: 'degraded' as const,
                originalExpectedOutcome: 'table' as const,
                actualOutcomeShape: 'prose' as const,
                degradationReason: 'timeout fallback',
                recoveryChain: ['provider_timeout', 'fallback:assistant_message'],
                contractChanges: 1,
            },
        },
    ],
    logAgentToolUsage: vi.fn(),
    latestAnalysisSession: null,
    visibleAnalysisTrace: [],
    syncTelemetryToStore: vi.fn(),
    syncTelemetryEventsToStore: vi.fn(),
    ...overrides,
});

describe('DebugLogsModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        loadRecentLocalDiagnosticsMock.mockResolvedValue([]);
        const state = createStoreState();
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
        (useAppStoreMock as unknown as { getState: () => typeof state }).getState = () => state;
    });

    it('shows persisted seven-day local diagnostics separately from the public support path', async () => {
        loadRecentLocalDiagnosticsMock.mockResolvedValueOnce([{
            id: 'diagnostic-1',
            recordedAt: '2026-07-27T00:00:00.000Z',
            expiresAt: '2026-08-03T00:00:00.000Z',
            runId: 'run-1',
            phase: 'planning',
            attempt: 1,
            tool: 'ai_model',
            provider: 'google',
            model: 'gemini-test',
            durationMs: 120,
            outcome: 'succeeded',
            reasonCode: 'stop',
            payload: { prompt: 'Analyze selected rows', response: 'Useful result' },
            estimatedBytes: 100,
        }]);

        render(<DebugLogsModal />);
        fireEvent.click(screen.getByRole('button', { name: /^local$/i }));

        expect(await screen.findByText(/local-only diagnostics may contain prompts/i)).toBeInTheDocument();
        expect(screen.getByText(/planning · ai_model · succeeded/i)).toBeInTheDocument();
        fireEvent.click(screen.getByText(/planning · ai_model · succeeded/i));
        expect(screen.getByText(/Analyze selected rows/i)).toBeInTheDocument();
        expect(screen.getByText(/use the sanitized support bundle instead/i)).toBeInTheDocument();
    });

    afterEach(() => {
        cleanup();
    });

    it('shows full payload snapshots and copies recent payload exports', async () => {
        const state = createStoreState();
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
        (useAppStoreMock as unknown as { getState: () => typeof state }).getState = () => state;
        render(<DebugLogsModal />);

        expect(state.logAgentToolUsage).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /copy recent payloads/i })).toBeInTheDocument();
        expect(screen.getAllByText(/grouped flows/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/operator summary/i)).toBeInTheDocument();
        expect(screen.getAllByText(/timeout_model_call/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/ir diagnostics/i)).toBeInTheDocument();
        expect(screen.getByText(/revenue by project/i)).toBeInTheDocument();
        expect(screen.getAllByText(/business_dimension/i).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: /timeline/i }));
        fireEvent.click(screen.getAllByRole('button', { name: /show payload snapshot/i })[0]);

        expect(screen.getByText(/"source": "agentToolLogs"/)).toBeInTheDocument();
        expect(screen.getByText(/"correlation"/)).toBeInTheDocument();
        expect(screen.getByText(/reasonCode: spreadsheet\.filter/i)).toBeInTheDocument();
        expect(screen.getAllByText(/"finalReply": "I applied a temporary data filter/i).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: /flows/i }));
        expect(screen.getAllByText(/spreadsheet-filter-1/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Final reply:/i)).toBeInTheDocument();
        expect(screen.getByText(/provider_timeout -> fallback:assistant_message/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copy flow payload/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copy planner failure bundle/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /copy sql failure bundle/i })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /copy recent payloads/i }));

        await waitFor(() => expect(copyTextMock).toHaveBeenCalled());
        expect(copyTextMock.mock.calls[0][0]).toContain('"recentPayloads"');
        expect(copyTextMock.mock.calls[0][0]).toContain('"source": "agentToolLogs"');
        expect(copyTextMock.mock.calls[0][0]).toContain('"source": "telemetryEvents"');
        expect(copyTextMock.mock.calls[0][0]).toContain('"source": "agentEvents"');
        expect(copyTextMock.mock.calls[0][0]).toContain('"correlation"');
        expect(copyTextMock.mock.calls[0][0]).toContain('"irDiagnostics"');
        expect(copyTextMock.mock.calls[0][0]).toContain('"semanticRole": "business_dimension"');
        expect(state.logAgentToolUsage).not.toHaveBeenCalled();
    });

    it('enables SQL failure bundle export for SQL precheck blockers and includes findings', async () => {
        const state = createStoreState({
            dataPreparationPlan: {
                explanation: 'Prepared rows remain stable.',
                operations: [],
                outputColumns: [
                    { name: 'Region', type: 'categorical' },
                    { name: 'Revenue', type: 'numerical' },
                ],
                planStatus: 'schema_only',
                consistencyIssues: [],
                sqlPrecheck: {
                    status: 'blocked',
                    summary: '2 blocking SQL precheck issues detected after AI cleaning.',
                    findings: [
                        {
                            kind: 'constant_metric',
                            severity: 'block',
                            metric: 'Revenue',
                            column: 'Revenue',
                            message: 'Metric "Revenue" has only one distinct numeric value, so it does not support comparative analysis.',
                        },
                    ],
                },
            },
        });
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
        (useAppStoreMock as unknown as { getState: () => typeof state }).getState = () => state;

        render(<DebugLogsModal />);

        const button = screen.getByRole('button', { name: /copy sql failure bundle/i });
        expect(button).not.toBeDisabled();

        fireEvent.click(button);

        await waitFor(() => expect(copyTextMock).toHaveBeenCalled());
        expect(copyTextMock.mock.calls[0][0]).toContain('sql_precheck_blocked');
        expect(copyTextMock.mock.calls[0][0]).toContain('2 blocking SQL precheck issues detected after AI cleaning.');
        expect(copyTextMock.mock.calls[0][0]).toContain('Metric \\"Revenue\\" has only one distinct numeric value');
    });

    it('scopes timeline and flow views to the current cleaning run when one is active', async () => {
        const state = createStoreState({
            cleaningRun: {
                runId: 'cleaning-run-current',
                status: 'running',
                currentStep: 1,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-11T02:01:00.000Z'),
                updatedAt: new Date('2026-03-11T02:01:00.000Z'),
                targetPath: '/cleaned.csv',
                lastError: null,
                shouldAutoResume: false,
            },
            agentToolLogs: [
                {
                    id: 'tool-old',
                    timestamp: new Date('2026-03-11T02:00:00.000Z'),
                    datasetId: 'dataset-1',
                    cleaningRunId: 'cleaning-run-old',
                    tool: 'workspace_builder',
                    description: 'Old run tool log',
                    detail: { flowStage: 'final_reply', finalReply: 'Old run output.' },
                    stage: 'analysis' as const,
                    category: 'spreadsheet' as const,
                    risk: 'low' as const,
                    policyDecision: 'allowed' as const,
                    policyReason: null,
                },
                {
                    id: 'tool-current',
                    timestamp: new Date('2026-03-11T02:02:00.000Z'),
                    datasetId: 'dataset-1',
                    cleaningRunId: 'cleaning-run-current',
                    tool: 'workspace_builder',
                    description: 'Current run tool log',
                    detail: { flowStage: 'final_reply', finalReply: 'Current run output.' },
                    stage: 'analysis' as const,
                    category: 'spreadsheet' as const,
                    risk: 'low' as const,
                    policyDecision: 'allowed' as const,
                    policyReason: null,
                },
            ],
            telemetryEvents: [
                {
                    id: 'telemetry-old',
                    provider: 'google' as const,
                    stage: 'worker_diagnostics',
                    responseType: 'duckdb.initDuckDb',
                    detail: 'Old run telemetry',
                    timestamp: new Date('2026-03-11T02:00:30.000Z'),
                    cleaningRunId: 'cleaning-run-old',
                },
                {
                    id: 'telemetry-current',
                    provider: 'google' as const,
                    stage: 'worker_diagnostics',
                    responseType: 'duckdb.loadCleanDataset',
                    detail: 'Current run telemetry',
                    timestamp: new Date('2026-03-11T02:02:30.000Z'),
                    cleaningRunId: 'cleaning-run-current',
                },
            ],
            agentEvents: [
                {
                    id: 'event-old',
                    timestamp: new Date('2026-03-11T02:00:45.000Z'),
                    phase: 'execution' as const,
                    step: 'pipeline_cleaning',
                    status: 'error' as const,
                    message: 'Old run failed',
                    cleaningRunId: 'cleaning-run-old',
                },
                {
                    id: 'event-current',
                    timestamp: new Date('2026-03-11T02:02:45.000Z'),
                    phase: 'execution' as const,
                    step: 'pipeline_cleaning',
                    status: 'done' as const,
                    message: 'Current run succeeded',
                    cleaningRunId: 'cleaning-run-current',
                },
            ],
        });
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
        (useAppStoreMock as unknown as { getState: () => typeof state }).getState = () => state;

        render(<DebugLogsModal />);

        fireEvent.click(screen.getByRole('button', { name: /timeline/i }));
        expect(screen.getByText(/Current run tool log/i)).toBeInTheDocument();
        expect(screen.queryByText(/Old run tool log/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Current run telemetry/i)).toBeInTheDocument();
        expect(screen.queryByText(/Old run telemetry/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Current run succeeded/i)).toBeInTheDocument();
        expect(screen.queryByText(/Old run failed/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /flows/i }));
        expect(screen.getAllByText(/Current run output\./i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Old run output\./i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /copy recent payloads/i }));
        await waitFor(() => expect(copyTextMock).toHaveBeenCalled());
        expect(copyTextMock.mock.calls.at(-1)?.[0]).toContain('"cleaning-run-current"');
        expect(copyTextMock.mock.calls.at(-1)?.[0]).not.toContain('"cleaning-run-old"');
    });

    it('does not fall back to dataset logs when an active cleaning run has no matching entries', async () => {
        const state = createStoreState({
            cleaningRun: {
                runId: 'cleaning-run-current',
                status: 'running',
                currentStep: 1,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-11T02:01:00.000Z'),
                updatedAt: new Date('2026-03-11T02:01:00.000Z'),
                targetPath: '/cleaned.csv',
                lastError: null,
                shouldAutoResume: false,
            },
            agentToolLogs: [
                {
                    id: 'tool-old',
                    timestamp: new Date('2026-03-11T02:00:00.000Z'),
                    datasetId: 'dataset-1',
                    cleaningRunId: 'cleaning-run-old',
                    tool: 'workspace_builder',
                    description: 'Old run tool log',
                    detail: { flowStage: 'final_reply', finalReply: 'Old run output.' },
                    stage: 'analysis' as const,
                    category: 'spreadsheet' as const,
                    risk: 'low' as const,
                    policyDecision: 'allowed' as const,
                    policyReason: null,
                },
            ],
            telemetryEvents: [
                {
                    id: 'telemetry-old',
                    provider: 'google' as const,
                    stage: 'worker_diagnostics',
                    responseType: 'duckdb.initDuckDb',
                    detail: 'Old run telemetry',
                    timestamp: new Date('2026-03-11T02:00:30.000Z'),
                    cleaningRunId: 'cleaning-run-old',
                },
            ],
            agentEvents: [
                {
                    id: 'event-old',
                    timestamp: new Date('2026-03-11T02:00:45.000Z'),
                    phase: 'execution' as const,
                    step: 'pipeline_cleaning',
                    status: 'error' as const,
                    message: 'Old run failed',
                    cleaningRunId: 'cleaning-run-old',
                },
            ],
        });
        useAppStoreMock.mockImplementation((selector: (value: typeof state) => unknown) => selector(state));
        (useAppStoreMock as unknown as { getState: () => typeof state }).getState = () => state;

        render(<DebugLogsModal />);

        expect(screen.queryByText(/Old run tool log/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Old run telemetry/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Old run failed/i)).not.toBeInTheDocument();
        expect(screen.getByText(/No logs available for this filter yet\./i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /flows/i }));
        expect(screen.getByText(/No logs available for this filter yet\./i)).toBeInTheDocument();
    });
});
