/**
 * Structural row role signals — data-driven replacements for domain-specific
 * regex patterns (SUMMARY_TOKEN_PATTERN, SUBTOTAL_ROW_PATTERN, etc.).
 *
 * Decision priority: AI annotation → structural signals → regex fallback.
 * These signals form the "structural signals" tier.
 */

// ---------------------------------------------------------------------------
// Signal types
// ---------------------------------------------------------------------------

export interface RowSumVerificationSignal {
    rowIndex: number;
    /** Whether this row's numeric values match the running sum of preceding detail rows. */
    isSumMatch: boolean;
    /** 1.0 = exact match across all compared columns, 0.0 = no match. */
    sumMatchConfidence: number;
    /** Which fact columns matched within tolerance. */
    matchedColumns: string[];
    /** 'section_subtotal' resets at section breaks; 'grand_total' spans all preceding detail. */
    sumMatchType: 'section_subtotal' | 'grand_total' | 'none';
}

export interface RowSparsitySignal {
    rowIndex: number;
    /** Descriptor columns empty while fact columns are populated. */
    descriptorEmpty: boolean;
    /** How many fact columns have a numeric value. */
    factColumnsPopulated: number;
    /** Single cell with ≥ 24 chars, rest of the row empty. */
    isSingletonLongText: boolean;
    /** Row is in first or last 15 % of the total row range. */
    isDocumentEdge: boolean;
    edgePosition: 'head' | 'tail' | 'interior';
}

export interface RowPositionSignal {
    rowIndex: number;
    /** Followed by blank row, section break, or end of data. */
    isLastInSection: boolean;
    /** How many detail-classified rows precede this one in the current section. */
    precedingDetailCount: number;
    /** Next row is blank, a group header break, or end of data. */
    followedByGap: boolean;
}

export interface RowRoleSignalBundle {
    sumVerification: RowSumVerificationSignal;
    sparsity: RowSparsitySignal;
    position: RowPositionSignal;
}

// ---------------------------------------------------------------------------
// Numeric helpers (self-contained — no external imports needed)
// ---------------------------------------------------------------------------

