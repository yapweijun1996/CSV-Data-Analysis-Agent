import type { AppStore } from '../../store/useAppStore';
import { getCurrentAnalysisDatasetVersion } from '../../services/agent/artifactProvenance';
import { resolveCardTrustDecision } from '../../services/agent/cardTrustDecision';

export interface CredibilitySummary {
    overallVerdict: 'trusted' | 'caveated' | 'weak';
    trustedCount: number;
    caveatedCount: number;
    weakCount: number;
}

/** Counts cards by trust status and derives the single verdict shown to the user. */
export const summarizeCardCredibility = (params: {
    cards: AppStore['analysisCards'];
    canonicalCsvData: AppStore['canonicalCsvData'];
    csvData: AppStore['csvData'];
}): CredibilitySummary | null => {
    const { cards, canonicalCsvData, csvData } = params;
    if (cards.length === 0) return null;
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion({ canonicalCsvData, csvData });
    let trustedCount = 0;
    let caveatedCount = 0;
    let weakCount = 0;
    for (const card of cards) {
        const decision = resolveCardTrustDecision(card, currentDatasetVersion);
        if (decision.status === 'verified') trustedCount++;
        else if (decision.status === 'caveated') caveatedCount++;
        else weakCount++;
    }
    const overallVerdict: CredibilitySummary['overallVerdict'] = trustedCount > 0
        ? (caveatedCount > 0 || weakCount > 0 ? 'caveated' : 'trusted')
        : caveatedCount > 0 && weakCount === 0
            ? 'caveated'
            : 'weak';
    return { overallVerdict, trustedCount, caveatedCount, weakCount };
};
