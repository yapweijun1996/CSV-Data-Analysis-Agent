// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orchestrateChatResponse } from '../services/agent/orchestration/chatOrchestrator';

const {
    isProviderConfiguredMock,
    runPiFollowUpTurnMock,
    tryHandlePendingMutationConfirmationMock,
    runRowDeletePreflightMock,
    classifyRowDeleteIntentMock,
} = vi.hoisted(() => ({
    isProviderConfiguredMock: vi.fn(),
    runPiFollowUpTurnMock: vi.fn(),
    tryHandlePendingMutationConfirmationMock: vi.fn(),
    runRowDeletePreflightMock: vi.fn(),
    classifyRowDeleteIntentMock: vi.fn(),
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/agent/runtime/pi/piFollowUpRuntimeService', () => ({
    runPiFollowUpTurn: runPiFollowUpTurnMock,
}));

vi.mock('../services/agent/orchestration/chatMutationWorkflow', () => ({
    tryHandlePendingMutationConfirmation: tryHandlePendingMutationConfirmationMock,
    runRowDeletePreflight: runRowDeletePreflightMock,
}));

vi.mock('../services/agent/orchestration/rowDeleteIntent', () => ({
    classifyRowDeleteIntent: classifyRowDeleteIntentMock,
}));

const createStore = () => {
    let state = {
        settings: {
            provider: 'openai' as const,
            geminiApiKey: '',
            openAIApiKey: 'key',
            simpleModel: 'gpt-5-mini',
            complexModel: 'gpt-5.2',
            language: 'English' as const,
            autoConfirmGoal: true,
        },
        chatHistory: [] as Array<Record<string, unknown>>,
        pendingClarification: null,
        isBusy: false,
        addProgress: vi.fn(),
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

describe('chat row delete runtime wiring', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        isProviderConfiguredMock.mockReturnValue(true);
        tryHandlePendingMutationConfirmationMock.mockResolvedValue(false);
        runRowDeletePreflightMock.mockResolvedValue(undefined);
        runPiFollowUpTurnMock.mockResolvedValue(undefined);
        classifyRowDeleteIntentMock.mockReturnValue({ kind: 'ignored' });
    });

    it('routes supported row-delete requests to preflight instead of the runtime loop', async () => {
        const store = createStore();
        classifyRowDeleteIntentMock.mockReturnValue({ kind: 'supported' });

        await orchestrateChatResponse('remove rows where Code = 501001', store as never);

        expect(runRowDeletePreflightMock).toHaveBeenCalledWith('remove rows where Code = 501001', store);
        expect(runPiFollowUpTurnMock).not.toHaveBeenCalled();
    });

    it('handles pending delete confirmations before provider gating or runtime startup', async () => {
        const store = createStore();
        tryHandlePendingMutationConfirmationMock.mockResolvedValue(true);
        isProviderConfiguredMock.mockReturnValue(false);

        await orchestrateChatResponse('confirm delete', store as never);

        expect(tryHandlePendingMutationConfirmationMock).toHaveBeenCalledWith('confirm delete', store);
        expect(runRowDeletePreflightMock).not.toHaveBeenCalled();
        expect(runPiFollowUpTurnMock).not.toHaveBeenCalled();
        expect(store.getState().chatHistory).toHaveLength(0);
    });

    it('treats confirm delete as normal chat input when no delete is pending', async () => {
        const store = createStore();

        await orchestrateChatResponse('confirm delete', store as never);

        expect(tryHandlePendingMutationConfirmationMock).toHaveBeenCalledWith('confirm delete', store);
        expect(runRowDeletePreflightMock).not.toHaveBeenCalled();
        expect(runPiFollowUpTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'confirm delete',
                intentFindings: expect.objectContaining({ intent: 'conversation' }),
            }),
            store,
        );
    });
});
