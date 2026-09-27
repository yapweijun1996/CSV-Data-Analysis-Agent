import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatSlice } from '../store/slices/chatSlice';
import { __resetRuntimeConfigForTests } from '../config/runtimeConfig';

const { isProviderConfiguredMock } = vi.hoisted(() => ({
    isProviderConfiguredMock: vi.fn(() => false),
}));

vi.mock('../services/agent/orchestration/chatOrchestrator', () => ({
    orchestrateChatResponse: vi.fn(),
    handleClarificationResponse: vi.fn(),
}));

vi.mock('../services/agent/actionHandler', () => ({
    handleAiAction: vi.fn(),
}));

vi.mock('../services/agent/orchestration/sessionManager', () => ({
    confirmAnalysisGoal: vi.fn(),
}));

vi.mock('../services/ai/contextManager', () => ({
    generateContextualSummary: vi.fn(),
    markContextualSummaryRefreshed: vi.fn(),
    shouldRefreshContextualSummary: vi.fn(() => false),
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

const createState = () => ({
    goalState: 'idle' as string,
    chatLifecycleState: 'idle' as const,
    isBusy: false,
    pendingClarification: null,
    pendingMutationConfirmation: null,
    activeTurn: null,
    queuedChatTurns: [],
    settings: {
        provider: 'openai' as const,
        geminiApiKey: '',
        openAIApiKey: '',
        simpleModel: 'gpt-5-mini',
        complexModel: 'gpt-5.2',
        language: 'English' as const,
        autoConfirmGoal: true,
    },
    addProgress: vi.fn(),
    setIsSettingsModalOpen: vi.fn(),
    chatHistory: [],
    sessionId: 'session-1',
    confirmedAnalysisGoal: null,
    aiCoreAnalysisSummary: null,
    contextualSummary: null,
    agentMemoryRun: null,
    cardEnhancementSuggestions: [],
    analysisCards: [],
    confirmGoal: vi.fn(),
});

const createSliceHarness = () => {
    let state = createState();
    const set = vi.fn();
    const get = () => state as never;
    return {
        state,
        slice: createChatSlice(set as never, get as never, {} as never),
    };
};

describe('chatSlice end user mode API-key gating', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete window.__CSV_AGENT_CONFIG__;
        __resetRuntimeConfigForTests();
        isProviderConfiguredMock.mockReturnValue(false);
    });

    it('does not auto-open settings when end user mode hides settings', async () => {
        window.__CSV_AGENT_CONFIG__ = { ui: { endUserMode: true } };
        __resetRuntimeConfigForTests();
        const { state, slice } = createSliceHarness();

        await slice.handleChatMessage('run analysis');

        expect(state.setIsSettingsModalOpen).not.toHaveBeenCalled();
        expect(state.addProgress).toHaveBeenCalledWith(
            'AI analysis is not configured for this deployment. Contact the person who set up this app to provide the API key.',
            'error',
        );
    });

    it('keeps the settings popup path when settings are explicitly re-enabled', async () => {
        window.__CSV_AGENT_CONFIG__ = { ui: { endUserMode: true, showSettingsButton: true } };
        __resetRuntimeConfigForTests();
        const { state, slice } = createSliceHarness();

        await slice.handleChatMessage('run analysis');

        expect(state.addProgress).toHaveBeenCalledWith('API Key is not set.', 'error');
        expect(state.setIsSettingsModalOpen).toHaveBeenCalledWith(true);
    });

    it('routes restored goal confirmation replies through confirmGoal before provider gating', async () => {
        const { state, slice } = createSliceHarness();
        state.goalState = 'awaiting_user_confirmation';

        await slice.handleChatMessage('Focus on regional revenue');

        expect(state.confirmGoal).toHaveBeenCalledWith('Focus on regional revenue');
        expect(state.addProgress).not.toHaveBeenCalled();
        expect(state.setIsSettingsModalOpen).not.toHaveBeenCalled();
    });
});
