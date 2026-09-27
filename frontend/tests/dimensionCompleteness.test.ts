// @vitest-environment node

/**
 * Tests for computeDimensionCompleteness (data quality check in the harness).
 *
 * The function is a pure computation over ColumnProfile arrays — no SQL or mocks needed.
 * It uses ColumnProfile.missingPercentage (already computed by the profiler) to derive
 * completenessRate for each candidate groupBy column.
 */

import { describe, expect, it } from 'vitest';
import { computeDimensionCompleteness } from '../services/agent/runtime/dataInvestigationHarness';
import type { ColumnProfile } from '../types';

const makeCol = (
    name: string,
    type: ColumnProfile['type'],
    missingPercentage?: number,
): ColumnProfile => ({ name, type, missingPercentage });

describe('computeDimensionCompleteness', () => {
    // -----------------------------------------------------------------------
    // Guard / empty cases
    // -----------------------------------------------------------------------

    it('returns empty array when no categorical/date/time columns', () => {
        const cols = [
            makeCol('Revenue', 'numerical'),
            makeCol('Cost', 'currency'),
        ];
        expect(computeDimensionCompleteness(cols)).toEqual([]);
    });

    it('returns empty array when all dimension columns are blocked', () => {
        const cols = [makeCol('Region', 'categorical', 5), makeCol('Month', 'date', 0)];
        expect(computeDimensionCompleteness(cols, ['Region', 'Month'])).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Completeness rate calculation
    // -----------------------------------------------------------------------

    it('computes completenessRate as 1 - (missingPercentage / 100)', () => {
        const cols = [makeCol('Region', 'categorical', 20)];
        const result = computeDimensionCompleteness(cols);
        expect(result).toHaveLength(1);
        expect(result[0].completenessRate).toBeCloseTo(0.8, 5);
    });

    it('returns completenessRate = 1.0 when missingPercentage is undefined', () => {
        const cols = [makeCol('Region', 'categorical')];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].completenessRate).toBe(1.0);
    });

    it('returns completenessRate = 1.0 when missingPercentage is 0', () => {
        const cols = [makeCol('Region', 'categorical', 0)];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].completenessRate).toBe(1.0);
    });

    it('clamps completenessRate to [0, 1]', () => {
        // Guard against profiler returning values > 100 (should not happen but defensive)
        const cols = [makeCol('Broken', 'categorical', 150)];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].completenessRate).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Deprioritize threshold: < 70% completeness
    // -----------------------------------------------------------------------

    it('sets deprioritize=false when completenessRate >= 0.70', () => {
        // exactly 70% → NOT deprioritized (threshold is strictly < 0.70)
        const cols = [makeCol('Region', 'categorical', 30)]; // 30% missing → 70% complete
        const result = computeDimensionCompleteness(cols);
        expect(result[0].completenessRate).toBeCloseTo(0.70, 5);
        expect(result[0].deprioritize).toBe(false);
    });

    it('sets deprioritize=true when completenessRate < 0.70', () => {
        // 31% missing → 69% complete → deprioritize
        const cols = [makeCol('Region', 'categorical', 31)];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].completenessRate).toBeCloseTo(0.69, 5);
        expect(result[0].deprioritize).toBe(true);
    });

    it('deprioritizes column with 50% missing data', () => {
        const cols = [makeCol('Status', 'categorical', 50)];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].deprioritize).toBe(true);
    });

    it('does NOT deprioritize column with 5% missing data', () => {
        const cols = [makeCol('Region', 'categorical', 5)];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].deprioritize).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Column type filtering
    // -----------------------------------------------------------------------

    it('includes categorical, date, and time columns', () => {
        const cols = [
            makeCol('Region', 'categorical', 0),
            makeCol('Date', 'date', 0),
            makeCol('Time', 'time', 0),
            makeCol('Revenue', 'numerical', 0), // excluded
            makeCol('Rate', 'percentage', 0),   // excluded
        ];
        const result = computeDimensionCompleteness(cols);
        expect(result).toHaveLength(3);
        expect(result.map(r => r.column)).toContain('Region');
        expect(result.map(r => r.column)).toContain('Date');
        expect(result.map(r => r.column)).toContain('Time');
    });

    // -----------------------------------------------------------------------
    // Sorting: lowest completeness first
    // -----------------------------------------------------------------------

    it('returns results sorted by completenessRate ascending (worst first)', () => {
        const cols = [
            makeCol('A', 'categorical', 5),  // 95% complete
            makeCol('B', 'categorical', 60), // 40% complete — worst
            makeCol('C', 'categorical', 20), // 80% complete
        ];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].column).toBe('B'); // worst first
        expect(result[1].column).toBe('C');
        expect(result[2].column).toBe('A'); // best last
    });

    // -----------------------------------------------------------------------
    // Blocked dimensions excluded
    // -----------------------------------------------------------------------

    it('excludes blocked dimensions', () => {
        const cols = [
            makeCol('Region', 'categorical', 10),
            makeCol('Status', 'categorical', 50),
        ];
        const result = computeDimensionCompleteness(cols, ['Status']);
        expect(result).toHaveLength(1);
        expect(result[0].column).toBe('Region');
    });

    // -----------------------------------------------------------------------
    // Column name preserved
    // -----------------------------------------------------------------------

    it('preserves the column name in the result', () => {
        const cols = [makeCol('TransactionDate', 'date', 15)];
        const result = computeDimensionCompleteness(cols);
        expect(result[0].column).toBe('TransactionDate');
    });

    // -----------------------------------------------------------------------
    // Full scenario: mixed columns
    // -----------------------------------------------------------------------

    it('handles a realistic mixed-column dataset correctly', () => {
        const cols = [
            makeCol('Region', 'categorical', 2),    // 98% → keep
            makeCol('Product', 'categorical', 0),   // 100% → keep
            makeCol('Status', 'categorical', 40),   // 60% → deprioritize
            makeCol('ReportDate', 'date', 0),        // 100% → keep
            makeCol('Revenue', 'currency', 0),       // metric, excluded
        ];
        const result = computeDimensionCompleteness(cols);
        expect(result).toHaveLength(4);  // 3 categorical + 1 date, no metric

        const status = result.find(r => r.column === 'Status')!;
        expect(status.deprioritize).toBe(true);
        expect(status.completenessRate).toBeCloseTo(0.6, 5);

        const region = result.find(r => r.column === 'Region')!;
        expect(region.deprioritize).toBe(false);
        expect(region.completenessRate).toBeCloseTo(0.98, 5);
    });
});
