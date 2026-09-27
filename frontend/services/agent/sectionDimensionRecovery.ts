import type { CsvRow } from '../../types';

const TEMPORAL_COLUMN_PATTERN = /(?:^|[\s_])(date|time|day|week|month|quarter|year|period)(?:$|[\s_])/i;
const LINEAGE_COLUMNS = new Set([
    'SourceRowIndex',
    'RowRole',
    'ResolvedRowRole',
    'SectionLabel',
    'HeaderPath',
    'CarryForwardAppliedColumns',
]);
const DATE_LIKE_VALUE_PATTERNS = [
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s].*)?$/,
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:[T\s].*)?$/,
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}$/i,
];

const normalize = (value: unknown): string => String(value ?? '').trim();
const isDateLike = (value: unknown): boolean => {
    const normalized = normalize(value);
    return Boolean(normalized) && DATE_LIKE_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
};

const ratioAtLeast = (matching: number, total: number, threshold: number): boolean => (
    total > 0 && matching / total >= threshold
);

export interface SectionDimensionRecoveryResult {
    rows: CsvRow[];
    recoveredCounts: Record<string, number>;
}

/**
 * Repairs a report-export pattern where a semantic dimension column contains a
 * duplicate of a date column while the real dimension value lives on the
 * preceding group-header row. Canonicalization already preserves that header as
 * SectionLabel; this function only promotes it when three independent signals
 * agree: a non-temporal target name, date-like duplicated values, and stable
 * non-date section labels. This is a deterministic verifier/fallback, not the
 * primary report-understanding path.
 */
export const recoverMisalignedSectionDimensions = (
    rows: CsvRow[],
): SectionDimensionRecoveryResult => {
    if (rows.length < 5) {
        return { rows, recoveredCounts: {} };
    }

    const columns = Object.keys(rows[0] ?? {});
    const temporalColumns = columns.filter(column => TEMPORAL_COLUMN_PATTERN.test(column));
    const candidateColumns = columns.filter(column => (
        !LINEAGE_COLUMNS.has(column)
        && !TEMPORAL_COLUMN_PATTERN.test(column)
    ));
    const sectionLabels = rows
        .map(row => normalize(row.SectionLabel))
        .filter(Boolean);
    const distinctSectionLabels = new Set(sectionLabels);
    const stableSectionLabels = sectionLabels.length >= Math.ceil(rows.length * 0.8)
        && distinctSectionLabels.size >= 2
        && sectionLabels.filter(value => !isDateLike(value)).length / sectionLabels.length >= 0.8;

    if (!stableSectionLabels || temporalColumns.length === 0) {
        return { rows, recoveredCounts: {} };
    }

    const recoverableColumns = candidateColumns.filter(column => {
        const populated = rows
            .map(row => normalize(row[column]))
            .filter(Boolean);
        if (populated.length < Math.ceil(rows.length * 0.8)) return false;
        if (populated.filter(isDateLike).length / populated.length < 0.8) return false;

        return temporalColumns.some(temporalColumn => {
            const comparableRows = rows.filter(row => (
                normalize(row[column]).length > 0
                && normalize(row[temporalColumn]).length > 0
            ));
            if (comparableRows.length < Math.ceil(rows.length * 0.8)) return false;
            const temporalDateLikeRows = comparableRows.filter(row => isDateLike(row[temporalColumn]));
            if (!ratioAtLeast(temporalDateLikeRows.length, comparableRows.length, 0.8)) return false;
            const matchingRows = comparableRows.filter(row => (
                normalize(row[column]) === normalize(row[temporalColumn])
            ));
            // Exact positional duplication is the strongest signal. Some report
            // exports shift a second business date into the mislabeled target,
            // so a lower exact-match ratio remains acceptable only when both
            // columns are overwhelmingly date-like and the section label is
            // independently stable and non-temporal.
            return ratioAtLeast(matchingRows.length, comparableRows.length, 0.7)
                || ratioAtLeast(temporalDateLikeRows.length, comparableRows.length, 0.95);
        });
    });

    if (recoverableColumns.length === 0) {
        return { rows, recoveredCounts: {} };
    }

    const recoveredCounts: Record<string, number> = {};
    const nextRows = rows.map(row => {
        const sectionLabel = normalize(row.SectionLabel);
        if (!sectionLabel || isDateLike(sectionLabel)) return row;

        const nextRow = { ...row };
        const appliedColumns: string[] = [];
        for (const column of recoverableColumns) {
            if (!isDateLike(row[column])) continue;
            nextRow[column] = sectionLabel;
            recoveredCounts[column] = (recoveredCounts[column] ?? 0) + 1;
            appliedColumns.push(column);
        }
        if (appliedColumns.length > 0) {
            const existing = normalize(row.CarryForwardAppliedColumns);
            nextRow.CarryForwardAppliedColumns = [existing, ...appliedColumns]
                .filter(Boolean)
                .join(', ');
        }
        return nextRow;
    });

    return { rows: nextRows, recoveredCounts };
};
