import type {
    CanonicalDatasetArtifact,
    CanonicalVerificationResult,
    CanonicalizationStatus,
    CsvData,
    CsvRow,
    ReportRowRole,
    ReportRowRoleAssignment,
    ReportStructureResolution,
    ReportIntakeIr,
} from '../../types';
import { applyDataOperations } from './execution/dataOperationRunner';
import { buildDeterministicCleaningFallbackAction } from './orchestration/deterministicCleaningFallback';
import { getPrimaryReshapeHypothesis } from './reportShapeHypothesis';
import { detectReportShape } from './reportShapeDetector';
import {
    buildMergedBoundaryHeaders,
    inferFactColumns,
    normalizeReportCellText,
} from './reportStructureNormalization';
import { isSummaryLike, SUMMARY_TOKEN_PATTERN } from './reportShapeUtils';
import { computeRowRoleSignals, type RowRoleSignalBundle } from './runtime/rowRoleSignals';
import { recoverMisalignedSectionDimensions } from './sectionDimensionRecovery';

const UNNAMED_COLUMN_PATTERN = /^_?unnamed_column_/i;
const DATE_LIKE_PATTERN = /^(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})$/;

const MONTH_NAME_ONLY_PATTERN = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;

// A "header relabel row" is a body row whose own cell values are period
// labels ("April", "May", "June") sitting in columns that otherwise hold
// numeric fact values — a mid-body re-declaration of what the wide columns
// mean (e.g. a quarterly-sectioned report whose Jan/Feb/Mar columns are
// reused for Apr/May/Jun, then Jul/Aug/Sep, then Oct/Nov/Dec). Melting a
// table like this with a single global header would silently mislabel
// three-quarters of the data under the first section's month names — same
// totals, wrong SourceColumnName. Two or more such cells in one row is
// evidence of this pattern rather than an isolated stray value.
const hasHeaderRelabelRow = (data: CsvData): boolean => {
    const columns = Object.keys(data.data[0] ?? {});
    if (columns.length === 0) return false;
    return data.data.some(row => {
        const monthLikeCount = columns.reduce(
            (count, column) => count + (MONTH_NAME_ONLY_PATTERN.test(String(row[column] ?? '').trim()) ? 1 : 0),
            0,
        );
        return monthLikeCount >= 2;
    });
};

const cloneCsvData = (data: CsvData): CsvData => ({
    ...data,
    data: data.data.map(row => ({ ...row })),
    metadataRows: [...(data.metadataRows ?? [])].map(row => [...row]),
    headerLayers: [...(data.headerLayers ?? [])].map(row => [...row]),
    summaryRows: [...(data.summaryRows ?? [])].map(row => ({ ...row })),
});

const buildHeaderPath = (sourceColumnName: string | null) => sourceColumnName ?? null;

const normalizeCanonicalRowRole = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
};

const isDetailLikeCanonicalRowRole = (value: unknown): boolean => {
    const normalized = normalizeCanonicalRowRole(value);
    if (!normalized) {
        return true;
    }
    return normalized === 'detail' || normalized === 'fact';
};

const isEmbeddedTotalBusinessIdentityRow = (row: CsvRow): boolean => Object.entries(row).some(([column, value]) => {
    if (CANONICAL_LINEAGE_COLUMNS.has(column) || column === 'RowClass') return false;
    if (typeof value !== 'string') return false;
    const words = value.trim().split(/\s+/).filter(Boolean);
    const totalIndex = words.findIndex(word => /^total[,:;]?$/i.test(word));
    if (totalIndex < 0) return false;
    if (totalIndex > 0 && totalIndex < words.length - 1) {
        return !/^(?:grand|net|customer|group|category|sub)$/i.test(words[totalIndex - 1] ?? '');
    }
    return totalIndex === 0
        && words.length >= 3
        && !/^(?:by|of)$/i.test(words[1] ?? '');
});

const dropLowValueUnnamedColumns = (rows: CsvRow[]) => {
    if (rows.length === 0) {
        return rows;
    }
    const columns = Object.keys(rows[0] ?? {});
    const removable = new Set(
        columns.filter(column =>
            UNNAMED_COLUMN_PATTERN.test(column)
            && rows.every(row => {
                const value = row[column];
                return value === null || value === '' || value === undefined;
            }),
        ),
    );

    if (removable.size === 0) {
        return rows;
    }

    return rows.map(row =>
        Object.fromEntries(
            Object.entries(row).filter(([column]) => !removable.has(column)),
        ),
    );
};

const parseNumericCandidate = (value: unknown): number | null => {
    const normalized = normalizeReportCellText(value);
    if (!normalized) {
        return null;
    }
    if (DATE_LIKE_PATTERN.test(normalized)) {
        return null;
    }
    const numeric = normalized
        .replace(/[^0-9.\-]/g, '')
        .trim();
    if (!numeric || numeric === '-' || numeric === '.' || numeric === '-.') {
        return null;
    }
    const parsed = Number.parseFloat(numeric);
    return Number.isFinite(parsed) ? parsed : null;
};

const isBlankRawRow = (row: string[]) => row.every(cell => normalizeReportCellText(cell) === '');

const inferDenseSequentialIdentityColumns = (params: {
    headers: string[];
    rows: string[][];
    bodyStartIndex: number;
    summaryStartIndex: number;
}): string[] => {
    const bodyRows = params.rows
        .slice(params.bodyStartIndex, params.summaryStartIndex)
        .filter(row => !isBlankRawRow(row));
    if (bodyRows.length < 10) return [];

    return params.headers.filter((_, columnIndex) => {
        const values = bodyRows
            .map(row => normalizeReportCellText(row[columnIndex] ?? ''))
            .filter(Boolean);
        const integers = values
            .filter(value => /^\d+$/.test(value))
            .map(value => Number.parseInt(value, 10));
        if (integers.length < 10 || integers.length / bodyRows.length < 0.9) return false;
        if (integers.length / values.length < 0.98) return false;
        if (new Set(integers).size / integers.length < 0.98) return false;

        let consecutiveTransitions = 0;
        for (let index = 1; index < integers.length; index += 1) {
            if (integers[index] === integers[index - 1] + 1) consecutiveTransitions += 1;
        }
        return consecutiveTransitions / Math.max(integers.length - 1, 1) >= 0.9;
    });
};

const buildRecordFromRawRow = (headers: string[], row: string[]): CsvRow =>
    Object.fromEntries(headers.map((header, index) => [header, normalizeReportCellText(row[index] ?? '')]));

const CANONICAL_LINEAGE_COLUMNS = new Set([
    'SourceRowIndex',
    'RowRole',
    'ResolvedRowRole',
    'SectionLabel',
    'HeaderPath',
    'CarryForwardAppliedColumns',
]);

