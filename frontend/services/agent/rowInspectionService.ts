import type { CsvData, DataOperation, RowInspectionBundle, RowInspectionResult, RowInspectionRole } from '../../types';
import { detectTabularRowRole, inferTabularShapeContext, type TabularShapeContext } from './reportShapeTabular';
import { computeRowRoleSignals, classifyRowRoleFromSignals, type RowRoleSignalBundle } from './runtime/rowRoleSignals';
import {
    getColumns,
    getRows,
    isBlankRow,
    isFooterLikeRow,
    isNumericLike,
    isSummaryLike,
    roundRatio,
    SUMMARY_TOKEN_PATTERN,
} from './reportShapeUtils';
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
// Structural format patterns (kept — not domain-specific).
const ORDINAL_ROW_PATTERN = /^\d+[.)]$/;
const DATE_LIKE_PATTERN = /^(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})$/;
const IDENTIFIER_LIKE_PATTERN = /(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9/_-]+/;
// Domain patterns demoted to fallback — mixed-content heuristic is primary.
const PURPOSE_LIKE_PATTERN = /\b(?:goods valuation|material requisition|sales|purchase|invoice|service)\b/i;
const UOM_LIKE_PATTERN = /^(?:pcs|set|lot|kg|g|ton|m|mm|ft|pair|box|roll|unit|ea)$/i;

const EMPTY_ROLE_COUNTS: Record<RowInspectionRole, number> = {
    detail: 0,
    group_header: 0,
    summary_like: 0,
    note: 0,
    blank: 0,
    unknown: 0,
};

const getDescriptorValues = (row: Record<string, unknown>, context: TabularShapeContext | null) =>
    (context?.descriptorColumns ?? [])
        .map(column => String(row[column] ?? '').trim())
        .filter(Boolean);

const getNonEmptyValues = (row: Record<string, unknown>) =>
    Object.values(row)
        .map(value => String(value ?? '').trim())
        .filter(Boolean);

const normalizeToken = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[_/.-]+/g, ' ')
        .replace(/\s+/g, ' ');

const classifySparseTextRole = (
    values: string[],
    descriptorValues: string[],
    joined: string,
    contextPosition?: number,
): Extract<RowInspectionRole, 'group_header' | 'note'> => {
    // Structural: singleton long text at document edge → note.
    if (values.length === 1 && values[0].length >= 24
        && contextPosition != null && (contextPosition <= 0.15 || contextPosition >= 0.85)) {
        return 'note';
    }
    // Structural: long sparse text or colon key-value → note.
    if (joined.length >= 30 || values.some(v => v.includes(':'))) {
        return 'note';
    }
    if (values.length <= 2 && descriptorValues.length <= 1) {
        return 'group_header';
    }
    return values.join(' ').length >= 18 ? 'note' : 'group_header';
};

const isSparseNumericSummaryRow = (
    numericCount: number,
    textCount: number,
    descriptorValues: string[],
    sparseRowScore: number,
    context: TabularShapeContext | null,
) => (
    Boolean(context?.descriptorColumns?.length)
    && Boolean(context?.valueColumns?.length)
    && descriptorValues.length === 0
    && textCount === 0
    && sparseRowScore >= 0.5
    && numericCount >= Math.max(2, Math.min(3, context?.valueColumns?.length ?? 0))
);

const isSparseCurrencyTotalRow = (
    values: string[],
    numericCount: number,
    textCount: number,
    descriptorValues: string[],
    sparseRowScore: number,
) => (
    values.length <= 3
    && numericCount === 1
    && textCount >= 1
    && descriptorValues.length === 0
    && sparseRowScore >= 0.75
    && values.some(value => CURRENCY_CODE_PATTERN.test(value))
);

const isRepeatedHeaderEchoRow = (
    values: string[],
    columns: string[],
    sparseRowScore: number,
) => {
    if (values.length < 2 || columns.length < 2) return false;
    const normalizedValues = values.map(normalizeToken).filter(Boolean);
    const normalizedColumns = columns.map(normalizeToken).filter(Boolean);
    if (normalizedValues.length < 2 || normalizedColumns.length < 2) return false;
    const overlap = normalizedValues.filter(value => normalizedColumns.includes(value)).length;
    return sparseRowScore <= 0.5 && overlap >= Math.max(2, Math.floor(normalizedValues.length * 0.75));
};

