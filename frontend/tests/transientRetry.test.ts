import { describe, it, expect, vi } from 'vitest';
import {
    isTransientProviderError,
    isPermanentProviderError,
    withTransientRetry,
    parseRetryAfterMs,
    type TransientRetryInfo,
} from '../services/ai/transientRetry';

// --- Mock settings for fallback resolution ---
const makeSettings = (overrides: Record<string, unknown> = {}) => ({
    provider: 'google' as const,
    geminiApiKey: 'test-key',
    openAIApiKey: '',
    complexModel: 'gemini-2.5-pro',
    simpleModel: 'gemini-2.5-flash',
    fallbackModel: 'gemini-2.5-flash',
    language: 'en',
    reportTemplate: 'management_review' as const,
    autoConfirmGoal: false,
    runtimeAccessControl: { permissionMode: 'open' as const, toolOverrides: {} },
    ...overrides,
}) as unknown as import('../types').Settings;

// --- Mock providerConfig ---
vi.mock('../services/ai/providerConfig', () => ({
    createFallbackProviderModel: (settings: { fallbackModel?: string; complexModel?: string }) => {
        const fallback = settings.fallbackModel;
        const primary = settings.complexModel;
        if (!fallback || fallback === primary) return null;
        return { modelId: fallback, model: { _type: 'fallback_model' } };
    },
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

// --- Helpers ---
const transientError = (code: string) => new Error(`API error ${code}: Service Unavailable`);
const permanentError = (code: string) => new Error(`API error ${code}: Unauthorized`);
const abortError = () => {
    const err = new Error('Cancelled');
    err.name = 'AbortError';
    return err;
};

describe('isTransientProviderError', () => {
    it('detects 503, 429, 500, 502, rate limit, overloaded', () => {
        expect(isTransientProviderError(new Error('503 Service Unavailable'))).toBe(true);
        expect(isTransientProviderError(new Error('429 Too Many Requests'))).toBe(true);
        expect(isTransientProviderError(new Error('500 Internal Server Error'))).toBe(true);
        expect(isTransientProviderError(new Error('502 Bad Gateway'))).toBe(true);
        expect(isTransientProviderError(new Error('Rate limit exceeded'))).toBe(true);
        expect(isTransientProviderError(new Error('Model is overloaded'))).toBe(true);
        expect(isTransientProviderError(new Error('UNAVAILABLE'))).toBe(true);
    });

    it('does not match non-transient errors', () => {
        expect(isTransientProviderError(new Error('Invalid JSON response'))).toBe(false);
        expect(isTransientProviderError(new Error('context_length_exceeded'))).toBe(false);
    });
});

describe('isPermanentProviderError', () => {
    it('detects 401, 403, invalid_api_key', () => {
        expect(isPermanentProviderError(new Error('401 Unauthorized'))).toBe(true);
        expect(isPermanentProviderError(new Error('403 Forbidden'))).toBe(true);
        expect(isPermanentProviderError(new Error('invalid_api_key'))).toBe(true);
        expect(isPermanentProviderError(new Error('permission_denied'))).toBe(true);
        expect(isPermanentProviderError(new Error('Authentication failed'))).toBe(true);
    });

    it('does not match transient errors', () => {
        expect(isPermanentProviderError(new Error('503 Service Unavailable'))).toBe(false);
        expect(isPermanentProviderError(new Error('Rate limit exceeded'))).toBe(false);
    });
});

describe('withTransientRetry', () => {
    const baseOptions = {
        settings: makeSettings(),
        primaryModelId: 'gemini-2.5-pro',
        label: 'test',
        maxSameModelRetries: 1,
        baseDelayMs: 1, // fast tests
        maxDelayMs: 5,
    };

    it('returns result on first-attempt success', async () => {
        const execute = vi.fn().mockResolvedValue('ok');
        const result = await withTransientRetry(execute, baseOptions);
        expect(result).toBe('ok');
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith(undefined); // no fallback model
    });

    it('retries same model on transient error then succeeds', async () => {
        const execute = vi.fn()
            .mockRejectedValueOnce(transientError('503'))
            .mockResolvedValue('recovered');

        const result = await withTransientRetry(execute, baseOptions);
        expect(result).toBe('recovered');
        expect(execute).toHaveBeenCalledTimes(2);
        // Both calls should be with undefined (same model)
        expect(execute).toHaveBeenNthCalledWith(1, undefined);
        expect(execute).toHaveBeenNthCalledWith(2, undefined);
    });

    it('falls back to different model when same-model retries exhausted', async () => {
        const execute = vi.fn()
            .mockRejectedValueOnce(transientError('503'))
            .mockRejectedValueOnce(transientError('503'))
            .mockResolvedValue('fallback-ok');

        const result = await withTransientRetry(execute, baseOptions);
        expect(result).toBe('fallback-ok');
        expect(execute).toHaveBeenCalledTimes(3);
        // Third call should receive the fallback model
        expect(execute.mock.calls[2][0]).toEqual({ _type: 'fallback_model' });
    });

    it('throws immediately on permanent error (401) — no retry', async () => {
        const execute = vi.fn().mockRejectedValue(permanentError('401'));
        await expect(withTransientRetry(execute, baseOptions)).rejects.toThrow('401');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('throws immediately on abort signal', async () => {
        const execute = vi.fn().mockRejectedValue(abortError());
        await expect(withTransientRetry(execute, baseOptions)).rejects.toThrow('Cancelled');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry with correct info on each retry', async () => {
        const retryInfos: TransientRetryInfo[] = [];
        const execute = vi.fn()
            .mockRejectedValueOnce(transientError('503'))
            .mockRejectedValueOnce(transientError('503'))
            .mockResolvedValue('ok');

        await withTransientRetry(execute, {
            ...baseOptions,
            onRetry: (info) => retryInfos.push(info),
        });

        expect(retryInfos).toHaveLength(2);
        expect(retryInfos[0].strategy).toBe('same_model');
        expect(retryInfos[0].attempt).toBe(1);
        expect(retryInfos[1].strategy).toBe('fallback_model');
    });

    it('throws original error when all attempts fail', async () => {
        const originalErr = transientError('503');
        const execute = vi.fn().mockRejectedValue(originalErr);

        await expect(withTransientRetry(execute, baseOptions)).rejects.toBe(originalErr);
        // 1 initial + 1 same-model retry + 1 fallback = 3
        expect(execute).toHaveBeenCalledTimes(3);
    });

    it('skips fallback when no fallback model available', async () => {
        const execute = vi.fn().mockRejectedValue(transientError('503'));

        // fallbackModel === complexModel → no fallback available
        const noFallbackOptions = {
            ...baseOptions,
            settings: makeSettings({ fallbackModel: 'gemini-2.5-pro' }),
        };

        await expect(withTransientRetry(execute, noFallbackOptions)).rejects.toThrow('503');
        // 1 initial + 1 same-model retry, no fallback attempt
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it('throws non-transient errors immediately without retry', async () => {
        const execute = vi.fn().mockRejectedValue(new Error('JSON parse failed'));
        await expect(withTransientRetry(execute, baseOptions)).rejects.toThrow('JSON parse failed');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('handles string errors in classification', () => {
        expect(isTransientProviderError('503 unavailable')).toBe(true);
        expect(isPermanentProviderError('401 unauthorized')).toBe(true);
    });

    // --- INFRA-101: Retry-After header ---

    it('uses Retry-After header delay instead of exponential backoff', async () => {
        const errorWithRetryAfter = Object.assign(
            transientError('429'),
            { response: { headers: { 'retry-after': '2' } } },
        );
        const retryInfos: TransientRetryInfo[] = [];
        const execute = vi.fn()
            .mockRejectedValueOnce(errorWithRetryAfter)
            .mockResolvedValue('ok');

        await withTransientRetry(execute, {
            ...baseOptions,
            onRetry: (info) => retryInfos.push(info),
        });

        expect(retryInfos).toHaveLength(1);
        // Retry-After: 2 seconds = 2000ms, capped at maxDelayMs (5ms in test)
        expect(retryInfos[0].delayMs).toBe(5); // min(2000, maxDelayMs=5) = 5
    });

    // --- INFRA-101: shouldRetry predicate ---

    it('shouldRetry=false throws immediately even for transient errors', async () => {
        const execute = vi.fn().mockRejectedValue(transientError('503'));

        await expect(withTransientRetry(execute, {
            ...baseOptions,
            shouldRetry: () => false,
        })).rejects.toThrow('503');

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('shouldRetry=true retries even for non-transient errors', async () => {
        const execute = vi.fn()
            .mockRejectedValueOnce(new Error('custom_provider_error'))
            .mockResolvedValue('recovered');

        const result = await withTransientRetry(execute, {
            ...baseOptions,
            shouldRetry: () => true,
        });

        expect(result).toBe('recovered');
        expect(execute).toHaveBeenCalledTimes(2);
    });

    // --- INFRA-101: Fallback model retry ---

    it('retries fallback model on transient error with maxFallbackRetries', async () => {
        const execute = vi.fn()
            .mockRejectedValueOnce(transientError('503'))  // primary attempt
            .mockRejectedValueOnce(transientError('503'))  // primary retry
            .mockRejectedValueOnce(transientError('503'))  // fallback attempt 1
            .mockResolvedValue('fallback-retry-ok');        // fallback attempt 2

        const result = await withTransientRetry(execute, {
            ...baseOptions,
            maxFallbackRetries: 1,
        });

        expect(result).toBe('fallback-retry-ok');
        expect(execute).toHaveBeenCalledTimes(4);
    });
});

describe('parseRetryAfterMs', () => {
    it('parses numeric string header', () => {
        const error = { response: { headers: { 'retry-after': '3' } } };
        expect(parseRetryAfterMs(error)).toBe(3000);
    });

    it('parses numeric header', () => {
        const error = { response: { headers: { 'retry-after': 5 } } };
        expect(parseRetryAfterMs(error)).toBe(5000);
    });

    it('returns -1 for missing header', () => {
        expect(parseRetryAfterMs(new Error('503'))).toBe(-1);
        expect(parseRetryAfterMs(null)).toBe(-1);
        expect(parseRetryAfterMs({})).toBe(-1);
    });
});
