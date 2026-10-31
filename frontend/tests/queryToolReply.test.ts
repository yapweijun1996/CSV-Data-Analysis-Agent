import { describe, expect, it } from 'vitest';
import { buildObservedQueryReply } from '../services/agent/orchestration/queryToolReply';

describe('queryToolReply', () => {
    it('visibly labels inferred units without labeling ordinary summaries', () => {
        const state = {
            settings: { language: 'English' },
            activeDataQuery: {
                explanation: 'Sum amounts', engine: 'native', sqlPreview: null,
                plan: { aggregates: [{ function: 'sum', column: 'Amount', as: 'total' }] },
                result: { returnedRows: 1, totalMatchedRows: 1, unitInferred: true },
            },
        };
        const action = { type: 'tool_call', toolName: 'data.query', args: {} };
        expect(buildObservedQueryReply(state as never, action as never)).toContain('unit inferred, not confirmed');
        state.activeDataQuery.result.unitInferred = false;
        expect(buildObservedQueryReply(state as never, action as never)).not.toContain('unit inferred, not confirmed');
    });

    it.each([
        ['English', 'I ran the read-only summary query and returned 1 of 2 summary rows.'],
        ['Mandarin', '我已运行只读汇总查询，返回 1/2 汇总行。'],
        ['Malay', 'Saya telah menjalankan kueri ringkasan baca sahaja dan mengembalikan 1 daripada 2 baris ringkasan.'],
        ['Japanese', '読み取り専用の集計クエリを実行し、1/2 集計行 を返しました。'],
    ] as const)('builds localized data.query replies in %s', (language, expected) => {
        const reply = buildObservedQueryReply({
            settings: { language },
            activeSpreadsheetFilter: null,
            aiFilterExplanation: null,
            activeDataQuery: {
                explanation: 'Summarize the data.',
                engine: 'duckdb',
                sqlPreview: 'select Project, count(*) as record_count from dataset group by Project',
                fallbackFilterOperation: null,
                plan: {
                    select: ['Project', 'record_count'],
                    groupBy: ['Project'],
                    aggregates: [{ function: 'count', as: 'record_count' }],
                },
                result: {
                    returnedRows: 1,
                    totalMatchedRows: 2,
                },
            },
        } as never, {
            type: 'tool_call',
            toolName: 'data.query',
            args: {},
        } as never);

        expect(reply).toBe(expected);
    });
});