const overlayPreparedSharedValues = (
    canonicalRows: CsvRow[],
    preparedRows: CsvRow[],
) => {
    if (canonicalRows.length === 0 || canonicalRows.length !== preparedRows.length) {
        return canonicalRows;
    }

    return canonicalRows.map((row, index) => {
        const preparedRow = preparedRows[index];
        if (!preparedRow) {
            return row;
        }

        let changed = false;
        const nextRow: CsvRow = { ...row };
        Object.entries(preparedRow).forEach(([column, value]) => {
            if (CANONICAL_LINEAGE_COLUMNS.has(column) || !Object.prototype.hasOwnProperty.call(nextRow, column)) {
                return;
            }
            if (nextRow[column] === value) {
                return;
            }
            // Preserve canonical numeric coercion — do not overwrite a parsed
            // number with a raw string from the prepared (pre-canonical) data.
            if (typeof nextRow[column] === 'number' && typeof value === 'string') {
                return;
            }
            // Preserve carry-forward filled values — do not overwrite a non-empty
            // canonical value with an empty prepared value. The carry-forward pass
            // fills merged-cell gaps intentionally; the prepared data still has blanks.
            const carryForwardApplied = String(nextRow.CarryForwardAppliedColumns ?? '');
            if (carryForwardApplied.includes(column)) {
                const currentStr = String(nextRow[column] ?? '').trim();
                const incomingStr = String(value ?? '').trim();
                if (currentStr && !incomingStr) {
                    return;
                }
            }
            nextRow[column] = value;
            changed = true;
        });

        return changed ? nextRow : row;
    });
};

const isHeaderEchoRow = (row: string[], headers: string[]) => {
    const rowValues = row.map(normalizeReportCellText).filter(Boolean);
    const headerValues = headers.map(normalizeReportCellText).filter(Boolean);
    if (rowValues.length < 2 || headerValues.length < 2) {
        return false;
    }
    const overlap = rowValues.filter(value => headerValues.includes(value)).length;
    return overlap >= Math.max(2, Math.floor(rowValues.length * 0.7));
};

