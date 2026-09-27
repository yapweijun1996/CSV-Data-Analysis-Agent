import { describe, it, expect, vi } from 'vitest';
import { injectDirectivesIntoQueryPlan, type RuntimeDirectives } from '../services/duckdb/directiveInjector';
import { createEmptyRuntimeDirectives } from '../services/agent/runtime/investigationTypes';
import type { QueryPlan } from '../types';
import { buildColumnRegistry } from '../services/data/columnRegistry';

vi.spyOn(console, 'log').mockImplementation(() => undefined);
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

const basePlan: QueryPlan = {
    select: ['STAFF NAME'],
    groupBy: ['STAFF NAME'],
    aggregates: [{ function: 'sum', column: 'Value', as: 'total_value' }],
    orderBy: [{ column: 'total_value', direction: 'desc' }],
    limit: 20,
};

const baseDirectives = (): RuntimeDirectives => ({
    ...createEmptyRuntimeDirectives(),
});

describe('directiveInjector — hierarchy exclusion', () => {
    it('injects NOT IN predicate when excludeFromAggregation + hierarchyColumn are set', () => {
        const directives = baseDirectives();
        directives.excludeFromAggregation = ['Hiroshi Fujita', 'Chin Beng Seng', 'Allen Berry'];
        directives.hierarchyColumn = 'STAFF NAME';

        const result = injectDirectivesIntoQueryPlan(basePlan, { directives });

        expect(result.injected).toHaveLength(1);
        expect(result.injected[0]).toContain('hierarchy_exclusion');
        expect(result.plan.where?.predicates).toHaveLength(1);
        expect(result.plan.where!.predicates![0]).toEqual({
            column: 'STAFF NAME',
            operator: 'not_in',
            value: ['Hiroshi Fujita', 'Chin Beng Seng', 'Allen Berry'],
        });
    });

    it('skips if excludeFromAggregation is empty', () => {
        const directives = baseDirectives();
        directives.hierarchyColumn = 'STAFF NAME';
        directives.excludeFromAggregation = [];

        const result = injectDirectivesIntoQueryPlan(basePlan, { directives });
        expect(result.injected).toHaveLength(0);
        expect(result.plan.where).toBeUndefined();
    });

    it('skips if hierarchyColumn is null', () => {
        const directives = baseDirectives();
        directives.excludeFromAggregation = ['Hiroshi Fujita'];
        directives.hierarchyColumn = null;

        const result = injectDirectivesIntoQueryPlan(basePlan, { directives });
        expect(result.injected).toHaveLength(0);
    });

    it('warns if hierarchyColumn not in available columns', () => {
        const directives = baseDirectives();
        directives.excludeFromAggregation = ['Hiroshi Fujita'];
        directives.hierarchyColumn = 'STAFF NAME';

        const result = injectDirectivesIntoQueryPlan(basePlan, {
            directives,
            availableColumns: ['Period', 'Value'], // no STAFF NAME
        });
        expect(result.injected).toHaveLength(0);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('not found');
    });

    it('does not duplicate if caller already has not_in on same column', () => {
        const directives = baseDirectives();
        directives.excludeFromAggregation = ['Hiroshi Fujita'];
        directives.hierarchyColumn = 'STAFF NAME';

        const planWithExisting: QueryPlan = {
            ...basePlan,
            where: {
                predicates: [{ column: 'STAFF NAME', operator: 'not_in', value: ['Hiroshi Fujita'] }],
            },
        };
        const result = injectDirectivesIntoQueryPlan(planWithExisting, { directives });
        expect(result.injected).toHaveLength(0);
        // Should still have original predicate
        expect(result.plan.where?.predicates).toHaveLength(1);
    });
});

