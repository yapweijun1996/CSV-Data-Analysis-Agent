import type { AnalysisCardData, ColumnProfile } from '../../types';
import { buildDisplayAnalysisIr } from '../dashboard/displayAnalysisIr';
import { resolveCardTrustDecision } from './cardTrustDecision';

export interface AnalysisCompletionGateDecision {
    status: 'complete' | 'blocked';
    trustedBusinessCardIds: string[];
    reasonCode: 'trusted_business_conclusion_available' | 'no_trusted_business_conclusion';
}

export const resolveAnalysisCompletionGate = (input: {
    cards: AnalysisCardData[];
    currentDatasetVersion: string | null | undefined;
    columnProfiles?: ColumnProfile[] | null;
}): AnalysisCompletionGateDecision => {
    const trustedBusinessCardIds = input.cards
        .filter(card => {
            if (resolveCardTrustDecision(card, input.currentDatasetVersion).status !== 'verified') {
                return false;
            }
            if (!Array.isArray(card.aggregatedData) || card.aggregatedData.length === 0) {
                return false;
            }
            const display = buildDisplayAnalysisIr(card, input.cards, input.columnProfiles ?? []);
            // Generic record counts are useful structural evidence, but they do
            // not by themselves satisfy the GA requirement for a concrete
            // business conclusion. Keep the cards visible while preventing a
            // count-only run from being labelled complete.
            if (display.aggregationQualityFlags.includes('count_only_view')) {
                return false;
            }
            return (display.semanticRole === 'business_dimension' || display.semanticRole === 'metric_only')
                && display.narrativeEligibility !== 'avoid_if_possible'
                && display.businessMeaningConfidence >= 0.5;
        })
        .map(card => card.id);

    return trustedBusinessCardIds.length > 0
        ? {
            status: 'complete',
            trustedBusinessCardIds,
            reasonCode: 'trusted_business_conclusion_available',
        }
        : {
            status: 'blocked',
            trustedBusinessCardIds: [],
            reasonCode: 'no_trusted_business_conclusion',
        };
};
