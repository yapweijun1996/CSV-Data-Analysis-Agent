import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from '../ai/streamGenerateText';
import { prepareSchemaForProvider } from '../ai/googleSchemaAdapter';
import type {
    EvidenceHarnessContext,
    EvidenceValueGateReasonCode,
    PivotMatrixConfig,
    RuntimeSemanticUnderstanding,
    Settings,
    SqlEvidenceQueryPlan,
    SqlEvidenceQueryResultSummary,
    EvidenceValueGateResult,
} from '../../types';
import { createProviderModel, isProviderConfigured } from '../ai/providerConfig';
import { withTransientRetry } from '../ai/transientRetry';
import { createEvidenceEvaluationSchema } from '../ai/schemas/analysisSchemas';
import { buildEvidenceEvaluationPrompt } from '../prompts/analysisPrompts';
import { robustlyParseJsonObject } from '../../utils/jsonParser';
import { isTechnicalHelperDimensionColumn } from './analysisColumnRoles';

const LOG_PREFIX = '[EvidenceValueGate]';
const AI_EVAL_TIMEOUT_MS = 8000;
const AI_EVAL_TIMEOUT_MESSAGE = `AI evidence evaluation timed out after ${AI_EVAL_TIMEOUT_MS}ms`;

const normalize = (value: string) => value.trim().toLowerCase();

const stringifyWhere = (value: unknown) => JSON.stringify(value ?? []);
const normalizeList = (values: string[] | undefined) => [...(values ?? [])].map(normalize).sort();
const TEMPORAL_DIMENSION_NAME_PATTERN = /(?:^|[\s_])(date|time|day|week|month|quarter|year|period)(?:$|[\s_])/i;
const DATE_LIKE_VALUE_PATTERNS = [
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s].*)?$/,
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:[T\s].*)?$/,
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}$/i,
];

const isDateLikeValue = (value: unknown): boolean => {
    const normalizedValue = String(value ?? '').trim();
    return Boolean(normalizedValue) && DATE_LIKE_VALUE_PATTERNS.some(pattern => pattern.test(normalizedValue));
};

const hasDimensionValueTypeMismatch = (
    evidencePlan: SqlEvidenceQueryPlan,
    evidenceSummary: SqlEvidenceQueryResultSummary,
): boolean => {
    const groupByColumn = evidencePlan.query.groupBy?.[0] ?? null;
    if (!groupByColumn || TEMPORAL_DIMENSION_NAME_PATTERN.test(groupByColumn)) {
        return false;
    }

    const resultTypedAsTime = includesNormalized(evidenceSummary.timeColumns, groupByColumn);
    const previewValues = evidenceSummary.previewRows
        .map(row => row[groupByColumn])
        .filter(value => String(value ?? '').trim().length > 0);
    const dateLikeRatio = previewValues.length >= 3
        ? previewValues.filter(isDateLikeValue).length / previewValues.length
        : 0;

    return resultTypedAsTime || dateLikeRatio >= 0.8;
};

export interface ExistingAcceptedEvidence {
    querySignature: string;
    semanticSignature: string;
    decision: EvidenceValueGateResult['decision'];
    title: string;
}

interface AiEvidenceEvaluation {
    decision: 'pass' | 'table_only' | 'reject';
    reasoning: string;
    chartWorthy: boolean;
}

const createEvidenceEvalTimeoutError = (): Error => {
    if (typeof DOMException === 'function') {
        return new DOMException(AI_EVAL_TIMEOUT_MESSAGE, 'AbortError');
    }
    const error = new Error(AI_EVAL_TIMEOUT_MESSAGE);
    error.name = 'AbortError';
    return error;
};

const isEvidenceEvalTimeoutError = (error: unknown): boolean =>
    error instanceof Error
    && error.name === 'AbortError'
    && error.message === AI_EVAL_TIMEOUT_MESSAGE;

// Use function:column as the canonical metric key for dedup.
// AI-generated aliases (aggregate.as) are cosmetic and must NOT affect
// dedup — SUM(Value) AS "TotalValue" vs SUM(Value) AS "Total" are identical.
const buildNormalizedMetricKey = (plan: SqlEvidenceQueryPlan, summary: SqlEvidenceQueryResultSummary) =>
    (plan.query.aggregates ?? [])
        .map(aggregate => `${aggregate.function}:${aggregate.column}`)
        .filter(Boolean)
        .join('|')
    || summary.numericColumns.join('|');

export const buildEvidenceSignature = (
    plan: SqlEvidenceQueryPlan,
): string => JSON.stringify({
    queryMode: plan.queryMode,
    groupBy: [...(plan.query.groupBy ?? [])].sort(),
    // Exclude the AI-generated alias (aggregate.as) from the signature.
    // Two plans with SUM(Value) AS "TotalValue" vs SUM(Value) AS "Total"
    // answer the same question — the alias is cosmetic.
    aggregates: (plan.query.aggregates ?? [])
        .map(aggregate => ({
            fn: aggregate.function,
            column: aggregate.column,
        }))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    where: stringifyWhere(plan.query.where),
    postAggregateFilter: stringifyWhere(plan.query.postAggregateFilter),
});

