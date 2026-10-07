import { describe, expect, it } from 'vitest';
import { buildExecutiveKpis } from '../services/dashboard/executiveKpis';
import type { AnalysisCardData, ColumnProfile, CsvData, CsvRow } from '../types';

const asEnglishText = (text: string) => ({ language: 'English' as const, text });

const buildCard = (overrides: Partial<AnalysisCardData> = {}): AnalysisCardData => ({
    id: 'card-project-spend',
    plan: {
        title: 'Spend by Project',
        description: 'Compare spend by project.',
        chartType: 'bar',
        aggregation: 'sum',
        groupByColumn: 'Project',
        valueColumn: 'Spend',
    },
    aggregatedData: [
        { Project: '36 TUAS ROAD', Spend: 1200 },
        { Project: 'Depot Upgrade', Spend: 800 },
        { Project: 'HQ Refresh', Spend: 400 },
        { Project: 'Mobile Pilot', Spend: 200 },
    ],
    summary: asEnglishText('Summary'),
    displayChartType: 'bar',
    isDataVisible: false,
    topN: null,
    hideOthers: false,
    hiddenLabels: [],
    provenance: overrides.provenance ?? {
        schemaVersion: 1,
        datasetId: 'dataset-projects',
        datasetVersion: 'version-current',
        evidenceStatus: 'verified',
        evidenceReasons: [],
        method: {
            operation: 'bar',
            groupByColumns: ['Project'],
            aggregations: [{ function: 'sum', column: 'Spend', alias: 'Spend' }],
            sourceColumns: ['Project', 'Spend'],
            filterCount: 0,
            pivotRows: [],
            pivotColumns: [],
        },
        queryEvidence: null,
        queryEvidenceRequired: false,
        evidenceRefs: [],
        createdAt: '2026-07-25T00:00:00.000Z',
    },
    autoAnalysisEvaluation: overrides.autoAnalysisEvaluation ?? {
        verdict: 'trusted',
        reasonCodes: [],
        detail: 'trusted',
        evaluatedAt: new Date().toISOString(),
        source: 'auto_analysis_evaluator_v1',
    },
    ...overrides,
});

const buildCsvData = (rows: CsvRow[]): CsvData => ({
    fileName: 'projects.csv',
    data: rows,
});

