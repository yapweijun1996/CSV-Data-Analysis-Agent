import type { ReportMemoryScope, VectorSearchMatch, VectorStoreDocument } from '../../types';
import { createVectorWorker } from './vectorWorkerFactory';
import { WorkerHealthMonitor, HEALTH_PING_TIMEOUT_MS } from './workerHealthMonitor';
import type {
    VectorWorkerTask,
    VectorWorkerRequest,
    VectorWorkerResponse,
    VectorWorkerProgressEvent,
    VectorWorkerStatusEvent,
    VectorWorkerMessage,
} from './vectorWorker';

// Re-export worker message types for consumers.
export type { VectorWorkerTask } from './vectorWorker';

const LOG_PREFIX = '[VectorWorkerClient]';

// --- Timeout constants ---
export const VECTOR_INIT_TIMEOUT_MS = 60_000;
export const VECTOR_ADD_TIMEOUT_MS = 15_000;
export const VECTOR_BATCH_TIMEOUT_MS = 60_000;
export const VECTOR_SEARCH_TIMEOUT_MS = 10_000;
export const VECTOR_REHYDRATE_TIMEOUT_MS = 10_000;
export const VECTOR_SNAPSHOT_TIMEOUT_MS = 10_000;
export const VECTOR_SIMPLE_TIMEOUT_MS = 5_000;

/**
 * Write tasks are non-critical — a timeout should only reject that single
 * promise instead of terminating the entire worker (which cascades failures
 * to every pending callback).  Only init / search / status are "critical"
 * enough to warrant a full worker reset on timeout.
 */
const WRITE_TASKS: ReadonlySet<VectorWorkerTask> = new Set([
    'addDocument',
    'addDocumentBatch',
    'rehydrate',
    'clear',
    'deleteDocument',
    'getDocuments',
    'getDocumentCount',
    'configure',
]);

type ProgressListener = (message: string) => void;
type StatusListener = (status: 'idle' | 'loading' | 'ready' | 'error', error?: string) => void;

export function validateVectorWorkerResponse(data: unknown): string | null {
    if (data === null || typeof data !== 'object') {
        return 'Vector worker response is not an object.';
    }
    const r = data as Record<string, unknown>;
    // Progress/status events don't have an id field.
    if (r.type === 'progress' || r.type === 'status') {
        return null;
    }
    if (typeof r.id !== 'number' || !Number.isFinite(r.id)) {
        return 'Vector worker response is missing a valid numeric "id" field.';
    }
    if (typeof r.success !== 'boolean') {
        return 'Vector worker response is missing the boolean "success" field.';
    }
    if (r.success === true && r.result == null) {
        return `Vector worker response reports success but "result" is ${r.result === null ? 'null' : 'undefined'}.`;
    }
    return null;
}

class VectorWorkerClient {
    private worker: Worker | null = null;
    private callbacks = new Map<number, {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
        timeoutId?: ReturnType<typeof setTimeout>;
        task: VectorWorkerTask;
        requestId: number;
    }>();
    private requestId = 0;
    private progressListeners = new Set<ProgressListener>();
    private statusListeners = new Set<StatusListener>();
    private currentStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    private currentError: string | null = null;
    private healthMonitor: WorkerHealthMonitor | null = null;

    private ping(): Promise<unknown> {
        return this.call('ping', undefined, HEALTH_PING_TIMEOUT_MS);
    }

    // --- Event subscription ---

    onProgress(listener: ProgressListener): () => void {
        this.progressListeners.add(listener);
        return () => { this.progressListeners.delete(listener); };
    }

    onStatus(listener: StatusListener): () => void {
        this.statusListeners.add(listener);
        return () => { this.statusListeners.delete(listener); };
    }

    getStatus(): 'idle' | 'loading' | 'ready' | 'error' {
        return this.currentStatus;
    }

    getLastError(): string | null {
        return this.currentError;
    }

    // --- Worker lifecycle ---