const classifyDeterministicRowRole = (params: {
    rawRow: string[];
    rawRowIndex: number;
    headers: string[];
    record: CsvRow;
    structure: ReportStructureResolution;
    factColumns: string[];
    carryForwardColumns: string[];
    sectionLabelColumns: string[];
    primaryIdentityColumns: string[];
    signalBundle?: RowRoleSignalBundle | null;
}): ReportRowRole => {
    if (isBlankRawRow(params.rawRow)) {
        return 'blank';
    }
    if (params.structure.repeatedHeaderRowIndexes.includes(params.rawRowIndex) || isHeaderEchoRow(params.rawRow, params.headers)) {
        return 'header';
    }
    if (params.structure.summaryStartIndex !== null && params.rawRowIndex >= params.structure.summaryStartIndex) {
        // Structural signal first: sum-verification identifies true summary rows.
        const isSumHit = params.signalBundle?.sumVerification.isSumMatch ?? false;
        if (isSumHit) return 'summary';
        // Regex fallback for rows past summary boundary.
        return SUMMARY_TOKEN_PATTERN.test(Object.values(params.record).join(' | ')) ? 'summary' : 'footer';
    }

    // Some advertising/reporting exports place a verified grand-total record
    // immediately below the header and then emit the underlying detail rows.
    // The structural signal is deliberately conservative (blank business
    // identity plus reconciliation across at least three additive facts), so
    // apply it only at the first body row and keep the broader mid-body path
    // protected from coincidental numeric matches.
    if (
        params.rawRowIndex === params.structure.bodyStartIndex
        && params.signalBundle?.sumVerification.isSumMatch
        && params.signalBundle.sumVerification.sumMatchType === 'grand_total'
    ) {
        return 'summary';
    }

    const factValues = params.factColumns.map(column => parseNumericCandidate(params.record[column]));
    const hasNonZeroFact = factValues.some(value => value !== null && Math.abs(value) > 0);
    const hasAnyFactValue = factValues.some(value => value !== null);
    const descriptorValues = params.sectionLabelColumns
        .map(column => normalizeReportCellText(params.record[column]))
        .filter(Boolean);
    const carryForwardValues = params.carryForwardColumns
        .map(column => normalizeReportCellText(params.record[column]))
        .filter(Boolean);
    const nonEmptyValues = Object.values(params.record).map(normalizeReportCellText).filter(Boolean);
    const hasNumericLookingValue = hasNonZeroFact || params.factColumns.some(column =>
        parseNumericCandidate(params.record[column]) !== null,
    );
    // Summary-token scanning must skip long free-text values (remarks,
    // descriptions): a multi-hundred-character paragraph can incidentally
    // contain a word-boundary match for "balance"/"total" as ordinary
    // prose, misclassifying an otherwise normal detail row as summary. A
    // genuine "Sub Total"/"Grand Total: 1,234.56" label is always short.
    const SUMMARY_SCAN_MAX_VALUE_LENGTH = 60;
    const summaryScanText = nonEmptyValues.filter(value => value.length <= SUMMARY_SCAN_MAX_VALUE_LENGTH).join(' | ');

    // Mid-body summary detection uses regex as primary — structural sum-verification
    // has too many false positives in carry-forward/hierarchical reports where detail
    // rows often have empty descriptors. Sum-verification is used at summary boundary
    // and footer detection instead (where positional context reduces false positives).
    if (SUMMARY_TOKEN_PATTERN.test(summaryScanText) && (hasNumericLookingValue || hasNonZeroFact)) {
        return 'summary';
    }

    // When a table has a dense, unique, monotonic row identity, rows without
    // that identity belong to a continuation/secondary block rather than the
    // primary fact grain. They remain available in the immutable source and
    // can later become a related table, but must not inflate the main table.
    if (
        params.primaryIdentityColumns.length > 0
        && params.primaryIdentityColumns.every(column => !normalizeReportCellText(params.record[column]))
    ) {
        return nonEmptyValues.length === 1 ? 'group_header' : 'note';
    }

    // A singleton text row is a section/group marker even when the column it
    // occupies was inferred as carry-forward. Carry-forward describes blank
    // detail cells; it must not turn the marker itself into a fact record.
    if (!hasAnyFactValue && nonEmptyValues.length === 1) {
        return 'group_header';
    }

    // GAP-4 fix (2026-07-24): a row with explicit zero fact values (e.g. a $0
    // quotation, a zero-movement stock line) is a legitimate record, not noise.
    // Only rows with NO fact cells at all can be group headers, and all-zero
    // rows are notes only when they also carry no descriptive text identity.
    // (This promotes the relaxation harness's evidence rule to the primary
    // classifier instead of gating it behind a catastrophic-retention
    // threshold, which silently lost partial zero-value rows — see
    // tests/benchmark GAP-4 goldens.)
    // Shape signal: classification runs on the RAW record (pre carry-forward),
    // so a real record shows its own identity cells (sequence number, date,
    // document number, party, ...) while a section-label row carries only its
    // label text. Pure numeric strings (a zero qty "0.00", a bare sequence
    // number) are not identity; dates, document numbers ("DQ1080"), project
    // codes ("AHTC-EU1"), names, and unit-suffixed quantities ("8.00 SET")
    // are. Strict-shape test on purpose — parseNumericCandidate is an
    // aggressive extractor that would misread "AHTC-EU1" as -1.
    const PURE_NUMBER_PATTERN = /^-?[\d,]*\.?\d+%?$/;
    const factSet = new Set(params.factColumns);
    // GAP-4 residual fix (2026-07-24): column-role-aware identity — a "*Code*"/
    // "*ID*"-named column (e.g. Stock Code "0034402") is structurally a
    // descriptor regardless of its value's digit shape; the pure-number
    // exclusion below exists to filter out bare sequence numbers and zero
    // quantities in columns that carry no such structural role, not to
    // discount a genuine identifier just because it happens to be all digits.
    const STRUCTURAL_IDENTIFIER_COLUMN_PATTERN = /\b(?:code|id)\b/i;
    const countIdentityTexts = (): number => Object.entries(params.record)
        .filter(([column]) => !factSet.has(column))
        .map(([column, value]) => ({ column, text: normalizeReportCellText(value) }))
        .filter(({ column, text }) => text && (STRUCTURAL_IDENTIFIER_COLUMN_PATTERN.test(column) || !PURE_NUMBER_PATTERN.test(text)))
        .length;
    // A hierarchical/WBS-style item code ("1.07", "14.16") carries 2+ decimal
    // digits; its section/category-level ancestor ("1.0") carries at most 1.
    // Same convention already used for the melt-path classifiers
    // (reportShapeTabular.ts/reportShapeHierarchy.ts's LEAF_HIERARCHY_CODE_
    // PATTERN) — reused here for the row_table path's classifier, which a
    // report with no detected section-label column (so countIdentityTexts'
    // sibling checks above never fire) otherwise has no way to tell a zero-
    // fact leaf record apart from a zero-fact section header.
    const LEAF_HIERARCHY_CODE_PATTERN = /^\d+\.\d{2,}$/;
    const hasLeafHierarchyCode = (): boolean => Object.entries(params.record).some(([column, value]) => (
        STRUCTURAL_IDENTIFIER_COLUMN_PATTERN.test(column)
        && LEAF_HIERARCHY_CODE_PATTERN.test(normalizeReportCellText(value))
    ));

    if (
        descriptorValues.length > 0
        && !hasNonZeroFact
        && carryForwardValues.length === 0
        && !hasAnyFactValue
    ) {
        // GAP-3 fix (text-only reports, e.g. an export whose monetary columns
        // are all empty): a row with THREE or more identity texts is a full
        // record, not a section label — see Special_Price golden. The higher
        // bar (3 vs 2 for zero-value rows) protects genuine two-cell labels.
        if (countIdentityTexts() >= 3) return 'detail';
        return 'group_header';
    }
    if (!hasNonZeroFact && hasAnyFactValue && factValues.every(value => value === null || value === 0)) {
        // Two or more original non-fact text cells => a legitimate zero-value
        // detail record; a single descriptor => a section label (preserved as
        // SectionLabel); otherwise noise.
        if (countIdentityTexts() >= 2) return 'detail';
        return descriptorValues.length > 0 ? 'group_header' : 'note';
    }
    if (hasNonZeroFact || carryForwardValues.length > 0) {
        return 'detail';
    }
    if (nonEmptyValues.length === 1 && descriptorValues.length <= 1) {
        return 'group_header';
    }
    // A zero-fact row with no detected section-label column (descriptorValues
    // stays empty for the whole file in that case, so none of the branches
    // above ever fire) would otherwise fall through to 'note' regardless of
    // whether it's a real leaf record or a section header. Only promote it
    // to 'detail' when its own code identifies it as a leaf item — leave
    // everything else (including genuine section headers) as 'note', same
    // as before this carve-out. Summary text takes priority over the code
    // match: a short/sparse trailing "Total"-style row can position-shift a
    // monetary value into an unrelated "*Code*"-named column (e.g. a wide
    // header's "Party Code" slot holding a grand-total figure that happens
    // to look like "N.NN"), which must never be read as a leaf item code.
    if (hasLeafHierarchyCode() && !SUMMARY_TOKEN_PATTERN.test(summaryScanText)) {
        return 'detail';
    }
    return 'note';
};

const shouldAcceptOverrideRole = (overrideRole: ReportRowRole, deterministicRole: ReportRowRole) => {
    if (overrideRole === deterministicRole) {
        return true;
    }

    if (['blank', 'header', 'summary', 'footer', 'group_header', 'subtotal'].includes(deterministicRole)) {
        return overrideRole === deterministicRole;
    }

    if (deterministicRole === 'note') {
        return overrideRole === 'note' || overrideRole === 'group_header';
    }

    return true;
};

const classifyRowRole = (params: {
    rawRow: string[];
    rawRowIndex: number;
    headers: string[];
    record: CsvRow;
    structure: ReportStructureResolution;
    factColumns: string[];
    carryForwardColumns: string[];
    sectionLabelColumns: string[];
    primaryIdentityColumns: string[];
    rawRoleOverrides: Map<number, ReportRowRoleAssignment>;
    signalBundle?: RowRoleSignalBundle | null;
}): ReportRowRole => {
    const deterministicRole = classifyDeterministicRowRole(params);
    const override = params.rawRoleOverrides.get(params.rawRowIndex);
    if (!override) {
        return deterministicRole;
    }
    return shouldAcceptOverrideRole(override.role, deterministicRole)
        ? override.role
        : deterministicRole;
};

