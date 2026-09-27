import { describe, expect, it } from 'vitest';
import { buildDebugLogEntries, selectScopedDebugLogEntries } from '../services/agent/debugLogEntries';

const createScopeState = (overrides: Record<string, unknown> = {}) => ({
    sessionId: 'session-test',
    currentDatasetId: 'dataset-test',
    activeTurn: null,
    cleaningRun: null,
    activeSpreadsheetFilter: null,
    agentToolLogs: [],
    telemetryEvents: [],
    agentEvents: [],
    ...overrides,
});

describe('debugLogEntries', () => {
    it('preserves agent event reason codes from detail payloads', () => {
        const entries = buildDebugLogEntries({
            agentToolLogs: [],
            telemetryEvents: [],
            agentEvents: [
                {
                    id: 'event-1',
                    timestamp: new Date('2026-03-19T13:42:47.715Z'),
                    phase: 'execution',
                    step: 'auto_analysis_paused',
                    status: 'done',
                    message: 'Header/body structure drift was detected.',
                    detail: {
                        reasonCode: 'header_shape_drift',
                        intakeGateSeverity: 'blocked',
                    },
                },
            ],
        });

        expect(entries).toHaveLength(1);
        expect(entries[0].traceContract?.reasonCode).toBe('header_shape_drift');
        expect(entries[0].payloadSnapshot.traceContract?.reasonCode).toBe('header_shape_drift');
    });

    it('filters modal-open workspace logs from scoped debug entries', () => {
        const scoped = selectScopedDebugLogEntries(createScopeState({
            agentToolLogs: [
                {
                    id: 'tool-open',
                    timestamp: new Date('2026-03-19T14:04:27.902Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    tool: 'workspace_builder',
                    description: 'Opened debug logs modal.',
                    detail: {
                        datasetId: 'dataset-test',
                    },
                },
                {
                    id: 'tool-real',
                    timestamp: new Date('2026-03-19T14:04:28.902Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    tool: 'duckdb_query_engine',
                    description: 'DuckDB analyst workspace session is ready.',
                    detail: {
                        tableName: 'session_clean_dataset',
                    },
                },
            ],
        }));

        expect(scoped.scopeType).toBe('dataset');
        expect(scoped.entries).toHaveLength(1);
        expect(scoped.entries[0].title).toBe('DuckDB analyst workspace session is ready.');
    });

    it('prefers the active request scope over a stale cleaning run scope', () => {
        const scoped = selectScopedDebugLogEntries(createScopeState({
            activeSpreadsheetFilter: { requestId: 'request-current' },
            cleaningRun: { runId: 'cleaning-run-current' },
            agentToolLogs: [
                {
                    id: 'tool-request',
                    timestamp: new Date('2026-03-19T14:05:00.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    requestId: 'request-current',
                    cleaningRunId: 'cleaning-run-old',
                    tool: 'spreadsheet.filter',
                    description: 'Applied request-scoped filter.',
                    detail: { flowStage: 'final_reply' },
                },
                {
                    id: 'tool-cleaning',
                    timestamp: new Date('2026-03-19T14:05:10.000Z'),
                    sessionId: 'session-test',
                    datasetId: 'dataset-test',
                    cleaningRunId: 'cleaning-run-current',
                    tool: 'data.mutate',
                    description: 'Applied cleaning run edit.',
                    detail: { operation: 'drop_blank_rows' },
                },
            ],
        }));

        expect(scoped.scopeType).toBe('request');
        expect(scoped.scopeId).toBe('request-current');
        expect(scoped.entries).toHaveLength(1);
        expect(scoped.entries[0].label).toBe('spreadsheet.filter');
    });
});
