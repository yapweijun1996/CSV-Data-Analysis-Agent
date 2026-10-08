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

class DuckDbWorkerClient {
    private worker: Worker | null = null;
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
            const load = this.lastLoad;
            this.restorePromise = (async () => {
                await this.initDuckDb(45_000, abortSignal, reportDiagnostics);
                if (load.kind === 'file') {
                    await this.call('loadFileDataset', load.payload, { timeoutMs: 180_000, abortSignal, reportDiagnostics });
                } else {
                    await this.call('loadCleanDataset', load.payload, { timeoutMs: 45_000, abortSignal, reportDiagnostics });
                }
                // A newer load or a dispose during the restore supersedes it.
                if (this.lastLoad === load) this.needsRestore = false;
                console.warn(`[DuckDbWorker] Restored table "${load.payload.tableName}" after a worker reset.`);
            })().finally(() => {
                this.restorePromise = null;
            });
        }
        return this.restorePromise;
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        const worker = createDuckDbWorker();
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const handlerStartedAt = getNowMs();
            const data = event.data;

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
        const request: WorkerRequest = { id, task, payload };
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
        const initPromise = this.call('initDuckDb', { assetBaseUrl }, { timeoutMs, abortSignal, reportDiagnostics })
            .then((result: any) => {
                this.initCompleted = true;
                if (!this.healthMonitor) {
                    this.healthMonitor = new WorkerHealthMonitor({
                        workerFamily: 'duckdb',
                        pingFn: () => this.ping(),
                        onUnhealthy: (_failures, error) => {
                            this.resetWorker(new Error(`DuckDB worker unresponsive: ${error.message}`));
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
        this.lastLoad = null;
        this.needsRestore = false;
        const result = await this.call('loadCleanDataset', payload, { timeoutMs, abortSignal, reportDiagnostics });
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
        this.lastLoad = null;
        this.needsRestore = false;
        const result = await this.call('loadFileDataset', payload, { timeoutMs, abortSignal, reportDiagnostics });
        this.lastLoad = { kind: 'file', payload };
        return result;
    }

    async executeCompiledQuery(payload: {
        sql: string;
        countSql: string;
        selectedColumns: string[];
        appliedOrderBy: QueryOrderByClause[];
        appliedLimit: number;
    }, timeoutMs = 1500, abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter): Promise<DataQueryResult> {
        await this.restoreDatasetIfNeeded(abortSignal, reportDiagnostics);
        return this.call('executeCompiledQuery', payload, { timeoutMs, abortSignal, reportDiagnostics });
    }

    async executeRawQuery(payload: {
        sql: string;
        selectedColumns: string[];
        limit: number;
    }, timeoutMs = 5000, abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter): Promise<DataQueryResult> {
        await this.restoreDatasetIfNeeded(abortSignal, reportDiagnostics);
        return this.call('executeRawQuery', payload, { timeoutMs, abortSignal, reportDiagnostics });
    }

    async disposeDuckDbSession(timeoutMs = 1500, reportDiagnostics?: WorkerDiagnosticsReporter) {
        this.lastLoad = null;
        this.needsRestore = false;
        try {
            await this.call('disposeDuckDbSession', undefined, { timeoutMs, reportDiagnostics });
        } finally {
            this.healthMonitor?.stop();
            this.healthMonitor = null;
            this.worker?.terminate();
            this.worker = null;
            this.initPromise = null;
            this.initCompleted = false;
        }
    }
}

export const duckDbWorkerClient = new DuckDbWorkerClient();
