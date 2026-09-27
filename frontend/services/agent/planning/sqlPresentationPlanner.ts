import { Output, jsonSchema } from 'ai';
import { prepareSchemaForProvider } from '../../ai/googleSchemaAdapter';
import type {
    AnalysisPlan,
    ChartType,
    ColumnProfile,
    EvidenceHarnessContext,
    EvidenceValueGateResult,
    PresentationMode,
    QueryAggregateClause,
    RuntimeSemanticUnderstanding,
    Settings,
    SqlEvidenceQueryPlan,
    SqlEvidenceQueryResultSummary,
    SqlPresentationPlan,
} from '../../../types';
import { createProviderModel, isProviderConfigured } from '../../ai/providerConfig';
import { withTransientRetry } from '../../ai/transientRetry';
import { streamGenerateText, isProviderTimeoutError } from '../../ai/streamGenerateText';
import { createSqlPresentationPlanSchema } from '../../ai/schemas/analysisSchemas';
import { buildAnalysisPlannerSystemPrompt, createSqlPresentationPlanPrompt } from '../../prompts/analysisPrompts';
import { robustlyParseJsonObject } from '../../../utils/jsonParser';
import type { ContextTelemetryTarget } from '../../ai/contextManager';
import {
    hasDuplicateNormalizedBuckets,
    isMonotonicSequence,
    isSequentialDimensionName,
    resolveOrdinalIndices,
} from '../../../utils/ordinalSortOrder';
import { resolvePivotDecision } from '../pivotDecision';
import { logPlannerStabilitySignal, PLANNER_STABILITY_REASON_CODES } from './plannerStability';
import { recommendChartType } from '../../../utils/chartTypeUtils';
import { tryResolveAiChartType } from './chartTypeResolver';

const LOG_PREFIX = '[SqlPresentationPlanner]';
const AI_PRESENTATION_TIMEOUT_MS = 30_000;
const VALID_PRESENTATION_MODES = new Set<PresentationMode>(['table', 'chart', 'table_then_chart']);

const isNumericColumn = (column: ColumnProfile | undefined) =>
    column ? ['numerical', 'currency', 'percentage'].includes(column.type) : false;

const isTimeColumn = (column: ColumnProfile | undefined) =>
    column ? ['date', 'time'].includes(column.type) : false;

const findAggregateAliases = (aggregates: QueryAggregateClause[] | undefined) =>
    (aggregates ?? [])
        .map(aggregate => aggregate.as?.trim())
        .filter((alias): alias is string => Boolean(alias));

const buildPresentationDescription = (
    evidencePlan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
    mode: SqlPresentationPlan['presentationMode'],
) => {
    const rowText = `${summary.rowCount} row${summary.rowCount === 1 ? '' : 's'}`;
    if (mode === 'table') {
        return `${evidencePlan.intentSummary} The result is shown as a table first (${rowText}) because a chart could overstate the signal.`;
    }
    if (mode === 'table_then_chart') {
        return `${evidencePlan.intentSummary} Review the result table first, then use the chart as a compact visual summary (${rowText}).`;
    }
    if (mode === 'hidden') {
        return `${evidencePlan.intentSummary} The result is kept out of the default view because it is too weak or technical for a user-facing chart (${rowText}).`;
    }
    return `${evidencePlan.intentSummary} The result is ready to chart after validation (${rowText}).`;
};

