import type {
    RuntimeClarificationBudget,
    RuntimeDoneCriteria,
    RuntimeFallbackPolicy,
    RuntimeObservationSnapshot,
    RuntimeRecoveryDirective,
    RuntimeStepContract,
    RuntimeTaskCommitment,
    ToolName,
} from '../../../types';

const normalizeFingerprint = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160);

export const buildClarificationQuestionFingerprint = (question: string | null | undefined): string | null => {
    const normalized = typeof question === 'string' ? normalizeFingerprint(question) : '';
    return normalized || null;
};

const inferMustPreserveOutcome = (
    expectedOutcome: RuntimeStepContract['expectedOutcome'],
): RuntimeTaskCommitment['mustPreserveOutcome'] => {
    if (expectedOutcome === 'table' || expectedOutcome === 'card' || expectedOutcome === 'derived_metric') {
        return expectedOutcome;
    }
    return 'answer';
};

const buildSuccessOutcome = (
    expectedOutcome: RuntimeStepContract['expectedOutcome'],
    taskMode: RuntimeStepContract['taskMode'],
): string => {
    switch (expectedOutcome) {
        case 'card':
            return 'Produce a grounded analysis card or analysis plan.';
        case 'table':
            return 'Produce a bounded table or record view grounded in the current dataset.';
        case 'derived_metric':
            return 'Produce a validated derived metric or the deterministic path to derive it.';
        case 'clarification':
            return 'Resolve the ambiguity with one bounded clarification.';
        default:
            return 'Produce a grounded assistant answer from visible evidence or one bounded tool step.';
    }
};

export const buildRuntimeObservationSnapshot = ({
    latestUserMessage,
    originalUserRequest,
    selectedPath,
    clarificationQuestion,
    clarificationAssessment,
    assumptionSummary,
    hasVisibleEvidence,
    hasUsableEvidence,
    availableToolNames,
}: {
    latestUserMessage: string;
    originalUserRequest: string;
    selectedPath: string;
    clarificationQuestion?: string | null;
    clarificationAssessment?: 'resolved' | 'best_effort_continue' | 'still_ambiguous' | null;
    assumptionSummary?: string | null;
    hasVisibleEvidence: boolean;
    hasUsableEvidence: boolean;
    availableToolNames: ToolName[];
}): RuntimeObservationSnapshot => ({
    latestUserMessage: latestUserMessage.trim(),
    originalUserRequest: originalUserRequest.trim(),
    selectedPath: selectedPath.trim(),
    clarificationQuestion: clarificationQuestion?.trim() || null,
    clarificationAssessment: clarificationAssessment ?? null,
    assumptionSummary: assumptionSummary?.trim() || null,
    hasVisibleEvidence,
    hasUsableEvidence,
    availableToolNames,
});

export const buildRuntimeTaskCommitment = ({
    originalUserRequest,
    committedObjective,
    selectedPath,
    expectedOutcome,
    taskMode,
    assumptionMode,
    mustPreserveOutcome,
}: {
    originalUserRequest: string;
    committedObjective: string;
    selectedPath: string;
    expectedOutcome: RuntimeStepContract['expectedOutcome'];
    taskMode: RuntimeStepContract['taskMode'];
    assumptionMode: RuntimeTaskCommitment['assumptionMode'];
    mustPreserveOutcome?: RuntimeTaskCommitment['mustPreserveOutcome'];
}): RuntimeTaskCommitment => ({
    originalUserRequest: originalUserRequest.trim(),
    committedObjective: committedObjective.trim(),
    selectedPath: selectedPath.trim(),
    successOutcome: buildSuccessOutcome(expectedOutcome, taskMode),
    mustPreserveOutcome: mustPreserveOutcome ?? inferMustPreserveOutcome(expectedOutcome),
    assumptionMode,
});

export const buildRuntimeFallbackPolicy = ({
    expectedOutcome,
    allowAssistantResponse,
    hasUsableEvidence,
    allowToolFamilySwitch,
    preferredFallback,
}: {
    expectedOutcome: RuntimeStepContract['expectedOutcome'];
    allowAssistantResponse: boolean;
    hasUsableEvidence: boolean;
    allowToolFamilySwitch: boolean;
    /** AGENT-112: Capability-driven fallback preference. */
    preferredFallback?: 'answer' | 'clarify' | 'replan' | null;
}): RuntimeFallbackPolicy => {
    // AGENT-112: Capability can force a specific fallback strategy
    if (preferredFallback === 'answer') {
        return {
            blockedToolStrategy: 'fallback_answer',
            deniedToolStrategy: 'fallback_answer',
            maxClarificationRounds: 1,
            allowToolFamilySwitch: false,
        };
    }
    if (preferredFallback === 'clarify') {
        return {
            blockedToolStrategy: 'clarify_once',
            deniedToolStrategy: 'clarify_once',
            maxClarificationRounds: 1,
            allowToolFamilySwitch: false,
        };
    }
    if (preferredFallback === 'replan') {
        return {
            blockedToolStrategy: 'fallback_plan',
            deniedToolStrategy: 'switch_tool_family',
            maxClarificationRounds: 1,
            allowToolFamilySwitch: true,
        };
    }

    const fallbackToAnswer = allowAssistantResponse || hasUsableEvidence;
    return {
        blockedToolStrategy: expectedOutcome === 'card' && allowToolFamilySwitch
            ? 'fallback_plan'
            : fallbackToAnswer
                ? 'fallback_answer'
                : 'clarify_once',
        deniedToolStrategy: allowToolFamilySwitch
            ? 'switch_tool_family'
            : fallbackToAnswer
                ? 'fallback_answer'
                : 'clarify_once',
        maxClarificationRounds: 1,
        allowToolFamilySwitch,
    };
};

