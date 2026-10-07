import { ChartConfigProps } from './types';
import { BG_COLORS, BORDER_COLORS, getColors, getBorderColors, getCommonOptions, getPivotTooltipCallbacks } from './common';
import { formatAnalysisValue, formatAxisValue, getBarChartReadabilityHints, normalizeCategoryLabel } from '../analysisCardPresentation';
import { parseNumericValue } from '../dataHelpers';

export const createBarChartConfig = ({ data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }: ChartConfigProps): any => {
    const { groupByColumn, valueColumn } = plan;
    const valueKey = valueColumn || 'count';
    const labels = groupByColumn ? data.map(d => normalizeCategoryLabel(d[groupByColumn])) : [];
    const values = valueKey ? data.map(d => parseNumericValue(d[valueKey])) : [];
    const readabilityHints = getBarChartReadabilityHints(data, groupByColumn);
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
    const categoryTickCallback = function(this: any, value: number | string) {
        const label = this.getLabelForValue(Number(value));
        if (typeof label === 'string' && label.length > readabilityHints.categoryTickLimit) {
            return `${label.substring(0, readabilityHints.categoryTickLimit - 1)}…`;
        }
        return label;
    };
    const shouldDisplayDataLabel = (context: { chart?: { width?: number }; dataIndex?: number }) => {
        if (!showDataLabels) return false;

        const chartWidth = context.chart?.width ?? Number.POSITIVE_INFINITY;
        if (readabilityHints.useHorizontalLayout || chartWidth >= 520 || values.length <= 4) {
            return true;
        }

        // On narrow vertical charts, labels for short bars share nearly the
        // same baseline and overlap even when their numbers are compacted.
        // Keep the leading values visible; every full value remains available
        // in the chart tooltip and the accessible legend controls.
        const visibleLabelLimit = chartWidth < 400 ? 2 : 3;
        const rankedIndices = values
            .map((value, index) => ({ index, magnitude: Math.abs(value) }))
            .sort((left, right) => right.magnitude - left.magnitude || left.index - right.index)
            .slice(0, visibleLabelLimit)
            .map(entry => entry.index);
        return rankedIndices.includes(context.dataIndex ?? -1);
    };

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: valueKey,
                data: values,
                backgroundColor: getColors(BG_COLORS, data.length, selectedIndices),
                borderColor: getBorderColors(BORDER_COLORS, data.length, selectedIndices),
                borderWidth: 1
            }]
        },
        options: {
            ...commonOptions,
            layout: {
                padding: showDataLabels
                    ? (readabilityHints.useHorizontalLayout
                        ? { top: 18, right: 96, bottom: 18, left: 12 }
                        : { top: 28, right: 44, bottom: 18, left: 44 })
                    : 0,
            },
            plugins: {
                ...commonOptions.plugins,
                datalabels: {
                    ...commonOptions.plugins?.datalabels,
                    display: shouldDisplayDataLabel,
                },
                ...(pivotTooltipCallbacks
                    ? {
                        tooltip: {
                            ...commonOptions.plugins?.tooltip,
                            callbacks: pivotTooltipCallbacks,
                        },
                    }
                    : {}),
            },
            indexAxis: readabilityHints.useHorizontalLayout ? 'y' : 'x',
            scales: readabilityHints.useHorizontalLayout
                ? {
                    x: {
                        ticks: {
                            color: '#64748b',
                            callback: (value: number | string) => formatAxisValue(Number(value)),
                        },
                        grid: { color: '#e2e8f0' },
                    },
                    y: {
                        ticks: {
                            color: '#64748b',
                            callback: categoryTickCallback,
                        },
                        grid: { display: false },
                    },
                }
                : {
                    x: {
                        ...commonOptions.scales?.x,
                        ticks: {
                            color: '#64748b',
                            callback: categoryTickCallback,
                        },
                        grid: { display: false },
                    },
                    y: {
                        ...commonOptions.scales?.y,
                        ticks: {
                            color: '#64748b',
                            callback: (value: number | string) => formatAxisValue(Number(value)),
                        },
                        grid: { color: '#e2e8f0' },
                    },
                },
        }
    };
};
