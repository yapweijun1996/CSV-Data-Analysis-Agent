// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    primeDuckDbDatasetMock,
    profileDataWithWorkerMock,
} = vi.hoisted(() => ({
    primeDuckDbDatasetMock: vi.fn(),
    profileDataWithWorkerMock: vi.fn(),
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    profileDataWithWorker: profileDataWithWorkerMock,
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    primeDuckDbDataset: primeDuckDbDatasetMock,
}));

describe('executeDeterministicMutationPlan abort handling', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('does not commit dataset changes when profiling is aborted before the mutation commit', async () => {
        const { executeDeterministicMutationPlan } = await import('../services/agent/execution/deterministicMutationExecutor');
        const controller = new AbortController();
        const originalRows = [
            { Region: 'East', Revenue: 1200 },
            { Region: 'West', Revenue: 900 },
        ];
        const originalProfiles = [
            { name: 'Region', type: 'categorical' },
            { name: 'Revenue', type: 'number' },
        ];
        let state = {
            csvData: {
                fileName: 'sales.csv',
                data: originalRows,
            },
            columnProfiles: originalProfiles,
            cleaningRun: null,
            dataPreparationPlan: null,
            addProgress: vi.fn(),
            logAgentToolUsage: vi.fn(),
            regenerateAnalyses: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
                const partial = typeof update === 'function' ? update(state) : update;
                state = { ...state, ...partial };
            },
        };

        profileDataWithWorkerMock.mockImplementation(async (_rows, abortSignal?: AbortSignal) => new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        }));

        const executionPromise = executeDeterministicMutationPlan({
            explanation: 'Drop the first row.',
            operations: [
                {
                    id: 'drop-row-1',
                    type: 'drop_rows_by_index',
                    reason: 'Remove the first row.',
                    indices: [0],
                },
            ],
            outputColumns: [],
            planStatus: 'operations',
            consistencyIssues: [],
        }, store as never, controller.signal);

        controller.abort(new DOMException('Cancelled the current agent run.', 'AbortError'));

        await expect(executionPromise).rejects.toMatchObject({ name: 'AbortError' });
        expect(state.csvData.data).toEqual(originalRows);
        expect(state.columnProfiles).toEqual(originalProfiles);
        expect(state.dataPreparationPlan).toBeNull();
        expect(state.logAgentToolUsage).not.toHaveBeenCalled();
        expect(state.regenerateAnalyses).not.toHaveBeenCalled();
        expect(primeDuckDbDatasetMock).not.toHaveBeenCalled();
    });
});
