import React from 'react';
import { CsvRow } from '../types';

interface InteractiveLegendProps {
    data: CsvRow[];
    total: number;
    groupByKey: string;
    valueKey: string;
    hiddenLabels: string[];
    onLabelClick: (label: string) => void;
}

const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];

export const InteractiveLegend: React.FC<InteractiveLegendProps> = ({ data, total, groupByKey, valueKey, hiddenLabels, onLabelClick }) => {
    
    const formatValue = (value: string | number) => {
        if (typeof value === 'number') {
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return value;
    };

    return (
        <div className="text-sm space-y-1 max-h-48 overflow-y-auto pr-2">
            {data.map((item, index) => {
                const label = String(item[groupByKey]);
                const value = Number(item[valueKey]) || 0;
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                const isHidden = hiddenLabels.includes(label);
                const color = COLORS[index % COLORS.length];

                return (
                    <button
                        key={label}
                        onClick={() => onLabelClick(label)}
                        className={`w-full flex items-center justify-between p-1.5 rounded-md transition-all duration-200 ${isHidden ? 'opacity-50' : 'hover:bg-slate-100'}`}
                        title={`Click to ${isHidden ? 'show' : 'hide'} "${label}"`}
                    >
                        <div className="flex items-center truncate mr-2">
                            <span className="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{ backgroundColor: isHidden ? '#9ca3af' : color }}></span>
                            <span className={`truncate text-xs ${isHidden ? 'line-through text-slate-400' : 'text-slate-700'}`}>{label}</span>
                        </div>
                        <div className="flex items-baseline ml-2 flex-shrink-0">
                            <span className={`font-semibold text-xs ${isHidden ? 'text-slate-400' : 'text-slate-800'}`}>{formatValue(value)}</span>
                            <span className="text-xs text-slate-500 ml-1.5 w-12 text-right">({percentage}%)</span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};