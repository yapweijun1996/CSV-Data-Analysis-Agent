/**
 * Unified SQL Query Executor — single entry point for all SQL queries.
 *
 * Wraps existing queryCompiler + queryEngine with:
 * 1. Directive injection (harness constraints auto-applied)
 * 2. Template resolution (diagnostic intents → SQL)
 * 3. Consistent execution with fallback chain
 *
 * Does NOT replace queryEngine or queryCompiler — wraps them.
 */

import type {
    AnalysisEngine,
    ColumnRegistry,
    ColumnProfile,
    CsvData,
    QueryPlan,
} from '../../types';
import type { QueryIntent, QueryIntentOptions } from './queryIntent';
import type { RuntimeDirectives, DirectiveInjectionContext, DirectiveInjectionResult } from './directiveInjector';
import { injectDirectivesIntoQueryPlan } from './directiveInjector';
import type { DimensionNormalizationConfig } from './dimensionNormalization';
import { executeManagedDataQuery } from './queryEngine';
import type { ManagedDataQueryExecutionOptions } from './queryEngine';
import { compileQueryPlanToDuckDbSql, compileUnpivotToDuckDbSql, type CompiledDuckDbQuery } from './queryCompiler';
import { duckDbWorkerClient } from '../workers/duckDbWorkerClient';
import type { DuckDbAnalysisBinding } from '../agent/runtime/investigationTypes';
import { resolveDiagnosticTemplate } from './diagnosticTemplates';

const LOG_PREFIX = '[UnifiedQuery]';
const DEFAULT_DIAGNOSTIC_TIMEOUT_MS = 8000;
const DEFAULT_DIAGNOSTIC_MAX_ROWS = 500;

// --- Types ---

export interface UnifiedQueryResult {
    rows: Record<string, unknown>[];
    selectedColumns: string[];
    totalMatchedRows: number;
    returnedRows: number;
    engine: AnalysisEngine;
    sqlPreview: string | null;
    durationMs: number;
    /** Directives that were auto-injected. Empty if none. */
    injectedDirectives: string[];
}

export interface UnifiedQueryOptions {
    /** DuckDB binding (table + version). Required for DuckDB execution. */
    binding?: DuckDbAnalysisBinding | null;
    /** Dataset for managed path with fallback. */
    dataset?: CsvData | null;
    /** Available column names for validation. */
    allowedColumns?: string[];
    /** Shared column registry for alias resolution and blocked-dimension enforcement. */
    columnRegistry?: ColumnRegistry | null;
    /** Column profiles for context. */
    columnProfiles?: ColumnProfile[];
    /** Runtime directives to auto-inject. */
    directives?: RuntimeDirectives | null;
    /** When true, skip detail-row filter (for summary-row topics). */
    isSummaryRowTopic?: boolean;
    /** Allow DuckDB → Arquero → JS fallback chain. Default: false. */
    allowFallback?: boolean;
    /** Abort signal. */
    abortSignal?: AbortSignal;
    /** Dimension normalization config for GROUP BY columns. */
    dimensionNormalization?: DimensionNormalizationConfig | null;
}

// --- Structured query execution (QueryPlan-based) ---

