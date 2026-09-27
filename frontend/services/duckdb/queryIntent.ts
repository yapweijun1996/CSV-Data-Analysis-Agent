/**
 * Intent-based query descriptions for the Unified SQL Harness Layer.
 *
 * Callers express what they want (intent), not how to get it (SQL).
 * The unified executor resolves intents to QueryPlans or raw SQL,
 * injects harness directives, and executes with graceful fallback.
 */

import type { QueryPlan } from '../../types';

// --- Diagnostic query kinds ---

export type DiagnosticQueryKind =
    | 'describe'              // Summary statistics for numeric columns (count, mean, std, min, Q1, median, Q3, max)
    | 'value_counts'          // Frequency distribution for a categorical column
    | 'outliers'              // IQR-based outlier detection for a numeric column
    | 'missing'               // Null/blank/zero rate profiling per column
    | 'categorical_topn'      // Top-N values for a categorical column (grouped count)
    | 'numeric_distribution'  // Min/max/avg/median/null/zero for a numeric column
    | 'concentration'         // Top-5 share + null rate for a categorical column
    | 'cross_column'          // Cross-column cardinality pairs (functional dependency detection)
    | 'temporal_dates'        // Distinct sorted dates for temporal profiling
    | 'description_totals';   // Grouped totals by description column (harness investigation)

// --- Query intent ---

export interface QueryIntentOptions {
    /** Query timeout in ms. Default depends on kind. */
    timeout?: number;
    /** Maximum result rows. Default depends on kind. */
    maxRows?: number;
    /** Skip directive injection (e.g. harness queries that run before directives exist). */
    skipDirectiveInjection?: boolean;
}

export interface QueryIntent {
    /** 'structured' = caller provides a QueryPlan; diagnostic kinds use templates; 'unpivot' for wide→long. */
    kind: DiagnosticQueryKind | 'structured' | 'unpivot';
    /** Human-readable purpose for tracing/logging. */
    purpose: string;
    /** For 'structured' kind: the full QueryPlan to execute. */
    plan?: QueryPlan;
    /** For 'unpivot' kind: the unpivot parameters. */
    unpivotParams?: UnpivotParams;
    /** For diagnostic kinds: template-specific parameters (e.g. { column, limit }). */
    params?: Record<string, unknown>;
    /** Execution options. */
    options?: QueryIntentOptions;
}

// --- Unpivot params ---

export interface UnpivotParams {
    /** Source columns to unpivot (e.g., ['2010-01', '2010-02', ..., '2010-12']). */
    sourceColumns: string[];
    /** Output column name for the unpivoted keys (e.g., 'Month'). */
    nameAs: string;
    /** Output column name for the unpivoted values (e.g., 'Sales'). */
    valueAs: string;
    /** Optional labels for each source column (e.g., ['Jan', 'Feb', ...]). Same order as sourceColumns. */
    labels?: string[];
    /** Optional WHERE filter on source columns (applied before unpivot). */
    where?: { column: string; equals: string };
    /** Optional aggregation on the value column (e.g., 'sum', 'avg'). Applied per unpivoted row. */
    aggregate?: 'sum' | 'avg' | 'min' | 'max' | 'count';
    /** Optional ORDER BY on the output (defaults to source column order). */
    orderBy?: 'source_order' | 'value_asc' | 'value_desc';
    /** Optional LIMIT on output rows. */
    limit?: number;
}

// --- Diagnostic template params (typed helpers) ---

export interface ValueCountsParams { column: string; limit?: number; }
export interface DescribeParams { columns: string[]; }
export interface OutliersParams { column: string; }
export interface MissingParams { columns?: string[]; }
export interface CategoricalTopNParams { column: string; limit?: number; }
export interface NumericDistributionParams { column: string; }
export interface ConcentrationParams { column: string; }
export interface CrossColumnParams { columns: string[]; }
export interface TemporalDatesParams { column: string; limit?: number; }
export interface DescriptionTotalsParams {
    descriptionColumn: string;
    valueColumn: string;
    rowClassColumn?: string;
    rowClassDetailValue?: string;
    limit?: number;
}
