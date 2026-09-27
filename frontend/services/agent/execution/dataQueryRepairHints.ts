/**
 * dataQueryRepairHints.ts
 *
 * Pattern-matches error text from query validation to repair hint categories
 * and produces actionable guidance strings for the AI agent.
 */

import type { AnalysisMetricSemanticName } from '../../../types';
import { METRIC_PATTERNS, matchesMetricPattern } from '../analysisBrief';
import { isStructuralMetadataColumn } from '../structuralMetadata';

const QUERY_MISSING_COLUMN_PATTERN = /Query [^:]+ references missing column:\s*([^.!?\n]+)/i;
const QUERY_MISSING_COLUMNS_PATTERN = /Query [^:]+ references missing columns:\s*([^.!?\n]+)/i;
const OPERATION_MISSING_COLUMNS_PATTERN = /Operation "[^"]+" references missing columns:\s*([^.!?\n]+)/i;
const DUCKDB_MISSING_COLUMN_PATTERN = /Referenced column "([^"]+)" not found in FROM clause/i;

const extractMissingColumnReferences = (errorText: string): string[] => {
    const trimmed = errorText.trim();
    if (!trimmed) {
        return [];
    }

    const operationMatch = trimmed.match(OPERATION_MISSING_COLUMNS_PATTERN);
    if (operationMatch?.[1]) {
        return operationMatch[1]
            .split(',')
            .map(token => token.trim())
            .filter(Boolean);
    }

    const queryManyMatch = trimmed.match(QUERY_MISSING_COLUMNS_PATTERN);
    if (queryManyMatch?.[1]) {
        return queryManyMatch[1]
            .split(',')
            .map(token => token.trim())
            .filter(Boolean);
    }

    const queryOneMatch = trimmed.match(QUERY_MISSING_COLUMN_PATTERN);
    if (queryOneMatch?.[1]) {
        return [queryOneMatch[1].trim()];
    }

    const duckDbMatch = trimmed.match(DUCKDB_MISSING_COLUMN_PATTERN);
    if (duckDbMatch?.[1]) {
        return [duckDbMatch[1].trim()];
    }

    return [];
};

const referencesStructuralMetadata = (errorText: string): boolean =>
    extractMissingColumnReferences(errorText).some(reference => isStructuralMetadataColumn(reference));

const OR_GROUPS_HINT_PATTERNS = [
    /explicit goal to use or/i,
    /use or/i,
    /either term/i,
    /and condition/i,
    /where clause.*and/i,
];

