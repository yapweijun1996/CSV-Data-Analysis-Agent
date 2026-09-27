import { describe, expect, it } from 'vitest';
import {
    buildDerivedTopicSuggestions,
    type MetricRelationship,
} from '../services/agent/runtime/dataInvestigationHarness';
import { buildHypotheses } from '../services/agent/runtime/hypothesisBuilder';
import type { RuntimeSemanticUnderstanding } from '../types';

// --- buildDerivedTopicSuggestions ---

describe('buildDerivedTopicSuggestions', () => {
    const makeRel = (
        left: string,
        right: string,
        result: string,
        matchRatio = 0.98,
    ): MetricRelationship => ({
        left,
        right,
        result,
        leftTotal: 10_000_000,
        rightTotal: 3_000_000,
        resultTotal: 7_000_000,
        matchRatio,
    });

    it('returns empty array when no relationships', () => {
        expect(buildDerivedTopicSuggestions([], {})).toEqual([]);
    });

    it('produces a profit-themed topic for revenue−cost→profit', () => {
        const rels = [makeRel('Revenue', 'Cost', 'Gross Profit')];
        const cats: Record<string, string> = {
            Revenue: 'revenue',
            Cost: 'cost',
            'Gross Profit': 'profit',
        };
        const topics = buildDerivedTopicSuggestions(rels, cats);
        expect(topics).toHaveLength(1);
        expect(topics[0]).toContain('Gross Profit');
        expect(topics[0]).toContain('Revenue');
        expect(topics[0]).toContain('Cost');
    });

    it('produces a generic component topic when categories are operating', () => {
        const rels = [makeRel('Total Budget', 'Allocated', 'Unallocated')];
        const cats: Record<string, string> = {
            'Total Budget': 'operating',
            Allocated: 'operating',
            Unallocated: 'operating',
        };
        const topics = buildDerivedTopicSuggestions(rels, cats);
        expect(topics).toHaveLength(1);
        expect(topics[0]).toContain('Unallocated');
        expect(topics[0]).toContain('component');
    });

    it('caps at 3 suggestions', () => {
        const rels = [
            makeRel('A', 'B', 'C'),
            makeRel('D', 'E', 'F'),
            makeRel('G', 'H', 'I'),
            makeRel('J', 'K', 'L'),
        ];
        const topics = buildDerivedTopicSuggestions(rels, {});
        expect(topics.length).toBeLessThanOrEqual(3);
    });
});

// --- buildHypotheses priority boost ---

describe('buildHypotheses metric relationship priority boost', () => {
    const baseSemantic: RuntimeSemanticUnderstanding = {
        businessGrains: ['Region'],
        candidateMetrics: ['Revenue'],
        timeGrains: [],
        helperDimensions: [],
        blockedDimensions: [],
        detailRowPolicy: 'preserve_all_rows',
        businessGlossary: [],
        businessGrainConfidence: 'high',
        unsafeForBusinessNarrative: false,
    };

    const baseContext = {
        dimensionColumns: ['Region', 'Product'],
        metricColumns: ['Revenue', 'Cost', 'Gross Profit'],
        preferredGrainColumns: ['Region'],
        preferredMetricTerms: ['Revenue'],
        blockedDimensions: [] as string[],
        metricRelationshipTerms: ['Revenue', 'Cost', 'Gross Profit'],
    };

    it('boosts priority for topics mentioning relationship terms', () => {
        const topics = [
            'Revenue by Region',
            'Product count breakdown',
            'Gross Profit breakdown (Revenue minus Cost)',
        ];
        const hypotheses = buildHypotheses(topics, baseSemantic, baseContext as any);
        // Topic 0 (Revenue) and Topic 2 (Gross Profit) should have +2 boost
        const revTopic = hypotheses.find(h => h.topic.includes('Revenue by Region'));
        const prodTopic = hypotheses.find(h => h.topic.includes('Product count'));
        const profitTopic = hypotheses.find(h => h.topic.includes('Gross Profit'));

        expect(revTopic).toBeDefined();
        expect(prodTopic).toBeDefined();
        expect(profitTopic).toBeDefined();
        // Revenue topic has boost, product does not
        expect(revTopic!.priority).toBeGreaterThan(prodTopic!.priority);
        // Gross Profit topic also has boost
        expect(profitTopic!.priority).toBeGreaterThan(prodTopic!.priority);
    });

    it('does not boost when no metricRelationshipTerms', () => {
        const contextNoRel = { ...baseContext, metricRelationshipTerms: undefined };
        const topics = ['Revenue by Region', 'Product count breakdown'];
        const hypotheses = buildHypotheses(topics, baseSemantic, contextNoRel as any);
        // Standard reverse-index priority: first topic = 2, second = 1
        expect(hypotheses[0].priority).toBe(2);
        expect(hypotheses[1].priority).toBe(1);
    });

    it('prefers a more specific ratio metric column over the generic derived profit term', () => {
        const topics = ['Average Profit Ratio Percentage per Unit of Measure'];
        const context = {
            dimensionColumns: ['UOM', 'SO Number'],
            metricColumns: ['Sales Amount Base', 'Profit Amount', 'Profit Ratio %'],
            preferredGrainColumns: ['UOM'],
            preferredMetricTerms: ['profit', 'Profit Ratio %', 'Profit Amount'],
            blockedDimensions: [] as string[],
            metricRelationshipTerms: [],
        };
        const semantic: RuntimeSemanticUnderstanding = {
            ...baseSemantic,
            businessGrains: ['UOM'],
            candidateMetrics: ['Profit Ratio %', 'Profit Amount'],
        };

        const hypotheses = buildHypotheses(topics, semantic, context as any);

        expect(hypotheses).toHaveLength(1);
        expect(hypotheses[0]?.metric).toBe('Profit Ratio %');
    });

    it('boosts topics that match steering preferred groupBy columns', () => {
        const topics = [
            'Revenue by Product',
            'Revenue by Region',
        ];
        const context = {
            ...baseContext,
            analysisSteering: {
                preferGroupBy: ['Region'],
                softDeprioritizeGroupBy: ['Product'],
                blockGroupBy: [],
                signalConfidence: 'high',
            },
        };

        const hypotheses = buildHypotheses(topics, baseSemantic, context as any);

        expect(hypotheses[0]?.topic).toBe('Revenue by Region');
        expect(hypotheses[0]?.priority).toBeGreaterThan(hypotheses[1]?.priority ?? 0);
    });

    it('reduces hypothesis count when steering confidence is low', () => {
        const topics = [
            'Revenue by Region',
            'Revenue by Product',
            'Revenue by Customer',
            'Revenue by Segment',
        ];
        const context = {
            ...baseContext,
            dimensionColumns: ['Region', 'Product', 'Customer', 'Segment'],
            analysisSteering: {
                preferGroupBy: [],
                softDeprioritizeGroupBy: [],
                blockGroupBy: [],
                signalConfidence: 'low',
            },
        };

        const hypotheses = buildHypotheses(topics, baseSemantic, context as any);

        expect(hypotheses.length).toBeLessThan(topics.length);
    });
});
