import {
    AnalysisCardData,
    CardReference,
    ColumnProfile,
    ReportMemoryScope,
    UserColumnAnnotation,
    VectorSearchMatch,
} from '../../../types';
import { vectorStore } from '../../vectorStore';
import { StoreApi } from '../types';
import { buildCardMemoryProjectionList, buildCardReferenceFromProjection } from './cardMemoryProjection';
import { resolveReportMemoryScope } from './memoryScope';

const normalize = (value?: string | null) => value?.toLowerCase() || '';

const computeKeywordScore = (
    message: string,
    projection: ReturnType<typeof buildCardMemoryProjectionList>[number],
) => {
    const normalizedMessage = normalize(message);
    let score = 0;
    const fields = [
        projection.displayTitle,
        projection.displayDescription,
        projection.summaryExcerpt,
        ...projection.keywordTerms,
    ];
    fields.forEach((field, index) => {
        if (!field) return;
        const weight = index <= 2 ? 1 : 0.75;
        if (normalizedMessage.includes(normalize(field))) {
            score += weight;
        }
    });
    return score;
};

const buildVectorScoreMap = (vectorMatches: VectorSearchMatch[]) =>
    new Map<string, number>(vectorMatches.map(item => [
        item.metadata?.cardId ?? item.id,
        item.score,
    ]));

