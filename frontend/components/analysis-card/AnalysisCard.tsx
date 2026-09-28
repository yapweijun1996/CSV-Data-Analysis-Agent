import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { ChartRendererHandle } from '../ChartRenderer';
import { AnalysisExportMetadata, exportToPng, exportToCsv, exportToHtml } from '../../utils/exportUtils';
import { InteractiveLegend } from './InteractiveLegend';
import { useAppStore } from '../../store/useAppStore';
import { useAnalysisCardData } from '../../hooks/useAnalysisCardData';
import { AnalysisCardHeader } from './AnalysisCardHeader';
import { AnalysisCardChart } from './AnalysisCardChart';
import { AnalysisCardSummary } from './AnalysisCardSummary';
import { AnalysisCardControls } from './AnalysisCardControls';
import { AnalysisCardDataTables } from './AnalysisCardDataTables';
import { PivotStackedLegend } from './PivotStackedLegend';
import { ChartType } from '../../types';
import { getAvailableChartTypes } from '../../utils/chartTypeUtils';
import { getLocalizedText } from '../../utils/localizedText';
import { getTranslation } from '../../utils/localization';
import { getBarChartReadabilityHints, getPivotCardQualitySummary, isAdditiveAggregation } from '../../utils/analysisCardPresentation';
import { resolvePlanGroupLabel, resolvePlanMetricLabel } from '../../services/dashboard/businessLabelResolver';
import { buildStackedPivotChartPlan } from '../../utils/pivotMatrixCharting';

import { evaluateChartPresentation } from '../../services/ai/visualPresentationEvaluator';
import { DataProvenanceModal } from './DataProvenanceModal';
import { VerdictExplainerModal, VerdictExplanationCache } from './VerdictExplainerModal';
import { CompactCardSummary } from './CompactCardSummary';
import { getCurrentAnalysisDatasetVersion } from '../../services/agent/artifactProvenance';
import { resolveCardTrustDecision } from '../../services/agent/cardTrustDecision';
import { isTimeLikeDimensionColumn } from '../../services/agent/analysisColumnRoles';

