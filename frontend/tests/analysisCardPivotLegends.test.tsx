import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAppStoreModule from '../store/useAppStore';
import * as useAnalysisCardDataModule from '../hooks/useAnalysisCardData';
import { AnalysisCard } from '../components/analysis-card/AnalysisCard';

vi.mock('../store/useAppStore', () => ({
    useAppStore: vi.fn(),
}));

vi.mock('../hooks/useAnalysisCardData', () => ({
    useAnalysisCardData: vi.fn(),
}));

vi.mock('../components/analysis-card/AnalysisCardHeader', () => ({
    AnalysisCardHeader: () => <div>Header</div>,
}));

vi.mock('../components/analysis-card/AnalysisCardChart', () => ({
    AnalysisCardChart: () => <div>Chart</div>,
}));

vi.mock('../components/analysis-card/AnalysisCardSummary', () => ({
    AnalysisCardSummary: () => <div>Summary</div>,
}));

vi.mock('../components/analysis-card/AnalysisCardControls', () => ({
    AnalysisCardControls: () => <div>Controls</div>,
}));

vi.mock('../components/analysis-card/AnalysisCardDataTables', () => ({
    AnalysisCardDataTables: () => <div>Data Table</div>,
}));

vi.mock('../components/analysis-card/PivotStackedLegend', () => ({
    PivotStackedLegend: () => <div>Series legend</div>,
}));

vi.mock('../components/analysis-card/InteractiveLegend', () => ({
    InteractiveLegend: () => <div>Row legend</div>,
}));

