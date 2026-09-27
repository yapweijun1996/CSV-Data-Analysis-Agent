// ---------------------------------------------------------------------------
// Unified Column Role Classifier
//
// Single-pass column statistics + priority-based role classification:
//   AI annotation → data-driven signals → structural header hints.
//
// Consolidates logic previously spread across reportStructureNormalization.ts
// (carry-forward / section-label / fact inference) and reportShapeTabular.ts
// (getColumnStats for value/descriptor detection).
// ---------------------------------------------------------------------------

import { isCodeLike, isNumericLike } from './reportShapeUtils';

const UNNAMED_COLUMN_PATTERN = /^_?unnamed_column_/i;
const DATE_LIKE_PATTERN = /^(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})$/;

// Inline to avoid circular dependency with reportStructureNormalization.
const normalizeCell = (value: unknown): string =>
    String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

// Structural numeric test — domain-agnostic (mirrors reportStructureNormalization).
const isNumericCandidate = (value: string) => {
    if (DATE_LIKE_PATTERN.test(value.trim())) {
        return false;
    }
    const cleaned = value.replace(/[^0-9.\-]/g, '').trim();
    return Boolean(cleaned) && cleaned !== '-' && cleaned !== '.' && Number.isFinite(Number.parseFloat(cleaned));
};

// --- Types ---

export type ColumnRole = 'fact' | 'carryForward' | 'sectionLabel' | 'descriptor' | 'unknown';

export interface ColumnStatistics {
    column: string;
    columnIndex: number;
    nonEmptyCount: number;
    sampleSize: number;
    fillRate: number;
    // numericRatio: lenient (strips formatting chars) — for raw report data.
    numericRatio: number;
    // strictNumericRatio: exact format match /^-?\d[\d,]*(?:\.\d+)?$/ — for parsed CsvData.
    strictNumericRatio: number;
    softNumericRatio: number;
    textualRatio: number;
    // lenientTextualRatio: /[A-Za-z]/ && NOT isNumericCandidate — for normalization.
    // More conservative: "ABC-123" strips to parseable → excluded from textual count.
    lenientTextualRatio: number;
    codeLikeDensity: number;
    structuralIdentifierHint: boolean;
    blankRatio: number;
    blankRunCount: number;
    avgBlankRunLength: number;
    distinctCount: number;
    cardinalityRatio: number;
}

export interface ColumnRoleClassification {
    column: string;
    role: ColumnRole;
    confidence: number;
    source: 'ai_annotation' | 'data_driven' | 'structural_hint';
}

// --- Core: single-pass column statistics ---

export const computeColumnStatistics = (
    column: string,
    columnIndex: number,
    bodyRows: string[][],
): ColumnStatistics => {
    const sampleSize = bodyRows.length;
    if (sampleSize === 0) {
        return {
            column, columnIndex, nonEmptyCount: 0, sampleSize: 0, fillRate: 0,
            numericRatio: 0, strictNumericRatio: 0, softNumericRatio: 0,
            textualRatio: 0, lenientTextualRatio: 0, codeLikeDensity: 0,
            structuralIdentifierHint: false, blankRatio: 1, blankRunCount: 0,
            avgBlankRunLength: 0, distinctCount: 0, cardinalityRatio: 0,
        };
    }

    let nonEmptyCount = 0;
    let numericCount = 0;
    let strictNumericCount = 0;
    let softNumericCount = 0;
    let textualCount = 0;
    let lenientTextualCount = 0;
    let codeLikeCount = 0;
    let blankRunCount = 0;
    let prevNonBlank = false;
    const distinctSet = new Set<string>();

    for (const row of bodyRows) {
        const raw = normalizeCell(row[columnIndex] ?? '');
        if (!raw) {
            if (prevNonBlank) blankRunCount++;
            prevNonBlank = false;
            continue;
        }
        nonEmptyCount++;
        prevNonBlank = true;
        distinctSet.add(raw.toLowerCase());

        const lenientNumeric = isNumericCandidate(raw);
        const strictNumeric = isNumericLike(raw);
        if (lenientNumeric) numericCount++;
        if (strictNumeric) strictNumericCount++;
        // softNumericRatio uses strict test: exact format match + dashes + N/A.
        // isNumericCandidate is too lenient for parsed CsvData (e.g., "Region_0"
        // strips letters → "0" → parses as numeric).
        if (strictNumeric || /^[-—–]$/.test(raw) || /^[nN]\/?[aA]$/.test(raw)) softNumericCount++;
        if (/[A-Za-z]/.test(raw) && !strictNumeric) textualCount++;
        if (/[A-Za-z]/.test(raw) && !lenientNumeric) lenientTextualCount++;
        if (isCodeLike(raw) && !strictNumeric) codeLikeCount++;
    }

    const totalBlanks = sampleSize - nonEmptyCount;
    const structuralIdentifierHint = /\b(?:code|id)\b/i.test(column);

    return {
        column,
        columnIndex,
        nonEmptyCount,
        sampleSize,
        fillRate: nonEmptyCount / sampleSize,
        numericRatio: nonEmptyCount > 0 ? numericCount / nonEmptyCount : 0,
        strictNumericRatio: nonEmptyCount > 0 ? strictNumericCount / nonEmptyCount : 0,
        softNumericRatio: nonEmptyCount > 0 ? softNumericCount / nonEmptyCount : 0,
        textualRatio: nonEmptyCount > 0 ? textualCount / nonEmptyCount : 0,
        lenientTextualRatio: nonEmptyCount > 0 ? lenientTextualCount / nonEmptyCount : 0,
        codeLikeDensity: nonEmptyCount > 0 ? codeLikeCount / nonEmptyCount : 0,
        structuralIdentifierHint,
        blankRatio: totalBlanks / sampleSize,
        blankRunCount,
        avgBlankRunLength: totalBlanks / Math.max(blankRunCount, 1),
        distinctCount: distinctSet.size,
        cardinalityRatio: nonEmptyCount > 0 ? distinctSet.size / nonEmptyCount : 0,
    };
};

