import type {
    ColumnProfile,
    PreFilterClause,
    QueryPlan,
    SqlAnalysisPlan,
    SqlEvidenceQueryPlan,
} from '../../../types';
import { resolveStructuredComboDecision } from './comboDecision';
import type { PlannerSemanticIntent } from './planGenerator';
import { topicPrefersAverageAggregation } from './evidenceQuerySemantics';
import { normalizePreFilterOperator } from '../../../utils/planValidation/preFilterSupport';
import { PLANNER_STABILITY_REASON_CODES, type PlannerStabilityReasonCode } from './plannerStability';
import type { PeriodColumnFamily, QuarterIntent } from '../runtime/periodColumnDetector';
import { detectQuarterIntent, findMissingQuarterColumns } from '../runtime/periodColumnDetector';
import {
    normalizeString, normalizeTopicText, normalizeColumnWords,
    tokenizeForTopicMatch, topicMentionsColumn,
    getTopicColumnMatchScore, hasDistinctTopicTargetMention,
    columnsShareTopicIdentity,
    extractTopicGroupingClause, inferTopicGroupByTarget, inferCountTopicOperandTarget,
    COUNT_INTENT_PATTERN, GENERIC_COUNT_TOPIC_PATTERN,
} from './semanticTextMatching';
import {
    isObject, normalizeAggregateAliases, normalizeOutputKey,
    splitAggregateSourceExpression,
    repairAggregateAliasConflicts, repairEvidenceQuerySelectAlignment,
    normalizeQuery, normalizeEvidenceQuery,
} from './queryRepair';

/** Semantic role hints from the dataset context, used for fallback validation
 *  when literal topic-text matching cannot confirm a column's suitability. */
export interface TopicAlignmentSemanticHints {
    knownMetricColumns?: string[];
    knownDimensionColumns?: string[];
    businessGrains?: string[];
    candidateMetrics?: string[];
}

const AGGREGATE_CHARTS = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'combo']);
const ROWSET_CHARTS = new Set(['scatter', 'bubble']);
const VALUE_CHARTS = new Set(['bar', 'line', 'pie', 'doughnut', 'radar']);

const aggregateSourceExists = (value: string | undefined, availableColumns: Set<string>) => {
    if (!value) {
        return true;
    }
    if (availableColumns.has(value.toLowerCase())) {
        return true;
    }
    const expressionParts = splitAggregateSourceExpression(value);
    return Boolean(expressionParts && expressionParts.every(part => availableColumns.has(part.toLowerCase())));
};

const normalizeEvidencePreFilter = (value: unknown): PreFilterClause[] | undefined => {
    const rawClauses = Array.isArray(value)
        ? value
        : isObject(value)
            ? [value]
            : [];
    if (rawClauses.length === 0) {
        return undefined;
    }

    const normalized = rawClauses.flatMap(rawClause => {
        if (!isObject(rawClause)) {
            return [];
        }
        const column = normalizeString(rawClause.column);
        if (!column) {
            return [];
        }
        const value = rawClause.value;
        if (
            value === undefined
            || (Array.isArray(value) && value.length === 0)
        ) {
            return [];
        }
        const operator = normalizePreFilterOperator(normalizeString(rawClause.operator) || undefined).normalized;
        return [{
            column,
            operator,
            value: value as PreFilterClause['value'],
        }];
    });

    return normalized.length > 0 ? normalized : undefined;
};

