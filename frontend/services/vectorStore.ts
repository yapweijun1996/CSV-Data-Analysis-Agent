/**
 * VectorStore facade — delegates all heavy work to a dedicated Web Worker.
 *
 * The main thread no longer holds the ONNX embedder or generates embeddings.
 * This file preserves the original public API surface so existing callers
 * continue to work without changes.
 *
 * Internally every call goes through `vectorWorkerClient` which manages the
 * worker lifecycle, request/response routing, timeouts, and automatic reset
 * on crash. Progress and status events from the worker are forwarded to
 * registered listeners (and to the `wasm-loading` custom event for UI).
 */
import type {
    ReportMemoryScope,
    VectorMemoryTrigger,
    VectorSearchMatch,
    VectorStoreDocument,
} from '../types';
import { vectorWorkerClient } from './workers/vectorWorkerClient';
import { saveVectorMemory, loadVectorMemory, clearVectorMemory } from './storageService';
import { filterDocumentsForMemoryScope } from './agent/memory/memoryScope';

const LOG_PREFIX = '[VectorStore]';

type VectorStoreStatus = 'idle' | 'loading' | 'ready' | 'error';

let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 5_000;

type MemoryActivationStoreApi = {
    getState: () => {
        vectorMemoryState: string;
        addProgress?: (message: string, type?: 'system' | 'warning' | 'error') => void;
    };
    setState: (partial: Record<string, unknown>) => void;
};

class VectorStore {
    private static instance: VectorStore;
    private _isInitialized = false;
    private _permanentlyFailed = false;
    private _failedAt = 0;
    private _status: VectorStoreStatus = 'idle';
    private _lastError: string | null = null;
    private initPromise: Promise<void> | null = null;
    private static RETRY_COOLDOWN_MS = 60_000;

    public static getInstance(): VectorStore {
        if (!VectorStore.instance) {
            VectorStore.instance = new VectorStore();
        }
        return VectorStore.instance;
    }

    constructor() {
        // Mirror worker status events to local state so synchronous getters work.
        vectorWorkerClient.onStatus((status, error) => {
            this._status = status;
            this._lastError = error ?? null;
            if (status === 'ready') this._isInitialized = true;
            if (status === 'error') {
                this._isInitialized = false;
                this._permanentlyFailed = true;
                this._failedAt = Date.now();
            }
        });
    }

    // --- Synchronous status getters (used by callers for quick checks) ---

    public getIsInitialized(): boolean {
        return this._isInitialized;
    }

    public getStatus(): VectorStoreStatus {
        return this._status;
    }

    public getLastError(): string | null {
        return this._lastError;
    }

    // --- Async API (delegates to worker) ---

    public async init(progressCallback?: (message: string) => void): Promise<void> {
        if (this._isInitialized) return;
        if (this._permanentlyFailed) {
            if (Date.now() - this._failedAt < VectorStore.RETRY_COOLDOWN_MS) return;
            // Cooldown elapsed — allow retry with a fresh worker.
            this._permanentlyFailed = false;
            this._status = 'idle';
            this._lastError = null;
            vectorWorkerClient.terminate();
        }
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = vectorWorkerClient.init(progressCallback)
            .catch(error => {
                console.error(`${LOG_PREFIX} Failed to initialize vector store:`, error);
                const message = error instanceof Error ? error.message : String(error);
                progressCallback?.(`Error loading AI memory model: ${message}`);
                this._isInitialized = false;
                this._permanentlyFailed = true;
                this._failedAt = Date.now();
                this._status = 'error';
                this._lastError = message;
            })
            .finally(() => {
                this.initPromise = null;
            });

        await this.initPromise;
    }

    /**
     * Unified on-demand activation entry point (PERF-103).
     *
     * Only triggers init + flush in explicitly approved scenarios:
     * - 'memory_panel': user opened the Memory Panel
     * - 'followup_chat': first follow-up chat message
     * - 'explicit_user_action': user clicked "Enable AI Memory" or similar
     *
     * Callers in the file-import, cleaning, semantic annotation, and initial
     * card generation paths must NOT call this.
     */
    public async ensureVectorMemoryReady(
        trigger: VectorMemoryTrigger,
        store: MemoryActivationStoreApi,
        flushCallback?: (store: MemoryActivationStoreApi) => Promise<void>,
    ): Promise<void> {
        const { vectorMemoryState } = store.getState();
        if (vectorMemoryState === 'ready') return;
        if (vectorMemoryState === 'initializing') {
            // Already in progress — wait for the existing init.
            if (this.initPromise) await this.initPromise;
            return;
        }
        if (vectorMemoryState === 'error') {
            // Allow retry after cooldown period.
            if (this._permanentlyFailed && Date.now() - this._failedAt < VectorStore.RETRY_COOLDOWN_MS) return;
            store.setState({ vectorMemoryState: 'idle' });
        }

        console.log(`${LOG_PREFIX} On-demand activation triggered by: ${trigger}`);
        store.setState({ vectorMemoryState: 'initializing' });

        try {
            const { addProgress } = store.getState();
            addProgress?.('Preparing AI long-term memory...');
            await this.init(addProgress);

            // init() swallows errors internally — verify actual readiness
            // before marking the store as ready (Ticket: init-failure-state).
            if (!this._isInitialized || this._permanentlyFailed) {
                const reason = this._lastError ?? 'Unknown initialization failure';
                console.error(`${LOG_PREFIX} Init completed but store is not ready: ${reason}`);
                store.setState({ vectorMemoryState: 'error' });
                store.getState().addProgress?.(`AI memory failed to load: ${reason}`, 'error');
                return;
            }

            // Restore persisted vectors from IndexedDB before flushing pending docs.
            const restored = await this.loadFromStorage();
            if (restored) {
                addProgress?.('Restored AI memory from local storage.');
            }

            store.setState({ vectorMemoryState: 'ready' });
            addProgress?.('AI memory is ready.');

            // Flush pending docs in the background after init.
            if (flushCallback) {
                flushCallback(store).catch(error => {
                    console.warn(`${LOG_PREFIX} Background flush failed (non-blocking):`, error);
                });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`${LOG_PREFIX} On-demand activation failed:`, error);
            store.setState({ vectorMemoryState: 'error' });
            store.getState().addProgress?.(`AI memory failed to load: ${msg}`, 'error');
        }
    }

