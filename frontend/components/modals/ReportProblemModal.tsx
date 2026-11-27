import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import {
    closeProblemReport,
    isProblemReportOpen,
    subscribeProblemReport,
} from '../../services/support/problemReportService';
import {
    buildProblemReport,
    problemReportFileName,
    summarizeProblemReport,
    type ProblemReport,
} from '../../services/support/problemReport';
import { copyText } from '../../services/utils/copyText';
import { toast } from '../../services/ui/toastService';
import { getTranslation } from '../../utils/localization';
import { IconBug } from '../../icons/IconBug';
import { IconClose } from '../../icons/IconClose';

const downloadJson = (contents: string, fileName: string): void => {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export const ReportProblemModal: React.FC = () => {
    const open = useSyncExternalStore(subscribeProblemReport, isProblemReportOpen, isProblemReportOpen);
    return open ? <OpenReportProblemModal /> : null;
};

const OpenReportProblemModal: React.FC = () => {
    const language = useAppStore(state => state.settings.language);
    const [includeSample, setIncludeSample] = useState(false);
    const [note, setNote] = useState('');
    const [report, setReport] = useState<ProblemReport | null>(null);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(true, closeProblemReport);
    const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, language, params);

    // Rebuild on every option change so the preview is exactly what Copy/Download will send.
    useEffect(() => {
        let cancelled = false;
        void buildProblemReport(useAppStore.getState(), {
            appVersion: import.meta.env.VITE_APP_VERSION ?? '0.1.0-beta.1',
            releaseCommit: import.meta.env.VITE_RELEASE_COMMIT ?? 'local-build',
            userAgent: navigator.userAgent,
            language: navigator.language,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            online: navigator.onLine,
        }, { includeSample, note }).then(next => { if (!cancelled) setReport(next); });
        return () => { cancelled = true; };
    }, [includeSample, note]);

    const json = report ? JSON.stringify(report, null, 2) : '';
    const summary = report ? summarizeProblemReport(report) : null;

    const handleCopy = useCallback(async () => {
        try {
            await copyText(json);
            toast.success(t('report_problem_copied'));
        } catch {
            toast.error(t('report_problem_copy_failed'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [json, language]);

    const handleDownload = useCallback(() => {
        if (!report) return;
        downloadJson(json, problemReportFileName(report.generatedAt));
        toast.success(t('report_problem_downloaded'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [json, report, language]);

    const primary = 'min-h-[44px] rounded-md bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50';
    const secondary = 'min-h-[44px] rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

    return (
        <div className="fixed inset-0 z-[9400] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={closeProblemReport}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-problem-title"
                tabIndex={-1}
                className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-card border border-slate-200 bg-white shadow-2xl outline-none sm:rounded-card"
                onClick={event => event.stopPropagation()}
                data-testid="report-problem-modal"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <h2 id="report-problem-title" className="flex items-center gap-2 text-lg font-bold text-slate-950">
                        <IconBug className="h-5 w-5 text-red-600" />{t('report_problem_title')}
                    </h2>
                    <button type="button" onClick={closeProblemReport} aria-label={t('report_problem_close')}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                        <IconClose className="h-5 w-5" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
                    <p>{t('report_problem_intro')}</p>
                    {summary && (
                        <dl className="grid gap-2 rounded-card border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2" data-testid="report-problem-summary">
                            <div><dt className="font-semibold text-slate-900">{t('report_problem_summary_release')}</dt><dd className="break-all">{summary.release}</dd></div>
                            <div><dt className="font-semibold text-slate-900">{t('report_problem_summary_ai')}</dt><dd className="break-all">{summary.provider}</dd></div>
                            <div><dt className="font-semibold text-slate-900">{t('report_problem_summary_dataset')}</dt><dd className="break-all">{summary.dataset}</dd></div>
                            <div><dt className="font-semibold text-slate-900">{t('report_problem_summary_errors')}</dt><dd>{summary.errorCount}</dd></div>
                            {summary.lastError && (
                                <div className="sm:col-span-2"><dt className="font-semibold text-slate-900">{t('report_problem_summary_last_error')}</dt><dd className="break-words text-red-700">{summary.lastError}</dd></div>
                            )}
                        </dl>
                    )}
                    <label className="block">
                        <span className="font-semibold text-slate-900">{t('report_problem_note_label')}</span>
                        <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={1000}
                            placeholder={t('report_problem_note_placeholder')}
                            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300" />
                    </label>
                    <label className="flex min-h-[44px] items-start gap-2">
                        <input type="checkbox" checked={includeSample} onChange={event => setIncludeSample(event.target.checked)} className="mt-1 h-4 w-4" />
                        <span>
                            <span className="font-semibold text-slate-900">{t('report_problem_include_sample')}</span>
                            <span className="block text-xs text-slate-500">{t('report_problem_sample_warning')}</span>
                        </span>
                    </label>
                    <p className="text-xs text-slate-500">{t('report_problem_privacy')}</p>
                    <details>
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">{t('report_problem_preview')}</summary>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100" data-testid="report-problem-json">{json}</pre>
                    </details>
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
                    <button type="button" className={secondary} onClick={closeProblemReport}>{t('report_problem_close')}</button>
                    <button type="button" className={secondary} disabled={!report} onClick={handleDownload} data-testid="report-problem-download">{t('report_problem_download')}</button>
                    <button type="button" data-dialog-initial-focus className={primary} disabled={!report} onClick={() => { void handleCopy(); }} data-testid="report-problem-copy">{t('report_problem_copy')}</button>
                </div>
            </div>
        </div>
    );
};
