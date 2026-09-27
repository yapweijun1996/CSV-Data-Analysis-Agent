import { ChartConfigProps } from './types';
import { COLORS, BORDER_COLORS, DESELECTED_BORDER_COLOR, getColors, getBorderColors, getCommonOptions, getPivotTooltipCallbacks, getZoomOptions } from './common';
import { parseNumericValue } from '../dataHelpers';

export const createLineChartConfig = (props: ChartConfigProps): any => {
    const { data, plan, selectedIndices, onElementClick, onZoomChange, disableAnimation, showDataLabels } = props;
    const { groupByColumn, valueColumn } = plan;
    const valueKey = valueColumn || 'count';
    const hasSelection = selectedIndices.length > 0;
    const labels = groupByColumn ? data.map(d => d[groupByColumn]) : [];
    const values = valueKey ? data.map(d => parseNumericValue(d[valueKey])) : [];

    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
    
    return {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: valueKey,
                data: values,
                fill: false,
                borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[0],
                pointBackgroundColor: getColors([COLORS[0]], data.length, selectedIndices),
                pointBorderColor: getBorderColors([BORDER_COLORS[0]], data.length, selectedIndices),
                pointRadius: hasSelection ? 5 : 3,
                pointHoverRadius: 7,
                tension: 0.1
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                ...(pivotTooltipCallbacks
                    ? {
                        tooltip: {
                            ...commonOptions.plugins?.tooltip,
                            callbacks: pivotTooltipCallbacks,
                        },
                    }
                    : {}),
                zoom: getZoomOptions(onZoomChange),
            },
        }
    };
};