const isSingletonLongTextNoiseRow = (
    values: string[],
    numericCount: number,
    sparseRowScore: number,
    contextPosition: number,
) => {
    if (values.length !== 1 || numericCount !== 0 || sparseRowScore < 0.65) return false;
    const [value] = values;
    if (value.length < 24) return false;
    // Structural primary: singleton long text at document edges → noise.
    if (contextPosition <= 0.15 || contextPosition >= 0.85) return true;
    // Structural: very long singleton text, colon structure, or page numbering → noise.
    return value.length >= 40 || value.includes(':') || /page\s+\d+/i.test(value);
};

const isSparseRecordLikeDetailRow = (
    values: string[],
    numericCount: number,
    textCount: number,
    sparseRowScore: number,
    summaryTokenHit: boolean,
) => {
    if (summaryTokenHit || values.length < 4 || values.length > 12) return false;
    if (sparseRowScore < 0.45) return false;
    if (numericCount > 1) return false;

    const hasOrdinalLead = ORDINAL_ROW_PATTERN.test(values[0] ?? '');
    const hasDateLike = values.some(value => DATE_LIKE_PATTERN.test(value));
    const identifierCount = values.filter(value => IDENTIFIER_LIKE_PATTERN.test(value)).length;

    return (hasOrdinalLead || hasDateLike)
        && identifierCount >= 1
        && textCount >= Math.max(3, Math.floor(values.length * 0.5));
};

const isSparseContinuationDetailRow = (
    values: string[],
    numericCount: number,
    textCount: number,
    sparseRowScore: number,
    summaryTokenHit: boolean,
    descriptorValues: string[],
    context: TabularShapeContext | null,
) => {
    if (summaryTokenHit || descriptorValues.length > 0) return false;
    if (!context?.valueColumns?.length || context.valueColumns.length < 2) return false;
    if (values.length < 4 || values.length > 8) return false;
    if (sparseRowScore < 0.3) return false;
    if (numericCount < 2 || textCount < 1) return false;

    // Mixed-content heuristic: short text (2-12 chars with letters) + numeric = detail continuation.
    const shortTextCount = values.filter(v =>
        /[A-Za-z]/.test(v) && v.length >= 2 && v.length <= 12 && !isNumericLike(v),
    ).length;
    const descriptiveTextCount = values.filter(v =>
        /[A-Za-z]/.test(v)
        && v.length >= 2
        && !isNumericLike(v)
        && !isSummaryLike(v),
    ).length;
    if ((shortTextCount >= 1 || descriptiveTextCount >= 1) && numericCount >= 2) return true;
    // Regex fallback for domain-specific content indicators.
    return values.some(value => PURPOSE_LIKE_PATTERN.test(value))
        || values.some(value => UOM_LIKE_PATTERN.test(value));
};

const isDenseCategoricalDetailRow = (
    nonEmptyCellCount: number,
    totalCellCount: number,
    textCount: number,
    summaryTokenHit: boolean,
) => (
    !summaryTokenHit
    && nonEmptyCellCount >= 3
    && textCount >= 2
    && nonEmptyCellCount / Math.max(totalCellCount, 1) >= 0.5
);

