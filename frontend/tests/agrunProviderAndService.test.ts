import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GATEWAY_BASE_URL, DEFAULT_GATEWAY_MODEL } from '../config/defaultGatewayConfig';
import {
    createAgrunProviderInput,
    createAgrunProviderSkills,
    createBoundedProviderFetch,
    fetchWithoutForbiddenUserAgent,
} from '../services/agent/runtime/agrun/providerAdapter';
import {
    createAgrunFollowUpContextInput,
} from '../services/agent/runtime/agrun/contextAdapter';
import {
    resumeAgrunFollowUpInteraction,
    runAgrunFollowUpTurn,
} from '../services/agent/runtime/agrun/followUpRuntimeService';
import { createAgentTurn } from '../services/agent/runtime/runtimeState';
import type {
    AgrunModule,
    FollowUpRuntimeAdapter,
} from '../services/agent/runtime/agrun/types';
import type { StoreApi } from '../services/agent/types';
import type { Settings } from '../types';
import { createRuntimeTestStore } from './runtimeTestStore';

const settings = (overrides: Partial<Settings>): Settings => ({
    provider: 'openai',
    geminiApiKey: '',
    openAIApiKey: 'openai-key',
    simpleModel: 'gpt-5-mini',
    complexModel: 'gpt-5.2',
    fallbackModel: 'gpt-5-mini',
    reasoningEffort: 'medium',
    language: 'English',
    reportTemplate: 'executive_brief',
    autoConfirmGoal: true,
    runtimeAccessControl: {
        permissionMode: 'open',
        toolOverrides: {},
        workspaceRules: {
            deniedPathPrefixes: [],
        },
    },
    ...overrides,
});

const createAdapter = (
    overrides: Partial<FollowUpRuntimeAdapter> = {},
): FollowUpRuntimeAdapter => ({
    initialize: vi.fn(async () => undefined),
    run: vi.fn(async request => ({
        status: 'completed',
        appTurnId: request.turnId,
        text: 'done',
    } as const)),
    resume: vi.fn(async interaction => ({
        status: 'completed',
        appTurnId: interaction.turnId,
        text: 'resumed',
    } as const)),
    cancel: vi.fn(),
    ...overrides,
});

