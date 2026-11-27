import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { applyTopNWithOthers, parseNullableNumericValue, parseNumericValue } from '../utils/dataHelpers';
import { CsvRow, AnalysisCardData, AnalysisPlan } from '../types';
import { isAdditiveAggregation, normalizeCategoryLabel } from '../utils/analysisCardPresentation';
import { resolveCardGroupTotals } from '../utils/cardGroupTotals';
import { buildPivotStackedChartState, DEFAULT_STACKED_PIVOT_COLUMN_TOP_N } from '../utils/pivotMatrixCharting';
import { formatTemporalDisplayValue, getTemporalSortTimestamp, isTemporalDisplayColumn, resolvePeriodGrain } from '../utils/temporalDisplay';
import { tryChronologicalSort } from '../utils/chronologicalSort';
import { detectTiedLeadingWindow, isRankedMeasureView, rankRowsByValue, resolveCardValueKey } from '../utils/rankedPresentation';

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
        groupCoverage,
    } = (cardData || {}) as Partial<AnalysisCardData> & { plan?: AnalysisPlan };
    
    const valueKey = useMemo(() => resolveCardValueKey(plan, aggregatedData), [plan, aggregatedData]);
    const groupByKey = useMemo(() => plan?.groupByColumn || '', [plan]);
    const periodSeries = plan?.periodSeries ?? null;
    const normalizeDisplayRows = useMemo(() => (rows: CsvRow[]) => rows.map(row => {
        const nextRow: CsvRow = { ...row };

        Object.entries(row).forEach(([column, value]) => {
            const temporalDisplayValue = formatTemporalDisplayValue(column, value, periodSeries);
            if (temporalDisplayValue) {
                nextRow[column] = temporalDisplayValue;
            }
        });

        if (groupByKey) {
            const groupDisplayValue = formatTemporalDisplayValue(groupByKey, row[groupByKey], periodSeries);
            nextRow[groupByKey] = groupDisplayValue ?? normalizeCategoryLabel(row[groupByKey]);
        }

        return nextRow;
    }), [groupByKey, periodSeries]);

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

    const rankDirection = plan?.rankDirection;
    const isRankedNonAdditive = isRankedMeasureView(plan, groupByKey, isAdditiveAggregation);
    const appliesTopN = Boolean(plan && !plan.disableTopNControls && plan.chartType !== 'scatter' && groupByKey && topN);
    const rankedNonAdditiveRows = useMemo(
        () => (isRankedNonAdditive ? rankRowsByValue(dataAfterFilter, valueKey, rankDirection) : dataAfterFilter),
        [dataAfterFilter, isRankedNonAdditive, rankDirection, valueKey],
    );

    const totalValue = useMemo(() => {
        return dataAfterFilter.reduce((sum, row) => sum + parseNumericValue(row[valueKey]), 0);
    }, [dataAfterFilter, valueKey]);

    // The rows of a ranked card can be a cut-off of the query's groups; shares and
    // "Overall" use the measured total over all of them, never the sum of the rows.
    const filterActive = Boolean(filter && filter.column && filter.values.length > 0);
    const groupTotals = useMemo(() => resolveCardGroupTotals({
        additive: isAdditiveAggregation(plan?.aggregation),
        coverage: groupCoverage,
        rowsTotal: totalValue,
        rowCount: dataAfterFilter.length,
        filterActive,
    }), [dataAfterFilter.length, filterActive, groupCoverage, plan?.aggregation, totalValue]);

    const dataForLegend = useMemo(() => {
        if (!plan) return [];
        if (appliesTopN && topN) {
            if (isAdditiveAggregation(plan.aggregation)) {
                return applyTopNWithOthers(
                    dataAfterFilter,
                    groupByKey,
                    valueKey,
                    topN,
                    rankDirection,
                    groupTotals.complete ? null : groupTotals.overallTotal,
                );
            }
            // The window keeps the query's ranking direction: an ascending
            // evidence query shows its lowest groups, not the largest values.
            return rankRowsByValue(rankedNonAdditiveRows, valueKey, rankDirection).slice(0, topN);
        }
        return rankedNonAdditiveRows;
    }, [appliesTopN, dataAfterFilter, plan, groupByKey, topN, valueKey, rankDirection, rankedNonAdditiveRows, groupTotals]);

    const tiedLeadingWindow = useMemo(
        () => (appliesTopN && isRankedNonAdditive ? detectTiedLeadingWindow(rankedNonAdditiveRows, valueKey, topN) : null),
        [appliesTopN, isRankedNonAdditive, rankedNonAdditiveRows, topN, valueKey],
    );

    const tableDataForDisplay = useMemo(() => {
        let data = dataForLegend;
        if (!plan?.disableTopNControls && topN && hideOthers && isAdditiveAggregation(plan.aggregation)) {
            data = data.filter(row => row[groupByKey] !== 'Others');
        }
        if (groupByKey && hiddenLabels) {
            data = data.filter(row => !hiddenLabels.includes(String(row[groupByKey])));
        }
        return data;
    }, [dataForLegend, topN, hideOthers, groupByKey, hiddenLabels, plan]);

    const sortedTableData = useMemo(() => {
        if (!tableSort) {
            // Time dimensions default to chronological order whatever order the
            // AI's query returned (e.g. ORDER BY value DESC). Ranked / top-N
            // views of non-time groups are left in their ranking order.
            const isTimeDimension = Boolean(groupByKey) && (
                isTemporalDisplayColumn(groupByKey) || resolvePeriodGrain(groupByKey, periodSeries) !== null
            );
            if (!isTimeDimension || plan?.artifactType === 'pivot_matrix') return tableDataForDisplay;
            const hasOthers = tableDataForDisplay.some(row => row[groupByKey] === 'Others');
            if (hasOthers) return tableDataForDisplay;
            return tryChronologicalSort(tableDataForDisplay, groupByKey) ?? tableDataForDisplay;
        }
        const { column, direction } = tableSort;
        // Period labels such as "Aug 2026" sort chronologically, not alphabetically.
        const sortsByPeriod = resolvePeriodGrain(column, periodSeries) !== null;
        const isMissing = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
        return [...tableDataForDisplay].sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];
            // A cell without a value (e.g. a NULL median) goes last in both directions
            // instead of sorting as 0 or as an empty string.
            if (isMissing(aVal) || isMissing(bVal)) {
                return (isMissing(aVal) ? 1 : 0) - (isMissing(bVal) ? 1 : 0);
            }
            if (sortsByPeriod) {
                const aTime = getTemporalSortTimestamp(aVal, column, periodSeries);
                const bTime = getTemporalSortTimestamp(bVal, column, periodSeries);
                if (aTime !== null && bTime !== null) {
                    return direction === 'asc' ? aTime - bTime : bTime - aTime;
                }
            }
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
    }, [groupByKey, periodSeries, plan?.artifactType, tableDataForDisplay, tableSort]);

    const chartHiddenZeroValueRowCount = useMemo(() => {
        if (plan?.artifactType !== 'pivot_matrix' || !hideZeroValueRows) {
            return 0;
        }
        return tableDataForDisplay.filter(row => parseNullableNumericValue(row[valueKey]) === 0).length;
    }, [hideZeroValueRows, plan?.artifactType, tableDataForDisplay, valueKey]);
    const chartRowDataForDisplay = useMemo(() => {
        const base = sortedTableData;
        if (plan?.artifactType !== 'pivot_matrix' || !hideZeroValueRows) {
            return base;
        }
        return base.filter(row => parseNullableNumericValue(row[valueKey]) !== 0);
    }, [hideZeroValueRows, plan?.artifactType, sortedTableData, valueKey]);
    const tableZeroValueRowCount = useMemo(() => {
        if (plan?.artifactType !== 'pivot_matrix') {
            return 0;
        }
        return tableDataForDisplay.filter(row => parseNullableNumericValue(row[valueKey]) === 0).length;
    }, [plan?.artifactType, tableDataForDisplay, valueKey]);

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
        overallTotalValue: groupTotals.overallTotal,
        groupsComplete: groupTotals.complete,
        matchedGroupCount: groupTotals.matchedGroupCount,
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
        rankDirection: rankDirection ?? null,
        tiedLeadingWindow,
    };
};
