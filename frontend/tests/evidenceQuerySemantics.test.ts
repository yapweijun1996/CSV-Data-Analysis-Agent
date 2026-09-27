// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { applyEvidenceQuerySemanticDefaults } from '../services/agent/planning/evidenceQuerySemantics';
import type { ColumnProfile, SqlEvidenceQueryPlan } from '../types';

describe('applyEvidenceQuerySemanticDefaults', () => {
    const columns: ColumnProfile[] = [
        { name: 'SO Number', type: 'categorical', uniqueValues: 100, missingPercentage: 0 },
        { name: 'Profit Ratio %', type: 'percentage', uniqueValues: 80, missingPercentage: 0 },
        { name: 'RowClass', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
    ];

    it('rewrites ratio-like SUM aggregates to AVG for average percentage topics', () => {
        const plan: SqlEvidenceQueryPlan = {
            title: 'Average Profit Ratio Percentage per Sales Order Number',
            queryMode: 'aggregate',
            intentSummary: 'Inspect grouped ratio.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['SO Number', 'sum_profit_ratio_%'],
                groupBy: ['SO Number'],
                aggregates: [{ function: 'sum', column: 'Profit Ratio %', as: 'sum_profit_ratio_%' }],
                orderBy: [{ column: 'sum_profit_ratio_%', direction: 'desc' }],
                limit: 10,
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, columns, {
            topic: plan.title,
            steering: null,
        });

        expect(normalized.query.aggregates?.[0]).toMatchObject({
            function: 'avg',
            column: 'Profit Ratio %',
            as: 'avg_profit_ratio_%',
        });
        expect(normalized.query.select).toEqual(['SO Number', 'avg_profit_ratio_%']);
        expect(normalized.query.orderBy).toEqual([{ column: 'avg_profit_ratio_%', direction: 'desc' }]);
    });

    it('rewrites per-unit and rate-acronym SUM aggregates to AVG when the topic does not request a total', () => {
        const cases = [
            { column: 'Cost per results', topic: 'Cost per results by result indicator' },
            { column: 'Purchase ROAS', topic: 'Purchase ROAS by campaign' },
        ];

        for (const testCase of cases) {
            const sumAlias = `sum_${testCase.column.toLowerCase().replace(/\s+/g, '_')}`;
            const normalized = applyEvidenceQuerySemanticDefaults({
                title: testCase.topic,
                queryMode: 'aggregate',
                intentSummary: 'Inspect grouped performance.',
                preferredResultShape: 'ranked_aggregate',
                query: {
                    select: ['Campaign', sumAlias],
                    groupBy: ['Campaign'],
                    aggregates: [{ function: 'sum', column: testCase.column, as: sumAlias }],
                    orderBy: [{ column: sumAlias, direction: 'desc' }],
                },
            }, [
                { name: 'Campaign', type: 'categorical', uniqueValues: 5, missingPercentage: 0 },
                { name: testCase.column, type: 'numerical', uniqueValues: 50, missingPercentage: 0 },
            ], {
                topic: testCase.topic,
                steering: null,
            });

            expect(normalized.query.aggregates?.[0].function).toBe('avg');
            expect(normalized.query.select[1]).toMatch(/^avg_/);
            expect(normalized.query.orderBy?.[0].column).toMatch(/^avg_/);
        }
    });

    it('does not silently reinterpret an explicit total of a non-additive metric', () => {
        const normalized = applyEvidenceQuerySemanticDefaults({
            title: 'Total cost per result by campaign',
            queryMode: 'aggregate',
            intentSummary: 'Inspect the requested total.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['Campaign', 'sum_cost_per_results'],
                groupBy: ['Campaign'],
                aggregates: [{ function: 'sum', column: 'Cost per results', as: 'sum_cost_per_results' }],
            },
        }, [
            { name: 'Campaign', type: 'categorical', uniqueValues: 5, missingPercentage: 0 },
            { name: 'Cost per results', type: 'numerical', uniqueValues: 50, missingPercentage: 0 },
        ], {
            topic: 'Total cost per result by campaign',
            steering: null,
        });

        expect(normalized.query.aggregates?.[0].function).toBe('sum');
    });

    it('adds the harness-detected fact-row filter to standard evidence queries', () => {
        const plan: SqlEvidenceQueryPlan = {
            title: 'Count of Sales Orders per Received Date',
            queryMode: 'aggregate',
            intentSummary: 'Count sales orders by date.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['SO Received Date', 'count_rows'],
                groupBy: ['SO Received Date'],
                aggregates: [{ function: 'count', as: 'count_rows' }],
                limit: 10,
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, [
            ...columns,
            { name: 'SO Received Date', type: 'date', uniqueValues: 100, missingPercentage: 0 },
        ], {
            topic: plan.title,
            steering: {
                preferGroupBy: [],
                blockGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(normalized.query.where?.predicates).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
        expect(normalized.preFilter).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
    });

    it('does not force the fact-row filter onto hierarchy-focused row-class topics', () => {
        const plan: SqlEvidenceQueryPlan = {
            title: 'Subtotal rows by RowClass',
            queryMode: 'aggregate',
            intentSummary: 'Inspect subtotal rows.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['RowClass', 'count_rows'],
                groupBy: ['RowClass'],
                aggregates: [{ function: 'count', as: 'count_rows' }],
                limit: 10,
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, columns, {
            topic: plan.title,
            steering: {
                preferGroupBy: [],
                blockGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(normalized.query.where).toBeUndefined();
    });

    it('skips detailRowFilter injection when the column is missing from the dataset', () => {
        const columnsWithoutRowClass: ColumnProfile[] = [
            { name: 'SO Number', type: 'categorical', uniqueValues: 100, missingPercentage: 0 },
            { name: 'Amount', type: 'numerical', uniqueValues: 80, missingPercentage: 0 },
        ];

        const plan: SqlEvidenceQueryPlan = {
            title: 'Total Amount by SO Number',
            queryMode: 'aggregate',
            intentSummary: 'Sum amount by order.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['SO Number', 'sum_amount'],
                groupBy: ['SO Number'],
                aggregates: [{ function: 'sum', column: 'Amount', as: 'sum_amount' }],
                limit: 10,
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, columnsWithoutRowClass, {
            topic: plan.title,
            steering: {
                preferGroupBy: [],
                blockGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(normalized.preFilter).toEqual([]);
        expect(normalized.query.where).toBeUndefined();
    });

    it('reuses the explicit detailRowFilter contract and does not duplicate the prefilter clause', () => {
        const plan: SqlEvidenceQueryPlan = {
            title: 'Count of Sales Orders per Received Date',
            queryMode: 'aggregate',
            intentSummary: 'Count sales orders by date.',
            preferredResultShape: 'ranked_aggregate',
            preFilter: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
            query: {
                select: ['SO Received Date', 'count_rows'],
                groupBy: ['SO Received Date'],
                aggregates: [{ function: 'count', as: 'count_rows' }],
                limit: 10,
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, [
            ...columns,
            { name: 'SO Received Date', type: 'date', uniqueValues: 100, missingPercentage: 0 },
        ], {
            topic: plan.title,
            steering: {
                preferGroupBy: [],
                blockGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'noise',
                detailRowFilter: { column: 'RowClass', value: 'fact' },
            },
        });

        expect(normalized.preFilter).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
        expect(normalized.query.where?.predicates).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
    });

    it('does not stack heuristic hierarchy exclusions on an executable fact-row contract', () => {
        const plan: SqlEvidenceQueryPlan = {
            title: 'Total Balance Amount by Ship Mode',
            queryMode: 'aggregate',
            intentSummary: 'Sum balance amount by ship mode.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['Ship Mode', 'sum_balance_amount'],
                groupBy: ['Ship Mode'],
                aggregates: [{ function: 'sum', column: 'Balance Amount', as: 'sum_balance_amount' }],
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, [
            ...columns,
            { name: 'Ship Mode', type: 'categorical', uniqueValues: 6, missingPercentage: 0 },
            { name: 'Balance Amount', type: 'numerical', uniqueValues: 100, missingPercentage: 0 },
        ], {
            topic: plan.title,
            steering: {
                preferGroupBy: [],
                blockGroupBy: [],
                excludeFromAggregation: ['SOM1124', 'SOE12166'],
                hierarchyColumn: 'SO Number',
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
                detailRowFilter: { column: 'RowClass', value: 'fact' },
            },
        });

        expect(normalized.query.where?.predicates).toEqual([
            { column: 'RowClass', operator: 'eq', value: 'fact' },
        ]);
        expect(normalized.query.where?.predicates).not.toContainEqual(expect.objectContaining({
            column: 'SO Number',
            operator: 'not_in',
        }));
    });

    it('keeps hierarchy exclusion as the fallback when no fact-row contract is executable', () => {
        const plan: SqlEvidenceQueryPlan = {
            title: 'Total Balance Amount by Ship Mode',
            queryMode: 'aggregate',
            intentSummary: 'Sum balance amount by ship mode.',
            preferredResultShape: 'ranked_aggregate',
            query: {
                select: ['Ship Mode', 'sum_balance_amount'],
                groupBy: ['Ship Mode'],
                aggregates: [{ function: 'sum', column: 'Balance Amount', as: 'sum_balance_amount' }],
            },
        };

        const normalized = applyEvidenceQuerySemanticDefaults(plan, [
            { name: 'SO Number', type: 'categorical', uniqueValues: 100, missingPercentage: 0 },
            { name: 'Ship Mode', type: 'categorical', uniqueValues: 6, missingPercentage: 0 },
            { name: 'Balance Amount', type: 'numerical', uniqueValues: 100, missingPercentage: 0 },
        ], {
            topic: plan.title,
            steering: {
                preferGroupBy: [],
                blockGroupBy: [],
                excludeFromAggregation: ['SOM1124'],
                hierarchyColumn: 'SO Number',
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
            },
        });

        expect(normalized.query.where?.predicates).toContainEqual({
            column: 'SO Number',
            operator: 'not_in',
            value: ['SOM1124'],
        });
    });
});
