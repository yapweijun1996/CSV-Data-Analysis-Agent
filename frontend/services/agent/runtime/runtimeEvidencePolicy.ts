import type {
    AnalysisMetricSemanticName,
    BaseMetricSemanticName,
    DerivedMetricSemanticName,
    MetricMappingValidationArtifact,
    RuntimeStepContract,
} from '../../../types';
import {
    EXPLICIT_DERIVED_PRIORITY_PATTERNS,
    METRIC_PATTERNS,
    extractRequestedDerivedMetrics,
} from '../analysisBrief';
import type { RuntimeContractState } from './runtimeToolExposurePolicy';
import { buildRuntimeRequestFingerprint } from './runtimeHelpers';

// Purpose: USER_INTENT_PARSING — detects validation keywords in user chat messages.
const EXPLICIT_METRIC_VALIDATION_PATTERN = /\b(validate|validation|verify|verified|confirm|check|mapping|map|mapped|binding|bindings|label|labels)\b/i;
const BASE_VALIDATION_METRICS: BaseMetricSemanticName[] = ['revenue', 'cost', 'budget', 'actual'];
const DERIVED_VALIDATION_METRICS: DerivedMetricSemanticName[] = ['profit', 'margin', 'variance'];

type RequestedMetricValidationTargets = {
    baseMetrics: BaseMetricSemanticName[];
    derivedMetrics: DerivedMetricSemanticName[];
    explicitValidation: boolean;
    needsValidation: boolean;
};

// ─── AGENT-104: Three-layer evidence model ──────────────────────

/**
 * Layer 1: Session trace — what has happened so far in this session.
 * Includes: queryHistory, contextualSummary.
 * Does NOT include active artifacts (activeDataQuery, cards, etc.).
 */
export const summarizeVisibleTrace = (state?: Partial<RuntimeContractState>): string => {
    if (!state) return 'No session trace.';
    const parts: string[] = [];
    if (state.contextualSummary?.trim()) {
        parts.push('Context summary available.');
    }
    if ((state.queryHistory?.length ?? 0) > 0) {
        parts.push(`There are ${(state.queryHistory?.length ?? 0)} recent query trace(s).`);
    }
    return parts.join(' ') || 'No session trace.';
};

/**
 * Layer 2: Grounded artifacts — concrete data currently on screen.
 * Includes: activeDataQuery, activeMetricMappingValidation, activeSpreadsheetFilter, analysisCards.
 */
export const summarizeGroundedArtifacts = (state?: Partial<RuntimeContractState>): string => {
    if (!state) return 'No grounded artifacts.';
    const parts: string[] = [];
    if (state.activeDataQuery) {
        parts.push('A data.query result is visible.');
    }
    if (state.activeMetricMappingValidation) {
        parts.push(`A metric mapping validation result for ${state.activeMetricMappingValidation.metricName} is visible.`);
    }
    if (state.activeSpreadsheetFilter) {
        parts.push('A spreadsheet.filter result is visible.');
    }
    if ((state.analysisCards?.length ?? 0) > 0) {
        parts.push(`${state.analysisCards?.length ?? 0} analysis card(s) are on screen.`);
    }
    return parts.join(' ') || 'No grounded artifacts.';
};

export interface QuestionIntent {
    goalSummary: string;
    taskMode: string;
    expectedOutcome: string;
    /**
     * When true, the question is a low-information follow-up ("tell me more").
     * Follow-ups implicitly refer to the most recent action, so activeDataQuery
     * alone is sufficient to count as answerable — no keyword matching needed.
     * Only stale cards without an active query/filter are rejected.
     */
    isFollowUp?: boolean;
}

/**
 * Layer 3: Answerable evidence — grounded artifacts that address the current question.
 * Deterministic matching: column overlap, metric name, query explanation relevance.
 * Conservative: returns empty when uncertain (forces fresh evidence gathering).
 */
