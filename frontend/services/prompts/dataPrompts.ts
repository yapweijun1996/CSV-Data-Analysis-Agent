import { commonPromptSnippets } from './commonPrompts';

// --- System prompts for AI service files ---

export const dataPreparationSystemPrompt =
    'You produce the smallest deterministic cleanup or reshape plan that makes an imported report query-ready. '
    + 'Return one valid JSON object only. '
    + 'Use only approved operations and make outputColumns match the post-operation schema exactly.';

export const filterGeneratorSystemPrompt = 'You are an expert data analyst. Your task is to convert a user\'s natural language query into one deterministic filter_rows operation for a dataset. You MUST respond with a single valid JSON object, and nothing else. The JSON object must adhere to the provided schema.';

// Centralized rules to avoid repetition
const commonRules = commonPromptSnippets;
const dataPreparationAllowedOperations = 'drop_rows_by_index, drop_rows_by_condition, drop_blank_rows, promote_header_row, rename_columns, drop_columns, trim_whitespace, normalize_empty_values, replace_values, cast_column, fill_missing, dedupe_rows, filter_rows, split_column, unpivot_columns';
const wideTableAllowedOperations = 'drop_rows_by_index, drop_rows_by_condition, drop_blank_rows, promote_header_row, rename_columns, drop_columns, trim_whitespace, normalize_empty_values, cast_column, unpivot_columns';

export const createDataPreparationPrompt = (
    contextText: string,
    retryFeedback?: string | null,
    options?: {
        wideTable?: boolean;
        requiredLabelLayers?: number;
        hierarchySignal?: boolean;
        inspectionSummary?: string | null;
        priorVerificationFailures?: string[];
        residualRowsPreview?: string | null;
        allowedOperationTypes?: string[];
        iterationContext?: { round: number; maxRounds: number };
    },
): string => `
Return one concise deterministic data-preparation plan.

Priority order:
1. Preserve business detail rows.
2. Remove only rows or columns that are clearly non-data.
3. Promote the true header row only when needed.
4. If the dataset is pivot, crosstab, or wide-matrix shaped, convert it into a long table.
5. Keep the plan as small as possible.

Rules:
- Do not emit JavaScript, pseudo-code, helpers, or custom parsing logic.
- Use only deterministic operations that are explicitly supported by the schema.
- Numeric-looking strings must use a deterministic \`cast_column\` with the correct \`targetType\` when a permanent cast is needed.
- Distinguish detail rows from titles, parameters, summaries, and footers.
- Keep hierarchical parent rows when identifier values follow prefix relationships such as 50 -> 5010 -> 501001.
- Rows with a blank primary identifier plus label text are likely metadata or summaries; remove them only when clearly non-data.
${options?.wideTable ? '- This dataset has repeated metric columns, so prefer \`unpivot_columns\` after only the structural cleanup that is truly needed.' : ''}
${options?.wideTable ? '- Do not cast or reference derived long-table columns such as Value before an explicit \`unpivot_columns\` step creates them.' : ''}
${options?.wideTable ? '- For genuine wide report matrices, zero-operation plans are invalid. Use \`unpivot_columns\` to create a long table before final typing.' : ''}
${options?.wideTable && (options.requiredLabelLayers ?? 0) > 0 ? `- This wide report preserves ${options.requiredLabelLayers} header label layer(s). If you use \`unpivot_columns\`, you MUST preserve all of them with \`labelColumns\` entries such as \`SeriesLabelL1\` through \`SeriesLabelL${options.requiredLabelLayers}\`.` : ''}
${options?.wideTable && (options.requiredLabelLayers ?? 0) > 0 ? '- Do not collapse multi-header labels into SeriesKey alone when raw header label layers are available.' : ''}
${options?.wideTable && (options.requiredLabelLayers ?? 0) > 0 ? '- If the report also has hierarchical code/description rows, preserve them during unpivot with `rowClassColumn`, `hierarchyDepthColumn`, `sourceRowIndexColumn`, and `hierarchyDepthMappings`.' : ''}
${options?.hierarchySignal ? '- This dataset contains hierarchical parent/detail rows. Zero-operation plans are invalid; preserve hierarchy during reshape with `hierarchyDepthColumn`, `hierarchyDepthMappings`, and `sourceRowIndexColumn`.' : ''}
${options?.hierarchySignal ? '- If you are not reshaping the dataset, append `annotate_hierarchy` instead of returning a hierarchy-losing cleanup or schema-only plan.' : ''}
${options?.wideTable && options?.hierarchySignal ? '- If you cannot produce a complete hierarchy-preserving unpivot, prefer `annotate_hierarchy` over an incomplete wide-table plan.' : ''}
- Completely empty columns (100% missing) are already removed deterministically before this stage. Mostly-empty columns (>90% but <100%) remain in the schema unless an explicit operation removes them.
- If no executable mutation is needed, return zero operations and explicitly say the prepared rows remain unchanged while only refining schema/types.

