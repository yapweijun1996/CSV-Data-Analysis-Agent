
import React, { useRef, useState, useMemo } from 'react';
import { ChartRendererHandle } from './ChartRenderer';
import { exportToPng, exportToCsv, exportToHtml } from '../utils/exportUtils';
import { InteractiveLegend } from './analysis-card/InteractiveLegend';
import { useAppStore } from '../store/useAppStore';
import { useAnalysisCardData } from '../hooks/useAnalysisCardData';
import { AnalysisCardHeader } from './analysis-card/AnalysisCardHeader';
import { AnalysisCardChart } from './analysis-card/AnalysisCardChart';
import { AnalysisCardSummary } from './analysis-card/AnalysisCardSummary';
import { AnalysisCardControls } from './analysis-card/AnalysisCardControls';
import { AnalysisCardDataTables } from './analysis-card/AnalysisCardDataTables';
import { getAvailableChartTypes } from '../utils/chartTypeUtils';
import { getLocalizedText } from '../utils/localizedText';


interface AnalysisCardProps {
    cardId: string;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ cardId }) => {
    const { 
        handleChartTypeChange, handleToggleDataVisibility, handleTopNChange,
        handleHideOthersChange, handleHideZeroValueRowsChange, handleToggleLegendLabel, handleToggleDataLabels, language
    } = useAppStore(state => ({
        handleChartTypeChange: state.handleChartTypeChange,
        handleToggleDataVisibility: state.handleToggleDataVisibility,
        handleTopNChange: state.handleTopNChange,
        handleHideOthersChange: state.handleHideOthersChange,
        handleHideZeroValueRowsChange: state.handleHideZeroValueRowsChange,
        handleToggleLegendLabel: state.handleToggleLegendLabel,
        handleToggleDataLabels: state.handleToggleDataLabels,
        language: state.settings.language,
    }));
    
    const {
        cardData,
        tableDataForDisplay,
        chartDataForDisplay,
        dataForLegend,
        totalValue,
        displayedTotalValue,
        totalRowCount,
        displayedRowCount,
        tableZeroValueRowCount,
        summary,
        valueKey,
        groupByKey,
    } = useAnalysisCardData(cardId);

    const cardRef = useRef<HTMLDivElement>(null);
    const chartRendererRef = useRef<ChartRendererHandle>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [isZoomed, setIsZoomed] = useState(false);
    
    if (!cardData) return null;

    const { id, plan, aggregatedData, displayChartType, isDataVisible, topN, hideOthers, hideZeroValueRows = false, disableAnimation, showDataLabels, filter } = cardData;
    
    // Calculate available chart types based on the plan
    const availableChartTypes = useMemo(() => getAvailableChartTypes(plan, chartDataForDisplay), [chartDataForDisplay, plan]);

    const handleExport = async (format: 'png' | 'csv' | 'html') => {
        if (!cardRef.current) return;
        setIsExporting(true);
        try {
            switch(format) {
                case 'png': await exportToPng(cardRef.current, plan.title); break;
                case 'csv': exportToCsv(tableDataForDisplay, plan.title); break;
                case 'html': await exportToHtml(cardRef.current, plan.title, tableDataForDisplay, getLocalizedText(cardData.summary, language)); break;
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleChartClick = (index: number, event: MouseEvent) => {
        const isMultiSelect = event.ctrlKey || event.metaKey;
        setSelectedIndices(prev => {
            if (isMultiSelect) {
                return prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].sort((a,b) => a-b);
            }
            return prev.includes(index) ? [] : [index];
        });
    };

    const onTopNChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value === 'all' ? null : parseInt(e.target.value, 10);
        handleTopNChange(id, value);
    };

    return (
        <div ref={cardRef} id={id} className="bg-white rounded-card shadow-lg p-4 flex flex-col transition-all duration-300 hover:shadow-blue-500/20 border border-slate-200">
            <AnalysisCardHeader 
                plan={plan}
                displayChartType={displayChartType}
                availableChartTypes={availableChartTypes}
                isExporting={isExporting}
                onChartTypeChange={(newType) => handleChartTypeChange(id, newType)}
                onExport={handleExport}
            />

            <div className="grid gap-4 flex-grow grid-cols-1">
                <AnalysisCardChart
                    cardId={cardId}
                    chartRendererRef={chartRendererRef}
                    displayChartType={displayChartType}
                    dataForDisplay={chartDataForDisplay}
                    plan={plan}
                    selectedIndices={selectedIndices}
                    isZoomed={isZoomed}
                    disableAnimation={disableAnimation}
                    showDataLabels={showDataLabels}
                    onElementClick={handleChartClick}
                    onZoomChange={setIsZoomed}
                    onClearSelection={() => setSelectedIndices([])}
                    onResetZoom={() => chartRendererRef.current?.resetZoom()}
                />

                {groupByKey && (
                    <div className="flex flex-col">
                        <InteractiveLegend 
                            data={dataForLegend}
                            total={totalValue}
                            groupByKey={groupByKey}
                            valueKey={valueKey}
                            hiddenLabels={cardData.hiddenLabels || []}
                            onLabelClick={(label) => handleToggleLegendLabel(id, label)}
                        />
                    </div>
                )}
            </div>
            
            {filter && (
                 <div className="text-xs text-yellow-800 bg-yellow-100 p-2 rounded-md my-3 border border-yellow-200">
                    <b>AI Filter Active:</b> Showing where '{filter.column}' is '{filter.values.join(', ')}'. Ask AI to "clear filter" to remove.
                </div>
            )}

            <AnalysisCardSummary
                cardId={cardData.id}
                plan={plan}
                totalValue={displayedTotalValue}
                overallTotalValue={totalValue}
                displayedRowCount={displayedRowCount}
                totalRowCount={totalRowCount}
                displayedMetricLabel={plan.valueColumn || 'Value'}
                displayedGroupLabel={plan.groupByColumn || 'Group'}
                topN={topN}
                hideOthers={hideOthers}
                hiddenLabelCount={cardData.hiddenLabels?.length ?? 0}
                filter={filter}
                language={language}
                summary={summary}
            />
            
            <AnalysisCardDataTables
                isDataVisible={isDataVisible}
                dataForDisplay={tableDataForDisplay}
                selectedIndices={selectedIndices}
                plan={plan}
            />

            <AnalysisCardControls
                cardId={id}
                isDataVisible={isDataVisible}
                plan={plan}
                aggregatedData={aggregatedData}
                availableChartTypes={availableChartTypes}
                displayChartType={displayChartType}
                topN={topN}
                hideOthers={hideOthers}
                hideZeroValueRows={hideZeroValueRows}
                zeroValueRowCount={tableZeroValueRowCount}
                pivotColumnTopN={8}
                pivotHideOtherColumns={false}
                pivotFoldedColumnCount={0}
                showPivotColumnControls={false}
                onToggleDataVisibility={() => handleToggleDataVisibility(id)}
                onChartTypeSelect={(type) => handleChartTypeChange(id, type)}
                onTopNChange={onTopNChange}
                onHideOthersChange={(e) => handleHideOthersChange(id, e.target.checked)}
                onHideZeroValueRowsChange={(e) => handleHideZeroValueRowsChange(id, e.target.checked)}
                onPivotColumnTopNChange={() => undefined}
                onPivotHideOtherColumnsChange={() => undefined}
                showDataLabels={showDataLabels}
                onToggleDataLabels={() => handleToggleDataLabels(id)}
            />
        </div>
    );
};
