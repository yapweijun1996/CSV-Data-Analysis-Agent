import type {
    ReportCardEvidence,
    ReportCardTrustDecision,
    ReportCardTrustReasonCode,
    ReportExcludedEvidence,
    ReportGenerationGate,
    ReportReadiness,
} from '../../types';

const formatConfidence = (value: number | null): string =>
    typeof value === 'number' ? value.toFixed(2) : 'unknown';

const buildDetail = (card: ReportCardEvidence, reasonCodes: ReportCardTrustReasonCode[]): string => {
    const reasons = reasonCodes.map(code => {
        switch (code) {
            case 'narrative_ineligible':
                return `narrative=${String(card.semanticRole ?? 'unknown')}`;
            case 'helper_exposure':
                return `helperExposure=${String(card.helperExposureLevel ?? 'unknown')}`;
            case 'low_business_confidence':
                return `businessMeaningConfidence=${formatConfidence(card.businessMeaningConfidence)}`;
            case 'aggregation_quality_warning':
                return `aggregationFlags=${card.aggregationQualityFlags.join(', ')}`;
            case 'fallback_plan':
                return 'fallback_plan=true';
            case 'dimension_quality_warning':
                return 'dimension_quality_warning=true';
            case 'metric_quality_warning':
                return 'metric_quality_warning=true';
            case 'unclassified_share_warning':
                return 'unclassified_share_warning=true';
            case 'stale_dataset_version':
                return `artifactVersion=${card.provenanceDatasetVersion ?? 'unknown'} currentVersion=${card.currentDatasetVersion ?? 'unknown'}`;
            case 'unverified_provenance':
                return `provenance=${card.provenanceStatus}`;
            case 'degraded_provenance':
                return `provenance=degraded reasons=${(card.provenanceReasons ?? []).join(', ')}`;
            default:
                return code;
        }
    });

    return reasons.join(' | ');
};

// Reason codes that hard-exclude a card from any report (even caveated).
const HARD_EXCLUDE_REASONS: ReadonlySet<ReportCardTrustReasonCode> = new Set([
    'fallback_plan',
    'narrative_ineligible',
    'helper_exposure',
    'stale_dataset_version',
    'unverified_provenance',
]);

export interface ReportCardTrustResult {
    includedCards: ReportCardEvidence[];
    excludedEvidence: ReportExcludedEvidence[];
    includedCardIds: string[];
    excludedCardIds: string[];
    trustedIncludedCount: number;
    /** Cards included only because of the soft-include rule (caveated). */
    caveatedIncludedCount: number;
}

