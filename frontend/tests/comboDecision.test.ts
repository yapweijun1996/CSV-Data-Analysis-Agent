// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveStructuredComboDecision } from '../services/agent/planning/comboDecision';

const columns = [
    { name: 'Project', type: 'categorical', uniqueValues: 12 },
    { name: 'Month', type: 'date', uniqueValues: 6 },
    { name: 'Revenue', type: 'numerical' },
    { name: 'Cost', type: 'numerical' },
] as const;

describe('comboDecision', () => {
    it('keeps a valid combo unchanged', () => {
        const result = resolveStructuredComboDecision({
            chartType: 'combo',
            bindings: {
                groupByColumn: 'Project',
                valueColumn: 'Revenue',
                secondaryValueColumn: 'Cost',
            },
            aggregation: 'sum',
            secondaryAggregation: 'avg',
            columns: [...columns],
            isSqlFirst: false,
        });

        expect(result).toMatchObject({
            chartType: 'combo',
            resolution: 'unchanged',
            reason: null,
            bindings: {
                groupByColumn: 'Project',
                valueColumn: 'Revenue',
                secondaryValueColumn: 'Cost',
            },
        });
    });

    it('repairs combo bindings from query aliases and strips irrelevant y-axis noise', () => {
        const result = resolveStructuredComboDecision({
            chartType: 'combo',
            bindings: {
                yValueColumn: 'Revenue',
            },
            aggregation: 'sum',
            secondaryAggregation: 'avg',
            query: {
                groupBy: ['Project'],
                aggregates: [
                    { function: 'sum', column: 'Revenue', as: 'TotalRevenue' },
                    { function: 'avg', column: 'Cost', as: 'AverageCost' },
                ],
            },
            columns: [...columns],
            isSqlFirst: true,
        });

        expect(result).toMatchObject({
            chartType: 'combo',
            resolution: 'repaired',
            reason: null,
            bindings: {
                groupByColumn: 'Project',
                valueColumn: 'TotalRevenue',
                secondaryValueColumn: 'AverageCost',
                xValueColumn: undefined,
                yValueColumn: undefined,
            },
        });
    });

    it('downgrades single-alias SQL combo plans to bar', () => {
        const result = resolveStructuredComboDecision({
            chartType: 'combo',
            bindings: {
                groupByColumn: 'Project',
            },
            aggregation: 'sum',
            query: {
                groupBy: ['Project'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
            },
            columns: [...columns],
            isSqlFirst: true,
        });

        expect(result).toMatchObject({
            chartType: 'bar',
            resolution: 'downgraded',
            reason: 'single_stable_alias',
            bindings: {
                groupByColumn: 'Project',
                valueColumn: 'TotalRevenue',
                secondaryValueColumn: undefined,
            },
        });
    });

    it('downgrades incomplete temporal comparisons to line', () => {
        const result = resolveStructuredComboDecision({
            chartType: 'combo',
            bindings: {
                groupByColumn: 'Month',
                valueColumn: 'Revenue',
            },
            aggregation: 'sum',
            columns: [...columns],
            isSqlFirst: false,
        });

        expect(result).toMatchObject({
            chartType: 'line',
            resolution: 'downgraded',
            reason: 'temporal_comparison',
        });
    });

    it('downgrades incomplete non-temporal comparisons to bar', () => {
        const result = resolveStructuredComboDecision({
            chartType: 'combo',
            bindings: {
                groupByColumn: 'Project',
                valueColumn: 'Revenue',
            },
            aggregation: 'sum',
            columns: [...columns],
            isSqlFirst: false,
        });

        expect(result).toMatchObject({
            chartType: 'bar',
            resolution: 'downgraded',
            reason: 'non_temporal_comparison',
        });
    });
});