interface AnalysisCardProps {
    cardId: string;
    isSpotlighted?: boolean;
    expandOverrideKey?: number;
    expandOverrideValue?: boolean;
    showExplorationControls?: boolean;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = React.memo(({ cardId, isSpotlighted = false, expandOverrideKey, expandOverrideValue, showExplorationControls = true }) => {
    const {
        handleChartTypeChange, handleTopNChange,
        handleHideOthersChange, handleHideZeroValueRowsChange, handlePivotColumnTopNChange,
        handlePivotHideOtherColumnsChange, handleTogglePivotSeriesLabel, handleResetPivotSeriesLabels, handleToggleLegendLabel, handleToggleDataLabels, handleTableSortChange, deleteAnalysisCard, updateCardVisualEvaluation, language, settings, dataPreparationPlan, canonicalCsvData, csvData
    } = useAppStore(state => ({
        handleChartTypeChange: state.handleChartTypeChange,
        handleTopNChange: state.handleTopNChange,
        handleHideOthersChange: state.handleHideOthersChange,
        handleHideZeroValueRowsChange: state.handleHideZeroValueRowsChange,
        handlePivotColumnTopNChange: state.handlePivotColumnTopNChange,
        handlePivotHideOtherColumnsChange: state.handlePivotHideOtherColumnsChange,
        handleTogglePivotSeriesLabel: state.handleTogglePivotSeriesLabel,
        handleResetPivotSeriesLabels: state.handleResetPivotSeriesLabels,
        handleToggleLegendLabel: state.handleToggleLegendLabel,
        handleToggleDataLabels: state.handleToggleDataLabels,
        handleTableSortChange: state.handleTableSortChange,
        deleteAnalysisCard: state.deleteAnalysisCard,
        updateCardVisualEvaluation: state.updateCardVisualEvaluation,
        language: state.settings.language,
        settings: state.settings,
        dataPreparationPlan: state.dataPreparationPlan,
        canonicalCsvData: state.canonicalCsvData,
        csvData: state.csvData,
    }), shallow);

    const {
        cardData, tableDataForDisplay, chartDataForDisplay, stackedChartColumnState, dataForLegend, totalValue,
        displayedTotalValue, totalRowCount, displayedRowCount, chartHiddenZeroValueRowCount, tableZeroValueRowCount, summary, valueKey, groupByKey, tableSort,
    } = useAnalysisCardData(cardId);

    const cardRef = useRef<HTMLDivElement>(null);
    const chartRendererRef = useRef<ChartRendererHandle>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isCardExpanded, setIsCardExpanded] = useState(!!isSpotlighted);
    const [isProvenanceOpen, setIsProvenanceOpen] = useState(false);
    const [isVerdictExplainerOpen, setIsVerdictExplainerOpen] = useState(false);
    // PERF-309: Always mount chart immediately. IntersectionObserver delayed
    // chart paint during analysis because observer callbacks were queued behind
    // long tasks. With only 5-6 cards, lazy mounting is unnecessary.
    const [isChartVisible, setIsChartVisible] = useState(true);
    // PERF-311: Local toggle for isDataVisible — avoids global setState({ analysisCards: map })
    // which triggers all 60 subscribers + 2.4s re-render. Store value is only used as initial.
    const [localDataVisible, setLocalDataVisible] = useState(false);

    // Memoized callbacks — placed before early return to satisfy Rules of Hooks.
    // All use cardId (prop) instead of id (from cardData) so they're safe before the guard.
    // PERF-311: Toggle local state instead of global store — no global setState cascade.
    const onToggleDataVisibility = useCallback(() => setLocalDataVisible(prev => !prev), []);
    const onChartTypeSelect = useCallback((type: ChartType) => handleChartTypeChange(cardId, type), [handleChartTypeChange, cardId]);
    const onTopNChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value === 'all' ? null : parseInt(e.target.value, 10);
        handleTopNChange(cardId, value);
    }, [handleTopNChange, cardId]);
    const onHideOthersChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => handleHideOthersChange(cardId, e.target.checked), [handleHideOthersChange, cardId]);
    const onHideZeroValueRowsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => handleHideZeroValueRowsChange(cardId, e.target.checked), [handleHideZeroValueRowsChange, cardId]);
    const onPivotColumnTopNChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => handlePivotColumnTopNChange(cardId, e.target.value === 'all' ? null : parseInt(e.target.value, 10)), [handlePivotColumnTopNChange, cardId]);
    const onPivotHideOtherColumnsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => handlePivotHideOtherColumnsChange(cardId, e.target.checked), [handlePivotHideOtherColumnsChange, cardId]);
    const onToggleDataLabels = useCallback(() => handleToggleDataLabels(cardId), [handleToggleDataLabels, cardId]);
    const onTableSortChange = useCallback((sort: { column: string; direction: 'asc' | 'desc' } | null) => handleTableSortChange(cardId, sort), [handleTableSortChange, cardId]);
    const onToggleExpand = useCallback(() => setIsCardExpanded(prev => !prev), []);
    const onToggleProvenance = useCallback(() => setIsProvenanceOpen(prev => !prev), []);
    const onVerdictClick = useCallback(() => setIsVerdictExplainerOpen(true), []);
    const onHeaderChartTypeChange = useCallback((newType: ChartType) => handleChartTypeChange(cardId, newType), [handleChartTypeChange, cardId]);
    const onDelete = useCallback(() => deleteAnalysisCard(cardId), [deleteAnalysisCard, cardId]);
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
    const trustDecision = useMemo(
        () => resolveCardTrustDecision(cardData, currentDatasetVersion),
        [cardData, currentDatasetVersion],
    );
    const hasAdditiveMeasure = isAdditiveAggregation(cardData?.plan?.aggregation);
    const exportMetadata = useMemo<AnalysisExportMetadata>(() => {
        const scopeParts: string[] = [];
        if (cardData?.topN) {
            scopeParts.push(`Top ${cardData.topN}`);
        }
        if (cardData?.filter?.column && cardData.filter.values.length > 0) {
            scopeParts.push(`${cardData.filter.column} = ${cardData.filter.values.join(', ')}`);
        }
        if (hasAdditiveMeasure && cardData?.hideOthers) {
            scopeParts.push('Others hidden');
        }
        if (
            (cardData?.hiddenLabels?.length ?? 0) > 0
            || (cardData?.hiddenPivotSeriesLabels?.length ?? 0) > 0
            || cardData?.pivotHideOtherColumns
        ) {
            scopeParts.push('Visible series only');
        }
        return {
            cardId,
            scope: scopeParts.join(' · ') || 'Full card aggregation',
            trustStatus: trustDecision.status,
            datasetVersion: currentDatasetVersion ?? cardData?.provenance?.datasetVersion ?? 'unverified',
        };
    }, [cardData, cardId, currentDatasetVersion, hasAdditiveMeasure, trustDecision.status]);

    // Panel-level expand/collapse override
    useEffect(() => {
        if (expandOverrideKey !== undefined && expandOverrideKey > 0) {
            setIsCardExpanded(expandOverrideValue ?? false);
        }
    }, [expandOverrideKey, expandOverrideValue]);

    const setGlobalErrorToast = useAppStore(state => state.setGlobalErrorToast);
    const handleExport = useCallback(async (format: 'png' | 'png_full' | 'csv' | 'html') => {
        if (!cardRef.current) return;
        setIsExporting(true);
        try {
            let result;
            const title = cardData?.plan?.title ?? '';
            switch (format) {
                case 'png': result = await exportToPng(cardRef.current, title, { metadata: exportMetadata }); break;
                case 'png_full': result = await exportToPng(cardRef.current, title, { includeTable: true, metadata: exportMetadata }); break;
                case 'csv': result = exportToCsv(tableDataForDisplay, title, exportMetadata); break;
                case 'html': result = await exportToHtml(
                    cardRef.current,
                    title,
                    tableDataForDisplay,
                    getLocalizedText(cardData?.summary, language),
                    exportMetadata,
                ); break;
            }
            if (result && !result.success) {
                setGlobalErrorToast({
                    message: getTranslation('export_format_failed', language, { format: format.toUpperCase() }),
                    errorSummary: result.error,
                });
            }
        } finally {
            setIsExporting(false);
        }
    }, [cardData?.plan?.title, cardData?.summary, exportMetadata, tableDataForDisplay, language, setGlobalErrorToast]);
    const handleChartClick = useCallback((index: number, event: MouseEvent) => {
        const isMultiSelect = event.ctrlKey || event.metaKey;
        setSelectedIndices(prev => {
            if (isMultiSelect) {
                return prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].sort((a, b) => a - b);
            }
            return prev.includes(index) ? [] : [index];
        });
    }, []);
    const onZoomChange = useCallback((v: boolean) => setIsZoomed(v), []);
    const onClearSelection = useCallback(() => setSelectedIndices([]), []);
    const onResetZoom = useCallback(() => chartRendererRef.current?.resetZoom(), []);
    const onSeriesToggle = useCallback((label: string) => handleTogglePivotSeriesLabel(cardId, label), [handleTogglePivotSeriesLabel, cardId]);
    const onResetHiddenSeries = useCallback(() => handleResetPivotSeriesLabels(cardId), [handleResetPivotSeriesLabels, cardId]);
    const onLabelClick = useCallback((label: string) => handleToggleLegendLabel(cardId, label), [handleToggleLegendLabel, cardId]);

    // Lazy chart mounting: only mount ChartRenderer when card enters viewport
    useEffect(() => {
        const el = cardRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setIsChartVisible(true); // fallback for unsupported browsers
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsChartVisible(true);
                    observer.disconnect(); // once visible, keep chart mounted
                }
            },
            { rootMargin: '150px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Visual evaluation: optionally evaluate chart quality via AI.
    // Fires only when settings.enableVisualEvaluation is true.
    // visuallyEvaluated prevents evaluation loop after correction.
    useEffect(() => {
        if (!settings.enableVisualEvaluation) return;
        if (!isChartVisible || cardData?.visuallyEvaluated) return;
        const timer = setTimeout(async () => {
            const image = chartRendererRef.current?.captureImage();
            if (!image || !cardData) return;
            try {
                // Read settings at execution time to avoid stale closure values.
                const currentSettings = useAppStore.getState().settings;
                const result = await evaluateChartPresentation(
                    image,
                    cardData.plan,
                    cardData.displayChartType,
                    cardData.aggregatedData.length,
                    currentSettings,
                );
                if (result) {
                    const shouldCorrect = result.quality === 'poor' && result.suggestedChartType;
                    updateCardVisualEvaluation(
                        cardId,
                        result,
                        shouldCorrect ? result.suggestedChartType : undefined,
                    );
                }
            } catch { /* non-blocking */ }
        }, 500);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isChartVisible, cardId, cardData?.visuallyEvaluated, settings.enableVisualEvaluation]);

    // PERF-311: Sync local toggle from store when agent/external code changes it.
    const storeDataVisible = cardData?.isDataVisible ?? false;
    useEffect(() => { setLocalDataVisible(storeDataVisible); }, [storeDataVisible]);
    // Use local state for rendering — toggles don't trigger global setState.
    const isDataVisible = localDataVisible;

    if (!cardData) return null;

    const {
        id,
        plan,
        aggregatedData,
        displayChartType,
        isDataVisible: _storeDataVisible, // shadowed by local state above
        topN,
        hideOthers,
        hideZeroValueRows = false,
        pivotColumnTopN = 8,
        pivotHideOtherColumns = false,
        hiddenPivotSeriesLabels = [],
        disableAnimation,
        showDataLabels,
        filter,
    } = cardData;
    const verdictExplanationCache = useRef<VerdictExplanationCache | null>(null);
    const tableFirstArtifact = Boolean(
        plan.artifactMetadata?.dataTableFirst
        || ['pivot_matrix', 'cohort_retention', 'period_compare', 'root_cause_breakdown'].includes(plan.artifactType ?? ''),
    );
    const hideChartByDefault = Boolean(plan.artifactMetadata?.hideChartByDefault);

    const availableChartTypes = useMemo(() => getAvailableChartTypes(plan, chartDataForDisplay), [chartDataForDisplay, plan]);
    const renderChartType = availableChartTypes.includes(displayChartType)
        ? displayChartType
        : availableChartTypes[0];
    const showPivotColumnControls = Boolean(
        plan.artifactType === 'pivot_matrix'
        && (renderChartType === 'stacked_bar' || renderChartType === 'stacked_column')
        && (stackedChartColumnState?.effectiveMatrixValueColumns.length ?? 0) > 1,
    );
    const isTemporalSeriesChart = Boolean(
        groupByKey
        && isTimeLikeDimensionColumn(groupByKey)
        && ['line', 'area', 'multi_line'].includes(renderChartType),
    );
    const showRowLegend = Boolean(
        groupByKey
        && !isTemporalSeriesChart
        && !hideChartByDefault
        && !plan.artifactMetadata?.tableOnlyPresentation
        && !(plan.artifactType === 'pivot_matrix' && showPivotColumnControls),
    );
    const chartPlanForDisplay = useMemo(
        () => {
            const basePlan = showPivotColumnControls && stackedChartColumnState
                ? buildStackedPivotChartPlan(plan, stackedChartColumnState)
                : plan;
            // Reconcile: when the hook resolved a different valueKey (e.g. SQL alias
            // "Sum Total" vs plan's "TOTAL"), override the plan so charts pick the
            // correct column from the data rows.
            if (valueKey && valueKey !== basePlan.valueColumn) {
                return { ...basePlan, valueColumn: valueKey };
            }
            return basePlan;
        },
        [plan, showPivotColumnControls, stackedChartColumnState, valueKey],
    );
    const chartRowsForDisplay = showPivotColumnControls && stackedChartColumnState
        ? stackedChartColumnState.chartRows
        : chartDataForDisplay;
    const chartPresentation = useMemo(
        () => renderChartType === 'horizontal_bar'
            ? {
                useHorizontalLayout: true,
                suggestedHeight: Math.max(320, chartRowsForDisplay.length * 38 + 80),
                categoryTickLimit: chartRowsForDisplay.length,
            }
            : renderChartType === 'bar' || renderChartType === 'stacked_bar' || renderChartType === 'stacked_column'
                ? getBarChartReadabilityHints(chartRowsForDisplay, groupByKey)
                : { useHorizontalLayout: false, suggestedHeight: 256, categoryTickLimit: 24 },
        [chartRowsForDisplay, groupByKey, renderChartType],
    );
    const pivotQualitySummary = useMemo(
        () => {
            if (plan.artifactType !== 'pivot_matrix') {
                return null;
            }
            const qualitySummary = getPivotCardQualitySummary(aggregatedData, groupByKey, valueKey, displayedRowCount);
            if (!qualitySummary) {
                return null;
            }
            return {
                ...qualitySummary,
                hiddenZeroRowCount: chartHiddenZeroValueRowCount,
                labelNormalizationAppliedColumns: dataPreparationPlan?.labelNormalization?.appliedColumns.length ?? 0,
                labelNormalizationAppliedClusters: dataPreparationPlan?.labelNormalization?.appliedClusters.length ?? 0,
                labelNormalizationAppliedReplacements: dataPreparationPlan?.labelNormalization?.appliedReplacementCount ?? 0,
                labelNormalizationDeferredSuggestions: dataPreparationPlan?.labelNormalization?.deferredSuggestions.length ?? 0,
                recommendedTotalOnlyDueToWideColumns: plan.artifactMetadata?.recommendedTotalOnlyDueToWideColumns ?? false,
                defaultCompressedStackedView: plan.artifactMetadata?.defaultCompressedStackedView ?? false,
                effectiveMatrixValueColumnCount: plan.artifactMetadata?.effectiveMatrixValueColumnCount ?? 0,
                visibleMatrixValueColumnCount: stackedChartColumnState?.visibleMatrixValueColumns.length ?? 0,
                foldedMatrixValueColumnCount: stackedChartColumnState?.foldedMatrixValueColumns.length ?? 0,
                isStackedChartActive: renderChartType === 'stacked_bar' || renderChartType === 'stacked_column',
            };
        },
        [aggregatedData, chartHiddenZeroValueRowCount, dataPreparationPlan?.labelNormalization, displayedRowCount, groupByKey, plan.artifactMetadata?.defaultCompressedStackedView, plan.artifactMetadata?.effectiveMatrixValueColumnCount, plan.artifactMetadata?.recommendedTotalOnlyDueToWideColumns, plan.artifactType, renderChartType, stackedChartColumnState, valueKey],
    );
    const displayGroupLabel = useMemo(() => resolvePlanGroupLabel(plan), [plan]);
    const displayMetricLabel = useMemo(() => resolvePlanMetricLabel(plan) ?? plan.valueColumn ?? 'Value', [plan]);

    useEffect(() => {
        if (!plan) return;
        if (!availableChartTypes.includes(displayChartType) && availableChartTypes[0]) {
            handleChartTypeChange(id, availableChartTypes[0]);
        }
    }, [availableChartTypes, displayChartType, handleChartTypeChange, id, plan]);

    // handleExport, handleChartClick, onTopNChange moved to useCallback block above
    const controls = (
        <AnalysisCardControls
            cardId={id}
            isDataVisible={isDataVisible}
            plan={plan}
            aggregatedData={aggregatedData}
            availableChartTypes={availableChartTypes}
            displayChartType={renderChartType}
            topN={topN}
            hideOthers={hideOthers}
            hideZeroValueRows={hideZeroValueRows}
            zeroValueRowCount={tableZeroValueRowCount}
            pivotColumnTopN={pivotColumnTopN}
            pivotHideOtherColumns={pivotHideOtherColumns}
            pivotFoldedColumnCount={stackedChartColumnState?.foldedMatrixValueColumns.length ?? 0}
            showPivotColumnControls={showPivotColumnControls}
            onToggleDataVisibility={onToggleDataVisibility}
            onChartTypeSelect={onChartTypeSelect}
            onTopNChange={onTopNChange}
            onHideOthersChange={onHideOthersChange}
            onHideZeroValueRowsChange={onHideZeroValueRowsChange}
            onPivotColumnTopNChange={onPivotColumnTopNChange}
            onPivotHideOtherColumnsChange={onPivotHideOtherColumnsChange}
            showDataLabels={showDataLabels}
            onToggleDataLabels={onToggleDataLabels}
        />
    );

    return (
        <div
            ref={cardRef}
            id={id}
            data-testid="analysis-card"
            className={`group flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-xl ${isSpotlighted ? 'card-spotlight' : ''}`}
        >
            <AnalysisCardHeader
                cardId={id}
                plan={plan}
                displayChartType={renderChartType}
                availableChartTypes={availableChartTypes}
                isExporting={isExporting}
                trustStatus={trustDecision.status}
                isCardExpanded={isCardExpanded}
                language={language}
                onToggleExpand={onToggleExpand}
                onToggleProvenance={onToggleProvenance}
                onVerdictClick={onVerdictClick}
                onChartTypeChange={onHeaderChartTypeChange}
                onExport={handleExport}
                onDelete={onDelete}
                showActions={showExplorationControls}
            />

            {!isCardExpanded && (
                <CompactCardSummary
                    displayedTotalValue={displayedTotalValue}
                    displayedRowCount={displayedRowCount}
                    totalRowCount={totalRowCount}
                    summaryText={summary?.text ?? null}
                    aggregation={plan.aggregation}
                    valueColumn={plan.valueColumn}
                    onExpand={onToggleExpand}
                    language={language}
                />
            )}

            {isCardExpanded && (<>
            <div className="flex flex-col gap-3 flex-grow">
                {!hideChartByDefault && isChartVisible && (
                    <AnalysisCardChart
                        cardId={cardId}
                        language={language}
                        chartRendererRef={chartRendererRef}
                        displayChartType={renderChartType}
                        dataForDisplay={chartRowsForDisplay}
                        plan={chartPlanForDisplay}
                        selectedIndices={selectedIndices}
                        isZoomed={isZoomed}
                        chartHeight={chartPresentation.suggestedHeight}
                        scrollable={renderChartType === 'horizontal_bar' && chartRowsForDisplay.length > 12}
                        disableAnimation={disableAnimation}
                        showDataLabels={showDataLabels}
                        onElementClick={handleChartClick}
                        onZoomChange={onZoomChange}
                        onClearSelection={onClearSelection}
                        onResetZoom={onResetZoom}
                    />
                )}
                {!hideChartByDefault && !isChartVisible && (
                    <div
                        className="rounded-card border border-slate-200 bg-slate-50/30"
                        style={{ height: `${chartPresentation.suggestedHeight}px` }}
                    />
                )}

                {hideChartByDefault && (
                    <div className="rounded-card border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
                        {getTranslation('card_table_first_hint', language)}
                    </div>
                )}

                {showPivotColumnControls && (
                    <PivotStackedLegend
                        data={chartRowsForDisplay}
                        plan={chartPlanForDisplay}
                        hiddenSeriesLabels={hiddenPivotSeriesLabels}
                        onSeriesToggle={onSeriesToggle}
                        onResetHiddenSeries={onResetHiddenSeries}
                    />
                )}

                {showRowLegend && (
                    <div className="flex flex-col">
                        <InteractiveLegend
                            data={dataForLegend}
                            total={totalValue}
                            groupByKey={groupByKey}
                            valueKey={valueKey}
                            hiddenLabels={cardData.hiddenLabels || []}
                            onLabelClick={onLabelClick}
                            showPercentage={hasAdditiveMeasure}
                            aggregation={plan.aggregation}
                        />
                    </div>
                )}
            </div>

            {filter && (
                <div className="rounded-md border border-yellow-200 bg-yellow-100 p-3 text-xs text-yellow-800" data-export-exclude>
                    <b>{getTranslation('card_filter_active', language)}</b>{' '}
                    {getTranslation('card_filter_description', language, {
                        column: filter.column,
                        values: filter.values.join(', '),
                    })}
                </div>
            )}

            <AnalysisCardSummary
                cardId={cardId}
                plan={plan}
                totalValue={displayedTotalValue}
                overallTotalValue={totalValue}
                displayedRowCount={displayedRowCount}
                totalRowCount={totalRowCount}
                displayedMetricLabel={displayMetricLabel}
                displayedGroupLabel={displayGroupLabel}
                topN={topN}
                hideOthers={hasAdditiveMeasure && hideOthers}
                hiddenLabelCount={cardData.hiddenLabels?.length ?? 0}
                filter={filter}
                language={language}
                summary={summary}
                visualSummary={cardData.visualSummary}
                visuallyGrounded={cardData.visuallyGrounded}
                pivotQualitySummary={pivotQualitySummary}
            />

            {/* section divider — only when data table will render */}
            {showExplorationControls && isDataVisible && (
                <hr className="border-t border-slate-100" aria-hidden="true" data-export-table />
            )}

            {showExplorationControls && (tableFirstArtifact ? (
                isDataVisible ? (
                    <div className="rounded-card border border-slate-200 bg-slate-50/70 p-3" data-export-table>
                        <div className="mb-2 text-sm font-semibold text-slate-800">
                            {getTranslation(
                                plan.artifactType === 'pivot_matrix'
                                    ? 'card_pivot_summary_table'
                                    : 'card_analysis_table',
                                language,
                            )}
                        </div>
                        <AnalysisCardDataTables
                            isDataVisible={true}
                            dataForDisplay={tableDataForDisplay}
                            selectedIndices={selectedIndices}
                            plan={plan}
                            maxHeightClass="max-h-[28rem]"
                            sort={tableSort}
                            onSortChange={onTableSortChange}
                        />
                    </div>
                ) : null
            ) : (
                <div data-export-table>
                    <AnalysisCardDataTables
                        isDataVisible={isDataVisible}
                        dataForDisplay={tableDataForDisplay}
                        selectedIndices={selectedIndices}
                        plan={plan}
                        sort={tableSort}
                        onSortChange={onTableSortChange}
                    />
                </div>
            ))}

            {showExplorationControls && controls}
            </>)}

            {isProvenanceOpen && createPortal(
                <DataProvenanceModal
                    plan={plan}
                    aggregatedData={aggregatedData}
                    provenance={cardData.provenance}
                    currentDatasetVersion={currentDatasetVersion}
                    restoreFocusSelector={`[data-card-more-trigger="${id.replace(/["\\]/g, '\\$&')}"]`}
                    onClose={() => setIsProvenanceOpen(false)}
                />,
                document.body,
            )}

            {isVerdictExplainerOpen && createPortal(
                <VerdictExplainerModal
                    verdict={trustDecision.status}
                    reasonCodes={trustDecision.reasonCodes}
                    detail={[
                        trustDecision.detail,
                        cardData.autoAnalysisEvaluation?.detail,
                        ...(cardData.provenance?.evidenceReasons ?? []),
                    ].filter(Boolean).join(' | ')}
                    cardTitle={plan.title ?? 'Untitled'}
                    language={language}
                    settings={settings}
                    cachedExplanation={verdictExplanationCache.current}
                    onExplanationReady={(cache) => { verdictExplanationCache.current = cache; }}
                    onClose={() => setIsVerdictExplainerOpen(false)}
                />,
                document.body,
            )}
        </div>
    );
});
