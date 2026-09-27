import type {
    AiIntakeStructureBoundary,
    CsvData,
    CsvIntakeDetectionResult,
    CsvIntakeWarning,
    CsvRow,
    IntakePreScanSignals,
    IntakeRowClassification,
    IntakeRowSignal,
    ReportIntakeBodyEvidenceKind,
    ReportIntakeIr,
    ReportIntakeSegment,
    ReportIntakeSegmentKind,
} from '../../types';
import {
    CODE_LIKE_PATTERN,
    FOOTER_PATTERN,
    SUMMARY_LABEL_PATTERN,
    SUMMARY_TOKEN_PATTERN,
    isNumericLike,
} from '../agent/reportShapeUtils';
import { buildMergedBoundaryHeaders } from '../agent/reportStructureNormalization';

type RawCsvRow = string[];

type HeaderSelection = {
    headerRowIndex: number;
    headerLayerIndexes: number[];
    headerLayers: RawCsvRow[];
    bodyStartIndex: number;
    confidence: number;
    parameterRowIndexes: number[];
    repeatedHeaderRowIndexes: number[];
    bodyEvidenceKind: ReportIntakeBodyEvidenceKind;
};

const MAX_HEADER_SCAN_ROWS = 16;
const MAX_HEADER_BLOCK_ROWS = 3;
const MAX_BODY_LOOKAHEAD_ROWS = 10;
const DATE_LIKE_PATTERN = /^(?:\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})$/;
const ROW_SEQUENCE_PATTERN = /^\d+(?:\.\d+)*\.?$/;
const DOCUMENT_CODE_PATTERN = /^[A-Z]{1,8}[A-Z0-9-]{2,}$/;
const BOM_PREFIX_PATTERN = /^\uFEFF+/;

const appendDetectionWarning = (
    detection: CsvIntakeDetectionResult | undefined,
    warning: CsvIntakeWarning,
): CsvIntakeDetectionResult | undefined => {
    if (!detection) return undefined;
    const warnings = detection.warnings ?? [];
    if (warnings.some(existing => existing.code === warning.code && existing.message === warning.message)) {
        return detection;
    }
    return {
        ...detection,
        warnings: [...warnings, warning],
    };
};

const sanitizeCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(BOM_PREFIX_PATTERN, '');
    if (str.startsWith('=')) return `'${str}`;
    // Strip leading spreadsheet text-format apostrophe from numeric-looking values
    // (e.g. '-852.81 → -852.81). Only matches quote + optional minus + digit to
    // avoid stripping apostrophes from legitimate text or formula-prefixed values.
    if (/^['\u2018\u2019]-?\d/.test(str)) return str.substring(1);
    // Strip bare zero-value placeholder markers: '-, ' -, '--, etc.
    if (/^['\u2018\u2019]\s*-+\s*$/.test(str)) return '';
    return str;
};

const sanitizeHeaderValue = (rawHeader: string | undefined, index: number, seen: Map<string, number>): string => {
    // Replace non-breaking spaces (U+00A0) with regular spaces — ERP/accounting
    // exports frequently embed NBSP in column headers (e.g. "DOCM AMT BASE\u00A0SGD").
    // These are visually identical but cause DuckDB column-not-found errors.
    const cleanHeader = String(rawHeader ?? '').replace(BOM_PREFIX_PATTERN, '').replace(/\u00A0/g, ' ').trim() || `_unnamed_column_${index + 1}`;
    const lower = cleanHeader.toLowerCase();
    const count = seen.get(lower) ?? 0;
    seen.set(lower, count + 1);
    return count > 0 ? `${cleanHeader}_${count + 1}` : cleanHeader;
};

const normalizeRowLengths = (rows: RawCsvRow[], columnCount: number): RawCsvRow[] =>
    rows.map(row => {
        const nextRow = [...row];
        while (nextRow.length < columnCount) {
            nextRow.push('');
        }
        if (nextRow.length > columnCount) {
            nextRow.length = columnCount;
        }
        return nextRow.map(cell => sanitizeCellValue(cell));
    });

const getNonEmptyCells = (row: RawCsvRow) => row.map(value => String(value ?? '').trim()).filter(Boolean);

const countMatches = (values: string[], predicate: (value: string) => boolean) =>
    values.filter(predicate).length;

const isBlankRow = (row: RawCsvRow) => getNonEmptyCells(row).length === 0;

const isFooterLikeRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    if (values.length === 0) return false;
    // Structural: sparse row with date format → footer.
    // Note: singleton long text is NOT checked here because titles and footers
    // share the same sparse shape — position context is needed to distinguish them,
    // and intake row-level classification lacks position information.
    if (values.length <= 2 && values.some(v => /\d{2}[-/]\d{2}[-/]\d{4}/.test(v))) return true;
    // Domain fallback (demoted — structural signals above take priority).
    return FOOTER_PATTERN.test(values.join(' | '));
};

const isSparseLongTextRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    return values.length > 0 && values.length <= 2 && values.join(' ').length >= 20;
};

const isLikelyReportTitleRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    return values.length > 0 && values.length <= 2 && values.join(' ').length >= 24 && !isFooterLikeRow(row);
};

const isLikelyMetadataPairRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    if (values.length < 4 || values.length > 8 || values.length % 2 !== 0) return false;
    // Metadata label/value blocks start at the left edge (col 0). A row whose
    // first cell is empty but carries 4+ named cells further right is a column
    // header aligned over a wide data grid (e.g. ",CODE,,NAME,,,,DOCM AMT FOREX"
    // or ",END USER NAME,MVC DEAL NUMBER,..."), where all-caps single-word cells
    // would otherwise satisfy the code-like value heuristic and swallow the header.
    if (!String(row[0] ?? '').trim()) return false;
    const pairs = Array.from({ length: values.length / 2 }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
    const labelLikeCount = pairs.filter(([label]) =>
        Boolean(label)
        && !isNumericLike(label)
        && !DATE_LIKE_PATTERN.test(label)
        && !CODE_LIKE_PATTERN.test(label)
        && label.length <= 24,
    ).length;
    const valueLikeCount = pairs.filter(([, value]) =>
        Boolean(value)
        && (
            isNumericLike(value)
            || DATE_LIKE_PATTERN.test(value)
            || CODE_LIKE_PATTERN.test(value)
            || DOCUMENT_CODE_PATTERN.test(value)
            || value.length > 24
        ),
    ).length;
    return labelLikeCount >= Math.max(2, pairs.length - 1)
        && valueLikeCount >= 1;
};

const isLikelyParameterLabelRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    if (values.length === 0 || values.length > 3) return false;
    if (isFooterLikeRow(row) || isLikelyReportTitleRow(row) || isLikelyMetadataPairRow(row)) return false;
    const numericCount = countMatches(values, isNumericLike);
    const codeLikeCount = countMatches(values, value => CODE_LIKE_PATTERN.test(value));
    if (numericCount > 0 || codeLikeCount > 0) return false;
    const joined = values.join(' ');
    // Structural: short phrase (≤4 words) or colon key-value → parameter label.
    return joined.length <= 64
        && values.some(value => value.includes(':') || value.split(/\s+/).length <= 4);
};

const detectBodyEvidenceKind = (row: RawCsvRow): ReportIntakeBodyEvidenceKind => {
    const values = getNonEmptyCells(row);
    if (values.length < 2) return 'unknown';

    const numericCount = countMatches(values, isNumericLike);
    const dateLikeCount = countMatches(values, value => DATE_LIKE_PATTERN.test(value));
    const rowSequenceCount = countMatches(values, value => ROW_SEQUENCE_PATTERN.test(value));
    const documentCodeCount = countMatches(values, value => DOCUMENT_CODE_PATTERN.test(value));
    const summaryLabelCount = countMatches(values, value => SUMMARY_LABEL_PATTERN.test(value));
    const descriptorCount = values.filter(value => (
        /[A-Za-z]/.test(value)
        && !isNumericLike(value)
        && !DATE_LIKE_PATTERN.test(value)
        && !DOCUMENT_CODE_PATTERN.test(value)
    )).length;

    if (numericCount >= 2) return 'numeric';
    if (numericCount >= 1 && summaryLabelCount > 0) return 'summary_numeric';
    if (rowSequenceCount >= 1 && dateLikeCount >= 1) return 'dated_row_sequence';
    if (documentCodeCount >= 1 && dateLikeCount >= 1) return 'code_date_sequence';
    if (rowSequenceCount >= 1 && descriptorCount >= 1) return 'hierarchical_sequence';
    return 'unknown';
};

const isLikelyDataRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    if (values.length < 2) return false;
    const numericCount = countMatches(values, isNumericLike);
    const dateLikeCount = countMatches(values, value => DATE_LIKE_PATTERN.test(value));
    const rowSequenceCount = countMatches(values, value => ROW_SEQUENCE_PATTERN.test(value));
    const documentCodeCount = countMatches(values, value => DOCUMENT_CODE_PATTERN.test(value));
    const summaryLabelCount = countMatches(values, value => SUMMARY_LABEL_PATTERN.test(value));
    const descriptorCount = values.filter(value => (
        /[A-Za-z]/.test(value)
        && !isNumericLike(value)
        && !DATE_LIKE_PATTERN.test(value)
        && !DOCUMENT_CODE_PATTERN.test(value)
    )).length;
    return numericCount >= 2
        || (numericCount >= 1 && summaryLabelCount > 0)
        || (numericCount >= 1 && values.length >= 4 && (dateLikeCount >= 1 || rowSequenceCount >= 1 || documentCodeCount >= 1))
        || (rowSequenceCount >= 1 && (dateLikeCount >= 1 || documentCodeCount >= 1))
        || (rowSequenceCount >= 1 && descriptorCount >= 1);
};

const isLikelyHeaderRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    if (values.length < 3) return false;
    // 3 named cells only qualify in "sparse wide header" shape: all-text labels
    // spread across a physically wider row (e.g. ",,COUNTRY,,NET SALES SGD,PERCENTAGE,").
    // Narrow contiguous 3-cell rows keep the old floor — they are label/parameter shaped.
    if (values.length === 3
        && (row.length < values.length + 2 || countMatches(values, isNumericLike) > 0)) {
        return false;
    }
    if (isFooterLikeRow(row) || isLikelyReportTitleRow(row) || isLikelyMetadataPairRow(row) || isLikelyParameterLabelRow(row)) {
        return false;
    }
    const numericCount = countMatches(values, isNumericLike);
    const textLikeCount = values.length - numericCount;
    // When a row is overwhelmingly text-like (>=70% text, at most 1 numeric),
    // a single numeric value (e.g. year "2010") should not trigger
    // body-evidence exclusion. True data rows have higher numeric density.
    const overwhelminglyText = textLikeCount >= Math.max(4, Math.floor(values.length * 0.7))
        && numericCount <= 1;
    if (!overwhelminglyText) {
        const bodyEvidenceKind = detectBodyEvidenceKind(row);
        if (bodyEvidenceKind === 'dated_row_sequence' || bodyEvidenceKind === 'code_date_sequence' || bodyEvidenceKind === 'hierarchical_sequence') {
            return false;
        }
    }
    const codeLikeCount = countMatches(values, value => CODE_LIKE_PATTERN.test(value));
    const summaryCount = countMatches(values, value => SUMMARY_LABEL_PATTERN.test(value));
    const codeHeavyHeader = codeLikeCount >= Math.max(4, Math.floor(values.length * 0.35));
    if (!codeHeavyHeader && textLikeCount < Math.max(2, Math.floor(values.length * 0.45))) return false;
    if (numericCount > Math.floor(values.length * 0.45) && codeLikeCount < 3) return false;
    return summaryCount < values.length;
};

const isHeaderContinuationRow = (row: RawCsvRow) => {
    const values = getNonEmptyCells(row);
    if (values.length < 3) return false;
    if (isFooterLikeRow(row) || isLikelyMetadataPairRow(row) || isLikelyParameterLabelRow(row)) return false;
    const numericCount = countMatches(values, isNumericLike);
    const textLikeCount = values.length - numericCount;
    return textLikeCount >= Math.max(2, Math.floor(values.length * 0.45));
};

const isCodeSeriesHeaderRow = (row: RawCsvRow, followingRow: RawCsvRow | undefined) => {
    const values = row.map(value => String(value ?? '').trim());
    const detailValues = values.slice(2).filter(Boolean);
    if (detailValues.length < 4) return false;
    const codeLikeCount = detailValues.filter(value => CODE_LIKE_PATTERN.test(value)).length;
    if (codeLikeCount < Math.max(4, Math.floor(detailValues.length * 0.45))) return false;
    const nextValues = followingRow ? followingRow.slice(2).map(value => String(value ?? '').trim()).filter(Boolean) : [];
    const labelLikeCount = nextValues.filter(value => value && !isNumericLike(value) && !CODE_LIKE_PATTERN.test(value)).length;
    return labelLikeCount >= Math.max(3, Math.floor(detailValues.length * 0.25));
};

const areRowsEquivalent = (left: RawCsvRow, right: RawCsvRow) =>
    left.length === right.length
    && left.every((value, index) => String(value ?? '').trim() === String(right[index] ?? '').trim());

const buildHeaders = (headerRow: RawCsvRow): string[] => {
    const seen = new Map<string, number>();
    return headerRow.map((value, index) => sanitizeHeaderValue(value, index, seen));
};

