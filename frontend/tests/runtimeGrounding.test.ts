// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveGrounding, deriveGroundedExpectedOutput } from '../services/agent/runtime/runtimeGrounding';
import type { QueryUnderstandingArtifact } from '../services/agent/runtime/intentClassificationTypes';
import type { RuntimeContractState } from '../services/agent/runtime/runtimeToolExposurePolicy';

// --- Helpers ---

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

const buildState = (
    overrides: Partial<RuntimeContractState>,
): Partial<RuntimeContractState> => ({
    columnProfiles: [],
    csvData: undefined,
    analysisCards: [],
    activeDataQuery: null,
    queryHistory: [],
    datasetSemanticSnapshot: undefined,
    ...overrides,
});

// --- No grounding needed ---

describe('resolveGrounding — no grounding needed', () => {
    it('returns none confidence when needsGrounding is false', () => {
        const result = resolveGrounding(
            buildArtifact({ needsGrounding: false }),
            buildState({}),
        );
        expect(result.groundingConfidence).toBe('none');
        expect(result.resolvedAnchors).toHaveLength(0);
        expect(result.unresolvedAnchors).toHaveLength(0);
    });
});

// --- Time resolver ---

describe('resolveGrounding — time resolver', () => {
    it('resolves "this month" to max date month from date column', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'this month' },
                unresolvedReferences: ['this month'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: {
                    data: [
                        { Date: '2026-03-15' },
                        { Date: '2026-02-10' },
                        { Date: '2026-01-05' },
                    ],
                } as any,
            }),
        );

        expect(result.groundingConfidence).toBe('high');
        expect(result.resolvedAnchors).toHaveLength(1);
        expect(result.resolvedAnchors[0].type).toBe('time');
        expect(result.resolvedAnchors[0].resolved).toBe('2026-03');
        expect(result.resolvedAnchors[0].column).toBe('Date');
        expect(result.unresolvedAnchors).toHaveLength(0);
    });

    it('resolves "last month" to previous month', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'last month' },
                unresolvedReferences: ['last month'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: {
                    data: [{ Date: '2026-03-15' }],
                } as any,
            }),
        );

        expect(result.resolvedAnchors[0].resolved).toBe('2026-02');
    });

    it('resolves "last quarter" to previous quarter', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'last quarter' },
                unresolvedReferences: ['last quarter'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: {
                    data: [{ Date: '2026-03-15' }],
                } as any,
            }),
        );

        // Q1 2026 → previous is Q4 2025
        expect(result.resolvedAnchors[0].resolved).toBe('2025-Q4');
    });

    it('returns unresolved when no date column exists', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'this month' },
                unresolvedReferences: ['this month'],
            }),
            buildState({
                columnProfiles: [{ name: 'Region', type: 'categorical' }] as any,
            }),
        );

        expect(result.unresolvedAnchors).toContain('this month');
        expect(result.groundingConfidence).toBe('low');
    });

    it('resolves "this month" correctly even when max date is beyond row 200', () => {
        // Build 250 rows where the max date is at row 220
        const rows = Array.from({ length: 250 }, (_, i) => ({
            Date: i === 220 ? '2026-12-31' : '2025-01-15',
        }));
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'this month' },
                unresolvedReferences: ['this month'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: { data: rows } as any,
            }),
        );

        expect(result.resolvedAnchors).toHaveLength(1);
        expect(result.resolvedAnchors[0].resolved).toBe('2026-12');
    });

    it('skips grounding for explicit time scope', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'explicit', value: 'Q1 2024' },
                unresolvedReferences: ['some other ref'],
                comparisonScope: { kind: 'previous_card', value: 'previous card' },
            }),
            buildState({
                analysisCards: [{ id: 'c1', plan: { title: 'Revenue Chart' } }] as any,
            }),
        );

        // Time should NOT be resolved (explicit = self-contained)
        const timeAnchors = result.resolvedAnchors.filter(a => a.type === 'time');
        expect(timeAnchors).toHaveLength(0);
    });
});

// --- Card resolver ---

