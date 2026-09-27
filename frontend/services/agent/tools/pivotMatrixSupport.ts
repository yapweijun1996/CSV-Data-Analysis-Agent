import type { CsvData, CsvRow, QueryAggregateFunction } from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';

/** Normalize whitespace for fuzzy column name matching (collapse runs of spaces). */
const colKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Resolve a column name to its exact dataset equivalent by fuzzy whitespace matching.
 * Returns the exact column name if found, otherwise returns the original input unchanged.
 */
export const resolveColumnName = (name: string, availableColumns: string[]): string => {
    if (availableColumns.includes(name)) return name;
    const normalized = colKey(name);
    return availableColumns.find(col => colKey(col) === normalized) ?? name;
};

const NUMERIC_PIVOT_AGGREGATES: QueryAggregateFunction[] = ['sum', 'avg', 'min', 'max', 'median', 'percentile'];

export type PivotMatrixRepairHintCategory =
    | 'missing_pivot_rows'
    | 'invalid_pivot_dimension'
    | 'missing_pivot_aggregate'
    | 'missing_pivot_metric'
    | 'invalid_pivot_metric';

type PivotMatrixRepairRule = {
    category: PivotMatrixRepairHintCategory;
    match: (errorText: string) => boolean;
    hint: (errorText: string) => string;
};

const PIVOT_MATRIX_REPAIR_RULES: PivotMatrixRepairRule[] = [
    {
        category: 'missing_pivot_rows',
        match: errorText => /"rows" must include at least one row dimension\./i.test(errorText),
        hint: () => 'Repair analysis.pivot_matrix by setting rows to at least one real dataset column. A pivot matrix cannot be created without a row dimension.',
    },
    {
        category: 'invalid_pivot_dimension',
        match: errorText =>
            /"rows"\s+\('.*'\)\s+must reference one of/i.test(errorText)
            || /"columns"\s+\('.*'\)\s+must reference one of/i.test(errorText)
            || /Row dimension ".*" was not found in the current dataset\./i.test(errorText)
            || /Column dimension ".*" was not found in the current dataset\./i.test(errorText),
        hint: () => 'Repair analysis.pivot_matrix by using real dataset columns for rows and columns. Every pivot dimension must match a current dataset column exactly.',
    },
    {
        category: 'missing_pivot_aggregate',
        match: errorText => /"aggregate" is required\./i.test(errorText) || /pivot aggregate is required\./i.test(errorText),
        hint: () => 'Repair analysis.pivot_matrix by including aggregate explicitly. Required fields are rows, aggregate, title, and description. Use aggregate="count" for row counts, or use aggregate="sum" with metric="<numeric column>" for value pivots.',
    },
    {
        category: 'missing_pivot_metric',
        match: errorText => /Pivot\s+\w+\s+requires a metric column\./i.test(errorText),
        hint: errorText => {
            const aggregateMatch = errorText.match(/Pivot\s+(\w+)\s+requires a metric column\./i);
            const aggregate = aggregateMatch?.[1]?.trim() || 'the selected aggregate';
            return `Repair analysis.pivot_matrix by adding metric with a real dataset column. Aggregate "${aggregate}" requires metric; only aggregate="count" can omit metric.`;
        },
    },
    {
        category: 'invalid_pivot_metric',
        match: errorText =>
            /"metric"\s+\('.*'\)\s+must reference one of/i.test(errorText)
            || /Metric column ".*" was not found in the current dataset\./i.test(errorText)
            || /Metric column ".*" contains no numeric values/i.test(errorText),
        hint: () => 'Repair analysis.pivot_matrix by using a real metric column from the current dataset. For numeric aggregates such as sum or avg, the metric column must contain parseable numeric values.',
    },
];

export const pivotAggregateRequiresMetric = (aggregate: QueryAggregateFunction) => aggregate !== 'count';

export const pivotAggregateRequiresNumericMetric = (aggregate: QueryAggregateFunction) =>
    NUMERIC_PIVOT_AGGREGATES.includes(aggregate);

export const getPivotNumericValues = (rows: CsvRow[], metricColumn: string | undefined) => {
    if (!metricColumn) {
        return [];
    }

    return rows
        .map(row => robustParseFloat(row[metricColumn]))
        .filter((value): value is number => value !== null && Number.isFinite(value));
};

export const datasetHasColumn = (csvData: CsvData | null | undefined, columnName: string | undefined) => {
    if (!csvData || !columnName) {
        return false;
    }
    // Direct match first, then fuzzy whitespace-normalized match.
    if (csvData.data.some(row => Object.prototype.hasOwnProperty.call(row, columnName))) {
        return true;
    }
    const normalized = colKey(columnName);
    return csvData.data.some(row =>
        Object.keys(row).some(key => colKey(key) === normalized),
    );
};

export const datasetHasNumericMetricValues = (csvData: CsvData | null | undefined, metricColumn: string | undefined) =>
    getPivotNumericValues(csvData?.data ?? [], metricColumn).length > 0;

export const getPivotMatrixRepairGuidance = (
    errors: string | string[],
): {
    repairHint: string;
    repairHintCategory: PivotMatrixRepairHintCategory | null;
    repairHintCategories: PivotMatrixRepairHintCategory[];
} => {
    const errorList = Array.isArray(errors) ? errors : [errors];
    const repairMatches = errorList.flatMap(errorText =>
        PIVOT_MATRIX_REPAIR_RULES
            .filter(rule => rule.match(errorText))
            .map(rule => ({
                category: rule.category,
                hint: rule.hint(errorText),
            })),
    );
    const repairHintCategories = Array.from(new Set(repairMatches.map(match => match.category)));

    if (repairHintCategories.length === 0) {
        return {
            repairHint: 'Repair the malformed analysis.pivot_matrix payload. Include a real row dimension, an explicit aggregate, and a metric whenever the aggregate is not count.',
            repairHintCategory: null,
            repairHintCategories: [],
        };
    }

    return {
        repairHint: Array.from(new Set(repairMatches.map(match => match.hint))).join(' '),
        repairHintCategory: repairHintCategories[0] ?? null,
        repairHintCategories,
    };
};