export const buildSemanticSignature = (
    plan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
): string => JSON.stringify({
    grain: normalize(plan.query.groupBy?.[0] ?? 'none'),
    metric: normalize(buildNormalizedMetricKey(plan, summary) || 'none'),
    // Intent is excluded from the signature on purpose: two queries with
    // the same grain + metric + aggregate function answer the same question
    // regardless of how the AI phrased the intent.  Including intent caused
    // near-duplicate cards to slip through dedup (e.g. "Top X by Value" vs
    // "Value distribution by X" both GROUP BY Description, SUM(Value)).
    aggregateFn: normalize((plan.query.aggregates ?? []).map(a => a.function).join('|') || 'none'),
    blocked: semanticUnderstanding.blockedDimensions.includes(plan.query.groupBy?.[0] ?? ''),
    helper: semanticUnderstanding.helperDimensions.includes(plan.query.groupBy?.[0] ?? ''),
});

// Plan-only variant of buildSemanticSignature for pre-execution dedup.
// Uses function:column (not AI aliases) as the metric key — consistent with
// the post-execution buildSemanticSignature to avoid alias-driven false negatives.
export const buildPlanOnlySemanticSignature = (
    plan: SqlEvidenceQueryPlan,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
): string => JSON.stringify({
    grain: normalize(plan.query.groupBy?.[0] ?? 'none'),
    metric: normalize(
        (plan.query.aggregates ?? [])
            .map(a => `${a.function}:${a.column}`)
            .filter(Boolean)
            .join('|')
        || 'none',
    ),
    aggregateFn: normalize((plan.query.aggregates ?? []).map(a => a.function).join('|') || 'none'),
    blocked: semanticUnderstanding.blockedDimensions.includes(plan.query.groupBy?.[0] ?? ''),
    helper: semanticUnderstanding.helperDimensions.includes(plan.query.groupBy?.[0] ?? ''),
});

export const buildPivotToolQuerySignature = (
    request: PivotMatrixConfig,
): string => JSON.stringify({
    tool: 'analysis.pivot_matrix',
    rows: normalizeList(request.rows),
    columns: normalizeList(request.columns),
    metric: normalize(request.metric ?? 'count'),
    aggregate: normalize(request.aggregate),
    topN: request.topN ?? null,
    sort: request.sort ?? null,
});

export const buildPivotToolSemanticSignature = (
    request: PivotMatrixConfig,
    steering?: EvidenceHarnessContext | null,
): string => JSON.stringify({
    tool: 'analysis.pivot_matrix',
    primaryRow: normalize(request.rows?.[0] ?? 'none'),
    columns: normalizeList(request.columns),
    metric: normalize(request.metric ?? 'count'),
    aggregate: normalize(request.aggregate),
    detailRowFilter: steering?.detailRowFilter
        ? `${normalize(steering.detailRowFilter.column)}=${normalize(steering.detailRowFilter.value)}`
        : 'none',
});

const buildDetail = (reasonCodes: EvidenceValueGateReasonCode[]) =>
    reasonCodes.length === 0 ? 'pass' : reasonCodes.join(', ');

const includesNormalized = (values: string[] | undefined, candidate: string | null | undefined) => {
    const normalizedCandidate = candidate ? normalize(candidate) : null;
    if (!normalizedCandidate) {
        return false;
    }
    return (values ?? []).some(value => normalize(value) === normalizedCandidate);
};

