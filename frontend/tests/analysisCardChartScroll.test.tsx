import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisCardChart } from '../components/analysis-card/AnalysisCardChart';

vi.mock('../components/ChartRenderer', () => ({
    ChartRenderer: () => <canvas data-testid="chart-canvas" />,
}));

describe('AnalysisCardChart', () => {
    it('keeps a long horizontal chart keyboard-scrollable at a readable height', () => {
        const data = Array.from({ length: 27 }, (_, index) => ({ Town: `Town ${index}`, 'Avg Price': 500 - index }));
        render(<AnalysisCardChart
            cardId="average-card"
            language="English"
            chartRendererRef={createRef()}
            displayChartType="horizontal_bar"
            dataForDisplay={data}
            plan={{ title: 'Average Price by Town', description: 'Compare Towns.', chartType: 'bar', aggregation: 'avg', groupByColumn: 'Town', valueColumn: 'Avg Price' }}
            selectedIndices={[]}
            isZoomed={false}
            chartHeight={1106}
            scrollable
            onElementClick={vi.fn()}
            onZoomChange={vi.fn()}
            onClearSelection={vi.fn()}
            onResetZoom={vi.fn()}
        />);

        const region = screen.getByRole('region', { name: 'Scroll within the chart to view all 27 groups.' });
        expect(region).toHaveAttribute('tabindex', '0');
        expect(region).toHaveAttribute('data-export-chart-scroll');
        expect(screen.getByTestId('chart-canvas').parentElement).toHaveStyle({ height: '1106px' });
    });
});