export const buildDeterministicSqlPresentationPlan = (
    evidencePlan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
    columns: ColumnProfile[],
    options?: {
        semanticUnderstanding?: RuntimeSemanticUnderstanding;
        valueGate?: EvidenceValueGateResult;
        harnessContext?: EvidenceHarnessContext | null;
    },
): SqlPresentationPlan => {
    const aggregateAliases = findAggregateAliases(evidencePlan.query.aggregates);
    const groupByColumn = evidencePlan.query.groupBy?.[0];
    const groupByProfile = columns.find(column => column.name === groupByColumn);
    const firstMetric = aggregateAliases[0] ?? summary.numericColumns[0];
    const secondMetric = aggregateAliases[1] ?? summary.numericColumns[1];
    const semanticUnderstanding = options?.semanticUnderstanding;
    const valueGate = options?.valueGate;
    const harnessContext = options?.harnessContext;
    const promotedChartType = harnessContext?.promotedChartType ?? null;
    const blockedChartTypeSet = new Set(harnessContext?.blockedChartTypes ?? []);
    const suggestedHideOthers = harnessContext?.suggestedHideOthers ?? false;
    const helperDimension = Boolean(groupByColumn && semanticUnderstanding?.helperDimensions.includes(groupByColumn));
    const blockedDimension = Boolean(groupByColumn && semanticUnderstanding?.blockedDimensions.includes(groupByColumn));
    const businessConfidenceLow = semanticUnderstanding?.businessGrainConfidence === 'low';
    const chartSafe = valueGate?.decision === 'pass'
        && !helperDimension
        && !blockedDimension
        && !businessConfidenceLow
        && !semanticUnderstanding?.unsafeForBusinessNarrative
        && summary.rowCount >= 2
        && (summary.distinctGroupCount ?? summary.rowCount) > 1
        && !summary.isWideCategorySet;

    // table_only evidence still gets a table-first card if the data is chartable — the data table
    // is shown by default (defaultDataVisible=true) and the chart is accessible but not auto-displayed.
    // Excluded when unsafeForBusinessNarrative is true (chart would be actively misleading).
    // isWideCategorySet is intentionally NOT checked here: table display is fine with many groups,
    // and the bar chart will apply defaultTopN=8 to cap the visible bars.
    const tableOnlySafe = valueGate?.decision === 'table_only'
        && !semanticUnderstanding?.unsafeForBusinessNarrative
        && summary.rowCount >= 2
        && (summary.distinctGroupCount ?? summary.rowCount) > 1;

    if (evidencePlan.queryMode === 'rowset') {
        const xValueColumn = summary.numericColumns[0];
        const yValueColumn = summary.numericColumns[1];
        const scatterReady = Boolean(xValueColumn && yValueColumn);
        const presentationMode = valueGate?.decision === 'reject'
            ? 'hidden'
            : scatterReady && (chartSafe || tableOnlySafe) && summary.rowCount <= 60
                ? 'table_then_chart'
                : 'table';
        return {
            title: evidencePlan.title,
            description: buildPresentationDescription(evidencePlan, summary, presentationMode),
            presentationMode,
            chartType: scatterReady ? 'scatter' : undefined,
            bindings: scatterReady ? { xValueColumn, yValueColumn } : undefined,
        };
    }

    // Period columns (e.g. "Period" after unpivot of wide-pivot monthly data)
    // are typed as categorical but represent temporal dimensions. When the harness
    // detected period column families, treat a time-named groupBy as time-series.
    const periodTimeLike = Boolean(
        groupByColumn
        && !isTimeColumn(groupByProfile)
        && (harnessContext?.periodColumnFamilies?.length ?? 0) > 0
        && isSequentialDimensionName(groupByColumn),
    );
    const isTimeSeries = Boolean(
        groupByColumn
        && (
            evidencePlan.preferredResultShape === 'time_series'
            || isTimeColumn(groupByProfile)
            || periodTimeLike
        )
        && firstMetric,
    );
    const comboReady = Boolean(
        groupByColumn
        && firstMetric
        && secondMetric
        && aggregateAliases.length >= 2
        && chartSafe
        && summary.rowCount <= 12,
    );
    // When value gate says "pass" but isWideCategorySet killed chartSafe,
    // still allow a bar chart with defaultTopN — the evidence is good,
    // it just needs top-N capping for the chart to be readable.
    const passWithWideCategories = valueGate?.decision === 'pass'
        && !helperDimension
        && !blockedDimension
        && !businessConfidenceLow
        && !semanticUnderstanding?.unsafeForBusinessNarrative
        && summary.rowCount >= 2
        && (summary.distinctGroupCount ?? summary.rowCount) > 1
        && summary.isWideCategorySet;
    const chartReady = Boolean(groupByColumn && firstMetric && (chartSafe || tableOnlySafe || passWithWideCategories));

    let presentationMode: SqlPresentationPlan['presentationMode'] = valueGate?.decision === 'reject' ? 'hidden' : 'table';
    let chartType: SqlPresentationPlan['chartType'] | undefined;
    let bindings: SqlPresentationPlan['bindings'] | undefined;
    let defaultTopN: number | undefined;
    let defaultHideOthers: boolean | undefined;

    if (presentationMode !== 'hidden' && chartReady) {
        // Use the shared recommendation engine to pick the best chart type
        const recommended = recommendChartType({
            rowCount: summary.rowCount,
            distinctGroupCount: summary.distinctGroupCount ?? summary.rowCount,
            hasNegativeValues: summary.hasNegativeValues,
            isTimeSeries: isTimeSeries && (chartSafe || passWithWideCategories),
            metricCount: secondMetric && comboReady ? 2 : 1,
        });

        // Harness promotion override: if harness promoted a specific type and it's not blocked, prefer it
        const afterHarness = (promotedChartType && !blockedChartTypeSet.has(promotedChartType))
            ? promotedChartType
            : recommended;

        // Block check: if the recommended type is blocked, fall back to bar
        chartType = blockedChartTypeSet.has(afterHarness) ? 'bar' : afterHarness;

        // Combo requires two metrics — guard against recommendation without data
        if (chartType === 'combo' && !comboReady) {
            chartType = 'bar';
        }

        presentationMode = isTimeSeries && summary.rowCount > 24 ? 'chart' : 'table_then_chart';
        bindings = {
            groupByColumn,
            valueColumn: firstMetric,
            ...(chartType === 'combo' && secondMetric ? { secondaryValueColumn: secondMetric } : {}),
        };
        defaultTopN = isTimeSeries ? undefined : summary.rowCount > 8 ? 8 : undefined;
        defaultHideOthers = isTimeSeries ? false : suggestedHideOthers || summary.rowCount > 8;
    }

    if (!chartType || !bindings) {
        presentationMode = 'table';
        if (valueGate?.decision === 'reject') {
            presentationMode = 'hidden';
        }
    }

    return {
        title: evidencePlan.title,
        description: buildPresentationDescription(evidencePlan, summary, presentationMode),
        presentationMode,
        chartType,
        bindings,
        defaultTopN,
        defaultHideOthers,
    };
};

