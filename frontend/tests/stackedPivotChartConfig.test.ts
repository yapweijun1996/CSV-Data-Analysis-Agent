import { describe, expect, it, vi } from 'vitest';
import { createChartConfig } from '../utils/chartConfigFactory';
import { PIVOT_FOLDED_OTHERS_KEY } from '../utils/pivotMatrixCharting';

describe('stacked pivot chart config', () => {
    it('builds one dataset per matrix value column and preserves null cells', () => {
        const config = createChartConfig({
            chartType: 'stacked_column',
            data: [
                { row_label: 'North', Q1: 10, Q2: null, row_total: 10 },
                { row_label: 'South', Q1: 5, Q2: 8, row_total: 13 },
            ],
            plan: {
                chartType: 'stacked_column',
                title: 'Revenue by Region and Quarter',
                description: 'Compare revenue by region and quarter.',
                artifactType: 'pivot_matrix',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'Q1', 'Q2', 'row_total'],
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            selectedIndices: [],
            onElementClick: vi.fn(),
            onZoomChange: vi.fn(),
        });

        expect(config.type).toBe('bar');
        expect(config.data.labels).toEqual(['North', 'South']);
        expect(config.data.datasets).toHaveLength(2);
        expect(config.data.datasets[0]).toMatchObject({
            label: 'Q1',
            data: [10, 5],
            stack: 'pivot-matrix-stack',
        });
        expect(config.data.datasets[1]).toMatchObject({
            label: 'Q2',
            data: [null, 8],
            stack: 'pivot-matrix-stack',
        });
        expect(config.options.plugins.legend.display).toBe(false);
        expect(config.options.scales.x.stacked).toBe(true);
        expect(config.options.scales.y.stacked).toBe(true);
    });

    it('adds pivot-specific tooltip content with the full row details', () => {
        const config = createChartConfig({
            chartType: 'stacked_bar',
            data: [
                { row_label: 'North', Q1: 10, Q2: 15, row_total: 25 },
            ],
            plan: {
                chartType: 'stacked_bar',
                title: 'Revenue by Region and Quarter',
                description: 'Compare revenue by region and quarter.',
                artifactType: 'pivot_matrix',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'Q1', 'Q2', 'row_total'],
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            selectedIndices: [],
            onElementClick: vi.fn(),
            onZoomChange: vi.fn(),
        });

        const tooltipCallbacks = config.options.plugins.tooltip.callbacks;
        expect(tooltipCallbacks.label({
            dataset: { label: 'Q1' },
            raw: 10,
        })).toBe('Q1: 10');
        expect(tooltipCallbacks.afterBody([
            { dataIndex: 0 },
        ])).toEqual([
            'Q1: 10',
            'Q2: 15',
            'Row Total: 25',
        ]);
    });

    it('adds full pivot item details to total-only pivot bar tooltips too', () => {
        const config = createChartConfig({
            chartType: 'bar',
            data: [
                { row_label: 'North', Q1: 10, Q2: 15, row_total: 25 },
            ],
            plan: {
                chartType: 'bar',
                title: 'Revenue by Region and Quarter',
                description: 'Compare revenue by region and quarter.',
                artifactType: 'pivot_matrix',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'Q1', 'Q2', 'row_total'],
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            selectedIndices: [],
            onElementClick: vi.fn(),
            onZoomChange: vi.fn(),
        });

        const tooltipCallbacks = config.options.plugins.tooltip.callbacks;
        expect(tooltipCallbacks.label({
            dataset: { label: 'row_total' },
            raw: 25,
        })).toBe('Row Total: 25');
        expect(tooltipCallbacks.afterBody([
            { dataIndex: 0 },
        ])).toEqual([
            'Q1: 10',
            'Q2: 15',
            'Row Total: 25',
        ]);
    });

    it('falls back to all row fields and humanized labels when matrix columns are unavailable', () => {
        const config = createChartConfig({
            chartType: 'bar',
            data: [
                { row_label: 'Cost of sales', Revenue: 22191666.85, GrossProfit: 11501601.82, TotalValue: 7 },
            ],
            plan: {
                chartType: 'bar',
                title: 'Pivot totals',
                description: 'Pivot totals',
                artifactType: 'pivot_matrix',
                groupByColumn: 'row_label',
                valueColumn: 'TotalValue',
            },
            selectedIndices: [],
            onElementClick: vi.fn(),
            onZoomChange: vi.fn(),
        });

        const tooltipCallbacks = config.options.plugins.tooltip.callbacks;
        expect(tooltipCallbacks.label({
            dataset: { label: 'TotalValue' },
            raw: 7,
        })).toBe('Total Value: 7');
        expect(tooltipCallbacks.afterBody([
            { dataIndex: 0 },
        ])).toEqual([
            'Revenue: 22,191,666.85',
            'Gross Profit: 11,501,601.82',
            'Total Value: 7',
        ]);
    });

    it('shows a readable Others dataset and folded-column note for compressed stacked pivots', () => {
        const config = createChartConfig({
            chartType: 'stacked_bar',
            data: [
                { row_label: 'North', Q1: 10, Q2: 15, [PIVOT_FOLDED_OTHERS_KEY]: 7, row_total: 32 },
            ],
            plan: {
                chartType: 'stacked_bar',
                title: 'Revenue by Region and Quarter',
                description: 'Compare revenue by region and quarter.',
                artifactType: 'pivot_matrix',
                groupByColumn: 'row_label',
                valueColumn: 'row_total',
                artifactMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixColumns: ['row_label', 'Q1', 'Q2', PIVOT_FOLDED_OTHERS_KEY, 'row_total'],
                    matrixValueColumns: ['Q1', 'Q2', PIVOT_FOLDED_OTHERS_KEY],
                    visibleMatrixValueColumns: ['Q1', 'Q2', PIVOT_FOLDED_OTHERS_KEY],
                    foldedMatrixValueColumns: ['Q3', 'Q4'],
                    hiddenMatrixValueColumns: ['Q5'],
                },
            },
            selectedIndices: [],
            onElementClick: vi.fn(),
            onZoomChange: vi.fn(),
        });

        expect(config.data.datasets[2]).toMatchObject({
            label: 'Others',
            data: [7],
        });
        expect(config.options.plugins.tooltip.callbacks.afterBody([
            { dataIndex: 0 },
        ])).toEqual([
            'Q1: 10',
            'Q2: 15',
            'Others: 7',
            'Row Total: 32',
            '2 more columns folded into Others',
            'Hidden series: Q5',
        ]);
    });
});
