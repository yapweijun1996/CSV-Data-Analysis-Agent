/**
 * Semantic text matching utilities for SQL plan validation.
 *
 * Provides fuzzy topic-to-column matching with NLP-style text processing:
 * normalization, singularization, tokenization, and scoring.
 * Used by both topic alignment validation and stability analysis.
 */

import type { ColumnProfile } from '../../../types';

// ─── Text normalization ────────────────────────────────────────

export const normalizeString = (value: unknown) =>
    typeof value === 'string' ? value.trim() : '';

export const normalizeTopicText = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/\bno\.\b/g, 'number ')
        .replace(/[_/.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const normalizeColumnWords = (value: string) =>
    normalizeTopicText(
        value
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/([a-zA-Z])(\d)/g, '$1 $2')
            .replace(/(\d)([a-zA-Z])/g, '$1 $2'),
    );

// ─── Tokenization & singularization ───────────────────────────

export const singularizeToken = (token: string) => {
    if (token.length <= 3) return token;
    if (token.endsWith('ies') && token.length > 4) {
        return `${token.slice(0, -3)}y`;
    }
    if (token.endsWith('es') && token.length > 4) {
        return token.slice(0, -2);
    }
    if (token.endsWith('s') && !token.endsWith('ss')) {
        return token.slice(0, -1);
    }
    return token;
};

export const tokenizeForTopicMatch = (value: string) =>
    normalizeTopicText(value)
        .split(' ')
        .map(token => singularizeToken(token.trim()))
        .filter(token => token.length >= 2);

// ─── Topic-column matching ─────────────────────────────────────

export const topicMentionsColumn = (topic: string, column: string) => {
    const normalizedTopic = normalizeTopicText(topic);
    const normalizedColumn = normalizeColumnWords(column);
    const rawColumn = normalizeString(column).toLowerCase();
    if (!normalizedTopic || !normalizedColumn) {
        return false;
    }
    if (rawColumn && normalizedTopic.includes(rawColumn)) {
        return true;
    }
    if (normalizedTopic.includes(normalizedColumn)) {
        return true;
    }

    const columnTokens = tokenizeForTopicMatch(normalizedColumn);
    if (columnTokens.length === 0) {
        return false;
    }

    const topicTokens = new Set(tokenizeForTopicMatch(normalizedTopic));
    return columnTokens.every(token => topicTokens.has(token));
};

export const hasWholePhraseMatch = (topic: string, phrase: string) => {
    if (!topic || !phrase) {
        return false;
    }
    return (` ${topic} `).includes(` ${phrase} `);
};

// ─── Scoring ───────────────────────────────────────────────────

export const getTopicColumnMatchScore = (topic: string, column: string): number => {
    const normalizedTopic = normalizeTopicText(topic);
    const normalizedColumn = normalizeColumnWords(column);
    const rawColumn = normalizeString(column).toLowerCase();
    if (!normalizedTopic || !normalizedColumn) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = Number.NEGATIVE_INFINITY;
    if (hasWholePhraseMatch(normalizedTopic, normalizedColumn)) {
        score = 300;
    } else if (rawColumn && hasWholePhraseMatch(normalizedTopic, rawColumn)) {
        score = 260;
    } else if (topicMentionsColumn(normalizedTopic, column)) {
        score = 100;
    } else {
        return Number.NEGATIVE_INFINITY;
    }

    const tokenCount = tokenizeForTopicMatch(normalizedColumn).length;
    return score + tokenCount * 10 + normalizedColumn.length;
};

export const hasDistinctTopicTargetMention = (topic: string, column: string, candidates: string[]) => {
    const candidateScore = getTopicColumnMatchScore(topic, column);
    if (!Number.isFinite(candidateScore)) {
        return false;
    }

    const normalizedColumn = normalizeColumnWords(column);
    return !candidates.some(candidate => {
        if (candidate === column) {
            return false;
        }
        const candidateMatchScore = getTopicColumnMatchScore(topic, candidate);
        if (!Number.isFinite(candidateMatchScore) || candidateMatchScore <= candidateScore) {
            return false;
        }

        const normalizedCandidate = normalizeColumnWords(candidate);
        return (
            normalizedCandidate.length > normalizedColumn.length
            && normalizedCandidate.includes(normalizedColumn)
        );
    });
};

// ─── Intent patterns ───────────────────────────────────────────

// User-intent: count/frequency synonyms in topic text.
// NOTE: duplicated in planning/planGenerator.ts — consider consolidating in a future phase.
export const COUNT_INTENT_PATTERN = /\b(count|counts|number of|numbers of|how many|frequency|occurrence|occurrences)\b/i;
// Structural: generic record/row vocabulary for count topic discrimination.
export const GENERIC_COUNT_TOPIC_PATTERN = /\b(record|records|row|rows|entry|entries|line|lines)\b/i;

// Temporal-period prefixes commonly used in accounting/financial column names.
// Stripping these allows "YTD GROSS PROFIT" to match "GROSS PROFIT" when the
// base subset check alone is insufficient (e.g. both sides have extra tokens).
const TEMPORAL_PREFIX_PATTERN = /^(ytd|mtd|qtd|ly|py|cy|fytd|prior\s+year|current\s+year)\s+/i;
const stripTemporalPrefix = (value: string) => value.replace(TEMPORAL_PREFIX_PATTERN, '').trim();

// ─── Topic parsing ─────────────────────────────────────────────

export const extractTopicGroupingClause = (topic: string) => {
    const normalizedTopic = normalizeTopicText(topic);
    const byMatch = normalizedTopic.match(/\b(?:by|per)\s+(.+)$/);
    if (!byMatch) {
        return null;
    }

    const tail = byMatch[1]?.trim();
    if (!tail) {
        return null;
    }

    return tail;
};

export const inferTopicGroupByTarget = (topic: string, candidates: string[]) => {
    const tail = extractTopicGroupingClause(topic);
    if (!tail) {
        return null;
    }

    return candidates
        .map(candidate => ({ candidate, score: getTopicColumnMatchScore(tail, candidate) }))
        .filter(match => Number.isFinite(match.score))
        .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;
};

export const inferCountTopicOperandTarget = (topic: string, candidates: string[]) => {
    const normalizedTopic = normalizeTopicText(topic);
    if (!COUNT_INTENT_PATTERN.test(normalizedTopic)) {
        return null;
    }

    const head = normalizedTopic.replace(/\b(?:by|per)\s+.+$/, '').trim();
    if (!head) {
        return null;
    }

    return candidates.find(candidate => topicMentionsColumn(head, candidate)) ?? null;
};

// ─── Semantic identity ─────────────────────────────────────────

export const columnsShareTopicIdentity = (left: string | null | undefined, right: string | null | undefined) => {
    const leftTokens = left ? tokenizeForTopicMatch(normalizeColumnWords(left)) : [];
    const rightTokens = right ? tokenizeForTopicMatch(normalizeColumnWords(right)) : [];
    if (leftTokens.length === 0 || rightTokens.length === 0) {
        return false;
    }

    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);
    const leftSubsetOfRight = leftTokens.every(token => rightSet.has(token));
    const rightSubsetOfLeft = rightTokens.every(token => leftSet.has(token));
    if (leftSubsetOfRight || rightSubsetOfLeft) {
        return true;
    }

    // Fallback: strip temporal prefixes (YTD/MTD/QTD/...) and re-check.
    // Allows "YTD GROSS PROFIT" to match "GROSS PROFIT" even when neither is
    // a strict token-subset of the other due to additional qualifiers.
    const leftStripped = left ? tokenizeForTopicMatch(normalizeColumnWords(stripTemporalPrefix(left))) : [];
    const rightStripped = right ? tokenizeForTopicMatch(normalizeColumnWords(stripTemporalPrefix(right))) : [];
    if (leftStripped.length > 0 && rightStripped.length > 0) {
        const leftStrippedSet = new Set(leftStripped);
        const rightStrippedSet = new Set(rightStripped);
        return leftStripped.every(t => rightStrippedSet.has(t))
            || rightStripped.every(t => leftStrippedSet.has(t));
    }

    return false;
};

