/**
 * Tests for utils/userErrorMessage.ts
 *
 * Verifies that formatUserError() and extractTechnicalDetail() meet the
 * Anti-Survivorship Resilience requirements:
 *  1. All messages have Mandarin text when language='Mandarin'
 *  2. Every surface returns non-empty message + suggestion + suggestion
 *  3. technicalDetail is always populated (never falsy)
 *  4. fullText is message + ' ' + suggestion
 *  5. Various error types are handled gracefully
 */

import { describe, expect, it } from 'vitest';
import {
    formatUserError,
    extractTechnicalDetail,
    type ErrorSurface,
} from '../utils/userErrorMessage';

// ---------------------------------------------------------------------------
// extractTechnicalDetail
// ---------------------------------------------------------------------------

describe('extractTechnicalDetail', () => {
    it('formats Error instances as "Name: message"', () => {
        const err = new Error('something went wrong');
        expect(extractTechnicalDetail(err)).toBe('Error: something went wrong');
    });

    it('includes custom Error subclass name', () => {
        class MyError extends Error { constructor(msg: string) { super(msg); this.name = 'MyError'; } }
        expect(extractTechnicalDetail(new MyError('oops'))).toBe('MyError: oops');
    });

    it('returns non-empty string for a string reason', () => {
        expect(extractTechnicalDetail('plain rejection')).toBe('plain rejection');
    });

    it('returns "Unknown error" for null', () => {
        expect(extractTechnicalDetail(null)).toBe('Unknown error');
    });

    it('returns "Unknown error" for undefined', () => {
        expect(extractTechnicalDetail(undefined)).toBe('Unknown error');
    });

    it('returns "Unknown error" for empty string', () => {
        expect(extractTechnicalDetail('')).toBe('Unknown error');
    });

    it('converts plain objects to string representation', () => {
        const detail = extractTechnicalDetail({ code: 42 });
        expect(typeof detail).toBe('string');
        expect(detail.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// formatUserError — structure guarantees
// ---------------------------------------------------------------------------

const ALL_SURFACES: ErrorSurface[] = ['chat', 'analysis', 'file_upload', 'report', 'general'];

describe('formatUserError — structure guarantees', () => {
    it('returns all required fields', () => {
        const result = formatUserError(new Error('boom'));
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('suggestion');
        expect(result).toHaveProperty('technicalDetail');
        expect(result).toHaveProperty('fullText');
    });

    it('fullText is message + " " + suggestion', () => {
        const result = formatUserError(new Error('boom'));
        expect(result.fullText).toBe(`${result.message} ${result.suggestion}`);
    });

    it('technicalDetail is always non-empty', () => {
        expect(extractTechnicalDetail(new Error('boom')).length).toBeGreaterThan(0);
        expect(extractTechnicalDetail(null).length).toBeGreaterThan(0);
        expect(extractTechnicalDetail(undefined).length).toBeGreaterThan(0);
    });

    it.each(ALL_SURFACES)('surface "%s" returns non-empty message and suggestion', (surface) => {
        const result = formatUserError(new Error('x'), { surface });
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.suggestion.length).toBeGreaterThan(0);
    });

    it('defaults to general surface when no surface is provided', () => {
        const withGeneral = formatUserError(new Error('x'), { surface: 'general' });
        const withDefault = formatUserError(new Error('x'));
        expect(withDefault.message).toBe(withGeneral.message);
        expect(withDefault.suggestion).toBe(withGeneral.suggestion);
    });
});

// ---------------------------------------------------------------------------
// formatUserError — Mandarin output
// ---------------------------------------------------------------------------

describe('formatUserError — Mandarin output', () => {
    it.each(ALL_SURFACES)('surface "%s" returns Chinese characters in Mandarin', (surface) => {
        const result = formatUserError(new Error('err'), { surface, language: 'Mandarin' });
        // Both message and suggestion should contain at least one Chinese character
        expect(/[\u4e00-\u9fff]/.test(result.message)).toBe(true);
        expect(/[\u4e00-\u9fff]/.test(result.suggestion)).toBe(true);
    });

    it('chat surface Mandarin message mentions retrying', () => {
        const result = formatUserError(new Error('err'), { surface: 'chat', language: 'Mandarin' });
        // Should suggest retrying or rephrasing (再试 or 提问)
        expect(result.suggestion.includes('再试') || result.suggestion.includes('提问')).toBe(true);
    });

    it('general surface Mandarin suggestion mentions data safety', () => {
        const result = formatUserError(new Error('err'), { surface: 'general', language: 'Mandarin' });
        expect(result.suggestion.includes('安全') || result.suggestion.includes('数据')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// formatUserError — English fallback
// ---------------------------------------------------------------------------

describe('formatUserError — English fallback', () => {
    it('falls back to English when an unknown language is supplied', () => {
        const result = formatUserError(new Error('err'), { surface: 'chat', language: 'Klingon' });
        // Should still return non-empty text
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.suggestion.length).toBeGreaterThan(0);
    });

    it('chat surface English message mentions request processing', () => {
        const result = formatUserError(new Error('err'), { surface: 'chat', language: 'English' });
        expect(result.message.toLowerCase()).toMatch(/error|unexpected/i);
    });
});