export const inspectCsvRows = (
    data: CsvData | null,
    options?: {
        source?: 'raw' | 'cleaned';
        sourceRowClassCandidates?: Record<number, string | null | undefined>;
        focusRowIndexes?: number[];
    },
): RowInspectionBundle => {
    const rows = getRows(data);
    const columns = getColumns(data);
    const context = inferTabularShapeContext(data);
    // Precompute structural row role signals (sum-verification, sparsity, position)
    // in a single forward pass — same pattern as canonicalizeReportTable.ts.
    const signalMap: Map<number, RowRoleSignalBundle> | null =
        context && context.valueColumns.length >= 2
            ? computeRowRoleSignals({
                rows: rows as Record<string, unknown>[],
                factColumns: context.valueColumns,
                descriptorColumns: context.descriptorColumns,
                bodyStartIndex: 0,
                summaryStartIndex: null,
                totalRowCount: rows.length,
            })
            : null;
    const focusSet = new Set((options?.focusRowIndexes ?? []).filter(index => index >= 0));
    const inspectionRows: RowInspectionResult[] = [];

    rows.forEach((row, rowIndex) => {
        if (focusSet.size > 0 && !focusSet.has(rowIndex)) {
            return;
        }

        const values = getNonEmptyValues(row);
        const descriptorValues = getDescriptorValues(row, context);
        const joined = values.join(' | ');
        const numericCount = values.filter(isNumericLike).length;
        const textCount = values.filter(value => /[A-Za-z]/.test(value) && !isNumericLike(value)).length;
        const baseRole = detectTabularRowRole(row, context, signalMap?.get(rowIndex) ?? null);
        const nonEmptyCellCount = values.length;
        const totalCellCount = Math.max(columns.length, Object.keys(row ?? {}).length, 1);
        const sparseRowScore = roundRatio(1 - (nonEmptyCellCount / totalCellCount));
        const numericDensity = roundRatio(nonEmptyCellCount > 0 ? numericCount / nonEmptyCellCount : 0);
        const textDensity = roundRatio(nonEmptyCellCount > 0 ? textCount / nonEmptyCellCount : 0);
        const descriptorDensity = roundRatio(
            context?.descriptorColumns?.length
                ? descriptorValues.length / context.descriptorColumns.length
                : 0,
        );
        // Regex fallback — structural signals take priority when signal map is available.
        const summaryTokenHit = SUMMARY_TOKEN_PATTERN.test(joined) || values.some(isSummaryLike);
        const contextPosition = roundRatio(rows.length > 1 ? rowIndex / (rows.length - 1) : 0);
        const repeatedHeaderEcho = isRepeatedHeaderEchoRow(values, columns, sparseRowScore);
        const singletonLongTextNoise = isSingletonLongTextNoiseRow(values, numericCount, sparseRowScore, contextPosition);
        const sparseCurrencyTotal = isSparseCurrencyTotalRow(values, numericCount, textCount, descriptorValues, sparseRowScore);
        const sparseNumericSummary = isSparseNumericSummaryRow(numericCount, textCount, descriptorValues, sparseRowScore, context);

        let rowRole: RowInspectionRole = 'unknown';
        let confidence = 0.45;

        if (isBlankRow(row)) {
            rowRole = 'blank';
            confidence = 0.99;
        } else if (isFooterLikeRow(row)) {
            rowRole = 'note';
            confidence = 0.95;
        } else if (repeatedHeaderEcho) {
            rowRole = 'note';
            confidence = 0.93;
        } else if (singletonLongTextNoise) {
            rowRole = 'note';
            confidence = 0.89;
        } else if (baseRole.role === 'noise') {
            rowRole = numericCount === 0 ? 'note' : 'blank';
            confidence = 0.9;
        } else if (baseRole.role === 'subtotal' || baseRole.role === 'total') {
            rowRole = 'summary_like';
            confidence = Math.max(baseRole.confidence, 0.95);
        } else if (signalMap) {
            // Structural signal tier: sum-verification and sparsity-based classification
            // take priority over regex-based summaryTokenHit.
            const signalBundle = signalMap.get(rowIndex);
            if (signalBundle) {
                const signalResult = classifyRowRoleFromSignals(signalBundle);
                if (signalResult.role === 'summary' || signalResult.role === 'subtotal' || signalResult.role === 'summary_like') {
                    rowRole = 'summary_like';
                    confidence = Math.max(signalResult.confidence, 0.92);
                } else if (signalResult.role === 'note' || signalResult.role === 'footer') {
                    rowRole = 'note';
                    confidence = Math.max(signalResult.confidence, 0.88);
                }
            }
        }
        // Remaining tiers: regex fallback + heuristic classification.
        // Only fire when structural tiers above left rowRole as 'unknown'.
        if (rowRole === 'unknown') {
            if (summaryTokenHit && numericCount >= 1 && (sparseRowScore >= 0.35 || descriptorDensity <= 0.4)) {
                rowRole = 'summary_like';
                confidence = 0.91;
            } else if (sparseCurrencyTotal) {
                rowRole = 'summary_like';
                confidence = 0.86;
            } else if (sparseNumericSummary) {
                rowRole = 'summary_like';
                confidence = 0.88;
            } else if (baseRole.role === 'group_header') {
                rowRole = 'group_header';
                confidence = Math.max(baseRole.confidence, 0.84);
            } else if (isSparseRecordLikeDetailRow(values, numericCount, textCount, sparseRowScore, summaryTokenHit)) {
                rowRole = 'detail';
                confidence = 0.78;
            } else if (isSparseContinuationDetailRow(values, numericCount, textCount, sparseRowScore, summaryTokenHit, descriptorValues, context)) {
                rowRole = 'detail';
                confidence = 0.81;
            } else if (isDenseCategoricalDetailRow(nonEmptyCellCount, totalCellCount, textCount, summaryTokenHit)) {
                rowRole = 'detail';
                confidence = 0.8;
            } else if (baseRole.role === 'comment' || (numericCount === 0 && nonEmptyCellCount <= 2 && textCount >= 1)) {
                rowRole = classifySparseTextRole(values, descriptorValues, joined, contextPosition);
                confidence = rowRole === 'note' ? 0.86 : 0.8;
            } else if (baseRole.role === 'fact' || (numericCount >= 1 && descriptorValues.length > 0)) {
                rowRole = 'detail';
                confidence = Math.max(baseRole.confidence, 0.87);
            } else if (numericCount === 0 && textCount >= 1 && sparseRowScore >= 0.75) {
                rowRole = classifySparseTextRole(values, descriptorValues, joined, contextPosition);
                confidence = 0.74;
            }
        }

        inspectionRows.push({
            rowIndex,
            rowRole,
            confidence,
            source: 'deterministic',
            signals: {
                nonEmptyCellCount,
                totalCellCount,
                numericDensity,
                textDensity,
                descriptorDensity,
                summaryTokenHit,
                sparseRowScore,
                contextPosition,
                repeatedHeaderEcho,
                singletonLongTextNoise,
                sparseCurrencyTotal,
                sparseNumericSummary,
                structuralNoteHit: singletonLongTextNoise
                    || (values.length === 1 && values[0].length >= 24 && (contextPosition <= 0.15 || contextPosition >= 0.85)),
                structuralSumVerificationHit: signalMap?.get(rowIndex)?.sumVerification.isSumMatch ?? false,
            },
            sourceRowClassCandidate: options?.sourceRowClassCandidates?.[rowIndex] ?? baseRole.role ?? null,
            sampleValues: values.slice(0, 6),
        });
    });

    const countsByRole = inspectionRows.reduce<Record<RowInspectionRole, number>>((counts, row) => {
        counts[row.rowRole] += 1;
        return counts;
    }, { ...EMPTY_ROLE_COUNTS });

    return {
        generatedAt: new Date().toISOString(),
        fileName: data?.fileName ?? null,
        source: options?.source ?? 'cleaned',
        stagingTableName: options?.source === 'raw' ? 'raw_inspection_rows' : 'cleaned_inspection_rows',
        stagingColumns: ['_rowIndex', '_sourceRowClassCandidate', '_rawNonEmptyCount', ...columns],
        totalRows: rows.length,
        inspectedRowCount: inspectionRows.length,
        focusRowIndexes: inspectionRows.map(row => row.rowIndex),
        countsByRole,
        residualUnknownRowIndexes: inspectionRows.filter(row => row.rowRole === 'unknown').map(row => row.rowIndex),
        residualSummaryLikeRowIndexes: inspectionRows.filter(row => row.rowRole === 'summary_like').map(row => row.rowIndex),
        rows: inspectionRows,
    };
};