describe('directiveInjector — detail-row filter', () => {
    it('injects detail-row filter when detailRowFilter is set', () => {
        const directives = baseDirectives();
        directives.detailRowFilter = { column: 'RowClass', value: 'fact' };

        const result = injectDirectivesIntoQueryPlan(basePlan, {
            directives,
            availableColumns: ['RowClass', 'Value'],
        });
        expect(result.injected).toHaveLength(1);
        expect(result.injected[0]).toContain('detail_row_filter');
        expect(result.plan.where?.predicates).toHaveLength(1);
        expect(result.plan.where!.predicates![0]).toEqual({
            column: 'RowClass',
            operator: 'eq',
            value: 'fact',
        });
    });

    it('uses legacy detailRowColumn/detailRowValue when detailRowFilter is null', () => {
        const directives = baseDirectives();
        directives.detailRowColumn = 'RowClass';
        directives.detailRowValue = 'detail';

        const result = injectDirectivesIntoQueryPlan(basePlan, {
            directives,
            availableColumns: ['RowClass', 'Value'],
        });
        expect(result.injected).toHaveLength(1);
        expect(result.plan.where!.predicates![0].value).toBe('detail');
    });

    it('skips detail-row injection when no schema context is available', () => {
        const directives = baseDirectives();
        directives.detailRowFilter = { column: 'RowRole', value: 'fact' };

        const result = injectDirectivesIntoQueryPlan(basePlan, { directives });

        expect(result.injected).toHaveLength(0);
        expect(result.plan.where).toBeUndefined();
        expect(result.warnings).toEqual([
            'Detail-row filter skipped: available columns not provided for validation of "RowRole"',
        ]);
    });

    it('skips when isSummaryRowTopic is true', () => {
        const directives = baseDirectives();
        directives.detailRowFilter = { column: 'RowClass', value: 'fact' };

        const result = injectDirectivesIntoQueryPlan(basePlan, {
            directives,
            isSummaryRowTopic: true,
        });
        expect(result.injected).toHaveLength(0);
    });
});

describe('directiveInjector — topN enforcement', () => {
    it('applies recommendedTopN when plan has larger limit', () => {
        const directives = baseDirectives();
        directives.recommendedTopN = 10;

        const result = injectDirectivesIntoQueryPlan(basePlan, { directives }); // plan.limit = 20
        expect(result.injected).toHaveLength(1);
        expect(result.injected[0]).toContain('topN');
        expect(result.plan.limit).toBe(10);
    });

    it('keeps plan limit when smaller than topN', () => {
        const directives = baseDirectives();
        directives.recommendedTopN = 50;

        const result = injectDirectivesIntoQueryPlan(basePlan, { directives }); // plan.limit = 20
        expect(result.injected).toHaveLength(0);
        expect(result.plan.limit).toBe(20);
    });

    it('applies topN when plan has no limit', () => {
        const directives = baseDirectives();
        directives.recommendedTopN = 10;
        const planNoLimit = { ...basePlan, limit: undefined };

        const result = injectDirectivesIntoQueryPlan(planNoLimit, { directives });
        expect(result.plan.limit).toBe(10);
    });
});

