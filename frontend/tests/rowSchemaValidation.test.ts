// @vitest-environment node

/**
 * P0 Anti-Survivorship Resilience: Post-parse schema validation
 *
 * Verifies that validateRowSchema():
 *  1. Detects ragged CSV rows (rows with mismatched key sets)
 *  2. Normalizes rows when >20% have schema mismatches
 *  3. Does NOT normalize when mismatch ratio is <= 20%
 *  4. Reports diagnostic issues in both cases
 *  5. Is a no-op for empty input or perfectly consistent rows
 */

import { describe, expect, it } from 'vitest';
import {
    validateRowSchema,
    ROW_SCHEMA_MISMATCH_THRESHOLD,
} from '../services/data/rowSchemaValidator';
import type { CsvRow } from '../types';

// --- Fixtures ---

const makeConsistentRows = (count: number): CsvRow[] =>
    Array.from({ length: count }, (_, i) => ({
        Department: `Dept ${i}`,
        Revenue: 1000 + i,
        Cost: 500 + i,
    }));

const makeRaggedRows = (totalCount: number, raggedCount: number): CsvRow[] => {
    const rows: CsvRow[] = [];
    for (let i = 0; i < totalCount; i++) {
        if (i < totalCount - raggedCount) {
            rows.push({ Department: `Dept ${i}`, Revenue: 1000 + i, Cost: 500 + i });
        } else {
            // Ragged: missing 'Cost' key
            rows.push({ Department: `Dept ${i}`, Revenue: 1000 + i });
        }
    }
    return rows;
};

describe('validateRowSchema', () => {
    it('returns no-op result for empty input', () => {
        const result = validateRowSchema([]);
        expect(result.normalizedRows).toEqual([]);
        expect(result.mismatchCount).toBe(0);
        expect(result.wasNormalized).toBe(false);
        expect(result.issues).toHaveLength(0);
    });

    it('returns no-op result for perfectly consistent rows', () => {
        const rows = makeConsistentRows(10);
        const result = validateRowSchema(rows);
        expect(result.mismatchCount).toBe(0);
        expect(result.mismatchRatio).toBe(0);
        expect(result.wasNormalized).toBe(false);
        expect(result.issues).toHaveLength(0);
        // Original rows reference preserved (no unnecessary copy)
        expect(result.normalizedRows).toBe(rows);
    });

    it('detects ragged rows above the threshold and normalizes', () => {
        // 5 ragged out of 10 = 50% > 20% threshold → should normalize
        const rows = makeRaggedRows(10, 5);
        const result = validateRowSchema(rows);

        expect(result.mismatchCount).toBe(5);
        expect(result.mismatchRatio).toBeCloseTo(0.5);
        expect(result.wasNormalized).toBe(true);

        // All normalized rows must have the expected keys
        const expectedKeys = result.expectedKeys;
        for (const row of result.normalizedRows) {
            expect(Object.keys(row).sort()).toEqual([...expectedKeys].sort());
        }

        // Ragged rows must have missing keys filled with null
        const lastFive = result.normalizedRows.slice(5);
        for (const row of lastFive) {
            expect(row.Cost).toBeNull();
        }

        // Issues must mention mismatch count and normalization
        expect(result.issues.length).toBeGreaterThanOrEqual(2);
        expect(result.issues[0]).toContain('5 of 10');
        expect(result.issues[1]).toContain('normalization applied');
    });

    it('detects ragged rows below the threshold without normalizing', () => {
        // 1 ragged out of 10 = 10% < 20% threshold → warn only, no normalization
        const rows = makeRaggedRows(10, 1);
        const result = validateRowSchema(rows);

        expect(result.mismatchCount).toBe(1);
        expect(result.mismatchRatio).toBeCloseTo(0.1);
        expect(result.wasNormalized).toBe(false);

        // Original rows preserved unchanged
        expect(result.normalizedRows).toBe(rows);

        // Issue reported but no normalization message
        expect(result.issues.length).toBe(1);
        expect(result.issues[0]).toContain('1 of 10');
    });

    it('normalizes at exactly the threshold boundary (>20% means 21% triggers, 20% does not)', () => {
        // 20 ragged out of 100 = exactly 20% → NOT normalized (threshold is >20%)
        const rows = makeRaggedRows(100, 20);
        const result = validateRowSchema(rows);
        expect(result.wasNormalized).toBe(false);
        expect(result.mismatchCount).toBe(20);

        // 21 ragged out of 100 = 21% → normalized
        const rows21 = makeRaggedRows(100, 21);
        const result21 = validateRowSchema(rows21);
        expect(result21.wasNormalized).toBe(true);
        expect(result21.mismatchCount).toBe(21);
    });

    it('handles rows with EXTRA keys (not just missing keys)', () => {
        const expectedRow = { Department: 'Sales', Revenue: 1000 };
        const extraRow = { Department: 'Marketing', Revenue: 500, ExtraColumn: 'unexpected' };
        // 1 extra out of 2 = 50% > threshold
        const rows: CsvRow[] = [expectedRow, extraRow];

        const result = validateRowSchema(rows);
        expect(result.mismatchCount).toBe(1);
        expect(result.wasNormalized).toBe(true);

        // Normalized rows should only have expected keys (from first row)
        for (const row of result.normalizedRows) {
            expect(Object.keys(row)).toEqual(['Department', 'Revenue']);
            expect('ExtraColumn' in row).toBe(false);
        }
    });

    it('respects explicitly provided expectedKeys', () => {
        // First row is ragged, but we provide explicit expected keys
        const rows: CsvRow[] = [
            { Department: 'Sales' },  // missing Revenue
            { Department: 'Marketing', Revenue: 500 },
        ];
        const result = validateRowSchema(rows, ['Department', 'Revenue']);
        expect(result.expectedKeys).toEqual(['Department', 'Revenue']);
        expect(result.mismatchCount).toBe(1);
        expect(result.wasNormalized).toBe(true);
        expect(result.normalizedRows[0].Revenue).toBeNull();
    });

    it('exports ROW_SCHEMA_MISMATCH_THRESHOLD as 0.20', () => {
        expect(ROW_SCHEMA_MISMATCH_THRESHOLD).toBe(0.20);
    });
});
