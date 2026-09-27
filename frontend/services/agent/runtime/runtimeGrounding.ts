/**
 * Follow-up Grounding Resolver (AGENT-102).
 *
 * Deterministic harness that resolves typed reference signals from
 * QueryUnderstandingArtifact into concrete anchors using runtime state.
 *
 * Pattern: investigate (extract references) → findings (match against state)
 *          → directives (GroundingResult for contract builder).
 *
 * No AI calls. Pure functions. Independently testable.
 */

import type { AnalysisCardData, ColumnProfile, CsvRow } from '../../../types';
import type {
    GroundedAnchor,
    GroundingResult,
    QueryExpectedOutput,
    QueryTaskSignal,
    QueryUnderstandingArtifact,
    QueryTimeScope,
    QueryComparisonScope,
} from './intentClassificationTypes';
import type { RuntimeContractState } from './runtimeToolExposurePolicy';

// ─── Constants ─────────────────────────────────────────────────────────

/** Max rows to scan for entity value extraction (categorical matching). */
const MAX_ENTITY_SCAN_ROWS = 200;

// ─── Time resolver ─────────────────────────────────────────────────────

/**
 * Parse a string into a Date. Returns null if not parseable.
 * Handles ISO dates, "YYYY-MM-DD", "MM/DD/YYYY", etc.
 */
const tryParseDate = (value: unknown): Date | null => {
    if (value == null) return null;
    const str = String(value).trim();
    if (!str || str === 'null' || str === 'undefined') return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
};

const findDateColumns = (profiles?: ColumnProfile[]): ColumnProfile[] =>
    (profiles ?? []).filter(c => c.type === 'date' || c.type === 'time');

/**
 * Extract the maximum date value from ALL rows.
 * Time grounding (this month, last quarter, latest period) must be based
 * on the true dataset-wide max, not a positional sample.
 */
const extractMaxDate = (
    data: CsvRow[] | undefined,
    dateColumnName: string,
): Date | null => {
    if (!data?.length) return null;
    let max: Date | null = null;
    for (let i = 0; i < data.length; i++) {
        const d = tryParseDate(data[i]?.[dateColumnName]);
        if (d && (!max || d.getTime() > max.getTime())) {
            max = d;
        }
    }
    return max;
};

const formatYearMonth = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

const formatQuarter = (d: Date): string => {
    const y = d.getFullYear();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `${y}-Q${q}`;
};

const getPreviousQuarter = (d: Date): string => {
    const month = d.getMonth(); // 0-based
    const q = Math.ceil((month + 1) / 3);
    if (q === 1) {
        return `${d.getFullYear() - 1}-Q4`;
    }
    return `${d.getFullYear()}-Q${q - 1}`;
};

const getPreviousMonth = (d: Date): string => {
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return formatYearMonth(prev);
};

const RELATIVE_MONTH_RE = /\b(this|current)\s+month\b|这个月|本月/i;
const RELATIVE_LAST_MONTH_RE = /\blast\s+month\b|上个月|上月/i;
const RELATIVE_QUARTER_RE = /\b(this|current)\s+quarter\b|这个季度|本季度/i;
const RELATIVE_LAST_QUARTER_RE = /\blast\s+quarter\b|上个季度|上季度/i;
const RELATIVE_YEAR_RE = /\b(this|current)\s+year\b|今年|本年/i;
const RELATIVE_LAST_YEAR_RE = /\blast\s+year\b|去年|上年/i;
const RELATIVE_LATEST_RE = /\b(latest|most recent|newest)\b|最新|最近/i;

