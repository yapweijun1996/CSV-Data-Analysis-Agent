/**
 * Intent Classification Harness — structured types.
 *
 * Follows the harness engineering pattern:
 *   investigate (classify message) → structured findings → Pi request context.
 *
 * AI-assisted intent classification describes the request for the chat
 * orchestrator, which passes every eligible follow-up to Pi.
 */

// --- Intent categories ---

/**
 * The set of recognised chat intent categories.
 *
 * - `batch_analysis`:  Open-ended exploration ("analyse this data", "show insights").
 *                      Describes an open-ended Pi follow-up request.
 * - `precise_card`:    Specific card request with explicit columns/aggregation/grouping.
 *                      Routes to the Pi follow-up runtime so the AI executes the user's exact spec.
 * - `data_query`:      Row-level lookup / filter ("show rows where X = Y").
 *                      Routes to the Pi follow-up runtime.
 * - `conversation`:    General chat, clarification, or non-analysis message.
 *                      Routes to the Pi follow-up runtime.
 * - `mutation`:        Data mutation (delete rows, restart cleaning).
 *                      Handled before classification by existing mutation checks.
 */
export type ChatIntentCategory =
    | 'batch_analysis'
    | 'precise_card'
    | 'data_query'
    | 'conversation';

// --- Classification findings ---

/** Reason why classification produced an uncertain result. */
export type IntentUncertaintyReason = 'timeout' | 'parse_failure' | 'ai_unavailable' | 'ai_error';

export interface IntentClassificationFindings {
    /** The classified intent category. */
    intent: ChatIntentCategory;
    /** Confidence level of the classification. */
    confidence: 'high' | 'medium' | 'low';
    /** Whether the message contains explicit column references. */
    hasExplicitColumns: boolean;
    /** Whether the message contains aggregation functions (SUM, COUNT, etc.). */
    hasAggregationFunction: boolean;
    /** Whether the message contains grouping directives (group by, grouped by). */
    hasGroupingDirective: boolean;
    /** Whether the message contains filter/where conditions. */
    hasFilterCondition: boolean;
    /** Short explanation of the classification decision (for logging). */
    reason: string;
    /** Classification method used. */
    classifiedBy: 'deterministic' | 'ai';

    // --- BUG-RUNTIME-201: Uncertain classification support ---
    /** Whether AI actually classified or we fell back due to timeout/error. */
    classificationState?: 'resolved' | 'uncertain';
    /** Signal to downstream that dataset/query context should resolve routing. */
    needsGroundedResolution?: boolean;
    /** Fallback intent to use if grounded resolution cannot determine a better intent. */
    fallbackIntent?: ChatIntentCategory;
    /** Why classification is uncertain. */
    uncertaintyReason?: IntentUncertaintyReason;
}

// --- Query Understanding Artifact ---

/**
 * AI-produced task signal — maps deterministically to RuntimeTaskMode.
 * The AI tells us WHAT the user wants; the resolver maps it to HOW the runtime executes.
 */
export type QueryTaskSignal =
    | 'create_chart'        // → visualize
    | 'inspect_data'        // → inspect
    | 'explain_existing'    // → explain
    | 'compare_periods'     // → period_compare
    | 'analyze_cohort'      // → cohort_retention
    | 'find_root_cause'     // → root_cause_breakdown
    | 'statistical'         // → statistical_analysis
    | 'derive_metric'       // → derive_metric
    | 'answer_scalar'       // → inspect (single-entity, single-metric question)
    | 'converse';           // → inspect (fallback)

/**
 * AI-produced expected output shape — maps deterministically to RuntimeExpectedOutcome.
 */
export type QueryExpectedOutput =
    | 'chart_card'          // → card
    | 'data_table'          // → table
    | 'text_answer'         // → answer
    | 'scalar_answer'       // → answer (single-value numeric/text result)
    | 'derived_metric'      // → derived_metric
    | 'needs_clarification';// → clarification

// --- Grounding-ready reference types ---

/** Time scope extracted from user message — typed signal for downstream grounding. */
export interface QueryTimeScope {
    kind: 'explicit' | 'relative' | 'dataset_relative' | 'none';
    /** Raw text from message (e.g. "this month", "Q1 2024", "last year"). */
    value?: string;
}

/** Comparison scope extracted from user message — typed signal for downstream grounding. */
export interface QueryComparisonScope {
    kind: 'previous_card' | 'previous_result' | 'previous_period' | 'none';
    /** Raw text from message (e.g. "vs last month", "compared to the previous card"). */
    value?: string;
}

