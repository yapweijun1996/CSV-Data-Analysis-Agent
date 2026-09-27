// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: vi.fn().mockResolvedValue([]),
        search: vi.fn().mockResolvedValue([]),
        clear: vi.fn(),
        rehydrate: vi.fn(),
        getDocuments: vi.fn(() => []),
    },
}));

import { handleAiAction } from '../services/agent/actionHandler';

const createStore = () => {
    let state = {
        csvData: {
            fileName: 'cleaned.csv',
            data: [{ Code: '501001', Amount: 10 }],
        },
        chatHistory: [] as Array<Record<string, unknown>>,
        cleaningRun: null,
        addProgress: vi.fn(),
        logTelemetryEvent: vi.fn(),
        logAgentToolUsage: vi.fn(),
    };

    const setState = (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };

    return {
        getState: () => state,
        setState,
    };
};

describe('chat destructive row delete guard', () => {
    it('blocks permanent row deletion from chat before executor validation or execution', async () => {
        const store = createStore();

        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Delete the requested code rows now.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Remove Code 501001.',
                operations: [
                    {
                        id: 'delete-code',
                        type: 'drop_rows_by_condition',
                        reason: 'Delete the requested rows.',
                        predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                    },
                ],
            },
        }, store as never, { requireRowDeleteConfirmation: true });

        expect(result.status).toBe('blocked');
        expect(result.toolName).toBe('data.mutate');
        expect(result.message).toContain('preflight confirmation');
        expect(store.getState().logAgentToolUsage).not.toHaveBeenCalled();
    });
});
