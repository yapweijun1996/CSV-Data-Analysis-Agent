import type { ToolManifest } from '../../../../types';
import {
    dataPreparationSchema,
    dataQuerySchema,
    dataDescribeSchema,
    dataValueCountsSchema,
    dataOutliersSchema,
    dataMissingSchema,
} from '../../../ai/schemas/dataSchemas';
import { validateDataQueryPayload } from '../../execution/dataQueryContract';
import { validateDataMutatePayload } from '../../execution/dataMutateContract';
import { requireDataset, requireAnalysisStage } from '../toolManifestSupport';
import { dataReshapeSchema, dataKeepWideSchema } from '../toolManifestSchemas';

export const createDataToolManifests = (): ToolManifest[] => [
    {
        name: 'data.mutate',
        description: 'Apply permanent deterministic dataset transformations.',
        category: 'data',
        risk: 'high',
        enabledByDefault: true,
        inputSchema: dataPreparationSchema,
        groups: ['data.mutation', 'cleaning.edit'],
        promptHints: [
            'Use only when the underlying cleaned dataset must change for all cards.',
            'Required args: explanation, operations[], and outputColumns[].',
            'Supported row deletion ops are drop_rows_by_index or drop_rows_by_condition. Do not invent names such as drop_rows_by_filter.',
            'For value-based deletion, prefer drop_rows_by_condition with predicates/groups. Example: delete Code = 501001.',
            'For numeric-looking strings such as 10,000.00, $1,234.56, or 50%, use deterministic operations like replace_values and cast_column instead of inventing code or unsupported operation types.',
            'If formatted numbers need cleanup before casting, prefer replace_values to remove commas or symbols, then cast_column with targetType number, currency, or percentage.',
            'Do not invent generic operation types such as mutate. Every operation must use a supported deterministic type from the catalog.',
            "Use derive_column for row-wise business metrics when source columns already exist, e.g. Profit = Revenue - Cost.",
            "Use derive_metric_by_label for label/value tables where metrics such as Revenue and Cost appear as row labels. Example: groupByColumns ['Project'], labelColumn 'Description', valueColumn 'Value', outputMetricLabel 'Profit'.",
            'For every derive_column or derive_metric_by_label operation, declare metricName, formula, operation, sourceColumns, grain, units, assumptions, and businessMeaning in declaration. The runtime will infer missing declaration fields for backward compatibility, but explicit declarations are preferred.',
            'Derived metrics are validated before commit for input availability, numeric behavior, denominator safety, and deterministic reconciliation. Do not set validationMode="warn" unless the user has reviewed and explicitly confirmed a warning.',
            'If the user wants profit, margin, or variance and the derived metric does not already exist, derive it deterministically before analysis.create_plan.',
        ],
        resultShape: 'Mutates the cleaned dataset and regenerates analyses.',
        capabilities: {
            mutatesState: true,
            piFollowUpMutation: true,
        },
        isAvailable: requireDataset,
        validate: args => validateDataMutatePayload(args ?? {}),
    },
    {
        name: 'data.query',
        description: 'Run a bounded read-only data query for the raw data explorer.',
        category: 'data',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: dataQuerySchema,
        groups: ['data.query', 'cleaning.verify.query'],
        promptHints: [
            'Prefer this over data mutation when the user only wants to inspect data.',
            'Only use data.query when you can express a structured plan with select, where, orderBy, limit, groupBy, or aggregates.',
            'Do not pass a naked free-text search string to data.query.',
            "Row-level example: args.plan = { select: ['Description', 'Address', 'Amount'], where: { predicates: [{ column: 'Address', operator: 'contains', value: '36 TUAS ROAD' }] }, limit: 25 }.",
            "OR example: args.plan = { select: ['Description', 'Amount'], where: { groups: [{ predicates: [{ column: 'Description', operator: 'contains', value: 'revenue' }] }, { predicates: [{ column: 'Description', operator: 'contains', value: 'cost' }] }] }, limit: 25 }.",
            "Aggregate example: args.plan = { groupBy: ['Project'], aggregates: [{ function: 'sum', column: 'Amount', as: 'total_amount' }], select: ['Project', 'total_amount'], orderBy: [{ column: 'total_amount', direction: 'desc' }], limit: 10 }.",
            "Conditional aggregate example: args.plan = { groupBy: ['Project'], aggregates: [{ function: 'sum', column: 'Value', as: 'total_revenue', where: { predicates: [{ column: 'Description', operator: 'in', value: ['Revenue', 'Net Sales / Revenue'] }] } }, { function: 'sum', column: 'Value', as: 'total_cost', where: { predicates: [{ column: 'Description', operator: 'in', value: ['Cost of Sales', 'Project Costs of Sales'] }] } }], select: ['Project', 'total_revenue', 'total_cost'], orderBy: [{ column: 'total_revenue', direction: 'desc' }], limit: 10 }.",
            "Post-aggregate filter example: args.plan = { groupBy: ['Region'], aggregates: [{ function: 'sum', column: 'Amount', as: 'total_amount' }], select: ['Region', 'total_amount'], postAggregateFilter: { predicates: [{ column: 'total_amount', operator: 'gt', value: 1000 }] }, orderBy: [{ column: 'total_amount', direction: 'desc' }], limit: 10 }.",
            'Within plan.where, top-level predicates are combined with AND. Use plan.where.groups when the user explicitly wants OR / either-term matching.',
            'When using groupBy, always include aggregates. When using orderBy, include the sorted column in select.',
            'Use plan.aggregates[].where when each aggregate must summarize a different subset of source rows. Do not push those label-specific conditions into one shared plan.where clause.',
            'Use postAggregateFilter only after groupBy/aggregates are defined. It filters aggregate output aliases, not raw source columns.',
            'plan.where may reference only real source dataset columns. Do not filter on aggregate aliases such as total_amount or record_count.',
            'Use bounded aggregate functions only: count, count_distinct, sum, avg, min, max, median, percentile.',
            'data.query does not support HAVING. If you need duplicate counts or grouped thresholds, return the grouped rows with an aggregate alias, sort them, and let assistant_message explain the result.',
            'For free-text row lookup, fuzzy keyword search, or cross-column text search, prefer spreadsheet.filter.',
            'Requests like "tell me all Total Operating Expenses" should use spreadsheet.filter or a data.query plan with an explicit where clause, not a preview-only select+limit query.',
            'If you cannot identify a stable structured condition or target columns, try a broader query (e.g., SELECT * with LIMIT) to explore before resorting to clarification.',
            'The system auto-injects detail-row filter (RowRole/RowClass) and hierarchy exclusion into your query plan. Do NOT manually add RowRole or RowClass predicates.',
            'Formatted number columns (comma thousands, currency symbols) are auto-cleaned by the query compiler during aggregation. Just reference the column name directly in aggregates — no REPLACE or TRY_CAST needed.',
        ],
        resultShape: 'Shows a read-only query result in the data explorer.',
        capabilities: {
            supportsOrGroups: true,
            supportsConditionalAggregate: true,
            supportsPostAggregateFilter: true,
            readOnly: true,
            piFollowUpReadOnly: true,
        },
        isAvailable: requireDataset,
        validate: args => validateDataQueryPayload(args ?? {}),
    },
    {
        name: 'data.describe',
        description: 'Get summary statistics (count, mean, std, min, Q1, median, Q3, max, nulls) for numeric columns.',
        category: 'data',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: dataDescribeSchema,
        groups: ['data.diagnostic'],
        promptHints: [
            'Use when the user asks about data distribution, statistics, or "describe the data".',
            'Returns summary stats for all numeric columns by default, or specify columns to focus on.',
        ],
        resultShape: 'Shows summary statistics table in the data explorer.',
        capabilities: { readOnly: true, piFollowUpReadOnly: true },
        isAvailable: requireDataset,
    },
    {
        name: 'data.value_counts',
        description: 'Get frequency distribution (value counts) for a categorical column.',
        category: 'data',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: dataValueCountsSchema,
        groups: ['data.diagnostic'],
        promptHints: [
            'Use when the user asks "what values does X have?" or "show distribution of X".',
            'Returns top-N values with counts. Default limit is 20.',
        ],
        resultShape: 'Shows value frequency table in the data explorer.',
        capabilities: { readOnly: true, piFollowUpReadOnly: true },
        isAvailable: requireDataset,
    },
    {
        name: 'data.outliers',
        description: 'Detect outlier rows in a numeric column using the IQR method.',
        category: 'data',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: dataOutliersSchema,
        groups: ['data.diagnostic'],
        promptHints: [
            'Use when the user asks about anomalies, extreme values, or outliers in a column.',
            'Returns rows where the value falls outside Q1-1.5*IQR or Q3+1.5*IQR, plus fence statistics.',
        ],
        resultShape: 'Shows outlier rows and IQR statistics in the data explorer.',
        capabilities: { readOnly: true, piFollowUpReadOnly: true },
        isAvailable: requireDataset,
    },
    {
        name: 'data.missing',
        description: 'Profile missing data (null rate, blank rate, zero rate) across columns.',
        category: 'data',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: dataMissingSchema,
        groups: ['data.diagnostic'],
        promptHints: [
            'Use when the user asks about data quality, missing values, or completeness.',
            'Returns null/blank/zero rates per column with severity classification.',
        ],
        resultShape: 'Shows missing data profile in the data explorer.',
        capabilities: { readOnly: true, piFollowUpReadOnly: true },
        isAvailable: requireDataset,
    },
    {
        name: 'data.reshape',
        description: 'Unpivot a wide-format dataset into long format for analysis. Use when the harness detected a wide pivot shape and you determine the data would benefit from reshaping (e.g. monthly columns that encode a temporal dimension).',
        category: 'data',
        risk: 'high',
        enabledByDefault: true,
        inputSchema: dataReshapeSchema,
        groups: ['data.reshape'],
        stageAvailability: ['analysis'],
        promptHints: [
            'Only use when the harness evidence indicates widePivotShape=true AND the wide columns encode a repeating dimension (e.g. months, quarters, periods).',
            'Do NOT reshape when the wide columns are independent metrics (e.g. "Sales MT" + "Ave Price" per month) — use data.keep_wide instead.',
            'sourceColumns: the period/series columns to unpivot. keepColumns: dimension columns to preserve.',
            'After reshape, the dataset changes schema — all subsequent analysis must use the new long-format columns.',
            'If reshape produces unexpectedly few rows, the observe harness will flag it — consider reverting with data.keep_wide.',
        ],
        resultShape: 'Reshapes the dataset in-place from wide to long format. Returns row count before/after.',
        isAvailable: requireAnalysisStage,
        validate: (args) => {
            const errors: string[] = [];
            if (!args?.reason) errors.push('"reason" is required.');
            if (!Array.isArray(args?.sourceColumns) || args.sourceColumns.length < 2) {
                errors.push('"sourceColumns" must contain at least 2 columns.');
            }
            if (!Array.isArray(args?.keepColumns) || args.keepColumns.length === 0) {
                errors.push('"keepColumns" must contain at least 1 dimension column.');
            }
            return errors;
        },
    },
    {
        name: 'data.keep_wide',
        description: 'Confirm that a wide-format dataset should remain in wide format for analysis. Use when the harness detected a wide pivot shape but the columns represent independent metrics that should not be unpivoted.',
        category: 'data',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: dataKeepWideSchema,
        groups: ['data.reshape'],
        stageAvailability: ['analysis'],
        promptHints: [
            'Use when harness evidence shows widePivotShape=true but the columns are paired metrics (e.g. "Sales MT" + "Ave Price" per month), not a single repeating series.',
            'This is a no-op that records the decision — analysis proceeds using the existing wide schema.',
            'After calling this, use the existing wide columns directly in analysis.create_plan.',
        ],
        resultShape: 'No-op. Records the agent decision to keep the wide format. Analysis proceeds with existing schema.',
        isAvailable: requireAnalysisStage,
        validate: (args) => {
            const errors: string[] = [];
            if (!args?.reason) errors.push('"reason" is required.');
            return errors;
        },
    },
];
