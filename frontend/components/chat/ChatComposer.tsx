import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IconSend } from '../../icons/IconSend';
import { IconStop } from '../../icons/IconStop';
import { getTranslation } from '../../utils/localization';
import { resolveSuggestedActionPrompt } from '../../utils/suggestedActions';
import { useAppStore } from '../../store/useAppStore';
import { CardMentionPopup, type CardMentionItem } from './CardMentionPopup';
import { resolveDisplayPlanTitle } from '../../services/dashboard/businessLabelResolver';

type SuggestedAction = { label: string; action: string };

/** Renders input text with @mentions highlighted in blue — used as overlay above transparent textarea. */
const renderHighlightedInput = (text: string, mentionMap: Map<string, string>): React.ReactNode => {
    if (mentionMap.size === 0) return text;
    const titles = [...mentionMap.keys()].sort((a, b) => b.length - a.length);
    const escaped = titles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
    const parts = text.split(pattern);
    return (
        <>
            {parts.map((part, i) =>
                pattern.test(part)
                    ? <span key={i} className="rounded bg-blue-100 text-blue-700 font-medium">{part}</span>
                    : <span key={i} className="text-slate-900">{part}</span>,
            )}
        </>
    );
};

const BusyButtonSpinner: React.FC = () => (
    <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-2 border-white/35 border-t-white animate-spin" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/90 animate-pulse" />
    </span>
);

export const getComposerBusyState = ({
    currentView,
    isBusy,
    isGeneratingReport,
    goalState,
    isTaskStatusActive,
    cleaningRunStatus,
    latestProgressText,
    language,
}: {
    currentView: ReturnType<typeof useAppStore.getState>['currentView'];
    isBusy: boolean;
    isGeneratingReport: boolean;
    goalState: ReturnType<typeof useAppStore.getState>['goalState'];
    isTaskStatusActive: boolean;
    cleaningRunStatus: NonNullable<ReturnType<typeof useAppStore.getState>['cleaningRun']>['status'] | null;
    latestProgressText: string | null;
    language: ReturnType<typeof useAppStore.getState>['settings']['language'];
}) => {
    if (currentView === 'file_upload' && isBusy) {
        return {
            shortLabel: getTranslation('chat_processing_import_short', language),
            title: getTranslation('chat_processing_import_title', language),
            detail: latestProgressText ?? getTranslation('chat_processing_import_detail', language),
            accentClassName: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
            indicatorClassName: 'bg-sky-500',
            buttonClassName: 'bg-sky-600 hover:bg-sky-600 focus:ring-sky-300 disabled:cursor-wait disabled:bg-sky-600 disabled:text-white disabled:opacity-100',
        };
    }

    if (cleaningRunStatus === 'running') {
        return {
            shortLabel: getTranslation('chat_processing_cleaning_short', language),
            title: getTranslation('chat_processing_cleaning_title', language),
            detail: latestProgressText ?? getTranslation('chat_processing_cleaning_detail', language),
            accentClassName: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
            indicatorClassName: 'bg-amber-500',
            buttonClassName: 'bg-amber-600 hover:bg-amber-600 focus:ring-amber-300 disabled:cursor-wait disabled:bg-amber-600 disabled:text-white disabled:opacity-100',
        };
    }

    if (isGeneratingReport || goalState === 'pending_ai' || isTaskStatusActive) {
        return {
            shortLabel: getTranslation('chat_processing_analysis_short', language),
            title: getTranslation('chat_processing_analysis_title', language),
            detail: latestProgressText ?? getTranslation('chat_processing_analysis_detail', language),
            accentClassName: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200',
            indicatorClassName: 'bg-violet-500',
            buttonClassName: 'bg-violet-600 hover:bg-violet-600 focus:ring-violet-300 disabled:cursor-wait disabled:bg-violet-600 disabled:text-white disabled:opacity-100',
        };
    }

    if (isBusy) {
        return {
            shortLabel: getTranslation('chat_processing_short', language),
            title: getTranslation('chat_processing_title', language),
            detail: latestProgressText ?? getTranslation('chat_processing_detail', language),
            accentClassName: 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm',
            indicatorClassName: 'bg-slate-500',
            buttonClassName: 'bg-slate-700 hover:bg-slate-700 focus:ring-slate-300 disabled:cursor-wait disabled:bg-slate-700 disabled:text-white disabled:opacity-100',
        };
    }

    return null;
};

