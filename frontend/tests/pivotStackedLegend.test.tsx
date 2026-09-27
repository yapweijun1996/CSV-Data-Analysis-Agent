import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PivotStackedLegend } from '../components/analysis-card/PivotStackedLegend';
import { PIVOT_FOLDED_OTHERS_KEY } from '../utils/pivotMatrixCharting';

describe('PivotStackedLegend', () => {
    afterEach(() => {
        cleanup();
    });

    it('sorts visible items by contribution and can expand collapsed legend items', () => {
        render(
            <PivotStackedLegend
                data={[
                    {
                        row_label: 'North',
                        Revenue: 100,
                        Expenses: -60,
                        GrossProfit: 40,
                        Tax: -10,
                        Fees: -5,
                        Misc: 4,
                        Bonus: 3,
                        Travel: 2,
                        [PIVOT_FOLDED_OTHERS_KEY]: 1,
                        row_total: 75,
                    },
                ]}
                plan={{
                    chartType: 'stacked_bar',
                    title: 'Pivot',
                    description: 'Pivot',
                    artifactType: 'pivot_matrix',
                    groupByColumn: 'row_label',
                    valueColumn: 'row_total',
                    artifactMetadata: {
                        artifactType: 'pivot_matrix',
                        matrixValueColumns: [
                            'Revenue',
                            'Expenses',
                            'GrossProfit',
                            'Tax',
                            'Fees',
                            'Misc',
                            'Bonus',
                            'Travel',
                            PIVOT_FOLDED_OTHERS_KEY,
                        ],
                    },
                }}
                hiddenSeriesLabels={[]}
                onSeriesToggle={() => undefined}
                onResetHiddenSeries={() => undefined}
            />,
        );

        const rows = screen.getAllByText(/\(.+%\)/i);
        expect(rows).toHaveLength(6);
        expect(screen.getByText('Revenue')).toBeInTheDocument();
        expect(screen.queryByText('Travel')).not.toBeInTheDocument();
        expect(screen.queryByText('Others')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /show all 9 items/i }));

        expect(screen.getByText('Travel')).toBeInTheDocument();
        expect(screen.getByText('Others')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /collapse legend/i })).toHaveAttribute('aria-expanded', 'true');
    });

    it('filters legend items by search and toggles hidden series labels on click', () => {
        const onSeriesToggle = vi.fn();

        render(
            <PivotStackedLegend
                data={[
                    {
                        row_label: 'North',
                        Revenue: 100,
                        Expenses: -60,
                        GrossProfit: 40,
                        row_total: 80,
                    },
                ]}
                plan={{
                    chartType: 'stacked_bar',
                    title: 'Pivot',
                    description: 'Pivot',
                    artifactType: 'pivot_matrix',
                    groupByColumn: 'row_label',
                    valueColumn: 'row_total',
                    artifactMetadata: {
                        artifactType: 'pivot_matrix',
                        matrixValueColumns: ['Revenue', 'Expenses', 'GrossProfit'],
                    },
                }}
                hiddenSeriesLabels={['Expenses']}
                onSeriesToggle={onSeriesToggle}
                onResetHiddenSeries={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole('searchbox', { name: /search legend items/i }), {
            target: { value: 'gross' },
        });

        expect(screen.getByText('GrossProfit')).toBeInTheDocument();
        expect(screen.queryByText('Revenue')).not.toBeInTheDocument();

        fireEvent.change(screen.getByRole('searchbox', { name: /search legend items/i }), {
            target: { value: '' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Expenses/i }));
        expect(onSeriesToggle).toHaveBeenCalledWith('Expenses');
    });

    it('shows a reset button when some series are hidden', () => {
        const onResetHiddenSeries = vi.fn();

        render(
            <PivotStackedLegend
                data={[
                    { row_label: 'North', Revenue: 100, Expenses: -60, row_total: 40 },
                ]}
                plan={{
                    chartType: 'stacked_bar',
                    title: 'Pivot',
                    description: 'Pivot',
                    artifactType: 'pivot_matrix',
                    groupByColumn: 'row_label',
                    valueColumn: 'row_total',
                    artifactMetadata: {
                        artifactType: 'pivot_matrix',
                        matrixValueColumns: ['Revenue', 'Expenses'],
                    },
                }}
                hiddenSeriesLabels={['Expenses']}
                onSeriesToggle={() => undefined}
                onResetHiddenSeries={onResetHiddenSeries}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /reset hidden series/i }));
        expect(onResetHiddenSeries).toHaveBeenCalledTimes(1);
    });
});
