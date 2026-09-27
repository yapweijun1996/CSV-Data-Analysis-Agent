import type {
    AnalysisCardData,
    CardContext,
    CardReference,
    ColumnProfile,
    DisplayAnalysisIr,
    DisplayAnalysisIrHelperExposureLevel,
    DisplayAnalysisIrNarrativeEligibility,
    DisplayAnalysisIrSemanticRole,
    VectorStoreDocumentMetadata,
    VectorSearchMatch,
} from '../../../types';
import { buildDisplayAnalysisIrList } from '../../dashboard/displayAnalysisIr';

const MAX_SUMMARY_EXCERPT_LENGTH = 260;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const stripMarkdown = (value: string) => normalizeWhitespace(
    value
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/#+\s*/g, '')
        .replace(/^\s*[-*]\s+/gm, '')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/\n+/g, ' '),
);

const buildSummaryExcerpt = (summaryText: string) => {
    const normalized = stripMarkdown(summaryText);
    if (normalized.length <= MAX_SUMMARY_EXCERPT_LENGTH) {
        return normalized;
    }
    return `${normalized.slice(0, MAX_SUMMARY_EXCERPT_LENGTH - 1).trimEnd()}...`;
};

const dedupeTerms = (terms: Array<string | null | undefined>) => {
    const seen = new Set<string>();
    return terms
        .map(term => normalizeWhitespace(String(term ?? '')))
        .filter(term => term.length > 0)
        .filter(term => {
            const key = term.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
};

const isHelperHeavy = (
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel,
    narrativeEligibility: DisplayAnalysisIrNarrativeEligibility,
) => helperExposureLevel === 'high' || narrativeEligibility === 'avoid_if_possible';

const buildHelperNeutralityNote = (
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel,
    narrativeEligibility: DisplayAnalysisIrNarrativeEligibility,
) =>
    isHelperHeavy(helperExposureLevel, narrativeEligibility)
        ? 'Interpret labels neutrally. Do not assume they represent projects, sites, business units, or financial entities.'
        : null;

const getMemoryOrderingAdjustment = (semanticRole: DisplayAnalysisIrSemanticRole) => {
    switch (semanticRole) {
        case 'business_dimension':
            return 0.45;
        case 'helper_dimension':
            return -0.35;
        case 'helper_row_index':
        case 'helper_classification':
            return -0.75;
        case 'metric_only':
            return -0.5;
        case 'fallback':
            return -0.25;
        default:
            return 0;
    }
};

/**
 * Build a schema fingerprint string that captures the analysis pattern:
 * dimension type + metric type + aggregation + chart type.
 * This enables matching against new datasets with similar column shapes.
 */
const buildSchemaFingerprint = (card: AnalysisCardData, columnProfiles: ColumnProfile[]): string => {
    const groupCol = card.plan.groupByColumn;
    const valueCol = card.plan.valueColumn;
    const groupType = groupCol
        ? (columnProfiles.find(c => c.name === groupCol)?.type ?? 'unknown')
        : 'none';
    const valueType = valueCol
        ? (columnProfiles.find(c => c.name === valueCol)?.type ?? 'unknown')
        : 'none';
    const agg = card.plan.aggregation ?? 'none';
    const chart = card.displayChartType ?? 'table';
    return `dim:${groupType}|metric:${valueType}|agg:${agg}|chart:${chart}`;
};

/** Build a schema line for embedding in memoryText (human-readable). */
const buildSchemaLine = (card: AnalysisCardData, columnProfiles: ColumnProfile[]): string => {
    const parts: string[] = [];
    const groupCol = card.plan.groupByColumn;
    const valueCol = card.plan.valueColumn;
    if (groupCol) {
        const colType = columnProfiles.find(c => c.name === groupCol)?.type ?? 'unknown';
        parts.push(`GroupBy: ${groupCol} (${colType})`);
    }
    if (valueCol) {
        const colType = columnProfiles.find(c => c.name === valueCol)?.type ?? 'unknown';
        parts.push(`Value: ${valueCol} (${colType})`);
    }
    if (card.plan.aggregation) parts.push(`Aggregation: ${card.plan.aggregation}`);
    parts.push(`Chart: ${card.displayChartType ?? 'table'}`);
    return `Schema: ${parts.join(' | ')}`;
};

const buildMetadata = (ir: DisplayAnalysisIr, card?: AnalysisCardData, columnProfiles?: ColumnProfile[]): VectorStoreDocumentMetadata => ({
    kind: 'analysis_card',
    cardId: ir.cardId,
    semanticRole: ir.semanticRole,
    helperExposureLevel: ir.helperExposureLevel,
    narrativeEligibility: ir.narrativeEligibility,
    memoryFormatVersion: 'ir-v1',
    ...(card && columnProfiles ? {
        schemaFingerprint: buildSchemaFingerprint(card, columnProfiles),
        chartType: card.displayChartType ?? undefined,
        aggregation: card.plan.aggregation ?? undefined,
    } : {}),
});

export interface CardMemoryProjection {
    cardId: string;
    displayTitle: string;
    displayDescription: string;
    safeNarrativeLabels: DisplayAnalysisIr['safeNarrativeLabels'];
    semanticRole: DisplayAnalysisIrSemanticRole;
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel;
    narrativeEligibility: DisplayAnalysisIrNarrativeEligibility;
    summaryExcerpt: string;
    keywordTerms: string[];
    memoryText: string;
    retrievalSnippet: string;
    metadata: VectorStoreDocumentMetadata;
}

export const buildCardMemoryProjectionList = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[] = [],
): CardMemoryProjection[] => {
    const irList = buildDisplayAnalysisIrList(cards, columnProfiles);

    return cards.map(card => {
        const ir = irList.find(candidate => candidate.cardId === card.id);
        if (!ir) {
            const summaryExcerpt = buildSummaryExcerpt(card.summary.text);
            const keywordTerms = dedupeTerms([
                card.plan.title,
                card.plan.description,
                card.plan.groupByColumn,
                card.plan.valueColumn,
            ]);
            return {
                cardId: card.id,
                displayTitle: card.plan.title,
                displayDescription: card.plan.description,
                safeNarrativeLabels: {
                    title: card.plan.title,
                    dimension: card.plan.groupByColumn ?? null,
                    metric: card.plan.valueColumn ?? null,
                },
                semanticRole: 'business_dimension',
                helperExposureLevel: 'medium',
                narrativeEligibility: 'allowed_neutral',
                summaryExcerpt,
                keywordTerms,
                memoryText: [
                    `[Analysis Card] ${card.plan.title}`,
                    `Description: ${card.plan.description}`,
                    buildSchemaLine(card, columnProfiles),
                    `Summary: ${summaryExcerpt || 'No summary available.'}`,
                    `Keywords: ${keywordTerms.join(', ') || 'n/a'}`,
                ].join('\n'),
                retrievalSnippet: `${card.plan.title}. ${summaryExcerpt || 'No summary available.'}`,
                metadata: {
                    kind: 'analysis_card',
                    cardId: card.id,
                    semanticRole: 'business_dimension',
                    helperExposureLevel: 'medium',
                    narrativeEligibility: 'allowed_neutral',
                    memoryFormatVersion: 'ir-v1',
                },
            };
        }

        const summaryExcerpt = buildSummaryExcerpt(card.summary.text);
        const neutralityNote = buildHelperNeutralityNote(ir.helperExposureLevel, ir.narrativeEligibility);
        const keywordTerms = dedupeTerms([
            ir.displayTitle,
            ir.displayDescription,
            ir.safeNarrativeLabels.dimension,
            ir.safeNarrativeLabels.metric,
            card.plan.groupByColumn,
            card.plan.valueColumn,
        ]);
        const descriptorLine = [
            ir.safeNarrativeLabels.dimension ? `Dimension: ${ir.safeNarrativeLabels.dimension}` : null,
            ir.safeNarrativeLabels.metric ? `Metric: ${ir.safeNarrativeLabels.metric}` : null,
            `Semantic role: ${ir.semanticRole}`,
            `Narrative mode: ${ir.narrativeEligibility}`,
        ].filter(Boolean).join(' | ');

        return {
            cardId: ir.cardId,
            displayTitle: ir.displayTitle,
            displayDescription: ir.displayDescription,
            safeNarrativeLabels: ir.safeNarrativeLabels,
            semanticRole: ir.semanticRole,
            helperExposureLevel: ir.helperExposureLevel,
            narrativeEligibility: ir.narrativeEligibility,
            summaryExcerpt,
            keywordTerms,
            memoryText: [
                `[Analysis Card] ${ir.displayTitle}`,
                `Description: ${ir.displayDescription}`,
                descriptorLine,
                buildSchemaLine(card, columnProfiles),
                `Summary: ${summaryExcerpt || 'No summary available.'}`,
                neutralityNote,
                `Keywords: ${keywordTerms.join(', ') || 'n/a'}`,
            ].filter(Boolean).join('\n'),
            retrievalSnippet: [
                `${ir.displayTitle}.`,
                ir.safeNarrativeLabels.dimension ? `Dimension: ${ir.safeNarrativeLabels.dimension}.` : null,
                ir.safeNarrativeLabels.metric ? `Metric: ${ir.safeNarrativeLabels.metric}.` : null,
                summaryExcerpt ? `Summary: ${summaryExcerpt}` : null,
                neutralityNote,
            ].filter(Boolean).join(' '),
            metadata: buildMetadata(ir, card, columnProfiles),
        };
    });
};

export const buildCardMemoryProjectionMap = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[] = [],
) => new Map(buildCardMemoryProjectionList(cards, columnProfiles).map(projection => [projection.cardId, projection]));