    private resetWorker(error: Error) {
        this.healthMonitor?.stop();
        this.healthMonitor = null;
        this.callbacks.forEach(callback => {
            if (callback.timeoutId) clearTimeout(callback.timeoutId);
            callback.reject(error);
        });
        this.callbacks.clear();
        this.worker?.terminate();
        this.worker = null;
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;

        const worker = createVectorWorker();
        worker.onmessage = (event: MessageEvent<VectorWorkerMessage>) => {
            const handlerStart = performance.now();
            const data = event.data;

            // Handle progress events (no id, no callback routing).
            if (data && typeof data === 'object' && 'type' in data) {
                if (data.type === 'progress') {
                    const progressData = data as VectorWorkerProgressEvent;
                    this.progressListeners.forEach(listener => {
                        try { listener(progressData.message); } catch { /* ignore */ }
                    });
                    return;
                }
                if (data.type === 'status') {
                    const statusData = data as VectorWorkerStatusEvent;
                    this.currentStatus = statusData.status;
                    this.currentError = statusData.error ?? null;
                    this.statusListeners.forEach(listener => {
                        try { listener(statusData.status, statusData.error); } catch { /* ignore */ }
                    });
                    return;
                }
            }

            // Validate RPC response shape.
            const shapeError = validateVectorWorkerResponse(data);
            if (shapeError) {
                const maybeId = typeof (data as any)?.id === 'number' ? (data as any).id as number : null;
                const staleCallback = maybeId !== null ? this.callbacks.get(maybeId) : null;
                if (staleCallback) {
                    this.callbacks.delete(maybeId!);
                    if (staleCallback.timeoutId) clearTimeout(staleCallback.timeoutId);
                    staleCallback.reject(new Error(`${LOG_PREFIX} Malformed response for task "${staleCallback.task}": ${shapeError}`));
                } else {
                    console.error(`${LOG_PREFIX} Malformed response with no callback:`, shapeError, data);
                }
                return;
            }

            const response = data as VectorWorkerResponse;
            const callback = this.callbacks.get(response.id);
            if (!callback) return;
            this.callbacks.delete(response.id);
            if (callback.timeoutId) clearTimeout(callback.timeoutId);

            if (response.success) {
                callback.resolve(response.result);
            } else {
                callback.reject(new Error(response.error || 'Vector worker task failed.'));
            }
            const handlerMs = performance.now() - handlerStart;
            if (handlerMs > 50) {
                console.warn(
                    `[VectorWorkerClient] ⚠ Slow onmessage handler: ${Math.round(handlerMs)}ms` +
                    ` | task=${callback.task}`,
                );
            }
        };

        worker.onerror = event => {
            this.resetWorker(event.error || new Error('Vector worker crashed.'));
        };

        this.worker = worker;
        return worker;
    }

    // --- RPC call ---

    private call<T = any>(
        task: VectorWorkerTask,
        payload?: any,
        timeoutMs = VECTOR_SIMPLE_TIMEOUT_MS,
    ): Promise<T> {
        const id = ++this.requestId;
        const worker = this.ensureWorker();
        const request: VectorWorkerRequest = { id, task, payload };

        return new Promise<T>((resolve, reject) => {
            const callback: typeof this.callbacks extends Map<number, infer V> ? V : never = {
                resolve,
                reject,
                task,
                requestId: id,
            };
            if (timeoutMs > 0) {
                callback.timeoutId = setTimeout(() => {
                    if (!this.callbacks.has(id)) return;
                    this.callbacks.delete(id);
                    const timeoutError = new Error(`${LOG_PREFIX} Task "${task}" timed out after ${timeoutMs}ms.`);
                    if (WRITE_TASKS.has(task)) {
                        // Non-critical write: reject only this promise.
                        // The worker stays alive so other tasks (search, init)
                        // are not disrupted.
                        console.warn(`${LOG_PREFIX} Non-critical task "${task}" timed out — skipping without worker reset.`);
                        reject(timeoutError);
                    } else {
                        // Critical task (init / search / status): full reset.
                        this.resetWorker(timeoutError);
                        reject(timeoutError);
                    }
                }, timeoutMs);
            }
            this.callbacks.set(id, callback);
            worker.postMessage(request);
        });
    }

