// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    collectEvidencePlanStabilityReasonCodes,
    normalizeAndValidateSqlAnalysisPlan,
    normalizeAndValidateSqlEvidenceQueryPlan,
} from '../services/agent/planning/sqlPlanValidator';
import { PLANNER_STABILITY_REASON_CODES } from '../services/agent/planning/plannerStability';
import { detectPeriodColumnFamilies } from '../services/agent/runtime/periodColumnDetector';

const columns = [
    { name: 'ProjectCode', type: 'categorical', uniqueValues: 120 },
    { name: 'Revenue', type: 'numerical' },
    { name: 'Region', type: 'categorical', uniqueValues: 4 },
] as const;

describe('sqlPlanValidator', () => {
    it('fails when required chart bindings are missing', () => {
        const result = normalizeAndValidateSqlAnalysisPlan({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            bindings: {
                groupByColumn: 'Region',
            },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
            },
        }, [...columns]);

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain("For a 'bar' chart, bindings.valueColumn is required.");
    });

    it('auto-repairs missing aggregate aliases in select and passes validation', () => {
        // The auto-repair layer adds missing aggregate aliases to query.select
        // before validation runs, so plans that previously failed with
        // "bindings.valueColumn must reference a selected output column"
        // now pass after deterministic repair.
        const result = normalizeAndValidateSqlAnalysisPlan({
            chartType: 'bar',
            title: 'Revenue by Region',
            description: 'Compare revenue by region.',
            queryMode: 'aggregate',
            bindings: {
                groupByColumn: 'Region',
                valueColumn: 'Revenue',
            },
            query: {
                select: ['Region'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
            },
        }, [...columns]);

        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        // The repair should have added 'Revenue' to select
        expect(result.validPlan!.query.select).toContain('Revenue');
    });

    it('allows identifier-grain plans when bindings are complete', () => {
        const result = normalizeAndValidateSqlAnalysisPlan({
            chartType: 'bar',
            title: 'Top Project Revenue',
            description: 'Rank project revenue.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: {
                groupByColumn: 'ProjectCode',
                valueColumn: 'Revenue',
            },
            query: {
                groupBy: ['ProjectCode'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 10,
            },
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.bindings.groupByColumn).toBe('ProjectCode');
        expect(result.validPlan?.query.limit).toBe(10);
    });

    it('repairs combo bindings from aggregate aliases and query groupBy columns', () => {
        const result = normalizeAndValidateSqlAnalysisPlan({
            chartType: 'combo',
            title: 'Original vs Revised by Project',
            description: 'Compare original and revised budget totals by project.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            secondaryAggregation: 'sum',
            bindings: {
                yValueColumn: 'Revised',
            },
            query: {
                groupBy: ['ProjectCode'],
                aggregates: [
                    { function: 'sum', column: 'Original', as: 'Original' },
                    { function: 'sum', column: 'Revised', as: 'Revised' },
                ],
                orderBy: [{ column: 'Original', direction: 'desc' }],
                limit: 10,
            },
        }, [
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 120 },
            { name: 'Original', type: 'numerical' },
            { name: 'Revised', type: 'numerical' },
        ]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.bindings).toMatchObject({
            groupByColumn: 'ProjectCode',
            valueColumn: 'Original',
            secondaryValueColumn: 'Revised',
        });
        expect(result.validPlan?.query.select).toEqual(['ProjectCode', 'Original', 'Revised']);
    });

    it('downgrades unstable combo plans instead of inventing a second metric', () => {
        const result = normalizeAndValidateSqlAnalysisPlan({
            chartType: 'combo',
            title: 'Revenue by Region',
            description: 'Compare revenue totals by region.',
            queryMode: 'aggregate',
            aggregation: 'sum',
            bindings: {
                groupByColumn: 'Region',
            },
            query: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
            },
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan).toMatchObject({
            chartType: 'bar',
            bindings: {
                groupByColumn: 'Region',
                valueColumn: 'Revenue',
                secondaryValueColumn: undefined,
            },
        });
        expect(result.validPlan?.query.select).toEqual(['Region', 'Revenue']);
    });

    it('validates evidence queries without requiring chart bindings', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Revenue evidence by Region',
            queryMode: 'aggregate',
            intentSummary: 'Inspect grouped revenue evidence by region.',
            preFilter: [{ column: 'Region', value: 'East' }],
            query: {
                select: ['Region', 'total_revenue'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            },
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.query.select).toEqual(['Region', 'total_revenue']);
        expect(result.validPlan?.preFilter).toEqual([{ column: 'Region', operator: 'eq', value: 'East' }]);
    });

    it('auto-repairs missing aggregate aliases in evidence query select and passes validation', () => {
        // The auto-repair layer adds missing aggregate aliases to query.select
        // before validation runs, so plans that previously failed with
        // "query.aggregates[0].as must appear in query.select" now pass.
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Revenue evidence by Region',
            queryMode: 'aggregate',
            intentSummary: 'Inspect grouped revenue evidence by region.',
            query: {
                select: ['Region'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_revenue' }],
            },
        }, [...columns]);

        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toHaveLength(0);
        expect(result.validPlan!.query.select).toContain('total_revenue');
    });

    it('merges duplicate quarter aliases into a single combined aggregate expression', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Q4 sales by staff',
            queryMode: 'aggregate',
            intentSummary: 'Inspect Q4 sales totals grouped by staff name.',
            query: {
                select: ['STAFF NAME', 'Q4_2010_TOTAL'],
                groupBy: ['STAFF NAME'],
                aggregates: [
                    { function: 'sum', column: 'OCT 2010', as: 'Q4_2010_TOTAL' },
                    { function: 'sum', column: 'NOV 2010', as: 'Q4_2010_TOTAL' },
                    { function: 'sum', column: 'DEC 2010', as: 'Q4_2010_TOTAL' },
                ],
                orderBy: [{ column: 'Q4_2010_TOTAL', direction: 'desc' }],
            },
        }, [
            { name: 'STAFF NAME', type: 'categorical', uniqueValues: 21 },
            { name: 'OCT 2010', type: 'numerical', uniqueValues: 21 },
            { name: 'NOV 2010', type: 'numerical', uniqueValues: 21 },
            { name: 'DEC 2010', type: 'numerical', uniqueValues: 21 },
        ]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.query.aggregates).toEqual([
            { function: 'sum', column: 'OCT 2010 + NOV 2010 + DEC 2010', as: 'Q4_2010_TOTAL' },
        ]);
        expect(result.validPlan?.query.select).toEqual(['STAFF NAME', 'Q4_2010_TOTAL']);
        expect(result.validPlan?.query.orderBy).toEqual([{ column: 'Q4_2010_TOTAL', direction: 'desc' }]);
    });

    it('fails rowset evidence queries with fewer than two selected output columns', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Row detail evidence',
            queryMode: 'rowset',
            intentSummary: 'Inspect row-level evidence.',
            query: {
                select: ['Revenue'],
                limit: 20,
            },
        }, [...columns]);

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain('Rowset evidence queries must expose at least two selected output columns.');
    });

    it('rejects count evidence plans when the counted column does not match the topic wording', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Count of SO Numbers by Region',
            queryMode: 'aggregate',
            intentSummary: 'Count customer part numbers by region.',
            query: {
                select: ['Region', 'count_customer_part_no'],
                groupBy: ['Region'],
                aggregates: [{ function: 'count', column: 'Revenue', as: 'count_customer_part_no' }],
            },
        }, [
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
            { name: 'Revenue', type: 'numerical' },
        ], {
            topic: 'Count of SO Numbers by Region',
        });

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain('Count topic mentions SO Number, but the evidence query counts "Revenue" instead.');
    });

    it('allows COUNT(*) for count-of-records topics grouped by a structural role column', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Count of records by Resolved Row Role',
            queryMode: 'aggregate',
            intentSummary: 'Count records grouped by resolved row role.',
            query: {
                select: ['ResolvedRowRole', 'record_count'],
                groupBy: ['ResolvedRowRole'],
                aggregates: [{ function: 'count', as: 'record_count' }],
            },
        }, [
            { name: 'ResolvedRowRole', type: 'categorical', uniqueValues: 4 },
            { name: 'RowRole', type: 'categorical', uniqueValues: 4 },
            { name: 'Revenue', type: 'numerical' },
        ], {
            topic: 'Count of records by Resolved Row Role',
        });

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.query.aggregates?.[0]?.function).toBe('count');
        expect(result.validPlan?.query.aggregates?.[0]?.column).toBeUndefined();
    });

    it('allows count_distinct evidence plans when the counted identifier matches the topic wording', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Count of SO Numbers by Region',
            queryMode: 'aggregate',
            intentSummary: 'Count distinct SO numbers by region.',
            query: {
                select: ['Region', 'count_distinct_so_number'],
                groupBy: ['Region'],
                aggregates: [{ function: 'count_distinct', column: 'SO Number', as: 'count_distinct_so_number' }],
            },
        }, [
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
            { name: 'Revenue', type: 'numerical' },
        ], {
            topic: 'Count of SO Numbers by Region',
        });

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.query.aggregates?.[0]).toMatchObject({
            function: 'count_distinct',
            column: 'SO Number',
        });
    });

    it('rejects evidence plans when the groupBy does not match the topic by-clause target', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Count of SO Numbers by Sales Executive',
            queryMode: 'aggregate',
            intentSummary: 'Count distinct SO numbers.',
            query: {
                select: ['SO Number', 'count_distinct_so_number'],
                groupBy: ['SO Number'],
                aggregates: [{ function: 'count_distinct', column: 'SO Number', as: 'count_distinct_so_number' }],
            },
        }, [
            { name: 'Sales Executive', type: 'categorical', uniqueValues: 12 },
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
        ], {
            topic: 'Count of SO Numbers by Sales Executive',
        });

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain('Evidence query groupBy "SO Number" does not match the topic grouping target "Sales Executive".');
    });

    it('rejects evidence plans when runtime intent specifies a different metric or groupBy', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Count of SO Numbers by Sales Executive',
            queryMode: 'aggregate',
            intentSummary: 'Count distinct SO numbers by sales executive.',
            query: {
                select: ['Customer Country', 'count_distinct_so_number'],
                groupBy: ['Customer Country'],
                aggregates: [{ function: 'count_distinct', column: 'SO Number', as: 'count_distinct_so_number' }],
            },
        }, [
            { name: 'Sales Executive', type: 'categorical', uniqueValues: 12 },
            { name: 'Customer Country', type: 'categorical', uniqueValues: 7 },
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
        ], {
            topic: 'Count of SO Numbers by Sales Executive',
            intent: {
                preferredGroupBy: 'Sales Executive',
                preferredMetric: 'SO Number',
            },
        });

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain('Evidence query groupBy "Customer Country" does not match runtime intent "Sales Executive".');
    });

    it('ignores unusable runtime intent when a non-count topic has metric and groupBy swapped upstream', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Sum of Order Qty by SO No.',
            queryMode: 'aggregate',
            intentSummary: 'Sum order quantity grouped by sales order number.',
            query: {
                select: ['SO No.', 'sum_order_qty'],
                groupBy: ['SO No.'],
                aggregates: [{ function: 'sum', column: 'Order Qty', as: 'sum_order_qty' }],
            },
        }, [
            { name: 'SO No.', type: 'categorical', uniqueValues: 80 },
            { name: 'Order Qty', type: 'numerical', uniqueValues: 40 },
            { name: 'Customer Name', type: 'categorical', uniqueValues: 20 },
        ], {
            topic: 'Sum of Order Qty by SO No.',
            intent: {
                preferredGroupBy: 'Order Qty',
                preferredMetric: 'SO No.',
            },
        });

        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);
    });

    it('recovers count topics when runtime intent confuses the counted identifier for the grouping dimension', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Count of SO Number by Brand',
            queryMode: 'aggregate',
            intentSummary: 'Count distinct SO numbers grouped by brand.',
            query: {
                select: ['Brand', 'count_distinct_so_number'],
                groupBy: ['Brand'],
                aggregates: [{ function: 'count_distinct', column: 'SO Number', as: 'count_distinct_so_number' }],
            },
        }, [
            { name: 'Brand', type: 'categorical', uniqueValues: 12 },
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
            { name: 'Customer Name', type: 'categorical', uniqueValues: 30 },
        ], {
            topic: 'Count of SO Number by Brand',
            intent: {
                preferredGroupBy: 'SO Number',
                preferredMetric: 'Brand',
            },
        });

        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);
        expect(collectEvidencePlanStabilityReasonCodes(result.validPlan!, [
            { name: 'Brand', type: 'categorical', uniqueValues: 12 },
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
            { name: 'Customer Name', type: 'categorical', uniqueValues: 30 },
        ], {
            topic: 'Count of SO Number by Brand',
            intent: {
                preferredGroupBy: 'SO Number',
                preferredMetric: 'Brand',
            },
        })).toContain(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    });

    it('records an intent-mismatch recovery reason code when topic semantics override a stale runtime hypothesis', () => {
        const { validPlan } = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Revenue by Region',
            queryMode: 'aggregate',
            intentSummary: 'Inspect revenue by region.',
            query: {
                select: ['Region', 'sum_revenue'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'sum_revenue' }],
            },
        }, [...columns], {
            topic: 'Revenue by Region',
            intent: {
                preferredGroupBy: 'Revenue',
                preferredMetric: 'Region',
            },
        });

        expect(validPlan).not.toBeNull();
        expect(collectEvidencePlanStabilityReasonCodes(validPlan!, [...columns], {
            topic: 'Revenue by Region',
            intent: {
                preferredGroupBy: 'Revenue',
                preferredMetric: 'Region',
            },
        })).toContain(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    });

    it('accepts explicit by-clause groupings when runtime intent keeps a stale identifier grain', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Code by Project',
            queryMode: 'aggregate',
            intentSummary: 'Inspect code totals grouped by project.',
            query: {
                select: ['Project', 'sum_code'],
                groupBy: ['Project'],
                aggregates: [{ function: 'sum', column: 'Code', as: 'sum_code' }],
            },
        }, [
            { name: 'Project', type: 'categorical', uniqueValues: 42 },
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 43 },
            { name: 'Code', type: 'numerical', uniqueValues: 400 },
        ], {
            topic: 'Code by Project',
            intent: {
                preferredGroupBy: 'ProjectCode',
                preferredMetric: 'Code',
            },
        });

        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);
        expect(collectEvidencePlanStabilityReasonCodes(result.validPlan!, [
            { name: 'Project', type: 'categorical', uniqueValues: 42 },
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 43 },
            { name: 'Code', type: 'numerical', uniqueValues: 400 },
        ], {
            topic: 'Code by Project',
            intent: {
                preferredGroupBy: 'ProjectCode',
                preferredMetric: 'Code',
            },
        })).toContain(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    });

    it('prefers ProjectCode over Project when the topic explicitly says Project Code', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Value by Project Code',
            queryMode: 'aggregate',
            intentSummary: 'Inspect value totals grouped by project code.',
            query: {
                select: ['ProjectCode', 'sum_value'],
                groupBy: ['ProjectCode'],
                aggregates: [{ function: 'sum', column: 'Value', as: 'sum_value' }],
            },
        }, [
            { name: 'Project', type: 'categorical', uniqueValues: 42 },
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 43 },
            { name: 'Value', type: 'numerical', uniqueValues: 400 },
        ], {
            topic: 'Value by Project Code',
            intent: {
                preferredGroupBy: 'Project',
                preferredMetric: 'Value',
            },
        });

        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);
        expect(collectEvidencePlanStabilityReasonCodes(result.validPlan!, [
            { name: 'Project', type: 'categorical', uniqueValues: 42 },
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 43 },
            { name: 'Value', type: 'numerical', uniqueValues: 400 },
        ], {
            topic: 'Value by Project Code',
            intent: {
                preferredGroupBy: 'Project',
                preferredMetric: 'Value',
            },
        })).toContain(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    });

    it('does not recover an ambiguous prefix match when the topic explicitly targets Project Code', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Value by Project Code',
            queryMode: 'aggregate',
            intentSummary: 'Inspect value totals grouped by project code.',
            query: {
                select: ['Project', 'sum_value'],
                groupBy: ['Project'],
                aggregates: [{ function: 'sum', column: 'Value', as: 'sum_value' }],
            },
        }, [
            { name: 'Project', type: 'categorical', uniqueValues: 42 },
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 43 },
            { name: 'Value', type: 'numerical', uniqueValues: 400 },
        ], {
            topic: 'Value by Project Code',
            intent: {
                preferredGroupBy: 'ProjectCode',
                preferredMetric: 'Value',
            },
        });

        // Plan uses "Project" but topic explicitly says "Project Code" → the topic
        // wording check catches this (Project is not a distinct target for "project code"
        // because ProjectCode scores higher and contains the shorter name).
        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain('Evidence query groupBy "Project" does not match the topic grouping target "ProjectCode".');
    });

    it('allows column-family alternative when auto-renamed duplicate headers share tokens (PARTY / PARTY_2)', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Total Price Local by Party',
            queryMode: 'aggregate',
            intentSummary: 'Sum total price grouped by party.',
            query: {
                select: ['PARTY_2', 'sum_total_price_local'],
                groupBy: ['PARTY_2'],
                aggregates: [{ function: 'sum', column: 'TOTAL PRICE LOCAL', as: 'sum_total_price_local' }],
            },
        }, [
            { name: 'PARTY', type: 'categorical', uniqueValues: 40 },
            { name: 'PARTY_2', type: 'categorical', uniqueValues: 35 },
            { name: 'TOTAL PRICE LOCAL', type: 'currency', uniqueValues: 800 },
            { name: 'TRANSACT DATE', type: 'date', uniqueValues: 200 },
        ], {
            topic: 'Total Price Local by Party',
            intent: {
                preferredGroupBy: 'PARTY_2',
                preferredMetric: 'TOTAL PRICE LOCAL',
            },
        });

        // PARTY_2 is a valid alternative for "by party" because the topic's
        // grouping clause mentions both PARTY and PARTY_2 via token matching.
        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);
        expect(collectEvidencePlanStabilityReasonCodes(result.validPlan!, [
            { name: 'PARTY', type: 'categorical', uniqueValues: 40 },
            { name: 'PARTY_2', type: 'categorical', uniqueValues: 35 },
            { name: 'TOTAL PRICE LOCAL', type: 'currency', uniqueValues: 800 },
            { name: 'TRANSACT DATE', type: 'date', uniqueValues: 200 },
        ], {
            topic: 'Total Price Local by Party',
            intent: {
                preferredGroupBy: 'PARTY_2',
                preferredMetric: 'TOTAL PRICE LOCAL',
            },
        })).toContain(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    });

    it('rejects ratio-like SUM evidence plans when the topic asks for an average percentage metric', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Average Profit Ratio Percentage per Sales Order Number',
            queryMode: 'aggregate',
            intentSummary: 'Average profit ratio grouped by sales order number.',
            query: {
                select: ['SO Number', 'sum_profit_ratio_%'],
                groupBy: ['SO Number'],
                aggregates: [{ function: 'sum', column: 'Profit Ratio %', as: 'sum_profit_ratio_%' }],
            },
        }, [
            { name: 'SO Number', type: 'categorical', uniqueValues: 80 },
            { name: 'Profit Ratio %', type: 'percentage', uniqueValues: 40 },
        ], {
            topic: 'Average Profit Ratio Percentage per Sales Order Number',
        });

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain('Evidence query metric "Profit Ratio %" is ratio-like for topic "Average Profit Ratio Percentage per Sales Order Number", so the aggregate function must be AVG instead of SUM.');
    });

    it('allows YTD GROSS PROFIT when intent prefers GROSS PROFIT via column-family identity', () => {
        const salesBuColumns = [
            { name: 'SALES EXEC', type: 'categorical' as const, uniqueValues: 6 },
            { name: 'SALES', type: 'currency' as const, uniqueValues: 6 },
            { name: 'COST', type: 'currency' as const, uniqueValues: 6 },
            { name: 'GROSS PROFIT', type: 'currency' as const, uniqueValues: 6 },
            { name: 'GP %', type: 'percentage' as const, uniqueValues: 6 },
            { name: 'YTD SALES', type: 'currency' as const, uniqueValues: 6 },
            { name: 'YTD COST', type: 'currency' as const, uniqueValues: 6 },
            { name: 'YTD GROSS PROFIT', type: 'currency' as const, uniqueValues: 6 },
            { name: 'YTD GP %', type: 'percentage' as const, uniqueValues: 6 },
        ];

        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'YTD Gross Profit by Sales Exec',
            queryMode: 'aggregate',
            intentSummary: 'Sum YTD gross profit grouped by sales exec.',
            query: {
                select: ['SALES EXEC', 'sum_ytd_gross_profit'],
                groupBy: ['SALES EXEC'],
                aggregates: [{ function: 'sum', column: 'YTD GROSS PROFIT', as: 'sum_ytd_gross_profit' }],
            },
        }, salesBuColumns, {
            topic: 'YTD Gross Profit by Sales Exec',
            intent: {
                preferredGroupBy: 'SALES EXEC',
                preferredMetric: 'GROSS PROFIT',
            },
        });

        // "YTD GROSS PROFIT" shares column-family identity with "GROSS PROFIT"
        // (tokens "gross","profit" are a subset of "ytd","gross","profit"),
        // so the intent mismatch is recovered.
        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);

        // Stability recovery should fire for metric column-family identity.
        const stabilityReasonCodes = collectEvidencePlanStabilityReasonCodes(result.validPlan!, salesBuColumns, {
            topic: 'YTD Gross Profit by Sales Exec',
            intent: {
                preferredGroupBy: 'SALES EXEC',
                preferredMetric: 'GROSS PROFIT',
            },
        });
        expect(stabilityReasonCodes).toContain(PLANNER_STABILITY_REASON_CODES.intentMismatchRecovered);
    });

    it('allows SALES when intent prefers YTD SALES via column-family identity (reverse direction)', () => {
        const salesBuColumns = [
            { name: 'SALES EXEC', type: 'categorical' as const, uniqueValues: 6 },
            { name: 'SALES', type: 'currency' as const, uniqueValues: 6 },
            { name: 'YTD SALES', type: 'currency' as const, uniqueValues: 6 },
            { name: 'GROSS PROFIT', type: 'currency' as const, uniqueValues: 6 },
        ];

        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Sales by Sales Exec',
            queryMode: 'aggregate',
            intentSummary: 'Sum sales grouped by sales exec.',
            query: {
                select: ['SALES EXEC', 'sum_sales'],
                groupBy: ['SALES EXEC'],
                aggregates: [{ function: 'sum', column: 'SALES', as: 'sum_sales' }],
            },
        }, salesBuColumns, {
            topic: 'Sales by Sales Exec',
            intent: {
                preferredGroupBy: 'SALES EXEC',
                preferredMetric: 'YTD SALES',
            },
        });

        // "SALES" is a token-subset of "YTD SALES", so the mismatch is recovered.
        expect(result.validPlan).not.toBeNull();
        expect(result.errors).toEqual([]);
    });

    // --- Semantic alignment fallback tests ---

    it('accepts a metric column that does not literally match topic text when semantic hints confirm it as a known metric', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Total Sales Amount by Region',
            queryMode: 'aggregate',
            intentSummary: 'Sum total price local grouped by region.',
            query: {
                select: ['Region', 'sum_total_price_local'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'TOTAL PRICE LOCAL', as: 'sum_total_price_local' }],
            },
        }, [
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
            { name: 'TOTAL PRICE LOCAL', type: 'currency', uniqueValues: 500 },
            { name: 'PARTY_2', type: 'categorical', uniqueValues: 30 },
        ], {
            topic: 'Total Sales Amount by Region',
            semanticHints: {
                knownMetricColumns: ['TOTAL PRICE LOCAL'],
                knownDimensionColumns: ['Region', 'PARTY_2'],
            },
        });

        expect(result.errors).toEqual([]);
        expect(result.validPlan).not.toBeNull();
    });

    it('accepts a groupBy column that does not literally match topic text when semantic hints confirm it as a known dimension', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Revenue by Delivery Location',
            queryMode: 'aggregate',
            intentSummary: 'Sum revenue grouped by delivery location.',
            query: {
                select: ['DELV_LOC_CODE', 'sum_revenue'],
                groupBy: ['DELV_LOC_CODE'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'sum_revenue' }],
            },
        }, [
            { name: 'DELV_LOC_CODE', type: 'categorical', uniqueValues: 15 },
            { name: 'Revenue', type: 'numerical', uniqueValues: 200 },
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
        ], {
            topic: 'Revenue by Delivery Location',
            semanticHints: {
                knownDimensionColumns: ['DELV_LOC_CODE', 'Region'],
                knownMetricColumns: ['Revenue'],
            },
        });

        expect(result.errors).toEqual([]);
        expect(result.validPlan).not.toBeNull();
    });

    it('rejects a categorical column as SUM metric even when semantic hints list it', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Revenue by Region',
            queryMode: 'aggregate',
            intentSummary: 'Sum party 2 grouped by region.',
            query: {
                select: ['Region', 'sum_party_2'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'PARTY_2', as: 'sum_party_2' }],
            },
        }, [
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
            { name: 'PARTY_2', type: 'categorical', uniqueValues: 30 },
            { name: 'Revenue', type: 'numerical', uniqueValues: 200 },
        ], {
            topic: 'Revenue by Region',
            semanticHints: {
                knownMetricColumns: ['PARTY_2'],
                knownDimensionColumns: ['Region'],
            },
        });

        // Type guard: categorical column cannot be a valid metric even if hints say so
        expect(result.validPlan).toBeNull();
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('still rejects metric mismatch when no semantic hints are provided (backward compatibility)', () => {
        // Topic mentions "Amount" which matches the AMOUNT column, but the plan uses
        // TOTAL PRICE LOCAL — without semantic hints this is rejected.
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Sum of Amount by Region',
            queryMode: 'aggregate',
            intentSummary: 'Sum total price local grouped by region.',
            query: {
                select: ['Region', 'sum_total_price_local'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'TOTAL PRICE LOCAL', as: 'sum_total_price_local' }],
            },
        }, [
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
            { name: 'TOTAL PRICE LOCAL', type: 'currency', uniqueValues: 500 },
            { name: 'Amount', type: 'currency', uniqueValues: 300 },
        ], {
            topic: 'Sum of Amount by Region',
            // No semanticHints — original literal-matching behavior applies
        });

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain(
            'Evidence query metric "TOTAL PRICE LOCAL" does not match the topic wording. Expected one of: Amount',
        );
    });

    it('accepts a metric via candidateMetrics fallback when not in knownMetricColumns', () => {
        const result = normalizeAndValidateSqlEvidenceQueryPlan({
            title: 'Total Sales Amount by Region',
            queryMode: 'aggregate',
            intentSummary: 'Sum total price local grouped by region.',
            query: {
                select: ['Region', 'sum_total_price_local'],
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'TOTAL PRICE LOCAL', as: 'sum_total_price_local' }],
            },
        }, [
            { name: 'Region', type: 'categorical', uniqueValues: 4 },
            { name: 'TOTAL PRICE LOCAL', type: 'currency', uniqueValues: 500 },
        ], {
            topic: 'Total Sales Amount by Region',
            semanticHints: {
                candidateMetrics: ['TOTAL PRICE LOCAL'],
                knownDimensionColumns: ['Region'],
            },
        });

        expect(result.errors).toEqual([]);
        expect(result.validPlan).not.toBeNull();
    });

    describe('quarter semantic drift repair', () => {
        const wideColumns = [
            { name: 'STAFF NAME', type: 'categorical' as const, uniqueValues: 50 },
            { name: 'JAN 2010', type: 'numerical' as const },
            { name: 'FEB 2010', type: 'numerical' as const },
            { name: 'MAR 2010', type: 'numerical' as const },
            { name: 'APR 2010', type: 'numerical' as const },
            { name: 'MAY 2010', type: 'numerical' as const },
            { name: 'JUN 2010', type: 'numerical' as const },
            { name: 'JUL 2010', type: 'numerical' as const },
            { name: 'AUG 2010', type: 'numerical' as const },
            { name: 'SEP 2010', type: 'numerical' as const },
            { name: 'OCT 2010', type: 'numerical' as const },
            { name: 'NOV 2010', type: 'numerical' as const },
            { name: 'DEC 2010', type: 'numerical' as const },
        ];
        const periodFamilies = detectPeriodColumnFamilies(wideColumns.map(c => c.name));

        it('expands single-month aggregate to full quarter when topic says Q4', () => {
            const rawPlan = {
                title: 'Top STAFF NAMEs by Sum Oct 2010',
                queryMode: 'aggregate',
                intentSummary: 'Sum of OCT 2010 grouped by STAFF NAME',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['STAFF NAME', 'sum_oct_2010'],
                    groupBy: ['STAFF NAME'],
                    aggregates: [{ function: 'sum', column: 'OCT 2010', as: 'sum_oct_2010' }],
                    orderBy: [{ column: 'sum_oct_2010', direction: 'desc' }],
                    limit: 10,
                },
            };

            const result = normalizeAndValidateSqlEvidenceQueryPlan(rawPlan, wideColumns, {
                topic: 'Top staff by Q4 2010 revenue',
                periodFamilies,
                lenient: true,
            });

            expect(result.validPlan).not.toBeNull();
            // Aggregate column should be expanded to cover all Q4 months
            const aggColumn = result.validPlan!.query.aggregates![0].column;
            expect(aggColumn).toBe('OCT 2010 + NOV 2010 + DEC 2010');
        });

        it('expands single-month aggregate when topic says "October to December 2010"', () => {
            const rawPlan = {
                title: 'Staff performance Nov 2010',
                queryMode: 'aggregate',
                intentSummary: 'Sum of NOV 2010 grouped by STAFF NAME',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['STAFF NAME', 'sum_nov_2010'],
                    groupBy: ['STAFF NAME'],
                    aggregates: [{ function: 'sum', column: 'NOV 2010', as: 'sum_nov_2010' }],
                    orderBy: [{ column: 'sum_nov_2010', direction: 'desc' }],
                    limit: 10,
                },
            };

            const result = normalizeAndValidateSqlEvidenceQueryPlan(rawPlan, wideColumns, {
                topic: 'Staff performance October to December 2010',
                periodFamilies,
                lenient: true,
            });

            expect(result.validPlan).not.toBeNull();
            const aggColumn = result.validPlan!.query.aggregates![0].column;
            expect(aggColumn).toBe('OCT 2010 + NOV 2010 + DEC 2010');
        });

        it('does not modify aggregate when all quarter months are already covered', () => {
            const rawPlan = {
                title: 'Q4 2010 Revenue by Staff',
                queryMode: 'aggregate',
                intentSummary: 'Sum of Q4 columns grouped by STAFF NAME',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['STAFF NAME', 'q4_total'],
                    groupBy: ['STAFF NAME'],
                    aggregates: [{ function: 'sum', column: 'OCT 2010 + NOV 2010 + DEC 2010', as: 'q4_total' }],
                    orderBy: [{ column: 'q4_total', direction: 'desc' }],
                    limit: 10,
                },
            };

            const result = normalizeAndValidateSqlEvidenceQueryPlan(rawPlan, wideColumns, {
                topic: 'Q4 2010 revenue by staff',
                periodFamilies,
                lenient: true,
            });

            expect(result.validPlan).not.toBeNull();
            const aggColumn = result.validPlan!.query.aggregates![0].column;
            expect(aggColumn).toBe('OCT 2010 + NOV 2010 + DEC 2010');
        });

        it('does not interfere with non-quarter topics', () => {
            const rawPlan = {
                title: 'OCT 2010 Revenue by Staff',
                queryMode: 'aggregate',
                intentSummary: 'Sum of OCT 2010 grouped by STAFF NAME',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['STAFF NAME', 'sum_oct_2010'],
                    groupBy: ['STAFF NAME'],
                    aggregates: [{ function: 'sum', column: 'OCT 2010', as: 'sum_oct_2010' }],
                    orderBy: [{ column: 'sum_oct_2010', direction: 'desc' }],
                    limit: 10,
                },
            };

            const result = normalizeAndValidateSqlEvidenceQueryPlan(rawPlan, wideColumns, {
                topic: 'October 2010 revenue by staff',
                periodFamilies,
                lenient: true,
            });

            expect(result.validPlan).not.toBeNull();
            // Should NOT be expanded — the topic only mentions October, not Q4
            const aggColumn = result.validPlan!.query.aggregates![0].column;
            expect(aggColumn).toBe('OCT 2010');
        });

        it('repairs title from single month to quarter label', () => {
            const rawPlan = {
                title: 'Top STAFF NAMEs by Sum OCT 2010',
                queryMode: 'aggregate',
                intentSummary: 'Sum of OCT 2010 by STAFF NAME',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['STAFF NAME', 'sum_oct_2010'],
                    groupBy: ['STAFF NAME'],
                    aggregates: [{ function: 'sum', column: 'OCT 2010', as: 'sum_oct_2010' }],
                    orderBy: [{ column: 'sum_oct_2010', direction: 'desc' }],
                    limit: 10,
                },
            };

            const result = normalizeAndValidateSqlEvidenceQueryPlan(rawPlan, wideColumns, {
                topic: 'Top staff by fourth quarter 2010',
                periodFamilies,
                lenient: true,
            });

            expect(result.validPlan).not.toBeNull();
            expect(result.validPlan!.title).not.toContain('OCT 2010');
            expect(result.validPlan!.title).toContain('Q4 2010');
        });

        it('repairs intentSummary from single month to quarter label', () => {
            const rawPlan = {
                title: 'Q4 Staff Revenue',
                queryMode: 'aggregate',
                intentSummary: 'Sum of OCT 2010 grouped by STAFF NAME for Q4 analysis',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['STAFF NAME', 'sum_oct_2010'],
                    groupBy: ['STAFF NAME'],
                    aggregates: [{ function: 'sum', column: 'OCT 2010', as: 'sum_oct_2010' }],
                    orderBy: [{ column: 'sum_oct_2010', direction: 'desc' }],
                    limit: 10,
                },
            };

            const result = normalizeAndValidateSqlEvidenceQueryPlan(rawPlan, wideColumns, {
                topic: 'Q4 2010 revenue by staff',
                periodFamilies,
                lenient: true,
            });

            expect(result.validPlan).not.toBeNull();
            expect(result.validPlan!.intentSummary).not.toContain('OCT 2010');
            expect(result.validPlan!.intentSummary).toContain('Q4 2010');
        });
    });
});