const resolveTimeScope = (
    timeScope: QueryTimeScope,
    raw: string | undefined,
    profiles?: ColumnProfile[],
    data?: CsvRow[],
): GroundedAnchor | null => {
    if (timeScope.kind === 'none' || timeScope.kind === 'explicit') {
        return null; // no grounding needed
    }

    const dateColumns = findDateColumns(profiles);
    if (dateColumns.length === 0) return null; // can't resolve without date column

    const dateCol = dateColumns[0];
    const maxDate = extractMaxDate(data, dateCol.name);
    if (!maxDate) return null;

    const phrase = raw ?? timeScope.value ?? '';

    let resolved: string;
    if (RELATIVE_LAST_MONTH_RE.test(phrase)) {
        resolved = getPreviousMonth(maxDate);
    } else if (RELATIVE_MONTH_RE.test(phrase)) {
        resolved = formatYearMonth(maxDate);
    } else if (RELATIVE_LAST_QUARTER_RE.test(phrase)) {
        resolved = getPreviousQuarter(maxDate);
    } else if (RELATIVE_QUARTER_RE.test(phrase)) {
        resolved = formatQuarter(maxDate);
    } else if (RELATIVE_LAST_YEAR_RE.test(phrase)) {
        resolved = String(maxDate.getFullYear() - 1);
    } else if (RELATIVE_YEAR_RE.test(phrase)) {
        resolved = String(maxDate.getFullYear());
    } else if (RELATIVE_LATEST_RE.test(phrase) || timeScope.kind === 'dataset_relative') {
        resolved = formatYearMonth(maxDate);
    } else {
        // Generic relative — resolve to max date's month
        resolved = formatYearMonth(maxDate);
    }

    return {
        type: 'time',
        raw: phrase || timeScope.kind,
        resolved,
        column: dateCol.name,
        confidence: 'high',
    };
};

// ─── Card resolver ─────────────────────────────────────────────────────

const resolveCardScope = (
    comparisonScope: QueryComparisonScope,
    subjectRefs: string[],
    cards?: AnalysisCardData[],
    activeQuery?: RuntimeContractState['activeDataQuery'],
    queryHistory?: RuntimeContractState['queryHistory'],
): GroundedAnchor | null => {
    if (comparisonScope.kind === 'none') return null;

    const phrase = comparisonScope.value ?? comparisonScope.kind;

    if (comparisonScope.kind === 'previous_card') {
        if (cards?.length) {
            // Cards are prepended (newest at index 0) — resolve to most recent card.
            const lastCard = cards[0];
            return {
                type: 'card',
                raw: phrase,
                resolved: lastCard.plan?.title ?? lastCard.id,
                cardId: lastCard.id,
                confidence: 'high',
            };
        }
        return null; // no cards to resolve against
    }

    if (comparisonScope.kind === 'previous_result') {
        if (activeQuery) {
            return {
                type: 'query',
                raw: phrase,
                resolved: activeQuery.explanation ?? 'active query result',
                confidence: 'high',
            };
        }
        if (queryHistory?.length) {
            // appendQueryHistory() appends to the end, so the most recent trace is last
            const latest = queryHistory[queryHistory.length - 1];
            return {
                type: 'query',
                raw: phrase,
                resolved: latest.explanation ?? `query trace ${latest.id}`,
                confidence: 'medium',
            };
        }
        return null;
    }

    // previous_period — handled by time resolver, not card resolver
    return null;
};

// ─── Entity resolver ───────────────────────────────────────────────────

/**
 * Try to resolve a subject reference against categorical column values.
 * Only scans columns that are categorical and have reasonable cardinality.
 */