// --- Deterministic safety floor ---
// Handles: duplicates, blocked dimensions — cases where AI judgement is not needed.
const evaluateDeterministicSafetyFloor = (params: {
    semanticUnderstanding: RuntimeSemanticUnderstanding;
    evidencePlan: SqlEvidenceQueryPlan;
    evidenceSummary: SqlEvidenceQueryResultSummary;
    existingAcceptedOutputs: ExistingAcceptedEvidence[];
    querySignature: string;
    semanticSignature: string;
    harnessContext?: EvidenceHarnessContext | null;
}): { hardReject: boolean; reasonCodes: EvidenceValueGateReasonCode[] } => {
    const { semanticUnderstanding, evidencePlan, existingAcceptedOutputs, querySignature, semanticSignature, harnessContext } = params;
    const reasonCodes: EvidenceValueGateReasonCode[] = [];
    const groupByColumn = evidencePlan.query.groupBy?.[0] ?? null;
    const invalidHelperAggregate = (evidencePlan.query.aggregates ?? []).some(aggregate => (
        aggregate.column
        && aggregate.function !== 'count'
        && aggregate.function !== 'count_distinct'
        && (
            isTechnicalHelperDimensionColumn(aggregate.column)
            || harnessContext?.columnRoles?.[aggregate.column] === 'helper_dimension'
            || harnessContext?.columnRoles?.[aggregate.column] === 'structural_metadata'
            || harnessContext?.blockedMetrics?.includes(aggregate.column)
        )
    ));

    // Blocked dimension: check both semanticUnderstanding and harnessContext.blockGroupBy
    const isBlockedBySemanticUnderstanding = Boolean(groupByColumn && semanticUnderstanding.blockedDimensions.includes(groupByColumn));
    const isBlockedByHarness = Boolean(groupByColumn && harnessContext?.blockGroupBy.includes(groupByColumn));
    const isBlockedDimension = isBlockedBySemanticUnderstanding || isBlockedByHarness;
    // Soft-deprioritized dimensions get table_only treatment, not hard reject.
    const isSoftDeprioritized = Boolean(
        groupByColumn
        && !isBlockedDimension
        && harnessContext?.softDeprioritizeGroupBy?.includes(groupByColumn),
    );

    if (isBlockedDimension) {
        reasonCodes.push('blocked_dimension');
    }
    if (isSoftDeprioritized) {
        reasonCodes.push('soft_deprioritized_dimension');
    }
    if (invalidHelperAggregate) {
        reasonCodes.push('helper_metric');
    }
    if (hasDimensionValueTypeMismatch(evidencePlan, params.evidenceSummary)) {
        reasonCodes.push('dimension_value_type_mismatch');
    }
    if (existingAcceptedOutputs.some(output => output.querySignature === querySignature)) {
        reasonCodes.push('duplicate_query');
    }
    if (existingAcceptedOutputs.some(output => output.semanticSignature === semanticSignature)) {
        reasonCodes.push('duplicate_semantic');
    }

    // Zero-total evidence: metric sums to exactly 0 across all groups.
    // This is a deterministic fact, not an AI judgment — hard reject.
    if (params.evidenceSummary.totalValue === 0) {
        reasonCodes.push('zero_total_value');
    }

    // A semantic type contradiction is not a presentational caveat: a card
    // labelled "Customer" whose grouped values are dates is actively
    // misleading. Reject it before presentation while keeping ordinary blocked
    // dimensions available as table-only evidence.
    const hardReject = reasonCodes.includes('duplicate_query')
        || reasonCodes.includes('duplicate_semantic')
        || reasonCodes.includes('zero_total_value')
        || reasonCodes.includes('helper_metric')
        || reasonCodes.includes('dimension_value_type_mismatch');

    return { hardReject, reasonCodes };
};

const hasBusinessGrainInWhereClause = (
    plan: SqlEvidenceQueryPlan,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
): boolean => {
    const allWhereColumns = [
        ...(plan.query.where?.predicates ?? []).map(p => p.column),
        ...(plan.query.where?.groups ?? []).flatMap(g => g.predicates.map(p => p.column)),
    ];
    return allWhereColumns.some(col => semanticUnderstanding.businessGrains.includes(col));
};

// --- PR5: Harness-aware contamination checks ---

// Check whether the query plan includes a WHERE predicate that matches the
// harness-detected detail-row column and value.  Column name and value are
// taken from the harness investigation — no hardcoded column names.
const queryHasDetailRowFilter = (
    plan: SqlEvidenceQueryPlan,
    harnessContext: EvidenceHarnessContext,
): boolean => {
    if (!harnessContext.detailRowColumn || !harnessContext.detailRowValue) return false;
    const col = harnessContext.detailRowColumn.toLowerCase();
    const val = harnessContext.detailRowValue.toLowerCase();
    const allPredicates = [
        ...(plan.query.where?.predicates ?? []),
        ...(plan.query.where?.groups ?? []).flatMap(g => g.predicates),
    ];
    return allPredicates.some(p =>
        p.column.toLowerCase() === col
        && (p.operator === 'eq' || p.operator === 'in')
        && (typeof p.value === 'string' ? p.value.toLowerCase() === val
            : Array.isArray(p.value) && p.value.some(v => String(v).toLowerCase() === val)),
    );
};

const hasHierarchySafeGrouping = (
    evidencePlan: SqlEvidenceQueryPlan,
    harnessContext: EvidenceHarnessContext,
): boolean => {
    const groupByColumn = evidencePlan.query.groupBy?.[0] ?? null;
    if (!groupByColumn) {
        return false;
    }

    const isPreferred = includesNormalized(harnessContext.preferGroupBy, groupByColumn);
    const isBlocked = includesNormalized(harnessContext.blockGroupBy, groupByColumn);
    const isHierarchyColumn = harnessContext.hierarchyColumn
        ? normalize(harnessContext.hierarchyColumn) === normalize(groupByColumn)
        : false;

    return isPreferred && !isBlocked && !isHierarchyColumn;
};

const evaluateSteeringFloor = (params: {
    evidencePlan: SqlEvidenceQueryPlan;
    harnessContext: EvidenceHarnessContext;
}): { reasonCodes: EvidenceValueGateReasonCode[]; floorDecision: EvidenceValueGateResult['decision'] } => {
    const { evidencePlan, harnessContext } = params;
    const reasonCodes: EvidenceValueGateReasonCode[] = [];
    let floorDecision: EvidenceValueGateResult['decision'] = 'pass';
    const detailRowFiltered = queryHasDetailRowFilter(evidencePlan, harnessContext);

    if (
        harnessContext.reportShapeClass === 'hierarchical_statement'
        && !detailRowFiltered
        && !hasHierarchySafeGrouping(evidencePlan, harnessContext)
    ) {
        reasonCodes.push('missing_detail_row_filter');
        floorDecision = 'table_only';
    }

    if (harnessContext.detailRowPolicy === 'exclude_non_detail_rows'
        && harnessContext.detailRowColumn
        && harnessContext.detailRowValue
        && !detailRowFiltered
        && (
            harnessContext.reportShapeClass === 'hierarchical_statement'
            || harnessContext.parentDescriptions.length > 0
            || harnessContext.excludeFromAggregation.length > 0
        )
    ) {
        reasonCodes.push('missing_detail_row_filter');
        floorDecision = 'table_only';
    }

    if (harnessContext.widePivotMode === 'reshape_required') {
        reasonCodes.push('reshape_required');
        floorDecision = 'table_only';
    }

    if (harnessContext.signalConfidence === 'low') {
        reasonCodes.push('low_signal_confidence');
        floorDecision = 'table_only';
    }

    return {
        reasonCodes: [...new Set(reasonCodes)],
        floorDecision,
    };
};

