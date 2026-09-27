import React from 'react';
import { ChatMessage } from '../../types';
import { IconThinking } from '../../icons/IconThinking';
import { getTranslation } from '../../utils/localization';
import { useAppStore } from '../../store/useAppStore';

const PREVIEW_LENGTH = 80;

export const ThoughtCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const language = useAppStore(state => state.settings.language);
    const preview = msg.text.length > PREVIEW_LENGTH
        ? msg.text.slice(0, PREVIEW_LENGTH) + '…'
        : msg.text;

    return (
        <details className="animate-fade-in rounded-card border border-slate-200 bg-slate-50 p-3 text-sm">
            <summary className="flex items-center cursor-pointer text-slate-600 select-none list-none [&::-webkit-details-marker]:hidden">
                <IconThinking className="mr-2 h-4 w-4 shrink-0 text-blue-500" />
                <span className="font-semibold shrink-0">{getTranslation('thought_card_label', language)}</span>
                <span className="ml-2 text-slate-400 truncate">{preview}</span>
            </summary>
            <p className="mt-2 pl-6 text-slate-600 italic whitespace-pre-wrap">{msg.text}</p>
        </details>
    );
};
