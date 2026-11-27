import { describe, expect, it } from 'vitest';
import { resolveProgressText } from '../utils/progressText';

describe('resolveProgressText', () => {
    const issues = ["Column 'A' has a high percentage of missing values (80%)."];
    it('rebuilds data-quality notes in the current language', () => {
        const message = { text: '1 column is mostly empty', localize: { kind: 'data_quality' as const, issues } };
        expect(resolveProgressText(message, 'Mandarin')).toContain('列');
        expect(resolveProgressText(message, 'Mandarin')).not.toContain('mostly empty');
    });
    it('keeps plain text unchanged', () => {
        expect(resolveProgressText({ text: 'Working' }, 'Mandarin')).toBe('Working');
        expect(resolveProgressText(null, 'Mandarin')).toBeNull();
    });
});