const evaluateHarnessContamination = (params: {
    evidencePlan: SqlEvidenceQueryPlan;
    evidenceSummary: SqlEvidenceQueryResultSummary;
    harnessContext: EvidenceHarnessContext;
}): { reasonCodes: EvidenceValueGateReasonCode[]; atLeastTableOnly: boolean } => {
    const { evidencePlan, evidenceSummary, harnessContext } = params;
    const reasonCodes: EvidenceValueGateReasonCode[] = [];
    const groupByColumn = evidencePlan.query.groupBy?.[0] ?? null;
    let atLeastTableOnly = false;

    // When the query already filters by the harness-detected detail-row
    // column (e.g. WHERE RowClass='fact'), parent/subtotal rows are excluded
    // from the result set.  Skip contamination checks entirely — any matching
    // labels in the filtered result are coincidental fact-row descriptions,
    // not actual parent contamination.
    const detailRowFiltered = queryHasDetailRowFilter(evidencePlan, harnessContext);

    if (!detailRowFiltered) {
        // Hierarchy contamination: groupBy equals hierarchyColumn and
        // previewRows contain parent descriptions or excludeFromAggregation labels
        if (
            groupByColumn
            && harnessContext.hierarchyColumn
            && normalize(groupByColumn) === normalize(harnessContext.hierarchyColumn)
            && evidenceSummary.previewRows.length > 0
        ) {
            const contaminationLabels = new Set([
                ...harnessContext.parentDescriptions.map(normalize),
                ...harnessContext.excludeFromAggregation.map(normalize),
            ]);
            if (contaminationLabels.size > 0) {
                const hasContamination = evidenceSummary.previewRows.some(row => {
                    const groupValue = row[groupByColumn];
                    return typeof groupValue === 'string' && contaminationLabels.has(normalize(groupValue));
                });
                if (hasContamination) {
                    reasonCodes.push('hierarchy_contamination');
                    atLeastTableOnly = true;
                }
            }
        }

        // Duplicate label contamination: previewRows contain labels from
        // duplicateDescriptions (second item of duplicate pairs, aliases)
        if (
            groupByColumn
            && harnessContext.duplicateDescriptions.length > 0
            && evidenceSummary.previewRows.length > 0
        ) {
            const duplicateLabels = new Set(harnessContext.duplicateDescriptions.map(normalize));
            const hasDuplicateContamination = evidenceSummary.previewRows.some(row => {
                const groupValue = row[groupByColumn];
                return typeof groupValue === 'string' && duplicateLabels.has(normalize(groupValue));
            });
            if (hasDuplicateContamination) {
                reasonCodes.push('duplicate_label_contamination');
                atLeastTableOnly = true;
            }
        }
    }

    return { reasonCodes, atLeastTableOnly };
};

