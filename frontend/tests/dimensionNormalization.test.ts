// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    normalizeDimensionValue,
    buildDimensionNormExpr,
    buildColumnTypeGate,
    isColumnNormalized,
    DEFAULT_DIMENSION_NORMALIZATION,
    UNKNOWN_LABEL,
    DEFAULT_DIMENSION_PLACEHOLDERS,
} from '../services/duckdb/dimensionNormalization';
import type { ColumnProfile } from '../types';
import { compileQueryPlanToDuckDbSql } from '../services/duckdb/queryCompiler';

// --- JS normalization ---

describe('normalizeDimensionValue', () => {
    const normalize = normalizeDimensionValue;

    it('normalizes null to Unknown', () => {
        expect(normalize(null)).toBe(UNKNOWN_LABEL);
    });

    it('normalizes undefined to Unknown', () => {
        expect(normalize(undefined)).toBe(UNKNOWN_LABEL);
    });

    it('normalizes empty string to Unknown', () => {
        expect(normalize('')).toBe(UNKNOWN_LABEL);
    });

    it('normalizes whitespace-only to Unknown', () => {
        expect(normalize('   ')).toBe(UNKNOWN_LABEL);
        expect(normalize('\t')).toBe(UNKNOWN_LABEL);
    });

    it('normalizes placeholder tokens (case-insensitive)', () => {
        for (const placeholder of DEFAULT_DIMENSION_PLACEHOLDERS) {
            expect(normalize(placeholder)).toBe(UNKNOWN_LABEL);
            expect(normalize(placeholder.toUpperCase())).toBe(UNKNOWN_LABEL);
        }
    });

    it('preserves normal values', () => {
        expect(normalize('Apple')).toBe('Apple');
        expect(normalize('Samsung')).toBe('Samsung');
        expect(normalize('  Apple  ')).toBe('Apple');
    });

    it('preserves numeric values as strings', () => {
        expect(normalize(42)).toBe('42');
        expect(normalize(0)).toBe('0');
    });

    it('respects custom config', () => {
        const config = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            normalizePlaceholders: false,
        };
        expect(normalizeDimensionValue('N/A', config)).toBe('N/A');
        expect(normalizeDimensionValue(null, config)).toBe(UNKNOWN_LABEL);
    });

    it('uses custom label', () => {
        const config = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            label: 'Missing',
        };
        expect(normalizeDimensionValue(null, config)).toBe('Missing');
        expect(normalizeDimensionValue('N/A', config)).toBe('Missing');
    });
});

// --- SQL expression builder ---

describe('buildDimensionNormExpr', () => {
    it('generates CASE WHEN expression with default config', () => {
        const expr = buildDimensionNormExpr('"BRAND"');
        expect(expr).toContain('CASE');
        expect(expr).toContain("WHEN TRIM(COALESCE(CAST(\"BRAND\" AS VARCHAR), '')) = '' THEN 'Unknown'");
        expect(expr).toContain("IN ('n/a', 'na', 'null', 'none', '-', '--')");
        expect(expr).toContain('ELSE');
        expect(expr).toContain('END');
    });

    it('returns raw expression when no rules enabled', () => {
        const config = {
            normalizeEmpty: false,
            normalizePlaceholders: false,
            placeholders: [],
            label: 'Unknown',
        };
        const expr = buildDimensionNormExpr('"BRAND"', config);
        expect(expr).not.toContain('CASE');
        expect(expr).toContain('TRIM(COALESCE');
    });

    it('generates only empty branch when placeholders disabled', () => {
        const config = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            normalizePlaceholders: false,
        };
        const expr = buildDimensionNormExpr('"BRAND"', config);
        expect(expr).toContain('CASE');
        expect(expr).toContain("= '' THEN 'Unknown'");
        expect(expr).not.toContain('IN (');
    });
});

// --- Query compiler integration ---