export const buildRuntimeCardContextFromProjectionList = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[] = [],
    maxCards = cards.length,
    maxRows = 5,
): CardContext[] => {
    const projections = buildCardMemoryProjectionMap(cards, columnProfiles);
    return cards.slice(0, maxCards).map(card => {
        const projection = projections.get(card.id);
        return {
            id: card.id,
            title: projection?.displayTitle ?? card.plan.title,
            description: projection?.displayDescription ?? card.plan.description,
            summary: projection?.summaryExcerpt ?? buildSummaryExcerpt(card.summary.text),
            chartType: card.displayChartType,
            groupByColumn: projection?.safeNarrativeLabels.dimension ?? card.plan.groupByColumn,
            valueColumn: projection?.safeNarrativeLabels.metric ?? card.plan.valueColumn,
            aggregation: card.plan.aggregation,
            rowCount: card.aggregatedData.length,
            aggregatedDataSample: card.aggregatedData.slice(0, maxRows),
        };
    });
};

export const buildCardReferenceFromProjection = (
    card: AnalysisCardData,
    projection: CardMemoryProjection,
    relevance: number,
): CardReference => ({
    id: card.id,
    title: projection.displayTitle,
    description: projection.displayDescription,
    displayTitle: projection.displayTitle,
    displayDescription: projection.displayDescription,
    chartType: card.plan.chartType,
    groupByColumn: projection.safeNarrativeLabels.dimension ?? card.plan.groupByColumn,
    valueColumn: projection.safeNarrativeLabels.metric ?? card.plan.valueColumn,
    aggregation: card.plan.aggregation,
    summary: card.summary,
    relevance,
    semanticRole: projection.semanticRole,
    helperExposureLevel: projection.helperExposureLevel,
    narrativeEligibility: projection.narrativeEligibility,
});