// --- Deterministic fallback (used when AI is unavailable) ---
const evaluateDeterministicQuality = (params: {
    semanticUnderstanding: RuntimeSemanticUnderstanding;
    evidencePlan: SqlEvidenceQueryPlan;
    evidenceSummary: SqlEvidenceQueryResultSummary;
    harnessContext?: EvidenceHarnessContext | null;
}): { reasonCodes: EvidenceValueGateReasonCode[]; decision: EvidenceValueGateResult['decision'] } => {
    const { semanticUnderstanding, evidencePlan, evidenceSummary, harnessContext } = params;
    const reasonCodes: EvidenceValueGateReasonCode[] = [];
    const groupByColumn = evidencePlan.query.groupBy?.[0] ?? null;

    // Helper dimension: check semanticUnderstanding + harness grain signals.
    // A grain that is in blockGroupBy but not in preferGroupBy is at least helper-grade.
    const isHelperBySemanticUnderstanding = Boolean(groupByColumn && semanticUnderstanding.helperDimensions.includes(groupByColumn));
    const isHelperByHarness = Boolean(
        groupByColumn
        && harnessContext
        && harnessContext.blockGroupBy.includes(groupByColumn)
        && !harnessContext.preferGroupBy.includes(groupByColumn),
    );
    const isHelperDimension = isHelperBySemanticUnderstanding || isHelperByHarness;

    if (isHelperDimension) {
        reasonCodes.push('helper_dimension');
    }
    if (semanticUnderstanding.unsafeForBusinessNarrative) {
        reasonCodes.push('unsafe_business_narrative');
    }
    if (semanticUnderstanding.businessGrainConfidence === 'low') {
        reasonCodes.push('low_business_confidence');
    }
    if (evidenceSummary.rowCount <= 2) {
        reasonCodes.push('too_few_rows');
    }
    if ((evidenceSummary.distinctGroupCount ?? 0) <= 1 && evidencePlan.queryMode === 'aggregate') {
        reasonCodes.push('single_group_result');
    }
    if (evidenceSummary.isWideCategorySet) {
        reasonCodes.push('fragmented_groups');
    }

    // PR5: harness contamination checks also apply in deterministic fallback
    let harnessAtLeastTableOnly = false;
    if (harnessContext) {
        const harnessResult = evaluateHarnessContamination({
            evidencePlan,
            evidenceSummary,
            harnessContext,
        });
        reasonCodes.push(...harnessResult.reasonCodes);
        harnessAtLeastTableOnly = harnessResult.atLeastTableOnly;
    }

    // Deterministic fallback produces 'pass' or 'table_only' only.
    // Hard rejects are the domain of the safety floor (duplicates).
    // Helper dimension + unsafe narrative → table_only (degraded presentation),
    // not reject — the evidence still has diagnostic value for the analyst.
    let decision: EvidenceValueGateResult['decision'] =
        reasonCodes.length === 0 ? 'pass' : 'table_only';

    // PR5: harness contamination forces at least table_only
    if (harnessAtLeastTableOnly && decision === 'pass') {
        decision = 'table_only';
    }

    return { reasonCodes, decision };
};

const hasRecoverableChartWorthiness = (params: {
    aiDecision: AiEvidenceEvaluation;
    aiReasonCodes: EvidenceValueGateReasonCode[];
    semanticUnderstanding: RuntimeSemanticUnderstanding;
    evidencePlan: SqlEvidenceQueryPlan;
    evidenceSummary: SqlEvidenceQueryResultSummary;
    harnessContext?: EvidenceHarnessContext | null;
    harnessFloorDecision: EvidenceValueGateResult['decision'];
}): boolean => {
    const {
        aiDecision,
        aiReasonCodes,
        semanticUnderstanding,
        evidencePlan,
        evidenceSummary,
        harnessContext,
        harnessFloorDecision,
    } = params;

    if (aiDecision.decision !== 'table_only' || aiDecision.chartWorthy) {
        return false;
    }

    if (harnessFloorDecision !== 'pass') {
        return false;
    }

    if (aiReasonCodes.length !== 1 || aiReasonCodes[0] !== 'not_chart_worthy') {
        return false;
    }

    const aggregateFunctions = new Set((evidencePlan.query.aggregates ?? []).map(aggregate => aggregate.function));
    const onlyChartFriendlyAggregate = aggregateFunctions.size === 1
        && (aggregateFunctions.has('sum') || aggregateFunctions.has('avg'));

    if (!onlyChartFriendlyAggregate) {
        return false;
    }

    const groupByColumn = evidencePlan.query.groupBy?.[0] ?? null;
    if (!groupByColumn) {
        return false;
    }

    // Structurally blocked dimensions cannot recover to chart.
    if (semanticUnderstanding.blockedDimensions.includes(groupByColumn)) {
        return false;
    }
    // Helper dimensions that were NOT promoted to business grains cannot recover.
    if (
        semanticUnderstanding.helperDimensions.includes(groupByColumn)
        && !semanticUnderstanding.businessGrains.includes(groupByColumn)
    ) {
        return false;
    }
    // Truly unsafe (no fallback rescue) cannot recover to chart.
    if (semanticUnderstanding.unsafeForBusinessNarrative && !semanticUnderstanding.fallbackPromotedGrains) {
        return false;
    }
    // No grains at all → no recovery.
    if (semanticUnderstanding.businessGrainConfidence === 'low' && semanticUnderstanding.businessGrains.length === 0) {
        return false;
    }

    if (
        evidencePlan.queryMode !== 'aggregate'
        || evidenceSummary.rowCount < 5
        || (evidenceSummary.distinctGroupCount ?? 0) < 3
        || evidenceSummary.isWideCategorySet
    ) {
        return false;
    }

    if (!harnessContext) {
        return true;
    }

    const detailRowFiltered = queryHasDetailRowFilter(evidencePlan, harnessContext);
    const preferredGrouping = includesNormalized(harnessContext.preferGroupBy, groupByColumn);
    const blockedGrouping = includesNormalized(harnessContext.blockGroupBy, groupByColumn);

    return detailRowFiltered && preferredGrouping && !blockedGrouping;
};

