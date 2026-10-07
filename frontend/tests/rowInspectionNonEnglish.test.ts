// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { inspectCsvRows } from '../services/agent/rowInspectionService';
import type { CsvData } from '../types';

const detail = (label: string, a: number, b: number, c: number) => ({ Item: label, Q1: a, Q2: b, Q3: c });

const build = (labels: string[], totalLabel: string): CsvData => {
    const rows = labels.map((label, index) => detail(label, 100 + index * 10, 200 + index * 7, 300 + index * 3));
    const sum = (key: 'Q1' | 'Q2' | 'Q3') => rows.reduce((total, row) => total + row[key], 0);
    return { fileName: 'report.csv', data: [...rows, { Item: totalLabel, Q1: sum('Q1'), Q2: sum('Q2'), Q3: sum('Q3') }] } as unknown as CsvData;
};

const roleOfLast = (data: CsvData) => {
    const bundle = inspectCsvRows(data);
    return bundle.rows[bundle.rows.length - 1].rowRole;
};

describe('row inspection beyond English labels', () => {
    const items = ['Rice', 'Noodles', 'Tea', 'Sugar', 'Salt', 'Oil'];

    it('finds a total row whose label is in another language because its numbers reconcile', () => {
        expect(roleOfLast(build(items, '合计'))).toBe('summary_like');
        expect(roleOfLast(build(items, 'Jumlah'))).toBe('summary_like');
    });

    it('keeps an ordinary record that merely starts with "Net" or "Total"', () => {
        const rows = ['Net Wireless', 'Total Facility Engineering', 'Tea', 'Sugar', 'Salt', 'Oil', 'Rice'].map((label, index) =>
            detail(label, 100 + index * 13, 200 + index * 7, 300 + index * 11));
        const bundle = inspectCsvRows({ fileName: 'x.csv', data: rows } as unknown as CsvData);

        expect(bundle.rows[0].rowRole).toBe('detail');
        expect(bundle.rows[1].rowRole).toBe('detail');
    });
});
