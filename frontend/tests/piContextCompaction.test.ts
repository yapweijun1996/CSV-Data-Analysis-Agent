import { describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream, createModels, type AssistantMessage } from '@earendil-works/pi-ai';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { Agent, type AgentMessage, type StreamFn } from '@earendil-works/pi-agent-core';
import { createPiContextCompactor } from '../services/agent/runtime/pi/piContextCompaction';

const system = { role: 'system', content: 'Keep the dataset evidence accurate.' } as AgentMessage;
const user = (text: string) => ({
    role: 'user', content: [{ type: 'text', text }], timestamp: 1,
}) as AgentMessage;
const assistant = (tokens: number) => ({
    role: 'assistant', content: [{ type: 'text', text: 'Earlier result.' }],
    usage: {
        input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop', timestamp: 2,
}) as AgentMessage;

describe('Pi automatic context compaction', () => {
    it('keeps the transcript intact below 80% of the 200k window', async () => {
        const summarize = vi.fn(async () => 'Earlier context summary.');
        const compact = createPiContextCompactor(200_000, summarize);
        const messages = [system, user('Earlier question.'), assistant(100_000), user('Current question.')];

        expect(await compact(messages)).toEqual(messages);
        expect(summarize).not.toHaveBeenCalled();
    });

    it('summarizes old history at the threshold and keeps a complete recent tool pair', async () => {
        const summarize = vi.fn(async () => 'Earlier dataset goal and evidence.');
        const compact = createPiContextCompactor(200_000, summarize);
        const toolCall = {
            role: 'assistant', content: [{ type: 'toolCall', id: 'call-1', name: 'query', arguments: {} }],
            stopReason: 'toolUse', timestamp: 2,
        } as AgentMessage;
        const toolResult = {
            role: 'toolResult', toolCallId: 'call-1', toolName: 'query',
            content: [{ type: 'text', text: 'R'.repeat(80_000) }], timestamp: 3,
        } as AgentMessage;
        const messages = [system, user('A'.repeat(500_000)), toolCall, toolResult];

        const result = await compact(messages);

        expect(summarize).toHaveBeenCalledOnce();
        expect(result[0]).toBe(system);
        expect(result[1]).toMatchObject({
            role: 'user',
            content: [{ type: 'text', text: 'Earlier conversation summary:\nEarlier dataset goal and evidence.' }],
        });
        expect(result.slice(2)).toEqual([toolCall, toolResult]);
        expect(await compact(messages)).toEqual(result);
        expect(summarize).toHaveBeenCalledOnce();
    });

    const toolPair = (resultChars: number) => [
        {
            role: 'assistant', content: [{ type: 'toolCall', id: 'call-1', name: 'query', arguments: {} }],
            stopReason: 'toolUse', timestamp: 2,
        } as AgentMessage,
        {
            role: 'toolResult', toolCallId: 'call-1', toolName: 'query',
            content: [{ type: 'text', text: 'R'.repeat(resultChars) }], timestamp: 3,
        } as AgentMessage,
    ];

    it('reports a failed summary once and does not retry until the history grows', async () => {
        const summarize = vi.fn(async () => { throw new Error('summary provider down'); });
        const onDegraded = vi.fn();
        const compact = createPiContextCompactor(200_000, summarize, onDegraded);
        const messages = [system, user('A'.repeat(500_000)), ...toolPair(80_000)];

        expect(await compact(messages)).toEqual(messages);
        expect(await compact(messages)).toEqual(messages);
        expect(summarize).toHaveBeenCalledOnce();
        expect(onDegraded).toHaveBeenCalledOnce();
        expect(onDegraded).toHaveBeenCalledWith(expect.objectContaining({ reason: 'summary_failed' }));

        await compact([...messages, user('B'.repeat(150_000))]);
        expect(summarize).toHaveBeenCalledTimes(2);
        expect(onDegraded).toHaveBeenCalledTimes(2);
    });

    it('reports a summary that cannot bring the history under the trigger', async () => {
        const summarize = vi.fn(async () => 'Short summary.');
        const onDegraded = vi.fn();
        const compact = createPiContextCompactor(200_000, summarize, onDegraded);
        const messages = [system, user('A'.repeat(500_000)), ...toolPair(900_000)];

        expect(await compact(messages)).toEqual(messages);
        expect(await compact(messages)).toEqual(messages);
        expect(summarize).toHaveBeenCalledOnce();
        expect(onDegraded).toHaveBeenCalledWith(expect.objectContaining({ reason: 'compaction_ineffective' }));
    });

    it('preserves a single oversized current turn when there is no safe history to summarize', async () => {
        const summarize = vi.fn(async () => 'summary');
        const compact = createPiContextCompactor(200_000, summarize);
        const messages = [system, user('U'.repeat(600_000))];

        expect(await compact(messages)).toEqual(messages);
        expect(summarize).not.toHaveBeenCalled();
    });

    it('keeps the original context when summarization fails', async () => {
        const summarize = vi.fn(async () => {
            throw new Error('Provider failure');
        });
        const compact = createPiContextCompactor(200_000, summarize);
        const messages = [system, user('A'.repeat(500_000)), user('Current request.')];

        expect(await compact(messages)).toEqual(messages);
        expect(summarize).toHaveBeenCalledOnce();
    });

    it('starts at 160k estimated tokens and leaves the original transcript intact', async () => {
        const summarize = vi.fn(async () => 'The previous dataset goal and verified evidence.');
        const compact = createPiContextCompactor(200_000, summarize);
        const old = user('A'.repeat(450_000));
        const latest = user('Current question.');

        expect(await compact([system, old, assistant(159_000), latest])).toEqual([
            system, old, assistant(159_000), latest,
        ]);
        expect(summarize).not.toHaveBeenCalled();

        const messages = [system, old, assistant(160_000), latest];
        const result = await compact(messages);
        expect(summarize).toHaveBeenCalledOnce();
        expect(result[1]).toMatchObject({ role: 'user', content: [{ type: 'text', text: expect.stringContaining('previous dataset goal') }] });
        expect(result.at(-1)).toBe(latest);
        expect(messages[1]).toBe(old);
    });

    it('recompacts growing history without replaying already summarized messages', async () => {
        const summarize = vi.fn(async (_messages: AgentMessage[]) => `Summary ${summarize.mock.calls.length}`);
        const compact = createPiContextCompactor(200_000, summarize);
        const original = [system, user('A'.repeat(500_000)), user('First current question.')];

        expect((await compact(original))[1]).toMatchObject({
            role: 'user', content: [{ type: 'text', text: 'Earlier conversation summary:\nSummary 1' }],
        });

        const grown = [
            ...original,
            ...Array.from({ length: 12 }, (_, index) => user(`${index}:${'B'.repeat(50_000)}`)),
            user('Latest question.'),
        ];
        const result = await compact(grown);

        expect(summarize).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(summarize.mock.calls[1][0])).not.toContain('A'.repeat(1000));
        expect(result[1]).toMatchObject({
            role: 'user', content: [{ type: 'text', text: 'Earlier conversation summary:\nSummary 2' }],
        });
        expect(result.at(-1)).toBe(grown.at(-1));
    });

    it('counts multilingual content conservatively near the 160k threshold', async () => {
        const summarize = vi.fn(async () => 'Earlier Chinese-language discussion.');
        const compact = createPiContextCompactor(200_000, summarize);
        const messages = [system, user('数'.repeat(80_000)), user('Current question.')];

        const result = await compact(messages);

        expect(summarize).toHaveBeenCalledOnce();
        expect(result[1]).toMatchObject({ role: 'user', content: [{ type: 'text', text: expect.stringContaining('Earlier Chinese-language discussion.') }] });
    });

    it('passes the summary into Pi Agent model context while retaining full history', async () => {
        const models = createModels();
        models.setProvider(openaiProvider());
        const model = models.getModel('openai', 'gpt-5.4-mini');
        expect(model).toBeDefined();
        const summarize = vi.fn(async () => 'Verified historical evidence: Revenue total 470.');
        const observedContexts: AgentMessage[][] = [];
        const streamFn: StreamFn = (requestedModel, context) => {
            observedContexts.push(context.messages as AgentMessage[]);
            const stream = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant', content: [{ type: 'text', text: 'Answer from compacted context.' }],
                api: requestedModel.api, provider: requestedModel.provider, model: requestedModel.id,
                usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'stop', timestamp: Date.now(),
            };
            stream.push({ type: 'start', partial: message });
            stream.push({ type: 'done', reason: 'stop', message });
            return stream;
        };
        const old = user('A'.repeat(500_000));
        const agent = new Agent({
            initialState: { systemPrompt: 'Keep dataset evidence accurate.', model: model!, messages: [system, old] },
            streamFn,
            transformContext: createPiContextCompactor(200_000, summarize),
        });

        await agent.prompt('Current question.');

        expect(summarize).toHaveBeenCalledOnce();
        expect(observedContexts).toHaveLength(1);
        expect(observedContexts[0][1]).toMatchObject({
            role: 'user', content: [{ type: 'text', text: expect.stringContaining('Revenue total 470') }],
        });
        expect(observedContexts[0].some(message => JSON.stringify(message).includes('A'.repeat(1000)))).toBe(false);
        expect(agent.state.messages).toContain(old);
    });
});