const getRoleRetrievalAdjustment = (semanticRole: CardReference['semanticRole']) => {
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

export const findRelatedCards = async (
    message: string,
    store: StoreApi,
    limit = 3,
    precomputedVectorMatches?: VectorSearchMatch[],
): Promise<CardReference[]> => {
    const state = store.getState();
    const cards = state.analysisCards;
    if (!message.trim() || cards.length === 0) return [];

    const scope = resolveReportMemoryScope(state) ?? undefined;
    const vectorMatches = precomputedVectorMatches
        ?? (scope
            ? await vectorStore.searchIfReady(message, limit + 2, scope)
            : []);
    const vectorScoreMap = buildVectorScoreMap(vectorMatches);
    const projections = buildCardMemoryProjectionList(cards, state.columnProfiles ?? []);
    const projectionMap = new Map(projections.map(projection => [projection.cardId, projection]));

    const scored = cards
        .map(card => {
            const projection = projectionMap.get(card.id);
            if (!projection) {
                return { card, score: 0 };
            }
            const keywordScore = computeKeywordScore(message, projection);
            const vectorScore = vectorScoreMap.get(card.id) ?? 0;
            const roleAdjustment = getRoleRetrievalAdjustment(projection.semanticRole);
            const total = keywordScore + vectorScore * 2 + roleAdjustment;
            return { card, score: total, projection };
        })
        .filter(entry => entry.score > 0.2);

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(entry => buildCardReferenceFromProjection(
            entry.card,
            entry.projection!,
            Number(entry.score.toFixed(3)),
        ));
};

// --- Template matching for cross-session recommendation ---

export interface TemplateMatch {
    title: string;
    description: string;
    groupByColumn: string | undefined;
    valueColumn: string | undefined;
    aggregation: string | undefined;
    chartType: string | undefined;
    score: number;
}

/**
 * Search vector memory for historical analysis cards that match the current
 * dataset's column profile. Returns template hints (title, description,
 * aggregation, chart type) that can be injected into goal proposal.
 *
 * Builds a query string from column names and types, then uses semantic
 * search to find cards with similar schema fingerprints.
 */
export const findTemplateMatches = async (
    columnProfiles: ColumnProfile[],
    limit = 3,
    scope?: ReportMemoryScope,
): Promise<TemplateMatch[]> => {
    if (columnProfiles.length === 0 || !scope) return [];

    // Build a schema-oriented query: column names + types for semantic matching
    const categoricalCols = columnProfiles.filter(c => c.type === 'categorical' || c.type === 'date' || c.type === 'time');
    const numericCols = columnProfiles.filter(c =>
        c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage',
    );
    const queryParts = [
        categoricalCols.length > 0
            ? `Dimensions: ${categoricalCols.map(c => c.name).join(', ')}`
            : null,
        numericCols.length > 0
            ? `Metrics: ${numericCols.map(c => c.name).join(', ')}`
            : null,
    ].filter(Boolean);

    if (queryParts.length === 0) return [];

    const queryText = queryParts.join('. ');
    const matches = await vectorStore.searchIfReady(queryText, limit + 2, scope);
    if (matches.length === 0) return [];

    // Parse the memoryText to extract schema info from matched cards.
    return matches
        .filter(m => m.metadata?.kind === 'analysis_card' && m.score >= 0.55)
        .slice(0, limit)
        .map(match => {
            const lines = match.text.split('\n');
            const titleLine = lines.find(l => l.startsWith('[Analysis Card]'));
            const descLine = lines.find(l => l.startsWith('Description:'));
            const schemaLine = lines.find(l => l.startsWith('Schema:'));

            let groupByColumn: string | undefined;
            let valueColumn: string | undefined;
            let aggregation: string | undefined;
            let chartType: string | undefined;

            if (schemaLine) {
                const groupMatch = schemaLine.match(/GroupBy:\s*([^(]+)/);
                const valueMatch = schemaLine.match(/Value:\s*([^(]+)/);
                const aggMatch = schemaLine.match(/Aggregation:\s*(\w+)/);
                const chartMatch = schemaLine.match(/Chart:\s*(\w+)/);
                groupByColumn = groupMatch?.[1]?.trim();
                valueColumn = valueMatch?.[1]?.trim();
                aggregation = aggMatch?.[1];
                chartType = chartMatch?.[1];
            }

            return {
                title: titleLine?.replace('[Analysis Card] ', '') ?? match.text.slice(0, 80),
                description: descLine?.replace('Description: ', '') ?? '',
                groupByColumn,
                valueColumn,
                aggregation,
                chartType,
                score: match.score,
            };
        });
};

// --- Column annotation matching for data dictionary ---

/**
 * Search vector memory for column annotations that match the current
 * dataset's columns. Returns a map of columnName → UserColumnAnnotation
 * for columns with high-confidence matches (score >= 0.75).
 */
export const findColumnAnnotationMatches = async (
    columnProfiles: ColumnProfile[],
    scope?: ReportMemoryScope,
): Promise<Map<string, UserColumnAnnotation>> => {
    const result = new Map<string, UserColumnAnnotation>();
    if (columnProfiles.length === 0 || !scope) return result;

    // Batch search: build a query from all column names
    const queryText = `Column annotations: ${columnProfiles.map(c => c.name).join(', ')}`;
    const matches = await vectorStore.searchIfReady(queryText, columnProfiles.length, scope);
    if (matches.length === 0) return result;

    for (const match of matches) {
        if (match.metadata?.kind !== 'column_annotation' || match.score < 0.75) continue;

        const lines = match.text.split('\n');
        const headerLine = lines.find(l => l.startsWith('[Column Annotation]'));
        const labelLine = lines.find(l => l.startsWith('Label:'));
        const descLine = lines.find(l => l.startsWith('Description:'));
        const roleLine = lines.find(l => l.startsWith('Role:'));

        const columnName = headerLine?.replace('[Column Annotation] ', '').trim();
        if (!columnName) continue;

        // Only match if the column exists in the current dataset
        if (!columnProfiles.some(c => c.name === columnName)) continue;

        const businessRole = roleLine?.replace('Role: ', '').trim() as UserColumnAnnotation['businessRole'];
        result.set(columnName, {
            columnName,
            businessLabel: labelLine?.replace('Label: ', '').trim() ?? columnName,
            description: descLine?.replace('Description: ', '').trim() ?? '',
            businessRole: businessRole === 'dimension' || businessRole === 'metric' || businessRole === 'identifier' || businessRole === 'helper'
                ? businessRole : undefined,
        });
    }

    return result;
};
