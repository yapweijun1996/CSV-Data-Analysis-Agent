import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingMutationConfirmation } from '../types';
import { runRowDeletePreflight, tryHandlePendingMutationConfirmation } from '../services/agent/orchestration/chatMutationWorkflow';

const {
    generateFilterFunctionMock,
    executeManagedDataQueryMock,
    executeDeterministicMutationPlanMock,
} = vi.hoisted(() => ({
    generateFilterFunctionMock: vi.fn(),
    executeManagedDataQueryMock: vi.fn(),
    executeDeterministicMutationPlanMock: vi.fn(),
}));

vi.mock('../services/aiService', () => ({
    generateFilterFunction: generateFilterFunctionMock,
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    executeManagedDataQuery: executeManagedDataQueryMock,
}));

vi.mock('../services/agent/execution/deterministicMutationExecutor', () => ({
    executeDeterministicMutationPlan: executeDeterministicMutationPlanMock,
}));

const createStore = () => {
    let state = {
        csvData: {
            fileName: 'cleaned.csv',
            data: [
                { Code: '501001', Description: 'A', Amount: 10 },
                { Code: '501001', Description: 'B', Amount: 20 },
                { Code: '900000', Description: 'C', Amount: 30 },
            ],
        },
        columnProfiles: [
            { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
            { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [10, 30] },
        ],
        settings: {
            provider: 'openai' as const,
            geminiApiKey: '',
            openAIApiKey: 'key',
            simpleModel: 'gpt-5-mini',
            complexModel: 'gpt-5.2',
            language: 'English' as const,
            autoConfirmGoal: true,
        },
        chatHistory: [] as Array<Record<string, unknown>>,
        isBusy: false,
        pendingClarification: null,
        pendingMutationConfirmation: null as PendingMutationConfirmation | null,
        cleaningRun: null,
        dataPreparationPlan: null,
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        regenerateAnalyses: vi.fn(),
    };

    const setState = (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };

    return {
        getState: () => state,
        setState,
    };
};

const createManagedExecution = (overrides?: Partial<Awaited<ReturnType<typeof executeManagedDataQueryMock>>>) => ({
    result: {
        rows: [
            { Code: '501001', Description: 'A', Amount: 10 },
            { Code: '501001', Description: 'B', Amount: 20 },
        ],
        totalMatchedRows: 2,
        returnedRows: 2,
        truncated: false,
        selectedColumns: ['Code', 'Description', 'Amount'],
        appliedOrderBy: [],
        appliedLimit: 20,
        durationMs: 5,
    },
    engine: 'duckdb' as const,
    sqlPreview: 'select * from session_clean_dataset where "Code" = \'501001\'',
    tableName: 'session_clean_dataset',
    loadVersion: 'dataset-1',
    fallbackReason: null,
    ...overrides,
});

describe('chat row delete mutation workflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateFilterFunctionMock.mockResolvedValue({
            explanation: 'Match rows where Code equals 501001.',
            operation: {
                id: 'filter-code-501001',
                type: 'filter_rows',
                reason: 'Rows where Code equals 501001.',
                predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
            },
        });
        executeManagedDataQueryMock.mockResolvedValue(createManagedExecution());
        executeDeterministicMutationPlanMock.mockImplementation(async (plan, store) => {
            const nextRows = store.getState().csvData.data.filter((row: { Code: string }) => row.Code !== '501001');
            store.setState({
                csvData: { ...store.getState().csvData, data: nextRows },
                dataPreparationPlan: plan,
            });
            return {
                data: store.getState().csvData,
                logs: [],
                rowCountBefore: 3,
                rowCountAfter: 1,
            };
        });
    });

    it('preflights matched rows without mutating data and stores pending confirmation', async () => {
        const store = createStore();

        await runRowDeletePreflight('remove rows where Code = 501001', store as never);

        expect(generateFilterFunctionMock).toHaveBeenCalledOnce();
        expect(executeManagedDataQueryMock).toHaveBeenCalledOnce();
        expect(executeDeterministicMutationPlanMock).not.toHaveBeenCalled();
        expect(store.getState().csvData.data).toHaveLength(3);
        expect(store.getState().pendingMutationConfirmation).toMatchObject({
            request: 'remove rows where Code = 501001',
            matchedRowCount: 2,
            engine: 'duckdb',
            filterRows: expect.objectContaining({ type: 'filter_rows' }),
            mutationOperation: expect.objectContaining({ type: 'drop_rows_by_condition' }),
        });
        expect(store.getState().chatHistory.at(-1)).toMatchObject({
            type: 'ai_mutation_confirmation',
            suggestedActions: [
                { label: 'Confirm delete', action: 'confirm delete' },
                { label: 'Cancel delete', action: 'cancel delete' },
            ],
        });
    });

    it('stops after preflight when zero rows match', async () => {
        const store = createStore();
        executeManagedDataQueryMock.mockResolvedValueOnce(createManagedExecution({
            result: {
                rows: [],
                totalMatchedRows: 0,
                returnedRows: 0,
                truncated: false,
                selectedColumns: ['Code'],
                appliedOrderBy: [],
                appliedLimit: 20,
                durationMs: 4,
            },
            engine: 'native',
            fallbackReason: 'duckdb_disabled',
        }));

        await runRowDeletePreflight('remove rows where Code = 501001', store as never);

        expect(store.getState().pendingMutationConfirmation).toBeNull();
        expect(executeDeterministicMutationPlanMock).not.toHaveBeenCalled();
        expect(store.getState().csvData.data).toHaveLength(3);
        expect(String(store.getState().chatHistory.at(-1)?.text)).toContain('No matching rows were found');
    });

    it('repairs inverted equality delete filters before preflight preview', async () => {
        const store = createStore();
        generateFilterFunctionMock.mockResolvedValueOnce({
            explanation: 'Exclude rows where Code equals 501001.',
            operation: {
                id: 'filter-code-501001',
                type: 'filter_rows',
                reason: 'Keep rows where Code is not 501001.',
                predicates: [{ column: 'Code', operator: 'neq', value: '501001' }],
            },
        });

        await runRowDeletePreflight('remove rows where Code = 501001', store as never);

        const pending = store.getState().pendingMutationConfirmation;
        expect(pending).not.toBeNull();
        expect(pending?.filterRows).toMatchObject({
            predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
        });
        expect(pending?.mutationOperation).toMatchObject({
            predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
        });
    });

    it('expands spacing and punctuation variants for delete targets before preflight preview', async () => {
        const store = createStore();
        store.setState({
            csvData: {
                fileName: 'cleaned.csv',
                data: [
                    { CUSTOMER: '>> TOTAL', Amount: 10 },
                    { CUSTOMER: '>> SUB-TOTAL', Amount: 20 },
                    { CUSTOMER: 'Acme', Amount: 30 },
                ],
            },
            columnProfiles: [
                { name: 'CUSTOMER', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'Amount', type: 'numerical', missingPercentage: 0, valueRange: [10, 30] },
            ],
        });
        generateFilterFunctionMock.mockResolvedValueOnce({
            explanation: 'Delete requested summary rows.',
            operation: {
                id: 'filter-summary-customers',
                type: 'filter_rows',
                reason: 'Rows where CUSTOMER is >>TOTAL or >>Sub total.',
                groups: [
                    { predicates: [{ column: 'CUSTOMER', operator: 'eq', value: '>>TOTAL' }] },
                    { predicates: [{ column: 'CUSTOMER', operator: 'eq', value: '>>Sub total' }] },
                ],
            },
        });
        executeManagedDataQueryMock.mockResolvedValueOnce({
            result: {
                rows: [
                    { CUSTOMER: '>> TOTAL', Amount: 10 },
                    { CUSTOMER: '>> SUB-TOTAL', Amount: 20 },
                ],
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['CUSTOMER', 'Amount'],
                appliedOrderBy: [],
                appliedLimit: 20,
                durationMs: 5,
            },
            engine: 'duckdb' as const,
            sqlPreview: 'select * from session_clean_dataset where lower("CUSTOMER") in (...)',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
            fallbackReason: null,
        });

        await runRowDeletePreflight('remove rows when CUSTOMER is >>TOTAL or >>Sub total', store as never);

        const pending = store.getState().pendingMutationConfirmation;
        expect(pending).not.toBeNull();
        expect(pending?.filterRows.groups).toEqual([
            { predicates: [{ column: 'CUSTOMER', operator: 'eq', value: '>> TOTAL' }] },
            { predicates: [{ column: 'CUSTOMER', operator: 'eq', value: '>> SUB-TOTAL' }] },
        ]);
    });

    it('builds an app-owned drop_rows_by_condition mutation on confirm and verifies the deletion', async () => {
        const store = createStore();
        store.setState({
            pendingMutationConfirmation: {
                request: 'remove rows where Code = 501001',
                filterRows: {
                    id: 'filter-code-501001',
                    type: 'filter_rows',
                    reason: 'Rows where Code equals 501001.',
                    predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                },
                mutationOperation: {
                    id: 'drop_filter-code-501001',
                    type: 'drop_rows_by_condition',
                    reason: 'Confirmed chat row deletion.',
                    predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                },
                queryPlan: {
                    select: ['Code', 'Description', 'Amount'],
                    where: {
                        predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                    },
                    limit: 20,
                },
                matchedRowCount: 2,
                previewRows: [
                    { Code: '501001', Description: 'A', Amount: 10 },
                    { Code: '501001', Description: 'B', Amount: 20 },
                ],
                engine: 'native',
                fallbackReason: 'duckdb_disabled',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
            } satisfies PendingMutationConfirmation,
        });
        executeManagedDataQueryMock.mockResolvedValueOnce(createManagedExecution({
            result: {
                rows: [],
                totalMatchedRows: 0,
                returnedRows: 0,
                truncated: false,
                selectedColumns: ['Code'],
                appliedOrderBy: [],
                appliedLimit: 1,
                durationMs: 3,
            },
            engine: 'native',
            fallbackReason: 'duckdb_disabled',
        }));

        const handled = await tryHandlePendingMutationConfirmation('confirm delete', store as never);

        expect(handled).toBe(true);
        expect(executeDeterministicMutationPlanMock).toHaveBeenCalledOnce();
        expect(executeDeterministicMutationPlanMock.mock.calls[0]?.[0]).toMatchObject({
            explanation: expect.stringContaining('Delete rows confirmed from chat request'),
            operations: [
                expect.objectContaining({
                    type: 'drop_rows_by_condition',
                    predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                }),
            ],
        });
        expect(executeManagedDataQueryMock).toHaveBeenCalledOnce();
        expect(store.getState().csvData.data).toHaveLength(1);
        expect(store.getState().pendingMutationConfirmation).toBeNull();
        expect(String(store.getState().chatHistory.at(-1)?.text)).toContain('Verification: passed');
        expect(String(store.getState().chatHistory.at(-1)?.text)).toContain('DuckDB fallback');
    });

    it('cancels a pending delete without changing data', async () => {
        const store = createStore();
        store.setState({
            pendingMutationConfirmation: {
                request: 'remove rows where Code = 501001',
                filterRows: {
                    id: 'filter-code-501001',
                    type: 'filter_rows',
                    reason: 'Rows where Code equals 501001.',
                    predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                },
                mutationOperation: {
                    id: 'drop_filter-code-501001',
                    type: 'drop_rows_by_condition',
                    reason: 'Confirmed chat row deletion.',
                    predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                },
                queryPlan: {
                    select: ['Code', 'Description', 'Amount'],
                    where: {
                        predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                    },
                    limit: 20,
                },
                matchedRowCount: 2,
                previewRows: [
                    { Code: '501001', Description: 'A', Amount: 10 },
                    { Code: '501001', Description: 'B', Amount: 20 },
                ],
                engine: 'duckdb',
                fallbackReason: null,
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
            } satisfies PendingMutationConfirmation,
        });

        const handled = await tryHandlePendingMutationConfirmation('cancel delete', store as never);

        expect(handled).toBe(true);
        expect(executeDeterministicMutationPlanMock).not.toHaveBeenCalled();
        expect(store.getState().pendingMutationConfirmation).toBeNull();
        expect(store.getState().csvData.data).toHaveLength(3);
        expect(String(store.getState().chatHistory.at(-1)?.text)).toContain('was not changed');
    });

    it('does not treat confirmation phrases as commands when nothing is pending', async () => {
        const store = createStore();

        const handled = await tryHandlePendingMutationConfirmation('proceed', store as never);

        expect(handled).toBe(false);
        expect(executeDeterministicMutationPlanMock).not.toHaveBeenCalled();
    });
});
