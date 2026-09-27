/**
 * Query Understanding Resolver — deterministic mapping from AI-produced
 * task signals to runtime contract fields.
 *
 * Pure functions, no AI calls, independently testable.
 * Part of AGENT-101: Query Understanding Artifact.
 *
 * Pattern: AI tells us WHAT the user wants (QueryTaskSignal / QueryExpectedOutput),
 * this module maps it deterministically to HOW the runtime executes (RuntimeTaskMode / RuntimeExpectedOutcome).
 */

import type { RuntimeExpectedOutcome, RuntimeTaskMode } from '../../../types';
import type { GroundingResult, QueryExpectedOutput, QueryTaskSignal, QueryUnderstandingArtifact } from './intentClassificationTypes';
import { deriveGroundedExpectedOutput } from './runtimeGrounding';

// --- Task signal → RuntimeTaskMode ---

const TASK_SIGNAL_MAP: Record<QueryTaskSignal, RuntimeTaskMode> = {
    create_chart: 'visualize',
    inspect_data: 'inspect',
    explain_existing: 'explain',
    compare_periods: 'period_compare',
    analyze_cohort: 'cohort_retention',
    find_root_cause: 'root_cause_breakdown',
    statistical: 'statistical_analysis',
    derive_metric: 'derive_metric',
    answer_scalar: 'inspect',
    converse: 'inspect',
};

/**
 * Resolve a QueryTaskSignal to a RuntimeTaskMode.
 * Falls back to 'inspect' for unknown signals.
 */
export const resolveTaskMode = (taskSignal: QueryTaskSignal): RuntimeTaskMode =>
    TASK_SIGNAL_MAP[taskSignal] ?? 'inspect';

// --- Expected output → RuntimeExpectedOutcome ---

const EXPECTED_OUTPUT_MAP: Record<QueryExpectedOutput, RuntimeExpectedOutcome> = {
    chart_card: 'card',
    data_table: 'table',
    text_answer: 'answer',
    scalar_answer: 'answer',
    derived_metric: 'derived_metric',
    needs_clarification: 'clarification',
};

/**
 * Resolve a QueryExpectedOutput to a RuntimeExpectedOutcome.
 * Falls back to 'answer' for unknown outputs.
 */
export const resolveExpectedOutcome = (expectedOutput: QueryExpectedOutput): RuntimeExpectedOutcome =>
    EXPECTED_OUTPUT_MAP[expectedOutput] ?? 'answer';

// --- Artifact-level resolution with safety overrides ---

/**
 * Resolve task mode from artifact with contextual safety overrides.
 *
 * @param artifact - The query understanding artifact from AI classification.
 * @param hasVisibleEvidence - Whether visible evidence exists on screen.
 * @returns The resolved RuntimeTaskMode, or null if the artifact should be skipped (fallback to regex).
 */
export const resolveTaskModeFromArtifact = (
    artifact: QueryUnderstandingArtifact | undefined,
    hasVisibleEvidence: boolean,
): RuntimeTaskMode | null => {
    if (!artifact || artifact.confidence === 'low') {
        return null; // fallback to regex
    }

    const resolved = resolveTaskMode(artifact.taskSignal);

    // Safety override: 'explain' requires visible evidence to explain
    if (resolved === 'explain' && !hasVisibleEvidence) {
        return 'inspect';
    }

    return resolved;
};

/**
 * Resolve expected outcome from artifact.
 *
 * AGENT-207: When grounding resolves all references and the artifact still says
 * `needs_clarification`, apply grounding-aware outcome adjustment here (not in chatOrchestrator).
 * This ensures all entry points (fresh turn, clarification resume) get consistent resolution.
 *
 * @param artifact - The query understanding artifact from AI classification.
 * @param groundingResult - Optional grounding result for reference resolution.
 * @returns The resolved RuntimeExpectedOutcome, or null if the artifact should be skipped (fallback to regex).
 */
export const resolveExpectedOutcomeFromArtifact = (
    artifact: QueryUnderstandingArtifact | undefined,
    groundingResult?: GroundingResult,
): RuntimeExpectedOutcome | null => {
    if (!artifact || artifact.confidence === 'low') {
        return null; // fallback to regex
    }

    // AGENT-207: If grounding resolves all references, adjust the outcome in-place
    // rather than requiring chatOrchestrator to mutate the artifact.
    const effectiveOutput = deriveGroundedExpectedOutput(
        groundingResult,
        artifact.expectedOutput,
        artifact.taskSignal,
    ) ?? artifact.expectedOutput;

    return resolveExpectedOutcome(effectiveOutput);
};

// --- Validation ---

const VALID_TASK_SIGNALS: ReadonlySet<string> = new Set<QueryTaskSignal>([
    'create_chart', 'inspect_data', 'explain_existing', 'compare_periods',
    'analyze_cohort', 'find_root_cause', 'statistical', 'derive_metric', 'answer_scalar', 'converse',
]);

const VALID_EXPECTED_OUTPUTS: ReadonlySet<string> = new Set<QueryExpectedOutput>([
    'chart_card', 'data_table', 'text_answer', 'scalar_answer', 'derived_metric', 'needs_clarification',
]);

/** Check if a string is a valid QueryTaskSignal. */
export const isValidTaskSignal = (value: string): value is QueryTaskSignal =>
    VALID_TASK_SIGNALS.has(value);

/** Check if a string is a valid QueryExpectedOutput. */
export const isValidExpectedOutput = (value: string): value is QueryExpectedOutput =>
    VALID_EXPECTED_OUTPUTS.has(value);
