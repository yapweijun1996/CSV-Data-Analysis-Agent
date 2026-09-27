import {
    CsvRow,
    DataQueryResult,
    FilterPredicate,
    FilterPredicateGroup,
    FilterRowsOperation,
    QueryAggregateClause,
    QueryPlan,
    QueryPostAggregateClause,
    QueryPostAggregatePredicate,
    QueryWhereClause,
    QueryOrderByClause,
} from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';
import { normalizeQueryAggregateFunction, normalizeQueryOrderDirection } from './dataQueryContract';
import { normalizeString } from './dataOperationNormalization';
import {
    cloneRows,
    getColumns,
    buildColumnLookup,
    normalizeColumnName,
    normalizeFilterPredicate,
    normalizeFilterPredicateGroup,
    applySpreadsheetFilterOperation,
} from './dataOperationMutator';

const DEFAULT_QUERY_MAX_ROWS = 500;
const DEFAULT_QUERY_MAX_COLUMNS = 50;
const DEFAULT_QUERY_MAX_ORDER_BY = 3;

export interface DataQueryExecutionOptions {
    maxRows?: number;
    maxColumns?: number;
    maxOrderBy?: number;
    allowedColumns?: string[];
}

export const createQueryPlanFromFilterOperation = (
    operation: FilterRowsOperation,
    overrides?: Partial<Pick<QueryPlan, 'select' | 'orderBy' | 'limit'>>,
): QueryPlan => ({
    ...overrides,
    where: {
        ...(operation.predicates ? { predicates: operation.predicates } : {}),
        ...(operation.groups ? { groups: operation.groups } : {}),
    },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isMissingValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return true;
    return typeof value === 'string' && value.trim() === '';
};

const tryNormalizeColumnName = (column: string, lookup: Map<string, string>): string | null => {
    const trimmed = column.trim();
    if (!trimmed) return null;
    return lookup.get(trimmed.toLowerCase()) ?? null;
};

const normalizeWhereClause = (where: QueryWhereClause | undefined, lookup: Map<string, string>): QueryWhereClause | undefined => {
    if (!where) return undefined;

    // Track how many input predicates existed vs how many survived column
    // resolution so we can detect silent full-table degradation.
    let inputPredicateCount = 0;
    let droppedColumns: string[] = [];

    const predicates = Array.isArray(where.predicates)
        ? where.predicates
            .map((predicate) => {
                const normalizedPredicate = normalizeFilterPredicate(predicate);
                if (!normalizedPredicate) return null;
                inputPredicateCount++;
                const resolved = tryNormalizeColumnName(normalizedPredicate.column, lookup);
                if (!resolved) {
                    droppedColumns.push(normalizedPredicate.column);
                    console.warn(`[dataQueryExecutor] Skipping where predicate for missing column: ${normalizedPredicate.column}`);
                    return null;
                }
                return { ...normalizedPredicate, column: resolved };
            })
            .filter((predicate): predicate is NonNullable<typeof predicate> => predicate !== null)
        : undefined;
    const groups = Array.isArray(where.groups)
        ? where.groups
            .map((group) => {
                const normalizedGroup = normalizeFilterPredicateGroup(group);
                if (!normalizedGroup) return null;
                const resolvedPredicates = normalizedGroup.predicates
                    .map((predicate) => {
                        const normalizedPredicate = normalizeFilterPredicate(predicate);
                        if (!normalizedPredicate) return null;
                        inputPredicateCount++;
                        const resolved = tryNormalizeColumnName(normalizedPredicate.column, lookup);
                        if (!resolved) {
                            droppedColumns.push(normalizedPredicate.column);
                            console.warn(`[dataQueryExecutor] Skipping where group predicate for missing column: ${normalizedPredicate.column}`);
                            return null;
                        }
                        return { ...normalizedPredicate, column: resolved };
                    })
                    .filter((predicate): predicate is NonNullable<typeof predicate> => predicate !== null);
                return resolvedPredicates.length > 0 ? { predicates: resolvedPredicates } : null;
            })
            .filter((group): group is NonNullable<typeof group> => group !== null)
        : undefined;

    const survivingCount = (predicates?.length ?? 0)
        + (groups?.reduce((sum, g) => sum + g.predicates.length, 0) ?? 0);

    // If the caller specified filter conditions but ALL were dropped due to
    // missing columns, refuse to silently degrade into a full-table query.
    // This prevents returning misleading unfiltered results when the model
    // references columns that don't exist (Ticket: silent-where-degradation).
    if (inputPredicateCount > 0 && survivingCount === 0) {
        throw new Error(
            `All where filter columns are missing from the dataset: ${droppedColumns.join(', ')}. `
            + 'Query cannot proceed without valid filter conditions.',
        );
    }

    if ((!predicates || predicates.length === 0) && (!groups || groups.length === 0)) {
        return undefined;
    }

    return {
        ...(predicates && predicates.length > 0 ? { predicates } : {}),
        ...(groups && groups.length > 0 ? { groups } : {}),
    };
};

const sortQueryRows = (rows: CsvRow[], orderBy: QueryOrderByClause[]): CsvRow[] => {
    if (orderBy.length === 0) return rows;
    return [...rows].sort((leftRow, rightRow) => {
        for (const clause of orderBy) {
            const leftValue = leftRow[clause.column];
            const rightValue = rightRow[clause.column];

            if (leftValue === null || leftValue === undefined) return 1;
            if (rightValue === null || rightValue === undefined) return -1;

            const leftNumber = robustParseFloat(leftValue);
            const rightNumber = robustParseFloat(rightValue);
            if (leftNumber !== null && rightNumber !== null) {
                if (leftNumber !== rightNumber) {
                    return clause.direction === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber;
                }
                continue;
            }

            const leftString = String(leftValue).toLowerCase();
            const rightString = String(rightValue).toLowerCase();
            if (leftString !== rightString) {
                if (leftString < rightString) return clause.direction === 'asc' ? -1 : 1;
                return clause.direction === 'asc' ? 1 : -1;
            }
        }
        return 0;
    });
};

interface NormalizedQueryAggregateClause extends QueryAggregateClause {
    column?: string;
    as: string;
    where?: QueryWhereClause;
}

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

const normalizeAggregateAlias = (value: unknown, context: string) => {
    if (typeof value !== 'string') {
        throw new Error(`${context} requires a non-empty alias.`);
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`${context} requires a non-empty alias.`);
    }
    return normalized;
};

