import React from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { resolveNextStepCopyKeys, type NextStepKind } from './nextStep';

/** The one recommended action after an analysis ends (repair, retry, review or report). */
export const RecommendedNextStep: React.FC<{
    kind: NextStepKind;
    language: Settings['language'];
    degraded: boolean;
    hasReport: boolean;
    isGeneratingReport: boolean;
    disabled: boolean;
    /** Why the report cannot be generated yet, shown as the button tooltip. */
    blockedTitle?: string;
    onPrimaryAction: () => void;
    /** Only offered when the provider failed and the settings surface is available. */
    onChangeProvider?: () => void;
}> = ({
    kind, language, degraded, hasReport, isGeneratingReport, disabled, blockedTitle, onPrimaryAction, onChangeProvider,
}) => {
    const copy = resolveNextStepCopyKeys({ kind, degraded, hasReport, isGeneratingReport });
    return (
        <section className="rounded-card border border-blue-200 bg-blue-50 p-4" aria-label={getTranslation('analysis_results_next_step_title', language)}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                {getTranslation('analysis_results_next_step_title', language)}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{getTranslation(copy.reason, language)}</p>
            <p className="mt-1 text-sm text-slate-600">{getTranslation(copy.outcome, language)}</p>
            <button
                type="button"
                onClick={onPrimaryAction}
                disabled={disabled}
                title={blockedTitle}
                className="mt-3 min-h-[44px] rounded-card bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
                {getTranslation(copy.action, language)}
            </button>
            {kind === 'recover_provider' && onChangeProvider && (
                <button
                    type="button"
                    onClick={onChangeProvider}
                    className="ml-2 mt-3 min-h-[44px] rounded-card border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                    {getTranslation('analysis_results_change_provider_action', language)}
                </button>
            )}
        </section>
    );
};