const parseNumeric = (value: unknown): number | null => {
    const str = String(value ?? '').trim();
    if (!str) return null;
    const cleaned = str.replace(/[^0-9.\-]/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
};

const isBlankValue = (value: unknown): boolean => String(value ?? '').trim() === '';

const NON_ADDITIVE_FACT_COLUMN_PATTERN = /(?:rate|ratio|average|\bavg\b|percent|%|\bctr\b|\bcpc\b|\bcpm\b|cost\s+per)/i;

const withinTolerance = (a: number, b: number): boolean => {
    if (a === 0 && b === 0) return true;
    const absDiff = Math.abs(a - b);
    if (absDiff <= 0.01) return true;
    const relDenom = Math.max(Math.abs(a), Math.abs(b));
    return relDenom > 0 && absDiff / relDenom <= 0.001;
};

const passesNonZeroSumEvidenceGate = (input: {
    comparedCount: number;
    matchCount: number;
    nonZeroComparedCount: number;
    nonZeroMatchCount: number;
}): boolean => {
    if (input.nonZeroComparedCount >= 2) {
        return input.nonZeroMatchCount >= 2
            && input.nonZeroMatchCount / input.nonZeroComparedCount >= 0.6;
    }

    if (input.nonZeroComparedCount === 0) {
        return input.comparedCount >= 2 && input.matchCount === input.comparedCount;
    }

    return false;
};

const detectLeadingAggregateRow = (
    rows: Record<string, unknown>[],
    factColumns: string[],
    descriptorColumns: string[],
): { confidence: number; matchedColumns: string[] } | null => {
    if (rows.length < 4) return null;

    const candidate = rows[0];
    if (descriptorColumns.length === 0) return null;
    // A leading summary may still repeat report context (for example a reporting
    // date range) and use numeric zero as an ID/status placeholder. Treat a
    // descriptor as a genuine row identity only when the candidate has a
    // non-zero value that distinguishes it from a varied detail population.
    // This blocks an ordinary first record such as Name=A while allowing a
    // period-level aggregate followed by campaign/ad detail.
    const hasDistinctBusinessIdentity = descriptorColumns.some(column => {
        const candidateText = String(candidate[column] ?? '').trim();
        if (!candidateText) return false;
        const candidateNumber = parseNumeric(candidateText);
        if (candidateNumber !== null && Math.abs(candidateNumber) <= 0.000001) return false;

        const detailTexts = rows.slice(1)
            .map(row => String(row[column] ?? '').trim())
            .filter(Boolean);
        if (detailTexts.length < 2) return false;
        const distinctDetailValues = new Set(detailTexts);
        if (distinctDetailValues.size < 2) return false;
        const candidateFrequency = detailTexts.filter(value => value === candidateText).length / detailTexts.length;
        return candidateFrequency <= 0.2;
    });
    if (hasDistinctBusinessIdentity) {
        return null;
    }
    const detailRows = rows.slice(1);
    const summableColumns = factColumns.filter(column => !NON_ADDITIVE_FACT_COLUMN_PATTERN.test(column));
    let comparedCount = 0;
    const matchedColumns: string[] = [];

    for (const column of summableColumns) {
        const candidateValue = parseNumeric(candidate[column]);
        if (candidateValue === null || Math.abs(candidateValue) <= 0.000001) continue;

        const detailValues = detailRows
            .map(row => parseNumeric(row[column]))
            .filter((value): value is number => value !== null);
        if (detailValues.length < 2) continue;

        comparedCount++;
        const detailSum = detailValues.reduce((sum, value) => sum + value, 0);
        if (withinTolerance(candidateValue, detailSum)) {
            matchedColumns.push(column);
        }
    }

    if (
        matchedColumns.length < 3
        || comparedCount < 3
        || matchedColumns.length / comparedCount < 0.6
    ) {
        return null;
    }

    return {
        confidence: matchedColumns.length / comparedCount,
        matchedColumns,
    };
};

// ---------------------------------------------------------------------------
// Batch signal computation — single forward pass O(rows × factColumns)
// ---------------------------------------------------------------------------

export const computeRowRoleSignals = (params: {
    /** Raw row records keyed by header name. */
    rows: Record<string, unknown>[];
    factColumns: string[];
    descriptorColumns: string[];
    /** Business-identity columns used only to validate a leading aggregate. */
    identityColumns?: string[];
    /** Absolute row index where the body starts. */
    bodyStartIndex: number;
    /** Absolute row index where the summary section starts (null = end). */
    summaryStartIndex: number | null;
    /** Total number of rows in the full raw dataset (for edge detection). */
    totalRowCount: number;
}): Map<number, RowRoleSignalBundle> => {
    const {
        rows,
        factColumns,
        descriptorColumns,
        identityColumns = descriptorColumns,
        bodyStartIndex,
        summaryStartIndex,
        totalRowCount,
    } = params;

    const resultMap = new Map<number, RowRoleSignalBundle>();
    if (rows.length === 0 || factColumns.length === 0) return resultMap;
    const leadingAggregate = detectLeadingAggregateRow(rows, factColumns, identityColumns);

    // Running accumulators for section subtotal and grand total detection.
    const sectionSums: Record<string, number> = {};
    const grandSums: Record<string, number> = {};
    for (const col of factColumns) {
        sectionSums[col] = 0;
        grandSums[col] = 0;
    }
    let sectionDetailCount = 0;
    let grandDetailCount = 0;
    // A "section subtotal" is only meaningful once the body has actually been
    // split into 2+ sections by a real boundary (blank row / group header).
    // Before the first such boundary, sectionSums === grandSums, so without
    // this guard a lone grand-total row at the end of an unsectioned table
    // matches the section-subtotal check (evaluated first, below) and gets
    // mislabeled 'section_subtotal' instead of the correct 'grand_total'.
    let hasSectionBoundary = false;

    // Edge detection thresholds (15 % of total rows, min 2).
    const edgeThreshold = Math.max(2, Math.floor(totalRowCount * 0.15));

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const absoluteIndex = bodyStartIndex + i;

        // ---- Parse fact values for this row --------------------------------
        const factValues: Record<string, number | null> = {};
        let factPopulated = 0;
        for (const col of factColumns) {
            const n = parseNumeric(row[col]);
            factValues[col] = n;
            if (n !== null) factPopulated++;
        }

        // ---- Sparsity signal -----------------------------------------------
        const allValues = Object.values(row);
        const nonEmpty = allValues.filter(v => !isBlankValue(v));
        const descriptorFilled = descriptorColumns.filter(col => !isBlankValue(row[col])).length;
        const descriptorEmpty = descriptorColumns.length > 0 && descriptorFilled === 0;
        const isSingletonLongText = nonEmpty.length === 1 && String(nonEmpty[0] ?? '').trim().length >= 24;
        const edgePosition: 'head' | 'tail' | 'interior' =
            absoluteIndex < bodyStartIndex + edgeThreshold
                ? 'head'
                : absoluteIndex >= totalRowCount - edgeThreshold
                    ? 'tail'
                    : 'interior';

        const sparsity: RowSparsitySignal = {
            rowIndex: absoluteIndex,
            descriptorEmpty,
            factColumnsPopulated: factPopulated,
            isSingletonLongText,
            isDocumentEdge: edgePosition !== 'interior',
            edgePosition,
        };

        // ---- Detect blank / section break (for running sums) ---------------
        const isBlankRow = nonEmpty.length === 0;
        const isLikelyGroupHeader =
            descriptorFilled > 0
            && factPopulated === 0
            && Object.values(factValues).every(v => v === null || v === 0);

        if (isBlankRow || isLikelyGroupHeader) {
            // Reset section sums on section break.
            for (const col of factColumns) {
                sectionSums[col] = 0;
            }
            if (sectionDetailCount > 0) {
                hasSectionBoundary = true;
            }
            sectionDetailCount = 0;
        }

        const nextRow = i + 1 < rows.length ? rows[i + 1] : null;
        const nextIsBlank = nextRow !== null && Object.values(nextRow).every(v => isBlankValue(v));
        const nextDescriptorFilled = nextRow === null
            ? 0
            : descriptorColumns.filter(col => !isBlankValue(nextRow[col])).length;
        const nextFactPopulated = nextRow === null
            ? 0
            : factColumns.filter(col => parseNumeric(nextRow[col]) !== null).length;
        // A subtotal can establish a boundary itself: it may be followed by an
        // explicit blank row or immediately by the first descriptor-bearing
        // detail row of the next section. Looking ahead preserves the first
        // subtotal in a report while the final unsectioned sum remains a grand
        // total.
        const followedBySectionBoundary = nextIsBlank
            || (descriptorEmpty && nextDescriptorFilled > 0 && nextFactPopulated > 0);

        // ---- Sum-verification signal ---------------------------------------
        // Only check non-blank rows that have ≥ 1 fact value.
        let isSumMatch = false;
        let sumMatchConfidence = 0;
        let sumMatchType: 'section_subtotal' | 'grand_total' | 'none' = 'none';
        const matchedColumns: string[] = [];

        if (!isBlankRow && factPopulated >= 1) {
            // Check section subtotal match.
            if ((hasSectionBoundary || followedBySectionBoundary) && sectionDetailCount >= 2) {
                let sectionMatchCount = 0;
                let sectionComparedCount = 0;
                let sectionNonZeroMatchCount = 0;
                let sectionNonZeroComparedCount = 0;
                for (const col of factColumns) {
                    const rowVal = factValues[col];
                    if (rowVal === null) continue;
                    sectionComparedCount++;
                    const isNonZeroRowValue = Math.abs(rowVal) > 0.000001;
                    if (isNonZeroRowValue) {
                        sectionNonZeroComparedCount++;
                    }
                    if (withinTolerance(rowVal, sectionSums[col])) {
                        sectionMatchCount++;
                        if (isNonZeroRowValue) {
                            sectionNonZeroMatchCount++;
                        }
                    }
                }
                if (
                    sectionComparedCount >= 2
                    && sectionMatchCount >= 2
                    && sectionMatchCount / sectionComparedCount >= 0.6
                    && passesNonZeroSumEvidenceGate({
                        comparedCount: sectionComparedCount,
                        matchCount: sectionMatchCount,
                        nonZeroComparedCount: sectionNonZeroComparedCount,
                        nonZeroMatchCount: sectionNonZeroMatchCount,
                    })
                ) {
                    isSumMatch = true;
                    sumMatchConfidence = sectionMatchCount / sectionComparedCount;
                    sumMatchType = 'section_subtotal';
                    for (const col of factColumns) {
                        if (factValues[col] !== null && withinTolerance(factValues[col]!, sectionSums[col])) {
                            matchedColumns.push(col);
                        }
                    }
                }
            }

            // Check grand total match (if not already a section subtotal).
            if (!isSumMatch && grandDetailCount >= 2) {
                let grandMatchCount = 0;
                let grandComparedCount = 0;
                let grandNonZeroMatchCount = 0;
                let grandNonZeroComparedCount = 0;
                for (const col of factColumns) {
                    const rowVal = factValues[col];
                    if (rowVal === null) continue;
                    grandComparedCount++;
                    const isNonZeroRowValue = Math.abs(rowVal) > 0.000001;
                    if (isNonZeroRowValue) {
                        grandNonZeroComparedCount++;
                    }
                    if (withinTolerance(rowVal, grandSums[col])) {
                        grandMatchCount++;
                        if (isNonZeroRowValue) {
                            grandNonZeroMatchCount++;
                        }
                    }
                }
                if (
                    grandComparedCount >= 2
                    && grandMatchCount >= 2
                    && grandMatchCount / grandComparedCount >= 0.6
                    && passesNonZeroSumEvidenceGate({
                        comparedCount: grandComparedCount,
                        matchCount: grandMatchCount,
                        nonZeroComparedCount: grandNonZeroComparedCount,
                        nonZeroMatchCount: grandNonZeroMatchCount,
                    })
                ) {
                    isSumMatch = true;
                    sumMatchConfidence = grandMatchCount / grandComparedCount;
                    sumMatchType = 'grand_total';
                    for (const col of factColumns) {
                        if (factValues[col] !== null && withinTolerance(factValues[col]!, grandSums[col])) {
                            matchedColumns.push(col);
                        }
                    }
                }
            }
        }

        if (i === 0 && leadingAggregate) {
            isSumMatch = true;
            sumMatchConfidence = leadingAggregate.confidence;
            sumMatchType = 'grand_total';
            matchedColumns.splice(0, matchedColumns.length, ...leadingAggregate.matchedColumns);
        }

        const sumVerification: RowSumVerificationSignal = {
            rowIndex: absoluteIndex,
            isSumMatch,
            sumMatchConfidence,
            matchedColumns,
            sumMatchType,
        };

        // ---- Position signal -----------------------------------------------
        const nextIsEnd = nextRow === null;
        const followedByGap = nextIsBlank || nextIsEnd;

        const position: RowPositionSignal = {
            rowIndex: absoluteIndex,
            isLastInSection: followedByGap,
            precedingDetailCount: sectionDetailCount,
            followedByGap,
        };

        resultMap.set(absoluteIndex, { sumVerification, sparsity, position });

        // ---- Accumulate running sums for detail-like rows ------------------
        // A "detail-like" row: has non-zero facts, is not a sum-match, not blank/group-header.
        const hasNonZeroFact = Object.values(factValues).some(v => v !== null && Math.abs(v) > 0);
        if (hasNonZeroFact && !isSumMatch && !isBlankRow && !isLikelyGroupHeader) {
            for (const col of factColumns) {
                const v = factValues[col];
                if (v !== null) {
                    sectionSums[col] += v;
                    grandSums[col] += v;
                }
            }
            sectionDetailCount++;
            grandDetailCount++;
        }

        // Reset section sums AFTER a sum-match (subtotal consumed the section).
        if (isSumMatch && sumMatchType === 'section_subtotal') {
            for (const col of factColumns) {
                sectionSums[col] = 0;
            }
            sectionDetailCount = 0;
            hasSectionBoundary = true;
        }
    }

    return resultMap;
};

// ---------------------------------------------------------------------------
// Signal → role mapping (pure function)
// ---------------------------------------------------------------------------

export const classifyRowRoleFromSignals = (
    signals: RowRoleSignalBundle,
): { role: string | null; confidence: number } => {
    const { sumVerification, sparsity, position } = signals;

    // Sum-match → subtotal or summary.
    if (sumVerification.isSumMatch) {
        if (sumVerification.sumMatchType === 'grand_total') {
            return { role: 'summary', confidence: 0.96 };
        }
        return { role: 'subtotal', confidence: 0.95 };
    }

    // Singleton long text near document edge → note or footer.
    if (sparsity.isSingletonLongText) {
        if (sparsity.edgePosition === 'tail') {
            return { role: 'footer', confidence: 0.92 };
        }
        if (sparsity.isDocumentEdge) {
            return { role: 'note', confidence: 0.90 };
        }
    }

    // Descriptor-empty with facts populated and at end of section → summary-like.
    if (sparsity.descriptorEmpty && sparsity.factColumnsPopulated >= 2 && position.isLastInSection) {
        return { role: 'summary_like', confidence: 0.88 };
    }

    // Inconclusive — fall through to next classification tier.
    return { role: null, confidence: 0 };
};
