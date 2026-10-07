import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Settings } from '../types';

const {
    ensureCloudAiConsentMock,
    wrapLanguageModelMock,
} = vi.hoisted(() => ({
    ensureCloudAiConsentMock: vi.fn(async () => undefined),
    wrapLanguageModelMock: vi.fn((opts: { model: unknown; middleware: unknown[] }) => opts),
}));

vi.mock('ai', () => ({
    generateText: vi.fn(),
    wrapLanguageModel: wrapLanguageModelMock,
    extractJsonMiddleware: vi.fn(() => ({})),
}));
vi.mock('../services/privacy/cloudAiConsent', () => ({
    ensureCloudAiConsent: ensureCloudAiConsentMock,
}));

const responsesFactory = vi.fn((modelId: string) => ({ _type: 'mock_responses_model', modelId }));
const chatFactory = vi.fn((modelId: string) => ({ _type: 'mock_chat_model', modelId }));
const createOpenAIMock = vi.fn((opts: { apiKey: string; baseURL?: string }) =>
    Object.assign((modelId: string) => chatFactory(modelId), { responses: responsesFactory, _opts: opts }),
);
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ _type: 'mock_google_model', modelId })) }));

const {
    resolveProviderApiKey,
    isProviderConfigured,
    resolveProviderModelId,
    createProviderModel,
} = await import('../services/ai/providerConfig');
const { DEFAULT_GATEWAY_MODEL, DEFAULT_GATEWAY_BASE_URL, DEFAULT_GATEWAY_API_KEY_PLACEHOLDER } = await import('../config/defaultGatewayConfig');

const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
    provider: 'default',
    geminiApiKey: '',
    openAIApiKey: '',
    simpleModel: 'irrelevant',
    complexModel: 'irrelevant',
    language: 'English',
    reportTemplate: 'management_review',
    autoConfirmGoal: true,
    runtimeAccessControl: {} as Settings['runtimeAccessControl'],
    ...overrides,
});

describe('default gateway provider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('is also the provider selected by the browser bootstrap config', () => {
        const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        expect(indexHtml).toMatch(/defaultSettings:\s*{[\s\S]*?provider:\s*'default'/);
        expect(indexHtml).toMatch(/defaultSettings:\s*{[\s\S]*?simpleModel:\s*'gpt-5\.4-mini'/);
        expect(indexHtml).toMatch(/defaultSettings:\s*{[\s\S]*?complexModel:\s*'gpt-5\.4-mini'/);
    });

    it('is always configured — no user-supplied key required', () => {
        expect(isProviderConfigured(makeSettings())).toBe(true);
    });

    it('uses a non-secret placeholder key regardless of stored user keys', () => {
        const settings = makeSettings({ geminiApiKey: 'unrelated', openAIApiKey: 'unrelated' });
        expect(resolveProviderApiKey(settings)).toBe(DEFAULT_GATEWAY_API_KEY_PLACEHOLDER);
        expect(DEFAULT_GATEWAY_API_KEY_PLACEHOLDER).not.toMatch(/^(gw_|sk-|dmo_)/);
    });

    it('forces the model to the fixed gateway model, ignoring stored/override model IDs', () => {
        const settings = makeSettings({ complexModel: 'some-other-model' });
        expect(resolveProviderModelId(settings, 'yet-another-model')).toBe(DEFAULT_GATEWAY_MODEL);
    });

    it('creates a Responses-API model pointed at the gateway base URL', () => {
        createProviderModel(makeSettings());
        expect(createOpenAIMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: DEFAULT_GATEWAY_BASE_URL,
                apiKey: DEFAULT_GATEWAY_API_KEY_PLACEHOLDER,
                fetch: expect.any(Function),
            }),
        );
        expect(responsesFactory).toHaveBeenCalledWith(DEFAULT_GATEWAY_MODEL);
    });

    it('guards data-bearing model calls with the centralized consent middleware', async () => {
        createProviderModel(makeSettings());
        const middleware = wrapLanguageModelMock.mock.calls.at(-1)?.[0].middleware as Array<{
            transformParams?: (input: { params: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        }>;

        await middleware[0]?.transformParams?.({ params: { prompt: 'dataset context' } });

        expect(ensureCloudAiConsentMock).toHaveBeenCalledWith('default');
    });

    it('bypasses dataset consent only for an explicit provider connection check', () => {
        createProviderModel(makeSettings(), undefined, { requireDataConsent: false });
        const middleware = wrapLanguageModelMock.mock.calls.at(-1)?.[0].middleware;

        // Connection checks skip only consent; diagnostics, response
        // normalization, and reasoning preferences remain active.
        expect(middleware).toHaveLength(3);
        expect(ensureCloudAiConsentMock).not.toHaveBeenCalled();
    });
});
