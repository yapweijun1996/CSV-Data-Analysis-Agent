import { describe, expect, it } from 'vitest';
import { tryChronologicalSort } from '../utils/chronologicalSort';

describe('tryChronologicalSort', () => {
    it('sorts numeric strings numerically, not lexicographically', () => {
        const data = [
            { DATE: '12', qty: 48 },
            { DATE: '18', qty: 592 },
            { DATE: '2', qty: 1 },
            { DATE: '22', qty: 61 },
            { DATE: '25', qty: 365 },
            { DATE: '28', qty: 198 },
            { DATE: '30', qty: 218 },
            { DATE: '31', qty: 16 },
            { DATE: '6', qty: 413 },
            { DATE: '9', qty: 280 },
        ];

        const sorted = tryChronologicalSort(data, 'DATE');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.DATE)).toEqual([
            '2', '6', '9', '12', '18', '22', '25', '28', '30', '31',
        ]);
    });

    it('returns null when most values are non-numeric strings', () => {
        const data = [
            { category: 'Electronics', value: 100 },
            { category: 'Clothing', value: 200 },
            { category: 'Food', value: 300 },
        ];

        expect(tryChronologicalSort(data, 'category')).toBeNull();
    });

    it('sorts month names chronologically (takes priority over numeric fallback)', () => {
        const data = [
            { month: 'Mar', value: 3 },
            { month: 'Jan', value: 1 },
            { month: 'Feb', value: 2 },
            { month: 'Dec', value: 12 },
        ];

        const sorted = tryChronologicalSort(data, 'month');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.month)).toEqual(['Jan', 'Feb', 'Mar', 'Dec']);
    });

    it('sorts quarter labels chronologically', () => {
        const data = [
            { quarter: 'Q3', value: 3 },
            { quarter: 'Q1', value: 1 },
            { quarter: 'Q4', value: 4 },
            { quarter: 'Q2', value: 2 },
        ];

        const sorted = tryChronologicalSort(data, 'quarter');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.quarter)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    });

    it('sorts standard date strings chronologically', () => {
        const data = [
            { date: '2025-03-15', value: 3 },
            { date: '2025-01-10', value: 1 },
            { date: '2025-02-20', value: 2 },
        ];

        const sorted = tryChronologicalSort(data, 'date');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.date)).toEqual(['2025-01-10', '2025-02-20', '2025-03-15']);
    });

    it('returns single-element data as-is', () => {
        const data = [{ DATE: '5', value: 100 }];
        expect(tryChronologicalSort(data, 'DATE')).toEqual(data);
    });

    it('sorts "MONTH YEAR" period values chronologically', () => {
        const data = [
            { Period: 'APR 2010', Sales: 4 },
            { Period: 'JAN 2010', Sales: 1 },
            { Period: 'DEC 2010', Sales: 12 },
            { Period: 'FEB 2010', Sales: 2 },
            { Period: 'AUG 2010', Sales: 8 },
            { Period: 'MAR 2010', Sales: 3 },
        ];
        const sorted = tryChronologicalSort(data, 'Period');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.Period)).toEqual([
            'JAN 2010', 'FEB 2010', 'MAR 2010', 'APR 2010', 'AUG 2010', 'DEC 2010',
        ]);
    });

    it('sorts multi-year "MONTH YEAR" period values across year boundaries', () => {
        const data = [
            { Period: 'DEC 2010', Sales: 12 },
            { Period: 'JAN 2011', Sales: 1 },
            { Period: 'NOV 2010', Sales: 11 },
            { Period: 'FEB 2011', Sales: 2 },
        ];
        const sorted = tryChronologicalSort(data, 'Period');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.Period)).toEqual([
            'NOV 2010', 'DEC 2010', 'JAN 2011', 'FEB 2011',
        ]);
    });

    it('handles decimal numeric strings', () => {
        const data = [
            { price: '10.5', count: 1 },
            { price: '2.3', count: 2 },
            { price: '100', count: 3 },
            { price: '1.1', count: 4 },
        ];

        const sorted = tryChronologicalSort(data, 'price');
        expect(sorted).not.toBeNull();
        expect(sorted!.map(r => r.price)).toEqual(['1.1', '2.3', '10.5', '100']);
    });
});
