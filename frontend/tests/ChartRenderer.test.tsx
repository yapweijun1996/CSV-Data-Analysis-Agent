import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartRenderer } from '../components/ChartRenderer';

const { chartConstructorMock, destroyMock, updateMock, createChartConfigMock } = vi.hoisted(() => ({
    chartConstructorMock: vi.fn(),
    destroyMock: vi.fn(),
    updateMock: vi.fn(),
    createChartConfigMock: vi.fn(),
}));

vi.mock('chart.js/auto', () => ({
    default: chartConstructorMock,
}));

vi.mock('../hooks/useChartJs', () => ({
    useChartJs: () => undefined,
}));

vi.mock('../utils/chartConfigFactory', () => ({
    createChartConfig: createChartConfigMock,
}));

describe('ChartRenderer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        destroyMock.mockReset();
        updateMock.mockReset();

        chartConstructorMock.mockImplementation(() => ({
            destroy: destroyMock,
            update: updateMock,
            data: { labels: [], datasets: [] },
            options: {},
            resetZoom: vi.fn(),
        }));

        createChartConfigMock.mockImplementation(({ selectedIndices }: { selectedIndices: number[] }) => ({
            type: 'bar',
            data: {
                labels: ['Alpha', 'Beta'],
                datasets: [{
                    label: 'count',
                    data: [10, 20],
                    backgroundColor: selectedIndices.length > 0 ? ['#3b82f6', 'rgba(107, 114, 128, 0.2)'] : ['#4e79a780', '#f28e2c80'],
                    borderColor: selectedIndices.length > 0 ? ['#2563eb', 'rgba(107, 114, 128, 0.5)'] : ['#4e79a7B3', '#f28e2cB3'],
                }],
            },
            options: {
                animation: { duration: 0 },
                onClick: vi.fn(),
                plugins: { legend: { display: false } },
                scales: { x: {}, y: {} },
                layout: { padding: { top: 24, right: 96, bottom: 16, left: 16 } },
            },
        }));

        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    });

    it('updates selection styling without recreating the chart instance', () => {
        const plan = { chartType: 'bar', groupByColumn: 'label', valueColumn: 'count', title: 'Demo' } as any;
        const data = [
            { label: 'Alpha', count: 10 },
            { label: 'Beta', count: 20 },
        ];

        const { rerender } = render(
            <ChartRenderer
                chartType="bar"
                data={data}
                plan={plan}
                selectedIndices={[]}
                onElementClick={vi.fn()}
                onZoomChange={vi.fn()}
                disableAnimation
            />,
        );

        expect(chartConstructorMock).toHaveBeenCalledTimes(1);

        rerender(
            <ChartRenderer
                chartType="bar"
                data={data}
                plan={plan}
                selectedIndices={[0]}
                onElementClick={vi.fn()}
                onZoomChange={vi.fn()}
                disableAnimation
            />,
        );

        expect(chartConstructorMock).toHaveBeenCalledTimes(1);
        expect(destroyMock).not.toHaveBeenCalled();
        expect(updateMock).toHaveBeenLastCalledWith('none');
        expect(chartConstructorMock.mock.results[0]?.value.options.layout).toEqual({
            padding: { top: 24, right: 96, bottom: 16, left: 16 },
        });
    });

    it('updates the chart in-place when dataset changes without recreating the instance', () => {
        const plan = { chartType: 'bar', groupByColumn: 'label', valueColumn: 'count', title: 'Demo' } as any;
        const { rerender } = render(
            <ChartRenderer
                chartType="bar"
                data={[{ label: 'Alpha', count: 10 }]}
                plan={plan}
                selectedIndices={[]}
                onElementClick={vi.fn()}
                onZoomChange={vi.fn()}
                disableAnimation
            />,
        );

        rerender(
            <ChartRenderer
                chartType="bar"
                data={[{ label: 'Alpha', count: 10 }, { label: 'Beta', count: 20 }]}
                plan={plan}
                selectedIndices={[]}
                onElementClick={vi.fn()}
                onZoomChange={vi.fn()}
                disableAnimation
            />,
        );

        // Chart type unchanged → no destroy/recreate, incremental update only
        expect(chartConstructorMock).toHaveBeenCalledTimes(1);
        expect(destroyMock).not.toHaveBeenCalled();
        expect(updateMock).toHaveBeenLastCalledWith('none');
    });
});
