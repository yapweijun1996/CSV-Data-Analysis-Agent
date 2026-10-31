import { CsvData, CsvRow, AnalysisPlan } from '../../../../types';
import { robustParseFloat } from '../../../data/dataProfiler';
import { checkAggregationUnits, resolveCompanionUnitColumn } from '../../../data/aggregationUnits';
import { tryChronologicalSort } from '../../../../utils/chronologicalSort';
import { getValueCaseInsensitive, calculateAggregation } from './aggregationHelpers';
import { applyPreFilter } from '../../../../utils/planValidation/preFilterSupport';

export type AggregationSpec = AnalysisPlan & { _internal_groupByColumns?: string[] };

const guardedMeasures = (spec: AggregationSpec) => [
    { column: spec.valueColumn, aggregation: spec.aggregation },
    ...(spec.chartType === 'combo' && spec.secondaryValueColumn && spec.secondaryAggregation
        ? [{ column: spec.secondaryValueColumn, aggregation: spec.secondaryAggregation }]
        : []),
].filter(measure => measure.column && (measure.aggregation === 'sum' || measure.aggregation === 'avg'));

export const aggregationHasInferredUnit = (data: CsvData, spec: AggregationSpec): boolean =>
    guardedMeasures(spec).length > 0 &&
    resolveCompanionUnitColumn([...new Set(data.data.flatMap(row => Object.keys(row)))]) !== undefined;

export const executeAggregationCore = (data: CsvData, spec: AggregationSpec): CsvRow[] => {
    let dataToProcess = data.data;

    if (spec.preFilter) {
        spec.preFilter.forEach(filter => {
            if (filter && typeof filter === 'object' && filter.column && filter.value !== undefined) {
                dataToProcess = dataToProcess.filter(row => {
                    const rowValue = getValueCaseInsensitive(row, filter.column);
                    return applyPreFilter(rowValue, filter.operator || 'eq', filter.value);
                });
            }
        });
    }

    if (spec._internal_groupByColumns && spec.groupByColumn) {
        const originalGroupColumns = spec._internal_groupByColumns;
        const compositeKey = spec.groupByColumn;
        dataToProcess = dataToProcess.map(row => ({
            ...row,
            [compositeKey]: originalGroupColumns.map(col => getValueCaseInsensitive(row, col)).join(' - '),
        }));
    }

    const measures = guardedMeasures(spec);
    if (measures.length) {
        const columns = [...new Set(data.data.flatMap(row => Object.keys(row)))];
        const unitColumn = resolveCompanionUnitColumn(columns);
        if (unitColumn) {
            const groupedRows = new Map<string, CsvRow[]>();
            for (const row of dataToProcess) {
                const key = String(getValueCaseInsensitive(row, spec.groupByColumn));
                if (key === 'undefined' || key === 'null') continue;
                const group = groupedRows.get(key);
                if (group) group.push(row);
                else groupedRows.set(key, [row]);
            }
            for (const measure of measures) {
                const column = measure.column!;
                for (const rows of groupedRows.values()) {
                    // The executor resolves measure names case-insensitively; the shared guard uses exact keys.
                    const normalizedRows = rows.map(row => ({
                        ...row,
                        [column]: getValueCaseInsensitive(row, column) ?? null,
                    }));
                    if (checkAggregationUnits(normalizedRows, column, unitColumn, value => robustParseFloat(value) !== null)) {
                        throw new Error('mixed_or_missing_units: Cannot calculate: units are missing or mixed. Group or filter by unit.');
                    }
                }
            }
        }
    }

    if (spec.chartType === 'combo' && spec.secondaryValueColumn && spec.secondaryAggregation) {
        const { groupByColumn, valueColumn, aggregation, secondaryValueColumn, secondaryAggregation } = spec;
        const groups: { [key: string]: { primaryValues: number[]; secondaryValues: number[] } } = {};

        dataToProcess.forEach(row => {
            const groupKey = String(getValueCaseInsensitive(row, groupByColumn));
            if (groupKey === 'undefined' || groupKey === 'null') return;

            if (!groups[groupKey]) {
                groups[groupKey] = { primaryValues: [], secondaryValues: [] };
            }

            const primaryValue = robustParseFloat(getValueCaseInsensitive(row, valueColumn));
            if (primaryValue !== null) {
                groups[groupKey].primaryValues.push(primaryValue);
            }

            const secondaryValue = robustParseFloat(getValueCaseInsensitive(row, secondaryValueColumn));
            if (secondaryValue !== null) {
                groups[groupKey].secondaryValues.push(secondaryValue);
            }
        });

        const aggregatedResult: CsvRow[] = Object.keys(groups)
            .filter(key => groups[key].primaryValues.length > 0 || groups[key].secondaryValues.length > 0)
            .map(key => ({
                [groupByColumn!]: key,
                [valueColumn!]: calculateAggregation(groups[key].primaryValues, aggregation!),
                [secondaryValueColumn]: calculateAggregation(groups[key].secondaryValues, secondaryAggregation!),
            }));

        const chronologicallySorted = tryChronologicalSort(aggregatedResult, groupByColumn!);
        return (
            chronologicallySorted ||
            aggregatedResult.sort(
                (a, b) => (Number(getValueCaseInsensitive(b, valueColumn)) || 0) - (Number(getValueCaseInsensitive(a, valueColumn)) || 0)
            )
        );
    }

    const { groupByColumn, aggregation } = spec;
    const { valueColumn } = spec;

    const groups: { [key: string]: number[] } = {};

    dataToProcess.forEach(row => {
        const groupKey = String(getValueCaseInsensitive(row, groupByColumn));
        if (groupKey === 'undefined' || groupKey === 'null') return;
        if (!groups[groupKey]) groups[groupKey] = [];

        if (valueColumn) {
            const value = robustParseFloat(getValueCaseInsensitive(row, valueColumn));
            if (value !== null) groups[groupKey].push(value);
        } else if (aggregation === 'count') {
            groups[groupKey].push(1);
        }
    });

    const finalValueColumn = valueColumn || 'count';
    const aggregatedResult: CsvRow[] = Object.keys(groups)
        .filter(key => groups[key].length > 0)
        .map(key => ({
            [groupByColumn!]: key,
            [finalValueColumn]: calculateAggregation(groups[key], aggregation!),
        }));

    const chronologicallySorted = tryChronologicalSort(aggregatedResult, groupByColumn!);
    return (
        chronologicallySorted ||
        aggregatedResult.sort(
            (a, b) => (Number(getValueCaseInsensitive(b, finalValueColumn)) || 0) - (Number(getValueCaseInsensitive(a, finalValueColumn)) || 0)
        )
    );
};
