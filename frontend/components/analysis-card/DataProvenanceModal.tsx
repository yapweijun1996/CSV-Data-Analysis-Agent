import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { IconClose } from '../../icons/IconClose';
import { getTranslation } from '../../utils/localization';
import { TabulatorTable } from '../spreadsheet/TabulatorTable';
import { GroupByTest, ViewModeToggle, DataTable, formatNumber } from '../spreadsheet/GroupByTest';
import type { AnalysisArtifactProvenance, AnalysisPlan, CsvRow } from '../../types';
import { resolveAnalysisArtifactFreshness } from '../../services/agent/artifactProvenance';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { IconInsights } from '../../icons/IconInsights';

const TOTAL_STEPS = 4;
const TABULATOR_PAGE_SIZE = 50;

// --- Helpers ---

const formatPreFilter = (filter: { column: string; value: unknown; operator?: string }): string => {
    const op = filter.operator ?? '=';
    const val = Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value);
    return `${filter.column} ${op} "${val}"`;
};

const computeTotal = (rows: CsvRow[], valueColumn: string | undefined, aggregation: string): number | null => {
    if (!valueColumn || rows.length === 0) return null;
    let sum = 0;
    let count = 0;
    for (const row of rows) {
        const v = row[valueColumn];
        if (v != null) {
            const n = typeof v === 'number' ? v : Number(v);
            if (!Number.isNaN(n)) { sum += n; count++; }
        }
    }
    if (count === 0) return null;
    return aggregation === 'avg' ? sum / count : sum;
};

// --- Step progress bar ---

const StepBar: React.FC<{ current: number; total: number; language: string }> = ({ current, total, language }) => (
    <div className="flex items-center gap-3">
        <div className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
                <div
                    key={i}
                    className={`h-2 w-10 rounded-full transition-colors ${i + 1 === current ? 'bg-blue-500' : i + 1 < current ? 'bg-blue-300' : 'bg-slate-200'}`}
                />
            ))}
        </div>
        <span className="text-xs text-slate-400">
            {getTranslation('provenance_step_indicator', language, { current, total })}
        </span>
    </div>
);

// --- Main component ---

interface DataProvenanceModalProps {
    plan: AnalysisPlan;
    aggregatedData: CsvRow[];
    provenance?: AnalysisArtifactProvenance | null;
    currentDatasetVersion?: string | null;
    onClose: () => void;
    restoreFocusSelector?: string;
}