// --- AI evidence evaluation ---
const buildEvidenceSummaryText = (
    plan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
): string => {
    const lines: string[] = [
        `Query mode: ${plan.queryMode}`,
        `Intent: ${plan.intentSummary || plan.title}`,
        `Rows returned: ${summary.rowCount}`,
        `Columns: ${summary.columns.join(', ')}`,
        `Numeric columns: ${summary.numericColumns.join(', ') || 'none'}`,
        `Categorical columns: ${summary.categoricalColumns.join(', ') || 'none'}`,
        `Time columns: ${summary.timeColumns.join(', ') || 'none'}`,
    ];
    if (plan.query.groupBy?.length) {
        lines.push(`GroupBy: ${plan.query.groupBy.join(', ')}`);
    }
    if (summary.distinctGroupCount != null) {
        lines.push(`Distinct groups: ${summary.distinctGroupCount}`);
    }
    if (summary.totalValue != null) {
        lines.push(`Total metric value: ${summary.totalValue}`);
    }
    lines.push(`Time series candidate: ${summary.isTimeSeriesCandidate ? 'yes' : 'no'}`);
    lines.push(`Wide category set (>30 groups): ${summary.isWideCategorySet ? 'yes' : 'no'}`);
    lines.push(`Has secondary metric: ${summary.hasSecondaryMetric ? 'yes' : 'no'}`);
    if (summary.previewRows.length > 0) {
        lines.push(`Preview rows (first ${Math.min(summary.previewRows.length, 3)}):`);
        summary.previewRows.slice(0, 3).forEach(row => {
            lines.push(`  ${JSON.stringify(row)}`);
        });
    }
    return lines.join('\n');
};

const buildSemanticContextText = (
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    harnessContext?: EvidenceHarnessContext | null,
    evidencePlan?: SqlEvidenceQueryPlan | null,
): string => {
    const lines: string[] = [
        `Business grains: ${semanticUnderstanding.businessGrains.join(', ') || 'none'}`,
        `Helper dimensions: ${semanticUnderstanding.helperDimensions.join(', ') || 'none'}`,
        `Blocked dimensions: ${semanticUnderstanding.blockedDimensions.join(', ') || 'none'}`,
        `Business grain confidence: ${semanticUnderstanding.businessGrainConfidence}`,
        `Unsafe for business narrative: ${semanticUnderstanding.unsafeForBusinessNarrative ? 'yes' : 'no'}`,
    ];

    // PR5: include harness investigation context for AI to judge contamination
    if (harnessContext) {
        lines.push(`Canonical report shape class: ${harnessContext.reportShapeClass ?? 'uncertain'}`);
        lines.push(`Canonical detail row policy: ${harnessContext.detailRowPolicy ?? 'uncertain'}`);
        lines.push(`Canonical hierarchy mode: ${harnessContext.hierarchyMode ?? 'uncertain'}`);
        lines.push(`Canonical wide pivot mode: ${harnessContext.widePivotMode ?? 'uncertain'}`);
        lines.push(`Canonical signal confidence: ${harnessContext.signalConfidence ?? 'low'}`);
        if ((harnessContext.signalSources?.length ?? 0) > 0) {
            lines.push(`Canonical signal sources: ${(harnessContext.signalSources ?? []).join(', ')}`);
        }
        if (harnessContext.preferGroupBy.length > 0) {
            lines.push(`Preferred grain columns (harness): ${harnessContext.preferGroupBy.join(', ')}`);
        }
        if (harnessContext.blockGroupBy.length > 0) {
            lines.push(`Blocked grain columns (harness): ${harnessContext.blockGroupBy.join(', ')}`);
        }
        if (harnessContext.hierarchyColumn) {
            lines.push(`Hierarchy column: ${harnessContext.hierarchyColumn}`);
        }
        if (harnessContext.parentDescriptions.length > 0) {
            lines.push(`Parent/subtotal labels (exclude from aggregation): ${harnessContext.parentDescriptions.join(', ')}`);
        }
        if (harnessContext.duplicateDescriptions.length > 0) {
            lines.push(`Duplicate/alias labels (may contaminate grouping): ${harnessContext.duplicateDescriptions.join(', ')}`);
        }
        if (harnessContext.excludeFromAggregation.length > 0) {
            lines.push(`Rows to exclude from aggregation: ${harnessContext.excludeFromAggregation.join(', ')}`);
        }

        // When the query already filters by the harness-detected detail-row
        // column, tell the AI that parent/subtotal rows are excluded — this
        // should increase chartWorthy confidence.
        if (evidencePlan && queryHasDetailRowFilter(evidencePlan, harnessContext)) {
            lines.push(`Detail-row filter applied: this query includes WHERE ${harnessContext.detailRowColumn}='${harnessContext.detailRowValue}' which excludes parent/subtotal rows. Hierarchy contamination risk is mitigated — chart presentation is safe if the data shape supports it.`);
        }
    }

    return lines.join('\n');
};

