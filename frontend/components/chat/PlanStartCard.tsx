import React from 'react';
import { ChatMessage } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

export const PlanStartCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const language = useAppStore(state => state.settings.language);
    return (
    <div className="rounded-card border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center text-slate-700">
            <span className="mr-2 text-lg">⚙️</span>
            <h4 className="font-semibold">{getTranslation('chat_executing_plan', language)}</h4>
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.text}</p>
    </div>
    );
};
