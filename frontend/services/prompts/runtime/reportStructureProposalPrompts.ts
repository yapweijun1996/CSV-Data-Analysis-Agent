type SampledRow = {
    rowIndex: number;
    cells: string[];
};

const formatRow = (row: SampledRow) =>
    `Row ${row.rowIndex}: ${row.cells.map(cell => cell.trim().slice(0, 60)).join(' | ')}`;

export const reportStructureProposalSystemPrompt =
    'You propose cross-domain report structure and normalize report-style CSV tables into analysis-ready detail rows. Return exactly one schema-valid JSON object. Use only the visible boundary, header, and row evidence. Prefer conservative detail inclusion and lower confidence when uncertain.';

export const formatReportStructureProposalPrompt = (params: {
    mergedHeaders: string[];
    boundarySummary: string;
    rowInspectionSummary: string;
    sampledRows: SampledRow[];
}) => `
Review the report structure evidence and propose a normalization plan for canonical detail rows.

Return:
- purpose (what business question or process the report represents)
- grain (the columns that identify one prepared detail row)
- fields (evidence-backed roles for the most important visible columns)
- pivot (row table, wide pivot, statement table, or unknown)
- bodyRowRoles
- carryForwardColumns
- sectionLabelColumns
- detailInclusionRoles
- confidence
- reasoning

Decision contract:
- Use only exact merged-header names in grain, fields, and pivot column lists.
- A grain is the smallest evidence-backed set of columns that identifies one
  prepared detail row. Do not use numeric measures as grain just because they
  are unique.
- Classify fields by structural role, not report-domain vocabulary. It is fine
  to omit low-value fields or mark them unknown.
- Choose wide_pivot only when repeated column groups encode an enumerable
  dimension. Choose statement_table for hierarchical line-item statements.
- Never invent a purpose, grain, field, or pivot column that is absent from
  the visible evidence. Lower confidence or use unknown when evidence is weak.
- Only propose carry-forward for parent dimension fields such as order date, buyer confirmation/invoice, or payment terms.
- Never propose carry-forward for quantities, prices, amounts, totals, margins, commissions, or other numeric fact columns.
- Use bodyRowRoles only for rows visible in the evidence.
- Group headers, notes, subtotals, summaries, and footers must stay out of canonical detail rows.
- detailInclusionRoles should stay minimal. Prefer ['detail'] unless the evidence strongly supports otherwise.
- If the structure is ambiguous, keep arrays minimal and lower confidence instead of guessing.

## Resolved Boundary
${params.boundarySummary}

## Merged Headers
${params.mergedHeaders.map(header => `- ${header}`).join('\n')}

## Deterministic Row Inspection
${params.rowInspectionSummary}

## Sampled Raw Rows
${params.sampledRows.map(formatRow).join('\n')}
`;
