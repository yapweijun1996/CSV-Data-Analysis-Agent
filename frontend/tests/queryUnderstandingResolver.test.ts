// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    resolveTaskMode,
    resolveExpectedOutcome,
    resolveTaskModeFromArtifact,
    resolveExpectedOutcomeFromArtifact,
    isValidTaskSignal,
    isValidExpectedOutput,
} from '../services/agent/runtime/queryUnderstandingResolver';
import type { QueryUnderstandingArtifact } from '../services/agent/runtime/intentClassificationTypes';

// --- Helper ---

const buildArtifact = (
    overrides: Partial<QueryUnderstandingArtifact>,
): QueryUnderstandingArtifact => ({
    intent: 'precise_card',
    confidence: 'high',
    taskSignal: 'create_chart',
    expectedOutput: 'chart_card',
    referencedColumns: [],
    aggregationFunctions: [],
    groupingColumns: [],
    filterDescription: null,
    subjectRefs: [],
    timeScope: { kind: 'none' },
    comparisonScope: { kind: 'none' },
    needsGrounding: false,
    unresolvedReferences: [],
    reason: 'test',
    classifiedBy: 'ai',
    hasExplicitColumns: false,
    hasAggregationFunction: false,
    hasGroupingDirective: false,
    hasFilterCondition: false,
    ...overrides,
});

// --- resolveTaskMode ---

describe('resolveTaskMode', () => {
    it.each([
        ['create_chart', 'visualize'],
        ['inspect_data', 'inspect'],
        ['explain_existing', 'explain'],
        ['compare_periods', 'period_compare'],
        ['analyze_cohort', 'cohort_retention'],
        ['find_root_cause', 'root_cause_breakdown'],
        ['statistical', 'statistical_analysis'],
        ['derive_metric', 'derive_metric'],
        ['converse', 'inspect'],
    ] as const)('maps %s → %s', (signal, expected) => {
        expect(resolveTaskMode(signal)).toBe(expected);
    });
});

// --- resolveExpectedOutcome ---

describe('resolveExpectedOutcome', () => {
    it.each([
        ['chart_card', 'card'],
        ['data_table', 'table'],
        ['text_answer', 'answer'],
        ['derived_metric', 'derived_metric'],
        ['needs_clarification', 'clarification'],
    ] as const)('maps %s → %s', (output, expected) => {
        expect(resolveExpectedOutcome(output)).toBe(expected);
    });
});

// --- resolveTaskModeFromArtifact ---

describe('resolveTaskModeFromArtifact', () => {
    it('returns null when artifact is undefined', () => {
        expect(resolveTaskModeFromArtifact(undefined, false)).toBeNull();
    });

    it('returns null when artifact confidence is low', () => {
        const artifact = buildArtifact({ confidence: 'low', taskSignal: 'create_chart' });
        expect(resolveTaskModeFromArtifact(artifact, false)).toBeNull();
    });

    it('returns resolved task mode for high confidence artifact', () => {
        const artifact = buildArtifact({ confidence: 'high', taskSignal: 'compare_periods' });
        expect(resolveTaskModeFromArtifact(artifact, false)).toBe('period_compare');
    });

    it('returns resolved task mode for medium confidence artifact', () => {
        const artifact = buildArtifact({ confidence: 'medium', taskSignal: 'find_root_cause' });
        expect(resolveTaskModeFromArtifact(artifact, false)).toBe('root_cause_breakdown');
    });

    it('degrades explain_existing to inspect when no visible evidence', () => {
        const artifact = buildArtifact({ taskSignal: 'explain_existing' });
        expect(resolveTaskModeFromArtifact(artifact, false)).toBe('inspect');
    });

    it('keeps explain_existing when visible evidence exists', () => {
        const artifact = buildArtifact({ taskSignal: 'explain_existing' });
        expect(resolveTaskModeFromArtifact(artifact, true)).toBe('explain');
    });
});

// --- resolveExpectedOutcomeFromArtifact ---