const validateBindings = (plan: SqlAnalysisPlan, columns: ColumnProfile[]) => {
    const errors: string[] = [];
    const availableColumns = new Set(columns.map(column => column.name.toLowerCase()));
    const outputColumns = new Set((plan.query.select ?? []).map(column => column.trim().toLowerCase()).filter(Boolean));
    const aliases = normalizeAggregateAliases(plan.query.aggregates);

    const ensureDatasetColumn = (value: string | undefined, label: string) => {
        if (!value) return;
        if (!availableColumns.has(value.toLowerCase())) {
            errors.push(`${label} references missing dataset column: ${value}`);
        }
    };

    const ensureOutputColumn = (value: string | undefined, label: string) => {
        if (!value) return;
        const key = value.toLowerCase();
        if (!outputColumns.has(key)) {
            errors.push(`${label} must reference a selected output column: ${value}`);
        }
    };

    ensureDatasetColumn(plan.bindings.groupByColumn, 'bindings.groupByColumn');
    ensureDatasetColumn(plan.bindings.xValueColumn, 'bindings.xValueColumn');
    ensureDatasetColumn(plan.bindings.yValueColumn, 'bindings.yValueColumn');
    ensureOutputColumn(plan.bindings.groupByColumn, 'bindings.groupByColumn');
    ensureOutputColumn(plan.bindings.xValueColumn, 'bindings.xValueColumn');
    ensureOutputColumn(plan.bindings.yValueColumn, 'bindings.yValueColumn');
    ensureOutputColumn(plan.bindings.valueColumn, 'bindings.valueColumn');
    ensureOutputColumn(plan.bindings.secondaryValueColumn, 'bindings.secondaryValueColumn');

    if (plan.bindings.valueColumn) {
        const key = plan.bindings.valueColumn.toLowerCase();
        if (!aliases.has(key) && !availableColumns.has(key)) {
            errors.push(`bindings.valueColumn must reference a dataset column or aggregate alias: ${plan.bindings.valueColumn}`);
        }
    }

    if (plan.bindings.secondaryValueColumn) {
        const key = plan.bindings.secondaryValueColumn.toLowerCase();
        if (!aliases.has(key) && !availableColumns.has(key)) {
            errors.push(`bindings.secondaryValueColumn must reference a dataset column or aggregate alias: ${plan.bindings.secondaryValueColumn}`);
        }
    }

    return errors;
};

const validateEvidenceQuery = (plan: SqlEvidenceQueryPlan, columns: ColumnProfile[]) => {
    const errors: string[] = [];
    const availableColumns = new Set(columns.map(column => column.name.toLowerCase()));
    const outputColumns = new Set((plan.query.select ?? []).map(column => column.trim().toLowerCase()).filter(Boolean));
    const aliases = normalizeAggregateAliases(plan.query.aggregates);

    const ensureColumnExists = (value: string | undefined, label: string) => {
        if (!value) return;
        if (!availableColumns.has(value.toLowerCase())) {
            errors.push(`${label} references missing dataset column: ${value}`);
        }
    };

    (plan.query.groupBy ?? []).forEach((column, index) => {
        ensureColumnExists(column, `query.groupBy[${index}]`);
        if (!outputColumns.has(column.toLowerCase())) {
            errors.push(`query.groupBy[${index}] must also appear in query.select: ${column}`);
        }
    });

    (plan.query.aggregates ?? []).forEach((aggregate, index) => {
        if (!aggregateSourceExists(aggregate.column, availableColumns)) {
            errors.push(`query.aggregates[${index}].column references missing dataset column: ${aggregate.column}`);
        }
        if (aggregate.as && !outputColumns.has(aggregate.as.toLowerCase())) {
            errors.push(`query.aggregates[${index}].as must appear in query.select: ${aggregate.as}`);
        }
    });

    (plan.query.select ?? []).forEach((column, index) => {
        const key = column.toLowerCase();
        if (!availableColumns.has(key) && !aliases.has(key)) {
            errors.push(`query.select[${index}] must reference a dataset column or aggregate alias: ${column}`);
        }
    });

    if (plan.queryMode === 'aggregate') {
        if ((plan.query.groupBy?.length ?? 0) === 0) {
            errors.push("Aggregate evidence queries must include at least one groupBy column.");
        }
        if ((plan.query.aggregates?.length ?? 0) === 0) {
            errors.push("Aggregate evidence queries must include at least one aggregate clause.");
        }
    }

    if (plan.queryMode === 'rowset' && (plan.query.select?.length ?? 0) < 2) {
        errors.push('Rowset evidence queries must expose at least two selected output columns.');
    }

    if (!plan.intentSummary.trim()) {
        errors.push("Evidence plan is missing required field: 'intentSummary'.");
    }

    (plan.preFilter ?? []).forEach((filter, index) => {
        ensureColumnExists(filter.column, `preFilter[${index}].column`);
    });

    return errors;
};

const isSemanticDimension = (
    columnName: string,
    profile: ColumnProfile | undefined,
    hints?: TopicAlignmentSemanticHints,
): boolean => {
    if (!hints || !profile) return false;
    if (!['categorical', 'date', 'time'].includes(profile.type)) return false;
    return hints.knownDimensionColumns?.includes(columnName) === true
        || hints.businessGrains?.includes(columnName) === true;
};

