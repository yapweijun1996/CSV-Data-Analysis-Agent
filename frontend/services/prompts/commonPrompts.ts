// Centralized rules to avoid repetition in different prompt templates
export const commonPromptSnippets = {
    numberParsing: `- **CRITICAL RULE on NUMBER PARSING**: This is the most common source of errors. Numeric-looking strings (for example "$1,234.56", "50%", "1.0000") must be handled as proper numbers by choosing a deterministic \`cast_column\` operation with the correct \`targetType\`.
    - **DO NOT describe code helpers, utility functions, or custom parsing code.**
    - **DO describe the intended deterministic operation only** (for example, cast a column to \`currency\`, \`percentage\`, or \`number\`).`,
    splitNumeric: `- **CRITICAL RULE on SPLITTING NUMERIC STRINGS**: If a single field appears to contain multiple packed values, do not emit pseudo-code or JavaScript.
    - Only recommend a deterministic reshape step when the output can still be expressed with the supported operation catalog.
    - If the packed-value case cannot be safely represented with the current deterministic operations, prefer a minimal no-op/schema-only response over inventing unsupported code.`,
    dataVsSummaries: `- **Distinguishing Data from Summaries**: Your most critical task is to differentiate between valid data rows and non-data rows (like summaries or metadata).
    - A row is likely **valid data** if it has a value in its primary identifier column(s) (e.g., 'Account Code', 'Product ID') and in its metric columns.
    - **CRITICAL: Do not confuse hierarchical data with summary rows.** Look for patterns in identifier columns where one code is a prefix of another (e.g., '50' is a parent to '5010'). These hierarchical parent rows are **valid data** representing a higher level of aggregation and MUST be kept. Your role is to reshape the data, not to pre-summarize it by removing these levels.
    - A row is likely **non-data** and should be removed if it's explicitly a summary (e.g., contains 'Total', 'Subtotal' in a descriptive column) OR if it's metadata (e.g., the primary identifier column is empty but other columns contain text, like a section header).`,
};
