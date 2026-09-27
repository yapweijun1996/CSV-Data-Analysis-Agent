import { describe, expect, it } from 'vitest';
import { createBarChartConfig } from '../utils/chartConfigs/bar';
import { createPieChartConfig } from '../utils/chartConfigs/pie';
import { formatChartDataLabel } from '../utils/chartConfigs/common';

const baseProps = {
    chartType: 'bar' as const,
    data: [
        { 'Flat Type': '4 ROOM', 'Resale Price': 695610403.8 },
        { 'Flat Type': '5 ROOM', 'Resale Price': 603789953 },
    ],
    plan: {
        chartType: 'bar' as const,
        title: 'Resale Price by Flat Type',
        description: 'Compare total resale price across flat types.',
        groupByColumn: 'Flat Type',
        valueColumn: 'Resale Price',
        aggregation: 'sum' as const,
    },
    selectedIndices: [],
    onElementClick: () => undefined,
    onZoomChange: () => undefined,
    showDataLabels: true,
};

describe('chart data labels', () => {
    it('keeps full two-decimal labels on wide charts and uses a readable compact fallback on narrow charts', () => {
        expect(formatChartDataLabel(603789953, 700)).toBe('603,789,953.00');
        expect(formatChartDataLabel(603789953, 390)).toBe('603.79M');
    });

    it('reserves label padding for bar and pie layouts', () => {
        const bar = createBarChartConfig(baseProps);
        const pie = createPieChartConfig({ ...baseProps, chartType: 'pie' });

        expect(bar.options.layout.padding.top).toBeGreaterThan(0);
        expect(bar.options.layout.padding.right).toBeGreaterThan(0);
        expect(pie.options.layout.padding.left).toBeGreaterThanOrEqual(80);
        expect(pie.options.plugins.datalabels.clip).toBe(false);
    });

    it('limits narrow vertical bar labels to the largest values to prevent overlap', () => {
        const bar = createBarChartConfig({
            ...baseProps,
            data: [
                { 'Flat Type': 'A', 'Resale Price': 64_685_000 },
                { 'Flat Type': 'B', 'Resale Price': 2_079_855 },
                { 'Flat Type': 'C', 'Resale Price': 1_287_768 },
                { 'Flat Type': 'D', 'Resale Price': 907_900 },
                { 'Flat Type': 'E', 'Resale Price': 110_670 },
            ],
        });
        const display = bar.options.plugins.datalabels.display;

        expect(display({ chart: { width: 390 }, dataIndex: 0 })).toBe(true);
        expect(display({ chart: { width: 390 }, dataIndex: 1 })).toBe(true);
        expect(display({ chart: { width: 390 }, dataIndex: 2 })).toBe(false);
        expect(display({ chart: { width: 700 }, dataIndex: 4 })).toBe(true);
    });

    it('suppresses tiny pie-slice labels while keeping meaningful segments visible', () => {
        const pie = createPieChartConfig({ ...baseProps, chartType: 'pie' });
        const display = pie.options.plugins.datalabels.display;
        const dataset = { data: [695_610_403.8, 603_789_953, 21_261_664] };

        expect(display({ chart: { width: 800 }, dataIndex: 0, dataset })).toBe(true);
        expect(display({ chart: { width: 800 }, dataIndex: 2, dataset })).toBe(false);
        expect(display({ chart: { width: 390 }, dataIndex: 2, dataset })).toBe(false);
    });
});
