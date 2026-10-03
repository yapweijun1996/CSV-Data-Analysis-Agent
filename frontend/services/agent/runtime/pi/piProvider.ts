import { createModels, clampThinkingLevel, type Api, type Model } from '@earendil-works/pi-ai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { Settings } from '../../../../types';
import { emitSilentFailure } from '../../monitoring/silentFailureTracker';
import type { StoreApi } from '../../types';
import { PROVIDER_CONTEXT_WINDOW_CAP } from '../../../../config/agentDefaults';
import { DEFAULT_GATEWAY_BASE_URL } from '../../../../config/defaultGatewayConfig';
import { fetchDefaultGateway, fetchWithoutForbiddenUserAgent } from '../../../ai/browserProviderFetch';
import { resolveProviderApiKey, resolveProviderModelId } from '../../../ai/providerConfig';
import { createPiProviderContextCompactor, type PiCompactionDegradation } from './piContextCompaction';

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
        contextWindow: Math.min(model.contextWindow, PROVIDER_CONTEXT_WINDOW_CAP),
        ...(settings.provider === 'default' ? {
            baseUrl: DEFAULT_GATEWAY_BASE_URL,
            // The shared demo gateway rejects this optional Responses API field.
            compat: { ...model.compat, supportsMaxOutputTokens: false },
        } : {}),
    };
};

export const resolvePiThinkingLevel = (settings: Settings) =>
    clampThinkingLevel(resolvePiModel(settings),
        settings.reasoningEffort === 'off' ? 'off' : settings.reasoningEffort ?? 'medium');

export const createPiProviderStream = (settings: Settings): StreamFn => {
    const apiKey = resolveProviderApiKey(settings);
    if (!apiKey.trim()) throw new Error('The selected AI provider has no API key.');
    const providerFetch = settings.provider === 'default' ? fetchDefaultGateway : fetchWithoutForbiddenUserAgent;
    return (model, context, options) => models.streamSimple(model, context, {
        ...options,
        apiKey,
        fetch: providerFetch,
        timeoutMs: 45_000,
        maxRetries: 0,
    });
};

export const createPiProviderContextTransform = (
    settings: Settings,
    onDegraded?: (degradation: PiCompactionDegradation) => void,
) => {
    const apiKey = resolveProviderApiKey(settings);
    if (!apiKey.trim()) throw new Error('The selected AI provider has no API key.');
    return createPiProviderContextCompactor(
        resolvePiModel(settings),
        models,
        apiKey,
        settings.provider === 'default' ? fetchDefaultGateway : fetchWithoutForbiddenUserAgent,
        onDegraded,
    );
};

/** Surface degraded context compaction as a silent-failure runtime event. */
export const createPiCompactionTelemetry = (store: StoreApi) =>
    ({ reason, error, estimatedTokens }: PiCompactionDegradation): void =>
        emitSilentFailure(store, error, {
            component: 'PiContextCompaction',
            recoveryAction: `uncompacted_history_used:${reason}`,
            userNotified: false,
            detail: { reason, estimatedTokens },
        });