const compareFooterTotals = (params: {
    headers: string[];
    factColumns: string[];
    footerRow: string[] | null;
    canonicalRows: CsvRow[];
}): CanonicalVerificationResult => {
    const comparedFooterTotals: CanonicalVerificationResult['comparedFooterTotals'] = {};
    if (!params.footerRow) {
        return {
            passed: true,
            footerTotalsMatched: null,
            unresolvedMissingKeyDimensions: [],
            warnings: [],
            comparedFooterTotals,
        };
    }

    // Data-driven footer comparison: compare ALL fact columns, but only count
    // columns where footer ≈ sum as "total columns". Non-matching columns are
    // simply not aggregate totals (e.g., per-row quantities, unit prices).
    params.factColumns
        .forEach(column => {
        const columnIndex = params.headers.indexOf(column);
        if (columnIndex < 0) {
            return;
        }
        const footerValue = parseNumericCandidate(params.footerRow[columnIndex]);
        if (footerValue === null) {
            return;
        }
        const canonicalValue = params.canonicalRows.reduce((sum, row) => {
            const value = typeof row[column] === 'number' ? row[column] : parseNumericCandidate(row[column]);
            return sum + (value ?? 0);
        }, 0);
        comparedFooterTotals[column] = {
            canonical: canonicalValue,
            footer: footerValue,
            matched: Math.abs(canonicalValue - footerValue) <= 0.01,
        };
    });

    const compared = Object.values(comparedFooterTotals);
    const matchedCount = compared.filter(result => result.matched).length;
    return {
        passed: matchedCount > 0 || compared.length === 0,
        footerTotalsMatched: matchedCount > 0 ? true : (compared.length > 0 ? false : null),
        unresolvedMissingKeyDimensions: [],
        warnings: compared.some(result => !result.matched) ? ['footer_total_mismatch'] : [],
        comparedFooterTotals,
    };
};

const findTrailingFooterRow = (
    rows: string[][],
    bodyStartIndex: number,
    signalMap?: Map<number, RowRoleSignalBundle> | null,
): string[] | null => {
    // Structural signal first: find the last row with a sum-verification match.
    if (signalMap) {
        for (let index = rows.length - 1; index >= bodyStartIndex; index -= 1) {
            const signals = signalMap.get(index);
            if (signals?.sumVerification.isSumMatch) {
                return rows[index];
            }
        }
    }
    // Regex fallback: scan backwards for summary token match.
    for (let index = rows.length - 1; index >= bodyStartIndex; index -= 1) {
        const row = rows[index];
        if (SUMMARY_TOKEN_PATTERN.test(row.map(normalizeReportCellText).join(' | '))) {
            return row;
        }
    }
    return null;
};

const buildPreparedRowTableFallback = (
    data: CsvData,
    structure: ReportStructureResolution,
): CanonicalDatasetArtifact => {
    const rowRoleByIndex = new Map(
        (structure.rowInspection?.rows ?? []).map(row => [row.rowIndex, row.rowRole]),
    );
    let activeSectionLabel: string | null = null;
    const rows = data.data.flatMap((row, rowIndex) => {
        const inspectionRole = rowRoleByIndex.get(rowIndex);
        const nonEmptyValues = Object.values(row).filter(value => String(value ?? '').trim().length > 0);
        if (inspectionRole === 'group_header' && nonEmptyValues.length > 0) {
            activeSectionLabel = String(nonEmptyValues[0]);
            return [];
        }
        if (inspectionRole !== 'detail') {
            return [];
        }
        return [{
            ...row,
            SourceRowIndex: rowIndex,
            RowRole: 'detail',
            ResolvedRowRole: 'detail',
            SectionLabel: activeSectionLabel,
            HeaderPath: null,
            CarryForwardAppliedColumns: '',
        }];
    });

    const sectionDimensionRecovery = recoverMisalignedSectionDimensions(rows);
    const canonicalRows = dropLowValueUnnamedColumns(sectionDimensionRecovery.rows);
    const canonicalCsvData: CsvData = {
        ...cloneCsvData(data),
        data: canonicalRows,
        metadataRows: [],
        summaryRows: [],
        headerLayers: [],
        headerDepth: 1,
        summaryRowCount: 0,
    };

    return {
        canonicalCsvData,
        canonicalSchema: Object.keys(canonicalRows[0] ?? {}),
        canonicalBuildMeta: {
            shape: 'row_table',
            source: structure.source,
            rowCount: canonicalRows.length,
            columnCount: Object.keys(canonicalRows[0] ?? {}).length,
            lineageColumns: ['SourceRowIndex', 'ResolvedRowRole', 'SectionLabel', 'HeaderPath', 'CarryForwardAppliedColumns'],
            summary: `Retained ${canonicalRows.length} detail row(s) from the prepared dataset.`,
            excludedRowCounts: {},
            carryForwardAppliedCounts: sectionDimensionRecovery.recoveredCounts,
            footerTotalsMatched: null,
        },
    };
};

