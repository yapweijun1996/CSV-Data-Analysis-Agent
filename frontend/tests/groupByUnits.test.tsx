import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAggregation, computePivotAggregation, GroupByTest } from '../components/spreadsheet/GroupByTest';
import { getTranslation } from '../utils/localization';
import type { CsvRow } from '../types';

const hidden = 'mixed_or_missing_units';
const flat = (rows: CsvRow[], agg: 'sum' | 'avg' | 'count' = 'sum') => computeAggregation(rows, 'Region', 'Amount', agg);
const pivot = (rows: CsvRow[], agg: 'sum' | 'avg' | 'count' = 'sum') => computePivotAggregation(rows, 'Region', 'Period', 'Amount', agg);

afterEach(cleanup);

describe('spreadsheet aggregation units', () => {
    it('suppresses mixed or blank units, but ignores invalid values and accepts one unit', () => {
        expect(flat([{ Region: 'A', Amount: 2, Unit: 'kg' }, { Region: 'A', Amount: 3, Unit: 'lb' }]).total).toBe(hidden);
        expect(flat([{ Region: 'A', Amount: 2, Unit: '' }]).rows[0].Amount).toBe(hidden);
        expect(flat([{ Region: 'A', Amount: 2, Unit: 'kg' }, { Region: 'A', Amount: 'invalid', Unit: '' }])).toEqual({ rows: [{ Region: 'A', Amount: 2 }], total: 2 });
        expect(flat([{ Region: 'A', Amount: 2, Unit: 'kg' }, { Region: 'A', Amount: 3, Unit: ' kg' }]).total).toBe(hidden);
    });

    it('detects sparse companion columns and leaves empty numeric scopes blank', () => {
        expect(flat([{ Region: 'A', Amount: 2 }, { Region: 'A', Amount: 3, Unit: 'kg' }]).total).toBe(hidden);
        expect(flat([{ Region: 'A', Amount: '', Unit: 'kg' }]).total).toBeNull();
    });

    it('checks the full grand total even when units are split across safe groups', () => {
        const result = flat([{ Region: 'A', Amount: 2, Unit: 'kg' }, { Region: 'B', Amount: 3, Unit: 'lb' }]);
        expect(result.rows.map(row => row.Amount)).toEqual([3, 2]);
        expect(result.total).toBe(hidden);
    });

    it('includes groups beyond the display limit in the grand total', () => {
        const rows = Array.from({ length: 21 }, (_, i) => ({ Region: `R${i}`, Amount: 1, Unit: i === 20 ? 'lb' : 'kg' }));
        expect(flat(rows).rows).toHaveLength(20);
        expect(flat(rows).total).toBe(hidden);
        expect(flat(rows, 'avg').total).toBe(hidden);
    });

    it('uses contributing numeric counts for guarded averages and leaves count independent', () => {
        const rows = [{ Region: 'A', Amount: 10, Unit: 'kg' }, { Region: 'A', Amount: 'bad', Unit: '' }, { Region: 'B', Amount: 20, Unit: 'kg' }, { Region: 'B', Amount: 30, Unit: 'kg' }];
        expect(flat(rows, 'avg').total).toBe(20);
        expect(flat(rows, 'count').total).toBe(4);
        expect(flat([{ Region: 'A', Amount: 1, Unit: 'kg' }, { Region: 'A', Amount: 2, Unit: 'lb' }], 'count').total).toBe(2);
    });

    describe('BUG-009: unitless average totals', () => {
        const rows: CsvRow[] = [
            { Region: 'A', Period: 'P1', Amount: 10 },
            { Region: 'A', Period: 'P1', Amount: 10 },
            { Region: 'A', Period: 'P1', Amount: 10 },
            { Region: 'A', Period: 'P2', Amount: 10 },
            { Region: 'B', Period: 'P1', Amount: 40 },
        ];

        it('uses the weighted source-row average for a flat grand total', () => {
            expect(flat(rows, 'avg')).toEqual({
                rows: [{ Region: 'B', Amount: 40 }, { Region: 'A', Amount: 10 }],
                total: 16,
            });
        });

        it('uses the weighted source-row average for a pivot grand total', () => {
            const result = pivot(rows, 'avg');
            expect(result.rows).toEqual([
                { Region: 'A', P1: 10, P2: 10, Total: 10 },
                { Region: 'B', P1: 40, P2: 0, Total: 40 },
            ]);
            expect(result.columnTotals).toEqual({ P1: 17.5, P2: 10, Total: 16 });
            expect(result.grandTotal).toBe(16);
        });

        it('computes totals before display rounding', () => {
            const roundedRows: CsvRow[] = [1, 1, 2, 2, 2, 3].map((Amount, i) => ({
                Region: 'A', Period: i < 3 ? 'P1' : 'P2', Amount,
            }));
            const result = pivot(roundedRows, 'avg');
            expect(result.rows[0]).toEqual({ Region: 'A', P1: 1.33, P2: 2.33, Total: 11 / 6 });
            expect(result.columnTotals).toEqual({ P1: 4 / 3, P2: 7 / 3, Total: 11 / 6 });
            expect(result.grandTotal).toBe(11 / 6);
        });

        it('retains additive sum and row count totals', () => {
            expect(flat(rows, 'sum').total).toBe(80);
            expect(flat(rows, 'count').total).toBe(5);
            expect(pivot(rows, 'sum').columnTotals).toEqual({ P1: 70, P2: 10, Total: 80 });
            expect(pivot(rows, 'count').columnTotals).toEqual({ P1: 4, P2: 1, Total: 5 });
        });

        it('ignores blank and invalid average inputs but counts rows', () => {
            const input = [{ Region: 'A', Period: 'P1', Amount: 10 }, { Region: 'A', Period: 'P1', Amount: null }, { Region: 'A', Period: 'P2', Amount: '' }, { Region: 'B', Period: 'P1', Amount: 20 }];
            expect(flat(input, 'avg').total).toBe(15);
            expect(pivot(input, 'avg').columnTotals).toEqual({ P1: 15, P2: null, Total: 15 });
            expect(flat(input, 'count').total).toBe(4);
            expect(pivot(input, 'count').grandTotal).toBe(4);
        });

        it('handles empty and single-group totals', () => {
            expect(flat([], 'avg').total).toBeNull();
            expect(pivot([], 'avg').grandTotal).toBeNull();
            expect(flat([{ Region: 'A', Amount: '' }], 'avg').total).toBeNull();
            expect(flat([{ Region: 'A', Amount: 7 }], 'avg').total).toBe(7);
            expect(pivot([{ Region: 'A', Period: 'P1', Amount: 7 }], 'avg').grandTotal).toBe(7);
        });

        it('includes hidden rows and columns in average totals', () => {
            const input = Array.from({ length: 21 }, (_, i) => ({ Region: `R${String(i).padStart(2, '0')}`, Period: `P${String(i).padStart(2, '0')}`, Amount: i === 20 ? 21 : 0 }));
            expect(flat(input, 'avg').total).toBe(1);
            expect(pivot(input, 'avg').grandTotal).toBe(1);
            const row = input.map(item => ({ ...item, Region: 'A' }));
            expect(pivot(row, 'avg').rows[0].Total).toBe(1);
            const column = input.map(item => ({ ...item, Period: 'P1' }));
            expect(pivot(column, 'avg').columnTotals.P1).toBe(1);
        });
    });

    it('does not infer an ambiguous companion', () => {
        expect(flat([{ Region: 'A', Amount: 2, Unit: 'kg', Currency: 'USD' }, { Region: 'A', Amount: 3, Unit: 'lb', Currency: 'EUR' }]).total).toBe(5);
    });

    it('keeps weighted guarded AVG totals exact for large cent amounts across groups and pivot cells', () => {
        const rows: CsvRow[] = [
            { Region: 'A', Period: 'P1', Amount: '9007199254740992.00', Unit: 'USD' },
            { Region: 'A', Period: 'P1', Amount: '0.01', Unit: 'USD' },
            { Region: 'B', Period: 'P2', Amount: '0.02', Unit: 'USD' },
        ];
        const flatResult = flat(rows, 'avg');
        expect(flatResult.total).toBe('3002399751580330.68');
        const pivotResult = pivot(rows, 'avg');
        expect(pivotResult.grandTotal).toBe('3002399751580330.68');
        expect(pivotResult.columnTotals.Total).toBe('3002399751580330.68');
        expect(pivotResult.rows.find(row => row.Region === 'A')?.Total).toBe('4503599627370496.01');
    });

    it('supports fractional Number inputs in guarded exact sums', () => {
        expect(flat([{ Region: 'A', Amount: 1.25, Unit: 'USD' }, { Region: 'A', Amount: 0.1, Unit: 'USD' }]).total).toBe(1.35);
        expect(pivot([
            { Region: 'A', Period: 'P1', Amount: 1.25, Unit: 'USD' },
            { Region: 'A', Period: 'P1', Amount: 0.1, Unit: 'USD' },
        ]).grandTotal).toBe(1.35);
    });

    it('keeps ordinary decimal-string sums numeric for aggregation and card handoff', () => {
        const result = flat([{ Region: 'A', Amount: '1.25', Unit: 'USD' }, { Region: 'A', Amount: '2.50', Unit: 'USD' }]);
        expect(result.rows[0].Amount).toBe(3.75);
        expect(result.total).toBe(3.75);

        const request = vi.fn();
        render(<GroupByTest rows={[
            { Region: 'A', Amount: '1.25' },
            { Region: 'A', Amount: '2.50' },
        ]} language="English" accentColor="blue" onRequestCard={request} />);
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'Region' } });
        fireEvent.change(selects[3], { target: { value: 'Amount' } });
        fireEvent.click(screen.getByRole('button', { name: getTranslation('groupby_create_card', 'English') }));
        expect(request.mock.calls[0][1]?.[0].Amount).toBe(3.75);
    });

    it('preserves supported high-precision decimals exactly instead of rounding through Number', () => {
        const result = flat([
            { Region: 'A', Amount: '9007199254740992.00', Unit: 'USD' },
            { Region: 'A', Amount: '0.01', Unit: 'USD' },
        ]);
        expect(result.rows[0].Amount).toBe('9007199254740992.01');
        expect(result.total).toBe('9007199254740992.01');
    });
    it('keeps sums numeric only when Number preserves the exact decimal value', () => {
        expect(flat([{ Region: 'A', Amount: '9007199254740991.01', Unit: 'USD' }]).total).toBe('9007199254740991.01');
    });

    it('rounds guarded averages from exact fixed-point values', () => {
        expect(flat([{ Region: 'A', Amount: '1.01', Unit: 'USD' }, { Region: 'A', Amount: '1.02', Unit: 'USD' }], 'avg').total).toBe(1.02);
        expect(flat([{ Region: 'A', Amount: '-1.01', Unit: 'USD' }, { Region: 'A', Amount: '-1.02', Unit: 'USD' }], 'avg').total).toBe(-1.02);
        expect(flat([{ Region: 'A', Amount: '1.005001', Unit: 'USD' }, { Region: 'A', Amount: '1.005002', Unit: 'USD' }], 'avg').total).toBe(1.01);
    });

    it('handles groups larger than the argument-spread limit', () => {
        const rows = Array.from({ length: 130_000 }, () => ({ Region: 'A', Amount: '0.01', Unit: 'USD' }));
        expect(flat(rows).total).toBe(1300);
    });


    it('sums signed six-place decimals exactly and fails closed for unsafe or unsupported values', () => {
        expect(flat([{ Region: 'A', Amount: '-12.125000', Unit: 'USD' }, { Region: 'A', Amount: '0.000001', Unit: 'USD' }]).total).toBe('-12.124999');
        expect(flat([{ Region: 'A', Amount: 9007199254740992, Unit: 'USD' }]).total).toBe('unsupported_decimal_precision');
        expect(flat([{ Region: 'A', Amount: '1.0000001', Unit: 'USD' }]).total).toBe('unsupported_decimal_precision');
        expect(flat([{ Region: 'A', Amount: `${'9'.repeat(38)}`, Unit: 'USD' }, { Region: 'A', Amount: '1', Unit: 'USD' }]).total).toBe('unsupported_decimal_precision');
        expect(flat([{ Region: 'A', Amount: '1.00', Unit: '' }]).total).toBe(hidden);
    });

    it('keeps pivot cells and totals exact for supported decimal strings', () => {
        const result = pivot([
            { Region: 'A', Period: 'P1', Amount: '9007199254740992.00', Unit: 'USD' },
            { Region: 'A', Period: 'P1', Amount: '0.01', Unit: 'USD' },
        ]);
        expect(result.rows[0].P1).toBe('9007199254740992.01');
        expect(result.rows[0].Total).toBe('9007199254740992.01');
        expect(result.grandTotal).toBe('9007199254740992.01');
    });
    it('checks pivot cells and each subtotal independently against underlying rows', () => {
        const rows = [
            { Region: 'A', Period: 'P1', Amount: 2, Unit: 'kg' },
            { Region: 'A', Period: 'P2', Amount: 3, Unit: 'lb' },
            { Region: 'B', Period: 'P1', Amount: 4, Unit: 'lb' },
        ];
        const result = pivot(rows);
        expect(result.rows[0]).toMatchObject({ P1: 2, P2: 3, Total: hidden });
        expect(result.columnTotals).toMatchObject({ P1: hidden, P2: 3, Total: hidden });
        expect(result.grandTotal).toBe(hidden);
        expect(pivot(rows, 'count').grandTotal).toBe(3);
    });

    it('includes hidden pivot rows and columns when checking totals', () => {
        const rows = Array.from({ length: 21 }, (_, i) => ({ Region: `R${String(i).padStart(2, '0')}`, Period: `P${String(i).padStart(2, '0')}`, Amount: 1, Unit: i === 20 ? 'lb' : 'kg' }));
        const result = pivot(rows);
        expect(result.rows).toHaveLength(20);
        expect(result.pivotColumns).toHaveLength(15);
        expect(result.grandTotal).toBe(hidden);
        expect(pivot(rows, 'avg').grandTotal).toBe(hidden);
        const hiddenColumn = pivot([...rows.slice(0, 15), { Region: 'R00', Period: 'P99', Amount: 1, Unit: 'lb' }]);
        expect(hiddenColumn.rows[0].Total).toBe(hidden);
        expect(pivot([...rows.slice(0, 15), { Region: 'R00', Period: 'P99', Amount: 1, Unit: 'lb' }], 'avg').rows[0].Total).toBe(hidden);
        const hiddenRow = pivot([...rows.slice(0, 20).map(row => ({ ...row, Period: 'P00' })), { Region: 'R99', Period: 'P00', Amount: 1, Unit: 'lb' }]);
        expect(hiddenRow.columnTotals.P00).toBe(hidden);
        expect(pivot([...rows.slice(0, 20).map(row => ({ ...row, Period: 'P00' })), { Region: 'R99', Period: 'P00', Amount: 1, Unit: 'lb' }], 'avg').columnTotals.P00).toBe(hidden);
    });

    it('weights guarded pivot averages over source rows, not cell averages', () => {
        const rows = [{ Region: 'A', Period: 'P1', Amount: 10, Unit: 'kg' }, { Region: 'A', Period: 'P2', Amount: 20, Unit: 'kg' }, { Region: 'A', Period: 'P2', Amount: 30, Unit: 'kg' }];
        const result = pivot(rows, 'avg');
        expect(result.rows[0].Total).toBe(20);
        expect(result.grandTotal).toBe(20);
    });

    it('localizes suppressed values and prevents unsafe card creation', () => {
        const request = vi.fn();
        render(<GroupByTest rows={[{ Region: 'A', Amount: 2, Unit: 'kg' }, { Region: 'A', Amount: 3, Unit: 'lb' }]} language="English" accentColor="blue" onRequestCard={request} />);
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'Region' } });
        fireEvent.change(selects[3], { target: { value: 'Amount' } });
        expect(screen.getAllByText(getTranslation('aggregation_mixed_units_hidden', 'English')).length).toBeGreaterThan(0);
        expect(screen.getByText(getTranslation('data_query_inferred_unit_label', 'English'))).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: getTranslation('groupby_create_card', 'English') })).not.toBeInTheDocument();
        expect(request).not.toHaveBeenCalled();
    });

    it('renders pivot suppression instead of zero and blocks card creation', () => {
        const request = vi.fn();
        render(<GroupByTest rows={[
            { Region: 'A', Period: 'P1', Amount: 2, Unit: 'kg' },
            { Region: 'A', Period: 'P1', Amount: 3, Unit: 'lb' },
        ]} language="English" accentColor="blue" onRequestCard={request} />);
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'Region' } });
        fireEvent.change(selects[1], { target: { value: 'Period' } });
        fireEvent.change(selects[3], { target: { value: 'Amount' } });
        expect(screen.getAllByText(getTranslation('aggregation_mixed_units_hidden', 'English')).length).toBeGreaterThanOrEqual(4);
        expect(screen.queryByRole('button', { name: getTranslation('groupby_create_card', 'English') })).not.toBeInTheDocument();
        expect(request).not.toHaveBeenCalled();
    });
});
