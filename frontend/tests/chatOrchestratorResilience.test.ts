// @vitest-environment node

/**
 * P0 Anti-Survivorship Resilience: chatOrchestrator guards
 *
 * Verifies that if the Pi follow-up runtime or interaction resume throws
 * unexpectedly, the chat:
 *  1. Posts a friendly Mandarin error message to the chat history
 *  2. Sets isBusy: false so the chat remains interactive
 *  3. Never propagates the error to the caller
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handleClarificationResponse,
    orchestrateChatResponse,
} from '../services/agent/orchestration/chatOrchestrator';
import type { AgentRuntimeEvent, AgentTurn, ClarificationRequest } from '../types';

const {
    isProviderConfiguredMock,
    classifyChatIntentMock,
    resolveEffectivePendingClarificationMock,
    tryHandlePendingMutationConfirmationMock,
    classifyRowDeleteIntentMock,
    runPiFollowUpTurnMock,
    resumePiMutationApprovalMock,
} = vi.hoisted(() => ({
    isProviderConfiguredMock: vi.fn(),
    classifyChatIntentMock: vi.fn(),
    resolveEffectivePendingClarificationMock: vi.fn(),
    tryHandlePendingMutationConfirmationMock: vi.fn(),
    classifyRowDeleteIntentMock: vi.fn(),
    runPiFollowUpTurnMock: vi.fn(),
    resumePiMutationApprovalMock: vi.fn(),
}));

vi.mock('../services/agent/runtime/pi/piFollowUpRuntimeService', () => ({
    runPiFollowUpTurn: runPiFollowUpTurnMock,
}));
vi.mock('../services/agent/runtime/pi/piMutationApproval', () => ({
    resumePiMutationApproval: resumePiMutationApprovalMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/agent/runtime/intentClassifier', () => ({
    classifyChatIntent: classifyChatIntentMock,
}));

vi.mock('../services/agent/runtime/runtimeClarification', () => ({
    resolveEffectivePendingClarification: resolveEffectivePendingClarificationMock,
}));

vi.mock('../services/agent/orchestration/chatMutationWorkflow', () => ({
    tryHandlePendingMutationConfirmation: tryHandlePendingMutationConfirmationMock,
    runRowDeletePreflight: vi.fn(),
}));

vi.mock('../services/agent/orchestration/rowDeleteIntent', () => ({
    classifyRowDeleteIntent: classifyRowDeleteIntentMock,
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: vi.fn().mockResolvedValue([]),
        search: vi.fn().mockResolvedValue([]),
        addDocument: vi.fn(),
        getDocuments: vi.fn().mockReturnValue([]),
        clear: vi.fn(),
        init: vi.fn(),
    },
}));

type TestState = {
    settings: { provider: 'openai'; language: 'English' | 'Mandarin' | 'Japanese'; openAIApiKey: string; geminiApiKey: string; simpleModel: string; complexModel: string; autoConfirmGoal: boolean };
    chatHistory: Array<Record<string, unknown>>;
    isBusy: boolean;
    pendingClarification: ClarificationRequest | null;
    activeTurn: AgentTurn | null;
    cancelRequestedTurnId: string | null;
    runtimeEvents: AgentRuntimeEvent[];
    csvData: { fileName: string; data: Array<Record<string, unknown>> } | null;
    addProgress: ReturnType<typeof vi.fn>;
    logAgentToolUsage: ReturnType<typeof vi.fn>;
    logTelemetryEvent: ReturnType<typeof vi.fn>;
    clearActiveTurnCancellation: ReturnType<typeof vi.fn>;
    recordRuntimeEvent: (event: Omit<AgentRuntimeEvent, 'id' | 'timestamp'>) => AgentRuntimeEvent;
};

const createStore = (overrides: Partial<TestState> = {}) => {
    let state: TestState = {
        settings: { provider: 'openai', language: 'Mandarin', openAIApiKey: 'key', geminiApiKey: '', simpleModel: 'gpt-5-mini', complexModel: 'gpt-5.2', autoConfirmGoal: true },
        chatHistory: [],
        isBusy: false,
        pendingClarification: null,
        activeTurn: null,
        cancelRequestedTurnId: null,
        runtimeEvents: [],
        csvData: { fileName: 'report.csv', data: [{ Amount: 10 }] },
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        logTelemetryEvent: vi.fn(),
        clearActiveTurnCancellation: vi.fn(),
        recordRuntimeEvent: (event) => {
            const stored = { ...event, id: `ev-${state.runtimeEvents.length + 1}`, timestamp: new Date() } as AgentRuntimeEvent;
            state = { ...state, runtimeEvents: [...state.runtimeEvents, stored] };
            return stored;
        },
        ...overrides,
    };
    const setState = (update: Partial<TestState> | ((s: TestState) => Partial<TestState>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };
    const getState = () => state;
    return { getState, setState };
};

describe('chatOrchestrator resilience — Pi follow-up guard (P0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        isProviderConfiguredMock.mockReturnValue(true);
        classifyChatIntentMock.mockResolvedValue({ target: 'agent_turn', findings: { intent: 'conversation', classifiedBy: 'deterministic', confidence: 'high' } });
        tryHandlePendingMutationConfirmationMock.mockResolvedValue(false);
        classifyRowDeleteIntentMock.mockReturnValue({ kind: 'unsupported' });
    });

    it('posts a Mandarin error message and resets isBusy when Pi throws', async () => {
        const store = createStore();
        runPiFollowUpTurnMock.mockRejectedValueOnce(new Error('Unexpected internal crash'));

        await orchestrateChatResponse('show me data', store as never);

        // isBusy must be false — chat must remain interactive
        expect(store.getState().isBusy).toBe(false);

        // An error message must have been added to chat history
        const errorMessages = store.getState().chatHistory.filter(
            (m: Record<string, unknown>) => m.isError === true,
        );
        expect(errorMessages).toHaveLength(1);

        // Message must be in Mandarin (settings.language = 'Mandarin') and contain Chinese
        // The message comes from formatUserError({ surface: 'chat', language: 'Mandarin' })
        expect(String(errorMessages[0].text)).toContain('意外错误');
    });

    it('does not propagate the Pi error to the caller', async () => {
        const store = createStore();
        runPiFollowUpTurnMock.mockRejectedValueOnce(new Error('Critical failure'));

        // Must not throw
        await expect(orchestrateChatResponse('query', store as never)).resolves.toBeUndefined();
    });

    it('posts error message in English when language is English', async () => {
        const store = createStore({
            settings: { provider: 'openai', language: 'English', openAIApiKey: 'key', geminiApiKey: '', simpleModel: 'gpt-5-mini', complexModel: 'gpt-5.2', autoConfirmGoal: true },
        });
        runPiFollowUpTurnMock.mockRejectedValueOnce(new Error('Failure'));

        await orchestrateChatResponse('query', store as never);

        const errorMsg = store.getState().chatHistory.find(
            (m: Record<string, unknown>) => m.isError === true,
        );
        // formatUserError({ surface: 'chat', language: 'English' }) returns 'unexpected error'
        expect(String(errorMsg?.text)).toContain('unexpected error');
    });

    it('routes every eligible follow-up turn directly to Pi', async () => {
        const store = createStore();
        runPiFollowUpTurnMock.mockResolvedValue({
            status: 'completed',
            appTurnId: 'turn-pi',
            text: 'Done.',
        });

        await orchestrateChatResponse('summarize the current report', store as never);

        expect(runPiFollowUpTurnMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'summarize the current report',
                intentFindings: expect.objectContaining({
                    intent: 'conversation',
                }),
            }),
            store,
        );
    });
});

describe('chatOrchestrator resilience — Pi approval guard (P0)', () => {
    const pending: ClarificationRequest = {
        question: 'Approve this dataset change?',
        options: [{ label: 'Approve', value: 'approve' }, { label: 'Deny', value: 'deny' }],
        interactionKind: 'approval',
        resumeContext: {
            piMutationApproval: {
                sessionId: 'session-1',
                datasetVersion: 'version-1',
                originalRequest: 'Change the dataset',
                args: { operation: 'update' },
            },
        },
    };
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        resolveEffectivePendingClarificationMock.mockReturnValue(pending);
    });

    it('posts an error and resets isBusy when Pi approval execution throws', async () => {
        const store = createStore({ pendingClarification: pending });
        resumePiMutationApprovalMock.mockRejectedValueOnce(new Error('Approval execution failed'));
        await handleClarificationResponse({ label: 'Approve', value: 'approve' }, store as never);
        expect(store.getState().isBusy).toBe(false);
        expect(store.getState().chatHistory.filter(message => message.isError === true)).toHaveLength(1);
    });

    it('passes the exact pending action and choice to Pi approval', async () => {
        const store = createStore({ pendingClarification: pending });
        resumePiMutationApprovalMock.mockResolvedValueOnce(undefined);
        const choice = { label: 'Approve', value: 'approve' };
        await handleClarificationResponse(choice, store as never);
        expect(resumePiMutationApprovalMock).toHaveBeenCalledWith(pending, choice, store);
    });

    it('denies interrupted older approval without executing it', async () => {
        const oldPending: ClarificationRequest = {
            question: 'Approve old action?',
            options: [{ label: 'Approve', value: 'approve' }],
            interactionKind: 'approval',
        };
        resolveEffectivePendingClarificationMock.mockReturnValue(oldPending);
        const store = createStore({ pendingClarification: oldPending });
        await handleClarificationResponse({ label: 'Approve', value: 'approve' }, store as never);
        expect(resumePiMutationApprovalMock).not.toHaveBeenCalled();
        expect(store.getState().pendingClarification).toBeNull();
        expect(String(store.getState().chatHistory.at(-1)?.text)).toContain('No changes were made');
    });
});