const buildRowTableFromRawBoundary = (params: {
    csvData: CsvData;
    rawIntakeIr: ReportIntakeIr;
    structure: ReportStructureResolution;
}): {
    artifact: CanonicalDatasetArtifact;
    verificationSummary: CanonicalVerificationResult;
    resolvedRawRowRoles: ReportRowRoleAssignment[];
} | null => {
    const { csvData, rawIntakeIr, structure } = params;
    if (structure.bodyStartIndex === null) {
        return null;
    }

    const headers = structure.normalizationPlan.mergedHeaders.length > 0
        ? structure.normalizationPlan.mergedHeaders
        : buildMergedBoundaryHeaders(rawIntakeIr.normalizedRows, structure);
    if (headers.length === 0) {
        return null;
    }

    const carryForwardColumns = structure.normalizationPlan.carryForwardColumns.map(policy => policy.columnName);
    const sectionLabelColumns = structure.normalizationPlan.sectionLabelColumns;
    // Data-driven fact column detection: uses actual body data numeric density
    // via consolidated inferFactColumns — no domain-specific regex patterns.
    const factColumns = inferFactColumns(
        headers, [...carryForwardColumns, ...sectionLabelColumns],
        rawIntakeIr.normalizedRows,
        structure.bodyStartIndex,
        structure.summaryStartIndex ?? undefined,
    );
    const primaryIdentityColumns = inferDenseSequentialIdentityColumns({
        headers,
        rows: rawIntakeIr.normalizedRows,
        bodyStartIndex: structure.bodyStartIndex,
        summaryStartIndex: structure.summaryStartIndex ?? rawIntakeIr.normalizedRows.length,
    });
    const rowIdentityColumns = headers.filter(column => !factColumns.includes(column));
    const rawRoleOverrides = new Map(
        structure.resolvedRawRowRoles
            .filter(role => role.dataset === 'raw' && (role.source === 'ai' || role.source === 'human'))
            .map(role => [role.rowIndex, role]),
    );

    const bodyStart = structure.bodyStartIndex;
    const summaryStart = structure.summaryStartIndex ?? rawIntakeIr.normalizedRows.length;
    const excludedRowCounts: Partial<Record<ReportRowRole, number>> = {};
    const carryForwardAppliedCounts: Record<string, number> = {};
    const lastCarryForwardValues = new Map<string, string>();
    const resolvedRawRowRoles: ReportRowRoleAssignment[] = [];
    const canonicalRows: CsvRow[] = [];
    let activeSectionLabel: string | null = null;
    let summaryContinuationActive = false;

    // Precompute structural row role signals (sum-verification, sparsity, position)
    // in a single forward pass before the main row loop.
    const signalMap = factColumns.length >= 2
        ? computeRowRoleSignals({
            rows: rawIntakeIr.normalizedRows.slice(bodyStart).map(row => buildRecordFromRawRow(headers, row)),
            factColumns,
            descriptorColumns: sectionLabelColumns,
            identityColumns: rowIdentityColumns,
            bodyStartIndex: bodyStart,
            summaryStartIndex: structure.summaryStartIndex,
            totalRowCount: rawIntakeIr.normalizedRows.length,
        })
        : null;

    for (let rawRowIndex = bodyStart; rawRowIndex < rawIntakeIr.normalizedRows.length; rawRowIndex += 1) {
        const rawRow = rawIntakeIr.normalizedRows[rawRowIndex] ?? [];
        const record = buildRecordFromRawRow(headers, rawRow);
        let rowRole = classifyRowRole({
            rawRow,
            rawRowIndex,
            headers,
            record,
            structure,
            factColumns,
            carryForwardColumns,
            sectionLabelColumns,
            primaryIdentityColumns,
            rawRoleOverrides,
            signalBundle: signalMap?.get(rawRowIndex) ?? null,
        });

        const hasRawFactValue = factColumns.some(column => {
            const value = parseNumericCandidate(record[column]);
            return value !== null && Math.abs(value) > 0;
        });
        const hasRawRecordIdentity = [...carryForwardColumns, ...sectionLabelColumns]
            .some(column => Boolean(normalizeReportCellText(record[column])));

        // Printed reports can place one aggregate per currency on successive
        // physical rows. Only the first line carries the subtotal label; the
        // following lines contain facts but no record identity. Keep the
        // continuation state across blank separators and exclude those lines
        // until a new group or an identity-bearing detail row begins.
        if (
            summaryContinuationActive
            && rowRole === 'detail'
            && hasRawFactValue
            && !hasRawRecordIdentity
        ) {
            rowRole = 'summary';
        }

        const isLeadingAggregateSummary = rawRowIndex === bodyStart && rowRole === 'summary';
        if ((rowRole === 'summary' && !isLeadingAggregateSummary) || rowRole === 'subtotal' || rowRole === 'footer') {
            summaryContinuationActive = true;
        } else if (isLeadingAggregateSummary) {
            summaryContinuationActive = false;
        } else if (rowRole === 'group_header') {
            summaryContinuationActive = false;
        } else if (rowRole === 'detail' && hasRawRecordIdentity) {
            summaryContinuationActive = false;
        }

        resolvedRawRowRoles.push({
            rowIndex: rawRowIndex,
            dataset: 'raw',
            role: rowRole,
            confidence: rawRoleOverrides.get(rawRowIndex)?.confidence ?? (rowRole === 'detail' ? 0.84 : 0.9),
            source: rawRoleOverrides.get(rawRowIndex)?.source ?? 'deterministic',
            notes: rawRoleOverrides.get(rawRowIndex)?.notes,
        });

        if (rowRole === 'summary' || rowRole === 'footer') {
            excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
            continue;
        }
        if (rowRole === 'blank' || rowRole === 'header' || rowRole === 'note' || rowRole === 'subtotal') {
            excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
            continue;
        }
        if (rowRole === 'group_header') {
            excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
            const nextSectionLabel = sectionLabelColumns
                .map(column => normalizeReportCellText(record[column]))
                .find(Boolean)
                ?? Object.values(record).map(normalizeReportCellText).find(Boolean)
                ?? null;
            activeSectionLabel = nextSectionLabel;
            continue;
        }
        if (!structure.normalizationPlan.detailInclusionRoles.includes(rowRole)) {
            excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
            continue;
        }

        const appliedCarryForwardColumns: string[] = [];
        const canonicalRow: CsvRow = {};
        headers.forEach(header => {
            const rawValue = normalizeReportCellText(record[header]);
            if (carryForwardColumns.includes(header)) {
                if (rawValue) {
                    lastCarryForwardValues.set(header, rawValue);
                    canonicalRow[header] = rawValue;
                } else {
                    const carried = lastCarryForwardValues.get(header) ?? '';
                    canonicalRow[header] = carried;
                    if (carried) {
                        carryForwardAppliedCounts[header] = (carryForwardAppliedCounts[header] ?? 0) + 1;
                        appliedCarryForwardColumns.push(header);
                    }
                }
                return;
            }

            if (factColumns.includes(header)) {
                const raw = String(rawValue ?? '');
                // Guard: never coerce values containing letters — they are identifiers, not numbers
                if (/[A-Za-z]/.test(raw)) {
                    canonicalRow[header] = rawValue;
                } else {
                    const numeric = parseNumericCandidate(rawValue);
                    canonicalRow[header] = numeric ?? rawValue;
                }
                return;
            }

            canonicalRow[header] = rawValue;
        });

        canonicalRows.push({
            ...canonicalRow,
            SourceRowIndex: rawRowIndex,
            RowRole: rowRole,
            ResolvedRowRole: rowRole,
            SectionLabel: activeSectionLabel,
            HeaderPath: null,
            CarryForwardAppliedColumns: appliedCarryForwardColumns.join(', '),
        });
    }

    // ── Evidence-based row classification relaxation harness ──
    // Investigate: if the classification dropped most body rows as note/group_header,
    // the dataset likely has all-zero metrics (e.g. stock with no movement).
    // Directive: re-run the body loop, promoting zero-value rows with descriptors to 'detail'.
    const totalBodyRows = summaryStart - bodyStart;
    const droppedNoteCount = (excludedRowCounts['note'] ?? 0) + (excludedRowCounts['group_header'] ?? 0);
    const detailRetentionRatio = totalBodyRows > 0 ? canonicalRows.length / totalBodyRows : 1;
    if (detailRetentionRatio < 0.3 && droppedNoteCount > totalBodyRows * 0.5) {
        console.log(
            `[Canonicalize] Row relaxation harness: ${canonicalRows.length}/${totalBodyRows} detail rows retained `
            + `(${droppedNoteCount} dropped as note/group_header). Re-promoting zero-value rows with descriptors.`,
        );
        canonicalRows.length = 0;
        excludedRowCounts['note'] = 0;
        excludedRowCounts['group_header'] = 0;
        const relaxedRoles: ReportRowRoleAssignment[] = [];
        let relaxedSectionLabel: string | null = null;
        const relaxedCarryForwardValues = new Map<string, string>();
        const relaxedCarryForwardCounts: Record<string, number> = {};

        for (let rawRowIndex = bodyStart; rawRowIndex < rawIntakeIr.normalizedRows.length; rawRowIndex += 1) {
            const rawRow = rawIntakeIr.normalizedRows[rawRowIndex] ?? [];
            const record = buildRecordFromRawRow(headers, rawRow);
            let rowRole = classifyRowRole({
                rawRow, rawRowIndex, headers, record, structure,
                factColumns, carryForwardColumns, sectionLabelColumns,
                primaryIdentityColumns,
                rawRoleOverrides,
                signalBundle: signalMap?.get(rawRowIndex) ?? null,
            });

            // Relaxation: promote zero-value 'note'/'group_header' rows that have
            // descriptors to 'detail' — these are legitimate data rows.
            // Check any non-fact column for text (not just sectionLabelColumns,
            // which may be empty for wide tables like monthly stock reports).
            if ((rowRole === 'note' || rowRole === 'group_header') && rawRowIndex < summaryStart) {
                const factSet = new Set(factColumns);
                const nonFactTextValues = headers
                    .filter(h => !factSet.has(h))
                    .map(h => normalizeReportCellText(record[h]))
                    .filter(Boolean);
                const facts = factColumns.map(col => parseNumericCandidate(record[col]));
                const hasFacts = facts.some(v => v !== null);
                const hasPrimaryIdentity = primaryIdentityColumns.length === 0
                    || primaryIdentityColumns.some(column => normalizeReportCellText(record[column]));
                if (nonFactTextValues.length > 0 && hasFacts && hasPrimaryIdentity) {
                    rowRole = 'detail';
                }
            }

            relaxedRoles.push({
                rowIndex: rawRowIndex, dataset: 'raw', role: rowRole,
                confidence: rawRoleOverrides.get(rawRowIndex)?.confidence ?? 0.72,
                source: 'deterministic',
                notes: ['Promoted from note/group_header by zero-value relaxation harness'],
            });

            if (rowRole === 'summary' || rowRole === 'footer') {
                excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
                if (rawRowIndex >= summaryStart) continue;
            }
            if (rowRole === 'blank' || rowRole === 'header' || rowRole === 'subtotal') {
                excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
                continue;
            }
            if (rowRole === 'note') {
                excludedRowCounts['note'] = (excludedRowCounts['note'] ?? 0) + 1;
                continue;
            }
            if (rowRole === 'group_header') {
                excludedRowCounts['group_header'] = (excludedRowCounts['group_header'] ?? 0) + 1;
                relaxedSectionLabel = sectionLabelColumns
                    .map(col => normalizeReportCellText(record[col]))
                    .find(Boolean)
                    ?? Object.values(record).map(normalizeReportCellText).find(Boolean)
                    ?? null;
                continue;
            }
            if (!structure.normalizationPlan.detailInclusionRoles.includes(rowRole)) {
                excludedRowCounts[rowRole] = (excludedRowCounts[rowRole] ?? 0) + 1;
                continue;
            }

            const appliedCols: string[] = [];
            const canonicalRow: CsvRow = {};
            headers.forEach(header => {
                const rawValue = normalizeReportCellText(record[header]);
                if (carryForwardColumns.includes(header)) {
                    if (rawValue) { relaxedCarryForwardValues.set(header, rawValue); canonicalRow[header] = rawValue; }
                    else {
                        const carried = relaxedCarryForwardValues.get(header) ?? '';
                        canonicalRow[header] = carried;
                        if (carried) { relaxedCarryForwardCounts[header] = (relaxedCarryForwardCounts[header] ?? 0) + 1; appliedCols.push(header); }
                    }
                    return;
                }
                if (factColumns.includes(header)) {
                    const raw = String(rawValue ?? '');
                    if (/[A-Za-z]/.test(raw)) { canonicalRow[header] = rawValue; }
                    else { const numeric = parseNumericCandidate(rawValue); canonicalRow[header] = numeric ?? rawValue; }
                    return;
                }
                canonicalRow[header] = rawValue;
            });
            canonicalRows.push({
                ...canonicalRow, SourceRowIndex: rawRowIndex, RowRole: rowRole,
                ResolvedRowRole: rowRole, SectionLabel: relaxedSectionLabel,
                HeaderPath: null, CarryForwardAppliedColumns: appliedCols.join(', '),
            });
        }
        // Merge relaxed carry-forward counts
        for (const [key, count] of Object.entries(relaxedCarryForwardCounts)) {
            carryForwardAppliedCounts[key] = count;
        }
        // Replace role assignments with relaxed versions
        resolvedRawRowRoles.length = 0;
        resolvedRawRowRoles.push(...relaxedRoles);
        console.log(`[Canonicalize] Relaxation harness result: ${canonicalRows.length}/${totalBodyRows} detail rows retained after promotion.`);
    }

    const canonicalRowsWithPreparedValues = overlayPreparedSharedValues(canonicalRows, csvData.data);
    const sectionDimensionRecovery = recoverMisalignedSectionDimensions(canonicalRowsWithPreparedValues);
    for (const [column, count] of Object.entries(sectionDimensionRecovery.recoveredCounts)) {
        carryForwardAppliedCounts[column] = (carryForwardAppliedCounts[column] ?? 0) + count;
    }
    const compactRows = dropLowValueUnnamedColumns(sectionDimensionRecovery.rows);
    const footerRow = findTrailingFooterRow(rawIntakeIr.normalizedRows, bodyStart, signalMap);
    const footerVerification = compareFooterTotals({
        headers,
        factColumns,
        footerRow,
        canonicalRows: compactRows,
    });
    footerVerification.unresolvedMissingKeyDimensions = carryForwardColumns.filter(column =>
        compactRows.some(row => !normalizeReportCellText(row[column])),
    );
    footerVerification.passed = footerVerification.passed && footerVerification.unresolvedMissingKeyDimensions.length === 0;
    if (footerVerification.unresolvedMissingKeyDimensions.length > 0) {
        footerVerification.warnings.push('carry_forward_missing_dimensions');
    }

    const canonicalCsvData: CsvData = {
        ...cloneCsvData(csvData),
        data: compactRows,
        metadataRows: [],
        summaryRows: [],
        headerLayers: [],
        headerDepth: 1,
        summaryRowCount: 0,
    };

    return {
        artifact: {
            canonicalCsvData,
            canonicalSchema: Object.keys(compactRows[0] ?? {}),
            canonicalBuildMeta: {
                shape: 'row_table',
                source: structure.source,
                rowCount: compactRows.length,
                columnCount: Object.keys(compactRows[0] ?? {}).length,
                lineageColumns: ['SourceRowIndex', 'ResolvedRowRole', 'SectionLabel', 'HeaderPath', 'CarryForwardAppliedColumns'],
                summary: `Retained ${compactRows.length} canonical detail row(s) from raw report rows.`,
                excludedRowCounts,
                carryForwardAppliedCounts,
                footerTotalsMatched: footerVerification.footerTotalsMatched,
            },
        },
        verificationSummary: footerVerification,
        resolvedRawRowRoles,
    };
};