describe('resolveGrounding — card resolver', () => {
    it('resolves "previous card" to the newest card (index 0, cards are prepended)', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                comparisonScope: { kind: 'previous_card', value: 'previous card' },
                unresolvedReferences: ['previous card'],
            }),
            buildState({
                // Cards are prepended: c1 is newest, c2 is oldest
                analysisCards: [
                    { id: 'c1', plan: { title: 'Revenue by Region' } },
                    { id: 'c2', plan: { title: 'Cost Breakdown' } },
                ] as any,
            }),
        );

        expect(result.resolvedAnchors).toHaveLength(1);
        expect(result.resolvedAnchors[0].type).toBe('card');
        expect(result.resolvedAnchors[0].resolved).toBe('Revenue by Region');
        expect(result.resolvedAnchors[0].cardId).toBe('c1');
        expect(result.unresolvedAnchors).toHaveLength(0);
    });

    it('returns unresolved when no cards exist', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                comparisonScope: { kind: 'previous_card', value: 'previous card' },
                unresolvedReferences: ['previous card'],
            }),
            buildState({ analysisCards: [] }),
        );

        expect(result.unresolvedAnchors).toContain('previous card');
    });

    it('resolves "previous result" to active query', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                comparisonScope: { kind: 'previous_result', value: 'that result' },
                unresolvedReferences: ['that result'],
            }),
            buildState({
                activeDataQuery: {
                    explanation: 'SUM of Revenue by Region',
                } as any,
            }),
        );

        expect(result.resolvedAnchors[0].type).toBe('query');
        expect(result.resolvedAnchors[0].resolved).toBe('SUM of Revenue by Region');
    });

    it('resolves "previous result" to the LAST queryHistory entry when no activeDataQuery', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                comparisonScope: { kind: 'previous_result', value: 'that result' },
                unresolvedReferences: ['that result'],
            }),
            buildState({
                activeDataQuery: null,
                queryHistory: [
                    { id: 'q1', explanation: 'oldest query' },
                    { id: 'q2', explanation: 'middle query' },
                    { id: 'q3', explanation: 'most recent query' },
                ] as any,
            }),
        );

        expect(result.resolvedAnchors[0].type).toBe('query');
        expect(result.resolvedAnchors[0].resolved).toBe('most recent query');
    });
});

// --- Entity resolver ---

describe('resolveGrounding — entity resolver', () => {
    it('resolves entity reference against categorical column values', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                subjectRefs: ['SALES-EUROPE'],
                unresolvedReferences: ['SALES-EUROPE'],
            }),
            buildState({
                columnProfiles: [
                    { name: 'Region', type: 'categorical', uniqueValues: 10 },
                ] as any,
                csvData: {
                    data: [
                        { Region: 'SALES-EUROPE' },
                        { Region: 'SALES-ASIA' },
                        { Region: 'SALES-US' },
                    ],
                } as any,
            }),
        );

        expect(result.resolvedAnchors).toHaveLength(1);
        expect(result.resolvedAnchors[0].type).toBe('entity');
        expect(result.resolvedAnchors[0].resolved).toBe('SALES-EUROPE');
        expect(result.resolvedAnchors[0].column).toBe('Region');
        expect(result.resolvedAnchors[0].confidence).toBe('high');
    });

    it('returns unresolved when entity not found in data', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                subjectRefs: ['UNKNOWN-ENTITY'],
                unresolvedReferences: ['UNKNOWN-ENTITY'],
            }),
            buildState({
                columnProfiles: [
                    { name: 'Region', type: 'categorical', uniqueValues: 5 },
                ] as any,
                csvData: {
                    data: [{ Region: 'US' }, { Region: 'EU' }],
                } as any,
            }),
        );

        expect(result.unresolvedAnchors).toContain('UNKNOWN-ENTITY');
    });

    it('skips subjectRefs that are already referenced columns', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                subjectRefs: ['Revenue'],
                referencedColumns: ['Revenue'],
                unresolvedReferences: ['some other thing'],
            }),
            buildState({
                columnProfiles: [
                    { name: 'Revenue', type: 'currency' },
                ] as any,
            }),
        );

        // Revenue is already a referencedColumn — entity resolver should skip it
        const entityAnchors = result.resolvedAnchors.filter(a => a.type === 'entity');
        expect(entityAnchors).toHaveLength(0);
    });
});

// --- Overall confidence ---

describe('resolveGrounding — overall confidence', () => {
    it('high when all references resolved with high confidence', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'this month' },
                unresolvedReferences: ['this month'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: { data: [{ Date: '2026-03-15' }] } as any,
            }),
        );

        expect(result.groundingConfidence).toBe('high');
    });

    it('medium when some resolved and some not', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'this month' },
                subjectRefs: ['unknown-thing'],
                unresolvedReferences: ['this month', 'unknown-thing'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: { data: [{ Date: '2026-03-15' }] } as any,
            }),
        );

        expect(result.groundingConfidence).toBe('medium');
        expect(result.resolvedAnchors.length).toBeGreaterThan(0);
        expect(result.unresolvedAnchors.length).toBeGreaterThan(0);
    });

    it('low when nothing resolved but refs exist', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                unresolvedReferences: ['that thing', 'the other thing'],
            }),
            buildState({}),
        );

        expect(result.groundingConfidence).toBe('low');
    });

    it('groundingSummary includes resolved anchors', () => {
        const result = resolveGrounding(
            buildArtifact({
                needsGrounding: true,
                timeScope: { kind: 'relative', value: 'this month' },
                unresolvedReferences: ['this month'],
            }),
            buildState({
                columnProfiles: [{ name: 'Date', type: 'date' }] as any,
                csvData: { data: [{ Date: '2026-03-15' }] } as any,
            }),
        );

        expect(result.groundingSummary).toContain('[Grounding]');
        expect(result.groundingSummary).toContain('this month');
        expect(result.groundingSummary).toContain('2026-03');
    });
});

// ─── AGENT-206: deriveGroundedExpectedOutput ────────────────────────

