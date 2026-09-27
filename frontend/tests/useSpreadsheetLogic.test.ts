import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSpreadsheetLogic } from '../hooks/useSpreadsheetLogic';
import * as useAppStoreModule from '../store/useAppStore';
import type { CsvRow } from '../types';
import { buildSemanticDatasetVersion } from '../services/agent/datasetSemantics';

const createRow = (row: Record<string, string | number>): CsvRow => row;

// Mock the store
vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

describe('useSpreadsheetLogic', () => {
    const createMockStore = () => ({
        sessionId: 'session-1',
        currentView: 'analysis_dashboard',
        currentDatasetId: 'dataset-1',
        csvData: {
            fileName: 'test.csv',
            data: Array.from({ length: 100 }, (_, i) => createRow({ id: i + 1, name: `Test ${i + 1}` })),
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        },
        rawCsvData: null,
        canonicalCsvData: null,
        initialDataSample: null,
        columnProfiles: [],
        columnRegistry: null,
        dataPreparationPlan: null,
        dataQualityIssues: [],
        datasetSemanticSnapshot: {
            datasetRole: 'mixed_report',
            rowAnnotations: [
                { rowIndex: 0, rowRole: 'grand_total', confidence: 0.95, reason: 'Aggregate total row.' },
            ],
            columnAnnotations: [],
            recommendedAnalysisView: {
                mode: 'soft_exclude',
                includedRowIndices: Array.from({ length: 99 }, (_, index) => index + 1),
                excludedRowIndices: [0],
                includedRowCount: 99,
                excludedRowCount: 1,
                reason: 'Hide non-detail rows by default.',
            },
            summary: 'Looks like a mixed report with one aggregate row.',
            generatedAt: '2026-03-13T00:00:00.000Z',
            modelId: 'gemini-test',
            sourceDatasetVersion: 'dataset-1',
        },
        semanticStatus: 'ready',
        semanticDatasetVersion: 'dataset-1',
        analysisCards: [],
        finalSummary: null,
        agentEvents: [],
        agentToolLogs: [],
        telemetryEvents: [],
        spreadsheetFilterFunction: null,
        activeSpreadsheetFilter: null,
        aiFilterExplanation: '',
        activeDataQuery: null,
        isAiFiltering: false,
        isGeneratingReport: false,
        handleNaturalLanguageQuery: vi.fn(),
        clearAiFilter: vi.fn(),
        clearActiveDataQuery: vi.fn(),
        ensureDatasetSemanticSnapshot: vi.fn(),
        setIsSpreadsheetVisible: vi.fn(),
        userColumnAnnotations: {},
        latestAnalysisSession: null,
        cleaningRun: null,
        settings: {
            provider: 'google',
            geminiApiKey: '',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'English',
            autoConfirmGoal: true,
        },
    });
    let mockStore = createMockStore();

    const syncSemanticSnapshotToCsvData = () => {
        mockStore.semanticDatasetVersion = buildSemanticDatasetVersion(mockStore.csvData);
        mockStore.datasetSemanticSnapshot = {
            ...mockStore.datasetSemanticSnapshot,
            sourceDatasetVersion: mockStore.semanticDatasetVersion,
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore = createMockStore();
        // Default mock implementation
        (useAppStoreModule.useAppStore as any).mockImplementation((selector: any) => {
            return selector(mockStore);
        });
        (useAppStoreModule.useAppStore as any).getState = () => mockStore;
    });

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.viewMode).toBe('semantic_default');
        expect(result.current.filterText).toBe('');
        expect(result.current.pageSize).toBe(50);
        // Snapshot version doesn't match the live dataset, so semanticDefaultReady
        // is false. Graceful degradation shows the unfiltered preferred dataset
        // rather than an empty table.
        expect(result.current.displayColumns).toEqual(['id', 'name']);
        expect(result.current.semanticDefaultReady).toBe(false);
        expect(result.current.semanticHiddenRowCount).toBe(0);
        expect(result.current.processedData).toHaveLength(100);
    });

    it('uses the analysis-safe semantic dataset when the snapshot version is current', () => {
        mockStore.semanticDatasetVersion = buildSemanticDatasetVersion(mockStore.csvData);
        mockStore.datasetSemanticSnapshot = {
            ...mockStore.datasetSemanticSnapshot,
            sourceDatasetVersion: mockStore.semanticDatasetVersion,
        };

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.semanticDefaultReady).toBe(true);
        expect(result.current.semanticHiddenRowCount).toBe(1);
        expect(result.current.processedData).toHaveLength(99);
        expect(result.current.processedData[0].id).toBe(2);
    });

    it('should handle filter text change', () => {
        const { result } = renderHook(() => useSpreadsheetLogic(true));

        act(() => {
            result.current.setFilterText('query');
        });

        expect(result.current.filterText).toBe('query');
    });

    it('should apply deterministic spreadsheet filter operations', () => {
        mockStore.datasetSemanticSnapshot = {
            ...mockStore.datasetSemanticSnapshot,
            rowAnnotations: [],
            recommendedAnalysisView: {
                mode: 'soft_exclude',
                includedRowIndices: Array.from({ length: 100 }, (_, index) => index),
                excludedRowIndices: [],
                includedRowCount: 100,
                excludedRowCount: 0,
                reason: 'No hidden rows for this test.',
            },
        };
        syncSemanticSnapshotToCsvData();
        mockStore.activeSpreadsheetFilter = {
            requestId: 'spreadsheet-filter-1',
            origin: 'spreadsheet_panel',
            query: 'Test 1',
            operation: {
                id: 'filter-name',
                type: 'filter_rows',
                reason: 'Keep only Test 1.',
                predicates: [{ column: 'name', operator: 'eq', value: 'Test 1' }],
            },
            observation: {
                selectedColumn: 'name',
                operator: 'eq',
                value: 'Test 1',
                matchedRowCount: 1,
                previewRows: [{ id: 1, name: 'Test 1' }],
            },
            finalReply: 'I applied a temporary data filter in the raw data explorer for rows where name equals "Test 1". It matched 1 row.',
            appliedAt: new Date('2026-03-11T00:00:00.000Z'),
        };
        mockStore.spreadsheetFilterFunction = {
            id: 'filter-name',
            type: 'filter_rows',
            reason: 'Keep only Test 1.',
            predicates: [{ column: 'name', operator: 'eq', value: 'Test 1' }],
        };

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.processedData).toHaveLength(1);
        expect(result.current.processedData[0].name).toBe('Test 1');

        mockStore.spreadsheetFilterFunction = null;
        mockStore.activeSpreadsheetFilter = null;
    });

    it('should prioritize active read-only query results in cleaned view', () => {
        mockStore.columnRegistry = {
            datasetVersion: 'dataset-1',
            generatedAt: '2026-03-25T00:00:00.000Z',
            columns: [
                {
                    columnId: 'col-name',
                    physicalName: 'name',
                    displayLabel: 'Customer Name',
                    aliases: ['name', 'Customer Name'],
                    source: 'parsed_header',
                    analysisRole: 'business_dimension',
                    allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true, aggregationHint: 'dimension_only' as const },
                    isSynthetic: false,
                    isExposedToAi: true,
                },
                {
                    columnId: 'col-id',
                    physicalName: 'id',
                    displayLabel: 'Record ID',
                    aliases: ['id', 'Record ID'],
                    source: 'parsed_header',
                    analysisRole: 'business_dimension',
                    allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true, aggregationHint: 'dimension_only' as const },
                    isSynthetic: false,
                    isExposedToAi: true,
                },
            ],
        };
        mockStore.activeDataQuery = {
            explanation: 'Top rows only',
            plan: { select: ['name', 'id'], limit: 1 },
            result: {
                rows: [{ id: 42, name: 'Query Result' }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['name', 'id'],
                appliedOrderBy: [],
                appliedLimit: 1,
                durationMs: 5,
            },
            appliedAt: new Date('2026-03-10T00:00:00.000Z'),
            source: 'execute_data_query',
            engine: 'native',
            sqlPreview: null,
            tableName: null,
            loadVersion: null,
            fallbackReason: null,
            fallbackFilterOperation: null,
        };

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.activeDataQuery?.result.returnedRows).toBe(1);
        expect(result.current.processedData).toEqual([{ id: 42, name: 'Query Result' }]);
        expect(result.current.displayColumns).toEqual(['name', 'id']);
        expect(result.current.displayColumnLabels).toMatchObject({
            name: 'Customer Name',
            id: 'Record ID',
        });

        mockStore.activeDataQuery = null;
    });

    it('preserves selected query columns when the active query returns zero rows', () => {
        mockStore.activeDataQuery = {
            explanation: 'No matching rows',
            plan: { select: ['id', 'name'], limit: 10 },
            result: {
                rows: [],
                totalMatchedRows: 0,
                returnedRows: 0,
                truncated: false,
                selectedColumns: ['id', 'name'],
                appliedOrderBy: [],
                appliedLimit: 10,
                durationMs: 5,
            },
            appliedAt: new Date('2026-03-10T00:00:00.000Z'),
            source: 'execute_data_query',
            engine: 'native',
            sqlPreview: null,
            tableName: null,
            loadVersion: null,
            fallbackReason: null,
            fallbackFilterOperation: null,
        };

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.processedData).toEqual([]);
        expect(result.current.displayColumns).toEqual(['id', 'name']);

        mockStore.activeDataQuery = null;
    });

    it('can switch to all prepared rows without semantic exclusion', () => {
        const { result } = renderHook(() => useSpreadsheetLogic(true));

        act(() => {
            result.current.setViewMode('semantic_all');
        });

        expect(result.current.viewMode).toBe('semantic_all');
        expect(result.current.processedData).toHaveLength(100);
        expect(result.current.processedData[0].id).toBe(1);
    });

    it('shows preferredDataset rows when semanticStatus is running (never empty)', () => {
        mockStore.semanticStatus = 'running';
        mockStore.datasetSemanticSnapshot = null;
        mockStore.semanticDatasetVersion = 'pending-version';

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.semanticDefaultReady).toBe(false);
        // Must show real rows, not an empty array
        expect(result.current.processedData).toHaveLength(100);
        expect(result.current.processedData[0].id).toBe(1);
    });

    it('shows preferredDataset rows when semanticStatus is fallback', () => {
        mockStore.semanticStatus = 'fallback';
        mockStore.datasetSemanticSnapshot = null;
        mockStore.semanticDatasetVersion = 'failed-version';

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.semanticDefaultReady).toBe(false);
        expect(result.current.processedData).toHaveLength(100);
    });

    it('upgrades to semantic dataset when status transitions to ready', () => {
        // Start in running state
        mockStore.semanticStatus = 'running';
        mockStore.datasetSemanticSnapshot = null;
        mockStore.semanticDatasetVersion = null;

        const { result, rerender } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.semanticDefaultReady).toBe(false);
        expect(result.current.processedData).toHaveLength(100);

        // Simulate semantic annotation completing — must include recommendedAnalysisView
        const version = buildSemanticDatasetVersion(mockStore.csvData);
        mockStore.semanticDatasetVersion = version;
        mockStore.datasetSemanticSnapshot = {
            datasetRole: 'mixed_report',
            rowAnnotations: [
                { rowIndex: 0, rowRole: 'grand_total', confidence: 0.95, reason: 'Aggregate total row.' },
            ],
            columnAnnotations: [],
            recommendedAnalysisView: {
                mode: 'soft_exclude',
                includedRowIndices: Array.from({ length: 99 }, (_, index) => index + 1),
                excludedRowIndices: [0],
                includedRowCount: 99,
                excludedRowCount: 1,
                reason: 'Hide non-detail rows by default.',
            },
            summary: 'Mixed report with one aggregate row.',
            generatedAt: '2026-03-13T00:00:00.000Z',
            modelId: 'gemini-test',
            sourceDatasetVersion: version,
        };
        mockStore.semanticStatus = 'ready';
        rerender();

        expect(result.current.semanticDefaultReady).toBe(true);
        // Now the semantic view excludes row 0 (grand_total)
        expect(result.current.processedData).toHaveLength(99);
        expect(result.current.processedData[0].id).toBe(2);
    });

    it('derives business-facing display labels for helper columns from generated cards', () => {
        mockStore.csvData = {
            fileName: 'test.csv',
            data: [createRow({ SeriesLabelL1: '36 TUAS ROAD', Value: 1200 })],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        };
        mockStore.datasetSemanticSnapshot = {
            ...mockStore.datasetSemanticSnapshot,
            recommendedAnalysisView: {
                mode: 'soft_exclude',
                includedRowIndices: [0],
                excludedRowIndices: [],
                includedRowCount: 1,
                excludedRowCount: 0,
                reason: 'Single-row dataset.',
            },
        };
        syncSemanticSnapshotToCsvData();
        mockStore.analysisCards = [
            {
                id: 'card-1',
                plan: {
                    title: 'Revenue by Project',
                    description: 'Compare revenue by project.',
                    chartType: 'bar',
                    groupByColumn: 'SeriesLabelL1',
                    valueColumn: 'Value',
                    aggregation: 'sum',
                },
                aggregatedData: [createRow({ SeriesLabelL1: '36 TUAS ROAD', Value: 1200 })],
                summary: 'Summary',
                displayChartType: 'bar',
                isDataVisible: false,
                topN: null,
                hideOthers: false,
                hiddenLabels: [],
            },
        ];

        const { result } = renderHook(() => useSpreadsheetLogic(true));

        expect(result.current.displayColumns).toEqual(['SeriesLabelL1', 'Value']);
        expect(result.current.displayColumnLabels).toEqual({
            SeriesLabelL1: 'Project',
            Value: 'Revenue',
        });
    });
});
