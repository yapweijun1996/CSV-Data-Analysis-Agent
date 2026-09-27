/**
 * Analysis pattern extractor for report-scoped learning (MEMORY-201).
 *
 * After a successful analysis session, extracts the user's analysis
 * preferences (dimension choices, metric choices, aggregation types,
 * chart types) and stores them as vector memory documents. On later turns or
 * restored sessions for the same report and material version, these patterns inform goal
 * proposal as soft preferences (never constraints).
 */

import type {
    AnalysisCardData,
    ColumnProfile,
    VectorSearchMatch,
    VectorStoreDocumentMetadata,
} from '../../../types';

// --- Types ---

export interface AnalysisPatternDocument {
    id: string;
    text: string;
    metadata: VectorStoreDocumentMetadata;
}

// --- Helpers ---

const simpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
};

const unique = (arr: string[]) => [...new Set(arr)];

const countOccurrences = (arr: string[]): Array<{ value: string; count: number }> => {
    const map = new Map<string, number>();
    for (const item of arr) {
        map.set(item, (map.get(item) ?? 0) + 1);
    }
    return [...map.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
};

// --- Core ---

/**
 * Extract analysis patterns from the cards produced in a completed session.
 * Returns a vector memory document capturing the user's preferences.
 *
 * Only extracts patterns when there are at least 2 accepted cards
 * (a single card doesn't establish a pattern).
 */
export const extractAnalysisPatterns = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[],
    datasetFileName: string,
): AnalysisPatternDocument | null => {
    // Need at least 2 cards to establish a pattern.
    if (cards.length < 2) return null;

    const groupByChoices = cards
        .map(c => c.plan.groupByColumn)
        .filter((col): col is string => Boolean(col));

    const valueChoices = cards
        .map(c => c.plan.valueColumn)
        .filter((col): col is string => Boolean(col));

    const aggregationChoices = cards
        .map(c => c.plan.aggregation as string | undefined)
        .filter((agg): agg is string => Boolean(agg));

    const chartChoices = cards
        .map(c => c.displayChartType as string | undefined)
        .filter((chart): chart is string => Boolean(chart));

    // Build a column-type signature for schema matching.
    const categoricalCols = columnProfiles.filter(c =>
        c.type === 'categorical' || c.type === 'date' || c.type === 'time',
    );
    const numericCols = columnProfiles.filter(c =>
        c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage',
    );
    const schemaShape = `${categoricalCols.length}cat-${numericCols.length}num`;

    // Format readable memory text.
    const lines = [`[Analysis Pattern] ${datasetFileName}`];
    lines.push(`Schema shape: ${schemaShape} (${columnProfiles.length} columns)`);

    if (groupByChoices.length > 0) {
        const ranked = countOccurrences(groupByChoices);
        lines.push(`Preferred dimensions: ${ranked.map(r => r.value).join(', ')}`);
    }
    if (valueChoices.length > 0) {
        const ranked = countOccurrences(valueChoices);
        lines.push(`Preferred metrics: ${ranked.map(r => r.value).join(', ')}`);
    }
    if (aggregationChoices.length > 0) {
        const ranked = countOccurrences(aggregationChoices);
        lines.push(`Preferred aggregations: ${ranked.map(r => r.value).join(', ')}`);
    }
    if (chartChoices.length > 0) {
        const ranked = countOccurrences(chartChoices);
        lines.push(`Preferred charts: ${ranked.map(r => r.value).join(', ')}`);
    }
    lines.push(`Cards produced: ${cards.length}`);

    const contentKey = `${schemaShape}:${unique(groupByChoices).sort().join(',')}:${unique(valueChoices).sort().join(',')}`;
    const id = `analysis-pattern-${simpleHash(contentKey)}`;

    return {
        id,
        text: lines.join('\n'),
        metadata: {
            kind: 'analysis_pattern',
            memoryFormatVersion: 'ir-v1',
            schemaFingerprint: schemaShape,
            extractedAt: new Date().toISOString(),
        },
    };
};

/**
 * Format already-scoped vector matches for user analysis patterns that match
 * the current dataset's column profile. Returns preference
 * hints for injection into goal proposal context.
 */
export const formatPatternPreferences = (
    matches: VectorSearchMatch[],
): string | null => {
    const patternMatches = matches.filter(m =>
        m.metadata?.kind === 'analysis_pattern' && m.score >= 0.5);
    if (patternMatches.length === 0) return null;

    const summaries = patternMatches.slice(0, 2).map(m => {
        const lines = m.text.split('\n');
        // Extract preference lines (skip header and schema shape).
        return lines
            .filter(l => l.startsWith('Preferred '))
            .join('; ');
    });

    return `Based on prior analysis sessions, the user typically: ${summaries.join('. ')}`;
};
