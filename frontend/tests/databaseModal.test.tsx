import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseModal } from '../components/modals/DatabaseModal';

const {
    useAppStoreMock,
    tabulatorTableMock,
    runWorkspaceDataQueryMock,
    refreshDuckDbSessionMock,
} = vi.hoisted(() => ({
    useAppStoreMock: vi.fn(),
    tabulatorTableMock: vi.fn(),
    runWorkspaceDataQueryMock: vi.fn(),
    refreshDuckDbSessionMock: vi.fn(),
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

vi.mock('../components/spreadsheet/TabulatorTable', () => ({
    TabulatorTable: (props: Record<string, any>) => {
        tabulatorTableMock(props);
        return (
            <div data-testid="database-tabulator-table">
                <button onClick={() => props.onSortChange?.({ column: 'Code', direction: 'desc' })}>
                    apply sort
                </button>
            </div>
        );
    },
}));

const createStoreState = (overrides: Record<string, unknown> = {}) => ({
    isDatabaseModalOpen: true,
    setIsDatabaseModalOpen: vi.fn(),
    csvData: {
        fileName: 'report.csv',
        data: [
            { Code: 501001, Description: 'Construction Contract Revenue', Project_ID: 10009, Amount: 0 },
            { Code: 501001, Description: 'Construction Contract Revenue', Project_ID: 10010, Amount: 0 },
        ],
        metadataRows: [],
        summaryRows: [],
        headerDepth: 1,
    },
    columnRegistry: null,
    columnProfiles: [
        { name: 'Code', type: 'categorical' as const },
        { name: 'Description', type: 'categorical' as const },
        { name: 'Project_ID', type: 'categorical' as const },
        { name: 'Amount', type: 'numerical' as const },
    ],
    datasetSemanticSnapshot: null,
    userColumnAnnotations: {},
    latestAnalysisSession: null,
    activeDataQuery: {
        explanation: 'Current manual query for zero-amount rows',
        plan: { select: ['Code', 'Amount'], limit: 50 },
        result: {
            rows: [{ Code: 501001, Amount: 0 }],
            totalMatchedRows: 1,
            returnedRows: 1,
            truncated: false,
            selectedColumns: ['Code', 'Amount'],
            appliedOrderBy: [],
            appliedLimit: 50,
            durationMs: 12,
        },
        appliedAt: new Date('2026-03-10T00:00:00.000Z'),
        source: 'execute_data_query' as const,
        engine: 'duckdb' as const,
        sqlPreview: 'select "Code", "Amount" from dataset where "Amount" = 0',
        tableName: 'session_clean_dataset',
        loadVersion: 'load-1',
        fallbackReason: null,
        fallbackFilterOperation: null,
    },
    queryHistory: [
        {
            id: 'query-1',
            phase: 'analysis' as const,
            origin: 'analysis' as const,
            explanation: 'Automatic SQL-first analysis for revenue by project',
            plan: { select: ['Project_ID', 'Total Amount'], limit: 25 },
            engine: 'duckdb' as const,
            sqlPreview: 'select "Project_ID", sum("Amount") as "Total Amount" from dataset group by 1',
            tableName: 'session_clean_dataset',
            loadVersion: 'load-1',
            fallbackReason: null,
            appliedAt: new Date('2026-03-09T00:00:00.000Z'),
            result: {
                totalMatchedRows: 8,
                returnedRows: 8,
                truncated: false,
                selectedColumns: ['Project_ID', 'Total Amount'],
                appliedOrderBy: [],
                appliedLimit: 25,
                durationMs: 18,
                previewRows: [{ Project_ID: 10009, 'Total Amount': 12 }],
            },
        },
        {
            id: 'query-2',
            phase: 'verify' as const,
            origin: 'chat' as const,
            explanation: 'Verify that blank rows were removed',
            plan: { select: ['Code', 'Amount'], limit: 50 },
            engine: 'native' as const,
            sqlPreview: 'select "Code", "Amount" from dataset where "Code" is not null',
            tableName: 'session_clean_dataset',
            loadVersion: 'load-2',
            fallbackReason: 'Used native engine because DuckDB was unavailable.',
            appliedAt: new Date('2026-03-10T01:00:00.000Z'),
            result: {
                totalMatchedRows: 25,
                returnedRows: 20,
                truncated: true,
                selectedColumns: ['Code', 'Amount'],
                appliedOrderBy: [],
                appliedLimit: 50,
                durationMs: 20,
                previewRows: [{ Code: 501001, Amount: 0 }],
            },
        },
        {
            id: 'query-3',
            phase: 'analysis' as const,
            origin: 'workspace' as const,
            templateId: 'duplicate_candidates' as const,
            formSnapshot: {
                templateId: 'duplicate_candidates' as const,
                keyColumns: ['Code', 'Project_ID'],
                countAlias: 'duplicate_count',
                limit: 25,
            },
            explanation: 'Duplicate candidate scan for Code and Project_ID',
            plan: {
                select: ['Code', 'Project_ID', 'duplicate_count'],
                groupBy: ['Code', 'Project_ID'],
                aggregates: [{ function: 'count' as const, as: 'duplicate_count' }],
                orderBy: [{ column: 'duplicate_count', direction: 'desc' as const }],
                limit: 25,
            },
            engine: 'duckdb' as const,
            sqlPreview: 'select "Code", "Project_ID", count(*) as "duplicate_count" from dataset group by 1,2 order by "duplicate_count" desc',
            tableName: 'session_clean_dataset',
            loadVersion: 'load-3',
            fallbackReason: null,
            appliedAt: new Date('2026-03-10T02:00:00.000Z'),
            result: {
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['Code', 'Project_ID', 'duplicate_count'],
                appliedOrderBy: [{ column: 'duplicate_count', direction: 'desc' as const }],
                appliedLimit: 25,
                durationMs: 16,
                previewRows: [
                    { Code: 501001, Project_ID: 10009, duplicate_count: 2 },
                    { Code: 501001, Project_ID: 10010, duplicate_count: 2 },
                ],
            },
        },
        {
            id: 'query-active-match',
            phase: 'analysis' as const,
            origin: 'chat' as const,
            explanation: 'Current manual query for zero-amount rows',
            plan: { select: ['Code', 'Amount'], limit: 50 },
            engine: 'duckdb' as const,
            sqlPreview: 'select "Code", "Amount" from dataset where "Amount" = 0',
            tableName: 'session_clean_dataset',
            loadVersion: 'load-1',
            fallbackReason: null,
            appliedAt: new Date('2026-03-10T00:00:00.000Z'),
            result: {
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Code', 'Amount'],
                appliedOrderBy: [],
                appliedLimit: 50,
                durationMs: 12,
                previewRows: [{ Code: 501001, Amount: 0 }],
            },
        },
    ],
    currentDatasetId: 'dataset-1',
    logAgentToolUsage: vi.fn(),
    runWorkspaceDataQuery: runWorkspaceDataQueryMock,
    refreshDuckDbSession: refreshDuckDbSessionMock,
    duckDbSessionStatus: {
        status: 'ready' as const,
        engine: 'duckdb' as const,
        tableName: 'session_clean_dataset',
        loadVersion: 'load-3',
        fallbackReason: null,
        lastSyncedAt: new Date('2026-03-10T02:05:00.000Z'),
    },
    settings: {
        language: 'English' as const,
    },
    ...overrides,
});

describe('DatabaseModal', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        runWorkspaceDataQueryMock.mockResolvedValue({
            query: {
                explanation: 'Preview rows',
                plan: { select: ['Code'], limit: 25 },
                result: {
                    rows: [{ Code: 501001 }],
                    totalMatchedRows: 1,
                    returnedRows: 1,
                    truncated: false,
                    selectedColumns: ['Code'],
                    appliedOrderBy: [],
                    appliedLimit: 25,
                    durationMs: 10,
                },
                appliedAt: new Date('2026-03-10T03:00:00.000Z'),
                source: 'execute_data_query',
                engine: 'duckdb',
                sqlPreview: 'select "Code" from dataset limit 25',
                tableName: 'session_clean_dataset',
                loadVersion: 'load-3',
            },
            traceId: 'workspace-trace-new',
            committedAt: new Date('2026-03-10T03:00:00.000Z'),
        });
        refreshDuckDbSessionMock.mockResolvedValue(undefined);
        const state = createStoreState();
        useAppStoreMock.mockImplementation((selector: any) => selector(state));
    });

    it('renders the current active query by default and shows data explorer session metadata', () => {
        render(<DatabaseModal />);

        expect(screen.getByText('Data explorer')).toBeInTheDocument();
        expect(screen.getByText('ready')).toBeInTheDocument();
        expect(screen.getAllByText('Current manual query for zero-amount rows').length).toBeGreaterThan(0);
        expect(screen.getByTestId('database-tabulator-table')).toBeInTheDocument();

        const props = tabulatorTableMock.mock.calls.at(-1)?.[0];
        expect(props.variant).toBe('database-modal');
        expect(props.pageSize).toBe(25);
        expect(props.columns).toEqual(['Code', 'Amount']);
    });

    it('updates the result grid and SQL preview when a different history item is selected', () => {
        render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Automatic SQL-first analysis for revenue by project/i }));

        expect(screen.getByText(/sum\("Amount"\) as "Total Amount"/i)).toBeInTheDocument();
        expect(screen.getAllByText('Automatic analysis').length).toBeGreaterThan(0);

        const props = tabulatorTableMock.mock.calls.at(-1)?.[0];
        expect(props.columns).toEqual(['Project_ID', 'Total Amount']);
        expect(props.data).toEqual([{ Project_ID: 10009, 'Total Amount': 12 }]);
    });

    it('defaults to the latest query history entry when there is no active query', () => {
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: createStoreState().queryHistory.filter((entry: any) => entry.id !== 'query-active-match'),
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        expect(screen.getAllByText('Duplicate candidate scan for Code and Project_ID').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Data Explorer').length).toBeGreaterThan(0);

        const props = tabulatorTableMock.mock.calls.at(-1)?.[0];
        expect(props.columns).toEqual(['Code', 'Project_ID', 'duplicate_count']);
    });

    it('auto-refreshes once and disables workspace query execution while the DuckDB session is not ready', async () => {
        const state = createStoreState({
            duckDbSessionStatus: {
                status: 'degraded',
                engine: 'native',
                tableName: 'session_clean_dataset',
                loadVersion: 'load-3',
                fallbackReason: 'duckdb_disabled',
                lastSyncedAt: new Date('2026-03-10T02:05:00.000Z'),
            },
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        const view = render(<DatabaseModal />);

        await waitFor(() => expect(refreshDuckDbSessionMock).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: /Run Query/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Refresh Query Session/i })).toBeInTheDocument();
        expect(screen.getAllByText(/duckdb_disabled/i).length).toBeGreaterThan(0);

        view.rerender(<DatabaseModal />);
        expect(refreshDuckDbSessionMock).toHaveBeenCalledTimes(1);
    });

    it('reruns a selected workspace history query through the deterministic store action', () => {
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: createStoreState().queryHistory.filter((entry: any) => entry.id !== 'query-active-match'),
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Duplicate candidate scan for Code and Project_ID/i }));
        fireEvent.click(screen.getByRole('button', { name: /Rerun Query/i }));

        expect(runWorkspaceDataQueryMock).toHaveBeenCalledWith({
            templateId: 'duplicate_candidates',
            keyColumns: ['Code', 'Project_ID'],
            countAlias: 'duplicate_count',
            limit: 25,
        });
    });

    it('shows a committed success state using the returned workspace outcome', async () => {
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));

        expect(await screen.findByRole('status')).toHaveTextContent('Query completed: 1 rows in 10ms');
        expect(screen.getByRole('status')).toHaveTextContent('data version load-3');
        expect(screen.queryByText('No query selected')).not.toBeInTheDocument();
    });

    it('clears the previous success banner when the user switches query templates', async () => {
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));
        expect(await screen.findByRole('status')).toHaveTextContent('Query completed');

        fireEvent.click(screen.getByRole('button', { name: /Null \/ Blank Scan/i }));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Run Query/i })).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('Select a target column');
    });

    it('collapses a long column picker until the user chooses to edit it', () => {
        const columns = Array.from({ length: 16 }, (_, index) => `Column ${index + 1}`);
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
            csvData: {
                fileName: 'wide-report.csv',
                data: [Object.fromEntries(columns.map((column, index) => [column, index]))],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: columns.map(name => ({ name, type: 'categorical' as const })),
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        expect(screen.getByText('4 selected')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Column 16' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Choose columns' }));

        expect(screen.getByRole('button', { name: 'Column 16' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hide column list' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('keeps the query form and offers retry after execution failure', async () => {
        runWorkspaceDataQueryMock.mockRejectedValueOnce(new Error('query_result_not_committed'));
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));

        expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(runWorkspaceDataQueryMock).toHaveBeenCalledTimes(2));
    });

    it('shows the analyst empty state when no query activity exists', () => {
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        expect(screen.getByText('No query history yet. Run a template or ask the Assistant to explore this dataset.')).toBeInTheDocument();
        expect(screen.getByText('No SQL preview available yet. Run an explorer template or select a query trace from history.')).toBeInTheDocument();
        expect(screen.getAllByText('No query selected').length).toBeGreaterThan(0);
    });

    it('hides blocked dimensions from aggregate and duplicate group pickers', () => {
        const state = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
            csvData: {
                fileName: 'report.csv',
                data: [
                    { Code: 501001, Region: 'East', BlockedOnly: 'detail-row', Amount: 0 },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnRegistry: {
                datasetVersion: 'dataset-1',
                generatedAt: '2026-03-25T00:00:00.000Z',
                columns: [
                    {
                        columnId: 'col_code',
                        physicalName: 'Code',
                        displayLabel: 'Code',
                        aliases: ['Code'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_dimension' as const,
                        allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                    {
                        columnId: 'col_region',
                        physicalName: 'Region',
                        displayLabel: 'Region',
                        aliases: ['Region'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_dimension' as const,
                        allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                    {
                        columnId: 'col_blocked',
                        physicalName: 'BlockedOnly',
                        displayLabel: 'BlockedOnly',
                        aliases: ['BlockedOnly'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_dimension' as const,
                        allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                    {
                        columnId: 'col_amount',
                        physicalName: 'Amount',
                        displayLabel: 'Amount',
                        aliases: ['Amount'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_metric' as const,
                        allowedUsages: { groupBy: false, filter: true, select: true, orderBy: true },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                ],
            },
            columnProfiles: [
                { name: 'Code', type: 'categorical' as const },
                { name: 'Region', type: 'categorical' as const },
                { name: 'BlockedOnly', type: 'categorical' as const },
                { name: 'Amount', type: 'numerical' as const },
            ],
            latestAnalysisSession: {
                analysisSteering: {
                    blockGroupBy: ['BlockedOnly'],
                },
            },
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(state));

        render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Aggregate Breakdown/i }));
        expect(screen.queryByRole('button', { name: 'BlockedOnly' })).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Amount' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Duplicate Candidates/i }));
        expect(screen.queryByRole('button', { name: 'BlockedOnly' })).not.toBeInTheDocument();
    });

    it('keeps in-progress drafts when latestAnalysisSession changes without changing column capabilities', async () => {
        const analysisSteering = {
            preferGroupBy: ['Code'],
        };
        let currentState = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
            latestAnalysisSession: {
                sessionId: 'session-1',
                analysisSteering,
                status: 'running',
            },
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(currentState));

        const view = render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Amount' }));

        currentState = {
            ...currentState,
            latestAnalysisSession: {
                ...currentState.latestAnalysisSession,
                status: 'completed',
                lastUpdatedAt: '2026-03-25T12:00:00.000Z',
                analysisSteering,
            },
        };
        view.rerender(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));

        await waitFor(() => expect(runWorkspaceDataQueryMock).toHaveBeenCalledTimes(1));
        expect(runWorkspaceDataQueryMock).toHaveBeenCalledWith({
            templateId: 'preview_rows',
            columns: ['Code', 'Description', 'Project_ID'],
            orderBy: { column: 'Code', direction: 'asc' },
            limit: 25,
        });
    });

    it('resets drafts when selectable columns actually change', async () => {
        let currentState = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
        });
        useAppStoreMock.mockImplementation((selector: any) => selector(currentState));

        const view = render(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Amount' }));

        currentState = createStoreState({
            activeDataQuery: null,
            queryHistory: [],
            csvData: {
                fileName: 'reshaped.csv',
                data: [
                    { Region: 'East', Amount: 100 },
                    { Region: 'West', Amount: 200 },
                ],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical' as const },
                { name: 'Amount', type: 'numerical' as const },
            ],
            columnRegistry: null,
        });
        view.rerender(<DatabaseModal />);

        fireEvent.click(screen.getByRole('button', { name: /Run Query/i }));

        await waitFor(() => expect(runWorkspaceDataQueryMock).toHaveBeenCalledTimes(1));
        expect(runWorkspaceDataQueryMock).toHaveBeenCalledWith({
            templateId: 'preview_rows',
            columns: ['Region', 'Amount'],
            orderBy: { column: 'Region', direction: 'asc' },
            limit: 25,
        });
    });
});