    public async rehydrate(documents: VectorStoreDocument[]): Promise<void> {
        try {
            await vectorWorkerClient.rehydrate(documents);
        } catch (error) {
            console.warn(`${LOG_PREFIX} Rehydrate failed (non-blocking):`, error);
        }
    }

    public async addDocument(
        doc: { id: string; text: string; metadata?: any },
        _options?: { shouldAbort?: () => boolean },
    ): Promise<void> {
        try {
            await vectorWorkerClient.addDocument(doc);
        } catch (error) {
            console.error(`${LOG_PREFIX} Failed to add document ${doc.id}:`, error);
        }
    }

    public async addDocumentBatch(
        docs: Array<{ id: string; text: string; metadata?: any }>,
    ): Promise<{ count: number }> {
        try {
            return await vectorWorkerClient.addDocumentBatch(docs);
        } catch (error) {
            console.warn(`${LOG_PREFIX} addDocumentBatch failed (non-blocking):`, error);
            return { count: 0 };
        }
    }

    public async deleteDocument(id: string): Promise<boolean> {
        return vectorWorkerClient.deleteDocument(id);
    }

    public async getDocumentCount(): Promise<number> {
        return vectorWorkerClient.getDocumentCount();
    }

    public async getDocuments(): Promise<VectorStoreDocument[]> {
        return vectorWorkerClient.getDocuments();
    }

    public async getDocumentsForScope(scope: ReportMemoryScope | null): Promise<VectorStoreDocument[]> {
        return filterDocumentsForMemoryScope(await this.getDocuments(), scope);
    }

    public async clear(): Promise<void> {
        await vectorWorkerClient.clear();
        await clearVectorMemory().catch(() => { /* non-blocking */ });
    }

    // --- IndexedDB persistence ---

    /** Persist current worker documents to IndexedDB. Non-blocking. */
    public async persistToStorage(): Promise<void> {
        try {
            const docs = await vectorWorkerClient.getDocuments();
            await saveVectorMemory(docs);
        } catch (error) {
            console.warn(`${LOG_PREFIX} persistToStorage failed (non-blocking):`, error);
        }
    }

    /**
     * Load persisted vectors from IndexedDB and rehydrate the worker.
     * Returns true if documents were loaded, false otherwise.
     */
    public async loadFromStorage(): Promise<boolean> {
        try {
            const docs = await loadVectorMemory();
            if (docs.length > 0 && docs.every(d => Array.isArray(d.embedding) && d.embedding.length > 0)) {
                await vectorWorkerClient.rehydrate(docs);
                return true;
            }
        } catch (error) {
            console.warn(`${LOG_PREFIX} loadFromStorage failed (non-blocking):`, error);
        }
        return false;
    }

    /** Schedule a debounced persist. Coalesces rapid writes into a single IDB write. */
    public schedulePersist(): void {
        if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
        persistDebounceTimer = setTimeout(() => {
            persistDebounceTimer = null;
            this.persistToStorage().catch(() => { /* swallowed */ });
        }, PERSIST_DEBOUNCE_MS);
    }

    public async search(
        queryText: string,
        k: number = 5,
        scope?: ReportMemoryScope,
    ): Promise<VectorSearchMatch[]> {
        try {
            return scope
                ? await vectorWorkerClient.search(queryText, k, scope)
                : await vectorWorkerClient.search(queryText, k);
        } catch (error) {
            console.error(`${LOG_PREFIX} Search failed:`, error);
            return [];
        }
    }

    public async searchIfReady(
        queryText: string,
        k: number = 5,
        scope?: ReportMemoryScope,
    ): Promise<VectorSearchMatch[]> {
        if (!this._isInitialized) return [];
        return this.search(queryText, k, scope);
    }
}

export const vectorStore = VectorStore.getInstance();
