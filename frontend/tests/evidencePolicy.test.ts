/**
 * AGENT-104: Three-layer evidence model tests.
 *
 * Verifies that:
 * - Layer 1 (trace): queryHistory, contextualSummary only
 * - Layer 2 (grounded): activeDataQuery, cards, metric validation, spreadsheet filter only
 * - Layer 3 (answerable): grounded artifacts matching current question intent
 * - Detection functions correctly classify evidence layers
 * - Backward-compat functions still work
 */

import { describe, it, expect } from 'vitest';
import type { RuntimeStepContract } from '../types';
import type { RuntimeContractState } from '../services/agent/runtime/runtimeToolExposurePolicy';
import {
    hasAnswerableEvidence,
    hasGroundedArtifacts,
    hasUsableEvidence,
    hasVisibleEvidence,
    hasVisibleTrace,
    summarizeAnswerableEvidence,
    summarizeGroundedArtifacts,
    summarizeVisibleEvidence,
    summarizeVisibleTrace,
} from '../services/agent/runtime/runtimeEvidencePolicy';

// ─── Minimal mock state factories ──────────────────────────────
// Using Partial<RuntimeContractState> with type casts for brevity.

type S = Partial<RuntimeContractState>;

const emptyState = (): S => ({});

const stateWithQueryHistory = (count = 3): S => ({
    queryHistory: Array.from({ length: count }, (_, i) => ({
        id: `qt-${i}`,
        explanation: `Query ${i}`,
        engine: 'duckdb',
        result: { totalMatchedRows: 10, returnedRows: 10, truncated: false, selectedColumns: ['col_a'], appliedOrderBy: [], durationMs: 5, previewRows: [] },
    })) as unknown as RuntimeContractState['queryHistory'],
});

const stateWithContextualSummary = (): S => ({
    contextualSummary: 'Revenue data for Q1-Q4 across 3 regions.',
});

const stateWithActiveDataQuery = (explanation = 'Total revenue by region', selectedColumns = ['region', 'revenue']): S => ({
    activeDataQuery: {
        explanation,
        engine: 'duckdb',
        result: { totalMatchedRows: 5, returnedRows: 5, truncated: false, selectedColumns, appliedOrderBy: [], rows: [], durationMs: 3 },
    } as unknown as RuntimeContractState['activeDataQuery'],
});

const stateWithCards = (count = 2): S => ({
    analysisCards: Array.from({ length: count }, (_, i) => ({
        id: `card-${i}`,
        plan: { title: `Revenue by Region ${i}`, groupByColumn: 'region', valueColumn: 'revenue' },
        aggregatedData: [],
        displayChartType: 'bar',
    })) as unknown as RuntimeContractState['analysisCards'],
});

const stateWithMetricValidation = (metricName = 'profit'): S => ({
    activeMetricMappingValidation: {
        metricName,
        recommendedAction: 'derive_metric',
        recommendedPath: 'derive_column_then_plan',
        grain: ['region'],
        blockers: [],
        requestFingerprint: 'test',
    } as unknown as RuntimeContractState['activeMetricMappingValidation'],
});

const stateWithSpreadsheetFilter = (): S => ({
    activeSpreadsheetFilter: {
        query: 'filter by region = East',
        observation: { matchedRowCount: 10, selectedColumn: 'region', operator: '=', value: 'East', previewRows: [] },
    } as unknown as RuntimeContractState['activeSpreadsheetFilter'],
});

// ─── Layer 1: Visible Trace ────────────────────────────────────

describe('hasVisibleTrace', () => {
    it('returns false for empty state', () => {
        expect(hasVisibleTrace(emptyState())).toBe(false);
    });

    it('returns true when queryHistory has entries', () => {
        expect(hasVisibleTrace(stateWithQueryHistory())).toBe(true);
    });

    it('returns true when contextualSummary is present', () => {
        expect(hasVisibleTrace(stateWithContextualSummary())).toBe(true);
    });

    it('returns false when only activeDataQuery is present (not trace)', () => {
        expect(hasVisibleTrace(stateWithActiveDataQuery())).toBe(false);
    });

    it('returns false when only cards are present (not trace)', () => {
        expect(hasVisibleTrace(stateWithCards())).toBe(false);
    });
});

