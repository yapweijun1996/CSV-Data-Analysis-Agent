import type { CloudAiProvider } from '../../../../types/app';

export const INITIAL_ANALYSIS_PHASES = Object.freeze([
    'inspect_structure',
    'propose_cleaning',
    'apply_safe_cleaning',
    'verify_prepared_data',
    'bind_query_engine',
    'research_questions',
    'execute_evidence',
    'finalize_artifacts',
] as const);

export type InitialAnalysisPhase = typeof INITIAL_ANALYSIS_PHASES[number];

export const INITIAL_ANALYSIS_TERMINAL_STATUSES = Object.freeze([
    'completed',
    'degraded',
    'failed',
    'cancelled',
] as const);

export type InitialAnalysisRunStatus =
    typeof INITIAL_ANALYSIS_TERMINAL_STATUSES[number];

export const INITIAL_ANALYSIS_BUDGET_LIMITS = Object.freeze({
    cleaningRounds: 3,
    hypotheses: 8,
    acceptedCards: 5,
    equivalentQueryRepairsPerHypothesis: 2,
    reservedFinalizationSteps: 1,
});

export interface InitialAnalysisProviderSelection {
    provider: CloudAiProvider;
    modelId: string;
}

/**
 * App-owned identity and intent for one automatic initial-analysis run.
 *
 * The request deliberately references the already-persisted dataset instead
 * of carrying CSV rows or a second file payload.
 */
export interface InitialAnalysisRunRequest {
    appSessionId: string;
    datasetId: string;
    datasetVersion: string;
    researchGoal: string;
    provider: InitialAnalysisProviderSelection;
    signal?: AbortSignal;
}

export interface InitialAnalysisWarning {
    code: string;
    message: string;
    phase?: InitialAnalysisPhase;
}

export interface InitialAnalysisRunError {
    code: string;
    message: string;
    retryable: boolean;
    phase?: InitialAnalysisPhase;
}

export interface InitialAnalysisRunOutcome {
    status: InitialAnalysisRunStatus;
    currentDatasetVersion: string;
    finalDatasetVersion: string;
    trustedCardIds: string[];
    warnings: InitialAnalysisWarning[];
    runtimeRunId: string;
    traceId: string;
    error?: InitialAnalysisRunError;
}

export interface InitialAnalysisBudgetState {
    cleaningRoundsUsed: number;
    hypothesesUsed: number;
    acceptedCards: number;
    equivalentQueryRepairsByHypothesis: Record<string, number>;
    finalizationStepsReserved: number;
}

/**
 * Sanitized app-owned state persisted beside a Pi checkpoint envelope.
 *
 * Raw CSV rows, query result rows, prompts, and credentials are intentionally
 * absent from this contract.
 */
export interface InitialAnalysisCheckpointHostState {
    runKind: 'initial_analysis';
    runtimeRunId: string;
    traceId: string;
    phase: InitialAnalysisPhase;
    phaseAttempt: number;
    budget: InitialAnalysisBudgetState;
    committedTransformationIds: string[];
    materializedCardFingerprints: string[];
    warningCodes: string[];
    completedToolNames: string[];
}

const REQUEST_IDENTITY_FIELDS = Object.freeze([
    'appSessionId',
    'datasetId',
    'datasetVersion',
    'researchGoal',
] as const);

const FORBIDDEN_REQUEST_PAYLOAD_FIELDS = Object.freeze([
    'csvData',
    'rawCsvData',
    'rows',
    'data',
    'file',
    'fileContents',
] as const);

const requireNonEmptyString: (
    value: unknown,
    field: string,
) => asserts value is string = (value, field) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`initial_analysis_invalid_${field}`);
    }
};

const requireBoundedInteger: (
    value: unknown,
    field: string,
    maximum: number,
) => asserts value is number = (value, field, maximum) => {
    if (
        !Number.isInteger(value)
        || (value as number) < 0
        || (value as number) > maximum
    ) {
        throw new Error(`initial_analysis_budget_${field}_invalid`);
    }
};

