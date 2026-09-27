import type {
    AnalystMemo,
    ForumSummary,
    ReportCardEvidence,
    ReportEvidenceBundle,
    ReportFallbackTable,
    ReportVisual,
} from '../../types';
import { buildReportChartPayload, isSupportedReportChartType } from './buildReportChartPayload';
import { buildNarrativeSemanticKey, normalizeReportNarrative } from './normalizeReportNarrative';
import { renderReportChartSvg } from './renderReportChartSvg';

const MIN_VISUALS = 3;
const MAX_VISUALS = 4;
const MAX_FALLBACK_ROWS = 6;

const trimText = (value: unknown): string => String(value ?? '').trim();

const dedupeStrings = (values: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
        const normalized = trimText(value);
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        output.push(normalized);
    }

    return output;
};

const buildFallbackTable = (card: ReportCardEvidence): ReportFallbackTable | null => {
    const rows = card.reportChartRows.slice(0, MAX_FALLBACK_ROWS);
    if (rows.length === 0) {
        return null;
    }

    const columns = dedupeStrings([
        card.groupByColumn,
        card.valueColumn,
        ...Object.keys(rows[0] ?? {}),
    ]).slice(0, 3);

    if (columns.length === 0) {
        return null;
    }

    return {
        columns,
        rows: rows.map(row => columns.map(column => trimText(row[column]) || '—')),
    };
};

const findForumMatch = (card: ReportCardEvidence, forum: ForumSummary) =>
    forum.consensusFindings.find(finding => finding.evidenceRefs.includes(card.evidenceId));

const findMemoMatch = (card: ReportCardEvidence, memos: AnalystMemo[]) =>
    memos
        .flatMap(memo => memo.findings)
        .find(finding => finding.evidenceRefs.includes(card.evidenceId));

const inferTopicKey = (card: ReportCardEvidence, forum: ForumSummary, memos: AnalystMemo[]): string => {
    const source = [
        findForumMatch(card, forum)?.claim,
        findMemoMatch(card, memos)?.claim,
        card.displayTitle,
        card.description,
    ].find(Boolean);
    const normalized = buildNarrativeSemanticKey(source);

    if (/concentr|top|largest|dominant|majority|lead/.test(normalized)) {
        return 'revenue_concentration';
    }
    if (/null|missing|unmapped|quality|complet|classification|helper/.test(normalized)) {
        return 'data_quality_gap';
    }
    if (/cost|risk|outflow|expense|loss|profit/.test(normalized)) {
        return 'cost_risk_pattern';
    }
    if (/variance|outlier|deviation|spread|trend/.test(normalized)) {
        return 'variance_outlier';
    }

    return normalized || buildNarrativeSemanticKey(card.displayTitle) || card.cardId;
};

const buildBusinessTitle = (card: ReportCardEvidence, forum: ForumSummary, memos: AnalystMemo[]): string =>
    normalizeReportNarrative(
        findForumMatch(card, forum)?.claim
        || findMemoMatch(card, memos)?.claim
        || card.displayTitle,
        { maxSentences: 1, fallback: card.displayTitle },
    );

const buildWhyItMatters = (
    card: ReportCardEvidence,
    forum: ForumSummary,
    memos: AnalystMemo[],
): string => normalizeReportNarrative(
    findForumMatch(card, forum)?.claim
    || findMemoMatch(card, memos)?.claim
    || card.summary?.text
    || card.description
    || card.displayTitle,
    { maxSentences: 2, fallback: card.displayTitle },
);

const buildWhatItShows = (card: ReportCardEvidence): string =>
    normalizeReportNarrative(card.summary?.text || card.description || card.displayTitle, {
        maxSentences: 2,
        fallback: card.displayTitle,
    });

