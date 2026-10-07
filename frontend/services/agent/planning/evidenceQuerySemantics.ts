import type {
    ColumnProfile,
    EvidenceHarnessContext,
    FilterPredicate,
    PreFilterClause,
    QueryAggregateClause,
    QueryPlan,
    SqlEvidenceQueryPlan,
} from '../../../types';
import { isNonAdditiveMetric, isNonAdditiveMetricName } from '../../data/columnRegistry';
import { injectDirectivesIntoQueryPlan } from '../../duckdb/directiveInjector';
import { createEmptyRuntimeDirectives } from '../runtime/investigationTypes';

const normalizeTopicText = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/\bno\.\b/g, 'number ')
        .replace(/[_/.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

// Has '%' literal check and boundary matching — not Set-viable.
const RATIO_METRIC_PATTERN = /(?:^|[\s_])(ratio|margin|pct|percentage|percent)(?:$|[\s_])|%/i;
// User-intent: average aggregation keywords.
const AVERAGE_INTENT_PATTERN = /\b(avg|average|mean)\b/i;
// User-intent: cumulative/sum aggregation keywords.
const CUMULATIVE_RATIO_INTENT_PATTERN = /\b(sum|total|cumulative|accumulated)\b/i;
// Structural: report hierarchy/summary row topic detection.
const SUMMARY_ROW_TOPIC_PATTERN = /\b(row class|rowclass|hierarchy|subtotal|sub total|group header|header row|parent row|summary row|summary rows|total row|total rows)\b/i;

const normalizeAlias = (value: string) => value.trim().toLowerCase();
const buildAggregateAlias = (fn: QueryAggregateClause['function'], column: string) =>
    `${fn}_${column.toLowerCase().replace(/\s+/g, '_')}`;

const updateAliasReferences = (query: QueryPlan, oldAlias: string, newAlias: string) => {
    const oldKey = normalizeAlias(oldAlias);
    query.select = (query.select ?? []).map(column => normalizeAlias(column) === oldKey ? newAlias : column);
    query.orderBy = (query.orderBy ?? []).map(clause =>
        normalizeAlias(clause.column) === oldKey
            ? { ...clause, column: newAlias }
            : clause,
    );
    query.postAggregateFilter = query.postAggregateFilter
        ? {
            predicates: query.postAggregateFilter.predicates?.map(predicate =>
                normalizeAlias(predicate.column) === oldKey
                    ? { ...predicate, column: newAlias }
                    : predicate,
            ),
            groups: query.postAggregateFilter.groups?.map(group => ({
                predicates: group.predicates.map(predicate =>
                    normalizeAlias(predicate.column) === oldKey
                        ? { ...predicate, column: newAlias }
                        : predicate,
                ),
            })),
        }
        : query.postAggregateFilter;
};

const hasMatchingPredicate = (
    where: QueryPlan['where'],
    predicate: FilterPredicate,
) => {
    const predicates = [
        ...(where?.predicates ?? []),
        ...(where?.groups ?? []).flatMap(group => group.predicates),
    ];
    return predicates.some(existing => {
        if (normalizeAlias(existing.column) !== normalizeAlias(predicate.column) || existing.operator !== predicate.operator) {
            return false;
        }
        if (Array.isArray(existing.value) || Array.isArray(predicate.value)) {
            const existingValues = Array.isArray(existing.value) ? existing.value.map(String) : [String(existing.value)];
            const predicateValues = Array.isArray(predicate.value) ? predicate.value.map(String) : [String(predicate.value)];
            return existingValues.length === predicateValues.length
                && existingValues.every((value, index) => value === predicateValues[index]);
        }
        return String(existing.value ?? '') === String(predicate.value ?? '');
    });
};

const appendPredicate = (
    where: QueryPlan['where'],
    predicate: FilterPredicate,
): QueryPlan['where'] => {
    if (hasMatchingPredicate(where, predicate)) {
        return where;
    }
    return {
        predicates: [...(where?.predicates ?? []), predicate],
        ...(where?.groups?.length ? { groups: where.groups } : {}),
    };
};

const normalizePreFilterClause = (clause: PreFilterClause): PreFilterClause => ({
    column: clause.column,
    operator: clause.operator ?? 'eq',
    value: clause.value,
});

const hasMatchingPreFilterClause = (
    preFilter: PreFilterClause[] | undefined,
    clause: PreFilterClause,
) => {
    const normalized = normalizePreFilterClause(clause);
    return (preFilter ?? []).some(existing => {
        const nextExisting = normalizePreFilterClause(existing);
        if (
            normalizeAlias(nextExisting.column) !== normalizeAlias(normalized.column)
            || nextExisting.operator !== normalized.operator
        ) {
            return false;
        }
        if (Array.isArray(nextExisting.value) || Array.isArray(normalized.value)) {
            const existingValues = Array.isArray(nextExisting.value) ? nextExisting.value.map(String) : [String(nextExisting.value)];
            const clauseValues = Array.isArray(normalized.value) ? normalized.value.map(String) : [String(normalized.value)];
            return existingValues.length === clauseValues.length
                && existingValues.every((value, index) => value === clauseValues[index]);
        }
        return String(nextExisting.value ?? '') === String(normalized.value ?? '');
    });
};

const appendPreFilterClause = (
    preFilter: PreFilterClause[] | undefined,
    clause: PreFilterClause,
): PreFilterClause[] => {
    if (hasMatchingPreFilterClause(preFilter, clause)) {
        return [...(preFilter ?? [])];
    }
    return [...(preFilter ?? []), normalizePreFilterClause(clause)];
};

const toPredicate = (clause: PreFilterClause): FilterPredicate => ({
    column: clause.column,
    operator: clause.operator ?? 'eq',
    value: clause.value,
});

export const mergeEvidencePreFilterIntoQuery = (
    query: QueryPlan,
    preFilter: PreFilterClause[] | undefined,
): QueryPlan => {
    if (!preFilter?.length) {
        return query;
    }

    let nextWhere = query.where;
    for (const clause of preFilter) {
        nextWhere = appendPredicate(nextWhere, toPredicate(clause));
    }

    return {
        ...query,
        ...(nextWhere ? { where: nextWhere } : {}),
    };
};

export const isRatioLikeMetric = (
    columnName: string | null | undefined,
    profile?: ColumnProfile | null,
): boolean => {
    if (!columnName) {
        return false;
    }
    // Pi's judgement (or the percentage type) decides when present; the name patterns are only a prior.
    if (profile?.type === 'percentage' || profile?.additivity) return isNonAdditiveMetric(columnName, profile);
    return RATIO_METRIC_PATTERN.test(columnName) || isNonAdditiveMetricName(columnName);
};

export const topicPrefersAverageAggregation = (
    topic: string | null | undefined,
    columnName: string | null | undefined,
    profile?: ColumnProfile | null,
): boolean => {
    if (!isRatioLikeMetric(columnName, profile)) {
        return false;
    }

    const normalizedTopic = normalizeTopicText(topic ?? '');
    if (!normalizedTopic) {
        return profile?.type === 'percentage';
    }

    if (AVERAGE_INTENT_PATTERN.test(normalizedTopic)) {
        return true;
    }

    if (
        (RATIO_METRIC_PATTERN.test(normalizedTopic) || isNonAdditiveMetricName(normalizedTopic))
        && !CUMULATIVE_RATIO_INTENT_PATTERN.test(normalizedTopic)
    ) {
        return true;
    }

    return profile?.type === 'percentage' && !CUMULATIVE_RATIO_INTENT_PATTERN.test(normalizedTopic);
};

export const applyEvidenceQuerySemanticDefaults = (
    plan: SqlEvidenceQueryPlan,
    columns: ColumnProfile[],
    options?: {
        topic?: string | null;
        steering?: EvidenceHarnessContext | null;
    },
): SqlEvidenceQueryPlan => {
    const nextPlan: SqlEvidenceQueryPlan = {
        ...plan,
        preFilter: (plan.preFilter ?? []).map(clause => normalizePreFilterClause(clause)),
        query: {
            ...plan.query,
            select: [...(plan.query.select ?? [])],
            groupBy: [...(plan.query.groupBy ?? [])],
            orderBy: [...(plan.query.orderBy ?? [])],
            aggregates: (plan.query.aggregates ?? []).map(aggregate => ({ ...aggregate })),
            ...(plan.query.where
                ? {
                    where: {
                        predicates: [...(plan.query.where.predicates ?? [])],
                        groups: plan.query.where.groups?.map(group => ({
                            predicates: group.predicates.map(predicate => ({ ...predicate })),
                        })),
                    },
                }
                : {}),
            ...(plan.query.postAggregateFilter
                ? {
                    postAggregateFilter: {
                        predicates: plan.query.postAggregateFilter.predicates?.map(predicate => ({ ...predicate })),
                        groups: plan.query.postAggregateFilter.groups?.map(group => ({
                            predicates: group.predicates.map(predicate => ({ ...predicate })),
                        })),
                    },
                }
                : {}),
        },
    };

    const primaryAggregate = nextPlan.query.aggregates?.[0];
    if (primaryAggregate?.column) {
        const profile = columns.find(column => column.name === primaryAggregate.column);
        if (
            primaryAggregate.function === 'sum'
            && topicPrefersAverageAggregation(options?.topic, primaryAggregate.column, profile)
        ) {
            const previousAlias = primaryAggregate.as;
            primaryAggregate.function = 'avg';
            if (normalizeAlias(previousAlias) === normalizeAlias(buildAggregateAlias('sum', primaryAggregate.column))) {
                primaryAggregate.as = buildAggregateAlias('avg', primaryAggregate.column);
                updateAliasReferences(nextPlan.query, previousAlias, primaryAggregate.as);
            }
        }
    }

    const detailRowFilter = options?.steering?.detailRowFilter
        ?? (options?.steering?.detailRowColumn && options?.steering?.detailRowValue
            ? { column: options.steering.detailRowColumn, value: options.steering.detailRowValue }
            : null);
    const detailRowColumnExists = detailRowFilter?.column
        ? columns.some(col => col.name.toLowerCase() === detailRowFilter.column.toLowerCase())
        : false;
    const isSummaryRowTopic = SUMMARY_ROW_TOPIC_PATTERN.test(normalizeTopicText(options?.topic ?? ''));
    const detailRowFilterApplied = Boolean(
        detailRowFilter?.column
        && detailRowFilter?.value
        && detailRowColumnExists
        && !isSummaryRowTopic
    );
    if (detailRowFilterApplied && detailRowFilter) {
        nextPlan.preFilter = appendPreFilterClause(nextPlan.preFilter, {
            column: detailRowFilter.column,
            operator: 'eq',
            value: detailRowFilter.value,
        });
    }

    nextPlan.query = mergeEvidencePreFilterIntoQuery(nextPlan.query, nextPlan.preFilter);

    // A verified detail-row contract is the canonical aggregation grain. Do not
    // stack the statistical hierarchy exclusion on top of it: false-positive
    // hierarchy candidates can otherwise remove valid fact rows and make cards
    // disagree with fresh data.query results that use the same fact-row scope.
    // Use hierarchy exclusion only when no executable detail-row contract exists.
    if (
        !detailRowFilterApplied
        && options?.steering?.excludeFromAggregation?.length
        && options.steering.hierarchyColumn
    ) {
        const injectionResult = injectDirectivesIntoQueryPlan(nextPlan.query, {
            directives: {
                ...createEmptyRuntimeDirectives(),
                excludeFromAggregation: options.steering.excludeFromAggregation,
                hierarchyColumn: options.steering.hierarchyColumn,
            },
            availableColumns: columns.map(c => c.name),
            isSummaryRowTopic,
        });
        if (injectionResult.validationError) {
            throw new Error(injectionResult.validationError);
        }
        nextPlan.query = injectionResult.plan;
    }

    return nextPlan;
};
