
import React, { useEffect, useRef, useMemo, useCallback, useState, lazy, Suspense } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../store/useAppStore';
import { MessageRenderer } from './chat/MessageRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
    shouldAllowSettingsSurface,
    shouldShowAgentThinkingModal,
    shouldShowLongTermMemory,
    shouldShowSettingsButton,
} from '../config/runtimeConfig';
import { getTranslation } from '../utils/localization';
import { MAX_TIMELINE_CHAT_MESSAGES } from '../utils/storeLimits';
import { resolveEffectivePendingClarification } from '../services/agent/runtime/runtimeClarification';
import { ChatPanelHeader } from './chat/ChatPanelHeader';
import { ChatComposer, getComposerBusyState } from './chat/ChatComposer';
import { TERMINAL_CHAT_LIFECYCLE_STATES } from '../types/runtime';

const PiBrowserLab = lazy(() => import('./modals/PiBrowserLab').then(module => ({ default: module.PiBrowserLab })));

const CHAT_DEBUG_ENABLED = import.meta.env.DEV;
const chatDebug = (message: string, detail?: unknown) => {
    if (!CHAT_DEBUG_ENABLED) return;
    if (detail === undefined) {
        console.debug(`[ChatDebug] ${message}`);
        return;
    }
    console.debug(`[ChatDebug] ${message}`, detail);
};

const getLatestComposerSuggestedActions = (
    chatHistory: ReturnType<typeof useAppStore.getState>['chatHistory'],
) => {
    const latestMessage = chatHistory[chatHistory.length - 1];
    if (
        !latestMessage
        || latestMessage.sender !== 'ai'
        || latestMessage.resolved
        || !Array.isArray(latestMessage.suggestedActions)
    ) {
        return [];
    }

    return latestMessage.suggestedActions.slice(0, 3);
};

