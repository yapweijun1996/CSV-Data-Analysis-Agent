import type { CsvData, CsvRow, RowRole } from '../../types';
import {
    getColumns,
    getDescriptorPriority,
    getRows,
    isBlankRow,
    isFooterLikeRow,
    isNumericLike,
    isSummaryLike,
    roundRatio,
    SUBTOTAL_ROW_PATTERN,
    SUMMARY_TOKEN_PATTERN,
    TOTAL_ROW_PATTERN,
} from './reportShapeUtils';
import { computeColumnStatistics } from './columnRoleClassifier';
import type { RowRoleSignalBundle } from './runtime/rowRoleSignals';

export interface TabularShapeContext {
    descriptorColumns: string[];
    valueColumns: string[];
    confidence: number;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

const STRUCTURAL_IDENTIFIER_COLUMN_PATTERN = /\b(?:code|id)\b/i;
// A hierarchical/WBS-style item code ("14.01") carries 2+ decimal digits;
// its section/category-level ancestor ("14" or "14.0") carries at most 1.
// Narrow, data-driven carve-out — only fires for codes already matching
// this specific decimal-precision convention (common in cost/budget
// reports), so it never reclassifies non-numeric or single-segment codes.
const LEAF_HIERARCHY_CODE_PATTERN = /^\d+\.\d{2,}$/;

const hasLeafHierarchyCode = (row: CsvRow, descriptorColumns: string[]) =>
    descriptorColumns.some(column => (
        STRUCTURAL_IDENTIFIER_COLUMN_PATTERN.test(column)
        && LEAF_HIERARCHY_CODE_PATTERN.test(String(row[column] ?? '').trim())
    ));

const getNonNoiseRows = (data: CsvData | null) =>
    getRows(data).filter(row => !isBlankRow(row) && !isFooterLikeRow(row));

export const inferTabularShapeContext = (data: CsvData | null): TabularShapeContext | null => {
    const rows = getNonNoiseRows(data);
    const columns = getColumns(data);
    if (rows.length === 0 || columns.length === 0) return null;

    // Convert CsvRow[] to string[][] for shared computeColumnStatistics.
    const rawRows = rows.map(row => columns.map(col => String(row[col] ?? '')));
    const stats = columns.map((column, index) => computeColumnStatistics(column, index, rawRows));
    const totalRows = rows.length;
    // Value columns: high strict numeric density, not code-like, not structural identifiers,
    // not sparse leading columns. Uses strictNumericRatio (exact format match) because
    // CsvData has already been parsed — no currency formatting artifacts.
    const valueColumns = stats
        .filter(stat =>
            stat.nonEmptyCount > 0
            && stat.codeLikeDensity < 0.3
            && !stat.structuralIdentifierHint
            && !(stat.columnIndex < 3 && stat.nonEmptyCount / totalRows < 0.65)
            && (stat.softNumericRatio >= 0.55 || stat.strictNumericRatio >= 0.65),
        )
        .map(stat => stat.column);
    // Descriptor columns: textual, code-like, structural identifier, positional, or sparse leading.
    const descriptorColumns = stats
        .filter(stat =>
            !valueColumns.includes(stat.column)
            && stat.nonEmptyCount > 0
            && (stat.codeLikeDensity >= 0.3
                || stat.structuralIdentifierHint
                || stat.strictNumericRatio <= 0.2
                || stat.textualRatio >= 0.6
                || (stat.columnIndex < 3 && stat.strictNumericRatio < 0.5 && stat.textualRatio >= 0.2)
                || (stat.columnIndex < 3 && stat.nonEmptyCount / totalRows < 0.65)),
        )
        .sort((left, right) => getDescriptorPriority(left.column) - getDescriptorPriority(right.column) || left.columnIndex - right.columnIndex)
        .map(stat => stat.column)
        .slice(0, 3);

    if (descriptorColumns.length === 0 || valueColumns.length === 0) return null;

    return {
        descriptorColumns,
        valueColumns,
        confidence: roundRatio(Math.min(1, 0.4 + descriptorColumns.length * 0.15 + valueColumns.length * 0.1)),
    };
};

const isRepeatedHeaderLikeRow = (row: CsvRow, context: TabularShapeContext) => {
    const normalizedValues = Object.values(row)
        .map(normalize)
        .filter(Boolean);
    if (normalizedValues.length === 0) return false;
    const expected = [...context.descriptorColumns, ...context.valueColumns].map(normalize);
    const overlap = normalizedValues.filter(value => expected.includes(value)).length;
    return overlap >= Math.max(2, Math.floor(expected.length * 0.6));
};

export const detectTabularRowRole = (
    row: CsvRow | undefined,
    context: TabularShapeContext | null,
    signalBundle?: RowRoleSignalBundle | null,
): { role: RowRole; confidence: number } => {
    if (!row || !context) return { role: 'unknown', confidence: 0 };
    if (isBlankRow(row) || isFooterLikeRow(row)) return { role: 'noise', confidence: 0.98 };
    if (isRepeatedHeaderLikeRow(row, context)) return { role: 'noise', confidence: 0.92 };

    const descriptorValues = context.descriptorColumns
        .map(column => String(row[column] ?? '').trim())
        .filter(Boolean);
    const allValues = Object.values(row)
        .map(value => String(value ?? '').trim())
        .filter(Boolean);
    // A long free-text cell (a remarks/description field, or an injected
    // test fixture paragraph) must not count as "content" for subtotal/total
    // shape detection below: it inflates textValueCount and shrinks the
    // sparse-row signal, hiding an otherwise-obvious "label + currency +
    // figures" total row behind what looks like a dense, multi-text-value
    // record. A genuine subtotal/total row's own cells are always short.
    const SUMMARY_SCAN_MAX_VALUE_LENGTH = 60;
    const summaryScanValues = allValues.filter(value => value.length <= SUMMARY_SCAN_MAX_VALUE_LENGTH);
    const explicitSubtotalLabel = summaryScanValues.some(value => SUBTOTAL_ROW_PATTERN.test(value.trim()));
    const textValueCount = summaryScanValues.filter(value => /[A-Za-z]/.test(value) && !isNumericLike(value)).length;
    const numericCount = context.valueColumns
        .filter(column => isNumericLike(String(row[column] ?? '').trim()))
        .length;
    const sparseScore = roundRatio(1 - (allValues.length / Math.max(Object.keys(row).length, 1)));

    // Structural signal first, regex fallback for subtotal/total detection.
    const subtotalHit = signalBundle?.sumVerification.sumMatchType === 'section_subtotal'
        || explicitSubtotalLabel
        || descriptorValues.some(value => SUBTOTAL_ROW_PATTERN.test(value.trim()));
    const totalHit = signalBundle?.sumVerification.sumMatchType === 'grand_total'
        || descriptorValues.some(value => TOTAL_ROW_PATTERN.test(value.trim()));
    const summaryLikeHit = (signalBundle?.sumVerification.isSumMatch ?? false)
        || SUMMARY_TOKEN_PATTERN.test(summaryScanValues.join(' | '))
        || summaryScanValues.some(isSummaryLike);
    const sparseSummaryCandidate = sparseScore >= 0.3
        && summaryScanValues.length <= Math.max(6, context.valueColumns.length + 2)
        && textValueCount <= Math.max(2, descriptorValues.length);

    // Explicit subtotal labels can sit in a non-descriptor column in malformed
    // report exports, and their numeric values can be position-shifted out of
    // the inferred value columns. The label itself is the stronger positional
    // signal, so classify it before sparse comment/fact fallbacks.
    if (explicitSubtotalLabel) {
        return { role: 'subtotal', confidence: 0.96 };
    }

    // Structural: singleton long text → comment.
    if (numericCount === 0 && allValues.length <= 2 && allValues.join(' ').length >= 16) {
        return { role: 'comment', confidence: 0.76 };
    }
    // Structural: singleton long text at document edge → comment.
    if (signalBundle?.sparsity.isSingletonLongText && signalBundle.sparsity.isDocumentEdge) {
        return { role: 'comment', confidence: 0.84 };
    }
    // Structural: sparse non-numeric row with colon structure or long text → comment.
    if (numericCount === 0 && descriptorValues.length <= 1
        && descriptorValues.some(value => value.includes(':') || value.length >= 20)) {
        return { role: 'comment', confidence: 0.76 };
    }

    if (subtotalHit) {
        return { role: 'subtotal', confidence: 0.94 };
    }
    if (summaryLikeHit && numericCount >= 1 && sparseSummaryCandidate) {
        return { role: 'subtotal', confidence: 0.86 };
    }
    if (totalHit || descriptorValues.some(isSummaryLike)) {
        return { role: 'total', confidence: 0.95 };
    }
    if (numericCount === 0 && descriptorValues.length > 0) {
        // GAP-3 residual fix (2026-07-24): a hierarchical WBS-style item code
        // is a leaf item's identity even with every fact value blank — only
        // a coarser section/category code is a genuine heading.
        if (hasLeafHierarchyCode(row, context.descriptorColumns)) {
            return { role: 'fact', confidence: 0.6 };
        }
        return { role: 'group_header', confidence: 0.82 };
    }
    if (numericCount > 0 && descriptorValues.length > 0) {
        return { role: 'fact', confidence: 0.88 };
    }
    // GAP-3 fix: numeric continuation rows with no descriptor text are
    // carry-forward details, not unknowns (see reportShapeHierarchy).
    if (numericCount > 0) {
        return { role: 'fact', confidence: 0.6 };
    }
    return { role: 'unknown', confidence: 0.2 };
};
