// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { validateAction } from '../services/ai/toolValidator';

describe('execute_data_query action validation', () => {
    it('accepts a valid execute_data_query action', () => {
        const validation = validateAction({
            thought: 'Inspect the top revenue rows without mutating the dataset.',
            type: 'tool_call',
            toolName: 'data.query',
            args: {
                explanation: 'Return grouped revenue totals by region.',
                plan: {
                    groupBy: ['Region'],
                    aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
                    select: ['Region', 'TotalRevenue'],
                    orderBy: [{ column: 'TotalRevenue', direction: 'desc' }],
                    limit: 5,
                },
            },
        }, { cardIds: [], columnNames: ['Region', 'Revenue'], hasCsvData: true, hasCards: false });

        expect(validation.isValid).toBe(true);
    });

    it('accepts an explicit preview query with select and limit', () => {
        const validation = validateAction({
            thought: 'Preview the first few rows without filtering.',
            type: 'tool_call',
            toolName: 'data.query',
            args: {
                explanation: 'Preview the first five rows with the selected columns.',
                plan: {
                    select: ['Region', 'Revenue'],
                    limit: 5,
                },
            },
        }, { cardIds: [], columnNames: ['Region', 'Revenue'], hasCsvData: true, hasCards: false });

        expect(validation.isValid).toBe(true);
    });

    it('rejects execute_data_query actions missing the queryPlan payload', () => {
        const validation = validateAction({
            thought: 'Try to query rows.',
            type: 'tool_call',
            toolName: 'data.query',
            args: {},
        }, { cardIds: [], columnNames: ['Region', 'Revenue'], hasCsvData: true, hasCards: false });

        expect(validation.isValid).toBe(false);
        expect(validation.errors).toMatch(/plan/i);
    });

    it('rejects query actions that omit the explanation', () => {
        const validation = validateAction({
            thought: 'Run a query without describing it.',
            type: 'tool_call',
            toolName: 'data.query',
            args: {
                plan: {
                    groupBy: ['Region'],
                },
            },
        }, { cardIds: [], columnNames: ['Region', 'Revenue'], hasCsvData: true, hasCards: false });

        expect(validation.isValid).toBe(false);
        expect(validation.errors).toMatch(/explanation/i);
    });

    it('rejects semantically empty query plans', () => {
        const validation = validateAction({
            thought: 'Try to inspect rows without a real plan.',
            type: 'tool_call',
            toolName: 'data.query',
            args: {
                explanation: 'Try to inspect rows.',
                plan: {},
            },
        }, { cardIds: [], columnNames: ['Region', 'Revenue'], hasCsvData: true, hasCards: false });

        expect(validation.isValid).toBe(false);
        expect(validation.errors).toMatch(/structured query clause/i);
    });
});
