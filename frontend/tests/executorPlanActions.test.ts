// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDatasetId } from '../utils/datasetId';

const {
    executePlanAndCreateCardMock,
    executeSqlPlanAndCreateCardMock,
} = vi.hoisted(() => ({
    executePlanAndCreateCardMock: vi.fn(),
    executeSqlPlanAndCreateCardMock: vi.fn(),
}));

vi.mock('../services/agent/execution/cardExecutor', () => ({
    executePlanAndCreateCard: executePlanAndCreateCardMock,
}));

vi.mock('../services/agent/execution/sqlCardExecutor', () => ({
    executeSqlPlanAndCreateCard: executeSqlPlanAndCreateCardMock,
}));

describe('executorPlanActions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('routes SQL-first plans to the DuckDB SQL executor', async () => {
        const { executePlanAction } = await import('../services/agent/execution/executorAgent');
        const csvData = { fileName: 'test.csv', data: [] };
        const datasetVersion = buildDatasetId(csvData.fileName, csvData.data);
        const store = {
            getState: () => ({
                csvData,
                duckDbSessionStatus: {
                    status: 'ready',
                    engine: 'duckdb',
                    tableName: 'session_clean_dataset',
                    loadVersion: datasetVersion,
                    fallbackReason: null,
                    lastSyncedAt: null,
                },
                datasetSemanticSnapshot: null,
                semanticDatasetVersion: null,
                activeDataQuery: null,
            }),
            setState: vi.fn(),
        } as any;

        executeSqlPlanAndCreateCardMock.mockResolvedValue({ id: 'card-1' });

        const sqlPlan = {
            chartType: 'bar',
            title: 'Project Profitability',
            description: 'Compare project revenue and cost.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: {
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'total_revenue',
                secondaryValueColumn: 'total_cost',
            },
            query: {
                groupBy: ['SeriesLabelL1'],
                aggregates: [
                    { function: 'sum', column: 'Value', as: 'total_revenue' },
                    { function: 'sum', column: 'Value', as: 'total_cost' },
                ],
                select: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
            },
        };

        await executePlanAction(sqlPlan as any, store);

        expect(executeSqlPlanAndCreateCardMock).toHaveBeenCalledWith(sqlPlan, store, {
            tableName: 'session_clean_dataset',
            loadVersion: datasetVersion,
        });
        expect(executePlanAndCreateCardMock).not.toHaveBeenCalled();
    }, 10000);

    it('does not reuse a stale DuckDB binding for SQL-first plans', async () => {
        const { executePlanAction } = await import('../services/agent/execution/executorAgent');
        const csvData = { fileName: 'test.csv', data: [{ Region: 'East', Revenue: 10 }] };
        const store = {
            getState: () => ({
                csvData,
                duckDbSessionStatus: {
                    status: 'ready',
                    engine: 'duckdb',
                    tableName: 'session_clean_dataset',
                    loadVersion: 'stale-version',
                    fallbackReason: null,
                    lastSyncedAt: null,
                },
                datasetSemanticSnapshot: null,
                semanticDatasetVersion: null,
                activeDataQuery: null,
            }),
            setState: vi.fn(),
        } as any;

        const sqlPlan = {
            chartType: 'bar',
            title: 'Project Profitability',
            description: 'Compare project revenue and cost.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: {
                groupByColumn: 'Region',
                valueColumn: 'Revenue',
            },
            query: {
                groupBy: ['Region'],
                aggregates: [
                    { function: 'sum', column: 'Revenue', as: 'Revenue' },
                ],
                select: ['Region', 'Revenue'],
            },
        };

        await executePlanAction(sqlPlan as any, store);

        expect(executeSqlPlanAndCreateCardMock).toHaveBeenCalledWith(sqlPlan, store, null);
    });
});
