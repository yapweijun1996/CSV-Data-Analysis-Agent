// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeTestStore } from './runtimeTestStore';
import { executeDataQueryAction } from '../services/agent/execution/executorDataActions';
import { createAgentTurn } from '../services/agent/runtime/runtimeState';

const { executeManagedDataQueryMock } = vi.hoisted(() => ({
    executeManagedDataQueryMock: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    executeDataQueryWithWorker: vi.fn(),
}));

vi.mock('../services/agent/execution/executorGovernance', () => ({
    getToolGovernanceMeta: vi.fn(() => ({ decision: { reason: 'allowed' } })),
}));

vi.mock('../services/agent/queryTraceState', () => ({
    appendQueryHistory: vi.fn(history => history),
    createQueryTraceEntry: vi.fn(() => ({})),
}));

vi.mock('../services/agent/cleaningRunState', () => ({
    appendCleaningRunStep: vi.fn(run => run),
}));

vi.mock('../services/agent/execution/statisticalExecutor', () => ({
    handleCorrelationAnalysis: vi.fn(),
}));

vi.mock('../services/agent/execution/deterministicMutationExecutor', () => ({
    executeDeterministicMutationPlan: vi.fn(),
}));

vi.mock('../services/agent/execution/spreadsheetFilterRuntime', () => ({
    runSpreadsheetFilter: vi.fn(),
}));

