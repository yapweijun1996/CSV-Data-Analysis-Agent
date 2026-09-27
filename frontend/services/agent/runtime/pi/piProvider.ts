import { createModels, clampThinkingLevel, type Api, type Model } from '@earendil-works/pi-ai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { Settings } from '../../../../types';
import { DEFAULT_GATEWAY_BASE_URL } from '../../../../config/defaultGatewayConfig';
import { fetchWithoutForbiddenUserAgent } from '../../../ai/browserProviderFetch';
import { resolveProviderApiKey, resolveProviderModelId } from '../../../ai/providerConfig';

const models = createModels();
models.setProvider(openaiProvider());
models.setProvider(googleProvider());

export const resolvePiModel = (settings: Settings): Model<Api> => {
    const provider = settings.provider === 'google' ? 'google' : 'openai';
    const id = resolveProviderModelId(settings);
    const catalogModel = models.getModel(provider, id);
    const familyModel = models.getModel(provider,
        provider === 'google' ? 'gemini-3.1-pro-preview' : 'gpt-5.4-mini');
    const model = catalogModel ?? familyModel;
    if (!model) throw new Error(`Pi has no model configuration for ${provider}.`);
    return {
        ...model,
        id,
        ...(settings.provider === 'default' ? { baseUrl: DEFAULT_GATEWAY_BASE_URL } : {}),
    };
};

export const resolvePiThinkingLevel = (settings: Settings) =>
    clampThinkingLevel(resolvePiModel(settings),
        settings.reasoningEffort === 'off' ? 'off' : settings.reasoningEffort ?? 'medium');

export const createPiProviderStream = (settings: Settings): StreamFn => {
    const apiKey = resolveProviderApiKey(settings);
    if (!apiKey.trim()) throw new Error('The selected AI provider has no API key.');
    return (model, context, options) => models.streamSimple(model, context, {
        ...options,
        apiKey,
        fetch: fetchWithoutForbiddenUserAgent,
        timeoutMs: 45_000,
        maxRetries: 0,
    });
};
