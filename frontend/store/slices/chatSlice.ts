import { captureSessionScope, ownsSessionScope, scopeStore, type SessionScope } from '../../services/session/sessionOwnership';
import { getCurrentAnalysisDatasetVersion } from '../../services/agent/artifactProvenance';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import type { ClarificationOption, ChatMessage, AiAction, QueuedChatTurn, ResolvedClarification, ClarificationRequest, StreamingMessage } from '../../types';
import { shouldAllowSettingsSurface } from '../../config/runtimeConfig';
import { getTranslation } from '../../utils/localization';
import { createChatMessage } from '../../utils/messageState';
import { createId } from '../../utils/createId';
import { selectReplyVersion } from '../../utils/replyVersions';
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
    setStreamingMessage: (text: string, reasoning?: string) => void;
    clearStreamingMessage: () => void;
    /** Assistant message whose next finished reply is stored as a new version instead of a new bubble. */
    pendingReplyRetryId: string | null;
    retryAssistantReply: (messageId: string) => Promise<void>;
    selectReplyVersion: (messageId: string, index: number) => void;
    deleteChatMessage: (messageId: string) => void;
    handleChatMessage: (message: string, options?: { source?: 'composer' | 'action' | 'retry'; displayText?: string }) => Promise<void>;
    handleClarificationResponse: (userChoice: ClarificationOption) => Promise<void>;
    handleNaturalLanguageQuery: (query: string) => Promise<void>;
    clearAiFilter: () => void;
    clearActiveDataQuery: () => void;
    confirmGoal: (goalTitle: string) => Promise<void>;
}