export const summarizeAnswerableEvidence = (
    state: Partial<RuntimeContractState> | undefined,
    questionIntent: QuestionIntent,
): string => {
    if (!state) return 'No answerable evidence for this question.';
    const parts: string[] = [];

    // ── Follow-up path: "tell me more" / "explain" ─────────────
    // Follow-ups implicitly refer to the most recent action. activeDataQuery,
    // activeSpreadsheetFilter, or activeMetricMappingValidation represent
    // the latest interaction — they're answerable by definition.
    // Only stale analysis cards without any active action are rejected.
    if (questionIntent.isFollowUp) {
        if (state.activeDataQuery) {
            parts.push(`Active data.query result is the follow-up target: ${state.activeDataQuery.explanation}`);
        }
        if (state.activeSpreadsheetFilter) {
            parts.push('Active spreadsheet filter is the follow-up target.');
        }
        if (state.activeMetricMappingValidation) {
            parts.push(`Active metric validation for "${state.activeMetricMappingValidation.metricName}" is the follow-up target.`);
        }
        // Cards alone (without an active action) are stale context for a follow-up
        return parts.join(' ') || 'No answerable evidence for this question.';
    }

    // ── Specific question path: keyword matching ───────────────
    const goalLower = questionIntent.goalSummary.toLowerCase();

    // Active data query: check if explanation overlaps with goal
    if (state.activeDataQuery) {
        const explanationLower = (state.activeDataQuery.explanation ?? '').toLowerCase();
        const selectedColumns = state.activeDataQuery.result?.selectedColumns ?? [];
        const columnOverlap = selectedColumns.some(col => goalLower.includes(col.toLowerCase()));
        const explanationOverlap = goalLower.split(/\s+/).filter(w => w.length > 2).some(w => explanationLower.includes(w));
        if (columnOverlap || explanationOverlap) {
            parts.push(`Active data.query result is relevant: ${state.activeDataQuery.explanation}`);
        }
    }

    // Metric validation: check if validated metric is referenced
    if (state.activeMetricMappingValidation) {
        const metricName = state.activeMetricMappingValidation.metricName.toLowerCase();
        if (goalLower.includes(metricName)) {
            parts.push(`Metric validation for "${state.activeMetricMappingValidation.metricName}" is relevant.`);
        }
    }

    // Analysis cards: check if card titles overlap with goal
    if ((state.analysisCards?.length ?? 0) > 0) {
        const matchingCards = (state.analysisCards ?? []).filter(card => {
            const titleLower = (card.plan?.title ?? '').toLowerCase();
            return goalLower.split(/\s+/).filter(w => w.length > 2).some(w => titleLower.includes(w));
        });
        if (matchingCards.length > 0) {
            parts.push(`${matchingCards.length} card(s) may address this question.`);
        }
    }

    return parts.join(' ') || 'No answerable evidence for this question.';
};

/** Backward-compat: flat summary combining trace + artifacts. */
export const summarizeVisibleEvidence = (state?: Partial<RuntimeContractState>) => {
    const trace = summarizeVisibleTrace(state);
    const artifacts = summarizeGroundedArtifacts(state);
    const parts: string[] = [];
    if (!trace.startsWith('No session')) parts.push(trace);
    if (!artifacts.startsWith('No grounded')) parts.push(artifacts);
    return parts.join(' ') || 'No visible evidence is available yet.';
};

// ─── Three-layer detection functions ─────────────────────────────

/** Layer 1: Has any session trace (past queries, contextual summary). */
export const hasVisibleTrace = (state?: Partial<RuntimeContractState>) => Boolean(
    (state?.queryHistory?.length ?? 0) > 0
    || (state?.contextualSummary && state.contextualSummary.trim().length > 0),
);

/** Layer 2: Has concrete on-screen artifacts. */
export const hasGroundedArtifacts = (state?: Partial<RuntimeContractState>) => Boolean(
    state?.activeDataQuery
    || state?.activeMetricMappingValidation
    || state?.activeSpreadsheetFilter
    || (state?.analysisCards?.length ?? 0) > 0,
);

/** Layer 3: Has grounded artifacts that address the current question. */
export const hasAnswerableEvidence = (
    state: Partial<RuntimeContractState> | undefined,
    questionIntent: QuestionIntent,
): boolean => {
    if (!hasGroundedArtifacts(state)) return false;
    const summary = summarizeAnswerableEvidence(state, questionIntent);
    return !summary.startsWith('No answerable evidence');
};

