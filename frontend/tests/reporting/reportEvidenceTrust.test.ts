// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ReportCardEvidence } from '../../types';
import { resolveReportCardTrust, resolveReportGenerationGate, resolveReportGenerationGateV2 } from '../../services/reporting/reportEvidenceTrust';

const createCard = (overrides?: Partial<ReportCardEvidence>): ReportCardEvidence => ({
    evidenceId: 'card.card-1',
    cardId: 'card-1',
    title: 'Revenue by Region',
    displayTitle: 'Revenue by Region',
    description: 'Compare total revenue by region.',
    artifactType: null,
    chartType: 'bar',
    groupByColumn: 'Region',
    valueColumn: 'Revenue',
    aggregation: 'sum',
    rowCount: 4,
    summary: { language: 'English', text: 'East region leads revenue.' },
    aggregatedDataSample: [{ Region: 'East', Revenue: 1200 }],
    reportChartRows: [{ Region: 'East', Revenue: 1200 }, { Region: 'West', Revenue: 900 }],
    semanticRole: 'business_dimension',
    helperExposureLevel: 'none',
    businessMeaningConfidence: 0.92,
    aggregationQualityFlags: [],
    isFallback: false,
    provenanceStatus: 'verified',
    provenanceDatasetVersion: 'version-current',
    currentDatasetVersion: 'version-current',
    provenanceIsStale: false,
    queryTraceId: 'query-trace-1',
    trustStatus: 'verified',
    trustReasonCodes: [],
    ...overrides,
});