export const resolveReportCardTrust = (
    cards: ReportCardEvidence[],
): ReportCardTrustResult => {
    const includedCards: ReportCardEvidence[] = [];
    const excludedEvidence: ReportExcludedEvidence[] = [];
    let caveatedIncludedCount = 0;

    cards.forEach(card => {
        const reasonCodes: ReportCardTrustReasonCode[] = [];

        if (card.helperExposureLevel !== 'none') {
            reasonCodes.push('helper_exposure');
        }
        if (card.semanticRole === 'helper_dimension' || card.semanticRole === 'helper_row_index' || card.semanticRole === 'helper_classification') {
            reasonCodes.push('narrative_ineligible');
        }
        if ((card.businessMeaningConfidence ?? 0) < 0.75) {
            reasonCodes.push('low_business_confidence');
        }
        if (card.aggregationQualityFlags.length > 0) {
            reasonCodes.push('aggregation_quality_warning');
        }
        if (card.isFallback) {
            reasonCodes.push('fallback_plan');
        }
        if (card.autoAnalysisReasonCodes?.includes('dimension_quality_warning')) {
            reasonCodes.push('dimension_quality_warning');
        }
        if (card.autoAnalysisReasonCodes?.includes('metric_quality_warning')) {
            reasonCodes.push('metric_quality_warning');
        }
        if (card.autoAnalysisReasonCodes?.includes('unclassified_share_warning')) {
            reasonCodes.push('unclassified_share_warning');
        }
        if (card.trustStatus === 'stale' || card.provenanceIsStale) {
            reasonCodes.push('stale_dataset_version');
        }
        if (
            card.trustStatus === 'unverified'
            || card.trustStatus === 'weak'
            || card.provenanceStatus === 'unverified'
            || card.provenanceStatus === 'hypothesis'
        ) {
            reasonCodes.push('unverified_provenance');
        }
        if (card.trustStatus === 'caveated' || card.provenanceStatus === 'degraded') {
            reasonCodes.push('degraded_provenance');
        }

        // Fully trusted — no caveats at all.
        if (reasonCodes.length === 0) {
            includedCards.push(card);
            return;
        }

        // Soft-include: cards that only have soft caveats (low_business_confidence,
        // aggregation_quality_warning) are still useful for reporting with a caveat
        // banner.  Cards with hard-exclude reasons are always excluded.
        const hasHardExclude = reasonCodes.some(code => HARD_EXCLUDE_REASONS.has(code));
        if (!hasHardExclude) {
            includedCards.push(card);
            caveatedIncludedCount += 1;
            return;
        }

        excludedEvidence.push({
            decision: 'excluded',
            evidenceId: card.evidenceId,
            cardId: card.cardId,
            title: card.title,
            displayTitle: card.displayTitle,
            detail: buildDetail(card, reasonCodes),
            reasonCodes,
        });
    });

    return {
        includedCards,
        excludedEvidence,
        includedCardIds: includedCards.map(card => card.cardId),
        excludedCardIds: excludedEvidence.map(entry => entry.cardId),
        trustedIncludedCount: includedCards.length - caveatedIncludedCount,
        caveatedIncludedCount,
    };
};

export const resolveReportGenerationGate = (
    reportReadiness: ReportReadiness,
    trustedCardsCount: number,
    reportReadinessReason: string,
): {
    gate: ReportGenerationGate;
    blockers: string[];
} => {
    if (reportReadiness === 'blocked') {
        return {
            gate: 'blocked',
            blockers: [reportReadinessReason],
        };
    }

    if (trustedCardsCount === 0) {
        return {
            gate: 'blocked',
            blockers: ['No trusted report evidence cards qualified for analyst reporting.'],
        };
    }

    if (reportReadiness === 'partial') {
        return {
            gate: 'allowed_with_caveats',
            blockers: [],
        };
    }

    return {
        gate: 'allowed',
        blockers: [],
    };
};

/**
 * Convenience overload that accounts for soft-included caveated cards.
 * `includedCardsCount` includes both fully-trusted AND caveated-but-includable
 * cards.  When all included cards are caveated the gate becomes
 * `allowed_with_caveats` instead of `blocked`.
 */
export const resolveReportGenerationGateV2 = (
    reportReadiness: ReportReadiness,
    includedCardsCount: number,
    caveatedIncludedCount: number,
    reportReadinessReason: string,
): {
    gate: ReportGenerationGate;
    blockers: string[];
} => {
    if (reportReadiness === 'blocked') {
        return { gate: 'blocked', blockers: [reportReadinessReason] };
    }

    if (includedCardsCount === 0) {
        return { gate: 'blocked', blockers: ['No trusted report evidence cards qualified for analyst reporting.'] };
    }

    const allCaveated = caveatedIncludedCount === includedCardsCount;
    if (reportReadiness === 'partial' || allCaveated) {
        return { gate: 'allowed_with_caveats', blockers: [] };
    }

    return { gate: 'allowed', blockers: [] };
};

export const resolveArtifactStatus = (gate: ReportGenerationGate): 'ready' | 'partial' | 'blocked' => {
    if (gate === 'blocked') {
        return 'blocked';
    }

    return gate === 'allowed_with_caveats' ? 'partial' : 'ready';
};

export const getLatestReportArtifactPath = (suffix: string): string => `/workspace/reports/latest-analyst-report.${suffix}`;
