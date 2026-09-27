// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeManagedDataQueryMock } = vi.hoisted(() => ({
    executeManagedDataQueryMock: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

describe('executeStructuredDataQuery diagnostics', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('records worker diagnostics and store commit telemetry for committed query results', async () => {
        const { executeStructuredDataQuery } = await import('../services/agent/execution/dataQueryExecution');
        const telemetryEvents: Array<Record<string, unknown>> = [];

        let state = {
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            settings: { language: 'English' },
            activeTurn: {
                runId: 'run-1',
                turnId: 'turn-1',
                steps: [{ stepId: 'step-1', toolCallId: 'tool-call-1' }],
            },
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 1200 }],
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            activeDataQuery: null,
            activeSpreadsheetFilter: null,
            spreadsheetFilterFunction: null,
            aiFilterExplanation: null,
            isSpreadsheetVisible: false,
            duckDbSessionStatus: null,
            chatHistory: [],
            queryHistory: [],
            cleaningRun: null,
            addProgress: vi.fn(),
            logAgentToolUsage: vi.fn(),
            logTelemetryEvent: vi.fn((event: Record<string, unknown>) => {
                telemetryEvents.push(event);
            }),
        };
        const store = {
            getState: () => state,
            setState: (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
                const partial = typeof update === 'function' ? update(state) : update;
                state = { ...state, ...partial };
            },
        };

        executeManagedDataQueryMock.mockImplementation(async (_dataset, _plan, _allowedColumns, options?: { reportDiagnostics?: (entry: Record<string, unknown>) => void }) => {
            options?.reportDiagnostics?.({
                workerFamily: 'duckdb',
                task: 'executeCompiledQuery',
                phase: 'success',
                requestId: 3,
                payloadBytes: 2048,
                resultBytes: 8192,
                roundTripMs: 71,
                handlerMs: 8,
                rowCount: 1,
                columnCount: 1,
                returnedRows: 1,
                totalMatchedRows: 1,
                selectedColumnCount: 1,
                truncated: false,
            });
            return {
                engine: 'duckdb',
                sqlPreview: 'SELECT "Region" FROM "session_clean_dataset" LIMIT 5',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                result: {
                    rows: [{ Region: 'East' }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['Region'],
                    appliedOrderBy: [],
                    appliedLimit: 5,
                    durationMs: 18,
                },
            };
        });

        await executeStructuredDataQuery(store as never, {
            explanation: 'Preview the region column.',
            plan: {
                select: ['Region'],
                limit: 5,
            },
            phase: 'analysis',
            origin: 'chat',
            appendChatTrace: true,
            appendCleaningRunTrace: false,
            scrollToRawDataExplorer: false,
            allowNativeFallback: true,
        });

        expect(state.chatHistory.at(-1)?.text).not.toContain('SELECT "Region"');
        expect(state.chatHistory.at(-1)?.text).toContain('Rows: 1/1');
        expect(state.chatHistory.at(-1)?.queryTrace?.sqlPreview).toContain('SELECT "Region"');
        expect(telemetryEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                stage: 'worker_diagnostics',
                responseType: 'duckdb.executeCompiledQuery',
                sessionId: 'session-1',
                datasetId: 'dataset-1',
                runId: 'run-1',
                turnId: 'turn-1',
                stepId: 'step-1',
                toolCallId: 'tool-call-1',
                meta: expect.objectContaining({
                    workerRequestId: 3,
                    payloadBytes: 2048,
                    resultBytes: 8192,
                }),
            }),
            expect.objectContaining({
                stage: 'worker_diagnostics',
                responseType: 'query.store_commit',
                sessionId: 'session-1',
                datasetId: 'dataset-1',
                runId: 'run-1',
                turnId: 'turn-1',
                stepId: 'step-1',
                toolCallId: 'tool-call-1',
                meta: expect.objectContaining({
                    engine: 'duckdb',
                    returnedRows: 1,
                    totalMatchedRows: 1,
                    selectedColumnCount: 1,
                }),
            }),
        ]));
    });

    it('defaults to the preferred canonical dataset when no dataset override is supplied', async () => {
        const { executeStructuredDataQuery } = await import('../services/agent/execution/dataQueryExecution');

        const rawPrepared = {
            fileName: 'prepared.csv',
            data: [{ Project: 'stale-row', Amount: 999 }],
        };
        const canonical = {
            fileName: 'canonical.csv',
            data: [{ CUSTOMER: 'Algintons Print & Graphics Pte Ltd', TOTAL: 658381.38, RowRole: 'detail' }],
        };

        let state = {
            settings: { language: 'English' },
            activeTurn: null,
            csvData: rawPrepared,
            canonicalCsvData: canonical,
            columnProfiles: [
                { name: 'CUSTOMER', type: 'categorical' },
                { name: 'TOTAL', type: 'numerical' },
                { name: 'RowRole', type: 'categorical' },
            ],
            activeDataQuery: null,
            activeSpreadsheetFilter: null,
            spreadsheetFilterFunction: null,
            aiFilterExplanation: null,
            isSpreadsheetVisible: false,
            duckDbSessionStatus: null,
            chatHistory: [],
            queryHistory: [],
            cleaningRun: null,
            addProgress: vi.fn(),
            logAgentToolUsage: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
                const partial = typeof update === 'function' ? update(state) : update;
                state = { ...state, ...partial };
            },
        };

        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT "CUSTOMER" FROM "session_clean_dataset" LIMIT 5',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-canonical',
            fallbackReason: null,
            result: {
                rows: [{ CUSTOMER: 'Algintons Print & Graphics Pte Ltd' }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['CUSTOMER'],
                appliedOrderBy: [],
                appliedLimit: 5,
                durationMs: 12,
            },
        });

        await executeStructuredDataQuery(store as never, {
            explanation: 'Preview the canonical customer column.',
            plan: {
                select: ['CUSTOMER'],
                limit: 5,
            },
            phase: 'analysis',
            origin: 'chat',
            appendChatTrace: false,
            appendCleaningRunTrace: false,
            scrollToRawDataExplorer: false,
            allowNativeFallback: true,
        });

        expect(executeManagedDataQueryMock.mock.calls[0]?.[0]).toEqual(canonical);
    });

    it('preserves aggregate aliases in output clauses even when registry labels collide', async () => {
        const { executeStructuredDataQuery } = await import('../services/agent/execution/dataQueryExecution');

        let state = {
            settings: { language: 'English' },
            activeTurn: null,
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 1200 }],
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            columnRegistry: {
                datasetVersion: 'dataset-1',
                generatedAt: '2026-03-25T00:00:00.000Z',
                columns: [
                    {
                        columnId: 'col_region',
                        physicalName: 'Region',
                        displayLabel: 'Sales Region',
                        aliases: ['Region', 'Sales Region'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_dimension' as const,
                        allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true, aggregationHint: 'dimension_only' as const },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                    {
                        columnId: 'col_revenue',
                        physicalName: 'Revenue',
                        displayLabel: 'Sales',
                        aliases: ['Revenue', 'Sales'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_metric' as const,
                        allowedUsages: { groupBy: false, filter: true, select: true, orderBy: true, aggregationHint: 'additive' as const },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                ],
            },
            userColumnAnnotations: {},
            latestAnalysisSession: null,
            datasetSemanticSnapshot: null,
            activeDataQuery: null,
            activeSpreadsheetFilter: null,
            spreadsheetFilterFunction: null,
            aiFilterExplanation: null,
            isSpreadsheetVisible: false,
            duckDbSessionStatus: null,
            chatHistory: [],
            queryHistory: [],
            cleaningRun: null,
            addProgress: vi.fn(),
            logAgentToolUsage: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
                const partial = typeof update === 'function' ? update(state) : update;
                state = { ...state, ...partial };
            },
        };

        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT "Region", "Sales" FROM "session_clean_dataset" LIMIT 10',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
            fallbackReason: null,
            result: {
                rows: [{ Region: 'East', Sales: 1200 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region', 'Sales'],
                appliedOrderBy: [{ column: 'Sales', direction: 'desc' as const }],
                appliedLimit: 10,
                durationMs: 22,
            },
        });

        await executeStructuredDataQuery(store as never, {
            explanation: 'Aggregate revenue by region.',
            plan: {
                select: ['Sales Region', 'Sales'],
                where: {
                    predicates: [{ column: 'Sales Region', operator: 'eq', value: 'East' }],
                },
                groupBy: ['Sales Region'],
                aggregates: [{ function: 'sum', column: 'Sales', as: 'Sales' }],
                postAggregateFilter: {
                    predicates: [{ column: 'Sales', operator: 'gt', value: 100 }],
                },
                orderBy: [{ column: 'Sales', direction: 'desc' }],
                limit: 10,
            },
            phase: 'analysis',
            origin: 'chat',
            appendChatTrace: false,
            appendCleaningRunTrace: false,
            scrollToRawDataExplorer: false,
            allowNativeFallback: true,
        });

        expect(executeManagedDataQueryMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                select: ['Region', 'Sales'],
                where: {
                    predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
                },
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Sales' }],
                postAggregateFilter: {
                    predicates: [{ column: 'Sales', operator: 'gt', value: 100 }],
                },
                orderBy: [{ column: 'Sales', direction: 'desc' }],
                limit: 10,
            }),
            ['Region', 'Revenue'],
            expect.anything(),
        );
    });
});
