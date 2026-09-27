import { CsvRow, CsvData, QueryPlan, DataQueryResult, AiCleaningProgram, ColumnProfile } from '../../types';
import { profileData } from '../data/dataProfiler';
import { executeDataQuery } from '../agent/execution/dataOperationRunner';
import { executeAggregationCore, AggregationSpec } from '../agent/execution/executors/aggregationCore';
import { executeAiCleaningProgram, type AiCleaningExecutionResult } from '../agent/execution/aiCleaningProgram';
import { isRuntimeAbortError, normalizeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';
import DataWorker from './dataWorker.ts?worker&module&inline';
import {
    buildWorkerDiagnosticsEntry,
    estimateSerializableBytes,
    getNowMs,
    reportWorkerDiagnostics,
    type WorkerDiagnosticsReporter,
} from './workerDiagnostics';
import { WorkerHealthMonitor, HEALTH_PING_TIMEOUT_MS } from './workerHealthMonitor';

type WorkerTask = 'profileData' | 'executeAggregation' | 'executeDataQuery' | 'executeAiCleaningProgram' | 'ping';

// Per-task timeout defaults: prevent a hung worker from blocking the pipeline
// indefinitely. On timeout: the promise rejects, the worker is terminated, and
// the next call to ensureWorker() creates a fresh worker automatically.
export const WORKER_TIMEOUT_PROFILE_MS = 30_000;
export const WORKER_TIMEOUT_AGGREGATION_MS = 30_000;
export const WORKER_TIMEOUT_AI_CLEANING_MS = 60_000;

type WorkerRequest = {
    id: number;
    task: WorkerTask;
    payload: any;
};

type WorkerResponse = {
    id: number;
    success: boolean;
    result?: any;
    error?: string;
};

/**
 * Validates the structural shape of a raw worker response message before it
 * is routed to a callback. Returns a human-readable error string if the
 * response is malformed, or null if it looks valid.
 *
 * This prevents silently corrupting caller state when a worker bug produces
 * a response that is missing required fields (e.g. omitted `success` flag,
 * missing `result` on a reported-success message, or non-numeric `id`).
 */
export function validateWorkerResponseShape(data: unknown): string | null {
    if (data === null || typeof data !== 'object') {
        return 'Worker response is not an object.';
    }
    const r = data as Record<string, unknown>;
    if (typeof r.id !== 'number' || !Number.isFinite(r.id)) {
        return 'Worker response is missing a valid numeric "id" field.';
    }
    if (typeof r.success !== 'boolean') {
        return 'Worker response is missing the boolean "success" field.';
    }
    if (r.success === true && r.result == null) {
        return `Worker response reports success but "result" is ${r.result === null ? 'null' : 'undefined'}.`;
    }
    return null;
}

class DataWorkerClient {
    private worker: Worker | null = null;
    private callbacks = new Map<number, {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
        timeoutId?: ReturnType<typeof setTimeout>;
        abortCleanup?: () => void;
        task: WorkerTask;
        requestId: number;
        startedAt: number;
        payload: unknown;
        payloadBytes: number;
        reportDiagnostics?: WorkerDiagnosticsReporter;
    }>();
    private requestId = 0;
    private healthMonitor: WorkerHealthMonitor | null = null;

    private get isSupported(): boolean {
        return typeof Worker !== 'undefined' && typeof window !== 'undefined';
    }

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
                workerFamily: 'data',
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
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        const worker = new DataWorker();
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const handlerStartedAt = getNowMs();
            const data = event.data;

            // Validate response shape before routing to any callback.
            // Malformed messages must reject (not silently corrupt caller state).
            const shapeError = validateWorkerResponseShape(data);
            if (shapeError) {
                const maybeId = typeof (data as Record<string, unknown>)?.id === 'number'
                    ? (data as Record<string, unknown>).id as number
                    : null;
                const staleCallback = maybeId !== null ? this.callbacks.get(maybeId) : null;
                if (staleCallback) {
                    this.callbacks.delete(maybeId!);
                    if (staleCallback.timeoutId) clearTimeout(staleCallback.timeoutId);
                    staleCallback.abortCleanup?.();
                    const err = new Error(`Worker task "${staleCallback.task}" returned a malformed response: ${shapeError}`);
                    console.error('[DataWorker] Malformed response:', shapeError, data);
                    staleCallback.reject(err);
                } else {
                    console.error('[DataWorker] Malformed response with no routable callback:', shapeError, data);
                }
                return;
            }

            const { id, success, result, error } = data;
            const callback = this.callbacks.get(id);
            if (!callback) return;
            this.callbacks.delete(id);
            if (callback.timeoutId) {
                clearTimeout(callback.timeoutId);
            }
            callback.abortCleanup?.();
            if (success) {
                callback.resolve(result);
            } else {
                callback.reject(new Error(error || 'Worker task failed.'));
            }
            // Defer diagnostics reporting off the critical path.
            // Use requestIdleCallback (fallback: setTimeout 100ms) so diagnostics
            // never contend with rendering or user interaction on the main thread.
            const capturedRoundTripMs = getNowMs() - callback.startedAt;
            const capturedHandlerMs = getNowMs() - handlerStartedAt;
            const capturedTask = callback.task;
            const capturedRequestId = id;
            const capturedPayloadBytes = callback.payloadBytes;
            const capturedPayload = callback.payload;
            const capturedResult = success ? result : { error: error || 'Worker task failed.' };
            const capturedPhase = success ? 'success' as const : 'error' as const;
            const capturedErrorMessage = success ? null : (error || 'Worker task failed.');
            const capturedReporter = callback.reportDiagnostics;
            const deferDiagnostics = () => {
                reportWorkerDiagnostics(capturedReporter, buildWorkerDiagnosticsEntry({
                    workerFamily: 'data',
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
            console.error('[DataWorker] Unhandled error:', event);
            this.resetWorker(event.error || new Error('Worker crashed.'));
        };
        this.worker = worker;
        this.healthMonitor = new WorkerHealthMonitor({
            workerFamily: 'data',
            pingFn: () => this.ping(),
            onUnhealthy: (_failures, error) => {
                this.resetWorker(new Error(`Worker unresponsive: ${error.message}`));
            },
        });
        this.healthMonitor.start();
        return worker;
    }

    private async call(
        task: WorkerTask,
        payload: any,
        options?: { timeoutMs?: number; abortSignal?: AbortSignal; reportDiagnostics?: WorkerDiagnosticsReporter },
    ): Promise<any> {
        throwIfAborted(options?.abortSignal);
        if (!this.isSupported) {
            throw new Error('Web Workers are not supported in this environment.');
        }
        const worker = this.ensureWorker();
        const id = ++this.requestId;
        const message: WorkerRequest = { id, task, payload };
        const payloadBytes = import.meta.env.DEV ? estimateSerializableBytes(payload) : 0;
        const startedAt = getNowMs();
        return new Promise((resolve, reject) => {
            const callback: {
                resolve: (value: any) => void;
                reject: (reason?: any) => void;
                timeoutId?: ReturnType<typeof setTimeout>;
                abortCleanup?: () => void;
                task: WorkerTask;
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
            if ((options?.timeoutMs ?? 0) > 0) {
                callback.timeoutId = setTimeout(() => {
                    if (!this.callbacks.has(id)) return;
                    this.callbacks.delete(id);
                    const timeoutError = new Error(`Worker task "${task}" timed out after ${options!.timeoutMs}ms.`);
                    reportWorkerDiagnostics(callback.reportDiagnostics, buildWorkerDiagnosticsEntry({
                        workerFamily: 'data',
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
                }, options.timeoutMs);
            }
            if (options?.abortSignal) {
                const onAbort = () => {
                    if (!this.callbacks.has(id)) return;
                    this.callbacks.delete(id);
                    const abortError = normalizeAbortError(options.abortSignal?.reason);
                    reportWorkerDiagnostics(callback.reportDiagnostics, buildWorkerDiagnosticsEntry({
                        workerFamily: 'data',
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
            worker.postMessage(message);
        });
    }

    async profileData(rows: CsvRow[], abortSignal?: AbortSignal, reportDiagnostics?: WorkerDiagnosticsReporter) {
        return this.call('profileData', { rows }, { timeoutMs: WORKER_TIMEOUT_PROFILE_MS, abortSignal, reportDiagnostics });
    }

    async executeAggregation(data: CsvData, spec: AggregationSpec, reportDiagnostics?: WorkerDiagnosticsReporter) {
        return this.call('executeAggregation', { data, spec }, { timeoutMs: WORKER_TIMEOUT_AGGREGATION_MS, reportDiagnostics });
    }

    async executeDataQuery(
        rows: CsvRow[],
        plan: QueryPlan,
        options: {
            maxRows: number;
            maxColumns: number;
            maxOrderBy: number;
            allowedColumns?: string[];
            timeoutMs: number;
            abortSignal?: AbortSignal;
            reportDiagnostics?: WorkerDiagnosticsReporter;
        },
    ) {
        const workerOptions = {
            maxRows: options.maxRows,
            maxColumns: options.maxColumns,
            maxOrderBy: options.maxOrderBy,
            allowedColumns: options.allowedColumns,
        };
        return this.call('executeDataQuery', { rows, plan, options: workerOptions }, {
            timeoutMs: options.timeoutMs,
            abortSignal: options.abortSignal,
            reportDiagnostics: options.reportDiagnostics,
        });
    }

    async executeAiCleaningProgram(
        rows: CsvRow[],
        program: AiCleaningProgram,
        profiles?: ColumnProfile[],
        reportDiagnostics?: WorkerDiagnosticsReporter,
    ) {
        return this.call('executeAiCleaningProgram', { rows, program, profiles }, { timeoutMs: WORKER_TIMEOUT_AI_CLEANING_MS, reportDiagnostics });
    }
}

const client = new DataWorkerClient();
const PROFILE_WORKER_THRESHOLD = 1000;
const AGGREGATION_WORKER_THRESHOLD = 1000;
const DATA_QUERY_WORKER_THRESHOLD = 1000;
const AI_CLEANING_WORKER_THRESHOLD = 250;

export const profileDataWithWorker = async (
    rows: CsvRow[],
    abortSignal?: AbortSignal,
    reportDiagnostics?: WorkerDiagnosticsReporter,
) => {
    throwIfAborted(abortSignal);
    if (rows.length >= PROFILE_WORKER_THRESHOLD) {
        try {
            return await client.profileData(rows, abortSignal, reportDiagnostics);
        } catch (error) {
            if (isRuntimeAbortError(error, abortSignal)) {
                throw error;
            }
            console.warn('[DataWorker] Falling back to main-thread profiling:', error);
        }
    }
    const result = profileData(rows);
    throwIfAborted(abortSignal);
    return result;
};

export const executeAggregationWithWorker = async (
    data: CsvData,
    spec: AggregationSpec,
    reportDiagnostics?: WorkerDiagnosticsReporter,
) => {
    if (data.data.length >= AGGREGATION_WORKER_THRESHOLD) {
        try {
            return await client.executeAggregation(data, spec, reportDiagnostics);
        } catch (error) {
            console.warn('[DataWorker] Falling back to main-thread aggregation:', error);
        }
    }
    return executeAggregationCore(data, spec);
};

export const executeDataQueryWithWorker = async (
    rows: CsvRow[],
    plan: QueryPlan,
    options?: {
        maxRows?: number;
        maxColumns?: number;
        maxOrderBy?: number;
        allowedColumns?: string[];
        timeoutMs?: number;
        abortSignal?: AbortSignal;
        reportDiagnostics?: WorkerDiagnosticsReporter;
    },
): Promise<DataQueryResult> => {
    throwIfAborted(options?.abortSignal);
    const normalizedOptions = {
        maxRows: options?.maxRows ?? 500,
        maxColumns: options?.maxColumns ?? 50,
        maxOrderBy: options?.maxOrderBy ?? 3,
        allowedColumns: options?.allowedColumns,
        timeoutMs: options?.timeoutMs ?? 1500,
        abortSignal: options?.abortSignal,
        reportDiagnostics: options?.reportDiagnostics,
    };

    if (rows.length >= DATA_QUERY_WORKER_THRESHOLD) {
        try {
            return await client.executeDataQuery(rows, plan, normalizedOptions);
        } catch (error) {
            if (isRuntimeAbortError(error, options?.abortSignal)) {
                throw error;
            }
            console.warn('[DataWorker] Data query worker failed:', error);
            throw error;
        }
    }
    const result = executeDataQuery(rows, plan, normalizedOptions);
    throwIfAborted(options?.abortSignal);
    return result;
};

export const executeAiCleaningProgramWithWorker = async (
    rows: CsvRow[],
    program: AiCleaningProgram,
    profiles?: ColumnProfile[],
    reportDiagnostics?: WorkerDiagnosticsReporter,
): Promise<AiCleaningExecutionResult> => {
    if (rows.length >= AI_CLEANING_WORKER_THRESHOLD) {
        try {
            return await client.executeAiCleaningProgram(rows, program, profiles, reportDiagnostics);
        } catch (error) {
            console.warn('[DataWorker] Falling back to main-thread AI cleaning execution:', error);
        }
    }
    return executeAiCleaningProgram(rows, program, profiles);
};
