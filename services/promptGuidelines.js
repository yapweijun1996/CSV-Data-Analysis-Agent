const DEFAULT_MANDATORY_SUMMARY_BULLET =
  '- **MANDATORY SUMMARY REMOVAL**: Any row matching the summary keywords must be excluded from the transformed dataset. When uncertain, remove the row and mention it in your status message.';

const BASE_GUIDELINE_LINES = summaryKeywordsDisplay => [
  'Common problems to fix:',
  `- **CRITICAL RULE on NUMBER PARSING**: This is the most common source of errors. To handle numbers that might be formatted as strings (e.g., "$1,234.56", "50%"), you are provided with a safe utility function: \`_util.parseNumber(value)\`.`,
  '    - **YOU MUST use `_util.parseNumber(value)` for ALL numeric conversions.**',
  '    - **DO NOT use `parseInt()`, `parseFloat()`, or `Number()` directly.** The provided utility is guaranteed to handle various formats correctly.',
  `- **CRITICAL RULE on SPLITTING NUMERIC STRINGS**: If you encounter a single string field that contains multiple comma-separated numbers (which themselves may contain commas as thousand separators, e.g., "1,234.50,5,678.00,-9,123.45"), you are provided a utility \`_util.splitNumericString(value)\` to correctly split the string into an array of number strings.`,
  '    - **YOU MUST use this utility for this specific case.**',
  `    - **DO NOT use a simple \`string.split(',')\`**, as this will incorrectly break up numbers.`,
  `    - **Example**: To parse a field 'MonthlyValues' containing "1,500.00,2,000.00", your code should be: \`const values = _util.splitNumericString(row.MonthlyValues);\` This will correctly return ['1,500.00', '2,000.00'].`,
  '- **Distinguishing Data from Summaries**: Your most critical task is to differentiate between valid data rows and non-data rows (like summaries or metadata).',
  "    - A row is likely **valid data** if it has a value in its primary identifier column(s) (e.g., 'Account Code', 'Product ID') and in its metric columns.",
  "    - **CRITICAL: Do not confuse hierarchical data with summary rows.** Look for patterns in identifier columns where one code is a prefix of another (e.g., '50' is a parent to '5010'). These hierarchical parent rows are **valid data** representing a higher level of aggregation and MUST be kept. Your role is to reshape the data, not to pre-summarize it by removing these levels.",
  "    - A row is likely **non-data** and should be removed if it's explicitly a summary (e.g., contains 'Total', 'Subtotal' in a descriptive column) OR if it's metadata (e.g., the primary identifier column is empty but other columns contain text, like a section header).",
  `- **Summary Keyword Radar**: Treat any row whose textual cells match or start with these keywords as metadata/non-data unless strong evidence proves otherwise: ${summaryKeywordsDisplay}.`,
];

const CROSSTAB_ALERT_LINES = [
  'CROSSTAB ALERT:',
  '- The dataset contains many generic columns (e.g., column_1, column_2...). Treat these as pivoted metrics that must be unpivoted/melted into tidy rows.',
  '- Preserve identifier columns (codes, descriptions, category labels) as-is.',
  '- For each pivot column, produce rows with explicit fields such as { Code, Description, PivotColumnName, PivotValue } so every numeric value becomes its own observation.',
  '- Document the unpivot procedure explicitly inside `stagePlan.dataNormalization` (list identifier detection, iteration ranges, helper calls) and avoid relying on hard-coded indices.',
  "- After reshaping, update `outputColumns` to reflect the tidy structure (e.g., 'code' categorical, 'project' categorical, 'pivot_column' categorical, 'pivot_value' numerical).",
  '- Include logic to drop empty or subtotal rows but keep hierarchical parent rows.',
];

const TASK_SECTION_LINES = [
  'Your task:',
  '1. **Study (Think Step-by-Step)**: Describe what you observe in the dataset. List the problems (multi-row headers, totals, blank/title rows, etc.). Output this as `analysisSteps` — a detailed, ordered list of your reasoning before coding.',
  '2. **Plan Transformation**: Based on those steps, decide on the exact cleaning/reshaping actions (unpivot, drop rows, rename columns, parse numbers, etc.) and fill the `stagePlan` object (title → header → data).',
  "3. **Define Output Schema**: Determine the exact column names and data types AFTER your transformation. Use specific types where possible: 'categorical', 'numerical', 'date', 'time', 'currency', 'percentage'.",
  '4. **Stage Deliverable (Optional Code)**: If a concise JavaScript snippet is necessary, write the body of a function that receives `data` and `_util` and returns the transformed array. Otherwise set `jsFunctionBody` to null and rely on the stage plan.',
  '5. **Explain**: Provide a concise, user-facing explanation of what you did.',
];

const CRITICAL_REQUIREMENT_LINES = [
  '**CRITICAL REQUIREMENTS:**',
  '- Never assume specific header text exists. If you cannot confidently locate headers or identifier columns, throw an Error explaining what data was missing instead of returning an empty array.',
  '- You MUST provide the `analysisSteps` array capturing your chain-of-thought (observations ➜ decisions ➜ actions). Each item should be a full sentence.',
  '- You MUST provide the `outputColumns` array. If no transformation is needed, it should match the input schema (but update types if you discovered more specific ones).',
  '- If you provide JavaScript, it MUST include a `return` statement that returns the transformed data array.',
  '- Mirror your `stagePlan` checkpoints in code and comments. Each checkpoint should translate into a tiny sequential action (e.g., remove metadata rows → resolve headers → normalize rows) so the UI can narrate progress and verify Raw Data Explorer shows the same result.',
  '- Never access `data` using numeric literals (e.g., `data[0]`, `data[3]`, `data[data.length - 1]`). Determine headers/rows dynamically via the provided helper utilities.',
  '- Whenever you convert numbers, you MUST use `_util.parseNumber`. Whenever you split comma-separated numeric strings, you MUST use `_util.splitNumericString`.',
  '- When the dataset exhibits the Crosstab alert, your `stagePlan.dataNormalization` must detail the unpivot algorithm (identifier detection, iteration ranges, helper calls). Include code only if absolutely necessary.',
];

export const buildDataPrepGuidelines = ({
  summaryKeywordsDisplay,
  mandatorySummaryBullet,
  hasCrosstabShape = false,
  includeTaskSection = true,
  includeCriticalRequirements = true,
} = {}) => {
  const summaryDisplay = summaryKeywordsDisplay || "'total', 'subtotal', 'summary'";
  const lines = [...BASE_GUIDELINE_LINES(summaryDisplay)];
  lines.push(mandatorySummaryBullet || DEFAULT_MANDATORY_SUMMARY_BULLET);
  if (hasCrosstabShape) {
    lines.push('', ...CROSSTAB_ALERT_LINES);
  }
  if (includeTaskSection) {
    lines.push('', ...TASK_SECTION_LINES);
  }
  if (includeCriticalRequirements) {
    lines.push('', ...CRITICAL_REQUIREMENT_LINES);
  }
  return lines.join('\n');
};

export const DEFAULT_DATA_PREP_GUIDELINES = options =>
  buildDataPrepGuidelines({
    summaryKeywordsDisplay: options?.summaryKeywordsDisplay,
    mandatorySummaryBullet: options?.mandatorySummaryBullet,
    hasCrosstabShape: options?.hasCrosstabShape,
    includeTaskSection: options?.includeTaskSection,
    includeCriticalRequirements: options?.includeCriticalRequirements,
  });
