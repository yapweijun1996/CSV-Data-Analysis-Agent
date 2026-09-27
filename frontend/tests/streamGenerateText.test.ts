import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAiConsentDeclinedError } from '../services/privacy/cloudAiConsent';

const { streamTextMock } = vi.hoisted(() => ({
    streamTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
    streamText: streamTextMock,
}));

import { streamGenerateText } from '../services/ai/streamGenerateText';

describe('streamGenerateText', () => {
    beforeEach(() => {
        streamTextMock.mockReset();
    });

    it('returns text, finish reason, and structured output', async () => {
        streamTextMock.mockReturnValue({
            fullStream: (async function* () {
                yield { type: 'text-delta' };
            })(),
            text: Promise.resolve('hello'),
            finishReason: Promise.resolve('stop'),
            output: Promise.resolve({ answer: 42 }),
        });

        await expect(streamGenerateText({ model: {} as never, messages: [] })).resolves.toEqual({
            text: 'hello',
            finishReason: 'stop',
            output: { answer: 42 },
        });
    });

    it('observes sibling output rejection when the text promise fails', async () => {
        const providerError = new Error('provider unavailable');
        streamTextMock.mockReturnValue({
            fullStream: (async function* () {})(),
            text: Promise.reject(providerError),
            finishReason: Promise.resolve('error'),
            output: Promise.reject(providerError),
        });

        await expect(streamGenerateText({ model: {} as never, messages: [] })).rejects.toBe(providerError);
    });

    it('propagates an expected consent decline without logging it as a provider error', async () => {
        const declinedError = new CloudAiConsentDeclinedError();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        streamTextMock.mockImplementation((options: {
            onError?: (event: { error: unknown }) => void | Promise<void>;
        }) => ({
            fullStream: (async function* () {
                await options.onError?.({ error: declinedError });
                yield { type: 'error', error: declinedError };
            })(),
            text: Promise.reject(new Error('No output generated')),
            finishReason: Promise.resolve('error'),
            output: Promise.reject(new Error('No output generated')),
        }));

        await expect(streamGenerateText({ model: {} as never, messages: [] })).rejects.toBe(declinedError);
        expect(consoleError).not.toHaveBeenCalled();

        consoleError.mockRestore();
    });
});
