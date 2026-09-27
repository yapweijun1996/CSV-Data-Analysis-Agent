import React, { RefObject } from 'react';
import { ChartRenderer, ChartRendererHandle } from '../ChartRenderer';
import { IconClearSelection } from '../../icons/IconClearSelection';
import { IconResetZoom } from '../../icons/IconResetZoom';
import { CsvRow, AnalysisPlan, ChartType } from '../../types';
import { getTranslation } from '../../utils/localization';
import { formatAnalysisMeasureValue, normalizeCategoryLabel } from '../../utils/analysisCardPresentation';

interface AnalysisCardChartProps {
    cardId: string;
    language: string;
    chartRendererRef: RefObject<ChartRendererHandle>;
    displayChartType: ChartType;
    dataForDisplay: CsvRow[];
    plan: AnalysisPlan;
    selectedIndices: number[];
    isZoomed: boolean;
    chartHeight?: number;
    disableAnimation?: boolean;
    showDataLabels?: boolean;
    onElementClick: (index: number, event: MouseEvent) => void;
    onZoomChange: (isZoomed: boolean) => void;
    onClearSelection: () => void;
    onResetZoom: () => void;
}

export const AnalysisCardChart: React.FC<AnalysisCardChartProps> = React.memo(({
    cardId,
    language,
    chartRendererRef,
    displayChartType,
    dataForDisplay,
    plan,
    selectedIndices,
    isZoomed,
    chartHeight = 256,
    disableAnimation,
    showDataLabels,
    onElementClick,
    onZoomChange,
    onClearSelection,
    onResetZoom
}) => (
    <div className="relative rounded-card border border-slate-200 bg-white p-3">
        {selectedIndices.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-card border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" data-export-exclude>
                <p className="font-medium">
                    {getTranslation('card_selection_count', language, {
                        count: selectedIndices.length,
                        item: getTranslation(
                            selectedIndices.length === 1 ? 'card_selection_item' : 'card_selection_items',
                            language,
                        ),
                    })}
                </p>
                <button
                    type="button"
                    onClick={onClearSelection}
                    className="inline-flex min-h-[44px] items-center rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200 transition-colors hover:bg-blue-100 md:min-h-0"
                >
                    {getTranslation('card_clear_selection', language)}
                </button>
            </div>
        )}
        <div className="relative" style={{ height: `${chartHeight}px` }}>
            <ChartRenderer
                ref={chartRendererRef}
                cardId={cardId}
                chartType={displayChartType}
                data={dataForDisplay}
                plan={plan}
                selectedIndices={selectedIndices}
                onElementClick={onElementClick}
                onZoomChange={onZoomChange}
                disableAnimation={disableAnimation}
                showDataLabels={showDataLabels}
            />
            <div className="absolute top-1 right-1 flex items-center space-x-1" data-export-exclude>
                {selectedIndices.length > 0 && (
                    <button type="button" onClick={onClearSelection} title={getTranslation('card_clear_selection', language)} aria-label={getTranslation('card_clear_selection', language)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/70 p-1 text-slate-600 backdrop-blur-sm transition-all hover:bg-slate-100 hover:text-slate-800 md:min-h-0 md:min-w-0">
                        <IconClearSelection />
                    </button>
                )}
                {isZoomed && (
                    <button type="button" onClick={onResetZoom} title={getTranslation('card_reset_zoom', language)} aria-label={getTranslation('card_reset_zoom', language)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/50 p-1 text-slate-600 backdrop-blur-sm transition-all hover:bg-slate-100 hover:text-slate-800 md:min-h-0 md:min-w-0">
                        <IconResetZoom />
                    </button>
                )}
            </div>
        </div>
        {showDataLabels && (
            <p className="sr-only">
                {(dataForDisplay ?? []).map(row => {
                    const category = plan.groupByColumn
                        ? normalizeCategoryLabel(row[plan.groupByColumn])
                        : (plan.valueColumn ?? 'Value');
                    const valueKey = plan.valueColumn ?? 'count';
                    return `${category}: ${formatAnalysisMeasureValue(row[valueKey])}`;
                }).join('; ')}
            </p>
        )}
    </div>
));
