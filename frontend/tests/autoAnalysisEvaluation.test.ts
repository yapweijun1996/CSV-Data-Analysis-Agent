import { describe, expect, it } from 'vitest';
import type { AnalysisCardData } from '../types';
import { makeMetricQualityDecision } from './testFactories';
import {
    attachAutoAnalysisEvaluationToCards,
    evaluateAutoAnalysisCards,
    formatAutoAnalysisEvaluationSummary,
} from '../services/agent/autoAnalysisEvaluation';
import type { AnalysisQualityGovernanceResult } from '../types';

const asEnglishText = (text: string) => ({ language: 'English' as const, text });

const buildCard = (overrides: Partial<AnalysisCardData>): AnalysisCardData => ({
    id: 'card-1',
    plan: {
        chartType: 'bar',
        title: 'Revenue by Region',
        description: 'Compare revenue by region.',
        aggregation: 'sum',
        groupByColumn: 'Region',
        valueColumn: 'Revenue',
    },
    aggregatedData: [
        { Region: 'East', Revenue: 100 },
        { Region: 'West', Revenue: 80 },
    ],
    summary: asEnglishText('Card summary'),
    displayChartType: 'bar',
    isDataVisible: false,
    topN: null,
    hideOthers: false,
    ...overrides,
}) as AnalysisCardData;

