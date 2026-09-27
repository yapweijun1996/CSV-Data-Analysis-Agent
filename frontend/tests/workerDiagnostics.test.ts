// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDiagnosticsEntry } from '../services/workers/workerDiagnostics';

const workerHarness = vi.hoisted(() => {
    let dataBehavior: 'success' | 'error' | 'hang' = 'success';
    let duckBehavior: 'success' | 'error' | 'hang' = 'success';

    class MockDataWorker {
        onmessage: ((event: MessageEvent<Record<string, unknown>>) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;

        postMessage(message: { id: number; task: string }) {
            if (dataBehavior === 'hang') {
                return;
            }
            const payload = dataBehavior === 'error'
                ? { id: message.id, success: false, error: 'data worker failed' }
                : {
                    id: message.id,
                    success: true,
                    result: {
                        rows: [{ Region: 'East' }],
                        totalMatchedRows: 3,
                        returnedRows: 1,
                        truncated: true,
                        selectedColumns: ['Region'],
                        appliedOrderBy: [],
                        appliedLimit: 1,
                        durationMs: 12,
                    },
                };
            setTimeout(() => {
                this.onmessage?.({ data: payload } as unknown as MessageEvent<Record<string, unknown>>);
            }, 0);
        }

        terminate() {
            return undefined;
        }
    }

    class MockDuckDbWorker {
        onmessage: ((event: MessageEvent<Record<string, unknown>>) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;

        postMessage(message: { id: number; task: string }) {
            if (duckBehavior === 'hang') {
                return;
            }
            const payload = duckBehavior === 'error'
                ? { id: message.id, success: false, error: 'duckdb worker failed' }
                : { id: message.id, success: true, result: { initialized: true } };
            setTimeout(() => {
                this.onmessage?.({ data: payload } as unknown as MessageEvent<Record<string, unknown>>);
            }, 0);
        }

        terminate() {
            return undefined;
        }
    }

    return {
        MockDataWorker,
        MockDuckDbWorker,
        setDataBehavior: (next: 'success' | 'error' | 'hang') => {
            dataBehavior = next;
        },
        setDuckBehavior: (next: 'success' | 'error' | 'hang') => {
            duckBehavior = next;
        },
    };
});

vi.mock('../services/workers/dataWorker.ts?worker&module&inline', () => ({
    default: workerHarness.MockDataWorker,
}));

vi.mock('../services/workers/duckDbWorkerFactory', () => ({
    createDuckDbWorker: () => new workerHarness.MockDuckDbWorker(),
}));

describe('worker diagnostics', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        workerHarness.setDataBehavior('success');
        workerHarness.setDuckBehavior('success');
        (globalThis as typeof globalThis & { Worker?: typeof Worker }).Worker = class MockGlobalWorker {} as unknown as typeof Worker;
    });

    it('reports success diagnostics for data query worker results', async () => {
        const entries: WorkerDiagnosticsEntry[] = [];
        const { executeDataQueryWithWorker } = await import('../services/workers/dataWorkerClient');
        const rows = Array.from({ length: 1000 }, (_, index) => ({ Region: `Region-${index}`, Revenue: index }));

        const result = await executeDataQueryWithWorker(rows, {
            select: ['Region'],
            limit: 1,
        }, {
            reportDiagnostics: entry => entries.push(entry),
        });
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(result.returnedRows).toBe(1);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            workerFamily: 'data',
            task: 'executeDataQuery',
            phase: 'success',
            rowCount: 1000,
            returnedRows: 1,
            totalMatchedRows: 3,
            selectedColumnCount: 1,
            truncated: true,
        });
    });

    it('reports error diagnostics when the data query worker returns an error', async () => {
        workerHarness.setDataBehavior('error');
        const entries: WorkerDiagnosticsEntry[] = [];
        const { executeDataQueryWithWorker } = await import('../services/workers/dataWorkerClient');
        const rows = Array.from({ length: 1000 }, (_, index) => ({ Region: `Region-${index}`, Revenue: index }));

        await expect(executeDataQueryWithWorker(rows, {
            select: ['Region'],
            limit: 1,
        }, {
            reportDiagnostics: entry => entries.push(entry),
        })).rejects.toThrow('data worker failed');
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            workerFamily: 'data',
            task: 'executeDataQuery',
            phase: 'error',
            errorMessage: 'data worker failed',
        });
    });

    it('reports timeout diagnostics for DuckDB worker tasks', async () => {
        workerHarness.setDuckBehavior('hang');
        const entries: WorkerDiagnosticsEntry[] = [];
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        await expect(
            duckDbWorkerClient.initDuckDb(5, undefined, entry => entries.push(entry)),
        ).rejects.toThrow(/timed out/);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            workerFamily: 'duckdb',
            task: 'initDuckDb',
            phase: 'timeout',
        });
    });

    it('reports abort diagnostics for DuckDB worker tasks', async () => {
        workerHarness.setDuckBehavior('hang');
        const entries: WorkerDiagnosticsEntry[] = [];
        const controller = new AbortController();
        const { duckDbWorkerClient } = await import('../services/workers/duckDbWorkerClient');

        const promise = duckDbWorkerClient.loadCleanDataset({
            csvText: 'Region,Revenue\nEast,10',
            csvFileName: 'report.csv',
            loadVersion: 'dataset-1',
            tableName: 'session_clean_dataset',
        }, 100, controller.signal, entry => entries.push(entry));

        controller.abort(new DOMException('Cancelled the current agent run.', 'AbortError'));

        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            workerFamily: 'duckdb',
            task: 'loadCleanDataset',
            phase: 'abort',
        });
    });
});
