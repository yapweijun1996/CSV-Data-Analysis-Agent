import React from 'react';
import type { AppLanguage, CsvData } from '../../types';
import type { DatabaseModalQueryActivity } from './databaseModalQueryActivity';
import { summarizeTraceContract } from '../../services/agent/traceContractView';
import { getTranslation } from '../../utils/localization';

interface DatabaseModalSidebarProps {
    csvData: CsvData | null;
    queryActivities: DatabaseModalQueryActivity[];
    selectedQueryActivity: DatabaseModalQueryActivity | null;
    onSelectQueryActivity: (id: string) => void;
    onLoadWorkspaceTemplate?: () => void;
    onRerunWorkspaceTemplate?: () => void;
    canLoadWorkspaceTemplate?: boolean;
    canRerunWorkspaceTemplate?: boolean;
    language?: AppLanguage;
}

const languageLocales: Record<string, string> = {
    English: 'en',
    Mandarin: 'zh-CN',
    Malay: 'ms',
    Japanese: 'ja',
};

const formatTimestamp = (value: Date | null, language: string) =>
    value ? new Date(value).toLocaleString(languageLocales[language] ?? 'en') : 'N/A';

const formatTemplateLabel = (
    templateId: DatabaseModalQueryActivity['templateId'],
    language: string,
) => {
    if (!templateId) {
        return 'N/A';
    }
    return getTranslation(`explorer_template_${templateId}`, language);
};

const formatOriginLabel = (
    origin: DatabaseModalQueryActivity['origin'],
    language: string,
) => getTranslation(`explorer_origin_${origin}`, language);

const formatOrderBy = (activity: DatabaseModalQueryActivity | null) => {
    const appliedOrderBy = activity?.result.appliedOrderBy ?? [];
    if (appliedOrderBy.length === 0) {
        return 'No sort applied';
    }
    return appliedOrderBy.map(order => `${order.column} (${order.direction})`).join(', ');
};