const buildEvidenceSummaryForPrompt = (
    plan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
): string => {
    const lines = [
        `Query mode: ${plan.queryMode}`,
        `Rows: ${summary.rowCount}, Columns: ${summary.columnCount}`,
        `Numeric: ${summary.numericColumns.join(', ') || 'none'}`,
        `Categorical: ${summary.categoricalColumns.join(', ') || 'none'}`,
        `Time: ${summary.timeColumns.join(', ') || 'none'}`,
    ];
    if (plan.query.groupBy?.length) lines.push(`GroupBy: ${plan.query.groupBy.join(', ')}`);
    if (summary.distinctGroupCount != null) lines.push(`Distinct groups: ${summary.distinctGroupCount}`);
    lines.push(`Time series candidate: ${summary.isTimeSeriesCandidate ? 'yes' : 'no'}`);
    lines.push(`Has secondary metric: ${summary.hasSecondaryMetric ? 'yes' : 'no'}`);
    if (summary.previewRows.length > 0) {
        lines.push('Preview:');
        summary.previewRows.slice(0, 3).forEach(row => lines.push(`  ${JSON.stringify(row)}`));
    }
    return lines.join('\n');
};

// Chart families allowed for SQL evidence; all others downgrade to bar or table.
const ALLOWED_CHART_FAMILIES = new Set<ChartType>(['bar', 'line', 'area', 'combo', 'scatter', 'pie', 'doughnut']);

// Value gate reason codes that force table-only presentation (no chart).
const TABLE_FORCE_REASON_CODES = new Set([
    'helper_dimension',
    'blocked_dimension',
    'hierarchy_contamination',
    'duplicate_label_contamination',
    'missing_detail_row_filter',
    'reshape_required',
    'low_signal_confidence',
    'unsafe_business_narrative',
    'not_chart_worthy',
]);

export interface PresentationPlannerOptions {
    semanticUnderstanding?: RuntimeSemanticUnderstanding;
    valueGate?: EvidenceValueGateResult;
    harnessContext?: EvidenceHarnessContext | null;
    telemetryTarget?: Pick<ContextTelemetryTarget, 'logTelemetryEvent'>;
}

const buildReviewContextForPrompt = (
    options?: PresentationPlannerOptions,
): string | null => {
    if (!options) return null;
    const lines: string[] = [];
    const { semanticUnderstanding, valueGate, harnessContext } = options;
    if (valueGate) {
        lines.push(`Value gate decision: ${valueGate.decision}`);
        if (valueGate.reasonCodes.length > 0) {
            lines.push(`Value gate reason codes: ${valueGate.reasonCodes.join(', ')}`);
        }
        if (valueGate.detail) {
            lines.push(`Value gate detail: ${valueGate.detail}`);
        }
    }
    if (semanticUnderstanding) {
        if (semanticUnderstanding.helperDimensions.length > 0) {
            lines.push(`Helper dimensions: ${semanticUnderstanding.helperDimensions.join(', ')}`);
        }
        if (semanticUnderstanding.blockedDimensions.length > 0) {
            lines.push(`Blocked dimensions: ${semanticUnderstanding.blockedDimensions.join(', ')}`);
        }
        lines.push(`Business grain confidence: ${semanticUnderstanding.businessGrainConfidence}`);
        if (semanticUnderstanding.unsafeForBusinessNarrative) {
            lines.push('Unsafe for business narrative: true');
        }
    }
    if (harnessContext) {
        if (harnessContext.reportShapeClass) {
            lines.push(`Canonical report shape class: ${harnessContext.reportShapeClass}`);
        }
        if (harnessContext.detailRowPolicy) {
            lines.push(`Canonical detail row policy: ${harnessContext.detailRowPolicy}`);
        }
        if (harnessContext.hierarchyMode) {
            lines.push(`Canonical hierarchy mode: ${harnessContext.hierarchyMode}`);
        }
        if (harnessContext.widePivotMode) {
            lines.push(`Canonical wide pivot mode: ${harnessContext.widePivotMode}`);
        }
        if (harnessContext.signalConfidence) {
            lines.push(`Canonical signal confidence: ${harnessContext.signalConfidence}`);
        }
        if (harnessContext.parentDescriptions.length > 0) {
            lines.push(`Hierarchy contamination signals: parent labels = ${harnessContext.parentDescriptions.join(', ')}`);
        }
        if (harnessContext.duplicateDescriptions.length > 0) {
            lines.push(`Duplicate label contamination: ${harnessContext.duplicateDescriptions.join(', ')}`);
        }
    }
    return lines.length > 0 ? lines.join('\n    ') : null;
};