export type ComposerBusyState = NonNullable<ReturnType<typeof getComposerBusyState>>;

interface ChatComposerProps {
    language: string;
    isApiKeySet: boolean;
    isAssistantBusy: boolean;
    isComposerDisabled: boolean;
    isGeneratingReport: boolean;
    currentView: string;
    timelineLength: number;
    composerBusyState: ComposerBusyState | null;
    composerSuggestedActions: SuggestedAction[];
    analysisStatusTitle: string | null;
    hasRunningTurn: boolean;
    queuedCount: number;
    reportProgressLabel: string | null;
    canCancelActiveTurn: boolean;
    isCancellationPending: boolean;
    effectivePendingClarification: { allowFreeText?: boolean; question?: string } | null;
    pendingMutationConfirmation: unknown;
    placeholder: string;
    onSend: (message: string) => void;
    onSuggestedAction: (prompt: string, label?: string) => void;
    onCancelActiveTurn: () => void;
    onScrollNeeded?: () => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
    language,
    isAssistantBusy,
    isComposerDisabled,
    currentView,
    timelineLength,
    composerBusyState,
    composerSuggestedActions,
    analysisStatusTitle,
    hasRunningTurn,
    queuedCount,
    reportProgressLabel,
    canCancelActiveTurn,
    isCancellationPending,
    effectivePendingClarification,
    pendingMutationConfirmation,
    placeholder,
    onSend,
    onSuggestedAction,
    onCancelActiveTurn,
    onScrollNeeded,
}) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isMultilineRef = useRef(false);
    const onScrollNeededRef = useRef(onScrollNeeded);
    onScrollNeededRef.current = onScrollNeeded;
    const disclaimerTextId = 'chat-composer-disclaimer';

    // --- @ Card Mention ---
    const [mentionState, setMentionState] = useState<{ isOpen: boolean; query: string; startIndex: number } | null>(null);
    // Maps display alias "@title" → cardId. Populated on each mention select.
    const mentionMapRef = useRef<Map<string, string>>(new Map());
    const [mentionCount, setMentionCount] = useState(0); // triggers re-render when map changes

    // Read cards once when popup opens — no need to re-read on every keystroke
    const mentionCards: CardMentionItem[] = useMemo(() => {
        if (!mentionState?.isOpen) return [];
        return (useAppStore.getState().analysisCards ?? []).map(c => ({
            id: c.id,
            title: resolveDisplayPlanTitle(c.plan),
            chartType: c.displayChartType ?? 'bar',
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mentionState?.isOpen]);

    const handleMentionSelect = useCallback((card: CardMentionItem) => {
        if (!mentionState) return;
        const before = input.slice(0, mentionState.startIndex);
        const cursorPos = textareaRef.current?.selectionStart ?? input.length;
        const after = input.slice(cursorPos);
        // Show only @title in textarea — store cardId in mentionMapRef
        const displayMention = `@${card.title} `;
        mentionMapRef.current.set(card.title, card.id);
        setMentionCount(c => c + 1);
        const newInput = before + displayMention + after;
        setInput(newInput);
        setMentionState(null);
        requestAnimationFrame(() => {
            const pos = before.length + displayMention.length;
            textareaRef.current?.setSelectionRange(pos, pos);
            textareaRef.current?.focus();
        });
    }, [input, mentionState]);

    const handleMentionClose = useCallback(() => setMentionState(null), []);

    const hasComposerInput = Boolean(input.trim());
    const canQueueComposerMessage = hasRunningTurn && !isComposerDisabled && hasComposerInput;
    const showQueueSendButton = hasRunningTurn && hasComposerInput;
    const showSecondaryCancelButton = canCancelActiveTurn && hasComposerInput;
    const canSubmitComposerMessage = !isComposerDisabled && hasComposerInput && (!isAssistantBusy || canQueueComposerMessage);
    const isSendDisabled = isComposerDisabled || (isAssistantBusy && !canQueueComposerMessage) || !hasComposerInput;
    const showComposerSuggestedActions = composerSuggestedActions.length > 0 && !effectivePendingClarification && !pendingMutationConfirmation;
    const primarySuggestedAction = showComposerSuggestedActions
        ? composerSuggestedActions[0] ?? null
        : null;

    // primaryActsAsCancel: primary button becomes stop only when no secondary cancel button is visible.
    // When user has typed input AND can cancel, secondary button handles cancel — primary stays as send.
    const primaryActsAsCancel = canCancelActiveTurn && !showSecondaryCancelButton;

    const queueStatusTitle = hasComposerInput
        ? getTranslation('chat_queue_ready_title', language)
        : getTranslation('chat_queue_active_title', language);
    const queueStatusDetail = hasComposerInput
        ? getTranslation('chat_queue_ready_detail', language)
        : getTranslation('chat_queue_active_detail', language);
    const sendButtonTitle = showQueueSendButton
        ? getTranslation('chat_send_next', language)
        : primaryActsAsCancel
            ? getTranslation('cancel_run', language)
            : composerBusyState
                ? composerBusyState.detail
                : isAssistantBusy
                    ? getTranslation('chat_send_locked_hint', language)
                    : getTranslation('send_message', language);
    const sendButtonDisabled = showQueueSendButton
        ? isSendDisabled
        : primaryActsAsCancel
            ? isCancellationPending
            : isSendDisabled;
    const sendButtonLabel = showQueueSendButton
        ? getTranslation('chat_send_next', language)
        : primaryActsAsCancel
            ? (isCancellationPending ? getTranslation('cancelling_run', language) : getTranslation('cancel_run', language))
            : composerBusyState
                ? composerBusyState.shortLabel
                : getTranslation('send_message', language);

    // Auto-resize textarea based on content.
    // Uses a ref for multiline tracking to avoid setState → onScrollNeeded → parent re-render → re-render loop.
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            const nextHeight = Math.min(scrollHeight, 200);
            textarea.style.height = `${nextHeight}px`;
            textarea.style.overflowY = scrollHeight > 200 ? 'auto' : 'hidden';
            const nextIsMultiline = scrollHeight > 40;
            if (nextIsMultiline !== isMultilineRef.current) {
                isMultilineRef.current = nextIsMultiline;
                onScrollNeededRef.current?.();
            }
        }
    }, [input]);

    const handleSend = (e: React.FormEvent | React.KeyboardEvent) => {
        e.preventDefault();
        if (!canSubmitComposerMessage) return;
        // Reconstruct @[title](cardId) tokens from display text before sending.
        // Use mentionMapRef first, then fallback to store lookup by displayTitle
        // so tokens are rebuilt even after HMR/refresh or manual @title typing.
        let messageToSend = input.trim();
        for (const [title, cardId] of mentionMapRef.current) {
            messageToSend = messageToSend.replace(`@${title}`, `@[${title}](${cardId})`);
        }
        // Fallback: match any remaining @Title patterns against card displayTitles
        const remainingMentionPattern = /@([A-Z][^\n@]*?)(?=\s|$)/g;
        if (remainingMentionPattern.test(messageToSend) && !messageToSend.includes('](')) {
            const cards = useAppStore.getState().analysisCards ?? [];
            const titleToId = new Map(cards.map(c => [resolveDisplayPlanTitle(c.plan), c.id]));
            // Sort longest first to avoid partial matches
            const sortedTitles = [...titleToId.keys()].sort((a, b) => b.length - a.length);
            for (const title of sortedTitles) {
                const cardId = titleToId.get(title)!;
                if (messageToSend.includes(`@${title}`)) {
                    messageToSend = messageToSend.replace(`@${title}`, `@[${title}](${cardId})`);
                }
            }
        }
        onSend(messageToSend);
        setInput('');
        setMentionState(null);
        mentionMapRef.current.clear();
        setMentionCount(0);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setInput(newValue);

        // Detect @ mention trigger
        const cursorPos = e.target.selectionStart ?? newValue.length;
        const textBeforeCursor = newValue.slice(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        if (lastAtIndex >= 0) {
            const afterAt = textBeforeCursor.slice(lastAtIndex + 1);
            // Skip if inside an existing @[...](...)
            if (/\[[^\]]*\]\([^)]*\)/.test(textBeforeCursor.slice(lastAtIndex))) {
                setMentionState(null);
                return;
            }
            // Skip if afterAt matches an already-selected mention title (+ optional trailing chars)
            const isCompletedMention = [...mentionMapRef.current.keys()].some(
                title => afterAt.startsWith(title),
            );
            if (isCompletedMention) {
                setMentionState(null);
                return;
            }
            // Open popup if no newline in query
            if (!/\n/.test(afterAt)) {
                setMentionState({ isOpen: true, query: afterAt, startIndex: lastAtIndex });
                return;
            }
        }
        setMentionState(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // When mention popup is open, let it handle navigation keys
        if (mentionState?.isOpen && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
            // CardMentionPopup captures these via document keydown listener
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    return (
        <div className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 md:pb-3">
            <div className="mx-auto w-full max-w-3xl">
                {primarySuggestedAction && (
                    <section
                        className="mb-2.5 rounded-card border border-blue-200 bg-blue-50/80 p-3 shadow-sm"
                        aria-label={getTranslation('chat_recommended_next_step', language)}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                                {getTranslation('chat_recommended_next_step', language)}
                            </span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-blue-100">
                                {analysisStatusTitle ?? getTranslation('chat_current_analysis', language)}
                            </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-700">
                            <span className="font-semibold">{getTranslation('chat_next_step_reason_label', language)}</span>{' '}
                            {getTranslation('chat_next_step_reason', language)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                            <span className="font-semibold text-slate-700">{getTranslation('chat_next_step_outcome_label', language)}</span>{' '}
                            {getTranslation('chat_next_step_outcome', language)}
                        </p>
                        <button
                            type="button"
                            onClick={() => onSuggestedAction(resolveSuggestedActionPrompt(primarySuggestedAction))}
                            disabled={isAssistantBusy}
                            title={primarySuggestedAction.action || primarySuggestedAction.label}
                            className="mt-3 min-h-[44px] w-full rounded-card bg-blue-600 px-3 py-2 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 md:min-h-0"
                        >
                            {primarySuggestedAction.label}
                        </button>
                    </section>
                )}
                {currentView === 'analysis_dashboard' && timelineLength === 0 && (
                    <p className="mb-2.5 text-xs text-slate-500">
                        {getTranslation('chat_focus_hint', language)}
                    </p>
                )}
                {/* Status banners float above the composer card — separate system state from input affordance */}
                {hasRunningTurn && (
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-emerald-50 px-3 py-1.5" role="status" aria-live="polite">
                        <div className="flex min-w-0 items-start gap-2">
                            <span className="relative mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500">
                                <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-75 animate-ping"></span>
                            </span>
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-xs font-medium text-emerald-700">
                                    {queueStatusTitle}
                                </span>
                                <span className="text-xs text-emerald-600">
                                    {queueStatusDetail}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {queuedCount > 0 && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    {getTranslation('chat_queue_count', language, { count: queuedCount })}
                                </span>
                            )}
                            {reportProgressLabel && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    {reportProgressLabel}
                                </span>
                            )}
                        </div>
                    </div>
                )}
                {composerBusyState && !hasRunningTurn && (
                    <div className={`mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 ${composerBusyState.accentClassName}`} role="status" aria-live="polite">
                        <div className="flex min-w-0 items-start gap-2">
                            <span className={`relative mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full ${composerBusyState.indicatorClassName}`}>
                                <span className={`absolute inset-0 rounded-full opacity-75 animate-ping ${composerBusyState.indicatorClassName}`}></span>
                            </span>
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-xs font-medium">
                                    {composerBusyState.title}
                                </span>
                                <span className="text-xs opacity-80">
                                    {composerBusyState.detail}
                                </span>
                            </div>
                        </div>
                        {reportProgressLabel && (
                            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold">
                                {reportProgressLabel}
                            </span>
                        )}
                    </div>
                )}
                <div className="relative">
                    {mentionState?.isOpen && mentionCards.length > 0 && (
                        <CardMentionPopup
                            cards={mentionCards}
                            query={mentionState.query}
                            onSelect={handleMentionSelect}
                            onClose={handleMentionClose}
                        />
                    )}
                <div
                    className="w-full overflow-hidden rounded-2xl bg-white px-4 pb-2 pt-3 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 focus-within:shadow-[0_0_0_2px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.08)]"
                >
                    <form
                        onSubmit={handleSend}
                        className="flex flex-col gap-1.5"
                    >
                        {/* Highlight overlay + textarea stack — overlay renders @mentions in blue,
                             textarea handles input with transparent text so caret stays visible */}
                        <div className="relative">
                            {mentionCount > 0 && (
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-1 py-2 text-base leading-6"
                                    style={{ color: 'transparent' }}
                                >
                                    {renderHighlightedInput(input, mentionMapRef.current)}
                                </div>
                            )}
                            <textarea
                                ref={textareaRef}
                                name="assistant-message"
                                rows={1}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                disabled={isComposerDisabled}
                                aria-describedby={disclaimerTextId}
                                className={`composer-textarea min-h-[24px] max-h-[200px] w-full resize-none bg-transparent px-1 py-2 text-base leading-6 placeholder-slate-400/60 outline-none disabled:cursor-not-allowed disabled:text-slate-400 ${
                                    mentionCount > 0 ? 'text-transparent caret-slate-900' : 'text-slate-900'
                                }`}
                            />
                        </div>
                        {/* Buttons always in their own right-aligned row — avoids layout oscillation from width/scrollHeight feedback loop */}
                        <div className="flex flex-shrink-0 items-center justify-end gap-2">
                            {showSecondaryCancelButton && (
                                <button
                                    type="button"
                                    onClick={onCancelActiveTurn}
                                    disabled={isCancellationPending}
                                    title={getTranslation('cancel_run', language)}
                                    aria-label={isCancellationPending ? getTranslation('cancelling_run', language) : getTranslation('cancel_run', language)}
                                    className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition hover:bg-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 md:h-8 md:min-h-0 md:min-w-0 md:w-8"
                                >
                                    <IconStop className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <button
                                type={showQueueSendButton ? 'submit' : primaryActsAsCancel ? 'button' : 'submit'}
                                onClick={!showQueueSendButton && primaryActsAsCancel ? onCancelActiveTurn : undefined}
                                disabled={sendButtonDisabled}
                                title={sendButtonTitle}
                                className={`flex flex-shrink-0 items-center justify-center rounded-full text-white transition ${
                                    showQueueSendButton
                                        ? 'min-h-[44px] min-w-[100px] gap-1.5 px-3 bg-black hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[#d9d9d9] disabled:text-[#f4f4f4] md:h-8 md:min-h-0'
                                        : primaryActsAsCancel
                                            ? 'min-h-[44px] min-w-[44px] bg-black hover:bg-gray-800 md:h-8 md:min-h-0 md:min-w-0 md:w-8'
                                            : composerBusyState
                                                ? `min-h-[44px] min-w-[88px] gap-1.5 px-3 md:h-8 md:min-h-0 ${composerBusyState.buttonClassName}`
                                                : 'min-h-[44px] min-w-[44px] bg-black hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[#d9d9d9] disabled:text-[#f4f4f4] md:h-8 md:min-h-0 md:min-w-0 md:w-8'
                                }`}
                                aria-label={sendButtonLabel}
                            >
                                {showQueueSendButton
                                    ? (
                                        <>
                                            <IconSend className="h-4 w-4" />
                                            <span className="text-[11px] font-semibold leading-none">
                                                {getTranslation('chat_send_next', language)}
                                            </span>
                                        </>
                                    )
                                    : primaryActsAsCancel
                                        ? <IconStop className="h-3.5 w-3.5" />
                                        : composerBusyState
                                            ? (
                                                <>
                                                    <BusyButtonSpinner />
                                                    <span className="text-[11px] font-semibold leading-none">
                                                        {composerBusyState.shortLabel}
                                                    </span>
                                                </>
                                            )
                                            : isAssistantBusy
                                                ? <BusyButtonSpinner />
                                                : <IconSend className="h-4 w-4" />}
                            </button>
                        </div>
                    </form>
                </div>
                </div>
                <p id={disclaimerTextId} className="mt-1.5 text-center text-xs text-slate-600">
                    {getTranslation('chat_disclaimer_verify', language)}
                </p>
            </div>
        </div>
    );
};
