import React, { useState } from 'react';
import type { Settings } from '../types';
import { IconCheck } from '../icons/IconCheck';
import { IconChevron } from '../icons/IconChevron';
import { IconFileUpload } from '../icons/IconFileUpload';
import { IconLock } from '../icons/IconLock';
import { IconShieldCheck } from '../icons/IconShieldCheck';
import { getTranslation } from '../utils/localization';

export type ImportStage = 'parse' | 'analyse';
export type ImportCardTone = 'info' | 'error';

interface ImportProgressCardProps {
    language: Settings['language'];
    fileName: string;
    title: string;
    detail: string;
    tone: ImportCardTone;
    /** Derived from real app state, never a guessed percentage. */
    stage: ImportStage;
    providerLabel: string;
    onOpenLogs?: () => void;
}

const STEPS = [
    { id: 'upload', labelKey: 'import_step_upload', captionKey: 'import_step_upload_caption' },
    { id: 'parse', labelKey: 'import_step_parse', captionKey: 'import_step_parse_caption' },
    { id: 'analyse', labelKey: 'import_step_analyse', captionKey: 'import_step_analyse_caption' },
    { id: 'ready', labelKey: 'import_step_ready', captionKey: 'import_step_ready_caption' },
] as const;

const resolveStepState = (stepId: typeof STEPS[number]['id'], stage: ImportStage): 'done' | 'active' | 'waiting' => {
    const activeIndex = STEPS.findIndex(step => step.id === stage);
    const index = STEPS.findIndex(step => step.id === stepId);
    if (index < activeIndex) return 'done';
    return index === activeIndex ? 'active' : 'waiting';
};

const fileExtension = (fileName: string): string => {
    const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
    return match ? match[1].toUpperCase() : 'CSV';
};

export const ImportProgressCard: React.FC<ImportProgressCardProps> = ({
    language, fileName, title, detail, tone, stage, providerLabel, onOpenLogs,
}) => {
    const [showDetails, setShowDetails] = useState(false);
    const isError = tone === 'error';
    const t = (key: string) => getTranslation(key, language);

    return (
        <div className="flex h-full items-center justify-center px-2">
            <div className={`w-full max-w-3xl rounded-card border p-6 shadow-sm sm:p-8 ${
                isError ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50'
            }`}>
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <IconFileUpload className="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-2xl font-semibold text-slate-900">{title}</h3>
                        <p className="mt-1 truncate text-sm text-slate-600" title={fileName}>
                            {getTranslation('import_preparing_file', language, { fileName })}
                        </p>
                    </div>
                </div>

                {!isError && (
                    <>
                        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label={t('import_steps_label')}>
                            {STEPS.map(step => {
                                const state = resolveStepState(step.id, stage);
                                return (
                                    <li key={step.id} className="flex flex-col items-center text-center" aria-current={state === 'active' ? 'step' : undefined}>
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                                            state === 'done' ? 'border-blue-600 bg-blue-600 text-white'
                                                : state === 'active' ? 'border-blue-600 bg-white' : 'border-slate-300 bg-white'
                                        }`}>
                                            {state === 'done' && <IconCheck className="h-3 w-3" />}
                                            {state === 'active' && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                                        </span>
                                        <span className={`mt-2 text-sm font-semibold ${state === 'waiting' ? 'text-slate-400' : 'text-slate-900'}`}>{t(step.labelKey)}</span>
                                        <span className="text-xs text-slate-500">{t(step.captionKey)}</span>
                                    </li>
                                );
                            })}
                        </ol>
                        {/* No real percentage exists, so the bar is indeterminate instead of inventing one. */}
                        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={title} aria-busy="true">
                            <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
                        </div>
                    </>
                )}

                <p role="status" aria-live="polite" className={`mt-4 text-sm leading-6 ${isError ? 'text-red-700' : 'font-medium text-slate-800'}`}>
                    {detail}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                        <IconShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                        <div>
                            <p className="text-sm font-semibold text-emerald-950">{t('import_privacy_local_title')}</p>
                            <p className="mt-0.5 text-xs leading-5 text-emerald-900/80">{t('import_privacy_local_detail')}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <IconLock className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" />
                        <div>
                            <p className="text-sm font-semibold text-blue-950">{t('import_privacy_ai_title')}</p>
                            <p className="mt-0.5 text-xs leading-5 text-blue-900/80">{t('import_privacy_ai_detail')}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-white/70">
                    <button
                        type="button"
                        onClick={() => setShowDetails(open => !open)}
                        aria-expanded={showDetails}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800"
                    >
                        <IconChevron isOpen={showDetails} />
                        {t('import_technical_details')}
                    </button>
                    {showDetails && (
                        <dl className="grid gap-x-8 gap-y-2 border-t border-slate-200 px-4 py-3 text-sm sm:grid-cols-2">
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('import_tech_engine')}</dt><dd className="text-slate-900">{t('import_tech_engine_value')}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('import_tech_file_type')}</dt><dd className="text-slate-900">{fileExtension(fileName)}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('import_tech_provider')}</dt><dd className="text-slate-900">{providerLabel}</dd></div>
                            {onOpenLogs && (
                                <div className="flex justify-between gap-3">
                                    <dt className="text-slate-500">{t('import_tech_logs')}</dt>
                                    <dd><button type="button" onClick={onOpenLogs} className="font-medium text-blue-700 underline-offset-2 hover:underline">{t('view_technical_details')}</button></dd>
                                </div>
                            )}
                        </dl>
                    )}
                </div>

                <p className="mt-4 text-xs text-slate-500">{t('data_privacy_note')}</p>
            </div>
        </div>
    );
};