export const buildRuntimeDoneCriteria = ({
    expectedOutcome,
    allowAssistantResponse,
    hasUsableEvidence,
    clarificationState,
    capabilityDoneCriteria,
}: {
    expectedOutcome: RuntimeStepContract['expectedOutcome'];
    allowAssistantResponse: boolean;
    hasUsableEvidence: boolean;
    clarificationState?: RuntimeStepContract['clarificationState'];
    /** AGENT-112: Capability-provided completion checks override default isDoneWhen. */
    capabilityDoneCriteria?: string[] | null;
}): RuntimeDoneCriteria => {
    // AGENT-112: Capability completion checks take precedence when provided
    const isDoneWhen = (capabilityDoneCriteria && capabilityDoneCriteria.length > 0)
        ? capabilityDoneCriteria
        : expectedOutcome === 'card'
            ? ['A grounded card or analysis plan exists.', 'A bounded assistant answer explains why card creation cannot continue on the current allowed path.']
            : expectedOutcome === 'table'
                ? ['A grounded table/query result exists.', 'A bounded assistant answer summarizes the visible table evidence.']
                : expectedOutcome === 'derived_metric'
                    ? ['A validated derived metric exists.', 'A deterministic derive/validation path is produced.']
                    : expectedOutcome === 'clarification'
                        ? ['One bounded clarification question has been issued.']
                        : ['A grounded assistant answer has been produced.'];

    return {
        isDoneWhen,
        isDoneWithPartial: allowAssistantResponse && hasUsableEvidence
            ? 'If tools are blocked, finish with a bounded answer that states the remaining limitation explicitly.'
            : clarificationState === 'best_effort'
                ? 'Do not reopen the same clarification. Finish with the most defensible bounded answer or allowed fallback path.'
                : null,
        mustNotDo: [
            'Do not reopen the same clarification loop.',
            'Do not retry the same blocked or denied tool unchanged.',
            'Do not discard the committed user objective after clarification resume.',
        ],
    };
};

export const buildRuntimeClarificationBudget = ({
    roundsUsed,
    questionFingerprint,
    bestEffortConsumed,
}: {
    roundsUsed: number;
    questionFingerprint?: string | null;
    bestEffortConsumed: boolean;
}): RuntimeClarificationBudget => ({
    roundsUsed,
    sameQuestionFingerprint: questionFingerprint ?? null,
    bestEffortConsumed,
});

export const buildRuntimeRecoveryDirective = ({
    nextMode,
    forbiddenToolNames,
    preferredToolNames,
    reason,
}: {
    nextMode: RuntimeRecoveryDirective['nextMode'];
    forbiddenToolNames?: ToolName[];
    preferredToolNames?: ToolName[];
    reason: string;
}): RuntimeRecoveryDirective => ({
    nextMode,
    forbiddenToolNames: forbiddenToolNames ?? [],
    preferredToolNames: preferredToolNames ?? [],
    reason,
});

export const withRuntimeContractMetadata = ({
    contract,
    observationSnapshot,
    taskCommitment,
    fallbackPolicy,
    doneCriteria,
    clarificationBudget,
    recoveryDirective,
    oodaePhase = 'orient',
}: {
    contract: RuntimeStepContract;
    observationSnapshot: RuntimeObservationSnapshot;
    taskCommitment: RuntimeTaskCommitment;
    fallbackPolicy: RuntimeFallbackPolicy;
    doneCriteria: RuntimeDoneCriteria;
    clarificationBudget: RuntimeClarificationBudget;
    recoveryDirective: RuntimeRecoveryDirective;
    oodaePhase?: RuntimeStepContract['oodaePhase'];
}): RuntimeStepContract => ({
    ...contract,
    oodaePhase,
    observationSnapshot,
    taskCommitment,
    fallbackPolicy,
    doneCriteria,
    clarificationBudget,
    recoveryDirective,
});

export const inheritRuntimeContractMetadata = ({
    nextContract,
    currentContract,
    recoveryDirective,
    clarificationBudget,
    oodaePhase = 'orient',
}: {
    nextContract: RuntimeStepContract;
    currentContract: RuntimeStepContract;
    recoveryDirective?: RuntimeRecoveryDirective | null;
    clarificationBudget?: RuntimeClarificationBudget | null;
    oodaePhase?: RuntimeStepContract['oodaePhase'];
}): RuntimeStepContract => ({
    ...nextContract,
    oodaePhase,
    observationSnapshot: nextContract.observationSnapshot ?? currentContract.observationSnapshot ?? null,
    taskCommitment: currentContract.taskCommitment ?? nextContract.taskCommitment ?? null,
    fallbackPolicy: nextContract.fallbackPolicy ?? currentContract.fallbackPolicy ?? null,
    doneCriteria: nextContract.doneCriteria ?? currentContract.doneCriteria ?? null,
    clarificationBudget: clarificationBudget ?? nextContract.clarificationBudget ?? currentContract.clarificationBudget ?? null,
    recoveryDirective: recoveryDirective ?? nextContract.recoveryDirective ?? currentContract.recoveryDirective ?? null,
});
