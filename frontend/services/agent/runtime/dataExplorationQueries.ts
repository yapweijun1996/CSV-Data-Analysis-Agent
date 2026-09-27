/**
 * dataExplorationQueries.ts
 *
 * SQL-based data exploration that runs before hypothesis generation.
 * Produces a markdown summary of data distribution, cardinality,
 * cross-column relationships, row classification, and hierarchy hints.
 */

import type { ColumnProfile } from '../../../types';
import { duckDbWorkerClient } from '../../workers/duckDbWorkerClient';
import { emitSilentFailure } from '../monitoring/silentFailureTracker';
import type { SilentFailureContext, AnyStoreWithTelemetry } from '../monitoring/silentFailureTracker';
import { executeUnifiedQuery } from '../../duckdb/unifiedQueryExecutor';
import type { QueryIntent } from '../../duckdb/queryIntent';

/** Minimal store shape required to emit silent failure telemetry. */
type TelemetryStore = AnyStoreWithTelemetry;

/**
 * Categorizes a DuckDB error for structured telemetry.
 * Allows dashboards to bucket by failure mode.
 */
export type DuckDbErrorCategory = 'schema_error' | 'timeout' | 'memory' | 'unknown';

export const classifyDuckDbError = (error: unknown): DuckDbErrorCategory => {
    const msg = String(error).toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted') || msg.includes('abort')) {
        return 'timeout';
    }
    if (
        msg.includes('column') || msg.includes('table') || msg.includes('does not exist')
        || msg.includes('binder error') || msg.includes('parse error') || msg.includes('unknown column')
        || msg.includes('catalog error')
    ) {
        return 'schema_error';
    }
    if (msg.includes('out of memory') || msg.includes('oom') || msg.includes('memory limit')) {
        return 'memory';
    }
    return 'unknown';
};

interface DuckDbAnalysisBinding {
    tableName: string;
    loadVersion: string;
}

export const EXPLORATION_QUERY_TIMEOUT_MS = 8_000;

export const runExplorationQuery = (sql: string, selectedColumns: string[], timeout = 8000) =>
    duckDbWorkerClient.executeCompiledQuery({
        sql,
        countSql: 'SELECT 1 AS total',
        selectedColumns,
        appliedOrderBy: [],
        appliedLimit: 100,
    }, timeout);

export const classifyCardinality = (unique: number, total: number) => {
    if (unique <= 3) return 'binary/low — good for filter';
    if (unique <= 12) return 'low — good for groupBy + chart';
    if (unique <= 30) return 'moderate — groupBy ok, chart needs topN';
    if (unique <= 100) return 'high — table-first, fragmented for charts';
    return 'very high — avoid groupBy';
};

