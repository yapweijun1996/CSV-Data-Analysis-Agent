import React from 'react';
import type { DataAnalysisSessionState } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';
import { normalizeDisplayLabel } from '../../services/dashboard/executiveKpiUtils';
import { tallyResearchQuestions } from '../../services/agent/runtime/dataResearchContract';

const statusStyle: Record<string, string> = {
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-success-100 text-success-700',
    degraded: 'bg-warning-100 text-warning-800',
    failed: 'bg-danger-100 text-danger-700',
    cancelled: 'bg-slate-200 text-slate-700',
    queued: 'bg-slate-100 text-slate-600',
};

export const ResearchRunSummary: React.FC<{
    session: DataAnalysisSessionState;
}> = ({ session }) => {
    const language = useAppStore(state => state.settings.language);
    const brief = session.researchBrief;
    if (!brief) return null;

    // The same tally feeds the results banner, so the strip and the banner agree.
    const tally = tallyResearchQuestions(session);
    const showPills = tally !== null && (tally.supported + tally.notSupported > 0 || session.status !== 'running');

    return (
        <section
            aria-label={getTranslation('research_run', language)}
            className="rounded-card border border-slate-200 bg-white p-4 shadow-sm"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {getTranslation('research_run', language)}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900">{brief.goal}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                        {getTranslation(
                            brief.questions.length === 1
                                ? 'research_prioritized_question'
                                : 'research_prioritized_questions',
                            language,
                            {
                            count: brief.questions.length,
                            },
                        )}
                    </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[session.status] ?? statusStyle.queued}`}>
                    {getTranslation(`research_status_${session.status}`, language)}
                </span>
            </div>

            {brief.clarification && (
                <div className="mt-3 rounded-md border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900">
                    <p className="font-semibold">{getTranslation('research_clarification_needed', language)}</p>
                    <p className="mt-1">{brief.clarification.question}</p>
                    <p className="mt-1 text-warning-700">{brief.clarification.reason}</p>
                </div>
            )}

            {brief.questions.length > 0 && (
                <ol className="mt-3 space-y-1.5 text-xs text-slate-700">
                    {brief.questions.slice(0, 4).map(question => (
                        <li key={question.id}>
                            <div className="flex gap-2">
                                <span className="font-semibold text-slate-400">{question.priority}</span>
                                <span className="flex-1">{normalizeDisplayLabel(question.question, question.question)}</span>
                                <span className="shrink-0 text-slate-500">
                                    {getTranslation(`research_finding_${question.status}`, language)}
                                </span>
                            </div>
                            {question.status === 'unsupported' && (
                                <p className="mt-0.5 pl-5 text-[11px] text-slate-500">
                                    {getTranslation('research_not_supported_reason', language)}
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
            )}

            {showPills && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs empty:hidden">
                    {tally.supported > 0 && (
                        <span className="rounded-full bg-success-50 px-2 py-1 text-success-700">
                            {getTranslation('research_supported_count', language, { count: tally.supported })}
                        </span>
                    )}
                    {tally.unanswered > 0 && (
                        <span className="rounded-full bg-warning-50 px-2 py-1 text-warning-800">
                            {getTranslation('research_unanswered_count', language, { count: tally.unanswered })}
                        </span>
                    )}
                    {tally.notSupported > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                            {getTranslation('research_rejected_count', language, { count: tally.notSupported })}
                        </span>
                    )}
                </div>
            )}
            {(brief.datasetVersionId || session.stopReason) && (
                <details className="mt-3 rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
                    <summary className="cursor-pointer font-semibold text-slate-800">
                        {getTranslation('research_technical_details', language)}
                    </summary>
                    <dl className="mt-3 space-y-2">
                        {brief.datasetVersionId && (
                            <div>
                                <dt className="font-semibold">{getTranslation('research_dataset_version', language)}</dt>
                                <dd className="break-all">{brief.datasetVersionId}</dd>
                            </div>
                        )}
                        {session.stopReason && (
                            <div>
                                <dt className="font-semibold">{getTranslation('research_stop_reason', language)}</dt>
                                <dd className="break-all">{session.stopReason}</dd>
                            </div>
                        )}
                    </dl>
                </details>
            )}
        </section>
    );
};
