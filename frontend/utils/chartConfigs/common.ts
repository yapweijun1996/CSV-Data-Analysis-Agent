// Common constants and helper functions for chart configurations.
import { ChartConfigProps } from './types';
import { formatAnalysisMeasureValue, formatAnalysisValue, formatAxisValue } from '../analysisCardPresentation';
import { AnalysisPlan, CsvRow } from '../../types';

// Humanize a raw column name for display in tooltips.
// e.g. "total_value" → "Total Value", "TotalValue" → "Total Value"
const humanizeColumnName = (name: string): string =>
    name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();

export const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];

// BUG-504: Use rgba() instead of 8-digit hex (#RRGGBBAA) for wider compatibility
// with CSS parsers and older browser versions.
const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};
export const BORDER_COLORS = COLORS.map(c => hexToRgba(c, 0.7));
export const BG_COLORS = COLORS.map(c => hexToRgba(c, 0.5));

export const HIGHLIGHT_COLOR = '#3b82f6';
export const HIGHLIGHT_BORDER_COLOR = '#2563eb';
export const DESELECTED_COLOR = 'rgba(107, 114, 128, 0.2)';
export const DESELECTED_BORDER_COLOR = 'rgba(107, 114, 128, 0.5)';

export const getColors = (baseColors: string[], dataLength: number, selectedIndices: number[]): string[] => {
    const hasSelection = selectedIndices.length > 0;
    return hasSelection
        ? Array.from({ length: dataLength }, (_, i) => selectedIndices.includes(i) ? HIGHLIGHT_COLOR : DESELECTED_COLOR)
        : baseColors;
};

export const getBorderColors = (baseColors: string[], dataLength: number, selectedIndices: number[]): string[] => {
    const hasSelection = selectedIndices.length > 0;
    return hasSelection
        ? Array.from({ length: dataLength }, (_, i) => selectedIndices.includes(i) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR)
        : baseColors;
};

export const isChartZoomedOrPanned = (chart: any): boolean => {
    if (!chart || !chart.scales || !chart.scales.x) return false;
    const initialXScale = chart.getInitialScaleBounds().x;
    const currentXScale = { min: chart.scales.x.min, max: chart.scales.x.max };
    return initialXScale.min !== currentXScale.min || initialXScale.max !== currentXScale.max;
};

const humanizePivotField = (field: string) => {
    if (field === '__pivot_folded_others__') {
        return 'Others';
    }
    const normalized = field
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .trim();
    if (!normalized) return field;
    return normalized.replace(/\b\w/g, char => char.toUpperCase());
};

export const getPivotTooltipCallbacks = (plan: AnalysisPlan, data: CsvRow[]) => {
    if (plan.artifactType !== 'pivot_matrix' || data.length === 0) {
        return null;
    }

    const groupKey = plan.groupByColumn || 'row_label';
    const visibleColumns = plan.artifactMetadata?.visibleMatrixValueColumns?.length
        ? plan.artifactMetadata.visibleMatrixValueColumns
        : null;
    const foldedColumns = plan.artifactMetadata?.foldedMatrixValueColumns ?? [];
    const hiddenColumns = plan.artifactMetadata?.hiddenMatrixValueColumns ?? [];
    const preferredColumns = plan.artifactMetadata?.matrixColumns?.length
        ? plan.artifactMetadata.matrixColumns
        : [];
    const discoveredColumns = Object.keys(data[0] ?? {});
    const detailColumns = (
        visibleColumns
            ? [...visibleColumns, plan.valueColumn || 'row_total']
            : [...new Set([...preferredColumns, ...discoveredColumns])]
    ).filter(column => column !== groupKey);

    return {
        title: (items: any[]) => {
            const row = data[items[0]?.dataIndex ?? -1];
            return String(row?.[groupKey] ?? items[0]?.label ?? '');
        },
        label: (context: any) => {
            const datasetLabel = context.dataset?.label ? `${humanizePivotField(String(context.dataset.label))}: ` : '';
            return `${datasetLabel}${formatAnalysisValue(context.raw ?? context.parsed?.y ?? context.parsed?.x ?? context.parsed)}`;
        },
        afterBody: (items: any[]) => {
            const row = data[items[0]?.dataIndex ?? -1];
            if (!row) {
                return [];
            }
            const details = detailColumns.map(column => `${humanizePivotField(column)}: ${formatAnalysisValue(row[column])}`);
            if (foldedColumns.length > 0) {
                details.push(`${foldedColumns.length} more columns folded into Others`);
            }
            if (hiddenColumns.length > 0) {
                details.push(`Hidden series: ${hiddenColumns.map(humanizePivotField).join(', ')}`);
            }
            return details;
        },
    };
};

