/**
 * Transient retry layer for AI model calls.
 *
 * Vercel AI SDK handles network-level retries (DNS/TCP) via its built-in
 * maxRetries (default 2). This module handles HTTP-level transient errors
 * (429/503/500/502) which the SDK does NOT retry.
 *
 * Composes inside runWithOverflowCompaction: overflow wrapper changes the
 * input (compacted context), transient wrapper changes the model (fallback).
 */

import type { LanguageModel } from 'ai';
import type { Settings } from '../../types';
import { createFallbackProviderModel } from './providerConfig';
import { isRuntimeAbortError } from '../agent/runtime/runtimeAbort';

const LOG_PREFIX = '[TransientRetry]';

// --- Error classification ---

/** Patterns indicating a transient provider issue worth retrying. */
export const TRANSIENT_ERROR_PATTERNS = [
    'UNAVAILABLE',
    '503',
    'overloaded',
    'high demand',
    'rate limit',
    '429',
    'capacity',
    'temporarily unavailable',
    'server error',
    '500',
    '502',
];

/** Patterns indicating a permanent provider issue — never retry. */
const PERMANENT_ERROR_PATTERNS = [
    '401',
    '403',
    'invalid_api_key',
    'permission_denied',
    'authentication',
    'unauthorized',
    'forbidden',
];

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

export const isTransientProviderError = (error: unknown): boolean => {
    const lower = getErrorMessage(error).toLowerCase();
    return TRANSIENT_ERROR_PATTERNS.some(p => lower.includes(p.toLowerCase()));
};

export const isPermanentProviderError = (error: unknown): boolean => {
    const lower = getErrorMessage(error).toLowerCase();
    return PERMANENT_ERROR_PATTERNS.some(p => lower.includes(p.toLowerCase()));
};

// --- Retry types ---

export interface TransientRetryOptions {
    /** Settings for resolving the fallback model. */
    settings: Settings;
    /** Primary model ID (used to resolve a different fallback). */
    primaryModelId?: string;
    /** Label for logging/telemetry (e.g., 'planGenerator'). */
    label?: string;
    /** AbortSignal to respect cancellation. */
    abortSignal?: AbortSignal;
    /** Max same-model retries before trying fallback. Default: 1. */
    maxSameModelRetries?: number;
    /** Base delay in ms for exponential backoff. Default: 500. */
    baseDelayMs?: number;
    /** Max delay cap in ms. Default: 8000. */
    maxDelayMs?: number;
    /** Callback on each retry for telemetry. */
    onRetry?: (info: TransientRetryInfo) => void;
    /**
     * Optional predicate to override default error classification.
     * Return `true` to force retry, `false` to force throw, `undefined` to use default patterns.
     */
    shouldRetry?: (error: unknown, attempt: number) => boolean | undefined;
    /** Max retries for fallback model (independent of same-model retries). Default: 0 (single try). */
    maxFallbackRetries?: number;
}

export interface TransientRetryInfo {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
    label?: string;
    strategy: 'same_model' | 'fallback_model';
}

// --- Core ---

/**
 * Extract Retry-After duration from error response headers.
 * Returns milliseconds if found, -1 otherwise.
 */
export const parseRetryAfterMs = (error: unknown): number => {
    const resp = (error as { response?: { headers?: Record<string, unknown> } })?.response;
    const raw = resp?.headers?.['retry-after'];
    if (typeof raw === 'string') {
        const seconds = parseInt(raw, 10);
        if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
    }
    if (typeof raw === 'number' && raw > 0) return raw * 1000;
    return -1;
};

/** Jittered exponential backoff: base * 2^attempt * (1 + random * 0.2). */
const computeDelay = (attempt: number, baseMs: number, maxMs: number): number => {
    const exponential = baseMs * Math.pow(2, attempt);
    const jittered = exponential * (1 + Math.random() * 0.2);
    return Math.min(jittered, maxMs);
};

/** Sleep that respects an AbortSignal. */
const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal!.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });

/**
 * Wrap an AI call with transient retry + fallback model support.
 *
 * @param execute - The AI call. Receives an optional fallback LanguageModel;
 *   when undefined, the caller should use its primary model.
 * @param options - Retry configuration.
 * @returns The result from whichever attempt succeeded.
 */