export const DatabaseModalSidebar: React.FC<DatabaseModalSidebarProps> = ({
    csvData,
    queryActivities,
    selectedQueryActivity,
    onSelectQueryActivity,
    onLoadWorkspaceTemplate,
    onRerunWorkspaceTemplate,
    canLoadWorkspaceTemplate = false,
    canRerunWorkspaceTemplate = false,
    language = 'English',
}) => {
    const selectedTrace = summarizeTraceContract(selectedQueryActivity?.traceContract ?? null);

    return (
    <aside className="space-y-4 xl:min-h-0 xl:overflow-y-auto">
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_current_result', language)}</p>
                    <p className="mt-2 text-sm text-slate-600">
                        {getTranslation('explorer_sidebar_hint', language)}
                    </p>
                </div>
                <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_recorded', language)}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{queryActivities.length}</p>
                </div>
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_file', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{csvData?.fileName ?? getTranslation('explorer_no_dataset', language)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_origin', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedQueryActivity ? formatOriginLabel(selectedQueryActivity.origin, language) : getTranslation('explorer_no_query_selected', language)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_template', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{formatTemplateLabel(selectedQueryActivity?.templateId, language)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_applied_at', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{formatTimestamp(selectedQueryActivity?.appliedAt ?? null, language)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_rows', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">
                        {selectedQueryActivity ? `${selectedQueryActivity.result.returnedRows} / ${selectedQueryActivity.result.totalMatchedRows}` : 'N/A'}
                    </dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_columns', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedQueryActivity?.result.selectedColumns.length ?? 0}</dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_limit', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedQueryActivity?.result.appliedLimit ?? 'N/A'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>{getTranslation('explorer_order', language)}</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedQueryActivity?.result.appliedOrderBy.length
                        ? formatOrderBy(selectedQueryActivity)
                        : getTranslation('explorer_no_sort_applied', language)}</dd>
                </div>
            </dl>
            <details className="mt-4 rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">{getTranslation('explorer_technical_details', language)}</summary>
                <dl className="mt-3 space-y-3 text-sm text-slate-700">
                    <div className="flex justify-between gap-4">
                        <dt>Phase</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedQueryActivity?.phase ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Engine</dt>
                        <dd className="text-right font-medium text-slate-900">{selectedQueryActivity?.engine ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Table</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedQueryActivity?.tableName ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Load version</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedQueryActivity?.loadVersion ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Reason code</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedTrace?.reasonCode ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Retry class</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedTrace?.retryClass ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Failure class</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedTrace?.failureClass ?? 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt>Trace contract</dt>
                        <dd className="break-all text-right font-medium text-slate-900">{selectedTrace?.contractVersion ?? 'N/A'}</dd>
                    </div>
                    {selectedQueryActivity?.fallbackReason ? (
                        <div>
                            <dt className="font-semibold">Fallback reason</dt>
                            <dd className="mt-1 break-words">{selectedQueryActivity.fallbackReason}</dd>
                        </div>
                    ) : null}
                </dl>
            </details>
            {selectedQueryActivity?.fallbackReason ? (
                <p className="mt-4 rounded-card border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                    {getTranslation('explorer_needs_review', language)}
                </p>
            ) : null}
            {(canLoadWorkspaceTemplate || canRerunWorkspaceTemplate) ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onLoadWorkspaceTemplate}
                        disabled={!canLoadWorkspaceTemplate}
                        className={`min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${
                            canLoadWorkspaceTemplate
                                ? 'bg-slate-900 text-white hover:bg-slate-800'
                                : 'cursor-not-allowed bg-slate-100 text-slate-400'
                        }`}
                    >
                        {getTranslation('explorer_load_template', language)}
                    </button>
                    <button
                        type="button"
                        onClick={onRerunWorkspaceTemplate}
                        disabled={!canRerunWorkspaceTemplate}
                        className={`min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${
                            canRerunWorkspaceTemplate
                                ? 'border border-slate-300 bg-white text-slate-900 hover:border-slate-400'
                                : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                        }`}
                    >
                        {getTranslation('explorer_rerun_query', language)}
                    </button>
                </div>
            ) : null}
        </section>

        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_query_history', language)}</p>
                    <p className="mt-2 text-sm text-slate-600">
                        {getTranslation('explorer_query_history_hint', language)}
                    </p>
                </div>
            </div>
            {queryActivities.length > 0 ? (
                <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-1">
                    {queryActivities.map(activity => {
                        const isSelected = selectedQueryActivity?.id === activity.id;
                        return (
                            <button
                                key={activity.id}
                                type="button"
                                onClick={() => onSelectQueryActivity(activity.id)}
                                className={`min-h-[44px] w-full rounded-card border px-3 py-2.5 text-left transition ${
                                    isSelected
                                        ? 'border-blue-300 bg-blue-50 shadow-sm'
                                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                                }`}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                                        {activity.source === 'active'
                                            ? getTranslation('explorer_current_query', language)
                                            : formatOriginLabel(activity.origin, language)}
                                    </span>
                                    {activity.templateId ? (
                                        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                                            {formatTemplateLabel(activity.templateId, language)}
                                        </span>
                                    ) : null}
                                    {activity.fallbackReason ? (
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                            {getTranslation('explorer_needs_review', language)}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-3 text-sm font-semibold text-slate-900">{activity.explanation}</p>
                                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                                    <span>{formatTimestamp(activity.appliedAt, language)}</span>
                                    <span>{getTranslation('explorer_rows_count', language, { count: `${activity.result.returnedRows} / ${activity.result.totalMatchedRows}` })}</span>
                                    <span>{activity.result.durationMs} ms</span>
                                    <span>{getTranslation(
                                        activity.result.truncated
                                            ? 'explorer_preview_truncated'
                                            : 'explorer_preview_complete',
                                        language,
                                    )}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="mt-4 rounded-card border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    {getTranslation('explorer_no_history', language)}
                </div>
            )}
        </section>
    </aside>
    );
};