/** Backward-compat: any evidence at all (trace OR artifacts). */
export const hasVisibleEvidence = (state?: Partial<RuntimeContractState>) =>
    hasVisibleTrace(state) || hasGroundedArtifacts(state);

/**
 * Usable evidence = grounded artifacts exist on the contract.
 * Trace-only contracts (queryHistory/contextualSummary without activeDataQuery/cards)
 * must NOT be considered usable — this prevents retry/repair paths from treating
 * stale session trace as actionable evidence.
 */
export const hasUsableEvidence = (contract: RuntimeStepContract) =>
    Boolean(contract.groundedArtifactSummary && !contract.groundedArtifactSummary.startsWith('No grounded'));

export const extractRequestedMetricValidationTargets = (message: string): RequestedMetricValidationTargets => {
    const requested = new Set<AnalysisMetricSemanticName>(extractRequestedDerivedMetrics(message));
    (Object.entries(METRIC_PATTERNS) as Array<[AnalysisMetricSemanticName, RegExp[]]>).forEach(([metric, patterns]) => {
        if (patterns.some(pattern => pattern.test(message))) {
            requested.add(metric);
        }
    });
    if ((/\bbudget\b/i.test(message) && /\bactual\b/i.test(message)) || /\bbudget\s+vs\.?\s+actual\b/i.test(message)) {
        requested.add('variance');
    }
    const baseMetrics = BASE_VALIDATION_METRICS.filter(metric => requested.has(metric));
    const derivedMetrics = DERIVED_VALIDATION_METRICS.filter(metric => requested.has(metric));
    const explicitValidation = EXPLICIT_METRIC_VALIDATION_PATTERN.test(message);
    return {
        baseMetrics,
        derivedMetrics,
        explicitValidation,
        needsValidation: explicitValidation || derivedMetrics.length > 0,
    };
};

export const extractRequestedValidationMetrics = (message: string): AnalysisMetricSemanticName[] => {
    const targets = extractRequestedMetricValidationTargets(message);
    return [...targets.baseMetrics, ...targets.derivedMetrics];
};

export const getMetricValidationArtifact = (
    state: Partial<RuntimeContractState> | undefined,
    requestedMetrics: AnalysisMetricSemanticName[],
    requestFingerprint: string,
): MetricMappingValidationArtifact | null => {
    const artifact = state?.activeMetricMappingValidation ?? null;
    if (!artifact || requestedMetrics.length === 0 || !requestFingerprint) {
        return null;
    }
    if (artifact.requestFingerprint !== requestFingerprint) {
        return null;
    }
    return requestedMetrics.includes(artifact.metricName) ? artifact : null;
};

export const resolveSingleRequestedValidationMetric = (
    message: string,
): { metricName: AnalysisMetricSemanticName; validationKind: 'base' | 'derived' } | null => {
    const targets = extractRequestedMetricValidationTargets(message);
    const prioritizedDerivedMetrics = (Object.entries(EXPLICIT_DERIVED_PRIORITY_PATTERNS) as Array<[Exclude<DerivedMetricSemanticName, 'variance'>, RegExp[]]>)
        .filter(([, patterns]) => patterns.some(pattern => pattern.test(message)))
        .map(([metric]) => metric)
        .filter(metric => targets.derivedMetrics.includes(metric));
    if (prioritizedDerivedMetrics.length === 1) {
        return {
            metricName: prioritizedDerivedMetrics[0],
            validationKind: 'derived',
        };
    }
    if (targets.derivedMetrics.length === 1) {
        return {
            metricName: targets.derivedMetrics[0],
            validationKind: 'derived',
        };
    }
    if (targets.baseMetrics.length === 1 && targets.derivedMetrics.length === 0) {
        return {
            metricName: targets.baseMetrics[0],
            validationKind: 'base',
        };
    }
    return null;
};

export const buildValidationRequestFingerprint = (
    message: string,
    state?: Partial<RuntimeContractState>,
) => buildRuntimeRequestFingerprint(message, {
    sessionId: state?.sessionId ?? null,
    datasetId: state?.currentDatasetId ?? null,
});
