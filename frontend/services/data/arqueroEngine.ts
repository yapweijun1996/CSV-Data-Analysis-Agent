/**
 * Arquero-based browser-native query execution engine.
 *
 * Serves as a fallback when DuckDB WASM is unavailable (CDN failure,
 * WASM compilation error, query timeout). Handles the bounded structured
 * query subset defined by QueryPlan: filter, groupBy, aggregate, orderBy,
 * limit, and select projection.
 *
 * Does NOT attempt full SQL compatibility. Unsupported plans are explicitly
 * flagged so the caller can fall through to the native JS engine.
 */
import * as aq from 'arquero';
import type { ColumnTable } from 'arquero';
import type {
    CsvRow,
    DataQueryResult,
    QueryAggregateClause,
    QueryOrderByClause,
    QueryPlan,
    QueryWhereClause,
} from '../../types';
import { robustParseFloat } from './dataProfiler';

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_COLUMNS = 50;
const DEFAULT_MAX_ORDER_BY = 3;

export interface ArqueroQueryOptions {
    allowedColumns?: string[];
    maxRows?: number;
    maxColumns?: number;
    maxOrderBy?: number;
}

export interface ArqueroQueryExecution {
    result: DataQueryResult;
    supported: boolean;
    unsupportedReason: string | null;
}

// ---------------------------------------------------------------------------
// Column name escaping for Arquero expression strings
// ---------------------------------------------------------------------------
const escapeExprColumn = (name: string): string =>
    name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// ---------------------------------------------------------------------------
// Numeric pre-processing: convert formatted number strings to actual numbers
// so Arquero aggregate functions operate correctly.
// ---------------------------------------------------------------------------
const preprocessRows = (rows: CsvRow[], aggregateColumns: Set<string>): CsvRow[] => {
    if (rows.length === 0 || aggregateColumns.size === 0) return rows;
    return rows.map(row => {
        const next: CsvRow = { ...row };
        for (const col of aggregateColumns) {
            const value = row[col];
            if (typeof value === 'string') {
                const num = robustParseFloat(value);
                if (num !== null) next[col] = num;
            }
        }
        return next;
    });
};

// ---------------------------------------------------------------------------
// Predicate evaluation — translates QueryWhereClause predicates to JS filter
// ---------------------------------------------------------------------------
type FilterPred = { column: string; operator: string; value?: unknown; secondaryValue?: unknown };

const evaluatePredicate = (row: CsvRow, pred: FilterPred): boolean => {
    const rawValue = row[pred.column];
    const strValue = rawValue == null ? '' : String(rawValue);
    const numValue = typeof rawValue === 'number' ? rawValue : robustParseFloat(rawValue);

    switch (pred.operator) {
        case 'eq':
        case 'equals':
            return strValue.toLowerCase() === String(pred.value ?? '').toLowerCase();
        case 'neq':
        case 'not_equals':
            return strValue.toLowerCase() !== String(pred.value ?? '').toLowerCase();
        case 'gt':
            return numValue !== null && numValue > Number(pred.value);
        case 'gte':
            return numValue !== null && numValue >= Number(pred.value);
        case 'lt':
            return numValue !== null && numValue < Number(pred.value);
        case 'lte':
            return numValue !== null && numValue <= Number(pred.value);
        case 'contains':
            return strValue.toLowerCase().includes(String(pred.value ?? '').toLowerCase());
        case 'starts_with':
            return strValue.toLowerCase().startsWith(String(pred.value ?? '').toLowerCase());
        case 'ends_with':
            return strValue.toLowerCase().endsWith(String(pred.value ?? '').toLowerCase());
        case 'is_null':
        case 'is_empty':
            return rawValue == null || strValue.trim() === '';
        case 'not_null':
        case 'is_not_empty':
            return rawValue != null && strValue.trim() !== '';
        case 'in':
            if (Array.isArray(pred.value)) {
                const lowerSet = new Set((pred.value as unknown[]).map(v => String(v).toLowerCase()));
                return lowerSet.has(strValue.toLowerCase());
            }
            return false;
        case 'not_in':
            if (Array.isArray(pred.value)) {
                const lowerSet = new Set((pred.value as unknown[]).map(v => String(v).toLowerCase()));
                return !lowerSet.has(strValue.toLowerCase());
            }
            return true;
        case 'between':
            if (numValue === null) return false;
            return numValue >= Number(pred.value) && numValue <= Number(pred.secondaryValue ?? pred.value);
        default:
            return true;
    }
};

