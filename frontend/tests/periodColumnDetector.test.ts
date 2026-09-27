// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    detectPeriodColumnFamilies,
    expandPeriodExpression,
    detectQuarterIntent,
    findMissingQuarterColumns,
    periodValueSortKey,
    isPeriodValueSet,
} from '../services/agent/runtime/periodColumnDetector';

describe('periodColumnDetector', () => {
    describe('detectPeriodColumnFamilies', () => {
        it('detects monthly family from wide-pivot column names with year', () => {
            const columns = [
                'STAFF CODE', 'STAFF NAME', '',
                'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
                'TOTAL',
            ];

            const families = detectPeriodColumnFamilies(columns);

            expect(families).toHaveLength(1);
            expect(families[0].pattern).toBe('monthly');
            expect(families[0].year).toBe('2010');
            expect(families[0].columns).toHaveLength(12);
            expect(families[0].columns[0]).toBe('JAN 2010');
            expect(families[0].columns[11]).toBe('DEC 2010');
        });

        it('builds correct quarter mappings', () => {
            const columns = [
                'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
                'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
            ];

            const families = detectPeriodColumnFamilies(columns);

            expect(families[0].quarterMap.Q1).toEqual(['JAN 2010', 'FEB 2010', 'MAR 2010']);
            expect(families[0].quarterMap.Q2).toEqual(['APR 2010', 'MAY 2010', 'JUN 2010']);
            expect(families[0].quarterMap.Q3).toEqual(['JUL 2010', 'AUG 2010', 'SEP 2010']);
            expect(families[0].quarterMap.Q4).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('returns empty when fewer than 3 month columns are present', () => {
            const columns = ['JAN 2010', 'FEB 2010', 'TOTAL'];
            expect(detectPeriodColumnFamilies(columns)).toEqual([]);
        });

        it('returns empty when no month-like columns exist', () => {
            const columns = ['Name', 'Region', 'Revenue', 'Cost', 'Profit'];
            expect(detectPeriodColumnFamilies(columns)).toEqual([]);
        });

        it('handles multiple years as separate families', () => {
            const columns = [
                'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010',
                'JAN 2011', 'FEB 2011', 'MAR 2011', 'APR 2011',
            ];

            const families = detectPeriodColumnFamilies(columns);

            expect(families).toHaveLength(2);
            expect(families[0].year).toBe('2010');
            expect(families[0].columns).toHaveLength(4);
            expect(families[1].year).toBe('2011');
            expect(families[1].columns).toHaveLength(4);
        });

        it('handles month columns without year suffix', () => {
            const columns = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];

            const families = detectPeriodColumnFamilies(columns);

            expect(families).toHaveLength(1);
            expect(families[0].year).toBeNull();
            expect(families[0].columns).toHaveLength(6);
        });

        it('handles full month names', () => {
            const columns = ['JANUARY 2010', 'FEBRUARY 2010', 'MARCH 2010', 'APRIL 2010'];

            const families = detectPeriodColumnFamilies(columns);

            expect(families).toHaveLength(1);
            expect(families[0].pattern).toBe('monthly');
            expect(families[0].columns).toHaveLength(4);
        });

        it('sorts columns by calendar order, not source order', () => {
            const columns = ['DEC 2010', 'JAN 2010', 'MAR 2010', 'FEB 2010'];

            const families = detectPeriodColumnFamilies(columns);

            expect(families[0].columns).toEqual(['JAN 2010', 'FEB 2010', 'MAR 2010', 'DEC 2010']);
        });

        it('builds partial quarter maps when not all months are present', () => {
            const columns = ['OCT 2010', 'NOV 2010', 'DEC 2010'];

            const families = detectPeriodColumnFamilies(columns);

            expect(families[0].quarterMap.Q1).toEqual([]);
            expect(families[0].quarterMap.Q4).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('populates ytdColumns same as columns', () => {
            const columns = ['JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010'];

            const families = detectPeriodColumnFamilies(columns);

            expect(families[0].ytdColumns).toEqual(families[0].columns);
        });
    });

    describe('expandPeriodExpression', () => {
        const columns = [
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
            'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
        ];
        const families = detectPeriodColumnFamilies(columns);

        it('expands arithmetic expression to constituent columns', () => {
            const result = expandPeriodExpression('OCT 2010 + NOV 2010 + DEC 2010', families);
            expect(result).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('expands Q4 shorthand to Q4 columns', () => {
            const result = expandPeriodExpression('Q4 2010', families);
            expect(result).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('expands Q1 shorthand to Q1 columns', () => {
            const result = expandPeriodExpression('Q1 2010', families);
            expect(result).toEqual(['JAN 2010', 'FEB 2010', 'MAR 2010']);
        });

        it('expands quarter shorthand without year using first available family', () => {
            const result = expandPeriodExpression('Q4', families);
            expect(result).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('returns null for unknown expressions', () => {
            expect(expandPeriodExpression('UNKNOWN_COL', families)).toBeNull();
        });

        it('returns null for partially matching arithmetic expressions', () => {
            expect(expandPeriodExpression('OCT 2010 + FAKE_COL', families)).toBeNull();
        });

        it('returns null for empty families', () => {
            expect(expandPeriodExpression('Q4 2010', [])).toBeNull();
        });

        it('is case-insensitive for arithmetic tokens', () => {
            const result = expandPeriodExpression('oct 2010 + nov 2010 + dec 2010', families);
            expect(result).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('is case-insensitive for quarter shorthand', () => {
            const result = expandPeriodExpression('q4 2010', families);
            expect(result).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });
    });

    describe('detectQuarterIntent', () => {
        const columns = [
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
            'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
        ];
        const families = detectPeriodColumnFamilies(columns);

        it('detects "Q4 2010" shorthand', () => {
            const intent = detectQuarterIntent('Revenue analysis for Q4 2010', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q4');
            expect(intent!.year).toBe('2010');
            expect(intent!.monthColumns).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('detects "Q4" without year', () => {
            const intent = detectQuarterIntent('Q4 performance by staff', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q4');
            expect(intent!.monthColumns).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('detects "fourth quarter"', () => {
            const intent = detectQuarterIntent('fourth quarter performance', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q4');
        });

        it('detects "4th quarter 2010"', () => {
            const intent = detectQuarterIntent('4th quarter 2010 revenue', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q4');
            expect(intent!.year).toBe('2010');
        });

        it('detects "first quarter"', () => {
            const intent = detectQuarterIntent('first quarter analysis', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q1');
            expect(intent!.monthColumns).toEqual(['JAN 2010', 'FEB 2010', 'MAR 2010']);
        });

        it('detects "October to December 2010"', () => {
            const intent = detectQuarterIntent('October to December 2010 by staff', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q4');
            expect(intent!.year).toBe('2010');
            expect(intent!.monthColumns).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('detects "January to March"', () => {
            const intent = detectQuarterIntent('January to March revenue', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q1');
        });

        it('returns null for non-quarter topics', () => {
            expect(detectQuarterIntent('Revenue by Region', families)).toBeNull();
        });

        it('returns null when families are empty', () => {
            expect(detectQuarterIntent('Q4 2010', [])).toBeNull();
        });

        it('is case-insensitive', () => {
            const intent = detectQuarterIntent('q4 analysis', families);
            expect(intent).not.toBeNull();
            expect(intent!.quarter).toBe('Q4');
        });
    });

    describe('findMissingQuarterColumns', () => {
        const columns = [
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'MAY 2010', 'JUN 2010',
            'JUL 2010', 'AUG 2010', 'SEP 2010', 'OCT 2010', 'NOV 2010', 'DEC 2010',
        ];
        const families = detectPeriodColumnFamilies(columns);
        const q4Intent = detectQuarterIntent('Q4 2010', families)!;

        it('returns empty when all months are covered', () => {
            expect(findMissingQuarterColumns('OCT 2010 + NOV 2010 + DEC 2010', q4Intent)).toEqual([]);
        });

        it('returns missing months for single-column aggregate', () => {
            const missing = findMissingQuarterColumns('OCT 2010', q4Intent);
            expect(missing).toEqual(['NOV 2010', 'DEC 2010']);
        });

        it('returns all months when column is unrelated', () => {
            const missing = findMissingQuarterColumns('Revenue', q4Intent);
            expect(missing).toEqual(['OCT 2010', 'NOV 2010', 'DEC 2010']);
        });

        it('handles partial coverage', () => {
            const missing = findMissingQuarterColumns('OCT 2010 + NOV 2010', q4Intent);
            expect(missing).toEqual(['DEC 2010']);
        });
    });

    describe('periodValueSortKey', () => {
        it('returns sort key for "JAN 2010" (year*12 + monthIndex)', () => {
            // JAN = monthIndex 0, so key = 2010*12 + 0 = 24120
            expect(periodValueSortKey('JAN 2010')).toBe(2010 * 12 + 0);
        });

        it('returns sort key for "DEC 2010"', () => {
            // DEC = monthIndex 11, so key = 2010*12 + 11 = 24131
            expect(periodValueSortKey('DEC 2010')).toBe(2010 * 12 + 11);
        });

        it('sorts months in natural order', () => {
            const months = ['MAR 2010', 'JAN 2010', 'FEB 2010', 'DEC 2009'];
            const sorted = [...months].sort((a, b) => periodValueSortKey(a)! - periodValueSortKey(b)!);
            expect(sorted).toEqual(['DEC 2009', 'JAN 2010', 'FEB 2010', 'MAR 2010']);
        });

        it('handles full month names', () => {
            expect(periodValueSortKey('January 2010')).toBe(2010 * 12 + 0);
            expect(periodValueSortKey('December 2010')).toBe(2010 * 12 + 11);
        });

        it('returns null for non-period values', () => {
            expect(periodValueSortKey('Revenue')).toBeNull();
            expect(periodValueSortKey('TOTAL')).toBeNull();
            expect(periodValueSortKey('2010')).toBeNull();
        });

        it('returns sort key for year-less months (year=0)', () => {
            // Year-less months get year=0: 0*12 + monthIndex
            expect(periodValueSortKey('JAN')).toBe(0);
            expect(periodValueSortKey('FEB')).toBe(1);
        });
    });

    describe('isPeriodValueSet', () => {
        it('returns true for a set of period values', () => {
            expect(isPeriodValueSet(['JAN 2010', 'FEB 2010', 'MAR 2010'])).toBe(true);
        });

        it('returns false when mixed with non-period values', () => {
            expect(isPeriodValueSet(['JAN 2010', 'FEB 2010', 'TOTAL'])).toBe(false);
        });

        it('returns false for fewer than 2 values', () => {
            expect(isPeriodValueSet(['JAN 2010'])).toBe(false);
            expect(isPeriodValueSet([])).toBe(false);
        });
    });
});
