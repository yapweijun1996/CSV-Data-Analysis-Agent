import React from 'react';
import type {
    DataAnalysisSessionState,
    VisibleAnalysisTraceEntry,
    DataAnalysisSessionStatus,
    DataAnalysisNextStepDecision,
} from '../types';
import { AppLanguage } from '../types/localization';
import { getTranslation } from '../utils/localization';
import { isEndUserMode } from '../config/runtimeConfig';

interface AnalysisStepsPanelProps {
    session: DataAnalysisSessionState | null;
    trace: VisibleAnalysisTraceEntry[];
    language: AppLanguage;
}

function translateSessionStatus(status: DataAnalysisSessionStatus, language: AppLanguage): string {
    const key = `session_status_${status}`;
    const result = getTranslation(key, language);
    return result !== key ? result : status;
}

function translateStepStatus(status: VisibleAnalysisTraceEntry['status'], language: AppLanguage): string {
    const key = `step_status_${status}`;
    const result = getTranslation(key, language);
    return result !== key ? result : status;
}

function translateNextDecision(decision: DataAnalysisNextStepDecision | null, language: AppLanguage): string {
    const raw = decision ?? 'stop';
    const key = `next_decision_${raw}`;
    const result = getTranslation(key, language);
    return result !== key ? result : raw;
}

const statusClassName = (status: VisibleAnalysisTraceEntry['status']) => {
    switch (status) {
        case 'succeeded':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'rejected':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'failed':
            return 'bg-rose-50 text-rose-700 border-rose-200';
        default:
            return 'bg-slate-50 text-slate-700 border-slate-200';
    }
};

export const AnalysisStepsPanel: React.FC<AnalysisStepsPanelProps> = ({ session, trace, language }) => {
    const endUserMode = isEndUserMode();

    const localize = (entry: VisibleAnalysisTraceEntry, field: 'label' | 'whyThisStep' | 'summary' | 'result') => {
        const messageField = `${field}I18n` as 'labelI18n' | 'whyI18n' | 'summaryI18n' | 'resultI18n';
        const fallbackMap = {
            label: entry.label,
            whyThisStep: entry.whyThisStep,
            summary: entry.summary,
            result: entry.result,
        };
        const message = entry[messageField];
        if (!message) {
            return fallbackMap[field];
        }
        const translatedVars = message.vars && Object.fromEntries(
            Object.entries(message.vars).map(([key, value]) => [key, String(value)]),
        );
        const localized = getTranslation(message.key, language, translatedVars);
        if (localized === message.key) {
            return fallbackMap[field];
        }
        return localized;
    };

    if (!session || trace.length === 0) {
        return null;
    }

    return (
        <section className="mb-6 mt-4 rounded-card border border-slate-200 bg-white/95 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {getTranslation('analysis_steps_panel_title', language)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                        {getTranslation('analysis_steps_panel_subtitle', language)}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {getTranslation('analysis_steps_panel_description', language)}
                    </p>
                </div>
                <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <div>{getTranslation('analysis_steps_panel_status', language)}: <span className="font-semibold text-slate-900">{translateSessionStatus(session.status, language)}</span></div>
                    <div>{getTranslation('analysis_steps_panel_accepted_cards', language)}: <span className="font-semibold text-slate-900">{session.acceptedOutputs.length}</span></div>
                    <div>{getTranslation('analysis_steps_panel_step_budget', language)}: <span className="font-semibold text-slate-900">{session.stepsUsed}/{session.maxSteps}</span></div>
                </div>
            </div>

            <div className="mt-4 space-y-3">
                {trace.map(entry => (
                    <div key={entry.stepId} className="rounded-card border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                                    {entry.stepIndex}
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-slate-900">{localize(entry, 'label')}</div>
                                    <div className="text-xs text-slate-500">{localize(entry, 'whyThisStep')}</div>
                                </div>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassName(entry.status)}`}>
                                {translateStepStatus(entry.status, language)}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-3">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {getTranslation('analysis_steps_panel_checked', language)}
                                </div>
                                <p className="mt-1 leading-6">{localize(entry, 'summary')}</p>
                            </div>
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {getTranslation('analysis_steps_panel_result', language)}
                                </div>
                                <p className="mt-1 leading-6">{localize(entry, 'result')}</p>
                            </div>
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {getTranslation('analysis_steps_panel_next', language)}
                                </div>
                                <p className="mt-1 leading-6">{translateNextDecision(entry.nextDecision, language)}</p>
                            </div>
                        </div>
                        {!endUserMode && entry.reasonCodes.length > 0 && (
                            <div className="mt-3 text-xs text-slate-500">
                                {getTranslation('analysis_steps_panel_reason_codes', language)}: {entry.reasonCodes.join(', ')}
                            </div>
                        )}
                        {entry.queryPreview && (
                            <details className="mt-3 rounded-card border border-slate-200 bg-white p-3">
                                <summary className="cursor-pointer text-sm font-medium text-slate-800">
                                    {getTranslation('analysis_steps_panel_show_sql_preview', language)}
                                </summary>
                                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
                                    {entry.queryPreview}
                                </pre>
                            </details>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
};
