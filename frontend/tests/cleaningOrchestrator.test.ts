import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orchestrateAiCleaning } from '../services/agent/orchestration/cleaningOrchestrator';
import { buildDeterministicCleaningFallbackAction } from '../services/agent/orchestration/deterministicCleaningFallback';
import { applyDataOperations } from '../services/agent/execution/dataOperationRunner';
import type { StoreApi } from '../services/agent/types';
import type { AppStore } from '../store/useAppStore';
import type { ToolExecutionResult, ToolName } from '../types';
import * as actionHandlerModule from '../services/agent/actionHandler';
import { createHierarchicalStatementCase, createMultiHeaderProjectMatrixCase, createMultiHeaderIntakeIr, createWeakSignalMixedReportCase } from './reportShapeFixtures/cases';
import {
    createAlreadyTabularWithReportNoiseCleanedGood,
    createAlreadyTabularWithReportNoiseRaw,
} from './reportShapeFixtures/families';

const {
    createProviderModelMock,
    generateTextMock,
    isProviderConfiguredMock,
    jsonSchemaMock,
    toolMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'mock', modelId: 'test-model' } })),
    generateTextMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
    jsonSchemaMock: vi.fn((schema: unknown) => schema),
    toolMock: vi.fn((definition: unknown) => definition),
}));

