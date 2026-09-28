import { describe, expect, it } from 'vitest';
import { getAvailableChartTypes, getRecommendedPivotChartType } from '../utils/chartTypeUtils';

describe('getAvailableChartTypes', () => {
    it('does not offer part-to-whole charts for average metrics', () => {
        const types = getAvailableChartTypes({
            chartType: 'pie',
            aggregation: 'avg',
            groupByColumn: 'Town',
            valueColumn: 'Avg Price',
            title: 'Average Price by Town',
            description: 'Compare Town averages.',
        }, [
            { Town: 'A', 'Avg Price': 500 },
            { Town: 'B', 'Avg Price': 400 },
        ]);

        expect(types).toEqual(['bar', 'horizontal_bar', 'line']);
    });

    it('preserves area charts for average trends over time', () => {
        const types = getAvailableChartTypes({
            chartType: 'area',
            aggregation: 'avg',
            groupByColumn: 'month',
            valueColumn: 'avg_price',
            title: 'Average Price by Month',
            description: 'Monthly average trend.',
        }, [{ month: '2026-01', avg_price: 500 }]);

        expect(types[0]).toBe('area');
        expect(types).not.toContain('pie');
    });

    it('does not stack non-additive pivot measures', () => {
        const plan = {
            chartType: 'stacked_bar' as const,
            artifactType: 'pivot_matrix' as const,
            aggregation: 'avg' as const,
            groupByColumn: 'Town',
            valueColumn: 'Avg Price',
            title: 'Average Price by Town',
            description: 'Compare Town averages.',
            artifactMetadata: {
                artifactType: 'pivot_matrix' as const,
                matrixColumns: ['Town', 'Q1', 'Q2', 'Avg Price'],
                matrixValueColumns: ['Q1', 'Q2'],
            },
        };
        const rows = [{ Town: 'A', Q1: 500, Q2: 450, 'Avg Price': 475 }];

        expect(getRecommendedPivotChartType(plan, rows)).toBe('bar');
        expect(getAvailableChartTypes(plan, rows)).toEqual(['bar', 'horizontal_bar', 'line']);
    });

    it('returns stacked-first options for multi-series pivot tables', () => {
        const types = getAvailableChartTypes(
            {
                chartType: 'stacked_bar',
                artifactType: 'pivot_matrix',
                aggregation: 'sum',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                title: 'Pivot',
                description: 'Pivot chart',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'Q1', 'Q2', 'row_total'],
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            [
                { row_label: 'North', Q1: 120, Q2: 80, row_total: 200 },
                { row_label: 'South', Q1: 90, Q2: null, row_total: 90 },
            ],
        );

        expect(types).toEqual(['stacked_bar', 'stacked_column', 'bar', 'line']);
    });

    it('keeps row-only pivot options focused on safer total-only charts when totals include negatives', () => {
        const types = getAvailableChartTypes(
            {
                chartType: 'bar',
                artifactType: 'pivot_matrix',
                aggregation: 'sum',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                title: 'Pivot',
                description: 'Pivot chart',
            },
            [
                { row_label: 'A', row_total: 120 },
                { row_label: 'B', row_total: 0 },
                { row_label: 'C', row_total: -20 },
                { row_label: 'D', row_total: 30 },
            ],
        );

        expect(types).toEqual(['bar', 'line']);
    });

    it('chooses stacked bar as the default for long or dense 2d pivots', () => {
        const chartType = getRecommendedPivotChartType(
            {
                chartType: 'bar',
                artifactType: 'pivot_matrix',
                aggregation: 'sum',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                title: 'Pivot',
                description: 'Pivot chart',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'Q1', 'Q2', 'row_total'],
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            [
                { row_label: 'Very Long Regional Business Unit Name', Q1: 120, Q2: 80, row_total: 200 },
                { row_label: 'South', Q1: 90, Q2: 20, row_total: 110 },
            ],
        );

        expect(chartType).toBe('stacked_bar');
    });

    it('keeps wide 2d pivots in compressed stacked mode by default', () => {
        const chartType = getRecommendedPivotChartType(
            {
                chartType: 'stacked_bar',
                artifactType: 'pivot_matrix',
                aggregation: 'sum',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                title: 'Wide Pivot',
                description: 'Wide pivot chart',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'row_total'],
                    matrixValueColumns: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'],
                },
            },
            [
                { row_label: 'North', C1: 10, C2: 9, C3: 8, C4: 7, C5: 6, C6: 5, C7: 4, C8: 3, C9: 2, row_total: 54 },
            ],
        );

        expect(chartType).toBe('stacked_column');
    });
});
