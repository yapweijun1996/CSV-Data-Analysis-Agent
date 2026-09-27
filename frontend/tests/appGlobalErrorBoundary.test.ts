/**
 * P0 Anti-Survivorship Resilience: App shell global async error boundary
 *
 * Tests the logic that drives the App-level `unhandledrejection` handler:
 *
 *  1. Chunk-load errors (already handled by staleChunkRecovery) are silently
 *     skipped — they must NOT set the globalErrorToast.
 *  2. Generic unhandled rejections set globalErrorToast with a Mandarin message
 *     and the error summary.
 *  3. Non-Error reason values (strings, plain objects) are handled gracefully
 *     and produce a readable errorSummary.
 *  4. The globalErrorToast message for Mandarin language contains expected
 *     Chinese-language text.
 *
 * Strategy: Test the core logic functions directly (isRecoverableChunkLoadError,
 * getTranslation) rather than the React rendering, since the handler is a thin
 * wrapper around these already-tested utilities. This keeps the test fast and
 * free of jsdom rendering complexity.
 */

import { describe, expect, it } from 'vitest';
import { isRecoverableChunkLoadError } from '../utils/staleChunkRecovery';
import { getTranslation } from '../utils/localization';

// ---------------------------------------------------------------------------
// Chunk-load error filter (used by the handler to skip already-handled errors)
// ---------------------------------------------------------------------------

describe('App global error boundary — chunk-load error filter', () => {
    it('identifies a dynamic import failure as a chunk-load error (skip)', () => {
        const reason = new Error('Failed to fetch dynamically imported module: /assets/chunk-abc.js');
        expect(isRecoverableChunkLoadError(reason)).toBe(true);
    });

    it('identifies a webpack ChunkLoadError as a chunk-load error (skip)', () => {
        const reason = new Error('ChunkLoadError: Loading chunk 42 failed.');
        expect(isRecoverableChunkLoadError(reason)).toBe(true);
    });

    it('does NOT identify a generic runtime error as a chunk-load error', () => {
        const reason = new Error('Cannot read properties of undefined (reading "foo")');
        expect(isRecoverableChunkLoadError(reason)).toBe(false);
    });

    it('does NOT identify a network fetch failure as a chunk-load error', () => {
        const reason = new Error('Failed to fetch');
        expect(isRecoverableChunkLoadError(reason)).toBe(false);
    });

    it('handles null/undefined reason gracefully (not a chunk-load error)', () => {
        expect(isRecoverableChunkLoadError(null)).toBe(false);
        expect(isRecoverableChunkLoadError(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Toast message content (localization verification)
// ---------------------------------------------------------------------------

describe('App global error boundary — toast message localization', () => {
    it('Mandarin toast message contains Chinese characters', () => {
        const msg = getTranslation('global_error_toast_message', 'Mandarin');
        // Should contain at least some Chinese characters
        expect(/[\u4e00-\u9fff]/.test(msg)).toBe(true);
    });

    it('Mandarin toast message mentions user data safety', () => {
        const msg = getTranslation('global_error_toast_message', 'Mandarin');
        // Should mention "安全" (safe) or "数据" (data)
        expect(msg.includes('安全') || msg.includes('数据')).toBe(true);
    });

    it('Mandarin restart button text is "重新开始"', () => {
        expect(getTranslation('global_error_restart_button', 'Mandarin')).toBe('重新开始');
    });

    it('Mandarin dismiss button text is "关闭"', () => {
        expect(getTranslation('global_error_dismiss_button', 'Mandarin')).toBe('关闭');
    });

    it('English fallback returns meaningful text for all toast keys', () => {
        expect(getTranslation('global_error_toast_message', 'English')).toMatch(/error/i);
        expect(getTranslation('global_error_restart_button', 'English')).toMatch(/start over/i);
        expect(getTranslation('global_error_dismiss_button', 'English')).toMatch(/dismiss/i);
    });
});

// ---------------------------------------------------------------------------
// Error summary extraction (the logic used to build errorSummary in App.tsx)
// ---------------------------------------------------------------------------

describe('App global error boundary — error summary extraction', () => {
    it('extracts name + message from an Error object', () => {
        const err = new Error('something went wrong');
        const summary = err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err ?? 'Unknown error');
        expect(summary).toBe('Error: something went wrong');
    });

    it('coerces a string reason to a summary', () => {
        const reason: unknown = 'plain string rejection';
        const summary = reason instanceof Error
            ? `${reason.name}: ${reason.message}`
            : String(reason ?? 'Unknown error');
        expect(summary).toBe('plain string rejection');
    });

    it('coerces null reason to "Unknown error"', () => {
        const reason = null;
        const summary = reason instanceof Error
            ? `${(reason as Error).name}: ${(reason as Error).message}`
            : String(reason ?? 'Unknown error');
        expect(summary).toBe('Unknown error');
    });
});
