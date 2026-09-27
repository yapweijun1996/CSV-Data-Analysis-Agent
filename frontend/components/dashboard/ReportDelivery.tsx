import React from 'react';
import type { Settings } from '../../types';
import type { ReportBlockedInfo } from '../../services/reporting/reportArtifactManifest';
import { getTranslation } from '../../utils/localization';

type ReportTemplate = 'executive_brief' | 'management_review' | 'audit_appendix';

interface ReportDeliveryProps {
    language: Settings['language'];
    reportTemplate: ReportTemplate;
    onTemplateChange: (template: ReportTemplate) => void;
    onGenerate: () => void;
    onCancel?: () => void;
    onOpen: () => void;
    onExportPdf: () => void;
    isGenerating: boolean;
    progressLabel: string | null;
    hasReport: boolean;
    blockedInfo: ReportBlockedInfo | null;
    isPartial: boolean;
}

/* ── small inline SVG icons ──────────────────────────────── */

const DocumentIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
);

const SparkleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
);

const ExternalLinkIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
);

const DownloadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const LoadingSpinner: React.FC = () => (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none"
        viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

const CheckIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2}
        stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
);

const ShieldBlockIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
    </svg>
);

/* ── template option icons ────────────────────────────────── */

const BriefIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
);

const ManagementIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
);

const AuditIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5}
        stroke="currentColor" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
);

/* ── generation step indicator ───────────────────────────── */

const REPORT_STEPS = [
    'report_step_collecting',
    'report_step_structuring',
    'report_step_rendering',
] as const;

const StepDotComplete: React.FC = () => (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
        </svg>
    </span>
);

const StepDotActive: React.FC = () => (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-violet-500 bg-white">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" />
    </span>
);

const StepDotPending: React.FC = () => (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white">
        <span className="h-2 w-2 rounded-full bg-slate-200" />
    </span>
);

interface StepIndicatorProps {
    progressLabel: string;
    language: Settings['language'];
}

