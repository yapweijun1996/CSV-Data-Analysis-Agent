import React from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';

export type ResultsViewMode = 'simple' | 'explore';

/** Switches between the short overview and the full exploration view. */
export const ResultsViewToggle: React.FC<{
    mode: ResultsViewMode;
    language: Settings['language'];
    onChange: (mode: ResultsViewMode) => void;
}> = ({ mode, language, onChange }) => (
    <section className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-label={getTranslation('analysis_results_view_label', language)}>
        <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {getTranslation('analysis_results_view_label', language)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
                {getTranslation(
                    mode === 'simple'
                        ? 'analysis_results_simple_view_hint'
                        : 'analysis_results_explore_view_hint',
                    language,
                )}
            </p>
        </div>
        <div className="inline-flex self-start rounded-card border border-slate-200 bg-slate-50 p-1" role="group" aria-label={getTranslation('analysis_results_view_label', language)}>
            {(['simple', 'explore'] as const).map(option => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => onChange(option)}
                    className={`min-h-[44px] rounded-md px-3 py-2 text-sm font-semibold transition md:min-h-0 ${
                        mode === option
                            ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    {getTranslation(
                        option === 'simple'
                            ? 'analysis_results_simple_view'
                            : 'analysis_results_explore_view',
                        language,
                    )}
                </button>
            ))}
        </div>
    </section>
);