// --- Role classification from statistics ---

// Blank-run pattern only (no numeric filter). Numeric check is applied
// separately with a small sample because carry-forward columns may contain
// numeric-looking values (invoice IDs, dates) in a sparse fill-down pattern.
const isCarryForwardPattern = (stats: ColumnStatistics): boolean =>
    stats.nonEmptyCount >= 2
    && stats.blankRatio >= 0.3
    && stats.blankRunCount >= 2
    && stats.avgBlankRunLength >= 2;

// Full carry-forward check with sample-based numeric filter.
const isCarryForwardWithSampleCheck = (
    fullStats: ColumnStatistics,
    sampleStats: ColumnStatistics,
): boolean =>
    isCarryForwardPattern(fullStats)
    && !(sampleStats.nonEmptyCount >= 4 && sampleStats.numericRatio > 0.5);

// Uses lenientTextualRatio (conservative textual count matching old behavior)
// to avoid false positives from values like "ABC-123" that strip to parseable numbers.
// Absolute minimum threshold (distinctCount < 10) prevents sparse columns with few
// non-empty values from being rejected by high cardinalityRatio alone — e.g., a
// section label column with 7 unique values in 50 rows has cardinalityRatio 1.0 but
// should still qualify as a section label.
const isSectionLabel = (stats: ColumnStatistics): boolean =>
    stats.nonEmptyCount >= 2
    && stats.lenientTextualRatio > 0.6
    && (stats.cardinalityRatio < 0.6 || stats.distinctCount < 10);

// A "*Code*"/"*ID*"-named column (structuralIdentifierHint) is structurally
// an identifier regardless of how numeric-looking its values are — a WBS
// item code like "1.07"/"14.16" has high numericRatio but is never a summable
// fact, and misclassifying it as one lets its own value satisfy a downstream
// "has a non-zero fact" check for every row (including section-header rows
// that carry no real fact values at all), making role classification blind
// to the actual data. Column ROLE from naming beats value SHAPE — the same
// principle already applied to identity-text counting elsewhere.
const isFact = (stats: ColumnStatistics): boolean =>
    stats.nonEmptyCount >= 2
    && stats.numericRatio > 0.5
    && stats.textualRatio < 0.3
    && !stats.structuralIdentifierHint;

// --- Unified classifier ---

