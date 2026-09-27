import React from 'react';
import { ChatMessage } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { IconThinking } from '../../icons/IconThinking';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

export const ThinkingCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const language = useAppStore(state => state.settings.language);
    return (
    <div className="my-2 p-3 bg-blue-50 border border-blue-200 rounded-card">
        <div className="flex items-center text-blue-700 mb-2">
            <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-blue-600 ring-1 ring-blue-200">
                <IconThinking className="h-4 w-4" />
            </div>
            <h4 className="font-semibold">{getTranslation('chat_initial_analysis', language)}</h4>
        </div>
        <div className="text-sm mb-3">
            <MarkdownRenderer content={msg.text} compact={true} />
        </div>
    </div>
    );
};
