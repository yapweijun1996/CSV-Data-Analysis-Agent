import { AnalysisPlan, ChartType, CsvRow } from '../types';
import { DEFAULT_PIVOT_GROUP_KEY, getEffectivePivotMatrixValueColumns } from './pivotMatrixCharting';

const BASE_CHART_TYPES: ChartType[] = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'doughnut', 'polar_area', 'radar'];

// --- Smart chart recommendation based on data characteristics ---

export interface ChartRecommendationInput {
    rowCount: number;
    distinctGroupCount: number;
    hasNegativeValues: boolean;
    isTimeSeries: boolean;
    metricCount: number;
}

/**
 * Recommend the most suitable chart type based on data characteristics.
 * Pure function — no side effects, fully testable.
 *
 * Rules:
 *   combo:     2+ metrics, ≤12 groups, not time series
 *   line:      time series, ≤24 rows
 *   area:      time series, >24 rows (dense temporal data)
 *   doughnut:  2 groups OR 6–8 groups, no negatives
 *   pie:       3–5 groups, no negatives
 *   bar:       >8 groups, or any data with negative values, or fallback
 */
export const recommendChartType = (input: ChartRecommendationInput): ChartType => {
    const { rowCount, distinctGroupCount, hasNegativeValues, isTimeSeries, metricCount } = input;

    let result: ChartType;

    // Multi-line: 3+ metrics on shared Y-axis for direct comparison
    if (metricCount >= 3 && distinctGroupCount <= 12 && !isTimeSeries) {
        result = 'multi_line';
    // Combo: dual metrics with manageable group count
    } else if (metricCount >= 2 && distinctGroupCount <= 12 && !isTimeSeries) {
        result = 'combo';
    // Time series path
    } else if (isTimeSeries) {
        result = rowCount > 24 ? 'area' : 'line';
    // Negative values disqualify pie/doughnut/polar family
    } else if (hasNegativeValues) {
        result = 'bar';
    // Group-count-based selection (no negatives, not time series)
    } else if (distinctGroupCount === 2) {
        result = 'doughnut';
    } else if (distinctGroupCount >= 3 && distinctGroupCount <= 5) {
        result = 'pie';
    } else if (distinctGroupCount >= 6 && distinctGroupCount <= 8) {
        result = 'doughnut';
    // >8 groups or fallback
    } else {
        result = 'bar';
    }

    return result;
};
const STACKED_PIVOT_CHART_TYPES: ChartType[] = ['stacked_bar', 'stacked_column', 'bar', 'line'];
const MAX_PIVOT_PIE_ROWS = 8;
const MAX_PIVOT_RADAR_ROWS = 6;

const addUnique = (list: ChartType[], type: ChartType) => {
    if (!list.includes(type)) {
        list.push(type);
    }
};

const getNumericValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

export const getPivotMatrixValueColumns = (plan: AnalysisPlan, rows: CsvRow[] = []): string[] => {
    return getEffectivePivotMatrixValueColumns(plan, rows);
};

const getRowOnlyPivotChartTypes = (plan: AnalysisPlan, rows: CsvRow[]): ChartType[] => {
    const types: ChartType[] = ['bar'];
    const valueKey = plan.valueColumn;
    if (!valueKey || rows.length === 0) {
        return types;
    }

    const numericValues = rows
        .map(row => getNumericValue(row[valueKey]))
        .filter((value): value is number => value !== null);
    const hasNegativeValue = numericValues.some(value => value < 0);
    const rowCount = rows.length;

    if (rowCount >= 2) {
        addUnique(types, 'line');
    }
    if (!hasNegativeValue && rowCount >= 2 && rowCount <= MAX_PIVOT_PIE_ROWS) {
        addUnique(types, 'pie');
        addUnique(types, 'doughnut');
    }
    if (!hasNegativeValue && rowCount >= 3 && rowCount <= MAX_PIVOT_RADAR_ROWS) {
        addUnique(types, 'radar');
    }

    return types;
};

export const getRecommendedPivotChartType = (plan: AnalysisPlan, rows: CsvRow[] = []): ChartType => {
    if (plan.artifactType !== 'pivot_matrix') {
        return plan.chartType || 'bar';
    }

    const matrixValueColumns = getPivotMatrixValueColumns(plan, rows);
    if (matrixValueColumns.length <= 1) {
        return 'bar';
    }

    const groupKey = plan.groupByColumn || DEFAULT_PIVOT_GROUP_KEY;
    const labels = rows
        .map(row => String(row[groupKey] ?? 'Unknown').trim())
        .filter(Boolean);
    const longestLabel = labels.reduce((longest, label) => Math.max(longest, label.length), 0);
    const averageLabelLength = labels.length > 0
        ? labels.reduce((sum, label) => sum + label.length, 0) / labels.length
        : 0;

    return rows.length > 6 || longestLabel > 18 || averageLabelLength > 14
        ? 'stacked_bar'
        : 'stacked_column';
};

export const getAvailableChartTypes = (plan?: AnalysisPlan | null, rows: CsvRow[] = []): ChartType[] => {
    if (!plan) {
        return ['bar'];
    }

    const types: ChartType[] = [];
    const preferred = plan.chartType || 'bar';
    const sourceTypes = plan.artifactType === 'pivot_matrix'
        ? (
            getPivotMatrixValueColumns(plan, rows).length > 1
                ? STACKED_PIVOT_CHART_TYPES
                : getRowOnlyPivotChartTypes(plan, rows)
        )
        : null;

    if (sourceTypes) {
        if (sourceTypes.includes(preferred)) {
            addUnique(types, preferred);
        }
        sourceTypes.forEach(type => addUnique(types, type));
        return types;
    }

    addUnique(types, preferred);

    const hasGroup = Boolean(plan.groupByColumn);
    const hasPrimaryMetric = Boolean(plan.valueColumn) || plan.aggregation === 'count';
    const hasSecondaryMetric = Boolean(plan.secondaryValueColumn && plan.secondaryAggregation);
    const hasXYAxes = Boolean(plan.xValueColumn && plan.yValueColumn);
    const hasBubbleRadius = hasXYAxes && Boolean(plan.valueColumn);

    if (hasGroup && hasPrimaryMetric) {
        BASE_CHART_TYPES.forEach(type => addUnique(types, type));
        if (hasSecondaryMetric) {
            addUnique(types, 'combo');
        }
        // Multi-line available when card has multi-series value columns.
        if (plan.artifactMetadata?.matrixValueColumns && plan.artifactMetadata.matrixValueColumns.length >= 3) {
            addUnique(types, 'multi_line');
        }
    }

    if (hasXYAxes) {
        addUnique(types, 'scatter');
    }

    if (hasBubbleRadius) {
        addUnique(types, 'bubble');
    }

    return types;
};