const GenerationStepIndicator: React.FC<StepIndicatorProps> = ({ progressLabel, language }) => {
    const pct = parseProgressPercent(progressLabel);
    // map 0-100% to 3 steps: step 0 active below 40%, step 1 active 40-75%, step 2 active above 75%
    const activeStep = pct < 40 ? 0 : pct < 75 ? 1 : 2;

    return (
        <div className="mt-4" role="status" aria-label={getTranslation('report_generation_progress', language)}>
            <div className="flex items-center gap-0">
                {REPORT_STEPS.map((key, idx) => {
                    const done = idx < activeStep;
                    const active = idx === activeStep;
                    return (
                        <React.Fragment key={key}>
                            <div className={`flex flex-col items-center gap-1.5 ${idx === 0 ? 'flex-none' : 'flex-1 items-center'}`} style={{ minWidth: 0 }}>
                                {done ? <StepDotComplete /> : active ? <StepDotActive /> : <StepDotPending />}
                                <span className={`whitespace-nowrap text-[11px] font-semibold ${done ? 'text-violet-500' : active ? 'text-violet-700' : 'text-slate-400'}`}>
                                    {getTranslation(key, language)}
                                </span>
                            </div>
                            {idx < REPORT_STEPS.length - 1 && (
                                <div className={`mb-5 flex-1 border-t-2 ${idx < activeStep ? 'border-violet-400' : 'border-slate-200'}`} aria-hidden="true" />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

/* ── template options ────────────────────────────────────── */

const TEMPLATE_OPTIONS: { value: ReportTemplate; key: string; descKey: string; icon: React.ReactNode }[] = [
    { value: 'executive_brief', key: 'report_template_executive_brief', descKey: 'report_template_executive_brief_desc', icon: <BriefIcon /> },
    { value: 'management_review', key: 'report_template_management_review', descKey: 'report_template_management_review_desc', icon: <ManagementIcon /> },
    { value: 'audit_appendix', key: 'report_template_audit_appendix', descKey: 'report_template_audit_appendix_desc', icon: <AuditIcon /> },
];

/* ── component ───────────────────────────────────────────── */

const ReportDeliveryComponent: React.FC<ReportDeliveryProps> = ({
    language,
    reportTemplate,
    onTemplateChange,
    onGenerate,
    onCancel,
    onOpen,
    onExportPdf,
    isGenerating,
    progressLabel,
    hasReport,
    blockedInfo,
    isPartial,
}) => {
    const sectionLabel = getTranslation('report_delivery_label', language);
    const generateLabel = getTranslation('generate_analyst_report', language);
    const generateHint = getTranslation('generate_analyst_report_hint', language);
    const runningLabel = getTranslation('generate_analyst_report_running', language);
    const templateLabel = getTranslation('report_template_label', language);
    const actionsLabel = getTranslation('report_actions_label', language);
    const openLabel = getTranslation('report_open', language);
    const exportLabel = getTranslation('report_export_pdf', language);
    const cancelLabel = getTranslation('report_cancel', language);
    const blockedTitle = getTranslation('report_blocked_title', language);

    const isBlocked = Boolean(blockedInfo) && !hasReport && !isGenerating;
    const isButtonDisabled = isGenerating || isBlocked;

    return (
        <section
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            aria-label={sectionLabel}
        >
            {/* accent bar — amber when blocked, violet otherwise */}
            <span className={`absolute inset-x-0 top-0 h-[3px] ${isBlocked ? 'bg-amber-500' : 'bg-violet-500'}`} aria-hidden="true" />

            <div className="p-5">
                {/* header row */}
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    {/* left: label + description */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center rounded-lg p-1.5 ${isBlocked ? 'bg-amber-100 text-amber-600' : 'bg-violet-100 text-violet-600'}`}>
                                <DocumentIcon />
                            </span>
                            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                                {sectionLabel}
                            </p>
                        </div>
                        <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
                            {generateLabel}
                        </h3>
                        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
                            {generateHint}
                        </p>
                    </div>

                    {/* right: generate button */}
                    <div className="shrink-0">
                        <button
                            type="button"
                            onClick={onGenerate}
                            disabled={isButtonDisabled}
                            title={isGenerating ? runningLabel : isBlocked ? blockedTitle : generateLabel}
                            className={[
                                'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all sm:w-auto sm:min-w-[180px] sm:whitespace-nowrap',
                                isGenerating
                                    ? 'cursor-not-allowed border border-violet-200 bg-violet-50 text-violet-500'
                                    : isBlocked
                                        ? 'cursor-not-allowed border border-amber-200 bg-amber-50 text-amber-500'
                                        : 'border border-violet-600 bg-violet-600 text-white shadow-sm hover:bg-violet-700 hover:shadow-md active:bg-violet-800',
                            ].join(' ')}
                        >
                            {isGenerating ? (
                                <>
                                    <LoadingSpinner />
                                    <span>{runningLabel}{progressLabel ? ` (${progressLabel})` : ''}</span>
                                </>
                            ) : (
                                <>
                                    <SparkleIcon />
                                    <span>{generateLabel}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* template card selector */}
                <div className="mt-5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {templateLabel}
                    </span>
                    <div className="mt-2 grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label={templateLabel}>
                        {TEMPLATE_OPTIONS.map(opt => {
                            const isActive = reportTemplate === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    onClick={() => onTemplateChange(opt.value)}
                                    className={[
                                        'relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                                        isActive
                                            ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                                            : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40',
                                    ].join(' ')}
                                >
                                    {isActive && (
                                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white" aria-hidden="true">
                                            <CheckIcon />
                                        </span>
                                    )}
                                    <span className={`mt-0.5 shrink-0 rounded-md p-1.5 ${isActive ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
                                        {opt.icon}
                                    </span>
                                    <div className="min-w-0 flex-1 pr-5">
                                        <p className={`text-sm font-semibold ${isActive ? 'text-violet-900' : 'text-slate-800'}`}>
                                            {getTranslation(opt.key, language)}
                                        </p>
                                        <p className={`mt-0.5 text-xs leading-relaxed ${isActive ? 'text-violet-700' : 'text-slate-500'}`}>
                                            {getTranslation(opt.descKey, language)}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* stepped progress indicator during generation */}
                {isGenerating && progressLabel && (
                    <div className="mt-4">
                        <GenerationStepIndicator progressLabel={progressLabel} language={language} />
                        {onCancel && (
                            <div className="mt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 md:min-h-0"
                                >
                                    {cancelLabel}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {isGenerating && !progressLabel && (
                    <div className="mt-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-violet-100">
                            <div className="h-full w-[30%] animate-pulse rounded-full bg-violet-400" />
                        </div>
                        {onCancel && (
                            <div className="mt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 md:min-h-0"
                                >
                                    {cancelLabel}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* blocked state card */}
                {isBlocked && blockedInfo && (
                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                                <ShieldBlockIcon />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-amber-900">
                                    {getTranslation('report_blocked_title', language)}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                                    {getTranslation('report_blocked_detail', language, {
                                        trusted: String(blockedInfo.trustedCardsCount),
                                        excluded: String(blockedInfo.excludedEvidenceCount),
                                    })}
                                </p>
                                {blockedInfo.reasons.length > 0 && (
                                    <ul className="mt-2.5 space-y-1.5">
                                        {blockedInfo.reasons.map((reason) => (
                                            <li key={reason} className="flex items-start gap-2 text-xs text-amber-800">
                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                                                {reason}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="mt-3 border-t border-amber-200 pt-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600">
                                        {getTranslation('report_blocked_what_to_do_label', language)}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-amber-700">
                                        {getTranslation('report_blocked_what_to_do', language)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* report actions — visible when a report is available */}
                {hasReport && !isGenerating && (
                    <div className={`mt-4 rounded-lg border p-3 ${isPartial ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/60'}`}>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isPartial ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    <CheckIcon />
                                    {actionsLabel}
                                </span>
                                {isPartial && (
                                    <span className="text-[11px] text-amber-600">
                                        {getTranslation('report_partial_hint', language)}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onOpen}
                                    title={openLabel}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-violet-600 bg-violet-600 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow-md active:bg-violet-800 md:h-8 md:min-h-0"
                                >
                                    <ExternalLinkIcon />
                                    {openLabel}
                                </button>
                                <button
                                    type="button"
                                    onClick={onExportPdf}
                                    title={exportLabel}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow md:h-8 md:min-h-0"
                                >
                                    <DownloadIcon />
                                    {exportLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

/* ── helpers ─────────────────────────────────────────────── */

const parseProgressPercent = (label: string): number => {
    const match = label.match(/^(\d+)\/(\d+)$/);
    if (!match) return 30;
    const completed = Number(match[1]);
    const total = Number(match[2]);
    return total > 0 ? Math.round((completed / total) * 100) : 30;
};

export const ReportDelivery = React.memo(ReportDeliveryComponent);