const buildCaveat = (
    card: ReportCardEvidence,
    bundle: ReportEvidenceBundle,
    forum: ForumSummary,
    memos: AnalystMemo[],
): string | null => {
    const forumCaveat = findForumMatch(card, forum)?.caveats?.find(Boolean);
    const memoCaveat = findMemoMatch(card, memos)?.caveat;
    const fallback = bundle.dataset.readinessRisks[0] ?? bundle.dataset.caveats[0] ?? null;
    const normalized = normalizeReportNarrative(forumCaveat || memoCaveat || fallback, { maxSentences: 2 });
    return normalized || null;
};

const createCardPriority = (card: ReportCardEvidence, forum: ForumSummary): number => {
    const forumScore = findForumMatch(card, forum) ? 4 : 0;
    const semanticScore = card.semanticRole === 'business_dimension' ? 2 : 0;
    const exposurePenalty = card.helperExposureLevel === 'high' ? -2 : card.helperExposureLevel === 'medium' ? -1 : 0;
    const confidenceScore = card.businessMeaningConfidence ?? 0;
    const chartScore = isSupportedReportChartType(card.chartType) ? 1 : 0;

    return forumScore + semanticScore + exposurePenalty + confidenceScore + chartScore + Math.min(card.rowCount, 12) / 100;
};

const buildCalloutValue = (card: ReportCardEvidence): string | null => {
    const payload = buildReportChartPayload(card);
    if (!payload || payload.formattedValues.length === 0) {
        return null;
    }

    return payload.formattedValues[0] ?? null;
};

const buildVisual = (
    card: ReportCardEvidence,
    bundle: ReportEvidenceBundle,
    forum: ForumSummary,
    memos: AnalystMemo[],
): ReportVisual => {
    const chartPayload = buildReportChartPayload(card);
    const fallbackTable = chartPayload ? null : buildFallbackTable(card);
    const topicKey = inferTopicKey(card, forum, memos);
    const businessTitle = buildBusinessTitle(card, forum, memos);

    return {
        cardId: card.cardId,
        title: card.displayTitle,
        businessTitle,
        topicKey,
        chartType: chartPayload?.chartType ?? 'table',
        chartPayload,
        svgMarkup: chartPayload ? renderReportChartSvg(chartPayload) : null,
        fallbackTable,
        whatItShows: buildWhatItShows(card),
        whyItMatters: buildWhyItMatters(card, forum, memos),
        caveat: buildCaveat(card, bundle, forum, memos),
        calloutValue: chartPayload?.formattedValues[0] ?? buildCalloutValue(card),
        chartWarnings: chartPayload?.chartWarnings ?? [],
    };
};

export const buildReportVisualSelection = (
    bundle: ReportEvidenceBundle,
    forum: ForumSummary,
    memos: AnalystMemo[],
): ReportVisual[] => {
    if (bundle.cards.length === 0) {
        return [];
    }

    const rankedCards = [...bundle.cards].sort((left, right) => createCardPriority(right, forum) - createCardPriority(left, forum));
    const selected: ReportCardEvidence[] = [];
    const topicOwners = new Map<string, ReportCardEvidence>();

    for (const card of rankedCards) {
        const topicKey = inferTopicKey(card, forum, memos);
        const existing = topicOwners.get(topicKey);
        if (existing) {
            const currentScore = createCardPriority(existing, forum);
            const nextScore = createCardPriority(card, forum);
            if (nextScore <= currentScore) {
                continue;
            }
            const index = selected.findIndex(entry => entry.cardId === existing.cardId);
            if (index >= 0) {
                selected.splice(index, 1, card);
            }
            topicOwners.set(topicKey, card);
            continue;
        }

        topicOwners.set(topicKey, card);
        selected.push(card);
    }

    const desiredCount = bundle.cards.length >= MIN_VISUALS
        ? Math.min(MAX_VISUALS, Math.max(MIN_VISUALS, selected.length))
        : Math.min(MAX_VISUALS, selected.length);

    return selected
        .slice(0, desiredCount)
        .map(card => buildVisual(card, bundle, forum, memos));
};

