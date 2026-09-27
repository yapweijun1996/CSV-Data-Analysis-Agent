import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    promoteAppFollowUpMemory,
    readAppFollowUpMemory,
} from '../services/agent/memory/followUpMemory';
import {
    AGRUN_GLOBAL_MEMORY_ENABLED,
    FOLLOW_UP_MEMORY_OWNER,
} from '../services/agent/memory/memoryOwnership';
import type { StoreApi } from '../services/agent/types';
import { createRuntimeTestStore } from './runtimeTestStore';

const memoryMocks = vi.hoisted(() => ({
    ensureVectorMemoryReady: vi.fn(async () => undefined),
    flushPendingVectorMemoryDocs: vi.fn(async () => undefined),
    searchIfReady: vi.fn(async () => []),
    upsertChatInsightDocs: vi.fn(async () => undefined),
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        ensureVectorMemoryReady: memoryMocks.ensureVectorMemoryReady,
        searchIfReady: memoryMocks.searchIfReady,
    },
}));

vi.mock('../services/agent/memory/vectorMemorySync', () => ({
    flushPendingVectorMemoryDocs: memoryMocks.flushPendingVectorMemoryDocs,
    upsertChatInsightDocs: memoryMocks.upsertChatInsightDocs,
}));

const buildTranscript = () => {
    const messages = [];
    for (let turn = 1; turn <= 5; turn += 1) {
        messages.push({
            id: `user-${turn}`,
            sender: 'user' as const,
            text: `Why is Amount higher in segment ${turn}?`,
            timestamp: new Date(),
            type: 'user_message' as const,
        });
        messages.push({
            id: `ai-${turn}`,
            sender: 'ai' as const,
            text: `Amount is higher at 100.${turn} for this segment.`,
            timestamp: new Date(),
            type: 'ai_message' as const,
        });
    }
    messages.push({
        id: 'user-current',
        sender: 'user' as const,
        text: 'Current follow-up',
        timestamp: new Date(),
        type: 'user_message' as const,
    });
    return messages;
};

describe('AGRUN-010 app-owned memory boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('declares the app as owner and keeps Agrun global memory disabled', () => {
        expect(FOLLOW_UP_MEMORY_OWNER).toBe('app');
        expect(AGRUN_GLOBAL_MEMORY_ENABLED).toBe(false);
    });

    it('promotes a due chat window once before runtime selection', async () => {
        const store = createRuntimeTestStore({
            chatHistory: buildTranscript(),
            columnProfiles: [{
                name: 'Amount',
                type: 'number',
            }],
            lastInsightExtractedAtTurn: 0,
            vectorMemoryState: 'ready',
        } as never) as unknown as StoreApi;

        await expect(promoteAppFollowUpMemory(
            store,
            'Current follow-up',
        )).resolves.toBe(1);
        expect(memoryMocks.upsertChatInsightDocs).toHaveBeenCalledTimes(1);
        expect(store.getState().lastInsightExtractedAtTurn).toBe(5);

        await expect(promoteAppFollowUpMemory(
            store,
            'Current follow-up',
        )).resolves.toBe(0);
        expect(memoryMocks.upsertChatInsightDocs).toHaveBeenCalledTimes(1);
    });

    it('retrieves only through the app vector store for Agrun context', async () => {
        memoryMocks.searchIfReady.mockResolvedValueOnce([{
            id: 'memory-insight',
            text: 'Accepted decision: compare Amount by Town.',
            score: 0.92,
            metadata: {
                kind: 'accepted_decision',
                memoryFormatVersion: 'ir-v1',
            },
        }]);
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'report.csv',
                data: [{ Town: 'WOODLANDS', Amount: 100 }],
            },
            rawCsvData: {
                fileName: 'report.csv',
                data: [{ Town: 'WOODLANDS', Amount: 100 }],
            },
            currentDatasetId: 'dataset-1',
            vectorMemoryState: 'ready',
        } as never) as unknown as StoreApi;

        await expect(readAppFollowUpMemory(
            store,
            'compare Amount',
        )).resolves.toEqual([
            'Accepted decision: compare Amount by Town.',
        ]);
        expect(memoryMocks.searchIfReady).toHaveBeenCalledTimes(1);
    });
});
