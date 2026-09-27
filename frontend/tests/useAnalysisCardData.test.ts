import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalysisCardData } from '../hooks/useAnalysisCardData';
import * as useAppStoreModule from '../store/useAppStore';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

describe('useAnalysisCardData', () => {
    let mockStore: {
        analysisCards: Array<Record<string, unknown>>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockStore = {
            analysisCards: [
                {
                    id: 'pivot-card',
                    plan: {
                        title: 'Row Total by Project',
                        description: 'Pivot totals by project.',
                        chartType: 'bar',
                        artifactType: 'pivot_matrix',
                        aggregation: 'sum',
                        groupByColumn: 'row_label',
                        valueColumn: 'row_total',
                    },
                    aggregatedData: [
                        { row_label: 'BDB LAB DESIGN', row_total: 82_428_882.68 },
                        { row_label: 'Unknown', row_total: 0 },
                        { row_label: 'SANOFI @ TUAS SOUTH STREET 2', row_total: -1_089_227.92 },
                    ],
                    summary: { language: 'English', text: '' },
                    displayChartType: 'bar',
                    isDataVisible: true,
                    topN: null,
                    hideOthers: false,
                    hideZeroValueRows: true,
                    hiddenLabels: [],
                },
            ],
        };

        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: typeof mockStore) => unknown) => selector(mockStore));
    });

    it('hides zero-total rows only from pivot chart data while preserving table totals', () => {
        const { result } = renderHook(() => useAnalysisCardData('pivot-card'));

        expect(result.current.tableDataForDisplay).toHaveLength(3);
        expect(result.current.chartDataForDisplay).toHaveLength(2);
        expect(result.current.tableZeroValueRowCount).toBe(1);
        expect(result.current.chartHiddenZeroValueRowCount).toBe(1);
        expect(result.current.displayedRowCount).toBe(3);
        expect(result.current.totalRowCount).toBe(3);
        expect(result.current.displayedTotalValue).toBe(81_339_654.76);
        expect(result.current.totalValue).toBe(81_339_654.76);
        expect(result.current.chartDataForDisplay.map(row => row.row_label)).toEqual([
            'BDB LAB DESIGN',
            'SANOFI @ TUAS SOUTH STREET 2',
        ]);
    });

    it('does not filter non-pivot cards even if hideZeroValueRows is enabled', () => {
        mockStore.analysisCards = [
            {
                id: 'bar-card',
                plan: {
                    title: 'Revenue by Region',
                    description: 'Compare revenue by region.',
                    chartType: 'bar',
                    aggregation: 'sum',
                    groupByColumn: 'Region',
                    valueColumn: 'Revenue',
                },
                aggregatedData: [
                    { Region: 'North', Revenue: 100 },
                    { Region: 'South', Revenue: 0 },
                ],
                summary: { language: 'English', text: '' },
                displayChartType: 'bar',
                isDataVisible: true,
                topN: null,
                hideOthers: false,
                hideZeroValueRows: true,
                hiddenLabels: [],
            },
        ];

        const { result } = renderHook(() => useAnalysisCardData('bar-card'));

        expect(result.current.tableDataForDisplay).toHaveLength(2);
        expect(result.current.chartDataForDisplay).toHaveLength(2);
        expect(result.current.tableZeroValueRowCount).toBe(0);
        expect(result.current.chartHiddenZeroValueRowCount).toBe(0);
    });

    it('formats temporal group labels and time-like table columns into DD/MM/YYYY', () => {
        mockStore.analysisCards = [
            {
                id: 'date-card',
                plan: {
                    title: 'Sales by date',
                    description: 'Compare sales by order date.',
                    chartType: 'line',
                    aggregation: 'sum',
                    groupByColumn: 'CUSTOMER ORDER DATE',
                    valueColumn: 'TOTAL SALES',
                },
                aggregatedData: [
                    { 'CUSTOMER ORDER DATE': 1293753600000, 'TOTAL SALES': 6900, 'DELIVERY DATE': '2011-01-03' },
                    { 'CUSTOMER ORDER DATE': 1293926400000, 'TOTAL SALES': 13500, 'DELIVERY DATE': '04/01/2011' },
                ],
                summary: { language: 'English', text: '' },
                displayChartType: 'line',
                isDataVisible: true,
                topN: null,
                hideOthers: false,
                hideZeroValueRows: false,
                hiddenLabels: [],
            },
        ];

        const { result } = renderHook(() => useAnalysisCardData('date-card'));

        expect(result.current.chartDataForDisplay.map(row => row['CUSTOMER ORDER DATE'])).toEqual([
            '31/12/2010',
            '02/01/2011',
        ]);
        expect(result.current.tableDataForDisplay.map(row => row['DELIVERY DATE'])).toEqual([
            '03/01/2011',
            '04/01/2011',
        ]);
    });

    it('builds stacked pivot column compression state without changing table totals', () => {
        mockStore.analysisCards = [
            {
                id: 'stacked-pivot-card',
                plan: {
                    title: 'Wide pivot',
                    description: 'Wide pivot chart.',
                    chartType: 'stacked_bar',
                    artifactType: 'pivot_matrix',
                    aggregation: 'sum',
                    groupByColumn: 'row_label',
                    valueColumn: 'row_total',
                    artifactMetadata: {
                        artifactType: 'pivot_matrix',
                        matrixColumns: ['row_label', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'row_total'],
                        matrixValueColumns: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'],
                    },
                },
                aggregatedData: [
                    { row_label: 'North', C1: 12, C2: 11, C3: 10, C4: 9, C5: 8, C6: 7, C7: 6, C8: 5, C9: 4, row_total: 72 },
                    { row_label: 'South', C1: 3, C2: 2, C3: 1, C4: null, C5: null, C6: null, C7: null, C8: null, C9: null, row_total: 6 },
                ],
                summary: { language: 'English', text: '' },
                displayChartType: 'stacked_bar',
                isDataVisible: true,
                topN: null,
                hideOthers: false,
                    hideZeroValueRows: false,
                    pivotColumnTopN: 8,
                    pivotHideOtherColumns: false,
                    hiddenPivotSeriesLabels: ['C2'],
                    hiddenLabels: [],
                },
            ];

        const { result } = renderHook(() => useAnalysisCardData('stacked-pivot-card'));

        expect(result.current.displayedTotalValue).toBe(78);
        expect(result.current.totalValue).toBe(78);
        expect(result.current.stackedChartColumnState?.visibleMatrixValueColumns).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
        expect(result.current.stackedChartColumnState?.foldedMatrixValueColumns).toEqual(['C9']);
        expect(result.current.stackedChartColumnState?.chartPlanMetadata?.matrixValueColumns).toEqual(['C1', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', '__pivot_folded_others__']);
        expect(result.current.stackedChartColumnState?.chartRows[0].__pivot_folded_others__).toBe(4);
    });
});
