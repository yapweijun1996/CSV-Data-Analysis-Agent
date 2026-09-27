import type {
    ReportBoundary,
    ReportNormalizationPlan,
    ReportRowRole,
    ReportRowRoleAssignment,
    ReportStructureProposal,
} from '../../types';
import {
    inferCarryForwardColumns as classifierInferCarryForward,
    inferSectionLabelColumns as classifierInferSectionLabel,
    inferFactColumns as classifierInferFact,
    computeColumnStatistics,
} from './columnRoleClassifier';

const UNNAMED_COLUMN_PREFIX = '_unnamed_column_';
const UNNAMED_COLUMN_PATTERN = /^_?unnamed_column_/i;

export const normalizeReportCellText = (value: unknown): string =>
    String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const uniqueNonEmpty = (values: string[]) => {
    const seen = new Set<string>();
    const deduped: string[] = [];
    values.forEach(value => {
        const normalized = normalizeReportCellText(value);
        if (!normalized) {
            return;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        deduped.push(normalized);
    });
    return deduped;
};

const sanitizeHeaderName = (rawHeader: string, index: number, seen: Map<string, number>) => {
    const candidate = normalizeReportCellText(rawHeader) || `${UNNAMED_COLUMN_PREFIX}${index + 1}`;
    const baseKey = candidate.toLowerCase();
    const count = seen.get(baseKey) ?? 0;
    seen.set(baseKey, count + 1);
    return count > 0 ? `${candidate}_${count + 1}` : candidate;
};

const buildHeaderKey = (header: string) =>
    normalizeReportCellText(header)
        .toLowerCase()
        .replace(/[_:/()]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const forwardFillHeaderRow = (row: string[] | undefined, columnCount: number): string[] => {
    const filled: string[] = [];
    let last = '';
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const raw = String(row?.[columnIndex] ?? '').trim();
        if (raw) {
            last = raw;
            filled.push(raw);
        } else {
            filled.push(last);
        }
    }
    return filled;
};

const lastNonBlankIndex = (row: string[] | undefined): number => {
    if (!row) return -1;
    for (let index = row.length - 1; index >= 0; index -= 1) {
        if (String(row[index] ?? '').trim()) return index;
    }
    return -1;
};

export const buildMergedBoundaryHeaders = (
    rawRows: string[][],
    boundary: Pick<ReportBoundary, 'headerRowIndex' | 'headerLayerRowIndexes'>,
): string[] => {
    const headerIndexes = Array.from(new Set([
        boundary.headerRowIndex,
        ...boundary.headerLayerRowIndexes,
    ].filter((value): value is number => Number.isInteger(value) && value >= 0))).sort((left, right) => left - right);
    if (headerIndexes.length === 0) {
        return [];
    }

    // Content width, not raw row.length: a single anomalous row elsewhere in
    // the file (e.g. a malformed trailing blank line padded out to hundreds
    // of columns) can inflate every row's length during intake-wide column
    // normalization, including the header rows'. Using that inflated length
    // here would let forward-fill (below) treat the padding as more merged-
    // cell span and smear the last real band label across it. The true
    // column count is the furthest a REAL value appears in any header row.
    const columnCount = headerIndexes.reduce((max, rowIndex) => Math.max(max, lastNonBlankIndex(rawRows[rowIndex]) + 1), 0);
    const seen = new Map<string, number>();
    // Spanning band labels (a merged cell in the source spreadsheet, e.g. a
    // "Year To Date" band over 3 sub-metric columns) are written once at the
    // leftmost column of their span and blank elsewhere once exported to CSV.
    // Forward-fill every OUTER header row (all but the deepest/leaf row) so
    // the band label reaches every column beneath it. The leaf row is read
    // as-is: a genuinely blank leaf cell (an unlabeled spacer column) must
    // stay blank rather than inherit a neighboring label.
    const rowValues = headerIndexes.map((rowIndex, layerIndex) => (
        layerIndex < headerIndexes.length - 1
            ? forwardFillHeaderRow(rawRows[rowIndex], columnCount)
            : Array.from({ length: columnCount }, (_, columnIndex) => String(rawRows[rowIndex]?.[columnIndex] ?? ''))
    ));

    // Some spreadsheet exports compact an outer band row by omitting the
    // blank cells that would normally encode each merged-cell span. In that
    // shape, positional forward-fill is provably unsafe: the outer row ends
    // several columns before a dense leaf row and its own occupied cells are
    // packed together rather than separated by span blanks. Preserve the
    // complete leaf schema instead of inventing misaligned band ownership.
    const leafRow = rawRows[headerIndexes[headerIndexes.length - 1]] ?? [];
    const outerRow = headerIndexes.length === 2 ? rawRows[headerIndexes[0]] ?? [] : null;
    const leafWidth = lastNonBlankIndex(leafRow) + 1;
    const outerWidth = lastNonBlankIndex(outerRow ?? undefined) + 1;
    const leafNonEmptyCount = leafRow.slice(0, leafWidth).filter(value => normalizeReportCellText(value)).length;
    const leafDistinctCount = new Set(
        leafRow.slice(0, leafWidth).map(value => normalizeReportCellText(value)).filter(Boolean),
    ).size;
    const outerNonEmptyCount = (outerRow ?? []).slice(0, outerWidth).filter(value => normalizeReportCellText(value)).length;
    const compactedOuterHeader = Boolean(
        outerRow
        && outerWidth >= 4
        && leafWidth >= outerWidth + 3
        && leafNonEmptyCount / Math.max(leafWidth, 1) >= 0.8
        && leafDistinctCount / Math.max(leafNonEmptyCount, 1) >= 0.65
        && outerNonEmptyCount / Math.max(outerWidth, 1) >= 0.7,
    );

    if (compactedOuterHeader) {
        return Array.from({ length: columnCount }, (_, columnIndex) => (
            sanitizeHeaderName(String(leafRow[columnIndex] ?? ''), columnIndex, seen)
        ));
    }

    return Array.from({ length: columnCount }, (_, columnIndex) => {
        const merged = uniqueNonEmpty(
            rowValues.map(row => row[columnIndex] ?? ''),
        ).join(' :: ');
        return sanitizeHeaderName(merged, columnIndex, seen);
    });
};

const resolveHeaderName = (candidate: string, headers: string[]): string | null => {
    const normalizedCandidate = buildHeaderKey(candidate);
    if (!normalizedCandidate) {
        return null;
    }
    const exact = headers.find(header => buildHeaderKey(header) === normalizedCandidate);
    return exact ?? null;
};

// Column role inference delegates to unified classifier (columnRoleClassifier.ts).
export const inferCarryForwardColumns = classifierInferCarryForward;
export const inferSectionLabelColumns = classifierInferSectionLabel;
export const inferFactColumns = classifierInferFact;

// Matches the taxonomy's own F2 definition ("month/quarter/week/project
// code/year-over-year"): month names (full or abbreviated, optionally with
// a year), quarter labels, week labels (allowing the "WEEK - 1" spacing
// some exports use), an ISO year-month, or a bare year.
const CALENDAR_PERIOD_BAND_PATTERN = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(?:q[1-4]|[1234](?:st|nd|rd|th)\s*qtr|qtr\s*[1-4]|quarter\s*[1-4])\b|\bweek\b[\s-]*\d+\b|\b\d{4}[-/]\d{2}\b|^\d{4}$/i;

/**
 * Structural signal for whether a multi-layer header repeats an actual
 * calendar/period dimension (the taxonomy's F2 shape) as opposed to two or
 * more generic comparison-window labels ("Year To Date" vs "Monthly
 * Record", "Current Period" vs "Year To Date") that merely group a handful
 * of distinct metrics side by side. Which header row carries the period
 * token varies by report layout — some put the month name on the outer/
 * coarser row spanning several metrics, others put the category name outer
 * and the month name on the inner/leaf row — so every header row is
 * checked, not just the outer ones.
 *
 * Requires at least 3 DISTINCT matching labels, not just one: a genuinely
 * repeating axis (12 months, 9 months, 5 weeks) always clears this by a
 * wide margin, but a report that merely has one or two isolated date-like
 * cells among otherwise non-periodic band labels (e.g. a single "Apr 2025"
 * / "Jan 2025" column pair under "Variance"/"Additional" bands) is not a
 * repeating dimension and must not be treated as one — a single match here
 * previously forced melt-shape routing on such files even when they were
 * structurally a flat row table.
 */
export const hasCalendarPeriodBandPattern = (
    rawRows: string[][],
    headerRowIndex: number | null,
    headerLayerRowIndexes: number[],
): boolean => {
    const allRowIndexes = [headerRowIndex, ...headerLayerRowIndexes]
        .filter((value): value is number => Number.isInteger(value) && value >= 0)
        .sort((left, right) => left - right);
    if (allRowIndexes.length < 2) {
        return false;
    }
    const labels = allRowIndexes.flatMap(rowIndex => (
        (rawRows[rowIndex] ?? []).map(cell => String(cell ?? '').trim()).filter(Boolean)
    ));
    const distinctMatches = new Set(
        labels.filter(label => CALENDAR_PERIOD_BAND_PATTERN.test(label)).map(label => label.toLowerCase()),
    );
    return distinctMatches.size >= 3;
};

/**
 * Structural signal for whether a multi-layer header has a row shaped like a
 * generic 1-or-2-way comparison window (e.g. "Year To Date" vs "Monthly
 * Record", "Current Period" vs "Year To Date") rather than a genuinely
 * enumerable repeating dimension (12 months, 5 weeks, dozens of project
 * codes). Only counts values that visibly SPAN more than one column — i.e.
 * a non-blank cell immediately followed by one or more blanks, the CSV
 * export shape of a merged header cell — so one-off single-column labels
 * (e.g. "CUSTOMER NAME", "TOTAL") never inflate the count: they carry their
 * own column, not a repeating axis. A row with 1-2 distinct spanning values
 * is comparison-window-shaped; 0 spans (every band is its own single
 * column, e.g. a project-code axis with no sub-metric split) or 3+ distinct
 * spanning values both indicate a genuine wide dimension.
 */
export const hasNarrowComparisonWindowBandRow = (
    rawRows: string[][],
    headerRowIndex: number | null,
    headerLayerRowIndexes: number[],
): boolean => {
    const allRowIndexes = [headerRowIndex, ...headerLayerRowIndexes]
        .filter((value): value is number => Number.isInteger(value) && value >= 0)
        .sort((left, right) => left - right);
    if (allRowIndexes.length < 2) {
        return false;
    }
    return allRowIndexes.some(rowIndex => {
        const values = (rawRows[rowIndex] ?? []).map(cell => String(cell ?? '').trim());
        let lastNonBlankIndex = -1;
        for (let index = values.length - 1; index >= 0; index -= 1) {
            if (values[index]) {
                lastNonBlankIndex = index;
                break;
            }
        }
        // Only count blanks BEFORE the row's last real value as a span — a
        // single trailing blank column (CSV width padding) must never make
        // the row's final label look like a 1-column "span" of itself.
        const spanningValues = new Set<string>();
        for (let columnIndex = 0; columnIndex < lastNonBlankIndex; columnIndex += 1) {
            const value = values[columnIndex];
            if (value && !values[columnIndex + 1]) {
                spanningValues.add(value.toLowerCase());
            }
        }
        return spanningValues.size >= 1 && spanningValues.size <= 2;
    });
};

/**
 * Data-driven row-table shape inference. Determines whether the dataset
 * is a row-oriented table (descriptor + measure columns) vs a wide/crosstab
 * table (measures spread across column series).
 *
 * When raw rows are available, uses actual numeric density per column.
 * Falls back to structural header analysis (count short alphanumeric codes).
 */
export const inferRowTableShapeFromHeaders = (
    headers: string[],
    rawRows?: string[][],
    bodyStart?: number,
    summaryStart?: number,
): boolean => {
    if (headers.length === 0) {
        return true;
    }

    // Data-driven approach: count numeric-dominant vs text-dominant columns.
    // Sparse columns (low fill rate in sample) are counted as text-dominant
    // because they indicate grouping/carry-forward dimensions in hierarchical
    // reports, not numeric measures.
    if (rawRows && bodyStart != null) {
        const end = summaryStart ?? rawRows.length;
        const sampleRows = rawRows.slice(bodyStart, Math.min(end, bodyStart + 20));
        if (sampleRows.length >= 2) {
            let numericDominantCount = 0;
            let textDominantCount = 0;
            for (let colIdx = 0; colIdx < headers.length; colIdx++) {
                if (UNNAMED_COLUMN_PATTERN.test(headers[colIdx])) continue;
                const stats = computeColumnStatistics(headers[colIdx], colIdx, sampleRows);
                if (stats.nonEmptyCount === 0) continue;
                if (stats.fillRate < 0.3) {
                    textDominantCount++;
                    continue;
                }
                if (stats.numericRatio > 0.6) numericDominantCount++;
                else if (stats.numericRatio < 0.3) textDominantCount++;
            }
            const totalMeaningful = numericDominantCount + textDominantCount;
            if (totalMeaningful >= 3) {
                // Wide/crosstab: > 70% numeric-dominant columns
                return numericDominantCount / totalMeaningful < 0.7;
            }
        }
    }

    // Header-only structural fallback: count short alphanumeric codes
    // that look like series keys (e.g., "FY2024", "Q1", "PRJ-01").
    const seriesLikeHeaders = headers.filter(header => {
        const normalized = normalizeReportCellText(header);
        if (!normalized || normalized.length > 12) return false;
        // Structural: short code with mixed letters and digits
        return /^[A-Za-z]{1,4}\d{1,6}$/.test(normalized)
            || /^[A-Za-z]{2,3}$/i.test(normalized);
    });
    return seriesLikeHeaders.length < Math.max(2, Math.floor(headers.length * 0.4));
};

const sanitizeProposalRoles = (roles: ReportRowRole[] | null | undefined): ReportRowRole[] => {
    const allowed = new Set<ReportRowRole>(['detail']);
    const deduped = Array.from(new Set((roles ?? []).filter(role => allowed.has(role))));
    return deduped.length > 0 ? deduped : ['detail'];
};

export const buildDeterministicNormalizationPlan = (params: {
    rawRows: string[][];
    boundary: ReportBoundary;
    source: 'intake_provisional' | 'runtime_resolved' | 'human_confirmed' | 'ai_confirmed';
    structureProposal?: ReportStructureProposal | null;
}): {
    plan: ReportNormalizationPlan;
    proposalAccepted: boolean;
    warnings: string[];
} => {
    const mergedHeaders = buildMergedBoundaryHeaders(params.rawRows, params.boundary);
    const bodyStart = params.boundary.bodyStartIndex ?? 0;
    const summaryStart = params.boundary.summaryStartIndex ?? params.rawRows.length;
    const warnings: string[] = [];

    // Data-driven column role inference (replaces hardcoded regex patterns).
    // Uses actual body row data to detect fill-down patterns, text density,
    // and numeric density — domain-agnostic.
    const deterministicCarryForward = inferCarryForwardColumns(mergedHeaders, params.rawRows, bodyStart, summaryStart);
    const deterministicSectionLabels = inferSectionLabelColumns(mergedHeaders, deterministicCarryForward, params.rawRows, bodyStart, summaryStart);

    // AI proposals are accepted when they resolve to actual headers — no regex
    // filter gate. The AI drives column classification; data-driven inference
    // provides the deterministic floor.
    const proposalCarryForward = (params.structureProposal?.carryForwardColumns ?? [])
        .map(column => resolveHeaderName(column, mergedHeaders))
        .filter((column): column is string => Boolean(column));
    const aiOnlyCarryForward = proposalCarryForward.filter(column => !deterministicCarryForward.includes(column));
    if (aiOnlyCarryForward.length > 0) {
        warnings.push('ai_only_carry_forward_columns');
    }

    const carryForwardColumns = Array.from(new Set([
        ...deterministicCarryForward,
        ...proposalCarryForward,
    ])).map(columnName => ({
        columnName,
        source: proposalCarryForward.includes(columnName)
            ? 'ai'
            : (params.source === 'human_confirmed' || params.source === 'ai_confirmed')
                ? 'human'
                : 'deterministic',
        reason: proposalCarryForward.includes(columnName)
            ? 'Accepted from AI proposal (column resolved to actual header).'
            : 'Data-driven fill-pattern analysis detected carry-forward dimension.',
    })) satisfies ReportNormalizationPlan['carryForwardColumns'];

    const carryForwardColumnNames = carryForwardColumns.map(policy => policy.columnName);
    const proposalSectionLabels = (params.structureProposal?.sectionLabelColumns ?? [])
        .map(column => resolveHeaderName(column, mergedHeaders))
        .filter((column): column is string => Boolean(column))
        .filter(column => !carryForwardColumnNames.includes(column));
    const sectionLabelColumns = Array.from(new Set([
        ...deterministicSectionLabels,
        ...proposalSectionLabels,
    ]));
    const detailInclusionRoles = sanitizeProposalRoles(params.structureProposal?.detailInclusionRoles);

    const rawRowRoleOverrides: ReportRowRoleAssignment[] = (params.structureProposal?.bodyRowRoles ?? [])
        .filter(candidate => candidate.rowIndex >= bodyStart && candidate.rowIndex < summaryStart)
        .map(candidate => ({
            rowIndex: candidate.rowIndex,
            dataset: 'raw' as const,
            role: candidate.role,
            confidence: candidate.confidence,
            source: 'ai' as const,
            notes: candidate.notes,
        }))
        .filter(candidate => candidate.role !== 'detail' || detailInclusionRoles.includes('detail'));

    if (params.structureProposal && proposalCarryForward.length === 0 && (params.structureProposal.carryForwardColumns?.length ?? 0) > 0) {
        warnings.push('ai_carry_forward_columns_rejected');
    }
    if (params.structureProposal && proposalSectionLabels.length === 0 && (params.structureProposal.sectionLabelColumns?.length ?? 0) > 0) {
        warnings.push('ai_section_label_columns_rejected');
    }

    return {
        plan: {
            mergedHeaders,
            carryForwardColumns,
            sectionLabelColumns,
            detailInclusionRoles,
            excludedRoles: ['blank', 'header', 'summary', 'footer', 'group_header', 'note', 'subtotal'],
            rawRowRoleOverrides,
        },
        proposalAccepted: Boolean(
            params.structureProposal
            && (proposalCarryForward.length > 0
                || proposalSectionLabels.length > 0
                || rawRowRoleOverrides.length > 0),
        ),
        warnings,
    };
};
