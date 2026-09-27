import { ChartConfigProps } from './types';
import { BG_COLORS, BORDER_COLORS, getColors, getBorderColors, getCommonOptions, getPivotTooltipCallbacks } from './common';
import { parseNumericValue } from '../dataHelpers';

export const createPolarAreaChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }: ChartConfigProps): any => {
    const { groupByColumn, valueColumn } = plan;
    const valueKey = valueColumn || 'count';
    const labels = groupByColumn ? data.map(d => d[groupByColumn]) : [];
    const values = valueKey ? data.map(d => parseNumericValue(d[valueKey])) : [];
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);

    return {
        type: 'polarArea',
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
                r: {
                    ticks: { display: false },
                    grid: { color: '#e2e8f0' },
                },
            },
        },
    };
};
