import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import type { Settings } from '../types';

vi.mock('../services/privacy/cloudAiConsent', () => ({ ensureCloudAiConsent: vi.fn(async () => undefined) }));

const { createProviderModel, resolveProviderApiKey, isProviderConfigured, resolveModelContextProfile } =
    await import('../services/ai/providerConfig');
const { resolvePiModel, resolvePiThinkingLevel } = await import('../services/agent/runtime/pi/piProvider');

const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
    provider: 'anthropic',
    geminiApiKey: '',
    openAIApiKey: '',
    anthropicApiKey: 'sk-ant-test',
    openRouterApiKey: 'sk-or-test',
    simpleModel: 'claude-haiku-4-5',
    complexModel: 'claude-sonnet-4-6',
    language: 'English',
    reportTemplate: 'management_review',
    autoConfirmGoal: true,
    runtimeAccessControl: {} as Settings['runtimeAccessControl'],
    ...overrides,
});

interface Captured { url: string; headers: Headers; body: Record<string, unknown> }

const captureRequests = (responseBody: unknown) => {
    const captured: Captured[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const bodyText = request ? await request.clone().text() : String(init?.body ?? '');
        captured.push({
            url: request ? request.url : String(input),
            headers: new Headers(init?.headers ?? request?.headers),
            body: JSON.parse(bodyText),
        });
        return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    return captured;
};

const anthropicReply = {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 3, output_tokens: 1 },
};
const openRouterReply = {
    id: 'gen-1', model: 'anthropic/claude-sonnet-4.6', created: 1,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
    usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
};

describe('Anthropic and OpenRouter BYOK providers', () => {
    beforeEach(() => { vi.restoreAllMocks(); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('reads the matching API key per provider', () => {
        expect(resolveProviderApiKey(makeSettings())).toBe('sk-ant-test');
        expect(resolveProviderApiKey(makeSettings({ provider: 'openrouter' }))).toBe('sk-or-test');
        expect(isProviderConfigured(makeSettings({ anthropicApiKey: '  ' }))).toBe(false);
        expect(isProviderConfigured(makeSettings({ provider: 'openrouter', openRouterApiKey: undefined }))).toBe(false);
    });

    it('sends the browser opt-in header and an extended-thinking budget to Anthropic', async () => {
        const captured = captureRequests(anthropicReply);
        const { model } = createProviderModel(makeSettings({ reasoningEffort: 'medium' }), 'claude-sonnet-4-6', { requireDataConsent: false });
        await generateText({ model, messages: [{ role: 'user', content: 'hi' }], maxRetries: 0 });
        expect(captured).toHaveLength(1);
        expect(captured[0].url).toContain('api.anthropic.com/v1/messages');
        expect(captured[0].headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
        expect(captured[0].headers.get('x-api-key')).toBe('sk-ant-test');
        expect(captured[0].body.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
        expect(captured[0].body.model).toBe('claude-sonnet-4-6');
    });

    it('disables Anthropic thinking when reasoning is off', async () => {
        const captured = captureRequests(anthropicReply);
        const { model } = createProviderModel(makeSettings({ reasoningEffort: 'off' }), undefined, { requireDataConsent: false });
        await generateText({ model, messages: [{ role: 'user', content: 'hi' }], maxRetries: 0 });
        expect(captured[0].body.thinking).toEqual({ type: 'disabled' });
    });

    it('maps reasoning effort to the OpenRouter reasoning parameter', async () => {
        const captured = captureRequests(openRouterReply);
        const settings = makeSettings({ provider: 'openrouter', complexModel: 'anthropic/claude-sonnet-4.6', reasoningEffort: 'high' });
        const { model } = createProviderModel(settings, undefined, { requireDataConsent: false });
        await generateText({ model, messages: [{ role: 'user', content: 'hi' }], maxRetries: 0 });
        expect(captured[0].url).toContain('openrouter.ai/api/v1/chat/completions');
        expect(captured[0].headers.get('authorization')).toBe('Bearer sk-or-test');
        expect(captured[0].body.model).toBe('anthropic/claude-sonnet-4.6');
        expect(captured[0].body.reasoning).toMatchObject({ effort: 'high' });
    });

    it('gives Claude models a model-aware context profile', () => {
        expect(resolveModelContextProfile(makeSettings()).strategy).toBe('model_aware');
        expect(resolveModelContextProfile(makeSettings({ provider: 'openrouter', complexModel: 'openai/gpt-5-mini' })).strategy).toBe('fallback_static');
    });

    it('resolves Pi models from the matching catalog and keeps unknown ids on the family API', () => {
        const anthropic = resolvePiModel(makeSettings());
        expect(anthropic.api).toBe('anthropic-messages');
        expect(anthropic.id).toBe('claude-sonnet-4-6');
        const custom = resolvePiModel(makeSettings({ complexModel: 'claude-future-9' }));
        expect(custom.api).toBe('anthropic-messages');
        expect(custom.id).toBe('claude-future-9');
        const router = resolvePiModel(makeSettings({ provider: 'openrouter', complexModel: 'anthropic/claude-sonnet-4.6' }));
        expect(router.provider).toBe('openrouter');
        expect(router.baseUrl).toContain('openrouter.ai');
        expect(resolvePiThinkingLevel(makeSettings({ reasoningEffort: 'high' }))).toBeTruthy();
    });
});
