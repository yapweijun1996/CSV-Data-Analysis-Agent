// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { validateAction } from '../services/ai/toolValidator';

describe('card.add_calculated_column validation', () => {
    const context = {
        cardIds: ['card-1'],
        columnNames: ['Revenue', 'Cost'],
        hasCsvData: true,
        hasCards: true,
        cleaningCompleted: true,
    };

    it('accepts valid row-level formulas', () => {
        const validation = validateAction({
            type: 'tool_call',
            thought: 'Add a profit column to the card.',
            toolName: 'card.add_calculated_column',
            args: {
                cardId: 'card-1',
                newColumnName: 'Profit',
                formula: "'Revenue' - 'Cost'",
            },
        }, context);

        expect(validation.isValid).toBe(true);
    });

    it('rejects SQL-like formulas before execution', () => {
        const validation = validateAction({
            type: 'tool_call',
            thought: 'Add a profit column from a SQL subquery.',
            toolName: 'card.add_calculated_column',
            args: {
                cardId: 'card-1',
                newColumnName: 'Profit',
                formula: 'SELECT SUM(Value) FROM dataset',
            },
        }, context);

        expect(validation.isValid).toBe(false);
        expect(validation.errors).toContain('row-level card expression, not SQL or a subquery');
        expect(validation.errors).toContain('use data.query instead of card.add_calculated_column');
    });

    it('rejects aggregate-style SQL functions inside formulas', () => {
        const validation = validateAction({
            type: 'tool_call',
            thought: 'Try to compute with SQL aggregates.',
            toolName: 'card.add_calculated_column',
            args: {
                cardId: 'card-1',
                newColumnName: 'Profit',
                formula: 'SUM(Value) - COUNT(*)',
            },
        }, context);

        expect(validation.isValid).toBe(false);
        expect(validation.errors).toContain('row-level card expression, not SQL or a subquery');
    });
});
