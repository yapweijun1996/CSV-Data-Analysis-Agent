import { ChartConfigProps } from './types';
import { COLORS, BORDER_COLORS, BG_COLORS, getCommonOptions, getPivotTooltipCallbacks } from './common';
import { parseNumericValue } from '../dataHelpers';

export const createRadarChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }: ChartConfigProps): any => {
    const { groupByColumn, valueColumn } = plan;
    const valueKey = valueColumn || 'count';
    const labels = groupByColumn ? data.map(d => d[groupByColumn]) : [];
    const values = valueKey ? data.map(d => parseNumericValue(d[valueKey])) : [];

    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);

    // Radar charts don't have a standard 'selected' state like bar charts, so we don't use getColors helpers here.
    return {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: valueKey,
                data: values,
                backgroundColor: BG_COLORS[0],
                borderColor: BORDER_COLORS[0],
                pointBackgroundColor: COLORS[0],
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: COLORS[0],
                borderWidth: 2
            }]
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
                    angleLines: {
                        display: false
                    },
                    suggestedMin: 0,
                    ticks: {
                        backdropColor: 'transparent',
                        color: '#64748b'
                    },
                    grid: {
                        color: '#e2e8f0'
                    },
                    pointLabels: {
                        color: '#334155',
                        font: {
                            size: 12
                        }
                    }
                }
            },
            elements: {
                line: {
                    tension: 0,
                    borderWidth: 2
                }
            }
        }
    };
};
