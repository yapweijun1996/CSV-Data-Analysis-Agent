import type { AnalysisPlan, CsvCellValue, CsvRow } from '../types';
import { buildColumnDisplayLabels, resolvePlanGroupLabel, resolvePlanMetricLabel } from '../services/dashboard/businessLabelResolver';
import { formatTemporalDisplayValue, isTemporalDisplayColumn } from './temporalDisplay';

const UNKNOWN_LABEL = 'Unknown';
const OTHERS_LABEL = 'Others';
const NUMBER_EPSILON = 1e-9;

const normalizeKey = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const normalizeCategoryLabel = (value: CsvCellValue): string => {
    if (value === null || value === undefined) {
        return UNKNOWN_LABEL;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return UNKNOWN_LABEL;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized === 'null' || normalized === 'undefined' || normalized === 'unknown') {
        return UNKNOWN_LABEL;
    }
    if (normalized === 'others' || normalized === 'other') {
        return OTHERS_LABEL;
    }

    return trimmed;
};

export const normalizeNumericValue = (value: number): number => (Math.abs(value) < NUMBER_EPSILON ? 0 : value);

export const coerceNumericValue = (value: CsvCellValue): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return normalizeNumericValue(value);
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return normalizeNumericValue(parsed);
        }
    }
    return null;
};

export const formatAnalysisValue = (value: CsvCellValue, maximumFractionDigits = 2): string => {
    const numericValue = coerceNumericValue(value);
    if (numericValue === null) {
        return normalizeCategoryLabel(value);
    }

    const normalizedValue = normalizeNumericValue(numericValue);
    const hasFraction = Math.abs(normalizedValue % 1) > NUMBER_EPSILON;

    return normalizedValue.toLocaleString(undefined, {
        minimumFractionDigits: hasFraction ? 0 : 0,
        maximumFractionDigits: hasFraction ? maximumFractionDigits : 0,
    });
};

/**
 * Format an aggregate measure for side-by-side comparison. Unlike general
 * display values, measures always keep a stable decimal scale.
 */
export const formatAnalysisMeasureValue = (value: CsvCellValue, fractionDigits = 2): string => {
    const numericValue = coerceNumericValue(value);
    if (numericValue === null) {
        return normalizeCategoryLabel(value);
    }

    return normalizeNumericValue(numericValue).toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
};

export const formatAnalysisCellValue = (
    columnName: string,
    value: CsvCellValue,
    maximumFractionDigits = 2,
): string => {
    const temporalDisplayValue = formatTemporalDisplayValue(columnName, value);
    if (temporalDisplayValue) {
        return temporalDisplayValue;
    }

    return formatAnalysisValue(value, maximumFractionDigits);
};

export const getNumericColumns = (rows: CsvRow[], headers: string[]): string[] =>
    headers.filter(header => !isTemporalDisplayColumn(header) && rows.some(row => coerceNumericValue(row[header]) !== null));

export const getAnalysisColumnLabels = (
    headers: string[],
    plan?: Pick<AnalysisPlan, 'title' | 'description' | 'groupByColumn' | 'valueColumn'>,
): Record<string, string> => {
    const fallbackLabels = buildColumnDisplayLabels(headers, plan ? [plan] : []);

    if (!plan) {
        return fallbackLabels;
    }

    const groupLabel = resolvePlanGroupLabel(plan);
    const metricLabel = resolvePlanMetricLabel(plan) ?? fallbackLabels[plan.valueColumn ?? ''] ?? 'Value';

    return Object.fromEntries(headers.map(header => {
        const normalized = normalizeKey(header);

        if (normalized === normalizeKey(plan.groupByColumn) || normalized === 'rowlabel') {
            return [header, groupLabel];
        }
        if (normalized === normalizeKey(plan.valueColumn) || normalized === 'value') {
            return [header, metricLabel];
        }
        if (normalized === 'rowtotal' || normalized === 'total') {
            return [header, `${metricLabel} Total`];
        }

        return [header, fallbackLabels[header] ?? header];
    }));
};

export interface PivotCardQualitySummary {
    totalRows: number;
    omittedRowCount: number;
    unknownCount: number;
    zeroCount: number;
    negativeCount: number;
    hiddenZeroRowCount: number;
    labelNormalizationAppliedColumns: number;
    labelNormalizationAppliedClusters: number;
    labelNormalizationAppliedReplacements: number;
    labelNormalizationDeferredSuggestions: number;
    recommendedTotalOnlyDueToWideColumns: boolean;
    defaultCompressedStackedView: boolean;
    effectiveMatrixValueColumnCount: number;
    visibleMatrixValueColumnCount: number;
    foldedMatrixValueColumnCount: number;
    isStackedChartActive: boolean;
}

export const getPivotCardQualitySummary = (
    rows: CsvRow[],
    groupByKey: string,
    valueKey: string,
    visibleRowCount: number,
): PivotCardQualitySummary | null => {
    if (!groupByKey || !valueKey || rows.length === 0) {
        return null;
    }

    let unknownCount = 0;
    let zeroCount = 0;
    let negativeCount = 0;

    rows.forEach(row => {
        if (normalizeCategoryLabel(row[groupByKey]) === UNKNOWN_LABEL) {
            unknownCount += 1;
        }

        const numericValue = coerceNumericValue(row[valueKey]);
        if (numericValue === null) {
            return;
        }

        if (numericValue === 0) {
            zeroCount += 1;
        } else if (numericValue < 0) {
            negativeCount += 1;
        }
    });

    return {
        totalRows: rows.length,
        omittedRowCount: Math.max(rows.length - visibleRowCount, 0),
        unknownCount,
        zeroCount,
        negativeCount,
        hiddenZeroRowCount: 0,
        labelNormalizationAppliedColumns: 0,
        labelNormalizationAppliedClusters: 0,
        labelNormalizationAppliedReplacements: 0,
        labelNormalizationDeferredSuggestions: 0,
        recommendedTotalOnlyDueToWideColumns: false,
        defaultCompressedStackedView: false,
        effectiveMatrixValueColumnCount: 0,
        visibleMatrixValueColumnCount: 0,
        foldedMatrixValueColumnCount: 0,
        isStackedChartActive: false,
    };
};

export interface BarChartReadabilityHints {
    useHorizontalLayout: boolean;
    suggestedHeight: number;
    categoryTickLimit: number;
}

export const getBarChartReadabilityHints = (
    data: CsvRow[],
    groupByKey?: string,
): BarChartReadabilityHints => {
    if (!groupByKey) {
        return {
            useHorizontalLayout: false,
            suggestedHeight: 256,
            categoryTickLimit: 24,
        };
    }

    const labels = data.map(row => normalizeCategoryLabel(row[groupByKey]));
    const longestLabel = labels.reduce((longest, label) => Math.max(longest, label.length), 0);
    const averageLabelLength = labels.length > 0
        ? labels.reduce((sum, label) => sum + label.length, 0) / labels.length
        : 0;
    const useHorizontalLayout = labels.length > 6 && (longestLabel > 18 || averageLabelLength > 14);
    const suggestedHeight = useHorizontalLayout
        ? Math.min(520, Math.max(320, labels.length * 44))
        : 256;

    return {
        useHorizontalLayout,
        suggestedHeight,
        categoryTickLimit: useHorizontalLayout ? 28 : 20,
    };
};
