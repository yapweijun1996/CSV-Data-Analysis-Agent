import type { IntakePreScanSignals, IntakeRowSignal } from '../../../types';

export const intakeStructureSystemPrompt =
    'You locate CSV report boundaries. Return exactly one schema-valid JSON object. Use only visible row evidence and the pre-scan summary. Lower confidence when the structure is ambiguous.';

const formatRowForDisplay = (row: string[], index: number): string => {
    const cells = row.map(cell => {
        const trimmed = String(cell ?? '').trim();
        return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
    });
    return `Row ${index}: ${cells.join(' | ')}`;
};

export const formatRowsForIntakePrompt = (
    normalizedRows: string[][],
    maxHeadRows = 26,
    maxTailRows = 6,
    boundaryRegion?: { summaryStartIndex: number; windowSize?: number },
): string => {
    const headEnd = Math.min(normalizedRows.length, maxHeadRows);
    const tailStart = Math.max(headEnd, normalizedRows.length - maxTailRows);

    // Boundary region: show a few rows around the deterministic summary boundary
    // so the AI can see the actual transition point instead of guessing.
    const windowSize = boundaryRegion?.windowSize ?? 2;
    let brStart = -1;
    let brEnd = -1;
    if (boundaryRegion && boundaryRegion.summaryStartIndex > headEnd && boundaryRegion.summaryStartIndex < tailStart) {
        brStart = Math.max(headEnd, boundaryRegion.summaryStartIndex - windowSize);
        brEnd = Math.min(tailStart, boundaryRegion.summaryStartIndex + windowSize);
    }

    const lines: string[] = [];

    for (let i = 0; i < headEnd; i += 1) {
        lines.push(formatRowForDisplay(normalizedRows[i], i));
    }

    if (brStart > 0) {
        // Gap before boundary region
        if (brStart > headEnd) {
            lines.push(`... (${brStart - headEnd} rows omitted) ...`);
        }
        lines.push(`--- boundary region (deterministic summaryStartIndex = ${boundaryRegion!.summaryStartIndex}) ---`);
        for (let i = brStart; i < brEnd; i += 1) {
            lines.push(formatRowForDisplay(normalizedRows[i], i));
        }
        lines.push('--- end boundary region ---');
        // Gap after boundary region
        if (tailStart > brEnd) {
            lines.push(`... (${tailStart - brEnd} rows omitted) ...`);
        }
    } else if (tailStart > headEnd) {
        lines.push(`... (${tailStart - headEnd} rows omitted) ...`);
    }

    for (let i = tailStart; i < normalizedRows.length; i += 1) {
        lines.push(formatRowForDisplay(normalizedRows[i], i));
    }

    return lines.join('\n');
};

const classificationLabel = (signal: IntakeRowSignal): string => {
    const parts: string[] = [signal.classification];
    if (signal.nonEmptyCellCount > 0) {
        parts.push(`${signal.nonEmptyCellCount}/${signal.totalCellCount} cells`);
        parts.push(`${(signal.numericRatio * 100).toFixed(0)}% numeric`);
    }
    if (signal.bodyEvidenceKind !== 'unknown') {
        parts.push(signal.bodyEvidenceKind);
    }
    return parts.join(', ');
};

export const formatPreScanSignalsForPrompt = (signals: IntakePreScanSignals): string => {
    const lines: string[] = [
        '## Pre-Scan Row Classifications',
        ...signals.rowSignals.map(s => `  Row ${s.rowIndex}: ${classificationLabel(s)}`),
        '',
        '## Candidate Summary',
        `  Header candidates: ${signals.headerCandidateIndexes.length > 0 ? `rows [${signals.headerCandidateIndexes.join(', ')}]` : 'none detected'}`,
        `  Data candidates: ${signals.dataCandidateIndexes.length > 0 ? `rows [${signals.dataCandidateIndexes.join(', ')}]` : 'none detected'}`,
        `  Title rows: [${signals.titleRowIndexes.join(', ')}]`,
        `  Footer rows: [${signals.footerRowIndexes.join(', ')}]`,
        `  Blank rows: [${signals.blankRowIndexes.join(', ')}]`,
        `  Parameter rows: [${signals.parameterRowIndexes.join(', ')}]`,
    ];

    if (signals.deterministicSelection) {
        lines.push(
            '',
            '## Deterministic Best Guess',
            `  ${signals.deterministicSelection.reason} (confidence: ${signals.deterministicSelection.confidence.toFixed(2)})`,
        );
    } else {
        lines.push(
            '',
            '## Deterministic Best Guess',
            '  No header could be identified by the deterministic pre-scan.',
        );
    }

    if (typeof signals.deterministicSummaryStartIndex === 'number') {
        lines.push(
            '',
            '## Deterministic Summary Boundary',
            `  summaryStartIndex: ${signals.deterministicSummaryStartIndex} (full backward scan of all rows)`,
            `  If this equals the total row count, no summary/footer was found.`,
            `  Prefer this value unless boundary-region rows clearly contradict it.`,
        );
    }

    return lines.join('\n');
};

