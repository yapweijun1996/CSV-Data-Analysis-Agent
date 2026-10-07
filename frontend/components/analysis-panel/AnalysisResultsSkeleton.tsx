import React from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';

const Bar: React.FC<{ className: string }> = ({ className }) => (
    <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
);

/** Shows where results will appear while the analysis is still running. */
export const AnalysisResultsSkeleton: React.FC<{ language: Settings['language'] }> = ({ language }) => (
    <section className="space-y-4" aria-hidden="true" data-analysis-results-skeleton="true">
        <div className="rounded-card border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{getTranslation('analysis_skeleton_summary', language)}</p>
            <div className="mt-3 space-y-2">
                <Bar className="h-3 w-5/6" />
                <Bar className="h-3 w-4/6" />
            </div>
        </div>
        <div className="rounded-card border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{getTranslation('analysis_skeleton_findings', language)}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Bar className="h-16" />
                <Bar className="h-16" />
                <Bar className="h-16" />
            </div>
        </div>
        <div className="rounded-card border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{getTranslation('analysis_skeleton_charts', language)}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Bar className="h-40" />
                <Bar className="h-40" />
                <Bar className="hidden h-40 xl:block" />
            </div>
        </div>
        <p className="text-center text-xs text-slate-400">{getTranslation('analysis_skeleton_hint', language)}</p>
    </section>
);