describe('resolveExpectedOutcomeFromArtifact', () => {
    it('returns null when artifact is undefined', () => {
        expect(resolveExpectedOutcomeFromArtifact(undefined)).toBeNull();
    });

    it('returns null when artifact confidence is low', () => {
        const artifact = buildArtifact({ confidence: 'low' });
        expect(resolveExpectedOutcomeFromArtifact(artifact)).toBeNull();
    });

    it('returns resolved outcome for high confidence artifact', () => {
        const artifact = buildArtifact({ expectedOutput: 'data_table' });
        expect(resolveExpectedOutcomeFromArtifact(artifact)).toBe('table');
    });
});

// --- Validation ---

describe('isValidTaskSignal', () => {
    it('accepts valid signals', () => {
        expect(isValidTaskSignal('create_chart')).toBe(true);
        expect(isValidTaskSignal('compare_periods')).toBe(true);
        expect(isValidTaskSignal('converse')).toBe(true);
    });

    it('rejects invalid signals', () => {
        expect(isValidTaskSignal('unknown')).toBe(false);
        expect(isValidTaskSignal('')).toBe(false);
        expect(isValidTaskSignal('VISUALIZE')).toBe(false);
    });
});

describe('isValidExpectedOutput', () => {
    it('accepts valid outputs', () => {
        expect(isValidExpectedOutput('chart_card')).toBe(true);
        expect(isValidExpectedOutput('text_answer')).toBe(true);
    });

    it('rejects invalid outputs', () => {
        expect(isValidExpectedOutput('card')).toBe(false);
        expect(isValidExpectedOutput('')).toBe(false);
    });
});

// --- needsGrounding semantics ---

describe('needsGrounding field semantics', () => {
    it('explicit entity + explicit time = needsGrounding false', () => {
        const artifact = buildArtifact({
            subjectRefs: ['TRF_CBE_2025'],
            timeScope: { kind: 'explicit', value: 'Q1 2024' },
            comparisonScope: { kind: 'none' },
            unresolvedReferences: [],
            needsGrounding: false,
        });
        expect(artifact.needsGrounding).toBe(false);
    });

    it('relative time scope = needsGrounding true', () => {
        const artifact = buildArtifact({
            timeScope: { kind: 'relative', value: 'this month' },
            unresolvedReferences: ['this month'],
            needsGrounding: true,
        });
        expect(artifact.needsGrounding).toBe(true);
    });

    it('dataset_relative time scope = needsGrounding true', () => {
        const artifact = buildArtifact({
            timeScope: { kind: 'dataset_relative', value: 'latest period' },
            unresolvedReferences: ['latest period'],
            needsGrounding: true,
        });
        expect(artifact.needsGrounding).toBe(true);
    });

    it('previous_card comparison = needsGrounding true', () => {
        const artifact = buildArtifact({
            comparisonScope: { kind: 'previous_card', value: 'previous card' },
            unresolvedReferences: ['previous card'],
            needsGrounding: true,
        });
        expect(artifact.needsGrounding).toBe(true);
    });

    it('previous_period comparison with explicit time = needsGrounding false when no unresolved refs', () => {
        // "compare Q1 2024 vs Q1 2023" — both periods are explicit
        const artifact = buildArtifact({
            timeScope: { kind: 'explicit', value: 'Q1 2024' },
            comparisonScope: { kind: 'previous_period', value: 'vs Q1 2023' },
            unresolvedReferences: [],
            needsGrounding: false,
        });
        expect(artifact.needsGrounding).toBe(false);
    });

    it('subjectRefs alone does not trigger needsGrounding', () => {
        const artifact = buildArtifact({
            subjectRefs: ['Revenue', 'Region'],
            timeScope: { kind: 'none' },
            comparisonScope: { kind: 'none' },
            unresolvedReferences: [],
            needsGrounding: false,
        });
        expect(artifact.needsGrounding).toBe(false);
    });
});
