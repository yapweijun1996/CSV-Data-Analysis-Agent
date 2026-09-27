/**
 * Diagnostic Query Templates — intent-based SQL builders.
 *
 * Each template maps a DiagnosticQueryKind to either:
 * - A QueryPlan builder (preferred — gets directive injection + compilation)
 * - A raw CompiledDuckDbQuery builder (for CTE/UNION ALL patterns)
 *
 * Templates centralize SQL patterns that were previously hardcoded in
 * diagnosticDataActions, dataExplorationQueries, dataInvestigationHarness,
 * temporalProfiler, and outlierDetector.
 */

import type { ColumnProfile, QueryPlan } from '../../types';
import type { DiagnosticQueryKind } from './queryIntent';
import type { CompiledDuckDbQuery } from './queryCompiler';

// --- Template context ---

export interface TemplateContext {
    tableName: string;
    allowedColumns: string[];
    columnProfiles: ColumnProfile[];
}

// --- Template interface ---

export interface DiagnosticTemplate {
    kind: DiagnosticQueryKind;
    /** True if this template produces a QueryPlan (preferred path). */
    isStructured: boolean;
    /** Build a QueryPlan from intent params. Available when isStructured=true. */
    toQueryPlan?: (params: Record<string, unknown>, context: TemplateContext) => QueryPlan;
    /** Build raw compiled SQL for complex cases (CTE, UNION ALL). */
    toCompiledQuery?: (params: Record<string, unknown>, context: TemplateContext) => CompiledDuckDbQuery;
}

// --- SQL helpers ---

const quoteId = (value: string) => `"${value.replace(/"/g, '""')}"`;
const quoteLit = (value: string) => `'${value.replace(/'/g, "''")}'`;

