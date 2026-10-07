import type { AppStore } from '../../store/useAppStore';
import { getCurrentAnalysisDatasetVersion } from '../../services/agent/artifactProvenance';
import { resolveAnalysisCompletionGate } from '../../services/agent/analysisCompletionGate';
import { resolveCardTrustDecision } from '../../services/agent/cardTrustDecision';
import { buildDisplayAnalysisIr } from '../../services/dashboard/displayAnalysisIr';

type Cards = AppStore['analysisCards'];

export const SIMPLE_VIEW_CARD_LIMIT = 2;

const TRUST_SCORE = {
    verified: 500,
    caveated: 350,
    unverified: 200,
    stale: 50,
    weak: 0,
} as const;

/**
 * Picks the few verified cards shown in the simple view: trust first, then how
 * presentable the card is (no helper noise, a clear business meaning), with
 * fallback plans penalised. Pure so the ranking can be tested on its own.
 */
export const selectSimpleViewCardIds = (params: {
    cards: Cards;
    canonicalCsvData: AppStore['canonicalCsvData'];
    csvData: AppStore['csvData'];
    columnProfiles: AppStore['columnProfiles'];
    limit?: number;
}): string[] => {
    const { cards, canonicalCsvData, csvData, columnProfiles, limit = SIMPLE_VIEW_CARD_LIMIT } = params;
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
    const completionGate = resolveAnalysisCompletionGate({ cards, currentDatasetVersion, columnProfiles });
    const trustedBusinessIds = new Set(completionGate.trustedBusinessCardIds);

    return cards
        .map((card, index) => {
            const decision = resolveCardTrustDecision(card, currentDatasetVersion);
            const display = buildDisplayAnalysisIr(card, cards, columnProfiles);
            const helperScore = display.helperExposureLevel === 'none'
                ? 80
                : display.helperExposureLevel === 'low'
                    ? 25
                    : -60;
            const narrativeScore = display.narrativeEligibility === 'preferred'
                ? 40
                : display.narrativeEligibility === 'allowed_neutral'
                    ? 15
                    : -20;
            const meaningScore = Math.round((display.businessMeaningConfidence ?? 0) * 100);
            const fallbackPenalty = card.plan.isFallback ? 75 : 0;
            return {
                id: card.id,
                index,
                score: TRUST_SCORE[decision.status]
                    + helperScore
                    + narrativeScore
                    + meaningScore
                    + display.selectionScore
                    - fallbackPenalty,
            };
        })
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .filter(candidate => trustedBusinessIds.has(candidate.id))
        .slice(0, limit)
        .map(candidate => candidate.id);
};
