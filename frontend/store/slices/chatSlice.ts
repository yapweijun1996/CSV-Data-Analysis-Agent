import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import type { ClarificationOption, ChatMessage, AiAction, QueuedChatTurn, ResolvedClarification, ClarificationRequest, StreamingMessage } from '../../types';
import { shouldAllowSettingsSurface } from '../../config/runtimeConfig';
import { getTranslation } from '../../utils/localization';
import { createChatMessage } from '../../utils/messageState';
import { createId } from '../../utils/createId';
import { parseCardMentions } from '../../utils/cardMentionParser';

// Lazy caches for agent/AI modules — populated on first chat action.
let _resolveEffectivePendingClarification: ((state: unknown) => ClarificationRequest | null) | null = null;
let _isProviderConfigured: ((settings: unknown) => boolean) | null = null;
const CHAT_DEBUG_ENABLED = import.meta.env.DEV;

const LOG_PREFIX = '[ChatSlice]';
const chatDebug = (message: string, detail?: unknown) => {
    if (!CHAT_DEBUG_ENABLED) return;
    if (detail === undefined) {
        console.debug(`[ChatDebug] ${message}`);
        return;
    }
    console.debug(`[ChatDebug] ${message}`, detail);
};

export interface IChatSlice {
    isAiFiltering: boolean;
    streamingMessage: StreamingMessage | null;
    setStreamingMessage: (text: string) => void;
    clearStreamingMessage: () => void;
    handleChatMessage: (message: string, options?: { source?: 'composer' | 'action'; displayText?: string }) => Promise<void>;
    handleClarificationResponse: (userChoice: ClarificationOption) => Promise<void>;
    handleNaturalLanguageQuery: (query: string) => Promise<void>;
    clearAiFilter: () => void;
    clearActiveDataQuery: () => void;
    confirmGoal: (goalTitle: string) => Promise<void>;
}