const isSemanticMetric = (
    columnName: string,
    profile: ColumnProfile | undefined,
    hints?: TopicAlignmentSemanticHints,
): boolean => {
    if (!hints || !profile) return false;
    if (!['numerical', 'currency', 'percentage'].includes(profile.type)) return false;
    return hints.knownMetricColumns?.includes(columnName) === true
        || hints.candidateMetrics?.includes(columnName) === true;
};

const validateTopicAlignment = (
    plan: SqlEvidenceQueryPlan,
    columns: ColumnProfile[],
    topic?: string,
    intent?: PlannerSemanticIntent,
    semanticHints?: TopicAlignmentSemanticHints,
    options?: { lenient?: boolean },
) => {
    const errors: string[] = [];
    const columnByName = new Map(columns.map(column => [column.name, column]));
    const countIntent = COUNT_INTENT_PATTERN.test(normalizeString(topic));
    const preferredGroupByColumn = intent?.preferredGroupBy ? columnByName.get(intent.preferredGroupBy) : null;
    const preferredMetricColumn = intent?.preferredMetric ? columnByName.get(intent.preferredMetric) : null;
    const preferredGroupByLooksUsable = preferredGroupByColumn
        ? ['categorical', 'date', 'time'].includes(preferredGroupByColumn.type)
        : false;
    const preferredMetricLooksUsable = preferredMetricColumn
        ? (
            ['numerical', 'currency', 'percentage'].includes(preferredMetricColumn.type)
            || (countIntent && ['categorical', 'date', 'time'].includes(preferredMetricColumn.type))
        )
        : false;
    const topicGroupingClause = extractTopicGroupingClause(normalizeString(topic));
    const candidateColumnNames = columns.map(column => column.name);
    const topicGroupByTarget = inferTopicGroupByTarget(normalizeString(topic), candidateColumnNames);
    const topicCountOperandTarget = inferCountTopicOperandTarget(normalizeString(topic), candidateColumnNames);
    const targetTopicMatchScore = topicGroupingClause && topicGroupByTarget
        ? getTopicColumnMatchScore(topicGroupingClause, topicGroupByTarget)
        : Number.NEGATIVE_INFINITY;
    const preferredTopicMatchScore = topicGroupingClause && intent?.preferredGroupBy
        ? getTopicColumnMatchScore(topicGroupingClause, intent.preferredGroupBy)
        : Number.NEGATIVE_INFINITY;
    const targetIsDistinctTopicTarget = Boolean(
        topicGroupingClause
        && topicGroupByTarget
        && hasDistinctTopicTargetMention(topicGroupingClause, topicGroupByTarget, candidateColumnNames),
    );
    const preferredIsDistinctTopicTarget = Boolean(
        topicGroupingClause
        && intent?.preferredGroupBy
        && hasDistinctTopicTargetMention(topicGroupingClause, intent.preferredGroupBy, candidateColumnNames),
    );
    const recoveredExplicitTopicGroupBy = Boolean(
        topicGroupByTarget
        && plan.query.groupBy?.[0] === topicGroupByTarget
        && intent?.preferredGroupBy
        && intent.preferredGroupBy !== topicGroupByTarget
        && targetIsDistinctTopicTarget
        && !preferredIsDistinctTopicTarget
        && targetTopicMatchScore > preferredTopicMatchScore
    );
    const recoveredCountIntentSwap = Boolean(
        countIntent
        && topicGroupByTarget
        && topicCountOperandTarget
        && plan.query.groupBy?.[0] === topicGroupByTarget
        && plan.query.aggregates?.[0]?.column === topicCountOperandTarget
        && (
            intent?.preferredGroupBy === topicCountOperandTarget
            || intent?.preferredMetric === topicGroupByTarget
        ),
    );

    if (
        preferredGroupByLooksUsable
        && intent?.preferredGroupBy
        && plan.query.groupBy?.[0]
        && plan.query.groupBy[0] !== intent.preferredGroupBy
        && !recoveredCountIntentSwap
        && !recoveredExplicitTopicGroupBy
    ) {
        // Allow when the plan's groupBy shares column-family identity with the
        // intent column (e.g. PARTY_2 customer name vs PARTY customer code).
        // The intent is a preference, not a mandate — the AI planner may have
        // valid reasons for the alternative.
        if (!columnsShareTopicIdentity(plan.query.groupBy[0], intent.preferredGroupBy)) {
            if (!options?.lenient) {
                errors.push(`Evidence query groupBy "${plan.query.groupBy[0]}" does not match runtime intent "${intent.preferredGroupBy}".`);
                return errors;
            }
            // Lenient: intent mismatch is a quality signal, not a structural error.
            // The AI planner may have legitimate reasons for the alternative.
        }
    }
    if (
        preferredMetricLooksUsable
        && intent?.preferredMetric
        && plan.query.aggregates?.[0]?.column
        && plan.query.aggregates[0].column !== intent.preferredMetric
        && !recoveredCountIntentSwap
    ) {
        if (!columnsShareTopicIdentity(plan.query.aggregates[0].column, intent.preferredMetric)) {
            if (!options?.lenient) {
                errors.push(`Evidence query metric "${plan.query.aggregates[0].column}" does not match runtime intent "${intent.preferredMetric}".`);
                return errors;
            }
        }
    }

    const normalizedTopic = normalizeString(topic);
    if (!normalizedTopic) {
        return errors;
    }

    const dimensionColumns = columns
        .filter(column => column.type === 'categorical' || column.type === 'date' || column.type === 'time')
        .map(column => column.name);
    const mentionedDimensions = dimensionColumns.filter(column => topicMentionsColumn(normalizedTopic, column));
    const groupByColumn = plan.query.groupBy?.[0];
    const topicGroupByTargetFromDimensions = inferTopicGroupByTarget(normalizedTopic, dimensionColumns);
    if (groupByColumn && topicGroupByTargetFromDimensions && groupByColumn !== topicGroupByTargetFromDimensions) {
        // Allow when the topic's grouping clause also mentions the plan's column
        // as a distinct target — e.g. "by party" mentions both PARTY and PARTY_2,
        // so the planner choosing PARTY_2 (customer name) is a valid alternative.
        const groupingClause = extractTopicGroupingClause(normalizedTopic);
        const planGroupByIsValidAlternative = Boolean(
            groupingClause
            && topicMentionsColumn(groupingClause, groupByColumn)
            && hasDistinctTopicTargetMention(groupingClause, groupByColumn, candidateColumnNames),
        );
        if (!planGroupByIsValidAlternative && !options?.lenient) {
            errors.push(`Evidence query groupBy "${groupByColumn}" does not match the topic grouping target "${topicGroupByTargetFromDimensions}".`);
            return errors;
        }
    }
    if (
        groupByColumn
        && mentionedDimensions.length > 0
        && !mentionedDimensions.includes(groupByColumn)
    ) {
        // Same escape: if the grouping clause mentions the plan's column, allow.
        const groupingClause = extractTopicGroupingClause(normalizedTopic);
        const planGroupByIsValidAlternative = Boolean(
            groupingClause
            && topicMentionsColumn(groupingClause, groupByColumn)
            && hasDistinctTopicTargetMention(groupingClause, groupByColumn, candidateColumnNames),
        );
        if (!planGroupByIsValidAlternative && !options?.lenient) {
            const profile = columnByName.get(groupByColumn);
            if (!isSemanticDimension(groupByColumn, profile, semanticHints)) {
                errors.push(`Evidence query groupBy "${groupByColumn}" does not match the topic wording. Expected one of: ${mentionedDimensions.join(', ')}`);
            }
        }
    }

    const aggregates = plan.query.aggregates ?? [];
    if (aggregates.length === 0) {
        return errors;
    }

    const mentionedColumns = columns
        .map(column => column.name)
        .filter(column => topicMentionsColumn(normalizedTopic, column));
    const mentionedMetricColumns = mentionedColumns.filter(column => column !== groupByColumn);
    const primaryAggregate = aggregates[0];

    if (!primaryAggregate) {
        return errors;
    }

    if (countIntent) {
        const specificCountTargets = mentionedMetricColumns.filter(column =>
            !GENERIC_COUNT_TOPIC_PATTERN.test(column)
            && !columnsShareTopicIdentity(column, groupByColumn)
            && !columnsShareTopicIdentity(column, topicGroupByTargetFromDimensions),
        );
        if (specificCountTargets.length > 0) {
            if (!primaryAggregate.column) {
                errors.push(`Count topic mentions ${specificCountTargets.join(', ')}, but the evidence query uses COUNT(*) instead of that column.`);
            } else if (!specificCountTargets.includes(primaryAggregate.column)) {
                errors.push(`Count topic mentions ${specificCountTargets.join(', ')}, but the evidence query counts "${primaryAggregate.column}" instead.`);
            }
        }
        return errors;
    }

    if (
        primaryAggregate.function !== 'count'
        && primaryAggregate.function !== 'count_distinct'
        && mentionedMetricColumns.length > 0
        && primaryAggregate.column
        && !mentionedMetricColumns.includes(primaryAggregate.column)
    ) {
        // Allow when the plan's metric shares column-family identity with a
        // mentioned metric (e.g. same semantic root but different suffix).
        const hasSemanticRelation = mentionedMetricColumns.some(column =>
            columnsShareTopicIdentity(column, primaryAggregate.column!),
        );
        if (!hasSemanticRelation) {
            const metricProfile = columnByName.get(primaryAggregate.column);
            if (!isSemanticMetric(primaryAggregate.column, metricProfile, semanticHints)) {
                errors.push(`Evidence query metric "${primaryAggregate.column}" does not match the topic wording. Expected one of: ${mentionedMetricColumns.join(', ')}`);
            }
        }
    }

    if (
        primaryAggregate.column
        && primaryAggregate.function === 'sum'
        && topicPrefersAverageAggregation(
            topic,
            primaryAggregate.column,
            columnByName.get(primaryAggregate.column) ?? null,
        )
    ) {
        errors.push(`Evidence query metric "${primaryAggregate.column}" is ratio-like for topic "${topic}", so the aggregate function must be AVG instead of SUM.`);
    }

    return errors;
};

