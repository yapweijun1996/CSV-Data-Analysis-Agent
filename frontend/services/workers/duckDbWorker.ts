/// <reference lib="webworker" />

import * as duckdb from '@duckdb/duckdb-wasm';
import type { CsvRow, DataQueryResult, QueryOrderByClause } from '../../types';
import { toJsonCompatible } from '../../utils/serializable';
import { inferCompleteResultRowCount } from '../duckdb/queryResultCount';

type DuckDbWorkerTask = 'initDuckDb' | 'loadCleanDataset' | 'loadFileDataset' | 'executeCompiledQuery' | 'executeRawQuery' | 'disposeDuckDbSession' | 'ping';

type WorkerRequest = {
    id: number;
    task: DuckDbWorkerTask;
    payload?: any;
};

type WorkerResponse = {
    id: number;
    success: boolean;
    result?: any;
    error?: string;
};

const ctx: DedicatedWorkerGlobalScope = self as any;

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let currentLoadVersion: string | null = null;
let currentTableName: string | null = null;

// Serializes concurrent ensureConnection() calls so that only one CDN download
// and WASM instantiation runs at a time. The onmessage handler is async, meaning
// the worker's event loop can process multiple messages before the first
// initialization completes. Without this guard, each concurrent message that
// arrives while db === null would independently log "Resolving CDN bundles..."
// and start its own download, resulting in redundant work and confusing logs.
let ensureConnectionPromise: Promise<void> | null = null;

const tableToRows = (table: any): CsvRow[] => {
    // Prefer column-based extraction to avoid Apache Arrow's toJSON() type
    // inference, which silently converts VARCHAR date strings ("02-12-2010")
    // into numeric date representations (just the day number).
    if (table && typeof table.numRows === 'number' && typeof table.numCols === 'number' && table.numRows > 0 && table.schema) {
        try {
            const fields: Array<{ name: string }> = table.schema.fields ?? [];
            const rows: CsvRow[] = [];
            for (let r = 0; r < table.numRows; r++) {
                const row: CsvRow = {};
                for (let c = 0; c < table.numCols; c++) {
                    const col = table.getChildAt(c);
                    if (!col) continue;
                    let value = col.get(r);
                    // Arrow date/timestamp types → ISO date string
                    if (value instanceof Date) {
                        value = value.toISOString().split('T')[0];
                    }
                    // BigInt → Number
                    if (typeof value === 'bigint') {
                        const num = Number(value);
                        value = Number.isSafeInteger(num) ? num : value.toString();
                    }
                    row[fields[c]?.name ?? `col_${c}`] = value as import('../../types').CsvCellValue;
                }
                rows.push(row);
            }
            return rows;
        } catch {
            // Fall through to legacy toArray path
        }
    }
    // Legacy fallback: use toArray().toJSON() (may have Arrow type inference issues)
    if (!table || typeof table.toArray !== 'function') {
        return [];
    }
    return table.toArray().map((row: any) => {
        if (row && typeof row.toJSON === 'function') {
            return toJsonCompatible(row.toJSON()) as CsvRow;
        }
        return toJsonCompatible(row) as CsvRow;
    });
};

// Browsers block `new Worker(crossOriginUrl)`. Wrap the script
// in a same-origin blob that loads it via importScripts, which IS
// allowed inside classic workers.
const createProxyWorker = (scriptUrl: string): Worker => {
    const blob = new Blob(
        [`importScripts(${JSON.stringify(scriptUrl)});`],
        { type: 'application/javascript' },
    );
    const blobUrl = URL.createObjectURL(blob);
    return new Worker(blobUrl);
};

