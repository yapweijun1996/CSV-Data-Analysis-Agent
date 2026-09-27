import { describe, expect, it, vi } from 'vitest';
import type { ToolManifest } from '../types';
import {
    AGRUN_APP_TOOL_RESULT_KIND,
    AGRUN_MAX_ACTION_CALLS_PER_TURN,
    attachAgrunHostExecutionContext,
    createAgrunActionPolicy,
    createAgrunActionExecutionBridge,
    createAgrunActions,
    createAgrunReadOnlyActionPolicy,
    createAgrunReadOnlyActions,
    getAgrunMutationCanaryManifests,
    getAgrunReadOnlyCanaryManifests,
    mapManifestSchemaToAgrunArgs,
    toAgrunActionName,
} from '../services/agent/runtime/agrun/actionAdapter';
import { loadAgrunModule } from '../services/agent/runtime/agrun/agrunLoader';
import type {
    AgrunActionSpec,
    AgrunModule,
    AgrunRuntime,
} from '../services/agent/runtime/agrun/types';
import type { StoreApi } from '../services/agent/types';
import { createRuntimeTestStore } from './runtimeTestStore';

const createModuleStub = (): AgrunModule => ({
    createRuntime: vi.fn(() => ({
        run: vi.fn(),
        getState: vi.fn(),
        getRuntimeConfig: vi.fn(),
    } as unknown as AgrunRuntime)),
    defineAction: vi.fn(spec => spec),
    createSessionStore: vi.fn(),
    createMemoryStore: vi.fn(),
    createIndexedDBMessageStorage: vi.fn(),
});