export const createIntakeStructurePrompt = (contextText: string): string => `
Choose the CSV report boundaries from the provided evidence.

Return:
- headerRowIndex
- headerLayerIndexes
- bodyStartIndex
- summaryStartIndex
- parameterRowIndexes
- repeatedHeaderRowIndexes
- confidence
- reasoning

Decision contract:
- Use only row indexes that are visible in the evidence.
- Prefer the deterministic candidate rows unless the raw row evidence clearly contradicts them.
- The header row is the row whose cells should become body column names.
- Title, subtitle, metadata, and footer rows are not headers.
- A year, period code, or category code may appear in the header row.
- Parameter rows are optional and should only be returned when directly supported.
- If a matching header line appears both before and after a parameter block, choose the later line immediately above the body as headerRowIndex and mark the earlier line as repeatedHeaderRowIndexes.
- Repeated headers should only be returned when they match the main header.
- summaryStartIndex must be the first non-body row after the final body row.
- If no summary/footer exists, set summaryStartIndex to the total row count.
- A deterministic summary boundary (full backward scan) is provided when available. Prefer it unless the boundary-region rows clearly show summary/footer data starts earlier or body data continues past it.
- If you are unsure, keep auxiliary arrays minimal and lower confidence instead of guessing.

Headerless file handling:
- If no row qualifies as a header (no row contains column labels for the body data), set headerRowIndex to -1.
- When headerRowIndex is -1, you MUST provide syntheticHeaders: an array of inferred column names with length equal to the column count.
- Infer column purposes from data patterns: sparse text columns are dimensions, columns dominated by numbers or zero-placeholder markers ('-) are metrics (e.g. monthly values), trailing total columns are "Total Qty"/"Total Amount".
- For monthly quantity columns, use abbreviated month names (e.g. "Jan", "Feb", ..., "Dec") if 12 consecutive numeric columns appear.
- For unknown columns, use descriptive positional names (e.g. "Indent", "Section", "Category", "Description", "Code").
- bodyStartIndex should be the first row containing actual data values (skip section headers, blank separators, and metadata).

${contextText}
`;

export const reportContextExtractionSystemPrompt =
    'You extract framing context from imported CSV report evidence. Return exactly one schema-valid JSON object. Prefer precision over recall. The reportTitle may be cleaned up for readability but must be grounded in evidence. Do not invent parameter or footer lines.';

export const createReportContextExtractionPrompt = (contextText: string): string => `
Extract framing context only. Do not solve table structure here.

Return:
- reportTitle
- reportDescription
- parameterLines
- footerLines
- candidateHeaderLine
- confidence
- reasoning

Decision contract:
- reportTitle may be rephrased for readability but must be grounded in visible CSV evidence. Do not invent content absent from the data.
- reportTitle should be the main human-readable report title, not a body value.
- reportDescription: a 1-2 sentence summary of what the dataset contains (domain, time period, scope), grounded in metadata, headers, and body evidence.
- parameterLines should contain preserved filter or scope lines (use exact visible text).
- footerLines should contain preserved footer, memo, remark, or timestamp lines (use exact visible text).
- candidateHeaderLine is optional supporting evidence; return [] when weak or ambiguous.
- Do not copy body facts into title, parameterLines, or footerLines.
- Deduplicate short repeated lines.
- When evidence is weak, return empty fields and lower confidence instead of guessing.

${contextText}
`;