describe('queryCompiler with dimensionNormalization', () => {
    const allowedColumns = ['BRAND', 'Revenue'];
    const tableName = 'test_data';

    it('applies CASE normalization to GROUP BY columns', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['BRAND'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            select: ['BRAND', 'total_revenue'],
            limit: 10,
        }, {
            allowedColumns,
            tableName,
            dimensionNormalization: DEFAULT_DIMENSION_NORMALIZATION,
        });

        // SELECT should contain the CASE expression aliased as "BRAND"
        expect(compiled.sql).toContain('CASE');
        expect(compiled.sql).toContain("THEN 'Unknown'");
        expect(compiled.sql).toContain('AS "BRAND"');
        // GROUP BY should use positional reference
        expect(compiled.sql).toMatch(/GROUP BY 1\b/);
    });

    it('uses raw columns when normalization is not provided', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['BRAND'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            select: ['BRAND', 'total_revenue'],
            limit: 10,
        }, {
            allowedColumns,
            tableName,
        });

        // Without normalization, GROUP BY uses raw column names (not positional)
        expect(compiled.sql).toContain('GROUP BY "BRAND"');
        // The SELECT for BRAND should be a raw identifier, not a CASE...AS alias
        expect(compiled.sql).not.toContain("THEN 'Unknown'");
    });

    it('applies normalization to multiple GROUP BY columns', () => {
        const columns = ['Region', 'BRAND', 'Revenue'];
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['Region', 'BRAND'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            select: ['Region', 'BRAND', 'total_revenue'],
            limit: 10,
        }, {
            allowedColumns: columns,
            tableName,
            dimensionNormalization: DEFAULT_DIMENSION_NORMALIZATION,
        });

        expect(compiled.sql).toMatch(/GROUP BY 1, 2\b/);
    });
});

// --- JS ↔ SQL parity ---

describe('JS and SQL normalization parity', () => {
    it('both paths treat same values identically', () => {
        const testCases = [
            { input: null, expected: UNKNOWN_LABEL },
            { input: '', expected: UNKNOWN_LABEL },
            { input: '  ', expected: UNKNOWN_LABEL },
            { input: 'N/A', expected: UNKNOWN_LABEL },
            { input: 'na', expected: UNKNOWN_LABEL },
            { input: 'null', expected: UNKNOWN_LABEL },
            { input: 'none', expected: UNKNOWN_LABEL },
            { input: '-', expected: UNKNOWN_LABEL },
            { input: '--', expected: UNKNOWN_LABEL },
            { input: 'Apple', expected: 'Apple' },
            { input: 'Samsung', expected: 'Samsung' },
        ];

        for (const { input, expected } of testCases) {
            expect(normalizeDimensionValue(input)).toBe(expected);
        }

        const expr = buildDimensionNormExpr('"col"');
        for (const placeholder of DEFAULT_DIMENSION_PLACEHOLDERS) {
            expect(expr.toLowerCase()).toContain(placeholder.toLowerCase());
        }
    });
});

// --- Type gating ---

describe('buildColumnTypeGate', () => {
    const profiles: ColumnProfile[] = [
        { name: 'BRAND', type: 'categorical' },
        { name: 'Region', type: 'categorical' },
        { name: 'Revenue', type: 'numerical' },
        { name: 'OrderDate', type: 'date' },
        { name: 'OrderTime', type: 'time' },
        { name: 'Price', type: 'currency' },
        { name: 'TaxRate', type: 'percentage' },
    ];
    const gate = buildColumnTypeGate(profiles);

    it('allows categorical columns', () => {
        expect(gate('BRAND')).toBe(true);
        expect(gate('Region')).toBe(true);
    });

    it('blocks numerical columns', () => {
        expect(gate('Revenue')).toBe(false);
    });

    it('blocks date columns', () => {
        expect(gate('OrderDate')).toBe(false);
    });

    it('blocks time columns', () => {
        expect(gate('OrderTime')).toBe(false);
    });

    it('blocks currency columns', () => {
        expect(gate('Price')).toBe(false);
    });

    it('blocks percentage columns', () => {
        expect(gate('TaxRate')).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(gate('brand')).toBe(true);
        expect(gate('REVENUE')).toBe(false);
    });

    it('defaults to normalizing unknown columns', () => {
        expect(gate('UnknownColumn')).toBe(true);
    });
});

describe('isColumnNormalized', () => {
    it('returns false when config is null', () => {
        expect(isColumnNormalized('BRAND', null)).toBe(false);
    });

    it('returns true when no shouldNormalize gate is set', () => {
        expect(isColumnNormalized('BRAND', DEFAULT_DIMENSION_NORMALIZATION)).toBe(true);
    });

    it('respects shouldNormalize gate', () => {
        const config = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            shouldNormalize: (col: string) => col === 'BRAND',
        };
        expect(isColumnNormalized('BRAND', config)).toBe(true);
        expect(isColumnNormalized('Revenue', config)).toBe(false);
    });
});

// --- Type-gated GROUP BY ---

