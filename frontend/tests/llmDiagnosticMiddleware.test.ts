// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordMock } = vi.hoisted(() => ({
    recordMock: vi.fn(),
}));

vi.mock('../services/observability/localDiagnostics', () => ({
    recordLocalDiagnosticBestEffort: recordMock,
}));

import { createLlmDiagnosticMiddleware } from '../services/observability/llmDiagnosticMiddleware';

describe('LLM diagnostic middleware', () => {
    beforeEach(() => vi.clearAllMocks());

    it('records prompt and generated response at the shared provider boundary', async () => {
        const middleware = createLlmDiagnosticMiddleware('google', 'gemini-test');
        const result = {
            content: [{ type: 'text', text: 'Useful answer' }],
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
            warnings: [],
        };

        const returned = await middleware.wrapGenerate!({
            doGenerate: async () => result,
            doStream: vi.fn(),
            params: { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Analyze sample rows' }] }] },
            model: {} as never,
        } as never);

        expect(returned).toBe(result);
        expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'google',
            model: 'gemini-test',
            outcome: 'succeeded',
            reasonCode: 'stop',
            payload: expect.objectContaining({
                request: expect.objectContaining({ prompt: expect.any(Array) }),
                response: expect.objectContaining({ content: result.content }),
            }),
        }));
    });

    it('records provider failures with a stable reason code', async () => {
        const middleware = createLlmDiagnosticMiddleware('openai', 'gpt-test');
        const error = Object.assign(new Error('provider unavailable'), { status: 503 });

        await expect(middleware.wrapGenerate!({
            doGenerate: async () => { throw error; },
            doStream: vi.fn(),
            params: { prompt: [] },
            model: {} as never,
        } as never)).rejects.toBe(error);

        expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: 'failed',
            reasonCode: 'http_503',
        }));
    });
});
