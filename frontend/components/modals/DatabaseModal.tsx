import React, { useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { TabulatorTable, type TabulatorTableSortState } from '../spreadsheet/TabulatorTable';
import { useAppStore, type AppStore } from '../../store/useAppStore';
import { IconClose } from '../../icons/IconClose';
import type { CsvRow, WorkspaceDataQueryRequest, WorkspaceQueryRunOutcome, WorkspaceQueryTemplateId } from '../../types';
import {
    buildDatabaseModalQueryActivityFromOutcome,
    buildDatabaseModalQueryActivities,
    type DatabaseModalQueryActivity,
} from './databaseModalQueryActivity';
import { DatabaseModalSidebar } from './DatabaseModalSidebar';
import {
    DatabaseWorkspaceQueryComposer,
    getWorkspaceQueryDraftValidationMessage,
} from './DatabaseWorkspaceQueryComposer';
import { createDefaultWorkspaceQueryDrafts } from '../../services/agent/execution/workspaceDataQuery';
import { createIdleDuckDbSessionStatus } from '../../services/duckdb/sessionStatus';
import { buildEffectiveColumnRegistryFromState } from '../../services/data/columnRegistry';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { getTranslation } from '../../utils/localization';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const getColumns = (rows: CsvRow[], preferredColumns?: string[]) => {
    if (preferredColumns && preferredColumns.length > 0) {
        return preferredColumns;
    }
    return rows.length > 0 ? Object.keys(rows[0]) : [];
};

const filterRows = (rows: CsvRow[], columns: string[], searchTerm: string) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
        return rows;
    }

    return rows.filter(row => columns.some(column =>
        String(row[column] ?? '').toLowerCase().includes(normalizedSearch),
    ));
};

const getSortSummary = (sortState: TabulatorTableSortState) =>
    sortState.column ? `${sortState.column} (${sortState.direction})` : 'No sort applied';

const getDefaultSelectedActivityId = (
    queryActivities: DatabaseModalQueryActivity[],
) => queryActivities[0]?.id ?? null;

type WorkspaceQueryRunState =
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'succeeded'; outcome: WorkspaceQueryRunOutcome }
    | { status: 'failed'; message: string; draft: WorkspaceDataQueryRequest };

const formatSessionTimestamp = (value: Date | null) => value ? new Date(value).toLocaleString() : 'Not synced';

const getSelectableColumns = (
    columnRegistry: AppStore['columnRegistry'],
    rows: CsvRow[],
) => {
    const fromRegistry = columnRegistry?.columns
        .filter(column => column.allowedUsages.select)
        .map(column => column.physicalName) ?? [];
    return fromRegistry.length > 0 ? fromRegistry : getColumns(rows);
};

const getGroupableColumns = (
    columnRegistry: AppStore['columnRegistry'],
    fallbackColumns: string[],
) => {
    const fromRegistry = columnRegistry?.columns
        .filter(column => column.allowedUsages.groupBy)
        .map(column => column.physicalName) ?? [];
    if (columnRegistry) {
        return fromRegistry;
    }
    return fallbackColumns;
};

const getStatusBadgeClassName = (status: AppStore['duckDbSessionStatus']['status']) => {
    switch (status) {
        case 'ready':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        case 'binding':
            return 'border-blue-200 bg-blue-50 text-blue-700';
        case 'degraded':
            return 'border-amber-200 bg-amber-50 text-amber-700';
        case 'error':
            return 'border-rose-200 bg-rose-50 text-rose-700';
        default:
            return 'border-slate-200 bg-slate-100 text-slate-600';
    }
};

