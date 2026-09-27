import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// Hoisted mock so we can configure streamText per-test
const { streamTextMock } = vi.hoisted(() => ({
    streamTextMock: vi.fn((_options: unknown) => ({
        fullStream: (async function* () {})(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(undefined),
    })),
}));

// Mock the AI SDK and provider config
vi.mock('ai', () => ({
    generateText: vi.fn(),
    streamText: streamTextMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: vi.fn(() => true),
    createProviderModel: vi.fn(() => ({ model: 'mock-model' })),
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

import { isProviderConfigured } from '../services/ai/providerConfig';
import { evaluateChartPresentation, type VisualEvaluationResult } from '../services/ai/visualPresentationEvaluator';
import type { Settings, AnalysisPlan } from '../types';

const mockIsConfigured = vi.mocked(isProviderConfigured);

const mockSettings = { provider: 'google', geminiApiKey: 'test', simpleModel: 'flash' } as Settings;
const mockPlan = { title: 'Test Chart', groupByColumn: 'Category', valueColumn: 'Amount' } as AnalysisPlan;

/** Helper: make streamTextMock return a stream that resolves to the given text. */
const mockStreamTextResponse = (text: string) => {
    streamTextMock.mockReturnValueOnce({
        fullStream: (async function* () {})(),
        text: Promise.resolve(text),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(undefined),
    });
};

/** Helper: make streamTextMock reject with the given error. */
const mockStreamTextError = (error: Error) => {
    streamTextMock.mockImplementationOnce(() => { throw error; });
};

beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
});

describe('evaluateChartPresentation', () => {
    it('parses valid JSON response correctly', async () => {
        mockStreamTextResponse('{"quality":"good","suggestedChartType":null,"reason":null}');

        const result = await evaluateChartPresentation('data:image/png;base64,abc', mockPlan, 'bar', 10, mockSettings);
        expect(result).toEqual({ quality: 'good' });
    });

    it('parses poor quality with suggestion', async () => {
        mockStreamTextResponse('{"quality":"poor","suggestedChartType":"horizontal_bar","reason":"labels overlapping"}');

        const result = await evaluateChartPresentation('abc', mockPlan, 'bar', 25, mockSettings);
        expect(result).toEqual({
            quality: 'poor',
            suggestedChartType: 'horizontal_bar',
            reason: 'labels overlapping',
        });
    });

    it('handles markdown-wrapped JSON', async () => {
        mockStreamTextResponse('```json\n{"quality":"acceptable","reason":"minor crowding"}\n```');

        const result = await evaluateChartPresentation('abc', mockPlan, 'pie', 9, mockSettings);
        expect(result).toEqual({ quality: 'acceptable', reason: 'minor crowding' });
    });

    it('returns null for malformed JSON', async () => {
        mockStreamTextResponse('This is not JSON');

        const result = await evaluateChartPresentation('abc', mockPlan, 'bar', 10, mockSettings);
        expect(result).toBeNull();
    });

    it('returns null for invalid quality value', async () => {
        mockStreamTextResponse('{"quality":"excellent"}');

        const result = await evaluateChartPresentation('abc', mockPlan, 'bar', 10, mockSettings);
        expect(result).toBeNull();
    });

    it('returns null when provider is not configured', async () => {
        mockIsConfigured.mockReturnValue(false);

        const result = await evaluateChartPresentation('abc', mockPlan, 'bar', 10, mockSettings);
        expect(result).toBeNull();
        expect(streamTextMock).not.toHaveBeenCalled();
    });

    it('returns null on timeout/error', async () => {
        mockStreamTextError(new Error('AbortError'));

        const result = await evaluateChartPresentation('abc', mockPlan, 'bar', 10, mockSettings);
        expect(result).toBeNull();
    });

    it('returns null for empty response', async () => {
        mockStreamTextResponse('');

        const result = await evaluateChartPresentation('abc', mockPlan, 'bar', 10, mockSettings);
        expect(result).toBeNull();
    });

    it('strips data URL prefix before sending', async () => {
        mockStreamTextResponse('{"quality":"good"}');

        await evaluateChartPresentation('data:image/png;base64,AAAA', mockPlan, 'bar', 10, mockSettings);

        const call = streamTextMock.mock.calls[0][0] as { messages: Array<{ content: unknown }> };
        const userContent = call.messages[1].content as Array<{ type: string; image?: string }>;
        const imageBlock = userContent.find(b => b.type === 'image');
        expect(imageBlock?.image).toBe('AAAA');
    });
});
