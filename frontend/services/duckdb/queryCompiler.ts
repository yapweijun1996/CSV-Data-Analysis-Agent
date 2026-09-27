import type { FilterPredicate, FilterPredicateGroup, QueryAggregateClause, QueryOrderByClause, QueryPlan, QueryPostAggregateClause, QueryPostAggregatePredicate } from '../../types';
import { normalizeFilterPredicate, normalizeFilterPredicateGroup } from '../agent/execution/dataOperationNormalization';
import { normalizeQueryAggregateFunction, normalizeQueryOrderDirection } from '../agent/execution/dataQueryContract';
import { detectPeriodColumnFamilies, expandPeriodExpression } from '../agent/runtime/periodColumnDetector';
import { buildDimensionNormExpr, isColumnNormalized, type DimensionNormalizationConfig } from './dimensionNormalization';

export interface CompiledDuckDbQuery {
    sql: string;
    countSql: string;
    selectedColumns: string[];
    appliedOrderBy: QueryOrderByClause[];
    appliedLimit: number;
}

export interface CompileDuckDbQueryOptions {
    allowedColumns: string[];
    tableName: string;
    maxRows?: number;
    maxColumns?: number;
    maxOrderBy?: number;
    /** When provided, GROUP BY dimension columns use normalized CASE expressions. */
    dimensionNormalization?: DimensionNormalizationConfig | null;
}

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_COLUMNS = 50;
const DEFAULT_MAX_ORDER_BY = 3;

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const quoteStringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Collapse internal whitespace runs so "A  B" matches "A B". */
const colKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const buildLookup = (columns: string[]) => {
    const lookup = new Map<string, string>();
    columns.forEach(column => lookup.set(colKey(column), column));
    return lookup;
};

const normalizeColumn = (column: unknown, lookup: Map<string, string>, context: string) => {
    if (typeof column !== 'string' || !column.trim()) {
        throw new Error(`${context} requires a non-empty column name.`);
    }
    const normalized = lookup.get(colKey(column));
    if (!normalized) {
        throw new Error(`${context} references missing column: ${column}`);
    }
    return normalized;
};

const normalizeAlias = (value: unknown, context: string) => {
    if (typeof value !== 'string') {
        throw new Error(`${context} requires a non-empty alias.`);
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`${context} requires a non-empty alias.`);
    }
    return normalized;
};