// Resolve the base URL for locally-hosted WASM files under public/duckdb/.
// In a Web Worker, self.location.href is the worker script URL — derive the
// app base by stripping everything after the last "/assets/" segment.
let resolvedAssetBaseUrl: string | null = null;
const resolveBaseUrl = (assetBaseUrl?: string): string => {
    if (resolvedAssetBaseUrl) return resolvedAssetBaseUrl;
    if (assetBaseUrl) {
        resolvedAssetBaseUrl = assetBaseUrl.replace(/\/$/, '');
        return resolvedAssetBaseUrl;
    }
    // Derive from worker location: /path/to/app/assets/worker.js → /path/to/app
    const workerHref = ctx.location?.href ?? '';
    const assetsIdx = workerHref.lastIndexOf('/assets/');
    resolvedAssetBaseUrl = assetsIdx >= 0 ? workerHref.slice(0, assetsIdx) : '';
    return resolvedAssetBaseUrl;
};

// Build local bundle paths pointing at public/duckdb/ served by the app.
const buildLocalBundles = (baseUrl: string): duckdb.DuckDBBundles => ({
    mvp: {
        mainModule: `${baseUrl}/duckdb/duckdb-mvp.wasm`,
        mainWorker: `${baseUrl}/duckdb/duckdb-browser-mvp.worker.js`,
    },
    eh: {
        mainModule: `${baseUrl}/duckdb/duckdb-eh.wasm`,
        mainWorker: `${baseUrl}/duckdb/duckdb-browser-eh.worker.js`,
    },
});

// Verify a local URL is reachable (HEAD request, same-origin).
const isUrlReachable = async (url: string): Promise<boolean> => {
    try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        return response.ok;
    } catch {
        return false;
    }
};

// Fetch a file as ArrayBuffer and re-wrap it in a Blob URL with the correct
// MIME type. This bypasses server MIME configuration entirely — even if the
// server returns .wasm as application/octet-stream, WebAssembly.compileStreaming
// will succeed because the Blob URL carries the correct Content-Type.
const fetchAsBlobUrl = async (url: string, mimeType: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: mimeType });
    return URL.createObjectURL(blob);
};

const doEnsureConnection = async (assetBaseUrl?: string) => {
    if (db && conn) {
        return;
    }
    if (!db) {
        const baseUrl = resolveBaseUrl(assetBaseUrl);
        const localBundles = buildLocalBundles(baseUrl);

        // Try local self-hosted WASM first, fall back to CDN
        let bundle: duckdb.DuckDBBundle;
        let source: 'local' | 'cdn';

        const localBundle = await duckdb.selectBundle(localBundles);
        const localReachable = localBundle.mainModule
            ? await isUrlReachable(localBundle.mainModule)
            : false;

        if (localReachable) {
            bundle = localBundle;
            source = 'local';
            console.log('[DuckDbWorker] Using local WASM from:', bundle.mainModule);
        } else {
            console.log('[DuckDbWorker] Local WASM not reachable, falling back to CDN...');
            const cdnBundles = duckdb.getJsDelivrBundles();
            bundle = await duckdb.selectBundle(cdnBundles);
            source = 'cdn';
            console.log('[DuckDbWorker] Using CDN WASM from:', bundle.mainModule);
        }

        // Re-wrap WASM and worker files as Blob URLs with correct MIME types.
        // This ensures WebAssembly.compileStreaming works even when the server
        // does not set Content-Type: application/wasm for .wasm files.
        const wasmBlobUrl = await fetchAsBlobUrl(bundle.mainModule, 'application/wasm');
        const workerBlobUrl = await fetchAsBlobUrl(bundle.mainWorker!, 'application/javascript');
        const pthreadBlobUrl = bundle.pthreadWorker
            ? await fetchAsBlobUrl(bundle.pthreadWorker, 'application/javascript')
            : undefined;

        const worker = createProxyWorker(workerBlobUrl);
        const logger = new duckdb.VoidLogger();
        db = new duckdb.AsyncDuckDB(logger, worker);
        console.log(`[DuckDbWorker] Instantiating DuckDB from ${source} WASM...`);
        await db.instantiate(wasmBlobUrl, pthreadBlobUrl);
        console.log(`[DuckDbWorker] DuckDB instantiated successfully (source: ${source}).`);
    }
    if (!conn) {
        conn = await db!.connect();
        console.log('[DuckDbWorker] DuckDB connection established.');
    }
};

