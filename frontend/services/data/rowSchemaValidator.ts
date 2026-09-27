import type { CsvRow } from '../../types';

/**
 * Post-parse schema validation for CSV rows.
 *
 * After CSV parsing, rows should have consistent key sets matching the header.
 * Ragged CSVs (malformed exports, copy-paste artifacts, ERP edge cases) can
 * produce rows with extra or missing keys. If >20% of rows are ragged, silently
 * proceeding into profiling and SQL execution can produce silent column drift.
 *
 * This module:
 *  1. Checks that every row has exactly the expected keys.
 *  2. If >MISMATCH_THRESHOLD rows are ragged, normalizes all rows by filling
 *     missing keys with null and truncating extra keys.
 *  3. Returns diagnostic issues for both cases so callers can emit warnings.
 */

export const ROW_SCHEMA_MISMATCH_THRESHOLD = 0.20;

export interface RowSchemaValidationResult {
    normalizedRows: CsvRow[];
    expectedKeys: string[];
    mismatchCount: number;
    totalCount: number;
    mismatchRatio: number;
    wasNormalized: boolean;
    issues: string[];
}

/**
 * Returns true if the row's key set exactly matches `expectedSet` with no
 * extras or gaps.
 */
const isRowConsistent = (row: CsvRow, expectedKeys: string[], expectedSet: Set<string>): boolean => {
    const rowKeys = Object.keys(row);
    if (rowKeys.length !== expectedKeys.length) return false;
    return rowKeys.every(k => expectedSet.has(k));
};

/**
 * Normalizes a single row to exactly `expectedKeys`:
 *  - Missing keys → filled with null
 *  - Extra keys → dropped
 */
const normalizeRow = (row: CsvRow, expectedKeys: string[]): CsvRow => {
    const normalized: CsvRow = {};
    for (const key of expectedKeys) {
        normalized[key] = key in row ? row[key] : null;
    }
    return normalized;
};

/**
 * Validates that all rows in `rows` have consistent key sets.
 *
 * @param rows   - The parsed CSV rows to validate.
 * @param expectedKeys - Optional explicit expected keys; defaults to keys of
 *                       the first row. If the array is empty, returns a
 *                       no-op result.
 * @returns RowSchemaValidationResult with normalization applied when needed.
 */
export const validateRowSchema = (
    rows: CsvRow[],
    expectedKeys?: string[],
): RowSchemaValidationResult => {
    if (rows.length === 0) {
        return {
            normalizedRows: [],
            expectedKeys: expectedKeys ?? [],
            mismatchCount: 0,
            totalCount: 0,
            mismatchRatio: 0,
            wasNormalized: false,
            issues: [],
        };
    }

    const keys = expectedKeys ?? Object.keys(rows[0]);
    if (keys.length === 0) {
        return {
            normalizedRows: rows,
            expectedKeys: keys,
            mismatchCount: 0,
            totalCount: rows.length,
            mismatchRatio: 0,
            wasNormalized: false,
            issues: [],
        };
    }

    const expectedSet = new Set(keys);
    let mismatchCount = 0;
    for (const row of rows) {
        if (!isRowConsistent(row, keys, expectedSet)) {
            mismatchCount += 1;
        }
    }

    const mismatchRatio = mismatchCount / rows.length;
    const issues: string[] = [];

    if (mismatchCount === 0) {
        return {
            normalizedRows: rows,
            expectedKeys: keys,
            mismatchCount: 0,
            totalCount: rows.length,
            mismatchRatio: 0,
            wasNormalized: false,
            issues: [],
        };
    }

    const pct = Math.round(mismatchRatio * 100);
    issues.push(
        `${mismatchCount} of ${rows.length} rows have inconsistent key sets (${pct}% mismatch).`,
    );

    if (mismatchRatio > ROW_SCHEMA_MISMATCH_THRESHOLD) {
        const normalizedRows = rows.map(row => normalizeRow(row, keys));
        issues.push(
            `Row normalization applied: missing keys filled with null, extra keys dropped.`,
        );
        return {
            normalizedRows,
            expectedKeys: keys,
            mismatchCount,
            totalCount: rows.length,
            mismatchRatio,
            wasNormalized: true,
            issues,
        };
    }

    return {
        normalizedRows: rows,
        expectedKeys: keys,
        mismatchCount,
        totalCount: rows.length,
        mismatchRatio,
        wasNormalized: false,
        issues,
    };
};
