import { describe, expect, it, vi } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
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

    it('preserves a single oversized current turn when there is no safe history to summarize', async () => {
        const summarize = vi.fn(async () => 'summary');
        const compact = createPiContextCompactor(200_000, summarize);
        const messages = [system, user('U'.repeat(600_000))];

        expect(await compact(messages)).toEqual(messages);
        expect(summarize).not.toHaveBeenCalled();
    });

    it('keeps the original context when summarization fails', async () => {
        const compact = createPiContextCompactor(200_000, async () => {
            throw new Error('Provider failure');
        });
        const messages = [system, user('A'.repeat(500_000)), user('Current request.')];

        expect(await compact(messages)).toEqual(messages);
    });
});
