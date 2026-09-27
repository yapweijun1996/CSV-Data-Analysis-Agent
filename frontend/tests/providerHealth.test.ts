import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Settings } from '../types';

// --- Mock generateText ---
const mockGenerateText = vi.fn();
vi.mock('ai', () => ({
    generateText: (...args: unknown[]) => mockGenerateText(...args),
    streamText: vi.fn(() => ({
        fullStream: (async function* () {})(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        output: Promise.resolve(undefined),
    })),
    wrapLanguageModel: vi.fn((opts: { model: unknown }) => opts.model),
    extractJsonMiddleware: vi.fn(() => ({})),
}));

// --- Mock createProviderModel ---
const mockModel = { _type: 'mock_model' };
vi.mock('../services/ai/providerConfig', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/ai/providerConfig')>();
    return {
        ...actual,
        createProviderModel: () => ({ modelId: 'test-model', model: mockModel }),
    };
});

// Re-import after mocks are set up
const {
    validateProviderHealth,
    invalidateProviderHealthCache,
    isProviderConfigured,
} = await import('../services/ai/providerConfig');

// --- Helper ---
const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
    provider: 'google',
    geminiApiKey: 'test-key-123',
    openAIApiKey: '',
    complexModel: 'gemini-2.5-pro',
    simpleModel: 'gemini-2.5-flash',
    fallbackModel: 'gemini-2.5-flash',
    language: 'English',
    reportTemplate: 'management_review',
    autoConfirmGoal: false,
    runtimeAccessControl: { permissionMode: 'open', toolOverrides: {} },
    ...overrides,
} as Settings);

describe('validateProviderHealth', () => {
    beforeEach(() => {
        invalidateProviderHealthCache();
        mockGenerateText.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns not_configured when API key is empty', async () => {
        const settings = makeSettings({ geminiApiKey: '' });
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('not_configured');
        expect(result.checkedAt).toBeTruthy();
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('returns not_configured when API key is whitespace only', async () => {
        const settings = makeSettings({ geminiApiKey: '   ' });
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('not_configured');
        expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('returns healthy on successful API response', async () => {
        mockGenerateText.mockResolvedValueOnce({ text: 'OK' });
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('healthy');
        expect(result.testedModel).toBe('gemini-2.5-flash');
        expect(mockGenerateText).toHaveBeenCalledOnce();
    });

    it('returns invalid_key on 401 error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('401 Unauthorized'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('invalid_key');
        expect(result.errorDetail).toContain('401');
    });

    it('returns invalid_key on 403 Forbidden error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('403 Forbidden'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('invalid_key');
    });

    it('returns invalid_key on invalid_api_key error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('invalid_api_key: key not found'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('invalid_key');
    });

    it('returns invalid_key on permission_denied error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('permission_denied'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('invalid_key');
    });

    it('returns unreachable on network error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('fetch failed'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('unreachable');
        expect(result.errorDetail).toContain('fetch failed');
    });

    it('returns unreachable on 503 error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('503 Service Unavailable'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('unreachable');
    });

    it('returns unreachable on timeout error', async () => {
        mockGenerateText.mockRejectedValueOnce(new Error('Request timed out'));
        const settings = makeSettings();
        const result = await validateProviderHealth(settings);

        expect(result.status).toBe('unreachable');
    });

    // --- Cache behavior ---

    it('returns cached result within TTL (no second API call)', async () => {
        mockGenerateText.mockResolvedValue({ text: 'OK' });
        const settings = makeSettings();

        const first = await validateProviderHealth(settings);
        const second = await validateProviderHealth(settings);

        expect(first.status).toBe('healthy');
        expect(second.status).toBe('healthy');
        expect(first.checkedAt).toBe(second.checkedAt);
        expect(mockGenerateText).toHaveBeenCalledOnce();
    });

    it('invalidateProviderHealthCache forces re-check', async () => {
        mockGenerateText.mockResolvedValue({ text: 'OK' });
        const settings = makeSettings();

        await validateProviderHealth(settings);
        expect(mockGenerateText).toHaveBeenCalledOnce();

        invalidateProviderHealthCache();

        await validateProviderHealth(settings);
        expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });

    it('failure cache expires faster than healthy cache', async () => {
        // First call fails
        mockGenerateText.mockRejectedValueOnce(new Error('fetch failed'));
        const settings = makeSettings();

        const failResult = await validateProviderHealth(settings);
        expect(failResult.status).toBe('unreachable');

        // Advance time past failure TTL (30s) but within healthy TTL (5min)
        const originalCheckedAt = failResult.checkedAt;
        vi.useFakeTimers();
        vi.setSystemTime(new Date(new Date(originalCheckedAt).getTime() + 31_000));

        // Second call should re-check because failure TTL expired
        mockGenerateText.mockResolvedValueOnce({ text: 'OK' });
        const healthyResult = await validateProviderHealth(settings);
        expect(healthyResult.status).toBe('healthy');
        expect(mockGenerateText).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });

    it('healthy cache survives within 5-minute TTL', async () => {
        vi.useFakeTimers();
        const startTime = new Date('2026-03-26T10:00:00Z');
        vi.setSystemTime(startTime);

        mockGenerateText.mockResolvedValue({ text: 'OK' });
        const settings = makeSettings();

        await validateProviderHealth(settings);
        expect(mockGenerateText).toHaveBeenCalledOnce();

        // Advance 4 minutes — still within TTL
        vi.setSystemTime(new Date(startTime.getTime() + 4 * 60 * 1000));
        await validateProviderHealth(settings);
        expect(mockGenerateText).toHaveBeenCalledOnce(); // still cached

        // Advance past 5 minutes
        vi.setSystemTime(new Date(startTime.getTime() + 5 * 60 * 1000 + 1));
        await validateProviderHealth(settings);
        expect(mockGenerateText).toHaveBeenCalledTimes(2); // re-checked

        vi.useRealTimers();
    });

    // --- not_configured bypasses cache ---

    it('not_configured result is not cached (always re-checks config)', async () => {
        const emptyKeySettings = makeSettings({ geminiApiKey: '' });
        const validKeySettings = makeSettings({ geminiApiKey: 'valid-key' });

        // First: no key
        const r1 = await validateProviderHealth(emptyKeySettings);
        expect(r1.status).toBe('not_configured');

        // Second: with key — should not be blocked by stale not_configured cache
        mockGenerateText.mockResolvedValueOnce({ text: 'OK' });
        const r2 = await validateProviderHealth(validKeySettings);
        expect(r2.status).toBe('healthy');
    });
});

describe('isProviderConfigured', () => {
    it('returns true when key is present', () => {
        expect(isProviderConfigured(makeSettings())).toBe(true);
    });

    it('returns false when key is empty', () => {
        expect(isProviderConfigured(makeSettings({ geminiApiKey: '' }))).toBe(false);
    });

    it('returns false when key is whitespace', () => {
        expect(isProviderConfigured(makeSettings({ geminiApiKey: '   ' }))).toBe(false);
    });
});
