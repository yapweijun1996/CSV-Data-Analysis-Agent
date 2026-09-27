// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CsvData } from '../types';

const { runMock, finalizeMock } = vi.hoisted(() => ({
    runMock: vi.fn(),
    finalizeMock: vi.fn(),
}));

vi.mock('../services/agent/runtime/pi/piInitialAnalysisRuntimeService', () => ({
    runPiInitialAnalysis: runMock,
}));

vi.mock('../services/agent/memory/memoryManager', () => ({
    finalizeAndSaveRun: finalizeMock,
}));

import { handleInitialAnalysis } from '../services/agent/orchestration/initialAnalysisService';

const dataset: CsvData = {
    fileName: 'sample.csv',
    data: [{ Town: 'A', Amount: 10 }],
};

const createStore = () => {
    let state = {
        sessionId: 'session-1',
        currentDatasetId: 'dataset-1',
        canonicalCsvData: dataset,
        csvData: dataset,
        isChangingGoal: false,
        goalState: 'idle',
        confirmedAnalysisGoal: null,
        settings: {
            provider: 'default',
            defaultGatewayModel: 'gpt-5.4-mini',
        },
    } as any;
    return {
        getState: () => state,
        setState: (partial: any) => {
            state = {
                ...state,
                ...(typeof partial === 'function' ? partial(state) : partial),
            };
        },
    };
};

describe('initialAnalysisService production ownership', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        finalizeMock.mockResolvedValue(undefined);
    });

    it('routes the first-pass analysis through Pi and maps completion', async () => {
        runMock.mockResolvedValue({
            status: 'completed',
            currentDatasetVersion: 'version-1',
            finalDatasetVersion: 'version-1',
            trustedCardIds: ['card-1'],
            warnings: [],
            runtimeRunId: 'run-1',
            traceId: 'trace-1',
        });
        const store = createStore();

        await expect(handleInitialAnalysis(
            dataset,
            'Find patterns.',
            store as never,
            { trigger: 'automatic' },
        )).resolves.toEqual({ status: 'ready' });

        expect(runMock).toHaveBeenCalledOnce();
        expect(runMock.mock.calls[0][0]).toMatchObject({
            appSessionId: 'session-1',
            datasetId: 'dataset-1',
            researchGoal: 'Find patterns.',
            provider: {
                provider: 'default',
                modelId: 'gpt-5.4-mini',
            },
        });
        expect(finalizeMock).toHaveBeenCalledOnce();
    });

    it('returns visible degraded guidance and always finalizes memory', async () => {
        runMock.mockResolvedValue({
            status: 'degraded',
            currentDatasetVersion: 'version-1',
            finalDatasetVersion: 'version-1',
            trustedCardIds: [],
            warnings: [{
                code: 'prepared_data_not_ready',
                message: 'Prepared data needs review.',
            }],
            runtimeRunId: 'run-1',
            traceId: 'trace-1',
        });

        await expect(handleInitialAnalysis(
            dataset,
            'Find patterns.',
            createStore() as never,
        )).resolves.toEqual({
            status: 'degraded',
            message: 'Prepared data needs review.',
        });
        expect(finalizeMock).toHaveBeenCalledOnce();
    });
});