describe('deriveGroundedExpectedOutput', () => {
    const fullyGrounded: import('../services/agent/runtime/intentClassificationTypes').GroundingResult = {
        resolvedAnchors: [{ type: 'time', raw: 'this month', resolved: '2026-03', column: 'Date', cardId: null, confidence: 'high' }],
        unresolvedAnchors: [],
        groundingConfidence: 'high',
        groundingSummary: '[Grounding] this month → 2026-03',
    };

    const partialGrounded: import('../services/agent/runtime/intentClassificationTypes').GroundingResult = {
        resolvedAnchors: [{ type: 'time', raw: 'this month', resolved: '2026-03', column: 'Date', cardId: null, confidence: 'high' }],
        unresolvedAnchors: ['that campaign'],
        groundingConfidence: 'low',
        groundingSummary: '[Grounding] this month → 2026-03',
    };

    it('returns derived_metric for derive_metric taskSignal (AGENT-206)', () => {
        const result = deriveGroundedExpectedOutput(fullyGrounded, 'needs_clarification', 'derive_metric');
        expect(result).toBe('derived_metric');
    });

    it('returns chart_card for create_chart taskSignal', () => {
        const result = deriveGroundedExpectedOutput(fullyGrounded, 'needs_clarification', 'create_chart');
        expect(result).toBe('chart_card');
    });

    it('returns chart_card for compare_periods taskSignal', () => {
        const result = deriveGroundedExpectedOutput(fullyGrounded, 'needs_clarification', 'compare_periods');
        expect(result).toBe('chart_card');
    });

    it('returns data_table for inspect_data taskSignal', () => {
        const result = deriveGroundedExpectedOutput(fullyGrounded, 'needs_clarification', 'inspect_data');
        expect(result).toBe('data_table');
    });

    it('returns text_answer for converse taskSignal', () => {
        const result = deriveGroundedExpectedOutput(fullyGrounded, 'needs_clarification', 'converse');
        expect(result).toBe('text_answer');
    });

    it('returns null when expectedOutput is not needs_clarification', () => {
        expect(deriveGroundedExpectedOutput(fullyGrounded, 'chart_card', 'create_chart')).toBeNull();
        expect(deriveGroundedExpectedOutput(fullyGrounded, 'derived_metric', 'derive_metric')).toBeNull();
    });

    it('returns null when grounding has unresolved anchors', () => {
        expect(deriveGroundedExpectedOutput(partialGrounded, 'needs_clarification', 'derive_metric')).toBeNull();
    });

    it('returns null when grounding is undefined', () => {
        expect(deriveGroundedExpectedOutput(undefined, 'needs_clarification', 'derive_metric')).toBeNull();
    });
});

// ─── AGENT-207: resolveExpectedOutcomeFromArtifact with grounding ───

import { resolveExpectedOutcomeFromArtifact } from '../services/agent/runtime/queryUnderstandingResolver';

describe('resolveExpectedOutcomeFromArtifact with grounding (AGENT-207)', () => {
    const fullyGrounded: import('../services/agent/runtime/intentClassificationTypes').GroundingResult = {
        resolvedAnchors: [{ type: 'time', raw: 'this month', resolved: '2026-03', column: 'Date', cardId: null, confidence: 'high' }],
        unresolvedAnchors: [],
        groundingConfidence: 'high',
        groundingSummary: '[Grounding] this month → 2026-03',
    };

    it('resolves needs_clarification to derived_metric when grounding resolves derive_metric', () => {
        const artifact = buildArtifact({
            taskSignal: 'derive_metric',
            expectedOutput: 'needs_clarification',
            confidence: 'high',
        });
        const result = resolveExpectedOutcomeFromArtifact(artifact, fullyGrounded);
        expect(result).toBe('derived_metric');
    });

    it('resolves needs_clarification to card when grounding resolves create_chart', () => {
        const artifact = buildArtifact({
            taskSignal: 'create_chart',
            expectedOutput: 'needs_clarification',
            confidence: 'high',
        });
        const result = resolveExpectedOutcomeFromArtifact(artifact, fullyGrounded);
        expect(result).toBe('card');
    });

    it('resolves needs_clarification to clarification when grounding is absent', () => {
        const artifact = buildArtifact({
            taskSignal: 'derive_metric',
            expectedOutput: 'needs_clarification',
            confidence: 'high',
        });
        const result = resolveExpectedOutcomeFromArtifact(artifact);
        expect(result).toBe('clarification');
    });

    it('returns null for low-confidence artifacts regardless of grounding', () => {
        const artifact = buildArtifact({
            taskSignal: 'derive_metric',
            expectedOutput: 'needs_clarification',
            confidence: 'low',
        });
        expect(resolveExpectedOutcomeFromArtifact(artifact, fullyGrounded)).toBeNull();
    });

    it('resolves chart_card directly without grounding adjustment', () => {
        const artifact = buildArtifact({
            taskSignal: 'create_chart',
            expectedOutput: 'chart_card',
            confidence: 'high',
        });
        // deriveGroundedExpectedOutput returns null for non-needs_clarification,
        // so the fallback is the original expectedOutput.
        const result = resolveExpectedOutcomeFromArtifact(artifact, fullyGrounded);
        expect(result).toBe('card');
    });
});
