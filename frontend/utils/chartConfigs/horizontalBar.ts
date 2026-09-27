import { ChartConfigProps } from './types';
import { BG_COLORS, BORDER_COLORS, getColors, getBorderColors, getCommonOptions, getPivotTooltipCallbacks } from './common';
import { formatAnalysisValue, normalizeCategoryLabel } from '../analysisCardPresentation';
import { parseNumericValue } from '../dataHelpers';

export const createHorizontalBarChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }: ChartConfigProps): any => {
    const { groupByColumn, valueColumn } = plan;
    const valueKey = valueColumn || 'count';
    const labels = groupByColumn ? data.map(d => normalizeCategoryLabel(d[groupByColumn])) : [];
    const values = valueKey ? data.map(d => parseNumericValue(d[valueKey])) : [];
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: valueKey,
                data: values,
                backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                borderWidth: 1,
            }],
        },
        options: {
            ...commonOptions,
            indexAxis: 'y' as const,
            layout: {
                padding: showDataLabels ? { top: 18, right: 96, bottom: 18, left: 12 } : 0,
            },
            plugins: pivotTooltipCallbacks
                ? {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins?.tooltip,
                        callbacks: pivotTooltipCallbacks,
                    },
                }
                : commonOptions.plugins,
            scales: {
                x: {
                    ticks: {
                        color: '#64748b',
                        callback: (value: number | string) => formatAnalysisValue(Number(value)),
                    },
                    grid: { color: '#e2e8f0' },
                },
                y: {
                    ticks: {
                        color: '#64748b',
                        callback: function(this: any, value: number | string) {
                            const label = this.getLabelForValue(Number(value));
                            if (typeof label === 'string' && label.length > 20) {
                                return `${label.substring(0, 19)}…`;
                            }
                            return label;
                        },
                    },
                    grid: { display: false },
                },
            },
        },
    };
};
