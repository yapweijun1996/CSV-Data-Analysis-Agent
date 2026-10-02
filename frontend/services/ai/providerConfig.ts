import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, wrapLanguageModel, extractJsonMiddleware, type LanguageModelMiddleware } from 'ai';
import type { Settings } from '../../types';
import {
    PROVIDER_GEMINI_CONTEXT_WINDOW,
    PROVIDER_GEMMA_CONTEXT_WINDOW,
    PROVIDER_GPT_CONTEXT_WINDOW,
    PROVIDER_CONTEXT_WINDOW_CAP,
    PROVIDER_RESERVE_RATIO,
    PROVIDER_KEEP_RECENT_RATIO,
    PROVIDER_MIN_RESERVE_TOKENS,
    PROVIDER_MIN_KEEP_RECENT_TOKENS,
} from '../../config/agentDefaults';
import { DEFAULT_FALLBACK_MODEL, FALLBACK_MODEL_CHAIN } from '../../config/modelDefaults';
import { getForceFallbackModel } from '../../config/runtimeConfig';
import { DEFAULT_GATEWAY_BASE_URL, DEFAULT_GATEWAY_MODEL, resolveDefaultGatewayApiKey } from '../../config/defaultGatewayConfig';
import { ensureCloudAiConsent } from '../privacy/cloudAiConsent';
import { waitForCloudAiConnectivity } from '../pwa/networkAvailability';
import { fetchDefaultGateway, fetchWithoutForbiddenUserAgent } from './browserProviderFetch';
import { createLlmDiagnosticMiddleware } from '../observability/llmDiagnosticMiddleware';

export type ModelContextStrategy = 'model_aware' | 'fallback_static';

export interface ModelContextProfile {
    contextWindow: number | null;
    reserveTokens: number;
    keepRecentTokens: number;
    strategy: ModelContextStrategy;
}

export interface ProviderModelOptions {
    /** Explicit provider connection checks contain no dataset context. */
    requireDataConsent?: boolean;
}

export const resolveProviderApiKey = (settings: Settings): string => {
    if (settings.provider === 'default') return resolveDefaultGatewayApiKey();
    return settings.provider === 'google' ? settings.geminiApiKey : settings.openAIApiKey;
};

// The 'default' provider uses the maintainer's shared gateway key — always
// available, no BYOK step required from the end user.
export const isProviderConfigured = (settings: Settings): boolean =>
    settings.provider === 'default' || Boolean(resolveProviderApiKey(settings).trim());

export const resolveProviderModelId = (settings: Settings, modelOverride?: string): string => {
    // The demo gateway only serves one model — never let a stored/override
    // model ID from a different provider leak through.
    if (settings.provider === 'default') return DEFAULT_GATEWAY_MODEL;
    return modelOverride || settings.complexModel;
};

export const resolveModelContextProfile = (
    settings: Settings,
    modelOverride?: string,
): ModelContextProfile => {
    const modelId = resolveProviderModelId(settings, modelOverride).trim().toLowerCase();

    if (settings.provider === 'google' && modelId.startsWith('gemini')) {
        const contextWindow = Math.min(PROVIDER_GEMINI_CONTEXT_WINDOW, PROVIDER_CONTEXT_WINDOW_CAP);
        return {
            contextWindow,
            reserveTokens: Math.max(PROVIDER_MIN_RESERVE_TOKENS, Math.floor(contextWindow * PROVIDER_RESERVE_RATIO)),
            keepRecentTokens: Math.max(PROVIDER_MIN_KEEP_RECENT_TOKENS, Math.floor(contextWindow * PROVIDER_KEEP_RECENT_RATIO)),
            strategy: 'model_aware',
        };
    }

    if (settings.provider === 'google' && modelId.startsWith('gemma')) {
        const contextWindow = Math.min(PROVIDER_GEMMA_CONTEXT_WINDOW, PROVIDER_CONTEXT_WINDOW_CAP);
        return {
            contextWindow,
            reserveTokens: Math.max(PROVIDER_MIN_RESERVE_TOKENS, Math.floor(contextWindow * PROVIDER_RESERVE_RATIO)),
            keepRecentTokens: Math.max(PROVIDER_MIN_KEEP_RECENT_TOKENS, Math.floor(contextWindow * PROVIDER_KEEP_RECENT_RATIO)),
            strategy: 'model_aware',
        };
    }

    if ((settings.provider === 'openai' || settings.provider === 'default') && modelId.startsWith('gpt-')) {
        const contextWindow = PROVIDER_GPT_CONTEXT_WINDOW;
        return {
            contextWindow,
            reserveTokens: Math.max(PROVIDER_MIN_RESERVE_TOKENS, Math.floor(contextWindow * PROVIDER_RESERVE_RATIO)),
            keepRecentTokens: Math.max(PROVIDER_MIN_KEEP_RECENT_TOKENS, Math.floor(contextWindow * PROVIDER_KEEP_RECENT_RATIO)),
            strategy: 'model_aware',
        };
    }

    return {
        contextWindow: null,
        reserveTokens: 0,
        keepRecentTokens: 0,
        strategy: 'fallback_static',
    };
};