const buildRecordRow = (headers: string[], row: RawCsvRow): CsvRow => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
        record[header] = sanitizeCellValue(row[index]);
    });
    return record;
};

const buildSummaryRow = (row: RawCsvRow): CsvRow => {
    const record: CsvRow = {};
    row.forEach((value, index) => {
        record[`_summary_column_${index + 1}`] = sanitizeCellValue(value);
    });
    return record;
};

const getNumericOnlyColumnIndexes = (row: RawCsvRow): number[] | null => {
    const indexes = row.reduce<number[]>((result, value, index) => {
        if (String(value ?? '').trim()) {
            result.push(index);
        }
        return result;
    }, []);
    if (indexes.length < 4 || indexes.some(index => !isNumericLike(String(row[index] ?? '').trim()))) {
        return null;
    }
    return indexes;
};

const hasEarlierSectionSubtotalPattern = (
    rows: RawCsvRow[],
    candidateIndex: number,
    bodyStartIndex: number,
) => {
    const candidateColumns = getNumericOnlyColumnIndexes(rows[candidateIndex]);
    if (!candidateColumns) return false;
    const candidateKey = candidateColumns.join(',');

    for (let index = candidateIndex - 1; index >= bodyStartIndex; index -= 1) {
        const previousColumns = getNumericOnlyColumnIndexes(rows[index]);
        if (!previousColumns || previousColumns.join(',') !== candidateKey) {
            continue;
        }
        return rows.slice(index + 1, candidateIndex).some(row => {
            const values = getNonEmptyCells(row);
            return Boolean(String(row[0] ?? '').trim())
                && values.length <= 2
                && values.every(value => !isNumericLike(value) && !DATE_LIKE_PATTERN.test(value));
        });
    }
    return false;
};

const findSummaryStartIndex = (rows: RawCsvRow[], bodyStartIndex: number) => {
    let summaryStartIndex = rows.length;
    for (let index = rows.length - 1; index >= bodyStartIndex; index -= 1) {
        const row = rows[index];
        const nonEmptyValues = getNonEmptyCells(row);
        if (nonEmptyValues.length === 0 || isFooterLikeRow(row) || isSparseLongTextRow(row)) {
            summaryStartIndex = index;
            continue;
        }
        // GAP-6: an unlabeled grand-total row — wide, purely numeric, zero
        // identity text (no sequence number, code, name, or date in any
        // cell) — carries no summary token for mid-body regex to match and
        // no anchor text for GAP-5's block absorption. Position is the only
        // available signal: legitimate detail rows in this corpus always
        // carry at least one identity cell, so a fully-numeric row reached
        // only after the trailing blank/footer tail has already been
        // trimmed (i.e. it IS the report's last content) is the total, not
        // a record. `continue` lets a rare double total row (e.g. per-
        // currency then grand) absorb too; genuine detail data never
        // matches this shape so there is no runaway risk.
        if (nonEmptyValues.length >= 4 && countMatches(nonEmptyValues, isNumericLike) === nonEmptyValues.length) {
            // If an earlier numeric-only row uses the same fact positions and
            // a first-column section header appears between them, this is the
            // final section subtotal. Keep it in the body so row-role logic
            // can classify it. A following grand total is still absorbed
            // first because no section header separates adjacent totals.
            if (hasEarlierSectionSubtotalPattern(rows, index, bodyStartIndex)) {
                break;
            }
            summaryStartIndex = index;
            continue;
        }
        break;
    }
    // GAP-5: trailing count/appendix block anchored by a grand-total row.
    // Some reports append per-group count rows AFTER the grand total (e.g.
    // ",,,,,,Total,17,532,496.10" followed by 89 ",,,,,,No. <manager>,<count>"
    // rows). Each count row looks like a sparse detail (one label + one number
    // in a fact column), so per-row classification cannot exclude it; the
    // structural signal is positional — a sparse label+count block whose upper
    // edge is a summary-token row with a numeric value. The absorption is
    // evidence-anchored on purpose: with no candidate rows or no anchor row the
    // boundary is left untouched, so files that merely END with a total row (or
    // with sparse continuation details) keep their existing boundary.
    let candidateCount = 0;
    for (let index = summaryStartIndex - 1; index >= bodyStartIndex; index -= 1) {
        const row = rows[index];
        const values = getNonEmptyCells(row);
        if (values.length === 0) {
            continue;
        }
        const numericCount = countMatches(values, isNumericLike);
        if (values.some(value => SUMMARY_TOKEN_PATTERN.test(value)) && numericCount >= 1) {
            if (candidateCount > 0) {
                summaryStartIndex = index;
            }
            break;
        }
        const textCount = values.length - numericCount;
        if (values.length <= 2 && numericCount <= 1 && textCount >= 1) {
            candidateCount += 1;
            continue;
        }
        break;
    }
    return summaryStartIndex;
};

const hasHeaderShapeDrift = (
    rows: RawCsvRow[],
    headerRowIndex: number,
    bodyStartIndex: number,
) => {
    const headerWidth = rows[headerRowIndex]?.length ?? 0;
    if (headerWidth === 0) return false;

    const bodyRows = rows
        .slice(bodyStartIndex, Math.min(rows.length, bodyStartIndex + 6))
        .filter(row => getNonEmptyCells(row).length > 0);
    if (bodyRows.length === 0) return false;

    const mismatchedRows = bodyRows.filter(row => Math.abs(row.length - headerWidth) >= 2).length;
    return mismatchedRows >= Math.max(1, Math.ceil(bodyRows.length * 0.34));
};