// Generalized: matches any metric pair, not just revenue/cost.
const CONDITIONAL_AGGREGATION_HINT_PATTERNS = [
    /case when/i,
    /conditional aggregation/i,
    /does not actually include .*case when/i,
    /failing to distinguish between/i,
    /label[-/\s]?based conditional aggregation/i,
    /aggregated all .+ values into a single/i,
    /rather than separating them into distinct/i,
    /single ['"]?totalvalue['"]?/i,
];

const hasTwoOrMoreMetricMentions = (text: string): boolean => {
    const matched = (Object.keys(METRIC_PATTERNS) as AnalysisMetricSemanticName[])
        .filter(metric => matchesMetricPattern(text, metric));
    return matched.length >= 2;
};

export const isOrGroupsRepairIssue = (text: string | null | undefined): boolean => {
    if (!text) {
        return false;
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return false;
    }

    return OR_GROUPS_HINT_PATTERNS.some(pattern => pattern.test(normalized))
        && (
            /use or/i.test(normalized)
            || /either term/i.test(normalized)
            || (/and condition/i.test(normalized) && /\blike\b/i.test(normalized))
        );
};

export const isConditionalAggregateRepairIssue = (text: string | null | undefined): boolean => {
    if (!text) {
        return false;
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return false;
    }

    return CONDITIONAL_AGGREGATION_HINT_PATTERNS.some(pattern => pattern.test(normalized))
        || (
            /same sum/i.test(normalized)
            && /total_/i.test(normalized)
            && hasTwoOrMoreMetricMentions(normalized)
        )
        || (
            /distinguish between/i.test(normalized)
            && hasTwoOrMoreMetricMentions(normalized)
            && /(description|label)/i.test(normalized)
        );
};

export type DataQueryRepairHintCategory =
    | 'blocked_group_by'
    | 'missing_structured_plan'
    | 'invalid_aggregate_function'
    | 'missing_aggregate_for_group_by'
    | 'invalid_post_aggregate_filter'
    | 'orderby_not_selected'
    | 'invalid_aggregate_select_reference'
    | 'sqlish_select_expression'
    | 'structural_metadata_leak'
    | 'missing_filter_column'
    | 'aggregate_missing_column'
    | 'bridge_missing_column'
    | 'duckdb_missing_column'
    | 'or_groups_required'
    | 'conditional_aggregate_required'
    | 'aggregation_governance_violation';

type DataQueryRepairRule = {
    category: DataQueryRepairHintCategory;
    match: (errorText: string) => boolean;
    instruction: string;
};

const DATA_QUERY_REPAIR_RULES: DataQueryRepairRule[] = [
    {
        category: 'blocked_group_by',
        match: errorText => /blocked_group_by_unresolved:/i.test(errorText),
        instruction: 'The current groupBy uses a blocked dimension. Remove the blocked groupBy column and retry with a safe business grain from preferGroupBy or another non-blocked dimension exposed by the dataset schema.',
    },
    {
        category: 'invalid_aggregate_function',
        match: errorText => errorText.includes('must be one of count, count_distinct, sum, avg, min, max, median, or percentile'),
        instruction: 'Set every plan.aggregates[].function to exactly one of count, count_distinct, sum, avg, min, max, median, or percentile. For percentile, also provide percentile between 0 and 1.',
    },
    {
        category: 'invalid_post_aggregate_filter',
        match: errorText => errorText.includes('"plan.postAggregateFilter"'),
        instruction: 'Use plan.postAggregateFilter only in aggregate queries, and reference aggregate output aliases or grouped output columns there.',
    },
    {
        category: 'missing_aggregate_for_group_by',
        match: errorText => errorText.includes('"plan.groupBy" requires at least one aggregate in "plan.aggregates".'),
        instruction: 'If you use plan.groupBy, add at least one aggregate in plan.aggregates with a stable alias.',
    },
    {
        category: 'orderby_not_selected',
        match: errorText => errorText.includes('must also appear in "plan.select" for bounded read-only queries'),
        instruction: 'Add every plan.orderBy[].column to plan.select so the sorted column is explicitly returned.',
    },
    {
        category: 'invalid_aggregate_select_reference',
        match: errorText => errorText.includes('must reference a groupBy column or aggregate alias in aggregate queries'),
        instruction: 'In aggregate queries, plan.select may only contain groupBy columns and aggregate aliases, not raw source columns or SQL expressions.',
    },
    {
        category: 'sqlish_select_expression',
        match: errorText => errorText.includes('"plan.select" must list plain output column names only'),
        instruction: 'Keep plan.select to plain output column names only. Put count/sum/avg logic in plan.aggregates and reference the aggregate alias in select.',
    },
    {
        category: 'missing_structured_plan',
        match: errorText => errorText.includes('"plan" must include at least one structured query clause'),
        instruction: 'Return a real structured plan using select, where, orderBy, limit, groupBy, or aggregates instead of a free-text or empty query payload.',
    },
    {
        category: 'structural_metadata_leak',
        match: errorText =>
            /(references? missing column|not found in FROM clause)/i.test(errorText)
            && referencesStructuralMetadata(errorText),
        instruction: 'The missing column is a structural metadata column that is not guaranteed to exist in the current dataset binding. Remove that structural metadata column from plan.where, aggregate filters, groupBy, select, and orderBy unless the bound dataset explicitly exposes it.',
    },
    {
        category: 'missing_filter_column',
        match: errorText => errorText.includes('Query filter references missing column:'),
        instruction: 'Use only real source dataset columns inside plan.where. Do not filter on aggregate aliases such as record_count, because data.query does not support HAVING. If you need grouped counts, put count in plan.aggregates, include the alias in select/orderBy, and explain the grouped result instead of filtering on that alias.',
    },
    {
        category: 'aggregate_missing_column',
        match: errorText => /Query aggregate .+ references missing column:/i.test(errorText),
        instruction: 'CRITICAL: The aggregate.column value must be an actual column from the dataset schema, NOT an alias from a previous data.query result. For example, if a prior query returned "W1" as an alias for column "03-01-2010  - 09-01-2010 WEEK 1", the aggregate must reference the real column name "03-01-2010  - 09-01-2010 WEEK 1", not "W1". Check the dataset_columns section for available source column names.',
    },
    {
        category: 'bridge_missing_column',
        match: errorText => /Operation .+ references missing columns?:/i.test(errorText),
        instruction: 'A bridge operation references columns not in the current dataset. Remove the missing bridge/filter columns, especially any structural metadata column, or switch to a route that does not depend on them.',
    },
    {
        category: 'duckdb_missing_column',
        match: errorText => /Binder Error:.*not found in FROM clause/i.test(errorText),
        instruction: 'CRITICAL: DuckDB could not find a referenced column. The column name you used does NOT exist in the dataset. Check the available source columns list below and rewrite the query using ONLY exact column names from that list. Do not guess or combine column names — use them exactly as listed.',
    },
    {
        category: 'or_groups_required',
        match: errorText => isOrGroupsRepairIssue(errorText),
        instruction: 'When the user wants OR logic, do not place multiple alternatives in plan.where.predicates. Put each alternative in its own plan.where.groups entry, because top-level predicates compile as AND while groups compile as OR.',
    },
    {
        category: 'conditional_aggregate_required',
        match: errorText => isConditionalAggregateRepairIssue(errorText),
        instruction: 'Repair the grouped query by moving label filters into the matching plan.aggregates[].where clauses so each aggregate computes its own subset. Keep plan.where only for shared row filters. If the user needs a persistent derived metric such as Profit or Margin, validate the metric mapping first and then use data.mutate derive_metric_by_label.',
    },
    {
        category: 'aggregation_governance_violation',
        match: errorText => /aggregation_governance_violation:/i.test(errorText),
        instruction: 'Your aggregate function does not match the column semantics. The error message specifies which columns are non_additive (percentages, ratios, averages) or dimension_only. For non_additive columns use AVG instead of SUM. For dimension columns use COUNT or COUNT_DISTINCT instead of SUM/AVG. Rewrite the plan.aggregates with the correct function for each column.',
    },
];

export const getDataQueryRepairHintCategoryFromText = (
    errorText: string | null | undefined,
): DataQueryRepairHintCategory | null =>
    DATA_QUERY_REPAIR_RULES.find(rule => rule.match(errorText ?? ''))?.category ?? null;

export const getDataQueryRepairGuidance = (
    errors: string[] | string | null | undefined,
    options?: { availableColumns?: string[] },
): {
    repairHint: string;
    repairHintCategory: DataQueryRepairHintCategory | null;
    repairHintCategories: DataQueryRepairHintCategory[];
} => {
    const errorText = Array.isArray(errors)
        ? errors.join(' ')
        : typeof errors === 'string'
            ? errors
            : '';
    const matchedRules = DATA_QUERY_REPAIR_RULES.filter(rule => rule.match(errorText));
    if (matchedRules.length === 0) {
        return {
            repairHint: 'Repair the data.query payload with a bounded structured plan. Use plain select columns, add aggregates when using groupBy, keep every orderBy column in select, and materially change the where structure when OR logic is required.',
            repairHintCategory: null,
            repairHintCategories: [],
        };
    }

    const repairHintCategories = matchedRules.map(rule => rule.category);
    const repairInstructions = matchedRules.map(rule => rule.instruction);

    // When columns are missing, append available source column names so the AI
    // can self-correct without guessing.
    const hasMissingColumnError = repairHintCategories.some(c =>
        c === 'aggregate_missing_column' || c === 'missing_filter_column' || c === 'bridge_missing_column'
        || c === 'duckdb_missing_column' || c === 'structural_metadata_leak',
    );
    const columnHint = hasMissingColumnError && options?.availableColumns?.length
        ? ` Available source columns: [${options.availableColumns.slice(0, 20).map(c => `"${c}"`).join(', ')}].`
        : '';

    return {
        repairHint: `Repair the data.query payload instead of switching tools. ${repairInstructions.join(' ')}${columnHint}`,
        repairHintCategory: repairHintCategories[0] ?? null,
        repairHintCategories,
    };
};
