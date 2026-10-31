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
    });

    it('uses contributing numeric counts for guarded averages and leaves count independent', () => {
        const rows = [{ Region: 'A', Amount: 10, Unit: 'kg' }, { Region: 'A', Amount: 'bad', Unit: '' }, { Region: 'B', Amount: 20, Unit: 'kg' }, { Region: 'B', Amount: 30, Unit: 'kg' }];
        expect(flat(rows, 'avg').total).toBe(20);
        expect(flat(rows, 'count').total).toBe(4);
        expect(flat([{ Region: 'A', Amount: 1, Unit: 'kg' }, { Region: 'A', Amount: 2, Unit: 'lb' }], 'count').total).toBe(2);
    });

    it('preserves unitless aggregation behavior', () => {
        const rows = [{ Region: 'A', Amount: 10 }, { Region: 'A', Amount: 20 }, { Region: 'B', Amount: 60 }];
        expect(flat(rows, 'avg').total).toBe(75);
    });

    it('does not infer an ambiguous companion', () => {
        expect(flat([{ Region: 'A', Amount: 2, Unit: 'kg', Currency: 'USD' }, { Region: 'A', Amount: 3, Unit: 'lb', Currency: 'EUR' }]).total).toBe(5);
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
        const hiddenColumn = pivot([...rows.slice(0, 15), { Region: 'R00', Period: 'P99', Amount: 1, Unit: 'lb' }]);
        expect(hiddenColumn.rows[0].Total).toBe(hidden);
        const hiddenRow = pivot([...rows.slice(0, 20).map(row => ({ ...row, Period: 'P00' })), { Region: 'R99', Period: 'P00', Amount: 1, Unit: 'lb' }]);
        expect(hiddenRow.columnTotals.P00).toBe(hidden);
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
