import type { AnalysisCardData, CardTrustDecision } from '../../types';

/**
 * Card trust gating is removed: the app no longer grades a card's evidence, so every card is treated as
 * trusted and no Verified / needs-review badge is derived from it. Kept as one seam for existing callers.
 */
export const resolveCardTrustDecision = (
    _card?: Pick<AnalysisCardData, 'autoAnalysisEvaluation' | 'provenance'>,
    _currentDatasetVersion?: string | null,
): CardTrustDecision => ({ status: 'verified', reasonCodes: [], detail: 'verified' });
