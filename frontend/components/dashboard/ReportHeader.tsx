import React, { useRef } from 'react';
import type { ReportContextResolution, ResolvedReportContext } from '../../types';
import { getTranslation } from '../../utils/localization';
import type { Settings } from '../../types';
import { isUsableReportTitle } from '../../services/agent/reportContext';

type ReportHeaderProps = {
    reportContextResolution: ReportContextResolution | null;
    effectiveReportContext: ResolvedReportContext;
    fileName: string | null;
    preparedRowCount: number;
    headerDepth: number;
    summaryRowCount: number;
    language: Settings['language'];
};

const differs = (left: string | null | undefined, right: string | null | undefined) =>
    (left ?? '').trim() !== (right ?? '').trim();

const toLineList = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

const FileIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
);

const RowsIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375z" />
    </svg>
);

const LayersIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
    </svg>
);

const ClockIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const SparkleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
);

// ---------------------------------------------------------------------------
// KPI stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    value: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ icon, iconBg, label, value }) => (
    <div className="rounded-card border border-slate-200/80 bg-white/80 p-3">
        <div className="flex items-start gap-2">
            <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                {icon}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900 break-all">{value}</p>
            </div>
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReportHeaderComponent: React.FC<ReportHeaderProps> = ({
    reportContextResolution,
    effectiveReportContext,
    fileName,
    preparedRowCount,
    headerDepth,
    summaryRowCount,
    language,
}) => {
    const generatedAtRef = useRef<string>(
        new Date().toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }),
    );

    const aiGuess = reportContextResolution?.verification.aiConfidence === 'low' && reportContextResolution.aiExtracted
        ? reportContextResolution.aiExtracted
        : null;
    const displayTitle = [
        aiGuess?.reportTitle,
        effectiveReportContext.reportTitle,
        fileName,
        'Untitled Report',
    ].find((candidate): candidate is string => typeof candidate === 'string' && isUsableReportTitle(candidate)) ?? 'Untitled Report';
    const aiParameterLines = toLineList(aiGuess?.parameterLines);
    const effectiveParameterLines = toLineList(effectiveReportContext.parameterLines);
    const parameterLines = (aiParameterLines.length > 0 ? aiParameterLines : effectiveParameterLines).slice(0, 5);
    const showAiGuessBanner = Boolean(aiGuess);
    const showValidatedFallbackNote = Boolean(
        aiGuess
        && reportContextResolution?.verification.usedFallback
        && (
            differs(aiGuess.reportTitle, effectiveReportContext.reportTitle)
            || aiParameterLines.join('\n') !== effectiveParameterLines.join('\n')
        ),
    );

    return (
        <section className="overflow-hidden rounded-card border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
            {/* Title area */}
            <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {getTranslation('report_header_context', language)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {displayTitle}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                        {effectiveReportContext.reportDescription
                            || getTranslation('report_header_hint', language)}
                    </p>
                    {/* Badges row */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                            <SparkleIcon />
                            {getTranslation('report_header_ai_badge', language)}
                        </span>
                        {showAiGuessBanner && (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                                {getTranslation('report_header_low_confidence', language)}
                            </span>
                        )}
                        {showValidatedFallbackNote && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                {getTranslation('report_header_validated_fallback', language)}
                            </span>
                        )}
                    </div>
                    {/* Compact info: file + rows — always visible */}
                    <p className="mt-2 text-xs text-slate-500">
                        {fileName && <>{fileName} · </>}{preparedRowCount.toLocaleString()} {getTranslation('report_header_prepared_rows', language).toLowerCase()}
                    </p>
                </div>
            </div>

            {/* Collapsible details: KPI cards + parameters */}
            <details className="group border-t border-slate-100">
                <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors">
                    {getTranslation('report_header_show_details', language)}
                </summary>
                <div className="px-4 pb-4 pt-2">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            icon={<FileIcon />}
                            iconBg="bg-blue-50 text-blue-500"
                            label={getTranslation('file_label', language).replace(':', '')}
                            value={fileName || displayTitle}
                        />
                        <StatCard
                            icon={<RowsIcon />}
                            iconBg="bg-teal-50 text-teal-500"
                            label={getTranslation('report_header_prepared_rows', language)}
                            value={preparedRowCount.toLocaleString()}
                        />
                        <StatCard
                            icon={<ClockIcon />}
                            iconBg="bg-violet-50 text-violet-500"
                            label={getTranslation('report_header_generated_at', language)}
                            value={generatedAtRef.current}
                        />
                        <StatCard
                            icon={<LayersIcon />}
                            iconBg="bg-slate-100 text-slate-500"
                            label={getTranslation('report_header_header_depth', language)}
                            value={headerDepth}
                        />
                    </div>
                    {parameterLines.length > 0 && (
                        <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {getTranslation('report_header_parameters', language)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {parameterLines.map(line => (
                                    <span
                                        key={line}
                                        title={line}
                                        className="inline-flex max-w-sm items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-900"
                                    >
                                        <span className="truncate">{line}</span>
                                    </span>
                                ))}
                                {summaryRowCount > 0 && (
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                                        {getTranslation('report_header_summary_rows', language)}: {summaryRowCount}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </details>
        </section>
    );
};

export const ReportHeader = React.memo(ReportHeaderComponent);
ReportHeader.displayName = 'ReportHeader';
