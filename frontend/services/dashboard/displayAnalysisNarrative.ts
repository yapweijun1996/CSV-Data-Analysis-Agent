import type {
    AnalysisCardData,
    ColumnProfile,
    DisplayAnalysisNarrativeInput,
} from '../../types';
import { buildDisplayAnalysisIrList } from './displayAnalysisIr';

const sortByNarrativePriority = (left: DisplayAnalysisNarrativeInput, right: DisplayAnalysisNarrativeInput) => {
    const trustRank = {
        trusted: 0,
        caveated: 1,
        weak: 2,
        null: 3,
    } as const;
    const trustDelta = trustRank[left.autoAnalysisVerdict ?? 'null'] - trustRank[right.autoAnalysisVerdict ?? 'null'];
    if (trustDelta !== 0) {
        return trustDelta;
    }
    const roleRank = {
        preferred: 0,
        allowed_neutral: 1,
        avoid_if_possible: 2,
    } as const;
    const eligibilityDelta = roleRank[left.narrativeEligibility] - roleRank[right.narrativeEligibility];
    if (eligibilityDelta !== 0) {
        return eligibilityDelta;
    }
    return right.selectionScore - left.selectionScore;
};

export const buildNarrativeAnalysisIrInputList = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[] = [],
): DisplayAnalysisNarrativeInput[] => {
    const irList = buildDisplayAnalysisIrList(cards, columnProfiles);

    return cards.map(card => {
        const ir = irList.find(candidate => candidate.cardId === card.id);
        if (!ir) {
            return {
                cardId: card.id,
                displayTitle: card.plan.title,
                displayDescription: card.plan.description,
                safeNarrativeLabels: {
                    title: card.plan.title,
                    dimension: card.plan.groupByColumn ?? null,
                    metric: card.plan.valueColumn ?? null,
                },
                semanticRole: 'business_dimension' as const,
                autoAnalysisVerdict: card.autoAnalysisEvaluation?.verdict ?? null,
                helperExposureLevel: 'medium' as const,
                businessMeaningConfidence: 0.4,
                aggregationQualityFlags: ['legacy_card_context'],
                narrativeEligibility: 'allowed_neutral' as const,
                selectionScore: 0,
                selectionReasons: ['legacy_card_context'],
                summary: card.summary.text,
                aggregatedDataSample: card.aggregatedData.slice(0, 5),
                isFallback: Boolean(card.plan.isFallback),
            };
        }

        return {
            cardId: ir.cardId,
            displayTitle: ir.displayTitle,
            displayDescription: ir.displayDescription,
            safeNarrativeLabels: ir.safeNarrativeLabels,
            semanticRole: ir.semanticRole,
            autoAnalysisVerdict: ir.autoAnalysisVerdict ?? null,
            helperExposureLevel: ir.helperExposureLevel,
            businessMeaningConfidence: ir.businessMeaningConfidence,
            aggregationQualityFlags: ir.aggregationQualityFlags,
            narrativeEligibility: ir.narrativeEligibility,
            selectionScore: ir.selectionScore,
            selectionReasons: ir.selectionReasons,
            summary: card.summary.text,
            aggregatedDataSample: ir.aggregatedData.slice(0, 5),
            isFallback: ir.isFallback,
        };
    }).sort(sortByNarrativePriority);
};

export const selectNarrativeAnalysisInputs = (
    inputs: DisplayAnalysisNarrativeInput[],
    maxCards = 6,
): DisplayAnalysisNarrativeInput[] => {
    const trustedInputs = inputs.filter(input => input.autoAnalysisVerdict === 'trusted');
    if (trustedInputs.length === 0) {
        return [];
    }
    const candidateInputs = trustedInputs;
    const preferred = candidateInputs.filter(input => input.narrativeEligibility === 'preferred');
    const allowedNeutral = candidateInputs.filter(input => input.narrativeEligibility === 'allowed_neutral');
    const avoidIfPossible = candidateInputs.filter(input => input.narrativeEligibility === 'avoid_if_possible');

    if (preferred.length > 0) {
        return [
            ...preferred.slice(0, maxCards),
            ...allowedNeutral.slice(0, Math.max(0, maxCards - preferred.length)),
        ].slice(0, maxCards);
    }

    if (allowedNeutral.length > 0) {
        return allowedNeutral.slice(0, maxCards);
    }

    return avoidIfPossible.slice(0, maxCards);
};

export const formatNarrativeAnalysisInputs = (inputs: DisplayAnalysisNarrativeInput[]): string =>
    inputs.length > 0
        ? JSON.stringify(inputs, null, 2)
        : '[]';