    // --- Public API ---

    async init(progressCallback?: ProgressListener): Promise<void> {
        let unsubscribe: (() => void) | undefined;
        if (progressCallback) {
            unsubscribe = this.onProgress(progressCallback);
        }
        // Emit wasm-loading events on main thread for UI compatibility.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wasm-loading', {
                detail: { id: 'onnx-transformers', label: 'AI Memory Engine (ONNX WASM)', action: 'start' },
            }));
        }
        try {
            await this.call('init', undefined, VECTOR_INIT_TIMEOUT_MS);
            if (!this.healthMonitor) {
                this.healthMonitor = new WorkerHealthMonitor({
                    workerFamily: 'vector',
                    pingFn: () => this.ping(),
                    onUnhealthy: (_failures, error) => {
                        this.resetWorker(new Error(`Vector worker unresponsive: ${error.message}`));
                    },
                });
                this.healthMonitor.start();
            }
        } finally {
            unsubscribe?.();
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('wasm-loading', {
                    detail: { id: 'onnx-transformers', action: 'end' },
                }));
            }
        }
    }

    async addDocument(doc: { id: string; text: string; metadata?: any }): Promise<void> {
        await this.call('addDocument', doc, VECTOR_ADD_TIMEOUT_MS);
    }

    async addDocumentBatch(docs: Array<{ id: string; text: string; metadata?: any }>): Promise<{ count: number }> {
        return this.call('addDocumentBatch', { docs }, VECTOR_BATCH_TIMEOUT_MS);
    }

    async deleteDocument(id: string): Promise<boolean> {
        const result = await this.call<{ deleted: boolean }>('deleteDocument', { id }, VECTOR_SIMPLE_TIMEOUT_MS);
        return result.deleted;
    }

    async search(
        queryText: string,
        k: number = 5,
        scope?: ReportMemoryScope,
    ): Promise<VectorSearchMatch[]> {
        return this.call('search', { queryText, k, scope }, VECTOR_SEARCH_TIMEOUT_MS);
    }

    async rehydrate(documents: VectorStoreDocument[]): Promise<void> {
        await this.call('rehydrate', { documents }, VECTOR_REHYDRATE_TIMEOUT_MS);
    }

    async clear(): Promise<void> {
        await this.call('clear', undefined, VECTOR_SIMPLE_TIMEOUT_MS);
    }

    async getDocuments(): Promise<VectorStoreDocument[]> {
        return this.call('getDocuments', undefined, VECTOR_SNAPSHOT_TIMEOUT_MS);
    }

    async getDocumentCount(): Promise<number> {
        return this.call('getDocumentCount', undefined, VECTOR_SIMPLE_TIMEOUT_MS);
    }

    async getWorkerStatus(): Promise<{
        status: 'idle' | 'loading' | 'ready' | 'error';
        isInitialized: boolean;
        permanentlyFailed: boolean;
        documentCount: number;
        maxDocuments: number;
        lastError: string | null;
    }> {
        return this.call('getStatus', undefined, VECTOR_SIMPLE_TIMEOUT_MS);
    }

    async configure(options: { maxDocuments?: number }): Promise<{ maxDocuments: number }> {
        return this.call('configure', options, VECTOR_SIMPLE_TIMEOUT_MS);
    }

    terminate(): void {
        this.healthMonitor?.stop();
        this.healthMonitor = null;
        this.worker?.terminate();
        this.worker = null;
        this.callbacks.clear();
        this.progressListeners.clear();
        this.statusListeners.clear();
    }
}

export const vectorWorkerClient = new VectorWorkerClient();