const applyWhereFilter = (rows: CsvRow[], where: QueryWhereClause): CsvRow[] => {
    const predicates = Array.isArray(where.predicates) ? where.predicates : [];
    const groups = Array.isArray(where.groups) ? where.groups : [];

    return rows.filter(row => {
        // Top-level predicates are AND-ed
        for (const pred of predicates) {
            if (!pred || !pred.column) continue;
            if (!evaluatePredicate(row, pred as FilterPred)) return false;
        }
        // Groups are OR-ed with each other, predicates within a group are AND-ed
        if (groups.length > 0) {
            const anyGroupMatches = groups.some(group => {
                if (!group || !Array.isArray(group.predicates)) return false;
                return group.predicates.every(pred => {
                    if (!pred || !pred.column) return true;
                    return evaluatePredicate(row, pred as FilterPred);
                });
            });
            if (!anyGroupMatches) return false;
        }
        return true;
    });
};

// ---------------------------------------------------------------------------
// Aggregate expression builder
// ---------------------------------------------------------------------------
const SUPPORTED_AGG_FUNCTIONS = new Set([
    'count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'median', 'percentile',
]);

const buildAggExpression = (agg: QueryAggregateClause): string | null => {
    const fn = (agg.function ?? '').toLowerCase().trim();
    if (!SUPPORTED_AGG_FUNCTIONS.has(fn)) return null;

    if (fn === 'count') {
        if (!agg.column) return 'd => op.count()';
        const col = escapeExprColumn(agg.column);
        return `d => op.valid(d["${col}"])`;
    }
    if (!agg.column) return null;
    const col = escapeExprColumn(agg.column);

    switch (fn) {
        case 'count_distinct': return `d => op.distinct(d["${col}"])`;
        case 'sum': return `d => op.sum(d["${col}"])`;
        case 'avg': return `d => op.mean(d["${col}"])`;
        case 'min': return `d => op.min(d["${col}"])`;
        case 'max': return `d => op.max(d["${col}"])`;
        case 'median': return `d => op.median(d["${col}"])`;
        case 'percentile': {
            const p = Number.isFinite(agg.percentile) ? agg.percentile : 0.5;
            return `d => op.quantile(d["${col}"], ${p})`;
        }
        default: return null;
    }
};

