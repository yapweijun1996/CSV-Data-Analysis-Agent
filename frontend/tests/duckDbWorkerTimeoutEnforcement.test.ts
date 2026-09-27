// @vitest-environment jsdom

/**
 * P0 Anti-Survivorship Resilience: DuckDB worker timeout enforcement + response validation
 *
 * Mirrors workerTimeoutEnforcement.test.ts and workerResponseValidation.test.ts
 * for the DuckDB worker client.
 *
 * Verifies that:
 *  1. Timeout constants are exported with correct values (regression guard).
 *  2. When the DuckDB worker hangs (never responds), the timeout fires, the
 *     worker is terminated, and the promise rejects.
 *  3. After a timeout, the next call creates a fresh worker (dead worker was nulled).
 *  4. validateDuckDbWorkerResponse catches structurally invalid responses.
 *  5. Malformed onmessage payloads reject the pending callback.
 *
 * Strategy: mock createDuckDbWorker from duckDbWorkerFactory so we can control
 * a fake Worker without spawning a real thread. Use fake timers to fire timeouts
 * immediately. vi.resetModules() gives each test a fresh duckDbWorkerClient singleton.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DUCKDB_INIT_TIMEOUT_MS,
    DUCKDB_LOAD_TIMEOUT_MS,
    DUCKDB_QUERY_TIMEOUT_MS,
    DUCKDB_DISPOSE_TIMEOUT_MS,
} from '../services/duckdb/queryEngine';
import { validateDuckDbWorkerResponse } from '../services/workers/duckDbWorkerClient';

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

    class MockDuckDbWorker {
        postMessage = vi.fn((message: { id: number; task: string }) => {
            const reply = pendingReply;
            if (reply === null) return; // hangs — never responds
            setTimeout(() => {
                // Substitute real id for -1 sentinel
                const payload = reply.id === -1 ? { ...reply, id: message.id } : reply;
                this.onmessage?.({ data: payload as RawResponse });
            }, 0);
        });
        terminate = vi.fn();
        onmessage: ((event: { data: RawResponse }) => void) | null = null;
        onerror: unknown = null;

        constructor() {
            (instances as FakeInstance[]).push(this as unknown as FakeInstance);
        }
    }

    return {
        instances,
        MockDuckDbWorker,
        setPendingReply: (r: RawResponse | null) => { pendingReply = r; },
        reset: () => {
            instances.length = 0;
            pendingReply = null;
        },
    };
});

vi.mock('../services/workers/duckDbWorkerFactory', () => ({
    createDuckDbWorker: () => new workerHarness.MockDuckDbWorker(),
}));

vi.mock('../services/workers/workerDiagnostics', () => ({
    buildWorkerDiagnosticsEntry: vi.fn().mockReturnValue({}),
    estimateSerializableBytes: vi.fn().mockReturnValue(0),
    getNowMs: vi.fn().mockReturnValue(Date.now()),
    reportWorkerDiagnostics: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Timeout constant tests (no mocking needed)
// ---------------------------------------------------------------------------

describe('DuckDB worker timeout constants', () => {
    it('DUCKDB_INIT_TIMEOUT_MS is 45 seconds', () => {
        expect(DUCKDB_INIT_TIMEOUT_MS).toBe(45_000);
    });

    it('DUCKDB_LOAD_TIMEOUT_MS is 45 seconds', () => {
        expect(DUCKDB_LOAD_TIMEOUT_MS).toBe(45_000);
    });

    it('DUCKDB_QUERY_TIMEOUT_MS is 10 seconds', () => {
        expect(DUCKDB_QUERY_TIMEOUT_MS).toBe(10_000);
    });

    it('DUCKDB_DISPOSE_TIMEOUT_MS is 5 seconds', () => {
        expect(DUCKDB_DISPOSE_TIMEOUT_MS).toBe(5_000);
    });
});

// ---------------------------------------------------------------------------
// validateDuckDbWorkerResponse — unit tests
// ---------------------------------------------------------------------------

describe('validateDuckDbWorkerResponse — unit', () => {
    it('rejects null payload', () => {
        expect(validateDuckDbWorkerResponse(null)).toMatch(/not an object/i);
    });

    it('rejects string payload', () => {
        expect(validateDuckDbWorkerResponse('bad')).toMatch(/not an object/i);
    });

    it('rejects missing id', () => {
        expect(validateDuckDbWorkerResponse({ success: true, result: {} })).toMatch(/id/i);
    });

    it('rejects non-numeric id', () => {
        expect(validateDuckDbWorkerResponse({ id: 'abc', success: true, result: {} })).toMatch(/numeric/i);
    });

    it('rejects missing success field', () => {
        expect(validateDuckDbWorkerResponse({ id: 1, result: {} })).toMatch(/success/i);
    });

    it('rejects success=true with null result', () => {
        const err = validateDuckDbWorkerResponse({ id: 1, success: true, result: null });
        expect(err).not.toBeNull();
        expect(err).toMatch(/result/i);
    });

    it('accepts a valid success response', () => {
        expect(validateDuckDbWorkerResponse({ id: 1, success: true, result: { rows: [] } })).toBeNull();
    });

    it('accepts a valid error response (success=false, no result)', () => {
        expect(validateDuckDbWorkerResponse({ id: 1, success: false, error: 'query failed' })).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Hung worker → timeout → terminate → reject (P0)
// ---------------------------------------------------------------------------

describe('DuckDbWorkerClient — hung worker → timeout → reject (P0)', () => {
    beforeEach(() => {
        workerHarness.reset();
        vi.useFakeTimers();
        vi.resetModules();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('initDuckDb: hung worker → timeout fires → worker terminated → rejects', async () => {
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        // Start initDuckDb with a short 500ms timeout — worker never responds
        const resultPromise = duckDbWorkerClient.initDuckDb(500);
        // Subscribe to rejection BEFORE advancing timers to avoid unhandled-rejection window
        const caught = resultPromise.catch(e => e);

        expect(workerHarness.instances.length).toBe(1);
        const firstWorker = workerHarness.instances[0];
        expect(firstWorker.postMessage).toHaveBeenCalledOnce();

        // Advance past the 500ms timeout
        await vi.advanceTimersByTimeAsync(600);

        const err = await caught;
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toMatch(/timed out/i);
        expect(firstWorker.terminate).toHaveBeenCalled();
    });

    it('after timeout, next call creates a fresh worker', async () => {
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        // First call hangs and times out
        const firstPromise = duckDbWorkerClient.initDuckDb(500);
        const firstCaught = firstPromise.catch(e => e);
        await vi.advanceTimersByTimeAsync(600);
        const firstErr = await firstCaught;
        expect((firstErr as Error).message).toMatch(/timed out/i);

        const firstWorker = workerHarness.instances[0];
        expect(firstWorker.terminate).toHaveBeenCalled();

        // Second call must create a new worker instance
        const secondPromise = duckDbWorkerClient.initDuckDb(500);
        const secondCaught = secondPromise.catch(e => e);
        expect(workerHarness.instances.length).toBe(2);
        expect(workerHarness.instances[1]).not.toBe(workerHarness.instances[0]);

        // Clean up
        await vi.advanceTimersByTimeAsync(600);
        const secondErr = await secondCaught;
        expect((secondErr as Error).message).toMatch(/timed out/i);
    });
});

// ---------------------------------------------------------------------------
// Malformed response → callback rejects (P0)
// ---------------------------------------------------------------------------

// Helper: yield to let the mock's setTimeout(0) reply fire (real timers only)
const flushMacrotasks = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

describe('DuckDbWorkerClient — malformed worker response (P0)', () => {
    beforeEach(() => {
        workerHarness.reset();
        // Real timers — the mock uses setTimeout(0) to post back replies.
        // We keep timeout high so it doesn't race; flushMacrotasks() yields the loop.
        vi.resetModules();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('rejects callback when worker sends a response missing the success field', async () => {
        // id: -1 → MockDuckDbWorker substitutes the real request id
        workerHarness.setPendingReply({ id: -1, result: { rows: [] } }); // missing `success`
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        // Subscribe to rejection BEFORE yielding, so the catch is registered
        const resultPromise = duckDbWorkerClient.initDuckDb(30_000);
        const caught = resultPromise.catch(e => e);
        await flushMacrotasks();
        const err = await caught;
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/malformed/i);
    });

    it('rejects callback when worker sends success=true with null result', async () => {
        workerHarness.setPendingReply({ id: -1, success: true, result: null });
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        const resultPromise = duckDbWorkerClient.initDuckDb(30_000);
        const caught = resultPromise.catch(e => e);
        await flushMacrotasks();
        const err = await caught;
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/malformed/i);
    });

    it('resolves normally when worker sends a well-formed success response', async () => {
        workerHarness.setPendingReply({ id: -1, success: true, result: { initialized: true } });
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        const resultPromise = duckDbWorkerClient.initDuckDb(30_000);
        await flushMacrotasks();
        const result = await resultPromise;
        expect(result).toEqual({ initialized: true });
    });
});
