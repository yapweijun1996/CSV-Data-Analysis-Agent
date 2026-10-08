// @vitest-environment jsdom

/**
 * A query timeout terminates the DuckDB worker (the only way to stop a runaway query), which used to
 * discard the loaded table: every later query failed with "Table ... does not exist". The client now
 * remembers the last successful load and restores it before the next query.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
    type Message = { id: number; task: string; payload?: unknown };
    const instances: Array<{ tasks: string[]; terminate: ReturnType<typeof vi.fn> }> = [];
    let hangTask: string | null = null;

    class FakeWorker {
        tasks: string[] = [];
        terminate = vi.fn();
        onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
        onerror: unknown = null;
        constructor() { instances.push(this); }
        postMessage = (message: Message) => {
            this.tasks.push(message.task);
            if (message.task === hangTask) return;
            const result = message.task === 'executeCompiledQuery'
                ? { rows: [], totalRows: 0 }
                : { ok: true, loaded: true };
            setTimeout(() => this.onmessage?.({ data: { id: message.id, success: true, result } }), 0);
        };
    }
    return { instances, FakeWorker, setHangTask: (task: string | null) => { hangTask = task; }, reset: () => { instances.length = 0; hangTask = null; } };
});

vi.mock('../services/workers/duckDbWorkerFactory', () => ({
    createDuckDbWorker: () => new harness.FakeWorker(),
}));
vi.mock('../services/workers/workerDiagnostics', () => ({
    buildWorkerDiagnosticsEntry: vi.fn().mockReturnValue({}),
    estimateSerializableBytes: vi.fn().mockReturnValue(0),
    getNowMs: vi.fn().mockReturnValue(Date.now()),
    reportWorkerDiagnostics: vi.fn(),
}));

const query = {
    sql: 'SELECT 1', countSql: 'SELECT 1', selectedColumns: [], appliedOrderBy: [], appliedLimit: 10,
};
const cleanPayload = { csvText: 'a\n1\n', csvFileName: 'a.csv', loadVersion: 'v1', tableName: 'session_clean_dataset' };

describe('DuckDbWorkerClient restores the dataset after a worker reset', () => {
    beforeEach(() => {
        harness.reset();
        vi.useFakeTimers();
        vi.resetModules();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('reloads the last dataset on a fresh worker before the next query', async () => {
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');
        const run = async <T,>(promise: Promise<T>) => { const settled = promise.then(v => ({ v }), e => ({ e })); await vi.advanceTimersByTimeAsync(100); return settled; };

        await run(duckDbWorkerClient.initDuckDb(5000));
        await run(duckDbWorkerClient.loadCleanDataset(cleanPayload, 5000));

        harness.setHangTask('executeCompiledQuery');
        const timedOut = duckDbWorkerClient.executeCompiledQuery(query, 500).catch(e => e);
        await vi.advanceTimersByTimeAsync(600);
        expect(((await timedOut) as Error).message).toMatch(/timed out/i);
        expect(harness.instances[0].terminate).toHaveBeenCalled();

        harness.setHangTask(null);
        const next = await run(duckDbWorkerClient.executeCompiledQuery(query, 5000));
        expect('e' in next).toBe(false);
        expect(harness.instances).toHaveLength(2);
        expect(harness.instances[1].tasks).toEqual(['initDuckDb', 'loadCleanDataset', 'executeCompiledQuery']);
    });

    it('does not restore after the session was disposed', async () => {
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');
        const run = async <T,>(promise: Promise<T>) => { const settled = promise.then(v => ({ v }), e => ({ e })); await vi.advanceTimersByTimeAsync(100); return settled; };

        await run(duckDbWorkerClient.initDuckDb(5000));
        await run(duckDbWorkerClient.loadCleanDataset(cleanPayload, 5000));
        await run(duckDbWorkerClient.disposeDuckDbSession(5000));
        await run(duckDbWorkerClient.executeCompiledQuery(query, 5000));

        const last = harness.instances.at(-1)!;
        expect(last.tasks).not.toContain('loadCleanDataset');
    });
});