export const isInitialAnalysisPhase = (
    value: unknown,
): value is InitialAnalysisPhase =>
    typeof value === 'string'
    && INITIAL_ANALYSIS_PHASES.includes(value as InitialAnalysisPhase);

export const isInitialAnalysisTerminalStatus = (
    value: unknown,
): value is InitialAnalysisRunStatus =>
    typeof value === 'string'
    && INITIAL_ANALYSIS_TERMINAL_STATUSES.includes(
        value as InitialAnalysisRunStatus,
    );

export const getNextInitialAnalysisPhase = (
    phase: InitialAnalysisPhase,
): InitialAnalysisPhase | null => {
    const index = INITIAL_ANALYSIS_PHASES.indexOf(phase);
    return INITIAL_ANALYSIS_PHASES[index + 1] ?? null;
};

export const createInitialAnalysisBudgetState = (): InitialAnalysisBudgetState => ({
    cleaningRoundsUsed: 0,
    hypothesesUsed: 0,
    acceptedCards: 0,
    equivalentQueryRepairsByHypothesis: {},
    finalizationStepsReserved:
        INITIAL_ANALYSIS_BUDGET_LIMITS.reservedFinalizationSteps,
});

export const assertInitialAnalysisBudgetState = (
    budget: InitialAnalysisBudgetState,
): void => {
    requireBoundedInteger(
        budget.cleaningRoundsUsed,
        'cleaning_rounds',
        INITIAL_ANALYSIS_BUDGET_LIMITS.cleaningRounds,
    );
    requireBoundedInteger(
        budget.hypothesesUsed,
        'hypotheses',
        INITIAL_ANALYSIS_BUDGET_LIMITS.hypotheses,
    );
    requireBoundedInteger(
        budget.acceptedCards,
        'accepted_cards',
        INITIAL_ANALYSIS_BUDGET_LIMITS.acceptedCards,
    );
    requireBoundedInteger(
        budget.finalizationStepsReserved,
        'finalization_reservation',
        INITIAL_ANALYSIS_BUDGET_LIMITS.reservedFinalizationSteps,
    );
    for (const [hypothesisId, repairs] of Object.entries(
        budget.equivalentQueryRepairsByHypothesis,
    )) {
        requireNonEmptyString(hypothesisId, 'hypothesis_id');
        requireBoundedInteger(
            repairs,
            `query_repairs_${hypothesisId}`,
            INITIAL_ANALYSIS_BUDGET_LIMITS.equivalentQueryRepairsPerHypothesis,
        );
    }
};

export const assertInitialAnalysisRunRequest = (
    input: unknown,
): asserts input is InitialAnalysisRunRequest => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('initial_analysis_invalid_request');
    }
    const request = input as Record<string, unknown>;
    for (const field of REQUEST_IDENTITY_FIELDS) {
        requireNonEmptyString(request[field], field);
    }
    for (const field of FORBIDDEN_REQUEST_PAYLOAD_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(request, field)) {
            throw new Error(`initial_analysis_duplicate_payload_${field}`);
        }
    }
    if (
        !request.provider
        || typeof request.provider !== 'object'
        || Array.isArray(request.provider)
    ) {
        throw new Error('initial_analysis_invalid_provider');
    }
    const provider = request.provider as Record<string, unknown>;
    if (!['default', 'google', 'openai'].includes(String(provider.provider))) {
        throw new Error('initial_analysis_invalid_provider');
    }
    requireNonEmptyString(provider.modelId, 'model_id');
};

export const createInitialAnalysisCheckpointHostState = (
    phase: InitialAnalysisPhase = INITIAL_ANALYSIS_PHASES[0],
    identity: {
        runtimeRunId?: string;
        traceId?: string;
    } = {},
): InitialAnalysisCheckpointHostState => ({
    runKind: 'initial_analysis',
    runtimeRunId: identity.runtimeRunId ?? '',
    traceId: identity.traceId ?? '',
    phase,
    phaseAttempt: 1,
    budget: createInitialAnalysisBudgetState(),
    committedTransformationIds: [],
    materializedCardFingerprints: [],
    warningCodes: [],
    completedToolNames: [],
});
