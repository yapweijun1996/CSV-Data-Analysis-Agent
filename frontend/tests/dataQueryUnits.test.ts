import { describe, expect, it } from 'vitest';
import { executeDataQuery } from '../services/agent/execution/dataQueryExecutor';
import { normalizeDataQueryPlanLike } from '../services/agent/execution/dataQueryNormalization';
import { executeDataQueryWithWorker } from '../services/workers/dataWorkerClient';
import type { QueryPlan } from '../types';

const error = 'mixed_or_missing_units: Cannot calculate: units are missing or mixed. Group or filter by unit.';
const aggregate = (fn: 'sum' | 'avg') => ({ function: fn, column: 'Amount', unitColumn: 'Unit', as: 'value' });

describe('aggregate unit guard', () => {
    it.each(['sum', 'avg'] as const)('rejects mixed and missing contributing units for %s', fn => {
        const plan: QueryPlan = { aggregates: [aggregate(fn)] };
        for (const unit of ['USD', '', '  ', null, 42, ' SGD']) {
            expect(() => executeDataQuery([{ Amount: 1, Unit: 'SGD' }, { Amount: 2, Unit: unit }], plan)).toThrow(error);
        }
    });

    it('checks only numeric contributors after query and aggregate filters, within each group', () => {
        const rows = [
            { Group: 'a', Amount: 2, Unit: 'SGD', Include: 'yes', Metric: 'yes' },
            { Group: 'a', Amount: 4, Unit: 'SGD', Include: 'yes', Metric: 'yes' },
            { Group: 'b', Amount: 8, Unit: 'USD', Include: 'yes', Metric: 'yes' },
            { Group: 'a', Amount: 99, Unit: 'USD', Include: 'no', Metric: 'yes' },
            { Group: 'a', Amount: 99, Unit: 'USD', Include: 'yes', Metric: 'no' },
            { Group: 'a', Amount: 'not a number', Unit: '', Include: 'yes', Metric: 'yes' },
        ];
        const result = executeDataQuery(rows, {
            groupBy: ['Group'], where: { predicates: [{ column: 'Include', operator: 'eq', value: 'yes' }] },
            aggregates: [{ ...aggregate('avg'), where: { predicates: [{ column: 'Metric', operator: 'eq', value: 'yes' }] } }],
        });
        expect(result.rows).toEqual([{ Group: 'a', value: 3 }, { Group: 'b', value: 8 }]);
    });

    it('allows empty numeric scopes and does not guard counts', () => {
        const rows = [{ Amount: null, Unit: '' }, { Amount: 'missing', Unit: 'USD' }];
        expect(executeDataQuery(rows, { aggregates: [aggregate('sum')] }).rows).toEqual([{ value: null }]);
        expect(executeDataQuery([{ Amount: 1, Unit: 'SGD' }, { Amount: 2, Unit: 'USD' }], {
            aggregates: [{ function: 'count', column: 'Amount', unitColumn: 'Unit', as: 'count' },
                { function: 'count_distinct', column: 'Amount', unitColumn: 'Unit', as: 'distinct' }],
        }).rows).toEqual([{ count: 2, distinct: 2 }]);
    });

    it('validates unit columns and preserves the field during plan normalization', () => {
        const plan: QueryPlan = { aggregates: [aggregate('sum')] };
        expect(() => executeDataQuery([{ Amount: 1, Unit: 'SGD' }], plan, { allowedColumns: ['Amount'] })).toThrow();
        expect(normalizeDataQueryPlanLike(plan)?.aggregates?.[0].unitColumn).toBe('Unit');
    });

    it('honors the guard through worker delegation or its native fallback', async () => {
        await expect(executeDataQueryWithWorker([{ Amount: 1, Unit: 'SGD' }, { Amount: 2, Unit: 'USD' }], {
            aggregates: [aggregate('sum')],
        })).rejects.toThrow(error);
    });
});
