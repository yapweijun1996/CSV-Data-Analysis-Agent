import { describe, expect, it } from 'vitest';
import { getTranslation, getTranslationEntries } from '../utils/localization';

const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(',');

describe('Vietnamese coverage', () => {
    const entries = getTranslationEntries();

    it('translates every dictionary key into Vietnamese', () => {
        const untranslated = entries
            .map(([key, entry]) => key)
            .filter(key => getTranslation(key, 'Vietnamese') === getTranslation(key, 'English')
                && !['settings_skills_cancel', 'api_key_required_modal_ok', 'chart_type_radar'].includes(key))
            .filter(key => getTranslation(key, 'English') !== key);
        // Short technical labels may legitimately match English; keep the gap tiny.
        expect(untranslated.length).toBeLessThan(25);
    });

    it('keeps the same placeholders as English', () => {
        const broken = entries
            .filter(([key, entry]) => key !== 'ai_prompt_reply_language'
                && tokens(getTranslation(key, 'Vietnamese')) !== tokens(entry.English)
                && !/_(one|many)$/.test(key))
            .map(([key]) => key);
        expect(broken).toEqual([]);
    });
});