describe('executeDataQueryAction recovery', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('converts missing filter columns into a recoverable validation_failed observation', async () => {
        const store = createRuntimeTestStore({
            columnProfiles: [
                { name: 'Project', type: 'string' },
                { name: 'Amount', type: 'number' },
            ],
            csvData: {
                fileName: 'report.csv',
                data: [{ Project: 'A', Amount: 10 }],
            },
        });

        executeManagedDataQueryMock.mockRejectedValue(new Error('Query filter references missing column: record_count'));

        const result = await executeDataQueryAction({
            type: 'tool_call',
            thought: 'Check whether duplicate records exist.',
            toolName: 'data.query',
            args: {
                explanation: 'Inspect duplicate groups.',
                plan: {
                    groupBy: ['Project'],
                    aggregates: [{ function: 'count', as: 'record_count' }],
                    select: ['Project', 'record_count'],
                    where: {
                        predicates: [{ column: 'record_count', operator: 'gt', value: 1 }],
                    },
                    orderBy: [{ column: 'record_count', direction: 'desc' }],
                    limit: 10,
                },
            },
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.retryHint).toContain('Do not filter on aggregate aliases such as record_count');
        expect(result.observation).toMatchObject({
            type: 'runtime_error',
            status: 'blocked',
            toolName: 'data.query',
            code: 'validation_failed',
        });
        expect(result.observation?.detail).toMatchObject({
            repairHintCategory: 'missing_filter_column',
            repairHintCategories: ['missing_filter_column'],
        });
        expect(store.getState().addProgress).toHaveBeenCalledWith(
            'AI data query failed: Query filter references missing column: record_count',
            'system',
        );
    }, 10000);

    it('executes chat data.query against the preferred canonical dataset when available', async () => {
        const rawPrepared = {
            fileName: 'prepared.csv',
            data: [{ Project: 'stale-row', Amount: 999 }],
        };
        const canonical = {
            fileName: 'canonical.csv',
            data: [
                { CUSTOMER: 'Algintons Print & Graphics Pte Ltd', TOTAL: 658381.38, RowRole: 'detail' },
                { CUSTOMER: 'TNERY Inc', TOTAL: 349127, RowRole: 'detail' },
            ],
        };
        const store = createRuntimeTestStore({
            csvData: rawPrepared,
            columnProfiles: [
                { name: 'CUSTOMER', type: 'string' },
                { name: 'TOTAL', type: 'number' },
                { name: 'RowRole', type: 'string' },
            ],
        } as any);
        store.setState({
            canonicalCsvData: canonical,
        } as any);

        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT "CUSTOMER", SUM("TOTAL") AS "total_revenue" FROM "session_clean_dataset"',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-canonical',
            fallbackReason: null,
            result: {
                rows: [{ CUSTOMER: 'Algintons Print & Graphics Pte Ltd', total_revenue: 658381.38 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['CUSTOMER', 'total_revenue'],
                appliedOrderBy: [{ column: 'total_revenue', direction: 'desc' }],
                appliedLimit: 3,
                durationMs: 18,
            },
        });

        const result = await executeDataQueryAction({
            type: 'tool_call',
            thought: 'Identify the top customer by total revenue.',
            toolName: 'data.query',
            args: {
                explanation: 'Aggregate total revenue by customer.',
                plan: {
                    select: ['CUSTOMER', 'total_revenue'],
                    groupBy: ['CUSTOMER'],
                    aggregates: [{ column: 'TOTAL', function: 'sum', as: 'total_revenue' }],
                    where: {
                        predicates: [{ column: 'RowRole', operator: 'eq', value: 'detail' }],
                    },
                    orderBy: [{ column: 'total_revenue', direction: 'desc' }],
                    limit: 3,
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(executeManagedDataQueryMock.mock.calls[0]?.[0]).toEqual(canonical);
    });

    it('raises the governed group limit for complete derived-metric ranking evidence', async () => {
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'ads.csv',
                data: [{ 'Ad name': 'A', Spend: 10, Results: 100 }],
            },
            columnProfiles: [
                { name: 'Ad name', type: 'string' },
                { name: 'Spend', type: 'number' },
                { name: 'Results', type: 'number' },
            ],
        } as any);
        store.setState({
            activeTurn: createAgentTurn('Show the five lowest cost per result entries by Ad name.'),
        } as any);
        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT ...',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-ads',
            fallbackReason: null,
            result: {
                rows: [{ 'Ad name': 'A', total_spend: 10, total_results: 100 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Ad name', 'total_spend', 'total_results'],
                appliedOrderBy: [],
                appliedLimit: 500,
                durationMs: 4,
            },
        });

        const result = await executeDataQueryAction({
            type: 'tool_call',
            thought: 'Calculate cost per result.',
            toolName: 'data.query',
            args: {
                explanation: 'Total spend and results by ad.',
                plan: {
                    select: ['Ad name'],
                    groupBy: ['Ad name'],
                    aggregates: [
                        { function: 'sum', column: 'Spend', as: 'total_spend' },
                        { function: 'sum', column: 'Results', as: 'total_results' },
                    ],
                    limit: 50,
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(executeManagedDataQueryMock.mock.calls[0]?.[1]).toMatchObject({ limit: 500 });
    });

    it('raises the governed group limit for a full-dataset share calculation', async () => {
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'balances.csv',
                data: [{ Customer: 'A', Amount: 10 }],
            },
            columnProfiles: [
                { name: 'Customer', type: 'string' },
                { name: 'Amount', type: 'number' },
            ],
        } as any);
        store.setState({
            activeTurn: createAgentTurn('Which customer is highest and what percentage of the full dataset total does it represent?'),
        } as any);
        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT ...',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-balances',
            fallbackReason: null,
            result: {
                rows: [{ Customer: 'A', total_amount: 10 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Customer', 'total_amount'],
                appliedOrderBy: [],
                appliedLimit: 500,
                durationMs: 4,
            },
        });

        const result = await executeDataQueryAction({
            type: 'tool_call',
            thought: 'Calculate the complete customer share.',
            toolName: 'data.query',
            args: {
                explanation: 'Total amount by customer.',
                plan: {
                    select: ['Customer', 'total_amount'],
                    groupBy: ['Customer'],
                    aggregates: [{ function: 'sum', column: 'Amount', as: 'total_amount' }],
                    limit: 10,
                },
            },
        }, store as never);

        expect(result.status).toBe('success');
        expect(executeManagedDataQueryMock.mock.calls[0]?.[1]).toMatchObject({ limit: 500 });
    });

    it('does not inject hierarchy exclusions into reconciliation queries that reset prior filters', async () => {
        const csvData = {
            fileName: 'hdb.csv',
            data: [
                { Block: '101A', 'Flat Type': '4 ROOM', 'Storey Range': null, RowRole: 'detail' },
            ],
        };
        const store = createRuntimeTestStore({
            csvData,
            columnProfiles: [
                { name: 'Block', type: 'string' },
                { name: 'Flat Type', type: 'string' },
                { name: 'Storey Range', type: 'string' },
                { name: 'RowRole', type: 'string' },
            ],
            latestAnalysisSession: {
                analysisSteering: {
                    hierarchyColumn: 'Block',
                    excludeFromAggregation: ['101A'],
                    detailRowColumn: 'RowRole',
                    detailRowValue: 'detail',
                    detailRowFilter: { column: 'RowRole', value: 'detail' },
                    preferGroupBy: [],
                    blockGroupBy: [],
                },
            },
        } as any);
        const runtimeStepContract = {
            goalSummary: 'Reconcile Flat Type and Storey Range counts.',
            taskMode: 'reconciliation',
            completionMode: 'respond_or_act',
            expectedOutcome: 'table',
            allowAssistantResponse: false,
            preferClarification: false,
            antiRepeatHint: '',
            reconciliation: {
                leftScope: { label: 'Flat Type', sourceCardId: null, total: 2745, datasetVersion: null },
                rightScope: { label: 'Storey Range', sourceCardId: null, total: 2728, datasetVersion: null },
                targetDifference: 17,
                expectedOutput: ['record_table', 'reason_breakdown', 'scope_explanation'],
                inheritPriorFilters: false,
                maxDataQueryCalls: 3,
                maxSemanticRepairs: 2,
            },
        } as any;
        store.setState({
            activeTurn: createAgentTurn('Reconcile the 17-row difference', { runtimeStepContract }),
        } as any);
        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT ...',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-hdb',
            fallbackReason: null,
            result: {
                rows: csvData.data,
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Block', 'Flat Type', 'Storey Range'],
                appliedOrderBy: [],
                appliedLimit: 25,
                durationMs: 10,
            },
        });

        await executeDataQueryAction({
            type: 'tool_call',
            thought: 'Find records missing Storey Range.',
            toolName: 'data.query',
            args: {
                explanation: 'Find the reconciliation records.',
                plan: {
                    select: ['Block', 'Flat Type', 'Storey Range'],
                    where: {
                        predicates: [{ column: 'Storey Range', operator: 'is_null' }],
                    },
                    limit: 25,
                },
            },
        }, store as never);

        const executedPlan = executeManagedDataQueryMock.mock.calls[0]?.[1];
        expect(executedPlan.where.predicates).toEqual([
            { column: 'Storey Range', operator: 'is_null' },
            { column: 'RowRole', operator: 'eq', value: 'detail' },
        ]);
        expect(executedPlan.where.predicates).not.toContainEqual(expect.objectContaining({
            column: 'Block',
            operator: 'not_in',
        }));
    });

    it('does not leak analysis hierarchy exclusions into a fresh follow-up query', async () => {
        const csvData = {
            fileName: 'resale.csv',
            data: [{ Month: '2020-01', Block: '101A', Price: 400000 }],
        };
        const store = createRuntimeTestStore({
            csvData,
            columnProfiles: [
                { name: 'Month', type: 'string' },
                { name: 'Block', type: 'string' },
                { name: 'Price', type: 'number' },
            ],
            latestAnalysisSession: {
                analysisSteering: {
                    hierarchyColumn: 'Block',
                    excludeFromAggregation: ['101A'],
                    detailRowColumn: null,
                    detailRowValue: null,
                    detailRowFilter: null,
                    preferGroupBy: [],
                    blockGroupBy: [],
                },
            },
        } as any);
        store.setState({ activeTurn: createAgentTurn('Compare two months') } as any);
        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            sqlPreview: 'SELECT ...',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-resale',
            fallbackReason: null,
            result: {
                rows: [{ Month: '2020-01', average_price: 400000 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Month', 'average_price'],
                appliedOrderBy: [],
                appliedLimit: 500,
                durationMs: 5,
            },
        });

        await executeDataQueryAction({
            type: 'tool_call',
            thought: 'Compare month values.',
            toolName: 'data.query',
            args: {
                explanation: 'Compare month values.',
                plan: {
                    groupBy: ['Month'],
                    aggregates: [{ function: 'avg', column: 'Price', as: 'average_price' }],
                    where: {
                        groups: [
                            { predicates: [{ column: 'Month', operator: 'eq', value: '2020-01' }] },
                            { predicates: [{ column: 'Month', operator: 'eq', value: '2025-01' }] },
                        ],
                    },
                },
            },
        }, store as never);

        const executedPlan = executeManagedDataQueryMock.mock.calls[0]?.[1];
        expect(executedPlan.where.groups).toHaveLength(2);
        expect(executedPlan.where.predicates ?? []).not.toContainEqual(expect.objectContaining({
            column: 'Block',
            operator: 'not_in',
        }));
    });
});
