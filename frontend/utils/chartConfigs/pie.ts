import { ChartConfigProps } from './types';
import { BG_COLORS, BORDER_COLORS, getColors, getBorderColors, getCommonOptions, getPivotTooltipCallbacks } from './common';
import { parseNumericValue } from '../dataHelpers';

export const createPieChartConfig = ({ chartType, data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }: ChartConfigProps): any => {
    const { groupByColumn, valueColumn } = plan;
    const valueKey = valueColumn || 'count';
    const hasSelection = selectedIndices.length > 0;
    const labels = groupByColumn ? data.map(d => d[groupByColumn]) : [];
    const values = valueKey ? data.map(d => parseNumericValue(d[valueKey])) : [];
    
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
    const pieDataLabelDisplay = (context: { chart?: { width?: number }; dataIndex: number; dataset?: { data?: unknown[] } }) => {
        if (!showDataLabels) return false;

        const datasetValues = (context.dataset?.data ?? []).map(value => Math.abs(Number(value) || 0));
        const total = datasetValues.reduce((sum, value) => sum + value, 0);
        const currentValue = datasetValues[context.dataIndex] ?? 0;
        const minimumShare = (context.chart?.width ?? Number.POSITIVE_INFINITY) < 520 ? 0.08 : 0.03;

        // Tiny pie slices cannot carry readable labels without collisions. Their
        // exact values remain available in the legend, tooltip, and SR summary.
        return total > 0 && currentValue / total >= minimumShare;
    };

    return {
        type: chartType, // 'pie' or 'doughnut'
        data: {
            labels,
            datasets: [{
                label: valueKey,
                data: values,
                backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                borderWidth: 1,
                offset: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 20 : 0) : 0,
            }]
        },
        options: {
            ...commonOptions,
            layout: {
                padding: showDataLabels ? { top: 36, right: 84, bottom: 36, left: 84 } : 0,
            },
            plugins: {
                ...commonOptions.plugins,
                datalabels: {
                    ...commonOptions.plugins?.datalabels,
                    display: pieDataLabelDisplay,
                },
                ...(pivotTooltipCallbacks ? {
                    tooltip: {
                        ...commonOptions.plugins?.tooltip,
                        callbacks: pivotTooltipCallbacks,
                    },
                } : {}),
            },
            scales: { x: { display: false }, y: { display: false } },
        }
    };
};