describe('summarizeVisibleTrace', () => {
    it('returns no-trace message for empty state', () => {
        expect(summarizeVisibleTrace(emptyState())).toBe('No session trace.');
    });

    it('includes query history count', () => {
        const result = summarizeVisibleTrace(stateWithQueryHistory(5));
        expect(result).toContain('5 recent query trace(s)');
    });

    it('includes context summary signal', () => {
        const result = summarizeVisibleTrace(stateWithContextualSummary());
        expect(result).toContain('Context summary available.');
    });

    it('does NOT include activeDataQuery', () => {
        const result = summarizeVisibleTrace(stateWithActiveDataQuery());
        expect(result).toBe('No session trace.');
    });

    it('does NOT include analysis cards', () => {
        const result = summarizeVisibleTrace(stateWithCards());
        expect(result).toBe('No session trace.');
    });
});

// ─── Layer 2: Grounded Artifacts ───────────────────────────────

describe('hasGroundedArtifacts', () => {
    it('returns false for empty state', () => {
        expect(hasGroundedArtifacts(emptyState())).toBe(false);
    });

    it('returns true with activeDataQuery', () => {
        expect(hasGroundedArtifacts(stateWithActiveDataQuery())).toBe(true);
    });

    it('returns true with analysis cards', () => {
        expect(hasGroundedArtifacts(stateWithCards())).toBe(true);
    });

    it('returns true with metric validation', () => {
        expect(hasGroundedArtifacts(stateWithMetricValidation())).toBe(true);
    });

    it('returns true with spreadsheet filter', () => {
        expect(hasGroundedArtifacts(stateWithSpreadsheetFilter())).toBe(true);
    });

    it('returns false when only queryHistory is present (not artifact)', () => {
        expect(hasGroundedArtifacts(stateWithQueryHistory())).toBe(false);
    });

    it('returns false when only contextualSummary is present (not artifact)', () => {
        expect(hasGroundedArtifacts(stateWithContextualSummary())).toBe(false);
    });
});

describe('summarizeGroundedArtifacts', () => {
    it('returns no-artifacts message for empty state', () => {
        expect(summarizeGroundedArtifacts(emptyState())).toBe('No grounded artifacts.');
    });

    it('includes data.query signal', () => {
        const result = summarizeGroundedArtifacts(stateWithActiveDataQuery());
        expect(result).toContain('data.query result is visible');
    });

    it('includes card count', () => {
        const result = summarizeGroundedArtifacts(stateWithCards(3));
        expect(result).toContain('3 analysis card(s)');
    });

    it('does NOT include queryHistory', () => {
        const result = summarizeGroundedArtifacts(stateWithQueryHistory());
        expect(result).toBe('No grounded artifacts.');
    });
});

// ─── Layer 3: Answerable Evidence ──────────────────────────────

const defaultIntent = { goalSummary: 'Show revenue by region', taskMode: 'visualize', expectedOutcome: 'card' };

describe('hasAnswerableEvidence', () => {
    it('returns false for empty state', () => {
        expect(hasAnswerableEvidence(emptyState(), defaultIntent)).toBe(false);
    });

    it('returns false when only trace exists', () => {
        expect(hasAnswerableEvidence(stateWithQueryHistory(), defaultIntent)).toBe(false);
    });

    it('returns true when activeDataQuery columns overlap with question', () => {
        expect(hasAnswerableEvidence(
            stateWithActiveDataQuery('Total revenue by region', ['region', 'revenue']),
            { goalSummary: 'Show revenue by region', taskMode: 'inspect', expectedOutcome: 'card' },
        )).toBe(true);
    });

    it('returns false when activeDataQuery is about a different topic', () => {
        expect(hasAnswerableEvidence(
            stateWithActiveDataQuery('Customer count by segment', ['segment', 'count']),
            { goalSummary: 'Show revenue by region', taskMode: 'inspect', expectedOutcome: 'card' },
        )).toBe(false);
    });
});

