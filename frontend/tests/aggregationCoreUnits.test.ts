// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisPlan, CsvRow } from '../types';
import { aggregationHasInferredUnit, executeAggregationCore } from '../services/agent/execution/executors/aggregationCore';

const plan: AnalysisPlan = {
    chartType: 'bar', title: 'Totals', description: 'Totals by group',
    groupByColumn: 'Group', valueColumn: 'Amount', aggregation: 'sum',
};
const run = (data: CsvRow[], spec: AnalysisPlan = plan) => executeAggregationCore({ fileName: 'synthetic.csv', data }, spec);

describe('worker aggregation unit guard', () => {
    it('reports inferred units only for guarded measures with one companion', () => {
        const data = { fileName: 'synthetic.csv', data: [{ Group: 'A', Amount: 1, Unit: 'kg' }] };
        expect(aggregationHasInferredUnit(data, plan)).toBe(true);
        expect(aggregationHasInferredUnit(data, { ...plan, aggregation: 'count' })).toBe(false);
        expect(aggregationHasInferredUnit(data, { ...plan, chartType: 'combo', aggregation: 'count', secondaryValueColumn: 'Amount', secondaryAggregation: 'avg' })).toBe(true);
        expect(aggregationHasInferredUnit({ ...data, data: [{ ...data.data[0], Currency: 'USD' }] }, plan)).toBe(false);
    });

    it('returns the same refusal and safe result through worker dispatch', async () => {
        const postMessage = vi.fn();
        const worker = { postMessage, onmessage: null as null | ((event: { data: unknown }) => void) };
        vi.stubGlobal('self', worker);
        try {
            // The worker installs its handler at module load, after the synthetic global is installed.
            await import('../services/workers/dataWorker');
            const data = { fileName: 'synthetic.csv', data: [{ Group: 'A', Amount: 1, Unit: 'kg' }, { Group: 'A', Amount: 2, Unit: 'lb' }] };
            worker.onmessage!({ data: { id: 1, task: 'executeAggregation', payload: { data, spec: plan } } });
            expect(postMessage.mock.calls[0][0]).toMatchObject({ id: 1, success: false, error: expect.stringContaining('mixed_or_missing_units') });
            worker.onmessage!({ data: { id: 2, task: 'executeAggregation', payload: { data, spec: { ...plan, preFilter: [{ column: 'Unit', operator: 'eq', value: 'kg' }] } } } });
            expect(postMessage.mock.calls[1][0]).toMatchObject({ id: 2, success: true, result: [{ Group: 'A', Amount: 1 }] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it.each(['sum', 'avg'] as const)('rejects mixed and missing units for %s', aggregation => {
        const spec = { ...plan, aggregation };
        expect(() => run([{ Group: 'A', Amount: 1, Unit: 'kg' }, { Group: 'A', Amount: 2, Unit: 'lb' }], spec)).toThrow('mixed_or_missing_units');
        expect(() => run([{ Group: 'A', Amount: 1, Unit: 'kg' }, { Group: 'A', Amount: 2, Unit: '  ' }], spec)).toThrow('mixed_or_missing_units');
        expect(() => run([{ Group: 'A', Amount: 1, Unit: 'kg' }, { Group: 'A', Amount: 2 }], spec)).toThrow('mixed_or_missing_units');
    });

    it('checks each group independently and ignores nonnumeric values', () => {
        expect(run([
            { Group: 'A', Amount: 1, Units: 'kg' }, { Group: 'A', Amount: 'invalid', Units: 'lb' },
            { Group: 'B', Amount: 2, Units: 'lb' },
        ])).toEqual([{ Group: 'B', Amount: 2 }, { Group: 'A', Amount: 1 }]);
    });

    it('checks only filtered rows and resolves value names case-insensitively', () => {
        const rows = [{ Group: 'A', amount: 1, Currency: 'USD' }, { Group: 'A', amount: 2, Currency: 'EUR' }];
        expect(() => run(rows)).toThrow('mixed_or_missing_units');
        expect(run(rows, { ...plan, preFilter: [{ column: 'Currency', operator: 'eq', value: 'USD' }] })).toEqual([{ Group: 'A', Amount: 1 }]);
    });

    it('leaves counts and ambiguous or absent companions unchanged', () => {
        const rows = [{ Group: 'A', Amount: 1, Unit: 'kg' }, { Group: 'A', Amount: 2, Unit: 'lb' }];
        expect(run(rows, { ...plan, aggregation: 'count' })).toEqual([{ Group: 'A', Amount: 2 }]);
        expect(run([{ Group: 'A', Amount: 1 }, { Group: 'A', Amount: 2 }])).toEqual([{ Group: 'A', Amount: 3 }]);
        expect(run(rows.map(row => ({ ...row, Currency: 'USD' })))).toEqual([{ Group: 'A', Amount: 3 }]);
    });

    it('checks combo measures independently while allowing count with mixed units', () => {
        const combo: AnalysisPlan = { ...plan, chartType: 'combo', aggregation: 'count', secondaryValueColumn: 'Other', secondaryAggregation: 'avg' };
        const rows = [{ Group: 'A', Amount: 1, Other: 4, Unit: 'kg' }, { Group: 'A', Amount: 2, Other: 'bad', Unit: 'lb' }];
        expect(run(rows, combo)).toEqual([{ Group: 'A', Amount: 2, Other: 4 }]);
        expect(() => run(rows, { ...combo, aggregation: 'sum' })).toThrow('mixed_or_missing_units');
        expect(() => run([{ ...rows[0], Other: 4 }, { ...rows[1], Other: 5 }], combo)).toThrow('mixed_or_missing_units');
    });

    it('uses composite groups and exact raw unit equality', () => {
        const spec = { ...plan, groupByColumn: 'Composite', _internal_groupByColumns: ['Group', 'Part'] };
        expect(run([{ Group: 'A', Part: 'x', Amount: 1, Unit: 'kg' }, { Group: 'A', Part: 'y', Amount: 2, Unit: 'lb' }], spec)).toEqual([
            { Composite: 'A - y', Amount: 2 }, { Composite: 'A - x', Amount: 1 },
        ]);
        expect(() => run([{ Group: 'A', Part: 'x', Amount: 1, Unit: 'kg' }, { Group: 'A', Part: 'x', Amount: 2, Unit: ' kg' }], spec)).toThrow('mixed_or_missing_units');
    });
});
