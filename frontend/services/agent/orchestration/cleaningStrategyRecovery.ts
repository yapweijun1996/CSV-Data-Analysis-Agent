import type {
    CleaningAttemptedStrategy,
    CleaningFailureDetail,
    CleaningStrategyCandidate,
    CleaningStrategyPreflightResult,
    CleaningStrategyRequirement,
    CsvData,
} from '../../../types';
import { hasExecutableHierarchyShape } from '../../ai/planValidation';
import { getTranslation } from '../../../utils/localization';

type EligibilityContext = {
    currentRound: number;
    attemptedStrategies?: CleaningAttemptedStrategy[] | null;
    disallowedRequirements?: CleaningStrategyRequirement[] | null;
};

const hasRecentFailureForRequirement = (
    attemptedStrategies: CleaningAttemptedStrategy[] | null | undefined,
    requirement: CleaningStrategyRequirement,
    reasonCode: string,
    currentRound: number,
) => (attemptedStrategies ?? []).some(strategy =>
    strategy.requirement === requirement
    && strategy.reasonCode === reasonCode
    && strategy.round >= currentRound - 1,
);

const buildPreflightResult = (
    executable: boolean,
    reasonCode: string | null,
    userMessage: string,
    technicalDetail: string | null,
    fallbackRecommendation: CleaningStrategyPreflightResult['fallbackRecommendation'],
): CleaningStrategyPreflightResult => ({
    executable,
    reasonCode,
    userMessage,
    technicalDetail,
    fallbackRecommendation,
});

export const evaluateCleaningStrategyEligibility = (
    workingData: CsvData,
    candidate: CleaningStrategyCandidate,
    context: EligibilityContext,
): CleaningStrategyPreflightResult => {
    const disallowedRequirements = new Set(context.disallowedRequirements ?? []);

    for (const requirement of candidate.requires) {
        if (disallowedRequirements.has(requirement)) {
            return buildPreflightResult(
                false,
                'strategy_requirement_disallowed',
                'The runtime skipped a cleaning strategy that is currently unsafe for this dataset state.',
                `Strategy "${candidate.strategyId}" requires "${requirement}", which the runtime already marked as unsafe for the current working dataset.`,
                'deterministic_cleanup',
            );
        }
    }

    if (candidate.requires.includes('hierarchical_shape')) {
        if (hasRecentFailureForRequirement(context.attemptedStrategies, 'hierarchical_shape', 'hierarchy_shape_missing', context.currentRound)) {
            return buildPreflightResult(
                false,
                'hierarchy_shape_cooldown',
                'The runtime already proved that hierarchy-only cleaning is unsafe for the current dataset state, so it will not retry the same path immediately.',
                `Strategy "${candidate.strategyId}" was skipped because a hierarchy-only strategy already failed preflight in the current or previous round.`,
                'deterministic_cleanup',
            );
        }

        if (!hasExecutableHierarchyShape(workingData.data, workingData)) {
            return buildPreflightResult(
                false,
                'hierarchy_shape_missing',
                'The runtime skipped a hierarchy-preserving cleaning strategy because the current prepared dataset no longer has an executable hierarchical statement shape.',
                `Strategy "${candidate.strategyId}" includes annotate_hierarchy, but the current working dataset does not satisfy the executor hierarchy gate.`,
                'agent_retry',
            );
        }
    }

    return buildPreflightResult(true, null, 'Strategy is executable.', null, null);
};

export const buildCleaningFailureDetail = (input: {
    summary: string;
    actionTaken?: string | null;
    dataSafety?: string | null;
    nextState?: string | null;
    technicalDetail?: string | null;
}): CleaningFailureDetail => ({
    summary: input.summary,
    actionTaken: input.actionTaken ?? null,
    dataSafety: input.dataSafety ?? null,
    nextState: input.nextState ?? null,
    technicalDetail: input.technicalDetail ?? null,
});

export const buildHierarchyMismatchFailureDetail = (
    technicalDetail: string,
    language: string = 'English',
): CleaningFailureDetail => buildCleaningFailureDetail({
    summary: getTranslation('cleaning_hierarchy_mismatch_summary', language),
    actionTaken: getTranslation('cleaning_hierarchy_mismatch_action', language),
    dataSafety: getTranslation('cleaning_hierarchy_mismatch_safety', language),
    nextState: getTranslation('cleaning_hierarchy_mismatch_next', language),
    technicalDetail,
});

export const toCleaningFailureChatText = (detail: CleaningFailureDetail) => [
    detail.summary,
    detail.actionTaken,
    detail.dataSafety,
    detail.nextState,
].filter(Boolean).join(' ');