const buildReshapedTable = (
    sourceData: CsvData,
    structure: ReportStructureResolution,
    runtimeTableAssessment: ReportStructureResolution['runtimeTableAssessment'],
): CanonicalDatasetArtifact | null => {
    const action = buildDeterministicCleaningFallbackAction(
        sourceData,
        null,
        runtimeTableAssessment?.status === 'confirmed' ? runtimeTableAssessment : null,
    );
    let fallbackOperations = action?.args?.operations ?? [];
    // This call intentionally passes no IR (see above), so an IR-starved
    // "confirmed reshape required" assessment can only ever come back from
    // here as a cleanup-only recipe (no unpivot_columns step) — ordinarily
    // wrong to accept, since it would silently keep a report that needs
    // melting as a wide table. The one case where staying wide IS correct
    // is a header-relabel row (see hasHeaderRelabelRow): melting past it
    // would mislabel later sections' data under the first section's column
    // names. Outside that case, discard the recipe so control falls through
    // to the shape-hypothesis unpivot below, which builds its own detection
    // from sourceData and doesn't depend on IR.
    if (
        runtimeTableAssessment?.requiresReshape
        && !fallbackOperations.some(op => op.type === 'unpivot_columns')
        && !hasHeaderRelabelRow(sourceData)
    ) {
        fallbackOperations = [];
    }

    let operations = fallbackOperations;
    if (operations.length === 0) {
        const shapeProfile = detectReportShape(sourceData);
        const hypothesis = getPrimaryReshapeHypothesis(shapeProfile, sourceData);
        const columns = Object.keys(sourceData.data[0] ?? {});
        const columnSet = new Set(columns);
        const rawSourceColumns = (hypothesis?.detailSeriesColumns ?? []).filter(column => !isSummaryLike(column));
        const sourceColumns = rawSourceColumns.filter(column => columnSet.has(column));
        if (rawSourceColumns.length > 0 && sourceColumns.length === 0) {
            console.warn(
                '[canonicalize] All hypothesis detailSeriesColumns were absent from CSV schema — skipping unpivot.',
                rawSourceColumns.slice(0, 5),
            );
        }
        if (!hypothesis || sourceColumns.length === 0) {
            return null;
        }
        const labelColumns = hypothesis.seriesLabelColumns.map(labelColumn => {
            const headerLayer = sourceData.headerLayers?.[labelColumn.layerIndex - 1] ?? [];
            return {
                outputColumn: labelColumn.outputColumn,
                mappings: sourceColumns.map(sourceColumn => {
                    const columnIndex = columns.indexOf(sourceColumn);
                    return {
                        sourceColumn,
                        label: columnIndex >= 0 ? String(headerLayer[columnIndex] ?? '').trim() || sourceColumn : sourceColumn,
                    };
                }),
            };
        });
        // Carry the row-role classification already computed for the
        // hypothesis (shapeProfile.rowRoles) through the unpivot so a
        // non-detail source row (total, subtotal, group_header, comment,
        // noise) is excluded from every exploded long-format row instead of
        // silently defaulting to 'detail' — the unpivot executor already
        // supports rowClassColumn/rowClassMappings, it was just never wired
        // up here. This branch always performs an unpivot regardless of the
        // hypothesis's own isStructuredTabular gate (a separate, narrower
        // "does the file need HierarchyDepth tracking" judgment used
        // elsewhere), so the emit decision is made directly from the row
        // roles actually produced for THIS unpivot rather than reusing that
        // gate — checking hypothesis.emittedColumns here silently missed
        // files whose hypothesis classified as structured-tabular even
        // though this code path melts them regardless.
        const emitsRowClass = shapeProfile.rowRoles.some(candidate => candidate.role !== 'fact');
        const rowClassMappings = emitsRowClass
            ? shapeProfile.rowRoles.map(candidate => ({ sourceRowIndex: candidate.rowIndex, rowClass: candidate.role }))
            : [];
        operations = [{
            id: 'canonicalize-unpivot',
            type: 'unpivot_columns',
            reason: 'Canonicalize the detected wide report into a stable long table.',
            sourceColumns,
            keyColumn: 'SeriesKey',
            valueColumn: 'Value',
            keepColumns: hypothesis.descriptorColumns.filter(column => columnSet.has(column)),
            ...(labelColumns.length > 0 ? { labelColumns } : {}),
            sourceColumnNameColumn: 'SourceColumnName',
            sourceRowIndexColumn: 'SourceRowIndex',
            ...(emitsRowClass ? { rowClassColumn: 'RowClass', rowClassMappings } : {}),
        }];
    }

    const result = applyDataOperations(sourceData.data, operations, { allowEmptyResult: false });
    const excludedRowCounts: CanonicalDatasetArtifact['canonicalBuildMeta']['excludedRowCounts'] = {};
    let canonicalRows = result.data.flatMap(row => {
        const rowRole = row.RowClass ?? row.RowRole ?? 'detail';
        const normalizedRole = normalizeCanonicalRowRole(rowRole);
        const recoverBusinessIdentity = normalizedRole === 'subtotal'
            && isEmbeddedTotalBusinessIdentityRow(row);
        if (!isDetailLikeCanonicalRowRole(rowRole) && !recoverBusinessIdentity) {
            if (normalizedRole === 'group_header' || normalizedRole === 'subtotal' || normalizedRole === 'summary' || normalizedRole === 'footer' || normalizedRole === 'header' || normalizedRole === 'note' || normalizedRole === 'blank' || normalizedRole === 'unknown') {
                excludedRowCounts[normalizedRole] = (excludedRowCounts[normalizedRole] ?? 0) + 1;
            }
            return [];
        }

        return [{
            ...row,
            RowRole: recoverBusinessIdentity ? 'fact' : rowRole,
            ResolvedRowRole: recoverBusinessIdentity ? 'fact' : rowRole,
            HeaderPath: buildHeaderPath(typeof row.SourceColumnName === 'string' ? row.SourceColumnName : null),
            CarryForwardAppliedColumns: '',
        }];
    });

    // ── Evidence-based relaxation for reshaped tables ──
    // When the filter dropped most rows (e.g. all-zero dataset classified as note),
    // re-include rows that have RowClass but valid source structure.
    // Uses a ratio threshold (<10% retained) instead of hard zero — prevents
    // edge cases where 2 rows survive the filter, blocking the recovery path
    // while leaving an unusable dataset (TASK-010).
    const totalReshaped = result.data.length;
    const droppedReshapeCount = (excludedRowCounts['note'] ?? 0) + (excludedRowCounts['group_header'] ?? 0);
    const reshapeRetentionRatio = totalReshaped > 0 ? canonicalRows.length / totalReshaped : 1;
    if (reshapeRetentionRatio < 0.1 && droppedReshapeCount > 0 && totalReshaped > 0) {
        console.log(
            `[Canonicalize] Reshape relaxation: ${canonicalRows.length}/${totalReshaped} rows retained (${(reshapeRetentionRatio * 100).toFixed(1)}%), ${droppedReshapeCount} dropped as note/group_header. Re-including rows with source metadata.`,
        );
        excludedRowCounts['note'] = 0;
        excludedRowCounts['group_header'] = 0;
        canonicalRows = result.data.flatMap(row => {
            const rowRole = row.RowClass ?? row.RowRole ?? 'detail';
            const normalizedRole = normalizeCanonicalRowRole(rowRole);
            // Only skip truly structural rows (blank, header, footer, summary)
            if (normalizedRole === 'blank' || normalizedRole === 'header' || normalizedRole === 'footer' || normalizedRole === 'summary') {
                excludedRowCounts[normalizedRole] = (excludedRowCounts[normalizedRole] ?? 0) + 1;
                return [];
            }
            return [{
                ...row,
                RowRole: 'detail',
                ResolvedRowRole: 'detail',
                HeaderPath: buildHeaderPath(typeof row.SourceColumnName === 'string' ? row.SourceColumnName : null),
                CarryForwardAppliedColumns: '',
            }];
        });
        console.log(`[Canonicalize] Reshape relaxation result: ${canonicalRows.length}/${totalReshaped} rows retained.`);
    }
    const canonicalCsvData: CsvData = {
        ...cloneCsvData(sourceData),
        data: canonicalRows,
        metadataRows: [],
        summaryRows: [],
        headerLayers: [],
        headerDepth: 1,
        summaryRowCount: 0,
    };

    return {
        canonicalCsvData,
        canonicalSchema: Object.keys(canonicalRows[0] ?? {}),
        canonicalBuildMeta: {
            shape: structure.decision.targetShape,
            source: structure.source,
            rowCount: canonicalRows.length,
            columnCount: Object.keys(canonicalRows[0] ?? {}).length,
            lineageColumns: ['SourceRowIndex', 'SourceColumnName', 'ResolvedRowRole', 'HeaderPath', 'CarryForwardAppliedColumns'],
            summary: `Canonicalized ${canonicalRows.length} row(s) into ${structure.decision.targetShape}.`,
            excludedRowCounts,
            carryForwardAppliedCounts: {},
            footerTotalsMatched: null,
        },
    };
};

