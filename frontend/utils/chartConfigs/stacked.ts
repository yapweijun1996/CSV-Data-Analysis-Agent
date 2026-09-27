import { ChartConfigProps } from './types';
import { BORDER_COLORS, COLORS, getCommonOptions, getPivotTooltipCallbacks } from './common';
import { formatAnalysisValue, getBarChartReadabilityHints, normalizeCategoryLabel } from '../analysisCardPresentation';
import { PIVOT_FOLDED_OTHERS_KEY } from '../pivotMatrixCharting';

const DEFAULT_PIVOT_GROUP_KEY = 'row_label';
const DEFAULT_PIVOT_TOTAL_KEY = 'row_total';
const STACK_ID = 'pivot-matrix-stack';

// BUG-504: Use rgba() instead of appending hex alpha digits.
const getColorWithAlpha = (hexColor: string, alpha: number) => {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

export const createStackedChartConfig = ({ chartType, data, plan, selectedIndices, onElementClick, disableAnimation, showDataLabels }: ChartConfigProps): any => {
    const groupKey = plan.groupByColumn || DEFAULT_PIVOT_GROUP_KEY;
    const totalKey = plan.valueColumn || DEFAULT_PIVOT_TOTAL_KEY;
    const labels = data.map(row => normalizeCategoryLabel(row[groupKey]));
    const matrixValueColumns = plan.artifactMetadata?.matrixValueColumns ?? [];
    const activeColumns = matrixValueColumns.filter(column => data.some(row => typeof row[column] === 'number' || typeof row[column] === 'string'));
    const readabilityHints = getBarChartReadabilityHints(data, groupKey);
    const commonOptions = getCommonOptions(onElementClick, disableAnimation, showDataLabels);
    const pivotTooltipCallbacks = getPivotTooltipCallbacks(plan, data);
    const hasSelection = selectedIndices.length > 0;
    const isHorizontal = chartType === 'stacked_bar';
    const categoryTickCallback = function(this: any, value: number | string) {
        const label = this.getLabelForValue(Number(value));
        if (typeof label === 'string' && label.length > readabilityHints.categoryTickLimit) {
            return `${label.substring(0, readabilityHints.categoryTickLimit - 1)}…`;
        }
        return label;
    };

    return {
        type: 'bar',
        data: {
            labels,
            datasets: activeColumns.map((column, datasetIndex) => {
                const baseColor = COLORS[datasetIndex % COLORS.length];
                const baseBorderColor = BORDER_COLORS[datasetIndex % BORDER_COLORS.length];

                return {
                    label: column === PIVOT_FOLDED_OTHERS_KEY ? 'Others' : column,
                    data: data.map(row => row[column]),
                    stack: STACK_ID,
                    backgroundColor: hasSelection
                        ? data.map((_, rowIndex) => selectedIndices.includes(rowIndex) ? baseColor : getColorWithAlpha(baseColor, 0.15))
                        : baseColor,
                    borderColor: hasSelection
                        ? data.map((_, rowIndex) => selectedIndices.includes(rowIndex) ? baseBorderColor : getColorWithAlpha(baseColor, 0.4))
                        : baseBorderColor,
                    borderWidth: 1,
                };
            }),
        },
        options: {
            ...commonOptions,
            indexAxis: isHorizontal ? 'y' : 'x',
            plugins: {
                ...commonOptions.plugins,
                legend: { display: false },
                tooltip: {
                    ...commonOptions.plugins?.tooltip,
                    callbacks: pivotTooltipCallbacks ?? {
                        title: (items: any[]) => items[0]?.label ?? '',
                        label: (context: any) => `${context.dataset?.label ?? 'Value'}: ${formatAnalysisValue(context.raw)}`,
                        afterLabel: (context: any) => `Row total: ${formatAnalysisValue(data[context.dataIndex]?.[totalKey])}`,
                    },
                },
            },
            scales: isHorizontal
                ? {
                    x: {
                        stacked: true,
                        ticks: {
                            color: '#64748b',
                            callback: (value: number | string) => formatAnalysisValue(Number(value)),
                        },
                        grid: { color: '#e2e8f0' },
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            color: '#64748b',
                            callback: categoryTickCallback,
                        },
                        grid: { display: false },
                    },
                }
                : {
                    x: {
                        stacked: true,
                        ticks: {
                            color: '#64748b',
                            callback: categoryTickCallback,
                        },
                        grid: { display: false },
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            color: '#64748b',
                            callback: (value: number | string) => formatAnalysisValue(Number(value)),
                        },
                        grid: { color: '#e2e8f0' },
                    },
                },
        },
    };
};
