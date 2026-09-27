import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseModalSidebar } from '../components/modals/DatabaseModalSidebar';

afterEach(() => {
    cleanup();
});

describe('DatabaseModalSidebar', () => {
    it('renders canonical trace contract fields for the selected query activity', () => {
        const activity = {
            id: 'query-1',
            source: 'history' as const,
            phase: 'analysis' as const,
            origin: 'analysis' as const,
            explanation: 'Revenue by Region',
            engine: 'duckdb' as const,
            sqlPreview: 'select * from table',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
            fallbackReason: null,
            appliedAt: new Date('2026-03-19T02:00:00.000Z'),
            result: {
                totalMatchedRows: 10,
                returnedRows: 10,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 25,
                durationMs: 42,
                previewRows: [],
            },
            traceContract: {
                contractVersion: 'runtime_v1',
                reasonCode: 'query_trace_recorded',
                retryClass: 'semantic_recovery',
                source: 'query_trace',
            },
        };

        render(
            <DatabaseModalSidebar
                csvData={{ fileName: 'sales.csv', data: [] } as never}
                queryActivities={[activity]}
                selectedQueryActivity={activity}
                onSelectQueryActivity={vi.fn()}
            />,
        );

        expect(screen.getByText(/Reason code/i)).toBeInTheDocument();
        expect(screen.getAllByText(/query_trace_recorded/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/semantic_recovery/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/runtime_v1/i)).toBeInTheDocument();
    });
});
