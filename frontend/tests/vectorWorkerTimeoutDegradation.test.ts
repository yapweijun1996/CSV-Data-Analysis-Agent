// @vitest-environment jsdom

/**
 * Vector worker timeout degradation tests.
 *
 * Verifies that:
 *  1. Write-task timeouts (addDocument, addDocumentBatch, etc.) reject the
 *     individual promise WITHOUT terminating the worker.
 *  2. Critical-task timeouts (init, search) still reset the worker.
 *  3. After a write-task timeout, subsequent calls still work (worker alive).
 *  4. The VectorStore facade swallows write errors so callers are not blocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    VECTOR_ADD_TIMEOUT_MS,
    VECTOR_BATCH_TIMEOUT_MS,
    VECTOR_INIT_TIMEOUT_MS,
    VECTOR_SEARCH_TIMEOUT_MS,
    validateVectorWorkerResponse,
} from '../services/workers/vectorWorkerClient';

// ---------------------------------------------------------------------------
// Controlled worker harness
// ---------------------------------------------------------------------------

type RawResponse = Record<string, unknown>;

const workerHarness = vi.hoisted(() => {
    type FakeInstance = {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        onmessage: ((event: { data: RawResponse }) => void) | null;
        onerror: unknown;
    };

    const instances: FakeInstance[] = [];
    let pendingReply: RawResponse | null = null;

    class MockVectorWorker {
        postMessage = vi.fn((message: { id: number; task: string }) => {
            const reply = pendingReply;
            if (reply) {
                queueMicrotask(() => {
                    (this as any).onmessage?.({ data: { id: message.id, ...reply } });
                });
            }
        });
        terminate = vi.fn();
        onmessage: ((event: { data: RawResponse }) => void) | null = null;
        onerror: unknown = null;

        constructor() {
            instances.push(this as any);
        }
    }

    return {
        MockVectorWorker,
        instances,
        get latest() {
            return instances[instances.length - 1];
        },
        setPendingReply(reply: RawResponse | null) {
            pendingReply = reply;
        },
        reset() {
            instances.length = 0;
            pendingReply = null;
        },
    };
});

vi.mock('../services/workers/vectorWorkerFactory', () => ({
    createVectorWorker: () => new workerHarness.MockVectorWorker(),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const getClient = async () => {
    const mod = await import('../services/workers/vectorWorkerClient');
    return mod.vectorWorkerClient;
};

/**
 * Capture a rejected promise's error without triggering Node's unhandled
 * rejection tracker.  Attach the `.catch` immediately so the rejection is
 * always handled before the next microtask checkpoint.
 */
const captureRejection = <T>(promise: Promise<T>): Promise<Error | null> => {
    let captured: Error | null = null;
    const handled = promise
        .then(() => null)
        .catch((err: unknown) => {
            captured = err instanceof Error ? err : new Error(String(err));
            return captured;
        });
    return handled;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vectorWorkerClient timeout degradation', () => {
    let clientRef: Awaited<ReturnType<typeof getClient>> | null = null;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetModules();
        workerHarness.reset();
    });

    afterEach(() => {
        clientRef?.terminate();
        clientRef = null;
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    // --- Timeout constant regression guards ---

    it('exports expected timeout constants', () => {
        expect(VECTOR_INIT_TIMEOUT_MS).toBe(60_000);
        expect(VECTOR_ADD_TIMEOUT_MS).toBe(15_000);
        expect(VECTOR_BATCH_TIMEOUT_MS).toBe(60_000);
        expect(VECTOR_SEARCH_TIMEOUT_MS).toBe(10_000);
    });

    // --- Write-task timeout: soft reject, worker stays alive ---

    it('addDocument timeout rejects without terminating the worker', async () => {
        workerHarness.setPendingReply(null); // worker hangs
        const client = await getClient();
        clientRef = client;

        const errorPromise = captureRejection(
            client.addDocument({ id: 'doc-1', text: 'hello' }),
        );

        await vi.advanceTimersByTimeAsync(VECTOR_ADD_TIMEOUT_MS + 50);
        const error = await errorPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toMatch(/timed out/);
        // Worker should NOT have been terminated.
        expect(workerHarness.latest.terminate).not.toHaveBeenCalled();
    });

    it('after addDocument timeout, a subsequent search still works', async () => {
        workerHarness.setPendingReply(null);
        const client = await getClient();
        clientRef = client;

        const errorPromise = captureRejection(
            client.addDocument({ id: 'doc-1', text: 'hello' }),
        );
        await vi.advanceTimersByTimeAsync(VECTOR_ADD_TIMEOUT_MS + 50);
        const error = await errorPromise;
        expect(error).toBeInstanceOf(Error);

        // Worker is still alive — now make search succeed.
        workerHarness.setPendingReply({ success: true, result: [] });
        const searchPromise = client.search('hello', 3);
        await vi.advanceTimersByTimeAsync(10);
        const results = await searchPromise;
        expect(results).toEqual([]);
    });

    it('addDocumentBatch timeout rejects without terminating the worker', async () => {
        workerHarness.setPendingReply(null);
        const client = await getClient();
        clientRef = client;

        const errorPromise = captureRejection(
            client.addDocumentBatch([{ id: 'doc-1', text: 'hello' }]),
        );
        await vi.advanceTimersByTimeAsync(VECTOR_BATCH_TIMEOUT_MS + 50);
        const error = await errorPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toMatch(/timed out/);
        expect(workerHarness.latest.terminate).not.toHaveBeenCalled();
    });

    // --- Critical-task timeout: full worker reset ---

    it('init timeout terminates the worker', async () => {
        workerHarness.setPendingReply(null);
        const client = await getClient();
        clientRef = client;

        const errorPromise = captureRejection(client.init());
        await vi.advanceTimersByTimeAsync(VECTOR_INIT_TIMEOUT_MS + 50);
        const error = await errorPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toMatch(/timed out/);
        expect(workerHarness.latest.terminate).toHaveBeenCalled();
    });

    it('search timeout terminates the worker', async () => {
        // First init successfully, then search hangs.
        workerHarness.setPendingReply({ success: true, result: { initialized: true } });
        const client = await getClient();
        clientRef = client;

        const initPromise = client.init();
        await vi.advanceTimersByTimeAsync(10);
        await initPromise;

        workerHarness.setPendingReply(null);
        const errorPromise = captureRejection(client.search('test', 5));
        await vi.advanceTimersByTimeAsync(VECTOR_SEARCH_TIMEOUT_MS + 50);
        const error = await errorPromise;

        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toMatch(/timed out/);
        expect(workerHarness.latest.terminate).toHaveBeenCalled();
    });
});

