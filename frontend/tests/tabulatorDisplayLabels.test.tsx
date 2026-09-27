import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabulatorTable } from '../components/spreadsheet/TabulatorTable';

const { tabulatorConstructorMock } = vi.hoisted(() => ({
    tabulatorConstructorMock: vi.fn(),
}));

vi.mock('tabulator-tables', () => ({
    TabulatorFull: tabulatorConstructorMock,
}));

describe('TabulatorTable display labels', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tabulatorConstructorMock.mockImplementation(() => ({
            destroy: vi.fn(),
            on: vi.fn(),
            setSort: vi.fn(),
            clearSort: vi.fn(),
            getSorters: vi.fn(() => []),
        }));
    });

    it('uses business-facing display labels when provided', async () => {
        render(
            <div style={{ height: '600px' }}>
                <TabulatorTable
                    data={[{ SeriesLabelL1: '36 TUAS ROAD', Value: 1200 }]}
                    columns={['SeriesLabelL1', 'Value']}
                    displayColumnLabels={{ SeriesLabelL1: 'Project', Value: 'Revenue' }}
                    pageSize={50}
                    tableKey="clean:projects.csv"
                    language="English"
                />
            </div>,
        );

        await waitFor(() => expect(tabulatorConstructorMock).toHaveBeenCalledTimes(1));
        const [, options] = tabulatorConstructorMock.mock.calls[0] as [HTMLElement, Record<string, any>];
        expect(options.columns[1].title).toBe('A - Project');
        expect(options.columns[2].title).toBe('B - Revenue');
    });
});