export const buildAndRunExplorationQueries = async (
    columns: ColumnProfile[],
    binding: DuckDbAnalysisBinding,
    store?: TelemetryStore,
): Promise<string | null> => {
    try {
        const t = binding.tableName;
        const lines: string[] = ['## Data Distribution Exploration'];

        const categoricalCols = columns
            .filter(col => col.type === 'categorical' && (col.uniqueValues ?? 0) >= 2 && (col.uniqueValues ?? 0) <= 200)
            .sort((a, b) => (a.uniqueValues ?? 0) - (b.uniqueValues ?? 0))
            .slice(0, 5);

        const numericCols = columns
            .filter(col => ['numerical', 'currency', 'percentage'].includes(col.type))
            .slice(0, 3);

        // --- Run all exploration queries in parallel via unified SQL harness ---
        const queryOpts = { binding, columnProfiles: columns, allowedColumns: columns.map(c => c.name) };

        const [categoricalResults, concentrationResults, numericResults] = await Promise.all([
            // 1. Categorical top-N values
            Promise.all(categoricalCols.map(col => {
                const intent: QueryIntent = { kind: 'categorical_topn', purpose: `Top values for ${col.name}`, params: { column: col.name, limit: 15 }, options: { timeout: EXPLORATION_QUERY_TIMEOUT_MS, skipDirectiveInjection: true } };
                return executeUnifiedQuery(intent, queryOpts).then(result => ({ col, result: { rows: result.rows } }));
            })),
            // 2. Categorical concentration (top-5 share + null rate)
            Promise.all(categoricalCols.map(col => {
                const intent: QueryIntent = { kind: 'concentration', purpose: `Concentration for ${col.name}`, params: { column: col.name }, options: { timeout: EXPLORATION_QUERY_TIMEOUT_MS, skipDirectiveInjection: true } };
                return executeUnifiedQuery(intent, queryOpts).then(result => ({ col, result: { rows: result.rows } }));
            })),
            // 3. Numeric distribution with median, nulls, zeros
            Promise.all(numericCols.map(col => {
                const intent: QueryIntent = { kind: 'numeric_distribution', purpose: `Distribution for ${col.name}`, params: { column: col.name }, options: { timeout: EXPLORATION_QUERY_TIMEOUT_MS, skipDirectiveInjection: true } };
                return executeUnifiedQuery(intent, queryOpts).then(result => ({ col, result: { rows: result.rows } }));
            })),
        ]);

        // --- Format categorical results ---
        for (let i = 0; i < categoricalCols.length; i++) {
            const { col, result } = categoricalResults[i];
            const conc = concentrationResults[i]?.result?.rows?.[0];
            if (result.rows.length > 0) {
                const topValues = result.rows
                    .slice(0, 10)
                    .map(row => `${row[col.name]} (N=${row['val_count']})`)
                    .join(', ');
                lines.push(`\n### ${col.name} (categorical — ${col.uniqueValues ?? '?'} unique values)`);
                lines.push(`Top values: ${topValues}`);
                if (conc) {
                    const total = Number(conc['total']) || 1;
                    const top5Share = Math.round((Number(conc['top5']) / total) * 100);
                    const nullRate = Math.round((Number(conc['nulls']) / total) * 100);
                    const hints: string[] = [`top 5 values hold ${top5Share}% of rows`];
                    if (nullRate > 0) hints.push(`null/blank rate ${nullRate}%`);
                    hints.push(classifyCardinality(Number(conc['uniq']), total));
                    lines.push(`Concentration: ${hints.join(', ')}`);
                }
            }
        }

        // --- Format numeric results with quality annotations ---
        for (const { col, result } of numericResults) {
            if (result.rows.length > 0) {
                const r = result.rows[0];
                const avg = Number(r['avg_val']);
                const median = Number(r['median_val']);
                const nonNull = Number(r['non_null']);
                const nullCount = Number(r['null_count']);
                const zeroCount = Number(r['zero_count']);
                const totalRows = Number(r['total_rows']) || 1;
                lines.push(`\n### ${col.name} (numeric)`);
                lines.push(`MIN=${r['min_val']}  MAX=${r['max_val']}  AVG=${avg.toFixed(2)}  MEDIAN=${median.toFixed(2)}  non-null=${nonNull}`);
                const annotations: string[] = [];
                if (avg !== 0 && median / avg < 0.3) annotations.push('heavily skewed');
                if (nullCount / totalRows > 0.2) annotations.push(`${Math.round(nullCount / totalRows * 100)}% nulls — consider WHERE filtering`);
                if (nonNull > 0 && zeroCount / nonNull > 0.5) annotations.push(`${Math.round(zeroCount / nonNull * 100)}% zeros — sparse metric`);
                if (annotations.length > 0) lines.push(`Quality: ${annotations.join(', ')}`);
            }
        }

        // --- Cardinality overview (compact summary for all categorical cols) ---
        const allCategoricalCols = columns
            .filter(col => col.type === 'categorical' && (col.uniqueValues ?? 0) >= 2)
            .slice(0, 8);
        if (allCategoricalCols.length > 0) {
            lines.push('\n### Cardinality Overview');
            const overview = allCategoricalCols
                .map(col => `${col.name}=${col.uniqueValues ?? '?'} unique (${classifyCardinality(col.uniqueValues ?? 0, 1000)})`)
                .join(', ');
            lines.push(overview);
        }

        // --- Cross-column relationship hints ---
        const relationCols = columns
            .filter(col => col.type === 'categorical' && (col.uniqueValues ?? 0) >= 2 && (col.uniqueValues ?? 0) <= 50)
            .slice(0, 6);
        if (relationCols.length >= 2) {
            try {
                const crossIntent: QueryIntent = {
                    kind: 'cross_column',
                    purpose: 'Cross-column relationship detection',
                    params: { columns: relationCols.map(c => c.name) },
                    options: { timeout: EXPLORATION_QUERY_TIMEOUT_MS, skipDirectiveInjection: true },
                };
                const crossResult = await executeUnifiedQuery(crossIntent, queryOpts);
                const relResult = { rows: crossResult.rows };
                const relationHints: string[] = [];
                for (const row of relResult.rows) {
                    const [a, b] = String(row['pair']).split('__');
                    const aUniq = Number(row['a_uniq']);
                    const bUniq = Number(row['b_uniq']);
                    const pairUniq = Number(row['pair_uniq']);
                    if (pairUniq === aUniq && aUniq < bUniq) {
                        relationHints.push(`${b} determines ${a} (1:1 — redundant to group by both)`);
                    } else if (pairUniq === bUniq && bUniq < aUniq) {
                        relationHints.push(`${a} determines ${b} (1:1 — redundant to group by both)`);
                    } else if (pairUniq === aUniq && pairUniq === bUniq) {
                        relationHints.push(`${a} ↔ ${b} are 1:1 mapped (use either, not both)`);
                    }
                }
                if (relationHints.length > 0) {
                    lines.push('\n### Column Relationships');
                    relationHints.forEach(h => lines.push(`- ${h}`));
                }
            } catch {
                // Cross-column query failed — skip silently
            }
        }

        // NOTE: RowClass distribution, hierarchy detection, and financial tree
        // inference are handled by the data investigation harness (dataInvestigationHarness.ts).
        // Exploration only provides distribution/cardinality/relationship data that
        // the harness does not cover.

        const body = lines.join('\n').trim();
        return body.length > 60 ? body : null;
    } catch (error) {
        const category = classifyDuckDbError(error);
        console.warn('[buildAndRunExplorationQueries] SQL exploration failed, skipping:', error);
        if (store) {
            emitSilentFailure(store, error, {
                component: 'DataExplorationQueries',
                recoveryAction: 'exploration_skipped',
                userNotified: false,
                detail: { category },
            } as SilentFailureContext & { detail: { category: DuckDbErrorCategory } });
        }
        return null;
    }
};