const executeStructuredQuery = async (
    plan: QueryPlan,
    options: UnifiedQueryOptions,
    intentOptions?: QueryIntentOptions,
): Promise<UnifiedQueryResult> => {
    const start = Date.now();
    let injectedDirectives: string[] = [];

    // Step 1: Inject directives
    let executablePlan = plan;
    let injectionResult: DirectiveInjectionResult | null = null;
    if (options.directives && !intentOptions?.skipDirectiveInjection) {
        const ctx: DirectiveInjectionContext = {
            directives: options.directives,
            availableColumns: options.allowedColumns,
            columnRegistry: options.columnRegistry ?? null,
            isSummaryRowTopic: options.isSummaryRowTopic,
            dimensionNormalization: options.dimensionNormalization ?? null,
        };
        injectionResult = injectDirectivesIntoQueryPlan(plan, ctx);
        if (injectionResult.validationError) {
            throw new Error(injectionResult.validationError);
        }
        executablePlan = injectionResult.plan;
        injectedDirectives = injectionResult.injected;
    }

    // Step 2: Execute via managed path (with fallback chain)
    if (options.dataset) {
        const managed = await executeManagedDataQuery(
            options.dataset,
            executablePlan,
            options.allowedColumns ?? [],
            {
                allowNativeFallback: options.allowFallback ?? false,
                abortSignal: options.abortSignal,
                columnRegistry: options.columnRegistry ?? null,
            },
        );
        return {
            rows: managed.result.rows,
            selectedColumns: managed.result.selectedColumns,
            totalMatchedRows: managed.result.totalMatchedRows ?? managed.result.rows.length,
            returnedRows: managed.result.rows.length,
            engine: managed.engine,
            sqlPreview: managed.sqlPreview,
            durationMs: Date.now() - start,
            injectedDirectives,
        };
    }

    // Step 3: DuckDB-only path (no dataset for fallback)
    if (!options.binding) {
        throw new Error('UnifiedQuery: either dataset or binding is required.');
    }
    const normalizationOverride = injectionResult?.compilationOverrides?.dimensionNormalization
        ?? options.dimensionNormalization
        ?? undefined;
    const compiled = compileQueryPlanToDuckDbSql(executablePlan, {
        allowedColumns: options.allowedColumns ?? [],
        tableName: options.binding.tableName,
        maxRows: intentOptions?.maxRows ?? DEFAULT_DIAGNOSTIC_MAX_ROWS,
        maxColumns: 50,
        maxOrderBy: 3,
        ...injectionResult?.compilationOverrides,
        ...(normalizationOverride ? { dimensionNormalization: normalizationOverride } : {}),
    });
    const result = await duckDbWorkerClient.executeCompiledQuery(
        compiled,
        intentOptions?.timeout ?? DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
    );
    return {
        rows: result.rows,
        selectedColumns: compiled.selectedColumns,
        totalMatchedRows: result.totalMatchedRows ?? result.rows.length,
        returnedRows: result.rows.length,
        engine: 'duckdb',
        sqlPreview: compiled.sql,
        durationMs: Date.now() - start,
        injectedDirectives,
    };
};

// --- Diagnostic query execution (template-based) ---

const executeDiagnosticQuery = async (
    intent: QueryIntent,
    options: UnifiedQueryOptions,
): Promise<UnifiedQueryResult> => {
    const start = Date.now();
    if (!options.binding) {
        throw new Error(`UnifiedQuery: binding is required for diagnostic query "${intent.kind}".`);
    }

    const template = resolveDiagnosticTemplate(intent.kind as Exclude<QueryIntent['kind'], 'structured'>);
    if (!template) {
        throw new Error(`UnifiedQuery: no template registered for kind "${intent.kind}".`);
    }

    const templateContext = {
        tableName: options.binding.tableName,
        allowedColumns: options.allowedColumns ?? [],
        columnProfiles: options.columnProfiles ?? [],
    };

    // Structured templates: build QueryPlan → inject directives → compile → execute
    if (template.toQueryPlan) {
        const plan = template.toQueryPlan(intent.params ?? {}, templateContext);

        // Inject directives for structured templates (unless skipped)
        let executablePlan = plan;
        let injectedDirectives: string[] = [];
        if (options.directives && !intent.options?.skipDirectiveInjection) {
            const ctx: DirectiveInjectionContext = {
                directives: options.directives,
                availableColumns: options.allowedColumns,
                columnRegistry: options.columnRegistry ?? null,
                isSummaryRowTopic: options.isSummaryRowTopic,
            };
            const injResult = injectDirectivesIntoQueryPlan(plan, ctx);
            if (injResult.validationError) {
                throw new Error(injResult.validationError);
            }
            executablePlan = injResult.plan;
            injectedDirectives = injResult.injected;
        }

        const compiled = compileQueryPlanToDuckDbSql(executablePlan, {
            allowedColumns: options.allowedColumns ?? [],
            tableName: options.binding.tableName,
            maxRows: intent.options?.maxRows ?? DEFAULT_DIAGNOSTIC_MAX_ROWS,
            maxColumns: 50,
            maxOrderBy: 3,
        });
        const result = await duckDbWorkerClient.executeCompiledQuery(
            compiled,
            intent.options?.timeout ?? DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
        );
        return {
            rows: result.rows,
            selectedColumns: compiled.selectedColumns,
            totalMatchedRows: result.totalMatchedRows ?? result.rows.length,
            returnedRows: result.rows.length,
            engine: 'duckdb',
            sqlPreview: compiled.sql,
            durationMs: Date.now() - start,
            injectedDirectives,
        };
    }

    // Raw SQL templates: compile directly → execute (no directive injection)
    if (template.toCompiledQuery) {
        const compiled = template.toCompiledQuery(intent.params ?? {}, templateContext);
        const result = await duckDbWorkerClient.executeCompiledQuery(
            compiled,
            intent.options?.timeout ?? DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
        );
        return {
            rows: result.rows,
            selectedColumns: compiled.selectedColumns,
            totalMatchedRows: result.totalMatchedRows ?? result.rows.length,
            returnedRows: result.rows.length,
            engine: 'duckdb',
            sqlPreview: compiled.sql,
            durationMs: Date.now() - start,
            injectedDirectives: [],
        };
    }

    throw new Error(`UnifiedQuery: template "${intent.kind}" has no builder.`);
};

