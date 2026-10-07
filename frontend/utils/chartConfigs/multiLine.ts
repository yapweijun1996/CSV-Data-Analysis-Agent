/**
 * Multi-line chart config — renders multiple numeric columns as separate line series
 * on a shared Y-axis. Used when card data has 3+ metrics (e.g., Week1, Week2, Week3)
 * that should be compared visually on the same chart.
 *
 * Follows the dataset iteration pattern from stacked.ts (lines 41-56).
 */

import { ChartConfigProps } from './types';
import { COLORS, BORDER_COLORS, getCommonOptions, getZoomOptions } from './common';
import { formatAnalysisValue, formatAxisValue, normalizeCategoryLabel } from '../analysisCardPresentation';
import { parseNumericValue } from '../dataHelpers';

export const createMultiLineChartConfig = ({
    data,
    plan,
    selectedIndices,
    onElementClick,
    onZoomChange,
    disableAnimation,
    showDataLabels,
}: ChartConfigProps): any => {
    const groupKey = plan.groupByColumn || 'row_label';
    const matrixValueColumns = plan.artifactMetadata?.matrixValueColumns ?? [];
    const activeColumns = matrixValueColumns.filter(col =>
        data.some(row => typeof row[col] === 'number' || (typeof row[col] === 'string' && parseNumericValue(row[col]) !== 0)),
    );

    // Fall back to single-series line if no multi-series columns detected.
    if (activeColumns.length === 0) {
        const valueKey = plan.valueColumn || 'count';
        return {
            type: 'line',
            data: {
                labels: data.map(row => normalizeCategoryLabel(row[groupKey])),
                datasets: [{
                    label: valueKey,
                    data: data.map(row => parseNumericValue(row[valueKey])),
                    fill: false,
                    borderColor: COLORS[0],
                    pointBackgroundColor: COLORS[0],
                    pointRadius: 3,
                    tension: 0.1,
                }],
            },
            options: getCommonOptions(onElementClick, disableAnimation, showDataLabels),
        };
    }

    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const hasSelection = selectedIndices.length > 0;

    // Smart axis detection: when data rows (group values) < metric columns,
    // transpose so columns become X-axis labels and rows become series.
    // e.g., 2 brands × 4 quarters → quarters on X, brands as lines.
    const distinctGroups = data.length;
    const shouldTranspose = distinctGroups > 0 && distinctGroups < activeColumns.length;

    const buildDatasets = () => {
        if (shouldTranspose) {
            // Transposed: each data row becomes a series, columns become X-axis
            return data.map((row, index) => {
                const seriesLabel = normalizeCategoryLabel(row[groupKey]);
                const color = COLORS[index % COLORS.length];
                const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
                return {
                    label: seriesLabel,
                    data: activeColumns.map(col => {
                        return parseNumericValue(row[col]);
                    }),
                    fill: false,
                    borderColor: hasSelection ? `${color}33` : color,
                    backgroundColor: color,
                    pointBackgroundColor: color,
                    pointBorderColor: borderColor,
                    pointRadius: hasSelection ? 5 : 3,
                    pointHoverRadius: 7,
                    tension: 0.1,
                    borderWidth: 2,
                };
            });
        }
        // Default: group values on X-axis, columns as series
        return activeColumns.map((column, index) => {
            const color = COLORS[index % COLORS.length];
            const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
            return {
                label: column,
                data: data.map(row => {
                    return parseNumericValue(row[column]);
                }),
                fill: false,
                borderColor: hasSelection ? `${color}33` : color,
                backgroundColor: color,
                pointBackgroundColor: color,
                pointBorderColor: borderColor,
                pointRadius: hasSelection ? 5 : 3,
                pointHoverRadius: 7,
                tension: 0.1,
                borderWidth: 2,
            };
        });
    };

    const labels = shouldTranspose
        ? activeColumns.map(col => normalizeCategoryLabel(col))
        : data.map(row => normalizeCategoryLabel(row[groupKey]));

    return {
        type: 'line',
        data: {
            labels,
            datasets: buildDatasets(),
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                legend: { display: true, position: 'top' as const },
                tooltip: {
                    ...commonOptions.plugins?.tooltip,
                    callbacks: {
                        title: (items: any[]) => items[0]?.label ?? '',
                        label: (context: any) =>
                            `${context.dataset?.label ?? 'Value'}: ${formatAnalysisValue(context.raw)}`,
                    },
                },
                zoom: getZoomOptions(onZoomChange),
            },
            scales: {
                x: {
                    ticks: { color: '#64748b' },
                    grid: { display: false },
                },
                y: {
                    ticks: {
                        color: '#64748b',
                        callback: (value: number | string) => formatAxisValue(Number(value)),
                    },
                    grid: { color: '#e2e8f0' },
                },
            },
        },
    };
};
