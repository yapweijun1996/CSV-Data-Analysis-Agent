import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { ChatMessage } from '../../types';
import { getReplyVersionIndex, getReplyVersions } from '../../utils/replyVersions';
import { getTranslation } from '../../utils/localization';

const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Non-secure contexts: fall back to a hidden textarea.
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
};

const btnBase = 'inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:min-h-7';
const btn = `${btnBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
const btnDanger = `${btnBase} bg-red-50 text-red-700 hover:bg-red-100`;

/** Retry / Copy / Delete and the response-version pager shown under an assistant answer. */
export const ReplyActionBar: React.FC<{ msg: ChatMessage; copyText: string }> = ({ msg, copyText }) => {
    const language = useAppStore(state => state.settings.language);
    const isBusy = useAppStore(state => state.isBusy);
    const retry = useAppStore(state => state.retryAssistantReply);
    const selectVersion = useAppStore(state => state.selectReplyVersion);
    const remove = useAppStore(state => state.deleteChatMessage);
    const canRetry = useAppStore(state => {
        const history = state.chatHistory;
        const index = history.findIndex(m => m.id === msg.id);
        if (index < 0) return false;
        const newer = history.slice(index + 1).some(m => m.sender === 'ai' && !m.isRunSummary && (m.type ?? 'ai_message') === 'ai_message');
        return !newer && history.slice(0, index).some(m => m.sender === 'user' && m.type === 'user_message');
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [copied, setCopied] = useState(false);
    const versions = getReplyVersions(msg);
    const current = getReplyVersionIndex(msg);

    return (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5" data-testid="reply-action-bar">
            {versions.length > 1 && (
                <span className="mr-1 inline-flex items-center text-xs text-slate-500" data-testid="reply-version-pager">
                    <button type="button" className={btn} disabled={current <= 0 || isBusy}
                        aria-label="Previous response version" onClick={() => selectVersion(msg.id, current - 1)}>‹</button>
                    <span className="tabular-nums">{current + 1} / {versions.length}</span>
                    <button type="button" className={btn} disabled={current >= versions.length - 1 || isBusy}
                        aria-label="Next response version" onClick={() => selectVersion(msg.id, current + 1)}>›</button>
                </span>
            )}
            <button type="button" className={btn} disabled={!canRetry || isBusy} onClick={() => { void retry(msg.id); }}
                title="Generate this answer again">
                <span aria-hidden="true">↻</span>{getTranslation('chat_retry', language)}
            </button>
            <button type="button" className={btn} onClick={() => { void copyToClipboard(copyText).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
                <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>{getTranslation(copied ? 'chat_copied' : 'chat_copy', language)}
            </button>
            <button type="button" className={confirmDelete ? btnDanger : btn}
                disabled={isBusy}
                aria-label={confirmDelete ? 'Confirm delete reply' : 'Delete reply'}
                onClick={() => {
                    if (!confirmDelete) { setConfirmDelete(true); window.setTimeout(() => setConfirmDelete(false), 4000); return; }
                    remove(msg.id);
                }}>
                <span aria-hidden="true">🗑</span>{confirmDelete ? 'Delete?' : ''}
            </button>
        </div>
    );
};
