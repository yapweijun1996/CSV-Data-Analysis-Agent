import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatSlice } from '../store/slices/chatSlice';

const {
    orchestrateChatResponseMock,
    handleClarificationResponseMock,
    handleAiActionMock,
    isProviderConfiguredMock,
} = vi.hoisted(() => ({
    orchestrateChatResponseMock: vi.fn(),
    handleClarificationResponseMock: vi.fn(),
    handleAiActionMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
}));

vi.mock('../services/agent/orchestration/chatOrchestrator', () => ({
    orchestrateChatResponse: orchestrateChatResponseMock,
    handleClarificationResponse: handleClarificationResponseMock,
}));

vi.mock('../services/agent/actionHandler', () => ({
    handleAiAction: handleAiActionMock,
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

type HarnessState = ReturnType<typeof createBaseState> & ReturnType<typeof createChatSlice>;

const createBaseState = () => ({
    goalState: 'idle' as const,
    isBusy: false,
    pendingClarification: null,
    pendingMutationConfirmation: null,
    activeTurn: null,
    queuedChatTurns: [],
    activeDataQuery: null,
    activeSpreadsheetFilter: null,
    spreadsheetFilterFunction: null,
    aiFilterExplanation: null,
    isSpreadsheetVisible: false,
    chatHistory: [] as Array<{ sender: 'user' | 'ai'; text: string; timestamp: Date; type?: string; isError?: boolean }>,
    settings: {
        provider: 'openai' as const,
        geminiApiKey: '',
        openAIApiKey: 'key',
        simpleModel: 'gpt-5-mini',
        complexModel: 'gpt-5.2',
        language: 'English' as const,
        autoConfirmGoal: true,
    },
    sessionId: 'session-1',
    addProgress: vi.fn(),
    setIsSettingsModalOpen: vi.fn(),
    confirmedAnalysisGoal: null,
    aiCoreAnalysisSummary: null,
    contextualSummary: null,
    agentMemoryRun: null,
    analysisCards: [],
    cardEnhancementSuggestions: [],
    csvData: {
        fileName: 'report.csv',
        data: [
            { Description: 'CONSTRUCTION CONTRACT REVENUE', Amount: 10 },
        ],
    },
    columnProfiles: [
        { name: 'Description', type: 'categorical' as const, uniqueValues: 1, missingPercentage: 0 },
        { name: 'Amount', type: 'numerical' as const, missingPercentage: 0, valueRange: [10, 10] as [number, number] },
    ],
});

const createHarness = () => {
    let state = createBaseState() as HarnessState;
    const set = (update: Partial<HarnessState> | ((current: HarnessState) => Partial<HarnessState>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };
    const get = () => state;
    const slice = createChatSlice(set as never, get as never, {} as never);
    state = { ...state, ...slice };
    return {
        getState: () => state,
        setState: set,
    };
};

describe('chatSlice runtime entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isProviderConfiguredMock.mockReturnValue(true);
        handleAiActionMock.mockResolvedValue({
            status: 'success',
            toolName: 'spreadsheet.filter',
            message: 'Executed spreadsheet.filter',
            shouldStop: false,
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: 'I applied a temporary data filter in the raw data explorer.',
                toolName: 'spreadsheet.filter',
                queryMode: 'filtered',
            },
        });
    });

    it('routes delete-like chat requests into runtime orchestration instead of preflight branches', async () => {
        const harness = createHarness();

        await harness.getState().handleChatMessage('remove rows where Code = 501001');

        expect(orchestrateChatResponseMock).toHaveBeenCalledOnce();
        expect(orchestrateChatResponseMock).toHaveBeenCalledWith(
            'remove rows where Code = 501001',
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
        );
        expect(harness.getState().chatHistory).toHaveLength(1);
        expect(harness.getState().chatHistory[0]?.text).toBe('remove rows where Code = 501001');
    });

    it('routes suggestion-style commands into runtime orchestration instead of chat-side handlers', async () => {
        const harness = createHarness();

        await harness.getState().handleChatMessage('approve S1');

        expect(orchestrateChatResponseMock).toHaveBeenCalledOnce();
        expect(harness.getState().chatHistory).toHaveLength(1);
        expect(harness.getState().chatHistory[0]?.text).toBe('approve S1');
    });

    it('blocks runtime orchestration when the provider is not configured', async () => {
        const harness = createHarness();
        isProviderConfiguredMock.mockReturnValue(false);

        await harness.getState().handleChatMessage('show me all rows where Address contains TUAS');

        expect(orchestrateChatResponseMock).not.toHaveBeenCalled();
        expect(harness.getState().setIsSettingsModalOpen).toHaveBeenCalledWith(true);
        expect(harness.getState().chatHistory).toHaveLength(2);
        expect(harness.getState().chatHistory[0]?.text).toBe('show me all rows where Address contains TUAS');
        expect(harness.getState().chatHistory[1]).toEqual(expect.objectContaining({
            sender: 'ai',
            text: 'API Key is not set.',
            isError: true,
        }));
    });

    it('keeps spreadsheet Ask AI on the controlled spreadsheet.filter execution path', async () => {
        const harness = createHarness();
        handleAiActionMock.mockImplementationOnce(async (_action, storeApi) => {
            storeApi.setState({ isSpreadsheetVisible: true });
            return {
                status: 'success',
                toolName: 'spreadsheet.filter',
                message: 'Executed spreadsheet.filter',
                shouldStop: false,
                observation: {
                    type: 'tool_result',
                    status: 'success',
                    summary: 'I applied a temporary data filter in the raw data explorer for rows where Description contains "CONSTRUCTION CONTRACT REVENUE". It matched 1 row.',
                    toolName: 'spreadsheet.filter',
                    queryMode: 'filtered',
                },
            };
        });

        await harness.getState().handleNaturalLanguageQuery('show me all record CONSTRUCTION CONTRACT REVENUE');

        expect(handleAiActionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'tool_call',
                toolName: 'spreadsheet.filter',
                args: { query: 'show me all record CONSTRUCTION CONTRACT REVENUE' },
            }),
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
            expect.objectContaining({ spreadsheetFilterOrigin: 'spreadsheet_panel' }),
        );
        expect(harness.getState().isSpreadsheetVisible).toBe(true);
        expect(harness.getState().chatHistory).toHaveLength(2);
        expect(harness.getState().chatHistory[1]?.text).toContain('temporary data filter');
    });

    it('queues composer messages while a runtime turn is already running and drains them in FIFO order', async () => {
        const harness = createHarness();
        let resolveFirstTurn: (() => void) | undefined;

        orchestrateChatResponseMock.mockImplementation(async (message, storeApi) => {
            if (message === 'first request') {
                storeApi.setState({
                    activeTurn: {
                        turnId: 'turn-1',
                        userMessage: message,
                        status: 'running',
                        startedAt: new Date('2026-03-12T01:00:00.000Z'),
                        budgetStatus: {
                            maxSteps: 6,
                            stepsUsed: 0,
                            retryCounts: {},
                            exhausted: false,
                        },
                        steps: [],
                    },
                });

                await new Promise<void>((resolve) => {
                    resolveFirstTurn = () => {
                        storeApi.setState({ activeTurn: null });
                        resolve();
                    };
                });
                return;
            }

            storeApi.setState({
                activeTurn: {
                    turnId: `turn-${message}`,
                    userMessage: message,
                    status: 'running',
                    startedAt: new Date('2026-03-12T01:01:00.000Z'),
                    budgetStatus: {
                        maxSteps: 6,
                        stepsUsed: 0,
                        retryCounts: {},
                        exhausted: false,
                    },
                    steps: [],
                },
            });
            storeApi.setState({ activeTurn: null });
        });

        const firstTurnPromise = harness.getState().handleChatMessage('first request');
        // Agent modules are now lazily imported — wait until the first turn
        // actually starts (activeTurn is set by the mock) before sending the
        // second message.
        await vi.waitFor(() => expect(orchestrateChatResponseMock).toHaveBeenCalledTimes(1));

        await harness.getState().handleChatMessage('second request');

        expect(orchestrateChatResponseMock).toHaveBeenCalledTimes(1);
        expect(harness.getState().queuedChatTurns).toHaveLength(1);
        expect(harness.getState().chatHistory.map(message => message.text)).toEqual([
            'first request',
            'second request',
        ]);

        resolveFirstTurn?.();
        await firstTurnPromise;

        expect(orchestrateChatResponseMock).toHaveBeenCalledTimes(2);
        expect(orchestrateChatResponseMock.mock.calls.map(([message]) => message)).toEqual([
            'first request',
            'second request',
        ]);
        expect(harness.getState().queuedChatTurns).toHaveLength(0);
        expect(harness.getState().chatHistory.map(message => message.text)).toEqual([
            'first request',
            'second request',
        ]);
    });

    it('does not queue suggested-action messages while a runtime turn is already running but keeps the visible user action', async () => {
        const harness = createHarness();
        harness.setState({
            activeTurn: {
            turnId: 'turn-1',
            userMessage: 'first request',
            status: 'running',
            startedAt: new Date('2026-03-12T01:00:00.000Z'),
            budgetStatus: {
                maxSteps: 6,
                stepsUsed: 0,
                retryCounts: {},
                exhausted: false,
            },
            steps: [],
        },
        });

        await harness.getState().handleChatMessage('suggest a follow-up', { source: 'action' });

        expect(orchestrateChatResponseMock).not.toHaveBeenCalled();
        expect(harness.getState().queuedChatTurns).toHaveLength(0);
        expect(harness.getState().chatHistory).toHaveLength(1);
        expect(harness.getState().chatHistory[0]?.text).toBe('suggest a follow-up');
    });

    it('uses a typed chat reply to resume a free-text clarification instead of starting a new turn', async () => {
        const harness = createHarness();
        harness.setState({
            pendingClarification: {
                question: 'Which combination of dimensions should define a unique record?',
                options: [],
                allowFreeText: true,
                clarificationMode: 'free_text',
            },
        } as never);

        await harness.getState().handleChatMessage('Code + Description');

        expect(handleClarificationResponseMock).toHaveBeenCalledOnce();
        expect(handleClarificationResponseMock).toHaveBeenCalledWith(
            {
                label: 'Code + Description',
                value: 'Code + Description',
            },
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
        );
        expect(orchestrateChatResponseMock).not.toHaveBeenCalled();
    });

    it('uses activeTurn clarification fallback when pendingClarification is missing', async () => {
        const harness = createHarness();
        harness.setState({
            pendingClarification: null,
            activeTurn: {
                turnId: 'turn-clarify',
                userMessage: 'find duplicates',
                status: 'waiting_for_clarification',
                startedAt: new Date('2026-03-12T01:00:00.000Z'),
                pendingClarificationRequest: {
                    question: 'Which combination of dimensions should define a unique record?',
                    options: [],
                    allowFreeText: true,
                    clarificationMode: 'free_text',
                },
                budgetStatus: {
                    maxSteps: 6,
                    stepsUsed: 1,
                    retryCounts: {},
                    exhausted: false,
                },
                steps: [],
            },
        } as never);

        await harness.getState().handleChatMessage('Code + Description + SeriesKey');

        expect(handleClarificationResponseMock).toHaveBeenCalledOnce();
        expect(orchestrateChatResponseMock).not.toHaveBeenCalled();
    });

    it('uses a typed chat reply to resolve a structured clarification instead of blocking the composer', async () => {
        const harness = createHarness();
        harness.setState({
            pendingClarification: {
                question: 'Which analysis dimension should we prioritize?',
                options: [
                    { label: 'By project', value: 'project' },
                    { label: 'By series label', value: 'series_label_1' },
                ],
                allowFreeText: false,
                clarificationMode: 'options',
            },
        } as never);

        await harness.getState().handleChatMessage('By project');

        expect(handleClarificationResponseMock).toHaveBeenCalledOnce();
        expect(handleClarificationResponseMock).toHaveBeenCalledWith(
            {
                label: 'By project',
                value: 'By project',
            },
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
        );
        expect(orchestrateChatResponseMock).not.toHaveBeenCalled();
    });

    it('ignores repeated clarification resumes while the first resume is still running', async () => {
        const harness = createHarness();
        harness.setState({
            pendingClarification: {
                question: 'Which analysis dimension should we prioritize?',
                options: [
                    { label: 'EQPM', value: 'EQPM' },
                    { label: 'yes', value: 'yes' },
                ],
                allowFreeText: false,
                clarificationMode: 'options',
            },
        } as never);

        let resolveResume: (() => void) | null = null;
        handleClarificationResponseMock.mockImplementationOnce(async () => {
            await new Promise<void>(resolve => {
                resolveResume = resolve;
            });
        });

        const firstResume = harness.getState().handleClarificationResponse({ label: 'EQPM', value: 'EQPM' });
        const secondResume = harness.getState().handleClarificationResponse({ label: 'yes', value: 'yes' });

        await vi.waitFor(() => expect(handleClarificationResponseMock).toHaveBeenCalledTimes(1));
        resolveResume?.();
        await firstResume;
        await secondResume;

        expect(handleClarificationResponseMock).toHaveBeenCalledTimes(1);
        expect(harness.getState().isBusy).toBe(false);
    });

    it('routes low-information free-text clarification replies through the runtime clarification resume path', async () => {
        const harness = createHarness();
        harness.setState({
            pendingClarification: {
                question: 'Which combination of dimensions should define a unique record?',
                options: [],
                allowFreeText: true,
                clarificationMode: 'free_text',
            },
        } as never);

        await harness.getState().handleChatMessage('upto you');

        expect(handleClarificationResponseMock).toHaveBeenCalledOnce();
        expect(handleClarificationResponseMock).toHaveBeenCalledWith(
            {
                label: 'upto you',
                value: 'upto you',
            },
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
        );
        expect(orchestrateChatResponseMock).not.toHaveBeenCalled();
    });
});
