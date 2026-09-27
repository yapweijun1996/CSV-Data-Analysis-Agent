// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, streamTextMock, compileQueryPlanToDuckDbSqlMock } = vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    streamTextMock: vi.fn(() => ({
        fullStream: (async function* () {})(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(undefined),
    })),
    compileQueryPlanToDuckDbSqlMock: vi.fn(),
}));

/** Helper: make streamTextMock return a stream that resolves to the given text. */
const mockStreamTextResponse = (text: string) => ({
    fullStream: (async function* () {})(),
    text: Promise.resolve(text),
    finishReason: Promise.resolve('stop'),
    output: Promise.resolve(undefined),
});

vi.mock('ai', () => ({
    generateText: generateTextMock,
    jsonSchema: vi.fn(),
    Output: {
        object: vi.fn(),
    },
    streamText: streamTextMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: vi.fn(() => ({ model: {} })),
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/duckdb/queryCompiler', () => ({
    compileQueryPlanToDuckDbSql: compileQueryPlanToDuckDbSqlMock,
}));

describe('generateEvidenceQueryPlanStepped', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        compileQueryPlanToDuckDbSqlMock.mockReturnValue('SELECT 1');
    });

    it('maps spaced column names exactly and preserves detail-row steering filters', async () => {
        streamTextMock
            .mockReturnValueOnce(mockStreamTextResponse('"Customer Country" = Singapore'));

        const { generateEvidenceQueryPlanStepped } = await import('../services/agent/planning/planGenerator');
        const plan = await generateEvidenceQueryPlanStepped(
            'Count of SO Numbers by Sales Executive',
            [
                { name: 'Sales Executive', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'Customer Country', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'SO Number', type: 'categorical', uniqueValues: 120, missingPercentage: 0 },
                { name: 'Row Class', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ] as any,
            {
                provider: 'google',
                geminiApiKey: 'test-key',
                simpleModel: 'fast-model',
                complexModel: 'smart-model',
                language: 'English',
            } as any,
            'Harness says to keep fact rows only.',
            {
                title: 'Dataset',
                dimensionColumns: ['Sales Executive', 'Customer Country'],
                metricColumns: ['SO Number'],
                blockedDimensions: [],
                analysisSteering: {
                    preferGroupBy: ['Sales Executive'],
                    blockGroupBy: [],
                    softDeprioritizeGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: 'Row Class',
                    detailRowValue: 'fact',
                    promotedChartType: null,
                    blockedChartTypes: [],
                    suggestedHideOthers: false,
                    recommendedTopN: 8,
                    widePivotShape: false,
                    formattedNumberColumns: [],
                    pivotOnlyCombinations: [],
                    pairingSignals: [],
                },
            } as any,
            null,
            'Avoid empty result.',
        );

        expect(plan.query.groupBy).toEqual(['Sales Executive']);
        expect(plan.query.aggregates?.[0]).toMatchObject({
            function: 'count_distinct',
            column: 'SO Number',
        });
        expect(plan.query.where?.predicates).toEqual(expect.arrayContaining([
            { column: 'Row Class', operator: 'eq', value: 'fact' },
            { column: 'Customer Country', operator: 'eq', value: 'Singapore' },
        ]));
        expect(plan.query.limit).toBe(8);
    });

    it('throws planning_invalid instead of falling back when a filter column cannot be mapped', async () => {
        streamTextMock.mockReturnValueOnce(mockStreamTextResponse('Unknown Filter = bad'));

        const { SqlAutoAnalysisError, generateEvidenceQueryPlanStepped } = await import('../services/agent/planning/planGenerator');

        await expect(generateEvidenceQueryPlanStepped(
            'Count of SO Numbers by Sales Executive',
            [
                { name: 'Sales Executive', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'SO Number', type: 'categorical', uniqueValues: 120, missingPercentage: 0 },
            ] as any,
            {
                provider: 'google',
                geminiApiKey: 'test-key',
                simpleModel: 'fast-model',
                complexModel: 'smart-model',
                language: 'English',
            } as any,
            'Harness says filters may be needed.',
            {
                title: 'Dataset',
                dimensionColumns: ['Sales Executive'],
                metricColumns: ['SO Number'],
                blockedDimensions: [],
                analysisSteering: null,
            } as any,
        )).rejects.toMatchObject({
            code: 'planning_invalid',
        });
    });

    it('defaults ratio-like percentage metrics to AVG and still preserves detail-row filters', async () => {
        streamTextMock.mockReturnValueOnce(mockStreamTextResponse('NONE'));

        const { generateEvidenceQueryPlanStepped } = await import('../services/agent/planning/planGenerator');
        const plan = await generateEvidenceQueryPlanStepped(
            'Average Profit Ratio Percentage per Sales Order Number',
            [
                { name: 'SO Number', type: 'categorical', uniqueValues: 120, missingPercentage: 0 },
                { name: 'Profit Ratio %', type: 'percentage', uniqueValues: 80, missingPercentage: 0 },
                { name: 'RowClass', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ] as any,
            {
                provider: 'google',
                geminiApiKey: 'test-key',
                simpleModel: 'fast-model',
                complexModel: 'smart-model',
                language: 'English',
            } as any,
            null,
            {
                title: 'Dataset',
                dimensionColumns: ['SO Number'],
                metricColumns: ['Profit Ratio %'],
                blockedDimensions: [],
                analysisSteering: {
                    preferGroupBy: ['SO Number'],
                    blockGroupBy: [],
                    softDeprioritizeGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: 'RowClass',
                    detailRowValue: 'fact',
                    promotedChartType: null,
                    blockedChartTypes: [],
                    suggestedHideOthers: false,
                    recommendedTopN: 10,
                    widePivotShape: false,
                    formattedNumberColumns: [],
                    pivotOnlyCombinations: [],
                    pairingSignals: [],
                },
            } as any,
            {
                preferredGroupBy: 'SO Number',
                preferredMetric: 'Profit Ratio %',
            },
        );

        expect(plan.query.aggregates?.[0]).toMatchObject({
            function: 'avg',
            column: 'Profit Ratio %',
            as: 'avg_profit_ratio_%',
        });
        expect(plan.query.where?.predicates).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
    });

    it('prioritizes the by-clause dimension for count topics when runtime intent swaps the counted identifier and grouping dimension', async () => {
        streamTextMock.mockReturnValueOnce(mockStreamTextResponse('NONE'));

        const { generateEvidenceQueryPlanStepped } = await import('../services/agent/planning/planGenerator');
        const plan = await generateEvidenceQueryPlanStepped(
            'Count of SO Number by Brand',
            [
                { name: 'Brand', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'SO Number', type: 'categorical', uniqueValues: 120, missingPercentage: 0 },
                { name: 'Customer Name', type: 'categorical', uniqueValues: 40, missingPercentage: 0 },
            ] as any,
            {
                provider: 'google',
                geminiApiKey: 'test-key',
                simpleModel: 'fast-model',
                complexModel: 'smart-model',
                language: 'English',
            } as any,
            null,
            {
                title: 'Dataset',
                dimensionColumns: ['Brand', 'Customer Name'],
                metricColumns: ['SO Number'],
                blockedDimensions: [],
                analysisSteering: null,
            } as any,
            {
                preferredGroupBy: 'SO Number',
                preferredMetric: 'Brand',
            },
        );

        expect(plan.query.groupBy).toEqual(['Brand']);
        expect(plan.query.aggregates?.[0]).toMatchObject({
            function: 'count_distinct',
            column: 'SO Number',
        });
    });

    it('builds a complete governed plan without model calls in deterministic-only mode', async () => {
        const { generateEvidenceQueryPlanStepped } = await import('../services/agent/planning/planGenerator');
        const plan = await generateEvidenceQueryPlanStepped(
            'Average Resale Price trend by Month',
            [
                { name: 'Month', type: 'date', uniqueValues: 439, missingPercentage: 0 },
                { name: 'Town', type: 'categorical', uniqueValues: 27, missingPercentage: 0 },
                { name: 'Resale Price', type: 'currency', uniqueValues: 10_000, missingPercentage: 0 },
                { name: 'Row Class', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ] as any,
            {
                provider: 'google',
                geminiApiKey: 'test-key',
                simpleModel: 'fast-model',
                complexModel: 'smart-model',
                language: 'English',
            } as any,
            'Use fact rows only.',
            {
                dimensionColumns: ['Month', 'Town'],
                metricColumns: ['Resale Price'],
                preferredTimeColumns: ['Month'],
                analysisSteering: {
                    detailRowColumn: 'Row Class',
                    detailRowValue: 'fact',
                    preferGroupBy: ['Month'],
                    blockGroupBy: [],
                    softDeprioritizeGroupBy: [],
                    recommendedTopN: 10,
                },
            } as any,
            {
                preferredGroupBy: 'Month',
                preferredMetric: 'Resale Price',
            },
            null,
            { deterministicOnly: true },
        );

        expect(streamTextMock).not.toHaveBeenCalled();
        expect(plan.query).toMatchObject({
            groupBy: ['Month'],
            aggregates: [{
                function: 'avg',
                column: 'Resale Price',
            }],
            where: {
                predicates: [{
                    column: 'Row Class',
                    operator: 'eq',
                    value: 'fact',
                }],
            },
            orderBy: [{ column: 'Month', direction: 'asc' }],
        });
        expect(plan.query.limit).toBe(500);
    });
});
