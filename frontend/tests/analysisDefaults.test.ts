// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { mapGoalCandidatesToSuggestedActions } from '../services/agent/analysisDefaults';

describe('analysisDefaults', () => {
    it('reranks follow-up suggestions toward preferred grain and away from avoid-grain terms', () => {
        const suggestions = mapGoalCandidatesToSuggestedActions(
            [
                {
                    title: 'Compare Value by Item',
                    description: 'Use the Item label as the primary grouping.',
                    confidence: 0.92,
                },
                {
                    title: 'Compare Revenue by Bucket',
                    description: 'Evaluate revenue differences by bucket.',
                    confidence: 0.78,
                },
            ],
            {
                preferredGrainColumns: ['Bucket'],
                avoidGrainColumns: ['Item'],
                preferredMetricTerms: ['Revenue'],
                preferredTimeColumns: [],
            },
        );

        expect(suggestions[0]).toMatchObject({
            label: 'Compare Revenue by Bucket',
            action: 'Compare Revenue by Bucket',
        });
    });

    it('boosts time-trend follow-ups when a preferred time grain exists', () => {
        const suggestions = mapGoalCandidatesToSuggestedActions(
            [
                {
                    title: 'Compare Revenue by Region',
                    description: 'Evaluate revenue differences across regions.',
                    confidence: 0.9,
                },
                {
                    title: 'Revenue trend by OrderDate',
                    description: 'Track revenue over time by order date.',
                    confidence: 0.72,
                },
            ],
            {
                preferredGrainColumns: ['Region'],
                avoidGrainColumns: [],
                preferredMetricTerms: ['Revenue'],
                preferredTimeColumns: ['OrderDate'],
            },
        );

        expect(suggestions[0]).toMatchObject({
            label: 'Revenue trend by OrderDate',
            action: 'Revenue trend by OrderDate',
        });
    });

    it('reranks follow-up suggestions toward business-facing wording when metric columns are generic', () => {
        const suggestions = mapGoalCandidatesToSuggestedActions(
            [
                {
                    title: 'Compare Amount by Project',
                    description: 'Review amount by project.',
                    confidence: 0.9,
                },
                {
                    title: 'Compare Project Profitability',
                    description: 'Review project profitability by project.',
                    confidence: 0.74,
                },
            ],
            {
                preferredGrainColumns: ['Project'],
                avoidGrainColumns: [],
                preferredMetricTerms: ['Value'],
                preferredTimeColumns: [],
                preferredBusinessTerms: ['Project Profitability', 'Profitability'],
            },
        );

        expect(suggestions[0]).toMatchObject({
            label: 'Compare Project Profitability',
            action: 'Compare Project Profitability',
        });
    });
});