describe('summarizeAnswerableEvidence', () => {
    it('returns no-evidence message for empty state', () => {
        const result = summarizeAnswerableEvidence(emptyState(), defaultIntent);
        expect(result).toContain('No answerable evidence');
    });

    it('identifies relevant activeDataQuery', () => {
        const result = summarizeAnswerableEvidence(
            stateWithActiveDataQuery('Revenue by region', ['region', 'revenue']),
            { goalSummary: 'What is the total revenue?', taskMode: 'inspect', expectedOutcome: 'answer' },
        );
        expect(result).toContain('relevant');
    });

    it('identifies relevant metric validation', () => {
        const result = summarizeAnswerableEvidence(
            stateWithMetricValidation('profit'),
            { goalSummary: 'Show profit margin', taskMode: 'visualize', expectedOutcome: 'card' },
        );
        expect(result).toContain('profit');
    });
});

// ─── Backward Compatibility ────────────────────────────────────

describe('backward-compat: summarizeVisibleEvidence', () => {
    it('combines trace and artifacts', () => {
        const state = { ...stateWithQueryHistory(2), ...stateWithActiveDataQuery() };
        const result = summarizeVisibleEvidence(state);
        expect(result).toContain('query trace');
        expect(result).toContain('data.query result');
    });

    it('returns empty message when no evidence at all', () => {
        expect(summarizeVisibleEvidence(emptyState())).toBe('No visible evidence is available yet.');
    });
});

describe('backward-compat: hasVisibleEvidence', () => {
    it('returns true when only trace exists', () => {
        expect(hasVisibleEvidence(stateWithQueryHistory())).toBe(true);
    });

    it('returns true when only artifacts exist', () => {
        expect(hasVisibleEvidence(stateWithActiveDataQuery())).toBe(true);
    });

    it('returns false for empty state', () => {
        expect(hasVisibleEvidence(emptyState())).toBe(false);
    });
});

// ─── Key behavioral guarantee: lowInformationFollowUp ──────────

describe('evidence layer separation for contract decisions', () => {
    it('queryHistory alone → hasVisibleTrace true, hasGroundedArtifacts false', () => {
        const state = stateWithQueryHistory();
        expect(hasVisibleTrace(state)).toBe(true);
        expect(hasGroundedArtifacts(state)).toBe(false);
        // This ensures lowInformationFollowUp will NOT trigger
        // when only trace exists (the KEY behavioral change of AGENT-104)
    });

    it('activeDataQuery → hasVisibleTrace false, hasGroundedArtifacts true', () => {
        const state = stateWithActiveDataQuery();
        expect(hasVisibleTrace(state)).toBe(false);
        expect(hasGroundedArtifacts(state)).toBe(true);
    });

    it('both trace + artifacts → both true', () => {
        const state = { ...stateWithQueryHistory(), ...stateWithActiveDataQuery() };
        expect(hasVisibleTrace(state)).toBe(true);
        expect(hasGroundedArtifacts(state)).toBe(true);
    });
});

// ─── AGENT-104A: lowInformationFollowUp must pass answerableEvidence ──

describe('answerable evidence — specific questions (keyword matching)', () => {
    it('unrelated artifact → hasAnswerableEvidence false', () => {
        const state = stateWithActiveDataQuery('Revenue by region', ['region', 'revenue']);
        expect(hasGroundedArtifacts(state)).toBe(true);
        expect(hasAnswerableEvidence(state, {
            goalSummary: 'What is the profit margin?',
            taskMode: 'inspect',
            expectedOutcome: 'answer',
        })).toBe(false);
    });

    it('relevant artifact → hasAnswerableEvidence true', () => {
        const state = stateWithActiveDataQuery('Revenue by region', ['region', 'revenue']);
        expect(hasAnswerableEvidence(state, {
            goalSummary: 'Show revenue by region',
            taskMode: 'inspect',
            expectedOutcome: 'card',
        })).toBe(true);
    });
});

