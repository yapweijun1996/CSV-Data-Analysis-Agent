import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisCardControls } from '../components/analysis-card/AnalysisCardControls';

afterEach(() => {
    cleanup();
});

describe('AnalysisCardControls', () => {
    it('shows pivot chart quick-select buttons and forwards the selected type', () => {
        const onChartTypeSelect = vi.fn();

        render(
            <AnalysisCardControls
                cardId="pivot-card"
                isDataVisible={true}
                plan={{
                    title: 'Pivot',
                    description: 'Pivot chart',
                    chartType: 'stacked_column',
                    artifactType: 'pivot_matrix',
                    artifactMetadata: {
                        dataTableFirst: true,
                    },
                } as any}
                aggregatedData={[
                    { row_label: 'A', Q1: 60, Q2: 40, row_total: 100 },
                    { row_label: 'B', Q1: 10, Q2: 30, row_total: 40 },
                ]}
                availableChartTypes={['stacked_bar', 'stacked_column', 'bar', 'line']}
                displayChartType="stacked_column"
                topN={null}
                hideOthers={false}
                hideZeroValueRows={false}
                zeroValueRowCount={0}
                pivotColumnTopN={8}
                pivotHideOtherColumns={false}
                pivotFoldedColumnCount={2}
                showPivotColumnControls={true}
                onToggleDataVisibility={vi.fn()}
                onChartTypeSelect={onChartTypeSelect}
                onTopNChange={vi.fn()}
                onHideOthersChange={vi.fn()}
                onHideZeroValueRowsChange={vi.fn()}
                onPivotColumnTopNChange={vi.fn()}
                onPivotHideOtherColumnsChange={vi.fn()}
            />,
        );

        expect(screen.getByText('Pivot chart')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /hide full data table/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /stacked column/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByLabelText('Visible pivot columns')).toHaveValue('8');
        expect(screen.getByLabelText(/hide column "others"/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /stacked bar/i }));
        expect(onChartTypeSelect).toHaveBeenCalledWith('stacked_bar');
    });

    it('does not show pivot chart quick-select buttons for non-pivot cards', () => {
        render(
            <AnalysisCardControls
                cardId="bar-card"
                isDataVisible={true}
                plan={{
                    title: 'Revenue by Region',
                    description: 'Standard chart',
                    chartType: 'bar',
                } as any}
                aggregatedData={[
                    { Region: 'North', Revenue: 100 },
                    { Region: 'South', Revenue: 40 },
                ]}
                availableChartTypes={['bar', 'line', 'pie']}
                displayChartType="bar"
                topN={null}
                hideOthers={false}
                hideZeroValueRows={false}
                zeroValueRowCount={0}
                pivotColumnTopN={8}
                pivotHideOtherColumns={false}
                pivotFoldedColumnCount={0}
                showPivotColumnControls={false}
                onToggleDataVisibility={vi.fn()}
                onChartTypeSelect={vi.fn()}
                onTopNChange={vi.fn()}
                onHideOthersChange={vi.fn()}
                onHideZeroValueRowsChange={vi.fn()}
                onPivotColumnTopNChange={vi.fn()}
                onPivotHideOtherColumnsChange={vi.fn()}
            />,
        );

        expect(screen.queryByText('Pivot chart')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Visible pivot columns')).not.toBeInTheDocument();
    });

    it('does not offer a fabricated Others bucket for average cards', () => {
        render(<AnalysisCardControls
            cardId="average-card"
            isDataVisible={true}
            plan={{ title: 'Average Price by Town', chartType: 'bar', aggregation: 'avg', groupByColumn: 'Town', valueColumn: 'Avg Price' } as any}
            aggregatedData={Array.from({ length: 6 }, (_, index) => ({ Town: `Town ${index}`, 'Avg Price': 500 - index }))}
            availableChartTypes={['bar', 'horizontal_bar', 'line']}
            displayChartType="bar"
            topN={5}
            hideOthers={true}
            hideZeroValueRows={false}
            zeroValueRowCount={0}
            pivotColumnTopN={null}
            pivotHideOtherColumns={false}
            pivotFoldedColumnCount={0}
            showPivotColumnControls={false}
            onToggleDataVisibility={vi.fn()}
            onChartTypeSelect={vi.fn()}
            onTopNChange={vi.fn()}
            onHideOthersChange={vi.fn()}
            onHideZeroValueRowsChange={vi.fn()}
            onPivotColumnTopNChange={vi.fn()}
            onPivotHideOtherColumnsChange={vi.fn()}
        />);

        expect(screen.getByLabelText('Visible categories')).toHaveValue('5');
        expect(screen.queryByLabelText('Hide "Others"')).not.toBeInTheDocument();
    });
});
