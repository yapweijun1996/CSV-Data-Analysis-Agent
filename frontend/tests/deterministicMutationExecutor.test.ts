// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    applyDataOperationsMock,
    profileDataWithWorkerMock,
    ensureDuckDbSessionSyncMock,
} = vi.hoisted(() => ({
    applyDataOperationsMock: vi.fn(),
    profileDataWithWorkerMock: vi.fn(),
    ensureDuckDbSessionSyncMock: vi.fn(),
}));

vi.mock('../services/agent/execution/dataOperationRunner', () => ({
    applyDataOperations: applyDataOperationsMock,
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    profileDataWithWorker: profileDataWithWorkerMock,
}));

vi.mock('../services/duckdb/storeSessionSync', () => ({
    ensureDuckDbSessionSync: ensureDuckDbSessionSyncMock,
}));

describe('executeDeterministicMutationPlan', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        applyDataOperationsMock.mockReturnValue({
            data: [{ Project: 'Alpha', Value: 10 }, { Project: 'Alpha', Value: 5 }],
            logs: [],
        });
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [{ name: 'Project', type: 'categorical' }, { name: 'Value', type: 'currency' }],
        });
        ensureDuckDbSessionSyncMock.mockResolvedValue({
            status: 'ready',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
        });
    });

    it('does not trigger full analysis regeneration while a runtime turn is active', async () => {
        const { executeDeterministicMutationPlan } = await import('../services/agent/execution/deterministicMutationExecutor');

        const regenerateAnalyses = vi.fn();
        const logAgentToolUsage = vi.fn();
        const addProgress = vi.fn();
        let state = {
            csvData: {
                fileName: 'dataset.csv',
                data: [{ Project: 'Alpha', Value: 10 }],
            },
            cleaningRun: null,
            activeTurn: { status: 'running' },
            dataPreparationPlan: null,
            regenerateAnalyses,
            logAgentToolUsage,
            addProgress,
        };
        const store = {
            getState: () => state,
            setState: (partial: Record<string, unknown>) => {
                state = { ...state, ...partial };
            },
        };

        await executeDeterministicMutationPlan({
            explanation: 'Append derived rows.',
            operations: [{
                id: 'derive-profit',
                type: 'derive_metric_by_label',
                reason: 'Append derived rows.',
                groupByColumns: ['Project'],
                labelColumn: 'Description',
                valueColumn: 'Value',
                outputMetricLabel: 'Profit',
                formula: {
                    kind: 'linear_combination',
                    components: [
                        { operator: 'add', matchAny: ['revenue'] },
                        { operator: 'subtract', matchAny: ['cost'] },
                    ],
                },
            }] as never,
            outputColumns: [],
            planStatus: 'operations',
            consistencyIssues: [],
        }, store as never);

        expect(regenerateAnalyses).not.toHaveBeenCalled();
    });
});
