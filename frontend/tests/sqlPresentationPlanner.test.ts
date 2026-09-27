// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceValueGateResult, Settings, SqlEvidenceQueryPlan, SqlEvidenceQueryResultSummary, SqlPresentationPlan } from '../types';
import {
    applyPresentationSafetyFloor,
    buildAnalysisPlanFromPresentation,
    buildDeterministicSqlPresentationPlan,
    callAiPresentationPlan,
} from '../services/agent/planning/sqlPresentationPlanner';

const {
    generateTextMock,
    streamTextMock,
    isProviderConfiguredMock,
    createProviderModelMock,
} = vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    streamTextMock: vi.fn(() => ({
        fullStream: (async function* () {})(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(undefined),
    })),
    isProviderConfiguredMock: vi.fn(),
    createProviderModelMock: vi.fn(),
}));

vi.mock('ai', () => ({
    generateText: generateTextMock,
    Output: { object: vi.fn().mockReturnValue({ type: 'object' }) },
    jsonSchema: vi.fn().mockImplementation((s: unknown) => s),
    streamText: streamTextMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: isProviderConfiguredMock,
    createProviderModel: createProviderModelMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

describe('sqlPresentationPlanner', () => {
    it('keeps an explicitly planned month trend as a full temporal series even when profiling typed month as categorical', () => {
        const evidencePlan: SqlEvidenceQueryPlan = {
            title: 'Average resale price trend by month',
            queryMode: 'aggregate',
            intentSummary: 'Average resale price grouped by month.',
            preferredResultShape: 'time_series',
            query: {
                select: ['month', 'avg_resale_price'],
                groupBy: ['month'],
                aggregates: [{ function: 'avg', column: 'resale_price', as: 'avg_resale_price' }],
            },
        };

        const presentationPlan = buildDeterministicSqlPresentationPlan(
            evidencePlan,
            {
                queryMode: 'aggregate',
                preferredResultShape: 'time_series',
                rowCount: 439,
                columnCount: 2,
                columns: ['month', 'avg_resale_price'],
                numericColumns: ['avg_resale_price'],
                categoricalColumns: ['month'],
                timeColumns: [],
                distinctGroupCount: 439,
                totalValue: null,
                isTimeSeriesCandidate: false,
                isWideCategorySet: true,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [],
            },
            [
                { name: 'month', type: 'categorical', uniqueValues: 439 },
                { name: 'resale_price', type: 'currency', uniqueValues: 50_000 },
            ],
            {
                valueGate: {
                    decision: 'pass',
                    reasonCodes: [],
                    detail: 'pass',
                    querySignature: 'q-monthly-price',
                    semanticSignature: 's-monthly-price',
                    semanticRisk: 'low',
                },
            },
        );

        expect(presentationPlan.chartType).toBe('area');
        expect(presentationPlan.presentationMode).toBe('chart');
        expect(presentationPlan.defaultTopN).toBeUndefined();
        expect(presentationPlan.defaultHideOthers).toBe(false);
    });

    it('keeps fragmented aggregate evidence table-first', () => {
        const evidencePlan: SqlEvidenceQueryPlan = {
            title: 'Revenue by project',
            queryMode: 'aggregate',
            intentSummary: 'Inspect revenue by project.',
            preferredResultShape: 'ranked_aggregate',
            preFilter: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
            query: {
                select: ['Project', 'total_revenue'],
                groupBy: ['Project'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            },
        };

        const presentationPlan = buildDeterministicSqlPresentationPlan(
            evidencePlan,
            {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 18,
                columnCount: 2,
                columns: ['Project', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Project'],
                timeColumns: [],
                distinctGroupCount: 18,
                totalValue: 1000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: true,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [],
            },
            [
                { name: 'Project', type: 'categorical', uniqueValues: 18 },
                { name: 'Revenue', type: 'numerical' },
            ],
            {
                semanticUnderstanding: {
                    businessGrains: ['Project'],
                    candidateMetrics: ['Revenue'],
                    timeGrains: [],
                    helperDimensions: [],
                    blockedDimensions: [],
                    detailRowPolicy: 'exclude_non_detail_rows',
                    businessGlossary: ['Revenue'],
                    businessGrainConfidence: 'high',
                    unsafeForBusinessNarrative: false,
                },
                valueGate: {
                    decision: 'table_only',
                    reasonCodes: ['fragmented_groups'],
                    detail: 'fragmented_groups',
                    querySignature: 'q1',
                    semanticSignature: 's1',
                    semanticRisk: 'medium',
                },
            },
        );

        // fragmented_groups is not a blocker for table display — the card shows a data table by default
        // with a bar chart capped at top 8 via defaultTopN.
        expect(presentationPlan.presentationMode).toBe('table_then_chart');
        expect(presentationPlan.chartType).toBe('bar');
        expect(presentationPlan.defaultTopN).toBe(8);
        const analysisPlan = buildAnalysisPlanFromPresentation(evidencePlan, presentationPlan);
        expect(analysisPlan).not.toBeNull();
        expect(analysisPlan?.defaultDataVisible).toBe(false);
        expect(analysisPlan?.preFilter).toEqual([{ column: 'RowClass', operator: 'eq', value: 'fact' }]);
    });

    it('allows combo only when two aggregate aliases already exist', () => {
        const evidencePlan: SqlEvidenceQueryPlan = {
            title: 'Project profitability',
            queryMode: 'aggregate',
            intentSummary: 'Compare revenue and cost by project.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['Project', 'total_revenue', 'total_cost'],
                groupBy: ['Project'],
                aggregates: [
                    { function: 'sum', column: 'Revenue', as: 'total_revenue' },
                    { function: 'sum', column: 'Cost', as: 'total_cost' },
                ],
            },
        };

        const presentationPlan = buildDeterministicSqlPresentationPlan(
            evidencePlan,
            {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 6,
                columnCount: 3,
                columns: ['Project', 'total_revenue', 'total_cost'],
                numericColumns: ['total_revenue', 'total_cost'],
                categoricalColumns: ['Project'],
                timeColumns: [],
                distinctGroupCount: 6,
                totalValue: 1000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: true,
                hasNegativeValues: false,
                previewRows: [],
            },
            [
                { name: 'Project', type: 'categorical', uniqueValues: 6 },
                { name: 'Revenue', type: 'numerical' },
                { name: 'Cost', type: 'numerical' },
            ],
            {
                semanticUnderstanding: {
                    businessGrains: ['Project'],
                    candidateMetrics: ['Revenue', 'Cost'],
                    timeGrains: [],
                    helperDimensions: [],
                    blockedDimensions: [],
                    detailRowPolicy: 'exclude_non_detail_rows',
                    businessGlossary: ['Profitability'],
                    businessGrainConfidence: 'high',
                    unsafeForBusinessNarrative: false,
                },
                valueGate: {
                    decision: 'pass',
                    reasonCodes: [],
                    detail: 'pass',
                    querySignature: 'q2',
                    semanticSignature: 's2',
                    semanticRisk: 'low',
                },
            },
        );

        expect(presentationPlan.presentationMode).toBe('table_then_chart');
        expect(presentationPlan.chartType).toBe('combo');
        expect(presentationPlan.bindings?.secondaryValueColumn).toBe('total_cost');
    });

    it('forces helper-grain evidence into table mode with no default chart', () => {
        const evidencePlan: SqlEvidenceQueryPlan = {
            title: 'Financial values by SeriesKey',
            queryMode: 'aggregate',
            intentSummary: 'Inspect values by SeriesKey.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['SeriesKey', 'total_value'],
                groupBy: ['SeriesKey'],
                aggregates: [{ function: 'sum', column: 'Value', as: 'total_value' }],
            },
        };

        const presentationPlan = buildDeterministicSqlPresentationPlan(
            evidencePlan,
            {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 12,
                columnCount: 2,
                columns: ['SeriesKey', 'total_value'],
                numericColumns: ['total_value'],
                categoricalColumns: ['SeriesKey'],
                timeColumns: [],
                distinctGroupCount: 12,
                totalValue: 100,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [],
            },
            [
                { name: 'SeriesKey', type: 'categorical', uniqueValues: 12 },
                { name: 'Value', type: 'numerical' },
            ],
            {
                semanticUnderstanding: {
                    businessGrains: [],
                    candidateMetrics: ['Value'],
                    timeGrains: [],
                    helperDimensions: ['SeriesKey'],
                    blockedDimensions: ['SeriesKey'],
                    detailRowPolicy: 'exclude_non_detail_rows',
                    businessGlossary: [],
                    businessGrainConfidence: 'low',
                    unsafeForBusinessNarrative: true,
                },
                valueGate: {
                    decision: 'table_only',
                    reasonCodes: ['helper_dimension', 'low_business_confidence'],
                    detail: 'helper_dimension',
                    querySignature: 'q3',
                    semanticSignature: 's3',
                    semanticRisk: 'high',
                },
            },
        );

        expect(presentationPlan.presentationMode).toBe('table');
        expect(presentationPlan.chartType).toBeUndefined();
        const analysisPlan = buildAnalysisPlanFromPresentation(evidencePlan, presentationPlan);
        // table mode now creates a table-only card (data visible, chart secondary)
        expect(analysisPlan).not.toBeNull();
        expect(analysisPlan!.defaultDataVisible).toBe(false);
        expect(analysisPlan!.artifactMetadata?.dataTableFirst).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Edge-case tests: all-null columns, single-row, 100+ groups
// ---------------------------------------------------------------------------

describe('presentation planner edge cases', () => {
    it('single-row result → table (not chartable)', () => {
        const plan = buildDeterministicSqlPresentationPlan(
            {
                title: 'Total Revenue',
                queryMode: 'aggregate',
                intentSummary: 'Single total.',
                query: {
                    select: ['total_revenue'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                queryMode: 'aggregate',
                rowCount: 1,
                columnCount: 1,
                columns: ['total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: [],
                timeColumns: [],
                distinctGroupCount: 1,
                totalValue: 500,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [{ total_revenue: 500 }],
            },
            [{ name: 'Revenue', type: 'numerical' }],
        );

        expect(plan.presentationMode).toBe('table');
        expect(plan.chartType).toBeUndefined();
    });

    it('all-null numeric column (0 rows after filtering) → table', () => {
        const plan = buildDeterministicSqlPresentationPlan(
            {
                title: 'Revenue by Region',
                queryMode: 'aggregate',
                intentSummary: 'Revenue grouped by region.',
                query: {
                    select: ['Region', 'total_revenue'],
                    groupBy: ['Region'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                queryMode: 'aggregate',
                rowCount: 0,
                columnCount: 2,
                columns: ['Region', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Region'],
                timeColumns: [],
                distinctGroupCount: 0,
                totalValue: 0,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [],
            },
            [
                { name: 'Region', type: 'categorical', uniqueValues: 0 },
                { name: 'Revenue', type: 'numerical' },
            ],
        );

        expect(plan.presentationMode).toBe('table');
        expect(plan.chartType).toBeUndefined();
    });

    it('two rows, one group → table (distinctGroupCount ≤ 1 blocks chart)', () => {
        const plan = buildDeterministicSqlPresentationPlan(
            {
                title: 'Revenue Total',
                queryMode: 'aggregate',
                intentSummary: 'Single group.',
                query: {
                    select: ['Department', 'total_revenue'],
                    groupBy: ['Department'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                queryMode: 'aggregate',
                rowCount: 2,
                columnCount: 2,
                columns: ['Department', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Department'],
                timeColumns: [],
                distinctGroupCount: 1,
                totalValue: 300,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [{ Department: 'Sales', total_revenue: 300 }],
            },
            [
                { name: 'Department', type: 'categorical', uniqueValues: 1 },
                { name: 'Revenue', type: 'numerical' },
            ],
        );

        expect(plan.presentationMode).toBe('table');
        expect(plan.chartType).toBeUndefined();
    });

    it('100+ groups → applies topN = 8 and hideOthers', () => {
        const plan = buildDeterministicSqlPresentationPlan(
            {
                title: 'Revenue by Product',
                queryMode: 'aggregate',
                intentSummary: 'Revenue by product.',
                query: {
                    select: ['Product', 'total_revenue'],
                    groupBy: ['Product'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                queryMode: 'aggregate',
                rowCount: 150,
                columnCount: 2,
                columns: ['Product', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Product'],
                timeColumns: [],
                distinctGroupCount: 150,
                totalValue: 100000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: true,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [],
            },
            [
                { name: 'Product', type: 'categorical', uniqueValues: 150 },
                { name: 'Revenue', type: 'numerical' },
            ],
            {
                valueGate: {
                    decision: 'pass',
                    reasonCodes: [],
                    detail: 'pass',
                    querySignature: 'q1',
                    semanticSignature: 's1',
                    semanticRisk: 'low',
                },
            },
        );

        expect(plan.presentationMode).toBe('table_then_chart');
        expect(plan.chartType).toBe('bar');
        expect(plan.defaultTopN).toBe(8);
        expect(plan.defaultHideOthers).toBe(true);
        // Analysis plan should also work
        const analysisPlan = buildAnalysisPlanFromPresentation(
            {
                title: 'Revenue by Product',
                queryMode: 'aggregate',
                intentSummary: 'Revenue by product.',
                query: {
                    select: ['Product', 'total_revenue'],
                    groupBy: ['Product'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            plan,
        );
        expect(analysisPlan).not.toBeNull();
        expect(analysisPlan?.defaultTopN).toBe(8);
        expect(analysisPlan?.defaultHideOthers).toBe(true);
    });

    it('safety floor also caps 100+ groups to topN when AI returns chart mode', () => {
        const result = applyPresentationSafetyFloor(
            {
                title: 'Revenue by SKU',
                description: 'desc',
                presentationMode: 'chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'SKU', valueColumn: 'total_revenue' },
            },
            {
                queryMode: 'aggregate',
                rowCount: 120,
                columnCount: 2,
                columns: ['SKU', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['SKU'],
                timeColumns: [],
                distinctGroupCount: 120,
                totalValue: 50000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: true,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [],
            },
            {
                title: 'Revenue by SKU',
                queryMode: 'aggregate',
                intentSummary: 'desc',
                query: {
                    select: ['SKU', 'total_revenue'],
                    groupBy: ['SKU'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            },
            {
                valueGate: {
                    decision: 'pass',
                    reasonCodes: [],
                    detail: 'pass',
                    querySignature: 'q1',
                    semanticSignature: 's1',
                    semanticRisk: 'low',
                },
            },
        );

        expect(result.presentationMode).toBe('table_then_chart');
        expect(result.defaultTopN).toBe(8);
        expect(result.defaultHideOthers).toBe(true);
    });
});

const makeAggregateSummary = (overrides?: Partial<SqlEvidenceQueryResultSummary>): SqlEvidenceQueryResultSummary => ({
    queryMode: 'aggregate',
    rowCount: 5,
    columnCount: 2,
    columns: ['Region', 'total_revenue'],
    numericColumns: ['total_revenue'],
    categoricalColumns: ['Region'],
    timeColumns: [],
    distinctGroupCount: 5,
    totalValue: 100,
    isTimeSeriesCandidate: false,
    isWideCategorySet: false,
    hasSecondaryMetric: false,
    hasNegativeValues: false,
    previewRows: [],
    ...overrides,
});

const makeEvidencePlan = (overrides?: Partial<SqlEvidenceQueryPlan>): SqlEvidenceQueryPlan => ({
    title: 'Revenue by Region',
    queryMode: 'aggregate',
    intentSummary: 'Inspect revenue by region.',
    query: {
        select: ['Region', 'total_revenue'],
        groupBy: ['Region'],
        aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
    },
    ...overrides,
});

const passGate: EvidenceValueGateResult = {
    decision: 'pass',
    reasonCodes: [],
    detail: 'pass',
    querySignature: 'q1',
    semanticSignature: 's1',
    semanticRisk: 'low',
};

describe('applyPresentationSafetyFloor', () => {
    it('downgrades to table when AI bindings reference columns not in executed output', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Region',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'OriginalRevenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary(),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.presentationMode).toBe('table');
        expect(result.chartType).toBeUndefined();
    });

    it('caps chart mode to table_then_chart when valueGate is table_only', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Region',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary(),
            makeEvidencePlan(),
            {
                valueGate: {
                    ...passGate,
                    decision: 'table_only',
                    reasonCodes: ['fragmented_groups'],
                },
            },
        );

        expect(result.presentationMode).toBe('table_then_chart');
        expect(result.chartType).toBe('bar');
    });

    it('forces table when reason codes include contamination or blocked signals', () => {
        const plan: SqlPresentationPlan = {
            title: 'Values by Code',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary(),
            makeEvidencePlan(),
            {
                valueGate: {
                    ...passGate,
                    decision: 'table_only',
                    reasonCodes: ['helper_dimension'],
                },
            },
        );

        expect(result.presentationMode).toBe('table');
        expect(result.chartType).toBeUndefined();
    });

    it('forces table when reason codes include steering-first caution signals', () => {
        const plan: SqlPresentationPlan = {
            title: 'Values by Description',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Description', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary(),
            makeEvidencePlan(),
            {
                valueGate: {
                    ...passGate,
                    decision: 'table_only',
                    reasonCodes: ['missing_detail_row_filter', 'low_signal_confidence'],
                },
            },
        );

        expect(result.presentationMode).toBe('table');
        expect(result.chartType).toBeUndefined();
    });

    it('downgrades combo to bar when fewer than two aggregate aliases exist', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue Analysis',
            description: 'desc',
            presentationMode: 'table_then_chart',
            chartType: 'combo',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue', secondaryValueColumn: 'total_cost' },
        };
        const summary = makeAggregateSummary({
            columns: ['Region', 'total_revenue', 'total_cost'],
            numericColumns: ['total_revenue', 'total_cost'],
            columnCount: 3,
            hasSecondaryMetric: true,
        });
        // Only one aggregate alias — combo not valid
        const evidencePlan = makeEvidencePlan({
            query: {
                select: ['Region', 'total_revenue', 'total_cost'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            },
        });
        const result = applyPresentationSafetyFloor(plan, summary, evidencePlan, { valueGate: passGate });

        expect(result.chartType).toBe('bar');
    });

    it('downgrades line to bar when groupBy is not time or ordinal', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Region',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({ previewRows: [{ Region: 'East', total_revenue: 10 }, { Region: 'West', total_revenue: 20 }] }),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('bar');
    });

    it('downgrades line to bar when time column has non-monotonic preview', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue Trend',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Month', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Month', 'total_revenue'],
                categoricalColumns: [],
                timeColumns: ['Month'],
                previewRows: [
                    { Month: '2024-03', total_revenue: 30 },
                    { Month: '2024-01', total_revenue: 10 },
                    { Month: '2024-02', total_revenue: 20 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('bar');
    });

    it('keeps line when ordinal month column has monotonic preview', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Month',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Month', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Month', 'total_revenue'],
                categoricalColumns: ['Month'],
                previewRows: [
                    { Month: 'Jan', total_revenue: 10 },
                    { Month: 'Feb', total_revenue: 20 },
                    { Month: 'Mar', total_revenue: 30 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('line');
    });

    it('keeps line for recognized ordinal month column even with non-monotonic preview', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Month',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Month', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Month', 'total_revenue'],
                categoricalColumns: ['Month'],
                previewRows: [
                    { Month: 'Mar', total_revenue: 30 },
                    { Month: 'Jan', total_revenue: 10 },
                    { Month: 'Feb', total_revenue: 20 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        // Recognized ordinal vocabulary → line allowed; card executor sorts before display.
        expect(result.chartType).toBe('line');
    });

    it('keeps line for "MONTH YEAR" period values from unpivot even in alphabetical order', () => {
        const plan: SqlPresentationPlan = {
            title: 'Sales by Period',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Period', valueColumn: 'total_sales' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Period', 'total_sales'],
                categoricalColumns: ['Period'],
                previewRows: [
                    { Period: 'APR 2010', total_sales: 40 },
                    { Period: 'AUG 2010', total_sales: 80 },
                    { Period: 'DEC 2010', total_sales: 120 },
                    { Period: 'FEB 2010', total_sales: 20 },
                    { Period: 'JAN 2010', total_sales: 10 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Period', 'total_sales'],
                    groupBy: ['Period'],
                    aggregates: [{ function: 'sum', column: 'Value', as: 'total_sales' }],
                },
            }),
            { valueGate: passGate },
        );

        // "MONTH YEAR" period vocabulary recognized → line allowed.
        expect(result.chartType).toBe('line');
    });

    it('strips chartType and bindings when table mode is the final result', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Region',
            description: 'desc',
            presentationMode: 'table',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary(),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.presentationMode).toBe('table');
        expect(result.chartType).toBeUndefined();
        expect(result.bindings).toBeUndefined();
    });

    it('caps wide-category evidence to table_then_chart with topN and hideOthers', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Project',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({ rowCount: 20, distinctGroupCount: 20, isWideCategorySet: true }),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.presentationMode).toBe('table_then_chart');
        expect(result.defaultTopN).toBe(8);
        expect(result.defaultHideOthers).toBe(true);
    });

    it('keeps pie chart when group count is small (≤ 8)', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue Share',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'pie',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({ rowCount: 4, distinctGroupCount: 4 }),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('pie');
    });

    it('downgrades pie chart to bar when group count exceeds threshold', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue Share',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'pie',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({ rowCount: 12, distinctGroupCount: 12 }),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('bar');
    });

    it('keeps line when quarter ordinal column has monotonic preview', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Quarter',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Quarter', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Quarter', 'total_revenue'],
                categoricalColumns: ['Quarter'],
                previewRows: [
                    { Quarter: 'Q1', total_revenue: 10 },
                    { Quarter: 'Q2', total_revenue: 20 },
                    { Quarter: 'Q3', total_revenue: 30 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Quarter', 'total_revenue'],
                    groupBy: ['Quarter'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('line');
    });

    it('keeps line when weekday ordinal column has monotonic preview', () => {
        const plan: SqlPresentationPlan = {
            title: 'Orders by Day',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Weekday', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Weekday', 'total_revenue'],
                categoricalColumns: ['Weekday'],
                previewRows: [
                    { Weekday: 'Mon', total_revenue: 10 },
                    { Weekday: 'Tue', total_revenue: 20 },
                    { Weekday: 'Wed', total_revenue: 30 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Weekday', 'total_revenue'],
                    groupBy: ['Weekday'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('line');
    });

    it('downgrades line to bar when time preview has unparseable values', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue Trend',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Period', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Period', 'total_revenue'],
                categoricalColumns: [],
                timeColumns: ['Period'],
                previewRows: [
                    { Period: 'not-a-date', total_revenue: 10 },
                    { Period: 'also-bad', total_revenue: 20 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Period', 'total_revenue'],
                    groupBy: ['Period'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('bar');
    });

    it('downgrades line to bar when preview has duplicate x buckets', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Month',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'line',
            bindings: { groupByColumn: 'Month', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Month', 'total_revenue'],
                categoricalColumns: ['Month'],
                previewRows: [
                    { Month: 'Jan', total_revenue: 10 },
                    { Month: 'Feb', total_revenue: 20 },
                    { Month: 'Jan', total_revenue: 15 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Month', 'total_revenue'],
                    groupBy: ['Month'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.chartType).toBe('bar');
    });

    it('downgrades bar to table when preview has duplicate normalized group buckets', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue by Region',
            description: 'desc',
            presentationMode: 'chart',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                previewRows: [
                    { Region: 'East', total_revenue: 100 },
                    { Region: 'West', total_revenue: 200 },
                    { Region: 'east', total_revenue: 50 },
                ],
            }),
            makeEvidencePlan(),
            { valueGate: passGate },
        );

        expect(result.presentationMode).toBe('table');
        expect(result.chartType).toBeUndefined();
    });

    it('downgrades combo to table when preview has duplicate group buckets', () => {
        const plan: SqlPresentationPlan = {
            title: 'Revenue vs Cost',
            description: 'desc',
            presentationMode: 'table_then_chart',
            chartType: 'combo',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue', secondaryValueColumn: 'total_cost' },
        };
        const result = applyPresentationSafetyFloor(
            plan,
            makeAggregateSummary({
                columns: ['Region', 'total_revenue', 'total_cost'],
                numericColumns: ['total_revenue', 'total_cost'],
                columnCount: 3,
                hasSecondaryMetric: true,
                hasNegativeValues: false,
                previewRows: [
                    { Region: 'East', total_revenue: 100, total_cost: 50 },
                    { Region: 'East', total_revenue: 120, total_cost: 60 },
                ],
            }),
            makeEvidencePlan({
                query: {
                    select: ['Region', 'total_revenue', 'total_cost'],
                    groupBy: ['Region'],
                    aggregates: [
                        { function: 'sum', column: 'Revenue', as: 'total_revenue' },
                        { function: 'sum', column: 'Cost', as: 'total_cost' },
                    ],
                },
            }),
            { valueGate: passGate },
        );

        expect(result.presentationMode).toBe('table');
        expect(result.chartType).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// callAiPresentationPlan: AI path + safety floor integration
// ---------------------------------------------------------------------------

/** Helper: make streamTextMock return a stream whose output/text resolves to given values. */
const mockStreamOutput = (output: unknown, text = '') => {
    streamTextMock.mockReturnValueOnce({
        fullStream: (async function* () {})(),
        text: Promise.resolve(text),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(output),
    });
};

/** Helper: make streamTextMock throw synchronously. */
const mockStreamError = (error: Error) => {
    streamTextMock.mockImplementationOnce(() => { throw error; });
};

describe('callAiPresentationPlan', () => {
    const mockModel = { provider: 'openai', modelId: 'gpt-5.2' };
    const mockSettings = {
        provider: 'openai',
        geminiApiKey: '',
        openAIApiKey: 'test-key',
        simpleModel: 'gpt-5-mini',
        complexModel: 'gpt-5.2',
        language: 'English',
        reportTemplate: 'executive_brief',
        autoConfirmGoal: true,
        runtimeAccessControl: { allowedTools: [] },
    } as unknown as Settings;

    const makeSummary = (overrides?: Partial<SqlEvidenceQueryResultSummary>): SqlEvidenceQueryResultSummary => ({
        queryMode: 'aggregate',
        preferredResultShape: 'ranked_aggregate',
        rowCount: 5,
        columnCount: 2,
        columns: ['Region', 'total_revenue'],
        numericColumns: ['total_revenue'],
        categoricalColumns: ['Region'],
        timeColumns: [],
        distinctGroupCount: 5,
        totalValue: 100,
        isTimeSeriesCandidate: false,
        isWideCategorySet: false,
        hasSecondaryMetric: false,
        hasNegativeValues: false,
        previewRows: [],
        ...overrides,
    });

    const makePlan = (): SqlEvidenceQueryPlan => ({
        title: 'Revenue by Region',
        queryMode: 'aggregate',
        intentSummary: 'Inspect revenue by region.',
        query: {
            select: ['Region', 'total_revenue'],
            groupBy: ['Region'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
        },
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        isProviderConfiguredMock.mockReturnValue(true);
        createProviderModelMock.mockReturnValue({ model: mockModel });
    });

    it('returns AI plan when provider configured and AI responds with valid structure', async () => {
        mockStreamOutput({
            presentationMode: 'table_then_chart',
            title: 'Revenue by Region',
            description: 'Revenue analysis by region',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        });

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings);

        expect(result).not.toBeNull();
        expect(result!.presentationMode).toBe('table_then_chart');
        // AI returned 'bar' but recommendChartType upgrades to 'pie' for 5 groups
        expect(result!.chartType).toBe('pie');
        expect(result!.bindings?.groupByColumn).toBe('Region');
        expect(result!.bindings?.valueColumn).toBe('total_revenue');
    });

    it('returns null when provider is not configured', async () => {
        isProviderConfiguredMock.mockReturnValue(false);

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings);

        expect(result).toBeNull();
        expect(streamTextMock).not.toHaveBeenCalled();
    });

    it('returns null when AI response is missing title', async () => {
        mockStreamOutput({ presentationMode: 'table_then_chart' }); // no title

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings);

        expect(result).toBeNull();
    });

    it('returns null when streamText throws', async () => {
        mockStreamError(new Error('Network error'));

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings);

        expect(result).toBeNull();
    });

    it('logs a timeout-specific info message when AI presentation planning aborts on local timeout', async () => {
        // Source uses streamGenerateText → streamText + raceWithActivityTimeout.
        // When the activity timeout fires, ProviderTimeoutError is thrown.
        const { ProviderTimeoutError } = await import('../services/ai/providerActivityGuards');
        streamTextMock.mockImplementationOnce(() => { throw new ProviderTimeoutError(30_000); });
        const telemetryTarget = { logTelemetryEvent: vi.fn() };

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings, {
            telemetryTarget,
        });

        expect(result).toBeNull();
        expect(console.info).toHaveBeenCalledWith(
            '[SqlPresentationPlanner] AI presentation planning timed out after 30000ms, using deterministic fallback.',
        );
        expect(console.warn).not.toHaveBeenCalled();
        expect(telemetryTarget.logTelemetryEvent).toHaveBeenCalledWith(expect.objectContaining({
            responseType: 'planner_stability_signal',
            meta: expect.objectContaining({
                reasonCode: 'presentation_timeout_fallback',
            }),
        }));
    });

    it('safety floor: invalid binding column is downgraded to table', async () => {
        mockStreamOutput({
            presentationMode: 'chart',
            title: 'Revenue by Region',
            description: 'desc',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'NONEXISTENT_COLUMN' },
        });

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings);

        // NONEXISTENT_COLUMN is not in executed output columns — safety floor forces table
        expect(result!.presentationMode).toBe('table');
        expect(result!.chartType).toBeUndefined();
        expect(result!.bindings).toBeUndefined();
    });

    it('safety floor: pie chart is downgraded to bar when many groups', async () => {
        mockStreamOutput({
            presentationMode: 'chart',
            title: 'Revenue by Region',
            description: 'desc',
            chartType: 'pie',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        });

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary({ distinctGroupCount: 12, rowCount: 12 }), [], mockSettings);

        expect(result).not.toBeNull();
        expect(result!.chartType).toBe('bar');
    });

    it('safety floor: value gate reject forces hidden presentation mode', async () => {
        mockStreamOutput({
            presentationMode: 'table_then_chart',
            title: 'Revenue by Region',
            description: 'desc',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        });

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings, {
            valueGate: {
                decision: 'reject',
                reasonCodes: [],
                detail: 'low value',
                querySignature: 'q1',
                semanticSignature: 's1',
                semanticRisk: 'high',
            },
        });

        expect(result!.presentationMode).toBe('hidden');
        expect(result!.chartType).toBeUndefined();
    });

    it('safety floor: table_only gate caps AI chart mode to table_then_chart', async () => {
        mockStreamOutput({
            presentationMode: 'chart',
            title: 'Revenue by Region',
            description: 'desc',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        });

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings, {
            valueGate: {
                decision: 'table_only',
                reasonCodes: ['fragmented_groups'],
                detail: 'fragmented',
                querySignature: 'q1',
                semanticSignature: 's1',
                semanticRisk: 'medium',
            },
        });

        expect(result!.presentationMode).toBe('table_then_chart');
    });

    it('emits table-forced stability telemetry when the safety floor downgrades AI chart output to a table', async () => {
        mockStreamOutput({
            presentationMode: 'chart',
            title: 'Revenue by Region',
            description: 'desc',
            chartType: 'bar',
            bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
        });
        const telemetryTarget = { logTelemetryEvent: vi.fn() };

        const result = await callAiPresentationPlan('Revenue by Region', makePlan(), makeSummary(), [], mockSettings, {
            telemetryTarget,
            valueGate: {
                decision: 'pass',
                reasonCodes: ['unsafe_business_narrative'],
                detail: 'unsafe',
                querySignature: 'q1',
                semanticSignature: 's1',
                semanticRisk: 'medium',
            },
        });

        expect(result?.presentationMode).toBe('table');
        expect(telemetryTarget.logTelemetryEvent).toHaveBeenCalledWith(expect.objectContaining({
            responseType: 'planner_stability_signal',
            meta: expect.objectContaining({
                reasonCode: 'table_forced_by_value_gate',
            }),
        }));
    });

    describe('runtimeDirectives wiring', () => {
        const makeAggregatePlan = (groupBy = 'Month'): SqlEvidenceQueryPlan => ({
            title: 'Revenue by Month',
            queryMode: 'aggregate',
            intentSummary: 'Revenue trend over time.',
            preferredResultShape: 'time_series',
            query: {
                select: [groupBy, 'total_revenue'],
                groupBy: [groupBy],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            },
        });

        const makeBarSummary = (overrides?: Partial<SqlEvidenceQueryResultSummary>): SqlEvidenceQueryResultSummary => ({
            queryMode: 'aggregate',
            preferredResultShape: 'ranked_aggregate',
            rowCount: 6,
            columnCount: 2,
            columns: ['Region', 'total_revenue'],
            numericColumns: ['total_revenue'],
            categoricalColumns: ['Region'],
            timeColumns: [],
            distinctGroupCount: 6,
            totalValue: 5000,
            isTimeSeriesCandidate: false,
            isWideCategorySet: false,
            hasSecondaryMetric: false,
            hasNegativeValues: false,
            previewRows: [
                { Region: 'North', total_revenue: 2000 },
                { Region: 'South', total_revenue: 1500 },
                { Region: 'East', total_revenue: 900 },
                { Region: 'West', total_revenue: 400 },
                { Region: 'Central', total_revenue: 150 },
                { Region: 'Other', total_revenue: 50 },
            ],
            ...overrides,
        });

        const passGate: EvidenceValueGateResult = {
            decision: 'pass',
            reasonCodes: [],
            detail: null,
            querySignature: 'q',
            semanticSignature: 's',
            semanticRisk: 'low',
        };

        it('promotedChartType=line causes bar-ready evidence to use line chart', () => {
            const evidencePlan = makeAggregatePlan('Month');
            const summary: SqlEvidenceQueryResultSummary = {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 10,
                columnCount: 2,
                columns: ['Month', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Month'],
                timeColumns: [],
                distinctGroupCount: 10,
                totalValue: 5000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [
                    { Month: 'Jan', total_revenue: 1000 },
                    { Month: 'Feb', total_revenue: 1200 },
                    { Month: 'Mar', total_revenue: 900 },
                    { Month: 'Apr', total_revenue: 1100 },
                    { Month: 'May', total_revenue: 1300 },
                    { Month: 'Jun', total_revenue: 1400 },
                ],
            };

            const plan = buildDeterministicSqlPresentationPlan(evidencePlan, summary, [], {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: 'line',
                    blockedChartTypes: [],
                    suggestedHideOthers: false,
                },
            });

            // With promotedChartType=line the bar-ready branch should choose line.
            expect(plan.chartType).toBe('line');
        });

        it('promotedChartType=line is overridden when line is also in blockedChartTypes', () => {
            const evidencePlan = makeAggregatePlan('Month');
            const summary: SqlEvidenceQueryResultSummary = {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 6,
                columnCount: 2,
                columns: ['Month', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Month'],
                timeColumns: [],
                distinctGroupCount: 6,
                totalValue: 5000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [
                    { Month: 'Jan', total_revenue: 1000 },
                    { Month: 'Feb', total_revenue: 800 },
                    { Month: 'Mar', total_revenue: 900 },
                    { Month: 'Apr', total_revenue: 1100 },
                    { Month: 'May', total_revenue: 300 },
                    { Month: 'Jun', total_revenue: 1400 },
                ],
            };

            const plan = buildDeterministicSqlPresentationPlan(evidencePlan, summary, [], {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    // Both promoted AND blocked — blocked wins.
                    promotedChartType: 'line',
                    blockedChartTypes: ['line'],
                    suggestedHideOthers: false,
                },
            });

            // line is blocked so it must not be chosen.
            expect(plan.chartType).not.toBe('line');
        });

        it('suggestedHideOthers=true forces defaultHideOthers even for small rowCount', () => {
            const evidencePlan: SqlEvidenceQueryPlan = {
                title: 'Revenue by Product',
                queryMode: 'aggregate',
                intentSummary: 'Pareto check.',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['Product', 'total_revenue'],
                    groupBy: ['Product'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            };
            const summary: SqlEvidenceQueryResultSummary = {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                // 10 groups — bypasses pieReady, enters barReady where hideOthers is wired
                rowCount: 10,
                columnCount: 2,
                columns: ['Product', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Product'],
                timeColumns: [],
                distinctGroupCount: 10,
                totalValue: 10000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [
                    { Product: 'A', total_revenue: 8500 },
                    { Product: 'B', total_revenue: 700 },
                    { Product: 'C', total_revenue: 400 },
                    { Product: 'D', total_revenue: 250 },
                    { Product: 'E', total_revenue: 150 },
                ],
            };

            const plan = buildDeterministicSqlPresentationPlan(evidencePlan, summary, [], {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    suggestedHideOthers: true, // Pareto signal
                },
            });

            // hideOthers must be true — suggestedHideOthers overrides default
            expect(plan.defaultHideOthers).toBe(true);
        });

        it('applyPresentationSafetyFloor downgrades line→bar when line is in blockedChartTypes', () => {
            const evidencePlan = makeAggregatePlan('Region');
            const summary = makeBarSummary({
                columns: ['Region', 'total_revenue'],
                categoricalColumns: ['Region'],
            });
            const aiPlan: SqlPresentationPlan = {
                title: 'Revenue by Region',
                description: 'test',
                presentationMode: 'table_then_chart',
                chartType: 'line',
                bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
            };

            const result = applyPresentationSafetyFloor(aiPlan, summary, evidencePlan, {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: null,
                    blockedChartTypes: ['line'],
                    suggestedHideOthers: false,
                },
            });

            // line blocked → downgrade to bar
            expect(result.chartType).toBe('bar');
        });

        it('applyPresentationSafetyFloor downgrades bar→table when bar is in blockedChartTypes', () => {
            const evidencePlan = makeAggregatePlan('Region');
            const summary = makeBarSummary({
                columns: ['Region', 'total_revenue'],
                categoricalColumns: ['Region'],
            });
            const aiPlan: SqlPresentationPlan = {
                title: 'Revenue by Region',
                description: 'test',
                presentationMode: 'table_then_chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
            };

            const result = applyPresentationSafetyFloor(aiPlan, summary, evidencePlan, {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: null,
                    blockedChartTypes: ['bar'],
                    suggestedHideOthers: false,
                },
            });

            expect(result.presentationMode).toBe('table');
            expect(result.chartType).toBeUndefined();
        });

        it('applyPresentationSafetyFloor applies suggestedHideOthers for AI plan path', () => {
            const evidencePlan = makeAggregatePlan('Product');
            const summary: SqlEvidenceQueryResultSummary = {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 5,
                columnCount: 2,
                columns: ['Product', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Product'],
                timeColumns: [],
                distinctGroupCount: 5,
                totalValue: 10000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [
                    { Product: 'A', total_revenue: 8500 },
                    { Product: 'B', total_revenue: 700 },
                    { Product: 'C', total_revenue: 400 },
                    { Product: 'D', total_revenue: 250 },
                    { Product: 'E', total_revenue: 150 },
                ],
            };
            const aiPlan: SqlPresentationPlan = {
                title: 'Revenue by Product',
                description: 'test',
                presentationMode: 'table_then_chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'Product', valueColumn: 'total_revenue' },
                defaultHideOthers: false,
            };

            const result = applyPresentationSafetyFloor(aiPlan, summary, evidencePlan, {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    suggestedHideOthers: true,
                },
            });

            expect(result.defaultHideOthers).toBe(true);
        });

        it('applyPresentationSafetyFloor forces pivot when two-column groupBy pair is pivot-only (Region × Product = 250)', () => {
            // Evidence query groups by two dimensions forming a high-cardinality pair.
            const evidencePlan: SqlEvidenceQueryPlan = {
                title: 'Revenue by Region and Product',
                queryMode: 'aggregate',
                intentSummary: 'Cross-dimensional analysis.',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['Region', 'Product', 'total_revenue'],
                    groupBy: ['Region', 'Product'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            };
            const summary: SqlEvidenceQueryResultSummary = {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 12,
                columnCount: 3,
                columns: ['Region', 'Product', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Region', 'Product'],
                timeColumns: [],
                distinctGroupCount: 12,
                totalValue: 50000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [
                    { Region: 'North', Product: 'Widget', total_revenue: 5000 },
                    { Region: 'South', Product: 'Widget', total_revenue: 4000 },
                ],
            };
            const aiPlan: SqlPresentationPlan = {
                title: 'Revenue by Region and Product',
                description: 'test',
                presentationMode: 'table_then_chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
            };

            const result = applyPresentationSafetyFloor(aiPlan, summary, evidencePlan, {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    suggestedHideOthers: false,
                    pivotOnlyCombinations: [
                        { dimA: 'Region', dimB: 'Product', product: 250 },
                    ],
                },
            });

            // Pivot-only pair → must surface a pivot tool request instead of a fake flat pivot artifact
            expect(result.pivotPresentation).toBe(true);
            expect(result.pivotDecision).toBe('prefer_pivot');
            expect(result.pivotRequest).toMatchObject({
                rows: ['Region'],
                columns: ['Product'],
                metric: 'total_revenue',
                aggregate: 'sum',
            });
            expect(result.presentationMode).toBe('table_then_chart');
        });

        it('applyPresentationSafetyFloor does NOT flag pivot for single-column groupBy', () => {
            // Single groupBy — the pivot-only combination doesn't apply
            const evidencePlan: SqlEvidenceQueryPlan = {
                title: 'Revenue by Region',
                queryMode: 'aggregate',
                intentSummary: 'Revenue by region only.',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['Region', 'total_revenue'],
                    groupBy: ['Region'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            };
            const summary: SqlEvidenceQueryResultSummary = {
                queryMode: 'aggregate',
                preferredResultShape: 'ranked_aggregate',
                rowCount: 5,
                columnCount: 2,
                columns: ['Region', 'total_revenue'],
                numericColumns: ['total_revenue'],
                categoricalColumns: ['Region'],
                timeColumns: [],
                distinctGroupCount: 5,
                totalValue: 50000,
                isTimeSeriesCandidate: false,
                isWideCategorySet: false,
                hasSecondaryMetric: false,
                hasNegativeValues: false,
                previewRows: [
                    { Region: 'North', total_revenue: 5000 },
                    { Region: 'South', total_revenue: 4000 },
                ],
            };
            const aiPlan: SqlPresentationPlan = {
                title: 'Revenue by Region',
                description: 'test',
                presentationMode: 'table_then_chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
            };

            const result = applyPresentationSafetyFloor(aiPlan, summary, evidencePlan, {
                valueGate: passGate,
                harnessContext: {
                    preferGroupBy: [],
                    blockGroupBy: [],
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    parentDescriptions: [],
                    duplicateDescriptions: [],
                    detailRowColumn: null,
                    detailRowValue: null,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    suggestedHideOthers: false,
                    // Region×Product is pivot-only but this query only uses Region alone
                    pivotOnlyCombinations: [
                        { dimA: 'Region', dimB: 'Product', product: 250 },
                    ],
                },
            });

            // Single-column groupBy should NOT trigger pivot mode
            expect(result.pivotPresentation).toBeFalsy();
        });

        it('buildAnalysisPlanFromPresentation returns null when planner prefers a pivot tool call', () => {
            const evidencePlan: SqlEvidenceQueryPlan = {
                title: 'Revenue by Region and Product',
                queryMode: 'aggregate',
                intentSummary: 'Cross-dimensional.',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['Region', 'Product', 'total_revenue'],
                    groupBy: ['Region', 'Product'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
                },
            };
            const presentationPlan: SqlPresentationPlan = {
                title: 'Revenue by Region and Product',
                description: 'test',
                presentationMode: 'table_then_chart',
                chartType: 'bar',
                bindings: { groupByColumn: 'Region', valueColumn: 'total_revenue' },
                pivotPresentation: true,
                pivotDecision: 'prefer_pivot',
                pivotRequest: {
                    rows: ['Region'],
                    columns: ['Product'],
                    metric: 'total_revenue',
                    aggregate: 'sum',
                    title: 'Revenue by Region and Product',
                    description: 'test',
                },
            };

            const result = buildAnalysisPlanFromPresentation(evidencePlan, presentationPlan);

            expect(result).toBeNull();
        });
    });
});
