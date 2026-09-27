import { describe, expect, it } from 'vitest';
import { normalizeAppLanguage, normalizeLocalizedText } from '../utils/localizedText';

describe('localizedText helpers', () => {
    it('normalizes supported languages and downgrades legacy languages to English', () => {
        expect(normalizeAppLanguage('English')).toBe('English');
        expect(normalizeAppLanguage('Mandarin')).toBe('Mandarin');
        expect(normalizeAppLanguage('Malay')).toBe('Malay');
        expect(normalizeAppLanguage('Japanese')).toBe('Japanese');
        expect(normalizeAppLanguage('Spanish')).toBe('English');
        expect(normalizeAppLanguage('French')).toBe('English');
    });

    it('migrates legacy bilingual summary strings into a single localized summary', () => {
        expect(normalizeLocalizedText('English summary\n---\n中文摘要', 'Mandarin')).toEqual({
            language: 'Mandarin',
            text: '中文摘要',
        });
        expect(normalizeLocalizedText('English summary\n---\n中文摘要', 'Japanese')).toEqual({
            language: 'English',
            text: 'English summary',
        });
    });
});