/**
 * Detect sectioned report pattern: group_header rows with a single non-empty
 * cell that acts as a section label, followed by data rows.  Returns the
 * column key and an ordered list of { rowIndex, label } for carry-forward.
 */
const detectSectionedReportPattern = (
    inspection: RowInspectionBundle,
    data: Record<string, unknown>[],
): { sectionColumn: string; entries: Array<{ rowIndex: number; label: string }> } | null => {
    const groupHeaders = inspection.rows
        .filter(row => row.rowRole === 'group_header' && row.confidence >= 0.7);
    if (groupHeaders.length < 2) return null;

    // Find which column consistently holds the section label
    const columnCounts = new Map<string, number>();
    for (const gh of groupHeaders) {
        const row = data[gh.rowIndex];
        if (!row) continue;
        for (const [key, val] of Object.entries(row)) {
            const str = String(val ?? '').trim();
            if (str !== '' && !isNumericLike(str) && !SUMMARY_TOKEN_PATTERN.test(str)) {
                columnCounts.set(key, (columnCounts.get(key) ?? 0) + 1);
            }
        }
    }
    if (columnCounts.size === 0) return null;
    const [[sectionColumn, hitCount]] = [...columnCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (hitCount < 2 || hitCount < groupHeaders.length * 0.5) return null;

    const entries: Array<{ rowIndex: number; label: string }> = [];
    for (const gh of groupHeaders) {
        const row = data[gh.rowIndex];
        if (!row) continue;
        const label = String(row[sectionColumn] ?? '').trim();
        if (label) entries.push({ rowIndex: gh.rowIndex, label });
    }
    return entries.length >= 2 ? { sectionColumn, entries } : null;
};

export const buildDeterministicInspectionCleanupOperations = (
    inspection: RowInspectionBundle,
    options?: {
        allowGroupAndNoteDrop?: boolean;
        /** Pass working data to enable section label carry-forward detection. */
        workingData?: Record<string, unknown>[];
    },
): DataOperation[] => {
    const operations: DataOperation[] = [];

    // ── Section label carry-forward ──
    // Before dropping group_header rows, detect sectioned report pattern and
    // carry the section label forward to all data rows within each section.
    if (options?.allowGroupAndNoteDrop && options.workingData && options.workingData.length > 0) {
        const sectioned = detectSectionedReportPattern(inspection, options.workingData);
        if (sectioned) {
            // Use forward_fill on the section column: fill empty cells with the
            // previous non-empty value.  This propagates "CONSTRUCTION" down to
            // all items until "CONTAINERS" appears.
            operations.push({
                id: 'carry-forward-section-label',
                type: 'fill_missing',
                column: sectioned.sectionColumn,
                strategy: 'forward_fill',
                reason: `Carry forward section labels from group header rows in column "${sectioned.sectionColumn}" (detected ${sectioned.entries.length} sections: ${sectioned.entries.map(e => e.label).slice(0, 5).join(', ')}${sectioned.entries.length > 5 ? '...' : ''}).`,
            });
        }
    }

    // ── Drop noise rows ──
    const dropIndexes = inspection.rows
        .filter(row => {
            if (row.rowRole === 'blank') return true;
            if (row.rowRole === 'summary_like' && row.confidence >= 0.7) return true;
            if (row.signals.repeatedHeaderEcho || row.signals.singletonLongTextNoise) return true;
            if (!options?.allowGroupAndNoteDrop) return false;
            return (row.rowRole === 'group_header' || row.rowRole === 'note') && row.confidence >= 0.78;
        })
        .map(row => row.rowIndex)
        .sort((left, right) => left - right);

    if (dropIndexes.length > 0) {
        operations.push({
            id: 'drop-inspected-noise-rows',
            type: 'drop_rows_by_index',
            reason: 'Remove rows classified as summary-like, blank, or report-noise after row inspection.',
            indices: dropIndexes,
        });
    } else if (inspection.countsByRole.blank > 0) {
        operations.push({
            id: 'drop-inspected-blank-rows',
            type: 'drop_blank_rows',
            reason: 'Remove remaining fully blank rows after row inspection.',
        });
    }
    return operations;
};

export const summarizeRowInspection = (inspection: RowInspectionBundle) => {
    const counts = inspection.countsByRole;
    return [
        `rows=${inspection.inspectedRowCount}/${inspection.totalRows}`,
        `detail=${counts.detail}`,
        `summary_like=${counts.summary_like}`,
        `group_header=${counts.group_header}`,
        `note=${counts.note}`,
        `blank=${counts.blank}`,
        `unknown=${counts.unknown}`,
    ].join(', ');
};
