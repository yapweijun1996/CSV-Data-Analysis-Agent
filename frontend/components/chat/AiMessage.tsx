
import React from 'react';
import { ChatMessage } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import type { AppLanguage } from '../../types/localization';
import { CopyButton } from './CopyButton';

interface AiMessageProps {
    msg: ChatMessage;
    onShowCardFromChat: (cardId: string) => void;
}

function translateCleaningKind(kind: string, language: AppLanguage): string {
    const key = `cleaning_step_kind_${kind}`;
    const result = getTranslation(key, language);
    return result !== key ? result : kind;
}

function translateCleaningStatus(status: string, language: AppLanguage): string {
    const key = `cleaning_step_status_${status}`;
    const result = getTranslation(key, language);
    return result !== key ? result : status;
}

export function sanitizeAssistantDisplayText(text: string): string {
    return text
        .replace(/`?cleaned\.csv`?/gi, 'prepared dataset')
        .replace(/\bSQL[- ]first\b/gi, 'query-based')
        .replace(/\bSQL precheck\b/gi, 'data readiness check')
        .replace(/\bSQL evidence\b/gi, 'query result')
        .replace(/\bgrouped SQL analysis\b/gi, 'grouped analysis')
        .replace(/\bpreferred SQL path\b/gi, 'preferred analysis path')
        .replace(/\bSQL path\b/gi, 'analysis path')
        .replace(/\bDuckDB\b/gi, 'local query engine')
        .replace(/\btrace ID\b/gi, 'technical reference')
        .replace(/\bSQL\b/gi, 'query')
        .replace(/\bdegraded guidance\b/gi, 'visible caveats')
        // Model responses occasionally append a second, empty outline after
        // already explaining the findings. Label-only bullets are not useful
        // content and render as confusing empty list items.
        .replace(/^\s*(?:[-*]|\d+\.)\s+\*\*[^*\n]+:?\*\*\s*:?\s*$/gm, '')
        // Preserve Markdown block boundaries. Collapsing all whitespace here
        // turned tables, numbered lists, and headings into one dense paragraph.
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export const AiMessage: React.FC<AiMessageProps> = ({
    msg,
    onShowCardFromChat,
}) => {
    const language = useAppStore(state => state.settings.language);
    const isActiveError = Boolean(msg.isError && !msg.resolved);

    // Left border accent by message type for visual scanning
    const borderAccent = isActiveError ? 'border-l-4 border-l-red-400'
        : msg.type === 'ai_cleaning_step' ? 'border-l-4 border-l-amber-300'
        : msg.type === 'ai_query_trace' ? 'border-l-4 border-l-indigo-300'
        : msg.type === 'ai_mutation_confirmation' ? 'border-l-4 border-l-rose-300'
        : msg.type === 'ai_cleaning_failure' ? 'border-l-4 border-l-red-300'
        : '';

    const timestamp = msg.timestamp instanceof Date
        ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;
    const displayText = sanitizeAssistantDisplayText(msg.text);
    const isOperationalMessage = msg.type === 'ai_cleaning_step' || msg.type === 'ai_query_trace';
    const titleKey = isActiveError
        ? 'chat_error'
        : msg.resolved
            ? 'chat_resolved'
            : msg.type === 'ai_cleaning_step'
                ? 'chat_data_preparation_activity'
                : msg.type === 'ai_query_trace'
                    ? 'chat_analysis_activity'
                    : 'assistant';

    return (
        <div className="flex min-w-0 w-full" data-testid="chat-ai-message">
            <div className={`group/bubble animate-fade-in min-w-0 w-full max-w-full rounded-card text-sm xl:max-w-3xl ${isOperationalMessage ? 'px-3 py-2.5' : 'p-4'} ${borderAccent} ${isActiveError ? 'bg-red-50 border border-red-200 text-red-800' : msg.resolved || isOperationalMessage ? 'bg-slate-50 border border-slate-200 text-slate-600' : 'bg-white border border-slate-200 text-slate-800 shadow-sm'}`}>
                <div className={`${isOperationalMessage ? 'mb-1' : 'mb-2'} flex items-center justify-between`}>
                    <h4 className={`font-semibold ${isActiveError ? 'text-red-800' : 'text-slate-900'}`}>
                        {getTranslation(titleKey, language)}
                    </h4>
                    <div className="flex items-center gap-1">
                        <CopyButton text={displayText} className="text-slate-300 hover:text-slate-500" />
                        {timestamp && (
                            <span className="text-[11px] text-slate-400">{timestamp}</span>
                        )}
                    </div>
                </div>
                <div className="min-w-0">
                    {msg.cleaningStep && (
                        <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-medium">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                {translateCleaningKind(msg.cleaningStep.kind, language)}
                            </span>
                            {msg.cleaningStep.status === 'done' && (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                                    {translateCleaningStatus('done', language)}
                                </span>
                            )}
                            {msg.cleaningStep.status === 'warning' && (
                                <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                                    {translateCleaningStatus('warning', language)}
                                </span>
                            )}
                            {msg.cleaningStep.status === 'error' && (
                                <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                                    {translateCleaningStatus('error', language)}
                                </span>
                            )}
                            {msg.cleaningStep.status === 'in_progress' && (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                    {translateCleaningStatus('in_progress', language)}
                                </span>
                            )}
                            {msg.cleaningStep.status === 'blocked' && (
                                <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                                    {translateCleaningStatus('blocked', language)}
                                </span>
                            )}
                        </div>
                    )}
                    {msg.queryTrace?.sqlPreview && (
                        <details className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                            <summary className="cursor-pointer font-medium text-slate-800">
                                {getTranslation('chat_query_technical_details', language)}
                            </summary>
                            <div className="mt-3 space-y-2">
                                <p>
                                    {msg.queryTrace.returnedRows}/{msg.queryTrace.totalMatchedRows} rows · {msg.queryTrace.durationMs}ms
                                </p>
                                <pre className="max-h-56 overflow-auto rounded bg-slate-950 p-2 text-[11px] leading-5 text-slate-100">
                                    <code>{msg.queryTrace.sqlPreview}</code>
                                </pre>
                            </div>
                        </details>
                    )}
                    {msg.mutationConfirmation && (
                        <>
                            <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-medium">
                                <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                                    {getTranslation('mutation_confirmation_pending_delete', language)}
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{msg.mutationConfirmation.matchedRowCount} rows</span>
                            </div>
                            <details className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                <summary className="cursor-pointer font-medium text-slate-800">
                                    {getTranslation('mutation_review_filter', language)}
                                </summary>
                                <div className="mt-3 space-y-3">
                                    <div>
                                        <div className="mb-1 font-medium text-slate-800">{getTranslation('mutation_generated_filter', language)}</div>
                                        <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] leading-5 text-slate-700">{JSON.stringify(msg.mutationConfirmation.filterRows, null, 2)}</pre>
                                    </div>
                                    <div>
                                        <div className="mb-1 font-medium text-slate-800">{getTranslation('mutation_preview_rows', language)}</div>
                                        <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] leading-5 text-slate-700">{JSON.stringify(msg.mutationConfirmation.previewRows, null, 2)}</pre>
                                    </div>
                                </div>
                            </details>
                        </>
                    )}
                    <MarkdownRenderer content={displayText} compact={true} />
                    {msg.cleaningFailure?.technicalDetail && (
                        <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                            <summary className="cursor-pointer font-medium text-slate-800">{getTranslation('technical_detail', language)}</summary>
                            <div className="mt-2 space-y-2">
                                {msg.cleaningFailure.actionTaken && (
                                    <p><span className="font-medium text-slate-800">{getTranslation('technical_action_taken', language)}</span> {msg.cleaningFailure.actionTaken}</p>
                                )}
                                {msg.cleaningFailure.dataSafety && (
                                    <p><span className="font-medium text-slate-800">{getTranslation('technical_data_safety', language)}</span> {msg.cleaningFailure.dataSafety}</p>
                                )}
                                {msg.cleaningFailure.nextState && (
                                    <p><span className="font-medium text-slate-800">{getTranslation('technical_next_state', language)}</span> {msg.cleaningFailure.nextState}</p>
                                )}
                                <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] leading-5 text-slate-700">{msg.cleaningFailure.technicalDetail}</pre>
                            </div>
                        </details>
                    )}
                    {msg.cardId && !isActiveError && (
                        <button
                            onClick={() => onShowCardFromChat(msg.cardId!)}
                            className="mt-3 min-h-[44px] w-full rounded-md bg-blue-100 px-2 py-1.5 text-left text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 md:min-h-0"
                        >
                            → {getTranslation('chat_show_related_card', language)}
                        </button>
                    )}
                    {/* Suggested actions are rendered only in the ChatComposer NEXT STEPS section to avoid duplication */}
                </div>
            </div>
        </div>
    );
};
