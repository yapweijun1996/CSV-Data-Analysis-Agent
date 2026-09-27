// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    getDataQueryRepairHintCategoryFromText,
    getDataQueryRepairGuidance,
    getDataQueryTraceLabel,
    hasSemanticQueryPlan,
    isConditionalAggregateRepairIssue,
    isOrGroupsRepairIssue,
    isPreviewDataQuery,
    normalizeDataQueryPayload,
    validateDataQueryPayload,
} from '../services/agent/execution/dataQueryContract';

describe('dataQueryContract', () => {
    it('rejects semantically empty query plans', () => {
        expect(hasSemanticQueryPlan({})).toBe(false);
        expect(validateDataQueryPayload({
            explanation: 'Inspect rows.',
            plan: {},
        })).toContain('"plan" must include at least one structured query clause: select, where, orderBy, limit, groupBy, or aggregates.');
    });

    it('rejects SQL-like expressions inside plan.select', () => {
        expect(validateDataQueryPayload({
            explanation: 'Count the rows.',
            plan: {
                select: ['COUNT(*) AS total_rows'],
            },
        })).toContain('"plan.select" must list plain output column names only. Use plan.aggregates for count/sum/avg instead of SQL expressions like COUNT(*) AS total_rows.');
    });

    it('accepts business column names that include units in parentheses', () => {
        expect(validateDataQueryPayload({
            explanation: 'Inspect HDB detail rows.',
            plan: {
                select: ['Floor Area (sqm)', 'Resale Price (SGD)'],
                limit: 25,
            },
        })).toEqual([]);
    });

    it('rejects malformed item-level query payloads before execution', () => {
        expect(validateDataQueryPayload({
            explanation: 'Inspect the data.',
            plan: {
                select: ['Region', undefined],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', as: 'TotalRevenue' }],
                orderBy: [{ direction: 'DESC' }],
                where: {
                    predicates: [{ operator: 'eq' }],
                },
            },
        })).toEqual(expect.arrayContaining([
            '"plan.select[1]" must be a non-empty string column name.',
            '"plan.aggregates[0].column" is required for sum queries.',
            '"plan.orderBy[0].column" must be a non-empty string column name.',
            '"plan.where.predicates[0]" must include a non-empty column name and a valid operator.',
        ]));
    });

    it('normalizes trimmed aggregate and ordering payloads into canonical runtime form', () => {
        expect(normalizeDataQueryPayload({
            explanation: '  Summarize revenue by region.  ',
            plan: {
                groupBy: [' Region '],
                aggregates: [{ function: 'SUM', column: ' Revenue ', as: ' TotalRevenue ' }],
                select: [' Region ', ' TotalRevenue '],
                orderBy: [{ column: ' TotalRevenue ', direction: 'DESC' }],
                limit: 5,
            },
        })).toEqual({
            explanation: 'Summarize revenue by region.',
            plan: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
                select: ['Region', 'TotalRevenue'],
                orderBy: [{ column: 'TotalRevenue', direction: 'desc' }],
                limit: 5,
            },
        });
    });

    it('normalizes aggregate-scoped filters into canonical runtime form', () => {
        expect(normalizeDataQueryPayload({
            explanation: 'Summarize revenue and cost by project.',
            plan: {
                groupBy: [' Project '],
                aggregates: [
                    {
                        function: 'SUM',
                        column: ' Value ',
                        as: ' total_revenue ',
                        where: {
                            predicates: [{ column: ' Description ', operator: 'IN', value: [' Revenue ', ' Net Sales / Revenue '] }],
                        },
                    },
                ],
                select: [' Project ', ' total_revenue '],
            },
        })).toEqual({
            explanation: 'Summarize revenue and cost by project.',
            plan: {
                groupBy: ['Project'],
                aggregates: [
                    {
                        function: 'sum',
                        column: 'Value',
                        as: 'total_revenue',
                        where: {
                            predicates: [{ column: 'Description', operator: 'in', value: [' Revenue ', ' Net Sales / Revenue '] }],
                        },
                    },
                ],
                select: ['Project', 'total_revenue'],
            },
        });
    });

    it('treats select+limit row previews as preview queries', () => {
        const plan = {
            select: ['Code', 'Description'],
            limit: 10,
        };

        expect(hasSemanticQueryPlan(plan)).toBe(true);
        expect(isPreviewDataQuery(plan)).toBe(true);
        expect(getDataQueryTraceLabel('analysis', plan)).toBe('Data Preview');
    });

    it('normalizes scalar IN values from model output into a bounded value list', () => {
        expect(normalizeDataQueryPayload({
            explanation: 'Compare two reporting months.',
            plan: {
                where: {
                    predicates: [{ column: 'Month', operator: 'in', value: '2020-01, 2025-01' }],
                },
                groupBy: ['Month'],
                aggregates: [{ function: 'avg', column: 'Amount', as: 'average_amount' }],
            },
        }).plan.where?.predicates).toEqual([
            { column: 'Month', operator: 'in', value: ['2020-01', '2025-01'] },
        ]);
    });

    it('keeps filtered and aggregate queries out of preview mode', () => {
        const filteredPlan = {
            where: {
                predicates: [{ column: 'Description', operator: 'contains' as const, value: 'Construction' }],
            },
            limit: 10,
        };
        const aggregatePlan = {
            groupBy: ['Region'],
            aggregates: [{ function: 'sum' as const, column: 'Amount', as: 'TotalAmount' }],
            select: ['Region', 'TotalAmount'],
            limit: 10,
        };

        expect(isPreviewDataQuery(filteredPlan)).toBe(false);
        expect(getDataQueryTraceLabel('analysis', filteredPlan)).toBe('Analysis Query');
        expect(isPreviewDataQuery(aggregatePlan)).toBe(false);
        expect(getDataQueryTraceLabel('verify', aggregatePlan)).toBe('Verify Query');
    });

    it('builds repair guidance for common aggregate-query contract failures', () => {
        const guidance = getDataQueryRepairGuidance([
            '"plan.aggregates[0].function" must be one of count, count_distinct, sum, avg, min, max, median, or percentile.',
            '"plan.groupBy" requires at least one aggregate in "plan.aggregates".',
            '"plan.orderBy[0].column" must also appear in "plan.select" for bounded read-only queries.',
        ]);

        expect(guidance.repairHintCategory).toBe('invalid_aggregate_function');
        expect(guidance.repairHintCategories).toEqual([
            'invalid_aggregate_function',
            'missing_aggregate_for_group_by',
            'orderby_not_selected',
        ]);
        expect(guidance.repairHint).toContain('count, count_distinct, sum, avg, min, max, median, or percentile');
        expect(guidance.repairHint).toContain('add at least one aggregate');
        expect(guidance.repairHint).toContain('Add every plan.orderBy[].column to plan.select');
    });

    it('builds repair guidance for execution-time missing filter columns', () => {
        const guidance = getDataQueryRepairGuidance(
            'Query filter references missing column: record_count',
        );

        expect(guidance.repairHintCategory).toBe('missing_filter_column');
        expect(guidance.repairHintCategories).toEqual(['missing_filter_column']);
        expect(guidance.repairHint).toContain('real source dataset columns');
        expect(guidance.repairHint).toContain('does not support HAVING');
        expect(guidance.repairHint).toContain('record_count');
    });

    it('builds repair guidance for AND-vs-OR query mistakes', () => {
        const guidance = getDataQueryRepairGuidance(
            "The previous query logic is still using an AND condition in the SQL generation despite the user's explicit goal to use OR. The SQL preview shows 'LIKE %revenue% AND LIKE %cost%', which is why it continues to return zero rows.",
        );

        expect(isOrGroupsRepairIssue('use OR instead of AND')).toBe(true);
        expect(guidance.repairHintCategory).toBe('or_groups_required');
        expect(guidance.repairHintCategories).toEqual(['or_groups_required']);
        expect(guidance.repairHint).toContain('plan.where.groups');
        expect(guidance.repairHint).toContain('top-level predicates compile as AND while groups compile as OR');
    });

    it('classifies CASE WHEN-style semantic misses as conditional aggregation repairs', () => {
        const errorText = "The SQL query generated in the latest step does not actually include a 'CASE WHEN' clause for the 'Description' column. As a result, 'total_revenue' and 'total_cost' are calculating the same sum for every 'SeriesLabelL1', failing to distinguish between revenue and cost line items.";
        const guidance = getDataQueryRepairGuidance(errorText);

        expect(isConditionalAggregateRepairIssue(errorText)).toBe(true);
        expect(getDataQueryRepairHintCategoryFromText(errorText)).toBe('conditional_aggregate_required');
        expect(guidance.repairHintCategory).toBe('conditional_aggregate_required');
        expect(guidance.repairHintCategories).toEqual(['conditional_aggregate_required']);
        expect(guidance.repairHint).toContain('plan.aggregates[].where');
        expect(guidance.repairHint).toContain('derive_metric_by_label');
    });

    it('classifies single-total revenue and cost semantic misses as conditional aggregation repairs', () => {
        const errorText = "The current query aggregated all revenue and cost values into a single 'TotalValue' per SeriesLabelL1, effectively summing them rather than separating them into distinct Revenue and Cost columns to allow for a calculation of profit (Revenue - Cost).";
        const guidance = getDataQueryRepairGuidance(errorText);

        expect(isConditionalAggregateRepairIssue(errorText)).toBe(true);
        expect(getDataQueryRepairHintCategoryFromText(errorText)).toBe('conditional_aggregate_required');
        expect(guidance.repairHintCategory).toBe('conditional_aggregate_required');
        expect(guidance.repairHint).toContain('plan.aggregates[].where');
        expect(guidance.repairHint).toContain('derive_metric_by_label');
    });

    it('classifies structural metadata leak errors as recoverable', () => {
        const guidance = getDataQueryRepairGuidance(
            'Query groupBy references missing column: RowRole',
        );
        expect(guidance.repairHintCategory).toBe('structural_metadata_leak');
        expect(guidance.repairHintCategories).toContain('structural_metadata_leak');
        expect(guidance.repairHint).toContain('structural metadata column');
    });

    it('classifies aggregate missing-column errors as recoverable', () => {
        const guidance = getDataQueryRepairGuidance(
            'Query aggregate "Q4_2010_TOTAL" references missing column: OCT 2010 + NOV 2010 + DEC 2010',
        );
        expect(guidance.repairHintCategory).toBe('aggregate_missing_column');
        expect(guidance.repairHintCategories).toContain('aggregate_missing_column');
        expect(guidance.repairHint).toContain('actual column from the dataset schema');
    });

    it('classifies bridge operation missing-column errors as recoverable', () => {
        const guidance = getDataQueryRepairGuidance(
            'Operation "query_where_bridge" references missing columns: RowRole',
        );
        expect(guidance.repairHintCategories).toContain('structural_metadata_leak');
        expect(guidance.repairHintCategories).toContain('bridge_missing_column');
        expect(guidance.repairHint).toContain('structural metadata column');
    });

    it('classifies DuckDB binder errors as recoverable', () => {
        const guidance = getDataQueryRepairGuidance(
            'Binder Error: Referenced column "RowRole" not found in FROM clause!',
        );
        expect(guidance.repairHintCategories).toContain('structural_metadata_leak');
        expect(guidance.repairHintCategories).toContain('duckdb_missing_column');
        expect(guidance.repairHint).toContain('structural metadata column');
    });

    it('classifies DuckDB binder errors for non-structural columns as recoverable', () => {
        const guidance = getDataQueryRepairGuidance(
            'Binder Error: Referenced column "FAKE_COLUMN" not found in FROM clause!',
        );
        expect(guidance.repairHintCategory).toBe('duckdb_missing_column');
        expect(guidance.repairHintCategories).toEqual(['duckdb_missing_column']);
        expect(guidance.repairHint).toContain('DuckDB could not find');
    });

    it('appends available columns to duckdb_missing_column repair hint', () => {
        const guidance = getDataQueryRepairGuidance(
            'Binder Error: Referenced column "TOTAL SGD" not found in FROM clause!',
            { availableColumns: ['TOTAL', 'GST', 'NET TOTAL FOREX', 'GST CODE'] },
        );
        expect(guidance.repairHintCategory).toBe('duckdb_missing_column');
        expect(guidance.repairHint).toContain('Available source columns:');
        expect(guidance.repairHint).toContain('"TOTAL"');
        expect(guidance.repairHint).toContain('"GST"');
    });

    it('preserves backward compatibility for existing missing_filter_column rule', () => {
        const guidance = getDataQueryRepairGuidance(
            'Query filter references missing column: record_count',
        );
        expect(guidance.repairHintCategory).toBe('missing_filter_column');
        expect(guidance.repairHintCategories).toEqual(['missing_filter_column']);
    });

    it('supports richer aggregates and post-aggregate filters in canonical payloads', () => {
        expect(normalizeDataQueryPayload({
            explanation: 'Compare distinct customers by region.',
            plan: {
                groupBy: [' Region '],
                aggregates: [{ function: 'COUNT_DISTINCT', column: ' Customer_ID ', as: ' distinct_customers ' }],
                postAggregateFilter: {
                    predicates: [{ column: ' distinct_customers ', operator: 'gte', value: 5 }],
                },
                select: [' Region ', ' distinct_customers '],
                orderBy: [{ column: ' distinct_customers ', direction: 'DESC' }],
            },
        })).toEqual({
            explanation: 'Compare distinct customers by region.',
            plan: {
                groupBy: ['Region'],
                aggregates: [{ function: 'count_distinct', column: 'Customer_ID', as: 'distinct_customers' }],
                postAggregateFilter: {
                    predicates: [{ column: 'distinct_customers', operator: 'gte', value: 5 }],
                },
                select: ['Region', 'distinct_customers'],
                orderBy: [{ column: 'distinct_customers', direction: 'desc' }],
            },
        });
    });

    it('validates percentile and post-aggregate filter references deterministically', () => {
        expect(validateDataQueryPayload({
            explanation: 'Summarize percentile revenue by region.',
            plan: {
                groupBy: ['Region'],
                aggregates: [{ function: 'percentile', column: 'Revenue', as: 'p90_revenue', percentile: 0.9 }],
                select: ['Region', 'p90_revenue'],
                postAggregateFilter: {
                    predicates: [{ column: 'Revenue', operator: 'gte', value: 1000 }],
                },
            },
        })).toContain('"plan.postAggregateFilter" predicate 1 must reference a groupBy column or aggregate alias from the aggregate output.');
    });

    it('validates aggregate-scoped filters deterministically', () => {
        expect(validateDataQueryPayload({
            explanation: 'Summarize revenue by project.',
            plan: {
                groupBy: ['Project'],
                aggregates: [
                    {
                        function: 'sum',
                        column: 'Value',
                        as: 'total_revenue',
                        where: {
                            predicates: [{ operator: 'eq', value: 'Revenue' }],
                        },
                    },
                ],
                select: ['Project', 'total_revenue'],
            },
        })).toContain('"plan.aggregates[0].where.predicates[0]" must include a non-empty column name and a valid operator.');
    });

    it('classifies aggregation_governance_violation error text', () => {
        const errorText = 'aggregation_governance_violation: SUM(Margin_Pct) is invalid — "Margin_Pct" is non_additive, use AVG instead';
        expect(getDataQueryRepairHintCategoryFromText(errorText)).toBe('aggregation_governance_violation');
        const guidance = getDataQueryRepairGuidance(errorText);
        expect(guidance.repairHintCategory).toBe('aggregation_governance_violation');
        expect(guidance.repairHint).toContain('aggregate function does not match');
    });
});