export const canonicalizeReportTable = (params: {
    csvData: CsvData | null | undefined;
    rawCsvData?: CsvData | null | undefined;
    rawIntakeIr?: ReportIntakeIr | null | undefined;
    reportStructureResolution: ReportStructureResolution | null | undefined;
}): {
    status: CanonicalizationStatus;
    artifact: CanonicalDatasetArtifact | null;
    verificationSummary?: CanonicalVerificationResult | null;
    resolvedRawRowRoles?: ReportRowRoleAssignment[];
    error?: string;
} => {
    const { csvData, rawCsvData, rawIntakeIr, reportStructureResolution } = params;
    if (!csvData || !reportStructureResolution) {
        return { status: 'failed', artifact: null, error: 'No dataset or resolved report structure was available.' };
    }

    if (reportStructureResolution.requiresHumanReview) {
        return {
            status: 'needs_review',
            artifact: null,
            error: reportStructureResolution.decision.reason,
            verificationSummary: reportStructureResolution.verificationSummary ?? null,
        };
    }

    if (reportStructureResolution.decision.targetShape === 'row_table' && rawIntakeIr) {
        const rowTable = buildRowTableFromRawBoundary({
            csvData,
            rawIntakeIr,
            structure: reportStructureResolution,
        });
        if (!rowTable) {
            return {
                status: 'failed',
                artifact: null,
                error: 'Canonical row-table generation could not resolve raw boundary rows.',
            };
        }
        return {
            status: 'ready',
            artifact: rowTable.artifact,
            verificationSummary: rowTable.verificationSummary,
            resolvedRawRowRoles: rowTable.resolvedRawRowRoles,
        };
    }

    if (reportStructureResolution.decision.targetShape === 'row_table') {
        return {
            status: 'ready',
            artifact: buildPreparedRowTableFallback(csvData, reportStructureResolution),
            verificationSummary: reportStructureResolution.verificationSummary ?? null,
        };
    }

    const reshaped = buildReshapedTable(
        rawCsvData ?? csvData,
        reportStructureResolution,
        reportStructureResolution.runtimeTableAssessment,
    );
    if (!reshaped) {
        // Graceful degradation (AGENTS.md: no hard zero-tolerance gates): the
        // wide-crosstab reshape recipe (unpivot hypothesis) can fail to
        // match — e.g. a header whose sub-columns are relabeled mid-body per
        // section ("quarter rebound"), which produces duplicate merged
        // column names the hypothesis matcher doesn't expect. Falling back
        // to the flat row-table interpretation, when a raw boundary is
        // available, is strictly safer than a hard failure: it can only
        // improve on returning nothing.
        if (rawIntakeIr && reportStructureResolution.bodyStartIndex !== null) {
            const rowTableFallback = buildRowTableFromRawBoundary({
                csvData,
                rawIntakeIr,
                structure: reportStructureResolution,
            });
            if (rowTableFallback) {
                return {
                    status: 'ready',
                    artifact: rowTableFallback.artifact,
                    verificationSummary: rowTableFallback.verificationSummary,
                    resolvedRawRowRoles: rowTableFallback.resolvedRawRowRoles,
                };
            }
        }
        return {
            status: 'failed',
            artifact: null,
            error: 'Canonical reshaping could not build a deterministic plan.',
        };
    }

    return {
        status: 'ready',
        artifact: reshaped,
        verificationSummary: reportStructureResolution.verificationSummary ?? null,
    };
};
