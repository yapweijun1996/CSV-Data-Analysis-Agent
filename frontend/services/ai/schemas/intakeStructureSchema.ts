/**
 * JSON Schema for AI-powered CSV structure boundary detection.
 * The AI receives raw row samples + pre-scan signals and returns
 * explicit structural boundaries (header, body, summary positions).
 */
export const intakeStructureBoundarySchema = {
    type: 'object',
    properties: {
        headerRowIndex: {
            type: 'integer',
            minimum: -1,
            description: 'Zero-based index of the primary header row. This row contains the column names that describe the body data. Set to -1 when NO header row exists in the file (headerless report). When -1, you MUST provide syntheticHeaders.',
        },
        headerLayerIndexes: {
            type: 'array',
            items: { type: 'integer', minimum: 0 },
            maxItems: 4,
            description: 'Indexes of additional header layers (e.g., multi-line headers with code series above label rows). Exclude the primary header index.',
        },
        bodyStartIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Zero-based index of the first data/body row, immediately after the header (and any parameter rows between header and body).',
        },
        summaryStartIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Zero-based index where summary/total/footer rows begin. Set equal to total row count if there is no summary section.',
        },
        parameterRowIndexes: {
            type: 'array',
            items: { type: 'integer', minimum: 0 },
            maxItems: 10,
            description: 'Indexes of parameter/filter label rows between the header area and body start (e.g., "Sales Person Name", "Print Date").',
        },
        repeatedHeaderRowIndexes: {
            type: 'array',
            items: { type: 'integer', minimum: 0 },
            maxItems: 10,
            description: 'Indexes of rows that repeat the primary header (common in paginated report exports).',
        },
        confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Your confidence in this boundary detection (0.0 to 1.0). Use lower values when the structure is ambiguous.',
        },
        reasoning: {
            type: 'string',
            description: 'Brief explanation (1-3 sentences) of why these boundaries were chosen.',
        },
        syntheticHeaders: {
            type: 'array',
            items: { type: 'string' },
            description: 'AI-inferred column names when headerRowIndex is -1 (headerless file). Array length MUST equal the column count. Infer names from data patterns: e.g. sparse text columns → dimension names, columns with monthly quantities → "Jan", "Feb", etc., total columns → "Total Qty", "Total Amount".',
        },
    },
    required: [
        'headerRowIndex',
        'bodyStartIndex',
        'summaryStartIndex',
        'confidence',
        'reasoning',
    ],
} as const;