export async function withTransientRetry<T>(
    execute: (fallbackModel?: LanguageModel) => Promise<T>,
    options: TransientRetryOptions,
): Promise<T> {
    const {
        settings,
        primaryModelId,
        label,
        abortSignal,
        maxSameModelRetries = 1,
        baseDelayMs = 500,
        maxDelayMs = 8000,
        onRetry,
        shouldRetry,
        maxFallbackRetries = 0,
    } = options;

    const tag = label ? `${LOG_PREFIX} ${label}` : LOG_PREFIX;
    let firstError: unknown = null;
    const callStartMs = performance.now();

    // Phase 1: primary model attempts (1 initial + maxSameModelRetries retries)
    for (let attempt = 0; attempt <= maxSameModelRetries; attempt++) {
        try {
            const result = await execute(undefined);
            const durationMs = Math.round(performance.now() - callStartMs);
            console.log(`[Perf:AI] ${label ?? 'unknown'} | model=${primaryModelId} | ${durationMs}ms | attempt=${attempt + 1}`);
            return result;
        } catch (error) {
            if (isRuntimeAbortError(error, abortSignal)) throw error;
            if (isPermanentProviderError(error)) throw error;

            firstError ??= error;

            // shouldRetry predicate: true=retry, false=throw, undefined=default
            const customVerdict = shouldRetry?.(error, attempt);
            if (customVerdict === false) throw error;
            if (customVerdict !== true && !isTransientProviderError(error)) throw error;

            // Last same-model attempt — break to fallback phase
            if (attempt >= maxSameModelRetries) break;

            // Prefer Retry-After header over exponential backoff
            const retryAfterMs = parseRetryAfterMs(error);
            const delayMs = retryAfterMs > 0
                ? Math.min(retryAfterMs, maxDelayMs)
                : computeDelay(attempt, baseDelayMs, maxDelayMs);
            const totalMaxAttempts = maxSameModelRetries + 1 + maxFallbackRetries + 1;

            console.warn(
                `${tag}: retry ${attempt + 1}/${totalMaxAttempts} (same_model) after ${getErrorMessage(error).slice(0, 80)}, delay ${Math.round(delayMs)}ms`,
            );
            onRetry?.({
                attempt: attempt + 1,
                maxAttempts: totalMaxAttempts,
                delayMs,
                error,
                label,
                strategy: 'same_model',
            });

            await abortableSleep(delayMs, abortSignal);
        }
    }

    // Phase 2: fallback model attempts (1 initial + maxFallbackRetries retries)
    const fallback = createFallbackProviderModel(settings, primaryModelId);
    if (fallback) {
        const totalMaxAttempts = maxSameModelRetries + 1 + maxFallbackRetries + 1;

        for (let fbAttempt = 0; fbAttempt <= maxFallbackRetries; fbAttempt++) {
            const attemptNumber = maxSameModelRetries + 1 + fbAttempt + 1;

            if (fbAttempt > 0) {
                const fbDelayMs = computeDelay(fbAttempt - 1, baseDelayMs, maxDelayMs);
                console.warn(`${tag}: fallback retry ${fbAttempt}/${maxFallbackRetries} after transient error, delay ${Math.round(fbDelayMs)}ms`);
                await abortableSleep(fbDelayMs, abortSignal);
            }

            console.warn(`${tag}: retry ${attemptNumber}/${totalMaxAttempts} (fallback_model: ${fallback.modelId})`);
            onRetry?.({
                attempt: attemptNumber,
                maxAttempts: totalMaxAttempts,
                delayMs: 0,
                error: firstError,
                label,
                strategy: 'fallback_model',
            });

            try {
                return await execute(fallback.model as LanguageModel);
            } catch (fallbackError) {
                if (isRuntimeAbortError(fallbackError, abortSignal)) throw fallbackError;
                if (isPermanentProviderError(fallbackError)) break;
                if (!isTransientProviderError(fallbackError)) break;
                console.error(`${tag}: fallback model "${fallback.modelId}" attempt ${fbAttempt + 1} failed:`, fallbackError);
            }
        }
    }

    throw firstError;
}