const emitPresentationPlannerDegrade = (
    options: PresentationPlannerOptions | undefined,
    reasonCode: typeof PLANNER_STABILITY_REASON_CODES[keyof typeof PLANNER_STABILITY_REASON_CODES],
    detail: string,
    meta?: Record<string, unknown>,
) => {
    logPlannerStabilitySignal(options?.telemetryTarget, reasonCode, detail, meta);
    if (reasonCode !== PLANNER_STABILITY_REASON_CODES.plannerDegradedNonBlocking) {
        logPlannerStabilitySignal(
            options?.telemetryTarget,
            PLANNER_STABILITY_REASON_CODES.plannerDegradedNonBlocking,
            detail,
            {
                reasonCodes: [reasonCode, PLANNER_STABILITY_REASON_CODES.plannerDegradedNonBlocking],
                ...(meta ?? {}),
            },
        );
    }
};

/**
 * Deterministic post-AI safety floor.
 * Validates an AI-generated presentation plan against evidence shape,
 * value gate, and semantic context. Downgrades unsafe choices to table.
 */
export const applyPresentationSafetyFloor = (
    plan: SqlPresentationPlan,
    summary: SqlEvidenceQueryResultSummary,
    evidencePlan: SqlEvidenceQueryPlan,
    options?: PresentationPlannerOptions,
): SqlPresentationPlan => {
    const valueGate = options?.valueGate;
    const semanticUnderstanding = options?.semanticUnderstanding;
    let result = { ...plan };
    const stripPivotFields = (next: SqlPresentationPlan): SqlPresentationPlan => ({
        ...next,
        pivotPresentation: undefined,
        pivotDecision: undefined,
        pivotRequest: undefined,
    });

    // Rule 1: reject → hidden
    if (valueGate?.decision === 'reject') {
        return stripPivotFields({ ...result, presentationMode: 'hidden', chartType: undefined, bindings: undefined });
    }

    // Rule 2: contamination/unsafe signals → table (no chart)
    const hasTableForceReason = valueGate?.reasonCodes.some(c => TABLE_FORCE_REASON_CODES.has(c)) ?? false;
    const lowConfidence = semanticUnderstanding?.businessGrainConfidence === 'low';
    if (hasTableForceReason || lowConfidence) {
        return stripPivotFields({ ...result, presentationMode: 'table', chartType: undefined, bindings: undefined });
    }

    // Rule 3: table_only → ceiling is table_then_chart
    if (valueGate?.decision === 'table_only' && result.presentationMode === 'chart') {
        result = { ...result, presentationMode: 'table_then_chart' };
    }

    // Rule 4: too few rows or single group → table
    if (summary.rowCount < 2 || (summary.distinctGroupCount ?? summary.rowCount) <= 1) {
        return stripPivotFields({ ...result, presentationMode: 'table', chartType: undefined, bindings: undefined });
    }

    // If already table mode, strip chart fields so downstream executors
    // cannot accidentally treat this as a chart-capable plan.
    if (result.presentationMode === 'table') {
        return stripPivotFields({ ...result, chartType: undefined, bindings: undefined });
    }

    // Rule 5: wide categories or many groups → ceiling table_then_chart + topN
    if (summary.isWideCategorySet || (summary.distinctGroupCount ?? 0) > 8) {
        if (result.presentationMode === 'chart') {
            result = { ...result, presentationMode: 'table_then_chart' };
        }
        result = { ...result, defaultTopN: 8, defaultHideOthers: true };
    }

    // Rule 5b: harness Pareto signal → force hideOthers regardless of rowCount
    if (options?.harnessContext?.suggestedHideOthers && !result.defaultHideOthers) {
        result = { ...result, defaultHideOthers: true };
    }

    // Rule 5c: pivot-only dimension pairs → force table_then_chart with pivot artifact flag.
    // A flat bar chart is unreadable when the groupBy cross-product exceeds 100 combinations.
    // This rule fires when the evidence query groups by two columns that form a pivot-only pair.
    const pivotResolution = resolvePivotDecision({
        pivotPreference: plan.pivotPreference ?? 'none',
        evidencePlan,
        evidenceSummary: summary,
        valueGate,
        harnessContext: options?.harnessContext ?? null,
    });
    if (result.chartType === 'bar' && pivotResolution.decision === 'prefer_pivot' && pivotResolution.pivotRequest) {
        result = {
            ...result,
            presentationMode: 'table_then_chart',
            pivotPresentation: true,
            pivotDecision: 'prefer_pivot',
            pivotRequest: pivotResolution.pivotRequest,
        };
    }

    // --- Chart family validation ---
    if (!result.chartType) return result;

    // Rule 6: harness-blocked chart types → deterministic downgrade.
    // Downgrade path: line → bar, bar → table. Other blocked types → table.
    const harnessBlockedTypes = new Set(options?.harnessContext?.blockedChartTypes ?? []);
    if (result.chartType && harnessBlockedTypes.has(result.chartType)) {
        if (result.chartType === 'line') {
            const valueColumn = result.bindings?.valueColumn;
            const groupByCol = result.bindings?.groupByColumn ?? evidencePlan.query.groupBy?.[0];
            if (valueColumn && groupByCol) {
                result = { ...result, chartType: 'bar' };
            } else {
                return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
            }
        } else if (result.chartType === 'bar') {
            return stripPivotFields({ ...result, presentationMode: 'table', chartType: undefined, bindings: undefined });
        } else {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }
    }

    // Disallowed chart families → try bar, else table
    if (!ALLOWED_CHART_FAMILIES.has(result.chartType)) {
        const groupByColumn = result.bindings?.groupByColumn ?? evidencePlan.query.groupBy?.[0];
        const valueColumn = result.bindings?.valueColumn;
        if (evidencePlan.queryMode === 'aggregate' && groupByColumn && valueColumn) {
            result = { ...result, chartType: 'bar' };
        } else {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }
    }

    // Pie/doughnut guardrail: too many groups → downgrade to bar
    if ((result.chartType === 'pie' || result.chartType === 'doughnut')
        && (summary.distinctGroupCount ?? summary.rowCount) > 8) {
        result = { ...result, chartType: 'bar' };
    }

    const aggregateAliases = findAggregateAliases(evidencePlan.query.aggregates);
    const evidenceColumns = new Set(summary.columns);

    // bar: aggregate grouped evidence with valid groupBy + valueColumn;
    // duplicate normalized group buckets indicate unstable evidence shape.
    if (result.chartType === 'bar') {
        const groupByColumn = result.bindings?.groupByColumn ?? evidencePlan.query.groupBy?.[0];
        const valueColumn = result.bindings?.valueColumn;
        if (evidencePlan.queryMode !== 'aggregate' || !groupByColumn || !valueColumn) {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }
        const barPreviewLabels = summary.previewRows
            .map(row => row[groupByColumn])
            .filter((v): v is string | number => v != null)
            .map(String);
        if (hasDuplicateNormalizedBuckets(barPreviewLabels)) {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }
    }

    // line: aggregate grouped, groupBy must be time or recognized ordinal
    // (month/quarter/weekday), preview ordering must be monotonic, and
    // no duplicate x buckets are allowed.
    if (result.chartType === 'line') {
        const groupByColumn = result.bindings?.groupByColumn ?? evidencePlan.query.groupBy?.[0];
        if (evidencePlan.queryMode !== 'aggregate' || !groupByColumn) {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }

        const previewValues = summary.previewRows
            .map(row => row[groupByColumn])
            .filter((v): v is string | number => v != null)
            .map(String);

        // Duplicate x buckets make a line chart misleading.
        if (hasDuplicateNormalizedBuckets(previewValues)) {
            const valueColumn = result.bindings?.valueColumn;
            if (valueColumn) {
                result = { ...result, chartType: 'bar' };
            } else {
                return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
            }
        }

        // Only check monotonicity if still a line after duplicate check.
        if (result.chartType === 'line') {
            let lineAllowed = false;
            if (summary.timeColumns.includes(groupByColumn) || summary.isTimeSeriesCandidate) {
                // Time column: verify monotonic ordering of preview timestamps.
                if (previewValues.length < 2) {
                    lineAllowed = true; // insufficient data to disprove
                } else {
                    const timestamps = previewValues.map(v => new Date(v).getTime());
                    lineAllowed = !timestamps.some(isNaN) && isMonotonicSequence(timestamps);
                }
            } else {
                // Not a time column — try recognized ordinal (month/quarter/weekday/period).
                // If the vocabulary is recognized, allow line regardless of SQL return order —
                // the card executor sorts via tryChronologicalSort before card creation.
                const ordinalIndices = resolveOrdinalIndices(previewValues);
                if (ordinalIndices) {
                    lineAllowed = true;
                }
            }

            if (!lineAllowed) {
                const valueColumn = result.bindings?.valueColumn;
                if (valueColumn) {
                    result = { ...result, chartType: 'bar' };
                } else {
                    return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
                }
            }
        }
    }

    // combo: aggregate grouped, two aggregate aliases, ≤ 12 rows;
    // duplicate group buckets or incomplete secondary metric → downgrade.
    if (result.chartType === 'combo') {
        const comboGroupBy = result.bindings?.groupByColumn ?? evidencePlan.query.groupBy?.[0];
        if (evidencePlan.queryMode !== 'aggregate' || aggregateAliases.length < 2 || summary.rowCount > 12) {
            const valueColumn = result.bindings?.valueColumn;
            if (comboGroupBy && valueColumn) {
                result = { ...result, chartType: 'bar', bindings: { ...result.bindings, secondaryValueColumn: undefined } };
            } else {
                return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
            }
        }
        // Duplicate group buckets → unstable combo shape → table.
        if (result.chartType === 'combo' && comboGroupBy) {
            const comboPreviewLabels = summary.previewRows
                .map(row => row[comboGroupBy])
                .filter((v): v is string | number => v != null)
                .map(String);
            if (hasDuplicateNormalizedBuckets(comboPreviewLabels)) {
                return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
            }
        }
    }

    // scatter: rowset, x/y numeric, ≤ 60 rows
    if (result.chartType === 'scatter') {
        const xVal = result.bindings?.xValueColumn;
        const yVal = result.bindings?.yValueColumn;
        const xNumeric = xVal && summary.numericColumns.includes(xVal);
        const yNumeric = yVal && summary.numericColumns.includes(yVal);
        if (evidencePlan.queryMode !== 'rowset' || !xNumeric || !yNumeric || summary.rowCount > 60) {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }
    }

    // Binding column validation: all must exist in evidence output columns.
    if (result.bindings) {
        const { groupByColumn, valueColumn, secondaryValueColumn, xValueColumn, yValueColumn } = result.bindings;
        const invalid = [groupByColumn, valueColumn, secondaryValueColumn, xValueColumn, yValueColumn]
            .filter(Boolean)
            .some(col => !evidenceColumns.has(col!));
        if (invalid) {
            return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
        }
    }

    // Final: chart mode with no bindings → table
    if (result.presentationMode !== 'table' && result.chartType && !result.bindings) {
        return { ...result, presentationMode: 'table', chartType: undefined, bindings: undefined };
    }

    // Final sanitization: table/hidden must never carry chart fields,
    // even if an intermediate rule changed the mode without clearing them.
    if (result.presentationMode === 'table' || result.presentationMode === 'hidden') {
        return stripPivotFields({ ...result, chartType: undefined, bindings: undefined });
    }

    return result;
};

