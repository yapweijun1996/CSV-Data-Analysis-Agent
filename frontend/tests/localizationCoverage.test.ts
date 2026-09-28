import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTranslationEntries } from '../utils/localization';

type PlaceholderGap = { key: string; language: string; token: string };
type Baseline = { Japanese: string[]; Malay: string[]; placeholderGaps: PlaceholderGap[] };
type MissingLanguage = 'Japanese' | 'Malay';

const entries = getTranslationEntries();
const baselinePath = path.resolve('tests/fixtures/localization-coverage-baseline.json');
const reportPath = path.resolve('docs/localization-coverage.md');
const isMissing = (value: string | undefined): boolean => !value?.trim();
const missingKeys = (language: MissingLanguage): string[] => entries
    .filter(([, translation]) => isMissing(translation[language]))
    .map(([key]) => key)
    .sort();
const placeholderGaps = (): PlaceholderGap[] => {
    const gaps: PlaceholderGap[] = [];
    for (const [key, translation] of entries) {
        const tokens = new Set([...translation.English.matchAll(/\{(\w+)\}/g)].map(match => match[1]));
        if (tokens.size === 0) continue;
        for (const [language, value] of Object.entries(translation)) {
            if (language === 'English' || isMissing(value)) continue;
            const translatedTokens = new Set([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]));
            for (const token of tokens) {
                if (!translatedTokens.has(token)) gaps.push({ key, language, token });
            }
        }
    }
    return gaps.sort((left, right) =>
        left.key.localeCompare(right.key)
        || left.language.localeCompare(right.language)
        || left.token.localeCompare(right.token));
};

const toMarkdownCell = (value: string): string => value
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');

if (process.env.UPDATE_LOCALIZATION_BASELINE === '1') {
    const baseline: Baseline = {
        Japanese: missingKeys('Japanese'),
        Malay: missingKeys('Malay'),
        placeholderGaps: placeholderGaps(),
    };
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

    const missingByArea = new Map<string, Array<{ key: string; english: string; languages: string[] }>>();
    for (const [key, translation] of entries) {
        const languages = (['English', 'Mandarin', 'Japanese', 'Malay'] as const)
            .filter(language => isMissing(translation[language]));
        if (languages.length === 0) continue;
        const area = key.split('_')[0];
        const rows = missingByArea.get(area) ?? [];
        rows.push({ key, english: translation.English, languages: [...languages] });
        missingByArea.set(area, rows);
    }

    const lines = [
        '# Localization coverage gaps',
        '',
        'Generated from `utils/localization.ts` by `UPDATE_LOCALIZATION_BASELINE=1 npx vitest run --environment jsdom tests/localizationCoverage.test.ts`.',
        'UI areas use the first underscore-delimited key prefix. Empty or whitespace-only values count as missing.',
        '',
        `Total keys: ${entries.length}. Missing entries: English ${entries.filter(([, value]) => isMissing(value.English)).length}, Mandarin ${entries.filter(([, value]) => isMissing(value.Mandarin)).length}, Japanese ${baseline.Japanese.length}, Malay ${baseline.Malay.length}.`,
        '',
    ];
    for (const [area, rows] of [...missingByArea].sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`## ${area} (${rows.length} keys)`, '', '| Key | English text | Missing languages |', '| --- | --- | --- |');
        for (const { key, english, languages } of rows.sort((left, right) => left.key.localeCompare(right.key))) {
            lines.push(`| ${toMarkdownCell(key)} | ${toMarkdownCell(english)} | ${languages.join(', ')} |`);
        }
        lines.push('');
    }
    lines.push('## Existing placeholder gaps', '');
    if (baseline.placeholderGaps.length === 0) {
        lines.push('None.');
    } else {
        lines.push('| Key | Language | Missing English token |', '| --- | --- | --- |');
        for (const { key, language, token } of baseline.placeholderGaps) {
            lines.push(`| ${toMarkdownCell(key)} | ${toMarkdownCell(language)} | \`{${token}}\` |`);
        }
    }
    lines.push('');
    writeFileSync(reportPath, `${lines.join('\n').trimEnd()}\n`);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;

describe('localization coverage', () => {
    it('has non-empty English and Mandarin for every key', () => {
        const gaps = entries.flatMap(([key, translation]) =>
            (['English', 'Mandarin'] as const)
                .filter(language => isMissing(translation[language]))
                .map(language => `${key}: ${language}`));
        expect(gaps).toEqual([]);
    });

    for (const language of ['Japanese', 'Malay'] as const) {
        it(`matches the existing ${language} missing-key baseline`, () => {
            const actual = new Set(missingKeys(language));
            const expected = new Set(baseline[language]);
            expect([...actual].filter(key => !expected.has(key)).sort(), `${language} newly missing`).toEqual([]);
            expect([...expected].filter(key => !actual.has(key)).sort(), `${language} now translated; shrink the baseline`).toEqual([]);
            expect(baseline[language].length, `${language} baseline has duplicate keys`).toBe(expected.size);
        });
    }

    it('allows only the existing English placeholder gaps', () => {
        const actual = new Set(placeholderGaps().map(gap => JSON.stringify(gap)));
        const expected = new Set(baseline.placeholderGaps.map(gap => JSON.stringify(gap)));
        expect([...actual].filter(gap => !expected.has(gap)).sort(), 'new placeholder gaps').toEqual([]);
        expect([...expected].filter(gap => !actual.has(gap)).sort(), 'resolved placeholder gaps; shrink the baseline').toEqual([]);
        expect(baseline.placeholderGaps.length, 'placeholder baseline has duplicate gaps').toBe(expected.size);
    });
});
