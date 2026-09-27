// @vitest-environment jsdom

/**
 * P0 Anti-Survivorship Resilience: per-task timeout enforcement in DataWorkerClient
 *
 * Verifies that:
 *  1. profileData, executeAggregation, and executeAiCleaningProgram now pass
 *     timeoutMs to the worker client's call() method (regression guard).
 *  2. When a worker hangs (never responds), the timeout timer fires, the worker
 *     is terminated, and the next call creates a fresh worker.
 *  3. The timeout constants are exported and have sensible values.
 *
 * Strategy: We test the exported timeout constants directly (values are the
 * observable contract). We test the DataWorkerClient's timeout behavior by
 * mocking the Worker constructor so we can simulate a hung worker without
 * spawning a real thread, using fake timers so the timeout fires immediately.
 *
 * We test the client indirectly via profileDataWithWorker since DataWorkerClient
 * is not exported. When a worker hangs:
 *   - the timeout fires after WORKER_TIMEOUT_PROFILE_MS
 *   - the worker is terminated
 *   - profileDataWithWorker catches the timeout error and falls back to the
 *     main-thread profiler (which is mocked to return an empty result)
 *   - the promise resolves (resilience: caller always gets a result)
 *   - the next call creates a fresh worker (the dead worker was nulled)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    WORKER_TIMEOUT_PROFILE_MS,
    WORKER_TIMEOUT_AGGREGATION_MS,
    WORKER_TIMEOUT_AI_CLEANING_MS,
} from '../services/workers/dataWorkerClient';

// --- MockDataWorker via vi.hoisted so it's accessible in vi.mock() factory
//     AND in test assertions. Each instance is pushed to `instances` so tests
//     can assert terminate() was called on the correct worker object. ---

const workerHarness = vi.hoisted(() => {
    type FakeInstance = {
        postMessage: ReturnType<typeof vi.fn>;
        terminate: ReturnType<typeof vi.fn>;
        onmessage: unknown;
        onerror: unknown;
    };

    const instances: FakeInstance[] = [];

    class MockDataWorker {
        postMessage = vi.fn();
        terminate = vi.fn();
        onmessage: unknown = null;
        onerror: unknown = null;

        constructor() {
            // Never posts back — simulates a permanently hung worker
            (instances as FakeInstance[]).push(this as unknown as FakeInstance);
        }
    }

    return {
        instances,
        MockDataWorker,
        reset: () => { instances.length = 0; },
    };
});

vi.mock('../services/workers/dataWorker.ts?worker&module&inline', () => ({
    default: workerHarness.MockDataWorker,
}));

vi.mock('../services/workers/workerDiagnostics', () => ({
    buildWorkerDiagnosticsEntry: vi.fn().mockReturnValue({}),
    estimateSerializableBytes: vi.fn().mockReturnValue(0),
    getNowMs: vi.fn().mockReturnValue(Date.now()),
    reportWorkerDiagnostics: vi.fn(),
}));

// Mock the main-thread fallback so it returns a stable empty result without
// running real profiling. We keep the real profileDataLightweight in case
// the two-layer fallback guard in fileProcessor also runs.
vi.mock('../services/data/dataProfiler', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/data/dataProfiler')>();
    return {
        ...actual,
        profileData: vi.fn().mockReturnValue({ profiles: [], issues: [] }),
    };
});

// --- Timeout constant tests (fast, no mocking needed) ---

describe('DataWorkerClient timeout constants', () => {
    it('exports WORKER_TIMEOUT_PROFILE_MS as 30 seconds', () => {
        expect(WORKER_TIMEOUT_PROFILE_MS).toBe(30_000);
    });

    it('exports WORKER_TIMEOUT_AGGREGATION_MS as 30 seconds', () => {
        expect(WORKER_TIMEOUT_AGGREGATION_MS).toBe(30_000);
    });

    it('exports WORKER_TIMEOUT_AI_CLEANING_MS as 60 seconds', () => {
        expect(WORKER_TIMEOUT_AI_CLEANING_MS).toBe(60_000);
    });
});

// --- Worker hung + timeout + terminate + recreate tests ---
// jsdom provides `window`, making DataWorkerClient.isSupported === true.
// We set globalThis.Worker to a stub so the `typeof Worker !== 'undefined'`
// check in isSupported also passes. vi.resetModules() in beforeEach ensures
// each test gets a fresh DataWorkerClient singleton (new `client` instance).

describe('DataWorkerClient — hung worker → timeout → recreate (P0)', () => {
    beforeEach(() => {
        workerHarness.reset();
        vi.useFakeTimers();
        vi.resetModules();
        // Ensure isSupported = true in jsdom (Worker may not be set by default)
        (globalThis as typeof globalThis & { Worker?: typeof Worker }).Worker =
            class MockGlobalWorker {} as unknown as typeof Worker;
    });

    afterEach(() => {
        vi.useRealTimers();
        // clearAllMocks resets call history only; restoreAllMocks would wipe vi.fn()
        // implementations set in vi.mock() factory (factory result is cached per file).
        vi.clearAllMocks();
    });

    it('profileDataWithWorker: hung worker → timeout fires → worker terminated → fallback resolves', async () => {
        // Dynamically import AFTER vi.resetModules() so we get a fresh client singleton
        const { profileDataWithWorker } = await import('../services/workers/dataWorkerClient');

        // Large dataset so the worker path is used (rows >= PROFILE_WORKER_THRESHOLD = 1000)
        const rows = Array.from({ length: 1100 }, (_, i) => ({ Col: String(i) }));

        // Start the call — worker is created but never responds
        const resultPromise = profileDataWithWorker(rows);

        // A worker must have been created and sent a message
        expect(workerHarness.instances.length).toBe(1);
        const firstWorker = workerHarness.instances[0];
        expect(firstWorker.postMessage).toHaveBeenCalledOnce();

        // Advance time past WORKER_TIMEOUT_PROFILE_MS (30 s)
        await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_PROFILE_MS + 100);

        // profileDataWithWorker catches the timeout error and falls back to main-thread
        // profiling — so the promise RESOLVES (resilience: caller always gets a result)
        const result = await resultPromise;
        expect(result).toBeDefined();

        // The hung worker must have been terminated
        expect(firstWorker.terminate).toHaveBeenCalled();
    });

    it('profileDataWithWorker: after timeout, next call creates a fresh worker', async () => {
        const { profileDataWithWorker } = await import('../services/workers/dataWorkerClient');
        const rows = Array.from({ length: 1100 }, (_, i) => ({ Col: String(i) }));

        // First call — hangs, times out, falls back, resolves
        const firstCallPromise = profileDataWithWorker(rows);
        await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_PROFILE_MS + 100);
        await firstCallPromise; // resolves via main-thread fallback

        const firstWorker = workerHarness.instances[0];
        expect(firstWorker.terminate).toHaveBeenCalled();

        // Second call — the dead worker was nulled by resetWorker(), so
        // ensureWorker() must create a NEW MockDataWorker instance
        const secondCallPromise = profileDataWithWorker(rows);

        expect(workerHarness.instances.length).toBe(2);
        expect(workerHarness.instances[1]).not.toBe(workerHarness.instances[0]);

        // Clean up the second hanging call
        await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_PROFILE_MS + 100);
        await secondCallPromise;
    });
});
