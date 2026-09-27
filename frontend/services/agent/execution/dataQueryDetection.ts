/**
 * dataQueryDetection.ts
 *
 * Boolean predicates that classify query plan shapes —
 * preview vs analysis, semantic presence, filter presence.
 */

import type {
    FilterRowsOperation,
    QueryPlan,
    QueryWhereClause,
} from '../../../types';

const hasNonEmptyArray = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;

export const hasQueryWhereClauses = (where: QueryWhereClause | null | undefined): boolean =>
    hasNonEmptyArray(where?.predicates)
    || (Array.isArray(where?.groups) && where.groups.some(group => hasNonEmptyArray(group?.predicates)));

export const hasFilterOperationClauses = (operation: FilterRowsOperation | null | undefined): boolean =>
    hasNonEmptyArray(operation?.predicates)
    || (Array.isArray(operation?.groups) && operation.groups.some(group => hasNonEmptyArray(group?.predicates)));

export const hasSemanticQueryPlan = (plan: QueryPlan | Record<string, unknown> | null | undefined): boolean => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
        return false;
    }

    const queryPlan = plan as QueryPlan;
    return hasQueryWhereClauses(queryPlan.where)
        || hasNonEmptyArray(queryPlan.select)
        || hasNonEmptyArray(queryPlan.orderBy)
        || Number.isInteger(queryPlan.limit)
        || hasNonEmptyArray(queryPlan.groupBy)
        || hasNonEmptyArray(queryPlan.aggregates)
        || hasQueryWhereClauses(queryPlan.postAggregateFilter as QueryWhereClause | undefined);
};

export const isPreviewDataQuery = (
    plan: QueryPlan | null | undefined,
    fallbackFilterOperation?: FilterRowsOperation | null,
): boolean => {
    if (!hasSemanticQueryPlan(plan)) {
        return false;
    }

    const hasFilters = hasQueryWhereClauses(plan?.where) || hasFilterOperationClauses(fallbackFilterOperation);
    const hasAggregates = hasNonEmptyArray(plan?.groupBy) || hasNonEmptyArray(plan?.aggregates);

    return !hasFilters && !hasAggregates;
};

export const getDataQueryTraceLabel = (
    phase: 'verify' | 'analysis',
    plan: QueryPlan | null | undefined,
    fallbackFilterOperation?: FilterRowsOperation | null,
): 'Analysis Query' | 'Verify Query' | 'Data Preview' => {
    if (isPreviewDataQuery(plan, fallbackFilterOperation)) {
        return 'Data Preview';
    }
    return phase === 'verify' ? 'Verify Query' : 'Analysis Query';
};