const normalizeAggregateClauses = (
    aggregates: QueryPlan['aggregates'],
    lookup: Map<string, string>,
    groupByColumns: string[],
): NormalizedQueryAggregateClause[] => {
    const seenOutputs = new Set<string>(groupByColumns.map(column => column.toLowerCase()));
    return (Array.isArray(aggregates) ? aggregates : []).map((aggregate, index) => {
        if (!aggregate || typeof aggregate !== 'object' || Array.isArray(aggregate)) {
            throw new Error(`Query aggregate ${index + 1} must be an object.`);
        }
        const alias = normalizeAggregateAlias(aggregate.as, `Query aggregate ${index + 1}`);
        const aliasKey = alias.toLowerCase();
        if (seenOutputs.has(aliasKey)) {
            throw new Error(`Query aggregate alias "${alias}" must be unique and must not overlap with groupBy columns.`);
        }
        seenOutputs.add(aliasKey);
        const functionName = normalizeQueryAggregateFunction(aggregate.function);
        if (!functionName) {
            throw new Error(`Query aggregate "${alias}" must use one of: count, count_distinct, sum, avg, min, max, median, percentile.`);
        }
        if (functionName === 'count') {
            return {
                function: 'count',
                as: alias,
                ...(aggregate.column ? { column: normalizeColumnName(aggregate.column, lookup, `Query aggregate "${alias}"`) } : {}),
                ...(aggregate.where ? { where: normalizeWhereClause(aggregate.where, lookup) } : {}),
            };
        }
        if (!aggregate.column) {
            throw new Error(`Query aggregate "${alias}" requires a source column for ${functionName}.`);
        }
        return {
            function: functionName,
            column: normalizeColumnName(aggregate.column, lookup, `Query aggregate "${alias}"`),
            as: alias,
            ...(functionName === 'percentile' ? { percentile: aggregate.percentile } : {}),
            ...(aggregate.where ? { where: normalizeWhereClause(aggregate.where, lookup) } : {}),
        };
    });
};

const calculateMedian = (values: number[]): number | null => {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
};

const calculatePercentile = (values: number[], percentile: number | undefined): number | null => {
    if (values.length === 0) {
        return null;
    }
    const safePercentile = Number.isFinite(percentile) ? Math.min(1, Math.max(0, percentile as number)) : 0.5;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * safePercentile)));
    return sorted[index] ?? null;
};

const normalizePostAggregatePredicate = (predicate: unknown): QueryPostAggregatePredicate | null => {
    if (!isRecord(predicate)) {
        return null;
    }
    const column = normalizeString(predicate.column);
    const operator = normalizeString(predicate.operator).toLowerCase() as QueryPostAggregatePredicate['operator'];
    if (!column || !POST_AGGREGATE_OPERATORS.has(operator)) {
        return null;
    }
    return {
        column,
        operator,
        ...(predicate.value !== undefined ? { value: predicate.value as QueryPostAggregatePredicate['value'] } : {}),
    };
};