const ensureConnection = (assetBaseUrl?: string): Promise<void> => {
    if (db && conn) {
        return Promise.resolve();
    }
    if (!ensureConnectionPromise) {
        ensureConnectionPromise = doEnsureConnection(assetBaseUrl).finally(() => {
            ensureConnectionPromise = null;
        });
    }
    return ensureConnectionPromise;
};

const handleInit = async (payload?: { assetBaseUrl?: string }) => {
    await ensureConnection(payload?.assetBaseUrl);
    return { initialized: true };
};

const handleLoadCleanDataset = async (payload: { csvText: string; csvFileName: string; loadVersion: string; tableName: string; }) => {
    await ensureConnection();
    if (currentLoadVersion === payload.loadVersion && currentTableName === payload.tableName) {
        return {
            loaded: false,
            loadVersion: currentLoadVersion,
            tableName: currentTableName,
        };
    }

    const loadStart = Date.now();

    const registerStart = Date.now();
    await db!.registerFileText(payload.csvFileName, payload.csvText);
    const registerMs = Date.now() - registerStart;

    const quotedTable = `"${payload.tableName.replace(/"/g, '""')}"`;
    const escapedFileName = payload.csvFileName.replace(/'/g, "''");

    const dropStart = Date.now();
    await conn!.query(`DROP TABLE IF EXISTS ${quotedTable}`);
    const dropMs = Date.now() - dropStart;

    // Force all columns to VARCHAR to prevent DuckDB auto-type-detection from
    // silently coercing alphanumeric values (e.g. "QQ102" → 102, "FF-87320-KK" → -87320).
    // The SQL query compiler already uses TRY_CAST(... AS DOUBLE) for numeric aggregation,
    // so all SUM/AVG/MIN/MAX operations remain correct on VARCHAR source columns.
    const createStart = Date.now();
    await conn!.query(
        `CREATE TABLE ${quotedTable} AS SELECT * FROM read_csv_auto('${escapedFileName}', header=true, all_varchar=true)`,
    );
    const createMs = Date.now() - createStart;

    const cleanupStart = Date.now();
    await db!.dropFile(payload.csvFileName);
    const cleanupMs = Date.now() - cleanupStart;

    const totalMs = Date.now() - loadStart;
    if (totalMs > 100) {
        console.warn(
            `[DuckDbWorker] ⚠ Slow loadCleanDataset: ${totalMs}ms total` +
            ` | register=${registerMs}ms, drop=${dropMs}ms, create=${createMs}ms, cleanup=${cleanupMs}ms` +
            ` | csvSize=${Math.round(payload.csvText.length / 1024)}KiB`,
        );
    }

    currentLoadVersion = payload.loadVersion;
    currentTableName = payload.tableName;
    return {
        loaded: true,
        loadVersion: currentLoadVersion,
        tableName: currentTableName,
    };
};

const handleLoadFileDataset = async (payload: {
    file: File;
    csvFileName: string;
    loadVersion: string;
    tableName: string;
    previewRows: number;
}) => {
    await ensureConnection();
    const quotedTable = `"${payload.tableName.replace(/"/g, '""')}"`;
    const previewLimit = Math.max(1, Math.min(payload.previewRows, 5000));
    if (currentLoadVersion === payload.loadVersion && currentTableName === payload.tableName) {
        const [countTable, previewTable] = await Promise.all([
            conn!.query(`SELECT COUNT(*) AS total FROM ${quotedTable}`),
            conn!.query(`SELECT * FROM ${quotedTable} LIMIT ${previewLimit}`),
        ]);
        return {
            loaded: false,
            loadVersion: currentLoadVersion,
            tableName: currentTableName,
            rowCount: Number(tableToRows(countTable)[0]?.total ?? 0),
            preview: tableToRows(previewTable),
        };
    }

    const escapedFileName = payload.csvFileName.replace(/'/g, "''");
    await db!.registerFileHandle(
        payload.csvFileName,
        payload.file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true,
    );
    try {
        await conn!.query(`DROP TABLE IF EXISTS ${quotedTable}`);
        await conn!.query(
            `CREATE TABLE ${quotedTable} AS SELECT * FROM read_csv_auto('${escapedFileName}', header=true, all_varchar=true)`,
        );
    } finally {
        await db!.dropFile(payload.csvFileName).catch(() => undefined);
    }

    const [countTable, previewTable] = await Promise.all([
        conn!.query(`SELECT COUNT(*) AS total FROM ${quotedTable}`),
        conn!.query(`SELECT * FROM ${quotedTable} LIMIT ${previewLimit}`),
    ]);
    const preview = tableToRows(previewTable);
    currentLoadVersion = payload.loadVersion;
    currentTableName = payload.tableName;
    return {
        loaded: true,
        loadVersion: currentLoadVersion,
        tableName: currentTableName,
        rowCount: Number(tableToRows(countTable)[0]?.total ?? 0),
        preview,
    };
};

const handleExecuteCompiledQuery = async (payload: {
    sql: string;
    countSql: string;
    selectedColumns: string[];
    appliedOrderBy: QueryOrderByClause[];
    appliedLimit: number;
}) => {
    await ensureConnection();
    const startedAt = Date.now();

    const mainQueryStart = Date.now();
    const resultTable = await conn!.query(payload.sql);
    const mainQueryMs = Date.now() - mainQueryStart;

    const rowConvertStart = Date.now();
    const rows = tableToRows(resultTable);
    const rowConvertMs = Date.now() - rowConvertStart;

    let countQueryMs = 0;
    let countConvertMs = 0;
    let totalMatchedRows = inferCompleteResultRowCount(rows.length, payload.appliedLimit);
    if (totalMatchedRows === null) {
        const countQueryStart = Date.now();
        const countTable = await conn!.query(payload.countSql);
        countQueryMs = Date.now() - countQueryStart;
        const countConvertStart = Date.now();
        const countRows = tableToRows(countTable);
        countConvertMs = Date.now() - countConvertStart;
        totalMatchedRows = Number(countRows[0]?.total ?? 0);
    }

    const totalMs = Date.now() - startedAt;
    if (totalMs > 50) {
        console.warn(
            `[DuckDbWorker] ⚠ Slow executeCompiledQuery: ${totalMs}ms total` +
            ` | mainQuery=${mainQueryMs}ms, rowConvert=${rowConvertMs}ms` +
            ` | countQuery=${countQueryMs}ms, countConvert=${countConvertMs}ms` +
            ` | rows=${rows.length}, cols=${payload.selectedColumns.length}`,
        );
    }

    const result: DataQueryResult = {
        rows,
        totalMatchedRows,
        returnedRows: rows.length,
        truncated: totalMatchedRows > rows.length,
        selectedColumns: payload.selectedColumns,
        appliedOrderBy: payload.appliedOrderBy,
        appliedLimit: payload.appliedLimit,
        durationMs: totalMs,
    };
    return result;
};

/** Read-only SQL guard — rejects anything that isn't a SELECT/WITH/VALUES. */
const assertReadOnlySql = (sql: string) => {
    const trimmed = sql.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''); // strip leading block comments
    const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase();
    const allowed = new Set(['SELECT', 'WITH', 'VALUES', 'EXPLAIN']);
    if (!firstWord || !allowed.has(firstWord)) {
        throw new Error(`Raw SQL must be read-only (SELECT/WITH). Got: ${firstWord ?? '(empty)'}`);
    }
};

/**
 * Auto-fix common VARCHAR aggregation errors in raw SQL.
 * CSV columns are often loaded as VARCHAR; wrap aggregate functions with TRY_CAST.
 */
const autoFixVarcharAggregates = (sql: string): string =>
    sql.replace(
        /\b(SUM|AVG|MIN|MAX)\s*\(\s*("(?:[^"\\]|"")*"|\w+)\s*\)/gi,
        (_, fn, col) => `${fn.toUpperCase()}(TRY_CAST(${col} AS DOUBLE))`,
    );

const handleExecuteRawQuery = async (payload: {
    sql: string;
    selectedColumns: string[];
    limit: number;
}) => {
    await ensureConnection();
    assertReadOnlySql(payload.sql);

    const startedAt = Date.now();
    let baseSql = payload.sql;
    const limitedSql = (sql: string) => payload.limit > 0
        ? `SELECT * FROM (${sql}) AS __raw LIMIT ${payload.limit}`
        : sql;

    let resultTable: Awaited<ReturnType<typeof conn extends null ? never : NonNullable<typeof conn>['query']>>;
    try {
        resultTable = await conn!.query(limitedSql(baseSql));
    } catch (firstError) {
        // Auto-retry with TRY_CAST for VARCHAR aggregation errors
        const errMsg = firstError instanceof Error ? firstError.message : String(firstError);
        if (/sum\(VARCHAR\)|avg\(VARCHAR\)|min\(VARCHAR\)|max\(VARCHAR\)/i.test(errMsg)) {
            console.log('[DuckDbWorker] Auto-fixing VARCHAR aggregate error with TRY_CAST retry.');
            baseSql = autoFixVarcharAggregates(baseSql);
            resultTable = await conn!.query(limitedSql(baseSql));
        } else {
            throw firstError;
        }
    }
    const rows = tableToRows(resultTable);
    const totalMs = Date.now() - startedAt;

    if (totalMs > 50) {
        console.warn(
            `[DuckDbWorker] ⚠ Slow executeRawQuery: ${totalMs}ms | rows=${rows.length}`,
        );
    }

    // Derive selected columns from result if not provided
    const selectedColumns = payload.selectedColumns.length > 0
        ? payload.selectedColumns
        : (rows.length > 0 ? Object.keys(rows[0]) : []);

    const result: DataQueryResult = {
        rows,
        totalMatchedRows: rows.length,
        returnedRows: rows.length,
        truncated: false,
        selectedColumns,
        appliedOrderBy: [],
        appliedLimit: payload.limit || rows.length,
        durationMs: totalMs,
    };
    return result;
};

const handleDispose = async () => {
    try {
        if (conn) {
            await conn.close();
        }
        if (db) {
            await db.terminate();
        }
    } finally {
        conn = null;
        db = null;
        ensureConnectionPromise = null;
        currentLoadVersion = null;
        currentTableName = null;
    }
    return { disposed: true };
};

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, task, payload } = event.data;
    const msgStart = Date.now();
    try {
        let result: unknown;
        switch (task) {
            case 'initDuckDb':
                result = await handleInit(payload);
                break;
            case 'loadCleanDataset':
                result = await handleLoadCleanDataset(payload);
                break;
            case 'loadFileDataset':
                result = await handleLoadFileDataset(payload);
                break;
            case 'executeCompiledQuery':
                result = await handleExecuteCompiledQuery(payload);
                break;
            case 'executeRawQuery':
                result = await handleExecuteRawQuery(payload);
                break;
            case 'disposeDuckDbSession':
                result = await handleDispose();
                break;
            case 'ping':
                result = { pong: true };
                break;
            default:
                throw new Error(`Unknown DuckDB worker task: ${task}`);
        }
        const taskMs = Date.now() - msgStart;
        if (taskMs > 100) {
            console.warn(`[DuckDbWorker] ⚠ Slow task '${task}': ${taskMs}ms (id=${id})`);
        }
        const response: WorkerResponse = { id, success: true, result };
        ctx.postMessage(response);
    } catch (error) {
        const taskMs = Date.now() - msgStart;
        console.warn(`[DuckDbWorker] ⚠ Failed task '${task}': ${taskMs}ms (id=${id})`, error);
        const response: WorkerResponse = {
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
        ctx.postMessage(response);
    }
};
