
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { IconInsights } from '../icons/IconInsights';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { AnalysisArtifactProvenance, AppState, LocalizedText, Settings } from '../types';
import { getTranslation } from '../utils/localization';
import {
    getCurrentAnalysisDatasetVersion,
    resolveAnalysisArtifactFreshness,
} from '../services/agent/artifactProvenance';

interface FinalSummaryProps {
    title: string;
    summary: LocalizedText;
    language: Settings['language'];
    provenance?: AnalysisArtifactProvenance | null;
    currentDataset?: Pick<AppState, 'canonicalCsvData' | 'csvData'>;
    defaultExpanded?: boolean;
}

const PREVIEW_CHAR_LIMIT = 180;

const extractPreview = (text: string): string => {
    const trimmed = text.trim();
    // Strip markdown headings/formatting for a clean preview
    const plain = trimmed
        .replace(/^#{1,3}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n+/g, ' ')
        .trim();

    if (plain.length <= PREVIEW_CHAR_LIMIT) return plain;
    const truncated = plain.slice(0, PREVIEW_CHAR_LIMIT);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > PREVIEW_CHAR_LIMIT * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '…';
};

const FinalSummaryComponent: React.FC<FinalSummaryProps> = ({ title, summary, language, provenance, currentDataset, defaultExpanded = true }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const contentRef = useRef<HTMLDivElement>(null);

    const generatedInLabel = summary.language !== language
        ? getTranslation('summary_generated_in', language, { language: summary.language })
        : null;

    const preview = useMemo(() => extractPreview(summary.text), [summary.text]);
    const expandLabel = getTranslation('insights_expand', language);
    const collapseLabel = getTranslation('insights_collapse', language);
    const currentDatasetVersion = currentDataset
        ? getCurrentAnalysisDatasetVersion(currentDataset)
        : provenance?.datasetVersion ?? null;
    const freshness = resolveAnalysisArtifactFreshness(provenance, currentDatasetVersion);
    const evidenceState = freshness === 'stale'
        ? 'stale'
        : provenance?.evidenceStatus ?? 'unverified';

    const toggle = useCallback(() => setIsExpanded(prev => !prev), []);

    return (
        <section
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            aria-label={title}
        >
            {/* colored top accent */}
            <span className="absolute inset-x-0 top-0 h-[3px] bg-indigo-500" aria-hidden="true" />

            {/* header */}
            <button
                type="button"
                className="flex w-full items-center gap-3 px-5 pt-5 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                onClick={toggle}
                aria-expanded={isExpanded}
            >
                {/* icon */}
                <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-100 p-2 text-indigo-600">
                    <IconInsights className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                evidenceState === 'verified'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : evidenceState === 'degraded'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-red-100 text-red-700'
                            }`}
                            title={`Narrative dataset version: ${provenance?.datasetVersion ?? 'unverified'}`}
                        >
                            {evidenceState === 'verified'
                                ? 'Verified evidence'
                                : evidenceState === 'degraded'
                                    ? 'Degraded evidence'
                                    : evidenceState === 'stale'
                                        ? 'Stale evidence'
                                        : evidenceState === 'hypothesis'
                                            ? 'Hypothesis'
                                            : 'Unverified evidence'}
                        </span>
                        {generatedInLabel && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {generatedInLabel}
                            </span>
                        )}
                    </div>
                    {/* collapsed preview */}
                    {!isExpanded && (
                        <p className="mt-1 truncate text-sm text-slate-500">{preview}</p>
                    )}
                </div>

                {/* chevron */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* toggle label */}
            <div className="flex items-center justify-end px-5 pb-1">
                <span className="text-xs font-medium text-slate-400">
                    {isExpanded ? collapseLabel : expandLabel}
                </span>
            </div>

            {/* expandable content */}
            <div
                ref={contentRef}
                aria-hidden={!isExpanded}
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                    <MarkdownRenderer content={summary.text} />
                </div>
            </div>
        </section>
    );
};

export const FinalSummary = React.memo(FinalSummaryComponent);
