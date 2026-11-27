import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ModalFrame } from '../ui/ModalFrame';
import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS, FIELD_CLASS } from '../ui/formStyles';
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

    return (
        <ModalFrame
            isOpen
            onClose={closeProblemReport}
            titleId="report-problem-title"
            title={t('report_problem_title')}
            icon={<IconBug className="h-6 w-6 text-danger-600" />}
            closeLabel={t('report_problem_close')}
            maxWidthClass="max-w-2xl"
            zClass="z-[9400]"
            mobileSheet
            testId="report-problem-modal"
            bodyClassName="space-y-4 px-4 py-4 text-sm text-slate-700 sm:px-6"
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" className={BUTTON_SECONDARY_CLASS} disabled={!report} onClick={handleDownload} data-testid="report-problem-download">{t('report_problem_download')}</button>
                    <button type="button" data-dialog-initial-focus className={BUTTON_PRIMARY_CLASS} disabled={!report} onClick={() => { void handleCopy(); }} data-testid="report-problem-copy">{t('report_problem_copy')}</button>
                </div>
            }
        >
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
                            className={`mt-1 ${FIELD_CLASS}`} />
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
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-ink-950 p-3 text-xs text-ink-100" data-testid="report-problem-json">{json}</pre>
                    </details>
        </ModalFrame>
    );
};
