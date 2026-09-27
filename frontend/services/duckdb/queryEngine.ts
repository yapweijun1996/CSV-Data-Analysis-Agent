import type { AnalysisEngine, ColumnRegistry, CsvData, DataQueryResult, DuckDbFallbackStage, QueryPlan } from '../../types';
import { shouldEnableDuckDbQueryEngine } from '../../config/runtimeConfig';
import { getCsvDatasetLoadVersion } from '../../utils/datasetId';
import { executeDataQuery } from '../agent/execution/dataOperationRunner';
import { executeArqueroQuery } from '../data/arqueroEngine';
import { isRuntimeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';
import { compileQueryPlanToDuckDbSql } from './queryCompiler';
import type { DimensionNormalizationConfig } from './dimensionNormalization';
import { duckDbWorkerClient } from '../workers/duckDbWorkerClient';
import type { WorkerDiagnosticsReporter } from '../workers/workerDiagnostics';
import { collectOrderedColumnNames } from '../data/columnRegistry';
import { DUCKDB_QUERY_TIMEOUT_MS, resolveDuckDbQueryTimeoutMs } from './queryTimeout';

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_COLUMNS = 50;
const DEFAULT_MAX_ORDER_BY = 3;
export const DUCKDB_INIT_TIMEOUT_MS = 45000;
export const DUCKDB_LOAD_TIMEOUT_MS = 45000;
export const DUCKDB_FILE_LOAD_TIMEOUT_MS = 180000;
export const DUCKDB_SLOW_LOAD_WARNING_MS = 10000;
export { DUCKDB_QUERY_TIMEOUT_MS } from './queryTimeout';
export const DUCKDB_DISPOSE_TIMEOUT_MS = 5000;
const DUCKDB_TABLE_NAME = 'session_clean_dataset';

export interface ManagedDataQueryExecution {
    result: DataQueryResult;
    engine: AnalysisEngine;
    sqlPreview: string | null;
    tableName: string | null;
    loadVersion: string | null;
    fallbackReason: string | null;
    fallbackStage: DuckDbFallbackStage | null;
}

export interface DuckDbDatasetBinding {
    engine: AnalysisEngine;
    tableName: string | null;
    loadVersion: string | null;
    fallbackReason: string | null;
    fallbackStage: DuckDbFallbackStage | null;
}

export interface ManagedDataQueryExecutionOptions {
    allowNativeFallback?: boolean;
    abortSignal?: AbortSignal;
    reportDiagnostics?: WorkerDiagnosticsReporter;
    columnRegistry?: ColumnRegistry | null;
    /** Called once if the dataset load exceeds SLOW_LOAD_WARNING_MS (10s). */
    onSlowLoad?: () => void;
    /** Dimension normalization config for GROUP BY columns. */
    dimensionNormalization?: DimensionNormalizationConfig | null;
}

type CachedDuckDbPrime = {
    loadVersion: string;
    promise: Promise<DuckDbDatasetBinding>;
};

const getColumns = (rows: CsvData['data'], columnRegistry?: ColumnRegistry | null): string[] =>
    columnRegistry?.columns?.map(entry => entry.physicalName) ?? collectOrderedColumnNames(rows);

const escapeCsvValue = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const serializeRowsToCsv = (rows: CsvData['data'], columns: string[]) => {
    const lines = [columns.map(escapeCsvValue).join(',')];
    rows.forEach(row => {
        lines.push(columns.map(column => escapeCsvValue(row[column] ?? '')).join(','));
    });
    return lines.join('\n');
};

const getNativeResult = (
    rows: CsvData['data'],
    plan: QueryPlan,
    allowedColumns: string[],
    fallback?: { reason?: string | null; stage?: DuckDbFallbackStage | null },
): ManagedDataQueryExecution => ({
    result: executeDataQuery(rows, plan, {
        allowedColumns,
        maxRows: DEFAULT_MAX_ROWS,
        maxColumns: DEFAULT_MAX_COLUMNS,
        maxOrderBy: DEFAULT_MAX_ORDER_BY,
    }),
    engine: 'native',
    sqlPreview: null,
    tableName: null,
    loadVersion: null,
    fallbackReason: fallback?.reason ?? null,
    fallbackStage: fallback?.stage ?? null,
});

/**
 * Try Arquero first, fall back to native JS engine if unsupported or failed.
 * This is the primary fallback path when DuckDB is unavailable.
 */
const getFallbackResult = (
    rows: CsvData['data'],
    plan: QueryPlan,
    allowedColumns: string[],
    fallback?: { reason?: string | null; stage?: DuckDbFallbackStage | null },
): ManagedDataQueryExecution => {
    try {
        const arqueroExecution = executeArqueroQuery(rows, plan, {
            allowedColumns,
            maxRows: DEFAULT_MAX_ROWS,
            maxColumns: DEFAULT_MAX_COLUMNS,
            maxOrderBy: DEFAULT_MAX_ORDER_BY,
        });
        if (arqueroExecution.supported) {
            console.log(`[Engine] Arquero fallback executed (${arqueroExecution.result.returnedRows} rows, ${arqueroExecution.result.durationMs}ms)`);
            return {
                result: arqueroExecution.result,
                engine: 'arquero',
                sqlPreview: null,
                tableName: null,
                loadVersion: null,
                fallbackReason: fallback?.reason ?? null,
                fallbackStage: fallback?.stage ? 'arquero_fallback' : null,
            };
        }
        console.log(`[Engine] Arquero unsupported: ${arqueroExecution.unsupportedReason}, falling back to native`);
    } catch (error) {
        console.warn('[Engine] Arquero execution failed, falling back to native:', error instanceof Error ? error.message : error);
    }
    return getNativeResult(rows, plan, allowedColumns, fallback);
};

let cachedDuckDbBinding: DuckDbDatasetBinding | null = null;
let cachedDuckDbPrime: CachedDuckDbPrime | null = null;
// Cache the last serialized CSV payload so re-prime after worker reset
// (timeout/crash) skips the expensive serialization when data hasn't changed.
let cachedSerializedPayload: { loadVersion: string; csvText: string; csvFileName: string } | null = null;

// --- Query result cache (AGENT-306) ---
const QUERY_CACHE_MAX_SIZE = 50;
interface CachedQueryEntry { result: DataQueryResult; timestamp: number }
let queryResultCache = new Map<string, CachedQueryEntry>();

const hashSql = (sql: string): string => {
    let hash = 0;
    for (let i = 0; i < sql.length; i++) {
        hash = (hash * 31 + sql.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
};

const tryQueryCache = (loadVersion: string, sql: string): ManagedDataQueryExecution | null => {
    const cacheKey = `${loadVersion}::${hashSql(sql)}`;
    const cached = queryResultCache.get(cacheKey);
    if (!cached) return null;
    console.log(`[Perf:DuckDB] Query cache: HIT (key: ${cacheKey.slice(0, 30)}…)`);
    return {
        result: cached.result,
        engine: 'duckdb',
        sqlPreview: sql,
        tableName: DUCKDB_TABLE_NAME,
        loadVersion,
        fallbackReason: null,
        fallbackStage: null,
    };
};

const storeQueryCache = (loadVersion: string, sql: string, result: DataQueryResult): void => {
    const cacheKey = `${loadVersion}::${hashSql(sql)}`;
    if (queryResultCache.size >= QUERY_CACHE_MAX_SIZE) {
        const oldestKey = queryResultCache.keys().next().value;
        if (oldestKey) queryResultCache.delete(oldestKey);
    }
    queryResultCache.set(cacheKey, { result, timestamp: Date.now() });
    console.log(`[Perf:DuckDB] Query cache: MISS → stored (size: ${queryResultCache.size})`);
};

const clearCachedDuckDbBinding = () => {
    cachedDuckDbBinding = null;
    cachedDuckDbPrime = null;
    queryResultCache.clear();
    // Intentionally keep cachedSerializedPayload — the serialized text is
    // still valid even when the binding is cleared (e.g. after worker reset).
};

export const primeDuckDbDataset = async (
    data: CsvData | null,
    abortSignal?: AbortSignal,
    reportDiagnostics?: WorkerDiagnosticsReporter,
    onSlowLoad?: () => void,
    columnRegistry?: ColumnRegistry | null,
): Promise<DuckDbDatasetBinding> => {
    throwIfAborted(abortSignal);
    if (!data || !shouldEnableDuckDbQueryEngine()) {
        clearCachedDuckDbBinding();
        return {
            engine: 'native' as const,
            tableName: null,
            loadVersion: null,
            fallbackReason: shouldEnableDuckDbQueryEngine() ? 'no_dataset' : 'duckdb_disabled',
            fallbackStage: shouldEnableDuckDbQueryEngine() ? 'no_dataset' : 'duckdb_disabled',
        };
    }

    const loadVersion = getCsvDatasetLoadVersion(data);
    if (cachedDuckDbBinding?.engine === 'duckdb' && cachedDuckDbBinding.loadVersion === loadVersion) {
        return cachedDuckDbBinding;
    }
    if (cachedDuckDbPrime?.loadVersion === loadVersion) {
        return cachedDuckDbPrime.promise;
    }
    if (cachedDuckDbBinding?.loadVersion !== loadVersion) {
        cachedDuckDbBinding = null;
    }
    if (data.backing?.mode === 'duckdb_file') {
        return {
            engine: 'native',
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: 'large_dataset_requires_reimport',
            fallbackStage: 'bind_failed',
        };
    }
    let csvText: string;
    let csvFileName: string;
    if (cachedSerializedPayload?.loadVersion === loadVersion) {
        csvText = cachedSerializedPayload.csvText;
        csvFileName = cachedSerializedPayload.csvFileName;
        console.log(`[Perf:DuckDB] CSV serialization: cache hit (version: ${loadVersion})`);
    } else {
        const serializeStart = performance.now();
        const columns = getColumns(data.data, columnRegistry);
        csvText = serializeRowsToCsv(data.data, columns);
        csvFileName = `${loadVersion}.csv`;
        cachedSerializedPayload = { loadVersion, csvText, csvFileName };
        console.log(`[Perf:DuckDB] CSV serialization: ${Math.round(performance.now() - serializeStart)}ms, ${(csvText.length / 1024).toFixed(0)}KB, ${data.data.length} rows`);
    }

    const primePromise = (async (): Promise<DuckDbDatasetBinding> => {
        const primeStart = performance.now();
        try {
            throwIfAborted(abortSignal);
            const tInit = performance.now();
            await duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS, abortSignal, reportDiagnostics);
            console.log(`[Perf:DuckDB] initDuckDb (await): ${Math.round(performance.now() - tInit)}ms`);
            throwIfAborted(abortSignal);
            let slowLoadTimer: ReturnType<typeof setTimeout> | undefined;
            if (onSlowLoad) {
                slowLoadTimer = setTimeout(onSlowLoad, DUCKDB_SLOW_LOAD_WARNING_MS);
            }
            try {
                const tLoad = performance.now();
                await duckDbWorkerClient.loadCleanDataset({
                    csvText,
                    csvFileName,
                    loadVersion,
                    tableName: DUCKDB_TABLE_NAME,
                }, DUCKDB_LOAD_TIMEOUT_MS, abortSignal, reportDiagnostics);
                console.log(`[Perf:DuckDB] loadCleanDataset (await): ${Math.round(performance.now() - tLoad)}ms`);
            } finally {
                clearTimeout(slowLoadTimer);
            }
            throwIfAborted(abortSignal);
            console.log(`[Perf:DuckDB] Prime completed: ${Math.round(performance.now() - primeStart)}ms (version: ${loadVersion})`);
            const binding: DuckDbDatasetBinding = {
                engine: 'duckdb',
                tableName: DUCKDB_TABLE_NAME,
                loadVersion,
                fallbackReason: null,
                fallbackStage: null,
            };
            cachedDuckDbBinding = binding;
            return binding;
        } catch (error) {
            if (isRuntimeAbortError(error, abortSignal)) {
                throw error;
            }
            if (cachedDuckDbBinding?.loadVersion === loadVersion) {
                cachedDuckDbBinding = null;
            }
            return {
                engine: 'native' as const,
                tableName: DUCKDB_TABLE_NAME,
                loadVersion,
                fallbackReason: error instanceof Error ? error.message : String(error),
                fallbackStage: 'bind_failed',
            };
        }
    })();
    cachedDuckDbPrime = { loadVersion, promise: primePromise };
    try {
        return await primePromise;
    } finally {
        if (cachedDuckDbPrime?.promise === primePromise) {
            cachedDuckDbPrime = null;
        }
    }
};

export const primeDuckDbFileDataset = async (
    file: File,
    loadVersion: string,
    options?: {
        previewRows?: number;
        abortSignal?: AbortSignal;
        reportDiagnostics?: WorkerDiagnosticsReporter;
    },
): Promise<{ binding: DuckDbDatasetBinding; rowCount: number; preview: CsvData['data'] }> => {
    throwIfAborted(options?.abortSignal);
    const loadFile = async () => {
        await duckDbWorkerClient.initDuckDb(
            DUCKDB_INIT_TIMEOUT_MS,
            options?.abortSignal,
            options?.reportDiagnostics,
        );
        return duckDbWorkerClient.loadFileDataset({
            file,
            csvFileName: `${loadVersion}.csv`,
            loadVersion,
            tableName: DUCKDB_TABLE_NAME,
            previewRows: options?.previewRows ?? 1000,
        }, DUCKDB_FILE_LOAD_TIMEOUT_MS, options?.abortSignal, options?.reportDiagnostics);
    };
    let result = await loadFile();
    if (result.rowCount > 0 && result.preview.length === 0) {
        // A hot reload or same-file re-import can preserve the worker table
        // while resetting app state. Recover once instead of handing an empty
        // preview to report intake and falsely reporting "no body rows".
        await duckDbWorkerClient.disposeDuckDbSession(DUCKDB_DISPOSE_TIMEOUT_MS, options?.reportDiagnostics);
        throwIfAborted(options?.abortSignal);
        result = await loadFile();
    }
    if (result.rowCount > 0 && result.preview.length === 0) {
        throw new Error('The large CSV loaded, but its preview rows could not be recovered. Re-import the file and try again.');
    }
    const binding: DuckDbDatasetBinding = {
        engine: 'duckdb',
        tableName: DUCKDB_TABLE_NAME,
        loadVersion,
        fallbackReason: null,
        fallbackStage: null,
    };
    cachedDuckDbBinding = binding;
    cachedDuckDbPrime = null;
    cachedSerializedPayload = null;
    queryResultCache.clear();
    return { binding, rowCount: result.rowCount, preview: result.preview };
};

export const disposeDuckDbQueryEngine = async () => {
    try {
        await duckDbWorkerClient.disposeDuckDbSession(DUCKDB_DISPOSE_TIMEOUT_MS);
    } catch {
        // Ignore disposal errors because the client will terminate the worker anyway.
    } finally {
        clearCachedDuckDbBinding();
        cachedSerializedPayload = null;
    }
};

export const executeManagedDataQuery = async (
    data: CsvData,
    plan: QueryPlan,
    allowedColumns: string[],
    options?: ManagedDataQueryExecutionOptions,
): Promise<ManagedDataQueryExecution> => {
    const allowNativeFallback = data.backing?.mode === 'duckdb_file'
        ? false
        : options?.allowNativeFallback ?? true;
    const abortSignal = options?.abortSignal;
    const reportDiagnostics = options?.reportDiagnostics;
    const columnRegistry = options?.columnRegistry ?? null;
    const onSlowLoad = options?.onSlowLoad;
    throwIfAborted(abortSignal);
    if (!shouldEnableDuckDbQueryEngine()) {
        if (!allowNativeFallback) {
            throw new Error('duckdb_disabled');
        }
        return getFallbackResult(data.data, plan, allowedColumns, {
            reason: 'duckdb_disabled',
            stage: 'duckdb_disabled',
        });
    }

    const loadVersion = getCsvDatasetLoadVersion(data);
    const compiled = compileQueryPlanToDuckDbSql(plan, {
        allowedColumns,
        tableName: DUCKDB_TABLE_NAME,
        maxRows: DEFAULT_MAX_ROWS,
        maxColumns: DEFAULT_MAX_COLUMNS,
        maxOrderBy: DEFAULT_MAX_ORDER_BY,
        ...(options?.dimensionNormalization ? { dimensionNormalization: options.dimensionNormalization } : {}),
    });
    throwIfAborted(abortSignal);

    // --- Query result cache lookup (AGENT-306) ---
    const hit = tryQueryCache(loadVersion, compiled.sql);
    if (hit) return hit;

    const prime = await primeDuckDbDataset(data, abortSignal, reportDiagnostics, onSlowLoad, columnRegistry);
    if (prime.engine !== 'duckdb') {
        if (!allowNativeFallback) {
            throw new Error(prime.fallbackReason ?? 'duckdb_unavailable');
        }
        const fallbackExecution = getFallbackResult(data.data, plan, allowedColumns, {
            reason: prime.fallbackReason,
            stage: prime.fallbackStage,
        });
        return {
            ...fallbackExecution,
            sqlPreview: compiled.sql,
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: prime.fallbackReason,
            fallbackStage: prime.fallbackStage,
        };
    }

    try {
        throwIfAborted(abortSignal);
        const result = await duckDbWorkerClient.executeCompiledQuery({
            sql: compiled.sql,
            countSql: compiled.countSql,
            selectedColumns: compiled.selectedColumns,
            appliedOrderBy: compiled.appliedOrderBy,
            appliedLimit: compiled.appliedLimit,
        }, resolveDuckDbQueryTimeoutMs(data), abortSignal, reportDiagnostics);
        throwIfAborted(abortSignal);

        storeQueryCache(loadVersion, compiled.sql, result);

        return {
            result,
            engine: 'duckdb',
            sqlPreview: compiled.sql,
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: null,
            fallbackStage: null,
        };
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        clearCachedDuckDbBinding();
        if (!allowNativeFallback) {
            throw error instanceof Error ? error : new Error(String(error));
        }
        const fallbackExecution = getFallbackResult(data.data, plan, allowedColumns, {
            reason: error instanceof Error ? error.message : String(error),
            stage: 'query_failed',
        });
        return {
            ...fallbackExecution,
            sqlPreview: compiled.sql,
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: error instanceof Error ? error.message : String(error),
            fallbackStage: 'query_failed',
        };
    }
};

/**
 * Execute a raw SQL query directly against DuckDB.
 * Used when the AI provides valid SQL that can't be expressed as a structured QueryPlan
 * (e.g., UNPIVOT, UNION ALL). The SQL must be read-only (enforced by the worker).
 */
export const executeRawSqlQuery = async (
    data: CsvData,
    rawSql: string,
    selectedColumns: string[],
    options?: {
        limit?: number;
        abortSignal?: AbortSignal;
        reportDiagnostics?: WorkerDiagnosticsReporter;
        columnRegistry?: ColumnRegistry | null;
        onSlowLoad?: () => void;
    },
): Promise<ManagedDataQueryExecution> => {
    const abortSignal = options?.abortSignal;
    const reportDiagnostics = options?.reportDiagnostics;
    const columnRegistry = options?.columnRegistry ?? null;
    const limit = options?.limit ?? DEFAULT_MAX_ROWS;

    throwIfAborted(abortSignal);
    if (!shouldEnableDuckDbQueryEngine()) {
        throw new Error('Raw SQL queries require DuckDB to be enabled.');
    }

    const loadVersion = getCsvDatasetLoadVersion(data);

    // --- Query result cache lookup (AGENT-306) ---
    const hit = tryQueryCache(loadVersion, rawSql);
    if (hit) return hit;

    const prime = await primeDuckDbDataset(data, abortSignal, reportDiagnostics, options?.onSlowLoad, columnRegistry);
    if (prime.engine !== 'duckdb') {
        throw new Error(prime.fallbackReason ?? 'DuckDB unavailable for raw SQL query.');
    }

    throwIfAborted(abortSignal);
    const result = await duckDbWorkerClient.executeRawQuery(
        { sql: rawSql, selectedColumns, limit },
        resolveDuckDbQueryTimeoutMs(data),
        abortSignal,
        reportDiagnostics,
    );
    throwIfAborted(abortSignal);

    storeQueryCache(loadVersion, rawSql, result);

    return {
        result,
        engine: 'duckdb',
        sqlPreview: rawSql,
        tableName: DUCKDB_TABLE_NAME,
        loadVersion,
        fallbackReason: null,
        fallbackStage: null,
    };
};

// --- Query cache diagnostics (AGENT-306) ---
export const getQueryCacheStats = () => ({
    size: queryResultCache.size,
    maxSize: QUERY_CACHE_MAX_SIZE,
});

/** Exposed for testing only. */
export const _testClearQueryCache = () => { queryResultCache.clear(); };
