import { ChartConfigProps } from './types';
import { COLORS, BORDER_COLORS, BG_COLORS, DESELECTED_BORDER_COLOR, DESELECTED_COLOR, getColors, getBorderColors, getCommonOptions } from './common';
import { parseNumericValue } from '../dataHelpers';

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
                    data: data.map(d => parseNumericValue(d[valueKey])),
                    backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                    borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                    borderWidth: 1,
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: secondaryValueColumn,
                    data: data.map(d => parseNumericValue(d[secondaryValueColumn])),
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
                y: { type: 'linear', display: true, position: 'left', ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' }, title: { display: true, text: valueKey, color: '#64748b' } },
                y1: { type: 'linear', display: true, position: 'right', ticks: { color: '#64748b' }, grid: { drawOnChartArea: false }, title: { display: true, text: secondaryValueColumn, color: '#64748b' } }
            }
        }
    };
};