const callAiEvidenceEvaluation = async (
    topic: string,
    plan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    settings: Settings,
    harnessContext?: EvidenceHarnessContext | null,
): Promise<AiEvidenceEvaluation | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    try {
        const { model, modelId } = createProviderModel(settings);
        const evidenceText = buildEvidenceSummaryText(plan, summary);
        const semanticText = buildSemanticContextText(semanticUnderstanding, harnessContext, plan);
        const prompt = buildEvidenceEvaluationPrompt(topic, evidenceText, semanticText);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(createEvidenceEvalTimeoutError()), AI_EVAL_TIMEOUT_MS);

        try {
            const result = await withTransientRetry(
                (fb) => streamGenerateText({
                    model: fb ?? model,
                    messages: [
                        { role: 'system', content: 'You are an expert data analyst evaluating SQL query evidence quality. Return one JSON object.' },
                        { role: 'user', content: prompt },
                    ],
                    output: Output.object({
                        schema: jsonSchema(prepareSchemaForProvider(createEvidenceEvaluationSchema(), settings.provider) as Parameters<typeof jsonSchema>[0]),
                    }),
                    abortSignal: controller.signal,
                }),
                { settings, primaryModelId: modelId, label: 'evidenceValueGate', abortSignal: controller.signal },
            );
            clearTimeout(timeout);

            const parsed = result.output !== undefined
                ? result.output as AiEvidenceEvaluation
                : robustlyParseJsonObject(result.text) as AiEvidenceEvaluation;

            if (!parsed || !['pass', 'table_only', 'reject'].includes(parsed.decision)) {
                console.warn(`${LOG_PREFIX} AI evaluation returned invalid decision, falling back to deterministic.`);
                return null;
            }
            return parsed;
        } finally {
            clearTimeout(timeout);
        }
    } catch (error) {
        if (isEvidenceEvalTimeoutError(error)) {
            console.info(`${LOG_PREFIX} AI evidence evaluation timed out, falling back to deterministic.`);
            return null;
        }
        console.warn(`${LOG_PREFIX} AI evidence evaluation failed, falling back to deterministic.`, error);
        return null;
    }
};

const mapAiDecisionToReasonCodes = (
    aiDecision: AiEvidenceEvaluation,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    plan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
): EvidenceValueGateReasonCode[] => {
    if (aiDecision.decision === 'pass' && aiDecision.chartWorthy) return [];

    // Infer reason codes from the evidence shape so downstream consumers
    // (auto-analysis evaluation, presentation planner) still have structured signals.
    const codes: EvidenceValueGateReasonCode[] = [];
    const groupByColumn = plan.query.groupBy?.[0] ?? null;
    if (groupByColumn && semanticUnderstanding.helperDimensions.includes(groupByColumn)) {
        codes.push('helper_dimension');
    }
    if (semanticUnderstanding.unsafeForBusinessNarrative) {
        codes.push('unsafe_business_narrative');
    }
    if (semanticUnderstanding.businessGrainConfidence === 'low') {
        codes.push('low_business_confidence');
    }
    if (summary.rowCount <= 2) {
        codes.push('too_few_rows');
    }
    if ((summary.distinctGroupCount ?? 0) <= 1 && plan.queryMode === 'aggregate') {
        codes.push('single_group_result');
    }
    if (summary.isWideCategorySet) {
        codes.push('fragmented_groups');
    }

    // PR5: chartWorthy === false → append not_chart_worthy
    if (!aiDecision.chartWorthy) {
        codes.push('not_chart_worthy');
    }

    // If no structural codes apply, the AI's qualitative judgement is the only signal.
    return codes;
};

// --- PR5: Decision priority enforcement ---
// reject > table_only > pass
const enforceDecisionPriority = (
    current: EvidenceValueGateResult['decision'],
    floor: EvidenceValueGateResult['decision'],
): EvidenceValueGateResult['decision'] => {
    const priority: Record<EvidenceValueGateResult['decision'], number> = {
        reject: 2,
        table_only: 1,
        pass: 0,
    };
    return priority[floor] > priority[current] ? floor : current;
};

// --- Public API ---