describe('reportEvidenceTrust', () => {
    it('includes only cards that satisfy the strict reporting allowlist', () => {
        const result = resolveReportCardTrust([createCard()]);

        expect(result.includedCardIds).toEqual(['card-1']);
        expect(result.excludedCardIds).toEqual([]);
        expect(result.trustedIncludedCount).toBe(1);
        expect(result.caveatedIncludedCount).toBe(0);
    });

    it('hard-excludes helper-exposed, fallback, and narrative-ineligible cards', () => {
        const result = resolveReportCardTrust([
            createCard({
                cardId: 'helper',
                evidenceId: 'card.helper',
                helperExposureLevel: 'low',
            }),
            createCard({
                cardId: 'fallback',
                evidenceId: 'card.fallback',
                isFallback: true,
            }),
            createCard({
                cardId: 'narrative-ineligible',
                evidenceId: 'card.narrative-ineligible',
                semanticRole: 'helper_classification',
            }),
        ]);

        expect(result.includedCardIds).toEqual([]);
        expect(result.excludedEvidence).toEqual(expect.arrayContaining([
            expect.objectContaining({ cardId: 'helper', reasonCodes: ['helper_exposure'] }),
            expect.objectContaining({ cardId: 'fallback', reasonCodes: ['fallback_plan'] }),
            expect.objectContaining({ cardId: 'narrative-ineligible', reasonCodes: ['narrative_ineligible'] }),
        ]));
    });

    it('soft-includes low-confidence and aggregation-warning cards as caveated', () => {
        const result = resolveReportCardTrust([
            createCard({
                cardId: 'low-confidence',
                evidenceId: 'card.low-confidence',
                businessMeaningConfidence: 0.61,
            }),
            createCard({
                cardId: 'aggregation-warning',
                evidenceId: 'card.aggregation-warning',
                aggregationQualityFlags: ['mixed_grain'],
            }),
        ]);

        expect(result.includedCardIds).toEqual(['low-confidence', 'aggregation-warning']);
        expect(result.excludedCardIds).toEqual([]);
        expect(result.trustedIncludedCount).toBe(0);
        expect(result.caveatedIncludedCount).toBe(2);
    });

    it('still hard-excludes cards with both soft and hard reason codes', () => {
        const result = resolveReportCardTrust([
            createCard({
                cardId: 'mixed',
                evidenceId: 'card.mixed',
                businessMeaningConfidence: 0.50,
                helperExposureLevel: 'high',
            }),
        ]);

        expect(result.includedCardIds).toEqual([]);
        expect(result.excludedCardIds).toEqual(['mixed']);
    });

    it('hard-excludes stale and hypothesis artifacts while caveating degraded evidence', () => {
        const result = resolveReportCardTrust([
            createCard({
                cardId: 'stale',
                evidenceId: 'card.stale',
                provenanceStatus: 'verified',
                provenanceIsStale: true,
                trustStatus: 'stale',
                provenanceDatasetVersion: 'version-old',
                currentDatasetVersion: 'version-new',
            }),
            createCard({
                cardId: 'hypothesis',
                evidenceId: 'card.hypothesis',
                provenanceStatus: 'hypothesis',
                trustStatus: 'unverified',
            }),
            createCard({
                cardId: 'degraded',
                evidenceId: 'card.degraded',
                provenanceStatus: 'degraded',
                trustStatus: 'caveated',
                provenanceReasons: ['Query fallback was used.'],
            }),
        ]);

        expect(result.excludedEvidence).toEqual(expect.arrayContaining([
            expect.objectContaining({ cardId: 'stale', reasonCodes: ['stale_dataset_version'] }),
            expect.objectContaining({ cardId: 'hypothesis', reasonCodes: ['unverified_provenance'] }),
        ]));
        expect(result.includedCardIds).toEqual(['degraded']);
        expect(result.caveatedIncludedCount).toBe(1);
    });

    it('hard-excludes legacy evidence with no canonical trust decision', () => {
        const result = resolveReportCardTrust([
            createCard({
                cardId: 'legacy',
                evidenceId: 'card.legacy',
                trustStatus: 'unverified',
                trustReasonCodes: ['provenance_missing'],
                provenanceStatus: 'unverified',
                provenanceDatasetVersion: null,
                queryTraceId: null,
            }),
        ]);

        expect(result.includedCardIds).toEqual([]);
        expect(result.excludedEvidence[0]).toMatchObject({
            cardId: 'legacy',
            reasonCodes: ['unverified_provenance'],
        });
    });

    it('blocks report generation when readiness is blocked or no trusted cards remain', () => {
        expect(resolveReportGenerationGate('blocked', 2, 'Dataset is blocked.')).toEqual({
            gate: 'blocked',
            blockers: ['Dataset is blocked.'],
        });
        expect(resolveReportGenerationGate('partial', 0, 'Partial readiness.')).toEqual({
            gate: 'blocked',
            blockers: ['No trusted report evidence cards qualified for analyst reporting.'],
        });
        expect(resolveReportGenerationGate('partial', 1, 'Partial readiness.')).toEqual({
            gate: 'allowed_with_caveats',
            blockers: [],
        });
    });

    it('V2 gate allows caveated-only reports with allowed_with_caveats', () => {
        // All 3 included cards are caveated → allowed_with_caveats
        expect(resolveReportGenerationGateV2('ready', 3, 3, '')).toEqual({
            gate: 'allowed_with_caveats',
            blockers: [],
        });

        // Mix of trusted + caveated → allowed
        expect(resolveReportGenerationGateV2('ready', 4, 2, '')).toEqual({
            gate: 'allowed',
            blockers: [],
        });

        // 0 included → blocked
        expect(resolveReportGenerationGateV2('ready', 0, 0, '')).toEqual({
            gate: 'blocked',
            blockers: ['No trusted report evidence cards qualified for analyst reporting.'],
        });
    });

    it('soft-includes quality-governed cards as caveated instead of excluding them', () => {
        const result = resolveReportCardTrust([
            createCard({
                cardId: 'quality-card',
                evidenceId: 'card.quality-card',
                autoAnalysisReasonCodes: ['dimension_quality_warning', 'unclassified_share_warning'],
            }),
        ]);

        expect(result.includedCardIds).toEqual(['quality-card']);
        expect(result.trustedIncludedCount).toBe(0);
        expect(result.caveatedIncludedCount).toBe(1);
    });
});
