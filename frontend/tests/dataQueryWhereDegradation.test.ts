// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { executeDataQuery } from '../services/agent/execution/dataQueryExecutor';

const sampleRows = [
    { Region: 'East', Revenue: 100, Cost: 40 },
    { Region: 'West', Revenue: 200, Cost: 80 },
    { Region: 'East', Revenue: 150, Cost: 60 },
];

describe('dataQueryExecutor where-clause degradation safety (Ticket 4)', () => {
    it('throws when the only where predicate references a missing column', () => {
        expect(() =>
            executeDataQuery(sampleRows, {
                where: {
                    predicates: [
                        { column: 'NonExistentColumn', operator: 'eq', value: 'foo' },
                    ],
                },
            }),
        ).toThrow(/missing from the dataset/i);
    });

    it('throws when all where group predicates reference missing columns', () => {
        expect(() =>
            executeDataQuery(sampleRows, {
                where: {
                    groups: [
                        {
                            predicates: [
                                { column: 'BadCol1', operator: 'eq', value: 'x' },
                                { column: 'BadCol2', operator: 'gt', value: 10 },
                            ],
                        },
                    ],
                },
            }),
        ).toThrow(/missing from the dataset/i);
    });

    it('allows partial where when at least one predicate resolves', () => {
        const result = executeDataQuery(sampleRows, {
            where: {
                predicates: [
                    { column: 'Region', operator: 'eq', value: 'East' },
                    { column: 'GhostColumn', operator: 'eq', value: 'nope' },
                ],
            },
        });
        // Only East rows survive
        expect(result.rows.every(r => r.Region === 'East')).toBe(true);
        expect(result.totalMatchedRows).toBe(2);
    });

    it('passes through when where is undefined (no filter intended)', () => {
        const result = executeDataQuery(sampleRows, {});
        expect(result.totalMatchedRows).toBe(3);
    });

    it('passes through when where has valid predicates', () => {
        const result = executeDataQuery(sampleRows, {
            where: {
                predicates: [
                    { column: 'Region', operator: 'eq', value: 'West' },
                ],
            },
        });
        expect(result.totalMatchedRows).toBe(1);
        expect(result.rows[0].Region).toBe('West');
    });

    it('preserves aggregate values when select only lists the grouping column', () => {
        const result = executeDataQuery(sampleRows, {
            select: ['Region'],
            groupBy: ['Region'],
            aggregates: [
                { function: 'sum', column: 'Revenue', as: 'total_revenue' },
                { function: 'sum', column: 'Cost', as: 'total_cost' },
            ],
        });

        expect(result.selectedColumns).toEqual(['Region', 'total_revenue', 'total_cost']);
        expect(result.rows).toEqual([
            { Region: 'East', total_revenue: 250, total_cost: 100 },
            { Region: 'West', total_revenue: 200, total_cost: 80 },
        ]);
    });

    it('throws when mixed predicates+groups all reference missing columns', () => {
        expect(() =>
            executeDataQuery(sampleRows, {
                where: {
                    predicates: [
                        { column: 'Missing1', operator: 'eq', value: 'a' },
                    ],
                    groups: [
                        {
                            predicates: [
                                { column: 'Missing2', operator: 'gt', value: 5 },
                            ],
                        },
                    ],
                },
            }),
        ).toThrow(/missing from the dataset/i);
    });

    it('applies shared predicates together with one matching OR group', () => {
        const rows = [
            { Region: 'East', Revenue: 100, Cost: 40, Month: '2020-01' },
            { Region: 'West', Revenue: 200, Cost: 80, Month: '2020-01' },
            { Region: 'East', Revenue: 150, Cost: 60, Month: '2025-01' },
            { Region: 'East', Revenue: 175, Cost: 70, Month: '2024-01' },
        ];
        const result = executeDataQuery(rows, {
            where: {
                predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
                groups: [
                    { predicates: [{ column: 'Month', operator: 'eq', value: '2020-01' }] },
                    { predicates: [{ column: 'Month', operator: 'eq', value: '2025-01' }] },
                ],
            },
        });

        expect(result.rows).toEqual([
            rows[0],
            rows[2],
        ]);
    });
});