const resolveEntityRef = (
    ref: string,
    alreadyReferencedColumns: Set<string>,
    profiles?: ColumnProfile[],
    data?: CsvRow[],
): GroundedAnchor | null => {
    if (!profiles?.length || !data?.length) return null;

    const refLower = ref.toLowerCase().trim();
    if (!refLower) return null;

    // Skip if ref is already a known column name
    const refIsColumn = profiles.some(c => c.name.toLowerCase() === refLower);
    if (refIsColumn || alreadyReferencedColumns.has(refLower)) return null;

    const categoricalCols = profiles.filter(c =>
        c.type === 'categorical'
        && (c.uniqueValues == null || c.uniqueValues <= 500),
    );

    const matches: Array<{ column: string; value: string }> = [];
    const limit = Math.min(data.length, MAX_ENTITY_SCAN_ROWS);
    const seen = new Set<string>();

    for (const col of categoricalCols) {
        for (let i = 0; i < limit; i++) {
            const cellValue = data[i]?.[col.name];
            if (cellValue == null) continue;
            const str = String(cellValue).trim();
            const strLower = str.toLowerCase();
            const key = `${col.name}::${strLower}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Exact match or substring containment (bidirectional)
            if (strLower === refLower || strLower.includes(refLower) || refLower.includes(strLower)) {
                matches.push({ column: col.name, value: str });
            }
        }
    }

    if (matches.length === 0) return null;

    // Prefer exact match
    const exact = matches.find(m => m.value.toLowerCase() === refLower);
    if (exact) {
        return {
            type: 'entity',
            raw: ref,
            resolved: exact.value,
            column: exact.column,
            confidence: 'high',
        };
    }

    // Single match → high confidence
    if (matches.length === 1) {
        return {
            type: 'entity',
            raw: ref,
            resolved: matches[0].value,
            column: matches[0].column,
            confidence: 'high',
        };
    }

    // Multiple matches → medium confidence, pick first
    return {
        type: 'entity',
        raw: ref,
        resolved: matches[0].value,
        column: matches[0].column,
        confidence: 'medium',
    };
};

// ─── Metric resolver ───────────────────────────────────────────────────

const resolveMetricRef = (
    ref: string,
    alreadyReferencedColumns: Set<string>,
    profiles?: ColumnProfile[],
    semanticSnapshot?: RuntimeContractState['datasetSemanticSnapshot'],
): GroundedAnchor | null => {
    if (!profiles?.length) return null;

    const refLower = ref.toLowerCase().trim();
    if (!refLower) return null;

    // Skip if already a known column
    if (alreadyReferencedColumns.has(refLower)) return null;

    // Check against numerical/currency/percentage columns
    const numericCols = profiles.filter(c =>
        c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage',
    );

    const colMatch = numericCols.find(c => c.name.toLowerCase() === refLower);
    if (colMatch) {
        return {
            type: 'metric',
            raw: ref,
            resolved: colMatch.name,
            column: colMatch.name,
            confidence: 'high',
        };
    }

    // Fuzzy match against numeric column names
    const fuzzy = numericCols.find(c =>
        c.name.toLowerCase().includes(refLower) || refLower.includes(c.name.toLowerCase()),
    );
    if (fuzzy) {
        return {
            type: 'metric',
            raw: ref,
            resolved: fuzzy.name,
            column: fuzzy.name,
            confidence: 'medium',
        };
    }

    // Check semantic snapshot candidate metrics
    const candidates = semanticSnapshot?.mergedSemanticBoundary?.candidateMetrics;
    if (candidates?.length) {
        const semMatch = candidates.find(m => m.toLowerCase().includes(refLower) || refLower.includes(m.toLowerCase()));
        if (semMatch) {
            return {
                type: 'metric',
                raw: ref,
                resolved: semMatch,
                column: semMatch,
                confidence: 'medium',
            };
        }
    }

    return null;
};

// ─── Orchestrator ──────────────────────────────────────────────────────

const buildGroundingSummary = (resolved: GroundedAnchor[], unresolved: string[]): string => {
    if (resolved.length === 0 && unresolved.length === 0) return '';

    const parts: string[] = [];
    for (const anchor of resolved) {
        switch (anchor.type) {
            case 'time':
                parts.push(`"${anchor.raw}" resolved to ${anchor.resolved}${anchor.column ? ` (column: ${anchor.column})` : ''}`);
                break;
            case 'card':
                parts.push(`"${anchor.raw}" resolved to card "${anchor.resolved}"${anchor.cardId ? ` (id: ${anchor.cardId})` : ''}`);
                break;
            case 'query':
                parts.push(`"${anchor.raw}" resolved to query result: ${anchor.resolved}`);
                break;
            case 'entity':
                parts.push(`"${anchor.raw}" resolved to "${anchor.resolved}"${anchor.column ? ` in column ${anchor.column}` : ''}`);
                break;
            case 'metric':
                parts.push(`"${anchor.raw}" resolved to metric column "${anchor.resolved}"`);
                break;
        }
    }

    if (unresolved.length > 0) {
        parts.push(`Unresolved references: ${unresolved.map(r => `"${r}"`).join(', ')}`);
    }

    return `[Grounding] ${parts.join('. ')}.`;
};

/**
 * Resolve follow-up references from a QueryUnderstandingArtifact
 * against available runtime state.
 *
 * Pure function. No AI calls. Returns a GroundingResult that the
 * contract builder can inject into instructions or use to trigger
 * targeted clarification.
 */
export const resolveGrounding = (
    artifact: QueryUnderstandingArtifact,
    state: Partial<RuntimeContractState>,
): GroundingResult => {
    // If no grounding needed, return early
    if (!artifact.needsGrounding) {
        return {
            resolvedAnchors: [],
            unresolvedAnchors: [],
            groundingConfidence: 'none',
            groundingSummary: '',
        };
    }

    const resolved: GroundedAnchor[] = [];
    const unresolvedSet = new Set(artifact.unresolvedReferences);
    const alreadyReferencedColumns = new Set(
        (artifact.referencedColumns ?? []).map(c => c.toLowerCase()),
    );

    // 1. Time resolver
    const timeAnchor = resolveTimeScope(
        artifact.timeScope,
        artifact.timeScope.value,
        state.columnProfiles,
        state.csvData?.data,
    );
    if (timeAnchor) {
        resolved.push(timeAnchor);
        // Remove from unresolved if the raw phrase matches
        unresolvedSet.delete(timeAnchor.raw);
        if (artifact.timeScope.value) unresolvedSet.delete(artifact.timeScope.value);
    }

    // 2. Card/query resolver
    const cardAnchor = resolveCardScope(
        artifact.comparisonScope,
        artifact.subjectRefs,
        state.analysisCards,
        state.activeDataQuery,
        state.queryHistory,
    );
    if (cardAnchor) {
        resolved.push(cardAnchor);
        unresolvedSet.delete(cardAnchor.raw);
        if (artifact.comparisonScope.value) unresolvedSet.delete(artifact.comparisonScope.value);
    }

    // 3. Entity + metric resolver for remaining subjectRefs
    for (const ref of artifact.subjectRefs) {
        // Try entity first, then metric
        const entityAnchor = resolveEntityRef(ref, alreadyReferencedColumns, state.columnProfiles, state.csvData?.data);
        if (entityAnchor) {
            resolved.push(entityAnchor);
            unresolvedSet.delete(ref);
            continue;
        }
        const metricAnchor = resolveMetricRef(ref, alreadyReferencedColumns, state.columnProfiles, state.datasetSemanticSnapshot);
        if (metricAnchor) {
            resolved.push(metricAnchor);
            unresolvedSet.delete(ref);
        }
    }

    // Compute overall confidence
    const unresolvedAnchors = Array.from(unresolvedSet);
    let groundingConfidence: GroundingResult['groundingConfidence'];
    if (unresolvedAnchors.length === 0 && resolved.length > 0) {
        groundingConfidence = resolved.every(a => a.confidence === 'high') ? 'high' : 'medium';
    } else if (resolved.length > 0 && unresolvedAnchors.length > 0) {
        groundingConfidence = 'medium';
    } else if (unresolvedAnchors.length > 0) {
        groundingConfidence = 'low';
    } else {
        groundingConfidence = 'none';
    }

    return {
        resolvedAnchors: resolved,
        unresolvedAnchors,
        groundingConfidence,
        groundingSummary: buildGroundingSummary(resolved, unresolvedAnchors),
    };
};

// ─── AGENT-202: Grounding-based outcome adjustment ──────────────────────

/** Task signals that imply a chart/card output. */
const CARD_TASK_SIGNALS: ReadonlySet<QueryTaskSignal> = new Set([
    'create_chart', 'compare_periods', 'analyze_cohort',
    'find_root_cause', 'statistical',
]);

/** Task signals that imply a derived metric output (AGENT-206: not a card). */
const DERIVED_METRIC_TASK_SIGNALS: ReadonlySet<QueryTaskSignal> = new Set([
    'derive_metric',
]);

/** Task signals that imply a data table output. */
const TABLE_TASK_SIGNALS: ReadonlySet<QueryTaskSignal> = new Set([
    'inspect_data',
]);

/**
 * Derive a more appropriate expectedOutput when grounding resolves all references
 * and the current outcome is `needs_clarification`.
 *
 * Returns the adjusted outcome, or null if no adjustment is warranted.
 * Pure function — no side effects.
 */
export const deriveGroundedExpectedOutput = (
    groundingResult: GroundingResult | undefined,
    currentExpectedOutput: QueryExpectedOutput,
    taskSignal: QueryTaskSignal,
): QueryExpectedOutput | null => {
    if (currentExpectedOutput !== 'needs_clarification') return null;
    if (!groundingResult) return null;
    if (groundingResult.unresolvedAnchors.length > 0) return null;
    if (groundingResult.groundingConfidence !== 'high' && groundingResult.groundingConfidence !== 'medium') {
        return null;
    }

    // All references resolved — derive outcome from taskSignal.
    if (CARD_TASK_SIGNALS.has(taskSignal)) return 'chart_card';
    if (DERIVED_METRIC_TASK_SIGNALS.has(taskSignal)) return 'derived_metric';
    if (TABLE_TASK_SIGNALS.has(taskSignal)) return 'data_table';
    return 'text_answer';
};
