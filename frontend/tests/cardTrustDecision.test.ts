// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AnalysisCardData, AnalysisArtifactProvenance } from '../types';
import { resolveCardTrustDecision } from '../services/agent/cardTrustDecision';

const CURRENT_VERSION = 'dataset-current';

const createProvenance = (
    overrides: Partial<AnalysisArtifactProvenance> = {},
): AnalysisArtifactProvenance => ({
    schemaVersion: 1,
    datasetId: 'dataset-1',
    datasetVersion: CURRENT_VERSION,
    evidenceStatus: 'verified',
    evidenceReasons: [],
    method: {
        operation: 'bar',
        groupByColumns: ['Town'],
        aggregations: [{ function: 'sum', column: 'Price', alias: 'total_price' }],
        sourceColumns: ['Town', 'Price'],
        filterCount: 0,
        pivotRows: [],
        pivotColumns: [],
    },
    queryEvidence: null,
    queryEvidenceRequired: false,
    evidenceRefs: [],
    createdAt: '2026-07-25T00:00:00.000Z',
    ...overrides,
});

const createCard = (
    overrides: Partial<Pick<AnalysisCardData, 'autoAnalysisEvaluation' | 'provenance'>> = {},
): Pick<AnalysisCardData, 'autoAnalysisEvaluation' | 'provenance'> => ({
    autoAnalysisEvaluation: {
        verdict: 'trusted',
        reasonCodes: [],
        detail: 'trusted',
        evaluatedAt: '2026-07-25T00:00:00.000Z',
        source: 'auto_analysis_evaluator_v1',
    },
    provenance: createProvenance(),
    ...overrides,
});

describe('resolveCardTrustDecision', () => {
    it('verifies only current, verified evidence with a trusted quality evaluation', () => {
        expect(resolveCardTrustDecision(createCard(), CURRENT_VERSION)).toEqual({
            status: 'verified',
            reasonCodes: [],
            detail: 'verified',
        });
    });

    it('keeps legacy cards without provenance unverified', () => {
        expect(resolveCardTrustDecision(createCard({ provenance: null }), CURRENT_VERSION)).toMatchObject({
            status: 'unverified',
            reasonCodes: ['provenance_missing'],
        });
    });

    it('marks an older dataset version stale', () => {
        expect(resolveCardTrustDecision(createCard({
            provenance: createProvenance({ datasetVersion: 'dataset-old' }),
        }), CURRENT_VERSION)).toMatchObject({
            status: 'stale',
            reasonCodes: ['dataset_stale'],
        });
    });

    it('requires an exact trace for query-derived evidence', () => {
        expect(resolveCardTrustDecision(createCard({
            provenance: createProvenance({
                queryEvidenceRequired: true,
                queryEvidence: null,
            }),
        }), CURRENT_VERSION)).toMatchObject({
            status: 'unverified',
            reasonCodes: ['query_trace_missing'],
        });
    });

    it('caveats degraded evidence and quality warnings', () => {
        const decision = resolveCardTrustDecision(createCard({
            provenance: createProvenance({ evidenceStatus: 'degraded' }),
            autoAnalysisEvaluation: {
                verdict: 'caveated',
                reasonCodes: ['aggregation_quality_warning'],
                detail: 'warning',
                evaluatedAt: '2026-07-25T00:00:00.000Z',
                source: 'auto_analysis_evaluator_v1',
            },
        }), CURRENT_VERSION);

        expect(decision).toMatchObject({
            status: 'caveated',
            reasonCodes: ['evidence_degraded', 'quality_caveat'],
        });
    });

    it('keeps weak quality evidence weak even when provenance is verified', () => {
        expect(resolveCardTrustDecision(createCard({
            autoAnalysisEvaluation: {
                verdict: 'weak',
                reasonCodes: ['value_gate_reject'],
                detail: 'weak',
                evaluatedAt: '2026-07-25T00:00:00.000Z',
                source: 'auto_analysis_evaluator_v1',
            },
        }), CURRENT_VERSION)).toMatchObject({
            status: 'weak',
            reasonCodes: ['quality_weak'],
        });
    });
});
