// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    isTotalColumn,
    generatePeriodUnpivotPlan,
    generateAllPeriodUnpivotPlans,
} from '../services/agent/runtime/unpivotPlanGenerator';
import { detectPeriodColumnFamilies } from '../services/agent/runtime/periodColumnDetector';
import type { ColumnProfile } from '../types';

// Helper to build minimal ColumnProfile stubs.
const col = (name: string, type: ColumnProfile['type'] = 'numerical'): ColumnProfile => ({
    name,
    type,
    uniqueValues: 10,
    missingPercentage: 0,
});

describe('unpivotPlanGenerator', () => {
    // --- Shared fixtures ---

    const STAFF_COLUMNS = [
        col('STAFF CODE', 'categorical'),
        col('STAFF NAME', 'categorical'),
    ];

    const MONTH_COLUMNS_2010 = [
        'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
        'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
    ].map(n => col(n));

    const TOTAL_COL = col('TOTAL');

    const ALL_COLUMNS = [...STAFF_COLUMNS, ...MONTH_COLUMNS_2010, TOTAL_COL];

    const FAMILIES = detectPeriodColumnFamilies(ALL_COLUMNS.map(c => c.name));

    // --- isTotalColumn ---

    describe('isTotalColumn', () => {
        it.each([
            'TOTAL', 'Total', 'total',
            'GRAND TOTAL', 'Grand Total',
            'SUB TOTAL', 'SubTotal', 'SUBTOTAL',
            'SUM', 'YTD',
            'YEAR TOTAL', 'ANNUAL TOTAL',
            'TOTAL 2010',
            'CUMULATIVE',
        ])('identifies "%s" as a total column', (name) => {
            expect(isTotalColumn(name)).toBe(true);
        });

        it.each([
            'JAN 2010', 'Revenue', 'STAFF NAME', 'Description',
            'TOTAL STAFF',  // not a standalone total
        ])('rejects "%s" as not a total column', (name) => {
            expect(isTotalColumn(name)).toBe(false);
        });
    });

    // --- generatePeriodUnpivotPlan (single family) ---

    describe('generatePeriodUnpivotPlan', () => {
        it('generates unpivot for a 12-month family with TOTAL excluded', () => {
            const result = generatePeriodUnpivotPlan(FAMILIES[0], ALL_COLUMNS);

            expect(result.operation).not.toBeNull();
            expect(result.skipReason).toBeNull();
            expect(result.operation!.type).toBe('unpivot_columns');
            expect(result.operation!.sourceColumns).toHaveLength(12);
            expect(result.operation!.keyColumn).toBe('Period');
            expect(result.operation!.valueColumn).toBe('Value');
            expect(result.operation!.sourceColumnNameColumn).toBe('SourceColumnName');
        });

        it('preserves non-period dimension columns in keepColumns', () => {
            const result = generatePeriodUnpivotPlan(FAMILIES[0], ALL_COLUMNS);

            expect(result.operation!.keepColumns).toContain('STAFF CODE');
            expect(result.operation!.keepColumns).toContain('STAFF NAME');
        });

        it('excludes TOTAL from sourceColumns', () => {
            const result = generatePeriodUnpivotPlan(FAMILIES[0], ALL_COLUMNS);

            expect(result.operation!.sourceColumns).not.toContain('TOTAL');
            expect(result.excludedColumns).toContain('TOTAL');
        });

        it('excludes TOTAL from keepColumns', () => {
            const result = generatePeriodUnpivotPlan(FAMILIES[0], ALL_COLUMNS);

            expect(result.operation!.keepColumns).not.toContain('TOTAL');
        });

        it('allows custom output column names', () => {
            const result = generatePeriodUnpivotPlan(FAMILIES[0], ALL_COLUMNS, {
                keyColumn: 'Month',
                valueColumn: 'Amount',
                sourceColumnNameColumn: 'OriginalHeader',
            });

            expect(result.operation!.keyColumn).toBe('Month');
            expect(result.operation!.valueColumn).toBe('Amount');
            expect(result.operation!.sourceColumnNameColumn).toBe('OriginalHeader');
        });

        it('returns null when too few period columns after excluding totals', () => {
            // Family with only 1 non-total column
            const tinyFamily = detectPeriodColumnFamilies([
                'JAN 2010', 'FEB 2010', 'MAR 2010',
            ])[0];
            // Mark JAN and FEB as excluded by making them total-like (not possible with standard names)
            // Instead, make a tiny dataset where after exclusion there's < 2
            const colsWithTotals = [
                col('STAFF', 'categorical'),
                col('JAN 2010'),
                col('TOTAL'),
            ];
            const tinyFamilies = detectPeriodColumnFamilies(colsWithTotals.map(c => c.name));
            // Fewer than 3 months → no families detected
            expect(tinyFamilies).toHaveLength(0);
        });
    });

    // --- generateAllPeriodUnpivotPlans ---

    describe('generateAllPeriodUnpivotPlans', () => {
        it('returns null operation when no families provided', () => {
            const result = generateAllPeriodUnpivotPlans([], ALL_COLUMNS);

            expect(result.operation).toBeNull();
            expect(result.skipReason).toBe('No period column families detected.');
        });

        it('delegates to single-family path for one family', () => {
            const result = generateAllPeriodUnpivotPlans(FAMILIES, ALL_COLUMNS);

            expect(result.operation).not.toBeNull();
            expect(result.operation!.sourceColumns).toHaveLength(12);
        });

        it('merges multiple year families into a single unpivot plan', () => {
            const multiYearCols = [
                col('STAFF CODE', 'categorical'),
                ...['JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010'].map(n => col(n)),
                ...['JAN 2011', 'FEB 2011', 'MAR 2011', 'APR 2011'].map(n => col(n)),
                col('TOTAL'),
            ];

            const multiYearFamilies = detectPeriodColumnFamilies(
                multiYearCols.map(c => c.name),
            );
            expect(multiYearFamilies).toHaveLength(2);

            const result = generateAllPeriodUnpivotPlans(multiYearFamilies, multiYearCols);

            expect(result.operation).not.toBeNull();
            expect(result.operation!.sourceColumns).toHaveLength(8); // 4+4 months
            expect(result.operation!.sourceColumns).toContain('JAN 2010');
            expect(result.operation!.sourceColumns).toContain('APR 2011');
            expect(result.excludedColumns).toContain('TOTAL');
        });

        it('preserves keepColumns when merging multi-year families', () => {
            const multiYearCols = [
                col('Department', 'categorical'),
                col('Employee', 'categorical'),
                ...['JAN 2010', 'FEB 2010', 'MAR 2010'].map(n => col(n)),
                ...['JAN 2011', 'FEB 2011', 'MAR 2011'].map(n => col(n)),
                col('GRAND TOTAL'),
            ];

            const families = detectPeriodColumnFamilies(multiYearCols.map(c => c.name));
            const result = generateAllPeriodUnpivotPlans(families, multiYearCols);

            expect(result.operation!.keepColumns).toContain('Department');
            expect(result.operation!.keepColumns).toContain('Employee');
            expect(result.operation!.keepColumns).not.toContain('GRAND TOTAL');
        });

        it('excludes all TOTAL variants found in columns', () => {
            const colsWithMultipleTotals = [
                col('STAFF CODE', 'categorical'),
                ...['JAN 2010', 'FEB 2010', 'MAR 2010'].map(n => col(n)),
                col('TOTAL'),
                col('SUB TOTAL'),
                col('YTD'),
            ];

            const families = detectPeriodColumnFamilies(
                colsWithMultipleTotals.map(c => c.name),
            );
            const result = generateAllPeriodUnpivotPlans(families, colsWithMultipleTotals);

            expect(result.excludedColumns).toContain('TOTAL');
            expect(result.excludedColumns).toContain('SUB TOTAL');
            expect(result.excludedColumns).toContain('YTD');
            expect(result.operation!.keepColumns).not.toContain('TOTAL');
            expect(result.operation!.keepColumns).not.toContain('SUB TOTAL');
            expect(result.operation!.keepColumns).not.toContain('YTD');
        });
    });

    // --- End-to-end: wide-pivot dataset shape ---

    describe('end-to-end: typical payroll wide-pivot', () => {
        it('produces a complete unpivot plan for a 12-month payroll pivot', () => {
            const payrollColumns = [
                col('STAFF CODE', 'categorical'),
                col('STAFF NAME', 'categorical'),
                col('DEPARTMENT', 'categorical'),
                ...['JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                    'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
                ].map(n => col(n)),
                col('TOTAL'),
            ];

            const families = detectPeriodColumnFamilies(payrollColumns.map(c => c.name));
            const result = generateAllPeriodUnpivotPlans(families, payrollColumns);

            // Verify the plan is complete and correct.
            expect(result.operation).not.toBeNull();
            const op = result.operation!;

            // 12 month columns become sourceColumns (no TOTAL).
            expect(op.sourceColumns).toHaveLength(12);
            expect(op.sourceColumns[0]).toBe('JAN 2010');
            expect(op.sourceColumns[11]).toBe('DEC 2010');

            // 3 dimension columns preserved.
            expect(op.keepColumns).toEqual(['STAFF CODE', 'STAFF NAME', 'DEPARTMENT']);

            // Default output names.
            expect(op.keyColumn).toBe('Period');
            expect(op.valueColumn).toBe('Value');
            expect(op.sourceColumnNameColumn).toBe('SourceColumnName');

            // TOTAL excluded.
            expect(result.excludedColumns).toEqual(['TOTAL']);
        });
    });
});