const buildColumnProfiles = (overrides: ColumnProfile[] = []): ColumnProfile[] => ([
    { name: 'Project', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
    { name: 'Spend', type: 'numerical', missingPercentage: 0, valueRange: [200, 1200] },
    ...overrides,
]);

describe('buildExecutiveKpis', () => {
    it('does not create a total or concentration share from Town averages', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                plan: {
                    title: 'Average Price by Town',
                    description: 'Compare prices.',
                    chartType: 'bar',
                    aggregation: 'avg',
                    groupByColumn: 'Project',
                    valueColumn: 'Spend',
                },
                topN: 2,
                hideOthers: true,
            })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 1200 },
                { Project: 'Depot Upgrade', Spend: 800 },
            ]),
        });

        expect(kpis.map(kpi => kpi.id)).toEqual(['top-group', 'group-count']);
        expect(kpis[0]).toMatchObject({ value: '1,200', scope: { kind: 'top_n', topN: 2 } });
        expect(kpis[0].detail).not.toContain('%');
        expect(kpis[1].value).toBe('2');
    });

    it('returns no executive KPIs when there are no trusted cards', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                autoAnalysisEvaluation: {
                    verdict: 'caveated',
                    reasonCodes: ['aggregation_quality_warning'],
                    detail: 'aggregation_quality_warning',
                    evaluatedAt: new Date().toISOString(),
                    source: 'auto_analysis_evaluator_v1',
                },
            })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 1200 },
                { Project: 'Depot Upgrade', Spend: 800 },
            ]),
        });

        expect(kpis).toEqual([]);
    });

    it('builds four actionable KPIs and prioritizes inactive groups over concentration insight', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard()],
            columnProfiles: buildColumnProfiles([{ name: 'Status', type: 'categorical', uniqueValues: 2, missingPercentage: 0 }]),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 1200, Status: 'Active' },
                { Project: 'Depot Upgrade', Spend: 800, Status: 'Inactive' },
                { Project: 'HQ Refresh', Spend: 400, Status: 'Archived' },
                { Project: 'Mobile Pilot', Spend: 200, Status: 'Active' },
            ]),
        });

        expect(kpis).toHaveLength(4);
        expect(kpis[0]).toMatchObject({
            label: 'Total Spend',
            value: '2,600',
            hierarchy: 'primary',
            sourceCardId: 'card-project-spend',
            action: { type: 'show-card' },
            scope: {
                kind: 'dataset',
                label: 'Full dataset scope',
            },
            delta: {
                kind: 'distribution',
                label: 'held by top Project',
                value: '46%',
            },
        });
        expect(kpis[1]).toMatchObject({
            label: 'Top Project',
            value: '1,200',
            hierarchy: 'secondary',
        });
        expect(kpis[1].detail).toContain('36 TUAS ROAD');
        expect(kpis[2]).toMatchObject({
            label: 'Projects',
            value: '4',
            hierarchy: 'secondary',
        });
        expect(kpis[3]).toMatchObject({
            label: 'Inactive Projects',
            value: '2',
            hierarchy: 'insight',
        });
        expect(kpis.find(kpi => kpi.id === 'top-share')).toBeUndefined();
    });

    it('labels totals from a Top-N card as Top-N scope instead of a dataset total', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                plan: {
                    title: 'Top Blocks by Total Resale Price',
                    description: 'Compare the highest-value blocks.',
                    chartType: 'bar',
                    aggregation: 'sum',
                    groupByColumn: 'Block',
                    valueColumn: 'Total Resale Price',
                    defaultTopN: 10,
                },
                aggregatedData: [
                    { Block: '101A', 'Total Resale Price': 17_100_000 },
                    { Block: '118A', 'Total Resale Price': 15_900_000 },
                    { Block: '103A', 'Total Resale Price': 12_400_000 },
                ],
                topN: 2,
                hideOthers: true,
            })],
            columnProfiles: [
                { name: 'Block', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Total Resale Price', type: 'numerical', missingPercentage: 0 },
            ],
            csvData: buildCsvData([
                { Block: '101A', 'Total Resale Price': 17_100_000 },
                { Block: '118A', 'Total Resale Price': 15_900_000 },
            ]),
        });

        expect(kpis[0]).toMatchObject({
            label: 'Top 2 Blocks · Total Resale Price',
            value: '33M',
            detail: 'Across 2 Blocks.',
            scope: {
                kind: 'top_n',
                topN: 2,
                label: 'Top 2 Blocks',
            },
        });
        expect(kpis[1].detail).toContain('52%');
        expect(kpis[2]).toMatchObject({ value: '2' });
    });

    it('uses the full total when Top-N folds the remainder into a visible Others group', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                topN: 2,
                hideOthers: false,
            })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 1200 },
                { Project: 'Depot Upgrade', Spend: 800 },
                { Project: 'HQ Refresh', Spend: 400 },
                { Project: 'Mobile Pilot', Spend: 200 },
            ]),
        });

        expect(kpis[0]).toMatchObject({
            label: 'Total Spend',
            value: '2,600',
            scope: { kind: 'dataset', label: 'Full dataset scope' },
        });
        expect(kpis[2]).toMatchObject({ value: '4' });
    });

    it('keeps structural row filters out of user-facing KPI scope copy', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                plan: {
                    title: 'Spend by Project',
                    description: 'Compare spend by project.',
                    chartType: 'bar',
                    aggregation: 'sum',
                    groupByColumn: 'Project',
                    valueColumn: 'Spend',
                    preFilter: [{ column: 'RowRole', operator: 'eq', value: 'detail' }],
                },
            })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 1200, RowRole: 'detail' },
                { Project: 'Depot Upgrade', Spend: 800, RowRole: 'detail' },
            ]),
        });

        expect(kpis[0].scope).toMatchObject({ kind: 'dataset', label: 'Full dataset scope' });
        expect(kpis[0].scope.filterSummary).toBeUndefined();
    });

    it('keeps hidden legend labels out of visible-series KPI values', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({ hiddenLabels: ['Depot Upgrade'] })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 1200 },
                { Project: 'Depot Upgrade', Spend: 800 },
                { Project: 'HQ Refresh', Spend: 400 },
                { Project: 'Mobile Pilot', Spend: 200 },
            ]),
        });

        expect(kpis[0]).toMatchObject({
            value: '1,800',
            scope: { kind: 'visible_series', label: 'Visible series' },
        });
        expect(kpis[2]).toMatchObject({ value: '3' });
    });

    it('uses month-over-month delta when at least three months are available', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                aggregatedData: [
                    { Project: '36 TUAS ROAD', Spend: 250 },
                    { Project: 'Depot Upgrade', Spend: 125 },
                ],
            })],
            columnProfiles: buildColumnProfiles([{ name: 'Date', type: 'date', missingPercentage: 0 }]),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 100, Date: '2026-01-10' },
                { Project: 'Depot Upgrade', Spend: 50, Date: '2026-01-18' },
                { Project: '36 TUAS ROAD', Spend: 200, Date: '2026-02-10' },
                { Project: 'Depot Upgrade', Spend: 100, Date: '2026-02-18' },
                { Project: '36 TUAS ROAD', Spend: 250, Date: '2026-03-10' },
                { Project: 'Depot Upgrade', Spend: 125, Date: '2026-03-18' },
            ]),
        });

        expect(kpis[0].delta).toMatchObject({
            kind: 'period',
            label: 'vs last month',
            value: '+25%',
            direction: 'up',
        });
    });

    it('uses day-over-day delta when there are two distinct days but not enough months', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                aggregatedData: [
                    { Project: '36 TUAS ROAD', Spend: 270 },
                    { Project: 'Depot Upgrade', Spend: 90 },
                ],
            })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 100, Snapshot: '2026-03-01' },
                { Project: 'Depot Upgrade', Spend: 50, Snapshot: '2026-03-01' },
                { Project: '36 TUAS ROAD', Spend: 180, Snapshot: '2026-03-02' },
                { Project: 'Depot Upgrade', Spend: 60, Snapshot: '2026-03-02' },
            ]),
        });

        expect(kpis[0].delta).toMatchObject({
            kind: 'period',
            label: 'vs previous day',
            value: '+60%',
            direction: 'up',
        });
    });

    it('falls back to distribution when the previous period is zero', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                aggregatedData: [
                    { Project: '36 TUAS ROAD', Spend: 300 },
                    { Project: 'Depot Upgrade', Spend: 100 },
                ],
            })],
            columnProfiles: buildColumnProfiles(),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 0, Snapshot: '2026-03-01' },
                { Project: 'Depot Upgrade', Spend: 0, Snapshot: '2026-03-01' },
                { Project: '36 TUAS ROAD', Spend: 300, Snapshot: '2026-03-02' },
                { Project: 'Depot Upgrade', Spend: 100, Snapshot: '2026-03-02' },
            ]),
        });

        expect(kpis[0].delta).toMatchObject({
            kind: 'distribution',
            label: 'held by top Project',
            value: '75%',
        });
    });

    it('uses the same preFilter and card filter scope for the primary delta', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                aggregatedData: [{ Project: 'Alpha', Spend: 415 }],
                plan: {
                    title: 'Spend by Project',
                    description: 'Compare spend by project.',
                    chartType: 'bar',
                    aggregation: 'sum',
                    groupByColumn: 'Project',
                    valueColumn: 'Spend',
                    preFilter: [{ column: 'Region', operator: 'eq', value: 'East' }],
                },
                filter: {
                    column: 'Project',
                    values: ['Alpha'],
                },
            })],
            columnProfiles: buildColumnProfiles([{ name: 'Date', type: 'date', missingPercentage: 0 }]),
            csvData: buildCsvData([
                { Project: 'Alpha', Spend: 100, Region: 'East', Date: '2026-01-15' },
                { Project: 'Beta', Spend: 900, Region: 'West', Date: '2026-01-15' },
                { Project: 'Alpha', Spend: 150, Region: 'East', Date: '2026-02-15' },
                { Project: 'Beta', Spend: 950, Region: 'West', Date: '2026-02-15' },
                { Project: 'Alpha', Spend: 165, Region: 'East', Date: '2026-03-15' },
                { Project: 'Beta', Spend: 990, Region: 'West', Date: '2026-03-15' },
            ]),
        });

        expect(kpis[0]).toMatchObject({
            value: '415',
            delta: {
                kind: 'period',
                label: 'vs last month',
                value: '+10%',
            },
        });
    });

    it('fixes copy when the metric already starts with Total and uses Top 3 Share insight', () => {
        const kpis = buildExecutiveKpis({
            cards: [
                buildCard({
                    id: 'card-total-value',
                    plan: {
                        title: 'Value by Project',
                        description: 'Compare total value by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Project',
                        valueColumn: 'Total Value',
                    },
                    aggregatedData: [
                        { Project: '36 TUAS ROAD', 'Total Value': 1200 },
                        { Project: 'Depot Upgrade', 'Total Value': 800 },
                        { Project: 'HQ Refresh', 'Total Value': 400 },
                        { Project: 'Mobile Pilot', 'Total Value': 200 },
                    ],
                }),
            ],
            columnProfiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'Total Value', type: 'numerical', missingPercentage: 0, valueRange: [200, 1200] },
            ],
            csvData: null,
        });

        expect(kpis[0]).toMatchObject({
            label: 'Total Value',
        });
        expect(kpis[3]).toMatchObject({
            id: 'top-share',
            label: 'Top 3 Share',
            value: '92%',
        });
    });

    it('ignores filtered or fallback cards when a stronger executive metric card exists', () => {
        const kpis = buildExecutiveKpis({
            cards: [
                buildCard({
                    id: 'fallback-card',
                    plan: {
                        title: 'Fallback',
                        description: 'Fallback',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Region',
                        valueColumn: 'Revenue',
                        isFallback: true,
                    },
                    aggregatedData: [{ Region: 'East', Revenue: 500 }],
                }),
                buildCard({
                    id: 'real-card',
                    plan: {
                        title: 'Revenue by Region',
                        description: 'Compare revenue by region.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'Region',
                        valueColumn: 'Revenue',
                    },
                    aggregatedData: [
                        { Region: 'East', Revenue: 900 },
                        { Region: 'West', Revenue: 600 },
                    ],
                }),
            ],
            columnProfiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [600, 900] },
            ],
            csvData: null,
        });

        expect(kpis[0]).toMatchObject({
            label: 'Total Revenue',
            value: '1,500',
            sourceCardId: 'real-card',
        });
        expect(kpis[1]).toMatchObject({
            label: 'Top Region',
            value: '900',
        });
    });

    it('prefers business-dimension cards over helper-dimension cards for the executive overview', () => {
        const kpis = buildExecutiveKpis({
            cards: [
                buildCard({
                    id: 'helper-card',
                    plan: {
                        title: 'Total Value by Source Column',
                        description: 'Compare total value by source column.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'SourceColumnName',
                        valueColumn: 'Value',
                    },
                    aggregatedData: [
                        { SourceColumnName: '24216', Value: 2400 },
                        { SourceColumnName: '24217', Value: 1200 },
                    ],
                }),
                buildCard({
                    id: 'business-card',
                    plan: {
                        title: 'Revenue by Project',
                        description: 'Compare revenue by project.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'SeriesLabelL1',
                        valueColumn: 'Value',
                    },
                    aggregatedData: [
                        { SeriesLabelL1: 'BDB LAB DESIGN', Value: 1800 },
                        { SeriesLabelL1: 'GREENPHYTO', Value: 900 },
                    ],
                }),
            ],
            columnProfiles: [
                { name: 'SourceColumnName', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [900, 2400] },
            ],
            csvData: null,
        });

        expect(kpis[0]).toMatchObject({
            label: 'Total Revenue',
            sourceCardId: 'business-card',
        });
        expect(kpis[1]).toMatchObject({
            label: 'Top Project',
        });
        expect(kpis[2]).toMatchObject({
            label: 'Projects',
        });
    });

    it('keeps helper-only KPI labels neutral when no business dimension card exists', () => {
        const kpis = buildExecutiveKpis({
            cards: [
                buildCard({
                    id: 'helper-only-card',
                    plan: {
                        title: 'Total Value by Source Column.',
                        description: 'Compare total value by source column.',
                        chartType: 'bar',
                        aggregation: 'sum',
                        groupByColumn: 'SourceColumnName',
                        valueColumn: 'Value',
                    },
                    aggregatedData: [
                        { SourceColumnName: '24216', Value: 2400 },
                        { SourceColumnName: '24217', Value: 1200 },
                    ],
                }),
            ],
            columnProfiles: [
                { name: 'SourceColumnName', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [1200, 2400] },
            ],
            csvData: null,
        });

        expect(kpis[0]).toMatchObject({
            label: 'Total Value',
            sourceCardId: 'helper-only-card',
        });
        expect(kpis[1]).toMatchObject({
            label: 'Top Source Column',
        });
        expect(kpis[2]).toMatchObject({
            label: 'Source Column',
        });
    });

    it('localizes KPI label, detail, and delta label when a non-English language is provided', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard({
                aggregatedData: [
                    { Project: '36 TUAS ROAD', Spend: 250 },
                    { Project: 'Depot Upgrade', Spend: 125 },
                ],
            })],
            columnProfiles: buildColumnProfiles([{ name: 'Date', type: 'date', missingPercentage: 0 }]),
            csvData: buildCsvData([
                { Project: '36 TUAS ROAD', Spend: 100, Date: '2026-01-10' },
                { Project: 'Depot Upgrade', Spend: 50, Date: '2026-01-18' },
                { Project: '36 TUAS ROAD', Spend: 200, Date: '2026-02-10' },
                { Project: 'Depot Upgrade', Spend: 100, Date: '2026-02-18' },
                { Project: '36 TUAS ROAD', Spend: 250, Date: '2026-03-10' },
                { Project: 'Depot Upgrade', Spend: 125, Date: '2026-03-18' },
            ]),
            language: 'Mandarin',
        });

        expect(kpis[0]).toMatchObject({
            label: '总Spend',
            detail: '覆盖 6 行预处理数据。',
            delta: {
                kind: 'period',
                label: '较上月',
            },
        });
        expect(kpis[1]).toMatchObject({
            label: '头部Project',
        });
        expect(kpis[1].detail).toContain('占 Spend 的 67%');
        expect(kpis[3]).toMatchObject({
            label: '前 2 占比',
        });
    });
});
