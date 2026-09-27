import React from 'react';
import { ChatMessage } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

interface EnhancementSuggestionCardProps {
    msg: ChatMessage;
}

export const EnhancementSuggestionCard: React.FC<EnhancementSuggestionCardProps> = ({ msg }) => {
    const applySuggestion = useAppStore(state => state.applyCardEnhancementSuggestion);
    const dismissSuggestion = useAppStore(state => state.dismissCardEnhancementSuggestion);
    const suggestions = useAppStore(state => state.cardEnhancementSuggestions);
    const language = useAppStore(state => state.settings.language);

    const suggestion = suggestions.find(s => s.id === msg.enhancementSuggestionId);
    const isExecutable = suggestion?.action === 'add_calculated_column';

    if (!suggestion) {
        return (
            <div className="flex min-w-0 w-full">
                <div className="min-w-0 w-full max-w-full rounded-card border border-slate-200 bg-white p-4 text-sm text-slate-600 xl:max-w-3xl">
                    <p className="font-semibold text-slate-900">{getTranslation('enhancement_title', language)}</p>
                    <p className="mt-1">{getTranslation('enhancement_unavailable', language)}</p>
                </div>
            </div>
        );
    }

    const handleApply = () => {
        if (isExecutable && (suggestion.status === 'pending' || suggestion.status === 'failed')) {
            applySuggestion(suggestion.id);
        }
    };

    const handleDismiss = () => {
        if (suggestion.status !== 'applied' && suggestion.status !== 'dismissed') {
            dismissSuggestion(suggestion.id);
        }
    };

    return (
        <div className="flex min-w-0 w-full">
            <div className="animate-fade-in min-w-0 w-full max-w-full rounded-card border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm xl:max-w-3xl">
                <div className="mb-2 flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">{getTranslation('enhancement_title', language)}</p>
                        <p className="font-semibold text-slate-900">{suggestion.cardTitle || suggestion.cardId}</p>
                    </div>
                    <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                            suggestion.priority === 'high'
                                ? 'bg-red-100 text-red-700'
                                : suggestion.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                        {getTranslation(`priority_${suggestion.priority}`, language)}
                    </span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap">{suggestion.rationale}</p>
                {suggestion.action === 'add_calculated_column' && suggestion.proposedColumnName && suggestion.formula && (
                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                        <p className="mb-1 font-semibold text-slate-600">{getTranslation('enhancement_proposed_column', language)}</p>
                        <p className="text-slate-800"><strong>{suggestion.proposedColumnName}</strong> = {suggestion.formula}</p>
                    </div>
                )}
                <p className="mt-2 text-xs text-slate-500">
                    {getTranslation(
                        isExecutable ? 'enhancement_command_hint' : 'enhancement_info_only_hint',
                        language,
                        { code: suggestion.shortCode },
                    )}
                </p>
                <div className="mt-4 flex items-center gap-2">
                    <button
                        onClick={handleApply}
                        disabled={!isExecutable || suggestion.status === 'applied' || suggestion.status === 'applying'}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            !isExecutable
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : suggestion.status === 'applied'
                                ? 'bg-green-100 text-green-700 cursor-default'
                                : suggestion.status === 'applying'
                                    ? 'bg-slate-200 text-slate-500 cursor-progress'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        {!isExecutable
                            ? getTranslation('enhancement_info_only', language)
                            : suggestion.status === 'applied'
                            ? getTranslation('enhancement_applied', language)
                            : suggestion.status === 'applying'
                                ? getTranslation('enhancement_applying', language)
                                : getTranslation('enhancement_approve', language)}
                    </button>
                    {suggestion.status !== 'applied' && suggestion.status !== 'dismissed' && (
                        <button
                            onClick={handleDismiss}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                        >
                            {getTranslation('enhancement_dismiss', language)}
                        </button>
                    )}
                    <span className="ml-auto text-xs text-slate-500">
                        {getTranslation('enhancement_status', language, {
                            status: getTranslation(`enhancement_status_${suggestion.status}`, language),
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
};