export const DatabaseModal: React.FC = () => {
    const {
        isOpen,
        onClose,
        activeDataQuery,
        csvData,
        columnRegistry,
        columnProfiles,
        datasetSemanticSnapshot,
        userColumnAnnotations,
        analysisSteering,
        queryHistory,
        language,
        duckDbSessionStatus,
        runWorkspaceDataQuery,
        refreshDuckDbSession,
    } = useAppStore((state: AppStore) => ({
        isOpen: state.isDatabaseModalOpen,
        onClose: () => state.setIsDatabaseModalOpen(false),
        activeDataQuery: state.activeDataQuery,
        csvData: state.csvData,
        columnRegistry: state.columnRegistry,
        columnProfiles: state.columnProfiles,
        datasetSemanticSnapshot: state.datasetSemanticSnapshot,
        userColumnAnnotations: state.userColumnAnnotations,
        analysisSteering: state.latestAnalysisSession?.analysisSteering ?? null,
        queryHistory: state.queryHistory,
        language: state.settings.language,
        duckDbSessionStatus: state.duckDbSessionStatus,
        runWorkspaceDataQuery: state.runWorkspaceDataQuery,
        refreshDuckDbSession: state.refreshDuckDbSession,
    }), shallow);

    const [searchTerm, setSearchTerm] = useState('');
    const [sortState, setSortState] = useState<TabulatorTableSortState>({ column: null, direction: 'asc' });
    const [selectedQueryTraceId, setSelectedQueryTraceId] = useState<string | null>(null);
    const [activeTemplateId, setActiveTemplateId] = useState<WorkspaceQueryTemplateId>('preview_rows');
    const [drafts, setDrafts] = useState<Record<WorkspaceQueryTemplateId, WorkspaceDataQueryRequest>>({
        preview_rows: { templateId: 'preview_rows', columns: [], orderBy: null, limit: 25 },
        filter_lookup: { templateId: 'filter_lookup', columns: [], predicates: [], groups: [], orderBy: null, limit: 25 },
        aggregate_breakdown: {
            templateId: 'aggregate_breakdown',
            groupBy: [],
            aggregate: { function: 'count', column: null, as: 'row_count' },
            orderBy: { column: 'row_count', direction: 'desc' },
            limit: 25,
        },
        duplicate_candidates: { templateId: 'duplicate_candidates', keyColumns: [], countAlias: 'duplicate_count', limit: 25 },
        null_blank_scan: { templateId: 'null_blank_scan', column: '', resultMode: 'preview', limit: 25 },
    });
    const [queryRunState, setQueryRunState] = useState<WorkspaceQueryRunState>({ status: 'idle' });
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [isRefreshingSession, setIsRefreshingSession] = useState(false);
    const wasOpenRef = useRef(false);
    const autoRefreshAttemptKeyRef = useRef<string | null>(null);
    const dialogRef = useDialogAccessibility<HTMLDivElement>(
        isOpen,
        onClose,
        { restoreFocusSelector: '[data-data-explorer-trigger="true"]' },
    );
    const resolvedDuckDbSessionStatus = duckDbSessionStatus ?? createIdleDuckDbSessionStatus();
    const effectiveColumnRegistry = useMemo(
        () => buildEffectiveColumnRegistryFromState({
            csvData,
            columnProfiles,
            datasetSemanticSnapshot,
            userColumnAnnotations,
            latestAnalysisSession: {
                analysisSteering,
            },
            columnRegistry,
        }, {
            datasetOverride: csvData,
        }),
        [analysisSteering, columnProfiles, columnRegistry, csvData, datasetSemanticSnapshot, userColumnAnnotations],
    );

    const availableColumns = useMemo(
        () => getSelectableColumns(effectiveColumnRegistry, csvData?.data ?? []),
        [effectiveColumnRegistry, csvData?.data],
    );
    const groupableColumns = useMemo(
        () => getGroupableColumns(effectiveColumnRegistry, availableColumns),
        [availableColumns, effectiveColumnRegistry],
    );
    const columnSignature = `${availableColumns.join('|')}::${groupableColumns.join('|')}`;
    const defaultDrafts = useMemo(
        () => createDefaultWorkspaceQueryDrafts({
            selectableColumns: availableColumns,
            groupableColumns,
        }),
        [availableColumns, columnSignature, groupableColumns],
    );

    const queryActivities = useMemo(
        () => buildDatabaseModalQueryActivities(activeDataQuery, queryHistory),
        [activeDataQuery, queryHistory],
    );
    const selectedQueryActivity = useMemo(
        () => queryActivities.find(activity => activity.id === selectedQueryTraceId) ?? null,
        [queryActivities, selectedQueryTraceId],
    );
    const pendingCommittedActivity = useMemo(
        () => queryRunState.status === 'succeeded'
            && selectedQueryTraceId === queryRunState.outcome.traceId
            ? buildDatabaseModalQueryActivityFromOutcome(queryRunState.outcome)
            : null,
        [queryRunState, selectedQueryTraceId],
    );
    const resolvedQueryActivity = selectedQueryActivity ?? pendingCommittedActivity ?? queryActivities[0] ?? null;
    const currentRows = useMemo(() => {
        if (!resolvedQueryActivity) {
            return [];
        }

        if (resolvedQueryActivity.source === 'active' && activeDataQuery) {
            return activeDataQuery.result.rows;
        }
        if (queryRunState.status === 'succeeded' && resolvedQueryActivity.id === queryRunState.outcome.traceId) {
            return queryRunState.outcome.query.result.rows;
        }

        return resolvedQueryActivity.result.previewRows;
    }, [activeDataQuery, queryRunState, resolvedQueryActivity]);
    const currentColumns = useMemo(
        () => getColumns(currentRows, resolvedQueryActivity?.result.selectedColumns),
        [currentRows, resolvedQueryActivity?.result.selectedColumns],
    );
    const filteredRows = useMemo(
        () => filterRows(currentRows, currentColumns, searchTerm),
        [currentColumns, currentRows, searchTerm],
    );
    const sortSummary = sortState.column
        ? getSortSummary(sortState)
        : getTranslation('explorer_no_sort_applied', language);
    const emptyStateText = !resolvedQueryActivity
        ? getTranslation('explorer_empty_run_template', language)
        : currentColumns.length === 0
            ? getTranslation('explorer_empty_no_columns', language)
            : getTranslation('explorer_empty_no_rows', language);
    const tableKey = [
        csvData?.fileName ?? 'no-file',
        resolvedQueryActivity?.id ?? 'no-query',
        resolvedQueryActivity?.appliedAt instanceof Date ? resolvedQueryActivity.appliedAt.toISOString() : 'no-date',
        resolvedQueryActivity?.tableName ?? 'no-table',
        resolvedQueryActivity?.loadVersion ?? 'no-version',
    ].join(':');

    useEffect(() => {
        setDrafts(defaultDrafts);
        setActiveTemplateId('preview_rows');
        setQueryRunState({ status: 'idle' });
        setSessionError(null);
    }, [columnSignature]);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setSelectedQueryTraceId(getDefaultSelectedActivityId(queryActivities));
        }
        wasOpenRef.current = isOpen;
    }, [activeDataQuery, isOpen, queryActivities]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        if (selectedQueryTraceId && queryActivities.some(activity => activity.id === selectedQueryTraceId)) {
            return;
        }
        if (
            queryRunState.status === 'succeeded'
            && selectedQueryTraceId === queryRunState.outcome.traceId
        ) {
            return;
        }
        setSelectedQueryTraceId(getDefaultSelectedActivityId(queryActivities));
    }, [activeDataQuery, isOpen, queryActivities, queryRunState, selectedQueryTraceId]);

    useEffect(() => {
        setSearchTerm('');
        setSortState({ column: null, direction: 'asc' });
    }, [resolvedQueryActivity?.id]);

    useEffect(() => {
        if (!isOpen) {
            autoRefreshAttemptKeyRef.current = null;
            return;
        }
        if (
            !csvData
            || resolvedDuckDbSessionStatus.status === 'ready'
        ) {
            return;
        }

        const attemptKey = `${csvData.fileName}:${csvData.data.length}`;
        if (autoRefreshAttemptKeyRef.current === attemptKey) {
            return;
        }
        autoRefreshAttemptKeyRef.current = attemptKey;
        setSessionError(null);
        setIsRefreshingSession(true);
        void refreshDuckDbSession()
            .catch(error => {
                setSessionError(error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
                setIsRefreshingSession(false);
            });
    }, [
        csvData,
        isOpen,
        refreshDuckDbSession,
        resolvedDuckDbSessionStatus.status,
    ]);

    if (!isOpen) {
        return null;
    }

    const currentDraft = drafts[activeTemplateId];
    const isSubmitting = queryRunState.status === 'submitting';
    const formError = queryRunState.status === 'failed' ? queryRunState.message : sessionError;
    const canLoadSelectedTemplate = resolvedQueryActivity?.origin === 'workspace'
        && Boolean(resolvedQueryActivity.templateId && resolvedQueryActivity.formSnapshot);
    const canRerunSelectedTemplate = canLoadSelectedTemplate && resolvedDuckDbSessionStatus.status === 'ready' && !isSubmitting;

    const updateDraft = (nextDraft: WorkspaceDataQueryRequest) => {
        setDrafts(prev => ({
            ...prev,
            [nextDraft.templateId]: nextDraft,
        }));
    };

    const runDraft = async (draftToRun: WorkspaceDataQueryRequest, nextTemplateId?: WorkspaceQueryTemplateId) => {
        const validationMessage = getWorkspaceQueryDraftValidationMessage(draftToRun);
        if (validationMessage) {
            setQueryRunState({ status: 'failed', message: validationMessage, draft: draftToRun });
            return;
        }
        setSessionError(null);
        setQueryRunState({ status: 'submitting' });
        try {
            const outcome = await runWorkspaceDataQuery(draftToRun);
            if (nextTemplateId) {
                setActiveTemplateId(nextTemplateId);
            }
            setSelectedQueryTraceId(outcome.traceId);
            setQueryRunState({ status: 'succeeded', outcome });
        } catch (error) {
            setQueryRunState({
                status: 'failed',
                message: error instanceof Error ? error.message : String(error),
                draft: draftToRun,
            });
        }
    };

    const handleRunQuery = async () => {
        await runDraft(currentDraft, activeTemplateId);
    };

    const handleTemplateChange = (nextTemplateId: WorkspaceQueryTemplateId) => {
        setActiveTemplateId(nextTemplateId);
        setQueryRunState({ status: 'idle' });
        setSessionError(null);
    };

    const handleRefreshSession = async () => {
        setSessionError(null);
        setIsRefreshingSession(true);
        try {
            await refreshDuckDbSession();
        } catch (error) {
            setSessionError(error instanceof Error ? error.message : String(error));
        } finally {
            setIsRefreshingSession(false);
        }
    };

    const handleLoadWorkspaceTemplate = () => {
        if (!resolvedQueryActivity?.templateId || !resolvedQueryActivity.formSnapshot) {
            return;
        }
        setActiveTemplateId(resolvedQueryActivity.templateId);
        updateDraft(resolvedQueryActivity.formSnapshot);
        setQueryRunState({ status: 'idle' });
    };

    const handleRerunWorkspaceTemplate = async () => {
        if (!resolvedQueryActivity?.templateId || !resolvedQueryActivity.formSnapshot) {
            return;
        }
        await runDraft(resolvedQueryActivity.formSnapshot, resolvedQueryActivity.templateId);
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="database-dialog-title"
                tabIndex={-1}
                className="relative flex h-screen w-screen flex-col bg-slate-50"
                onClick={event => event.stopPropagation()}
            >
                <header className="border-b border-slate-200 bg-white/95 backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{getTranslation('header_data_explorer', language)}</p>
                            <h2 id="database-dialog-title" className="mt-1 text-2xl font-semibold text-slate-950">{getTranslation('explorer_title', language)}</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                {getTranslation('explorer_title_hint', language)}
                            </p>
                        </div>
                        <button
                            data-dialog-initial-focus
                            onClick={onClose}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-card p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            aria-label={getTranslation('explorer_close', language)}
                        >
                            <IconClose />
                        </button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4">
                    <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
                        <details>
                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">{getTranslation('explorer_advanced_engine_status', language)}</summary>
                        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">DuckDB Session</p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getStatusBadgeClassName(resolvedDuckDbSessionStatus.status)}`}>
                                        {resolvedDuckDbSessionStatus.status}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                                        {resolvedDuckDbSessionStatus.engine ?? 'engine unavailable'}
                                    </span>
                                </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Table</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedDuckDbSessionStatus.tableName ?? 'N/A'}</p>
                                </div>
                                <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Load Version</p>
                                    <p className="mt-2 break-all text-sm font-semibold text-slate-900">{resolvedDuckDbSessionStatus.loadVersion ?? 'N/A'}</p>
                                </div>
                                <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last Sync</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatSessionTimestamp(resolvedDuckDbSessionStatus.lastSyncedAt)}</p>
                                </div>
                                <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5 sm:col-span-2 xl:col-span-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fallback Reason</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedDuckDbSessionStatus.fallbackReason ?? 'None'}</p>
                                </div>
                            </div>
                        </div>
                        </details>
                    </section>

                    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-1 xl:overflow-hidden">
                        <div className="space-y-4 pr-1 xl:min-h-0 xl:overflow-y-auto">
                            <DatabaseWorkspaceQueryComposer
                                availableColumns={availableColumns}
                                groupableColumns={groupableColumns}
                                templateId={activeTemplateId}
                                draft={currentDraft}
                                duckDbSessionStatus={resolvedDuckDbSessionStatus}
                                onTemplateChange={handleTemplateChange}
                                onDraftChange={updateDraft}
                                onRunQuery={() => { void handleRunQuery(); }}
                                onRefreshSession={() => { void handleRefreshSession(); }}
                                isSubmitting={isSubmitting}
                                isRefreshingSession={isRefreshingSession}
                                errorMessage={formError}
                                language={language}
                            />

                            <section className="rounded-card border border-slate-200 bg-white shadow-sm">
                                {queryRunState.status === 'succeeded' ? (
                                    <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                                        {getTranslation('explorer_query_completed', language, {
                                            rows: queryRunState.outcome.query.result.returnedRows,
                                            duration: queryRunState.outcome.query.result.durationMs,
                                            version: queryRunState.outcome.query.loadVersion ?? getTranslation('explorer_unavailable', language),
                                        })}
                                    </div>
                                ) : null}
                                {queryRunState.status === 'failed' ? (
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-3">
                                        <p role="alert" className="text-sm text-rose-800">{queryRunState.message}</p>
                                        <button
                                            type="button"
                                            onClick={() => { void runDraft(queryRunState.draft, queryRunState.draft.templateId); }}
                                            className="min-h-[44px] rounded-card border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800"
                                        >
                                            {getTranslation('explorer_retry', language)}
                                        </button>
                                    </div>
                                ) : null}
                                <div className="border-b border-slate-200 px-4 py-3">
                                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_current_result', language)}</p>
                                            <h3 className="mt-2 text-lg font-semibold text-slate-900">
                                                {resolvedQueryActivity?.explanation ?? getTranslation('explorer_no_query_selected', language)}
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-500">
                                                {getTranslation('explorer_current_result_hint', language)}
                                            </p>
                                        </div>
                                        <label className="block xl:max-w-xs">
                                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_search_result', language)}</span>
                                            <input
                                                type="search"
                                                value={searchTerm}
                                                onChange={event => setSearchTerm(event.target.value)}
                                                placeholder={getTranslation('explorer_search_placeholder', language)}
                                                className="mt-2 min-h-[44px] w-full rounded-card border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 md:min-h-0"
                                            />
                                        </label>
                                    </div>
                                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                                        <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_rows', language)}</p>
                                            <p className="mt-2 text-sm font-semibold text-slate-900">
                                                {resolvedQueryActivity ? `${resolvedQueryActivity.result.returnedRows} / ${resolvedQueryActivity.result.totalMatchedRows}` : 'N/A'}
                                            </p>
                                        </div>
                                        <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_columns', language)}</p>
                                            <p className="mt-2 text-sm font-semibold text-slate-900">{currentColumns.length}</p>
                                        </div>
                                        <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_order', language)}</p>
                                            <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedQueryActivity?.result.appliedOrderBy.length ? resolvedQueryActivity.result.appliedOrderBy.map(order => `${order.column} (${order.direction})`).join(', ') : getTranslation('explorer_no_sort_applied', language)}</p>
                                        </div>
                                        <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_limit', language)}</p>
                                            <p className="mt-2 text-sm font-semibold text-slate-900">{resolvedQueryActivity?.result.appliedLimit ?? 'N/A'}</p>
                                        </div>
                                        <div className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getTranslation('explorer_local_sort', language)}</p>
                                            <p className="mt-2 text-sm font-semibold text-slate-900">{sortSummary}</p>
                                        </div>
                                    </div>
                                </div>

                                <details className="border-b border-slate-200 px-4 py-3">
                                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{getTranslation('explorer_technical_query_details', language)}</summary>
                                    <div className="mt-3 overflow-hidden rounded-card border border-slate-200 bg-slate-950 text-sm text-slate-100">
                                        <pre className="max-h-[220px] overflow-auto px-3 py-2.5 whitespace-pre-wrap break-words">
                                            {resolvedQueryActivity?.sqlPreview ?? 'No SQL preview available yet. Run an explorer template or select a query trace from history.'}
                                        </pre>
                                    </div>
                                </details>

                                <div className="p-4">
                                    <TabulatorTable
                                        data={filteredRows}
                                        columns={currentColumns}
                                        pageSize={25}
                                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                                        tableKey={tableKey}
                                        language={language}
                                        variant="database-modal"
                                        sortState={sortState}
                                        onSortChange={setSortState}
                                        containerClassName="h-[420px]"
                                        emptyStateText={emptyStateText}
                                        measureColumns={(resolvedQueryActivity?.plan?.aggregates ?? [])
                                            .filter(aggregate => aggregate.function !== 'count' && aggregate.function !== 'count_distinct')
                                            .map(aggregate => aggregate.as)}
                                    />
                                </div>
                            </section>
                        </div>

                        <DatabaseModalSidebar
                            csvData={csvData}
                            queryActivities={queryActivities}
                            selectedQueryActivity={resolvedQueryActivity}
                            onSelectQueryActivity={setSelectedQueryTraceId}
                            onLoadWorkspaceTemplate={handleLoadWorkspaceTemplate}
                            onRerunWorkspaceTemplate={() => { void handleRerunWorkspaceTemplate(); }}
                            canLoadWorkspaceTemplate={canLoadSelectedTemplate}
                            canRerunWorkspaceTemplate={canRerunSelectedTemplate}
                            language={language}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