const findBodyStartAfterHeader = (
    rows: RawCsvRow[],
    blockIndexes: number[],
    headerRowIndex: number,
) => {
    const headerRow = rows[headerRowIndex];
    const skippedParameterRows: number[] = [];
    const repeatedHeaderRows: number[] = [];
    for (let index = (blockIndexes[blockIndexes.length - 1] ?? headerRowIndex) + 1; index < rows.length; index += 1) {
        const row = rows[index];
        if (isBlankRow(row)) {
            continue;
        }
        if (areRowsEquivalent(row, headerRow)) {
            repeatedHeaderRows.push(index);
            continue;
        }
        // Check data evidence before metadata/parameter heuristics so that
        // rows with strong numeric signals (e.g. "P01,15,14,1,93.33%,6.67%")
        // are recognised as body start even if they superficially match the
        // metadata-pair shape.
        const bodyEvidenceKind = detectBodyEvidenceKind(row);
        if (bodyEvidenceKind !== 'unknown' || isLikelyDataRow(row)) {
            return {
                bodyStartIndex: index,
                parameterRowIndexes: skippedParameterRows,
                repeatedHeaderRowIndexes: repeatedHeaderRows,
                bodyEvidenceKind,
            };
        }
        // A sparse descriptor in the first physical column immediately
        // followed by a strong data row is a section/group header, not a
        // report parameter. Keeping it inside the body lets downstream row
        // classification carry its label into the following detail rows.
        const nextNonBlankIndex = rows.findIndex((candidate, candidateIndex) =>
            candidateIndex > index && !isBlankRow(candidate),
        );
        const nextRow = nextNonBlankIndex >= 0 ? rows[nextNonBlankIndex] : undefined;
        const values = getNonEmptyCells(row);
        const isLeadingSectionHeader = Boolean(String(row[0] ?? '').trim())
            && values.length <= 2
            && values.every(value => !isNumericLike(value) && !DATE_LIKE_PATTERN.test(value))
            && !values.some(value => value.includes(':'))
            && Boolean(nextRow)
            && (detectBodyEvidenceKind(nextRow!) !== 'unknown' || isLikelyDataRow(nextRow!));
        if (isLeadingSectionHeader) {
            return {
                bodyStartIndex: index,
                parameterRowIndexes: skippedParameterRows,
                repeatedHeaderRowIndexes: repeatedHeaderRows,
                bodyEvidenceKind: 'hierarchical_sequence' as const,
            };
        }
        if (isLikelyMetadataPairRow(row) || isLikelyParameterLabelRow(row) || isSparseLongTextRow(row)) {
            skippedParameterRows.push(index);
            continue;
        }
        if (index - headerRowIndex >= MAX_BODY_LOOKAHEAD_ROWS) {
            break;
        }
    }
    return null;
};

export const buildPreScanSignals = (rows: RawCsvRow[]): IntakePreScanSignals => {
    const scanLimit = Math.min(rows.length, MAX_HEADER_SCAN_ROWS + MAX_BODY_LOOKAHEAD_ROWS);
    const rowSignals: IntakeRowSignal[] = [];
    const headerCandidateIndexes: number[] = [];
    const dataCandidateIndexes: number[] = [];
    const titleRowIndexes: number[] = [];
    const blankRowIndexes: number[] = [];
    const footerRowIndexes: number[] = [];
    const parameterRowIndexes: number[] = [];
    const metadataPairRowIndexes: number[] = [];
    const sparseTextRowIndexes: number[] = [];

    for (let index = 0; index < scanLimit; index += 1) {
        const row = rows[index];
        const values = getNonEmptyCells(row);
        const numericCount = countMatches(values, isNumericLike);
        const numericRatio = values.length > 0 ? numericCount / values.length : 0;
        const bodyEvidenceKind = detectBodyEvidenceKind(row);

        let classification: IntakeRowClassification = 'unknown';
        if (isBlankRow(row)) {
            classification = 'blank';
            blankRowIndexes.push(index);
        } else if (isFooterLikeRow(row)) {
            classification = 'footer';
            footerRowIndexes.push(index);
        } else if (isLikelyReportTitleRow(row)) {
            classification = 'title';
            titleRowIndexes.push(index);
        } else if (isLikelyMetadataPairRow(row)) {
            classification = 'metadata_pair';
            metadataPairRowIndexes.push(index);
        } else if (isLikelyParameterLabelRow(row)) {
            classification = 'parameter';
            parameterRowIndexes.push(index);
        } else if (isSparseLongTextRow(row)) {
            classification = 'sparse_text';
            sparseTextRowIndexes.push(index);
        } else if (isLikelyHeaderRow(row)) {
            classification = 'header_candidate';
            headerCandidateIndexes.push(index);
        } else if (isLikelyDataRow(row)) {
            classification = 'data_candidate';
            dataCandidateIndexes.push(index);
        }

        rowSignals.push({
            rowIndex: index,
            classification,
            nonEmptyCellCount: values.length,
            totalCellCount: row.length,
            numericRatio,
            bodyEvidenceKind,
        });
    }

    // Also scan the last few rows for footer/summary detection
    const tailStart = Math.max(scanLimit, rows.length - 6);
    for (let index = tailStart; index < rows.length; index += 1) {
        const row = rows[index];
        const values = getNonEmptyCells(row);
        const numericCount = countMatches(values, isNumericLike);
        const numericRatio = values.length > 0 ? numericCount / values.length : 0;
        const bodyEvidenceKind = detectBodyEvidenceKind(row);

        let classification: IntakeRowClassification = 'unknown';
        if (isBlankRow(row)) {
            classification = 'blank';
        } else if (isFooterLikeRow(row)) {
            classification = 'footer';
        } else if (isSparseLongTextRow(row)) {
            classification = 'sparse_text';
        }

        rowSignals.push({
            rowIndex: index,
            classification,
            nonEmptyCellCount: values.length,
            totalCellCount: row.length,
            numericRatio,
            bodyEvidenceKind,
        });
    }

    const selection = selectReportHeader(rows);
    return {
        rowSignals,
        headerCandidateIndexes,
        dataCandidateIndexes,
        titleRowIndexes,
        blankRowIndexes,
        footerRowIndexes,
        parameterRowIndexes,
        metadataPairRowIndexes,
        sparseTextRowIndexes,
        deterministicSelection: selection
            ? { rowIndex: selection.headerRowIndex, confidence: selection.confidence, reason: `Header at row ${selection.headerRowIndex}, body at ${selection.bodyStartIndex} (${selection.bodyEvidenceKind})` }
            : null,
        deterministicConfidence: selection?.confidence ?? 0,
    };
};

