
import React from 'react';
import { shallow } from 'zustand/shallow';
import { ChatMessage } from '../../types';
import { useAppStore, AppStore } from '../../store/useAppStore';
import { normalizeClarificationRequest, resolveEffectivePendingClarification } from '../../services/agent/runtime/runtimeClarification';
import { getTranslation } from '../../utils/localization';

export const ClarificationCard: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const { pendingClarification, activeTurn, handleClarificationResponse, isBusy, language } = useAppStore((state: AppStore) => ({
        pendingClarification: state.pendingClarification,
        activeTurn: state.activeTurn,
        handleClarificationResponse: state.handleClarificationResponse,
        isBusy: state.isBusy,
        language: state.settings.language,
    }), shallow);

    if (!msg.clarificationRequest) return null;

    const renderedClarification = normalizeClarificationRequest(msg.clarificationRequest);
    if (!renderedClarification.question) {
        return null;
    }

    const effectivePendingClarification = resolveEffectivePendingClarification({
        pendingClarification,
        activeTurn,
    });
    const isPending = effectivePendingClarification?.question === renderedClarification.question;
    return (
        <div className="rounded-card border border-blue-200 bg-white p-3">
            <div className="mb-2 flex items-center text-blue-700">
                <span className="mr-2 text-lg">🤔</span>
                <h4 className="font-semibold">
                    {getTranslation(
                        renderedClarification.interactionKind === 'approval'
                            ? 'approval_required_title'
                            : 'clarification_needed_title',
                        language,
                    )}
                </h4>
            </div>
            <p className="mb-3 text-sm text-slate-700">{renderedClarification.question}</p>
            {renderedClarification.options.length > 0 && (
                <div className="mb-3 flex flex-col space-y-2">
                    {renderedClarification.options.map(option => (
                        <button
                            key={option.value}
                            onClick={() => handleClarificationResponse(option)}
                            disabled={!isPending || isBusy}
                            className="min-h-11 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-left text-sm transition-colors hover:border-blue-500 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-100"
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
            {renderedClarification.allowFreeText ? (
                <p className="text-sm text-slate-500">
                    {getTranslation('clarification_reply_to_continue', language)}
                </p>
            ) : (
                <p className="text-sm text-slate-500">
                    {getTranslation('clarification_select_to_continue', language)}
                </p>
            )}
        </div>
    );
};