export const evaluateEvidenceValue = (params: {
    semanticUnderstanding: RuntimeSemanticUnderstanding;
    evidencePlan: SqlEvidenceQueryPlan;
    evidenceSummary: SqlEvidenceQueryResultSummary;
    existingAcceptedOutputs?: ExistingAcceptedEvidence[];
    aiEvaluation?: AiEvidenceEvaluation | null;
    harnessContext?: EvidenceHarnessContext | null;
}): EvidenceValueGateResult => {
    const {
        semanticUnderstanding,
        evidencePlan,
        evidenceSummary,
        existingAcceptedOutputs = [],
        aiEvaluation,
        harnessContext,
    } = params;
    const querySignature = buildEvidenceSignature(evidencePlan);
    const semanticSignature = buildSemanticSignature(evidencePlan, evidenceSummary, semanticUnderstanding);

    // 1. Deterministic safety floor — always runs.
    const safetyFloor = evaluateDeterministicSafetyFloor({
        semanticUnderstanding,
        evidencePlan,
        evidenceSummary,
        existingAcceptedOutputs,
        querySignature,
        semanticSignature,
        harnessContext,
    });

    if (safetyFloor.hardReject) {
        return {
            decision: 'reject',
            reasonCodes: safetyFloor.reasonCodes,
            detail: buildDetail(safetyFloor.reasonCodes),
            querySignature,
            semanticSignature,
            semanticRisk: 'high',
        };
    }

    // Blocked dimension (non-duplicate) → at minimum table_only, not reject.
    const semanticSafetyFloor: EvidenceValueGateResult['decision'] =
        safetyFloor.reasonCodes.some(reasonCode => (
            reasonCode === 'blocked_dimension'
            || reasonCode === 'dimension_value_type_mismatch'
        )) ? 'table_only' : 'pass';

    // PR5: Harness contamination checks — deterministic, runs before AI.
    let harnessReasonCodes: EvidenceValueGateReasonCode[] = [];
    let harnessFloorDecision: EvidenceValueGateResult['decision'] = 'pass';
    if (harnessContext) {
        const steeringFloor = evaluateSteeringFloor({
            evidencePlan,
            harnessContext,
        });
        const harnessResult = evaluateHarnessContamination({
            evidencePlan,
            evidenceSummary,
            harnessContext,
        });
        harnessReasonCodes = [
            ...steeringFloor.reasonCodes,
            ...harnessResult.reasonCodes,
        ];
        if (harnessResult.atLeastTableOnly) {
            harnessFloorDecision = 'table_only';
        }
        harnessFloorDecision = enforceDecisionPriority(harnessFloorDecision, steeringFloor.floorDecision);
    }

    // 2. AI evaluation — if provided, use it for quality decisions.
    if (aiEvaluation) {
        const aiReasonCodes = mapAiDecisionToReasonCodes(aiEvaluation, semanticUnderstanding, evidencePlan, evidenceSummary);
        const allReasonCodes: EvidenceValueGateReasonCode[] = [
            ...safetyFloor.reasonCodes,
            ...harnessReasonCodes,
            ...aiReasonCodes,
        ];
        const uniqueReasonCodes = [...new Set(allReasonCodes)];

        // PR5: Conservative merge — AI pass + chartWorthy false → table_only
        let decision = aiEvaluation.decision;
        if (decision === 'pass' && !aiEvaluation.chartWorthy) {
            decision = 'table_only';
            if (!uniqueReasonCodes.includes('not_chart_worthy')) {
                uniqueReasonCodes.push('not_chart_worthy');
            }
        }

        if (hasRecoverableChartWorthiness({
            aiDecision: aiEvaluation,
            aiReasonCodes,
            semanticUnderstanding,
            evidencePlan,
            evidenceSummary,
            harnessContext,
            harnessFloorDecision,
        })) {
            decision = 'pass';
            const notChartWorthyIndex = uniqueReasonCodes.indexOf('not_chart_worthy');
            if (notChartWorthyIndex >= 0) {
                uniqueReasonCodes.splice(notChartWorthyIndex, 1);
            }
        }

        // PR5: Harness deterministic floor cannot be raised by AI
        decision = enforceDecisionPriority(decision, harnessFloorDecision);
        // Blocked dimension floor — cannot be raised by AI or harness
        decision = enforceDecisionPriority(decision, semanticSafetyFloor);

        const degradationSteps: string[] = [];
        if (semanticSafetyFloor !== 'pass') degradationSteps.push(`semantic_safety→${semanticSafetyFloor}`);
        if (harnessFloorDecision !== 'pass') degradationSteps.push(`harness→${harnessFloorDecision}`);

        const semanticRisk: EvidenceValueGateResult['semanticRisk'] = decision === 'pass'
            ? 'low'
            : decision === 'table_only' ? 'medium' : 'high';

        return {
            decision,
            reasonCodes: uniqueReasonCodes,
            detail: aiEvaluation.reasoning || buildDetail(uniqueReasonCodes),
            querySignature,
            semanticSignature,
            semanticRisk,
            degradationPath: degradationSteps.length > 0 ? degradationSteps.join(' + ') : undefined,
        };
    }

    // 3. Deterministic fallback — used when AI evaluation is not available.
    const deterministicQuality = evaluateDeterministicQuality({
        semanticUnderstanding,
        evidencePlan,
        evidenceSummary,
        harnessContext,
    });
    const allReasonCodes: EvidenceValueGateReasonCode[] = [
        ...safetyFloor.reasonCodes,
        ...harnessReasonCodes,
        ...deterministicQuality.reasonCodes,
    ];
    // Deduplicate reason codes from harness (may overlap with deterministic quality)
    const uniqueReasonCodes = [...new Set(allReasonCodes)];
    let decision = deterministicQuality.decision;

    // PR5: Harness floor enforcement in fallback path
    decision = enforceDecisionPriority(decision, harnessFloorDecision);
    // Blocked dimension floor enforcement in fallback path
    decision = enforceDecisionPriority(decision, semanticSafetyFloor);

    const degradationSteps: string[] = [];
    if (semanticSafetyFloor !== 'pass') degradationSteps.push(`semantic_safety→${semanticSafetyFloor}`);
    if (harnessFloorDecision !== 'pass') degradationSteps.push(`harness→${harnessFloorDecision}`);

    const semanticRisk: EvidenceValueGateResult['semanticRisk'] = decision === 'pass'
        ? 'low'
        : decision === 'table_only' ? 'medium' : 'high';

    return {
        decision,
        reasonCodes: uniqueReasonCodes,
        detail: buildDetail(uniqueReasonCodes),
        querySignature,
        semanticSignature,
        semanticRisk,
        degradationPath: degradationSteps.length > 0 ? degradationSteps.join(' + ') : undefined,
    };
};

export { callAiEvidenceEvaluation };
export type { AiEvidenceEvaluation };
