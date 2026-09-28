// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSemanticDatasetVersion } from '../services/agent/datasetSemantics';

const {
    executeCompiledQueryMock,
    executeManagedDataQueryMock,
    createNewCardMock,
    beginExplorationMock,
    completeExplorationMock,
    markExplorationAsCardMock,
    failExplorationMock,
} = vi.hoisted(() => ({
    executeCompiledQueryMock: vi.fn(),
    executeManagedDataQueryMock: vi.fn(),
    createNewCardMock: vi.fn(),
    beginExplorationMock: vi.fn(() => 'exploration-1'),
    completeExplorationMock: vi.fn(),
    markExplorationAsCardMock: vi.fn(),
    failExplorationMock: vi.fn(),
}));

vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: {
        executeCompiledQuery: executeCompiledQueryMock,
    },
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

vi.mock('../services/agent/execution/cardCreator', () => ({
    createNewCard: createNewCardMock,
}));

vi.mock('../services/agent/memory/agentMemoryCollector', () => ({
    agentMemoryCollector: {
        beginExploration: beginExplorationMock,
        completeExploration: completeExplorationMock,
        markExplorationAsCard: markExplorationAsCardMock,
        failExploration: failExplorationMock,
    },
}));

describe('sqlCardExecutor', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        executeManagedDataQueryMock.mockReset();
        createNewCardMock.mockResolvedValue({
            id: 'card-1',
            plan: { title: 'Revenue by Region', chartType: 'bar' },
            aggregatedData: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }],
            summary: 'ok',
            displayChartType: 'bar',
            isDataVisible: false,
            topN: null,
            hideOthers: false,
        });
    });

    it('executes a DuckDB-backed SQL plan and appends query history', async () => {
        const csvData = { fileName: 'sales.csv', data: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }] };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        executeCompiledQueryMock.mockResolvedValue({
            rows: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }],
            totalMatchedRows: 2,
            returnedRows: 2,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
            appliedLimit: 10,
            durationMs: 12,
        });

        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 3 },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        });

        expect(card.id).toBe('card-1');
        expect(state.queryHistory).toHaveLength(1);
        expect(state.queryHistory[0].engine).toBe('duckdb');
        expect(state.queryHistory[0].sqlPreview).toContain('SELECT');
        expect(createNewCardMock).toHaveBeenCalled();
    });

    it('uses the large-dataset timeout and forwards cancellation to DuckDB evidence queries', async () => {
        const abortController = new AbortController();
        const csvData = {
            fileName: 'million.csv',
            data: [{ Region: 'East', Revenue: 100 }],
            backing: {
                mode: 'duckdb_file' as const,
                loadVersion: 'large-version',
                datasetVersion: 'large-version',
                rowCount: 1_000_000,
                sampleRowCount: 1,
                byteSize: 100 * 1024 * 1024,
                readOnly: true as const,
                ephemeral: true as const,
            },
        };
        executeCompiledQueryMock.mockResolvedValue({
            rows: [{ Region: 'East', Revenue: 100 }],
            totalMatchedRows: 1,
            returnedRows: 1,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [],
            appliedLimit: 100,
            durationMs: 12_000,
        });
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 1 },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            activeDataQuery: null,
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };
        const { executeEvidenceQuery } = await import('../services/agent/execution/sqlCardExecutor');

        await executeEvidenceQuery({
            title: 'Revenue by Region',
            intentSummary: 'Compare revenue.',
            queryMode: 'aggregate',
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'large-version',
        }, {
            dataset: csvData,
            abortSignal: abortController.signal,
            suppressQueryStateUpdates: true,
        });

        expect(executeCompiledQueryMock).toHaveBeenCalledWith(
            expect.anything(),
            60_000,
            abortController.signal,
            expect.any(Function),
        );
    });

    it('enforces plan preFilter contracts in compiled SQL and created cards', async () => {
        const csvData = {
            fileName: 'sales.csv',
            data: [
                { Region: 'East', Revenue: 100, RowClass: 'fact' },
                { Region: 'West', Revenue: 80, RowClass: 'fact' },
            ],
        };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        executeCompiledQueryMock.mockResolvedValue({
            rows: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }],
            totalMatchedRows: 2,
            returnedRows: 2,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
            appliedLimit: 10,
            durationMs: 12,
        });

        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 3 },
                { name: 'Revenue', type: 'numerical' },
                { name: 'RowClass', type: 'categorical', uniqueValues: 3 },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            preFilter: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        });

        expect(executeCompiledQueryMock).toHaveBeenCalledTimes(1);
        expect(executeCompiledQueryMock.mock.calls[0]?.[0]?.sql).toContain('CAST("RowClass" AS VARCHAR)');
        expect(executeCompiledQueryMock.mock.calls[0]?.[0]?.sql).toContain("= 'fact'");
        expect(createNewCardMock).toHaveBeenCalledWith(
            expect.objectContaining({
                preFilter: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
            }),
            expect.any(Array),
            store,
            expect.any(Object),
        );
    });

    it('creates a card with quality warning for flat-metric aggregate results', async () => {
        const csvData = { fileName: 'sales.csv', data: [{ Region: 'East', Revenue: 100 }] };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        executeCompiledQueryMock.mockResolvedValue({
            rows: [{ Region: 'East', Revenue: 100 }],
            totalMatchedRows: 1,
            returnedRows: 1,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
            appliedLimit: 10,
            durationMs: 9,
        });

        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 1 },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        });
        expect(createNewCardMock).toHaveBeenCalledTimes(1);
        expect(createNewCardMock.mock.calls[0][3]).toMatchObject({ qualityWarnings: ['flat_metric'] });
        expect(card).toBeDefined();
    });

    it('creates a card with quality warning for zero-total aggregate results', async () => {
        const csvData = { fileName: 'sales.csv', data: [{ Region: 'East', Revenue: 0 }, { Region: 'West', Revenue: 0 }] };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        executeCompiledQueryMock.mockResolvedValue({
            rows: [{ Region: 'East', Revenue: 0 }, { Region: 'West', Revenue: 0 }],
            totalMatchedRows: 2,
            returnedRows: 2,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
            appliedLimit: 10,
            durationMs: 7,
        });

        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 2 },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        });
        expect(createNewCardMock).toHaveBeenCalledTimes(1);
        expect(createNewCardMock.mock.calls[0][3]).toMatchObject({ qualityWarnings: ['no_total'] });
        expect(card).toBeDefined();
    });

    it('allows fragmented low-signal aggregate results to continue to card creation', async () => {
        const rows = Array.from({ length: 101 }, (_, index) => ({
            Region: `Region ${index + 1}`,
            Revenue: 1,
        }));
        rows[0].Revenue = 2;
        rows[1].Revenue = 2;
        rows[2].Revenue = 2;
        rows[3].Revenue = 2;
        rows[4].Revenue = 2;
        const csvData = { fileName: 'sales.csv', data: rows };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);

        executeCompiledQueryMock.mockResolvedValue({
            rows,
            totalMatchedRows: rows.length,
            returnedRows: rows.length,
            truncated: false,
            selectedColumns: ['Region', 'Revenue'],
            appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
            appliedLimit: 101,
            durationMs: 15,
        });

        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: rows.length },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 101,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        });

        expect(card.id).toBe('card-1');
        expect(createNewCardMock).toHaveBeenCalledTimes(1);
        expect(failExplorationMock).not.toHaveBeenCalled();
    });

    it('throws a classified error when DuckDB query execution fails', async () => {
        const csvData = { fileName: 'sales.csv', data: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }] };
        const datasetVersion = buildSemanticDatasetVersion(csvData as never);
        executeCompiledQueryMock.mockRejectedValue(new Error('worker offline'));
        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');

        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 3 },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        await expect(executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        })).rejects.toMatchObject({
            code: 'duckdb_query_failed',
        });
    });

    it('rejects stale DuckDB bindings before executing SQL', async () => {
        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const csvData = { fileName: 'sales.csv', data: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }] };
        executeManagedDataQueryMock.mockResolvedValue({
            result: {
                rows: [{ Region: 'East', Revenue: 100 }, { Region: 'West', Revenue: 80 }],
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [{ column: 'Revenue', direction: 'desc' }],
                appliedLimit: 10,
                durationMs: 6,
            },
            engine: 'duckdb',
            sqlPreview: 'SELECT "Region", SUM("Revenue") AS "Revenue" FROM "session_clean_dataset"',
            tableName: 'session_clean_dataset',
            loadVersion: buildSemanticDatasetVersion(csvData as never),
            fallbackReason: null,
            fallbackStage: null,
        });
        const state = {
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 2 },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Region', valueColumn: 'Revenue' },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: 'stale-version',
        });

        expect(executeCompiledQueryMock).not.toHaveBeenCalled();
        expect(executeManagedDataQueryMock).toHaveBeenCalledTimes(1);
        expect(card.id).toBe('card-1');
    });

    it('returns a stable query trace for card provenance when query-history updates are suppressed', async () => {
        const { executeEvidenceQuery } = await import('../services/agent/execution/sqlCardExecutor');
        const csvData = {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 100 }],
        };
        executeManagedDataQueryMock.mockResolvedValue({
            result: {
                rows: csvData.data,
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 100,
                durationMs: 2,
            },
            engine: 'native',
            sqlPreview: null,
            tableName: null,
            loadVersion: buildSemanticDatasetVersion(csvData as never),
            fallbackReason: null,
            fallbackStage: null,
        });
        const state = {
            sessionId: 'session-1',
            csvData,
            columnProfiles: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            queryHistory: [],
            activeDataQuery: null,
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const result = await executeEvidenceQuery({
            title: 'Revenue by Region',
            intentSummary: 'Compare revenue.',
            queryMode: 'aggregate',
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
            },
        }, store, null, { suppressQueryStateUpdates: true });

        expect(state.queryHistory).toEqual([]);
        expect(state.activeDataQuery).toBeNull();
        expect(result.queryTrace.id).toMatch(/^query-trace-/);
        expect(result.queryTrace.plan.groupBy).toEqual(['Region']);
        expect(result.queryTrace.result.returnedRows).toBe(1);
    });

    it('preserves canonical DuckDB bindings when canonical data is the preferred analysis dataset', async () => {
        const { executeSqlPlanAndCreateCard } = await import('../services/agent/execution/sqlCardExecutor');
        const csvData = {
            fileName: 'sales.csv',
            data: [{ _unnamed_column_1: '', _unnamed_column_2: '' }],
        };
        const canonicalCsvData = {
            fileName: 'sales.canonical.csv',
            data: [
                { Buyer: 'YKK AP SINGAPORE PTE LTD', TotalSales: 6900 },
                { Buyer: 'YKK AP SINGAPORE PTE LTD', TotalSales: 13500 },
                { Buyer: 'ACME PROJECTS SDN BHD', TotalSales: 52046.88 },
            ],
        };
        const canonicalDatasetVersion = buildSemanticDatasetVersion(canonicalCsvData as never);
        executeCompiledQueryMock.mockResolvedValue({
            rows: [
                { Buyer: 'YKK AP SINGAPORE PTE LTD', TotalSales: 20400 },
                { Buyer: 'ACME PROJECTS SDN BHD', TotalSales: 52046.88 },
            ],
            totalMatchedRows: 2,
            returnedRows: 2,
            truncated: false,
            selectedColumns: ['Buyer', 'TotalSales'],
            appliedOrderBy: [{ column: 'TotalSales', direction: 'desc' }],
            appliedLimit: 10,
            durationMs: 8,
        });

        const state = {
            csvData,
            canonicalCsvData,
            columnProfiles: [
                { name: 'Buyer', type: 'categorical', uniqueValues: 1 },
                { name: 'TotalSales', type: 'numerical' },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        const card = await executeSqlPlanAndCreateCard({
            chartType: 'bar',
            title: 'Revenue by Buyer',
            description: 'Compare revenue by buyer.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: { groupByColumn: 'Buyer', valueColumn: 'TotalSales' },
            query: {
                groupBy: ['Buyer'],
                aggregates: [{ function: 'sum', column: 'TotalSales', as: 'TotalSales' }],
                orderBy: [{ column: 'TotalSales', direction: 'desc' }],
                limit: 10,
            },
        }, store, {
            tableName: 'session_clean_dataset',
            loadVersion: canonicalDatasetVersion,
        });

        expect(executeCompiledQueryMock).toHaveBeenCalledTimes(1);
        expect(executeManagedDataQueryMock).not.toHaveBeenCalled();
        expect(card.id).toBe('card-1');
    });

    it('executes evidence queries against the topic dataset override instead of the preferred dataset', async () => {
        const { executeEvidenceQuery } = await import('../services/agent/execution/sqlCardExecutor');
        const topicDataset = {
            fileName: 'raw-follow-up.csv',
            data: [{ Code: 'A', Value: 10, RowClass: 'fact' }],
        };
        const canonicalCsvData = {
            fileName: 'canonical.csv',
            data: [{ Code: 'A', Value: 10, RowRole: 'fact', ResolvedRowRole: 'detail' }],
        };
        executeManagedDataQueryMock.mockResolvedValue({
            result: {
                rows: [{ Code: 'A', Value: 10 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Code', 'Value'],
                appliedOrderBy: [],
                appliedLimit: 50,
                durationMs: 5,
            },
            engine: 'native',
            sqlPreview: null,
            tableName: null,
            loadVersion: null,
            fallbackReason: null,
            fallbackStage: null,
        });

        const state = {
            csvData: topicDataset,
            canonicalCsvData,
            columnProfiles: [
                { name: 'Code', type: 'categorical', uniqueValues: 1 },
                { name: 'Value', type: 'numerical' },
                { name: 'RowRole', type: 'categorical', uniqueValues: 1 },
                { name: 'ResolvedRowRole', type: 'categorical', uniqueValues: 1 },
            ],
            queryHistory: [],
            logAgentToolUsage: vi.fn(),
            recordAgentEvent: vi.fn(),
            sessionId: 'session-1',
            activeTurn: null,
            datasetSemanticSnapshot: null,
            semanticDatasetVersion: null,
            duckDbSessionStatus: { status: 'idle', fallbackReason: null },
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        await executeEvidenceQuery(
            {
                title: 'Balance Due by Code',
                queryMode: 'aggregate',
                intentSummary: 'Inspect balance due by code.',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    groupBy: ['Code'],
                    aggregates: [{ function: 'sum', column: 'Value', as: 'Value' }],
                    where: { predicates: [{ column: 'RowClass', operator: 'eq', value: 'fact' }] },
                },
            },
            store,
            null,
            { topic: 'Balance Due by Code', dataset: topicDataset },
        );

        expect(executeManagedDataQueryMock).toHaveBeenCalledTimes(1);
        expect(executeManagedDataQueryMock.mock.calls[0]?.[0]).toBe(topicDataset);
    });

    it('builds evidence summaries and preserves table-first presentation flags', async () => {
        const {
            buildEvidenceResultSummary,
            executePresentationPlanAndCreateCard,
        } = await import('../services/agent/execution/sqlCardExecutor');

        const summary = buildEvidenceResultSummary(
            {
                title: 'Revenue by Month',
                queryMode: 'aggregate',
                intentSummary: 'Inspect revenue trend by month.',
                preferredResultShape: 'time_series',
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                rows: [{ Month: '2026-01', total_revenue: 100 }, { Month: '2026-02', total_revenue: 120 }],
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['Month', 'total_revenue'],
                appliedOrderBy: [],
                appliedLimit: 12,
                durationMs: 5,
            },
            [
                { name: 'Month', type: 'date' },
                { name: 'Revenue', type: 'numerical' },
            ] as any,
        );

        expect(summary.isTimeSeriesCandidate).toBe(true);

        const state = {
            settings: { language: 'Mandarin' },
            analysisCards: [],
            columnProfiles: [
                { name: 'Month', type: 'date' },
                { name: 'Revenue', type: 'numerical' },
            ],
            addProgress: vi.fn(),
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        createNewCardMock.mockResolvedValueOnce({
            id: 'card-table-first',
            plan: { title: 'Revenue by Month', chartType: 'line', artifactMetadata: { dataTableFirst: true } },
            aggregatedData: [],
            summary: 'ok',
            displayChartType: 'line',
            isDataVisible: true,
            topN: null,
            hideOthers: false,
        });

        const result = await executePresentationPlanAndCreateCard(
            {
                title: 'Revenue by Month',
                queryMode: 'aggregate',
                intentSummary: 'Inspect revenue trend by month.',
                preferredResultShape: 'time_series',
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                title: 'Revenue by Month',
                description: 'Review the table first.',
                presentationMode: 'table_then_chart',
                chartType: 'line',
                bindings: { groupByColumn: 'Month', valueColumn: 'total_revenue' },
            },
            store,
            summary,
            {
                result: {
                    rows: [{ Month: '2026-01', total_revenue: 100 }, { Month: '2026-02', total_revenue: 120 }],
                    totalMatchedRows: 2,
                    returnedRows: 2,
                    truncated: false,
                    selectedColumns: ['Month', 'total_revenue'],
                    appliedOrderBy: [],
                    appliedLimit: 12,
                    durationMs: 5,
                },
                execution: {
                    engine: 'duckdb',
                    sqlPreview: 'SELECT',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'dataset-1',
                    fallbackReason: null,
                    fallbackStage: null,
                },
                activeDataQuery: { result: { rows: [] } },
                binding: null,
                allowedColumns: ['Month', 'Revenue'],
            } as any,
            { topic: 'Revenue by Month' },
        );

        expect(createNewCardMock).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultDataVisible: false,
                artifactMetadata: expect.objectContaining({
                    dataTableFirst: false,
                }),
            }),
            expect.any(Array),
            store,
            expect.objectContaining({ sourceTopic: 'Revenue by Month' }),
        );
        expect(result.presentationPlan.presentationMode).toBe('table_then_chart');

        await executePresentationPlanAndCreateCard(
            {
                title: 'Revenue by Month',
                queryMode: 'aggregate',
                intentSummary: 'Inspect revenue trend by month.',
                preferredResultShape: 'time_series',
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                title: 'Revenue by Month',
                description: 'Review the table only.',
                presentationMode: 'table',
            },
            store,
            summary,
            {
                result: {
                    rows: [{ Month: '2026-01', total_revenue: 100 }, { Month: '2026-02', total_revenue: 120 }],
                },
                activeDataQuery: { result: { rows: [] } },
            } as any,
        );

        expect(createNewCardMock).toHaveBeenLastCalledWith(
            expect.objectContaining({
                defaultDataVisible: true,
                artifactMetadata: expect.objectContaining({
                    dataTableFirst: true,
                    hideChartByDefault: true,
                }),
            }),
            expect.any(Array),
            store,
            expect.any(Object),
        );
    });

    it('does not classify a long planned time series as fragmented categories when month is profiled as categorical', async () => {
        const { buildEvidenceResultSummary } = await import('../services/agent/execution/sqlCardExecutor');
        const rows = Array.from({ length: 36 }, (_, index) => ({
            month: `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
            avg_resale_price: 400_000 + index * 1_000,
        }));

        const summary = buildEvidenceResultSummary(
            {
                title: 'Average resale price trend by month',
                queryMode: 'aggregate',
                intentSummary: 'Average resale price grouped by month.',
                preferredResultShape: 'time_series',
                query: {
                    select: ['month', 'avg_resale_price'],
                    groupBy: ['month'],
                    aggregates: [{ function: 'avg', column: 'resale_price', as: 'avg_resale_price' }],
                },
            },
            {
                rows,
                totalMatchedRows: rows.length,
                returnedRows: rows.length,
                truncated: false,
                selectedColumns: ['month', 'avg_resale_price'],
                appliedOrderBy: [{ column: 'month', direction: 'asc' }],
                appliedLimit: 500,
                durationMs: 5,
            },
            [
                { name: 'month', type: 'categorical', uniqueValues: 36 },
                { name: 'resale_price', type: 'currency', uniqueValues: 10_000 },
            ] as any,
        );

        expect(summary.isTimeSeriesCandidate).toBe(true);
        expect(summary.isWideCategorySet).toBe(false);
    });
});
