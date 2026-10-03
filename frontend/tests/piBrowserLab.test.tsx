import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PiBrowserLab } from '../components/modals/PiBrowserLab';

const { state, executeManagedDataQueryMock } = vi.hoisted(() => ({
    state: {
        currentDatasetId: 'test-dataset',
        csvData: {
            fileName: 'test.csv',
            data: [
                { Region: 'East', Amount: 10 },
                { Region: 'West', Amount: 20 },
            ],
        },
        canonicalCsvData: null,
        columnProfiles: [
            { name: 'Region', type: 'categorical' },
            { name: 'Amount', type: 'numerical' },
        ],
        settings: { openAIApiKey: '' },
    },
    executeManagedDataQueryMock: vi.fn(),
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: Object.assign(
        (selector: (value: typeof state) => unknown) => selector(state),
        { getState: () => state },
    ),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

afterEach(() => {
    cleanup();
    executeManagedDataQueryMock.mockReset();
});

describe('Pi Browser Lab', () => {
    it('runs the keyless Pi tool cycle from the React dialog', async () => {
        executeManagedDataQueryMock.mockResolvedValue({
            engine: 'duckdb',
            result: { rows: [{ row_count: 2, metric_sum: 30 }], truncated: false },
        });
        render(<PiBrowserLab onClose={vi.fn()} />);

        expect(screen.getByRole('dialog', { name: 'Pi Browser Lab' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Run mock tool cycle' }));

        // The dialog dynamically imports the Pi agent on click; a cold module load under
        // CPU contention can exceed testing-library's default 1s waitFor timeout.
        await waitFor(
            () => expect(screen.getByLabelText('Pi answer').textContent).toContain('metric_sum'),
            { timeout: 10_000 },
        );
        expect(executeManagedDataQueryMock).toHaveBeenCalledOnce();
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