// ─── Additional intent patterns ────────────────────────────────

export const TIME_INTENT_PATTERN = /\b(trend|over time|time|month|monthly|quarter|quarterly|year|yearly|period|daily|weekly|mom|yoy|qoq)\b/i;
// Weak signal — "number" and "code" may be business dimensions in some datasets.
// Used only to choose count vs count_distinct, not to block or classify columns.
export const IDENTIFIER_LIKE_COLUMN_PATTERN = /\b(id|ids|code|codes|number|numbers|no|ref|reference|order)\b/i;

// ─── Column name normalization & lookup ────────────────────────

export const normalizeColumnKey = (value: string) => normalizeColumnWords(value).replace(/\s+/g, ' ').trim();

export const stripColumnQuotes = (value: string) => value.trim().replace(/^["'`\[]+|["'`\]]+$/g, '').trim();

export const buildColumnNameMap = (columns: Array<{ name: string }>) => new Map(
    columns.map(column => [normalizeColumnKey(column.name), column.name] as const),
);

export const resolveExactColumnMatch = (
    candidate: string | null | undefined,
    columnNameMap: Map<string, string>,
) => {
    if (!candidate) {
        return null;
    }
    return columnNameMap.get(normalizeColumnKey(stripColumnQuotes(candidate))) ?? null;
};
