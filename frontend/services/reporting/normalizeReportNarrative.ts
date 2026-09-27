const trimText = (value: unknown): string => String(value ?? '').trim();

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sentenceCase = (value: string): string => {
    if (!value) {
        return '';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
};

const removeMarkdownNoise = (value: string): string =>
    value
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*]\s+/gm, '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/\s+[*-]\s+/g, ' ');

const stripFieldNoise = (value: string): string =>
    value
        .replace(/\b([A-Z_]{3,})\b/g, token => token.replace(/_/g, ' ').toLowerCase())
        .replace(/\bSeries Key\b/gi, 'series key')
        .replace(/\bSource Column\b/gi, 'source column');

const CURRENCY_CODES = /\b(sgd|usd|eur|gbp|jpy|cny|myr|hkd|aud|cad|chf|nzd|krw|thb|idr|php|vnd|twd|inr)\b/gi;

const normalizeCurrencyAbbreviations = (value: string): string =>
    value.replace(CURRENCY_CODES, match => match.toUpperCase());

const normalizeNullLabels = (value: string): string =>
    value
        .replace(/\bnull\s+(project\s+)?categor(y|ies)\b/gi, 'unclassified category')
        .replace(/\bnull\s+group\b/gi, 'unclassified group')
        .replace(/\bnull\b(?=\s+(value|item|entry|record|label))/gi, 'missing');

const normalizeCompanyNameCase = (value: string): string =>
    value.replace(/\b(pte|ltd|inc|corp|llc|sdn|bhd)\b/gi, match => match.toUpperCase());

const splitSentences = (value: string): string[] =>
    collapseWhitespace(value)
        .split(/(?<=[.!?])\s+/)
        .map(sentence => sentence.trim())
        .filter(Boolean);

export const normalizeReportNarrative = (
    value: unknown,
    options?: {
        maxSentences?: number;
        fallback?: string;
    },
): string => {
    const maxSentences = options?.maxSentences ?? 2;
    const cleaned = collapseWhitespace(
        normalizeCompanyNameCase(
            normalizeCurrencyAbbreviations(
                normalizeNullLabels(
                    stripFieldNoise(removeMarkdownNoise(trimText(value)))
                )
            )
        )
    );
    const sentences = splitSentences(cleaned);
    const selected = (sentences.length > 0 ? sentences : cleaned ? [cleaned] : [])
        .slice(0, maxSentences)
        .join(' ');

    const normalized = sentenceCase(collapseWhitespace(selected));
    if (normalized) {
        return normalized;
    }

    return trimText(options?.fallback);
};

export const buildNarrativeSemanticKey = (value: unknown): string =>
    collapseWhitespace(
        trimText(value)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\b(the|a|an|is|are|was|were|for|of|to|and|with|by|in)\b/g, ' ')
            .replace(/\s+/g, ' '),
    );

