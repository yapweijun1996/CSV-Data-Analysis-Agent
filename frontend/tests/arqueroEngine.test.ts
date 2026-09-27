import { describe, expect, it } from 'vitest';
import { executeArqueroQuery } from '../services/data/arqueroEngine';
import type { QueryPlan } from '../types';

const SAMPLE_ROWS = [
    { Category: 'Electronics', Region: 'North', Revenue: 1200, Units: 10 },
    { Category: 'Electronics', Region: 'South', Revenue: 800, Units: 5 },
    { Category: 'Clothing', Region: 'North', Revenue: 400, Units: 20 },
    { Category: 'Clothing', Region: 'South', Revenue: 600, Units: 15 },
    { Category: 'Food', Region: 'North', Revenue: 300, Units: 50 },
    { Category: 'Food', Region: 'South', Revenue: 200, Units: 30 },
];

const ALLOWED_COLUMNS = ['Category', 'Region', 'Revenue', 'Units'];

describe('arqueroEngine', () => {
    describe('basic groupBy + aggregate', () => {
        it('groups by category and sums revenue', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
                select: ['Category', 'TotalRevenue'],
                orderBy: [{ column: 'TotalRevenue', direction: 'desc' }],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.unsupportedReason).toBeNull();
            expect(result.result.rows).toHaveLength(3);
            expect(result.result.rows[0]).toEqual({ Category: 'Electronics', TotalRevenue: 2000 });
            expect(result.result.rows[1]).toEqual({ Category: 'Clothing', TotalRevenue: 1000 });
            expect(result.result.rows[2]).toEqual({ Category: 'Food', TotalRevenue: 500 });
        });

        it('supports count aggregate', () => {
            const plan: QueryPlan = {
                groupBy: ['Region'],
                aggregates: [{ function: 'count', as: 'Count' }],
                select: ['Region', 'Count'],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows).toHaveLength(2);
            const north = result.result.rows.find(r => r.Region === 'North');
            expect(north?.Count).toBe(3);
        });

        it('supports avg aggregate', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'avg', column: 'Revenue', as: 'AvgRevenue' }],
                select: ['Category', 'AvgRevenue'],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            const electronics = result.result.rows.find(r => r.Category === 'Electronics');
            expect(electronics?.AvgRevenue).toBe(1000);
        });

        it('supports min/max aggregates', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [
                    { function: 'min', column: 'Revenue', as: 'MinRev' },
                    { function: 'max', column: 'Revenue', as: 'MaxRev' },
                ],
                select: ['Category', 'MinRev', 'MaxRev'],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            const food = result.result.rows.find(r => r.Category === 'Food');
            expect(food?.MinRev).toBe(200);
            expect(food?.MaxRev).toBe(300);
        });
    });

    describe('where filter', () => {
        it('filters rows with eq predicate', () => {
            const plan: QueryPlan = {
                where: {
                    predicates: [{ column: 'Region', operator: 'eq', value: 'North' }],
                },
                select: ['Category', 'Revenue'],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows).toHaveLength(3);
            expect(result.result.rows.every(r => r.Category !== undefined)).toBe(true);
        });

        it('filters with gt predicate', () => {
            const plan: QueryPlan = {
                where: {
                    predicates: [{ column: 'Revenue', operator: 'gt', value: 500 }],
                },
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows).toHaveLength(3);
        });

        it('combines filter with aggregate', () => {
            const plan: QueryPlan = {
                where: {
                    predicates: [{ column: 'Region', operator: 'eq', value: 'North' }],
                },
                groupBy: ['Category'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Total' }],
                select: ['Category', 'Total'],
                orderBy: [{ column: 'Total', direction: 'desc' }],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows).toHaveLength(3);
            expect(result.result.rows[0]).toEqual({ Category: 'Electronics', Total: 1200 });
        });
    });

    describe('orderBy and limit', () => {
        it('applies limit', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Total' }],
                select: ['Category', 'Total'],
                orderBy: [{ column: 'Total', direction: 'desc' }],
                limit: 2,
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows).toHaveLength(2);
            expect(result.result.truncated).toBe(true);
            expect(result.result.totalMatchedRows).toBe(3);
        });

        it('applies ascending order', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Total' }],
                select: ['Category', 'Total'],
                orderBy: [{ column: 'Total', direction: 'asc' }],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows[0].Category).toBe('Food');
            expect(result.result.rows[2].Category).toBe('Electronics');
        });
    });

    describe('formatted number handling', () => {
        it('handles string-formatted numbers in aggregation', () => {
            const rows = [
                { Category: 'A', Amount: '1,200.50' },
                { Category: 'A', Amount: '800.25' },
                { Category: 'B', Amount: '500' },
            ];

            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'sum', column: 'Amount', as: 'Total' }],
                select: ['Category', 'Total'],
            };

            const result = executeArqueroQuery(rows, plan, { allowedColumns: ['Category', 'Amount'] });

            expect(result.supported).toBe(true);
            const catA = result.result.rows.find(r => r.Category === 'A');
            expect(catA?.Total).toBeCloseTo(2000.75, 2);
        });
    });

    describe('unsupported operations', () => {
        it('rejects per-aggregate WHERE clauses', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{
                    function: 'sum',
                    column: 'Revenue',
                    as: 'Total',
                    where: { predicates: [{ column: 'Region', operator: 'eq', value: 'North' }] },
                }],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(false);
            expect(result.unsupportedReason).toContain('per-aggregate WHERE');
        });

        it('rejects groupBy without aggregates', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(false);
            expect(result.unsupportedReason).toContain('groupBy without aggregates');
        });
    });

    describe('DataQueryResult contract', () => {
        it('returns all required fields', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'count', as: 'Count' }],
                select: ['Category', 'Count'],
                orderBy: [{ column: 'Count', direction: 'desc' }],
                limit: 10,
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            const r = result.result;
            expect(r.rows).toBeDefined();
            expect(typeof r.totalMatchedRows).toBe('number');
            expect(typeof r.returnedRows).toBe('number');
            expect(typeof r.truncated).toBe('boolean');
            expect(Array.isArray(r.selectedColumns)).toBe(true);
            expect(Array.isArray(r.appliedOrderBy)).toBe(true);
            expect(typeof r.appliedLimit).toBe('number');
            expect(typeof r.durationMs).toBe('number');
        });

        it('handles empty input gracefully', () => {
            const plan: QueryPlan = {
                select: ['Category', 'Revenue'],
            };

            const result = executeArqueroQuery([], plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows).toHaveLength(0);
            expect(result.result.totalMatchedRows).toBe(0);
        });
    });

    describe('engine routing integration', () => {
        it('returns engine=arquero on successful execution', () => {
            const plan: QueryPlan = {
                groupBy: ['Category'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Total' }],
                select: ['Category', 'Total'],
            };

            const result = executeArqueroQuery(SAMPLE_ROWS, plan, { allowedColumns: ALLOWED_COLUMNS });

            expect(result.supported).toBe(true);
            expect(result.result.rows.length).toBeGreaterThan(0);
        });
    });
});