export const callAiPresentationPlan = async (
    topic: string,
    evidencePlan: SqlEvidenceQueryPlan,
    summary: SqlEvidenceQueryResultSummary,
    columns: ColumnProfile[],
    settings: Settings,
    options?: PresentationPlannerOptions,
): Promise<SqlPresentationPlan | null> => {
    if (!isProviderConfigured(settings)) {
        return null;
    }

    try {
        // Use simpleModel for presentation planning — chart-type selection is a
        // lightweight structural task that does not require the full complex model.
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const evidenceText = buildEvidenceSummaryForPrompt(evidencePlan, summary);
        // Use evidence output columns for binding domain, not full dataset columns.
        const evidenceColumnNames = summary.columns;
        const contextText = `Executed output columns: ${evidenceColumnNames.join(', ')}`;
        const reviewContext = buildReviewContextForPrompt(options);
        const prompt = createSqlPresentationPlanPrompt(topic, contextText, evidenceText, reviewContext);

        const result = await withTransientRetry(
                (fb) => streamGenerateText({
                    model: fb ?? model,
                    messages: [
                        { role: 'system', content: buildAnalysisPlannerSystemPrompt('presentation') },
                        { role: 'user', content: prompt },
                    ],
                    output: Output.object({
                        schema: jsonSchema(prepareSchemaForProvider(createSqlPresentationPlanSchema(evidenceColumnNames), settings.provider) as Parameters<typeof jsonSchema>[0]),
                    }),
                    activityTimeoutMs: AI_PRESENTATION_TIMEOUT_MS,
                }),
                { settings, primaryModelId: modelId, label: 'sqlPresentationPlanner' },
            );

            const parsed = result.output !== undefined
                ? result.output as Record<string, unknown>
                : robustlyParseJsonObject(result.text);

            if (!parsed || !parsed.presentationMode || !parsed.title) {
                console.warn(`${LOG_PREFIX} AI presentation plan returned invalid structure, falling back.`);
                return null;
            }

            // Validate and sanitize AI output against supported types.
            const presentationMode = VALID_PRESENTATION_MODES.has(parsed.presentationMode as PresentationMode)
                ? parsed.presentationMode as PresentationMode
                : 'table';
            const chartType = tryResolveAiChartType(parsed.chartType as string);

            // Validate bindings reference evidence output columns.
            let bindings: SqlPresentationPlan['bindings'] | undefined;
            if (parsed.bindings && typeof parsed.bindings === 'object') {
                const rawBindings = parsed.bindings as Record<string, string>;
                const columnSet = new Set(evidenceColumnNames);
                const validGroupBy = rawBindings.groupByColumn && columnSet.has(rawBindings.groupByColumn)
                    ? rawBindings.groupByColumn : undefined;
                const validValue = rawBindings.valueColumn && columnSet.has(rawBindings.valueColumn)
                    ? rawBindings.valueColumn : undefined;
                const validSecondary = rawBindings.secondaryValueColumn && columnSet.has(rawBindings.secondaryValueColumn)
                    ? rawBindings.secondaryValueColumn : undefined;
                const validX = rawBindings.xValueColumn && columnSet.has(rawBindings.xValueColumn)
                    ? rawBindings.xValueColumn : undefined;
                const validY = rawBindings.yValueColumn && columnSet.has(rawBindings.yValueColumn)
                    ? rawBindings.yValueColumn : undefined;
                if (validGroupBy || validValue || validX || validY) {
                    bindings = {
                        ...(validGroupBy ? { groupByColumn: validGroupBy } : {}),
                        ...(validValue ? { valueColumn: validValue } : {}),
                        ...(validSecondary ? { secondaryValueColumn: validSecondary } : {}),
                        ...(validX ? { xValueColumn: validX } : {}),
                        ...(validY ? { yValueColumn: validY } : {}),
                    };
                }
            }

            // If AI chose a chart mode but provided no valid bindings, downgrade to table.
            if (presentationMode !== 'table' && chartType && !bindings) {
                return applyPresentationSafetyFloor({
                    title: String(parsed.title),
                    description: String(parsed.description || evidencePlan.intentSummary),
                    presentationMode: 'table',
                }, summary, evidencePlan, options);
            }

            const aiPlan: SqlPresentationPlan = {
                title: String(parsed.title),
                description: String(parsed.description || evidencePlan.intentSummary),
                presentationMode,
                chartType,
                bindings,
                defaultTopN: typeof parsed.defaultTopN === 'number' ? parsed.defaultTopN : undefined,
                defaultHideOthers: typeof parsed.defaultHideOthers === 'boolean' ? parsed.defaultHideOthers : undefined,
            };

            // Apply deterministic safety floor to AI output before returning.
            const safePlan = applyPresentationSafetyFloor(aiPlan, summary, evidencePlan, options);

            // If AI defaulted to bar but data characteristics suggest a better chart,
            // upgrade the chart type using the shared recommendation engine.
            if (safePlan.chartType === 'bar' && safePlan.presentationMode !== 'table' && safePlan.presentationMode !== 'hidden') {
                const recommended = recommendChartType({
                    rowCount: summary.rowCount,
                    distinctGroupCount: summary.distinctGroupCount ?? summary.rowCount,
                    hasNegativeValues: summary.hasNegativeValues,
                    isTimeSeries: summary.isTimeSeriesCandidate,
                    metricCount: safePlan.bindings?.secondaryValueColumn ? 2 : 1,
                });
                if (recommended !== 'bar') {
                    safePlan.chartType = recommended;
                }
            }
            const tableForcedByValueGate = safePlan.presentationMode === 'table'
                && aiPlan.presentationMode !== 'table'
                && (
                    options?.valueGate?.reasonCodes.some(code => TABLE_FORCE_REASON_CODES.has(code)) === true
                    || options?.semanticUnderstanding?.businessGrainConfidence === 'low'
                );
            if (tableForcedByValueGate) {
                emitPresentationPlannerDegrade(
                    options,
                    PLANNER_STABILITY_REASON_CODES.tableForcedByValueGate,
                    `AI presentation planning for "${topic}" was downgraded to table mode by the deterministic safety floor.`,
                    {
                        topic,
                        presentationModeBefore: aiPlan.presentationMode,
                        presentationModeAfter: safePlan.presentationMode,
                        chartTypeBefore: aiPlan.chartType ?? null,
                        chartTypeAfter: safePlan.chartType ?? null,
                        reasonCodes: [
                            PLANNER_STABILITY_REASON_CODES.tableForcedByValueGate,
                            PLANNER_STABILITY_REASON_CODES.plannerDegradedNonBlocking,
                        ],
                        valueGateReasonCodes: options?.valueGate?.reasonCodes ?? [],
                    },
                );
            } else if (
                safePlan.presentationMode !== aiPlan.presentationMode
                || safePlan.chartType !== aiPlan.chartType
            ) {
                emitPresentationPlannerDegrade(
                    options,
                    PLANNER_STABILITY_REASON_CODES.plannerDegradedNonBlocking,
                    `AI presentation planning for "${topic}" was adjusted by the deterministic safety floor.`,
                    {
                        topic,
                        presentationModeBefore: aiPlan.presentationMode,
                        presentationModeAfter: safePlan.presentationMode,
                        chartTypeBefore: aiPlan.chartType ?? null,
                        chartTypeAfter: safePlan.chartType ?? null,
                    },
                );
            }
            return safePlan;
    } catch (error) {
        if (isProviderTimeoutError(error)) {
            emitPresentationPlannerDegrade(
                options,
                PLANNER_STABILITY_REASON_CODES.presentationTimeoutFallback,
                `AI presentation planning timed out after ${AI_PRESENTATION_TIMEOUT_MS}ms. Deterministic presentation fallback was used for "${topic}".`,
                {
                    topic,
                    timeoutMs: AI_PRESENTATION_TIMEOUT_MS,
                    reasonCodes: [
                        PLANNER_STABILITY_REASON_CODES.presentationTimeoutFallback,
                        PLANNER_STABILITY_REASON_CODES.plannerDegradedNonBlocking,
                    ],
                },
            );
            console.info(`${LOG_PREFIX} AI presentation planning timed out after ${AI_PRESENTATION_TIMEOUT_MS}ms, using deterministic fallback.`);
            return null;
        }
        console.warn(`${LOG_PREFIX} AI presentation planning failed, falling back to deterministic.`, error);
        return null;
    }
};