export const createChatSlice: StateCreator<AppStore, [], [], IChatSlice> = (set, get) => {
    const storeApi = { getState: get, setState: set };
    let isDrainingQueuedTurns = false;

    /**
     * Persist a resolved clarification so subsequent turns can reference it
     * without re-asking. Keyed by `targetProperty` or question prefix.
     * New value for the same key replaces the old one.
     */
    const storeResolvedClarification = (clarification: ClarificationRequest, value: string) => {
        if (!value.trim()) return;
        const key = clarification.targetProperty ?? clarification.question.slice(0, 60);
        const resolvedAtTurn = get().chatHistory.length;
        const entry: ResolvedClarification = { key, question: clarification.question, value, resolvedAtTurn };
        set(prev => ({
            resolvedClarifications: [
                ...(prev.resolvedClarifications ?? []).filter(c => c.key !== key),
                entry,
            ],
        }));
        void import('../../services/agent/memory/vectorMemorySync')
            .then(({ upsertAcceptedDecisionDoc }) =>
                upsertAcceptedDecisionDoc(storeApi as never, entry))
            .catch(error => {
                console.warn(`${LOG_PREFIX} Failed to retain accepted decision (non-blocking):`, error);
            });
    };

    // Guard: prevent concurrent context refreshes from piling up.
    let isRefreshingContext = false;

    const refreshContextualSummaryIfNeeded = async () => {
        if (isRefreshingContext) return;
        isRefreshingContext = true;
        try {
            const { shouldRefreshContextualSummary, generateContextualSummary, markContextualSummaryRefreshed } =
                await import('../../services/ai/contextManager');
            const state = get();
            if (!shouldRefreshContextualSummary(state.sessionId, state.chatHistory.length)) {
                return;
            }

            const nextSummary = await generateContextualSummary({
                settings: state.settings,
                confirmedGoal: state.confirmedAnalysisGoal,
                aiCoreAnalysisSummary: state.aiCoreAnalysisSummary?.text ?? null,
                contextualSummary: state.contextualSummary,
                datasetKnowledge: state.agentMemoryRun?.findings.datasetKnowledge,
                chatHistory: state.chatHistory,
                analysisCards: state.analysisCards,
                telemetryTarget: state,
            });

            set({ contextualSummary: nextSummary.summary });
            markContextualSummaryRefreshed(state.sessionId, get().chatHistory.length);
        } finally {
            isRefreshingContext = false;
        }
    };

    /** Fire-and-forget wrapper — context refresh runs in background, never blocks chat flow. */
    const fireContextRefresh = () => {
        refreshContextualSummaryIfNeeded().catch(err =>
            console.warn(`${LOG_PREFIX} Background context refresh failed (non-blocking):`, err),
        );
    };

    const appendUserMessage = (text: string) => {
        const { cardIds, displayText } = parseCardMentions(text);
        set(prev => ({
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'user',
                    text: displayText,
                    timestamp: new Date(),
                    type: 'user_message',
                    ...(cardIds.length > 0 ? { referencedCardIds: cardIds } : {}),
                }),
            ],
        }));
    };

    const getQueuedChatTurns = () => get().queuedChatTurns ?? [];
    const getEffectivePendingClarification = (): ClarificationRequest | null => {
        if (!_resolveEffectivePendingClarification) return null;
        return _resolveEffectivePendingClarification(get());
    };

    const hasRunningTurn = () => get().activeTurn?.status === 'running';
    const canDrainQueuedTurns = () => {
        const state = get();
        return !hasRunningTurn() && !getEffectivePendingClarification() && !state.pendingMutationConfirmation;
    };

    const enqueueChatTurn = (message: string) => {
        const queuedTurn: QueuedChatTurn = {
            id: createId('queued-chat-turn'),
            message,
            enqueuedAt: new Date(),
        };
        set(prev => ({
            queuedChatTurns: [...(prev.queuedChatTurns ?? []), queuedTurn],
        }));
    };

    const appendAiMessage = (
        text: string,
        type: 'ai_message' | 'ai_enhancement_suggestion' = 'ai_message',
        extras?: Partial<ChatMessage>,
    ) => {
        set(prev => ({
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text,
                    timestamp: new Date(),
                    type,
                    ...extras,
                }),
            ],
        }));
    };

    const executeControlledSpreadsheetFilter = async (
        rawQuery: string,
        origin: 'chat' | 'spreadsheet_panel',
    ) => {
        const query = rawQuery.trim();
        if (!query) return;

        const action: AiAction = {
            type: 'tool_call',
            toolName: 'spreadsheet.filter',
            args: { query },
        };

        appendUserMessage(query);
        set({ isBusy: true, chatLifecycleState: 'running', pendingClarification: null });

        try {
            const { handleAiAction } = await import('../../services/agent/actionHandler');
            const result = await handleAiAction(action, storeApi, { spreadsheetFilterOrigin: origin });
            if (result.status === 'success') {
                const observedReply = result.observation?.summary?.trim() || result.message;
                if (observedReply) {
                    appendAiMessage(observedReply);
                }
                return;
            }

            appendAiMessage(result.observation?.summary ?? result.message, 'ai_message', { isError: true });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            appendAiMessage(
                getTranslation('chat_temporary_filter_failed', get().settings.language, { message: errorMessage }),
                'ai_message',
                { isError: true },
            );
        } finally {
            set({ isBusy: false, chatLifecycleState: 'idle' as const });
        }
    };

    const ensureProviderHealthy = async (): Promise<boolean> => {
        const settings = get().settings;

        // Fast sync path: if lazy cache is loaded and key is empty, fail immediately.
        if (_isProviderConfigured && !_isProviderConfigured(settings)) {
            const message = shouldAllowSettingsSurface()
                ? 'API Key is not set.'
                : getTranslation('api_key_required_managed_message', settings.language);
            if (shouldAllowSettingsSurface()) {
                get().addProgress(message, 'error');
                get().setIsSettingsModalOpen(true);
            } else {
                get().addProgress(message, 'error');
            }
            appendAiMessage(message, 'ai_message', { isError: true });
            return false;
        }
        if (!_isProviderConfigured) return false;

        // Async health check with TTL cache.
        const { validateProviderHealth } = await import('../../services/ai/providerConfig');
        const health = await validateProviderHealth(settings);
        if (health.status === 'healthy') return true;

        const errorMessages: Record<string, string> = {
            not_configured: 'API Key is not set.',
            invalid_key: getTranslation('provider_health_invalid_key', settings.language),
            unreachable: getTranslation('provider_health_unreachable', settings.language),
        };
        const message = errorMessages[health.status] ?? 'AI provider is unavailable.';

        if (shouldAllowSettingsSurface() && health.status !== 'unreachable') {
            get().addProgress(message, 'error');
            get().setIsSettingsModalOpen(true);
        } else {
            get().addProgress(message, 'error');
        }
        appendAiMessage(message, 'ai_message', { isError: true });
        return false;
    };

    const runImmediateChatTurn = async (
        message: string,
        options: {
            appendUserMessage: boolean;
            drainAfter?: boolean;
            /** Text shown in the chat bubble. Defaults to `message` when omitted. */
            displayText?: string;
        },
    ) => {
        if (options.appendUserMessage) {
            set(prev => ({
                isBusy: true,
                chatLifecycleState: 'running' as const,
                pendingClarification: null,
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({ sender: 'user', text: options.displayText ?? message, timestamp: new Date(), type: 'user_message' }),
                ],
            }));
        } else {
            set({ isBusy: true, chatLifecycleState: 'running' as const, pendingClarification: null });
        }

        try {
            const { orchestrateChatResponse } = await import('../../services/agent/orchestration/chatOrchestrator');
            await orchestrateChatResponse(message, storeApi);
            fireContextRefresh();

            if (options.drainAfter !== false) {
                await drainQueuedChatTurns();
            }
        } finally {
            // Safety net: always clear busy state. Only force chatLifecycleState
            // to 'failed' if runtimeFinalize never ran (still 'running').
            const currentLifecycle = get().chatLifecycleState;
            set({
                isBusy: false,
                ...(currentLifecycle === 'running'
                    ? { chatLifecycleState: 'failed' as const }
                    : {}),
            });
        }
    };

    const drainQueuedChatTurns = async () => {
        if (isDrainingQueuedTurns || !canDrainQueuedTurns()) {
            return;
        }

        isDrainingQueuedTurns = true;
        try {
            while (canDrainQueuedTurns()) {
                // Atomic read+dequeue: extract message and remove head inside a
                // single set() call so no interleaving can separate the two steps.
                let nextMessage: string | undefined;
                set(prev => {
                    const queue = prev.queuedChatTurns ?? [];
                    if (queue.length === 0) return prev;
                    nextMessage = queue[0].message;
                    return { queuedChatTurns: queue.slice(1) };
                });
                if (!nextMessage) return;

                await runImmediateChatTurn(nextMessage, {
                    appendUserMessage: false,
                    drainAfter: false,
                });
            }
        } finally {
            isDrainingQueuedTurns = false;
        }
    };

    return {
        isAiFiltering: false,
        streamingMessage: null,
        setStreamingMessage: (text: string) => {
            set(prev => ({
                streamingMessage: prev.streamingMessage
                    ? { ...prev.streamingMessage, text }
                    : { text, isStreaming: true, startedAt: new Date() },
            }));
        },
        clearStreamingMessage: () => set({ streamingMessage: null }),

        confirmGoal: async (goalTitle) => {
            const { confirmAnalysisGoal } = await import('../../services/agent/orchestration/sessionManager');
            await confirmAnalysisGoal(goalTitle, storeApi);
        },

        handleChatMessage: async (message, options) => {
            // Show the user message in chat IMMEDIATELY — before any async work
            // (lazy imports, health checks, intent classification). This ensures
            // the user sees their message right away regardless of API latency.
            // Exception: if a clarification is pending, skip — the Pi interaction resume will
            // add its own formatted message ("Clarification selected: ...").
            const displayText = options?.displayText ?? message;
            const source = options?.source ?? 'composer';
            const hasPendingClar = Boolean(get().pendingClarification) && !hasRunningTurn();
            if ((source === 'composer' || source === 'action') && !hasPendingClar) {
                appendUserMessage(displayText);
            }

            // Ensure lazy caches are populated before any sync helpers run.
            // Also preload chatOrchestrator so runImmediateChatTurn's import()
            // resolves synchronously — otherwise the extra async boundary lets
            // a second queued message bypass the hasRunningTurn() guard.
            if (!_resolveEffectivePendingClarification || !_isProviderConfigured) {
                const [clarificationMod, providerMod] = await Promise.all([
                    import('../../services/agent/runtime/runtimeClarification'),
                    import('../../services/ai/providerConfig'),
                    import('../../services/agent/orchestration/chatOrchestrator'),
                ]);
                _resolveEffectivePendingClarification = clarificationMod.resolveEffectivePendingClarification;
                _isProviderConfigured = providerMod.isProviderConfigured;
            }

            if (get().goalState === 'awaiting_user_confirmation') {
                await get().confirmGoal(message);
                return;
            }

            if (!(await ensureProviderHealthy())) {
                return;
            }

            const pendingClarification = getEffectivePendingClarification();
            if (pendingClarification && !hasRunningTurn()) {
                chatDebug('Composer message intercepted by pending clarification.', {
                    message,
                    clarificationQuestion: pendingClarification.question,
                    clarificationMode: pendingClarification.clarificationMode ?? null,
                    allowFreeText: pendingClarification.allowFreeText ?? null,
                    activeTurnStatus: get().activeTurn?.status ?? null,
                    pendingClarificationInStore: Boolean(get().pendingClarification),
                });
                const { buildClarificationFollowUpPrompt, handleClarificationResponse: processClarificationResponse } =
                    await import('../../services/agent/runtime/runtimeClarification').then(async clarMod => {
                        const { handleClarificationResponse: procClarResp } = await import('../../services/agent/orchestration/chatOrchestrator');
                        return { ...clarMod, handleClarificationResponse: procClarResp };
                    });
                const trimmedMessage = message.trim();
                if (!trimmedMessage) {
                    set(prev => ({
                        chatHistory: [
                            ...prev.chatHistory,
                            createChatMessage({
                                sender: 'ai',
                                text: buildClarificationFollowUpPrompt(pendingClarification, get().settings.language),
                                timestamp: new Date(),
                                type: 'ai_message',
                            }),
                        ],
                    }));
                    return;
                }
                storeResolvedClarification(pendingClarification, trimmedMessage);
                await processClarificationResponse({
                    label: trimmedMessage,
                    value: trimmedMessage,
                }, storeApi);
                fireContextRefresh();
                await drainQueuedChatTurns();
                return;
            }

            if (hasRunningTurn()) {
                if (source !== 'composer') {
                    chatDebug('Ignored non-composer message while a runtime turn is running.', {
                        message,
                        source,
                        activeTurnId: get().activeTurn?.turnId ?? null,
                    });
                    return;
                }

                console.log(`${LOG_PREFIX} Queued composer message while another turn is running.`, { message });
                chatDebug('Queued composer message while runtime turn is running.', {
                    message,
                    activeTurnId: get().activeTurn?.turnId ?? null,
                    queuedCountBeforeEnqueue: getQueuedChatTurns().length,
                });
                // User message already appended at the top of handleChatMessage.
                enqueueChatTurn(message);
                return;
            }

            console.log(`${LOG_PREFIX} User message received for runtime turn.`, { message });
            chatDebug('Starting fresh runtime turn from composer input.', {
                message,
                currentView: get().currentView,
                isBusy: get().isBusy,
                activeTurnStatus: get().activeTurn?.status ?? null,
                hasPendingClarification: Boolean(getEffectivePendingClarification()),
            });
            // User message already appended at the top of handleChatMessage.
            await runImmediateChatTurn(message, {
                appendUserMessage: false,
                displayText: options?.displayText,
            });
        },

        handleClarificationResponse: async (userChoice) => {
            if (get().isBusy) {
                chatDebug('Ignored clarification response because chat is already busy.', {
                    userChoice,
                    activeTurnStatus: get().activeTurn?.status ?? null,
                    hasPendingClarification: Boolean(getEffectivePendingClarification()),
                });
                return;
            }
            set({ isBusy: true, chatLifecycleState: 'running' as const });
            chatDebug('Handling clarification response.', {
                userChoice,
                activeTurnStatus: get().activeTurn?.status ?? null,
                pendingClarificationQuestion: getEffectivePendingClarification()?.question ?? null,
            });
            // Ensure lazy cache is populated
            try {
                if (!_resolveEffectivePendingClarification) {
                    const mod = await import('../../services/agent/runtime/runtimeClarification');
                    _resolveEffectivePendingClarification = mod.resolveEffectivePendingClarification;
                }
                const pendingClarification = getEffectivePendingClarification();
                if (pendingClarification) {
                    storeResolvedClarification(pendingClarification, userChoice.value || userChoice.label);
                }
                const { handleClarificationResponse: processClarificationResponse } = await import('../../services/agent/orchestration/chatOrchestrator');
                await processClarificationResponse(userChoice, storeApi);
                fireContextRefresh();
                await drainQueuedChatTurns();
            } finally {
                chatDebug('Clarification response handling finished.', {
                    userChoice,
                    activeTurnStatus: get().activeTurn?.status ?? null,
                    hasPendingClarification: Boolean(getEffectivePendingClarification()),
                    isBusy: get().isBusy,
                });
                // Safety net: clear isBusy. Only override chatLifecycleState if
                // runtimeFinalize never ran (still 'running') — treat as failed.
                const currentLifecycle = get().chatLifecycleState;
                set({
                    isBusy: false,
                    ...(currentLifecycle === 'running'
                        ? { chatLifecycleState: 'failed' as const }
                        : {}),
                });
            }
        },

        handleNaturalLanguageQuery: async (query) => {
            await executeControlledSpreadsheetFilter(query, 'spreadsheet_panel');
            fireContextRefresh();
        },

        clearAiFilter: () => {
            set({ activeSpreadsheetFilter: null, spreadsheetFilterFunction: null, aiFilterExplanation: null });
            get().addProgress('AI data filter cleared.');
            console.log(`${LOG_PREFIX} AI spreadsheet filter cleared.`);
        },

        clearActiveDataQuery: () => {
            set({ activeDataQuery: null });
            get().addProgress('AI data query cleared.');
            console.log(`${LOG_PREFIX} AI data query cleared.`);
        },
    };
};
