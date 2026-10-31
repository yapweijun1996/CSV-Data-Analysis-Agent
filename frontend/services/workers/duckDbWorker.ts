/// <reference lib="webworker" />

import * as duckdb from '@duckdb/duckdb-wasm';
import type { CsvRow, DataQueryResult, QueryOrderByClause } from '../../types';
import { tableToRows } from './duckDbRows';
import { inferCompleteResultRowCount } from '../duckdb/queryResultCount';
import { buildNumericExpression } from '../duckdb/numericSql';
import { translateDuckDbQueryError } from '../duckdb/duckDbErrors';
import { admitSql, assertSqlBinding, assertSqlResult, configureSqlDefaults, lockSqlEngine, readOnlySql,
    validateSqlLimit, DUCKDB_WASM_SHA256, DUCKDB_WORKER_SHA256, type SqlBinding, type SqlSecurityProof } from '../duckdb/sqlSecurity';
import { sha256Bytes } from '../data/sourceDigest';

type DuckDbWorkerTask = 'initDuckDb' | 'loadCleanDataset' | 'loadFileDataset' | 'executeCompiledQuery' | 'executeRawQuery' | 'disposeDuckDbSession' | 'ping';

type WorkerRequest = {
    id: number;
    task: DuckDbWorkerTask;
    payload?: any;
    resourceGeneration: number;
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
let security: SqlSecurityProof | null = null;
let resourceGeneration: number | null = null;
const blobUrls = new Set<string>();
const releaseBlobUrls = () => {blobUrls.forEach(url => URL.revokeObjectURL(url)); blobUrls.clear();};
const sqlEngine = {query: (sql: string) => conn!.query(sql), tokenize: (sql: string) => db!.tokenize(sql),
    getTableNames: (sql: string) => conn!.getTableNames(sql)};
const currentBinding = (): SqlBinding | null => currentTableName && currentLoadVersion
    ? {tableName: currentTableName, loadVersion: currentLoadVersion} : null;

// Serializes concurrent ensureConnection() calls so that only one CDN download
// and WASM instantiation runs at a time. The onmessage handler is async, meaning
// the worker's event loop can process multiple messages before the first
// initialization completes. Without this guard, each concurrent message that
// arrives while db === null would independently log "Resolving CDN bundles..."
// and start its own download, resulting in redundant work and confusing logs.
let ensureConnectionPromise: Promise<void> | null = null;

// Browsers block `new Worker(crossOriginUrl)`. Wrap the script
// in a same-origin blob that loads it via importScripts, which IS
// allowed inside classic workers.
const createProxyWorker = (scriptUrl: string): Worker => {
    const blob = new Blob(
        [`importScripts(${JSON.stringify(scriptUrl)});`],
        { type: 'application/javascript' },
    );
    const blobUrl = URL.createObjectURL(blob);
    blobUrls.add(blobUrl);
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
const fetchAsBlobUrl = async (url: string, mimeType: string, expectedHash?: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (expectedHash && await sha256Bytes(new Uint8Array(buffer)) !== expectedHash) throw new Error('sql_wasm_integrity_failed');
    const blob = new Blob([buffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob); blobUrls.add(blobUrl); return blobUrl;
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
        const wasmHash = bundle.mainModule.includes('duckdb-eh.wasm') ? DUCKDB_WASM_SHA256.eh
            : bundle.mainModule.includes('duckdb-mvp.wasm') ? DUCKDB_WASM_SHA256.mvp : undefined;
        if (!wasmHash) throw new Error('sql_wasm_unavailable');
        const wasmBlobUrl = await fetchAsBlobUrl(bundle.mainModule, 'application/wasm', wasmHash);
        const workerHash = bundle.mainModule.includes('duckdb-eh.wasm') ? DUCKDB_WORKER_SHA256.eh : DUCKDB_WORKER_SHA256.mvp;
        const workerBlobUrl = await fetchAsBlobUrl(bundle.mainWorker!, 'application/javascript', workerHash);
        const pthreadBlobUrl = bundle.pthreadWorker
            ? await fetchAsBlobUrl(bundle.pthreadWorker, 'application/javascript')
            : undefined;

        const worker = createProxyWorker(workerBlobUrl);
        const logger = new duckdb.VoidLogger();
        db = new duckdb.AsyncDuckDB(logger, worker);
        console.log(`[DuckDbWorker] Instantiating DuckDB from ${source} WASM...`);
        try {await db.instantiate(wasmBlobUrl, pthreadBlobUrl);} finally {releaseBlobUrls();}
        await db.open({path: ':memory:', maximumThreads: 1, allowUnsignedExtensions: false});
        console.log(`[DuckDbWorker] DuckDB instantiated successfully (source: ${source}).`);
    }
    if (!conn) {
        conn = await db!.connect();
        await configureSqlDefaults(sqlEngine);
        console.log('[DuckDbWorker] DuckDB connection established.');
    }
};

const ensureConnection = (assetBaseUrl?: string): Promise<void> => {
    if (db && conn) {
        return Promise.resolve();
    }
    if (!ensureConnectionPromise) {
        ensureConnectionPromise = doEnsureConnection(assetBaseUrl).catch(async error => {
            // A failed fetch/instantiate must not retain an unlocked partial engine.
            await handleDispose().catch(() => undefined);
            throw error;
        }).finally(() => {
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
    if (security && (currentLoadVersion !== payload.loadVersion || currentTableName !== payload.tableName)) await handleDispose();
    await ensureConnection();
    if (security && currentLoadVersion === payload.loadVersion && currentTableName === payload.tableName) {
        return {
            loaded: false,
            loadVersion: currentLoadVersion,
            tableName: currentTableName,
            sqlSecurity: security,
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
    security = await lockSqlEngine(sqlEngine);
    return {
        loaded: true,
        loadVersion: currentLoadVersion,
        tableName: currentTableName,
        sqlSecurity: security,
    };
};

const handleLoadFileDataset = async (payload: {
    file: File;
    csvFileName: string;
    loadVersion: string;
    tableName: string;
    previewRows: number;
    exactColumns?: Array<{name:string; type:string; nullable?: boolean}>;
}) => {
    if (security && (currentLoadVersion !== payload.loadVersion || currentTableName !== payload.tableName)) await handleDispose();
    await ensureConnection();
    const quotedTable = `"${payload.tableName.replace(/"/g, '""')}"`;
    const previewLimit = Math.max(1, Math.min(payload.previewRows, 5000));
    if (security && currentLoadVersion === payload.loadVersion && currentTableName === payload.tableName) {
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
            sqlSecurity: security,
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
        let reader=`read_csv_auto('${escapedFileName}', header=true, all_varchar=true)`;
        if(payload.exactColumns){
            const columns=payload.exactColumns;
            if(!columns.length||columns.length>256||new Set(columns.map(c=>c.name)).size!==columns.length
                ||columns.some(c=>!c.name||! /^(VARCHAR|DECIMAL\(24,[0-6]\))$/.test(c.type)))throw new Error('accepted_schema_invalid');
            const literal=(s:string)=>`'${s.replace(/'/g,"''")}'`;
            reader=`read_csv('${escapedFileName}', header=true, auto_detect=false, delim=',', quote='"', escape='"', columns={${columns.map(c=>`${literal(c.name)}:${literal(c.type)}`).join(',')}}, force_not_null=[${columns.filter(c=>!c.nullable).map(c=>literal(c.name)).join(',')}]${columns.some(c=>c.nullable)?', allow_quoted_nulls=false':''})`;
        }
        await conn!.query(`CREATE TABLE ${quotedTable} AS SELECT * FROM ${reader}`);
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
    security = await lockSqlEngine(sqlEngine);
    return {
        loaded: true,
        loadVersion: currentLoadVersion,
        tableName: currentTableName,
        rowCount: Number(tableToRows(countTable)[0]?.total ?? 0),
        preview,
        sqlSecurity: security,
    };
};

const executeOwnedSql = async (expected: SqlBinding | undefined, execute: (boundary: NonNullable<DataQueryResult['executionBoundary']>) => Promise<DataQueryResult>) => {
    const binding = currentBinding();
    assertSqlBinding(expected, binding);
    if (!security) throw new Error('sql_capability_unavailable');
    const boundary = {...binding!, ...security, resourceGeneration: resourceGeneration!};
    try {
        return await readOnlySql(sqlEngine, () => execute(boundary));
    } catch (error) {
        throw translateDuckDbQueryError(error);
    }
};

const countRows = async (sql: string, tableName: string): Promise<number> => {
    const admitted = await admitSql(sqlEngine, sql, tableName);
    const count = tableToRows(await conn!.query(admitted));
    const value = Number(count[0]?.total);
    if (count.length !== 1 || !Number.isSafeInteger(value) || value < 0) throw new Error('sql_count_invalid');
    return value;
};

const handleExecuteCompiledQuery = async (payload: {
    sql: string; countSql: string; selectedColumns: string[]; appliedOrderBy: QueryOrderByClause[];
    appliedLimit: number; expectedBinding?: SqlBinding; unitGuardSql?: string;
}) => executeOwnedSql(payload.expectedBinding, async boundary => {
    const startedAt = Date.now(), limit = validateSqlLimit(payload.appliedLimit);
    if (payload.unitGuardSql && await countRows(payload.unitGuardSql, boundary.tableName) > 0) {
        throw new Error('mixed_or_missing_units: Cannot calculate: units are missing or mixed. Group or filter by unit.');
    }
    const sql = await admitSql(sqlEngine, payload.sql, boundary.tableName);
    // The host row ceiling also applies if a low-level caller omits LIMIT.
    const table = await conn!.query(`SELECT * FROM (${sql}\n) AS __bounded LIMIT ${limit + 1}`);
    const rows = tableToRows(table).slice(0, limit);
    assertSqlResult(table, rows);
    let totalMatchedRows = inferCompleteResultRowCount(rows.length, limit);
    if (totalMatchedRows === null) totalMatchedRows = await countRows(payload.countSql, boundary.tableName);
    if (totalMatchedRows < rows.length) throw new Error('sql_count_invalid');
    const selectedColumns = table.schema.fields.map(field => field.name);
    return {rows, totalMatchedRows, returnedRows: rows.length, truncated: totalMatchedRows > rows.length,
        selectedColumns, appliedOrderBy: payload.appliedOrderBy, appliedLimit: limit, durationMs: Date.now() - startedAt,
        executionBoundary: {...boundary, diagnostic: false}};
});

const autoFixVarcharAggregates = (sql: string): string =>
    sql.replace(/\b(SUM|AVG|MIN|MAX)\s*\(\s*("(?:[^"\\]|"")*"|\w+)\s*\)/gi,
        // The shared numeric expression reads 1.234,56 and 1'234.50 as numbers; a bare
        // TRY_CAST would turn every European cell into NULL.
        (_, fn, col: string) => `${fn.toUpperCase()}(${buildNumericExpression(col.startsWith('"') ? col.slice(1, -1).replace(/""/g, '"') : col)})`);

const handleExecuteRawQuery = async (payload: {sql: string; selectedColumns: string[]; limit: number; expectedBinding?: SqlBinding}, onStarted: () => void) =>
    executeOwnedSql(payload.expectedBinding, async boundary => {
        const startedAt = Date.now(), limit = validateSqlLimit(payload.limit);
        let sql = await admitSql(sqlEngine, payload.sql, boundary.tableName);
        const run = () => {onStarted(); return conn!.query(`SELECT * FROM (${sql}\n) AS __bounded LIMIT ${limit + 1}`);};
        let table: Awaited<ReturnType<typeof run>>;
        try {table = await run();}
        catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (!/sum\(VARCHAR\)|avg\(VARCHAR\)|min\(VARCHAR\)|max\(VARCHAR\)/i.test(message)) throw error;
            // Compatibility repair must pass the same admission and binding gate.
            sql = await admitSql(sqlEngine, autoFixVarcharAggregates(sql), boundary.tableName);
            table = await run();
        }
        const allRows = tableToRows(table), rows = allRows.slice(0, limit);
        assertSqlResult(table, rows);
        const totalMatchedRows = allRows.length > limit
            ? await countRows(`SELECT COUNT(*) AS total FROM (${sql}\n) AS __counted`, boundary.tableName) : rows.length;
        return {rows, totalMatchedRows, returnedRows: rows.length, truncated: totalMatchedRows > rows.length,
            selectedColumns: table.schema.fields.map(field => field.name), appliedOrderBy: [], appliedLimit: limit,
            durationMs: Date.now() - startedAt, executionBoundary: {...boundary, diagnostic: true}};
    });

const handleDispose = async () => {
    try {
        try {
            if (conn) await conn.close();
        } finally {
            if (db) await db.terminate();
        }
    } finally {
        conn = null;
        db = null;
        ensureConnectionPromise = null;
        currentLoadVersion = null;
        currentTableName = null;
        security = null;
        releaseBlobUrls();
    }
    return { disposed: true };
};

const handleMessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, task, payload } = event.data ?? {};
    const msgStart = Date.now();
    try {
        if (!Number.isSafeInteger(event.data.resourceGeneration) || event.data.resourceGeneration < 0) throw new Error('sql_resource_generation_invalid');
        resourceGeneration ??= event.data.resourceGeneration;
        if (resourceGeneration !== event.data.resourceGeneration) throw new Error('sql_resource_revoked');
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
                result = await handleExecuteRawQuery(payload, () => ctx.postMessage({id, progress: 'sql_started'}));
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
        const safeError = error instanceof Error ? error.message.split('\n')[0].replace(/'(?:[^']|'')*'/g, '[literal]').slice(0, 300) : 'sql_engine_failed';
        console.warn(`[DuckDbWorker] Failed task '${task}': ${taskMs}ms (id=${id})`);
        const response: WorkerResponse = {
            id,
            success: false,
            error: safeError,
        };
        ctx.postMessage(response);
    }
};

// Binding, host imports and read-only transactions share one queue. Ping remains
// responsive while the nested WASM worker executes a long native query.
let taskQueue: Promise<void> = Promise.resolve();
ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
    if (event.data?.task === 'ping') {void handleMessage(event); return;}
    taskQueue = taskQueue.then(() => handleMessage(event));
};
