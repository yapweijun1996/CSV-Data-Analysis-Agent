import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpreadsheetPanel } from '../components/SpreadsheetPanel';
import type { CsvRow } from '../types';

const { useSpreadsheetLogicMock, useAppStoreMock, tabulatorTableMock } = vi.hoisted(() => ({
    useSpreadsheetLogicMock: vi.fn(),
    useAppStoreMock: vi.fn(),
    tabulatorTableMock: vi.fn(),
}));

const createRow = (row: Record<string, string | number>): CsvRow => row;

vi.mock('../hooks/useSpreadsheetLogic', () => ({
    useSpreadsheetLogic: useSpreadsheetLogicMock,
}));

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

vi.mock('../components/spreadsheet/TabulatorTable', () => ({
    TabulatorTable: (props: Record<string, unknown>) => {
        tabulatorTableMock(props);
        return <div data-testid="tabulator-table" />;
    },
}));

const createLogic = (preparedDatasetStatus: 'operations' | 'schema_only' | 'inconsistent') => ({
    activeDataset: {
        fileName: 'sales.csv',
        data: [createRow({ Region: 'East', Revenue: 1200 })],
        metadataRows: [],
        summaryRows: [],
        headerDepth: 1,
    },
    processedData: [createRow({ Region: 'East', Revenue: 1200 })],
    displayColumns: ['Region', 'Revenue'] as string[],
    displayColumnLabels: { Region: 'Region', Revenue: 'Revenue' } as Record<string, string>,
    filterText: '',
    setFilterText: vi.fn(),
    handleQuerySubmit: vi.fn(),
    viewMode: 'semantic_default' as const,
    setViewMode: vi.fn(),
    activeDataQuery: null,
    activeSpreadsheetFilter: null,
    aiFilterExplanation: null,
    isAiFiltering: false,
    clearAiFilter: vi.fn(),
    clearActiveDataQuery: vi.fn(),
    rawCsvData: {
        fileName: 'sales.csv',
        data: [createRow({ Region: 'East', Revenue: '1200' })],
    },
    preparedDatasetStatus,
    semanticStatus: 'ready' as 'idle' | 'running' | 'ready' | 'fallback',
    semanticDefaultReady: true,
    semanticHiddenRowCount: preparedDatasetStatus === 'operations' ? 2 : 0,
    workflowBundle: {
        summary: {
            fileName: 'sales.csv',
            rawRowCount: 1,
            preparedRowCount: 1,
            metadataRowCount: 0,
            headerDepth: 1,
            summaryRowCount: 0,
            issueCount: 0,
            operationCount: preparedDatasetStatus === 'operations' ? 1 : 0,
            baselineNoiseRowsRemoved: 0,
            preparationState: preparedDatasetStatus === 'operations' ? 'ai_cleaned' : preparedDatasetStatus === 'inconsistent' ? 'cleaning_blocked' : 'baseline_prepared',
            planStatus: preparedDatasetStatus,
            downstreamAnalysisBlocked: preparedDatasetStatus === 'inconsistent',
            canAnalyze: preparedDatasetStatus !== 'inconsistent',
            analysisState: preparedDatasetStatus === 'inconsistent' ? 'blocked' : 'ready',
            cardsCount: 1,
            hasFinalSummary: true,
        },
    },
    pageSize: 50,
    cleaningRun: {
        status: 'paused',
    },
});