vi.mock('ai', () => ({
    generateText: generateTextMock,
    jsonSchema: jsonSchemaMock,
    tool: toolMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

vi.mock('../services/agent/actionHandler', () => ({
    handleAiAction: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    primeDuckDbDataset: vi.fn(async () => ({
        engine: 'fallback',
        fallbackReason: 'duckdb_disabled',
        tableName: null,
        loadVersion: null,
    })),
}));

const createStore = (provider: 'openai' | 'google' = 'openai'): { store: StoreApi; state: AppStore } => {
    const telemetryEvents: AppStore['telemetryEvents'] = [];
    const agentEvents: AppStore['agentEvents'] = [];
    const state = {
        sessionId: 'session-test',
        currentDatasetId: 'dataset-test',
        settings: {
            provider,
            openAIApiKey: provider === 'openai' ? 'test-key' : '',
            geminiApiKey: provider === 'google' ? 'test-key' : '',
            simpleModel: provider === 'openai' ? 'gpt-5-mini' : 'gemini-3-flash-preview',
            complexModel: provider === 'openai' ? 'gpt-5.2' : 'gemini-3-flash-preview',
            language: 'Mandarin',
            autoConfirmGoal: false,
        },
        csvData: {
            fileName: 'sample.csv',
            data: [{ ProjectCode: '10000', Amount: '100.00' }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        },
        rawCsvData: {
            fileName: 'sample.csv',
            data: [{ ProjectCode: '10000', Amount: '100.00' }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        },
        columnProfiles: [
            { name: 'ProjectCode', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Amount', type: 'numerical', valueRange: [100, 100], missingPercentage: 0 },
        ],
        analysisCards: [],
        workspaceActionHistory: [],
        workspaceFiles: {},
        chatHistory: [],
        cleaningRun: null,
        telemetryEvents,
        agentEvents,
        dataPreparationPlan: {
            explanation: 'Initial cleaning plan.',
            operations: [],
            outputColumns: [],
            planStatus: 'schema_only',
            consistencyIssues: [],
        },
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        logTelemetryEvent: vi.fn((event) => {
            telemetryEvents.push({
                id: `telemetry-${telemetryEvents.length + 1}`,
                provider,
                stage: event.stage,
                responseType: event.responseType,
                detail: event.detail,
                chunkSize: event.chunkSize,
                meta: event.meta,
                timestamp: new Date(),
            });
        }),
        recordAgentEvent: vi.fn((event) => {
            const recorded = {
                id: event.id ?? `agent-event-${agentEvents.length + 1}`,
                timestamp: event.timestamp ?? new Date(),
                phase: event.phase,
                step: event.step,
                status: event.status,
                message: event.message,
                detail: event.detail,
            };
            agentEvents.push(recorded);
            return recorded;
        }),
    } as unknown as AppStore;

    const store: StoreApi = {
        getState: () => state,
        setState: (partial) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            Object.assign(state, next);
        },
    };

    return { store, state };
};

const successResult = (
    toolName: ToolName | 'assistant_message',
    payload?: Record<string, unknown>,
): ToolExecutionResult => ({
    status: 'success',
    toolName,
    message: `Executed ${toolName}`,
    shouldStop: false,
    payload,
});

const workspacePayload = (operation: string, path: string): Record<string, unknown> => ({
    workspace: {
        operation,
        path,
        changed: false,
        affectsCleanedDataset: false,
    },
});

type LegacyMockToolCall = {
    toolName?: string;
    name?: string;
    input?: unknown;
    parsedArguments?: unknown;
};

type LegacyMockResult = {
    text?: string;
    content?: string;
    finishReason?: string;
    toolCalls?: LegacyMockToolCall[];
};

const normalizeLegacyToolCalls = (toolCalls: LegacyMockToolCall[] | undefined) =>
    (toolCalls ?? []).map(toolCall => ({
        toolName: toolCall.toolName ?? toolCall.name ?? '',
        input: toolCall.input ?? toolCall.parsedArguments ?? {},
    }));

const installGenerateTextMock = (generate: ReturnType<typeof vi.fn>) => {
    generateTextMock.mockImplementation(async (request) => {
        const result = await generate(request as never);
        const toolCalls = normalizeLegacyToolCalls(result.toolCalls);
        return {
            ...result,
            text: result.text ?? result.content ?? '',
            finishReason: result.finishReason ?? (toolCalls.length > 0 ? 'tool-calls' : 'stop'),
            toolCalls,
        };
    });
};

describe('orchestrateAiCleaning', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateTextMock.mockImplementation(async () => {
            throw new Error('Test generateText mock was not configured.');
        });
    });

    it('runs inspect -> mutate -> inspect -> verify and completes for a mixed report cleanup', async () => {
        const { store, state } = createStore('openai');
        const testCase = createWeakSignalMixedReportCase();
        // Build a mixed-report IR whose normalizedRows match the actual raw
        // data structure so buildRuntimeTableAssessmentFromIr produces a
        // 'confirmed' assessment (header row 4 has ≥45% text cells).
        const mixedNormalizedRows = [
            ['OPERATING REVIEW PACK', '', '', '', '', ''],
            ['', 'Extracted on 2026-09-30', '', '', '', ''],
            ['Section: Delivery Snapshot', '', '', '', '', ''],
            ['', '', '', '', '', ''],
            ['Code', 'Description', '22000', '22001', '22002', 'Grand Total'],
            ['8100', 'Reactive Jobs', '150.00', '120.00', '110.00', '380.00'],
            ['8110', 'Call-Out Jobs', '90.00', '100.00', '80.00', '270.00'],
            ['8120', 'Standby Jobs', '70.00', '65.00', '75.00', '210.00'],
            ['Code', 'Description', '22000', '22001', '22002', 'Grand Total'],
            ['8200', 'Planned Jobs', '100.00', '105.00', '115.00', '320.00'],
            ['8210', 'Shutdown Work', '110.00', '115.00', '95.00', '320.00'],
            ['8220', 'Retrofit Jobs', '85.00', '88.00', '92.00', '265.00'],
            ['Printed by runtime', '', '', '', '', ''],
        ];
        const mixedReportIr = createMultiHeaderIntakeIr({
            columnCount: 6,
            normalizedRows: mixedNormalizedRows,
            provisionalTable: { headerRowIndex: 4, headerLayerRowIndexes: [], bodyStartIndex: 5, summaryStartIndex: -1, repeatedHeaderRowIndexes: [8], metadataRowIndexes: [0, 1, 2], parameterRowIndexes: [] },
            diagnostics: { hasRepeatedHeader: true, hasParameterRowsBetweenHeaderAndBody: false, headerShapeDrift: false, singleColumnFallbackApplied: false, bodyEvidenceKind: 'numeric', segmentCountsByKind: { metadata: 1, body: 2 }, headerCandidates: [], bodyStartCandidates: [], evidenceStrength: 'moderate', fallbackReason: null },
        });
        state.rawCsvData = testCase.rawLike;
        // Set csvData to body rows only (indices 5-7, 9-11), excluding
        // metadata, headers, repeated headers, blank rows, and footers.
        // This matches what baseline noise removal produces.
        const bodyRows = testCase.rawLike.data.filter((_, i) => [5, 6, 7, 9, 10, 11].includes(i));
        state.csvData = {
            ...state.rawCsvData,
            data: bodyRows,
        };
        (state as any).rawIntakeIr = mixedReportIr;
        const fallbackAction = buildDeterministicCleaningFallbackAction(testCase.rawLike, mixedReportIr);
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/raw.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: String(fallbackAction?.args?.explanation ?? testCase.goodPlan?.explanation ?? ''),
                        operations: fallbackAction?.args?.operations ?? testCase.goodPlan?.operations ?? [],
                        outputColumns: fallbackAction?.args?.outputColumns ?? [],
                    },
                }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'workspace.read') {
                return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
            }
            state.csvData = testCase.cleanedGood;
            state.dataPreparationPlan = {
                ...(testCase.goodPlan ?? {
                    explanation: 'Unpivot detected project series.',
                    operations: [],
                    outputColumns: [],
                    planStatus: 'operations' as const,
                    consistencyIssues: [],
                }),
                explanation: String(action.args?.explanation ?? testCase.goodPlan?.explanation ?? ''),
                operations: action.args?.operations ?? [],
                outputColumns: action.args?.outputColumns ?? [],
            };
            return successResult(action.toolName);
        });

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(5);
        const editPrompt = String(generate.mock.calls[2]?.[0]?.messages?.[1]?.content ?? '');
        expect(editPrompt).toContain('**phase contract**');
        expect(editPrompt).toContain('- runtimeAssessmentSidecar: /cleaning/runtime_table_assessment.json');
        expect(editPrompt).toContain('**phase context**');
        expect(editPrompt).toContain('\"runtimeAssessment\"');
        expect(generate.mock.calls[2]?.[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'data.mutate' });
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.dataPreparationPlan?.explanation).toContain('staged through deterministic mutations');
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls[2]?.[0]).toMatchObject({
            type: 'tool_call',
            toolName: 'data.mutate',
        });
    });

    it('rejects label-dropping unpivot plans and requests a raw-based reshape repair', async () => {
        const { store, state } = createStore('google');
        const testCase = createMultiHeaderProjectMatrixCase();
        const broken = testCase.cleanedBroken.missingSeriesLabel!;
        const multiHeaderIr = createMultiHeaderIntakeIr();
        state.rawCsvData = testCase.rawLike;
        state.csvData = {
            ...testCase.rawLike,
            data: [...testCase.rawLike.data],
        };
        (state as any).rawIntakeIr = multiHeaderIr;
        const fallbackAction = buildDeterministicCleaningFallbackAction(testCase.rawLike, multiHeaderIr);
        const generate = vi.fn((request) => {
            const callIndex = generate.mock.calls.length - 1;
            if (callIndex === 0) {
                return Promise.resolve({
                    content: '',
                    toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/raw.csv', limit: 10 } }],
                });
            }
            if (callIndex === 1 || callIndex === 4 || callIndex === 5) {
                return Promise.resolve({
                    content: '',
                    toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
                });
            }
            if (callIndex === 2) {
                return Promise.resolve({
                    content: '',
                    toolCalls: [{
                        name: 'data.mutate',
                        parsedArguments: {
                            explanation: broken.plan?.explanation ?? 'Unpivot detected project series.',
                            operations: broken.plan?.operations ?? [],
                            outputColumns: [],
                        },
                    }],
                });
            }
            // Edit phase forces data.mutate tool choice; prompt content may include
            // runtime assessment sections and sidecar references that vary across builds.
            expect(request.toolChoice).toEqual({ type: 'tool', toolName: 'data.mutate' });
            return Promise.resolve({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: String(fallbackAction?.args?.explanation ?? testCase.goodPlan?.explanation ?? 'Unpivot detected project series and preserve secondary labels.'),
                        operations: fallbackAction?.args?.operations ?? testCase.goodPlan?.operations ?? [],
                        outputColumns: fallbackAction?.args?.outputColumns ?? [],
                    },
                }],
            });
        });
        installGenerateTextMock(generate);
        let mutateCallCount = 0;
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'workspace.read') {
                return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
            }

            mutateCallCount += 1;
            state.csvData = testCase.cleanedGood;
            state.dataPreparationPlan = {
                explanation: String(action.args?.explanation ?? fallbackAction?.args?.explanation ?? testCase.goodPlan?.explanation ?? ''),
                operations: action.args?.operations ?? fallbackAction?.args?.operations ?? [],
                outputColumns: action.args?.outputColumns ?? [],
                planStatus: 'operations',
                consistencyIssues: [],
            };
            return successResult(action.toolName);
        });

        await orchestrateAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('completed');
        expect(mutateCallCount).toBe(1);
        const mutateCalls = (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls
            .map(([action]) => action)
            .filter((action: { toolName?: string }) => action.toolName === 'data.mutate');
        const repairedUnpivot = mutateCalls[0]?.args?.operations?.find((operation: { type?: string }) => operation.type === 'unpivot_columns');
        expect(repairedUnpivot).toMatchObject({
            type: 'unpivot_columns',
            labelColumns: [{ outputColumn: 'SeriesLabelL1' }],
        });
    });

    it('resets cleaned.csv back to raw before running raw-based deterministic recovery', async () => {
        const { store, state } = createStore('google');
        const testCase = createMultiHeaderProjectMatrixCase();
        const broken = testCase.cleanedBroken.missingSeriesLabel!;
        const multiHeaderIr = createMultiHeaderIntakeIr();
        state.rawCsvData = testCase.rawLike;
        state.csvData = {
            ...testCase.rawLike,
            data: [...testCase.rawLike.data],
        };
        (state as any).rawIntakeIr = multiHeaderIr;
        const fallbackAction = buildDeterministicCleaningFallbackAction(testCase.rawLike, multiHeaderIr);

        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/raw.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: broken.plan?.explanation ?? 'Unpivot detected project series.',
                        operations: broken.plan?.operations ?? [],
                        outputColumns: [],
                    },
                }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({ content: '', toolCalls: [] })
            .mockResolvedValueOnce({ content: '', toolCalls: [] })
            .mockResolvedValueOnce({ content: '', toolCalls: [] });
        installGenerateTextMock(generate);

        let mutateCallCount = 0;
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'workspace.read') {
                return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
            }

            mutateCallCount += 1;
            expect(Object.keys(state.csvData?.data[0] ?? {})).toContain('col_1');
            expect(Object.keys(state.csvData?.data[0] ?? {})).not.toContain('SeriesKey');
            state.csvData = testCase.cleanedGood;
            state.dataPreparationPlan = {
                explanation: String(fallbackAction?.args?.explanation ?? testCase.goodPlan?.explanation ?? ''),
                operations: fallbackAction?.args?.operations ?? [],
                outputColumns: fallbackAction?.args?.outputColumns ?? [],
                planStatus: 'operations',
                consistencyIssues: [],
            };
            return successResult(action.toolName);
        });

        await orchestrateAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('completed');
        expect(mutateCallCount).toBe(1);
        expect(state.dataPreparationPlan?.explanation).toContain('staged through deterministic mutations');
    });

    it('fails stalled runs that repeat inspect without any mutation', async () => {
        const { store, state } = createStore('openai');
        state.rawCsvData = {
            fileName: 'wide.csv',
            data: [
                { Code: 'Code', Description: 'Description', 10000: '10000', 10001: '10001', 10002: '10002', 10003: '10003', 10004: '10004', 10005: '10005', 10006: '10006', 10007: '10007', 10008: '10008', Total: 'Total' },
                { Code: '501001', Description: 'Revenue', 10000: '10.00', 10001: '0.00', 10002: '0.00', 10003: '0.00', 10004: '0.00', 10005: '0.00', 10006: '0.00', 10007: '0.00', 10008: '0.00', Total: '10.00' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = {
            ...state.rawCsvData,
            data: [...state.rawCsvData.data],
        };
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) =>
            successResult(
                action.type === 'tool_call' ? action.toolName : 'assistant_message',
                workspacePayload('read', String(action.type === 'tool_call' ? action.args?.path ?? '/dataset/cleaned.csv' : '/dataset/cleaned.csv')),
            ),
        );

        await orchestrateAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('failed');
        expect(state.dataPreparationPlan?.explanation).toContain('stalled');
    });

    it('rejects repeated malformed mutate payloads before executor execution', async () => {
        const { store, state } = createStore('google');
        state.rawCsvData = {
            fileName: 'wide.csv',
            data: [
                { col_1: 'Report Title', col_2: '', col_3: '', col_4: '', col_5: '', col_6: '', col_7: '' },
                { col_1: 'Code', col_2: 'Description', col_3: '10000', col_4: '10001', col_5: '10002', col_6: '10003', col_7: 'Total' },
                { col_1: '501001', col_2: 'Revenue', col_3: '10.00', col_4: '0.00', col_5: '0.00', col_6: '0.00', col_7: '10.00' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = {
            ...state.rawCsvData,
            data: [...state.rawCsvData.data],
        };
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/raw.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: 'Remove metadata rows and unpivot the project columns.',
                        operations: [
                            {
                                id: 'remove_metadata_rows',
                                type: 'unpivot_columns',
                                indices: [0, 1],
                            },
                        ],
                        outputColumns: [],
                    },
                }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: 'Remove metadata rows and unpivot the project columns.',
                        operations: [
                            {
                                id: 'remove_metadata_rows',
                                type: 'unpivot_columns',
                                indices: [0, 1],
                            },
                        ],
                        outputColumns: [],
                    },
                }],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
        });

        await orchestrateAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('failed');
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
        expect(state.telemetryEvents.some(event =>
            event.stage === 'executor_error'
            && event.responseType === 'ai_cleaning_invalid_action'
            && event.detail?.includes('data.mutate'),
        )).toBe(true);
    });

    it('falls back to deterministic cleaning when Gemini exhausts edit turns without a valid mutation', async () => {
        const { store, state } = createStore('google');
        const metricColumns = ['10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007'];
        const wideReport = {
            fileName: 'fr_fin_pl_prj.csv',
            data: [
                Object.fromEntries([
                    ['col_1', 'BOUSTEAD PROJECTS E&C PTE LTD'],
                    ...metricColumns.map((_, index) => [`col_${index + 2}`, '']),
                    ['col_10', ''],
                ]),
                Object.fromEntries([
                    ['col_1', ''],
                    ['col_2', 'Income Statement By Project Reporting Date : 01-01-2025 Through 17-09-2025 Reporting Currency : SGD'],
                    ...metricColumns.map((_, index) => [`col_${index + 3}`, '']),
                ]),
                Object.fromEntries([
                    ['col_1', 'Code'],
                    ['col_2', 'Description'],
                    ...metricColumns.map((column, index) => [`col_${index + 3}`, column]),
                    ['col_11', 'Total'],
                ]),
                Object.fromEntries([
                    ['col_1', ''],
                    ['col_2', ''],
                    ...metricColumns.map((_, index) => [`col_${index + 3}`, `Project ${index + 1}`]),
                    ['col_11', ''],
                ]),
                Object.fromEntries([
                    ['col_1', '501001'],
                    ['col_2', 'Revenue'],
                    ...metricColumns.map((column, index) => [`col_${index + 3}`, index === 0 ? '10,000.00' : '0.00']),
                    ['col_11', '10,000.00'],
                ]),
                Object.fromEntries([
                    ['col_1', '600001'],
                    ['col_2', 'Project Costs'],
                    ...metricColumns.map((column, index) => [`col_${index + 3}`, index === 0 ? '-4,000.00' : '0.00']),
                    ['col_11', '-4,000.00'],
                ]),
                { col_1: '17-09-2025@ 17:48 | m8 | 124.155.214.47' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.rawCsvData = wideReport;
        state.csvData = {
            ...wideReport,
            data: [...wideReport.data],
        };
        (state as any).rawIntakeIr = createMultiHeaderIntakeIr({ fileName: 'fr_fin_pl_prj.csv' });

        const malformedMutateCall = (id: string) => ({
            content: '',
            toolCalls: [{
                name: 'data.mutate',
                parsedArguments: {
                    explanation: 'Remove metadata rows and promote the real header.',
                    operations: [
                        {
                            id,
                            type: 'unpivot_columns',
                            reason: 'Remove report title and parameter rows.',
                            indices: [0, 1],
                        },
                        {
                            id: `${id}-promote`,
                            type: 'unpivot_columns',
                            reason: 'Promote the row containing column codes to the header.',
                            rowIndex: 0,
                        },
                    ],
                    outputColumns: [],
                },
            }],
        });

        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/raw.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce(malformedMutateCall('drop-top-rows'))
            .mockResolvedValueOnce(malformedMutateCall('drop-metadata-rows'))
            .mockResolvedValueOnce(malformedMutateCall('drop-junk-rows'))
            .mockResolvedValueOnce(malformedMutateCall('drop-leading-rows'));
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'workspace.read') {
                return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
            }

            state.csvData = {
                fileName: 'fr_fin_pl_prj.csv',
                data: metricColumns.flatMap((projectCode, index) => ([
                    {
                        Code: '501001',
                        Description: 'Revenue',
                        ProjectCode: projectCode,
                        Amount: index === 0 ? '10,000.00' : '0.00',
                    },
                    {
                        Code: '600001',
                        Description: 'Project Costs',
                        ProjectCode: projectCode,
                        Amount: index === 0 ? '-4,000.00' : '0.00',
                    },
                ])),
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            };
            state.dataPreparationPlan = {
                explanation: String(action.args?.explanation ?? ''),
                operations: action.args?.operations ?? [],
                outputColumns: action.args?.outputColumns ?? [],
                planStatus: 'operations',
                consistencyIssues: [],
            };
            return successResult(action.toolName);
        });

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(6);
        expect(state.cleaningRun?.status).toBe('completed');
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
        const fallbackMutateCall = (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls
            .map(([action]) => action)
            .find((action: { toolName?: string }) => action.toolName === 'data.mutate');
        expect(fallbackMutateCall).toMatchObject({
            type: 'tool_call',
            toolName: 'data.mutate',
            args: {
                operations: [
                    { type: 'drop_rows_by_index' },
                    { type: 'promote_header_row' },
                    { type: 'drop_blank_rows' },
                    { type: 'unpivot_columns' },
                ],
            },
        });
        expect(state.dataPreparationPlan?.explanation).toContain('staged through deterministic mutations');
    });

    it('records telemetry when Gemini returns summaries instead of native tool calls during inspect', async () => {
        const { store, state } = createStore('google');
        state.rawCsvData = {
            fileName: 'wide.csv',
            data: [
                { Code: 'Code', Description: 'Description', 10000: '10000', 10001: '10001', 10002: '10002', 10003: '10003', Total: 'Total' },
                { Code: '501001', Description: 'Revenue', 10000: '10.00', 10001: '0.00', 10002: '0.00', 10003: '0.00', Total: '10.00' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = {
            ...state.rawCsvData,
            data: [...state.rawCsvData.data],
        };
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: 'I inspected cleaned.csv and it still looks wide.',
                toolCalls: [],
            })
            .mockResolvedValueOnce({
                content: 'I inspected cleaned.csv and it still looks wide.',
                toolCalls: [],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(successResult('assistant_message'));

        await orchestrateAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('failed');
        expect(state.telemetryEvents.some(event =>
            event.stage === 'executor_error'
            && event.responseType === 'ai_cleaning_invalid_action'
            && event.detail?.includes('Summary messages are only allowed'),
        )).toBe(true);
    });

    it('recovers inspect-only runs with deterministic cleanup for already tabular noisy datasets', async () => {
        const { store, state } = createStore('google');
        state.rawCsvData = createAlreadyTabularWithReportNoiseRaw();
        state.csvData = {
            ...state.rawCsvData,
            data: [...state.rawCsvData.data],
        };
        const generate = vi.fn().mockResolvedValue({
            content: '',
            toolCalls: [],
        });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'data.mutate') {
                state.csvData = createAlreadyTabularWithReportNoiseCleanedGood();
                state.dataPreparationPlan = {
                    explanation: String(action.args?.explanation ?? ''),
                    operations: action.args?.operations ?? [],
                    outputColumns: action.args?.outputColumns ?? [],
                    planStatus: 'operations',
                    consistencyIssues: [],
                };
                return successResult(action.toolName);
            }
            return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
        });

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(4);
        expect(state.cleaningRun?.status).toBe('completed');
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
            type: 'tool_call',
            toolName: 'data.mutate',
            args: {
                operations: [
                    { type: 'drop_rows_by_index' },
                    { type: 'drop_blank_rows' },
                ],
            },
        });
    });

    it('recovers inspect-only runs with deterministic hierarchy annotation for hierarchical statements', async () => {
        const { store, state } = createStore('google');
        const testCase = createHierarchicalStatementCase();
        state.rawCsvData = testCase.rawLike;
        state.csvData = {
            ...testCase.rawLike,
            data: [...testCase.rawLike.data],
        };
        const generate = vi.fn().mockResolvedValue({
            content: '',
            toolCalls: [],
        });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'data.mutate') {
                const mutation = applyDataOperations(state.csvData.data, action.args?.operations ?? []);
                state.csvData = {
                    ...state.csvData,
                    data: mutation.data,
                };
                state.dataPreparationPlan = {
                    explanation: String(action.args?.explanation ?? ''),
                    operations: action.args?.operations ?? [],
                    outputColumns: action.args?.outputColumns ?? [],
                    planStatus: 'operations',
                    consistencyIssues: [],
                };
                return successResult(action.toolName);
            }
            return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
        });

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(4);
        expect(state.cleaningRun?.status).toBe('completed');
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
        expect((actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
            type: 'tool_call',
            toolName: 'data.mutate',
            args: {
                operations: [
                    { type: 'drop_rows_by_index' },
                    { type: 'drop_blank_rows' },
                    { type: 'annotate_hierarchy' },
                ],
            },
        });
    });

    it('fails verification when a mutate result collapses to one descriptor group', async () => {
        const { store, state } = createStore('google');
        const metricColumns = ['10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10008'];
        state.rawCsvData = {
            fileName: 'wide.csv',
            data: [
                Object.fromEntries([
                    ['Code', 'Code'],
                    ['Description', 'Description'],
                    ...metricColumns.map(column => [column, column]),
                    ['Total', 'Total'],
                ]),
                Object.fromEntries([
                    ['Code', null],
                    ['Description', null],
                    ...metricColumns.map((column, index) => [column, `Project ${index + 1}`]),
                    ['Total', null],
                ]),
                ...Array.from({ length: 10 }, (_, index) => Object.fromEntries([
                    ['Code', `${501000 + index}`],
                    ['Description', `Metric ${index + 1}`],
                    ...metricColumns.map((column, metricIndex) => [column, metricIndex === 0 ? `${index + 1}.00` : '0.00']),
                    ['Total', `${index + 1}.00`],
                ])),
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = {
            ...state.rawCsvData,
            data: [...state.rawCsvData.data],
        };
        const generate = vi.fn((request) => {
            const callIndex = generate.mock.calls.length - 1;
            if (callIndex === 0 || callIndex === 2) {
                return Promise.resolve({
                    content: '',
                    toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
                });
            }
            return Promise.resolve({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: 'Unpivot project columns into long rows.',
                        operations: [
                            {
                                id: 'unpivot-projects',
                                type: 'unpivot_columns',
                                reason: 'Convert project columns into rows.',
                                sourceColumns: metricColumns,
                                keyColumn: 'ProjectCode',
                                valueColumn: 'Amount',
                                keepColumns: ['Code', 'Description'],
                            },
                        ],
                        outputColumns: [],
                    },
                }],
            });
        });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'workspace.read') {
                return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
            }
            state.csvData = {
                fileName: 'wide.csv',
                data: metricColumns.map((column, index) => ({
                    Code: '501001',
                    Description: 'Metric 1',
                    ProjectCode: column,
                    Amount: index === 0 ? '1.00' : '0.00',
                })),
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            };
            state.dataPreparationPlan = {
                explanation: 'Unpivot project columns into long rows.',
                operations: action.args?.operations ?? [],
                outputColumns: [],
                planStatus: 'operations',
                consistencyIssues: [],
            };
            return successResult(action.toolName);
        });

        await orchestrateAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('failed');
        expect(state.chatHistory.some(message => message.type === 'ai_cleaning_failure')).toBe(true);
    });

    it('forces inspect and verify before completing a no-edit cleaning run', async () => {
        const { store, state } = createStore('google');
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
        });

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(2);
        expect(generate.mock.calls[0]?.[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'workspace.read' });
        expect(generate.mock.calls[1]?.[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'workspace.read' });
        expect(state.telemetryEvents.filter(event => event.responseType === 'ai_cleaning' && event.stage === 'llm_request')).toHaveLength(2);
        expect(state.telemetryEvents.filter(event => event.responseType === 'ai_cleaning' && event.stage === 'llm_response')).toHaveLength(2);
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.dataPreparationPlan?.explanation).toContain('required no file edits');
        expect(state.cleaningRun?.strategyKind).toBe('already_valid');
    });

    it('fails already-valid runs when inspect returns summary-only responses instead of read-only tool calls', async () => {
        const { store, state } = createStore('google');
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: 'I inspected cleaned.csv and it already looks valid.',
                toolCalls: [],
            })
            .mockResolvedValueOnce({
                content: 'I inspected cleaned.csv and it already looks valid.',
                toolCalls: [],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(successResult('assistant_message'));

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(2);
        expect(state.cleaningRun?.status).toBe('failed');
        expect(state.cleaningRun?.strategyKind).toBe('already_valid');
        expect(state.dataPreparationPlan?.explanation).toContain('stalled in runtime');
    });

    it('fails already-valid runs when verify never returns a valid read-only action', async () => {
        const { store, state } = createStore('google');
        const generate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [],
            });
        installGenerateTextMock(generate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
        });

        await orchestrateAiCleaning(store);

        expect(generate).toHaveBeenCalledTimes(3);
        expect(state.cleaningRun?.status).toBe('failed');
        expect(state.cleaningRun?.strategyKind).toBe('already_valid');
        expect(state.dataPreparationPlan?.explanation).toContain('only performed inspection');
        expect(state.dataPreparationPlan?.explanation).not.toContain('required no file edits');
    });

    it('keeps data.query available only for OpenAI verify requests and blocks workspace text edits in edit policy', async () => {
        const { store: openAiStore, state: openAiState } = createStore('openai');
        openAiState.rawCsvData = {
            fileName: 'wide.csv',
            data: [
                { Code: 'Code', Description: 'Description', 10000: '10000', 10001: '10001', 10002: '10002', 10003: '10003', 10004: '10004', 10005: '10005', 10006: '10006', 10007: '10007', 10008: '10008', Total: 'Total' },
                { Code: '501001', Description: 'Revenue', 10000: '10.00', 10001: '0.00', 10002: '0.00', 10003: '0.00', 10004: '0.00', 10005: '0.00', 10006: '0.00', 10007: '0.00', 10008: '0.00', Total: '10.00' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        openAiState.csvData = {
            ...openAiState.rawCsvData,
            data: [...openAiState.rawCsvData.data],
        };
        const openAiGenerate = vi.fn()
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{
                    name: 'data.mutate',
                    parsedArguments: {
                        explanation: 'Normalize blanks.',
                        operations: [{ id: 'drop-blanks', type: 'drop_blank_rows', reason: 'Remove empty rows.' }],
                        outputColumns: [],
                    },
                }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            })
            .mockResolvedValueOnce({
                content: '',
                toolCalls: [{ name: 'workspace.read', parsedArguments: { path: '/dataset/cleaned.csv', limit: 10 } }],
            });
        installGenerateTextMock(openAiGenerate);
        (actionHandlerModule.handleAiAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (action) => {
            if (action.type !== 'tool_call') return successResult('assistant_message');
            if (action.toolName === 'data.mutate') {
                openAiState.csvData = {
                    fileName: 'wide.csv',
                    data: [{ Code: '501001', Description: 'Revenue', ProjectCode: '10000', Amount: '10.00' }],
                    metadataRows: [],
                    headerLayers: [],
                    summaryRows: [],
                    headerDepth: 1,
                };
                openAiState.dataPreparationPlan = {
                    explanation: 'Normalize blanks.',
                    operations: action.args?.operations ?? [],
                    outputColumns: [],
                    planStatus: 'operations',
                    consistencyIssues: [],
                };
                return successResult(action.toolName);
            }
            return successResult(action.toolName, workspacePayload('read', String(action.args?.path ?? '/dataset/cleaned.csv')));
        });

        await orchestrateAiCleaning(openAiStore);

        const openAiVerifyRequest = openAiGenerate.mock.calls[3]?.[0];
        expect(openAiGenerate.mock.calls[1]?.[0]?.toolChoice).toEqual({ type: 'tool', toolName: 'data.mutate' });
        expect(Object.keys(openAiGenerate.mock.calls[1]?.[0]?.tools ?? {})).toContain('data.mutate');
        expect(Object.keys(openAiVerifyRequest.tools ?? {})).toContain('data.query');
        expect(Object.keys(openAiVerifyRequest.tools ?? {})).not.toContain('workspace.diff');

        const registryLogs = (openAiState.logAgentToolUsage as unknown as ReturnType<typeof vi.fn>).mock.calls
            .map(([entry]) => entry)
            .filter((entry: { tool: string }) => entry.tool === 'tool_registry');
        expect(registryLogs[1]?.detail?.allowedTools.map((tool: { toolName: string }) => tool.toolName).sort()).toEqual([
            'cleaning.restart',
            'cleaning.resume',
            'data.mutate',
        ]);
    });
});