const normalizePostAggregateClause = (value: unknown): QueryPostAggregateClause | undefined => {
    if (!isRecord(value)) {
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
                if (!isRecord(group) || !Array.isArray(group.predicates)) {
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

const aggregateRowsForQuery = (
    rows: CsvRow[],
    groupByColumns: string[],
    aggregates: NormalizedQueryAggregateClause[],
): CsvRow[] => {
    const groups = new Map<string, { groupValues: CsvRow; rows: CsvRow[] }>();

    rows.forEach(row => {
        const groupValues = groupByColumns.reduce<CsvRow>((acc, column) => {
            acc[column] = row[column] ?? null;
            return acc;
        }, {});
        const key = groupByColumns.length === 0
            ? '__all__'
            : JSON.stringify(groupByColumns.map(column => row[column] ?? null));
        const existing = groups.get(key);
        if (existing) {
            existing.rows.push(row);
            return;
        }
        groups.set(key, { groupValues, rows: [row] });
    });

    if (groups.size === 0 && groupByColumns.length === 0) {
        groups.set('__all__', { groupValues: {}, rows: [] });
    }

    return [...groups.values()].map(group => {
        const nextRow: CsvRow = { ...group.groupValues };
        aggregates.forEach(aggregate => {
            const aggregateRows = aggregate.where
                ? applySpreadsheetFilterOperation(group.rows, {
                    id: `query_aggregate_filter_${aggregate.as}`,
                    type: 'filter_rows',
                    reason: `Read-only aggregate filter for ${aggregate.as}`,
                    ...(aggregate.where.predicates ? { predicates: aggregate.where.predicates } : {}),
                    ...(aggregate.where.groups ? { groups: aggregate.where.groups } : {}),
                }).data
                : group.rows;
            if (aggregate.function === 'count') {
                if (!aggregate.column) {
                    nextRow[aggregate.as] = aggregateRows.length;
                    return;
                }
                nextRow[aggregate.as] = aggregateRows.filter(row => !isMissingValue(row[aggregate.column!] ?? null)).length;
                return;
            }
            if (aggregate.function === 'count_distinct') {
                nextRow[aggregate.as] = aggregate.column
                    ? new Set(aggregateRows
                        .map(row => row[aggregate.column!] ?? null)
                        .filter(value => !isMissingValue(value))).size
                    : aggregateRows.length;
                return;
            }

            const numericValues = aggregateRows
                .map(row => robustParseFloat(row[aggregate.column!] ?? null))
                .filter((value): value is number => value !== null);

            if (aggregate.function === 'sum') {
                nextRow[aggregate.as] = numericValues.length > 0
                    ? numericValues.reduce((total, value) => total + value, 0)
                    : null;
                return;
            }
            if (aggregate.function === 'avg') {
                nextRow[aggregate.as] = numericValues.length > 0
                    ? numericValues.reduce((total, value) => total + value, 0) / numericValues.length
                    : null;
                return;
            }
            if (aggregate.function === 'min') {
                nextRow[aggregate.as] = numericValues.length > 0 ? Math.min(...numericValues) : null;
                return;
            }
            if (aggregate.function === 'max') {
                nextRow[aggregate.as] = numericValues.length > 0 ? Math.max(...numericValues) : null;
                return;
            }
            if (aggregate.function === 'median') {
                nextRow[aggregate.as] = calculateMedian(numericValues);
                return;
            }
            nextRow[aggregate.as] = calculatePercentile(numericValues, aggregate.percentile);
        });
        return nextRow;
    });
};

export const executeDataQuery = (
    inputRows: CsvRow[],
    plan: QueryPlan,
    options?: DataQueryExecutionOptions,
): DataQueryResult => {
    const startedAt = Date.now();
    const maxRows = options?.maxRows ?? DEFAULT_QUERY_MAX_ROWS;
    const maxColumns = options?.maxColumns ?? DEFAULT_QUERY_MAX_COLUMNS;
    const maxOrderBy = options?.maxOrderBy ?? DEFAULT_QUERY_MAX_ORDER_BY;
    const availableColumns = options?.allowedColumns && options.allowedColumns.length > 0
        ? options.allowedColumns
        : getColumns(inputRows);
    const lookup = buildColumnLookup(availableColumns);
    const normalizedGroupBy = Array.isArray(plan.groupBy) && plan.groupBy.length > 0
        ? [...new Set(plan.groupBy.map(column => normalizeColumnName(column, lookup, 'Query groupBy')))]
        : [];
    const normalizedAggregates = normalizeAggregateClauses(plan.aggregates, lookup, normalizedGroupBy);
    const isAggregateQuery = normalizedGroupBy.length > 0 || normalizedAggregates.length > 0;

    if (normalizedGroupBy.length > 0 && normalizedAggregates.length === 0) {
        throw new Error('Query aggregate mode requires at least one aggregate when groupBy is provided.');
    }

    const outputColumns = isAggregateQuery
        ? [...normalizedGroupBy, ...normalizedAggregates.map(aggregate => aggregate.as)]
        : availableColumns;
    const outputLookup = buildColumnLookup(outputColumns);

    const requestedSelectedColumns = Array.isArray(plan.select) && plan.select.length > 0
        ? plan.select.map(column => normalizeColumnName(column, outputLookup, 'Query select'))
        : outputColumns.slice(0, maxColumns);
    const dedupedSelectedColumns = [...new Set(isAggregateQuery
        ? [...requestedSelectedColumns, ...outputColumns]
        : requestedSelectedColumns)];
    if (dedupedSelectedColumns.length > maxColumns) {
        throw new Error(`Query select exceeds the maximum allowed column count (${maxColumns}).`);
    }

    const normalizedWhere = normalizeWhereClause(plan.where, lookup);
    const normalizedPostAggregateFilter = normalizePostAggregateClause(plan.postAggregateFilter);
    const orderBy = Array.isArray(plan.orderBy) ? plan.orderBy : [];
    if (orderBy.length > maxOrderBy) {
        throw new Error(`Query orderBy exceeds the maximum allowed clause count (${maxOrderBy}).`);
    }
    const normalizedOrderBy = orderBy.map((clause, index) => {
        if (!clause || typeof clause !== 'object' || Array.isArray(clause)) {
            throw new Error(`Query orderBy ${index + 1} must be an object.`);
        }
        return {
            column: normalizeColumnName(clause.column, outputLookup, 'Query orderBy'),
            direction: normalizeQueryOrderDirection(clause.direction),
        };
    }) as QueryOrderByClause[];

    if (Array.isArray(plan.select) && plan.select.length > 0) {
        normalizedOrderBy.forEach(clause => {
            if (!dedupedSelectedColumns.some(column => column.toLowerCase() === clause.column.toLowerCase())) {
                throw new Error(`Query orderBy column "${clause.column}" must also appear in select for read-only query execution.`);
            }
        });
    }

    const appliedLimit = Math.min(
        Math.max(0, Number.isInteger(plan.limit) ? (plan.limit as number) : maxRows),
        maxRows,
    );

    const filteredRows = normalizedWhere
        ? applySpreadsheetFilterOperation(inputRows, {
            id: 'query_where_bridge',
            type: 'filter_rows',
            reason: 'Read-only query where clause',
            ...(normalizedWhere.predicates ? { predicates: normalizedWhere.predicates } : {}),
            ...(normalizedWhere.groups ? { groups: normalizedWhere.groups } : {}),
        }).data
        : cloneRows(inputRows);

    const rowsBeforeProjection = isAggregateQuery
        ? aggregateRowsForQuery(filteredRows, normalizedGroupBy, normalizedAggregates)
        : filteredRows;
    const rowsAfterPostAggregateFilter = normalizedPostAggregateFilter
        ? applySpreadsheetFilterOperation(rowsBeforeProjection, {
            id: 'query_post_aggregate_bridge',
            type: 'filter_rows',
            reason: 'Read-only query post-aggregate filter',
            ...(normalizedPostAggregateFilter.predicates ? { predicates: normalizedPostAggregateFilter.predicates as FilterPredicate[] } : {}),
            ...(normalizedPostAggregateFilter.groups ? { groups: normalizedPostAggregateFilter.groups as FilterPredicateGroup[] } : {}),
        }).data
        : rowsBeforeProjection;

    const projectedRows = rowsAfterPostAggregateFilter.map(row => {
        const nextRow: CsvRow = {};
        dedupedSelectedColumns.forEach(column => {
            nextRow[column] = row[column] ?? null;
        });
        return nextRow;
    });

    const sortedRows = sortQueryRows(projectedRows, normalizedOrderBy);
    const rows = sortedRows.slice(0, appliedLimit);

    return {
        rows,
        totalMatchedRows: rowsAfterPostAggregateFilter.length,
        returnedRows: rows.length,
        truncated: rowsAfterPostAggregateFilter.length > rows.length,
        selectedColumns: dedupedSelectedColumns,
        appliedOrderBy: normalizedOrderBy,
        appliedLimit,
        durationMs: Date.now() - startedAt,
    };
};
