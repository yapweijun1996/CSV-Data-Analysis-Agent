/**
 * dataQueryNormalization.ts
 *
 * Normalizes raw/AI-generated query plan payloads into typed QueryPlan structures.
 */

import type {
    FilterRowsOperation,
    QueryAggregateClause,
    QueryAggregateFunction,
    QueryOrderByClause,
    QueryPlan,
    QueryPostAggregateClause,
    QueryPostAggregatePredicate,
} from '../../../types';
import {
    isRecordLike,
    normalizeQueryWhereClauseLike,
    normalizeString,
} from './dataOperationNormalization';

const QUERY_AGGREGATE_FUNCTIONS = new Set<QueryAggregateFunction>(['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'median', 'percentile']);
const POST_AGGREGATE_OPERATORS = new Set<QueryPostAggregatePredicate['operator']>([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'is_null',
    'not_null',
]);

export const normalizeQueryOrderDirection = (direction: unknown): QueryOrderByClause['direction'] =>
    typeof direction === 'string' && direction.trim().toLowerCase() === 'desc' ? 'desc' : 'asc';

export const normalizeQueryAggregateFunction = (value: unknown): QueryAggregateFunction | null => {
    const normalized = normalizeString(value).toLowerCase();
    return QUERY_AGGREGATE_FUNCTIONS.has(normalized as QueryAggregateFunction)
        ? normalized as QueryAggregateFunction
        : null;
};

const normalizeNonEmptyString = (value: unknown): string | null => {
    const normalized = normalizeString(value);
    return normalized ? normalized : null;
};

const normalizeQueryOrderByClause = (value: unknown): QueryOrderByClause | null => {
    if (!isRecordLike(value)) {
        return null;
    }
    const column = normalizeNonEmptyString(value.column);
    if (!column) {
        return null;
    }
    return {
        column,
        direction: normalizeQueryOrderDirection(value.direction),
    };
};

const normalizeQueryAggregateClause = (value: unknown): QueryAggregateClause | null => {
    if (!isRecordLike(value)) {
        return null;
    }
    const functionName = normalizeQueryAggregateFunction(value.function);
    const alias = normalizeNonEmptyString(value.as);
    if (!functionName || !alias) {
        return null;
    }

    const column = normalizeNonEmptyString(value.column);
    const percentile = typeof value.percentile === 'number' && Number.isFinite(value.percentile)
        ? value.percentile
        : undefined;
    const where = normalizeQueryWhereClauseLike(value.where);
    return {
        function: functionName,
        as: alias,
        ...(column ? { column } : {}),
        ...(percentile !== undefined ? { percentile } : {}),
        ...(where ? { where } : {}),
    };
};

export const normalizePostAggregatePredicate = (value: unknown): QueryPostAggregatePredicate | null => {
    if (!isRecordLike(value)) {
        return null;
    }
    const column = normalizeNonEmptyString(value.column);
    const operator = normalizeString(value.operator).toLowerCase() as QueryPostAggregatePredicate['operator'];
    if (!column || !POST_AGGREGATE_OPERATORS.has(operator)) {
        return null;
    }
    return {
        column,
        operator,
        ...(value.value !== undefined ? { value: value.value } : {}),
    };
};

const normalizePostAggregateClause = (value: unknown): QueryPostAggregateClause | undefined => {
    if (!isRecordLike(value)) {
        return undefined;
    }
    const predicates = Array.isArray(value.predicates)
        ? value.predicates
            .map(normalizePostAggregatePredicate)
            .filter((predicate): predicate is QueryPostAggregatePredicate => Boolean(predicate))
        : undefined;
    const groups = Array.isArray(value.groups)
        ? value.groups
            .map(group => {
                if (!isRecordLike(group) || !Array.isArray(group.predicates)) {
                    return null;
                }
                const normalizedPredicates = group.predicates
                    .map(normalizePostAggregatePredicate)
                    .filter((predicate): predicate is QueryPostAggregatePredicate => Boolean(predicate));
                return normalizedPredicates.length > 0 ? { predicates: normalizedPredicates } : null;
            })
            .filter((group): group is NonNullable<typeof group> => Boolean(group))
        : undefined;

    if ((predicates?.length ?? 0) === 0 && (groups?.length ?? 0) === 0) {
        return undefined;
    }

    return {
        ...(predicates && predicates.length > 0 ? { predicates } : {}),
        ...(groups && groups.length > 0 ? { groups } : {}),
    };
};

const normalizeStringArray = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const normalized = value
        .map(normalizeNonEmptyString)
        .filter((item): item is string => Boolean(item));
    return normalized.length > 0 ? normalized : undefined;
};

export const normalizeDataQueryPlanLike = (value: unknown): QueryPlan | null => {
    if (!isRecordLike(value)) {
        return null;
    }

    const select = normalizeStringArray(value.select);
    const groupBy = normalizeStringArray(value.groupBy);
    const orderBy = Array.isArray(value.orderBy)
        ? value.orderBy
            .map(normalizeQueryOrderByClause)
            .filter((clause): clause is QueryOrderByClause => Boolean(clause))
        : undefined;
    const aggregates = Array.isArray(value.aggregates)
        ? value.aggregates
            .map(normalizeQueryAggregateClause)
            .filter((aggregate): aggregate is QueryAggregateClause => Boolean(aggregate))
        : undefined;
    const where = normalizeQueryWhereClauseLike(value.where);
    const postAggregateFilter = normalizePostAggregateClause(value.postAggregateFilter);
    const limit = Number.isInteger(value.limit) ? value.limit as number : undefined;

    // Preserve rawSql when the AI provides a raw SQL query string (e.g., UNPIVOT).
    // The structured plan fields are still used for metadata (select = output aliases).
    const rawSql = typeof value.query === 'string' && value.query.trim().length > 0
        ? value.query.trim()
        : (typeof value.rawSql === 'string' && value.rawSql.trim().length > 0
            ? value.rawSql.trim()
            : undefined);

    return {
        ...(select ? { select } : {}),
        ...(where ? { where } : {}),
        ...(groupBy ? { groupBy } : {}),
        ...(aggregates && aggregates.length > 0 ? { aggregates } : {}),
        ...(postAggregateFilter ? { postAggregateFilter } : {}),
        ...(orderBy && orderBy.length > 0 ? { orderBy } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(rawSql ? { rawSql } : {}),
    };
};

/** Normalize an unpivot params object from AI args. */
const normalizeUnpivotParams = (value: unknown): import('../../duckdb/queryIntent').UnpivotParams | undefined => {
    if (!isRecordLike(value)) return undefined;
    const sourceColumns = normalizeStringArray(value.sourceColumns);
    const nameAs = normalizeNonEmptyString(value.nameAs);
    const valueAs = normalizeNonEmptyString(value.valueAs);
    if (!sourceColumns || !nameAs || !valueAs) return undefined;

    const labels = normalizeStringArray(value.labels);
    const where = isRecordLike(value.where) && typeof value.where.column === 'string' && typeof value.where.equals === 'string'
        ? { column: value.where.column, equals: value.where.equals }
        : undefined;
    const aggregate = ['sum', 'avg', 'min', 'max', 'count'].includes(String(value.aggregate ?? ''))
        ? value.aggregate as 'sum' | 'avg' | 'min' | 'max' | 'count'
        : undefined;
    const orderBy = ['source_order', 'value_asc', 'value_desc'].includes(String(value.orderBy ?? ''))
        ? value.orderBy as 'source_order' | 'value_asc' | 'value_desc'
        : undefined;
    const limit = Number.isInteger(value.limit) ? value.limit as number : undefined;

    return {
        sourceColumns,
        nameAs,
        valueAs,
        ...(labels ? { labels } : {}),
        ...(where ? { where } : {}),
        ...(aggregate ? { aggregate } : {}),
        ...(orderBy ? { orderBy } : {}),
        ...(limit !== undefined ? { limit } : {}),
    };
};

export const normalizeDataQueryPayload = (args: Record<string, any>) => {
    const normalizedPlan = normalizeDataQueryPlanLike(args?.plan) ?? {};
    const normalizedFallbackFilterOperation = isRecordLike(args?.fallbackFilterOperation)
        ? args.fallbackFilterOperation as FilterRowsOperation
        : undefined;
    const unpivotParams = normalizeUnpivotParams(args?.unpivot ?? args?.unpivotParams);

    return {
        explanation: normalizeString(args?.explanation) || 'Run a read-only data query.',
        plan: normalizedPlan,
        ...(normalizedFallbackFilterOperation ? { fallbackFilterOperation: normalizedFallbackFilterOperation } : {}),
        ...(unpivotParams ? { unpivotParams } : {}),
    };
};
