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

import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';
import { runPiResearchPlanner } from '../services/agent/runtime/pi/piResearchPlanner';

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

const question = (title: string, overrides: Record<string, unknown> = {}) => ({
    title, rationale: 'because', dimension: 'town', metric: 'resale_price', aggregation: 'median', ...overrides,
});

const run = (store: ReturnType<typeof createStore>, streamFn: StreamFn, signal = new AbortController().signal) =>
    runPiResearchPlanner({ store: store as never, goal: 'Find drivers', datasetVersionFallback: 'version-1', signal, streamFn });

describe('Pi research planner', () => {
    beforeEach(() => vi.clearAllMocks());

    it('stores a validated plan and offers read-only tools plus the skill and submit tools', async () => {
        const store = createStore();
        const offered: string[][] = [];
        const plan = await run(store, scriptedStream([{
            name: 'submit_research_plan',
            arguments: { questions: [question('Typical price by town'), question('Area by town', { metric: 'floor_area', aggregation: 'avg' })] },
        }], offered));

        expect(plan?.questions).toHaveLength(2);
        expect(store.getState().initialAnalysisPlan).toMatchObject({
            datasetVersion: getCurrentAnalysisDatasetVersion(store.getState()),
            consumed: false,
        });
        expect(offered[0]).toEqual(expect.arrayContaining(['submit_research_plan', 'read_skill', 'data_query']));
        expect(offered[0]).not.toContain('data_mutate');
        expect(offered[0]).not.toContain('analysis_create_plan');
    });

    it('attaches validated additivity judgements to the column profiles', async () => {
        const store = createStore();
        await run(store, scriptedStream([{
            name: 'submit_research_plan',
            arguments: {
                questions: [question('A'), question('B', { metric: 'floor_area', aggregation: 'avg' })],
                columns: [
                    { column: 'resale_price', kind: 'non_additive', nature: 'unit_value', rationale: 'Price per flat.' },
                    { column: 'nope', kind: 'additive', nature: 'flow' },
                ],
            },
        }]));

        const profiles = store.getState().columnProfiles;
        expect(profiles.find((column: { name: string }) => column.name === 'resale_price').additivity)
            .toMatchObject({ kind: 'non_additive', nature: 'unit_value' });
        expect(profiles.find((column: { name: string }) => column.name === 'town').additivity).toBeUndefined();
    });

    it('lets Pi correct a rejected submission', async () => {
        const store = createStore();
        const plan = await run(store, scriptedStream([
            { name: 'submit_research_plan', arguments: { questions: [question('Only one')] } },
            { name: 'submit_research_plan', arguments: { questions: [question('A'), question('B', { metric: 'floor_area', aggregation: 'max' })] } },
        ]));

        expect(plan?.questions.map(item => item.title)).toEqual(['A', 'B']);
    });

    it('returns null without throwing when Pi never submits a plan', async () => {
        const store = createStore();
        const plan = await run(store, scriptedStream([{ text: 'I have no plan.' }]));

        expect(plan).toBeNull();
        expect(store.getState().initialAnalysisPlan).toBeNull();
    });

    it('rethrows when the user cancels', async () => {
        const store = createStore();
        const controller = new AbortController();
        controller.abort(new Error('cancelled'));

        await expect(run(store, scriptedStream([{ text: 'x' }]), controller.signal)).rejects.toThrow('cancelled');
    });
});