export const formatChartDataLabel = (value: unknown, chartWidth = Number.POSITIVE_INFINITY): string => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
        return formatAnalysisMeasureValue(value as number);
    }

    if (chartWidth >= 520) {
        return formatAnalysisMeasureValue(numericValue);
    }

    const absoluteValue = Math.abs(numericValue);
    const compactUnit = absoluteValue >= 1_000_000_000
        ? { divisor: 1_000_000_000, suffix: 'B' }
        : absoluteValue >= 1_000_000
            ? { divisor: 1_000_000, suffix: 'M' }
            : absoluteValue >= 1_000
                ? { divisor: 1_000, suffix: 'K' }
                : null;

    return compactUnit
        ? `${(numericValue / compactUnit.divisor).toFixed(2)}${compactUnit.suffix}`
        : formatAnalysisMeasureValue(numericValue);
};

export const getDataLabelsConfig = (showDataLabels?: boolean) => ({
    display: Boolean(showDataLabels),
    color: '#374151',
    font: { size: 11, weight: 'bold' as const },
    anchor: 'end' as const,
    align: 'end' as const,
    clamp: true,
    clip: false,
    formatter: (value: unknown, context: { chart?: { width?: number } }) => formatChartDataLabel(
        value,
        context.chart?.width,
    ),
});

export const getCommonOptions = (onElementClick: (index: number, event: MouseEvent) => void, disableAnimation?: boolean, showDataLabels?: boolean) => ({
    maintainAspectRatio: false,
    responsive: true,
    animation: disableAnimation ? { duration: 0 } : undefined,
    layout: {
        padding: showDataLabels ? { top: 28, right: 40, bottom: 18, left: 40 } : 0,
    },
    onClick: (event: MouseEvent, elements: any[]) => {
        if (elements.length > 0) {
            onElementClick(elements[0].index, event);
        }
    },
    plugins: {
        legend: { display: false },
        datalabels: getDataLabelsConfig(showDataLabels),
        tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#1e293b',
            bodyColor: '#475569',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            titleFont: { weight: 'bold' },
            bodyFont: { size: 13 },
            padding: 10,
            callbacks: {
                label: (context: any) => {
                    const rawLabel = context.dataset?.label ?? '';
                    const datasetLabel = rawLabel ? `${humanizeColumnName(rawLabel)}: ` : '';
                    // Use context.raw first — it always gives the actual data value
                    // regardless of axis orientation (horizontal bars have value on x, not y).
                    // context.parsed.y for horizontal bars returns the category index (0, 1, 2...)
                    // which is falsy for the first bar, making `parsed.y ?? parsed.x` wrong.
                    const value = context.raw ?? context.parsed?.y ?? context.parsed?.x ?? context.parsed;
                    return `${datasetLabel}${formatAnalysisValue(value)}`;
                },
            },
        },
    },
    scales: {
        x: {
            ticks: {
                color: '#64748b',
                callback: function(value: number | string) {
                    const label = this.getLabelForValue(Number(value));
                    if (typeof label === 'string' && label.length > 30) {
                        return label.substring(0, 27) + '...';
                    }
                    return label;
                }
            },
            grid: { color: '#e2e8f0' }
        },
        y: {
            ticks: {
                color: '#64748b',
                callback: (value: number | string) => formatAxisValue(Number(value)),
            },
            grid: { color: '#e2e8f0' }
        }
    }
});

export const getZoomOptions = (onZoomChange: (isZoomed: boolean) => void) => ({
    pan: {
        enabled: true,
        mode: 'xy',
        onPanComplete: ({ chart }: { chart: any }) => onZoomChange(isChartZoomedOrPanned(chart)),
    },
    zoom: {
        wheel: { enabled: false },
        pinch: { enabled: true },
        mode: 'xy',
        onZoomComplete: ({ chart }: { chart: any }) => onZoomChange(isChartZoomedOrPanned(chart)),
    }
});
