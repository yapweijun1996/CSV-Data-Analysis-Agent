/**
 * Tests for synthesizeCrossCardInsights.ts
 *
 * Covers:
 * - convergence: same top category across multiple metrics
 * - divergence: different top categories for different metrics
 * - insufficient cards / missing data guards
 * - weak card exclusion
 * - different groupBy columns produce no cross-card insight
 */
import { describe, it, expect } from 'vitest';
import { synthesizeCrossCardInsights } from '../services/reporting/synthesizeCrossCardInsights';
import type { ReportCardEvidence } from '../types';

// --- Helpers ---

const makeCard = (
    overrides: Partial<ReportCardEvidence> & {
        cardId: string;
        groupByColumn: string;
        valueColumn: string;
        topLabel: string;
    },
): ReportCardEvidence => ({
    evidenceId: `ev-${overrides.cardId}`,
    cardId: overrides.cardId,
    isFallback: false,
    title: overrides.cardId,
    displayTitle: overrides.cardId,
    description: '',
    artifactType: null,
    chartType: 'bar',
    groupByColumn: overrides.groupByColumn,
    valueColumn: overrides.valueColumn,
    aggregation: 'sum',
    rowCount: 3,
    summary: null,
    aggregatedDataSample: [
        { [overrides.groupByColumn]: overrides.topLabel, [overrides.valueColumn]: 1000 },
        { [overrides.groupByColumn]: 'Other', [overrides.valueColumn]: 200 },
    ],
    reportChartRows: [],
    semanticRole: null,
    helperExposureLevel: null,
    businessMeaningConfidence: null,
    aggregationQualityFlags: [],
    autoAnalysisVerdict: overrides.autoAnalysisVerdict ?? 'trusted',
    ...overrides,
});

// --- Tests ---

describe('synthesizeCrossCardInsights', () => {
    it('returns empty array when fewer than 2 eligible cards', () => {
        const single = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        expect(synthesizeCrossCardInsights([])).toEqual([]);
        expect(synthesizeCrossCardInsights([single])).toEqual([]);
    });

    it('returns empty array when cards have different groupByColumn values', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Category', valueColumn: 'Cost', topLabel: 'Electronics' });
        const insights = synthesizeCrossCardInsights([c1, c2]);
        expect(insights).toHaveLength(0);
    });

    it('detects convergence when same category leads in multiple metrics', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'East' });
        const insights = synthesizeCrossCardInsights([c1, c2]);
        expect(insights).toHaveLength(1);
        expect(insights[0].type).toBe('convergence');
        expect(insights[0].insight).toContain('East');
        expect(insights[0].insight).toContain('Revenue');
        expect(insights[0].insight).toContain('Cost');
        expect(insights[0].cardIds).toContain('c1');
        expect(insights[0].cardIds).toContain('c2');
    });

    it('detects divergence when different categories lead different metrics', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'West' });
        const insights = synthesizeCrossCardInsights([c1, c2]);
        expect(insights).toHaveLength(1);
        expect(insights[0].type).toBe('divergence');
        expect(insights[0].insight).toContain('Revenue');
        expect(insights[0].insight).toContain('East');
        expect(insights[0].insight).toContain('Cost');
        expect(insights[0].insight).toContain('West');
    });

    it('excludes cards with autoAnalysisVerdict "weak"', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East', autoAnalysisVerdict: 'weak' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'East', autoAnalysisVerdict: 'weak' });
        const insights = synthesizeCrossCardInsights([c1, c2]);
        expect(insights).toHaveLength(0);
    });

    it('includes caveated cards (non-weak)', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East', autoAnalysisVerdict: 'caveated' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'East', autoAnalysisVerdict: 'caveated' });
        const insights = synthesizeCrossCardInsights([c1, c2]);
        expect(insights).toHaveLength(1);
        expect(insights[0].type).toBe('convergence');
    });

    it('skips cards with no aggregatedDataSample rows', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'East' });
        c2.aggregatedDataSample = [];
        const insights = synthesizeCrossCardInsights([c1, c2]);
        // Only c1 is eligible, not enough for a pair
        expect(insights).toHaveLength(0);
    });

    it('skips cards with null groupByColumn', () => {
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'East' });
        (c2 as any).groupByColumn = null;
        const insights = synthesizeCrossCardInsights([c1, c2]);
        expect(insights).toHaveLength(0);
    });

    it('convergence insight is sorted before divergence when both are present', () => {
        // Same groupBy on 4 cards: 2 converge on East, 2 diverge from each other in a second dimension
        const c1 = makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' });
        const c2 = makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Profit', topLabel: 'East' });
        // divergence for another groupBy
        const c3 = makeCard({ cardId: 'c3', groupByColumn: 'Category', valueColumn: 'Units', topLabel: 'A' });
        const c4 = makeCard({ cardId: 'c4', groupByColumn: 'Category', valueColumn: 'Returns', topLabel: 'B' });
        const insights = synthesizeCrossCardInsights([c1, c2, c3, c4]);
        expect(insights.length).toBeGreaterThanOrEqual(1);
        expect(insights[0].type).toBe('convergence');
    });

    it('returns at most 3 insights regardless of input size', () => {
        // 4 different dimension groups → would produce 4 insights if uncapped
        const cards = [
            makeCard({ cardId: 'c1', groupByColumn: 'Region', valueColumn: 'Revenue', topLabel: 'East' }),
            makeCard({ cardId: 'c2', groupByColumn: 'Region', valueColumn: 'Cost', topLabel: 'West' }),
            makeCard({ cardId: 'c3', groupByColumn: 'Category', valueColumn: 'Units', topLabel: 'X' }),
            makeCard({ cardId: 'c4', groupByColumn: 'Category', valueColumn: 'Returns', topLabel: 'Y' }),
            makeCard({ cardId: 'c5', groupByColumn: 'Country', valueColumn: 'Sales', topLabel: 'US' }),
            makeCard({ cardId: 'c6', groupByColumn: 'Country', valueColumn: 'Margin', topLabel: 'UK' }),
            makeCard({ cardId: 'c7', groupByColumn: 'Brand', valueColumn: 'Qty', topLabel: 'Alpha' }),
            makeCard({ cardId: 'c8', groupByColumn: 'Brand', valueColumn: 'Value', topLabel: 'Beta' }),
        ];
        const insights = synthesizeCrossCardInsights(cards);
        expect(insights.length).toBeLessThanOrEqual(3);
    });
});