describe('vectorStore facade timeout degradation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('addDocumentBatch swallows timeout and returns { count: 0 }', async () => {
        vi.doMock('../services/workers/vectorWorkerClient', () => ({
            vectorWorkerClient: {
                addDocumentBatch: vi.fn().mockRejectedValue(new Error('Task "addDocumentBatch" timed out after 60000ms.')),
                onStatus: vi.fn().mockReturnValue(() => {}),
                onProgress: vi.fn().mockReturnValue(() => {}),
                getStatus: () => 'ready' as const,
                getLastError: () => null,
            },
        }));

        const { vectorStore } = await import('../services/vectorStore');
        const result = await vectorStore.addDocumentBatch([{ id: 'a', text: 'hello' }]);
        expect(result).toEqual({ count: 0 });
    });

    it('rehydrate swallows timeout silently', async () => {
        vi.doMock('../services/workers/vectorWorkerClient', () => ({
            vectorWorkerClient: {
                rehydrate: vi.fn().mockRejectedValue(new Error('Task "rehydrate" timed out after 10000ms.')),
                onStatus: vi.fn().mockReturnValue(() => {}),
                onProgress: vi.fn().mockReturnValue(() => {}),
                getStatus: () => 'ready' as const,
                getLastError: () => null,
            },
        }));

        const { vectorStore } = await import('../services/vectorStore');
        await expect(vectorStore.rehydrate([
            { id: 'doc-1', text: 'Test', embedding: [0.1, 0.2], metadata: { kind: 'dataset' as const, memoryFormatVersion: 'ir-v1' as const } },
        ])).resolves.toBeUndefined();
    });

    it('search swallows errors and returns empty array', async () => {
        vi.doMock('../services/workers/vectorWorkerClient', () => ({
            vectorWorkerClient: {
                search: vi.fn().mockRejectedValue(new Error('Worker crashed')),
                onStatus: vi.fn().mockReturnValue(() => {}),
                onProgress: vi.fn().mockReturnValue(() => {}),
                getStatus: () => 'ready' as const,
                getLastError: () => null,
            },
        }));

        const { vectorStore } = await import('../services/vectorStore');
        const results = await vectorStore.search('test', 5);
        expect(results).toEqual([]);
    });
});

describe('validateVectorWorkerResponse', () => {
    it('accepts valid progress events', () => {
        expect(validateVectorWorkerResponse({ type: 'progress', message: 'Loading...' })).toBeNull();
    });

    it('accepts valid status events', () => {
        expect(validateVectorWorkerResponse({ type: 'status', status: 'ready' })).toBeNull();
    });

    it('rejects missing id', () => {
        expect(validateVectorWorkerResponse({ success: true, result: {} })).toMatch(/missing a valid numeric/);
    });

    it('rejects missing success', () => {
        expect(validateVectorWorkerResponse({ id: 1 })).toMatch(/missing the boolean "success"/);
    });

    it('rejects success=true with null result', () => {
        expect(validateVectorWorkerResponse({ id: 1, success: true, result: null })).toMatch(/result.*null/);
    });
});
