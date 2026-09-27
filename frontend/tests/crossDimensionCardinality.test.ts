// @vitest-environment node

/**
 * Tests for computeCrossDimensionCardinality (cross-dim cardinality check in the harness).
 *
 * The function is a pure computation over ColumnProfile arrays — no SQL or mocks needed.
 * It computes the cardinality product for every pair of eligible categorical columns and
 * flags combinations where the product exceeds 100 as pivot-only.
 */

import { describe, expect, it } from 'vitest';
import { computeCrossDimensionCardinality } from '../services/agent/runtime/dataInvestigationHarness';
import type { ColumnProfile } from '../types';

const makeCol = (name: string, uniqueValues: number): ColumnProfile => ({
    name,
    type: 'categorical',
    uniqueValues,
});

const makeNumCol = (name: string): ColumnProfile => ({
    name,
    type: 'numerical',
    uniqueValues: 100,
});

describe('computeCrossDimensionCardinality', () => {
    // -----------------------------------------------------------------------
    // Guard / null cases
    // -----------------------------------------------------------------------

    it('returns empty array when fewer than 2 categorical columns', () => {
        expect(computeCrossDimensionCardinality([])).toEqual([]);
        expect(computeCrossDimensionCardinality([makeCol('Region', 5)])).toEqual([]);
    });

    it('returns empty array when only non-categorical columns exist', () => {
        const cols = [makeNumCol('Revenue'), makeNumCol('Cost')];
        expect(computeCrossDimensionCardinality(cols)).toEqual([]);
    });

    it('returns empty array when all categorical columns are blocked', () => {
        const cols = [makeCol('Region', 5), makeCol('Product', 20)];
        expect(computeCrossDimensionCardinality(cols, ['Region', 'Product'])).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Basic pairing
    // -----------------------------------------------------------------------

    it('produces one pair for exactly two categorical columns', () => {
        const cols = [makeCol('Region', 5), makeCol('Product', 20)];
        const result = computeCrossDimensionCardinality(cols);
        expect(result).toHaveLength(1);
        expect(result[0].dimA).toBe('Region');
        expect(result[0].dimB).toBe('Product');
        expect(result[0].product).toBe(100); // 5 × 20
    });

    it('produces three pairs for three categorical columns', () => {
        const cols = [makeCol('Region', 5), makeCol('Product', 20), makeCol('Customer', 10)];
        const result = computeCrossDimensionCardinality(cols);
        expect(result).toHaveLength(3);
    });

    // -----------------------------------------------------------------------
    // Threshold: product > 100 → recommendPivotOnly
    // -----------------------------------------------------------------------

    it('sets recommendPivotOnly=false when product <= 100', () => {
        // 5 × 20 = 100 → NOT pivot-only (boundary: > 100, not >= 100)
        const cols = [makeCol('Region', 5), makeCol('Product', 20)];
        const result = computeCrossDimensionCardinality(cols);
        expect(result[0].product).toBe(100);
        expect(result[0].recommendPivotOnly).toBe(false);
    });

    it('sets recommendPivotOnly=true when product > 100', () => {
        // 5 × 21 = 105 → pivot-only
        const cols = [makeCol('Region', 5), makeCol('Product', 21)];
        const result = computeCrossDimensionCardinality(cols);
        expect(result[0].product).toBe(105);
        expect(result[0].recommendPivotOnly).toBe(true);
    });

    it('correctly identifies Pareto-style high cardinality (Region × Customer)', () => {
        // 5 × 200 = 1000 → definitely pivot-only
        const cols = [makeCol('Region', 5), makeCol('Customer', 200)];
        const result = computeCrossDimensionCardinality(cols);
        expect(result[0].recommendPivotOnly).toBe(true);
        expect(result[0].product).toBe(1000);
    });

    it('correctly identifies low cardinality pair as not pivot-only', () => {
        // 3 × 4 = 12 → flat bar acceptable
        const cols = [makeCol('QuarterA', 3), makeCol('CategoryB', 4)];
        const result = computeCrossDimensionCardinality(cols);
        expect(result[0].product).toBe(12);
        expect(result[0].recommendPivotOnly).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Sorting: highest product first
    // -----------------------------------------------------------------------

    it('sorts results by product descending', () => {
        const cols = [
            makeCol('A', 2),
            makeCol('B', 50),
            makeCol('C', 10),
        ];
        const result = computeCrossDimensionCardinality(cols);
        // Products: A×B=100, A×C=20, B×C=500
        expect(result[0].product).toBeGreaterThanOrEqual(result[1].product);
        expect(result[1].product).toBeGreaterThanOrEqual(result[2].product);
        // Largest pair should be B×C = 500
        expect(result[0].product).toBe(500);
    });

    // -----------------------------------------------------------------------
    // Blocked dimensions excluded
    // -----------------------------------------------------------------------

    it('excludes blocked dimensions from computation', () => {
        const cols = [makeCol('Region', 5), makeCol('Product', 30), makeCol('Status', 3)];
        // Block Product — should only see Region × Status
        const result = computeCrossDimensionCardinality(cols, ['Product']);
        expect(result).toHaveLength(1);
        expect(result[0].dimA).toBe('Region');
        expect(result[0].dimB).toBe('Status');
        expect(result[0].product).toBe(15);
    });

    // -----------------------------------------------------------------------
    // Max results cap
    // -----------------------------------------------------------------------

    it('caps results at 10 pairs', () => {
        // 6 columns → 15 pairs, should be capped at 10
        const cols = Array.from({ length: 6 }, (_, i) => makeCol(`Dim${i}`, i + 2));
        const result = computeCrossDimensionCardinality(cols);
        expect(result.length).toBeLessThanOrEqual(10);
    });

    // -----------------------------------------------------------------------
    // Mixed types: numeric columns excluded
    // -----------------------------------------------------------------------

    it('ignores numerical columns', () => {
        const cols = [
            makeCol('Region', 5),
            makeNumCol('Revenue'),
            makeCol('Product', 20),
        ];
        const result = computeCrossDimensionCardinality(cols);
        expect(result).toHaveLength(1);
        // Only Region × Product (Revenue is numeric, excluded)
        expect([result[0].dimA, result[0].dimB]).toContain('Region');
        expect([result[0].dimA, result[0].dimB]).toContain('Product');
    });

    // -----------------------------------------------------------------------
    // Columns with uniqueValues <= 1 excluded (degenerate)
    // -----------------------------------------------------------------------

    it('excludes columns with uniqueValues <= 1', () => {
        const cols = [
            makeCol('Region', 5),
            { name: 'Degenerate', type: 'categorical' as const, uniqueValues: 1 },
            makeCol('Product', 10),
        ];
        const result = computeCrossDimensionCardinality(cols);
        // Degenerate should be excluded; only Region × Product
        expect(result).toHaveLength(1);
        expect([result[0].dimA, result[0].dimB]).not.toContain('Degenerate');
    });
});
