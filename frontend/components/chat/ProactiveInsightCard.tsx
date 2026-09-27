
import React from 'react';
import { ChatMessage } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { getTranslation } from '../../utils/localization';
import { IconInsights } from '../../icons/IconInsights';

export const ProactiveInsightCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const handleShowCardFromChat = useAppStore(state => state.handleShowCardFromChat);
    const language = useAppStore(state => state.settings.language);
    return (
        <div className="rounded-card border border-yellow-300 bg-yellow-50 p-3">
            <div className="mb-2 flex items-center text-yellow-800">
                <IconInsights className="mr-2 h-5 w-5 shrink-0" aria-hidden="true" />
                <h4 className="font-semibold">{getTranslation('proactive_insight_title', language)}</h4>
            </div>
            <div className="text-sm text-slate-700">
                <MarkdownRenderer content={msg.text} compact={true} />
            </div>
            {msg.cardId && (
                <button
                    onClick={() => handleShowCardFromChat(msg.cardId!)}
                    className="mt-2 w-full rounded-md bg-yellow-100 px-2 py-1.5 text-left text-xs font-medium text-yellow-800 transition-colors hover:bg-yellow-200"
                >
                    → Show Related Chart
                </button>
            )}
        </div>
    );
};
