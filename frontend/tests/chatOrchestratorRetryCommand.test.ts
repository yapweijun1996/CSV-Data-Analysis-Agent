// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    isProviderConfiguredMock,
    runAgrunFollowUpTurnMock,
    runDataAnalysisSessionMock,
    classifyChatIntentMock,
    tryHandlePendingMutationConfirmationMock,
    classifyRowDeleteIntentMock,
} = vi.hoisted(() => ({
    isProviderConfiguredMock: vi.fn(),
    runAgrunFollowUpTurnMock: vi.fn(),
    runDataAnalysisSessionMock: vi.fn(),
    classifyChatIntentMock: vi.fn(),
    tryHandlePendingMutationConfirmationMock: vi.fn(),
    classifyRowDeleteIntentMock: vi.fn(),
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/agent/runtime/agrun/followUpRuntimeService', () => ({
    runAgrunFollowUpTurn: runAgrunFollowUpTurnMock,
}));

vi.mock('../services/agent/runtime/dataAnalysisSessionRunner', () => ({
    runDataAnalysisSession: runDataAnalysisSessionMock,
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
        runAgrunFollowUpTurnMock.mockResolvedValue(undefined);
        runDataAnalysisSessionMock.mockResolvedValue({ acceptedCardCount: 1, session: { acceptedOutputs: [] } });
        classifyChatIntentMock.mockResolvedValue({ target: 'agent_turn', findings: { intent: 'conversation', classifiedBy: 'deterministic', confidence: 'high' } });
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

        expect(runAgrunFollowUpTurnMock).toHaveBeenCalledWith(
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

        expect(runAgrunFollowUpTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'retry',
                intentFindings: expect.objectContaining({ intent: 'conversation' }),
            }),
            store,
        );
    });

    it('routes explicit dataset-analysis requests into the shared analysis session engine', async () => {
        const { orchestrateChatResponse } = await import('../services/agent/orchestration/chatOrchestrator');
        classifyChatIntentMock.mockResolvedValue({ target: 'data_analysis_session', findings: { intent: 'batch_analysis', classifiedBy: 'deterministic', confidence: 'high' } });

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

        expect(runDataAnalysisSessionMock).toHaveBeenCalledWith(expect.objectContaining({
            origin: 'chat_follow_up',
            goal: 'analyze this dataset and show key insights',
        }));
        expect(runAgrunFollowUpTurnMock).not.toHaveBeenCalled();
        expect(state.chatHistory.at(-1)?.text).toContain('1 analysis card');
    });
});
