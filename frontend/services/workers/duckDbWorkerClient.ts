import type { CsvRow, DataQueryResult, QueryOrderByClause } from '../../types';
import { normalizeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';
import {
    buildWorkerDiagnosticsEntry,
    estimateSerializableBytes,
    getNowMs,
    reportWorkerDiagnostics,
    type WorkerDiagnosticsReporter,
} from './workerDiagnostics';
import { createDuckDbWorker } from './duckDbWorkerFactory';
import { WorkerHealthMonitor, HEALTH_PING_TIMEOUT_MS } from './workerHealthMonitor';
import { assertSqlBinding, sqlTimeout, validateSqlLimit, validateSqlText, type SqlBinding } from '../duckdb/sqlSecurity';

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

/**
 * Validates the structural shape of a raw DuckDB worker response message before
 * it is routed to a callback. Returns a human-readable error string if the
 * response is malformed, or null if it looks valid.
 *
 * Mirrors the equivalent function in dataWorkerClient.ts — prevents silently
 * corrupting caller state when a worker bug produces a structurally invalid response.
 */
export function validateDuckDbWorkerResponse(data: unknown): string | null {
    if (data === null || typeof data !== 'object') {
        return 'DuckDB worker response is not an object.';
    }
    const r = data as Record<string, unknown>;
    if (typeof r.id !== 'number' || !Number.isFinite(r.id)) {
        return 'DuckDB worker response is missing a valid numeric "id" field.';
    }
    if (typeof r.success !== 'boolean') {
        return 'DuckDB worker response is missing the boolean "success" field.';
    }
    if (r.success === true && r.result == null) {
        return `DuckDB worker response reports success but "result" is ${r.result === null ? 'null' : 'undefined'}.`;
    }
    return null;
}

export class DuckDbWorkerClient {
    constructor(private readonly onSqlStarted?: () => void) {}
    private worker: Worker | null = null;
    private generation = 0;

    retireSession() {
        this.generation += 1;
        this.lastLoad = null;
        this.restorePromise = null;
        this.needsRestore = false;
        this.resetWorker(normalizeAbortError('The DuckDB session was replaced.'), 'abort');
    }

    /** Synchronous ownership check: stale import cleanup must not abort a newer job. */
    retireDatasetIfOwned(loadVersion: string): boolean {
        if (this.lastLoad?.payload.loadVersion !== loadVersion || this.callbacks.size > 0) return false;
        this.retireSession();
        return true;
    }

    private assertGeneration(generation: number) {
        if (generation !== this.generation) throw normalizeAbortError('The DuckDB session was replaced.');
    }
    private initPromise: Promise<any> | null = null;
    /** True once the WASM engine has been successfully instantiated in the worker. */
    private initCompleted = false;
    private callbacks = new Map<number, {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
        timeoutId?: ReturnType<typeof setTimeout>;
        abortCleanup?: () => void;
        task: DuckDbWorkerTask;
        requestId: number;
        startedAt: number;
        payload: unknown;
        payloadBytes: number;
        reportDiagnostics?: WorkerDiagnosticsReporter;
    }>();
    private requestId = 0;
    private healthMonitor: WorkerHealthMonitor | null = null;
    // A timeout, abort or crash terminates the worker (the only way to stop a runaway query) and
    // with it the in-memory table. Remember the last successful load so the next query can restore it.
    private lastLoad:
        | { kind: 'clean'; payload: Parameters<DuckDbWorkerClient['loadCleanDataset']>[0] }
        | { kind: 'file'; payload: Parameters<DuckDbWorkerClient['loadFileDataset']>[0] }
        | null = null;
    private needsRestore = false;
    private restorePromise: Promise<void> | null = null;

    private ping(): Promise<unknown> {
        return this.call('ping', undefined, { timeoutMs: HEALTH_PING_TIMEOUT_MS });
    }

    private resetWorker(error: Error, phase: 'error' | 'abort' | 'timeout' = 'error') {
        this.healthMonitor?.stop();
        this.healthMonitor = null;
        this.callbacks.forEach(callback => {
            if (callback.timeoutId) {
                clearTimeout(callback.timeoutId);
            }
            callback.abortCleanup?.();
            reportWorkerDiagnostics(callback.reportDiagnostics, buildWorkerDiagnosticsEntry({
                workerFamily: 'duckdb',
                task: callback.task,
                phase,
                requestId: callback.requestId,
                payloadBytes: callback.payloadBytes,
                payload: callback.payload,
                result: { error: error.message },
                roundTripMs: getNowMs() - callback.startedAt,
                handlerMs: 0,
                errorMessage: error.message,
            }));
            callback.reject(error);
        });
        this.callbacks.clear();
        this.worker?.terminate();
        this.worker = null;
        this.initPromise = null;
        this.initCompleted = false;
        if (this.lastLoad) this.needsRestore = true;
    }

    /** Re-creates the worker and reloads the dataset that a worker reset discarded. */
    private restoreDatasetIfNeeded(abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter): Promise<void> {
        if (!this.needsRestore || !this.lastLoad) return Promise.resolve();
        if (!this.restorePromise) {
            const generation = this.generation;
            const load = this.lastLoad;
            const restore = (async () => {
                await this.initDuckDb(45_000, abortSignal, reportDiagnostics);
                this.assertGeneration(generation);
                if (load.kind === 'file') {
                    await this.call('loadFileDataset', load.payload, { timeoutMs: 180_000, abortSignal, reportDiagnostics });
                } else {
                    await this.call('loadCleanDataset', load.payload, { timeoutMs: 45_000, abortSignal, reportDiagnostics });
                }
                // A newer load or a dispose during the restore supersedes it.
                this.assertGeneration(generation);
                if (this.lastLoad === load) this.needsRestore = false;
                console.warn(`[DuckDbWorker] Restored table "${load.payload.tableName}" after a worker reset.`);
            })().finally(() => {
                if (this.restorePromise === restore) this.restorePromise = null;
            });
            this.restorePromise = restore;
        }
        return this.restorePromise;
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        const worker = createDuckDbWorker();
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            if (this.worker !== worker) return;
            const handlerStartedAt = getNowMs();
            const data = event.data;
            const progress = data as unknown as {id?: number; progress?: string};
            if (progress?.progress === 'sql_started') {
                const pending = typeof progress.id === 'number' ? this.callbacks.get(progress.id) : undefined;
                if (pending && ['executeRawQuery', 'executeCompiledQuery'].includes(pending.task)) {
                    try {this.onSqlStarted?.();} catch { /* Observers cannot change execution ownership. */ }
                }
                return;
            }

            // Validate response shape before routing to any callback.
            // Malformed messages must reject (not silently corrupt caller state).
            const shapeError = validateDuckDbWorkerResponse(data);
            if (shapeError) {
                const maybeId = typeof (data as Record<string, unknown>)?.id === 'number'
                    ? (data as Record<string, unknown>).id as number
                    : null;
                const staleCallback = maybeId !== null ? this.callbacks.get(maybeId) : null;
                if (staleCallback) {
                    this.callbacks.delete(maybeId!);
                    if (staleCallback.timeoutId) clearTimeout(staleCallback.timeoutId);
                    staleCallback.abortCleanup?.();
                    const err = new Error(`DuckDB worker task "${staleCallback.task}" returned a malformed response: ${shapeError}`);
                    console.error('[DuckDbWorker] Malformed response:', shapeError, data);
                    staleCallback.reject(err);
                } else {
                    console.error('[DuckDbWorker] Malformed response with no routable callback:', shapeError, data);
                }
                return;
            }

            const callback = this.callbacks.get(data.id);
            if (!callback) return;
            this.callbacks.delete(data.id);
            if (callback.timeoutId) {
                clearTimeout(callback.timeoutId);
            }
            callback.abortCleanup?.();
            if (data.success) {
                callback.resolve(data.result);
            } else {
                callback.reject(new Error(data.error || 'DuckDB worker task failed.'));
            }
            // Defer diagnostics reporting off the critical path so it doesn't
            // block the onmessage handler (was ~77ms due to telemetry overhead).
            const capturedRoundTripMs = getNowMs() - callback.startedAt;
            const capturedHandlerMs = getNowMs() - handlerStartedAt;
            const capturedTask = callback.task;
            const capturedRequestId = callback.requestId;
            const capturedPayloadBytes = callback.payloadBytes;
            const capturedPayload = callback.payload;
            const capturedResult = data.success ? data.result : { error: data.error || 'DuckDB worker task failed.' };
            const capturedPhase = data.success ? 'success' as const : 'error' as const;
            const capturedErrorMessage = data.success ? null : (data.error || 'DuckDB worker task failed.');
            const capturedReporter = callback.reportDiagnostics;
            const deferDiagnostics = () => {
                reportWorkerDiagnostics(capturedReporter, buildWorkerDiagnosticsEntry({
                    workerFamily: 'duckdb',
                    task: capturedTask,
                    phase: capturedPhase,
                    requestId: capturedRequestId,
                    payloadBytes: capturedPayloadBytes,
                    payload: capturedPayload,
                    result: capturedResult,
                    roundTripMs: capturedRoundTripMs,
                    handlerMs: capturedHandlerMs,
                    errorMessage: capturedErrorMessage,
                }));
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(deferDiagnostics, { timeout: 2000 });
            } else {
                setTimeout(deferDiagnostics, 100);
            }
        };
        worker.onerror = event => {
            if (this.worker !== worker) return;
            this.resetWorker(event.error || new Error('DuckDB worker crashed.'));
        };
        this.worker = worker;
        return worker;
    }

    private async call(
        task: DuckDbWorkerTask,
        payload?: any,
        options?: { timeoutMs?: number; abortSignal?: AbortSignal; reportDiagnostics?: WorkerDiagnosticsReporter },
    ): Promise<any> {
        throwIfAborted(options?.abortSignal);
        const id = ++this.requestId;
        const payloadBytes = import.meta.env.DEV ? estimateSerializableBytes(payload) : 0;
        const startedAt = getNowMs();
        const worker = this.ensureWorker();
        if (options?.abortSignal?.aborted) {
            const abortError = normalizeAbortError(options.abortSignal.reason);
            reportWorkerDiagnostics(options.reportDiagnostics, buildWorkerDiagnosticsEntry({
                workerFamily: 'duckdb',
                task,
                phase: 'abort',
                requestId: id,
                payloadBytes,
                payload,
                result: { error: abortError.message },
                roundTripMs: getNowMs() - startedAt,
                handlerMs: 0,
                errorMessage: abortError.message,
            }));
            throw abortError;
        }
        const request: WorkerRequest = { id, task, payload, resourceGeneration: this.generation };
        return new Promise((resolve, reject) => {
            const callback: {
                resolve: (value: any) => void;
                reject: (reason?: any) => void;
                timeoutId?: ReturnType<typeof setTimeout>;
                abortCleanup?: () => void;
                task: DuckDbWorkerTask;
                requestId: number;
                startedAt: number;
                payload: unknown;
                payloadBytes: number;
                reportDiagnostics?: WorkerDiagnosticsReporter;
            } = {
                resolve,
                reject,
                task,
                requestId: id,
                startedAt,
                payload,
                payloadBytes,
                reportDiagnostics: options?.reportDiagnostics,
            };
            const timeoutMs = options?.timeoutMs ?? 1500;
            if (timeoutMs > 0) {
                callback.timeoutId = setTimeout(() => {
                    if (!this.callbacks.has(id)) return;
                    callback.abortCleanup?.();
                    this.callbacks.delete(id);
                    const timeoutError = new Error(`DuckDB worker task "${task}" timed out after ${timeoutMs}ms.`);
                    reportWorkerDiagnostics(callback.reportDiagnostics, buildWorkerDiagnosticsEntry({
                        workerFamily: 'duckdb',
                        task,
                        phase: 'timeout',
                        requestId: id,
                        payloadBytes: callback.payloadBytes,
                        payload: callback.payload,
                        result: { error: timeoutError.message },
                        roundTripMs: getNowMs() - callback.startedAt,
                        handlerMs: 0,
                        errorMessage: timeoutError.message,
                    }));
                    this.resetWorker(timeoutError, 'timeout');
                    reject(timeoutError);
                }, timeoutMs);
            }
            if (options?.abortSignal) {
                const onAbort = () => {
                    if (!this.callbacks.has(id)) return;
                    this.callbacks.delete(id);
                    const abortError = normalizeAbortError(options.abortSignal?.reason);
                    reportWorkerDiagnostics(callback.reportDiagnostics, buildWorkerDiagnosticsEntry({
                        workerFamily: 'duckdb',
                        task,
                        phase: 'abort',
                        requestId: id,
                        payloadBytes: callback.payloadBytes,
                        payload: callback.payload,
                        result: { error: abortError.message },
                        roundTripMs: getNowMs() - callback.startedAt,
                        handlerMs: 0,
                        errorMessage: abortError.message,
                    }));
                    this.resetWorker(abortError, 'abort');
                    reject(abortError);
                };
                options.abortSignal.addEventListener('abort', onAbort, { once: true });
                callback.abortCleanup = () => options.abortSignal?.removeEventListener('abort', onAbort);
            }
            this.callbacks.set(id, callback);
            worker.postMessage(request);
        });
    }

    async initDuckDb(timeoutMs = 1500, abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter) {
        // Fast path: WASM already compiled and connection established — no-op.
        if (this.initCompleted) {
            return;
        }
        if (this.initPromise) {
            return this.initPromise;
        }
        const assetBaseUrl = typeof window !== 'undefined'
            ? (typeof document !== 'undefined' ? document.baseURI : window.location.href)
            : undefined;
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wasm-loading', { detail: { id: 'duckdb', label: 'SQL Engine (DuckDB WASM)', action: 'start' } }));
        }
        const generation = this.generation;
        const initPromise = this.call('initDuckDb', { assetBaseUrl }, { timeoutMs, abortSignal, reportDiagnostics })
            .then((result: any) => {
                this.assertGeneration(generation);
                this.initCompleted = true;
                if (!this.healthMonitor) {
                    this.healthMonitor = new WorkerHealthMonitor({
                        workerFamily: 'duckdb',
                        pingFn: () => this.ping(),
                        onUnhealthy: (_failures, error) => {
                            if (this.generation === generation) this.resetWorker(new Error(`DuckDB worker unresponsive: ${error.message}`));
                        },
                    });
                    this.healthMonitor.start();
                }
                return result;
            })
            .finally(() => {
                if (this.initPromise === initPromise) {
                    this.initPromise = null;
                }
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('wasm-loading', { detail: { id: 'duckdb', action: 'end' } }));
                }
            });
        this.initPromise = initPromise;
        try {
            return await initPromise;
        } catch (error) {
            if (this.initPromise === initPromise) {
                this.initPromise = null;
            }
            throw error;
        }
    }

    async loadCleanDataset(
        payload: { csvText: string; csvFileName: string; loadVersion: string; tableName: string; },
        timeoutMs = 1500,
        abortSignal?: AbortSignal,
        reportDiagnostics?: WorkerDiagnosticsReporter,
    ) {
        const generation = this.generation;
        this.lastLoad = null;
        this.needsRestore = false;
        const result = await this.call('loadCleanDataset', payload, { timeoutMs, abortSignal, reportDiagnostics });
        this.assertGeneration(generation);
        this.lastLoad = { kind: 'clean', payload };
        return result;
    }

    async loadFileDataset(
        payload: {
            file: File;
            csvFileName: string;
            loadVersion: string;
            tableName: string;
            previewRows: number;
            exactColumns?: Array<{name:string; type:string; nullable?: boolean}>;
        },
        timeoutMs = 180_000,
        abortSignal?: AbortSignal,
        reportDiagnostics?: WorkerDiagnosticsReporter,
    ): Promise<{
        loaded: boolean;
        loadVersion: string;
        tableName: string;
        rowCount: number;
        preview: CsvRow[];
    }> {
        const generation = this.generation;
        this.lastLoad = null;
        this.needsRestore = false;
        const result = await this.call('loadFileDataset', payload, { timeoutMs, abortSignal, reportDiagnostics });
        this.assertGeneration(generation);
        this.lastLoad = { kind: 'file', payload };
        return result;
    }

    async executeCompiledQuery(payload: {
        sql: string;
        countSql: string;
        unitGuardSql?: string;
        selectedColumns: string[];
        appliedOrderBy: QueryOrderByClause[];
        appliedLimit: number;
        expectedBinding?: SqlBinding;
    }, timeoutMs = 1500, abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter): Promise<DataQueryResult> {
        const generation = this.generation;
        const load = this.lastLoad;
        const binding = load ? {tableName: load.payload.tableName, loadVersion: load.payload.loadVersion} : undefined;
        if (payload.expectedBinding) assertSqlBinding(payload.expectedBinding, binding ?? null);
        validateSqlText(payload.sql); validateSqlText(payload.countSql); validateSqlLimit(payload.appliedLimit);
        if (payload.unitGuardSql !== undefined) validateSqlText(payload.unitGuardSql);
        const boundedTimeout = sqlTimeout(timeoutMs);
        await this.restoreDatasetIfNeeded(abortSignal, reportDiagnostics);
        this.assertGeneration(generation);
        if (this.lastLoad !== load) throw new Error('sql_binding_mismatch');
        const result = await this.call('executeCompiledQuery', {...payload, expectedBinding: binding}, { timeoutMs: boundedTimeout, abortSignal, reportDiagnostics });
        this.assertGeneration(generation);
        if (this.lastLoad !== load) throw new Error('sql_binding_mismatch');
        return result;
    }

    async executeRawQuery(payload: {
        sql: string;
        selectedColumns: string[];
        limit: number;
        expectedBinding?: SqlBinding;
    }, timeoutMs = 5000, abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter): Promise<DataQueryResult> {
        const generation = this.generation;
        const load = this.lastLoad;
        const binding = load ? {tableName: load.payload.tableName, loadVersion: load.payload.loadVersion} : undefined;
        if (payload.expectedBinding) assertSqlBinding(payload.expectedBinding, binding ?? null);
        validateSqlText(payload.sql); validateSqlLimit(payload.limit);
        const boundedTimeout = sqlTimeout(timeoutMs);
        await this.restoreDatasetIfNeeded(abortSignal, reportDiagnostics);
        this.assertGeneration(generation);
        if (this.lastLoad !== load) throw new Error('sql_binding_mismatch');
        const result = await this.call('executeRawQuery', {...payload, expectedBinding: binding}, { timeoutMs: boundedTimeout, abortSignal, reportDiagnostics });
        this.assertGeneration(generation);
        if (this.lastLoad !== load) throw new Error('sql_binding_mismatch');
        return result;
    }

    async disposeDuckDbSession(timeoutMs = 1500, reportDiagnostics?: WorkerDiagnosticsReporter) {
        const worker = this.ensureWorker();
        const generation = this.generation;
        this.lastLoad = null;
        this.needsRestore = false;
        try {
            await this.call('disposeDuckDbSession', undefined, { timeoutMs, reportDiagnostics });
        } finally {
            if (this.worker !== worker || this.generation !== generation) return;
            this.healthMonitor?.stop();
            this.healthMonitor = null;
            this.worker?.terminate();
            this.worker = null;
            this.initPromise = null;
            this.initCompleted = false;
        }
    }
}

export let duckDbWorkerClient = new DuckDbWorkerClient();
/** Host-only synchronous swap after an isolated worker has fully loaded and passed integrity checks. */
export const exchangeDuckDbWorkerClient = (next:DuckDbWorkerClient):DuckDbWorkerClient => {
    const previous=duckDbWorkerClient;duckDbWorkerClient=next;return previous;
};
