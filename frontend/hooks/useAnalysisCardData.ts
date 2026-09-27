import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { applyTopNWithOthers, parseNumericValue } from '../utils/dataHelpers';
import { CsvRow, AnalysisCardData, AnalysisPlan } from '../types';
import { normalizeCategoryLabel } from '../utils/analysisCardPresentation';
import { buildPivotStackedChartState, DEFAULT_STACKED_PIVOT_COLUMN_TOP_N } from '../utils/pivotMatrixCharting';
import { formatTemporalDisplayValue } from '../utils/temporalDisplay';

export const useAnalysisCardData = (cardId: string) => {
    const cardData = useAppStore(state => state.analysisCards.find(c => c.id === cardId));

    const {
        plan,
        aggregatedData,
        summary,
        topN,
        hideOthers,
        hideZeroValueRows,
        pivotColumnTopN,
        pivotHideOtherColumns,
        hiddenPivotSeriesLabels,
        filter,
        hiddenLabels,
        tableSort,
    } = (cardData || {}) as Partial<AnalysisCardData> & { plan?: AnalysisPlan };
    
    const valueKey = useMemo(() => {
        const planned = plan?.valueColumn || 'count';
        if (!aggregatedData?.length) return planned;

        // Fast path: planned column exists in data
        if (planned in aggregatedData[0]) return planned;

        // Reconcile: when SQL-first cards use an aggregate alias (e.g. "Sum Total")
        // that differs from plan.valueColumn (e.g. "TOTAL"), find the actual numeric
        // column in the data so charts and legends render correctly.
        const groupBy = plan?.groupByColumn;
        const columns = Object.keys(aggregatedData[0]);
        const plannedLower = planned.toLowerCase();

        // Try case-insensitive or containment match first
        const aliasMatch = columns.find(col => {
            if (col === groupBy) return false;
            const colLower = col.toLowerCase();
            return colLower === plannedLower
                || colLower.endsWith(` ${plannedLower}`)
                || colLower.startsWith(`${plannedLower} `);
        });
        if (aliasMatch) return aliasMatch;

        // Fallback: pick the first numeric non-groupBy column
        const numericCol = columns.find(col =>
            col !== groupBy && typeof aggregatedData[0][col] === 'number',
        );
        return numericCol || planned;
    }, [plan, aggregatedData]);
    const groupByKey = useMemo(() => plan?.groupByColumn || '', [plan]);
    const normalizeDisplayRows = useMemo(() => (rows: CsvRow[]) => rows.map(row => {
        const nextRow: CsvRow = { ...row };

        Object.entries(row).forEach(([column, value]) => {
            const temporalDisplayValue = formatTemporalDisplayValue(column, value);
            if (temporalDisplayValue) {
                nextRow[column] = temporalDisplayValue;
            }
        });

        if (groupByKey) {
            const groupDisplayValue = formatTemporalDisplayValue(groupByKey, row[groupByKey]);
            nextRow[groupByKey] = groupDisplayValue ?? normalizeCategoryLabel(row[groupByKey]);
        }

        return nextRow;
    }), [groupByKey]);

    const dataAfterFilter = useMemo(() => {
        if (!aggregatedData) return [];
        let data = aggregatedData;
        if (filter && filter.column && filter.values.length > 0) {
            data = data.filter(row => {
                const candidate = row[filter.column];
                return (typeof candidate === 'string' || typeof candidate === 'number')
                    ? filter.values.includes(candidate)
                    : false;
            });
        }
        return normalizeDisplayRows(data);
    }, [aggregatedData, filter, normalizeDisplayRows]);

    const dataForLegend = useMemo(() => {
        if (!plan) return [];
        if (!plan.disableTopNControls && plan.chartType !== 'scatter' && groupByKey && topN) {
            return applyTopNWithOthers(dataAfterFilter, groupByKey, valueKey, topN);
        }
        return dataAfterFilter;
    }, [dataAfterFilter, plan, groupByKey, topN, valueKey]);

    const tableDataForDisplay = useMemo(() => {
        let data = dataForLegend;
        if (!plan?.disableTopNControls && topN && hideOthers) {
            data = data.filter(row => row[groupByKey] !== 'Others');
        }
        if (groupByKey && hiddenLabels) {
            data = data.filter(row => !hiddenLabels.includes(String(row[groupByKey])));
        }
        return data;
    }, [dataForLegend, topN, hideOthers, groupByKey, hiddenLabels, plan]);

    const sortedTableData = useMemo(() => {
        if (!tableSort) return tableDataForDisplay;
        const { column, direction } = tableSort;
        return [...tableDataForDisplay].sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];
            // Treat numeric-like strings as numbers for correct sort order
            const aNum = typeof aVal === 'number' ? aVal : Number(String(aVal).replace(/[,$%()]/g, (m) => m === '(' ? '-' : m === ')' ? '' : ''));
            const bNum = typeof bVal === 'number' ? bVal : Number(String(bVal).replace(/[,$%()]/g, (m) => m === '(' ? '-' : m === ')' ? '' : ''));
            const bothNumeric = !isNaN(aNum) && !isNaN(bNum) && aVal !== '' && aVal != null && bVal !== '' && bVal != null;
            if (bothNumeric) {
                return direction === 'asc' ? aNum - bNum : bNum - aNum;
            }
            // Fallback: locale-aware string comparison
            const aStr = String(aVal ?? '');
            const bStr = String(bVal ?? '');
            return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
        });
    }, [tableDataForDisplay, tableSort]);

    const chartHiddenZeroValueRowCount = useMemo(() => {
        if (plan?.artifactType !== 'pivot_matrix' || !hideZeroValueRows) {
            return 0;
        }
        return tableDataForDisplay.filter(row => parseNumericValue(row[valueKey]) === 0).length;
    }, [hideZeroValueRows, plan?.artifactType, tableDataForDisplay, valueKey]);
    const chartRowDataForDisplay = useMemo(() => {
        const base = sortedTableData;
        if (plan?.artifactType !== 'pivot_matrix' || !hideZeroValueRows) {
            return base;
        }
        return base.filter(row => parseNumericValue(row[valueKey]) !== 0);
    }, [hideZeroValueRows, plan?.artifactType, sortedTableData, valueKey]);
    const tableZeroValueRowCount = useMemo(() => {
        if (plan?.artifactType !== 'pivot_matrix') {
            return 0;
        }
        return tableDataForDisplay.filter(row => parseNumericValue(row[valueKey]) === 0).length;
    }, [plan?.artifactType, tableDataForDisplay, valueKey]);

    const totalValue = useMemo(() => {
        return dataAfterFilter.reduce((sum, row) => sum + parseNumericValue(row[valueKey]), 0);
    }, [dataAfterFilter, valueKey]);

    const displayedTotalValue = useMemo(() => {
        return tableDataForDisplay.reduce((sum, row) => sum + parseNumericValue(row[valueKey]), 0);
    }, [tableDataForDisplay, valueKey]);
    const stackedChartColumnState = useMemo(() => {
        if (!plan || plan.artifactType !== 'pivot_matrix') {
            return null;
        }
        return buildPivotStackedChartState(
            plan,
            chartRowDataForDisplay,
            pivotColumnTopN ?? DEFAULT_STACKED_PIVOT_COLUMN_TOP_N,
            pivotHideOtherColumns ?? false,
            hiddenPivotSeriesLabels ?? [],
        );
    }, [chartRowDataForDisplay, hiddenPivotSeriesLabels, pivotColumnTopN, pivotHideOtherColumns, plan]);

    return {
        cardData,
        tableDataForDisplay: sortedTableData,
        chartDataForDisplay: chartRowDataForDisplay,
        dataForLegend,
        totalValue,
        displayedTotalValue,
        totalRowCount: dataAfterFilter.length,
        displayedRowCount: tableDataForDisplay.length,
        chartHiddenZeroValueRowCount,
        tableZeroValueRowCount,
        stackedChartColumnState,
        summary,
        valueKey,
        groupByKey,
        tableSort: tableSort ?? null,
    };
};