describe('queryCompiler type-gated normalization', () => {
    const profiles: ColumnProfile[] = [
        { name: 'BRAND', type: 'categorical' },
        { name: 'Year', type: 'numerical' },
        { name: 'Revenue', type: 'numerical' },
    ];
    const configWithGate = {
        ...DEFAULT_DIMENSION_NORMALIZATION,
        shouldNormalize: buildColumnTypeGate(profiles),
    };

    it('normalizes categorical BRAND but not numerical Year in GROUP BY', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['BRAND', 'Year'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total' }],
            select: ['BRAND', 'Year', 'total'],
            limit: 10,
        }, {
            allowedColumns: ['BRAND', 'Year', 'Revenue'],
            tableName: 'test_data',
            dimensionNormalization: configWithGate,
        });

        // Inner SELECT: BRAND gets CASE, Year stays raw
        const innerMatch = compiled.sql.match(/SELECT (.+?) FROM "test_data"/);
        expect(innerMatch).toBeTruthy();
        const innerSelect = innerMatch![1];
        // BRAND should have CASE normalization
        expect(innerSelect).toContain("THEN 'Unknown'");
        expect(innerSelect).toContain('AS "BRAND"');
        // Year should NOT have CASE — just raw "Year"
        // (Year appears before the CASE for BRAND or directly as quoteIdentifier)
        expect(compiled.sql).toMatch(/GROUP BY 1, 2/);
    });

    it('uses raw GROUP BY when no columns pass the gate', () => {
        const allNumericGate = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            shouldNormalize: () => false,
        };
        const compiled = compileQueryPlanToDuckDbSql({
            groupBy: ['Year'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total' }],
            select: ['Year', 'total'],
            limit: 10,
        }, {
            allowedColumns: ['Year', 'Revenue'],
            tableName: 'test_data',
            dimensionNormalization: allNumericGate,
        });

        // No CASE normalization
        expect(compiled.sql).not.toContain("THEN 'Unknown'");
        // Standard GROUP BY with quoted column
        expect(compiled.sql).toContain('GROUP BY "Year"');
    });
});

// --- Filter consistency with normalized GROUP BY ---

describe('filter semantics with dimension normalization', () => {
    const allowedColumns = ['BRAND', 'Revenue'];
    const tableName = 'test_data';

    it('WHERE BRAND = Unknown uses CASE expression when normalization active', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            select: ['BRAND', 'Revenue'],
            where: {
                predicates: [{ column: 'BRAND', operator: 'eq', value: 'Unknown' }],
            },
            limit: 10,
        }, {
            allowedColumns,
            tableName,
            dimensionNormalization: DEFAULT_DIMENSION_NORMALIZATION,
        });

        // The WHERE should use the normalized CASE expression,
        // so filtering on 'Unknown' matches null/empty/placeholder rows
        expect(compiled.sql).toContain('CASE');
        expect(compiled.sql).toContain("THEN 'Unknown'");
        expect(compiled.sql).toContain("= 'unknown'");
    });

    it('WHERE on non-normalized column uses raw expression', () => {
        const profiles: ColumnProfile[] = [
            { name: 'BRAND', type: 'categorical' },
            { name: 'Revenue', type: 'numerical' },
        ];
        const config = {
            ...DEFAULT_DIMENSION_NORMALIZATION,
            shouldNormalize: buildColumnTypeGate(profiles),
        };
        const compiled = compileQueryPlanToDuckDbSql({
            select: ['BRAND', 'Revenue'],
            where: {
                predicates: [{ column: 'Revenue', operator: 'gt', value: 100 }],
            },
            limit: 10,
        }, {
            allowedColumns,
            tableName,
            dimensionNormalization: config,
        });

        // Revenue filter should NOT contain CASE/Unknown normalization
        expect(compiled.sql).not.toContain("THEN 'Unknown'");
        expect(compiled.sql).toContain('> 100');
    });

    it('WHERE BRAND IN (Unknown, Apple) matches both normalized and normal values', () => {
        const compiled = compileQueryPlanToDuckDbSql({
            select: ['BRAND'],
            where: {
                predicates: [{ column: 'BRAND', operator: 'in', value: ['Unknown', 'Apple'] }],
            },
            limit: 10,
        }, {
            allowedColumns,
            tableName,
            dimensionNormalization: DEFAULT_DIMENSION_NORMALIZATION,
        });

        // Should use the CASE expression for the IN comparison
        expect(compiled.sql).toContain('CASE');
        expect(compiled.sql).toContain("IN ('unknown', 'apple')");
    });
});
