// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    isProviderConfiguredMock,
    runPiFollowUpTurnMock,
    classifyChatIntentMock,
    tryHandlePendingMutationConfirmationMock,
    classifyRowDeleteIntentMock,
} = vi.hoisted(() => ({
    isProviderConfiguredMock: vi.fn(),
    runPiFollowUpTurnMock: vi.fn(),
    classifyChatIntentMock: vi.fn(),
    tryHandlePendingMutationConfirmationMock: vi.fn(),
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

vi.mock('../services/agent/runtime/intentClassifier', () => ({
    classifyChatIntent: classifyChatIntentMock,
}));

vi.mock('../services/agent/orchestration/chatMutationWorkflow', () => ({
    runRowDeletePreflight: vi.fn(),
    tryHandlePendingMutationConfirmation: tryHandlePendingMutationConfirmationMock,
}));

vi.mock('../services/agent/orchestration/rowDeleteIntent', () => ({
    classifyRowDeleteIntent: classifyRowDeleteIntentMock,
}));

describe('chatOrchestrator explicit follow-up handling', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        isProviderConfiguredMock.mockReturnValue(true);
        tryHandlePendingMutationConfirmationMock.mockResolvedValue(false);
        classifyRowDeleteIntentMock.mockReturnValue({ kind: 'unsupported' });
        runPiFollowUpTurnMock.mockResolvedValue(undefined);
        classifyChatIntentMock.mockResolvedValue({ findings: { intent: 'conversation', classifiedBy: 'deterministic', confidence: 'high' } });
    });

    it('treats a short follow-up as a new raw message even after a blocked run', async () => {
        const { orchestrateChatResponse } = await import('../services/agent/orchestration/chatOrchestrator');

        const state = {
            settings: { provider: 'openai' },
            pendingClarification: null,
            runtimeRunHistory: [
                {
                    userMessage: 'Analyze Revenue and Cost Variances',
                    outcomeKind: 'blocked',
                },
            ],
            chatHistory: [
                { sender: 'user', text: 'Analyze Revenue and Cost Variances' },
                { sender: 'ai', text: 'Clarification Needed' },
                { sender: 'user', text: 'Clarification selected: ok' },
                { sender: 'user', text: 'retry' },
            ],
            isBusy: false,
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        await orchestrateChatResponse('retry', store as never);

        expect(runPiFollowUpTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'retry',
                intentFindings: expect.objectContaining({ intent: 'conversation' }),
            }),
            store,
        );
    });

    it('falls back to the raw message when there is no blocked or failed runtime history', async () => {
        const { orchestrateChatResponse } = await import('../services/agent/orchestration/chatOrchestrator');

        const state = {
            settings: { provider: 'openai' },
            pendingClarification: null,
            runtimeRunHistory: [],
            chatHistory: [
                { sender: 'user', text: 'retry' },
            ],
            isBusy: false,
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        await orchestrateChatResponse('retry', store as never);

        expect(runPiFollowUpTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'retry',
                intentFindings: expect.objectContaining({ intent: 'conversation' }),
            }),
            store,
        );
    });

    it('routes open-ended dataset-analysis requests through Pi', async () => {
        const { orchestrateChatResponse } = await import('../services/agent/orchestration/chatOrchestrator');
        classifyChatIntentMock.mockResolvedValue({ findings: { intent: 'batch_analysis', classifiedBy: 'ai', confidence: 'high' } });

        const state = {
            settings: { provider: 'openai' },
            pendingClarification: null,
            runtimeRunHistory: [],
            csvData: {
                fileName: 'report.csv',
                data: [{ Project: 'A', Value: 10 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            chatHistory: [],
            isBusy: false,
            addProgress: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        };

        await orchestrateChatResponse('analyze this dataset and show key insights', store as never);

        expect(runPiFollowUpTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'analyze this dataset and show key insights',
                intentFindings: expect.objectContaining({ intent: 'batch_analysis' }),
            }),
            store,
        );
    });
});
