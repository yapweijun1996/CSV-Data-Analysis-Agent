// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSpreadsheetFilter } from '../services/agent/execution/spreadsheetFilterRuntime';

const {
    generateFilterFunctionMock,
    isProviderConfiguredMock,
} = vi.hoisted(() => ({
    generateFilterFunctionMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
}));

vi.mock('../services/aiService', () => ({
    generateFilterFunction: generateFilterFunctionMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

const createStore = () => {
    let state = {
        settings: {
            provider: 'openai' as const,
            geminiApiKey: '',
            openAIApiKey: 'key',
            simpleModel: 'gpt-5-mini',
            complexModel: 'gpt-5.2',
            language: 'English' as const,
            autoConfirmGoal: true,
        },
        csvData: {
            fileName: 'report.csv',
            data: [
                { Address: '36 TUAS ROAD', Description: 'Construction', Amount: 10 },
                { Address: '12 OTHER ROAD', Description: 'Other', Amount: 5 },
            ],
        },
        columnProfiles: [
            { name: 'Address', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [5, 10] as [number, number] },
        ],
        isAiFiltering: false,
        activeDataQuery: { explanation: 'old query' },
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        isSpreadsheetVisible: false,
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        recordAgentEvent: vi.fn(),
    };

    return {
        getState: () => state,
        setState: (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
            const partial = typeof update === 'function' ? update(state) : update;
            state = { ...state, ...partial };
        },
    };
};

describe('spreadsheetFilterRuntime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isProviderConfiguredMock.mockReturnValue(true);
    });

    it('writes single-predicate observation and deterministic final reply', async () => {
        const store = createStore();
        generateFilterFunctionMock.mockResolvedValue({
            explanation: 'Filter rows where Address contains 36 TUAS ROAD.',
            operation: {
                id: 'filter-1',
                type: 'filter_rows',
                reason: 'Match Address rows.',
                predicates: [{ column: 'Address', operator: 'contains', value: '36 TUAS ROAD' }],
            },
        });

        const result = await runSpreadsheetFilter('36 TUAS ROAD', store as never, { origin: 'chat' });

        expect(result.observation.selectedColumn).toBe('Address');
        expect(result.observation.operator).toBe('contains');
        expect(result.observation.value).toBe('36 TUAS ROAD');
        expect(result.observation.matchedRowCount).toBe(1);
        expect(result.observation.previewRows).toEqual([{ Address: '36 TUAS ROAD', Description: 'Construction', Amount: 10 }]);
        expect(result.finalReply).toContain('Address contains "36 TUAS ROAD"');
        expect(store.getState().activeDataQuery).toBeNull();
        expect(store.getState().activeSpreadsheetFilter?.requestId).toBeTruthy();
    });

    it('reports zero-match filters without inventing matched rows', async () => {
        const store = createStore();
        generateFilterFunctionMock.mockResolvedValue({
            explanation: 'Filter rows where Address equals NOWHERE.',
            operation: {
                id: 'filter-2',
                type: 'filter_rows',
                reason: 'Match no rows.',
                predicates: [{ column: 'Address', operator: 'eq', value: 'NOWHERE' }],
            },
        });

        const result = await runSpreadsheetFilter('NOWHERE', store as never, { origin: 'chat' });

        expect(result.observation.matchedRowCount).toBe(0);
        expect(result.finalReply).toContain('matched 0 rows');
    });

    it.each([
        ['English', 'Address contains "36 TUAS ROAD". It matched 1 row.'],
        ['Mandarin', 'Address 包含 "36 TUAS ROAD"，共匹配 1 行。'],
        ['Malay', 'Address mengandungi "36 TUAS ROAD". Ia memadankan 1 baris.'],
        ['Japanese', 'Address が を含む "36 TUAS ROAD" である行に対して生データエクスプローラーに一時フィルターを適用しました。1 行 が一致しました。'],
    ] as const)('localizes spreadsheet filter replies in %s', async (language, expectedSnippet) => {
        const store = createStore();
        store.setState({
            settings: {
                ...store.getState().settings,
                language,
            },
        });
        generateFilterFunctionMock.mockResolvedValue({
            explanation: 'Filter rows where Address contains 36 TUAS ROAD.',
            operation: {
                id: 'filter-1',
                type: 'filter_rows',
                reason: 'Match Address rows.',
                predicates: [{ column: 'Address', operator: 'contains', value: '36 TUAS ROAD' }],
            },
        });

        const result = await runSpreadsheetFilter('36 TUAS ROAD', store as never, { origin: 'chat' });

        expect(result.finalReply).toContain(expectedSnippet);
    });

    it('keeps single-value observation fields null for composite filters', async () => {
        const store = createStore();
        generateFilterFunctionMock.mockResolvedValue({
            explanation: 'Filter rows with composite conditions.',
            operation: {
                id: 'filter-3',
                type: 'filter_rows',
                reason: 'Composite match.',
                predicates: [
                    { column: 'Address', operator: 'contains', value: 'ROAD' },
                    { column: 'Description', operator: 'contains', value: 'Construction' },
                ],
            },
        });

        const result = await runSpreadsheetFilter('ROAD construction', store as never, { origin: 'chat' });

        expect(result.observation.selectedColumn).toBeNull();
        expect(result.observation.operator).toBeNull();
        expect(result.observation.value).toBeNull();
        expect(result.finalReply).toContain('generated filter conditions');
        expect(result.finalReply).not.toContain('Address contains');
    });

    it('does not commit spreadsheet filter state when the request is aborted mid-flight', async () => {
        const store = createStore();
        const controller = new AbortController();
        generateFilterFunctionMock.mockImplementation(async (_query, _profiles, _previewRows, _settings, _state, abortSignal?: AbortSignal) => new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        }));

        const resultPromise = runSpreadsheetFilter('36 TUAS ROAD', store as never, { origin: 'chat' }, controller.signal);
        controller.abort(new DOMException('Cancelled the current agent run.', 'AbortError'));

        await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
        expect(store.getState().activeSpreadsheetFilter).toBeNull();
        expect(store.getState().spreadsheetFilterFunction).toBeNull();
        expect(store.getState().aiFilterExplanation).toBeNull();
        expect(store.getState().isAiFiltering).toBe(false);
    });
});