// ---------------------------------------------------------------------------
// Column name resolution (case-insensitive)
// ---------------------------------------------------------------------------
const resolveColumn = (name: string, available: string[]): string | null => {
    const lower = name.trim().toLowerCase();
    return available.find(c => c.toLowerCase() === lower) ?? null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a QueryPlan against in-memory rows using Arquero.
 *
 * Returns `{ supported: false }` when the plan uses operations that
 * this engine cannot handle (e.g. per-aggregate WHERE clauses).
 */
export const executeArqueroQuery = (
    inputRows: CsvRow[],
    plan: QueryPlan,
    options?: ArqueroQueryOptions,
): ArqueroQueryExecution => {
    const startedAt = performance.now();
    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const maxColumns = options?.maxColumns ?? DEFAULT_MAX_COLUMNS;
    const maxOrderBy = options?.maxOrderBy ?? DEFAULT_MAX_ORDER_BY;
    const availableColumns = options?.allowedColumns && options.allowedColumns.length > 0
        ? options.allowedColumns
        : inputRows.length > 0 ? Object.keys(inputRows[0]) : [];

    const unsupported = (reason: string): ArqueroQueryExecution => ({
        result: {
            rows: [],
            totalMatchedRows: 0,
            returnedRows: 0,
            truncated: false,
            selectedColumns: [],
            appliedOrderBy: [],
            appliedLimit: maxRows,
            durationMs: Math.round(performance.now() - startedAt),
        },
        supported: false,
        unsupportedReason: reason,
    });

    // -----------------------------------------------------------------------
    // 1. Validate aggregate clauses — reject per-aggregate WHERE
    // -----------------------------------------------------------------------
    const groupByColumns = (Array.isArray(plan.groupBy) ? plan.groupBy : [])
        .map(col => resolveColumn(col, availableColumns))
        .filter((col): col is string => col !== null);
    const aggregates = Array.isArray(plan.aggregates) ? plan.aggregates : [];
    const isAggregateQuery = groupByColumns.length > 0 || aggregates.length > 0;

    if (isAggregateQuery && groupByColumns.length > 0 && aggregates.length === 0) {
        return unsupported('groupBy without aggregates');
    }

    for (const agg of aggregates) {
        if (agg.where) {
            return unsupported('per-aggregate WHERE clauses not supported in Arquero fallback');
        }
        const fn = (agg.function ?? '').toLowerCase().trim();
        if (!SUPPORTED_AGG_FUNCTIONS.has(fn)) {
            return unsupported(`unsupported aggregate function: ${fn}`);
        }
        if (fn !== 'count' && !agg.column) {
            return unsupported(`aggregate "${agg.as}" (${fn}) requires a source column`);
        }
    }

    // -----------------------------------------------------------------------
    // 2. Pre-process numeric columns for aggregation accuracy
    // -----------------------------------------------------------------------
    const aggregateColumnNames = new Set<string>();
    for (const agg of aggregates) {
        if (agg.column) {
            const resolved = resolveColumn(agg.column, availableColumns);
            if (resolved) aggregateColumnNames.add(resolved);
        }
    }
    const preprocessedRows = preprocessRows(inputRows, aggregateColumnNames);

    // -----------------------------------------------------------------------
    // 3. Apply WHERE filter (before loading into Arquero)
    // -----------------------------------------------------------------------
    const filteredRows = plan.where
        ? applyWhereFilter(preprocessedRows, plan.where)
        : preprocessedRows;

    if (filteredRows.length === 0 && !isAggregateQuery) {
        return {
            result: {
                rows: [],
                totalMatchedRows: 0,
                returnedRows: 0,
                truncated: false,
                selectedColumns: availableColumns.slice(0, maxColumns),
                appliedOrderBy: [],
                appliedLimit: maxRows,
                durationMs: Math.round(performance.now() - startedAt),
            },
            supported: true,
            unsupportedReason: null,
        };
    }

    // -----------------------------------------------------------------------
    // 4. Load into Arquero table
    // -----------------------------------------------------------------------
    let table: ColumnTable = aq.from(filteredRows);

    // -----------------------------------------------------------------------
    // 5. GroupBy + Aggregate
    // -----------------------------------------------------------------------
    let outputColumns: string[];
    if (isAggregateQuery) {
        if (groupByColumns.length > 0) {
            table = table.groupby(groupByColumns);
        }

        const rollupSpec: Record<string, string> = {};
        const aggregateAliases: string[] = [];
        for (const agg of aggregates) {
            const alias = (agg.as ?? '').trim();
            if (!alias) continue;
            const expr = buildAggExpression(agg);
            if (!expr) return unsupported(`cannot build expression for aggregate "${alias}"`);
            rollupSpec[alias] = expr;
            aggregateAliases.push(alias);
        }

        table = table.rollup(rollupSpec);
        outputColumns = [...groupByColumns, ...aggregateAliases];
    } else {
        outputColumns = availableColumns;
    }

    // -----------------------------------------------------------------------
    // 6. Post-aggregate filter
    // -----------------------------------------------------------------------
    if (plan.postAggregateFilter) {
        const postRows = table.objects() as CsvRow[];
        const postFiltered = applyWhereFilter(postRows, plan.postAggregateFilter as QueryWhereClause);
        table = aq.from(postFiltered);
    }

    // -----------------------------------------------------------------------
    // 7. Determine output columns (SELECT projection)
    // -----------------------------------------------------------------------
    const outputLookup = outputColumns;
    const selectedColumns = Array.isArray(plan.select) && plan.select.length > 0
        ? [...new Set(plan.select
            .map(col => resolveColumn(col, outputLookup))
            .filter((col): col is string => col !== null))]
        : outputColumns.slice(0, maxColumns);

    if (selectedColumns.length > maxColumns) {
        return unsupported(`select exceeds max column count (${maxColumns})`);
    }

    // -----------------------------------------------------------------------
    // 8. OrderBy
    // -----------------------------------------------------------------------
    const orderByClauses: QueryOrderByClause[] = [];
    if (Array.isArray(plan.orderBy)) {
        for (const clause of plan.orderBy.slice(0, maxOrderBy)) {
            if (!clause || !clause.column) continue;
            const resolved = resolveColumn(clause.column, outputColumns);
            if (!resolved) continue;
            orderByClauses.push({
                column: resolved,
                direction: clause.direction === 'asc' ? 'asc' : 'desc',
            });
        }

        if (orderByClauses.length > 0) {
            const orderSpecs = orderByClauses.map(c =>
                c.direction === 'desc' ? aq.desc(c.column) : c.column,
            );
            table = table.orderby(...orderSpecs);
        }
    }

    // -----------------------------------------------------------------------
    // 9. Extract rows
    // -----------------------------------------------------------------------
    const allRows = table.objects() as CsvRow[];
    const totalMatchedRows = allRows.length;

    // -----------------------------------------------------------------------
    // 10. Limit
    // -----------------------------------------------------------------------
    const appliedLimit = Math.min(
        Math.max(0, Number.isInteger(plan.limit) ? (plan.limit as number) : maxRows),
        maxRows,
    );
    const limitedRows = allRows.slice(0, appliedLimit);

    // -----------------------------------------------------------------------
    // 11. Project to selected columns
    // -----------------------------------------------------------------------
    const projectedRows = limitedRows.map(row => {
        const next: CsvRow = {};
        for (const col of selectedColumns) {
            next[col] = row[col] ?? null;
        }
        return next;
    });

    return {
        result: {
            rows: projectedRows,
            totalMatchedRows,
            returnedRows: projectedRows.length,
            truncated: totalMatchedRows > projectedRows.length,
            selectedColumns,
            appliedOrderBy: orderByClauses,
            appliedLimit,
            durationMs: Math.round(performance.now() - startedAt),
        },
        supported: true,
        unsupportedReason: null,
    };
};