const selectReportHeader = (rows: RawCsvRow[]): HeaderSelection | null => {
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, MAX_HEADER_SCAN_ROWS); rowIndex += 1) {
        const row = rows[rowIndex];
        if (!isLikelyHeaderRow(row)) continue;

        const blockIndexes = [rowIndex];
        // A header split across a single blank spacer row (band row, blank
        // line, sub-header row — a common export pattern) must not
        // terminate the block scan: skip at most one blank row without
        // consuming it as a header row, then keep evaluating the row after
        // it exactly as before. A genuine data/metadata row right after the
        // blank is still rejected by the existing isHeaderContinuationRow /
        // isLikelyDataRow gates below, so this only helps a real
        // continuation reach across the gap — it never widens what counts
        // as one.
        let blankGapAvailable = true;
        for (let nextIndex = rowIndex + 1; nextIndex < Math.min(rows.length, rowIndex + MAX_HEADER_BLOCK_ROWS); nextIndex += 1) {
            const candidate = rows[nextIndex];
            if (isBlankRow(candidate)) {
                if (!blankGapAvailable) break;
                blankGapAvailable = false;
                continue;
            }
            if (!isHeaderContinuationRow(candidate) || isLikelyDataRow(candidate)) break;
            blockIndexes.push(nextIndex);
        }

        const blockRows = blockIndexes.map(index => rows[index]);
        const useLeadingHeader = blockRows.length > 1 && isCodeSeriesHeaderRow(blockRows[0], blockRows[1]);
        const actualHeaderOffset = useLeadingHeader ? 0 : blockRows.length - 1;
        const originalHeaderIndex = blockIndexes[actualHeaderOffset] ?? rowIndex;
        const bodyStart = findBodyStartAfterHeader(rows, blockIndexes, originalHeaderIndex);
        if (!bodyStart) continue;

        let actualHeaderIndex = originalHeaderIndex;
        let repeatedHeaderRowIndexes = [...bodyStart.repeatedHeaderRowIndexes];
        let headerLayerIndexes = blockIndexes.filter(index => index !== originalHeaderIndex);
        if (repeatedHeaderRowIndexes.length > 0) {
            const preferredHeaderIndex = repeatedHeaderRowIndexes[repeatedHeaderRowIndexes.length - 1]!;
            if (preferredHeaderIndex !== originalHeaderIndex) {
                actualHeaderIndex = preferredHeaderIndex;
                repeatedHeaderRowIndexes = [
                    originalHeaderIndex,
                    ...repeatedHeaderRowIndexes.filter(index => index !== preferredHeaderIndex),
                ].sort((left, right) => left - right);
                headerLayerIndexes = blockIndexes.filter(index => index !== originalHeaderIndex && index !== preferredHeaderIndex);
            }
        }

        const headerLayers = headerLayerIndexes.map(index => [...rows[index]]);
        const confidence = useLeadingHeader
            ? 0.92
            : blockRows.length > 1
                ? 0.86
                : 0.78;
        return {
            headerRowIndex: actualHeaderIndex,
            headerLayerIndexes,
            headerLayers,
            bodyStartIndex: bodyStart.bodyStartIndex,
            confidence,
            parameterRowIndexes: bodyStart.parameterRowIndexes,
            repeatedHeaderRowIndexes,
            bodyEvidenceKind: bodyStart.bodyEvidenceKind,
        };
    }

    return null;
};

const countSegmentsByKind = (segments: ReportIntakeSegment[]) =>
    segments.reduce<Partial<Record<ReportIntakeSegmentKind, number>>>((counts, segment) => {
        counts[segment.kind] = (counts[segment.kind] ?? 0) + 1;
        return counts;
    }, {});

const pushSegment = (
    segments: ReportIntakeSegment[],
    kind: ReportIntakeSegmentKind,
    rowStart: number,
    rowEnd: number,
    confidence: number,
    notes: string[],
) => {
    if (rowStart > rowEnd) return;
    segments.push({
        kind,
        rowStart,
        rowEnd,
        confidence,
        notes,
    });
};

const buildSegments = (
    rows: RawCsvRow[],
    provisionalTable: ReportIntakeIr['provisionalTable'],
) => {
    const rowKinds = new Array<ReportIntakeSegmentKind>(rows.length).fill('unknown');
    const rowNotes = Array.from({ length: rows.length }, () => [] as string[]);
    const rowConfidence = new Array<number>(rows.length).fill(0.6);

    if (!provisionalTable) {
        let seenTitle = false;
        rows.forEach((row, index) => {
            if (isBlankRow(row)) {
                rowKinds[index] = 'blank';
                rowConfidence[index] = 1;
                return;
            }
            if (isLikelyReportTitleRow(row)) {
                rowKinds[index] = seenTitle ? 'subtitle' : 'title';
                rowConfidence[index] = 0.8;
                seenTitle = true;
                return;
            }
            if (isLikelyParameterLabelRow(row)) {
                rowKinds[index] = 'parameter';
                rowConfidence[index] = 0.72;
                return;
            }
            if (isFooterLikeRow(row)) {
                rowKinds[index] = 'footer';
                rowConfidence[index] = 0.72;
                return;
            }
            rowKinds[index] = 'unknown';
        });
    } else {
        const headerLayerSet = new Set(provisionalTable.headerLayerRowIndexes);
        const repeatedHeaderSet = new Set(provisionalTable.repeatedHeaderRowIndexes);
        const parameterSet = new Set(provisionalTable.parameterRowIndexes);
        let seenTitle = false;
        rows.forEach((row, index) => {
            if (isBlankRow(row)) {
                rowKinds[index] = 'blank';
                rowConfidence[index] = 1;
                return;
            }
            if (index === provisionalTable.headerRowIndex || headerLayerSet.has(index)) {
                rowKinds[index] = 'header';
                rowConfidence[index] = 0.95;
                return;
            }
            if (repeatedHeaderSet.has(index)) {
                rowKinds[index] = 'repeated_header';
                rowConfidence[index] = 0.92;
                rowNotes[index].push('matched_selected_header');
                return;
            }
            if (index < provisionalTable.bodyStartIndex) {
                if (parameterSet.has(index) || isLikelyParameterLabelRow(row)) {
                    rowKinds[index] = 'parameter';
                    rowConfidence[index] = 0.84;
                    return;
                }
                if (isLikelyReportTitleRow(row)) {
                    rowKinds[index] = seenTitle ? 'subtitle' : 'title';
                    rowConfidence[index] = 0.82;
                    seenTitle = true;
                    return;
                }
                rowKinds[index] = 'metadata';
                rowConfidence[index] = 0.74;
                return;
            }
            if (index >= provisionalTable.summaryStartIndex) {
                if (isFooterLikeRow(row) || isSparseLongTextRow(row)) {
                    rowKinds[index] = 'footer';
                    rowConfidence[index] = 0.84;
                    return;
                }
                rowKinds[index] = 'summary';
                rowConfidence[index] = 0.76;
                return;
            }
            rowKinds[index] = 'body';
            rowConfidence[index] = 0.9;
        });
    }

    const segments: ReportIntakeSegment[] = [];
    let start = 0;
    while (start < rowKinds.length) {
        const kind = rowKinds[start];
        const notes = [...rowNotes[start]];
        const confidence = rowConfidence[start];
        let end = start;
        while (
            end + 1 < rowKinds.length
            && rowKinds[end + 1] === kind
            && rowConfidence[end + 1] === confidence
            && rowNotes[end + 1].join('|') === notes.join('|')
        ) {
            end += 1;
        }
        pushSegment(segments, kind, start, end, confidence, notes);
        start = end + 1;
    }
    return segments;
};

const buildFallbackCsvData = (
    fileName: string,
    rows: RawCsvRow[],
    detection?: CsvIntakeDetectionResult,
): CsvData => {
    const [headerRow, ...dataRows] = rows;
    const headers = buildHeaders(headerRow ?? []);
    return {
        fileName,
        data: dataRows.map(row => buildRecordRow(headers, row)),
        metadataRows: [],
        headerLayers: [],
        summaryRows: [],
        headerDepth: headers.length > 0 ? 1 : 0,
        summaryRowCount: 0,
        intakeDetection: detection,
    };
};