const buildTextExpression = (column: string) => `LOWER(COALESCE(CAST(${quoteIdentifier(column)} AS VARCHAR), ''))`;
const buildEmptyAwareExpression = (column: string) => `TRIM(COALESCE(CAST(${quoteIdentifier(column)} AS VARCHAR), ''))`;
const buildNumericExpression = (column: string) => {
    const textExpression = buildEmptyAwareExpression(column);
    const normalizedNegativeExpression = `CASE WHEN ${textExpression} LIKE '(%' AND ${textExpression} LIKE '%)' THEN CONCAT('-', SUBSTRING(${textExpression}, 2, LENGTH(${textExpression}) - 2)) ELSE ${textExpression} END`;
    const strippedExpression = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${normalizedNegativeExpression}, ',', ''), '$', ''), '€', ''), '£', ''), '¥', ''), '%', '')`;
    return `TRY_CAST(NULLIF(${strippedExpression}, '') AS DOUBLE)`;
};

const toNumericLiteral = (value: unknown, context: string) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`${context} requires a numeric value.`);
    }
    return String(numeric);
};

const ISO_PERIOD_LITERAL_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/;

const toIsoPeriodLiteral = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return ISO_PERIOD_LITERAL_PATTERN.test(normalized) ? normalized : null;
};

const buildOrderedComparison = (
    column: string,
    operator: '>' | '>=' | '<' | '<=',
    value: unknown,
    context: string,
) => {
    const isoPeriod = toIsoPeriodLiteral(value);
    if (isoPeriod) {
        return `${buildEmptyAwareExpression(column)} ${operator} ${quoteStringLiteral(isoPeriod)}`;
    }
    return `${buildNumericExpression(column)} ${operator} ${toNumericLiteral(value, context)}`;
};

/**
 * Compile a single filter predicate to SQL.
 *
 * When `dimNorm` is provided and the predicate targets a normalized column,
 * equality/membership filters use the same CASE expression as GROUP BY.
 * This ensures `WHERE BRAND = 'Unknown'` matches the same rows that were
 * grouped as 'Unknown' (null/empty/placeholder).
 */
const compilePredicate = (
    predicate: FilterPredicate,
    dimNorm?: DimensionNormalizationConfig | null,
): string => {
    const column = predicate.column;
    const textExpression = buildTextExpression(column);
    const emptyAwareExpression = buildEmptyAwareExpression(column);

    // When the column has dimension normalization, use the CASE expression
    // for text comparison so that filtering on 'Unknown' matches the same
    // rows that GROUP BY collapsed into the Unknown bucket.
    const useNormalized = isColumnNormalized(column, dimNorm);
    const effectiveTextExpr = useNormalized
        ? `LOWER(${buildDimensionNormExpr(quoteIdentifier(column), dimNorm!)})`
        : textExpression;

    switch (predicate.operator) {
        case 'is_null':
            return `(${quoteIdentifier(column)} IS NULL OR ${emptyAwareExpression} = '')`;
        case 'not_null':
            return `(${quoteIdentifier(column)} IS NOT NULL AND ${emptyAwareExpression} <> '')`;
        case 'contains':
            return `${textExpression} LIKE ${quoteStringLiteral(`%${String(predicate.value ?? '').toLowerCase()}%`)}`;
        case 'starts_with':
            return `${textExpression} LIKE ${quoteStringLiteral(`${String(predicate.value ?? '').toLowerCase()}%`)}`;
        case 'ends_with':
            return `${textExpression} LIKE ${quoteStringLiteral(`%${String(predicate.value ?? '').toLowerCase()}`)}`;
        case 'in': {
            const values = Array.isArray(predicate.value) ? predicate.value : [predicate.value];
            if (values.length === 0) {
                throw new Error(`Filter predicate on "${column}" requires at least one value.`);
            }
            return `${effectiveTextExpr} IN (${values.map(value => quoteStringLiteral(String(value ?? '').toLowerCase())).join(', ')})`;
        }
        case 'not_in': {
            const values = Array.isArray(predicate.value) ? predicate.value : [predicate.value];
            if (values.length === 0) {
                throw new Error(`Filter predicate on "${column}" requires at least one value.`);
            }
            return `${effectiveTextExpr} NOT IN (${values.map(value => quoteStringLiteral(String(value ?? '').toLowerCase())).join(', ')})`;
        }
        case 'eq':
            if (predicate.value === null) {
                return `(${quoteIdentifier(column)} IS NULL OR ${emptyAwareExpression} = '')`;
            }
            return `${effectiveTextExpr} = ${quoteStringLiteral(String(predicate.value).toLowerCase())}`;
        case 'neq':
            if (predicate.value === null) {
                return `(${quoteIdentifier(column)} IS NOT NULL AND ${emptyAwareExpression} <> '')`;
            }
            return `${effectiveTextExpr} <> ${quoteStringLiteral(String(predicate.value).toLowerCase())}`;
        case 'gt':
            return buildOrderedComparison(column, '>', predicate.value, `Filter predicate on "${column}"`);
        case 'gte':
            return buildOrderedComparison(column, '>=', predicate.value, `Filter predicate on "${column}"`);
        case 'lt':
            return buildOrderedComparison(column, '<', predicate.value, `Filter predicate on "${column}"`);
        case 'lte':
            return buildOrderedComparison(column, '<=', predicate.value, `Filter predicate on "${column}"`);
        case 'between': {
            const values = Array.isArray(predicate.value) ? predicate.value : [];
            if (values.length < 2) {
                throw new Error(`Between predicate on "${column}" requires two numeric values.`);
            }
            const lowerIsoPeriod = toIsoPeriodLiteral(values[0]);
            const upperIsoPeriod = toIsoPeriodLiteral(values[1]);
            if (lowerIsoPeriod && upperIsoPeriod) {
                return `${emptyAwareExpression} BETWEEN ${quoteStringLiteral(lowerIsoPeriod)} AND ${quoteStringLiteral(upperIsoPeriod)}`;
            }
            const lower = toNumericLiteral(values[0], `Between predicate on "${column}"`);
            const upper = toNumericLiteral(values[1], `Between predicate on "${column}"`);
            const numericExpression = buildNumericExpression(column);
            return `${numericExpression} BETWEEN ${lower} AND ${upper}`;
        }
    }
};

const compilePredicateGroup = (
    group: FilterPredicateGroup,
    dimNorm?: DimensionNormalizationConfig | null,
): string => {
    if (!Array.isArray(group.predicates) || group.predicates.length === 0) {
        throw new Error('Filter group must contain at least one predicate.');
    }
    return `(${group.predicates.map(p => compilePredicate(p, dimNorm)).join(' AND ')})`;
};

const normalizePredicateForCompilation = (predicate: unknown, context: string): FilterPredicate => {
    const normalized = normalizeFilterPredicate(predicate);
    if (!normalized) {
        throw new Error(`${context} must include a non-empty column name and a valid operator.`);
    }
    return normalized;
};

const normalizePredicateGroupForCompilation = (group: unknown, context: string): FilterPredicateGroup => {
    const normalized = normalizeFilterPredicateGroup(group);
    if (!normalized) {
        throw new Error(`${context} must contain at least one valid predicate.`);
    }
    return normalized;
};

const normalizeWhereClauseForCompilation = (
    where: QueryPlan['where'],
    lookup: Map<string, string>,
    context: string,
): QueryPlan['where'] | undefined => {
    if (!where) {
        return undefined;
    }

    // Graceful degradation: skip invalid predicates instead of throwing,
    // so a malformed filter from the AI doesn't block the entire plan.
    const predicates = Array.isArray(where.predicates)
        ? where.predicates
            .map((predicate, index) => {
                const normalized = normalizeFilterPredicate(predicate);
                if (!normalized) {
                    console.warn(`[QueryCompiler] Skipping invalid ${context} predicate ${index + 1} — missing column or operator.`);
                    return null;
                }
                try {
                    return {
                        ...normalized,
                        column: normalizeColumn(normalized.column, lookup, context),
                    };
                } catch {
                    console.warn(`[QueryCompiler] Skipping ${context} predicate ${index + 1} — column "${normalized.column}" not found.`);
                    return null;
                }
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
        : undefined;
    const groups = Array.isArray(where.groups)
        ? where.groups
            .map((group, groupIndex) => {
                const normalizedGroup = normalizeFilterPredicateGroup(group);
                if (!normalizedGroup) {
                    console.warn(`[QueryCompiler] Skipping invalid ${context} group ${groupIndex + 1}.`);
                    return null;
                }
                const resolvedPredicates = normalizedGroup.predicates
                    .map((predicate, predicateIndex) => {
                        const normalized = normalizeFilterPredicate(predicate);
                        if (!normalized) {
                            console.warn(`[QueryCompiler] Skipping invalid ${context} group ${groupIndex + 1} predicate ${predicateIndex + 1}.`);
                            return null;
                        }
                        try {
                            return {
                                ...normalized,
                                column: normalizeColumn(normalized.column, lookup, context),
                            };
                        } catch {
                            console.warn(`[QueryCompiler] Skipping ${context} group ${groupIndex + 1} predicate ${predicateIndex + 1} — column "${normalized.column}" not found.`);
                            return null;
                        }
                    })
                    .filter((p): p is NonNullable<typeof p> => p !== null);
                return resolvedPredicates.length > 0 ? { predicates: resolvedPredicates } : null;
            })
            .filter((g): g is NonNullable<typeof g> => g !== null)
        : undefined;

    if ((predicates?.length ?? 0) === 0 && (groups?.length ?? 0) === 0) {
        return undefined;
    }

    return {
        ...(predicates && predicates.length > 0 ? { predicates } : {}),
        ...(groups && groups.length > 0 ? { groups } : {}),
    };
};

const compileFilterCondition = (
    where: QueryPlan['where'],
    dimNorm?: DimensionNormalizationConfig | null,
): string => {
    const predicates = Array.isArray(where?.predicates) ? where?.predicates ?? [] : [];
    const groups = Array.isArray(where?.groups) ? where?.groups ?? [] : [];
    const compiledPredicates = predicates.length > 0
        ? `(${predicates.map(p => compilePredicate(p, dimNorm)).join(' AND ')})`
        : '';
    const compiledGroups = groups.length > 0
        ? `(${groups.map(g => compilePredicateGroup(g, dimNorm)).join(' OR ')})`
        : '';
    if (!compiledPredicates && !compiledGroups) {
        return '';
    }
    if (compiledPredicates && compiledGroups) {
        return `${compiledPredicates} AND ${compiledGroups}`;
    }
    return compiledPredicates || compiledGroups;
};

const compileWhere = (plan: QueryPlan, dimNorm?: DimensionNormalizationConfig | null): string => {
    const compiledCondition = compileFilterCondition(plan.where, dimNorm);
    return compiledCondition ? `WHERE ${compiledCondition}` : '';
};

const compileAggregateFilter = (where: QueryPlan['where']): string => {
    const compiledCondition = compileFilterCondition(where);
    return compiledCondition ? ` FILTER (WHERE ${compiledCondition})` : '';
};

interface NormalizedQueryAggregateClause extends QueryAggregateClause {
    column?: string;
    sourceColumns?: string[];
    as: string;
    where?: QueryPlan['where'];
}

type NormalizedQueryPostAggregateClause = QueryPostAggregateClause;

const normalizeAggregateClauses = (
    plan: QueryPlan,
    lookup: Map<string, string>,
    groupByColumns: string[],
    allowedColumns: string[],
): NormalizedQueryAggregateClause[] => {
    const aliases = new Set<string>(groupByColumns.map(column => column.toLowerCase()));
    const aggregates = Array.isArray(plan.aggregates) ? plan.aggregates : [];
    const periodFamilies = detectPeriodColumnFamilies(allowedColumns);
    return aggregates.map((aggregate, index) => {
        if (!aggregate || typeof aggregate !== 'object' || Array.isArray(aggregate)) {
            throw new Error(`Query aggregate ${index + 1} must be an object.`);
        }
        const alias = normalizeAlias(aggregate.as, `Query aggregate ${index + 1}`);
        const aliasKey = alias.toLowerCase();
        if (aliases.has(aliasKey)) {
            throw new Error(`Query aggregate alias "${alias}" must be unique and must not overlap with groupBy columns.`);
        }
        aliases.add(aliasKey);
        const functionName = normalizeQueryAggregateFunction(aggregate.function);
        if (!functionName) {
            throw new Error(`Query aggregate "${alias}" must use one of: count, count_distinct, sum, avg, min, max, median, percentile.`);
        }
        const resolveAggregateSource = () => {
            if (!aggregate.column) {
                return null;
            }
            const normalizedColumn = lookup.get(colKey(aggregate.column));
            if (normalizedColumn) {
                return { column: normalizedColumn };
            }
            const expandedPeriodColumns = expandPeriodExpression(aggregate.column, periodFamilies);
            if (expandedPeriodColumns && expandedPeriodColumns.length > 0) {
                return {
                    sourceColumns: expandedPeriodColumns.map(column =>
                        normalizeColumn(column, lookup, `Query aggregate "${alias}" period source`)),
                };
            }
            return null;
        };

        if (functionName === 'count') {
            const aggregateSource = resolveAggregateSource();
            return {
                function: 'count',
                as: alias,
                ...(aggregateSource?.column ? { column: aggregateSource.column } : {}),
                ...(aggregateSource?.sourceColumns ? { sourceColumns: aggregateSource.sourceColumns } : {}),
                ...(aggregate.where
                    ? { where: normalizeWhereClauseForCompilation(aggregate.where, lookup, `Query aggregate "${alias}" filter`) }
                    : {}),
            };
        }
        if (!aggregate.column) {
            throw new Error(`Query aggregate "${alias}" requires a source column for ${functionName}.`);
        }
        const aggregateSource = resolveAggregateSource();
        if (!aggregateSource) {
            throw new Error(`Query aggregate "${alias}" references missing column: ${aggregate.column}`);
        }
        return {
            function: functionName,
            ...(aggregateSource.column ? { column: aggregateSource.column } : {}),
            ...(aggregateSource.sourceColumns ? { sourceColumns: aggregateSource.sourceColumns } : {}),
            as: alias,
            ...(functionName === 'percentile' && typeof aggregate.percentile === 'number'
                ? { percentile: aggregate.percentile }
                : {}),
            ...(aggregate.where
                ? { where: normalizeWhereClauseForCompilation(aggregate.where, lookup, `Query aggregate "${alias}" filter`) }
                : {}),
        };
    });
};

const buildMultiColumnNumericExpression = (columns: string[]) =>
    columns
        .map(column => `COALESCE(${buildNumericExpression(column)}, 0)`)
        .join(' + ');

const normalizePostAggregatePredicate = (
    predicate: unknown,
    lookup: Map<string, string>,
    context: string,
): QueryPostAggregatePredicate => {
    if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
        throw new Error(`${context} must be an object.`);
    }
    const column = normalizeColumn((predicate as QueryPostAggregatePredicate).column, lookup, context);
    const operator = String((predicate as QueryPostAggregatePredicate).operator ?? '').trim().toLowerCase() as QueryPostAggregatePredicate['operator'];
    if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'not_null'].includes(operator)) {
        throw new Error(`${context} must use a bounded post-aggregate operator.`);
    }
    return {
        column,
        operator,
        ...((predicate as QueryPostAggregatePredicate).value !== undefined ? { value: (predicate as QueryPostAggregatePredicate).value } : {}),
    };
};

const normalizePostAggregateClause = (
    clause: QueryPlan['postAggregateFilter'],
    lookup: Map<string, string>,
): NormalizedQueryPostAggregateClause | undefined => {
    if (!clause) {
        return undefined;
    }
    const predicates = Array.isArray(clause.predicates)
        ? clause.predicates.map((predicate, index) =>
            normalizePostAggregatePredicate(predicate, lookup, `Query postAggregateFilter predicate ${index + 1}`))
        : undefined;
    const groups = Array.isArray(clause.groups)
        ? clause.groups.map((group, groupIndex) => ({
            predicates: (group.predicates ?? []).map((predicate, predicateIndex) =>
                normalizePostAggregatePredicate(
                    predicate,
                    lookup,
                    `Query postAggregateFilter group ${groupIndex + 1} predicate ${predicateIndex + 1}`,
                )),
        }))
        : undefined;
    return {
        ...(predicates && predicates.length > 0 ? { predicates } : {}),
        ...(groups && groups.length > 0 ? { groups } : {}),
    };
};

const compileAggregateExpression = (aggregate: NormalizedQueryAggregateClause) => {
    const aggregateFilterSql = compileAggregateFilter(aggregate.where);
    if (aggregate.function === 'count') {
        const numericExpression = aggregate.sourceColumns && aggregate.sourceColumns.length > 0
            ? buildMultiColumnNumericExpression(aggregate.sourceColumns)
            : null;
        if (aggregate.sourceColumns && aggregate.sourceColumns.length > 0) {
            return `COUNT(CASE WHEN ${numericExpression} IS NULL THEN NULL ELSE 1 END)${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
        }
        if (!aggregate.column) {
            return `COUNT(*)${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
        }
        return `COUNT(NULLIF(TRIM(COALESCE(CAST(${quoteIdentifier(aggregate.column)} AS VARCHAR), '')), ''))${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    if (aggregate.function === 'count_distinct') {
        const numericExpression = aggregate.sourceColumns && aggregate.sourceColumns.length > 0
            ? buildMultiColumnNumericExpression(aggregate.sourceColumns)
            : null;
        if (aggregate.sourceColumns && aggregate.sourceColumns.length > 0) {
            return `COUNT(DISTINCT ${numericExpression})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
        }
        return `COUNT(DISTINCT NULLIF(TRIM(COALESCE(CAST(${quoteIdentifier(aggregate.column!)} AS VARCHAR), '')), ''))${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    // Coalesce NULLs to 0 so that placeholder-derived blanks (e.g. '- zero
    // markers) participate in AVG/MIN instead of being silently skipped.
    // Multi-column already coalesces per column; align single-column here.
    const numericExpression = aggregate.sourceColumns && aggregate.sourceColumns.length > 0
        ? buildMultiColumnNumericExpression(aggregate.sourceColumns)
        : `COALESCE(${buildNumericExpression(aggregate.column!)}, 0)`;
    if (aggregate.function === 'sum') {
        return `SUM(${numericExpression})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    if (aggregate.function === 'avg') {
        return `AVG(${numericExpression})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    if (aggregate.function === 'min') {
        return `MIN(${numericExpression})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    if (aggregate.function === 'max') {
        return `MAX(${numericExpression})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    if (aggregate.function === 'median') {
        return `MEDIAN(${numericExpression})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
    }
    return `QUANTILE_CONT(${numericExpression}, ${Number.isFinite(aggregate.percentile) ? aggregate.percentile : 0.5})${aggregateFilterSql} AS ${quoteIdentifier(aggregate.as)}`;
};

export const compileQueryPlanToDuckDbSql = (
    plan: QueryPlan,
    options: CompileDuckDbQueryOptions,
): CompiledDuckDbQuery => {
    const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
    const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
    const maxOrderBy = options.maxOrderBy ?? DEFAULT_MAX_ORDER_BY;
    const lookup = buildLookup(options.allowedColumns);
    const groupByColumns = Array.isArray(plan.groupBy) && plan.groupBy.length > 0
        ? [...new Set(plan.groupBy.map(column => normalizeColumn(column, lookup, 'Query groupBy')))]
        : [];
    const aggregates = normalizeAggregateClauses(plan, lookup, groupByColumns, options.allowedColumns);
    const isAggregateQuery = groupByColumns.length > 0 || aggregates.length > 0;

    if (groupByColumns.length > 0 && aggregates.length === 0) {
        throw new Error('Query aggregate mode requires at least one aggregate when groupBy is provided.');
    }

    const aggregateOutputColumns = [...groupByColumns, ...aggregates.map(aggregate => aggregate.as)];
    const outputLookup = isAggregateQuery ? buildLookup(aggregateOutputColumns) : lookup;
    const requestedSelectedColumns = Array.isArray(plan.select) && plan.select.length > 0
        ? [...new Set(plan.select.map(column => normalizeColumn(column, outputLookup, 'Query select')))]
        : (isAggregateQuery ? aggregateOutputColumns : [...options.allowedColumns]);
    // Aggregate aliases are part of the evidence contract, not optional UI
    // decoration. A provider can accidentally submit select=[group] while
    // declaring valid aggregates; silently projecting the measures away makes
    // a complete query unusable and can trigger a false "budget exhausted"
    // answer. Preserve every declared aggregate output in both SQL and result
    // metadata, while still validating the final width below.
    const selectedColumns = isAggregateQuery
        ? [...new Set([...requestedSelectedColumns, ...aggregateOutputColumns])]
        : requestedSelectedColumns;

    if (selectedColumns.length > maxColumns) {
        throw new Error(`Query select exceeds the maximum allowed column count (${maxColumns}).`);
    }

    const normalizedPlan: QueryPlan = {
        ...plan,
        select: selectedColumns,
        where: normalizeWhereClauseForCompilation(plan.where, lookup, 'Query filter'),
        orderBy: Array.isArray(plan.orderBy)
            ? plan.orderBy.map((clause, index) => {
                if (!clause || typeof clause !== 'object' || Array.isArray(clause)) {
                    throw new Error(`Query orderBy ${index + 1} must be an object.`);
                }
                return {
                    column: normalizeColumn(clause.column, outputLookup, 'Query orderBy'),
                    direction: normalizeQueryOrderDirection(clause.direction),
                };
            })
            : [],
        limit: Math.min(
            Math.max(0, Number.isInteger(plan.limit) ? (plan.limit as number) : maxRows),
            maxRows,
        ),
        ...(groupByColumns.length > 0 ? { groupBy: groupByColumns } : {}),
        ...(aggregates.length > 0 ? { aggregates } : {}),
        ...(isAggregateQuery
            ? { postAggregateFilter: normalizePostAggregateClause(plan.postAggregateFilter, outputLookup) }
            : {}),
    };

    if ((normalizedPlan.orderBy ?? []).length > maxOrderBy) {
        throw new Error(`Query orderBy exceeds the maximum allowed clause count (${maxOrderBy}).`);
    }

    if (Array.isArray(plan.select) && plan.select.length > 0) {
        (normalizedPlan.orderBy ?? []).forEach(clause => {
            if (!selectedColumns.some(column => column.toLowerCase() === clause.column.toLowerCase())) {
                throw new Error(`Query orderBy column "${clause.column}" must also appear in select for DuckDB execution.`);
            }
        });
    }

    const orderBySql = (normalizedPlan.orderBy ?? []).length > 0
        ? `ORDER BY ${(normalizedPlan.orderBy ?? []).map(clause => `${quoteIdentifier(clause.column)} ${clause.direction.toUpperCase()}`).join(', ')}`
        : '';
    const limitSql = `LIMIT ${normalizedPlan.limit}`;

    let sql: string;
    let countSql: string;

    if (isAggregateQuery) {
        const dimNorm = options.dimensionNormalization ?? null;
        // Track which groupBy columns are actually normalized (type-gated)
        const normalizedGroupByIndices = new Set<number>();
        const aggregateSelectSql = [
            ...groupByColumns.map((column, index) => {
                if (dimNorm && isColumnNormalized(column, dimNorm)) {
                    normalizedGroupByIndices.add(index);
                    return `${buildDimensionNormExpr(quoteIdentifier(column), dimNorm)} AS ${quoteIdentifier(column)}`;
                }
                return quoteIdentifier(column);
            }),
            ...aggregates.map(compileAggregateExpression),
        ].join(', ');
        const fromSql = `FROM ${quoteIdentifier(options.tableName)}`;
        // Pass dimNorm to WHERE so filters on normalized columns match
        // the same rows that GROUP BY collapsed (e.g. WHERE BRAND = 'Unknown'
        // matches null/empty/placeholder rows).
        let whereSql = compileWhere(normalizedPlan, dimNorm);
        // BUG-4 fix: When dimension normalization is enabled, exclude rows where
        // the groupBy column is NULL/empty/placeholder instead of aggregating them
        // as "Unknown". This prevents false "Unknown" buckets when detail-row
        // filters are unavailable (e.g., RowRole/RowClass column missing).
        if (dimNorm && normalizedGroupByIndices.size > 0) {
            const excludeNullClauses = groupByColumns
                .filter((_, i) => normalizedGroupByIndices.has(i))
                .map(col => `(${quoteIdentifier(col)} IS NOT NULL AND TRIM(CAST(${quoteIdentifier(col)} AS VARCHAR)) != '')`)
                .join(' AND ');
            if (excludeNullClauses) {
                whereSql = whereSql
                    ? `${whereSql} AND ${excludeNullClauses}`
                    : `WHERE ${excludeNullClauses}`;
            }
        }
        const groupBySql = groupByColumns.length > 0
            ? normalizedGroupByIndices.size > 0
                // When any column uses a CASE expression, use positional refs
                // for all columns to avoid ambiguity.
                ? `GROUP BY ${groupByColumns.map((_, i) => String(i + 1)).join(', ')}`
                : `GROUP BY ${groupByColumns.map(quoteIdentifier).join(', ')}`
            : '';
        const aggregateBaseSql = [
            `SELECT ${aggregateSelectSql}`,
            fromSql,
            whereSql,
            groupBySql,
        ].filter(Boolean).join(' ');
        // Post-aggregate filter operates on the aliased output columns,
        // which are already normalized — use raw comparison (no dimNorm).
        const postAggregateWhereSql = compileWhere({
            where: normalizedPlan.postAggregateFilter as unknown as QueryPlan['where'],
        });
        const projectedSelectSql = selectedColumns.map(quoteIdentifier).join(', ');
        sql = [
            `SELECT ${projectedSelectSql}`,
            `FROM (${aggregateBaseSql}) AS ${quoteIdentifier('query_result')}`,
            postAggregateWhereSql,
            orderBySql,
            limitSql,
        ].filter(Boolean).join(' ');
        countSql = [
            'SELECT COUNT(*) AS total',
            `FROM (${aggregateBaseSql}) AS ${quoteIdentifier('query_count')}`,
            postAggregateWhereSql.replace(/query_result/g, 'query_count'),
        ].join(' ');
    } else {
        const dimNormNonAgg = options.dimensionNormalization ?? null;
        const selectSql = selectedColumns.map(quoteIdentifier).join(', ');
        const fromSql = `FROM ${quoteIdentifier(options.tableName)}`;
        const whereSql = compileWhere(normalizedPlan, dimNormNonAgg);
        sql = [
            `SELECT ${selectSql}`,
            fromSql,
            whereSql,
            orderBySql,
            limitSql,
        ].filter(Boolean).join(' ');
        countSql = [
            'SELECT COUNT(*) AS total',
            fromSql,
            whereSql,
        ].filter(Boolean).join(' ');
    }

    return {
        sql,
        countSql,
        selectedColumns,
        appliedOrderBy: normalizedPlan.orderBy ?? [],
        appliedLimit: normalizedPlan.limit ?? maxRows,
    };
};

// --- UNPIVOT compiler ---

import type { UnpivotParams } from './queryIntent';

/**
 * Compile an UNPIVOT intent into DuckDB SQL.
 *
 * Produces: SELECT label AS nameAs, SUM/value AS valueAs FROM (UNION ALL subqueries)
 * with optional WHERE filter and ORDER BY.
 *
 * Validates source columns against allowedColumns to prevent injection.
 */
export const compileUnpivotToDuckDbSql = (
    params: UnpivotParams,
    options: { tableName: string; allowedColumns: string[]; maxRows?: number },
): CompiledDuckDbQuery => {
    const { sourceColumns, nameAs, valueAs, labels, where, aggregate, orderBy, limit } = params;
    const { tableName, allowedColumns, maxRows = DEFAULT_MAX_ROWS } = options;

    if (!sourceColumns.length) {
        throw new Error('UNPIVOT requires at least one source column.');
    }
    if (!nameAs?.trim() || !valueAs?.trim()) {
        throw new Error('UNPIVOT requires nameAs and valueAs output column names.');
    }

    // Validate source columns exist
    const lookup = buildLookup(allowedColumns);
    const resolvedColumns = sourceColumns.map((col, i) => {
        const resolved = lookup.get(colKey(col));
        if (!resolved) {
            throw new Error(`UNPIVOT source column not found: ${col}`);
        }
        return { original: resolved, label: labels?.[i] ?? resolved };
    });

    // Validate WHERE column if present
    let whereClause = '';
    if (where?.column && where?.equals) {
        const resolvedWhereCol = lookup.get(colKey(where.column));
        if (!resolvedWhereCol) {
            throw new Error(`UNPIVOT WHERE column not found: ${where.column}`);
        }
        whereClause = ` WHERE ${quoteIdentifier(resolvedWhereCol)} = ${quoteStringLiteral(where.equals)}`;
    }

    // Build UNION ALL subqueries
    const aggFn = aggregate ?? 'sum';
    const aggFnUpper = aggFn.toUpperCase();
    const quotedTable = quoteIdentifier(tableName);
    const quotedNameAs = quoteIdentifier(nameAs);
    const quotedValueAs = quoteIdentifier(valueAs);

    const unionParts = resolvedColumns.map((col, index) => {
        const valueExpr = `${aggFnUpper}(COALESCE(TRY_CAST(${quoteIdentifier(col.original)} AS DOUBLE), 0))`;
        const selectParts = [
            `${quoteStringLiteral(col.label)} AS ${quotedNameAs}`,
            `${valueExpr} AS ${quotedValueAs}`,
            `${index} AS __sort_order`,
        ];
        return `SELECT ${selectParts.join(', ')} FROM ${quotedTable}${whereClause}`;
    });

    const innerSql = unionParts.join(' UNION ALL ');

    // Order by
    let orderClause: string;
    switch (orderBy) {
        case 'value_asc': orderClause = `ORDER BY ${quotedValueAs} ASC`; break;
        case 'value_desc': orderClause = `ORDER BY ${quotedValueAs} DESC`; break;
        default: orderClause = 'ORDER BY __sort_order ASC'; break;
    }

    const effectiveLimit = limit ?? maxRows;
    const sql = `SELECT ${quotedNameAs}, ${quotedValueAs} FROM (${innerSql}) AS __unpivot ${orderClause} LIMIT ${effectiveLimit}`;
    const countSql = `SELECT COUNT(*) AS total FROM (${innerSql}) AS __unpivot_count`;
    const selectedColumns = [nameAs, valueAs];

    return {
        sql,
        countSql,
        selectedColumns,
        appliedOrderBy: [],
        appliedLimit: effectiveLimit,
    };
};
