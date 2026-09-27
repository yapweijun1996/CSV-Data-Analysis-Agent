// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createNewCardMock } = vi.hoisted(() => ({
    createNewCardMock: vi.fn(),
}));

vi.mock('../services/agent/execution/cardCreator', () => ({
    createNewCard: createNewCardMock,
}));

describe('executePivotMatrixAnalysis', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        createNewCardMock.mockImplementation(async (plan, data) => ({
            id: 'card-1',
            plan,
            aggregatedData: data,
            summary: 'Pivot summary',
            displayChartType: plan.chartType,
            isDataVisible: true,
            topN: null,
            hideOthers: false,
        }));
    });

    it('blocks pivot analysis when no dataset is loaded', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: null,
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            aggregate: 'count',
            title: 'Pivot',
            description: 'Count rows by region.',
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.message).toBe('No dataset is loaded for pivot analysis.');
    });

    it('applies the governed detail-row filter before aggregating a pivot', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', ShipMode: 'FOB', Amount: 10, RowClass: 'fact' },
                    { Region: 'North', ShipMode: 'CNF', Amount: 5, RowClass: 'fact' },
                    { Region: 'South', ShipMode: 'FOB', Amount: 20, RowClass: 'fact' },
                    { Region: 'Unknown', ShipMode: 'TOTAL', Amount: 999, RowClass: 'total' },
                ],
            },
            chatHistory: [],
            latestAnalysisSession: {
                analysisSteering: {
                    detailRowFilter: { column: 'RowClass', value: 'fact' },
                },
            },
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            columns: ['ShipMode'],
            metric: 'Amount',
            aggregate: 'sum',
            title: 'Amount by region and ship mode',
            description: 'Compare detail-row amounts.',
        }, store as never);

        expect(result.status).toBe('success');
        const createdPlan = createNewCardMock.mock.calls[0]?.[0];
        const createdRows = createNewCardMock.mock.calls[0]?.[1];
        expect(createdPlan?.preFilter).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
        expect(createdRows).toEqual(expect.arrayContaining([
            expect.objectContaining({ row_label: 'North', FOB: 10, CNF: 5, row_total: 15 }),
            expect.objectContaining({ row_label: 'South', FOB: 20, row_total: 20 }),
        ]));
        expect(createdRows).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ row_label: 'Unknown' }),
        ]));
    });

    it('blocks numeric pivot aggregates when metric is missing', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [{ Region: 'North', Revenue: 10 }],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            aggregate: 'sum',
            title: 'Pivot',
            description: 'Sum revenue by region.',
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.message).toBe('Pivot sum requires a metric column.');
    });

    it('blocks pivot analyses when aggregate is missing', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [{ Region: 'North', Revenue: 10 }],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            title: 'Pivot',
            description: 'Pivot by region.',
        } as never, store as never);

        expect(result.status).toBe('blocked');
        expect(result.message).toBe('Pivot aggregate is required.');
    });

    it('blocks numeric pivot aggregates when the metric column has no parseable numeric values', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', Revenue: 'n/a' },
                    { Region: 'South', Revenue: 'pending' },
                ],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Pivot',
            description: 'Sum revenue by region.',
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.message).toBe('Metric column "Revenue" contains no numeric values after parsing.');
    });

    it('blocks pivot analysis when the semantic contract marks the dimension as repeated/helper or the metric as blocked', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { UOM_10: 'PCS', UOM: 'PCS', Date: 100, 'Item Cnt': 10 },
                ],
            },
            columnProfiles: [
                { name: 'UOM_10', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'UOM', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'Date', type: 'numerical', uniqueValues: 30, missingPercentage: 0 },
                { name: 'Item Cnt', type: 'numerical', uniqueValues: 30, missingPercentage: 0 },
            ],
            activeAnalysisSession: {
                analysisSteering: {
                    blockedDimensions: ['UOM_10'],
                    softDeprioritizeGroupBy: [],
                    blockedMetrics: ['Date'],
                    columnRoles: {
                        UOM_10: 'repeated_bundle_member',
                        UOM: 'business_dimension',
                        Date: 'business_metric',
                        'Item Cnt': 'business_metric',
                    },
                },
            },
            latestAnalysisSession: null,
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['UOM_10'],
            columns: ['UOM'],
            metric: 'Date',
            aggregate: 'sum',
            title: 'Date by UOM_10 and UOM',
            description: 'Bad pivot request.',
        }, store as never);

        expect(result.status).toBe('blocked');
        expect(result.message).toContain('analysis semantic contract');
    });

    it('keeps empty or non-numeric pivot buckets as null instead of coercing them to zero', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', Quarter: 'Q1', Revenue: 10 },
                    { Region: 'South', Quarter: 'Q1', Revenue: 'n/a' },
                    { Region: 'South', Quarter: 'Q2', Revenue: 5 },
                ],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            columns: ['Quarter'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Pivot',
            description: 'Sum revenue by region and quarter.',
        }, store as never);

        expect(result.status).toBe('success');
        expect(createNewCardMock).toHaveBeenCalledTimes(1);
        const createdData = createNewCardMock.mock.calls[0]?.[1];
        expect(createdData).toEqual([
            { row_label: 'North', Q1: 10, Q2: null, row_total: 10 },
            { row_label: 'South', Q1: null, Q2: 5, row_total: 5 },
        ]);
    });

    it('creates row-only pivot tables without a duplicate total column and enables the standard top-n controls', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', Revenue: 10 },
                    { Region: 'South', Revenue: 5 },
                ],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Revenue by Region',
            description: 'Sum revenue by region.',
        }, store as never);

        expect(result.status).toBe('success');
        expect(createNewCardMock).toHaveBeenCalledTimes(1);

        const createdPlan = createNewCardMock.mock.calls[0]?.[0];
        const createdData = createNewCardMock.mock.calls[0]?.[1];

        expect(createdPlan).toMatchObject({
            artifactType: 'pivot_matrix',
            defaultTopN: 8,
            defaultHideOthers: true,
            disableTopNControls: false,
            artifactMetadata: {
                matrixColumns: ['row_label', 'row_total'],
                matrixRowLabel: 'Region',
                matrixMetricLabel: 'Revenue',
            },
        });
        expect(createdData).toEqual([
            { row_label: 'North', row_total: 10 },
            { row_label: 'South', row_total: 5 },
        ]);
    });

    it('defaults multi-series pivots to stacked charts and exposes matrix value columns', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', Quarter: 'Q1', Revenue: 10 },
                    { Region: 'North', Quarter: 'Q2', Revenue: 15 },
                    { Region: 'South', Quarter: 'Q1', Revenue: 8 },
                ],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            columns: ['Quarter'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Revenue by Region and Quarter',
            description: 'Compare revenue by region and quarter.',
        }, store as never);

        expect(result.status).toBe('success');
        const createdPlan = createNewCardMock.mock.calls[0]?.[0];
        expect(createdPlan).toMatchObject({
            chartType: 'stacked_column',
            artifactMetadata: {
                matrixColumns: ['row_label', 'Q1', 'Q2', 'row_total'],
                matrixValueColumns: ['Q1', 'Q2'],
                matrixRowLabel: 'Region',
                matrixColumnLabel: 'Quarter',
                matrixMetricLabel: 'Revenue',
            },
        });
    });

    it('defaults dense or long-label multi-series pivots to stacked bar', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'Very Long Regional Business Unit Name', Quarter: 'Q1', Revenue: 10 },
                    { Region: 'Very Long Regional Business Unit Name', Quarter: 'Q2', Revenue: 15 },
                    { Region: 'South', Quarter: 'Q1', Revenue: 8 },
                ],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            columns: ['Quarter'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Revenue by Region and Quarter',
            description: 'Compare revenue by region and quarter.',
        }, store as never);

        expect(result.status).toBe('success');
        const createdPlan = createNewCardMock.mock.calls[0]?.[0];
        expect(createdPlan?.chartType).toBe('stacked_bar');
    });

    it('defaults wide multi-series pivots to compressed stacked mode and records the wide-column metadata', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Region: 'North', Category: 'C1', Revenue: 10 },
                    { Region: 'North', Category: 'C2', Revenue: 9 },
                    { Region: 'North', Category: 'C3', Revenue: 8 },
                    { Region: 'North', Category: 'C4', Revenue: 7 },
                    { Region: 'North', Category: 'C5', Revenue: 6 },
                    { Region: 'North', Category: 'C6', Revenue: 5 },
                    { Region: 'North', Category: 'C7', Revenue: 4 },
                    { Region: 'North', Category: 'C8', Revenue: 3 },
                    { Region: 'North', Category: 'C9', Revenue: 2 },
                ],
            },
            chatHistory: [],
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Region'],
            columns: ['Category'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Wide revenue pivot',
            description: 'Compare revenue by region and category.',
        }, store as never);

        expect(result.status).toBe('success');
        const createdPlan = createNewCardMock.mock.calls[0]?.[0];
        expect(createdPlan).toMatchObject({
            chartType: 'stacked_column',
            artifactMetadata: {
                defaultCompressedStackedView: true,
                effectiveMatrixValueColumnCount: 9,
            },
        });
    });

    it('preserves the requested metric when a pivot column collapses to one effective value', async () => {
        const { executePivotMatrixAnalysis } = await import('../services/agent/execution/analysisSkillExecutor');

        let state = {
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Month: 'Jan', Quarter: 'Q1', Revenue: 10, Cost: 6, Profit: 4 },
                    { Month: 'Feb', Quarter: 'Q1', Revenue: 12, Cost: 7, Profit: 5 },
                ],
            },
            chatHistory: [],
            settings: { language: 'Mandarin' },
        };
        const store = {
            getState: () => state,
            setState: (update: any) => {
                state = typeof update === 'function' ? update(state) : { ...state, ...update };
            },
        };

        const result = await executePivotMatrixAnalysis({
            rows: ['Month'],
            columns: ['Quarter'],
            metric: 'Revenue',
            aggregate: 'sum',
            title: 'Monthly performance trends',
            description: 'Compare monthly revenue, cost, and profit.',
        }, store as never);

        expect(result.status).toBe('success');
        expect(result.message).toContain('single-metric grouped card');
        expect(result.artifactMetadata).toMatchObject({
            artifactType: 'pivot_matrix',
            matrixColumns: ['row_label', 'row_total'],
            matrixValueColumns: [],
            matrixMetricLabel: 'Revenue',
        });

        const createdPlan = createNewCardMock.mock.calls[0]?.[0];
        expect(createdPlan).toMatchObject({
            chartType: 'bar',
            valueColumn: 'row_total',
            artifactMetadata: {
                artifactType: 'pivot_matrix',
                matrixColumns: ['row_label', 'row_total'],
                matrixValueColumns: [],
                matrixRowLabel: 'Month',
                matrixMetricLabel: 'Revenue',
            },
        });
        expect(createNewCardMock.mock.calls[0]?.[1]).toEqual([
            { row_label: 'Feb', row_total: 12 },
            { row_label: 'Jan', row_total: 10 },
        ]);
    });
});
