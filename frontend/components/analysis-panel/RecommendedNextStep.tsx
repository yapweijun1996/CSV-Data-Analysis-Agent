import React from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { resolveNextStepCopyKeys, type NextStepKind } from './nextStep';

/** The one recommended action after an analysis ends (enable cloud AI, repair, retry, review or report). */
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
    onViewLocalData?: () => void;
    /** The specific check behind a block, in plain language. */
    detail?: string;
    /** Only offered when the provider failed or cloud AI was declined, and the settings surface is available. */
    onChangeProvider?: () => void;
}> = ({
    kind, language, degraded, hasReport, isGeneratingReport, disabled, blockedTitle, onPrimaryAction, onViewLocalData, detail, onChangeProvider,
}) => {
    const copy = resolveNextStepCopyKeys({ kind, degraded, hasReport, isGeneratingReport });
    return (
        <section className="rounded-card border border-accent-200 bg-accent-50 p-4" aria-label={getTranslation('analysis_results_next_step_title', language)}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-700">
                {getTranslation('analysis_results_next_step_title', language)}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{getTranslation(copy.reason, language)}</p>
            {detail && <p className="mt-1 text-sm text-slate-700">{detail}</p>}
            <p className="mt-1 text-sm text-slate-600">{getTranslation(onViewLocalData ? 'local_preview_hint' : copy.outcome, language)}</p>
            {onViewLocalData && (
                <button type="button" data-data-explorer-trigger="true" data-local-preview-trigger="true" onClick={onViewLocalData} disabled={disabled}
                    className="mr-2 mt-3 min-h-[44px] rounded-card bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:bg-accent-300">
                    {getTranslation('local_preview_action', language)}
                </button>
            )}
            <button
                type="button"
                onClick={onPrimaryAction}
                disabled={disabled}
                title={blockedTitle}
                className={onViewLocalData
                    ? 'mt-3 min-h-[44px] rounded-card border border-accent-300 bg-white px-4 py-2 text-sm font-semibold text-accent-700 disabled:opacity-50'
                    : 'mt-3 min-h-[44px] rounded-card bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-accent-300'}
            >
                {getTranslation(copy.action, language)}
            </button>
            {(kind === 'recover_provider' || kind === 'enable_cloud_ai') && onChangeProvider && (
                <button
                    type="button"
                    onClick={onChangeProvider}
                    className="ml-2 mt-3 min-h-[44px] rounded-card border border-accent-300 bg-white px-4 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50"
                >
                    {getTranslation('analysis_results_change_provider_action', language)}
                </button>
            )}
        </section>
    );
};