const ZERO_PLACEHOLDER_PATTERN = /^['\u2018\u2019]\s*-+\s*$/;
const ZERO_PLACEHOLDER_THRESHOLD = 0.3; // 30% of non-blank rows

/**
 * Scan raw (pre-sanitized) rows to detect columns where ≥30% of cells are
 * zero-placeholder markers ('-, etc.).  Returns 0-based column indexes.
 */
const detectZeroPlaceholderColumns = (rawRows: RawCsvRow[], columnCount: number): number[] => {
    if (rawRows.length === 0) return [];
    const counts = new Array<number>(columnCount).fill(0);
    const nonBlankRowCount = rawRows.filter(row => row.some(cell => String(cell ?? '').trim() !== '')).length;
    if (nonBlankRowCount === 0) return [];
    for (const row of rawRows) {
        for (let col = 0; col < Math.min(row.length, columnCount); col += 1) {
            if (ZERO_PLACEHOLDER_PATTERN.test(String(row[col] ?? '').trim())) {
                counts[col] += 1;
            }
        }
    }
    return counts
        .map((count, index) => (count / nonBlankRowCount >= ZERO_PLACEHOLDER_THRESHOLD ? index : -1))
        .filter(index => index >= 0);
};

export const buildReportIntakeIr = (
    fileName: string,
    rawRows: RawCsvRow[],
    baseDetection?: CsvIntakeDetectionResult,
): ReportIntakeIr => {
    const coercedRows = rawRows.map(row => (Array.isArray(row) ? row.map(cell => String(cell ?? '')) : []));
    const columnCount = coercedRows.reduce((max, row) => Math.max(max, row.length), 0);
    if (columnCount === 0) {
        throw new Error('CSV file is empty or does not contain any columns.');
    }

    // Detect zero-placeholder columns BEFORE sanitization strips them
    const zeroPlaceholderColumnIndexes = detectZeroPlaceholderColumns(coercedRows, columnCount);

    const normalizedRows = normalizeRowLengths(coercedRows, columnCount);
    const preScanSignals = buildPreScanSignals(normalizedRows);
    const selection = preScanSignals.deterministicSelection
        ? selectReportHeader(normalizedRows)
        : null;
    const fallbackHeaderShapeDrift = hasHeaderShapeDrift(coercedRows, 0, 1);
    if (!selection || selection.headerRowIndex < 0 || selection.headerRowIndex >= normalizedRows.length || selection.confidence < 0.72) {
        const detection = fallbackHeaderShapeDrift
            ? appendDetectionWarning(baseDetection, {
                code: 'header_shape_drift',
                message: 'Header width drifts from early body rows, so the imported columns may need manual review.',
            })
            : baseDetection;
        const segments = buildSegments(normalizedRows, null);
        return {
            fileName,
            columnCount,
            rawRows: coercedRows.map(row => [...row]),
            normalizedRows,
            detection,
            segments,
            provisionalTable: null,
            diagnostics: {
                hasRepeatedHeader: false,
                hasParameterRowsBetweenHeaderAndBody: false,
                headerShapeDrift: fallbackHeaderShapeDrift,
                singleColumnFallbackApplied: true,
                bodyEvidenceKind: 'unknown',
                segmentCountsByKind: countSegmentsByKind(segments),
                headerCandidates: [],
                bodyStartCandidates: [],
                evidenceStrength: 'none',
                fallbackReason: selection
                    ? `Header candidate confidence ${selection.confidence.toFixed(2)} below threshold 0.72`
                    : 'No header candidate found in scan window',
                preScanSignals,
                structureSource: 'deterministic',
                ...(zeroPlaceholderColumnIndexes.length > 0 ? { zeroPlaceholderColumnIndexes } : {}),
            },
        };
    }

    const summaryStartIndex = findSummaryStartIndex(normalizedRows, selection.bodyStartIndex);
    preScanSignals.deterministicSummaryStartIndex = summaryStartIndex;
    const headerLayerIndexSet = new Set(selection.headerLayerIndexes);
    const parameterRowIndexSet = new Set(selection.parameterRowIndexes);
    const repeatedHeaderRowIndexSet = new Set(selection.repeatedHeaderRowIndexes);
    const metadataRowIndexes = normalizedRows
        .slice(0, selection.bodyStartIndex)
        .map((_, index) => index)
        .filter(index => !headerLayerIndexSet.has(index) && index !== selection.headerRowIndex && !isBlankRow(normalizedRows[index]));
    const headerShapeDrift = hasHeaderShapeDrift(coercedRows, selection.headerRowIndex, selection.bodyStartIndex);
    const detection = headerShapeDrift
        ? appendDetectionWarning(baseDetection, {
            code: 'header_shape_drift',
            message: 'Header width drifts from body rows near the detected table boundary, so report structure may be irregular.',
        })
        : baseDetection;
    const provisionalTable: ReportIntakeIr['provisionalTable'] = {
        headerRowIndex: selection.headerRowIndex,
        headerLayerRowIndexes: [...selection.headerLayerIndexes],
        bodyStartIndex: selection.bodyStartIndex,
        summaryStartIndex,
        repeatedHeaderRowIndexes: [...selection.repeatedHeaderRowIndexes],
        metadataRowIndexes,
        parameterRowIndexes: [...selection.parameterRowIndexes],
    };
    const segments = buildSegments(normalizedRows, provisionalTable);

    return {
        fileName,
        columnCount,
        rawRows: coercedRows.map(row => [...row]),
        normalizedRows,
        detection,
        segments,
        provisionalTable,
        diagnostics: {
            hasRepeatedHeader: repeatedHeaderRowIndexSet.size > 0,
            hasParameterRowsBetweenHeaderAndBody: parameterRowIndexSet.size > 0,
            headerShapeDrift,
            singleColumnFallbackApplied: false,
            bodyEvidenceKind: selection.bodyEvidenceKind,
            segmentCountsByKind: countSegmentsByKind(segments),
            headerCandidates: [{
                rowIndex: selection.headerRowIndex,
                confidence: selection.confidence,
                reason: `Header detected at row ${selection.headerRowIndex} with ${selection.headerLayerIndexes.length} layer(s)`,
            }],
            bodyStartCandidates: [{
                rowIndex: selection.bodyStartIndex,
                confidence: selection.confidence,
                evidenceKind: selection.bodyEvidenceKind,
                reason: `Body start at row ${selection.bodyStartIndex} (${selection.bodyEvidenceKind})`,
            }],
            evidenceStrength: selection.confidence >= 0.9 ? 'strong'
                : selection.confidence >= 0.78 ? 'moderate'
                    : 'weak',
            fallbackReason: null,
            preScanSignals,
            structureSource: 'deterministic',
            ...(zeroPlaceholderColumnIndexes.length > 0 ? { zeroPlaceholderColumnIndexes } : {}),
        },
    };
};

export const buildCsvDataFromIntakeIr = (intakeIr: ReportIntakeIr): CsvData => {
    if (!intakeIr.provisionalTable) {
        return buildFallbackCsvData(intakeIr.fileName, intakeIr.normalizedRows, intakeIr.detection);
    }

    const { provisionalTable, normalizedRows, diagnostics } = intakeIr;
    const isHeaderless = provisionalTable.headerRowIndex === -1
        && diagnostics.syntheticHeaderApplied === true
        && diagnostics.aiStructureBoundary?.syntheticHeaders;

    const headerLayerIndexSet = new Set(provisionalTable.headerLayerRowIndexes);
    const metadataRows = normalizedRows
        .slice(0, provisionalTable.bodyStartIndex)
        .filter((_, index) => !headerLayerIndexSet.has(index) && index !== provisionalTable.headerRowIndex)
        .filter(row => getNonEmptyCells(row).length > 0)
        .map(row => [...row]);
    const bodyRows = normalizedRows.slice(provisionalTable.bodyStartIndex, provisionalTable.summaryStartIndex);
    const summaryRows = normalizedRows
        .slice(provisionalTable.summaryStartIndex)
        .filter(row => getNonEmptyCells(row).length > 0)
        .map(buildSummaryRow);

    // For headerless files, use AI-inferred synthetic headers instead of reading a data row.
    // When a header layer exists (band row + leaf row), merge them via the
    // same ' :: ' convention canonicalization uses — otherwise a leaf-row
    // sub-metric name (e.g. "Net Sales" under a "JANUARY" band) never
    // becomes an addressable column at all, it's just data sitting under
    // whatever the band row's own column happened to be named. Falls back
    // to the single-row path when there's no layer, which is byte-identical
    // to the old behavior for the common case (buildMergedBoundaryHeaders'
    // own text normalization differs slightly from buildHeaders', so this
    // is scoped to only the multi-layer case to avoid nudging every
    // single-header file's column names).
    const headers = isHeaderless
        ? buildHeaders(diagnostics.aiStructureBoundary!.syntheticHeaders!)
        : provisionalTable.headerLayerRowIndexes.length > 0
            ? buildMergedBoundaryHeaders(normalizedRows, {
                headerRowIndex: provisionalTable.headerRowIndex,
                headerLayerRowIndexes: provisionalTable.headerLayerRowIndexes,
            })
            : buildHeaders(normalizedRows[provisionalTable.headerRowIndex] ?? []);

    const evidenceStrength = diagnostics.evidenceStrength;
    const stagingConfidence: CsvData['stagingConfidence'] =
        evidenceStrength === 'strong' ? 'high'
            : evidenceStrength === 'moderate' ? 'medium'
                : 'low';

    return {
        fileName: intakeIr.fileName,
        data: bodyRows.map(row => buildRecordRow(headers, row)),
        metadataRows,
        headerLayers: provisionalTable.headerLayerRowIndexes.map(index => [...normalizedRows[index]]),
        summaryRows,
        headerDepth: isHeaderless ? 0 : 1 + provisionalTable.headerLayerRowIndexes.length,
        summaryRowCount: summaryRows.length,
        intakeDetection: intakeIr.detection,
        stagingConfidence,
        stagingSource: 'intake_provisional',
    };
};

export const buildCsvDataFromRawRows = (
    fileName: string,
    rawRows: RawCsvRow[],
    baseDetection?: CsvIntakeDetectionResult,
): CsvData => buildCsvDataFromIntakeIr(buildReportIntakeIr(fileName, rawRows, baseDetection));

export interface AiBoundaryValidationResult {
    valid: boolean;
    rejectionReason: string | null;
}

/**
 * Validate an AI-detected boundary against hard invariants.
 * Returns { valid: true } if the boundary is safe to use, or
 * { valid: false, rejectionReason } if it should be discarded.
 */
export const validateAiBoundary = (
    boundary: {
        headerRowIndex: number;
        bodyStartIndex: number;
        summaryStartIndex: number;
        headerLayerIndexes?: number[];
        parameterRowIndexes?: number[];
        repeatedHeaderRowIndexes?: number[];
        syntheticHeaders?: string[];
    },
    rows: string[][],
): AiBoundaryValidationResult => {
    const rowCount = rows.length;
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

    // Headerless file path: headerRowIndex === -1 with syntheticHeaders
    if (boundary.headerRowIndex === -1) {
        if (!Array.isArray(boundary.syntheticHeaders) || boundary.syntheticHeaders.length === 0) {
            return { valid: false, rejectionReason: 'headerRowIndex is -1 (headerless) but syntheticHeaders is missing or empty' };
        }
        if (boundary.syntheticHeaders.length !== columnCount) {
            // Allow off-by-one tolerance for trailing comma artifacts
            if (Math.abs(boundary.syntheticHeaders.length - columnCount) > 1) {
                return { valid: false, rejectionReason: `syntheticHeaders length ${boundary.syntheticHeaders.length} does not match column count ${columnCount}` };
            }
        }
        // bodyStartIndex must be in range
        if (!Number.isInteger(boundary.bodyStartIndex) || boundary.bodyStartIndex < 0 || boundary.bodyStartIndex >= rowCount) {
            return { valid: false, rejectionReason: `bodyStartIndex ${boundary.bodyStartIndex} out of range [0, ${rowCount})` };
        }
        // summaryStartIndex must be >= bodyStartIndex
        if (!Number.isInteger(boundary.summaryStartIndex) || boundary.summaryStartIndex < boundary.bodyStartIndex) {
            return { valid: false, rejectionReason: `summaryStartIndex ${boundary.summaryStartIndex} must be >= bodyStartIndex ${boundary.bodyStartIndex}` };
        }
        if (boundary.summaryStartIndex > rowCount) {
            return { valid: false, rejectionReason: `summaryStartIndex ${boundary.summaryStartIndex} out of range [0, ${rowCount}]` };
        }
        // Must have at least 1 body row
        if (boundary.summaryStartIndex <= boundary.bodyStartIndex) {
            return { valid: false, rejectionReason: 'No body rows between bodyStartIndex and summaryStartIndex' };
        }
        return { valid: true, rejectionReason: null };
    }

    // Hard invariant: headerRowIndex must be in range
    if (!Number.isInteger(boundary.headerRowIndex) || boundary.headerRowIndex < 0 || boundary.headerRowIndex >= rowCount) {
        return { valid: false, rejectionReason: `headerRowIndex ${boundary.headerRowIndex} out of range [0, ${rowCount})` };
    }

    // Hard invariant: bodyStartIndex must be after headerRowIndex
    if (!Number.isInteger(boundary.bodyStartIndex) || boundary.bodyStartIndex <= boundary.headerRowIndex) {
        return { valid: false, rejectionReason: `bodyStartIndex ${boundary.bodyStartIndex} must be > headerRowIndex ${boundary.headerRowIndex}` };
    }

    // Hard invariant: bodyStartIndex must be in range
    if (boundary.bodyStartIndex >= rowCount) {
        return { valid: false, rejectionReason: `bodyStartIndex ${boundary.bodyStartIndex} out of range [0, ${rowCount})` };
    }

    // Hard invariant: summaryStartIndex must be >= bodyStartIndex
    if (!Number.isInteger(boundary.summaryStartIndex) || boundary.summaryStartIndex < boundary.bodyStartIndex) {
        return { valid: false, rejectionReason: `summaryStartIndex ${boundary.summaryStartIndex} must be >= bodyStartIndex ${boundary.bodyStartIndex}` };
    }

    // Hard invariant: summaryStartIndex must be <= rowCount
    if (boundary.summaryStartIndex > rowCount) {
        return { valid: false, rejectionReason: `summaryStartIndex ${boundary.summaryStartIndex} out of range [0, ${rowCount}]` };
    }

    // Hard invariant: header row must have >= 3 non-empty cells
    const headerValues = getNonEmptyCells(rows[boundary.headerRowIndex]);
    if (headerValues.length < 3) {
        return { valid: false, rejectionReason: `Header row ${boundary.headerRowIndex} has only ${headerValues.length} non-empty cells (need >= 3)` };
    }

    // Hard invariant: at least 1 body row must exist
    if (boundary.summaryStartIndex <= boundary.bodyStartIndex) {
        return { valid: false, rejectionReason: 'No body rows between bodyStartIndex and summaryStartIndex' };
    }

    // Hard invariant: all auxiliary indexes must be in valid range
    for (const idx of boundary.headerLayerIndexes ?? []) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= boundary.bodyStartIndex) {
            return { valid: false, rejectionReason: `headerLayerIndex ${idx} out of valid range [0, ${boundary.bodyStartIndex})` };
        }
    }
    for (const idx of boundary.parameterRowIndexes ?? []) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= boundary.bodyStartIndex) {
            return { valid: false, rejectionReason: `parameterRowIndex ${idx} out of valid range [0, ${boundary.bodyStartIndex})` };
        }
    }
    for (const idx of boundary.repeatedHeaderRowIndexes ?? []) {
        if (!Number.isInteger(idx) || idx < boundary.bodyStartIndex || idx >= rowCount) {
            return { valid: false, rejectionReason: `repeatedHeaderRowIndex ${idx} out of valid range [${boundary.bodyStartIndex}, ${rowCount})` };
        }
    }

    return { valid: true, rejectionReason: null };
};

