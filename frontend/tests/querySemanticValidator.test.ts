// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    validateAggregateAliasSemantics,
    validateGroupedQuerySemantics,
} from '../services/agent/execution/querySemanticValidator';

describe('validateAggregateAliasSemantics', () => {
    it('rejects a plain amount aggregate disguised as a derived margin', () => {
        expect(validateAggregateAliasSemantics({
            groupBy: ['Customer'],
            aggregates: [
                { function: 'sum', column: 'Profit Amount', as: 'Profit Margin' },
            ],
        })).toMatchObject({
            code: 'derived_ratio_alias_mismatch',
            column: 'Profit Margin',
            alternativeColumn: 'Profit Amount',
        });
    });

    it('allows honest component totals and a real ratio source column', () => {
        expect(validateAggregateAliasSemantics({
            aggregates: [
                { function: 'sum', column: 'Profit Amount', as: 'total_profit' },
                { function: 'sum', column: 'Sales Amount', as: 'total_sales' },
            ],
        })).toBeNull();
        expect(validateAggregateAliasSemantics({
            aggregates: [
                { function: 'avg', column: 'Profit Ratio %', as: 'average_profit_margin' },
            ],
        })).toBeNull();
    });
});

describe('validateGroupedQuerySemantics', () => {
    it('rejects date-like results under a non-temporal grouping label', () => {
        const issue = validateGroupedQuerySemantics({
            plan: { groupBy: ['Customer'] },
            resultRows: [
                { Customer: '31-12-2010', total: 10 },
                { Customer: '02-01-2010', total: 8 },
                { Customer: '01-12-2010', total: 7 },
            ],
            datasetRows: [
                { Customer: '31-12-2010', SectionLabel: 'Alpha Ltd' },
                { Customer: '02-01-2010', SectionLabel: 'Beta Ltd' },
                { Customer: '01-12-2010', SectionLabel: 'Gamma Ltd' },
                { Customer: '03-01-2010', SectionLabel: 'Delta Ltd' },
                { Customer: '04-01-2010', SectionLabel: 'Epsilon Ltd' },
            ],
        });

        expect(issue).toMatchObject({
            code: 'group_dimension_value_type_mismatch',
            column: 'Customer',
            alternativeColumn: 'SectionLabel',
        });
    });

    it('allows real customer labels and explicitly temporal dimensions', () => {
        expect(validateGroupedQuerySemantics({
            plan: { groupBy: ['Customer'] },
            resultRows: [
                { Customer: 'Alpha Ltd' },
                { Customer: 'Beta Ltd' },
                { Customer: 'Gamma Ltd' },
            ],
            datasetRows: [],
        })).toBeNull();
        expect(validateGroupedQuerySemantics({
            plan: { groupBy: ['Order Date'] },
            resultRows: [
                { 'Order Date': '31-12-2010' },
                { 'Order Date': '02-01-2010' },
                { 'Order Date': '01-12-2010' },
            ],
            datasetRows: [],
        })).toBeNull();
    });
});
