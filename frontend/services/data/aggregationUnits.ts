import type { CsvRow } from '../../types';

/** Only one unambiguous named companion may be inferred. */
export const resolveCompanionUnitColumn = (columns: readonly string[]): string | undefined => {
    const companions = columns.filter(column => ['unit', 'units', 'currency'].includes(column.toLowerCase()));
    return companions.length === 1 ? companions[0] : undefined;
};

/** Match query guards: raw unit equality, whitespace only identifies blanks. */
export const checkAggregationUnits = (
    rows: readonly CsvRow[],
    valueColumn: string,
    unitColumn: string,
    contributes: (value: unknown) => boolean,
): 'mixed_or_missing_units' | null => {
    let unit: string | undefined;
    for (const row of rows) {
        if (!contributes(row[valueColumn])) continue;
        const actual = row[unitColumn];
        if (typeof actual !== 'string' || !actual.trim() || (unit !== undefined && actual !== unit)) {
            return 'mixed_or_missing_units';
        }
        unit = actual;
    }
    return null;
};
