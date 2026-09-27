/**
 * AGRUN-007: maps the app's existing provider settings into the provider
 * request contract consumed by Agent Runtime JavaScript. Credentials stay
 * ephemeral and are re-read for every run or approval resume.
 */
import {
    DEFAULT_GATEWAY_BASE_URL,
} from '../../../../config/defaultGatewayConfig';
import {
    fetchWithoutForbiddenUserAgent,
} from '../../../ai/browserProviderFetch';
import type { Settings } from '../../../../types';
import {
    resolveProviderApiKey,
    resolveProviderModelId,
} from '../../../ai/providerConfig';
import type {
    AgrunModule,
    AgrunRecord,
} from './types';

const OPENAI_REASONING_EFFORT: Record<
    NonNullable<Settings['reasoningEffort']>,
    'none' | 'low' | 'medium' | 'high'
> = {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
};

const GEMINI_THINKING_BUDGET: Record<
    NonNullable<Settings['reasoningEffort']>,
    number
> = {
    off: 0,
    low: 1024,
    medium: 8192,
    high: 24576,
};

export { fetchWithoutForbiddenUserAgent } from '../../../ai/browserProviderFetch';

export const createBoundedProviderFetch = (timeoutMs: number): typeof fetch =>
    async (input, init) => {
        const controller = new AbortController();
        const upstreamSignal = init?.signal;
        const forwardAbort = () => controller.abort(
            upstreamSignal?.reason
            ?? new DOMException('Provider request was cancelled.', 'AbortError'),
        );
        if (upstreamSignal?.aborted) {
            forwardAbort();
        } else {
            upstreamSignal?.addEventListener('abort', forwardAbort, { once: true });
        }
        const timer = setTimeout(() => controller.abort(new DOMException(
            `Provider request timed out after ${timeoutMs}ms.`,
            'TimeoutError',
        )), timeoutMs);
        try {
            return await fetchWithoutForbiddenUserAgent(input, {
                ...init,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
            upstreamSignal?.removeEventListener('abort', forwardAbort);
        }
    };

export const createAgrunProviderInput = (
    settings: Settings,
    prompt?: string,
    options?: { requestTimeoutMs?: number },
): AgrunRecord => {
    const apiKey = resolveProviderApiKey(settings);
    const model = resolveProviderModelId(settings);
    const reasoningEffort = settings.reasoningEffort ?? 'medium';

    if (settings.provider === 'google') {
        return {
            provider: 'gemini',
            apiKey,
            model,
            ...(prompt !== undefined ? { prompt } : {}),
            fetch: options?.requestTimeoutMs
                ? createBoundedProviderFetch(options.requestTimeoutMs)
                : fetchWithoutForbiddenUserAgent,
            thinkingConfig: {
                thinkingBudget: GEMINI_THINKING_BUDGET[reasoningEffort],
            },
        };
    }

    return {
        provider: 'openai',
        apiKey,
        model,
        ...(settings.provider === 'default'
            ? { endpoint: DEFAULT_GATEWAY_BASE_URL }
            : {}),
        ...(prompt !== undefined ? { prompt } : {}),
        apiVariant: 'responses',
        fetch: options?.requestTimeoutMs
            ? createBoundedProviderFetch(options.requestTimeoutMs)
            : fetchWithoutForbiddenUserAgent,
        reasoningEffort: OPENAI_REASONING_EFFORT[reasoningEffort],
        reasoningSummary: 'auto',
    };
};

const requireProviderSkill = (
    module: AgrunModule,
    name: 'openaiBrowserSkill' | 'geminiBrowserSkill',
): unknown => {
    const skill = module[name];
    if (!skill) {
        throw new Error(
            `Agent Runtime JavaScript does not expose the required ${name} provider adapter.`,
        );
    }
    return skill;
};

/**
 * Register both app-supported provider adapters once. The selected provider
 * remains a per-turn app setting, so changing settings does not create a
 * second runtime instance.
 */
export const createAgrunProviderSkills = (
    module: AgrunModule,
): unknown[] => [
    requireProviderSkill(module, 'openaiBrowserSkill'),
    requireProviderSkill(module, 'geminiBrowserSkill'),
];