describe('AnalysisCard pivot legends', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAppStoreModule.useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (value: Record<string, unknown>) => unknown) => selector({
            handleChartTypeChange: vi.fn(),
            handleToggleDataVisibility: vi.fn(),
            handleTopNChange: vi.fn(),
            handleHideOthersChange: vi.fn(),
            handleHideZeroValueRowsChange: vi.fn(),
            handlePivotColumnTopNChange: vi.fn(),
            handlePivotHideOtherColumnsChange: vi.fn(),
            handleTogglePivotSeriesLabel: vi.fn(),
            handleResetPivotSeriesLabels: vi.fn(),
            handleToggleLegendLabel: vi.fn(),
            handleToggleDataLabels: vi.fn(),
            deleteAnalysisCard: vi.fn(),
            settings: { language: 'English' },
            dataPreparationPlan: null,
        }));
    });

    afterEach(() => {
        cleanup();
    });

    it('does not render pivot legends inside the card body for stacked pivot views', () => {
        (useAnalysisCardDataModule.useAnalysisCardData as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            cardData: {
                id: 'pivot-card',
                plan: {
                    chartType: 'stacked_bar',
                    title: 'Pivot',
                    description: 'Pivot',
                    aggregation: 'sum',
                    artifactType: 'pivot_matrix',
                    groupByColumn: 'row_label',
                    valueColumn: 'row_total',
                    artifactMetadata: {
                        artifactType: 'pivot_matrix',
                        matrixValueColumns: ['Q1', 'Q2'],
                    },
                },
                aggregatedData: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
                displayChartType: 'stacked_bar',
                isDataVisible: true,
                topN: 8,
                hideOthers: false,
                hideZeroValueRows: false,
                pivotColumnTopN: 8,
                pivotHideOtherColumns: false,
                hiddenPivotSeriesLabels: [],
                hiddenLabels: [],
                disableAnimation: true,
                showDataLabels: false,
                summary: null,
            },
            tableDataForDisplay: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
            chartDataForDisplay: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
            stackedChartColumnState: {
                effectiveMatrixValueColumns: ['Q1', 'Q2'],
                visibleMatrixValueColumns: ['Q1', 'Q2'],
                foldedMatrixValueColumns: [],
                chartRows: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
                chartPlanMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            dataForLegend: [{ row_label: 'North', row_total: 15 }],
            totalValue: 15,
            displayedTotalValue: 15,
            totalRowCount: 1,
            displayedRowCount: 1,
            chartHiddenZeroValueRowCount: 0,
            tableZeroValueRowCount: 0,
            summary: null,
            valueKey: 'row_total',
            groupByKey: 'row_label',
        });

        render(<AnalysisCard cardId="pivot-card" />);

        expect(screen.queryByText('Series legend')).not.toBeInTheDocument();
        expect(screen.queryByText('Row legend')).not.toBeInTheDocument();
    });

    it('does not render pivot legends inside the card body for total-only pivot bar views', () => {
        (useAnalysisCardDataModule.useAnalysisCardData as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            cardData: {
                id: 'pivot-card',
                plan: {
                    chartType: 'bar',
                    title: 'Pivot',
                    description: 'Pivot',
                    aggregation: 'sum',
                    artifactType: 'pivot_matrix',
                    groupByColumn: 'row_label',
                    valueColumn: 'row_total',
                    artifactMetadata: {
                        artifactType: 'pivot_matrix',
                        matrixValueColumns: ['Q1', 'Q2'],
                    },
                },
                aggregatedData: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
                displayChartType: 'bar',
                isDataVisible: true,
                topN: 8,
                hideOthers: false,
                hideZeroValueRows: false,
                pivotColumnTopN: 8,
                pivotHideOtherColumns: false,
                hiddenPivotSeriesLabels: [],
                hiddenLabels: [],
                disableAnimation: true,
                showDataLabels: false,
                summary: null,
            },
            tableDataForDisplay: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
            chartDataForDisplay: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
            stackedChartColumnState: {
                effectiveMatrixValueColumns: ['Q1', 'Q2'],
                visibleMatrixValueColumns: ['Q1', 'Q2'],
                foldedMatrixValueColumns: [],
                chartRows: [{ row_label: 'North', Q1: 10, Q2: 5, row_total: 15 }],
                chartPlanMetadata: {
                    artifactType: 'pivot_matrix',
                    matrixValueColumns: ['Q1', 'Q2'],
                },
            },
            dataForLegend: [{ row_label: 'North', row_total: 15 }],
            totalValue: 15,
            displayedTotalValue: 15,
            totalRowCount: 1,
            displayedRowCount: 1,
            chartHiddenZeroValueRowCount: 0,
            tableZeroValueRowCount: 0,
            summary: null,
            valueKey: 'row_total',
            groupByKey: 'row_label',
        });

        render(<AnalysisCard cardId="pivot-card" />);

        expect(screen.queryByText('Row legend')).not.toBeInTheDocument();
        expect(screen.queryByText('Series legend')).not.toBeInTheDocument();
    });

    it('does not render hundreds of row legend items for a temporal series', () => {
        const rows = Array.from({ length: 36 }, (_, index) => ({
            month: `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
            avg_price: 400_000 + index * 1_000,
        }));
        (useAnalysisCardDataModule.useAnalysisCardData as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            cardData: {
                id: 'trend-card',
                plan: {
                    chartType: 'area',
                    title: 'Average Price by Month',
                    description: 'Monthly trend.',
                    aggregation: 'avg',
                    groupByColumn: 'month',
                    valueColumn: 'avg_price',
                },
                aggregatedData: rows,
                displayChartType: 'area',
                isDataVisible: false,
                topN: null,
                hideOthers: false,
                hiddenLabels: [],
                hiddenPivotSeriesLabels: [],
                summary: null,
            },
            tableDataForDisplay: rows,
            chartDataForDisplay: rows,
            stackedChartColumnState: null,
            dataForLegend: rows,
            totalValue: 1,
            displayedTotalValue: 1,
            totalRowCount: rows.length,
            displayedRowCount: rows.length,
            chartHiddenZeroValueRowCount: 0,
            tableZeroValueRowCount: 0,
            summary: null,
            valueKey: 'avg_price',
            groupByKey: 'month',
            tableSort: null,
        });

        render(<AnalysisCard cardId="trend-card" isSpotlighted />);

        expect(screen.getByText('Chart')).toBeInTheDocument();
        expect(screen.queryByText('Row legend')).not.toBeInTheDocument();
    });
});