/** Parse the turn number from a chat insight's text (e.g., "Turns: 8-12" → 12). */
const parseChatInsightTurn = (text: string): number | null => {
    const match = text.match(/Turns:\s*\d+-(\d+)/);
    return match ? Number(match[1]) : null;
};

/** Recency decay penalty for chat insights. Max 0.5 penalty for very old insights. */
const DECAY_PER_TURN = 0.02;
const MAX_DECAY = 0.5;

export const selectReadableLongTermMemory = (
    vectorMatches: VectorSearchMatch[],
    projectionMap: Map<string, CardMemoryProjection>,
    limit: number,
    currentTurnCount?: number,
): string[] =>
    vectorMatches
        .map((entry, index) => {
            const projection = projectionMap.get(entry.metadata?.cardId ?? entry.id);
            let adjustedScore = entry.score + (projection ? getMemoryOrderingAdjustment(projection.semanticRole) : 0);

            // Apply recency decay for chat insight documents (not in projectionMap).
            if (!projection && currentTurnCount != null) {
                const insightTurn = parseChatInsightTurn(entry.text);
                if (insightTurn != null) {
                    const decay = Math.min((currentTurnCount - insightTurn) * DECAY_PER_TURN, MAX_DECAY);
                    adjustedScore -= decay;
                }
            }

            return { entry, index, adjustedScore };
        })
        .sort((left, right) => {
            if (right.adjustedScore !== left.adjustedScore) {
                return right.adjustedScore - left.adjustedScore;
            }
            return left.index - right.index;
        })
        .slice(0, limit)
        .map(({ entry }) =>
            projectionMap.get(entry.metadata?.cardId ?? entry.id)?.retrievalSnippet
            ?? entry.text);