// --- Unpivot query execution ---

const executeUnpivotQuery = async (
    intent: QueryIntent,
    options: UnifiedQueryOptions,
): Promise<UnifiedQueryResult> => {
    const start = Date.now();
    if (!intent.unpivotParams) {
        throw new Error('UnifiedQuery: "unpivotParams" is required for unpivot queries.');
    }
    if (!options.binding) {
        throw new Error('UnifiedQuery: binding is required for unpivot queries.');
    }

    // Inject detail-row filter into the unpivot WHERE if directives are available
    let augmentedParams = intent.unpivotParams;
    const injectedDirectives: string[] = [];
    if (options.directives && !intent.options?.skipDirectiveInjection) {
        const filter = options.directives.detailRowFilter;
        if (filter?.column && filter?.value && !augmentedParams.where) {
            augmentedParams = {
                ...augmentedParams,
                where: { column: filter.column, equals: filter.value },
            };
            injectedDirectives.push(`detail_row_filter: "${filter.column}" = "${filter.value}"`);
        }
    }

    const compiled = compileUnpivotToDuckDbSql(augmentedParams, {
        tableName: options.binding.tableName,
        allowedColumns: options.allowedColumns ?? [],
        maxRows: intent.options?.maxRows ?? DEFAULT_DIAGNOSTIC_MAX_ROWS,
    });

    const result = await duckDbWorkerClient.executeCompiledQuery(
        compiled,
        intent.options?.timeout ?? DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
    );

    return {
        rows: result.rows,
        selectedColumns: compiled.selectedColumns,
        totalMatchedRows: result.totalMatchedRows ?? result.rows.length,
        returnedRows: result.rows.length,
        engine: 'duckdb',
        sqlPreview: compiled.sql,
        durationMs: Date.now() - start,
        injectedDirectives,
    };
};

// --- Public API ---

/**
 * Execute a query intent through the unified SQL harness layer.
 *
 * For structured queries (QueryPlan-based):
 *   1. Injects harness directives (hierarchy exclusion, detail-row filter, topN)
 *   2. Compiles via queryCompiler
 *   3. Executes via queryEngine with fallback chain
 *
 * For diagnostic templates (intent-based):
 *   1. Resolves template → QueryPlan or raw SQL
 *   2. Injects directives (if structured template)
 *   3. Executes via DuckDB
 */
export const executeUnifiedQuery = async (
    intent: QueryIntent,
    options: UnifiedQueryOptions,
): Promise<UnifiedQueryResult> => {
    console.log(`${LOG_PREFIX} Executing: kind=${intent.kind}, purpose="${intent.purpose}"`);

    try {
        if (intent.kind === 'structured') {
            if (!intent.plan) {
                throw new Error('UnifiedQuery: "plan" is required for structured queries.');
            }
            return await executeStructuredQuery(intent.plan, options, intent.options);
        }
        if (intent.kind === 'unpivot') {
            return await executeUnpivotQuery(intent, options);
        }
        return await executeDiagnosticQuery(intent, options);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} Failed: kind=${intent.kind}, purpose="${intent.purpose}", error=${msg}`);
        throw error;
    }
};