/**
 * Rebuild a ReportIntakeIr using an externally-provided boundary (e.g. from AI detection).
 * The boundary replaces the deterministic selection while keeping all other IR fields intact.
 */
export const rebuildIntakeIrWithBoundary = (
    baseIr: ReportIntakeIr,
    boundary: {
        headerRowIndex: number;
        headerLayerIndexes?: number[];
        bodyStartIndex: number;
        summaryStartIndex: number;
        parameterRowIndexes?: number[];
        repeatedHeaderRowIndexes?: number[];
        syntheticHeaders?: string[];
    },
    structureSource: 'ai' | 'ai_fallback_deterministic',
): ReportIntakeIr => {
    const { normalizedRows, rawRows: coercedRows } = baseIr;
    const isHeaderless = boundary.headerRowIndex === -1 && Array.isArray(boundary.syntheticHeaders);
    const headerLayerIndexes = boundary.headerLayerIndexes ?? [];
    const paramRowIndexes = boundary.parameterRowIndexes ?? [];
    const repeatedHeaderIndexes = boundary.repeatedHeaderRowIndexes ?? [];
    const headerLayerIndexSet = new Set(headerLayerIndexes);
    const metadataRowIndexes = normalizedRows
        .slice(0, boundary.bodyStartIndex)
        .map((_, index) => index)
        .filter(index => !headerLayerIndexSet.has(index) && index !== boundary.headerRowIndex && !isBlankRow(normalizedRows[index]));

    // For headerless files, skip header shape drift check (there is no header to drift from)
    const headerShapeDrift = isHeaderless
        ? false
        : hasHeaderShapeDrift(coercedRows.map(r => [...r]), boundary.headerRowIndex, boundary.bodyStartIndex);

    const provisionalTable: ReportIntakeIr['provisionalTable'] = {
        headerRowIndex: boundary.headerRowIndex,
        headerLayerRowIndexes: headerLayerIndexes,
        bodyStartIndex: boundary.bodyStartIndex,
        summaryStartIndex: boundary.summaryStartIndex,
        repeatedHeaderRowIndexes: repeatedHeaderIndexes,
        metadataRowIndexes,
        parameterRowIndexes: paramRowIndexes,
    };
    const segments = buildSegments(normalizedRows, provisionalTable);
    const bodyRow = normalizedRows[boundary.bodyStartIndex];
    const bodyEvidenceKind = bodyRow ? detectBodyEvidenceKind(bodyRow) : ('unknown' as ReportIntakeBodyEvidenceKind);

    // For headerless files, strip the header_shape_drift warning from detection
    // since there is no real header to drift from.
    const detection = isHeaderless && baseIr.detection
        ? {
            ...baseIr.detection,
            warnings: (baseIr.detection.warnings ?? []).filter(w => w.code !== 'header_shape_drift'),
        }
        : baseIr.detection;

    return {
        ...baseIr,
        detection,
        segments,
        provisionalTable,
        diagnostics: {
            ...baseIr.diagnostics,
            hasRepeatedHeader: repeatedHeaderIndexes.length > 0,
            hasParameterRowsBetweenHeaderAndBody: paramRowIndexes.length > 0,
            headerShapeDrift,
            singleColumnFallbackApplied: false,
            syntheticHeaderApplied: isHeaderless,
            bodyEvidenceKind,
            segmentCountsByKind: countSegmentsByKind(segments),
            headerCandidates: isHeaderless ? [] : [{
                rowIndex: boundary.headerRowIndex,
                confidence: 0.85,
                reason: `Header detected at row ${boundary.headerRowIndex} by ${structureSource}`,
            }],
            bodyStartCandidates: [{
                rowIndex: boundary.bodyStartIndex,
                confidence: 0.85,
                evidenceKind: bodyEvidenceKind,
                reason: `Body start at row ${boundary.bodyStartIndex} by ${structureSource}`,
            }],
            evidenceStrength: 'moderate',
            fallbackReason: null,
            structureSource,
            // Store AI boundary so buildCsvDataFromIntakeIr can access syntheticHeaders
            ...(isHeaderless ? { aiStructureBoundary: boundary as AiIntakeStructureBoundary } : {}),
        },
    };
};