const buildNumericExpr = (column: string) => {
    const text = `TRIM(COALESCE(CAST(${quoteId(column)} AS VARCHAR), ''))`;
    const neg = `CASE WHEN ${text} LIKE '(%' AND ${text} LIKE '%)' THEN CONCAT('-', SUBSTRING(${text}, 2, LENGTH(${text}) - 2)) ELSE ${text} END`;
    const stripped = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${neg}, ',', ''), '$', ''), '€', ''), '£', ''), '¥', ''), '%', '')`;
    return `TRY_CAST(NULLIF(${stripped}, '') AS DOUBLE)`;
};

const numericTypes = new Set(['numerical', 'currency', 'percentage']);
const isNumericCol = (col: ColumnProfile) => numericTypes.has(col.type);

// --- Structured templates (produce QueryPlan) ---

const valueCountsTemplate: DiagnosticTemplate = {
    kind: 'value_counts',
    isStructured: true,
    toQueryPlan: (params) => {
        const column = String(params.column ?? '');
        const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 500);
        return {
            select: [column, 'count'],
            groupBy: [column],
            aggregates: [{ function: 'count', column, as: 'count' }],
            orderBy: [{ column: 'count', direction: 'desc' }],
            limit,
        };
    },
};

const categoricalTopNTemplate: DiagnosticTemplate = {
    kind: 'categorical_topn',
    isStructured: true,
    toQueryPlan: (params) => {
        const column = String(params.column ?? '');
        const limit = Number(params.limit) || 15;
        return {
            select: [column, 'val_count'],
            groupBy: [column],
            aggregates: [{ function: 'count', column, as: 'val_count' }],
            orderBy: [{ column: 'val_count', direction: 'desc' }],
            limit,
        };
    },
};

const temporalDatesTemplate: DiagnosticTemplate = {
    kind: 'temporal_dates',
    isStructured: false, // needs DISTINCT which QueryPlan doesn't support
    toCompiledQuery: (params, context) => {
        const column = String(params.column ?? '');
        const limit = Number(params.limit) || 500;
        const sql = `SELECT DISTINCT CAST(${quoteId(column)} AS VARCHAR) AS dt ` +
            `FROM ${quoteId(context.tableName)} ` +
            `WHERE ${quoteId(column)} IS NOT NULL ` +
            `ORDER BY dt LIMIT ${limit}`;
        return {
            sql,
            countSql: `SELECT COUNT(DISTINCT ${quoteId(column)}) AS total FROM ${quoteId(context.tableName)} WHERE ${quoteId(column)} IS NOT NULL`,
            selectedColumns: ['dt'],
            appliedOrderBy: [{ column: 'dt', direction: 'asc' as const }],
            appliedLimit: limit,
        };
    },
};

const descriptionTotalsTemplate: DiagnosticTemplate = {
    kind: 'description_totals',
    isStructured: false, // needs TRY_CAST numeric expression
    toCompiledQuery: (params, context) => {
        const descCol = String(params.descriptionColumn ?? '');
        const valueCol = String(params.valueColumn ?? '');
        const rowClassCol = params.rowClassColumn ? String(params.rowClassColumn) : null;
        const rowClassDetailValue = params.rowClassDetailValue ? String(params.rowClassDetailValue) : null;
        const limit = Number(params.limit) || 50;

        const castExpr = buildNumericExpr(valueCol);
        let whereClause = '';
        if (rowClassCol && rowClassDetailValue) {
            whereClause = ` WHERE LOWER(TRIM(COALESCE(CAST(${quoteId(rowClassCol)} AS VARCHAR), ''))) = ${quoteLit(rowClassDetailValue.toLowerCase())}`;
        }

        const sql = `SELECT ${quoteId(descCol)} AS description, ` +
            `SUM(${castExpr}) AS total, COUNT(*) AS row_count ` +
            `FROM ${quoteId(context.tableName)}${whereClause} ` +
            `GROUP BY ${quoteId(descCol)} ` +
            `ORDER BY total DESC LIMIT ${limit}`;
        return {
            sql,
            countSql: `SELECT COUNT(DISTINCT ${quoteId(descCol)}) AS total FROM ${quoteId(context.tableName)}${whereClause}`,
            selectedColumns: ['description', 'total', 'row_count'],
            appliedOrderBy: [{ column: 'total', direction: 'desc' as const }],
            appliedLimit: limit,
        };
    },
};

// --- Raw SQL templates (CTE / UNION ALL patterns) ---

const describeTemplate: DiagnosticTemplate = {
    kind: 'describe',
    isStructured: false,
    toCompiledQuery: (params, context) => {
        const requested = Array.isArray(params.columns) ? params.columns as string[] : [];
        const numericCols = context.columnProfiles
            .filter(isNumericCol)
            .filter(c => requested.length === 0 || requested.includes(c.name));
        if (numericCols.length === 0) {
            return { sql: 'SELECT 1 WHERE FALSE', countSql: 'SELECT 0 AS total', selectedColumns: [], appliedOrderBy: [], appliedLimit: 0 };
        }
        const parts = numericCols.map(col => {
            const expr = buildNumericExpr(col.name);
            return `SELECT ${quoteLit(col.name)} AS column_name, ` +
                `COUNT(${expr}) AS cnt, ` +
                `ROUND(AVG(${expr}), 4) AS mean_val, ` +
                `ROUND(STDDEV_SAMP(${expr}), 4) AS std_val, ` +
                `MIN(${expr}) AS min_val, ` +
                `APPROX_QUANTILE(${expr}, 0.25) AS q1, ` +
                `APPROX_QUANTILE(${expr}, 0.5) AS median_val, ` +
                `APPROX_QUANTILE(${expr}, 0.75) AS q3, ` +
                `MAX(${expr}) AS max_val, ` +
                `COUNT(*) - COUNT(${expr}) AS null_count ` +
                `FROM ${quoteId(context.tableName)}`;
        });
        const sql = parts.join(' UNION ALL ');
        return {
            sql,
            countSql: `SELECT ${numericCols.length} AS total`,
            selectedColumns: ['column_name', 'cnt', 'mean_val', 'std_val', 'min_val', 'q1', 'median_val', 'q3', 'max_val', 'null_count'],
            appliedOrderBy: [],
            appliedLimit: numericCols.length,
        };
    },
};

const outliersTemplate: DiagnosticTemplate = {
    kind: 'outliers',
    isStructured: false,
    toCompiledQuery: (params, context) => {
        const column = String(params.column ?? '');
        const limit = Number(params.limit) || 50;
        const expr = buildNumericExpr(column);
        const sql = `WITH stats AS (SELECT APPROX_QUANTILE(${expr}, 0.25) AS q1, APPROX_QUANTILE(${expr}, 0.75) AS q3 FROM ${quoteId(context.tableName)}) ` +
            `SELECT t.*, ${expr} AS __outlier_value, ` +
            `CASE WHEN ${expr} > s.q3 + 1.5 * (s.q3 - s.q1) THEN 'high' ELSE 'low' END AS __direction, ` +
            `s.q1 AS __q1, s.q3 AS __q3, (s.q3 - s.q1) AS __iqr ` +
            `FROM ${quoteId(context.tableName)} t, stats s ` +
            `WHERE ${expr} < s.q1 - 1.5 * (s.q3 - s.q1) OR ${expr} > s.q3 + 1.5 * (s.q3 - s.q1) ` +
            `ORDER BY ABS(${expr} - (s.q1 + s.q3) / 2.0) DESC LIMIT ${limit}`;
        return {
            sql,
            countSql: `WITH stats AS (SELECT APPROX_QUANTILE(${expr}, 0.25) AS q1, APPROX_QUANTILE(${expr}, 0.75) AS q3 FROM ${quoteId(context.tableName)}) SELECT COUNT(*) AS total FROM ${quoteId(context.tableName)} t, stats s WHERE ${expr} < s.q1 - 1.5 * (s.q3 - s.q1) OR ${expr} > s.q3 + 1.5 * (s.q3 - s.q1)`,
            selectedColumns: ['__outlier_value', '__direction', '__q1', '__q3', '__iqr'],
            appliedOrderBy: [],
            appliedLimit: limit,
        };
    },
};

const missingTemplate: DiagnosticTemplate = {
    kind: 'missing',
    isStructured: false,
    toCompiledQuery: (params, context) => {
        const requested = Array.isArray(params.columns) ? params.columns as string[] : [];
        const cols = requested.length > 0
            ? context.columnProfiles.filter(c => requested.includes(c.name))
            : context.columnProfiles;
        if (cols.length === 0) {
            return { sql: 'SELECT 1 WHERE FALSE', countSql: 'SELECT 0 AS total', selectedColumns: [], appliedOrderBy: [], appliedLimit: 0 };
        }
        const parts = cols.map(col => {
            const zeroExpr = isNumericCol(col)
                ? `ROUND(SUM(CASE WHEN ${buildNumericExpr(col.name)} = 0 THEN 1.0 ELSE 0.0 END) / COUNT(*), 4)`
                : '0';
            return `SELECT ${quoteLit(col.name)} AS column_name, ${quoteLit(col.type)} AS col_type, ` +
                `ROUND(SUM(CASE WHEN ${quoteId(col.name)} IS NULL THEN 1.0 ELSE 0.0 END) / COUNT(*), 4) AS null_rate, ` +
                `ROUND(SUM(CASE WHEN TRIM(COALESCE(CAST(${quoteId(col.name)} AS VARCHAR), '')) = '' THEN 1.0 ELSE 0.0 END) / COUNT(*), 4) AS blank_rate, ` +
                `${zeroExpr} AS zero_rate, ` +
                `COUNT(*) AS total_rows ` +
                `FROM ${quoteId(context.tableName)}`;
        });
        const sql = parts.join(' UNION ALL ');
        return {
            sql,
            countSql: `SELECT ${cols.length} AS total`,
            selectedColumns: ['column_name', 'col_type', 'null_rate', 'blank_rate', 'zero_rate', 'total_rows'],
            appliedOrderBy: [],
            appliedLimit: cols.length,
        };
    },
};

const concentrationTemplate: DiagnosticTemplate = {
    kind: 'concentration',
    isStructured: false,
    toCompiledQuery: (params, context) => {
        const column = String(params.column ?? '');
        const t = quoteId(context.tableName);
        const c = quoteId(column);
        const sql = `SELECT COUNT(DISTINCT ${c}) AS uniq, COUNT(*) AS total, ` +
            `SUM(CASE WHEN ${c} IS NULL OR TRIM(CAST(${c} AS VARCHAR)) = '' THEN 1 ELSE 0 END) AS nulls, ` +
            `(SELECT COALESCE(SUM(sub.cnt), 0) FROM (SELECT COUNT(*) AS cnt FROM ${t} GROUP BY ${c} ORDER BY cnt DESC LIMIT 5) sub) AS top5 ` +
            `FROM ${t}`;
        return {
            sql,
            countSql: 'SELECT 1 AS total',
            selectedColumns: ['uniq', 'total', 'nulls', 'top5'],
            appliedOrderBy: [],
            appliedLimit: 1,
        };
    },
};

const numericDistributionTemplate: DiagnosticTemplate = {
    kind: 'numeric_distribution',
    isStructured: false,
    toCompiledQuery: (params, context) => {
        const column = String(params.column ?? '');
        const t = quoteId(context.tableName);
        const expr = buildNumericExpr(column);
        const sql = `SELECT MIN(${expr}) AS min_val, MAX(${expr}) AS max_val, ` +
            `AVG(${expr}) AS avg_val, APPROX_QUANTILE(${expr}, 0.5) AS median_val, ` +
            `COUNT(${expr}) AS non_null, COUNT(*) - COUNT(${expr}) AS null_count, ` +
            `SUM(CASE WHEN ${expr} = 0 THEN 1 ELSE 0 END) AS zero_count, ` +
            `COUNT(*) AS total_rows ` +
            `FROM ${t}`;
        return {
            sql,
            countSql: 'SELECT 1 AS total',
            selectedColumns: ['min_val', 'max_val', 'avg_val', 'median_val', 'non_null', 'null_count', 'zero_count', 'total_rows'],
            appliedOrderBy: [],
            appliedLimit: 1,
        };
    },
};

const crossColumnTemplate: DiagnosticTemplate = {
    kind: 'cross_column',
    isStructured: false,
    toCompiledQuery: (params, context) => {
        const columns = Array.isArray(params.columns) ? params.columns as string[] : [];
        if (columns.length < 2) {
            return { sql: 'SELECT 1 WHERE FALSE', countSql: 'SELECT 0 AS total', selectedColumns: [], appliedOrderBy: [], appliedLimit: 0 };
        }
        const t = quoteId(context.tableName);
        const pairs: string[] = [];
        for (let i = 0; i < columns.length; i++) {
            for (let j = i + 1; j < columns.length; j++) {
                const a = quoteId(columns[i]);
                const b = quoteId(columns[j]);
                pairs.push(
                    `SELECT ${quoteLit(`${columns[i]}__${columns[j]}`)} AS pair, ` +
                    `COUNT(DISTINCT ${a}) AS a_uniq, COUNT(DISTINCT ${b}) AS b_uniq, ` +
                    `COUNT(DISTINCT ${a} || '||' || ${b}) AS pair_uniq ` +
                    `FROM ${t}`,
                );
            }
        }
        const sql = pairs.join(' UNION ALL ');
        return {
            sql,
            countSql: `SELECT ${pairs.length} AS total`,
            selectedColumns: ['pair', 'a_uniq', 'b_uniq', 'pair_uniq'],
            appliedOrderBy: [],
            appliedLimit: pairs.length,
        };
    },
};

// --- Template registry ---

const TEMPLATES: Map<string, DiagnosticTemplate> = new Map([
    ['value_counts', valueCountsTemplate],
    ['categorical_topn', categoricalTopNTemplate],
    ['temporal_dates', temporalDatesTemplate],
    ['description_totals', descriptionTotalsTemplate],
    ['describe', describeTemplate],
    ['outliers', outliersTemplate],
    ['missing', missingTemplate],
    ['concentration', concentrationTemplate],
    ['numeric_distribution', numericDistributionTemplate],
    ['cross_column', crossColumnTemplate],
]);

export const resolveDiagnosticTemplate = (kind: string): DiagnosticTemplate | null =>
    TEMPLATES.get(kind) ?? null;
