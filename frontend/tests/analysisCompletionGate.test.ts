// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AnalysisArtifactProvenance, AnalysisCardData, ColumnProfile } from '../types';
import { resolveAnalysisCompletionGate } from '../services/agent/analysisCompletionGate';

const DATASET_VERSION = 'dataset-current';

const provenance = (overrides: Partial<AnalysisArtifactProvenance> = {}): AnalysisArtifactProvenance => ({
    schemaVersion: 1,
    datasetId: 'dataset-1',
    datasetVersion: DATASET_VERSION,
    evidenceStatus: 'verified',
    evidenceReasons: [],
    method: {
        operation: 'bar',
        groupByColumns: ['Town'],
        aggregations: [{ function: 'sum', column: 'Resale Price', alias: 'total_price' }],
        sourceColumns: ['Town', 'Resale Price'],
        filterCount: 0,
        pivotRows: [],
        pivotColumns: [],
    },
    queryEvidence: null,
    queryEvidenceRequired: false,
    evidenceRefs: [],
    createdAt: '2026-07-27T00:00:00.000Z',
    ...overrides,
});

const card = (overrides: Partial<AnalysisCardData> = {}): AnalysisCardData => ({
    id: overrides.id ?? 'town-total',
    plan: overrides.plan ?? {
        title: 'Total Resale Price by Town',
        description: 'Compare total resale price by town.',
        chartType: 'bar',
        aggregation: 'sum',
        groupByColumn: 'Town',
        valueColumn: 'Resale Price',
    },
    aggregatedData: overrides.aggregatedData ?? [{ Town: 'WOODLANDS', 'Resale Price': 1000 }],
    summary: overrides.summary ?? { language: 'English', text: 'Woodlands has the largest total.' },
    displayChartType: overrides.displayChartType ?? 'bar',
    isDataVisible: false,
    topN: null,
    hideOthers: false,
    hiddenLabels: [],
    autoAnalysisEvaluation: overrides.autoAnalysisEvaluation ?? {
        verdict: 'trusted',
        reasonCodes: [],
        detail: 'trusted',
        evaluatedAt: '2026-07-27T00:00:00.000Z',
        source: 'auto_analysis_evaluator_v1',
    },
    provenance: overrides.provenance === undefined ? provenance() : overrides.provenance,
});

const profiles: ColumnProfile[] = [
    { name: 'Town', type: 'categorical', uniqueValues: 26, missingPercentage: 0 },
    { name: 'Resale Price', type: 'currency', uniqueValues: 500, missingPercentage: 0 },
    { name: 'SourceRowIndex', type: 'numerical', uniqueValues: 1000, missingPercentage: 0 },
];

describe('resolveAnalysisCompletionGate', () => {
    it('completes only when a verified, meaningful business conclusion exists', () => {
        expect(resolveAnalysisCompletionGate({
            cards: [card()],
            currentDatasetVersion: DATASET_VERSION,
            columnProfiles: profiles,
        })).toEqual({
            status: 'complete',
            trustedBusinessCardIds: ['town-total'],
            reasonCode: 'trusted_business_conclusion_available',
        });
    });

    it('blocks helper-only output even when its evidence provenance is verified', () => {
        const helper = card({
            id: 'helper-row',
            plan: {
                title: 'Total Value by Source Row',
                description: 'Compare source rows.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SourceRowIndex',
                valueColumn: 'Resale Price',
            },
            aggregatedData: [{ SourceRowIndex: 1, 'Resale Price': 1000 }],
        });

        expect(resolveAnalysisCompletionGate({
            cards: [helper],
            currentDatasetVersion: DATASET_VERSION,
            columnProfiles: profiles,
        })).toMatchObject({ status: 'blocked', trustedBusinessCardIds: [] });
    });

    it('blocks stale and unverified business cards', () => {
        const stale = card({ provenance: provenance({ datasetVersion: 'dataset-old' }) });
        const legacy = card({ id: 'legacy', provenance: null });

        expect(resolveAnalysisCompletionGate({
            cards: [stale, legacy],
            currentDatasetVersion: DATASET_VERSION,
            columnProfiles: profiles,
        }).status).toBe('blocked');
    });

    it('does not mark a count-only card as a completed business analysis', () => {
        const countOnly = card({
            id: 'quotation-count',
            plan: {
                title: 'Count Rows by Quotation Date',
                description: 'Count report rows by quotation date.',
                chartType: 'line',
                aggregation: 'count',
                groupByColumn: 'Quotation Date',
                valueColumn: 'Count Rows',
            },
            aggregatedData: [{ 'Quotation Date': '15-10-2010', 'Count Rows': 8 }],
            provenance: provenance({
                method: {
                    operation: 'line',
                    groupByColumns: ['Quotation Date'],
                    aggregations: [{ function: 'count', column: null, alias: 'Count Rows' }],
                    sourceColumns: ['Quotation Date'],
                    filterCount: 0,
                    pivotRows: [],
                    pivotColumns: [],
                },
            }),
        });

        expect(resolveAnalysisCompletionGate({
            cards: [countOnly],
            currentDatasetVersion: DATASET_VERSION,
            columnProfiles: [
                ...profiles,
                { name: 'Quotation Date', type: 'date', uniqueValues: 7, missingPercentage: 0 },
            ],
        })).toEqual({
            status: 'blocked',
            trustedBusinessCardIds: [],
            reasonCode: 'no_trusted_business_conclusion',
        });
    });
});
