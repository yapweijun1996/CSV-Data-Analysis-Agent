import type { CsvRow } from '../../../types';

const MAX_NUMERIC_COLUMNS = 5;

export interface DataQueryNumericDigest {
    column: string;
    observedValues: number;
    first: number;
    last: number;
    min: number;
    max: number;
    absoluteChange: number;
    percentChange: number | null;
    firstLabel: string | null;
    lastLabel: string | null;
    minLabel: string | null;
    maxLabel: string | null;
}

export interface DataQueryResultDigest {
    rowCount: number;
    labelColumn: string | null;
    firstRow: CsvRow | null;
    lastRow: CsvRow | null;
    numericColumns: DataQueryNumericDigest[];
}

const toFiniteNumber = (value: CsvRow[string]): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
        return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const toLabel = (value: CsvRow[string]): string | null => {
    if (value === null || value === undefined) return null;
    return String(value);
};

/**
 * Summarizes every returned query row without sending the full rowset to the
 * model. Row order is preserved so chronological query results expose their
 * true first/latest values while ranked results still expose their endpoints.
 */
export const buildDataQueryResultDigest = (
    rows: CsvRow[],
    selectedColumns: string[] = [],
): DataQueryResultDigest => {
    if (rows.length === 0) {
        return {
            rowCount: 0,
            labelColumn: null,
            firstRow: null,
            lastRow: null,
            numericColumns: [],
        };
    }

    const columns = selectedColumns.length > 0
        ? selectedColumns
        : Object.keys(rows[0]);
    const numericColumns = columns
        .filter(column => rows.some(row => toFiniteNumber(row[column]) !== null));
    const labelColumn = columns.find(column => !numericColumns.includes(column)) ?? null;

    const summaries = numericColumns
        .slice(0, MAX_NUMERIC_COLUMNS)
        .flatMap<DataQueryNumericDigest>(column => {
            const observations = rows.flatMap((row, rowIndex) => {
                const value = toFiniteNumber(row[column]);
                return value === null ? [] : [{ row, rowIndex, value }];
            });
            if (observations.length === 0) return [];

            const first = observations[0];
            const last = observations[observations.length - 1];
            const min = observations.reduce((best, item) =>
                item.value < best.value ? item : best, first);
            const max = observations.reduce((best, item) =>
                item.value > best.value ? item : best, first);
            const labelFor = (row: CsvRow) =>
                labelColumn ? toLabel(row[labelColumn]) : null;

            return [{
                column,
                observedValues: observations.length,
                first: first.value,
                last: last.value,
                min: min.value,
                max: max.value,
                absoluteChange: last.value - first.value,
                percentChange: first.value === 0
                    ? null
                    : ((last.value - first.value) / Math.abs(first.value)) * 100,
                firstLabel: labelFor(first.row),
                lastLabel: labelFor(last.row),
                minLabel: labelFor(min.row),
                maxLabel: labelFor(max.row),
            }];
        });

    return {
        rowCount: rows.length,
        labelColumn,
        firstRow: rows[0],
        lastRow: rows[rows.length - 1],
        numericColumns: summaries,
    };
};
