/**
 * Presentation harness — deterministic detection of multi-series rendering opportunities.
 *
 * When card data has 3+ numeric columns but the plan only specifies one valueColumn,
 * this module detects the opportunity and returns the columns for multi-series rendering.
 *
 * Pure function, no side effects, independently testable.
 */

import type { AnalysisPlan, CsvRow } from '../types';

/** Minimum number of numeric columns to trigger multi-series upgrade. */
export const MIN_MULTI_SERIES_COLUMNS = 3;

/** Detect numeric columns in aggregated data, excluding the group-by dimension. */
const detectNumericColumns = (data: CsvRow[], groupByColumn: string | undefined): string[] => {
    if (data.length === 0) return [];
    const firstRow = data[0];
    const candidates = Object.keys(firstRow).filter(key => {
        if (key === groupByColumn) return false;
        // Check if majority of rows have numeric values for this column.
        const numericCount = data.filter(row => {
            const v = row[key];
            return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
        }).length;
        return numericCount >= Math.ceil(data.length * 0.5);
    });
    return candidates;
};

/**
 * Detect if a single-series chart should be upgraded to multi_line.
 *
 * Returns the numeric columns for multi-series rendering, or null if no upgrade needed.
 */
export const detectMultiSeriesOpportunity = (
    plan: AnalysisPlan,
    data: CsvRow[],
): { numericColumns: string[] } | null => {
    // Skip if already configured for multi-series rendering.
    if (plan.artifactMetadata?.matrixValueColumns?.length) return null;
    if (plan.artifactType === 'pivot_matrix') return null;

    const numericColumns = detectNumericColumns(data, plan.groupByColumn);
    if (numericColumns.length < MIN_MULTI_SERIES_COLUMNS) return null;

    return { numericColumns };
};