describe('AGRUN-007 provider mapping', () => {
    it('maps the app default provider to the shared GPT Responses gateway', () => {
        const input = createAgrunProviderInput(settings({
            provider: 'default',
            openAIApiKey: '',
            complexModel: 'gemini-3.1-flash-lite-preview',
            reasoningEffort: 'high',
        }), 'Summarize this report.');

        expect(input).toMatchObject({
            provider: 'openai',
            endpoint: DEFAULT_GATEWAY_BASE_URL,
            model: DEFAULT_GATEWAY_MODEL,
            prompt: 'Summarize this report.',
            apiVariant: 'responses',
            reasoningEffort: 'high',
        });
        expect(String(input.apiKey)).toMatch(/^gw_/);
    });

    it('maps Google settings to the Gemini provider without a second config source', () => {
        const input = createAgrunProviderInput(settings({
            provider: 'google',
            geminiApiKey: 'gemini-key',
            complexModel: 'gemini-3.1-flash-lite-preview',
            reasoningEffort: 'low',
        }), 'Describe the columns.');

        expect(input).toMatchObject({
            provider: 'gemini',
            apiKey: 'gemini-key',
            model: 'gemini-3.1-flash-lite-preview',
            prompt: 'Describe the columns.',
            fetch: fetchWithoutForbiddenUserAgent,
            thinkingConfig: {
                thinkingBudget: 1024,
            },
        });
    });

    it('applies the bounded fetch adapter to Gemini as well as OpenAI', () => {
        const input = createAgrunProviderInput(settings({
            provider: 'google',
            geminiApiKey: 'gemini-key',
        }), 'Describe the columns.', { requestTimeoutMs: 45_000 });

        expect(input.fetch).toEqual(expect.any(Function));
        expect(input.fetch).not.toBe(fetchWithoutForbiddenUserAgent);
    });

    it('registers both supported provider skills and fails loudly if one is missing', () => {
        const openaiBrowserSkill = { name: 'openai' };
        const geminiBrowserSkill = { name: 'gemini' };
        const module = {
            openaiBrowserSkill,
            geminiBrowserSkill,
        } as AgrunModule;

        expect(createAgrunProviderSkills(module)).toEqual([
            openaiBrowserSkill,
            geminiBrowserSkill,
        ]);
        expect(() => createAgrunProviderSkills({
            openaiBrowserSkill,
        } as AgrunModule)).toThrow(/geminiBrowserSkill/);
    });

    it('removes the browser-forbidden User-Agent header before provider fetch', async () => {
        const fetchMock = vi.fn(async (
            _input: RequestInfo | URL,
            _init?: RequestInit,
        ) => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            await fetchWithoutForbiddenUserAgent(
                'https://gateway.example.test/v1/responses',
                {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer test-token',
                        'Content-Type': 'application/json',
                        'User-Agent': 'provider-sdk/test',
                    },
                },
            );
        } finally {
            vi.unstubAllGlobals();
        }

        const [, init] = fetchMock.mock.calls[0];
        const headers = new Headers(init?.headers);
        expect(headers.has('user-agent')).toBe(false);
        expect(headers.get('content-type')).toBe('application/json');
        expect(headers.get('authorization')).toBe('Bearer test-token');
    });

    it('bounds a provider attempt while preserving the upstream abort signal', async () => {
        const fetchMock = vi.fn((
            _input: RequestInfo | URL,
            init?: RequestInit,
        ) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            await expect(createBoundedProviderFetch(5)(
                'https://gateway.example.test/v1/responses',
            )).rejects.toMatchObject({ name: 'TimeoutError' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('AGRUN-007 bounded app context', () => {
    it('passes current card evidence and language without provider credentials', () => {
        const store = createRuntimeTestStore({
            settings: settings({
                language: 'English',
                openAIApiKey: 'must-not-enter-context',
            }),
            csvData: {
                fileName: 'hdb.csv',
                data: [
                    { Town: 'WOODLANDS', Total: 619_016_177 },
                ],
            },
            semanticDatasetVersion: 'version-current',
            confirmedAnalysisGoal: 'Summarize the HDB resale results.',
            contextualSummary: 'Long summary '.repeat(2_000),
            analysisCards: [
                {
                    id: 'card-town',
                    plan: {
                        chartType: 'bar',
                        title: 'Total Resale Price by Town',
                        description: 'Town totals',
                        aggregation: 'sum',
                        groupByColumn: 'Town',
                        valueColumn: 'Total',
                    },
                    aggregatedData: [
                        { Town: 'WOODLANDS', Total: 619_016_177 },
                    ],
                    summary: { text: '', language: 'English' },
                    displayChartType: 'bar',
                    isDataVisible: true,
                    topN: null,
                    hideOthers: false,
                    provenance: {
                        datasetVersion: 'version-current',
                        evidenceStatus: 'verified',
                        queryEvidenceRequired: false,
                    },
                    autoAnalysisEvaluation: {
                        verdict: 'trusted',
                        reasonCodes: [],
                        detail: 'trusted',
                        evaluatedAt: '2026-07-25T00:00:00.000Z',
                        source: 'auto_analysis_evaluator_v1',
                    },
                },
            ],
        } as never) as unknown as StoreApi;

        const input = createAgrunFollowUpContextInput(store.getState(), [
            'Accepted decision: compare Town before Block.',
        ]);
        const serialized = JSON.stringify(input);

        expect(input.systemPrompt).toContain('Always answer in English');
        expect(serialized).toContain('[verified] Total Resale Price by Town');
        expect(serialized).toContain('619016177');
        expect(serialized).toContain('hdb.csv');
        expect(serialized).toContain(
            'Accepted decision: compare Town before Block.',
        );
        expect(serialized.length).toBeLessThan(14_000);
        expect(serialized).not.toContain('must-not-enter-context');
    });

    it('passes the resolved query contract into the bounded Agrun context', () => {
        const store = createRuntimeTestStore({
            settings: settings({ language: 'English' }),
            csvData: {
                fileName: 'orders.csv',
                data: [{ CCY: 'SGD', 'Bal Amount': 10 }],
            },
        } as never) as unknown as StoreApi;

        const input = createAgrunFollowUpContextInput(store.getState(), [], {
            queryUnderstandingArtifact: {
                intent: 'precise_card',
                confidence: 'high',
                taskSignal: 'inspect_data',
                expectedOutput: 'data_table',
                referencedColumns: ['Bal Amount', 'CCY'],
                aggregationFunctions: ['SUM'],
                groupingColumns: ['CCY'],
                filterDescription: null,
                subjectRefs: [],
                timeScope: { kind: 'none' },
                comparisonScope: { kind: 'none' },
                needsGrounding: false,
                unresolvedReferences: [],
                reason: 'Aggregate balance by currency.',
                classifiedBy: 'ai',
                hasExplicitColumns: true,
                hasAggregationFunction: true,
                hasGroupingDirective: true,
                hasFilterCondition: false,
            },
        });

        expect(input.systemPrompt).toContain('Referenced dataset columns: Bal Amount, CCY');
        expect(input.systemPrompt).toContain('Grouping columns: CCY');
        expect(input.systemPrompt).toContain('Aggregations: SUM');
        expect(input.systemPrompt).toContain('Do not omit a requested grouping column');
    });
});

describe('AGRUN-007 follow-up service composition', () => {
    it('commits the user transcript before Agrun can create a crash checkpoint', async () => {
        const order: string[] = [];
        const store = createRuntimeTestStore({
            chatHistory: [{
                id: 'message-1',
                sender: 'user',
                text: 'Summarize the data.',
                timestamp: new Date(),
                type: 'user_message',
            }],
        } as never) as unknown as StoreApi;
        const adapter = createAdapter({
            run: vi.fn(async request => {
                order.push('run');
                return {
                    status: 'completed',
                    appTurnId: request.turnId,
                    text: 'done',
                } as const;
            }),
        });
        const persistSessionSnapshot = vi.fn(async state => {
            order.push('persist');
            expect(state.chatHistory.at(-1)?.text).toBe('Summarize the data.');
            return true;
        });

        await runAgrunFollowUpTurn({
            message: 'Summarize the data.',
        }, store, adapter, persistSessionSnapshot);

        expect(order).toEqual(['persist', 'run']);
    });

    it('creates the existing AgentTurn and delegates one eligible turn to Agrun', async () => {
        const store = createRuntimeTestStore() as unknown as StoreApi;
        const adapter = createAdapter();

        const result = await runAgrunFollowUpTurn({
            message: 'Summarize the data.',
        }, store, adapter);

        expect(adapter.run).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Summarize the data.',
                sessionId: 'session-1',
                turnId: expect.stringMatching(/^agent-turn-/),
            }),
            store,
        );
        expect(result.status).toBe('completed');
        expect(store.getState().activeTurn).toMatchObject({
            userMessage: 'Summarize the data.',
            status: 'running',
        });
        expect(store.getState().runtimeEvents[0]).toMatchObject({
            type: 'turn_started',
            reason: 'agrun_follow_up_runtime',
        });
    });

    it('resumes the same blocked turn and keeps the opaque approval token out of chat', async () => {
        const turn = {
            ...createAgentTurn('Inspect the workspace.'),
            turnId: 'turn-approval',
            status: 'waiting_for_clarification' as const,
            lifecycleState: 'waiting_for_clarification' as const,
        };
        const token = { opaque: 'secret-runtime-token' };
        const clarification = {
            question: 'Approve this action?',
            options: [
                { label: 'Approve', value: 'approve' },
                { label: 'Deny', value: 'deny' },
            ],
            interactionKind: 'approval' as const,
            resumeContext: {
                followUpRuntimeInteraction: {
                    owner: 'agrun' as const,
                    kind: 'approval' as const,
                    sessionId: 'session-1',
                    turnId: 'turn-approval',
                    resumeToken: token,
                },
            },
        };
        const store = createRuntimeTestStore({
            activeTurn: turn,
            pendingClarification: clarification,
        } as never) as unknown as StoreApi;
        const adapter = createAdapter();

        await resumeAgrunFollowUpInteraction(
            clarification,
            { label: 'Approve', value: 'approve' },
            store,
            adapter,
        );

        expect(adapter.resume).toHaveBeenCalledWith({
            kind: 'approval',
            sessionId: 'session-1',
            turnId: 'turn-approval',
            decision: 'approve',
            resumeToken: token,
            signal: undefined,
        }, store);
        expect(store.getState().activeTurn?.status).toBe('running');
        expect(JSON.stringify(store.getState().chatHistory)).not.toContain(
            'secret-runtime-token',
        );
    });

    it('turns a stale approval token into a visible failed terminal result', async () => {
        const turn = {
            ...createAgentTurn('Inspect the workspace.'),
            turnId: 'turn-stale',
            status: 'waiting_for_clarification' as const,
            lifecycleState: 'waiting_for_clarification' as const,
        };
        const clarification = {
            question: 'Approve this action?',
            options: [
                { label: 'Approve', value: 'approve' },
                { label: 'Deny', value: 'deny' },
            ],
            interactionKind: 'approval' as const,
            resumeContext: {
                followUpRuntimeInteraction: {
                    owner: 'agrun' as const,
                    kind: 'approval' as const,
                    sessionId: 'session-1',
                    turnId: 'turn-stale',
                },
            },
        };
        const store = createRuntimeTestStore({
            activeTurn: turn,
            pendingClarification: clarification,
        } as never) as unknown as StoreApi;
        const adapter = createAdapter();

        const result = await resumeAgrunFollowUpInteraction(
            clarification,
            { label: 'Approve', value: 'approve' },
            store,
            adapter,
        );

        expect(adapter.resume).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'failed',
            error: { code: 'agrun_interaction_stale' },
        });
        expect(store.getState().activeTurn?.status).toBe('failed');
        expect(store.getState().isBusy).toBe(false);
        expect(store.getState().chatHistory.at(-1)).toMatchObject({
            sender: 'ai',
            isError: true,
        });
    });
});