describe('autoAnalysisEvaluation', () => {
    it('does not treat a business count view as an aggregation-quality defect', () => {
        const summary = evaluateAutoAnalysisCards([
            buildCard({
                plan: {
                    chartType: 'bar',
                    title: 'Record count by Quotation Number',
                    description: 'Compare record counts by quotation.',
                    aggregation: 'count',
                    groupByColumn: 'Quotation Number',
                    valueColumn: 'Record Count',
                },
                aggregatedData: [
                    { 'Quotation Number': 'Q-100', 'Record Count': 4 },
                    { 'Quotation Number': 'Q-200', 'Record Count': 3 },
                ],
            }),
        ]);

        expect(summary.cards[0]).toMatchObject({
            verdict: 'trusted',
            reasonCodes: [],
        });
    });

    it('classifies trusted and weak cards separately', () => {
        const summary = evaluateAutoAnalysisCards([
            buildCard({ id: 'trusted-card' }),
            buildCard({
                id: 'weak-card',
                plan: {
                    chartType: 'bar',
                    title: 'Value by SeriesLabelL1',
                    description: 'Compare Value by SeriesLabelL1.',
                    aggregation: 'sum',
                    groupByColumn: 'SeriesLabelL1',
                    valueColumn: 'Value',
                },
                aggregatedData: [
                    { SeriesLabelL1: 'Alpha', Value: 100 },
                    { SeriesLabelL1: 'Beta', Value: 80 },
                ],
            }),
        ]);

        expect(summary.trustedCount).toBe(1);
        expect(summary.weakCount).toBe(1);
        expect(summary.overallVerdict).toBe('caveated');
        expect(summary.cards.find(card => card.cardId === 'trusted-card')).toMatchObject({
            verdict: 'trusted',
            detail: 'trusted',
        });
        expect(summary.cards.find(card => card.cardId === 'weak-card')).toMatchObject({
            verdict: 'weak',
            reasonCodes: expect.arrayContaining(['helper_exposure']),
        });
        expect(formatAutoAnalysisEvaluationSummary(summary)).toContain('mixed-quality evidence');

        const attached = attachAutoAnalysisEvaluationToCards([
            buildCard({ id: 'trusted-card' }),
            buildCard({
                id: 'weak-card',
                plan: {
                    chartType: 'bar',
                    title: 'Value by SeriesLabelL1',
                    description: 'Compare Value by SeriesLabelL1.',
                    aggregation: 'sum',
                    groupByColumn: 'SeriesLabelL1',
                    valueColumn: 'Value',
                },
                aggregatedData: [
                    { SeriesLabelL1: 'Alpha', Value: 100 },
                    { SeriesLabelL1: 'Beta', Value: 80 },
                ],
            }),
        ]);
        expect(attached[1].autoAnalysisEvaluation).toMatchObject({
            verdict: 'weak',
            source: 'auto_analysis_evaluator_v1',
        });
    });

    it('downgrades table-only evidence even when the display title sounds business-friendly', () => {
        const summary = evaluateAutoAnalysisCards([
            buildCard({
                id: 'table-only-card',
                plan: {
                    chartType: 'bar',
                    title: 'Financial Performance by Project',
                    description: 'Compare values by project.',
                    aggregation: 'sum',
                    groupByColumn: 'SeriesKey',
                    valueColumn: 'Value',
                    artifactMetadata: {
                        artifactType: 'distribution',
                        dataTableFirst: true,
                        hideChartByDefault: true,
                    },
                },
                aggregatedData: [
                    { SeriesKey: 'A-100', Value: 120 },
                    { SeriesKey: 'A-200', Value: 100 },
                ],
                evidenceValueGate: {
                    decision: 'table_only',
                    reasonCodes: ['helper_dimension', 'unsafe_business_narrative'],
                    detail: 'helper_dimension',
                    querySignature: 'q1',
                    semanticSignature: 's1',
                    semanticRisk: 'high',
                    evaluatedAt: new Date().toISOString(),
                    source: 'evidence_value_gate_v1',
                },
            }),
        ]);

        // table_only cards with unsafe_business_narrative are caveated, not weak —
        // the table presentation is itself the safe fallback for charts that would mislead.
        expect(summary.cards[0]).toMatchObject({
            verdict: 'caveated',
            reasonCodes: expect.arrayContaining(['value_gate_table_only', 'unsafe_business_narrative']),
        });
    });

    it('downgrades cards when generic quality governance flags the dimension, metric, and unclassified share', () => {
        const governance: AnalysisQualityGovernanceResult = {
            blockedDimensions: [],
            avoidDimensions: ['Region'],
            avoidMetrics: ['Revenue'],
            qualityHintsSummary: 'Avoid Region and Revenue in automatic analysis.',
            datasetSignals: [],
            dimensionDecisions: [{
                column: 'Region',
                action: 'avoid',
                reasonCodes: ['high_null_like_share'],
                detail: 'dimension quality warning',
                missingRate: 0,
                nullLikeShare: 0.4,
                distinctCount: 3,
            }],
            metricDecisions: [{
                column: 'Revenue',
                action: 'avoid',
                reasonCodes: ['formatted_number_risk', 'high_missing_rate'],
                detail: 'metric quality warning',
                missingRate: 0.6,
                hasFormattedNumbers: true,
            }],
        };

        const cards = [
            buildCard({
                id: 'quality-card',
                aggregatedData: [
                    { Region: 'Unknown', Revenue: 70 },
                    { Region: 'East', Revenue: 30 },
                ],
            }),
        ];

        const summary = evaluateAutoAnalysisCards(cards, { qualityGovernance: governance });
        expect(summary.cards[0]).toMatchObject({
            verdict: 'caveated',
            reasonCodes: expect.arrayContaining([
                'dimension_quality_warning',
                'metric_quality_warning',
                'unclassified_share_warning',
            ]),
        });

        const attached = attachAutoAnalysisEvaluationToCards(cards, { qualityGovernance: governance });
        expect(attached[0].autoAnalysisEvaluation?.reasonCodes).toEqual(expect.arrayContaining([
            'dimension_quality_warning',
            'metric_quality_warning',
            'unclassified_share_warning',
        ]));
    });

    it('keeps a business-dimension value card trusted when null-like leakage is small and isolated', () => {
        const governance: AnalysisQualityGovernanceResult = {
            blockedDimensions: [],
            avoidDimensions: [],
            avoidMetrics: [],
            qualityHintsSummary: 'Business dimension is allowed.',
            datasetSignals: [],
            dimensionDecisions: [{
                column: 'Project',
                action: 'allow',
                reasonCodes: [],
                detail: 'dimension allowed',
                missingRate: 0,
                nullLikeShare: 0.108,
                distinctCount: 3,
            }],
            metricDecisions: [makeMetricQualityDecision({ column: 'Value', detail: 'metric allowed' })],
        };

        const summary = evaluateAutoAnalysisCards([
            buildCard({
                id: 'project-value-card',
                plan: {
                    chartType: 'bar',
                    title: 'Sum Value by Project',
                    description: 'Compare value by project.',
                    aggregation: 'sum',
                    groupByColumn: 'Project',
                    valueColumn: 'Value',
                },
                aggregatedData: [
                    { Project: 'BDB LAB DESIGN', Value: 82428882.68 },
                    { Project: 'SOITEC', Value: 115016018.2 },
                    { Project: 'Unknown', Value: 24049187.58 },
                ],
            }),
        ], { qualityGovernance: governance });

        expect(summary.cards[0]).toMatchObject({
            verdict: 'trusted',
            reasonCodes: [],
            detail: 'trusted',
        });
    });

    it('keeps the warning when null-like leakage for a business dimension is too large', () => {
        const governance: AnalysisQualityGovernanceResult = {
            blockedDimensions: [],
            avoidDimensions: [],
            avoidMetrics: [],
            qualityHintsSummary: 'Business dimension is allowed.',
            datasetSignals: [],
            dimensionDecisions: [{
                column: 'Project',
                action: 'allow',
                reasonCodes: [],
                detail: 'dimension allowed',
                missingRate: 0,
                nullLikeShare: 0.18,
                distinctCount: 3,
            }],
            metricDecisions: [makeMetricQualityDecision({ column: 'Value', detail: 'metric allowed' })],
        };

        const summary = evaluateAutoAnalysisCards([
            buildCard({
                id: 'project-value-card',
                plan: {
                    chartType: 'bar',
                    title: 'Sum Value by Project',
                    description: 'Compare value by project.',
                    aggregation: 'sum',
                    groupByColumn: 'Project',
                    valueColumn: 'Value',
                },
                aggregatedData: [
                    { Project: 'BDB LAB DESIGN', Value: 82 },
                    { Project: 'SOITEC', Value: 18 },
                    { Project: 'Unknown', Value: 18 },
                ],
            }),
        ], { qualityGovernance: governance });

        expect(summary.cards[0]).toMatchObject({
            verdict: 'caveated',
            reasonCodes: expect.arrayContaining(['aggregation_quality_warning', 'unclassified_share_warning']),
        });
    });

    it('keeps count views caveated even when null-like leakage is modest', () => {
        const governance: AnalysisQualityGovernanceResult = {
            blockedDimensions: [],
            avoidDimensions: [],
            avoidMetrics: [],
            qualityHintsSummary: 'Business dimension is allowed.',
            datasetSignals: [],
            dimensionDecisions: [{
                column: 'Project',
                action: 'allow',
                reasonCodes: [],
                detail: 'dimension allowed',
                missingRate: 0,
                nullLikeShare: 0.11,
                distinctCount: 3,
            }],
            metricDecisions: [makeMetricQualityDecision({ column: 'Rows', detail: 'metric allowed' })],
        };

        const summary = evaluateAutoAnalysisCards([
            buildCard({
                id: 'project-count-card',
                plan: {
                    chartType: 'bar',
                    title: 'Count Rows by Project',
                    description: 'Compare row count by project.',
                    aggregation: 'count',
                    groupByColumn: 'Project',
                    valueColumn: 'Rows',
                },
                aggregatedData: [
                    { Project: 'BDB LAB DESIGN', Rows: 80 },
                    { Project: 'SOITEC', Rows: 10 },
                    { Project: 'Unknown', Rows: 11 },
                ],
            }),
        ], { qualityGovernance: governance });

        expect(summary.cards[0]).toMatchObject({
            verdict: 'caveated',
            reasonCodes: expect.arrayContaining(['aggregation_quality_warning', 'unclassified_share_warning']),
        });
    });
});
