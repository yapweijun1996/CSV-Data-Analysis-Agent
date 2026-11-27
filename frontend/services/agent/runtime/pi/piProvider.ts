import { createModels, clampThinkingLevel, type Api, type Model } from '@earendil-works/pi-ai';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import type { Settings } from '../../../../types';
import { emitSilentFailure } from '../../monitoring/silentFailureTracker';
import type { StoreApi } from '../../types';
import {
    DEFAULT_GATEWAY_PI_KEEP_RECENT_BYTES,
    DEFAULT_GATEWAY_PI_REQUEST_BYTE_BUDGET,
    DEFAULT_GATEWAY_PI_REQUEST_OVERHEAD_BYTES,
    DEFAULT_GATEWAY_PI_SUMMARY_MAX_BYTES,
    PROVIDER_CONTEXT_WINDOW_CAP,
} from '../../../../config/agentDefaults';
import { DEFAULT_GATEWAY_BASE_URL } from '../../../../config/defaultGatewayConfig';
import { fetchDefaultGateway, fetchWithoutForbiddenUserAgent } from '../../../ai/browserProviderFetch';
import { resolveProviderApiKey, resolveProviderModelId } from '../../../ai/providerConfig';
import {
    createPiProviderContextCompactor, type PiCompactionDegradation, type PiRequestByteBudget,
} from './piContextCompaction';

const models = createModels();
models.setProvider(openaiProvider());
models.setProvider(googleProvider());
models.setProvider(anthropicProvider());
models.setProvider(openrouterProvider());

type PiCatalogProvider = 'openai' | 'google' | 'anthropic' | 'openrouter';

// Family model used when the typed/selected id is not in the Pi catalog, so the API shape
// (Anthropic Messages, OpenAI Completions, ...) is still inherited from a sibling model.
const PI_FAMILY_MODEL: Record<PiCatalogProvider, string> = {
    openai: 'gpt-5.4-mini',
    google: 'gemini-3.1-pro-preview',
    anthropic: 'claude-sonnet-4-5',
    openrouter: 'anthropic/claude-sonnet-4.5',
};

const resolvePiCatalogProvider = (settings: Settings): PiCatalogProvider =>
    settings.provider === 'google' || settings.provider === 'anthropic' || settings.provider === 'openrouter'
        ? settings.provider
        : 'openai';

export const resolvePiModel = (settings: Settings): Model<Api> => {
    const provider = resolvePiCatalogProvider(settings);
    const id = resolveProviderModelId(settings);
    const catalogModel = models.getModel(provider, id);
    const familyModel = models.getModel(provider, PI_FAMILY_MODEL[provider]);
    const model = catalogModel ?? familyModel;
    if (!model) throw new Error(`Pi has no model configuration for ${provider}.`);
    return {
        ...model,
        id,
        contextWindow: Math.min(model.contextWindow, PROVIDER_CONTEXT_WINDOW_CAP),
        ...(settings.provider === 'default' ? {
            baseUrl: DEFAULT_GATEWAY_BASE_URL,
            // The shared demo gateway rejects this optional Responses API field, and the
            // `additional_tools` / tool-search input items the catalog enables for GPT-5.4
            // (DEMO_INPUT_INVALID). Without them pi-ai sends the full tool set in `tools`.
            compat: {
                ...model.compat,
                supportsMaxOutputTokens: false,
                supportsAdditionalTools: false,
                supportsToolSearch: false,
            },
        } : {}),
    };
};

export const resolvePiThinkingLevel = (settings: Settings) =>
    clampThinkingLevel(resolvePiModel(settings),
        settings.reasoningEffort === 'off' ? 'off' : settings.reasoningEffort ?? 'medium');

/**
 * Fetch override for a provider. The Google adapter rejects any custom fetch, and Google needs no
 * User-Agent workaround, so it uses the platform fetch (undefined here).
 */
export const resolvePiProviderFetch = (settings: Settings): typeof fetch | undefined => {
    if (settings.provider === 'default') return fetchDefaultGateway;
    // pi-ai's Anthropic adapter already adds anthropic-dangerous-direct-browser-access for browsers.
    return settings.provider === 'google' ? undefined : fetchWithoutForbiddenUserAgent;
};

export const createPiProviderStream = (settings: Settings): StreamFn => {
    const apiKey = resolveProviderApiKey(settings);
    if (!apiKey.trim()) throw new Error('The selected AI provider has no API key.');
    const providerFetch = resolvePiProviderFetch(settings);
    return (model, context, options) => models.streamSimple(model, context, {
        ...options,
        apiKey,
        fetch: providerFetch,
        timeoutMs: 45_000,
        maxRetries: 0,
    });
};

/**
 * Gemini rejects a request whose last turn is the model's ("Requests ending with a model turn are
 * not supported"). Pi can continue after a text-only model turn, so end such a history with a user turn.
 */
export const ensureGoogleHistoryEndsWithUserTurn = (messages: AgentMessage[]): AgentMessage[] =>
    messages.at(-1)?.role === 'assistant'
        ? [...messages, { role: 'user', content: [{ type: 'text', text: 'Continue.' }], timestamp: Date.now() }]
        : messages;

/**
 * The Default demo gateway rejects request bodies far below the 200k-token planning window
 * (DEMO_INPUT_TOO_LARGE), so only that provider also compacts on serialized bytes. Every other
 * provider keeps the token-based trigger alone.
 */
export const resolvePiRequestByteBudget = (settings: Settings): PiRequestByteBudget | undefined =>
    settings.provider === 'default' ? {
        maxRequestBytes: DEFAULT_GATEWAY_PI_REQUEST_BYTE_BUDGET,
        overheadBytes: DEFAULT_GATEWAY_PI_REQUEST_OVERHEAD_BYTES,
        keepRecentBytes: DEFAULT_GATEWAY_PI_KEEP_RECENT_BYTES,
        summaryMaxBytes: DEFAULT_GATEWAY_PI_SUMMARY_MAX_BYTES,
    } : undefined;

export const createPiProviderContextTransform = (
    settings: Settings,
    onDegraded?: (degradation: PiCompactionDegradation) => void,
) => {
    const apiKey = resolveProviderApiKey(settings);
    if (!apiKey.trim()) throw new Error('The selected AI provider has no API key.');
    const compact = createPiProviderContextCompactor(
        resolvePiModel(settings),
        models,
        apiKey,
        resolvePiProviderFetch(settings),
        onDegraded,
        { requestByteBudget: resolvePiRequestByteBudget(settings) },
    );
    if (settings.provider !== 'google') return compact;
    return async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> =>
        ensureGoogleHistoryEndsWithUserTurn(await compact(messages, signal));
};

/** Surface degraded context compaction as a silent-failure runtime event. */
export const createPiCompactionTelemetry = (store: StoreApi) =>
    ({ reason, error, estimatedTokens, estimatedBytes }: PiCompactionDegradation): void =>
        emitSilentFailure(store, error, {
            component: 'PiContextCompaction',
            recoveryAction: reason === 'summary_truncated' ? 'truncated_summary_used' : `uncompacted_history_used:${reason}`,
            userNotified: false,
            detail: { reason, estimatedTokens, ...(estimatedBytes === undefined ? {} : { estimatedBytes }) },
        });
