import React, { useCallback, useMemo } from 'react';
import { TabulatorTable } from './spreadsheet/TabulatorTable';
import { ColumnAnnotationPopover } from './spreadsheet/ColumnAnnotationPopover';
import { useAppStore } from '../store/useAppStore';
import { IconChevron } from '../icons/IconChevron';
import { IconClose } from '../icons/IconClose';
import { SpreadsheetControls } from './spreadsheet/SpreadsheetControls';
import { useSpreadsheetLogic } from '../hooks/useSpreadsheetLogic';
import { getTranslation } from '../utils/localization';
import { CleaningRunBanner } from './cleaning/CleaningRunBanner';
import { isPreviewDataQuery } from '../services/agent/execution/dataQueryContract';
import { GroupByTest, ViewModeToggle } from './spreadsheet/GroupByTest';
import type { UserColumnAnnotation } from '../types';

interface SpreadsheetPanelProps {
    isVisible: boolean;
}

export const SpreadsheetPanel: React.FC<SpreadsheetPanelProps> = ({ isVisible }) => {
    const onToggleVisibility = () => useAppStore.getState().setIsSpreadsheetVisible(!isVisible);
    const language = useAppStore(state => state.settings.language);
    const resumeCleaningRun = useAppStore(state => state.resumeCleaningRun);
    const restartCleaningRun = useAppStore(state => state.restartCleaningRun);
    const userColumnAnnotations = useAppStore(state => state.userColumnAnnotations);
    const setColumnAnnotation = useAppStore(state => state.setColumnAnnotation);
    const removeColumnAnnotation = useAppStore(state => state.removeColumnAnnotation);
    const columnProfiles = useAppStore(state => state.columnProfiles);
    const initialAnalysisFailureKind = useAppStore(state => state.initialAnalysisFailureKind);
    const [isGroupByMode, setIsGroupByMode] = React.useState(false);
    const [annotatingColumn, setAnnotatingColumn] = React.useState<{ name: string; rect: DOMRect } | null>(null);

    const annotatedColumns = useMemo(
        () => new Set(Object.keys(userColumnAnnotations)),
        [userColumnAnnotations],
    );

    const handleColumnHeaderClick = useCallback((columnName: string, rect: DOMRect) => {
        setAnnotatingColumn({ name: columnName, rect });
    }, []);

    const handleAnnotationSave = useCallback((annotation: UserColumnAnnotation) => {
        setColumnAnnotation(annotation);
    }, [setColumnAnnotation]);

    const handleAnnotationRemove = useCallback((columnName: string) => {
        removeColumnAnnotation(columnName);
    }, [removeColumnAnnotation]);

    const {
        activeDataset,
        processedData,
        displayColumns,
        displayColumnLabels,
        filterText,
        setFilterText,
        handleQuerySubmit,
        viewMode,
        setViewMode,
        activeDataQuery,
        activeSpreadsheetFilter,
        aiFilterExplanation,
        isAiFiltering,
        clearAiFilter,
        clearActiveDataQuery,
        rawCsvData,
        preparedDatasetStatus,
        semanticStatus,
        semanticHiddenRowCount,
        semanticDefaultReady,
        largeDatasetBacking,
        pageSize,
        cleaningRun,
    } = useSpreadsheetLogic(isVisible);

    if (!activeDataset) return null;

    const preparedStatusLabel = preparedDatasetStatus === 'operations'
        ? getTranslation('ai_cleaned', language)
        : preparedDatasetStatus === 'schema_only'
            ? getTranslation('proposed_schema_only', language)
            : preparedDatasetStatus === 'inconsistent'
                ? getTranslation('cleaning_blocked', language)
                : null;
    const preparedStatusClasses = preparedDatasetStatus === 'operations'
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
        : preparedDatasetStatus === 'schema_only'
            ? 'bg-amber-100 text-amber-800 border-amber-200'
            : preparedDatasetStatus === 'inconsistent'
                ? 'bg-rose-100 text-rose-800 border-rose-200'
                : 'bg-slate-100 text-slate-600 border-slate-200';
    const helperText = viewMode !== 'raw'
        ? activeDataQuery
            ? isPreviewDataQuery(activeDataQuery.plan, activeDataQuery.fallbackFilterOperation)
                ? getTranslation('spreadsheet_showing_data_preview', language)
                : getTranslation('spreadsheet_showing_analysis_result', language)
            : viewMode === 'semantic_all'
                ? getTranslation('showing_all_prepared_rows', language)
            : viewMode === 'semantic_default' && !semanticDefaultReady
                ? getTranslation('showing_cleaned_prepared_fallback', language)
            : preparedDatasetStatus === 'schema_only'
                ? getTranslation('showing_prepared_data_schema_only', language)
            : preparedDatasetStatus === 'inconsistent'
                ? getTranslation('showing_prepared_data_blocked', language)
                : preparedDatasetStatus === 'operations'
                    ? getTranslation('showing_semantic_default', language)
                    : getTranslation('showing_semantic_default', language)
        : getTranslation('showing_raw_csv', language);
    const tableKey = [
        viewMode,
        activeDataset.fileName,
        activeDataQuery?.appliedAt instanceof Date ? activeDataQuery.appliedAt.toISOString() : 'dataset',
        activeDataQuery?.tableName ?? 'no-table',
        activeDataQuery?.loadVersion ?? 'no-version',
    ].join(':');
    const isPreviewQuery = activeDataQuery
        ? isPreviewDataQuery(activeDataQuery.plan, activeDataQuery.fallbackFilterOperation)
        : false;
    const queryMeasureColumns = useMemo(
        () => (activeDataQuery?.plan.aggregates ?? [])
            .filter(aggregate => aggregate.function !== 'count' && aggregate.function !== 'count_distinct')
            .map(aggregate => aggregate.as),
        [activeDataQuery],
    );

    return (
        <div id="raw-data-explorer" className="flex flex-col rounded-card border border-slate-200 bg-white shadow-lg transition-all duration-300">
            <button
                onClick={onToggleVisibility}
                className="flex w-full cursor-pointer items-center justify-between rounded-t-lg px-4 py-3 text-left hover:bg-slate-50"
                aria-expanded={isVisible}
            >
                <div>
                    <h3 className="text-lg font-bold text-slate-900">{getTranslation('raw_data_explorer', language)}</h3>
                    <p className="text-sm text-slate-500">{getTranslation('file_label', language)} {activeDataset.fileName}</p>
                </div>
                <IconChevron isOpen={isVisible} />
            </button>

            {isVisible && (
                <div className="flex h-full min-h-0 flex-col space-y-4 px-4 pb-4 pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="inline-flex gap-1 rounded-md bg-slate-100 p-1">
                            <button
                                onClick={() => setViewMode('semantic_default')}
                                className={`rounded px-3 py-1.5 text-sm font-medium ${viewMode === 'semantic_default' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                {getTranslation('prepared_data', language)}
                            </button>
                            <button
                                onClick={() => setViewMode('semantic_all')}
                                className={`rounded px-3 py-1.5 text-sm font-medium ${viewMode === 'semantic_all' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                {getTranslation('all_prepared_data', language)}
                            </button>
                            <button
                                onClick={() => rawCsvData && setViewMode('raw')}
                                disabled={!rawCsvData}
                                className={`rounded px-3 py-1.5 text-sm font-medium ${viewMode === 'raw' ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'} ${!rawCsvData ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                                {getTranslation('original_csv', language)}
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {!largeDatasetBacking && (
                                <ViewModeToggle isGroupBy={isGroupByMode} onToggle={setIsGroupByMode} language={language} />
                            )}
                            <span className="text-xs text-slate-500">{helperText}</span>
                            {semanticStatus === 'running' && viewMode === 'semantic_default' && !activeDataQuery && !semanticDefaultReady && (
                                <span className="text-[11px] font-medium text-slate-500">
                                    {getTranslation('semantic_view_preparing', language)}
                                </span>
                            )}
                            {viewMode === 'semantic_default' && semanticDefaultReady && semanticHiddenRowCount > 0 && !activeDataQuery && (
                                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                                    {getTranslation('semantic_hidden_rows', language, { count: semanticHiddenRowCount })}
                                </span>
                            )}
                            {viewMode !== 'raw' && preparedStatusLabel && !activeDataQuery && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${preparedStatusClasses}`}>
                                    {preparedStatusLabel}
                                </span>
                            )}
                        </div>
                    </div>

                    {largeDatasetBacking && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                            <p className="font-semibold">{getTranslation('large_dataset_mode_title', language)}</p>
                            <p className="mt-1">
                                {getTranslation('large_dataset_mode_body', language, {
                                    totalRows: largeDatasetBacking.rowCount.toLocaleString(),
                                    sampleRows: largeDatasetBacking.sampleRowCount.toLocaleString(),
                                })}
                            </p>
                        </div>
                    )}

                    {cleaningRun && cleaningRun.status !== 'completed' && initialAnalysisFailureKind !== 'provider' && (
                        <CleaningRunBanner
                            cleaningRun={cleaningRun}
                            onContinue={() => void resumeCleaningRun()}
                            onRestart={() => void restartCleaningRun()}
                            variant="spreadsheet"
                        />
                    )}

                    <SpreadsheetControls
                        filterText={filterText}
                        onFilterTextChange={setFilterText}
                        onQuerySubmit={handleQuerySubmit}
                        isAiFiltering={isAiFiltering && viewMode !== 'raw'}
                        aiEnabled={viewMode !== 'raw'}
                    />

                    {viewMode !== 'raw' && activeDataQuery && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                            <div>
                                <span className="font-semibold">
                                    {isPreviewQuery
                                        ? getTranslation('spreadsheet_data_preview', language)
                                        : getTranslation('spreadsheet_analysis_result', language)}
                                </span>{' '}
                                {activeDataQuery.explanation} {isPreviewQuery
                                    ? getTranslation('spreadsheet_preview_rows', language, { count: activeDataQuery.result.returnedRows })
                                    : getTranslation('spreadsheet_matched_rows', language, {
                                        returned: activeDataQuery.result.returnedRows,
                                        total: activeDataQuery.result.totalMatchedRows,
                                    })}
                                {activeDataQuery.result.truncated ? ` ${getTranslation('data_explorer_truncated', language, { returned: activeDataQuery.result.returnedRows, total: activeDataQuery.result.totalMatchedRows })}` : ''}
                                {(activeDataQuery.engine || activeDataQuery.fallbackReason) && (
                                    <details className="mt-1 text-xs text-emerald-900">
                                        <summary>{getTranslation('technical_details', language)}</summary>
                                        <p>{activeDataQuery.engine}</p>
                                        {activeDataQuery.fallbackReason && <p>{activeDataQuery.fallbackReason}</p>}
                                    </details>
                                )}
                            </div>
                            <button
                                onClick={clearActiveDataQuery}
                                className="p-1 rounded-full hover:bg-emerald-200"
                                title={getTranslation('spreadsheet_clear_result', language)}
                                aria-label={getTranslation('spreadsheet_clear_result', language)}
                            >
                                <IconClose />
                            </button>
                        </div>
                    )}

                    {viewMode !== 'raw' && (activeSpreadsheetFilter?.finalReply || aiFilterExplanation) && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                            <p>
                                <span className="font-semibold">{getTranslation('ai_filter', language)}</span> {activeSpreadsheetFilter?.finalReply ?? aiFilterExplanation}
                            </p>
                            <button
                                onClick={clearAiFilter}
                                className="p-1 rounded-full hover:bg-blue-200"
                                title={getTranslation('spreadsheet_clear_filter', language)}
                                aria-label={getTranslation('spreadsheet_clear_filter', language)}
                            >
                                <IconClose />
                            </button>
                        </div>
                    )}

                    {isGroupByMode ? (
                        <div
                            className="min-w-0 flex-grow overflow-hidden rounded-md border border-slate-200 p-4"
                            style={{ height: '60vh', maxHeight: '60vh' }}
                        >
                            <GroupByTest
                                rows={processedData}
                                language={language}
                                accentColor="slate"
                                onRequestCard={(msg, precomputedData) => {
                                    if (precomputedData?.length) {
                                        useAppStore.getState().setPendingPrecomputedCardData(precomputedData);
                                    }
                                    void useAppStore.getState().handleChatMessage(msg, { source: 'action' });
                                }}
                            />
                        </div>
                    ) : (
                        <div
                            className="min-w-0 flex-grow overflow-hidden rounded-md border border-slate-200"
                            style={{ height: '60vh', maxHeight: '60vh' }}
                        >
                            <TabulatorTable
                                data={processedData}
                                columns={displayColumns}
                                displayColumnLabels={displayColumnLabels}
                                pageSize={pageSize}
                                tableKey={tableKey}
                                language={language}
                                emptyStateText="No data matches your search."
                                measureColumns={queryMeasureColumns}
                                annotatedColumns={annotatedColumns}
                                onColumnHeaderClick={handleColumnHeaderClick}
                            />
                        </div>
                    )}
                </div>
            )}

            {annotatingColumn && (
                <ColumnAnnotationPopover
                    columnName={annotatingColumn.name}
                    columnType={columnProfiles.find(c => c.name === annotatingColumn.name)?.type}
                    existingAnnotation={userColumnAnnotations[annotatingColumn.name]}
                    anchorRect={annotatingColumn.rect}
                    language={language}
                    onSave={handleAnnotationSave}
                    onRemove={handleAnnotationRemove}
                    onClose={() => setAnnotatingColumn(null)}
                />
            )}
        </div>
    );
};
