import type { ReportCardEvidence } from '../../types';

export type CrossCardInsightType = 'convergence' | 'divergence';

export interface CrossCardInsight {
    /** Type of inter-card relationship found. */
    type: CrossCardInsightType;
    /** The card IDs involved in this insight. */
    cardIds: string[];
    /** Human-readable insight sentence. */
    insight: string;
}

const MAX_INSIGHTS = 3;
const MAX_CARDS_PER_GROUP = 5;

/**
 * Extracts the leading dimension label from a card's aggregated data sample.
 * Returns null when there's no usable data row.
 */
const extractLeadingLabel = (
    card: ReportCardEvidence,
): string | null => {
    const topRow = card.aggregatedDataSample[0];
    if (!topRow || !card.groupByColumn) {
        return null;
    }
    const raw = topRow[card.groupByColumn];
    if (raw === null || raw === undefined) {
        return null;
    }
    return String(raw).trim() || null;
};

/**
 * Pure, deterministic function that identifies cross-card relationships from
 * a set of trusted/caveated ReportCardEvidence entries.
 *
 * Algorithm:
 * 1. Keep cards with a groupByColumn, a valueColumn, and at least one data row.
 * 2. Group cards by their shared groupByColumn.
 * 3. For each group with 2+ cards:
 *    - Extract the leading category label from the top data row of each card.
 *    - Convergence: the same label is #1 in 2+ cards (e.g. Region A leads both Revenue and Cost).
 *    - Divergence:  different labels lead different metrics (e.g. Revenue peaks in A, Cost peaks in B).
 *
 * Returns up to MAX_INSIGHTS (3) insights sorted by type (convergence first).
 */
export const synthesizeCrossCardInsights = (
    cards: ReportCardEvidence[],
): CrossCardInsight[] => {
    // Only include cards with enough structure for comparison
    const eligible = cards.filter(card =>
        card.groupByColumn &&
        card.valueColumn &&
        card.aggregatedDataSample.length > 0 &&
        card.autoAnalysisVerdict !== 'weak',
    );

    if (eligible.length < 2) {
        return [];
    }

    // Group eligible cards by their groupByColumn
    const byDimension = new Map<string, ReportCardEvidence[]>();
    for (const card of eligible) {
        const dim = card.groupByColumn!;
        const existing = byDimension.get(dim) ?? [];
        existing.push(card);
        byDimension.set(dim, existing);
    }

    const insights: CrossCardInsight[] = [];

    for (const [dimension, group] of byDimension) {
        if (group.length < 2) {
            continue;
        }

        const capped = group.slice(0, MAX_CARDS_PER_GROUP);
        // Pair each card with its leading label
        const labeled = capped
            .map(card => ({ card, label: extractLeadingLabel(card) }))
            .filter((entry): entry is { card: ReportCardEvidence; label: string } => entry.label !== null);

        if (labeled.length < 2) {
            continue;
        }

        // Group by leading label to find convergences
        const byLabel = new Map<string, typeof labeled>();
        for (const entry of labeled) {
            const key = entry.label.toLowerCase();
            const existing = byLabel.get(key) ?? [];
            existing.push(entry);
            byLabel.set(key, existing);
        }

        // Find the most common leading label
        let dominantLabel = '';
        let dominantGroup: typeof labeled = [];
        for (const [, entries] of byLabel) {
            if (entries.length > dominantGroup.length) {
                dominantGroup = entries;
                dominantLabel = entries[0].label;
            }
        }

        const cardIds = labeled.map(e => e.card.cardId);

        if (dominantGroup.length >= 2) {
            // Convergence: same category leads multiple metrics
            const metricNames = dominantGroup
                .map(e => e.card.valueColumn!)
                .filter(Boolean);
            const metricList = metricNames.slice(0, 3).join(' and ');
            insights.push({
                type: 'convergence',
                cardIds,
                insight: `${dominantLabel} leads in ${metricList} across ${dimension} — multiple metrics converge on the same top performer.`,
            });
        } else {
            // Divergence: different categories lead different metrics
            const pairs = labeled.slice(0, 2).map(e =>
                `${e.card.valueColumn} peaks in ${e.label}`,
            );
            insights.push({
                type: 'divergence',
                cardIds,
                insight: `${pairs.join(', while ')} — different ${dimension} values dominate different metrics, suggesting a potential trade-off.`,
            });
        }

        if (insights.length >= MAX_INSIGHTS) {
            break;
        }
    }

    // Convergences are higher signal — sort them first
    return insights
        .sort((a, b) => (a.type === 'convergence' ? -1 : 1) - (b.type === 'convergence' ? -1 : 1))
        .slice(0, MAX_INSIGHTS);
};