export const DataProvenanceModal: React.FC<DataProvenanceModalProps> = ({
    plan,
    aggregatedData,
    provenance,
    currentDatasetVersion,
    onClose,
    restoreFocusSelector,
}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const language = useAppStore(state => state.settings.language);
    const rawCsvData = useAppStore(state => state.rawCsvData);
    const csvData = useAppStore(state => state.csvData);
    const dataPreparationPlan = useAppStore(state => state.dataPreparationPlan);

    // Step 3 mode toggle
    const [isCustomMode, setIsCustomMode] = useState(false);

    // Filter + group-by mode state for Step 1 & Step 2
    const [rawFilter, setRawFilter] = useState('');
    const [cleanedFilter, setCleanedFilter] = useState('');
    const [rawGroupByMode, setRawGroupByMode] = useState(false);
    const [cleanedGroupByMode, setCleanedGroupByMode] = useState(false);

    const t = useCallback(
        (key: string, params?: Record<string, string | number>) => getTranslation(key, language, params),
        [language],
    );

    const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose, {
        restoreFocusSelector,
    });

    // --- Derived data ---
    const rawRows = rawCsvData?.data ?? [];
    const rawColCount = rawRows[0] ? Object.keys(rawRows[0]).length : 0;
    const cleanedRows = csvData?.data ?? [];
    const cleanedColCount = cleanedRows[0] ? Object.keys(cleanedRows[0]).length : 0;
    const headerRow = rawCsvData?.headerDepth ?? 1;
    const operations = dataPreparationPlan?.operations ?? [];
    const rowDelta = rawRows.length - cleanedRows.length;

    // Filtered rows for Step 1 & 2
    const filteredRawRows = useMemo(() => {
        if (!rawFilter.trim()) return rawRows;
        const needle = rawFilter.trim().toLowerCase();
        return rawRows.filter(row =>
            Object.values(row).some(v => String(v ?? '').toLowerCase().includes(needle)),
        );
    }, [rawRows, rawFilter]);

    const filteredCleanedRows = useMemo(() => {
        if (!cleanedFilter.trim()) return cleanedRows;
        const needle = cleanedFilter.trim().toLowerCase();
        return cleanedRows.filter(row =>
            Object.values(row).some(v => String(v ?? '').toLowerCase().includes(needle)),
        );
    }, [cleanedRows, cleanedFilter]);

    // Card's original aggregation result total
    const cardTotal = useMemo(
        () => computeTotal(aggregatedData, plan.valueColumn, plan.aggregation ?? 'sum'),
        [aggregatedData, plan.valueColumn, plan.aggregation],
    );

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const goPrev = useCallback(() => setCurrentStep(s => Math.max(1, s - 1)), []);
    const goNext = useCallback(() => setCurrentStep(s => Math.min(TOTAL_STEPS, s + 1)), []);

    // --- Step renderers ---

    const rawCols = useMemo(() => rawRows[0] ? Object.keys(rawRows[0]) : [], [rawRows]);
    const cleanedColNames = useMemo(() => cleanedRows[0] ? Object.keys(cleanedRows[0]) : [], [cleanedRows]);

    const renderStep1 = () => (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-blue-800">{t('provenance_step1_title')}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                        {t('provenance_step1_summary', { rows: rawRows.length, cols: rawColCount, header: headerRow })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ViewModeToggle isGroupBy={rawGroupByMode} onToggle={setRawGroupByMode} language={language} />
                    {!rawGroupByMode && (
                        <input
                            type="text"
                            value={rawFilter}
                            onChange={e => setRawFilter(e.target.value)}
                            placeholder={getTranslation('spreadsheet_search_placeholder', language)}
                            className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    )}
                </div>
            </div>
            {rawGroupByMode ? (
                <GroupByTest rows={rawRows} language={language} accentColor="blue" />
            ) : (
                <>
                    {rawFilter && (
                        <p className="text-xs text-slate-400">
                            {filteredRawRows.length} / {rawRows.length} rows
                        </p>
                    )}
                    <div className="min-h-0 flex-1">
                        <TabulatorTable
                            data={filteredRawRows}
                            columns={rawCols}
                            pageSize={TABULATOR_PAGE_SIZE}
                            tableKey="provenance-raw"
                            language={language}
                            variant="raw-explorer"
                        />
                    </div>
                </>
            )}
        </div>
    );

    const renderStep2 = () => (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-amber-800">{t('provenance_step2_title')}</h3>
                    {operations.length > 0 ? (
                        <div className="mt-1 space-y-1">
                            <p className="text-sm text-slate-600">
                                {t('provenance_step2_ops', { count: operations.length })}
                            </p>
                            <ul className="ml-4 list-disc space-y-0.5 text-xs text-slate-600">
                                {operations.slice(0, 6).map((op, i) => (
                                    <li key={op.id ?? i}>
                                        <span className="font-medium">{t(`provenance_op_${op.type}`)}</span>
                                        {op.reason && <span className="text-slate-400"> — {op.reason}</span>}
                                    </li>
                                ))}
                                {operations.length > 6 && (
                                    <li className="text-slate-400">… +{operations.length - 6}</li>
                                )}
                            </ul>
                        </div>
                    ) : (
                        <p className="mt-1 text-sm text-slate-500">{t('provenance_step2_no_ops')}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                        <span>{t('provenance_step2_summary', { rows: cleanedRows.length, cols: cleanedColCount })}</span>
                        {rowDelta !== 0 && (
                            <span className={`font-semibold ${rowDelta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {rowDelta > 0
                                    ? t('provenance_step2_delta', { delta: rowDelta })
                                    : t('provenance_step2_delta_added', { delta: Math.abs(rowDelta) })}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ViewModeToggle isGroupBy={cleanedGroupByMode} onToggle={setCleanedGroupByMode} language={language} />
                    {!cleanedGroupByMode && (
                        <input
                            type="text"
                            value={cleanedFilter}
                            onChange={e => setCleanedFilter(e.target.value)}
                            placeholder={getTranslation('spreadsheet_search_placeholder', language)}
                            className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                    )}
                </div>
            </div>
            {cleanedGroupByMode ? (
                <GroupByTest rows={cleanedRows} language={language} accentColor="amber" />
            ) : (
                <>
                    {cleanedFilter && (
                        <p className="text-xs text-slate-400">
                            {filteredCleanedRows.length} / {cleanedRows.length} rows
                        </p>
                    )}
                    <div className="min-h-0 flex-1">
                        <TabulatorTable
                            data={filteredCleanedRows}
                            columns={cleanedColNames}
                            pageSize={TABULATOR_PAGE_SIZE}
                            tableKey="provenance-cleaned"
                            language={language}
                            variant="raw-explorer"
                        />
                    </div>
                </>
            )}
        </div>
    );

    const renderStep3 = () => {
        const groupByCol = plan.groupByColumn;
        const valueCol = plan.valueColumn;
        const aggLabel = (plan.aggregation ?? 'sum').toUpperCase();
        const preFilters = plan.preFilter ?? [];
        const topN = plan.defaultTopN ?? null;
        const highlightCols = [groupByCol, valueCol].filter((c): c is string => Boolean(c));
        const cardTotalStr = cardTotal != null ? formatNumber(cardTotal) : '—';
        const freshness = resolveAnalysisArtifactFreshness(provenance, currentDatasetVersion);
        const displayedStatus = freshness === 'stale'
            ? 'stale'
            : provenance?.evidenceStatus ?? 'unverified';

        return (
            <div className="flex h-full flex-col gap-4">
                <div>
                    <h3 className="text-lg font-bold text-violet-800">{t('provenance_step3_title')}</h3>
                </div>
                <div
                    className={`rounded-lg border p-3 text-xs ${
                        displayedStatus === 'verified'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : displayedStatus === 'stale' || displayedStatus === 'hypothesis'
                                ? 'border-red-200 bg-red-50 text-red-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                    data-testid="artifact-provenance-contract"
                >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <strong className="uppercase">{displayedStatus} evidence</strong>
                        <span>Artifact version: {provenance?.datasetVersion ?? 'unverified'}</span>
                        <span>Current version: {currentDatasetVersion ?? 'unavailable'}</span>
                        <span>Query trace: {provenance?.queryEvidence?.traceId ?? 'not applicable'}</span>
                    </div>
                    <p className="mt-1">
                        Method: {provenance?.method.operation ?? plan.artifactType ?? plan.chartType}
                        {provenance?.method.groupByColumns.length
                            ? ` · grouped by ${provenance.method.groupByColumns.join(', ')}`
                            : ''}
                    </p>
                    {(provenance?.evidenceRefs.length ?? 0) > 0 && (
                        <p className="mt-1">
                            Evidence refs: {provenance?.evidenceRefs.map(ref => `${ref.kind}:${ref.id}`).join(' · ')}
                        </p>
                    )}
                    {freshness === 'stale' && (
                        <p className="mt-1 font-semibold">This result cannot be used as current report evidence until it is regenerated.</p>
                    )}
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setIsCustomMode(false)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${!isCustomMode ? 'bg-violet-100 text-violet-800 border border-violet-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {t('provenance_step3_card_query')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCustomMode(true)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isCustomMode ? 'bg-violet-100 text-violet-800 border border-violet-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {t('provenance_step3_custom_query')}
                    </button>
                </div>

                {!isCustomMode ? (
                    /* Card's original query */
                    <>
                        <div className="space-y-1 text-sm text-slate-600">
                            {groupByCol && valueCol && (
                                <p className="font-medium">{t('provenance_step3_logic', { agg: aggLabel, value: valueCol, group: groupByCol })}</p>
                            )}
                            {!groupByCol && valueCol && (
                                <p className="font-medium">{t('provenance_step3_logic_no_group', { agg: aggLabel, value: valueCol })}</p>
                            )}
                            {!groupByCol && !valueCol && (
                                <p className="font-medium">{t('provenance_step3_logic_detail')}</p>
                            )}
                            {preFilters.map((f, i) => (
                                <p key={i} className="text-xs">{t('provenance_step3_filter', { filter: formatPreFilter(f) })}</p>
                            ))}
                            {topN != null && <p className="text-xs">{t('provenance_step3_topn', { n: topN })}</p>}
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto">
                            <DataTable
                                rows={aggregatedData}
                                maxRows={30}
                                highlightCols={highlightCols}
                                totalRow={cardTotal != null && valueCol ? {
                                    label: t('provenance_step3_total_label'),
                                    value: cardTotalStr,
                                    colSpan: Math.max(1, highlightCols.indexOf(valueCol)),
                                } : null}
                            />
                        </div>
                    </>
                ) : (
                    /* Custom interactive query — reuses GroupByTest with pivot support */
                    <GroupByTest rows={cleanedRows} language={language} accentColor="violet" />
                )}
            </div>
        );
    };

    const renderStep4 = () => {
        const valueCol = plan.valueColumn;
        const groupByCol = plan.groupByColumn;
        const aggregation = plan.aggregation ?? 'sum';
        const aggLabel = aggregation.toUpperCase();
        const totalStr = cardTotal != null ? formatNumber(cardTotal) : '—';

        const excelHint = valueCol
            ? groupByCol
                ? t('provenance_step4_excel_hint', { group: groupByCol, value: valueCol, agg: aggLabel, total: totalStr })
                : t('provenance_step4_excel_hint_simple', { value: valueCol, agg: aggLabel, total: totalStr })
            : null;

        return (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-emerald-800">{t('provenance_step4_title')}</h3>

                <div className="w-full max-w-md space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="text-center text-sm text-slate-600">
                        {t('provenance_step4_row_count', { count: aggregatedData.length })}
                    </div>
                    {cardTotal != null && valueCol && (
                        <div className="text-center text-2xl font-bold text-emerald-800">
                            {aggregation === 'count'
                                ? t('provenance_step4_count', { value: totalStr })
                                : aggregation === 'avg'
                                    ? t('provenance_step4_avg', { column: valueCol, value: totalStr })
                                    : t('provenance_step4_total', { column: valueCol, value: totalStr })}
                        </div>
                    )}
                </div>

                {excelHint && (
                    <div className="w-full max-w-md flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                        <IconInsights className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div>{excelHint}</div>
                    </div>
                )}
            </div>
        );
    };

    const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4];

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="provenance-dialog-title"
            tabIndex={-1}
            className="fixed inset-0 z-50 flex flex-col bg-white"
            onClick={handleOverlayClick}
        >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3">
                <div className="flex items-center gap-4">
                    <h2 id="provenance-dialog-title" className="text-lg font-bold text-slate-800">{t('provenance_title')}</h2>
                    <StepBar current={currentStep} total={TOTAL_STEPS} language={language} />
                </div>
                <button
                    data-dialog-initial-focus
                    type="button"
                    onClick={onClose}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label={t('provenance_close')}
                >
                    <IconClose className="h-5 w-5" />
                </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {stepRenderers[currentStep - 1]()}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-6 py-3">
                <button
                    type="button"
                    onClick={goPrev}
                    disabled={currentStep === 1}
                    className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {t('provenance_prev')}
                </button>
                <button
                    type="button"
                    onClick={currentStep === TOTAL_STEPS ? onClose : goNext}
                    className={`rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors ${
                        currentStep === TOTAL_STEPS
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    {currentStep === TOTAL_STEPS ? t('provenance_close') : t('provenance_next')}
                </button>
            </div>
        </div>
    );
};
