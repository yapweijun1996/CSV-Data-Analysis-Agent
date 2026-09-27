// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeManagedDataQueryMock } = vi.hoisted(() => ({
    executeManagedDataQueryMock: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

describe('executeStructuredDataQuery abort handling', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('does not commit query state or traces when the query is aborted', async () => {
        const { executeStructuredDataQuery } = await import('../services/agent/execution/dataQueryExecution');
        const controller = new AbortController();
        let state = {
            settings: { language: 'English' },
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 1200 }],
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical' },
                { name: 'Revenue', type: 'number' },
            ],
            activeDataQuery: null,
            activeSpreadsheetFilter: null,
            spreadsheetFilterFunction: null,
            aiFilterExplanation: null,
            isSpreadsheetVisible: false,
            duckDbSessionStatus: null,
            chatHistory: [],
            queryHistory: [],
            cleaningRun: null,
            addProgress: vi.fn(),
            logAgentToolUsage: vi.fn(),
        };
        const store = {
            getState: () => state,
            setState: (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
                const partial = typeof update === 'function' ? update(state) : update;
                state = { ...state, ...partial };
            },
        };

        executeManagedDataQueryMock.mockImplementation(async (_dataset, _plan, _allowedColumns, options?: { abortSignal?: AbortSignal }) => new Promise((_, reject) => {
            options?.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason), { once: true });
        }));

        const executionPromise = executeStructuredDataQuery(store as never, {
            explanation: 'Preview the region column.',
            plan: {
                select: ['Region'],
                limit: 5,
            },
            phase: 'analysis',
            origin: 'chat',
            appendChatTrace: true,
            appendCleaningRunTrace: true,
            scrollToRawDataExplorer: false,
            allowNativeFallback: true,
            abortSignal: controller.signal,
        });

        controller.abort(new DOMException('Cancelled the current agent run.', 'AbortError'));

        await expect(executionPromise).rejects.toMatchObject({ name: 'AbortError' });
        expect(state.activeDataQuery).toBeNull();
        expect(state.queryHistory).toHaveLength(0);
        expect(state.chatHistory).toHaveLength(0);
        expect(state.logAgentToolUsage).not.toHaveBeenCalled();
    });
});
