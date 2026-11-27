// @vitest-environment node

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { describe, expect, it, vi } from 'vitest';
import { createLazyLanguageModel } from '../services/ai/lazyLanguageModel';
import { createProviderModel } from '../services/ai/providerConfig';
import { createTestSettings } from './testSettings';

describe('lazy language model', () => {
    it('reports the same provider and model id as the real SDK model', () => {
        const apiKey = 'test-key';
        const cases = [
            ['default', createOpenAI({ apiKey }).responses('gpt-5.4-mini')],
            ['openai', createOpenAI({ apiKey })('gpt-5.4-mini')],
            ['google', createGoogleGenerativeAI({ apiKey })('gemini-2.5-flash')],
            ['anthropic', createAnthropic({ apiKey })('claude-haiku-4-5')],
            ['openrouter', createOpenRouter({ apiKey }).chat('openai/gpt-5.4-mini')],
        ] as const;
        for (const [provider, real] of cases) {
            const { model } = createProviderModel(createTestSettings({
                provider, complexModel: real.modelId, geminiApiKey: apiKey, openAIApiKey: apiKey,
                anthropicApiKey: apiKey, openRouterApiKey: apiKey,
            }));
            expect({ provider: model.provider, modelId: model.modelId })
                .toEqual({ provider: real.provider, modelId: real.modelId });
        }
    });

    it('loads once, and retries after a failed load', async () => {
        const loaded = { supportedUrls: {}, doGenerate: vi.fn(async () => 'ok') } as unknown as LanguageModelV3;
        const load = vi.fn<() => Promise<LanguageModelV3>>()
            .mockRejectedValueOnce(new Error('chunk unavailable'))
            .mockResolvedValue(loaded);
        const model = createLazyLanguageModel('openai.responses', 'm', load);
        expect(load).not.toHaveBeenCalled();

        await expect(model.doGenerate({ prompt: [] })).rejects.toThrow('chunk unavailable');
        await expect(model.doGenerate({ prompt: [] })).resolves.toBe('ok');
        await model.doGenerate({ prompt: [] });
        expect(load).toHaveBeenCalledTimes(2);
    });
});