describe('answerable evidence — follow-up path (isFollowUp=true)', () => {
    const followUpIntent = (goal = 'tell me more') => ({
        goalSummary: goal,
        taskMode: 'explain' as string,
        expectedOutcome: 'answer' as string,
        isFollowUp: true,
    });

    it('activeDataQuery present → answerable for follow-up', () => {
        const state = stateWithActiveDataQuery('Top transactions', ['vendor', 'amount']);
        expect(hasAnswerableEvidence(state, followUpIntent())).toBe(true);
    });

    it('only stale cards (no active query/filter) → NOT answerable for follow-up', () => {
        const state = stateWithCards(3);
        expect(hasGroundedArtifacts(state)).toBe(true);
        expect(hasAnswerableEvidence(state, followUpIntent())).toBe(false);
    });

    it('only trace (no artifacts) → NOT answerable for follow-up', () => {
        const state = stateWithQueryHistory();
        expect(hasAnswerableEvidence(state, followUpIntent())).toBe(false);
    });

    it('metric validation present → answerable for follow-up', () => {
        const state = stateWithMetricValidation('profit');
        expect(hasAnswerableEvidence(state, followUpIntent())).toBe(true);
    });

    it('spreadsheet filter present → answerable for follow-up', () => {
        const state = stateWithSpreadsheetFilter();
        expect(hasAnswerableEvidence(state, followUpIntent())).toBe(true);
    });

    it('cards + activeDataQuery → answerable (activeDataQuery is the target)', () => {
        const state = { ...stateWithCards(2), ...stateWithActiveDataQuery() };
        expect(hasAnswerableEvidence(state, followUpIntent())).toBe(true);
    });
});

// ─── Review fix: hasUsableEvidence trace-only contract ──────────

describe('hasUsableEvidence — trace-only contracts', () => {
    const makeContract = (overrides: Partial<RuntimeStepContract> = {}): RuntimeStepContract => ({
        goalSummary: 'Test goal',
        taskMode: 'inspect',
        completionMode: 'respond_or_act',
        expectedOutcome: 'answer',
        allowedToolNames: ['data.query'],
        denyOverrides: [],
        allowAssistantResponse: true,
        preferClarification: false,
        antiRepeatHint: '',
        visibleEvidenceSummary: null,
        visibleTraceSummary: null,
        groundedArtifactSummary: null,
        answerableEvidenceSummary: null,
        knownBlockers: [],
        instruction: '',
        ...overrides,
    } as RuntimeStepContract);

    it('trace-only contract → hasUsableEvidence returns false', () => {
        const contract = makeContract({
            visibleTraceSummary: 'There are 3 recent query trace(s).',
            groundedArtifactSummary: null, // no grounded artifacts
            visibleEvidenceSummary: 'There are 3 recent query trace(s).', // trace leaks into compat field
        });
        expect(hasUsableEvidence(contract)).toBe(false);
    });

    it('contract with grounded artifacts → hasUsableEvidence returns true', () => {
        const contract = makeContract({
            groundedArtifactSummary: 'A data.query result is visible.',
        });
        expect(hasUsableEvidence(contract)).toBe(true);
    });

    it('empty contract → hasUsableEvidence returns false', () => {
        const contract = makeContract();
        expect(hasUsableEvidence(contract)).toBe(false);
    });

    it('contract with only visibleEvidenceSummary (no groundedArtifactSummary) → false', () => {
        // This is the key regression test: old code would return true for any
        // non-empty visibleEvidenceSummary, even if it was trace-only.
        const contract = makeContract({
            visibleEvidenceSummary: 'Context summary available. There are 5 recent query trace(s).',
            groundedArtifactSummary: null,
        });
        expect(hasUsableEvidence(contract)).toBe(false);
    });
});
