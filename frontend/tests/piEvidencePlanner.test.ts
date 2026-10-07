import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';

vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: vi.fn(),
    updateAgentTaskStatus: vi.fn(),
}));
vi.mock('../services/privacy/cloudAiConsent', () => ({
    ensureCloudAiConsent: vi.fn(async () => undefined),
}));

import { runPiEvidencePlanner } from '../services/agent/runtime/pi/piEvidencePlanner';

const usage = {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

type Turn = { name: string; arguments: Record<string, any> } | { text: string };

/** Replays one scripted assistant turn per provider call and records the tool names the model was offered. */
const scriptedStream = (turns: Turn[], offered: string[][] = []): StreamFn => {
    let index = 0;
    return (model, context) => {
        const added = (context.messages as Array<{ toolsAdded?: Array<{ name: string }> }>)
            .flatMap(message => message.toolsAdded ?? []);
        offered.push(added.map(tool => tool.name));
        const turn = turns[Math.min(index, turns.length - 1)];
        const id = `call-${index++}`;
        const stream = createAssistantMessageEventStream();
        const message: AssistantMessage = {
            role: 'assistant',
            content: 'text' in turn
                ? [{ type: 'text', text: turn.text }]
                : [{ type: 'toolCall', id, name: turn.name, arguments: turn.arguments }],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage,
            stopReason: 'text' in turn ? 'stop' : 'toolUse',
            timestamp: Date.now(),
        };
        stream.push({ type: 'start', partial: message });
        stream.push({ type: 'done', reason: message.stopReason as 'stop' | 'toolUse', message });
        return stream;
    };
};

const createStore = () => {
    let state: any = {
        sessionId: 'session-1',
        settings: {
            provider: 'openai', openAIApiKey: 'test-only-key', complexModel: 'gpt-5.4-mini',
            reasoningEffort: 'medium', language: 'English',
        },
        csvData: { fileName: 'sample.csv', data: [{ town: 'A', resale_price: 10, floor_area: 5 }] },
        canonicalCsvData: null,
        semanticDatasetVersion: 'version-1',
        columnProfiles: [
            { name: 'town', type: 'categorical' },
            { name: 'resale_price', type: 'currency' },
            { name: 'floor_area', type: 'numerical' },
        ],
        analysisCards: [],
        chatHistory: [],
        dataQualityIssues: [],
        activeDataQuery: null,
        currentDatasetId: 'dataset-1',
        initialAnalysisPlan: null,
        setStreamingMessage: vi.fn(),
    };
    return {
        getState: () => state,
        setState: (patch: any) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; },
    };
};

const plan = (overrides: Record<string, unknown> = {}) => ({
    title: 'Median price by town',
    queryMode: 'aggregate',
    intentSummary: 'Typical price per town.',
    preferredResultShape: 'ranked_aggregate',
    query: {
        select: ['town', 'median_price'],
        groupBy: ['town'],
        aggregates: [{ function: 'median', column: 'resale_price', as: 'median_price' }],
        orderBy: [{ column: 'median_price', direction: 'desc' }],
        limit: 10,
    },
    ...overrides,
});

const run = (store: ReturnType<typeof createStore>, streamFn: StreamFn, signal?: AbortSignal) =>
    runPiEvidencePlanner({
        store: store as never,
        topic: 'Typical price by town (median of resale_price by town)',
        columns: store.getState().columnProfiles,
        signal,
        streamFn,
    });

describe('Pi evidence planner', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns a validated plan and keeps the model-chosen aggregation', async () => {
        const store = createStore();
        const offered: string[][] = [];
        const result = await run(store, scriptedStream([{ name: 'submit_evidence_plan', arguments: plan() }], offered));

        expect(result?.query.aggregates?.[0]).toMatchObject({ function: 'median', column: 'resale_price' });
        expect(offered[0]).toEqual(expect.arrayContaining(['submit_evidence_plan', 'read_skill', 'data_query']));
        expect(offered[0]).not.toContain('data_mutate');
        expect(offered[0]).not.toContain('analysis_create_plan');
    });

    it('lets Pi fix a plan that names an unknown column', async () => {
        const store = createStore();
        const bad = plan({ query: { select: ['nope', 'x'], groupBy: ['nope'], aggregates: [{ function: 'sum', column: 'nope', as: 'x' }] } });
        const result = await run(store, scriptedStream([
            { name: 'submit_evidence_plan', arguments: bad },
            { name: 'submit_evidence_plan', arguments: plan() },
        ]));

        expect(result?.title).toBe('Median price by town');
    });

    it('returns null when Pi never submits a valid plan', async () => {
        const result = await run(createStore(), scriptedStream([{ text: 'No plan.' }]));
        expect(result).toBeNull();
    });

    it('rethrows when the user cancels', async () => {
        const controller = new AbortController();
        controller.abort(new Error('cancelled'));
        await expect(run(createStore(), scriptedStream([{ text: 'x' }]), controller.signal)).rejects.toThrow('cancelled');
    });
});
