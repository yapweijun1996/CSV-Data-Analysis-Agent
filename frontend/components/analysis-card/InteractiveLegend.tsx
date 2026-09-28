
import React from 'react';
import { AnalysisPlan, CsvRow } from '../../types';
import { formatAnalysisMeasureValue, formatAnalysisValue, normalizeCategoryLabel } from '../../utils/analysisCardPresentation';
import { parseNumericValue } from '../../utils/dataHelpers';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

interface InteractiveLegendProps {
    data: CsvRow[];
    total: number;
    groupByKey: string;
    valueKey: string;
    hiddenLabels: string[];
    onLabelClick: (label: string) => void;
    showPercentage?: boolean;
    aggregation?: AnalysisPlan['aggregation'];
}

const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];

const InteractiveLegendComponent: React.FC<InteractiveLegendProps> = ({ data, total, groupByKey, valueKey, hiddenLabels, onLabelClick, showPercentage = true, aggregation }) => {
    const language = useAppStore(state => state.settings.language);

    return (
        <div className="text-sm space-y-1 max-h-48 overflow-y-auto pr-2" data-export-exclude>
            {data.map((item, index) => {
                const label = normalizeCategoryLabel(item[groupByKey]);
                const value = parseNumericValue(item[valueKey]);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                const isHidden = hiddenLabels.includes(label);
                const color = COLORS[index % COLORS.length];

                return (
                    <button
                        key={`${label}-${index}`}
                        onClick={() => onLabelClick(label)}
                        className={`flex min-h-[44px] w-full items-center justify-between rounded-md p-1.5 transition-all duration-200 md:min-h-0 ${isHidden ? 'opacity-50' : 'hover:bg-slate-100'}`}
                        title={getTranslation('card_toggle_legend_item', language, {
                            action: getTranslation(isHidden ? 'card_action_show' : 'card_action_hide', language),
                            label,
                        })}
                    >
                        <div className="flex items-center truncate mr-2">
                            <span className="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{ backgroundColor: isHidden ? '#9ca3af' : color }}></span>
                            <span className={`truncate text-sm ${isHidden ? 'line-through text-slate-400' : 'text-slate-700'}`}>{label}</span>
                        </div>
                        <div className="flex items-baseline ml-2 flex-shrink-0">
                            <span className={`font-semibold text-sm ${isHidden ? 'text-slate-400' : 'text-slate-800'}`}>{aggregation === 'count' ? formatAnalysisValue(value, 0) : formatAnalysisMeasureValue(value)}</span>
                            {showPercentage && <span className="text-xs text-slate-500 ml-1.5 w-12 text-right">({percentage}%)</span>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export const InteractiveLegend = React.memo(InteractiveLegendComponent);