/**
 * Shared middleware that strips markdown code fences (```json ... ```) from
 * LLM responses before the AI SDK attempts JSON.parse.
 *
 * Why: Local models (e.g. Gemma) and some cloud models sometimes wrap valid
 * JSON inside markdown fences, which causes Output.object() to throw
 * AI_NoObjectGeneratedError → AI_JSONParseError. This middleware is the
 * official Vercel AI SDK solution (extractJsonMiddleware).
 *
 * Applied once here so ALL 19+ Output.object() call sites benefit automatically.
 */
const jsonFenceMiddleware = extractJsonMiddleware();

// Gemini has no named effort levels — thinkingConfig.thinkingBudget is a raw
// token budget. These bands are a reasonable, arbitrary mapping onto the
// same 'off'/'low'/'medium'/'high' scale the UI exposes for both providers.
const GEMINI_THINKING_BUDGET_BY_EFFORT: Record<NonNullable<Settings['reasoningEffort']>, number> = {
    off: 0,
    low: 1024,
    medium: 8192,
    high: 24576,
};

// OpenAI/gateway Responses-API reasoning effort uses the SDK's own enum directly.
const OPENAI_REASONING_EFFORT_BY_EFFORT: Record<NonNullable<Settings['reasoningEffort']>, 'none' | 'low' | 'medium' | 'high'> = {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
};

/**
 * Injects the user's reasoning/thinking preference into every call made
 * through this model, via transformParams — so individual generateText/
 * streamText call sites across the codebase don't each need to pass it.
 * A caller-supplied providerOptions entry for the relevant provider always
 * wins (this only fills in what's missing).
 */
const createReasoningMiddleware = (
    settings: Settings,
    sdkProviderKey: 'google' | 'openai',
): LanguageModelMiddleware => {
    const effort = settings.reasoningEffort ?? 'medium';
    return {
        specificationVersion: 'v3',
        transformParams: async ({ params }) => {
            const existing = params.providerOptions?.[sdkProviderKey];
            if (existing) return params;

            const addition = sdkProviderKey === 'google'
                ? { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET_BY_EFFORT[effort] } }
                : { reasoningEffort: OPENAI_REASONING_EFFORT_BY_EFFORT[effort] };

            return {
                ...params,
                providerOptions: {
                    ...params.providerOptions,
                    [sdkProviderKey]: addition,
                },
            };
        },
    };
};

const createCloudAiConsentMiddleware = (
    settings: Settings,
): LanguageModelMiddleware => ({
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
        await waitForCloudAiConnectivity(params.abortSignal);
        await ensureCloudAiConsent(settings.provider);
        return params;
    },
});

export const createProviderModel = (
    settings: Settings,
    modelOverride?: string,
    options: ProviderModelOptions = {},
) => {
    const modelId = resolveProviderModelId(settings, modelOverride);
    const apiKey = resolveProviderApiKey(settings);
    const consentMiddleware = options.requireDataConsent === false
        ? []
        : [createCloudAiConsentMiddleware(settings)];
    const diagnosticMiddleware = createLlmDiagnosticMiddleware(settings.provider, modelId);

    if (settings.provider === 'default') {
        return {
            modelId,
            model: wrapLanguageModel({
                model: createOpenAI({
                    apiKey,
                    baseURL: DEFAULT_GATEWAY_BASE_URL,
                    fetch: fetchDefaultGateway,
                }).responses(modelId),
                middleware: [...consentMiddleware, diagnosticMiddleware, jsonFenceMiddleware, createReasoningMiddleware(settings, 'openai')],
            }),
        };
    }

    if (settings.provider === 'openai') {
        return {
            modelId,
            model: wrapLanguageModel({
                model: createOpenAI({
                    apiKey,
                    fetch: fetchWithoutForbiddenUserAgent,
                })(modelId),
                middleware: [...consentMiddleware, diagnosticMiddleware, jsonFenceMiddleware, createReasoningMiddleware(settings, 'openai')],
            }),
        };
    }

    // Note: search grounding in @ai-sdk/google v3 is passed as a tool at call time,
    // not as a model option. settings.enableSearchGrounding is reserved for future use.
    return {
        modelId,
        model: wrapLanguageModel({
            model: createGoogleGenerativeAI({ apiKey })(modelId),
            middleware: [...consentMiddleware, diagnosticMiddleware, jsonFenceMiddleware, createReasoningMiddleware(settings, 'google')],
        }),
    };
};

/**
 * Resolve the fallback model ID for the current provider.
 * Priority: forceFallbackModel > settings.fallbackModel > DEFAULT_FALLBACK_MODEL.
 * When the resolved fallback equals the primary model, walks FALLBACK_MODEL_CHAIN
 * to find the first alternative that differs. Returns null only if no viable
 * fallback exists.
 */
