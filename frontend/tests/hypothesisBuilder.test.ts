// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { RuntimeSemanticUnderstanding } from '../types';
import type { AnalysisDatasetContext } from '../services/prompts/analysisPrompts';
import { buildHypotheses, shouldBypassBusinessHypotheses } from '../services/agent/runtime/hypothesisBuilder';

const makeSemanticUnderstanding = (
    overrides: Partial<RuntimeSemanticUnderstanding> = {},
): RuntimeSemanticUnderstanding => ({
    businessGrains: [],
    candidateMetrics: [],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: [],
    detailRowPolicy: 'exclude_non_detail_rows',
    businessGlossary: [],
    businessGrainConfidence: 'low',
    unsafeForBusinessNarrative: false,
    ...overrides,
});

const makeDatasetContext = (
    overrides: Partial<AnalysisDatasetContext> = {},
): AnalysisDatasetContext => ({
    dimensionColumns: [],
    metricColumns: [],
    ...overrides,
});

describe('shouldBypassBusinessHypotheses', () => {
    it('keeps count-based analysis enabled when categorical or date dimensions exist', () => {
        const result = shouldBypassBusinessHypotheses(
            makeSemanticUnderstanding(),
            makeDatasetContext({ dimensionColumns: ['Customer', 'Effective Date'] }),
        );

        expect(result).toBe(false);
    });

    it('bypasses business hypotheses when every available dimension is blocked and no metric exists', () => {
        const result = shouldBypassBusinessHypotheses(
            makeSemanticUnderstanding({ blockedDimensions: ['Internal ID'] }),
            makeDatasetContext({
                dimensionColumns: ['Internal ID'],
                blockedDimensions: ['Internal ID'],
            }),
        );

        expect(result).toBe(true);
    });

    it('keeps metric analysis enabled even when no usable dimension exists', () => {
        const result = shouldBypassBusinessHypotheses(
            makeSemanticUnderstanding({ candidateMetrics: ['Amount'] }),
            makeDatasetContext(),
        );

        expect(result).toBe(false);
    });
});

describe('buildHypotheses automatic pivot governance', () => {
    it('does not create a pivot from a sparse dimension marked for avoidance', () => {
        const hypotheses = buildHypotheses(
            ['Sum Balance Amount by Ship Mode'],
            makeSemanticUnderstanding({
                businessGrains: ['CUST P/O NO.', 'Ship Mode'],
                candidateMetrics: ['Balance Qty'],
            }),
            makeDatasetContext({
                dimensionColumns: ['CUST P/O NO.', 'Ship Mode'],
                metricColumns: ['Balance Qty'],
                avoidGrainColumns: ['CUST P/O NO.'],
                qualityBlockedDimensions: ['CUST P/O NO.'],
            }),
            [{
                rowDimension: 'CUST P/O NO.',
                columnDimension: 'Ship Mode',
                metric: 'Balance Qty',
                aggregate: 'sum',
                crossProductSize: 80,
                confidence: 'medium',
                rowCardinality: 10,
                columnCardinality: 8,
            }],
        );

        expect(hypotheses.some(hypothesis => hypothesis.executionMode === 'pivot_matrix')).toBe(false);
    });
});