// --- Unified AI Response Card (AGENT-305B) ---
// Combines thinking indicator + streaming text into one card.
// Phase 1: Thinking → card with pulsing dots + expandable activity log
// Phase 2: Streaming → same card, text replaces dots, cursor blinks
// Phase 3: Complete → card disappears, final message in chatHistory
const StreamingBubble: React.FC = React.memo(() => {
    const streamingMessage = useAppStore(state => state.streamingMessage, shallow);
    const language = useAppStore(state => state.settings.language);
    // StreamingBubble only renders when streaming text is available.
    // ThinkingIndicator handles the "no text yet" phase.
    if (!streamingMessage || !streamingMessage.isStreaming || !streamingMessage.text) return null;
    return (
        <div className="flex min-w-0 w-full animate-fade-in">
            <div className="min-w-0 w-full max-w-full rounded-card p-4 text-sm xl:max-w-3xl bg-white border border-blue-200 text-slate-800 shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-xs text-slate-400">
                    <span className="font-medium text-blue-500">{getTranslation('assistant', language)}</span>
                    <span>{streamingMessage.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="ml-auto text-blue-400 text-[10px] uppercase tracking-wider font-medium">
                        {getTranslation('chat_streaming', language)}
                    </span>
                </div>
                <div className="text-slate-700 leading-relaxed">
                    <MarkdownRenderer content={streamingMessage.text} />
                    <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                </div>
            </div>
        </div>
    );
});

// Isolated thinking indicator — subscribes only to progressMessages and language.
// Prevents the expensive ChatPanel re-render on every addProgress() call.
// Click to expand: shows recent agent activity (progressMessages).
const THINKING_ACTIVITY_COUNT = 10;

const ThinkingIndicator: React.FC<{ isVisible: boolean }> = React.memo(({ isVisible }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { latestProgress, language, recentMessages } = useAppStore(state => ({
        latestProgress: state.progressMessages[state.progressMessages.length - 1] ?? null,
        language: state.settings.language,
        recentMessages: state.progressMessages.slice(-THINKING_ACTIVITY_COUNT),
    }), shallow);

    if (!isVisible) return null;
    const timestamp = (latestProgress?.timestamp ?? new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="animate-fade-in text-xs text-slate-500">
            <button
                type="button"
                onClick={() => setIsExpanded(prev => !prev)}
                className="flex items-center gap-1 w-full text-left hover:text-slate-700 transition-colors"
            >
                <svg
                    className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                </svg>
                <span className="mr-2 text-slate-400">{timestamp}</span>
                <span>
                    <span className="chat-thinking-text select-none">
                        {getTranslation('chat_loader_thinking', language)}...
                    </span>
                </span>
            </button>
            {isExpanded && recentMessages.length > 0 && (
                <div className="mt-2 ml-5 max-h-48 overflow-y-auto space-y-1 border-l-2 border-slate-200 pl-3">
                    {recentMessages.map(msg => (
                        <div key={msg.id} className="flex gap-2">
                            <span className="text-slate-400 shrink-0">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className={
                                msg.type === 'error' ? 'text-red-500'
                                    : msg.type === 'warning' ? 'text-amber-500'
                                        : 'text-slate-500'
                            }>
                                {msg.text}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

export const ChatPanel: React.FC = React.memo(() => {
    const SCROLL_BOTTOM_THRESHOLD = 24;
    // Split selectors: ChatPanel only subscribes to what it directly renders.
    // progressMessages is NOT here — ThinkingIndicator handles it independently.
    const {
        chatHistory,
        isBusy,
        handleChatMessage,
        isApiKeySet,
        setIsAsideVisible,
        setIsSettingsModalOpen,
        setIsMemoryPanelOpen,
        setIsAgentModalOpen,
        currentView,
        pendingClarification,
        pendingMutationConfirmation,
        goalState,
        isGeneratingReport,
        isSummaryGenerating,
        reportGenerationProgress,
        aiTaskStatus,
        cleaningRunStatus,
        language,
        activeTurnId,
        activeTurnPendingClarification,
        activeTurnStatus,
        queuedChatTurns,
        cancelRequestedTurnId,
        requestActiveTurnCancellation,
        handleShowCardFromChat,
    } = useAppStore(state => ({
        chatHistory: state.chatHistory,
        isBusy: state.isBusy,
        handleChatMessage: state.handleChatMessage,
        isApiKeySet: state.isApiKeySet,
        setIsAsideVisible: state.setIsAsideVisible,
        setIsSettingsModalOpen: state.setIsSettingsModalOpen,
        setIsMemoryPanelOpen: state.setIsMemoryPanelOpen,
        setIsAgentModalOpen: state.setIsAgentModalOpen,
        currentView: state.currentView,
        pendingClarification: state.pendingClarification,
        pendingMutationConfirmation: state.pendingMutationConfirmation,
        goalState: state.goalState,
        isGeneratingReport: state.isGeneratingReport,
        isSummaryGenerating: state.isSummaryGenerating,
        reportGenerationProgress: state.reportGenerationProgress,
        aiTaskStatus: state.aiTaskStatus,
        cleaningRunStatus: state.cleaningRun?.status ?? null,
        language: state.settings.language,
        activeTurnId: state.activeTurn?.turnId ?? null,
        activeTurnPendingClarification: state.activeTurn?.pendingClarificationRequest ?? null,
        activeTurnStatus: state.activeTurn?.status ?? null,
        queuedChatTurns: state.queuedChatTurns ?? [],
        cancelRequestedTurnId: state.cancelRequestedTurnId ?? null,
        requestActiveTurnCancellation: state.requestActiveTurnCancellation,
        handleShowCardFromChat: state.handleShowCardFromChat,
    }), shallow);

    const [showScrollToBottom, setShowScrollToBottom] = React.useState(false);
    const [isPiBrowserLabOpen, setIsPiBrowserLabOpen] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesContentRef = useRef<HTMLDivElement>(null);
    const autoScrollEnabledRef = useRef(true);
    const scheduledScrollFrameRef = useRef<number | null>(null);
    const effectivePendingClarification = resolveEffectivePendingClarification({
        pendingClarification,
        activeTurn: activeTurnPendingClarification
            ? { pendingClarificationRequest: activeTurnPendingClarification }
            : null,
    } as Parameters<typeof resolveEffectivePendingClarification>[0]);

    const timeline = useMemo(
        () => chatHistory
            .filter(message => message.type !== 'ai_thought')
            .slice(-MAX_TIMELINE_CHAT_MESSAGES),
        [chatHistory],
    );
    // PERF-305: latestProgressMessage subscription REMOVED.
    // Was causing 20-50 ChatPanel re-renders per analysis (no shallow, new object
    // every addProgress()). ThinkingIndicator already shows real-time progress
    // independently. composerBusyState reads latest text lazily via getState().
    const composerSuggestedActions = useMemo(
        () => getLatestComposerSuggestedActions(chatHistory),
        [chatHistory],
    );
    const analysisStatusTitle = aiTaskStatus
        ? (aiTaskStatus.titleKey
            ? getTranslation(aiTaskStatus.titleKey, language, aiTaskStatus.titleParams)
            : aiTaskStatus.title)
        : null;
    const hiddenTimelineItemsCount = Math.max(0, chatHistory.length - MAX_TIMELINE_CHAT_MESSAGES);
    const hasRunningTurn = activeTurnStatus === 'running';
    const isCleaningActive = cleaningRunStatus === 'running';
    const isTaskStatusActive = !!aiTaskStatus && aiTaskStatus.status !== 'done' && aiTaskStatus.status !== 'error';
    // BUG-UI-204: Derive busy state from chatLifecycleState (single source of truth)
    // instead of raw isBusy which can get stuck when runtime throws before finally blocks.
    const chatLifecycleState = useAppStore(state => state.chatLifecycleState);
    // A blocked turn is waiting for the user, not actively working. Keep the
    // composer available for free-text clarification while preserving the
    // non-terminal runtime state needed for resume.
    const isAssistantBusy = (
        chatLifecycleState !== 'blocked'
        && !TERMINAL_CHAT_LIFECYCLE_STATES.has(chatLifecycleState)
    )
        || isGeneratingReport || isSummaryGenerating || goalState === 'pending_ai' || isCleaningActive || isTaskStatusActive;
    const isComposerDisabled = !isApiKeySet || currentView === 'file_upload';
    const composerBusyState = useMemo(() => {
        // PERF-305: Lazy read via getState() — no subscription, no re-render.
        // Progress text is best-effort display; ThinkingIndicator already shows
        // real-time progress independently.
        const latestText = useAppStore.getState().progressMessages.slice(-1)[0]?.text ?? null;
        return getComposerBusyState({
            currentView,
            isBusy,
            isGeneratingReport,
            goalState,
            isTaskStatusActive,
            cleaningRunStatus,
            latestProgressText: latestText,
            language,
        });
    }, [
        currentView,
        isBusy,
        isGeneratingReport,
        goalState,
        isTaskStatusActive,
        cleaningRunStatus,
        language,
    ]);
    const handleSuggestedAction = useCallback((prompt: string, label?: string) => {
        void handleChatMessage(prompt, { source: 'action', displayText: label });
    }, [handleChatMessage]);
    const handleSelectCsv = useCallback(() => {
        const fileInput = document.getElementById('file-upload');
        if (fileInput instanceof HTMLInputElement && !fileInput.disabled) {
            fileInput.click();
        }
    }, []);
    const renderedTimeline = useMemo(() => (
        timeline.map((item) => (
            <MessageRenderer
                item={item}
                key={item.id}
                onShowCardFromChat={handleShowCardFromChat}
            />
        ))
    ), [timeline, handleShowCardFromChat]);

    const canCancelActiveTurn = isAssistantBusy && activeTurnStatus === 'running';
    const isCancellationPending = hasRunningTurn && cancelRequestedTurnId === activeTurnId;
    const reportProgressLabel = isGeneratingReport && reportGenerationProgress
        ? `${reportGenerationProgress.completed}/${reportGenerationProgress.total}`
        : null;
    // thinkingTimestamp and showModelBadge moved to ThinkingIndicator component

    // Batch DOM reads and writes into separate phases to avoid forced reflow.
    // All geometry reads happen first, then state/DOM writes happen after.
    const updateScrollTracking = () => {
        const container = messagesContainerRef.current;
        if (!container) return;
        // --- READ phase ---
        const scrollHeight = container.scrollHeight;
        const scrollTop = container.scrollTop;
        const clientHeight = container.clientHeight;
        // --- COMPUTE ---
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const isNearBottom = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
        // --- WRITE phase ---
        autoScrollEnabledRef.current = isNearBottom;
        setShowScrollToBottom(!isNearBottom);
    };

    const cancelScheduledAutoScroll = () => {
        if (scheduledScrollFrameRef.current !== null) {
            window.cancelAnimationFrame(scheduledScrollFrameRef.current);
            scheduledScrollFrameRef.current = null;
        }
    };

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const container = messagesContainerRef.current;
        if (!container) return;
        // Read scrollHeight once, then write — avoids interleaved read/write reflow.
        const targetTop = container.scrollHeight;
        container.scrollTo({ top: targetTop, behavior });
        autoScrollEnabledRef.current = true;
        setShowScrollToBottom(false);
    };

    const scheduleAutoScroll = (behavior: ScrollBehavior = 'auto') => {
        cancelScheduledAutoScroll();
        scheduledScrollFrameRef.current = window.requestAnimationFrame(() => {
            scheduledScrollFrameRef.current = null;
            scrollToBottom(behavior);
        });
    };

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        autoScrollEnabledRef.current = true;
        updateScrollTracking();
    }, []);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        if (!autoScrollEnabledRef.current) {
            updateScrollTracking();
            return;
        }
        scheduleAutoScroll('auto');
    }, [timeline, isAssistantBusy]);

    // Throttled ResizeObserver: coalesce rapid resize events into one rAF callback
    useEffect(() => {
        const content = messagesContentRef.current;
        if (!content || typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        let resizeRafId: number | null = null;
        const observer = new ResizeObserver(() => {
            if (resizeRafId !== null) return; // already scheduled
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null;
                if (!autoScrollEnabledRef.current) {
                    updateScrollTracking();
                    return;
                }
                scheduleAutoScroll('auto');
            });
        });
        observer.observe(content);
        return () => {
            observer.disconnect();
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
        };
    }, []);

    useEffect(() => () => {
        cancelScheduledAutoScroll();
    }, []);

    useEffect(() => {
        chatDebug('Composer gate state changed.', {
            isAssistantBusy,
            isComposerDisabled,
            activeTurnStatus,
            hasRunningTurn,
            hasPendingClarification: Boolean(effectivePendingClarification),
            pendingClarificationQuestion: effectivePendingClarification?.question ?? null,
            pendingMutationConfirmation: Boolean(pendingMutationConfirmation),
            currentView,
            isApiKeySet,
            queuedChatTurns: queuedChatTurns.length,
            composerBusyTitle: composerBusyState?.title ?? null,
            composerBusyDetail: composerBusyState?.detail ?? null,
        });
    }, [
        isAssistantBusy,
        isComposerDisabled,
        activeTurnStatus,
        hasRunningTurn,
        effectivePendingClarification,
        pendingMutationConfirmation,
        currentView,
        isApiKeySet,
        queuedChatTurns.length,
        composerBusyState,
    ]);

    const getPlaceholder = () => {
        if (!isApiKeySet) {
            return shouldAllowSettingsSurface()
                ? getTranslation('chat_placeholder_api_key', language)
                : getTranslation('chat_placeholder_api_key_managed', language);
        }
        if (isGeneratingReport) return getTranslation('chat_placeholder_auto_analysis', language);
        if (goalState === 'awaiting_user_confirmation') return getTranslation('chat_placeholder_confirm_goal', language);
        if (effectivePendingClarification) {
            return effectivePendingClarification.allowFreeText
                ? effectivePendingClarification.question
                : getTranslation('chat_placeholder_clarification', language);
        }
        if (pendingMutationConfirmation) return getTranslation('chat_placeholder_mutation_confirmation', language);
        switch (currentView) {
            case 'analysis_dashboard':
                return getTranslation('chat_placeholder_auto_analysis_ready', language);
            case 'file_upload':
            default:
                return getTranslation('chat_placeholder_upload', language);
        }
    };

    const handleComposerScrollNeeded = useCallback(() => {
        if (!autoScrollEnabledRef.current) return;
        scheduleAutoScroll('auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and stable functions only
    }, []);

    return (
        <div className="flex h-full flex-col rounded-card bg-slate-100 md:rounded-none">
            <Suspense fallback={null}>
                {isPiBrowserLabOpen && <PiBrowserLab onClose={() => setIsPiBrowserLabOpen(false)} />}
            </Suspense>
            <ChatPanelHeader
                language={language}
                isAssistantBusy={isAssistantBusy}
                showMemoryPanel={shouldShowLongTermMemory()}
                showAgentThinking={shouldShowAgentThinkingModal()}
                showSettings={shouldShowSettingsButton()}
                showPiBrowserLab={currentView === 'analysis_dashboard'}
                onOpenMemory={() => setIsMemoryPanelOpen(true)}
                onOpenAgent={() => setIsAgentModalOpen(true)}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onOpenPiBrowserLab={() => setIsPiBrowserLabOpen(true)}
                onHidePanel={() => setIsAsideVisible(false)}
            />
            <div className="relative flex-1 min-h-0">
                <div
                    ref={messagesContainerRef}
                    onScroll={updateScrollTracking}
                    className="h-full overflow-y-auto p-4"
                >
                    <div
                        ref={messagesContentRef}
                        className={`space-y-4 ${currentView === 'file_upload' && timeline.length === 0 ? 'h-full' : ''}`}
                    >
                        {currentView === 'file_upload' && timeline.length === 0 && !isAssistantBusy && (
                            <section
                                aria-labelledby="assistant-upload-title"
                                className="flex h-full flex-col items-center justify-center px-3 text-center"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-6 w-6" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" />
                                    </svg>
                                </div>
                                <h3 id="assistant-upload-title" className="mt-4 text-base font-semibold text-slate-900">
                                    {getTranslation('assistant_empty_title', language)}
                                </h3>
                                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
                                    {getTranslation('assistant_empty_description', language)}
                                </p>
                                <ul className="mt-4 w-full max-w-xs space-y-2 text-left text-sm text-slate-700">
                                    {[
                                        'assistant_empty_capability_fields',
                                        'assistant_empty_capability_quality',
                                        'assistant_empty_capability_questions',
                                    ].map(key => (
                                        <li key={key} className="flex items-start gap-2">
                                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m4 10 3.5 3.5L16 5" />
                                            </svg>
                                            <span>{getTranslation(key, language)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    onClick={handleSelectCsv}
                                    className="mt-5 min-h-[44px] rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                                >
                                    {getTranslation('assistant_empty_select_csv', language)}
                                </button>
                            </section>
                        )}
                        {hiddenTimelineItemsCount > 0 && (
                            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                Showing recent activity for performance. Older conversation remains saved.
                            </p>
                        )}
                        {renderedTimeline}
                        <StreamingBubble />
                        <ThinkingIndicator isVisible={isAssistantBusy} />
                    </div>
                </div>
                {showScrollToBottom && (
                    <button
                        type="button"
                        onClick={() => scrollToBottom('smooth')}
                        className="absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        aria-label={getTranslation('scroll_to_latest', language)}
                        title={getTranslation('scroll_to_latest', language)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 14a1 1 0 0 1-.707-.293l-4-4a1 1 0 1 1 1.414-1.414L10 11.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-4 4A1 1 0 0 1 10 14Z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
            <ChatComposer
                language={language}
                isApiKeySet={isApiKeySet}
                isAssistantBusy={isAssistantBusy}
                isComposerDisabled={isComposerDisabled}
                isGeneratingReport={isGeneratingReport}
                currentView={currentView}
                timelineLength={timeline.length}
                composerBusyState={composerBusyState}
                composerSuggestedActions={composerSuggestedActions}
                analysisStatusTitle={analysisStatusTitle}
                hasRunningTurn={hasRunningTurn}
                queuedCount={queuedChatTurns.length}
                reportProgressLabel={reportProgressLabel}
                canCancelActiveTurn={canCancelActiveTurn}
                isCancellationPending={isCancellationPending}
                effectivePendingClarification={effectivePendingClarification}
                pendingMutationConfirmation={pendingMutationConfirmation}
                placeholder={getPlaceholder()}
                onSend={(msg) => { handleChatMessage(msg, { source: 'composer' }); }}
                onSuggestedAction={handleSuggestedAction}
                onCancelActiveTurn={requestActiveTurnCancellation}
                onScrollNeeded={handleComposerScrollNeeded}
            />
        </div>
    );
});
