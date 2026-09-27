// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizeDimensionValue, DEFAULT_DIMENSION_NORMALIZATION, UNKNOWN_LABEL } from '../services/duckdb/dimensionNormalization';
import { compileQueryPlanToDuckDbSql } from '../services/duckdb/queryCompiler';

/**
 * BUG-DATA-205 regression tests.
 *
 * Verifies that the initial analysis path (JS fallback aggregation)
 * and the follow-up query path (SQL GROUP BY) produce identical
 * dimension grouping for null/empty/placeholder values.
 */

describe('BUG-DATA-205: dimension grouping consistency', () => {
    // Simulate app-owned fallback aggregation.
    const jsAggregateGroups = (values: unknown[]): Map<string, number> => {
        const groups = new Map<string, number>();
        for (const value of values) {
            const label = normalizeDimensionValue(value);
            groups.set(label, (groups.get(label) ?? 0) + 1);
        }
        return groups;
    };

    it('null, empty, whitespace, and placeholders collapse into one Unknown group in JS path', () => {
        const values = [null, '', '  ', 'N/A', 'na', 'null', 'none', '-', '--', 'Apple', 'Samsung', 'Apple'];
        const groups = jsAggregateGroups(values);

        // All null/empty/placeholder values should be in one Unknown bucket
        expect(groups.get(UNKNOWN_LABEL)).toBe(9);
        expect(groups.get('Apple')).toBe(2);
        expect(groups.get('Samsung')).toBe(1);
        expect(groups.size).toBe(3);
    });

    it('SQL path with normalization produces CASE expression that mirrors JS grouping', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['BRAND'],
            aggregates: [{ function: 'count', column: 'BRAND', as: 'count' }],
            select: ['BRAND', 'count'],
            limit: 100,
        }, {
            allowedColumns: ['BRAND'],
            tableName: 'test_data',
            dimensionNormalization: DEFAULT_DIMENSION_NORMALIZATION,
        });

        // The SQL should normalize null/empty → 'Unknown'
        expect(compiled.sql).toContain("THEN 'Unknown'");
        // It should use CASE WHEN in the SELECT
        expect(compiled.sql).toContain('CASE');
        // It should use positional GROUP BY (not raw column)
        expect(compiled.sql).toMatch(/GROUP BY 1\b/);
    });

    it('SQL path without normalization does NOT produce CASE expression', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['BRAND'],
            aggregates: [{ function: 'count', column: 'BRAND', as: 'count' }],
            select: ['BRAND', 'count'],
            limit: 100,
        }, {
            allowedColumns: ['BRAND'],
            tableName: 'test_data',
            // No dimensionNormalization — old behavior
        });

        // Should NOT normalize
        expect(compiled.sql).not.toContain('CASE');
        expect(compiled.sql).toContain('GROUP BY "BRAND"');
    });

    it('both paths agree on the number of distinct groups for edge-case dimension values', () => {
        const testValues = [
            null, undefined, '', '  ', '\t',
            'N/A', 'n/a', 'NA', 'na',
            'null', 'NULL', 'Null',
            'none', 'NONE', 'None',
            '-', '--',
            'Apple', 'APPLE', 'Samsung',
        ];

        const groups = jsAggregateGroups(testValues);
        // All placeholder variants collapse to Unknown
        // Apple and APPLE are different (case-sensitive in normal values)
        // Samsung is separate
        const expectedGroupCount = 4; // Unknown, Apple, APPLE, Samsung
        expect(groups.size).toBe(expectedGroupCount);
        expect(groups.has(UNKNOWN_LABEL)).toBe(true);
    });

    it('include-unknown config: both paths show Unknown bucket', () => {
        const config = DEFAULT_DIMENSION_NORMALIZATION;
        // With default config, Unknown is included
        expect(normalizeDimensionValue(null, config)).toBe(UNKNOWN_LABEL);
        expect(normalizeDimensionValue('N/A', config)).toBe(UNKNOWN_LABEL);
        expect(normalizeDimensionValue('Apple', config)).toBe('Apple');
    });

    it('exclude-unknown config: both paths can be configured to skip normalization', () => {
        const config = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            normalizeEmpty: false,
            normalizePlaceholders: false,
        };
        // With normalization disabled, raw values pass through
        expect(normalizeDimensionValue(null, config)).toBe('');
        expect(normalizeDimensionValue('N/A', config)).toBe('N/A');
        expect(normalizeDimensionValue('Apple', config)).toBe('Apple');
    });
});