export const buildAnalysisPlanFromPresentation = (
    evidencePlan: SqlEvidenceQueryPlan,
    presentationPlan: SqlPresentationPlan,
    evidenceSummary?: SqlEvidenceQueryResultSummary | null,
): AnalysisPlan | null => {
    if (presentationPlan.pivotDecision === 'prefer_pivot') {
        return null;
    }

    if (presentationPlan.presentationMode === 'hidden') {
        return null;
    }

    // Helper: pick the best chart type using data characteristics when available,
    // otherwise fall back to 'bar'.
    const smartDefaultChartType = (metricCount = 1): ChartType => {
        if (!evidenceSummary) return 'bar';
        return recommendChartType({
            rowCount: evidenceSummary.rowCount,
            distinctGroupCount: evidenceSummary.distinctGroupCount ?? evidenceSummary.rowCount,
            hasNegativeValues: evidenceSummary.hasNegativeValues,
            isTimeSeries: evidenceSummary.isTimeSeriesCandidate,
            metricCount,
        });
    };

    // "table" mode: create a table-only card (no chart) so the data is
    // still visible to the user.  Previously this returned null, killing
    // all evidence that didn't qualify for a chart.
    if (presentationPlan.presentationMode === 'table') {
        const groupByColumn = evidencePlan.query.groupBy?.[0];
        const primaryMetric = (evidencePlan.query.aggregates ?? [])
            .map(a => a.as?.trim())
            .find((v): v is string => Boolean(v))
            ?? evidencePlan.query.select.find(c => c !== groupByColumn);
        return {
            chartType: smartDefaultChartType(),
            title: presentationPlan.title,
            description: presentationPlan.description,
            groupByColumn,
            valueColumn: primaryMetric,
            preFilter: evidencePlan.preFilter,
            defaultDataVisible: false,
            artifactMetadata: {
                artifactType: 'distribution',
                dataTableFirst: false,
            },
        };
    }

    const groupByColumn = presentationPlan.bindings?.groupByColumn ?? evidencePlan.query.groupBy?.[0];
    const primaryMetric = presentationPlan.bindings?.valueColumn
        ?? evidencePlan.query.aggregates?.[0]?.as?.trim()
        ?? evidencePlan.query.select.find(column => column !== groupByColumn);
    const xValueColumn = presentationPlan.bindings?.xValueColumn;
    const yValueColumn = presentationPlan.bindings?.yValueColumn;
    const secondaryValueColumn = presentationPlan.bindings?.secondaryValueColumn
        ?? evidencePlan.query.aggregates?.[1]?.as?.trim();
    const fallbackChartType = evidencePlan.queryMode === 'rowset'
        ? 'scatter'
        : smartDefaultChartType(secondaryValueColumn ? 2 : 1);
    const chartType = presentationPlan.chartType ?? fallbackChartType;

    if (!groupByColumn && !xValueColumn && !yValueColumn) {
        return null;
    }

    const primaryAggregate = evidencePlan.query.aggregates?.[0]?.function;
    const secondaryAggregate = evidencePlan.query.aggregates?.[1]?.function;

    return {
        chartType,
        title: presentationPlan.title,
        description: presentationPlan.description,
        aggregation: primaryAggregate === 'sum' || primaryAggregate === 'count' || primaryAggregate === 'avg'
            ? primaryAggregate
            : undefined,
        secondaryAggregation: secondaryAggregate === 'sum' || secondaryAggregate === 'count' || secondaryAggregate === 'avg'
            ? secondaryAggregate
            : undefined,
        groupByColumn,
        valueColumn: primaryMetric,
        xValueColumn,
        yValueColumn,
        secondaryValueColumn,
        preFilter: evidencePlan.preFilter,
        defaultTopN: presentationPlan.defaultTopN,
        defaultHideOthers: presentationPlan.defaultHideOthers,
        defaultDataVisible: false,
        artifactMetadata: {
            artifactType: 'distribution',
            dataTableFirst: false,
        },
    };
};
