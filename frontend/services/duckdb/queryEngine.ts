import type { AnalysisEngine, ColumnRegistry, CsvData, DataQueryResult, DuckDbFallbackStage, QueryPlan } from '../../types';
import { shouldEnableDuckDbQueryEngine } from '../../config/runtimeConfig';
import { getCsvDatasetLoadVersion } from '../../utils/datasetId';
import { executeDataQuery } from '../agent/execution/dataOperationRunner';
import { executeArqueroQuery } from '../data/arqueroEngine';
import { isRuntimeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';
import { compileQueryPlanToDuckDbSql } from './queryCompiler';
import { normalizeQueryAggregateFunction } from '../agent/execution/dataQueryContract';
import type { DimensionNormalizationConfig } from './dimensionNormalization';
import { duckDbWorkerClient, DuckDbWorkerClient, exchangeDuckDbWorkerClient } from '../workers/duckDbWorkerClient';
import type { AcceptedSpillManifest } from '../data/acceptedSpill';
import type { DatasetCommitMarker } from '../../types/datasetCommit';
import type { CandidateOutput } from '../data/candidateContract';
import type { ValidationMetric } from '../data/candidateValidation';
import type { WorkerDiagnosticsReporter } from '../workers/workerDiagnostics';
import { collectOrderedColumnNames } from '../data/columnRegistry';
import { normalizeDecimalCommaColumns } from '../data/numberLocale';
import { resolveCompanionUnitColumn } from '../data/aggregationUnits';
import { DUCKDB_QUERY_TIMEOUT_MS, resolveDuckDbQueryTimeoutMs } from './queryTimeout';
import { validateSqlLimit, validateSqlText, SQL_POLICY_VERSION } from './sqlSecurity';

import { configureAcceptedQueryRetirement } from './acceptedQueryOwner';

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
    bypassCache?: boolean;
    abortSignal?: AbortSignal;
    reportDiagnostics?: WorkerDiagnosticsReporter;
    columnRegistry?: ColumnRegistry | null;
    /** Called once if the dataset load exceeds SLOW_LOAD_WARNING_MS (10s). */
    onSlowLoad?: () => void;
    /** Dimension normalization config for GROUP BY columns. */
    dimensionNormalization?: DimensionNormalizationConfig | null;
    /** Enable named companion inference only when the caller renders its provenance. */
    inferUnitColumn?: boolean;
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

const serializeRowsToCsv = (sourceRows: CsvData['data'], columns: string[]) => {
    // DuckDB casts cells one by one and cannot tell `4.567` (European thousands)
    // from a decimal. A column that proves the decimal comma is therefore
    // written as plain `4567` / `1234.56` text; US and text columns are untouched.
    const { rows } = normalizeDecimalCommaColumns(sourceRows, columns);
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
    // Arquero does not enforce row-unit guards; use the native guarded executor.
    if (plan.aggregates?.some(aggregate => aggregate?.unitColumn !== undefined)) {
        return getNativeResult(rows, plan, allowedColumns, fallback);
    }
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

let engineGeneration = 0;
let queryQueue: Promise<unknown> = Promise.resolve();
const assertGeneration = (generation: number) => {
    if (generation !== engineGeneration) {
        const error = new Error('The query engine session was replaced.');
        error.name = 'AbortError';
        throw error;
    }
};
const inEngineScope = <T>(operation: () => Promise<T>): Promise<T> => {
    const generation = engineGeneration;
    const next = queryQueue.then(async () => {
        assertGeneration(generation);
        const result = await operation();
        assertGeneration(generation);
        return result;
    });
    queryQueue = next.catch(() => undefined);
    return next;
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

const tryQueryCache = (loadVersion: string, sql: string): ManagedDataQueryExecution | null => {
    const cacheKey = `${SQL_POLICY_VERSION}::${engineGeneration}::${loadVersion}::${sql}`;
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
    const cacheKey = `${SQL_POLICY_VERSION}::${engineGeneration}::${loadVersion}::${sql}`;
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

const primeDuckDbDatasetUnlocked = async (
    data: CsvData | null,
    abortSignal?: AbortSignal,
    reportDiagnostics?: WorkerDiagnosticsReporter,
    onSlowLoad?: () => void,
    columnRegistry?: ColumnRegistry | null,
): Promise<DuckDbDatasetBinding> => {
    const generation = engineGeneration;
    assertGeneration(generation);
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
            assertGeneration(generation);
            throwIfAborted(abortSignal);
            const tInit = performance.now();
            await duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS, abortSignal, reportDiagnostics);
            console.log(`[Perf:DuckDB] initDuckDb (await): ${Math.round(performance.now() - tInit)}ms`);
            assertGeneration(generation);
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
            assertGeneration(generation);
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
            assertGeneration(generation);
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

const primeDuckDbFileDatasetUnlocked = async (
    file: File,
    loadVersion: string,
    options?: {
        previewRows?: number;
        assertCurrent?: () => void;
        abortSignal?: AbortSignal;
        reportDiagnostics?: WorkerDiagnosticsReporter;
    },
): Promise<{ binding: DuckDbDatasetBinding; rowCount: number; preview: CsvData['data'] }> => {
    const generation = engineGeneration;
    assertGeneration(generation);
    throwIfAborted(options?.abortSignal);
    const assertLoadedCurrent = () => {
        assertGeneration(generation);
        try { throwIfAborted(options?.abortSignal); options?.assertCurrent?.(); }
        catch (error) {
            // Inside the serial engine operation: never retire a later session/job.
            if (duckDbWorkerClient.retireDatasetIfOwned(loadVersion)) {
                clearCachedDuckDbBinding(); cachedSerializedPayload = null;
            }
            throw error;
        }
    };
    const loadFile = async () => {
        options?.assertCurrent?.();
        await duckDbWorkerClient.initDuckDb(
            DUCKDB_INIT_TIMEOUT_MS,
            options?.abortSignal,
            options?.reportDiagnostics,
        );
        assertGeneration(generation);
        throwIfAborted(options?.abortSignal);
        options?.assertCurrent?.();
        const loaded = await duckDbWorkerClient.loadFileDataset({
            file,
            csvFileName: `${loadVersion}.csv`,
            loadVersion,
            tableName: DUCKDB_TABLE_NAME,
            previewRows: options?.previewRows ?? 1000,
        }, DUCKDB_FILE_LOAD_TIMEOUT_MS, options?.abortSignal, options?.reportDiagnostics);
        assertLoadedCurrent();
        return loaded;
    };
    let result = await loadFile();
    assertLoadedCurrent();
    if (result.rowCount > 0 && result.preview.length === 0) {
        // A hot reload or same-file re-import can preserve the worker table
        // while resetting app state. Recover once instead of handing an empty
        // preview to report intake and falsely reporting "no body rows".
        assertLoadedCurrent();
        await duckDbWorkerClient.disposeDuckDbSession(DUCKDB_DISPOSE_TIMEOUT_MS, options?.reportDiagnostics);
        assertLoadedCurrent();
        result = await loadFile();
        assertLoadedCurrent();
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
    assertLoadedCurrent();
    cachedDuckDbBinding = binding;
    cachedDuckDbPrime = null;
    cachedSerializedPayload = null;
    queryResultCache.clear();
    return { binding, rowCount: result.rowCount, preview: result.preview };
};

/** Load accepted backing in isolation: failure cannot drop the currently accepted worker/table.
 * The returned switch is synchronous; publication may explicitly compensate before releasing old resources.
 */
export const prepareAcceptedSpillBinding = async(file:File,manifest:AcceptedSpillManifest,current:()=>void,signal?:AbortSignal)=>{
    const generation=engineGeneration,client=new DuckDbWorkerClient();
    const check=()=>{assertGeneration(generation);throwIfAborted(signal);current();};
    try{
        check();await client.initDuckDb(DUCKDB_INIT_TIMEOUT_MS,signal);check();
        const loadVersion=`accepted-${manifest.digest}`;
        const result=await client.loadFileDataset({file,csvFileName:`${loadVersion}.csv`,loadVersion,tableName:DUCKDB_TABLE_NAME,previewRows:20,
            exactColumns:manifest.meaning.columns.map(c=>({name:c.name,type:c.conversion==='decimal'?`DECIMAL(24,${c.scale})`:'VARCHAR'}))},DUCKDB_FILE_LOAD_TIMEOUT_MS,signal);check();
        if(result.rowCount!==manifest.rowCount||result.preview.some(row=>Object.keys(row).join('\u0000')!==manifest.meaning.columns.map(c=>c.name).join('\u0000')))throw new Error('accepted_worker_mismatch');
        const binding:DuckDbDatasetBinding={engine:'duckdb',tableName:DUCKDB_TABLE_NAME,loadVersion,fallbackReason:null,fallbackStage:null};
        return { binding, preview: result.preview, ...prepareWorkerSwitch(client, binding, check) };
    }catch(e){client.retireSession();throw e;}
};

/** Ordinary and spill publication share the same compensatable switch as dual routing.
 * Capture the old route at activation, never destroy it during preparation.
 */
const prepareWorkerSwitch = (client: DuckDbWorkerClient | null, binding: DuckDbDatasetBinding, check: () => void) => {
    let switched = false, finished = false, activationGeneration = -1;
    let previous: DuckDbWorkerClient;
    let priorTables: AcceptedTables | null, installed: AcceptedTables | null = null;
    let cached: { binding: typeof cachedDuckDbBinding; prime: typeof cachedDuckDbPrime; payload: typeof cachedSerializedPayload; queries: typeof queryResultCache };
    return {
        activate(data?: CsvData, currentOwner?: () => boolean, primaryTableId?: string) {
            check(); if (switched || finished) throw new Error('accepted_activation_invalid');
            cached = { binding: cachedDuckDbBinding, prime: cachedDuckDbPrime, payload: cachedSerializedPayload, queries: queryResultCache };
            priorTables = acceptedTables; previous = client ? exchangeDuckDbWorkerClient(client) : duckDbWorkerClient; switched = true;
            installed = data && currentOwner ? { primary: primaryTableId ?? '', tables: [], dual: false, current: currentOwner } : null;
            if (data && installed) acceptedOwners.set(data, installed);
            acceptedTables = installed; engineGeneration++; activationGeneration = engineGeneration; cachedDuckDbBinding = binding;
            cachedDuckDbPrime = null; cachedSerializedPayload = null; queryResultCache = new Map();
        },
        rollback() {
            if (finished) return;
            if (switched && engineGeneration === activationGeneration && (!client || duckDbWorkerClient === client) && acceptedTables === installed) {
                if (client) exchangeDuckDbWorkerClient(previous); acceptedTables = priorTables; engineGeneration++;
                cachedDuckDbBinding = cached.binding; cachedDuckDbPrime = cached.prime;
                cachedSerializedPayload = cached.payload; queryResultCache = cached.queries;
            }
            client?.retireSession(); finished = true;
        },
        finish() {
            if (!switched || finished) throw new Error('accepted_activation_invalid');
            if (client) previous.retireSession(); priorTables?.tables.forEach(t => t.client.retireSession()); finished = true;
        },
    };
};

/** Bounded ordinary accepted rows are loaded off to the side, with normal locale semantics. */
export const prepareOrdinaryDatasetBinding = async (data: CsvData, current: () => void, signal?: AbortSignal, bind?: typeof primeDuckDbDataset) => {
    const generation = engineGeneration;
    const check = () => { assertGeneration(generation); throwIfAborted(signal); current(); };
    // Qualification adapters own their workers. Production always prepares an isolated client.
    if (bind) {
        check(); const binding = await bind(data, signal); check();
        if (binding.engine !== 'duckdb' || !binding.tableName || !binding.loadVersion) throw new Error('committed_dataset_not_bound');
        return { binding, ...prepareWorkerSwitch(null, binding, check) };
    }
    const client = new DuckDbWorkerClient();
    try {
        check(); await client.initDuckDb(DUCKDB_INIT_TIMEOUT_MS, signal); check();
        const loadVersion = getCsvDatasetLoadVersion(data);
        await client.loadCleanDataset({ csvText: serializeRowsToCsv(data.data, getColumns(data.data)),
            csvFileName: `${loadVersion}.csv`, loadVersion, tableName: DUCKDB_TABLE_NAME }, DUCKDB_LOAD_TIMEOUT_MS, signal); check();
        const binding: DuckDbDatasetBinding = { engine: 'duckdb', tableName: DUCKDB_TABLE_NAME, loadVersion, fallbackReason: null, fallbackStage: null };
        return { binding, ...prepareWorkerSwitch(client, binding, check) };
    } catch (e) { client.retireSession(); throw e; }
};

type AcceptedTable = { client: DuckDbWorkerClient; tableId: string; columns: string[]; exact: Record<string, string>; metrics: readonly ValidationMetric[]; binding: DuckDbDatasetBinding };
type AcceptedTables = { primary: string; tables: AcceptedTable[]; dual: boolean; current: () => boolean };
const unitBindingKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
/** Fixed units without confirmed provenance cannot authorize period arithmetic. */
export const confirmedExactUnits = (columns: readonly {name:string;unit:string;provenance?:'confirmed'|'inferred'}[]) =>
    Object.fromEntries(columns.filter(column => column.provenance === undefined || column.provenance === 'confirmed').map(column => [column.name, column.unit]));
/** Validated row-unit bindings are host custody, not caller-controlled query hints. */
export const bindAcceptedMetricUnits = (plan: QueryPlan, metrics: readonly ValidationMetric[]): QueryPlan => ({
    ...plan,
    aggregates: plan.aggregates?.map(aggregate => {
        if (!['sum', 'avg'].includes(normalizeQueryAggregateFunction(aggregate.function) ?? '') || typeof aggregate.column !== 'string') return aggregate;
        const matches = metrics.filter(metric => unitBindingKey(metric.column) === unitBindingKey(aggregate.column!));
        const columns = [...new Set(matches.flatMap(metric => [metric.unitColumn, metric.currencyColumn])
            .filter((column): column is string => column !== undefined).map(unitBindingKey))];
        if (columns.length > 1 || columns.length > 0 && matches.some(metric => metric.provenance !== undefined && metric.provenance !== 'confirmed')
            || columns.length === 1 && aggregate.unitColumn !== undefined
            && unitBindingKey(aggregate.unitColumn) !== columns[0]) throw new Error('mixed_or_missing_units: Cannot calculate: units are missing or mixed. Group or filter by unit.');
        if (!columns.length) return aggregate;
        const column = matches.flatMap(metric => [metric.unitColumn, metric.currencyColumn]).find(value => value !== undefined)!;
        return {...aggregate, unitColumn: column};
    }),
});

/** Bind only a uniquely named physical companion to single-column aggregates. */
const bindNamedCompanionUnits = (plan: QueryPlan, columns: readonly string[], metrics: readonly ValidationMetric[] = []) => {
    if (plan.rawSql) return { plan, inferred: false };
    const companion = resolveCompanionUnitColumn(columns);
    if (!companion) return { plan, inferred: false };
    const schemaKeys = new Set(columns.map(unitBindingKey));
    let inferred = false;
    const aggregates = plan.aggregates?.map(aggregate => {
        if (!aggregate || aggregate.unitColumn !== undefined || typeof aggregate.column !== 'string'
            || !['sum', 'avg'].includes(normalizeQueryAggregateFunction(aggregate.function) ?? '')
            || !schemaKeys.has(unitBindingKey(aggregate.column))
            || metrics.some(metric => unitBindingKey(metric.column) === unitBindingKey(aggregate.column!))) return aggregate;
        inferred = true;
        return { ...aggregate, unitColumn: companion };
    });
    return { plan: inferred ? { ...plan, aggregates } : plan, inferred };
};
let acceptedTables: AcceptedTables | null = null;
// Non-serializable host custody. Copying CsvData/provider metadata cannot inherit workers.
const acceptedOwners = new WeakMap<CsvData, AcceptedTables>();
export const retireInactiveAcceptedTables = () => {
    const outgoing = acceptedTables;
    // Checking the epoch can itself retire registered session resources.
    if (outgoing && !outgoing.current() && acceptedTables === outgoing) {
        acceptedTables = null; engineGeneration++;
        clearCachedDuckDbBinding(); outgoing.tables.forEach(t => t.client.retireSession());
        if (!outgoing.dual) duckDbWorkerClient.retireSession();
    }
};
configureAcceptedQueryRetirement(retireInactiveAcceptedTables);
export const acceptedQueryTable = (data: CsvData, tableId?: string) => {
    const owner = acceptedOwners.get(data);
    if (owner && (owner !== acceptedTables || !owner.current())) throw new Error('accepted_table_unavailable');
    if (!owner || !owner.dual) {
        if (tableId && tableId !== owner?.primary) throw new Error('accepted_table_unavailable');
        return null;
    }
    const table = owner.tables.find(t => t.tableId === (tableId ?? owner.primary));
    if (!table) throw new Error('accepted_table_unavailable');
    return { tableId: table.tableId, columns: table.columns };
};
/** Each grain has its own native worker. No join or raw SQL crosses this boundary. */
export const prepareAcceptedTablesBinding = async (marker: DatasetCommitMarker, output: CandidateOutput, current: () => void, signal?: AbortSignal, files?: File[]) => {
    const generation = engineGeneration, tables: AcceptedTable[] = [];
    const check = () => { assertGeneration(generation); throwIfAborted(signal); current(); };
    try {
        for (const spec of marker.bundle.tables) {
            check(); const table = output.tables.find(t => t.name === spec.name)!;
            const streamed = marker.acceptedStreamedDual?.binding.streamedDual?.meaning.proposal.tables.find(t => t.name === spec.name);
            const metrics: ValidationMetric[] = streamed ? streamed.columns.filter(c => c.dataType === 'number').map(c => ({ column: c.name, scale: c.scale!, unit: c.unit!, toleranceMinor: 0 }))
                : marker.replayManifest!.validationBinding.contract.tables.find(t => t.name === spec.name)!.metrics;
            const client = new DuckDbWorkerClient();
            const binding: DuckDbDatasetBinding = { engine: 'duckdb', tableName: DUCKDB_TABLE_NAME,
                loadVersion: `${marker.commitId}-${spec.tableId}`, fallbackReason: null, fallbackStage: null };
            tables.push({ client, tableId: spec.tableId, columns: spec.schema.map(c => c.name), exact: confirmedExactUnits(metrics.map(m => ({name:m.column,unit:m.unit,provenance:m.provenance}))),
                metrics: structuredClone(metrics).map(m => ({...m,provenance:m.provenance??'confirmed',source:m.source??'user'})), binding });
            await client.initDuckDb(DUCKDB_INIT_TIMEOUT_MS, signal); check();
            // Quote all text, preserve null separately from empty strings and never normalize locales.
            const quote = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
            const file = files?.[tables.length - 1] ?? new File([spec.schema.map(c => quote(c.name)).join(',') + '\n' + table.rows.map(row => spec.schema.map(c => row[c.name] === null ? '' : quote(row[c.name])).join(',')).join('\n')], 'bounded.csv');
            if (streamed && !files?.[tables.length - 1]) throw new Error('accepted_dual_file_required');
            const result = await client.loadFileDataset({ file, csvFileName: 'bounded.csv',
                loadVersion: binding.loadVersion!, tableName: DUCKDB_TABLE_NAME, previewRows: 1,
                exactColumns: spec.schema.map(c => ({ name: c.name, nullable: c.nullable, type: metrics.some(m => m.column === c.name)
                    ? `DECIMAL(24,${metrics.find(m => m.column === c.name)!.scale})` : 'VARCHAR' })) }, DUCKDB_FILE_LOAD_TIMEOUT_MS, signal); check();
            if (result.rowCount !== spec.rowCount) throw new Error('accepted_worker_mismatch');
        }
        let switched = false, finished = false;
        let previous: AcceptedTables | null = null;
        let previousDefault: DuckDbWorkerClient;
        const installed: AcceptedTables = { primary: marker.bundle.primaryTableId, tables, dual: true, current: () => false };
        return { binding: tables.find(t => t.tableId === installed.primary)!.binding,
            activate(data: CsvData, currentOwner: () => boolean) {
                check(); if (switched || finished) throw new Error('accepted_activation_invalid');
                previous = acceptedTables; previousDefault = duckDbWorkerClient; installed.current = currentOwner;
                acceptedOwners.set(data, installed); acceptedTables = installed;
                engineGeneration++; queryResultCache.clear(); switched = true;
            },
            // Only the verified host publication may attach a legitimate clone. No serialized token exists.
            bind(data: CsvData) { if (acceptedTables !== installed || !installed.current()) throw new Error('accepted_table_unavailable'); acceptedOwners.set(data, installed); },
            rollback() { if (finished) return; if (switched && acceptedTables === installed) { acceptedTables = previous; engineGeneration++; } tables.forEach(t => t.client.retireSession()); finished = true; },
            finish() {
                if (!switched || finished) throw new Error('accepted_activation_invalid');
                previous?.tables.forEach(t => t.client.retireSession()); previousDefault.retireSession();
                if (acceptedTables === installed && duckDbWorkerClient === previousDefault) clearCachedDuckDbBinding();
                finished = true;
            },
            dispose() { if (acceptedTables === installed) { acceptedTables = null; engineGeneration++; } tables.forEach(t => t.client.retireSession()); },
        };
    } catch (e) { tables.forEach(t => t.client.retireSession()); throw e; }
};
export const disposeDuckDbQueryEngine = async () => {
    acceptedTables?.tables.forEach(t => t.client.retireSession()); acceptedTables = null;
    engineGeneration += 1;
    queryQueue = Promise.resolve();
    clearCachedDuckDbBinding();
    cachedSerializedPayload = null;
    if (typeof duckDbWorkerClient.retireSession === 'function') duckDbWorkerClient.retireSession();
    else await duckDbWorkerClient.disposeDuckDbSession(DUCKDB_DISPOSE_TIMEOUT_MS);
};

/** Diagnostic cleanup must not retire a later dataset binding. */
export const retireDuckDbQueryBinding = (binding: DuckDbDatasetBinding): Promise<void> => {
    if (binding.engine !== 'duckdb' || !binding.loadVersion || cachedDuckDbBinding?.loadVersion !== binding.loadVersion
        || cachedDuckDbBinding.tableName !== binding.tableName) return Promise.resolve();
    return disposeDuckDbQueryEngine();
};

const executeManagedDataQueryUnlocked = async (
    data: CsvData,
    plan: QueryPlan,
    allowedColumns: string[],
    options?: ManagedDataQueryExecutionOptions,
): Promise<ManagedDataQueryExecution> => {
    const generation = engineGeneration;
    const accepted = acceptedQueryTable(data, plan.tableId);
    if (accepted) {
        if (plan.rawSql || Object.hasOwn(plan, 'joins')) throw new Error('accepted_dual_joins_sql_unsupported');
        const table = acceptedOwners.get(data)!.tables.find(t => t.tableId === accepted.tableId)!;
        const acceptedPlan = bindAcceptedMetricUnits(plan, table.metrics);
        const bound = options?.inferUnitColumn
            ? bindNamedCompanionUnits(acceptedPlan, table.columns, table.metrics)
            : { plan: acceptedPlan, inferred: false };
        const compiled = compileQueryPlanToDuckDbSql(bound.plan, { allowedColumns: table.columns, tableName: DUCKDB_TABLE_NAME,
            exactDecimalColumns: table.metrics.map(m => m.column), exactDecimalUnits: table.exact,
            maxRows: DEFAULT_MAX_ROWS, maxColumns: DEFAULT_MAX_COLUMNS, maxOrderBy: DEFAULT_MAX_ORDER_BY });
        const result = await table.client.executeCompiledQuery({ ...compiled, expectedBinding: { tableName: DUCKDB_TABLE_NAME, loadVersion: table.binding.loadVersion! } }, DUCKDB_QUERY_TIMEOUT_MS, options?.abortSignal);
        assertGeneration(generation); throwIfAborted(options?.abortSignal);
        acceptedQueryTable(data, accepted.tableId);
        return { result: bound.inferred ? { ...result, unitInferred: true } : result, ...table.binding, sqlPreview: compiled.sql };
    }
    const allowNativeFallback = data.backing?.mode === 'duckdb_file'
        ? false
        : options?.allowNativeFallback ?? true;
    const abortSignal = options?.abortSignal;
    const reportDiagnostics = options?.reportDiagnostics;
    const columnRegistry = options?.columnRegistry ?? null;
    const onSlowLoad = options?.onSlowLoad;
    const schema = data.backing?.mode === 'duckdb_file'
        ? data.backing.columnNames ?? []
        : getColumns(data.data, columnRegistry);
    const bound = options?.inferUnitColumn ? bindNamedCompanionUnits(plan, schema) : { plan, inferred: false };
    const markInferred = (execution: ManagedDataQueryExecution): ManagedDataQueryExecution =>
        bound.inferred ? { ...execution, result: { ...execution.result, unitInferred: true } } : execution;
    assertGeneration(generation);
    throwIfAborted(abortSignal);
    if (!shouldEnableDuckDbQueryEngine()) {
        if (!allowNativeFallback) {
            throw new Error('duckdb_disabled');
        }
        return markInferred(getFallbackResult(data.data, bound.plan, allowedColumns, {
            reason: 'duckdb_disabled',
            stage: 'duckdb_disabled',
        }));
    }

    const loadVersion = getCsvDatasetLoadVersion(data);
    const compiled = compileQueryPlanToDuckDbSql(bound.plan, {
        exactDecimalColumns:data.backing?.ephemeral===false?data.backing.exactDecimalColumns?.map(c=>c.name):undefined,
        exactDecimalUnits:data.backing?.ephemeral===false&&data.backing.exactDecimalColumns
            ?confirmedExactUnits(data.backing.exactDecimalColumns):undefined,
        allowedColumns,
        tableName: DUCKDB_TABLE_NAME,
        maxRows: DEFAULT_MAX_ROWS,
        maxColumns: DEFAULT_MAX_COLUMNS,
        maxOrderBy: DEFAULT_MAX_ORDER_BY,
        ...(options?.dimensionNormalization ? { dimensionNormalization: options.dimensionNormalization } : {}),
    });
    assertGeneration(generation);
    throwIfAborted(abortSignal);

    // --- Query result cache lookup (AGENT-306) ---
    const hit = options?.bypassCache || compiled.unitGuardSql ? null : tryQueryCache(loadVersion, compiled.sql);
    if (hit) return hit;

    const prime = await primeDuckDbDatasetUnlocked(data, abortSignal, reportDiagnostics, onSlowLoad, columnRegistry);
    if (prime.engine !== 'duckdb') {
        if (!allowNativeFallback) {
            throw new Error(prime.fallbackReason ?? 'duckdb_unavailable');
        }
        const fallbackExecution = getFallbackResult(data.data, bound.plan, allowedColumns, {
            reason: prime.fallbackReason,
            stage: prime.fallbackStage,
        });
        return markInferred({
            ...fallbackExecution,
            sqlPreview: compiled.sql,
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: prime.fallbackReason,
            fallbackStage: prime.fallbackStage,
        });
    }

    try {
        assertGeneration(generation);
        throwIfAborted(abortSignal);
        const result = await duckDbWorkerClient.executeCompiledQuery({
            sql: compiled.sql,
            countSql: compiled.countSql,
            unitGuardSql: compiled.unitGuardSql,
            selectedColumns: compiled.selectedColumns,
            appliedOrderBy: compiled.appliedOrderBy,
            appliedLimit: compiled.appliedLimit,
            expectedBinding: {tableName: DUCKDB_TABLE_NAME, loadVersion},
        }, resolveDuckDbQueryTimeoutMs(data), abortSignal, reportDiagnostics);
        assertGeneration(generation);
        throwIfAborted(abortSignal);

        if (!compiled.unitGuardSql) storeQueryCache(loadVersion, compiled.sql, result);

        return markInferred({
            result,
            engine: 'duckdb',
            sqlPreview: compiled.sql,
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: null,
            fallbackStage: null,
        });
    } catch (error) {
        assertGeneration(generation);
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        if (error instanceof Error && error.message.startsWith('sql_')) throw error;
        if (error instanceof Error && error.message.startsWith('mixed_or_missing_units:')) throw error;
        clearCachedDuckDbBinding();
        if (!allowNativeFallback) {
            throw error instanceof Error ? error : new Error(String(error));
        }
        const fallbackExecution = getFallbackResult(data.data, bound.plan, allowedColumns, {
            reason: error instanceof Error ? error.message : String(error),
            stage: 'query_failed',
        });
        return markInferred({
            ...fallbackExecution,
            sqlPreview: compiled.sql,
            tableName: DUCKDB_TABLE_NAME,
            loadVersion,
            fallbackReason: error instanceof Error ? error.message : String(error),
            fallbackStage: 'query_failed',
        });
    }
};

/**
 * Execute a raw SQL query directly against DuckDB.
 * Used when the AI provides valid SQL that can't be expressed as a structured QueryPlan
 * (e.g., UNPIVOT, UNION ALL). The SQL must be read-only (enforced by the worker).
 */
const executeRawSqlQueryUnlocked = async (
    data: CsvData,
    rawSql: string,
    selectedColumns: string[],
    options?: {
        limit?: number;
        bypassCache?: boolean;
        abortSignal?: AbortSignal;
        reportDiagnostics?: WorkerDiagnosticsReporter;
        columnRegistry?: ColumnRegistry | null;
        onSlowLoad?: () => void;
    },
): Promise<ManagedDataQueryExecution> => {
    const generation = engineGeneration;
    const abortSignal = options?.abortSignal;
    const reportDiagnostics = options?.reportDiagnostics;
    const columnRegistry = options?.columnRegistry ?? null;
    if (acceptedQueryTable(data)) throw new Error('accepted_dual_joins_sql_unsupported');
    const limit = validateSqlLimit(options?.limit ?? DEFAULT_MAX_ROWS);
    validateSqlText(rawSql);

    assertGeneration(generation);

    throwIfAborted(abortSignal);
    if (!shouldEnableDuckDbQueryEngine()) {
        throw new Error('Raw SQL queries require DuckDB to be enabled.');
    }

    const loadVersion = getCsvDatasetLoadVersion(data);

    // --- Query result cache lookup (AGENT-306) ---
    const hit = options?.bypassCache ? null : tryQueryCache(loadVersion, `${rawSql}::${limit}::${selectedColumns.join(",")}`);
    if (hit) return { ...hit, sqlPreview: rawSql };

    const prime = await primeDuckDbDatasetUnlocked(data, abortSignal, reportDiagnostics, options?.onSlowLoad, columnRegistry);
    if (prime.engine !== 'duckdb') {
        throw new Error(prime.fallbackReason ?? 'DuckDB unavailable for raw SQL query.');
    }

    assertGeneration(generation);

    throwIfAborted(abortSignal);
    const result = await duckDbWorkerClient.executeRawQuery(
        { sql: rawSql, selectedColumns, limit, expectedBinding: {tableName: DUCKDB_TABLE_NAME, loadVersion} },
        resolveDuckDbQueryTimeoutMs(data),
        abortSignal,
        reportDiagnostics,
    );
    assertGeneration(generation);
    throwIfAborted(abortSignal);

    storeQueryCache(loadVersion, `${rawSql}::${limit}::${selectedColumns.join(",")}`, result);

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

export const primeDuckDbDataset = (...args: Parameters<typeof primeDuckDbDatasetUnlocked>) => inEngineScope(() => primeDuckDbDatasetUnlocked(...args));
export const primeDuckDbFileDataset = (...args: Parameters<typeof primeDuckDbFileDatasetUnlocked>) => inEngineScope(() => primeDuckDbFileDatasetUnlocked(...args));
export const executeManagedDataQuery = (...args: Parameters<typeof executeManagedDataQueryUnlocked>) => inEngineScope(async () => {
    const result = await executeManagedDataQueryUnlocked(...args);
    acceptedQueryTable(args[0], args[1].tableId); return result;
});
export const executeRawSqlQuery = (...args: Parameters<typeof executeRawSqlQueryUnlocked>) => inEngineScope(async () => {
    const result = await executeRawSqlQueryUnlocked(...args);
    acceptedQueryTable(args[0]); return result;
});

/** Keep dataset binding and specialized worker execution in the same resource lease. */
export const executeBoundDuckDbQuery = <T>(data: CsvData, execute: (binding: DuckDbDatasetBinding) => Promise<T>, signal?: AbortSignal): Promise<T> =>
    inEngineScope(async () => {
        const generation = engineGeneration;
        if (acceptedQueryTable(data)) throw new Error('accepted_dual_joins_sql_unsupported');
        const binding = await primeDuckDbDatasetUnlocked(data, signal);
        assertGeneration(generation);
        throwIfAborted(signal);
        if (binding.engine !== 'duckdb') throw new Error('This query requires DuckDB.');
        const result = await execute(binding);
        assertGeneration(generation);
        throwIfAborted(signal);
        acceptedQueryTable(data);
        return result;
    });
