import type { Settings } from '../../types';
import type { CompactionMode } from './contextManager';
import { isRuntimeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';

const OPENAI_OVERFLOW_PATTERNS = [
    'context_length_exceeded',
    'maximum context length',
    'prompt too long',
    'too many tokens',
];

const GOOGLE_OVERFLOW_PATTERNS = [
    'token count',
    'input token limit',
    'request too large',
    'context window',
];

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message.toLowerCase();
    }
    if (typeof error === 'string') {
        return error.toLowerCase();
    }
    return String(error).toLowerCase();
};

export const isContextOverflowError = (
    provider: Settings['provider'],
    error: unknown,
): boolean => {
    const message = getErrorMessage(error);
    const patterns = provider === 'openai'
        ? OPENAI_OVERFLOW_PATTERNS
        : GOOGLE_OVERFLOW_PATTERNS;

    return patterns.some(pattern => message.includes(pattern));
};

export const runWithOverflowCompaction = async <T>({
    provider,
    execute,
    abortSignal,
}: {
    provider: Settings['provider'];
    execute: (mode: CompactionMode) => Promise<T>;
    abortSignal?: AbortSignal;
}): Promise<T> => {
    throwIfAborted(abortSignal);

    try {
        return await execute('normal');
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        if (!isContextOverflowError(provider, error)) {
            throw error;
        }
        throwIfAborted(abortSignal);
        return execute('overflow_retry');
    }
};
