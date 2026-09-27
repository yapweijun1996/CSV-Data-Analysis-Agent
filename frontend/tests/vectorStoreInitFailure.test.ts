import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks for the worker client used by VectorStore ---
const initMock = vi.hoisted(() => vi.fn());
const statusListeners = vi.hoisted(() => [] as Array<(status: string, error?: string) => void>);

vi.mock('../services/workers/vectorWorkerClient', () => ({
    vectorWorkerClient: {
        init: initMock,
        onStatus: (cb: (status: string, error?: string) => void) => {
            statusListeners.push(cb);
        },
        search: vi.fn(async () => []),
        addDocument: vi.fn(),
        addDocumentBatch: vi.fn(async () => ({ count: 0 })),
        deleteDocument: vi.fn(async () => false),
        getDocuments: vi.fn(async () => []),
        getDocumentCount: vi.fn(async () => 0),
        clear: vi.fn(),
        rehydrate: vi.fn(),
    },
}));

describe('VectorStore init failure handling (Ticket 2)', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        statusListeners.length = 0;
    });

    it('sets vectorMemoryState to error when init fails silently', async () => {
        // Simulate worker reporting error status during init
        initMock.mockImplementation(async () => {
            // Worker fires error status
            for (const cb of statusListeners) cb('error', 'ONNX model failed to load');
        });

        // Get a fresh instance by resetting modules
        const { vectorStore } = await import('../services/vectorStore');

        const store = {
            getState: () => ({
                vectorMemoryState: 'cold' as string,
                addProgress: vi.fn(),
            }),
            setState: vi.fn(),
        };

        await vectorStore.ensureVectorMemoryReady('memory_panel', store as any);

        // Should have been set to 'error', never 'ready'
        const calls = store.setState.mock.calls.map(c => c[0]);
        const readyCalls = calls.filter((c: any) => c.vectorMemoryState === 'ready');
        const errorCalls = calls.filter((c: any) => c.vectorMemoryState === 'error');

        expect(readyCalls).toHaveLength(0);
        expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('sets vectorMemoryState to ready only when init succeeds', async () => {
        initMock.mockImplementation(async () => {
            for (const cb of statusListeners) cb('ready');
        });

        const { vectorStore } = await import('../services/vectorStore');

        const store = {
            getState: () => ({
                vectorMemoryState: 'cold' as string,
                addProgress: vi.fn(),
            }),
            setState: vi.fn(),
        };

        await vectorStore.ensureVectorMemoryReady('followup_chat', store as any);

        const calls = store.setState.mock.calls.map(c => c[0]);
        const readyCalls = calls.filter((c: any) => c.vectorMemoryState === 'ready');
        expect(readyCalls.length).toBeGreaterThanOrEqual(1);
    });
});