export const createChatSlice: StateCreator<AppStore, [], [], IChatSlice> = (set, get) => {
    const storeApi = { getState: get, setState: set };
    let drainingScope: SessionScope | null = null;

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
    let refreshingScope: SessionScope | null = null;

    const refreshContextualSummaryIfNeeded = async () => {
        const scope = captureSessionScope(storeApi);
        if (refreshingScope === scope) return;
        refreshingScope = scope;
        try {
            const { shouldRefreshContextualSummary, generateContextualSummary, markContextualSummaryRefreshed } =
                await import('../../services/ai/contextManager');
            if (!ownsSessionScope(storeApi, scope)) return;
            const state = get();
            const version = getCurrentAnalysisDatasetVersion(state);
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

            if (!ownsSessionScope(storeApi, scope) || getCurrentAnalysisDatasetVersion(get()) !== version) return;
            set({ contextualSummary: nextSummary.summary });
            markContextualSummaryRefreshed(state.sessionId, get().chatHistory.length);
        } finally {
            if (refreshingScope === scope) refreshingScope = null;
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
        const scope = captureSessionScope(storeApi);
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
            if (!ownsSessionScope(storeApi, scope)) return;
            const result = await handleAiAction(action, scopeStore(storeApi, scope), { spreadsheetFilterOrigin: origin });
            if (!ownsSessionScope(storeApi, scope)) return;
            if (result.status === 'success') {
                const observedReply = result.observation?.summary?.trim() || result.message;
                if (observedReply) {
                    appendAiMessage(observedReply);
                }
                return;
            }

            appendAiMessage(result.observation?.summary ?? result.message, 'ai_message', { isError: true });
        } catch (error) {
            if (!ownsSessionScope(storeApi, scope)) return;
            const errorMessage = error instanceof Error ? error.message : String(error);
            appendAiMessage(
                getTranslation('chat_temporary_filter_failed', get().settings.language, { message: errorMessage }),
                'ai_message',
                { isError: true },
            );
        } finally {
            if (ownsSessionScope(storeApi, scope) && !get().activeExecution) set({ isBusy: false, chatLifecycleState: 'idle' as const });
        }
    };

    const ensureProviderHealthy = async (): Promise<boolean> => {
        const settings = get().settings;

        // Fast sync path: if lazy cache is loaded and key is empty, fail immediately.
        if (_isProviderConfigured && !_isProviderConfigured(settings)) {
            const message = shouldAllowSettingsSurface()
                ? getTranslation('provider_health_not_configured', settings.language)
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

        return true;
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
        const scope = captureSessionScope(storeApi);
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
            if (!ownsSessionScope(storeApi, scope)) return;
            await orchestrateChatResponse(message, scopeStore(storeApi, scope));
            if (!ownsSessionScope(storeApi, scope)) return;
            fireContextRefresh();

            if (options.drainAfter !== false) {
                await drainQueuedChatTurns();
            }
        } finally {
            // Safety net: always clear busy state. Only force chatLifecycleState
            // to 'failed' if runtimeFinalize never ran (still 'running').
            const currentLifecycle = get().chatLifecycleState;
            if (ownsSessionScope(storeApi, scope) && !get().activeExecution) set({
                isBusy: false,
                ...(currentLifecycle === 'running'
                    ? { chatLifecycleState: 'failed' as const }
                    : {}),
            });
        }
    };

    const drainQueuedChatTurns = async () => {
        const scope = captureSessionScope(storeApi);
        if (drainingScope === scope || !canDrainQueuedTurns()) {
            return;
        }

        drainingScope = scope;
        try {
            while (ownsSessionScope(storeApi, scope) && canDrainQueuedTurns()) {
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
            if (drainingScope === scope) drainingScope = null;
        }
    };

    return {
        isAiFiltering: false,
        streamingMessage: null,
        pendingReplyRetryId: null,
        retryAssistantReply: async (messageId) => {
            const state = get();
            if (state.isBusy || hasRunningTurn()) return;
            const history = state.chatHistory;
            const index = history.findIndex(m => m.id === messageId);
            if (index < 0) return;
            // Retry only the newest answer: the model context after it would otherwise be inconsistent.
            if (history.slice(index + 1).some(m => m.sender === 'ai' && !m.isRunSummary && (m.type ?? 'ai_message') === 'ai_message')) return;
            const prompt = [...history.slice(0, index)].reverse().find(m => m.sender === 'user' && m.type === 'user_message');
            if (!prompt?.text.trim()) return;
            set({ pendingReplyRetryId: messageId });
            await get().handleChatMessage(prompt.text, { source: 'retry' });
            // The turn may have been blocked before it produced a reply; never leave a stale target behind.
            if (!get().isBusy && !hasRunningTurn() && get().pendingReplyRetryId === messageId) set({ pendingReplyRetryId: null });
        },
        selectReplyVersion: (messageId, index) => {
            set(prev => ({ chatHistory: prev.chatHistory.map(m => m.id === messageId ? selectReplyVersion(m, index) : m) }));
        },
        deleteChatMessage: (messageId) => {
            if (get().isBusy) return;
            set(prev => ({ chatHistory: prev.chatHistory.filter(m => m.id !== messageId) }));
        },
        setStreamingMessage: (text: string, reasoning?: string) => {
            set(prev => ({
                streamingMessage: prev.streamingMessage
                    ? { ...prev.streamingMessage, text, ...(reasoning !== undefined ? { reasoning } : {}) }
                    : { text, isStreaming: true, startedAt: new Date(), ...(reasoning ? { reasoning } : {}) },
            }));
        },
        clearStreamingMessage: () => set({ streamingMessage: null }),

        confirmGoal: async (goalTitle) => {
            const scope = captureSessionScope(storeApi);
            const { confirmAnalysisGoal } = await import('../../services/agent/orchestration/sessionManager');
            if (!ownsSessionScope(storeApi, scope)) return;
            await confirmAnalysisGoal(goalTitle, scopeStore(storeApi, scope));
        },

        handleChatMessage: async (message, options) => {
            const scope = captureSessionScope(storeApi);
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

            if (!ownsSessionScope(storeApi, scope)) return;
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
                if (!ownsSessionScope(storeApi, scope)) return;
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
                if (!ownsSessionScope(storeApi, scope)) return;
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
                // Steer the running Pi agent with the new message; fall back to the queue when it cannot take one.
                const runningTurnId = get().activeTurn?.turnId;
                if (runningTurnId) {
                    try {
                        const { steerPiFollowUpTurn } = await import('../../services/agent/runtime/pi/piFollowUpRuntimeService');
                        if (steerPiFollowUpTurn(runningTurnId, message)) return;
                    } catch (error) {
                        console.warn(`${LOG_PREFIX} Steering failed; queueing the message instead.`, error);
                    }
                }
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
            const scope = captureSessionScope(storeApi);
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
                if (!ownsSessionScope(storeApi, scope)) return;
                const pendingClarification = getEffectivePendingClarification();
                if (pendingClarification) {
                    storeResolvedClarification(pendingClarification, userChoice.value || userChoice.label);
                }
                const { handleClarificationResponse: processClarificationResponse } = await import('../../services/agent/orchestration/chatOrchestrator');
                if (!ownsSessionScope(storeApi, scope)) return;
                await processClarificationResponse(userChoice, scopeStore(storeApi, scope));
                if (!ownsSessionScope(storeApi, scope)) return;
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
                if (ownsSessionScope(storeApi, scope) && !get().activeExecution) set({
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
