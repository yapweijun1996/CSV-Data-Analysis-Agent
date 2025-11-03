import React, { useRef, useState, useMemo } from 'react';
import { AnalysisCardData, ChartType } from '../types';
import { ChartRenderer, ChartRendererHandle } from './ChartRenderer';
import { DataTable } from './DataTable';
import { exportToPng, exportToCsv, exportToHtml } from '../utils/exportUtils';
import { ChartTypeSwitcher } from './ChartTypeSwitcher';
import { applyTopNWithOthers } from '../utils/dataProcessor';
import { InteractiveLegend } from './InteractiveLegend';

interface AnalysisCardProps {
    cardData: AnalysisCardData;
    onChartTypeChange: (cardId: string, newType: ChartType) => void;
    onToggleDataVisibility: (cardId: string) => void;
    onTopNChange: (cardId: string, topN: number | null) => void;
    onHideOthersChange: (cardId: string, hide: boolean) => void;
    onToggleLegendLabel: (cardId: string, label: string) => void;
}

const ExportIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

const ResetZoomIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      <path d="M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 01-1.414-1.414l2-2zM7.707 14.707a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L7 12.586V10a1 1 0 112 0v2.586l1.293-1.293a1 1 0 011.414 1.414l-2 2z" />
    </svg>
);

const ClearSelectionIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);


