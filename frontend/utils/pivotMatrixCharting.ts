import type { AnalysisArtifactMetadata, AnalysisPlan, CsvRow } from '../types';
import { coerceNumericValue } from './analysisCardPresentation';

export const DEFAULT_PIVOT_GROUP_KEY = 'row_label';
export const DEFAULT_PIVOT_TOTAL_KEY = 'row_total';
export const MAX_STACKED_PIVOT_COLUMNS = 8;
export const DEFAULT_STACKED_PIVOT_COLUMN_TOP_N = 8;
export const PIVOT_FOLDED_OTHERS_KEY = '__pivot_folded_others__';

const getConfiguredMatrixValueColumns = (plan: AnalysisPlan): string[] => {
    if (plan.artifactMetadata?.matrixValueColumns?.length) {
        return plan.artifactMetadata.matrixValueColumns;
    }

    const groupKey = plan.groupByColumn || DEFAULT_PIVOT_GROUP_KEY;
    const totalKey = plan.valueColumn || DEFAULT_PIVOT_TOTAL_KEY;
    return (plan.artifactMetadata?.matrixColumns ?? []).filter(column => column !== groupKey && column !== totalKey);
};

export const getEffectivePivotMatrixValueColumns = (plan: AnalysisPlan, rows: CsvRow[] = []): string[] => {
    if (plan.artifactType !== 'pivot_matrix') {
        return [];
    }

    return getConfiguredMatrixValueColumns(plan).filter(column => rows.some(row => coerceNumericValue(row[column]) !== null));
};

const getVisiblePivotMatrixColumns = (
    activeColumns: string[],
    rows: CsvRow[],
    topN: number | null,
): { visibleColumns: string[]; foldedColumns: string[] } => {
    if (topN === null || topN <= 0 || activeColumns.length <= topN) {
        return {
            visibleColumns: activeColumns,
            foldedColumns: [],
        };
    }

    const sortedByContribution = [...activeColumns]
        .map(column => ({
            column,
            contribution: rows.reduce((sum, row) => sum + Math.abs(coerceNumericValue(row[column]) ?? 0), 0),
        }))
        .sort((left, right) => right.contribution - left.contribution);

    return {
        visibleColumns: sortedByContribution.slice(0, topN).map(entry => entry.column),
        foldedColumns: sortedByContribution.slice(topN).map(entry => entry.column),
    };
};

export interface PivotStackedChartState {
    effectiveMatrixValueColumns: string[];
    visibleMatrixValueColumns: string[];
    foldedMatrixValueColumns: string[];
    chartRows: CsvRow[];
    chartPlanMetadata: AnalysisArtifactMetadata | undefined;
}

export const buildPivotStackedChartState = (
    plan: AnalysisPlan,
    rows: CsvRow[],
    topN: number | null,
    hideOtherColumns: boolean,
    hiddenSeriesLabels: string[] = [],
): PivotStackedChartState => {
    const effectiveMatrixValueColumns = getEffectivePivotMatrixValueColumns(plan, rows);
    const { visibleColumns, foldedColumns } = getVisiblePivotMatrixColumns(
        effectiveMatrixValueColumns,
        rows,
        topN,
    );

    const chartRows = foldedColumns.length > 0 && !hideOtherColumns
        ? rows.map(row => {
            let foldedValue: number | null = null;
            foldedColumns.forEach(column => {
                const numericValue = coerceNumericValue(row[column]);
                if (numericValue === null) {
                    return;
                }
                foldedValue = (foldedValue ?? 0) + numericValue;
            });
            return {
                ...row,
                [PIVOT_FOLDED_OTHERS_KEY]: foldedValue,
            };
        })
        : rows;

    const chartMatrixValueColumns = foldedColumns.length > 0 && !hideOtherColumns
        ? [...visibleColumns, PIVOT_FOLDED_OTHERS_KEY]
        : visibleColumns;
    const filteredChartMatrixValueColumns = chartMatrixValueColumns.filter(column => !hiddenSeriesLabels.includes(column));
    const chartMatrixColumns = plan.artifactMetadata?.matrixColumns?.length
        ? [
            plan.groupByColumn || DEFAULT_PIVOT_GROUP_KEY,
            ...filteredChartMatrixValueColumns,
            plan.valueColumn || DEFAULT_PIVOT_TOTAL_KEY,
        ]
        : undefined;

    return {
        effectiveMatrixValueColumns,
        visibleMatrixValueColumns: visibleColumns,
        foldedMatrixValueColumns: foldedColumns,
        chartRows,
        chartPlanMetadata: plan.artifactMetadata
            ? {
                ...plan.artifactMetadata,
                matrixColumns: chartMatrixColumns,
                matrixValueColumns: filteredChartMatrixValueColumns,
                visibleMatrixValueColumns: filteredChartMatrixValueColumns,
                foldedMatrixValueColumns: foldedColumns,
                hiddenMatrixValueColumns: hiddenSeriesLabels,
            }
            : undefined,
    };
};

export const buildStackedPivotChartPlan = (
    plan: AnalysisPlan,
    chartState: PivotStackedChartState,
): AnalysisPlan => ({
    ...plan,
    artifactMetadata: chartState.chartPlanMetadata,
});