describe('directiveInjector — combined rules', () => {
    it('injects all three rules simultaneously', () => {
        const directives = baseDirectives();
        directives.excludeFromAggregation = ['Parent A'];
        directives.hierarchyColumn = 'STAFF NAME';
        directives.detailRowFilter = { column: 'RowClass', value: 'fact' };
        directives.recommendedTopN = 5;

        const result = injectDirectivesIntoQueryPlan(basePlan, {
            directives,
            availableColumns: ['STAFF NAME', 'RowClass', 'Value'],
        });
        expect(result.injected).toHaveLength(3);
        expect(result.plan.where?.predicates).toHaveLength(2); // hierarchy + detail-row
        expect(result.plan.limit).toBe(5);
    });

    it('does not mutate the input plan', () => {
        const directives = baseDirectives();
        directives.excludeFromAggregation = ['Parent A'];
        directives.hierarchyColumn = 'STAFF NAME';

        const original = { ...basePlan };
        injectDirectivesIntoQueryPlan(original, { directives });

        // Original should be unchanged
        expect(original.where).toBeUndefined();
        expect(original.limit).toBe(20);
    });

    it('rewrites blocked groupBy columns to preferred business grains before execution', () => {
        const directives = baseDirectives();
        directives.blockGroupBy = ['_unnamed_column_1'];
        directives.preferGroupBy = ['SeriesLabelL1'];
        const registry = buildColumnRegistry({
            data: {
                fileName: 'analysis.csv',
                data: [
                    { _unnamed_column_1: 'A', SeriesLabelL1: 'Project A', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: '_unnamed_column_1', type: 'categorical' },
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
            steering: {
                blockGroupBy: ['_unnamed_column_1'],
                preferGroupBy: ['SeriesLabelL1'],
            },
        });

        const result = injectDirectivesIntoQueryPlan({
            ...basePlan,
            groupBy: ['_unnamed_column_1'],
            select: ['_unnamed_column_1', 'total_value'],
        }, {
            directives,
            columnRegistry: registry,
            availableColumns: registry?.columns.map(entry => entry.physicalName),
        });

        expect(result.validationError).toBeNull();
        expect(result.injected.some(entry => entry.includes('blocked_dimension_enforcement'))).toBe(true);
        expect(result.plan.groupBy).toEqual(['SeriesLabelL1']);
        expect(result.plan.select).toEqual(['SeriesLabelL1', 'total_value']);
    });

    it('rewrites matching orderBy columns when blocked groupBy dimensions are replaced', () => {
        const directives = baseDirectives();
        directives.blockGroupBy = ['_unnamed_column_1'];
        directives.preferGroupBy = ['SeriesLabelL1'];
        const registry = buildColumnRegistry({
            data: {
                fileName: 'analysis.csv',
                data: [
                    { _unnamed_column_1: 'A', SeriesLabelL1: 'Project A', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: '_unnamed_column_1', type: 'categorical' },
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
            steering: {
                blockGroupBy: ['_unnamed_column_1'],
                preferGroupBy: ['SeriesLabelL1'],
            },
        });

        const result = injectDirectivesIntoQueryPlan({
            ...basePlan,
            groupBy: ['_unnamed_column_1'],
            select: ['_unnamed_column_1', 'total_value'],
            orderBy: [{ column: '_unnamed_column_1', direction: 'asc' }],
        }, {
            directives,
            columnRegistry: registry,
            availableColumns: registry?.columns.map(entry => entry.physicalName),
        });

        expect(result.plan.orderBy).toEqual([{ column: 'SeriesLabelL1', direction: 'asc' }]);
    });

    it('rewrites matching postAggregateFilter columns when blocked groupBy dimensions are replaced', () => {
        const directives = baseDirectives();
        directives.blockGroupBy = ['_unnamed_column_1'];
        directives.preferGroupBy = ['SeriesLabelL1'];
        const registry = buildColumnRegistry({
            data: {
                fileName: 'analysis.csv',
                data: [
                    { _unnamed_column_1: 'A', SeriesLabelL1: 'Project A', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: '_unnamed_column_1', type: 'categorical' },
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
            steering: {
                blockGroupBy: ['_unnamed_column_1'],
                preferGroupBy: ['SeriesLabelL1'],
            },
        });

        const result = injectDirectivesIntoQueryPlan({
            ...basePlan,
            groupBy: ['_unnamed_column_1'],
            select: ['_unnamed_column_1', 'total_value'],
            postAggregateFilter: {
                predicates: [
                    { column: '_unnamed_column_1', operator: 'eq', value: 'A' },
                    { column: 'total_value', operator: 'gt', value: 10 },
                ],
            },
        }, {
            directives,
            columnRegistry: registry,
            availableColumns: registry?.columns.map(entry => entry.physicalName),
        });

        expect(result.plan.postAggregateFilter).toEqual({
            predicates: [
                { column: 'SeriesLabelL1', operator: 'eq', value: 'A' },
                { column: 'total_value', operator: 'gt', value: 10 },
            ],
        });
    });

    it('deduplicates orderBy columns after blocked dimension replacement', () => {
        const directives = baseDirectives();
        directives.blockGroupBy = ['_unnamed_column_1'];
        directives.preferGroupBy = ['SeriesLabelL1'];
        const registry = buildColumnRegistry({
            data: {
                fileName: 'analysis.csv',
                data: [
                    { _unnamed_column_1: 'A', SeriesLabelL1: 'Project A', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: '_unnamed_column_1', type: 'categorical' },
                { name: 'SeriesLabelL1', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
            steering: {
                blockGroupBy: ['_unnamed_column_1'],
                preferGroupBy: ['SeriesLabelL1'],
            },
        });

        const result = injectDirectivesIntoQueryPlan({
            ...basePlan,
            groupBy: ['_unnamed_column_1'],
            select: ['_unnamed_column_1', 'SeriesLabelL1', 'total_value'],
            orderBy: [
                { column: '_unnamed_column_1', direction: 'asc' },
                { column: 'SeriesLabelL1', direction: 'desc' },
            ],
        }, {
            directives,
            columnRegistry: registry,
            availableColumns: registry?.columns.map(entry => entry.physicalName),
        });

        expect(result.plan.orderBy).toEqual([{ column: 'SeriesLabelL1', direction: 'asc' }]);
    });

    it('drops blocked groupBy columns when the safe replacement already exists in the grain', () => {
        const directives = baseDirectives();
        directives.blockGroupBy = ['BlockedOnly'];
        directives.preferGroupBy = ['Region'];
        const registry = buildColumnRegistry({
            data: {
                fileName: 'analysis.csv',
                data: [
                    { Region: 'East', BlockedOnly: 'detail-row', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical' },
                { name: 'BlockedOnly', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
            steering: {
                blockGroupBy: ['BlockedOnly'],
                preferGroupBy: ['Region'],
            },
        });

        const result = injectDirectivesIntoQueryPlan({
            ...basePlan,
            groupBy: ['Region', 'BlockedOnly'],
            select: ['Region', 'BlockedOnly', 'total_value'],
            orderBy: [
                { column: 'BlockedOnly', direction: 'asc' },
                { column: 'Region', direction: 'desc' },
            ],
            postAggregateFilter: {
                predicates: [
                    { column: 'BlockedOnly', operator: 'eq', value: 'detail-row' },
                    { column: 'total_value', operator: 'gt', value: 10 },
                ],
            },
        }, {
            directives,
            columnRegistry: registry,
            availableColumns: registry?.columns.map(entry => entry.physicalName),
        });

        expect(result.validationError).toBeNull();
        expect(result.plan.groupBy).toEqual(['Region']);
        expect(result.plan.select).toEqual(['Region', 'total_value']);
        expect(result.plan.orderBy).toEqual([{ column: 'Region', direction: 'asc' }]);
        expect(result.plan.postAggregateFilter).toEqual({
            predicates: [
                { column: 'Region', operator: 'eq', value: 'detail-row' },
                { column: 'total_value', operator: 'gt', value: 10 },
            ],
        });
    });

    it('returns a deterministic validation error when a blocked groupBy cannot be repaired', () => {
        const directives = baseDirectives();
        directives.blockGroupBy = ['_unnamed_column_1'];
        const registry = buildColumnRegistry({
            data: {
                fileName: 'analysis.csv',
                data: [
                    { _unnamed_column_1: 'A', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: '_unnamed_column_1', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
            steering: {
                blockGroupBy: ['_unnamed_column_1'],
            },
        });

        const result = injectDirectivesIntoQueryPlan({
            ...basePlan,
            groupBy: ['_unnamed_column_1'],
            select: ['_unnamed_column_1', 'total_value'],
        }, {
            directives,
            columnRegistry: registry,
            availableColumns: registry?.columns.map(entry => entry.physicalName),
        });

        expect(result.validationError).toBe('blocked_group_by_unresolved:_unnamed_column_1');
    });
});

describe('directiveInjector — Rule 6: aggregation governance (AI-first)', () => {
    const govRegistry = (entries: Array<{ name: string; type: string }>) =>
        buildColumnRegistry({
            data: {
                fileName: 'gov.csv',
                data: [Object.fromEntries(entries.map(e => [e.name, 0]))],
            },
            columnProfiles: entries.map(e => ({ name: e.name, type: e.type as 'numerical' | 'percentage' | 'categorical' })),
        });

    it('returns validationError for SUM on percentage column (does not silently replace)', () => {
        const registry = govRegistry([{ name: 'Margin_Pct', type: 'percentage' }]);
        const plan: QueryPlan = {
            select: ['avg_margin'],
            aggregates: [{ function: 'sum', column: 'Margin_Pct', as: 'avg_margin' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, {
            directives: baseDirectives(),
            columnRegistry: registry,
        });
        expect(result.validationError).toContain('aggregation_governance_violation');
        expect(result.validationError).toContain('Margin_Pct');
        expect(result.validationError).toContain('non_additive');
        // Plan is NOT mutated — AI receives the error and self-repairs
        expect(result.plan.aggregates![0].function).toBe('sum');
    });

    it('returns validationError for SUM on dimension column', () => {
        const registry = govRegistry([{ name: 'Department', type: 'categorical' }]);
        const plan: QueryPlan = {
            select: ['dept_sum'],
            aggregates: [{ function: 'sum', column: 'Department', as: 'dept_sum' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, {
            directives: baseDirectives(),
            columnRegistry: registry,
        });
        expect(result.validationError).toContain('aggregation_governance_violation');
        expect(result.validationError).toContain('dimension_only');
    });

    it('passes SUM on additive metric without error', () => {
        const registry = govRegistry([{ name: 'Revenue', type: 'currency' }]);
        const plan: QueryPlan = {
            select: ['total_rev'],
            aggregates: [{ function: 'sum', column: 'Revenue', as: 'total_rev' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, {
            directives: baseDirectives(),
            columnRegistry: registry,
        });
        expect(result.validationError).toBeFalsy();
        expect(result.plan.aggregates![0].function).toBe('sum');
    });

    it('passes COUNT on any column (always valid)', () => {
        const registry = govRegistry([{ name: 'Margin_Pct', type: 'percentage' }]);
        const plan: QueryPlan = {
            select: ['cnt'],
            aggregates: [{ function: 'count', column: 'Margin_Pct', as: 'cnt' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, {
            directives: baseDirectives(),
            columnRegistry: registry,
        });
        expect(result.validationError).toBeFalsy();
    });

    it('skips governance when no columnRegistry provided', () => {
        const plan: QueryPlan = {
            select: ['x'],
            aggregates: [{ function: 'sum', column: 'Anything', as: 'x' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, { directives: baseDirectives() });
        expect(result.validationError).toBeFalsy();
    });

    it('skips governance for unknown columns not in registry', () => {
        const registry = govRegistry([{ name: 'Revenue', type: 'currency' }]);
        const plan: QueryPlan = {
            select: ['x'],
            aggregates: [{ function: 'sum', column: 'NonExistent', as: 'x' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, {
            directives: baseDirectives(),
            columnRegistry: registry,
        });
        expect(result.validationError).toBeFalsy();
    });

    it('detects non_additive by column name pattern (avg, margin, rate)', () => {
        const registry = govRegistry([{ name: 'Avg_Salary', type: 'numerical' }]);
        const plan: QueryPlan = {
            select: ['sal_sum'],
            aggregates: [{ function: 'sum', column: 'Avg_Salary', as: 'sal_sum' }],
        };
        const result = injectDirectivesIntoQueryPlan(plan, {
            directives: baseDirectives(),
            columnRegistry: registry,
        });
        expect(result.validationError).toContain('aggregation_governance_violation');
        expect(result.validationError).toContain('non_additive');
    });

    it.each(['Cost per results', 'Purchase ROAS', 'Outbound CTR', 'Ad set budget'])(
        'rejects SUM on non-additive business metric %s',
        columnName => {
            const registry = govRegistry([{ name: columnName, type: 'numerical' }]);
            const result = injectDirectivesIntoQueryPlan({
                select: ['unsafe_total'],
                aggregates: [{ function: 'sum', column: columnName, as: 'unsafe_total' }],
            }, {
                directives: baseDirectives(),
                columnRegistry: registry,
            });

            expect(result.validationError).toContain('aggregation_governance_violation');
            expect(result.validationError).toContain(columnName);
            expect(result.plan.aggregates?.[0].function).toBe('sum');
        },
    );
});