export const AnalysisCard: React.FC<AnalysisCardProps> = ({ cardData, onChartTypeChange, onToggleDataVisibility, onTopNChange, onHideOthersChange, onToggleLegendLabel }) => {
    const { id, plan, aggregatedData, summary, displayChartType, isDataVisible, topN, hideOthers, disableAnimation, filter, hiddenLabels = [] } = cardData;
    const cardRef = useRef<HTMLDivElement>(null);
    const chartRendererRef = useRef<ChartRendererHandle>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [isZoomed, setIsZoomed] = useState(false);
    const [showSelectionDetails, setShowSelectionDetails] = useState(true);
    
    const summaryParts = summary.split('---');
    const englishSummary = summaryParts[0]?.trim();
    const mandarinSummary = summaryParts[1]?.trim();

    const valueKey = plan.valueColumn || 'count';
    const groupByKey = plan.groupByColumn || '';

    const dataAfterFilter = useMemo(() => {
        let data = aggregatedData;
        if (filter && filter.column && filter.values.length > 0) {
            data = data.filter(row => filter.values.includes(row[filter.column]));
        }
        return data;
    }, [aggregatedData, filter]);

    const dataForLegend = useMemo(() => {
        if (plan.chartType !== 'scatter' && groupByKey && topN) {
            return applyTopNWithOthers(dataAfterFilter, groupByKey, valueKey, topN);
        }
        return dataAfterFilter;
    }, [dataAfterFilter, plan.chartType, groupByKey, topN, valueKey]);

    const dataForDisplay = useMemo(() => {
        let data = dataForLegend;
        if (topN && hideOthers) {
            data = data.filter(row => row[groupByKey] !== 'Others');
        }
        if (groupByKey) {
            data = data.filter(row => !hiddenLabels.includes(String(row[groupByKey])));
        }
        return data;
    }, [dataForLegend, topN, hideOthers, groupByKey, hiddenLabels]);

    const totalValue = useMemo(() => {
        return dataAfterFilter.reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0);
    }, [dataAfterFilter, valueKey]);


    const handleExport = async (format: 'png' | 'csv' | 'html') => {
        if (!cardRef.current) return;
        setIsExporting(true);
        try {
            switch(format) {
                case 'png':
                    await exportToPng(cardRef.current, plan.title);
                    break;
                case 'csv':
                    exportToCsv(dataForDisplay, plan.title);
                    break;
                case 'html':
                    await exportToHtml(cardRef.current, plan.title, dataForDisplay, summary);
                    break;
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleChartClick = (index: number, event: MouseEvent) => {
        const isMultiSelect = event.ctrlKey || event.metaKey;
        setSelectedIndices(prev => {
            if (isMultiSelect) {
                const newSelection = prev.includes(index)
                    ? prev.filter(i => i !== index)
                    : [...prev, index];
                return newSelection.sort((a,b) => a-b);
            }
            return prev.includes(index) ? [] : [index];
        });
    };

    const handleResetZoom = () => chartRendererRef.current?.resetZoom();
    const clearSelection = () => setSelectedIndices([]);
    const handleTopNChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value === 'all' ? null : parseInt(e.target.value, 10);
        onTopNChange(id, value);
    };
    
    const selectedData = selectedIndices.map(index => dataForDisplay[index]);

    return (
        <div ref={cardRef} id={id} className="bg-white rounded-lg shadow-lg p-4 flex flex-col transition-all duration-300 hover:shadow-blue-500/20 border border-slate-200">
            <div className="flex justify-between items-start gap-4 mb-2">
                <h3 className="text-lg font-bold text-slate-900 flex-1">{plan.title}</h3>
                <div className="flex items-center bg-slate-100 rounded-md p-0.5 space-x-0.5 flex-shrink-0">
                    <ChartTypeSwitcher currentType={displayChartType} onChange={(newType) => onChartTypeChange(id, newType)} />
                    <div className="relative group">
                        <button disabled={isExporting} className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md transition-colors hover:bg-slate-200">
                           <ExportIcon />
                        </button>
                        <div className="absolute right-0 mt-2 w-36 bg-white border border-slate-200 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none group-hover:pointer-events-auto">
                            <a onClick={() => handleExport('png')} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer rounded-t-md">Export as PNG</a>
                            <a onClick={() => handleExport('csv')} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer">Export as CSV</a>
                            <a onClick={() => handleExport('html')} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer rounded-b-md">Export as HTML</a>
                        </div>
                    </div>
                </div>
            </div>
            <p className="text-sm text-slate-500 mb-4">{plan.description}</p>

            <div className="grid gap-4 flex-grow grid-cols-1">
                <div className="relative h-64">
                     <ChartRenderer 
                        ref={chartRendererRef}
                        chartType={displayChartType} 
                        data={dataForDisplay} 
                        plan={plan}
                        selectedIndices={selectedIndices}
                        onElementClick={handleChartClick}
                        onZoomChange={setIsZoomed}
                        disableAnimation={disableAnimation}
                    />
                     <div className="absolute top-1 right-1 flex items-center space-x-1">
                        {selectedIndices.length > 0 && (
                             <button onClick={clearSelection} title="Clear selection" className="p-1 bg-white/50 text-slate-600 rounded-full hover:bg-slate-100 hover:text-slate-800 transition-all backdrop-blur-sm">
                                <ClearSelectionIcon />
                            </button>
                        )}
                        {isZoomed && (
                            <button onClick={handleResetZoom} title="Reset zoom" className="p-1 bg-white/50 text-slate-600 rounded-full hover:bg-slate-100 hover:text-slate-800 transition-all backdrop-blur-sm">
                                <ResetZoomIcon />
                            </button>
                        )}
                    </div>
                </div>
                {groupByKey && (
                    <div className="flex flex-col">
                        <InteractiveLegend 
                            data={dataForLegend}
                            total={totalValue}
                            groupByKey={groupByKey}
                            valueKey={valueKey}
                            hiddenLabels={hiddenLabels}
                            onLabelClick={(label) => onToggleLegendLabel(id, label)}
                        />
                    </div>
                )}
            </div>
            
            {filter && (
                 <div className="text-xs text-yellow-800 bg-yellow-100 p-2 rounded-md my-3 border border-yellow-200">
                    <b>AI Filter Active:</b> Showing where '{filter.column}' is '{filter.values.join(', ')}'. Ask AI to "clear filter" to remove.
                </div>
            )}

            <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="bg-slate-50 p-3 rounded-md text-sm border border-slate-200">
                    <div className="flex justify-between items-baseline mb-2">
                        <p className="font-semibold text-blue-600">AI Summary</p>
                        {plan.aggregation === 'sum' && (
                            <p className="text-xs text-slate-500">
                                Total: <span className="font-bold text-base text-slate-800">{totalValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                            </p>
                        )}
                    </div>
                    <p className="text-slate-700 text-xs">{englishSummary}</p>
                    {mandarinSummary && <p className="text-slate-500 mt-2 text-xs">{mandarinSummary}</p>}
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <div>
                    <button onClick={() => onToggleDataVisibility(id)} className="text-sm text-blue-600 hover:underline">
                        {isDataVisible ? 'Hide' : 'Show'} Full Data Table
                    </button>
                </div>
                {plan.chartType !== 'scatter' && aggregatedData.length > 5 && (
                    <div className="flex items-center space-x-2">
                        <label htmlFor={`top-n-${id}`} className="text-xs text-slate-500">Show</label>
                        <select
                            id={`top-n-${id}`}
                            value={topN || 'all'}
                            onChange={handleTopNChange}
                            className="bg-white border border-slate-300 text-slate-800 text-xs rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="all">All</option>
                            <option value="5">Top 5</option>
                            <option value="8">Top 8</option>
                            <option value="10">Top 10</option>
                            <option value="20">Top 20</option>
                        </select>
                         {topN && (
                            <div className="flex items-center">
                                <label htmlFor={`hide-others-${id}`} className="flex items-center space-x-1.5 text-xs text-slate-500">
                                    <input
                                        type="checkbox"
                                        id={`hide-others-${id}`}
                                        checked={hideOthers}
                                        onChange={(e) => onHideOthersChange(id, e.target.checked)}
                                        className="bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-3.5 w-3.5"
                                    />
                                    <span>Hide "Others"</span>
                                </label>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedIndices.length > 0 && (
                <div className="mt-4 bg-slate-50 p-3 rounded-md text-sm border border-slate-200">
                     <button onClick={() => setShowSelectionDetails(!showSelectionDetails)} className="w-full text-left font-semibold text-blue-600 mb-1">
                        {showSelectionDetails ? '▾' : '▸'} Selection Details ({selectedIndices.length} items)
                    </button>
                    {showSelectionDetails && <DataTable data={selectedData} />}
                </div>
            )}
            
            {isDataVisible && (
                 <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-md">
                    <DataTable data={dataForDisplay} />
                </div>
            )}
        </div>
    );
};