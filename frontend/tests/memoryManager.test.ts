import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMemoryRun } from '../types';
import type { StoreApi } from '../services/agent/types';

const { saveAgentMemoryRunMock, getAgentMemoryRunsMock, finalizeRunMock, updateDatasetFactsMock } = vi.hoisted(() => ({
    saveAgentMemoryRunMock: vi.fn(),
    getAgentMemoryRunsMock: vi.fn(),
    finalizeRunMock: vi.fn(),
    updateDatasetFactsMock: vi.fn(),
}));

vi.mock('../services/storageService', () => ({
    saveAgentMemoryRun: saveAgentMemoryRunMock,
    getAgentMemoryRuns: getAgentMemoryRunsMock,
}));

vi.mock('../services/agent/memory/agentMemoryCollector', () => ({
    agentMemoryCollector: {
        finalizeRun: finalizeRunMock,
        updateDatasetFacts: updateDatasetFactsMock,
    },
}));

import { finalizeAndSaveRun } from '../services/agent/memory/memoryManager';

const memoryRun: AgentMemoryRun = {
    runId: 'memory-run-1',
    datasetId: 'dataset-1',
    createdAt: new Date('2026-07-26T00:00:00.000Z'),
    findings: {
        datasetFacts: null,
        columnVerdicts: [],
        explorations: [],
        warnings: [],
    },
    timeline: [],
};

describe('memory manager live activity selection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        finalizeRunMock.mockReturnValue(memoryRun);
        saveAgentMemoryRunMock.mockResolvedValue(undefined);
        getAgentMemoryRunsMock.mockResolvedValue([memoryRun]);
    });

    it('keeps the activity monitor on the live event stream after finalization', async () => {
        const state = {
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            csvData: { fileName: 'sample.csv', data: [{ value: 1 }] },
            canonicalCsvData: { fileName: 'sample.csv', data: [{ value: 1 }, { value: 2 }] },
            columnProfiles: [{ name: 'value', type: 'numerical' }],
            agentEvents: [],
        };
        const setState = vi.fn();
        const store = {
            getState: () => state,
            setState,
        } as unknown as StoreApi;

        await finalizeAndSaveRun(store);

        expect(updateDatasetFactsMock).toHaveBeenCalledWith({
            fileName: 'sample.csv',
            rowCount: 2,
            columnProfiles: [{ name: 'value', type: 'numerical' }],
        });
        expect(setState).toHaveBeenCalledWith(expect.objectContaining({
            agentMemoryRun: memoryRun,
            liveAgentMemoryRun: memoryRun,
            selectedMemoryRunId: null,
        }));
    });
});