export const resolveFallbackModelId = (settings: Settings, primaryModelId?: string): string | null => {
    const primary = primaryModelId || resolveProviderModelId(settings);

    const forced = getForceFallbackModel();
    const fallback = forced
        || settings.fallbackModel?.trim()
        || DEFAULT_FALLBACK_MODEL[settings.provider]
        || null;

    if (!fallback) return null;

    // Happy path: fallback differs from primary
    if (fallback !== primary) return fallback;

    // Fallback === primary — walk the chain to find an alternative
    const chain = FALLBACK_MODEL_CHAIN[settings.provider];
    if (chain) {
        const alternative = chain.find(m => m !== primary);
        if (alternative) {
            console.warn(
                `[FallbackResolver] Default fallback "${fallback}" equals primary "${primary}". ` +
                `Auto-selected alternative fallback: "${alternative}"`,
            );
            return alternative;
        }
    }

    console.warn(
        `[FallbackResolver] No viable fallback available — fallback "${fallback}" equals primary "${primary}" ` +
        `and no alternative found in chain. Transient errors will NOT be retried with a different model.`,
    );
    return null;
};

/**
 * Create a provider model instance using the fallback model.
 * Returns null if no valid fallback is available.
 */
export const createFallbackProviderModel = (settings: Settings, primaryModelId?: string) => {
    const fallbackId = resolveFallbackModelId(settings, primaryModelId);
    if (!fallbackId) return null;
    return createProviderModel(settings, fallbackId);
};

// --- Provider Health Check ---

export type ProviderHealthStatus =
    | 'healthy'
    | 'not_configured'
    | 'invalid_key'
    | 'unreachable';

export interface ProviderHealthResult {
    status: ProviderHealthStatus;
    /** ISO timestamp of when the check was performed */
    checkedAt: string;
    /** Raw error message when status is not 'healthy' */
    errorDetail?: string;
    /** Which model was used for the health check */
    testedModel?: string;
}

const HEALTHY_TTL_MS = 5 * 60 * 1000;  // 5 minutes
const FAILURE_TTL_MS = 30 * 1000;       // 30 seconds

let _cachedHealthResult: ProviderHealthResult | null = null;
let _cachedHealthFingerprint = '';
// Bumped on every invalidation so a check that was in flight with old
// settings cannot write its stale result back into the cache.
let _healthCacheGeneration = 0;

const healthFingerprint = (settings: Settings): string =>
    [settings.provider, settings.simpleModel, resolveProviderApiKey(settings)].join('\u0000');

export function invalidateProviderHealthCache(): void {
    _cachedHealthResult = null;
    _healthCacheGeneration += 1;
}

/**
 * Validate that the AI provider is reachable and the API key is valid.
 * Returns a typed result with TTL caching (5min healthy, 30s failure).
 * Uses the simpleModel for a lightweight test call.
 */
export async function validateProviderHealth(
    settings: Settings,
): Promise<ProviderHealthResult> {
    if (!isProviderConfigured(settings)) {
        return { status: 'not_configured', checkedAt: new Date().toISOString() };
    }

    const fingerprint = healthFingerprint(settings);
    if (_cachedHealthResult && _cachedHealthFingerprint === fingerprint) {
        const age = Date.now() - new Date(_cachedHealthResult.checkedAt).getTime();
        const ttl = _cachedHealthResult.status === 'healthy' ? HEALTHY_TTL_MS : FAILURE_TTL_MS;
        if (age < ttl) return _cachedHealthResult;
    }

    const testModelId = settings.simpleModel;
    const now = new Date().toISOString();
    const generation = _healthCacheGeneration;
    let result: ProviderHealthResult;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
        const { model } = createProviderModel(settings, testModelId);
        // Race against a timeout so a down API (503 + exponential backoff)
        // doesn't freeze the chat for 30+ seconds with no UI indicator.
        const HEALTH_CHECK_TIMEOUT_MS = 8_000;
        const healthPromise = generateText({
            model,
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
            maxRetries: 1,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
            timeoutHandle = setTimeout(() => reject(new Error('Health check timed out')), HEALTH_CHECK_TIMEOUT_MS),
        );
        await Promise.race([healthPromise, timeoutPromise]);
        result = { status: 'healthy', checkedAt: now, testedModel: testModelId };
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        // Inline permanent-error check to avoid circular dependency with transientRetry.ts.
        // Mirrors PERMANENT_ERROR_PATTERNS from transientRetry.ts.
        const lower = detail.toLowerCase();
        const isPermanent = ['401', '403', 'invalid_api_key', 'permission_denied',
            'authentication', 'unauthorized', 'forbidden'].some(p => lower.includes(p));
        const status: ProviderHealthStatus = isPermanent ? 'invalid_key' : 'unreachable';
        result = { status, checkedAt: now, errorDetail: detail, testedModel: testModelId };
    } finally {
        clearTimeout(timeoutHandle);
    }

    if (generation === _healthCacheGeneration) {
        _cachedHealthResult = result;
        _cachedHealthFingerprint = fingerprint;
    }
    return result;
}