/**
 * Rich structured understanding of a user message.
 *
 * Produced by the AI intent classifier (Phase 1 of the harness).
 * Consumed by runtimeContractBuilder to derive taskMode and expectedOutcome
 * WITHOUT regex re-derivation.
 *
 * Grounding-ready: carries typed reference signals (subjectRefs, timeScope,
 * comparisonScope, unresolvedReferences) that AGENT-102 Follow-up Grounding
 * can consume to resolve into concrete anchors. This artifact does NOT resolve
 * references — it classifies them as typed signals.
 *
 * Backward compatible: includes all IntentClassificationFindings fields.
 */
export interface QueryUnderstandingArtifact {
    /** Coarse intent category (backward compat with IntentClassificationFindings). */
    intent: ChatIntentCategory;
    /** Confidence level — AI-reported then validated by local completeness check. */
    confidence: 'high' | 'medium' | 'low';
    /** AI-determined task signal — replaces regex task mode derivation. */
    taskSignal: QueryTaskSignal;
    /** AI-determined expected output shape — replaces regex expected outcome derivation. */
    expectedOutput: QueryExpectedOutput;
    /** Column names the user explicitly referenced (matched against dataset schema). */
    referencedColumns: string[];
    /** Aggregation functions detected (e.g. ['SUM', 'COUNT']). */
    aggregationFunctions: string[];
    /** Grouping target columns detected (e.g. ['Region', 'Month']). */
    groupingColumns: string[];
    /** Natural language description of filter conditions, or null if none. */
    filterDescription: string | null;
    // --- Grounding-ready fields (consumed by AGENT-102) ---
    /** Subject references: entities the user refers to (card, metric, campaign, column, etc.). */
    subjectRefs: string[];
    /** Time scope signal — "this month", "Q1", "last year", etc. */
    timeScope: QueryTimeScope;
    /** Comparison scope signal — "vs last month", "previous card", etc. */
    comparisonScope: QueryComparisonScope;
    /** Whether the message contains unresolved references that need grounding. */
    needsGrounding: boolean;
    /** Raw unresolved reference phrases the AI detected (e.g. ["this month", "that campaign"]). */
    unresolvedReferences: string[];
    /** Short explanation of the classification decision (for logging). */
    reason: string;
    /** Classification method used. */
    classifiedBy: 'ai' | 'deterministic';
    // --- Backward compat boolean signals ---
    /** Whether the message contains explicit column references. */
    hasExplicitColumns: boolean;
    /** Whether the message contains aggregation functions (SUM, COUNT, etc.). */
    hasAggregationFunction: boolean;
    /** Whether the message contains grouping directives (group by, grouped by). */
    hasGroupingDirective: boolean;
    /** Whether the message contains filter/where conditions. */
    hasFilterCondition: boolean;
}

/** Project a rich QueryUnderstandingArtifact down to the legacy IntentClassificationFindings. */
export const projectToIntentFindings = (
    artifact: QueryUnderstandingArtifact,
): IntentClassificationFindings => ({
    intent: artifact.intent,
    confidence: artifact.confidence,
    hasExplicitColumns: artifact.hasExplicitColumns,
    hasAggregationFunction: artifact.hasAggregationFunction,
    hasGroupingDirective: artifact.hasGroupingDirective,
    hasFilterCondition: artifact.hasFilterCondition,
    reason: artifact.reason,
    classifiedBy: artifact.classifiedBy,
});

// --- Grounding result (AGENT-102) ---

/** A single resolved reference anchor. */
export interface GroundedAnchor {
    /** What kind of reference was resolved. */
    type: 'time' | 'card' | 'query' | 'entity' | 'metric';
    /** Original phrase from the user message (e.g. "this month"). */
    raw: string;
    /** Concrete resolved value (e.g. "2026-03", "card-abc123"). */
    resolved: string;
    /** Associated column name, if applicable (e.g. "Date"). */
    column?: string;
    /** Associated card ID, if applicable. */
    cardId?: string;
    /** How confident is this resolution. */
    confidence: 'high' | 'medium' | 'low';
}

/** Result of the deterministic grounding resolver. */
export interface GroundingResult {
    /** References that were successfully resolved to concrete values. */
    resolvedAnchors: GroundedAnchor[];
    /** Raw phrases that could not be resolved from current runtime state. */
    unresolvedAnchors: string[];
    /** Overall grounding confidence. 'none' means no grounding was needed. */
    groundingConfidence: 'high' | 'medium' | 'low' | 'none';
    /** Human-readable summary for injection into contract instruction. */
    groundingSummary: string;
}

// --- Intent directive ---

export interface ChatRoutingDirective {
    /** The findings that produced this directive. */
    findings: IntentClassificationFindings;
    /** Rich query understanding artifact (when available). */
    artifact?: QueryUnderstandingArtifact;
}

// --- Constants ---

export const LOG_PREFIX = '[IntentClassifier]';
export const INTENT_AI_TIMEOUT_MS = 30_000;