describe('SpreadsheetPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (globalThis as typeof globalThis & { ResizeObserver: any }).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        useAppStoreMock.mockImplementation((selector: any) =>
            selector({
                settings: { language: 'English' },
                setIsSpreadsheetVisible: vi.fn(),
                resumeCleaningRun: vi.fn(),
                restartCleaningRun: vi.fn(),
                userColumnAnnotations: {},
                setColumnAnnotation: vi.fn(),
                removeColumnAnnotation: vi.fn(),
                columnProfiles: [],
            }),
        );
    });

    afterEach(() => {
        cleanup();
    });

    it('shows Prepared Data wording and No Data Edits Applied Yet badge', () => {
        useSpreadsheetLogicMock.mockReturnValue(createLogic('schema_only'));

        render(<SpreadsheetPanel isVisible />);

        expect(screen.getByText('Prepared Data')).toBeInTheDocument();
        expect(screen.getByText('All Prepared')).toBeInTheDocument();
        expect(screen.getByText('No Data Edits Applied Yet')).toBeInTheDocument();
        expect(screen.getByText('Showing baseline-prepared data with AI schema interpretation only.')).toBeInTheDocument();
        expect(screen.getAllByText('Continue cleaning')).not.toHaveLength(0);
        expect(screen.getAllByText('Restart cleaning')).not.toHaveLength(0);
        expect(screen.queryByText('View workflow')).not.toBeInTheDocument();
        expect(screen.getByTestId('tabulator-table')).toBeInTheDocument();
    });

    it('shows Cleaning Blocked badge for inconsistent prepared runs', () => {
        useSpreadsheetLogicMock.mockReturnValue(createLogic('inconsistent'));

        render(<SpreadsheetPanel isVisible />);

        expect(screen.getByText('Cleaning Blocked')).toBeInTheDocument();
        expect(screen.getByText('Showing baseline-prepared data. Downstream AI analysis is blocked.')).toBeInTheDocument();
    });

    it('shows AI Cleaned badge when deterministic operations executed', () => {
        useSpreadsheetLogicMock.mockReturnValue(createLogic('operations'));

        render(<SpreadsheetPanel isVisible />);

        expect(screen.getByText('AI Cleaned')).toBeInTheDocument();
        expect(screen.getByText('2 non-detail rows hidden by default')).toBeInTheDocument();
    });

    it('labels unfiltered row previews as Data Preview instead of AI Query', () => {
        const logic = createLogic('operations');
        logic.activeDataQuery = {
            explanation: 'Preview the first row.',
            plan: { select: ['Region', 'Revenue'], limit: 1 },
            result: {
                rows: [{ Region: 'East', Revenue: 1200 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 1,
                durationMs: 5,
            },
            appliedAt: new Date('2026-03-10T00:00:00.000Z'),
            source: 'execute_data_query' as const,
            engine: 'native' as const,
            sqlPreview: null,
            tableName: null,
            loadVersion: null,
            fallbackReason: null,
            fallbackFilterOperation: null,
        };
        useSpreadsheetLogicMock.mockReturnValue(logic);

        render(<SpreadsheetPanel isVisible />);

        expect(screen.getByText('Showing a data preview')).toBeInTheDocument();
        expect(screen.getAllByText(/Data Preview/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Showing 1 preview row/i)).toBeInTheDocument();
        expect(screen.queryByText(/matched rows/i)).not.toBeInTheDocument();
    });

    it('wires spreadsheet cleaning controls to store actions', () => {
        const resumeCleaningRun = vi.fn();
        const restartCleaningRun = vi.fn();
        useAppStoreMock.mockImplementation((selector: any) =>
            selector({
                settings: { language: 'English' },
                setIsSpreadsheetVisible: vi.fn(),
                resumeCleaningRun,
                restartCleaningRun,
                userColumnAnnotations: {},
                setColumnAnnotation: vi.fn(),
                removeColumnAnnotation: vi.fn(),
                columnProfiles: [],
            }),
        );
        useSpreadsheetLogicMock.mockReturnValue(createLogic('schema_only'));

        render(<SpreadsheetPanel isVisible />);

        fireEvent.click(screen.getAllByText('Continue cleaning')[0]);
        fireEvent.click(screen.getAllByText('Restart cleaning')[0]);

        expect(resumeCleaningRun).toHaveBeenCalledTimes(1);
        expect(restartCleaningRun).toHaveBeenCalledTimes(1);
    });

    it('passes business-facing display labels into the table renderer', () => {
        const logic = createLogic('operations');
        logic.displayColumns = ['SeriesLabelL1', 'Value'] as string[];
        logic.displayColumnLabels = { SeriesLabelL1: 'Project', Value: 'Revenue' } as Record<string, string>;
        logic.activeDataset = {
            ...logic.activeDataset,
            data: [createRow({ SeriesLabelL1: '36 TUAS ROAD', Value: 1200 })],
        };
        logic.processedData = [createRow({ SeriesLabelL1: '36 TUAS ROAD', Value: 1200 })];
        logic.rawCsvData = {
            ...logic.rawCsvData,
            data: [createRow({ SeriesLabelL1: '36 TUAS ROAD', Value: '1200' })],
        };
        useSpreadsheetLogicMock.mockReturnValue(logic);

        render(<SpreadsheetPanel isVisible />);

        expect(tabulatorTableMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            columns: ['SeriesLabelL1', 'Value'],
            displayColumnLabels: { SeriesLabelL1: 'Project', Value: 'Revenue' },
        }));
    });

    it('shows cleaned-prepared fallback text when semantic default is not ready', () => {
        const logic = createLogic('operations');
        logic.semanticDefaultReady = false;
        logic.semanticHiddenRowCount = 0;
        // Fallback-first: still show data rows, not an empty table
        logic.processedData = [createRow({ Region: 'East', Revenue: 1200 })];
        useSpreadsheetLogicMock.mockReturnValue(logic);

        render(<SpreadsheetPanel isVisible />);

        expect(screen.getByText('Showing cleaned prepared data.')).toBeInTheDocument();
        expect(screen.queryByText('2 non-detail rows hidden by default')).not.toBeInTheDocument();
    });

    it('shows preparing badge while semantic annotation is running', () => {
        const logic = createLogic('operations');
        logic.semanticDefaultReady = false;
        logic.semanticStatus = 'running' as const;
        logic.semanticHiddenRowCount = 0;
        logic.processedData = [createRow({ Region: 'East', Revenue: 1200 })];
        useSpreadsheetLogicMock.mockReturnValue(logic);

        render(<SpreadsheetPanel isVisible />);

        // Helper text shows cleaned fallback, NOT "Preparing..."
        expect(screen.getByText('Showing cleaned prepared data.')).toBeInTheDocument();
        // The secondary badge still indicates semantic is running
        expect(screen.getByText('Preparing AI semantic view...')).toBeInTheDocument();
        // Table data is present — not empty
        expect(screen.getByTestId('tabulator-table')).toBeInTheDocument();
    });

    it('does not show empty table during semantic running state', () => {
        const logic = createLogic('operations');
        logic.semanticDefaultReady = false;
        logic.semanticStatus = 'running' as const;
        logic.semanticHiddenRowCount = 0;
        // The key assertion: processedData is never empty during running state
        logic.processedData = [createRow({ Region: 'East', Revenue: 1200 })];
        logic.activeDataset = {
            ...logic.activeDataset,
            data: [createRow({ Region: 'East', Revenue: 1200 })],
        };
        useSpreadsheetLogicMock.mockReturnValue(logic);

        render(<SpreadsheetPanel isVisible />);

        // The table is rendered (not null-gated by empty activeDataset)
        expect(screen.getByTestId('tabulator-table')).toBeInTheDocument();
    });
});
