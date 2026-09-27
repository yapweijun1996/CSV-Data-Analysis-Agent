import { describe, expect, it, vi } from 'vitest';
import type { SandboxTransformationProposal } from '../types';
import {
    executeSandboxTransformation,
    type SandboxWorkerLike,
} from '../services/sandbox/transformationSandboxClient';

const proposal: SandboxTransformationProposal = {
    language: 'javascript',
    explanation: 'Copy each row.',
    code: 'function transform(rows, context) { return { tables: [], lineage: [], relationships: [] }; }',
    primaryTableId: 'fact',
    tables: [{ tableId: 'fact', name: 'Fact', role: 'fact' }],
    preserveRowCount: true,
    maxRowDropRatio: 0,
    preserveNumericColumns: ['amount'],
};

const successfulWorker = (): SandboxWorkerLike => {
    const worker: SandboxWorkerLike = {
        onmessage: null,
        onerror: null,
        terminate: vi.fn(),
        postMessage(message) {
            queueMicrotask(() => worker.onmessage?.({ data: {
                id: message.id,
                success: true,
                result: {
                    tables: [{ tableId: 'fact', name: 'Fact', role: 'fact', rows: message.rows.map(row => ({ ...row })) }],
                    lineage: message.rows.map((_row, index) => ({
                        outputTableId: 'fact',
                        outputRowIndex: index,
                        inputTableId: message.context.inputTableId as string,
                        inputRowIndexes: [index],
                    })),
                    relationships: [],
                },
            } } as MessageEvent));
        },
    };
    return worker;
};

describe('transformation sandbox client', () => {
    it('validates a sample, streams fixed batches, and merges lineage', async () => {
        const result = await executeSandboxTransformation({
            runId: 'run-1',
            attempt: 2,
            inputTableId: 'input',
            rows: [{ amount: 1 }, { amount: 2 }, { amount: 3 }, { amount: 4 }],
            proposal,
            limits: { maxRowsPerBatch: 2, timeoutMs: 100, maxOutputBytes: 100_000 },
            workerFactory: () => successfulWorker(),
        });
        expect(result.status).toBe('completed');
        expect(result.validation.decision).toBe('trusted');
        expect(result.output?.tables[0].rows).toHaveLength(4);
        expect(result.output?.lineage.map(record => record.inputRowIndexes[0])).toEqual([0, 1, 2, 3]);
    });

    it('terminates a never-resolving worker on timeout', async () => {
        const terminate = vi.fn();
        const result = await executeSandboxTransformation({
            runId: 'run-timeout',
            attempt: 2,
            inputTableId: 'input',
            rows: [{ amount: 1 }],
            proposal,
            limits: { timeoutMs: 5, maxRowsPerBatch: 10, maxOutputBytes: 100_000 },
            workerFactory: () => ({ onmessage: null, onerror: null, postMessage: vi.fn(), terminate }),
        });
        expect(result.status).toBe('failed');
        expect(result.error).toBe('sandbox_execution_timeout');
        expect(terminate).toHaveBeenCalledOnce();
    });

    it('terminates the worker and returns cancelled when the host aborts', async () => {
        const controller = new AbortController();
        const terminate = vi.fn();
        setTimeout(() => controller.abort(new DOMException('Stop', 'AbortError')), 1);
        const result = await executeSandboxTransformation({
            runId: 'run-cancel',
            attempt: 3,
            inputTableId: 'input',
            rows: [{ amount: 1 }],
            proposal,
            signal: controller.signal,
            limits: { timeoutMs: 100, maxRowsPerBatch: 10, maxOutputBytes: 100_000 },
            workerFactory: () => ({ onmessage: null, onerror: null, postMessage: vi.fn(), terminate }),
        });
        expect(result.status).toBe('cancelled');
        expect(terminate).toHaveBeenCalledOnce();
    });

    it('blocks forbidden code before creating a worker', async () => {
        const factory = vi.fn(() => successfulWorker());
        const result = await executeSandboxTransformation({
            runId: 'run-policy',
            attempt: 2,
            inputTableId: 'input',
            rows: [{ amount: 1 }],
            proposal: { ...proposal, code: 'function transform(rows) { return fetch("https://example.com"); }' },
            workerFactory: factory,
        });
        expect(result.status).toBe('blocked');
        expect(result.validation.reasonCodes).toContain('sandbox_network_access_denied');
        expect(factory).not.toHaveBeenCalled();
    });
});