export const collectEvidencePlanStabilityReasonCodes = (
    plan: SqlEvidenceQueryPlan,
    columns: ColumnProfile[],
    options?: { topic?: string; intent?: PlannerSemanticIntent; semanticHints?: TopicAlignmentSemanticHints },
): PlannerStabilityReasonCode[] => {
    const reasonCodes = new Set<PlannerStabilityReasonCode>();
    const topic = options?.topic;
    const intent = options?.intent;
    const groupByColumn = plan.query.groupBy?.[0] ?? null;
    const metricColumn = plan.query.aggregates?.[0]?.column ?? null;
    if (!intent || !topic) {
        return [];
    }

    const candidateColumnNames = columns.map(column => column.name);
    const topicGroupByTarget = inferTopicGroupByTarget(topic, candidateColumnNames);
    const topicGroupingClause = extractTopicGroupingClause(topic);
    const targetTopicMatchScore = topicGroupingClause && topicGroupByTarget
        ? getTopicColumnMatchScore(topicGroupingClause, topicGroupByTarget)
        : Number.NEGATIVE_INFINITY;
    const preferredTopicMatchScore = topicGroupingClause && intent.preferredGroupBy
        ? getTopicColumnMatchScore(topicGroupingClause, intent.preferredGroupBy)
        : Number.NEGATIVE_INFINITY;
    const targetIsDistinctTopicTarget = Boolean(
        topicGroupingClause
        && topicGroupByTarget
        && hasDistinctTopicTargetMention(topicGroupingClause, topicGroupByTarget, candidateColumnNames),
    );
    const preferredIsDistinctTopicTarget = Boolean(
        topicGroupingClause
        && intent.preferredGroupBy
        && hasDistinctTopicTargetMention(topicGroupingClause, intent.preferredGroupBy, candidateColumnNames),
    );
    const topicCountOperandTarget = inferCountTopicOperandTarget(topic, candidateColumnNames);
    if (
        COUNT_INTENT_PATTERN.test(normalizeString(topic))
        && topicGroupByTarget
        && topicCountOperandTarget
        && groupByColumn === topicGroupByTarget
        && metricColumn === topicCountOperandTarget
        && (
            intent.preferredGroupBy === topicCountOperandTarget
            || intent.preferredMetric === topicGroupByTarget
        )
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    if (
        intent.preferredGroupBy
        && intent.preferredMetric
        && groupByColumn
        && metricColumn
        && intent.preferredGroupBy === metricColumn
        && intent.preferredMetric === groupByColumn
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    if (
        intent.preferredGroupBy
        && groupByColumn
        && intent.preferredGroupBy !== groupByColumn
        && topicGroupByTarget
        && topicGroupByTarget === groupByColumn
        && targetIsDistinctTopicTarget
        && !preferredIsDistinctTopicTarget
        && targetTopicMatchScore > preferredTopicMatchScore
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    if (
        intent.preferredMetric
        && metricColumn
        && intent.preferredMetric !== metricColumn
        && topicMentionsColumn(topic, metricColumn)
        && !topicMentionsColumn(topic, intent.preferredMetric)
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    // Column-family identity recovery: plan uses a column that shares semantic
    // tokens with the intent column (e.g. PARTY_2 vs PARTY).
    if (
        intent.preferredGroupBy
        && groupByColumn
        && intent.preferredGroupBy !== groupByColumn
        && columnsShareTopicIdentity(groupByColumn, intent.preferredGroupBy)
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    // Metric column-family identity recovery: plan's metric shares semantic
    // tokens with the intent metric (e.g. "YTD GROSS PROFIT" vs "GROSS PROFIT").
    if (
        intent.preferredMetric
        && metricColumn
        && intent.preferredMetric !== metricColumn
        && columnsShareTopicIdentity(metricColumn, intent.preferredMetric)
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    // Topic grouping clause recovery: plan's groupBy is a valid alternative
    // mentioned by the topic's "by X" clause (e.g. "by party" mentions both
    // PARTY and PARTY_2 as distinct targets).
    if (
        groupByColumn
        && topicGroupByTarget
        && groupByColumn !== topicGroupByTarget
        && topicGroupingClause
        && topicMentionsColumn(topicGroupingClause, groupByColumn)
        && hasDistinctTopicTargetMention(topicGroupingClause, groupByColumn, candidateColumnNames)
    ) {
        reasonCodes.add(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    }

    return [...reasonCodes];
};

export const normalizeAndValidateSqlAnalysisPlan = (
    rawPlan: unknown,
    columns: ColumnProfile[],
): { validPlan: SqlAnalysisPlan | null; errors: string[] } => {
    if (!isObject(rawPlan) || !isObject(rawPlan.query) || !isObject(rawPlan.bindings)) {
        return { validPlan: null, errors: ['Plan must include object-shaped query and bindings fields.'] };
    }

    const plan: SqlAnalysisPlan = {
        chartType: normalizeString(rawPlan.chartType) as SqlAnalysisPlan['chartType'],
        title: normalizeString(rawPlan.title),
        description: normalizeString(rawPlan.description),
        queryMode: normalizeString(rawPlan.queryMode) === 'rowset' ? 'rowset' : 'aggregate',
        query: rawPlan.query as QueryPlan,
        bindings: rawPlan.bindings as SqlAnalysisPlan['bindings'],
        aggregation: normalizeString(rawPlan.aggregation) as SqlAnalysisPlan['aggregation'],
        secondaryAggregation: normalizeString(rawPlan.secondaryAggregation) as SqlAnalysisPlan['secondaryAggregation'],
        defaultTopN: Number.isInteger(rawPlan.defaultTopN) ? Number(rawPlan.defaultTopN) : undefined,
        defaultHideOthers: typeof rawPlan.defaultHideOthers === 'boolean' ? rawPlan.defaultHideOthers : undefined,
    };

    const errors: string[] = [];

    if (!plan.title) errors.push("Plan is missing required field: 'title'.");
    if (!plan.description) errors.push("Plan is missing required field: 'description'.");
    if (!plan.chartType) errors.push("Plan is missing required field: 'chartType'.");

    const comboDecision = resolveStructuredComboDecision({
        chartType: plan.chartType,
        bindings: plan.bindings,
        aggregation: plan.aggregation,
        secondaryAggregation: plan.secondaryAggregation,
        query: plan.query,
        columns,
        isSqlFirst: true,
    });
    plan.chartType = comboDecision.chartType;
    plan.bindings = comboDecision.bindings;
    plan.secondaryAggregation = comboDecision.secondaryAggregation;

    if (AGGREGATE_CHARTS.has(plan.chartType)) {
        plan.queryMode = 'aggregate';
        if (!plan.bindings.groupByColumn) {
            errors.push(`For a '${plan.chartType}' chart, bindings.groupByColumn is required.`);
        }
        if (VALUE_CHARTS.has(plan.chartType) && !plan.bindings.valueColumn) {
            errors.push(`For a '${plan.chartType}' chart, bindings.valueColumn is required.`);
        }
        if (plan.chartType === 'combo') {
            if (!plan.bindings.valueColumn || !plan.bindings.secondaryValueColumn) {
                errors.push("For a 'combo' chart, bindings.valueColumn and bindings.secondaryValueColumn are required.");
            }
        }
    } else if (ROWSET_CHARTS.has(plan.chartType)) {
        plan.queryMode = 'rowset';
        if (!plan.bindings.xValueColumn || !plan.bindings.yValueColumn) {
            errors.push(`For a '${plan.chartType}' chart, bindings.xValueColumn and bindings.yValueColumn are required.`);
        }
        if (plan.chartType === 'bubble' && !plan.bindings.valueColumn) {
            errors.push("For a 'bubble' chart, bindings.valueColumn is required.");
        }
    } else {
        errors.push(`Unsupported chart type for SQL-first planning: ${plan.chartType}`);
    }

    plan.query = normalizeQuery(plan);

    const analysisAliasRepair = repairAggregateAliasConflicts(plan.query);
    if (analysisAliasRepair.repaired) {
        console.debug('[SqlPlanValidator] Auto-repaired analysis plan aggregate aliases:', analysisAliasRepair.repairs.join('; '));
    }

    // Auto-repair structural select alignment (same as evidence query plans).
    const analysisSelectRepair = repairEvidenceQuerySelectAlignment(plan.query);
    if (analysisSelectRepair.repaired) {
        console.debug('[SqlPlanValidator] Auto-repaired analysis plan select alignment:', analysisSelectRepair.repairs.join('; '));
    }

    errors.push(...validateBindings(plan, columns));

    if ((plan.query.select?.length ?? 0) === 0) {
        errors.push('The SQL-first plan must expose at least one selected output column.');
    }

    return errors.length > 0
        ? { validPlan: null, errors }
        : { validPlan: plan, errors: [] };
};

/**
 * Quarter semantic drift repair.
 *
 * When the topic clearly intends a full quarter (Q4, "October to December 2010")
 * but the AI plan only references a single month column in its aggregates,
 * expand the aggregate to cover all constituent month columns.
 *
 * Also repairs the title and intentSummary if they only mention a single month
 * when the topic intends the full quarter.
 */
const repairQuarterSemanticDrift = (
    plan: SqlEvidenceQueryPlan,
    columns: ColumnProfile[],
    topic: string | undefined,
    periodFamilies: PeriodColumnFamily[],
): { repaired: boolean; repairs: string[] } => {
    const repairs: string[] = [];
    if (!topic || periodFamilies.length === 0) {
        return { repaired: false, repairs };
    }

    const quarterIntent = detectQuarterIntent(topic, periodFamilies);
    if (!quarterIntent || quarterIntent.monthColumns.length < 2) {
        return { repaired: false, repairs };
    }

    const requiredColumns = quarterIntent.monthColumns;
    const requiredColumnsLower = new Set(requiredColumns.map(c => c.toLowerCase()));

    // Repair aggregates: expand single-month to full quarter expression.
    for (const aggregate of plan.query.aggregates ?? []) {
        if (!aggregate.column || aggregate.function !== 'sum') continue;

        const missing = findMissingQuarterColumns(aggregate.column, quarterIntent);
        if (missing.length > 0 && missing.length < requiredColumns.length) {
            // The aggregate references some but not all quarter months — expand.
            const fullExpression = requiredColumns.join(' + ');
            repairs.push(
                `Expanded aggregate "${aggregate.as}" column from "${aggregate.column}" to "${fullExpression}" to cover full ${quarterIntent.quarter}`,
            );
            aggregate.column = fullExpression;
        } else if (missing.length === requiredColumns.length) {
            // The aggregate column doesn't reference ANY quarter month columns.
            // Check if it references a single month that belongs to the quarter.
            const colLower = aggregate.column.trim().toLowerCase();
            if (requiredColumnsLower.has(colLower)) {
                const fullExpression = requiredColumns.join(' + ');
                repairs.push(
                    `Expanded single-month aggregate "${aggregate.as}" from "${aggregate.column}" to "${fullExpression}" to cover full ${quarterIntent.quarter}`,
                );
                aggregate.column = fullExpression;
            }
        }
    }

    // Repair title and intentSummary: replace single-month mentions with the
    // quarter label. A single-month column name in a quarter-intent title is
    // always wrong (e.g. "Sum OCT 2010" when the topic says Q4), regardless
    // of whether the quarter label appears elsewhere in the string.
    const quarterLabel = quarterIntent.year
        ? `${quarterIntent.quarter} ${quarterIntent.year}`
        : quarterIntent.quarter;
    for (const monthCol of requiredColumns) {
        const monthPattern = new RegExp(`\\b${escapeRegex(monthCol)}\\b`, 'gi');
        if (monthPattern.test(plan.title)) {
            const oldTitle = plan.title;
            plan.title = plan.title.replace(monthPattern, quarterLabel);
            repairs.push(`Repaired title from "${oldTitle}" to "${plan.title}" to reflect full ${quarterIntent.quarter}`);
            break;
        }
    }

    for (const monthCol of requiredColumns) {
        const monthPattern = new RegExp(`\\b${escapeRegex(monthCol)}\\b`, 'gi');
        if (monthPattern.test(plan.intentSummary)) {
            plan.intentSummary = plan.intentSummary.replace(monthPattern, quarterLabel);
            repairs.push(`Repaired intentSummary to reflect full ${quarterIntent.quarter}`);
            break;
        }
    }

    return { repaired: repairs.length > 0, repairs };
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeAndValidateSqlEvidenceQueryPlan = (
    rawPlan: unknown,
    columns: ColumnProfile[],
    options?: {
        topic?: string;
        intent?: PlannerSemanticIntent;
        semanticHints?: TopicAlignmentSemanticHints;
        lenient?: boolean;
        periodFamilies?: PeriodColumnFamily[];
    },
): { validPlan: SqlEvidenceQueryPlan | null; errors: string[] } => {
    if (!isObject(rawPlan) || !isObject(rawPlan.query)) {
        return { validPlan: null, errors: ['Evidence query plan must include an object-shaped query field.'] };
    }

    const plan: SqlEvidenceQueryPlan = {
        title: normalizeString(rawPlan.title),
        queryMode: normalizeString(rawPlan.queryMode) === 'rowset' ? 'rowset' : 'aggregate',
        query: rawPlan.query as QueryPlan,
        intentSummary: normalizeString(rawPlan.intentSummary),
        preferredResultShape: normalizeString(rawPlan.preferredResultShape) as SqlEvidenceQueryPlan['preferredResultShape'],
        preFilter: normalizeEvidencePreFilter(rawPlan.preFilter),
    };

    const errors: string[] = [];
    if (!plan.title) errors.push("Evidence plan is missing required field: 'title'.");

    plan.query = normalizeEvidenceQuery(plan);

    const aliasRepair = repairAggregateAliasConflicts(plan.query);
    if (aliasRepair.repaired) {
        console.debug('[SqlPlanValidator] Auto-repaired evidence plan aggregate aliases:', aliasRepair.repairs.join('; '));
    }

    // Auto-repair structural select/aggregate alignment before validation.
    // This deterministically fixes the most common AI generation gap (forgetting
    // to include aggregate aliases or groupBy columns in query.select) without
    // burning retry budget on re-prompting for the same structural mistake.
    const selectRepair = repairEvidenceQuerySelectAlignment(plan.query);
    if (selectRepair.repaired) {
        console.debug('[SqlPlanValidator] Auto-repaired evidence plan select alignment:', selectRepair.repairs.join('; '));
    }

    // Quarter semantic drift repair: when the topic intends Q4 but the AI
    // only referenced a single month column, expand to cover all quarter months.
    if (options?.periodFamilies && options.periodFamilies.length > 0) {
        const quarterRepair = repairQuarterSemanticDrift(plan, columns, options.topic, options.periodFamilies);
        if (quarterRepair.repaired) {
            console.debug('[SqlPlanValidator] Auto-repaired quarter semantic drift:', quarterRepair.repairs.join('; '));
        }
    }

    errors.push(...validateEvidenceQuery(plan, columns));
    errors.push(...validateTopicAlignment(plan, columns, options?.topic, options?.intent, options?.semanticHints, { lenient: options?.lenient }));

    if ((plan.query.select?.length ?? 0) === 0) {
        errors.push('The evidence query plan must expose at least one selected output column.');
    }

    return errors.length > 0
        ? { validPlan: null, errors }
        : { validPlan: plan, errors: [] };
};