export const classifyAllColumnRoles = (params: {
    headers: string[];
    rawRows: string[][];
    bodyStart: number;
    summaryStart: number;
    aiAnnotations?: Map<string, ColumnRole>;
}): ColumnRoleClassification[] => {
    const { headers, rawRows, bodyStart, summaryStart, aiAnnotations } = params;
    const bodyRows = rawRows.slice(bodyStart, summaryStart);
    if (bodyRows.length === 0) {
        return headers.map(column => ({ column, role: 'unknown' as ColumnRole, confidence: 0, source: 'data_driven' as const }));
    }

    const sampleRows = bodyRows.slice(0, 20);
    const allStats = headers.map((column, index) =>
        UNNAMED_COLUMN_PATTERN.test(column)
            ? null
            : computeColumnStatistics(column, index, bodyRows),
    );
    // Small sample stats for carry-forward numeric check: avoids rejecting
    // sparse columns with numeric-looking IDs (invoice numbers, dates).
    const allSampleStats = headers.map((column, index) =>
        UNNAMED_COLUMN_PATTERN.test(column)
            ? null
            : computeColumnStatistics(column, index, sampleRows),
    );

    const carryForwardSet = new Set<string>();
    const sectionLabelSet = new Set<string>();
    const factSet = new Set<string>();

    return headers.map((column, index) => {
        // Priority 1: AI annotation override.
        if (aiAnnotations?.has(column)) {
            const role = aiAnnotations.get(column)!;
            if (role === 'carryForward') carryForwardSet.add(column);
            if (role === 'sectionLabel') sectionLabelSet.add(column);
            if (role === 'fact') factSet.add(column);
            return { column, role, confidence: 0.98, source: 'ai_annotation' as const };
        }

        const stats = allStats[index];
        const sampleStats = allSampleStats[index];
        if (!stats || !sampleStats) {
            return { column, role: 'unknown' as ColumnRole, confidence: 0, source: 'data_driven' as const };
        }

        // Priority 2: carry-forward (blank-run pattern + sample numeric check).
        if (!carryForwardSet.has(column) && isCarryForwardWithSampleCheck(stats, sampleStats)) {
            carryForwardSet.add(column);
            return { column, role: 'carryForward' as ColumnRole, confidence: 0.88, source: 'data_driven' as const };
        }

        // Priority 3: section label (text-dominant, low cardinality, not already classified).
        if (!carryForwardSet.has(column) && !sectionLabelSet.has(column) && isSectionLabel(stats)) {
            sectionLabelSet.add(column);
            return { column, role: 'sectionLabel' as ColumnRole, confidence: 0.84, source: 'data_driven' as const };
        }

        // Priority 4: fact (numeric-dominant, not carry-forward/section-label).
        if (!carryForwardSet.has(column) && !sectionLabelSet.has(column) && isFact(stats)) {
            factSet.add(column);
            return { column, role: 'fact' as ColumnRole, confidence: 0.86, source: 'data_driven' as const };
        }

        // Priority 5: descriptor (text/code signals, not classified above).
        if (stats.textualRatio >= 0.4 || stats.codeLikeDensity >= 0.3 || stats.structuralIdentifierHint) {
            return { column, role: 'descriptor' as ColumnRole, confidence: 0.78, source: 'structural_hint' as const };
        }

        return { column, role: 'unknown' as ColumnRole, confidence: 0.5, source: 'data_driven' as const };
    });
};

// --- Convenience wrappers (backward-compatible public API) ---

export const inferCarryForwardColumns = (
    headers: string[],
    rawRows?: string[][],
    bodyStart?: number,
    summaryStart?: number,
): string[] => {
    if (!rawRows || bodyStart == null) return [];
    const bodyRows = rawRows.slice(bodyStart, summaryStart ?? rawRows.length);
    if (bodyRows.length < 4) return [];
    const sampleRows = bodyRows.slice(0, 20);
    return headers.filter((column, index) => {
        if (UNNAMED_COLUMN_PATTERN.test(column)) return false;
        const stats = computeColumnStatistics(column, index, bodyRows);
        const sampleStats = computeColumnStatistics(column, index, sampleRows);
        return isCarryForwardWithSampleCheck(stats, sampleStats);
    });
};

export const inferSectionLabelColumns = (
    headers: string[],
    carryForwardColumns: string[],
    rawRows?: string[][],
    bodyStart?: number,
    summaryStart?: number,
): string[] => {
    if (!rawRows || bodyStart == null) return [];
    const bodyRows = rawRows.slice(bodyStart, Math.min(summaryStart ?? rawRows.length, bodyStart + 50));
    if (bodyRows.length < 2) return [];
    const excluded = new Set(carryForwardColumns);
    return headers.filter((column, index) => {
        if (excluded.has(column)) return false;
        if (UNNAMED_COLUMN_PATTERN.test(column)) return false;
        const stats = computeColumnStatistics(column, index, bodyRows);
        return isSectionLabel(stats);
    });
};

export const inferFactColumns = (
    headers: string[],
    excludedColumns: string[],
    rawRows?: string[][],
    bodyStart?: number,
    summaryStart?: number,
): string[] => {
    if (!rawRows || bodyStart == null) return [];
    const bodyRows = rawRows.slice(bodyStart, Math.min(summaryStart ?? rawRows.length, bodyStart + 20));
    if (bodyRows.length === 0) return [];
    const excluded = new Set(excludedColumns);
    return headers.filter((column, index) => {
        if (excluded.has(column)) return false;
        if (UNNAMED_COLUMN_PATTERN.test(column)) return false;
        const stats = computeColumnStatistics(column, index, bodyRows);
        return isFact(stats);
    });
};