describe('AGRUN-003 read-only action adapter', () => {
    it('maps manifest names to OpenAI-compatible Agrun action aliases', () => {
        expect(toAgrunActionName('data.query')).toBe('host_data_query');
        expect(toAgrunActionName('workspace.list')).toBe('host_workspace_list');
        expect(toAgrunActionName('already-safe')).toBe('host_already-safe');
        expect(toAgrunActionName('data.generatePivot'))
            .toBe('host_data_generatepivot');
    });

    it('discovers only the five manifest-declared canary actions', () => {
        expect(getAgrunReadOnlyCanaryManifests().map(manifest => manifest.name)).toEqual([
            'data.query',
            'data.describe',
            'workspace.list',
            'workspace.read',
            'workspace.search',
        ]);
    });

    it('discovers only data.mutate as the first manifest-declared mutation canary', () => {
        expect(getAgrunMutationCanaryManifests().map(manifest => manifest.name)).toEqual([
            'data.mutate',
        ]);
        expect(createAgrunActionPolicy()).toMatchObject({
            host_data_query: {
                action: 'allow',
            },
            host_data_mutate: {
                action: 'ask',
                reason: expect.stringContaining('requires your approval'),
            },
        });
    });

    it('maps manifest risk and mutability into conservative Agrun permission metadata', () => {
        const actions = createAgrunActions({
            bridge: createAgrunActionExecutionBridge(),
            executeAction: vi.fn(),
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const mutation = actions.find(candidate => candidate.name === 'host_data_mutate');

        expect(mutation).toMatchObject({
            tier: 2,
            permission: {
                effect: 'local_state_mutation',
                interruptBehavior: 'rollback_safe',
                isDestructive: true,
                isReadOnly: false,
                needsApproval: true,
                source: 'app_manifest',
            },
        });
    });

    it('maps the manifest JSON schema without creating a second schema source', () => {
        const manifest = {
            name: 'workspace.list',
            description: 'List files.',
            category: 'workspace',
            risk: 'low',
            enabledByDefault: true,
            inputSchema: {
                type: 'object',
                required: ['path'],
                properties: {
                    path: { type: 'string', description: 'Root path.' },
                    limit: { type: 'number' },
                },
            },
        } satisfies ToolManifest;

        expect(mapManifestSchemaToAgrunArgs(manifest)).toEqual({
            path: {
                type: 'string',
                description: 'Root path.',
                required: true,
            },
            limit: {
                type: 'number',
                required: false,
            },
        });
    });

    it('projects nested query schema types into Agrun-compatible planner rules', () => {
        const dataQueryManifest = getAgrunReadOnlyCanaryManifests()
            .find(manifest => manifest.name === 'data.query');
        expect(dataQueryManifest).toBeDefined();

        const schema = mapManifestSchemaToAgrunArgs(dataQueryManifest!);
        const plan = schema.plan as {
            properties: {
                limit: { type: string };
                aggregates: {
                    items: {
                        type: string;
                        properties: Record<string, unknown>;
                        required: string[];
                    };
                };
            };
        };

        expect(plan.properties.limit.type).toBe('number');
        expect(plan.properties.aggregates.items.type).toBe('object');
        expect(plan.properties.aggregates.items.properties).toHaveProperty('function');
        expect(plan.properties.aggregates.items.required).toEqual(['function', 'as']);
    });

    it('removes native-provider placeholders before app manifest validation', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const executeAction = vi.fn(async () => ({
            status: 'success' as const,
            toolName: 'data.query' as const,
            message: 'Returned two rows.',
            shouldStop: false,
        }));
        const actions = createAgrunReadOnlyActions({
            bridge,
            executeAction,
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_data_query');
        const store = createRuntimeTestStore() as unknown as StoreApi;
        bridge.register('query-placeholder-turn', store);

        await action?.execute({
            request: { agrunSessionId: 'query-placeholder-turn' },
        }, {
            explanation: 'Preview two rows.',
            plan: {
                select: ['Town', 'Resale Price (SGD)'],
                where: {
                    predicates: [{ column: '', operator: '', value: '' }],
                    groups: [],
                },
                groupBy: [],
                aggregates: [],
                postAggregateFilter: {},
                orderBy: [],
                limit: '2',
            },
        });

        expect(executeAction).toHaveBeenCalledWith(
            expect.objectContaining({
                toolName: 'data.query',
                args: {
                    explanation: 'Preview two rows.',
                    plan: {
                        select: ['Town', 'Resale Price (SGD)'],
                        limit: 2,
                    },
                },
            }),
            store,
            expect.objectContaining({ toolStage: 'analysis' }),
        );
    });

    it('delegates execution, forwards cancellation, and bounds/redacts the result', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const module = createModuleStub();
        const executeAction = vi.fn(async () => ({
            status: 'success' as const,
            toolName: 'workspace.list' as const,
            message: 'Listed workspace.',
            shouldStop: false,
            observation: {
                type: 'tool_result' as const,
                status: 'success' as const,
                summary: 'Listed workspace.',
            },
            artifacts: {
                rows: Array.from({ length: 12 }, (_, index) => ({ index })),
                apiKey: 'must-not-leak',
            },
        }));
        const actions = createAgrunReadOnlyActions({
            bridge,
            executeAction,
            module,
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_workspace_list');
        const store = createRuntimeTestStore() as unknown as StoreApi;
        const controller = new AbortController();
        bridge.register('execution-1', store);

        const envelope = await action?.execute({
            request: {
                signal: controller.signal,
                agrunSessionId: 'execution-1',
            },
        }, { path: '/' }) as {
            output: {
                kind: string;
                status: string;
                artifacts: {
                    rows: unknown[];
                    apiKey: string;
                };
            };
        };

        expect(executeAction).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'tool_call',
                toolName: 'workspace.list',
                args: { path: '/' },
            }),
            store,
            {
                toolStage: 'analysis',
                abortSignal: controller.signal,
                requireRowDeleteConfirmation: true,
            },
        );
        expect(envelope.output.kind).toBe(AGRUN_APP_TOOL_RESULT_KIND);
        expect(envelope.output.status).toBe('success');
        expect(envelope.output.artifacts.rows).toHaveLength(5);
        expect(envelope.output.artifacts.apiKey).toBe('[redacted]');
    });

    it('projects compact query rows at the top level for the next planner cycle', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const actions = createAgrunReadOnlyActions({
            bridge,
            executeAction: vi.fn(async () => ({
                status: 'success' as const,
                toolName: 'data.query' as const,
                message: 'Returned two rows.',
                shouldStop: false,
                artifacts: {
                    activeDataQuery: {
                        engine: 'duckdb',
                        result: {
                            rows: [
                                {
                                    Town: 'WOODLANDS',
                                    'Resale Price (SGD)': 455_000,
                                },
                                {
                                    Town: 'YISHUN',
                                    'Resale Price (SGD)': 472_000,
                                },
                                {
                                    Town: 'TAMPINES',
                                    'Resale Price (SGD)': 450_000,
                                },
                                {
                                    Town: 'BEDOK',
                                    'Resale Price (SGD)': 510_000,
                                },
                                {
                                    Town: 'JURONG EAST',
                                    'Resale Price (SGD)': 490_000,
                                },
                                {
                                    Town: 'BISHAN',
                                    'Resale Price (SGD)': 620_000,
                                },
                            ],
                            returnedRows: 6,
                            totalMatchedRows: 3_000,
                            selectedColumns: [
                                'Town',
                                'Resale Price (SGD)',
                            ],
                            truncated: true,
                        },
                    },
                },
            })),
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate =>
            candidate.name === 'host_data_query');
        const store = createRuntimeTestStore() as unknown as StoreApi;
        bridge.register('query-evidence-turn', store);

        const envelope = await action?.execute({
            request: { agrunSessionId: 'query-evidence-turn' },
        }, {
            explanation: 'Preview two rows.',
            plan: {
                select: ['Town', 'Resale Price (SGD)'],
                limit: 2,
            },
        }) as {
            output: {
                evidence: {
                    kind: string;
                    returnedRows: number;
                    rows: Array<Record<string, unknown>>;
                    resultDigest: {
                        rowCount: number;
                        lastRow: Record<string, unknown>;
                        numericColumns: Array<Record<string, unknown>>;
                    };
                };
            };
        };

        expect(envelope.output.evidence).toMatchObject({
            kind: 'data_query_preview',
            returnedRows: 6,
            rows: [
                {
                    Town: 'WOODLANDS',
                    'Resale Price (SGD)': 455_000,
                },
                {
                    Town: 'YISHUN',
                    'Resale Price (SGD)': 472_000,
                },
                {
                    Town: 'TAMPINES',
                    'Resale Price (SGD)': 450_000,
                },
                {
                    Town: 'BEDOK',
                    'Resale Price (SGD)': 510_000,
                },
                {
                    Town: 'JURONG EAST',
                    'Resale Price (SGD)': 490_000,
                },
            ],
            resultDigest: {
                rowCount: 6,
                lastRow: {
                    Town: 'BISHAN',
                    'Resale Price (SGD)': 620_000,
                },
                numericColumns: [{
                    column: 'Resale Price (SGD)',
                    observedValues: 6,
                    first: 455_000,
                    last: 620_000,
                    min: 450_000,
                    max: 620_000,
                    absoluteChange: 165_000,
                }],
            },
        });
        expect(envelope.output.evidence.rows).toHaveLength(5);
    });

    it('rechecks app governance immediately before execution', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const actions = createAgrunReadOnlyActions({
            bridge,
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_workspace_list');
        const store = createRuntimeTestStore({
            csvData: null,
            currentDatasetId: null,
        } as never) as unknown as StoreApi;
        bridge.register('execution-2', store);

        const envelope = await action?.execute({
            request: {
                agrunSessionId: 'execution-2',
            },
        }, { path: '/' }) as {
            output: { status: string; ok: boolean; observation: { summary: string } };
        };

        expect(envelope.output.status).toBe('blocked');
        expect(envelope.output.ok).toBe(false);
        expect(envelope.output.observation.summary).toMatch(/unavailable|dataset/i);
    });

    it('blocks action calls beyond the per-turn budget without dispatching them', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const executeAction = vi.fn(async () => ({
            status: 'success' as const,
            toolName: 'workspace.list' as const,
            message: 'Listed workspace.',
            shouldStop: false,
            observation: {
                type: 'tool_result' as const,
                status: 'success' as const,
                summary: 'Listed workspace.',
            },
        }));
        const actions = createAgrunReadOnlyActions({
            bridge,
            executeAction,
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_workspace_list');
        const store = createRuntimeTestStore() as unknown as StoreApi;
        bridge.register('budgeted-turn', store);

        for (let index = 0; index < AGRUN_MAX_ACTION_CALLS_PER_TURN; index += 1) {
            const envelope = await action?.execute({
                request: { agrunSessionId: 'budgeted-turn' },
            }, { path: '/' }) as { output: { status: string } };
            expect(envelope.output.status).toBe('success');
        }

        const blocked = await action?.execute({
            request: { agrunSessionId: 'budgeted-turn' },
        }, { path: '/' }) as {
            output: {
                status: string;
                observation: { code: string; summary: string };
            };
        };

        expect(executeAction).toHaveBeenCalledTimes(AGRUN_MAX_ACTION_CALLS_PER_TURN);
        expect(blocked.output.status).toBe('blocked');
        expect(blocked.output.observation.code).toBe('agrun_action_budget_exhausted');
        expect(blocked.output.observation.summary).toContain('partial answer');
    });

    it('blocks direct permanent row deletion even after Agrun dispatch reaches the app boundary', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const actions = createAgrunActions({
            bridge,
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_data_mutate');
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'report.csv',
                data: [{ Amount: 10 }, { Amount: 20 }],
            },
            columnProfiles: [{ name: 'Amount', type: 'numerical' }],
        } as never) as unknown as StoreApi;
        bridge.register('row-delete-turn', store);

        const envelope = await action?.execute({
            request: { agrunSessionId: 'row-delete-turn' },
        }, {
            explanation: 'Delete the first row.',
            operations: [{
                id: 'delete-first',
                type: 'drop_rows_by_index',
                reason: 'Delete the first row.',
                indices: [0],
            }],
            outputColumns: [],
        }) as {
            output: {
                status: string;
                observation: { summary: string };
            };
        };

        expect(envelope.output.status).toBe('blocked');
        expect(envelope.output.observation.summary).toContain('preflight confirmation');
        expect(store.getState().csvData?.data).toEqual([
            { Amount: 10 },
            { Amount: 20 },
        ]);
    });

    it('restores the action-local snapshot when a mutation executor throws after changing state', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const executeAction = vi.fn(async (_action, store: StoreApi) => {
            store.setState({
                csvData: {
                    fileName: 'report.csv',
                    data: [{ Amount: 999 }],
                },
            });
            throw new Error('mutation failed after state change');
        });
        const actions = createAgrunActions({
            bridge,
            executeAction,
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_data_mutate');
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'report.csv',
                data: [{ Amount: 10 }],
            },
            duckDbSessionStatus: {
                status: 'ready',
                engine: 'duckdb',
                tableName: 'clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
                fallbackStage: null,
                lastSyncedAt: new Date('2026-03-13T00:00:00.000Z'),
            },
        } as never) as unknown as StoreApi;
        bridge.register('failed-mutation-turn', store);

        await expect(action?.execute({
            request: { agrunSessionId: 'failed-mutation-turn' },
        }, {
            explanation: 'Fill missing values.',
            operations: [{
                id: 'fill-amount',
                type: 'fill_missing',
                reason: 'Use zero for blanks.',
                column: 'Amount',
                strategy: 'constant',
                value: 0,
            }],
            outputColumns: [],
        })).rejects.toThrow('mutation failed after state change');

        expect(store.getState().csvData?.data).toEqual([{ Amount: 10 }]);
    });

    it('retains rollback state across approval pauses and restores it on cancellation', () => {
        const bridge = createAgrunActionExecutionBridge();
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'report.csv',
                data: [{ Amount: 10 }],
            },
        } as never) as unknown as StoreApi;
        const original = store.getState().csvData;

        bridge.register('paused-mutation-turn', store);
        bridge.captureMutationSnapshot(
            'paused-mutation-turn',
            {
                csvData: original,
                columnProfiles: store.getState().columnProfiles,
                columnRegistry: store.getState().columnRegistry,
                dataPreparationPlan: store.getState().dataPreparationPlan,
                analysisCards: store.getState().analysisCards,
                finalSummary: store.getState().finalSummary,
                aiCoreAnalysisSummary: store.getState().aiCoreAnalysisSummary,
                contextualSummary: store.getState().contextualSummary,
                activeDataQuery: store.getState().activeDataQuery,
                activeSpreadsheetFilter: store.getState().activeSpreadsheetFilter,
                spreadsheetFilterFunction: store.getState().spreadsheetFilterFunction,
                aiFilterExplanation: store.getState().aiFilterExplanation,
                activeMetricMappingValidation: store.getState().activeMetricMappingValidation,
                queryHistory: store.getState().queryHistory,
                datasetSemanticSnapshot: store.getState().datasetSemanticSnapshot,
                semanticStatus: store.getState().semanticStatus,
                semanticDatasetVersion: store.getState().semanticDatasetVersion,
                duckDbSessionStatus: store.getState().duckDbSessionStatus,
            },
        );
        store.setState({
            csvData: {
                fileName: 'report.csv',
                data: [{ Amount: 99 }],
            },
        });
        bridge.release('paused-mutation-turn', 'blocked');

        expect(bridge.resolve('paused-mutation-turn')).toBe(store);
        bridge.register('paused-mutation-turn', store);
        bridge.release('paused-mutation-turn', 'cancelled');

        expect(bridge.resolve('paused-mutation-turn')).toBeNull();
        expect(store.getState().csvData?.data).toEqual([{ Amount: 10 }]);
        expect(store.getState().duckDbSessionStatus).toEqual({
            status: 'idle',
            engine: null,
            tableName: null,
            loadVersion: null,
            fallbackReason: null,
            fallbackStage: null,
            lastSyncedAt: null,
        });
    });

    it('keeps a successful approved mutation on the canonical app state path', async () => {
        const bridge = createAgrunActionExecutionBridge();
        const executeAction = vi.fn(async (_action, store: StoreApi) => {
            store.setState({
                csvData: {
                    fileName: 'report.csv',
                    data: [{ Amount: 0 }],
                },
            });
            return {
                status: 'success' as const,
                toolName: 'data.mutate' as const,
                message: 'Filled missing Amount values.',
                shouldStop: false,
            };
        });
        const actions = createAgrunActions({
            bridge,
            executeAction,
            module: createModuleStub(),
        }) as AgrunActionSpec[];
        const action = actions.find(candidate => candidate.name === 'host_data_mutate');
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'report.csv',
                data: [{ Amount: null }],
            },
        } as never) as unknown as StoreApi;
        const beforeMutation = vi.fn(async () => undefined);
        bridge.register('successful-mutation-turn', store, { beforeMutation });

        const envelope = await action?.execute({
            request: { agrunSessionId: 'successful-mutation-turn' },
        }, {
            explanation: 'Fill missing Amount values.',
            operations: [{
                id: 'fill-amount',
                type: 'fill_missing',
                reason: 'Use zero for blanks.',
                column: 'Amount',
                strategy: 'constant',
                value: 0,
            }],
            outputColumns: [],
        }) as {
            output: { status: string };
        };
        bridge.release('successful-mutation-turn', 'completed');

        expect(envelope.output.status).toBe('success');
        expect(beforeMutation).toHaveBeenCalledOnce();
        expect(beforeMutation.mock.invocationCallOrder[0]).toBeLessThan(
            executeAction.mock.invocationCallOrder[0],
        );
        expect(executeAction).toHaveBeenCalledOnce();
        expect(store.getState().csvData?.data).toEqual([{ Amount: 0 }]);
        expect(bridge.resolve('successful-mutation-turn')).toBeNull();
    });

    it('attaches the opaque execution id without overwriting session context', () => {
        expect(attachAgrunHostExecutionContext({
            prompt: 'hello',
            contextSnapshot: { existing: true },
        }, 'session:turn')).toEqual({
            prompt: 'hello',
            agrunSessionId: 'session:turn',
            contextSnapshot: { existing: true },
        });
    });

    it('preserves the execution bridge through the real pinned runtime request normalizer', async () => {
        const module = await loadAgrunModule();
        const bridge = createAgrunActionExecutionBridge();
        const executeAction = vi.fn(async () => ({
            status: 'success' as const,
            toolName: 'workspace.list' as const,
            message: 'Listed workspace.',
            shouldStop: false,
            observation: {
                type: 'tool_result' as const,
                status: 'success' as const,
                summary: 'Listed workspace.',
            },
            artifacts: { paths: ['raw.csv'] },
        }));
        const runtime = module.createRuntime({
            customActions: createAgrunReadOnlyActions({
                bridge,
                executeAction,
                module,
            }),
            disabledActions: ['web_search', 'read_url'],
            globalMemory: { enabled: false },
            maxSteps: 4,
            actionPolicy: createAgrunReadOnlyActionPolicy(),
        });
        const store = createRuntimeTestStore() as unknown as StoreApi;
        bridge.register('real-runtime-execution', store);
        const responses = [
            JSON.stringify({
                type: 'action',
                name: 'host_workspace_list',
                args: { path: '/' },
                reasoning: 'Inspect the workspace.',
            }),
            'The workspace contains raw.csv.',
        ];
        const fetch = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-test',
            choices: [{
                index: 0,
                message: {
                    content: responses.shift() ?? 'Done.',
                    role: 'assistant',
                },
                finish_reason: 'stop',
            }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        const result = await runtime.run(attachAgrunHostExecutionContext({
            provider: 'openai',
            apiVariant: 'chat',
            apiKey: 'test-key',
            model: 'gpt-test',
            prompt: 'List the workspace files.',
            systemPrompt: 'Use the host evidence. Verified evidence marker: WOODLANDS 619016177.',
            sessionContext: {
                currentGoal: 'Explain the verified cards.',
                compactedContext: 'Verified evidence marker: WOODLANDS 619016177.',
            },
            fetch,
        }, 'real-runtime-execution')) as {
            runState?: { status?: string };
        };

        expect(executeAction).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(fetch.mock.calls[0]?.[1])).toContain(
            'Verified evidence marker: WOODLANDS 619016177.',
        );
        expect(result.runState?.status).toBe('completed');
    }, 30_000);

    it('uses the pinned runtime approval flow so denial executes zero mutation writes', async () => {
        const module = await loadAgrunModule();
        const bridge = createAgrunActionExecutionBridge();
        const executeAction = vi.fn(async () => ({
            status: 'success' as const,
            toolName: 'data.mutate' as const,
            message: 'Mutation applied.',
            shouldStop: false,
        }));
        const runtime = module.createRuntime({
            customActions: createAgrunActions({
                bridge,
                executeAction,
                module,
            }),
            disabledActions: ['web_search', 'read_url'],
            globalMemory: { enabled: false },
            maxSteps: 4,
            actionPolicy: createAgrunActionPolicy(),
        });
        const store = createRuntimeTestStore({
            csvData: {
                fileName: 'report.csv',
                data: [{ Amount: null }],
            },
        } as never) as unknown as StoreApi;
        bridge.register('real-mutation-denial', store);
        const responses = [
            JSON.stringify({
                type: 'action',
                name: 'host_data_mutate',
                args: {
                    explanation: 'Fill missing Amount values.',
                    operations: [{
                        id: 'fill-amount',
                        type: 'fill_missing',
                        reason: 'Use zero for blanks.',
                        column: 'Amount',
                        strategy: 'constant',
                        value: 0,
                    }],
                    outputColumns: [],
                },
                reasoning: 'Apply the requested permanent cleanup.',
            }),
            JSON.stringify({
                type: 'final',
                answer: 'The mutation was not applied because approval was denied.',
                reasoning: 'Respect the user decision.',
            }),
        ];
        const fetch = vi.fn(async () => new Response(JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-test',
            choices: [{
                index: 0,
                message: {
                    content: responses.shift() ?? 'Done.',
                    role: 'assistant',
                },
                finish_reason: 'stop',
            }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        const blocked = await runtime.run(attachAgrunHostExecutionContext({
            provider: 'openai',
            apiVariant: 'chat',
            apiKey: 'test-key',
            model: 'gpt-test',
            prompt: 'Fill missing Amount values with zero.',
            fetch,
        }, 'real-mutation-denial')) as {
            runState?: {
                status?: string;
                pendingApproval?: {
                    resumeToken?: unknown;
                };
            };
        };

        expect(blocked.runState?.status).toBe('blocked');
        expect(blocked.runState?.pendingApproval?.resumeToken).toBeDefined();
        expect(executeAction).not.toHaveBeenCalled();

        const denied = await runtime.run(attachAgrunHostExecutionContext({
            type: 'approval_resolution',
            decision: 'deny',
            resumeToken: blocked.runState?.pendingApproval?.resumeToken,
            provider: 'openai',
            apiVariant: 'chat',
            apiKey: 'test-key',
            model: 'gpt-test',
            fetch,
        }, 'real-mutation-denial'), {
            disabledActions: ['host_data_mutate'],
        }) as {
            runState?: {
                status?: string;
            };
        };
        bridge.release('real-mutation-denial', 'completed');

        expect(executeAction).not.toHaveBeenCalled();
        expect(store.getState().csvData?.data).toEqual([{ Amount: null }]);
        expect(denied.runState?.status).toBe('completed');
    }, 30_000);
});