Allowed operations:
- ${options?.wideTable ? wideTableAllowedOperations : dataPreparationAllowedOperations}

Requirements:
- Always return \`explanation\`, \`operations\`, and \`outputColumns\`.
- \`outputColumns\` must exactly match the post-operation structure.
- Zero-operation plans must not add, remove, or rename columns.
- Use specific output types when justified: \`date\`, \`time\`, \`currency\`, \`percentage\`.
- Keep the plan concise, direct, and deterministic.
${options?.inspectionSummary ? `- Current row inspection summary: ${options.inspectionSummary}` : ''}
${options?.iterationContext ? `- This is cleaning round ${options.iterationContext.round} of ${options.iterationContext.maxRounds}; do not repeat failed generic retries.` : ''}
${options?.priorVerificationFailures?.length ? `- Prior verification failures to avoid repeating:\n${options.priorVerificationFailures.map(reason => `  - ${reason}`).join('\n')}` : ''}
${options?.allowedOperationTypes?.length ? `- In this runtime pass, prefer only these bounded operations: ${options.allowedOperationTypes.join(', ')}` : ''}

${contextText}
${options?.residualRowsPreview ? `Residual uncertain rows preview:\n${options.residualRowsPreview}` : ''}
${retryFeedback ? `Retry guidance:\n${retryFeedback}` : ''}
`;

export const createFilterFunctionPrompt = (query: string, contextText: string): string => `
    You are an expert data analyst. Your task is to convert a user's natural language query into a deterministic filter_rows operation for a dataset.
    
    **User Query:** "${query}"
    
    ${contextText}
    
    **CRITICAL Rules for Filter Planning:**
    ${commonRules.numberParsing}
    - You MUST return exactly one \`filter_rows\` operation inside the \`operation\` field.
    - Use only these operators: \`eq\`, \`neq\`, \`gt\`, \`gte\`, \`lt\`, \`lte\`, \`between\`, \`contains\`, \`starts_with\`, \`ends_with\`, \`in\`, \`is_null\`, \`not_null\`.
    - If the request is simple AND logic, use \`predicates\`.
    - If the request needs simple OR logic, use \`groups\`, where each group is AND-only and the overall operation matches if any group matches.
    - Never emit JavaScript code or pseudo-code.
    
    **Your Task:**
    1.  **Analyze Query:** Understand the user's intent. Identify columns, values, and operators (e.g., >, <, =, contains).
    2.  **Write Filter Operation:** Return one deterministic \`filter_rows\` operation with stable \`id\`, \`reason\`, and \`predicates\`.
    3.  **Explain:** Briefly explain the filter you created in plain language.
    
    **Example:**
    - User Query: "show me all rows where sales > 5000 and region is North America"
    - Columns: [{ name: 'sales', type: 'currency' }, { name: 'region', type: 'categorical' }]
    - Your Response (JSON):
    {
      "explanation": "Filtering for rows where 'sales' is greater than 5000 and 'region' is 'North America'.",
      "operation": {
        "id": "filter_sales_region",
        "type": "filter_rows",
        "reason": "Keep only high-sales North America rows.",
        "predicates": [
          { "column": "sales", "operator": "gt", "value": 5000 },
          { "column": "region", "operator": "eq", "value": "North America" }
        ]
      }
    }

    **Example with simple OR groups:**
    {
      "explanation": "Filtering for rows where region is East or West.",
      "operation": {
        "id": "filter_east_or_west",
        "type": "filter_rows",
        "reason": "Keep only the requested regions.",
        "groups": [
          { "predicates": [{ "column": "region", "operator": "eq", "value": "East" }] },
          { "predicates": [{ "column": "region", "operator": "eq", "value": "West" }] }
        ]
      }
    }
`;
