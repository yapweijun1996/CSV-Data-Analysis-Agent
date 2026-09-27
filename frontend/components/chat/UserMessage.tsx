import React, { useMemo } from 'react';
import { ChatMessage } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { useAppStore } from '../../store/useAppStore';
import { CopyButton } from './CopyButton';

/**
 * Renders text with @CardTitle fragments highlighted as inline chips.
 * Uses actual card titles from store to do exact matching.
 */
const renderWithMentionChips = (text: string, cardTitles: string[]): React.ReactNode => {
    if (cardTitles.length === 0) return null;
    // Build a regex that matches any @title exactly (longest first to avoid partial matches)
    const sorted = [...cardTitles].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`@(${escaped.join('|')})`, 'g');

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
        const before = text.slice(lastIndex, match.index);
        if (before) parts.push(before);
        parts.push(
            <span key={match.index} className="inline-flex items-center rounded bg-white/20 px-1 py-0.5 text-[13px] font-medium text-blue-100">
                @{match[1]}
            </span>,
        );
        lastIndex = (match.index ?? 0) + match[0].length;
    }
    const remaining = text.slice(lastIndex);
    if (remaining) parts.push(remaining);
    return parts.some(p => typeof p !== 'string') ? <>{parts}</> : null;
};

export const UserMessage: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const timestamp = msg.timestamp instanceof Date
        ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;
    const cardIds = msg.referencedCardIds;
    // Look up actual card titles for exact chip matching
    const cardTitles = useMemo(() => {
        if (!cardIds || cardIds.length === 0) return [];
        const cards = useAppStore.getState().analysisCards ?? [];
        return cardIds.map(id => cards.find(c => c.id === id)?.plan?.title).filter(Boolean) as string[];
    }, [cardIds]);
    const chipContent = cardTitles.length > 0 ? renderWithMentionChips(msg.text, cardTitles) : null;
    return (
        <div className="flex min-w-0 w-full justify-end" data-testid="chat-user-message">
            <div className="group/bubble min-w-0 max-w-[85%] xl:max-w-2xl">
                {timestamp && (
                    <div className="mb-1 flex items-center justify-end gap-1">
                        <CopyButton text={msg.text} className="text-slate-300 hover:text-slate-500" />
                        <p className="text-[11px] text-slate-400">{timestamp}</p>
                    </div>
                )}
                <div className="rounded-card bg-blue-600 px-3 py-1.5">
                    {chipContent
                        ? <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{chipContent}</p>
                        : <MarkdownRenderer content={msg.text} compact={true} tone="inverse" />}
                </div>
            </div>
        </div>
    );
};
