// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalysisToolManifests } from '../services/agent/tools/manifests/analysisToolManifests';
import { createChatPrompt } from '../services/prompts/chatPrompts';
import { normalizeAndValidatePlan } from '../utils/planValidator';

const columns = [
    { name: 'Description', type: 'categorical', uniqueValues: 6 },
    { name: 'Project', type: 'categorical', uniqueValues: 4 },
    { name: 'Month', type: 'date', uniqueValues: 12 },
    { name: 'Amount', type: 'numerical' },
] as const;

describe('planValidator preFilter contract', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('normalizes object-shaped preFilter into a single-item array', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = normalizeAndValidatePlan({
            chartType: 'bar',
            title: 'Costs by Project',
            description: 'Compare costs by project.',
            aggregation: 'sum',
            groupByColumn: 'Project',
            valueColumn: 'Amount',
            preFilter: {
                column: 'Description',
                operator: 'contains',
                value: 'Cost',
            } as any,
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.preFilter).toEqual([
            {
                column: 'Description',
                operator: 'contains',
                value: 'Cost',
            },
        ]);
        expect(warnSpy).toHaveBeenCalledWith(
            "[PlanValidator] Normalized object-shaped 'preFilter' into a single-item array.",
            {
                column: 'Description',
                operator: 'contains',
                value: 'Cost',
            },
        );
    });

    it('teaches array-shaped preFilter in prompt surfaces', () => {
        const prompt = createChatPrompt(
            'Show me a cost chart.',
            'Managed context.',
            'English',
            createAnalysisToolManifests(columns.map(column => column.name)),
        );
        const manifests = createAnalysisToolManifests(columns.map(column => column.name));
        const planManifest = manifests.find(tool => tool.name === 'analysis.create_plan');

        expect(prompt).toContain("preFilter: [{ column: 'Description', operator: 'contains', value: 'Cost' }]");
        expect(planManifest?.promptHints).toContain(
            "For text-category scoping, set preFilter: [{ column: 'Description', operator: 'contains', value: 'Cost' }] before using a chart.",
        );
        expect(planManifest?.promptHints).toContain(
            "For numeric scoping, use canonical operators like preFilter: [{ column: 'Amount', operator: 'gt', value: 0 }].",
        );
    });

    it('normalizes numeric operator aliases into canonical preFilter operators', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = normalizeAndValidatePlan({
            chartType: 'bar',
            title: 'Positive Costs by Project',
            description: 'Compare positive costs by project.',
            aggregation: 'sum',
            groupByColumn: 'Project',
            valueColumn: 'Amount',
            preFilter: [{
                column: 'Amount',
                operator: 'greater_than',
                value: 0,
            }] as any,
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.preFilter).toEqual([
            {
                column: 'Amount',
                operator: 'gt',
                value: 0,
            },
        ]);
        expect(warnSpy).toHaveBeenCalledWith(
            '[PlanValidator] Normalized preFilter operator "greater_than" to "gt".',
            {
                column: 'Amount',
                operator: 'gt',
                value: 0,
            },
        );
    });

    it('does not silently degrade a metric analysis into count when no value column is provided', () => {
        const result = normalizeAndValidatePlan({
            chartType: 'bar',
            title: 'Project Profitability Analysis',
            description: 'Calculate profit by project.',
            groupByColumn: 'Project',
        }, [...columns]);

        expect(result.validPlan).toBeNull();
        expect(result.errors).toContain("For a 'bar' chart, 'aggregation' is required.");
    });

    it('still infers count when the user explicitly asks for counts', () => {
        const result = normalizeAndValidatePlan({
            chartType: 'bar',
            title: 'Record count by Project',
            description: 'Count rows per project.',
            groupByColumn: 'Project',
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan?.aggregation).toBe('count');
        expect(result.validPlan?.valueColumn).toBeUndefined();
    });

    it('downgrades incomplete combo plans on temporal groupings to line', () => {
        const result = normalizeAndValidatePlan({
            chartType: 'combo',
            title: 'Amount trend by month',
            description: 'Compare monthly amounts over time.',
            aggregation: 'sum',
            groupByColumn: 'Month',
            valueColumn: 'Amount',
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan).toMatchObject({
            chartType: 'line',
            groupByColumn: 'Month',
            valueColumn: 'Amount',
            secondaryValueColumn: undefined,
        });
    });

    it('downgrades incomplete combo plans on non-temporal groupings to bar', () => {
        const result = normalizeAndValidatePlan({
            chartType: 'combo',
            title: 'Amount by project',
            description: 'Compare project amounts.',
            aggregation: 'sum',
            groupByColumn: 'Project',
            valueColumn: 'Amount',
        }, [...columns]);

        expect(result.errors).toEqual([]);
        expect(result.validPlan).toMatchObject({
            chartType: 'bar',
            groupByColumn: 'Project',
            valueColumn: 'Amount',
            secondaryValueColumn: undefined,
        });
    });
});
