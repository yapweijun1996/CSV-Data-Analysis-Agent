import React from 'react';
import type {
    DuckDbSessionStatus,
    WorkspaceAggregateBreakdownQueryRequest,
    WorkspaceDataQueryRequest,
    WorkspaceFilterLookupQueryRequest,
    WorkspaceNullBlankScanQueryRequest,
    WorkspacePreviewRowsQueryRequest,
    WorkspaceQueryTemplateId,
} from '../../types';
import { WORKSPACE_QUERY_TEMPLATE_OPTIONS } from '../../services/agent/execution/workspaceDataQuery';
import type { AppLanguage } from '../../types';
import { getTranslation } from '../../utils/localization';
import {
    PreviewRowsEditor,
    FilterLookupEditor,
    AggregateBreakdownEditor,
    DuplicateCandidatesEditor,
    NullBlankScanEditor,
} from './workspace/QueryTemplateEditors';

interface DatabaseWorkspaceQueryComposerProps {
    availableColumns: string[];
    groupableColumns: string[];
    templateId: WorkspaceQueryTemplateId;
    draft: WorkspaceDataQueryRequest;
    duckDbSessionStatus: DuckDbSessionStatus;
    onTemplateChange: (templateId: WorkspaceQueryTemplateId) => void;
    onDraftChange: (draft: WorkspaceDataQueryRequest) => void;
    onRunQuery: () => void;
    onRefreshSession: () => void;
    isSubmitting: boolean;
    isRefreshingSession: boolean;
    errorMessage: string | null;
    language?: AppLanguage;
}

export const getWorkspaceQueryDraftValidationMessage = (
    draft: WorkspaceDataQueryRequest,
): string | null => {
    if (draft.templateId === 'null_blank_scan' && !draft.column.trim()) {
        return 'Select a target column before running the null / blank scan.';
    }
    return null;
};

export const DatabaseWorkspaceQueryComposer: React.FC<DatabaseWorkspaceQueryComposerProps> = ({
    availableColumns,
    groupableColumns,
    templateId,
    draft,
    duckDbSessionStatus,
    onTemplateChange,
    onDraftChange,
    onRunQuery,
    onRefreshSession,
    isSubmitting,
    isRefreshingSession,
    errorMessage,
    language = 'English',
}) => {
    const isDuckDbReady = duckDbSessionStatus.status === 'ready';
    const validationMessage = getWorkspaceQueryDraftValidationMessage(draft);
    const isSubmitDisabled = !isDuckDbReady || availableColumns.length === 0 || isSubmitting || Boolean(validationMessage);

    return (
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_query_templates', language)}</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">{getTranslation('explorer_query_builder', language)}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                        {getTranslation('explorer_query_builder_hint', language)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onRefreshSession}
                        disabled={isRefreshingSession}
                        className={`min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${
                            isRefreshingSession
                                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                                : 'border border-slate-300 bg-white text-slate-900 hover:border-slate-400'
                        }`}
                    >
                        {isRefreshingSession
                            ? getTranslation('explorer_refreshing', language)
                            : getTranslation('explorer_refresh_session', language)}
                    </button>
                    <button
                        type="button"
                        onClick={onRunQuery}
                        disabled={isSubmitDisabled}
                        className={`min-h-[44px] rounded-card px-3 py-2 text-sm font-medium transition ${
                            isSubmitDisabled
                                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                    >
                        {isSubmitting
                            ? getTranslation('explorer_running_query', language)
                            : getTranslation('explorer_run_query', language)}
                    </button>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {WORKSPACE_QUERY_TEMPLATE_OPTIONS.map(option => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => onTemplateChange(option.id)}
                        className={`min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition ${
                            templateId === option.id
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                        }`}
                    >
                        {getTranslation(`explorer_template_${option.id}`, language)}
                    </button>
                ))}
            </div>

            <div className="mt-4 rounded-card border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">
                    {getTranslation(`explorer_template_${templateId}_description`, language)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                    {getTranslation('explorer_session_contract', language)}
                </p>
            </div>

            {!isDuckDbReady ? (
                <div className="mt-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {getTranslation('explorer_session_status', language, { status: duckDbSessionStatus.status })}
                    {duckDbSessionStatus.fallbackReason
                        ? ` ${duckDbSessionStatus.fallbackReason}`
                        : ` ${getTranslation('explorer_session_rebind', language)}`}
                </div>
            ) : null}

            {errorMessage ? (
                <div role="alert" className="mt-4 rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorMessage}
                </div>
            ) : null}

            {validationMessage ? (
                <div role="alert" className="mt-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {draft.templateId === 'null_blank_scan'
                        ? getTranslation('explorer_select_target_column_error', language)
                        : validationMessage}
                </div>
            ) : null}

            <div className="mt-4">
                {templateId === 'preview_rows' && (
                    <PreviewRowsEditor
                        draft={draft as WorkspacePreviewRowsQueryRequest}
                        availableColumns={availableColumns}
                        onDraftChange={onDraftChange}
                        language={language}
                    />
                )}
                {templateId === 'filter_lookup' && (
                    <FilterLookupEditor
                        draft={draft as WorkspaceFilterLookupQueryRequest}
                        availableColumns={availableColumns}
                        onDraftChange={onDraftChange}
                        language={language}
                    />
                )}
                {templateId === 'aggregate_breakdown' && (
                    <AggregateBreakdownEditor
                        draft={draft as WorkspaceAggregateBreakdownQueryRequest}
                        groupableColumns={groupableColumns}
                        selectableColumns={availableColumns}
                        onDraftChange={onDraftChange}
                        language={language}
                    />
                )}
                {templateId === 'duplicate_candidates' && (
                    <DuplicateCandidatesEditor
                        draft={draft as Extract<WorkspaceDataQueryRequest, { templateId: 'duplicate_candidates' }>}
                        availableColumns={groupableColumns}
                        onDraftChange={onDraftChange}
                        language={language}
                    />
                )}
                {templateId === 'null_blank_scan' && (
                    <NullBlankScanEditor
                        draft={draft as WorkspaceNullBlankScanQueryRequest}
                        availableColumns={availableColumns}
                        onDraftChange={onDraftChange}
                        language={language}
                    />
                )}
            </div>
        </section>
    );
};
