import { ChartConfigProps } from './types';
import { COLORS, BORDER_COLORS, BG_COLORS, DESELECTED_BORDER_COLOR, DESELECTED_COLOR, getColors, getBorderColors, getCommonOptions, tickColor, gridColor } from './common';
import { parseNullableNumericValue } from '../dataHelpers';

export const createComboChartConfig = (props: ChartConfigProps): any => {
    const { data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels } = props;
    const { groupByColumn, valueColumn, secondaryValueColumn } = plan;
    const hasSelection = selectedIndices.length > 0;
    const valueKey = valueColumn || 'count';

    if (!groupByColumn || !valueKey || !secondaryValueColumn) return {};
    
    const labels = data.map(d => d[groupByColumn]);
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: valueKey,
                    data: data.map(d => parseNullableNumericValue(d[valueKey])),
                    backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                    borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                    borderWidth: 1,
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: secondaryValueColumn,
                    data: data.map(d => parseNullableNumericValue(d[secondaryValueColumn])),
                    fill: false,
                    borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[1],
                    pointBackgroundColor: hasSelection ? DESELECTED_COLOR : COLORS[1],
                    pointBorderColor: hasSelection ? DESELECTED_BORDER_COLOR : BORDER_COLORS[1],
                    pointRadius: hasSelection ? 5 : 3,
                    pointHoverRadius: 7,
                    tension: 0.1,
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { type: 'linear', display: true, position: 'left', ticks: { color: tickColor() }, grid: { color: gridColor() }, title: { display: true, text: valueKey, color: tickColor() } },
                y1: { type: 'linear', display: true, position: 'right', ticks: { color: tickColor() }, grid: { drawOnChartArea: false }, title: { display: true, text: secondaryValueColumn, color: tickColor() } }
            }
        }
    };
};
