import { describe, expect, it } from 'vitest';
import { buildExecutiveKpis } from '../services/dashboard/executiveKpis';
import type { AnalysisCardData, ColumnProfile } from '../types';

const asEnglishText = (text: string) => ({ language: 'English' as const, text });

const columnProfiles: ColumnProfile[] = [
    { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
    { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [200, 1200] },
];

const buildCard = (title: string): AnalysisCardData => ({
    id: `card-${title}`,
    plan: {
        title,
        description: 'Compare the grouped results.',
        chartType: 'bar',
        aggregation: 'sum',
        groupByColumn: 'SeriesLabelL1',
        valueColumn: 'Value',
    },
    aggregatedData: [
        { SeriesLabelL1: '36 TUAS ROAD', Value: 1200 },
        { SeriesLabelL1: 'Depot Upgrade', Value: 800 },
        { SeriesLabelL1: 'HQ Refresh', Value: 400 },
    ],
    summary: asEnglishText('Summary'),
    displayChartType: 'bar',
    isDataVisible: false,
    topN: null,
    hideOthers: false,
    hiddenLabels: [],
    autoAnalysisEvaluation: {
        verdict: 'trusted',
        reasonCodes: [],
        detail: 'trusted',
        evaluatedAt: new Date().toISOString(),
        source: 'auto_analysis_evaluator_v1',
    },
    provenance: {
        schemaVersion: 1,
        datasetId: 'dataset-labels',
        datasetVersion: 'version-current',
        evidenceStatus: 'verified',
        evidenceReasons: [],
        method: {
            operation: 'bar',
            groupByColumns: ['SeriesLabelL1'],
            aggregations: [{ function: 'sum', column: 'Value', alias: 'Value' }],
            sourceColumns: ['SeriesLabelL1', 'Value'],
            filterCount: 0,
            pivotRows: [],
            pivotColumns: [],
        },
        queryEvidence: null,
        queryEvidenceRequired: false,
        evidenceRefs: [],
        createdAt: '2026-07-25T00:00:00.000Z',
    },
});

describe('buildExecutiveKpis business label resolution', () => {
    it('uses the card title to recover business-friendly metric and group labels', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard('Revenue by Project')],
            columnProfiles,
            csvData: null,
        });

        expect(kpis[0]?.label).toBe('Total Revenue');
        expect(kpis[1]?.label).toBe('Top Project');
        expect(kpis[2]?.label).toBe('Projects');
    });

    it('singularizes plural top-N titles when deriving the group label', () => {
        const kpis = buildExecutiveKpis({
            cards: [buildCard('Top Projects by Revenue')],
            columnProfiles,
            csvData: null,
        });

        expect(kpis[0]?.label).toBe('Total Revenue');
        expect(kpis[1]?.label).toBe('Top Project');
        expect(kpis[2]?.label).toBe('Projects');
    });
});
