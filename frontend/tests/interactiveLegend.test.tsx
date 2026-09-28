import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InteractiveLegend } from '../components/analysis-card/InteractiveLegend';

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: { settings: { language: string } }) => unknown) =>
        selector({ settings: { language: 'English' } }),
}));

afterEach(cleanup);

describe('InteractiveLegend', () => {
    const props = {
        data: [{ Town: 'Punggol', 'Avg Price': 500 }],
        total: 1000,
        groupByKey: 'Town',
        valueKey: 'Avg Price',
        hiddenLabels: [],
        onLabelClick: vi.fn(),
    };

    it('does not show a share percentage for a non-additive average', () => {
        render(<InteractiveLegend {...props} showPercentage={false} />);

        expect(screen.getByRole('button', { name: /Punggol 500/i })).toBeInTheDocument();
        expect(screen.queryByText('(50.0%)')).not.toBeInTheDocument();
    });

    it('keeps the share percentage for an additive measure', () => {
        render(<InteractiveLegend {...props} showPercentage />);

        expect(screen.getByText('(50.0%)')).toBeInTheDocument();
    });

    it('shows row counts without decimal places', () => {
        render(<InteractiveLegend {...props} data={[{ Town: 'Punggol', 'Avg Price': 135 }]} total={135} aggregation="count" />);

        expect(screen.getByRole('button', { name: /Punggol 135 \(100\.0%\)/i })).toBeInTheDocument();
        expect(screen.queryByText('135.00')).not.toBeInTheDocument();
    });
});
