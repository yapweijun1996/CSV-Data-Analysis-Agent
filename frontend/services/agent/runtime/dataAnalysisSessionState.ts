import type {
    AcceptedAnalysisOutput,
    DataAnalysisHypothesis,
    DataAnalysisSessionOrigin,
    DataAnalysisSessionState,
    DataAnalysisStep,
    DataAnalysisStepType,
    RejectedAnalysisOutput,
} from '../../../types';
import { buildVisibleAnalysisTraceEntry } from './dataAnalysisTrace';
import { DATA_ANALYSIS_MAX_STEPS } from './dataAnalysisPolicy';
import { createId } from '../../../utils/createId';
import { buildSurfaceTraceContract } from './runtimeControlPlaneContract';

export const createDataAnalysisSessionState = (params: {
    sessionId: string;
    origin: DataAnalysisSessionOrigin;
    runId?: string;
}): DataAnalysisSessionState => ({
    sessionId: params.sessionId,
    runId: params.runId ?? createId('analysis-run'),
    origin: params.origin,
    status: 'queued',
    maxSteps: DATA_ANALYSIS_MAX_STEPS,
    stepsUsed: 0,
    currentStepId: null,
    stopReason: null,
    semanticUnderstanding: null,
    analysisMode: 'business',
    analysisModeReason: null,
    harnessSummary: null,
    harnessCoverage: null,
    analysisSteering: null,
    researchBrief: null,
    researchFindings: [],
    cancellationRequestedAt: null,
    hypotheses: [],
    acceptedOutputs: [],
    rejectedOutputs: [],
    queryHistory: [],
    trace: [],
    summary: null,
});

export const appendDataAnalysisStep = (
    session: DataAnalysisSessionState,
    params: {
        type: DataAnalysisStepType;
        status: DataAnalysisStep['status'];
        inputSummary: string;
        outputSummary: string;
        inputSummaryI18n?: DataAnalysisStep['inputSummaryI18n'];
        outputSummaryI18n?: DataAnalysisStep['outputSummaryI18n'];
        labelI18n?: DataAnalysisStep['labelI18n'];
        whyI18n?: DataAnalysisStep['whyI18n'];
        decision?: DataAnalysisStep['decision'];
        queryRef?: string | null;
        hypothesisId?: string | null;
        reasonCodes?: string[];
    },
): { session: DataAnalysisSessionState; step: DataAnalysisStep } => {
    const step: DataAnalysisStep = {
        id: createId('analysis-step'),
        index: session.stepsUsed + 1,
        type: params.type,
        status: params.status,
        inputSummary: params.inputSummary,
        outputSummary: params.outputSummary,
        inputSummaryI18n: params.inputSummaryI18n,
        outputSummaryI18n: params.outputSummaryI18n,
        labelI18n: params.labelI18n,
        whyI18n: params.whyI18n,
        decision: params.decision ?? null,
        queryRef: params.queryRef ?? null,
        hypothesisId: params.hypothesisId ?? null,
        reasonCodes: params.reasonCodes ?? [],
        traceContract: buildSurfaceTraceContract({
            detail: {
                stepType: params.type,
                stepStatus: params.status,
                hypothesisId: params.hypothesisId ?? null,
                stage: params.type,
            },
            reasonCode: params.reasonCodes?.[0] ?? params.type,
            source: 'analysis_runtime_step',
        }),
        startedAt: new Date(),
        endedAt: new Date(),
    };
    return {
        session: {
            ...session,
            status: session.status === 'queued' ? 'running' : session.status,
            stepsUsed: session.stepsUsed + 1,
            currentStepId: step.id,
            trace: [...session.trace, buildVisibleAnalysisTraceEntry(step)],
        },
        step,
    };
};

export const setDataAnalysisHypotheses = (
    session: DataAnalysisSessionState,
    hypotheses: DataAnalysisHypothesis[],
): DataAnalysisSessionState => ({
    ...session,
    hypotheses,
});

export const updateDataAnalysisHypothesis = (
    session: DataAnalysisSessionState,
    hypothesisId: string,
    updater: (hypothesis: DataAnalysisHypothesis) => DataAnalysisHypothesis,
): DataAnalysisSessionState => ({
    ...session,
    hypotheses: session.hypotheses.map(hypothesis =>
        hypothesis.id === hypothesisId ? updater(hypothesis) : hypothesis,
    ),
});

export const appendAcceptedAnalysisOutput = (
    session: DataAnalysisSessionState,
    output: AcceptedAnalysisOutput,
): DataAnalysisSessionState => ({
    ...session,
    acceptedOutputs: [...session.acceptedOutputs, output],
});

export const appendRejectedAnalysisOutput = (
    session: DataAnalysisSessionState,
    output: RejectedAnalysisOutput,
): DataAnalysisSessionState => ({
    ...session,
    rejectedOutputs: [...session.rejectedOutputs, output],
});

export const appendAnalysisQueryHistory = (
    session: DataAnalysisSessionState,
    entry: DataAnalysisSessionState['queryHistory'][number],
): DataAnalysisSessionState => ({
    ...session,
    queryHistory: [...session.queryHistory, {
        ...entry,
        traceContract: entry.traceContract ?? buildSurfaceTraceContract({
            detail: {
                queryMode: entry.queryMode,
                title: entry.title,
                hypothesisId: entry.hypothesisId ?? null,
                stage: 'query_history',
            },
            reasonCode: entry.querySignature ? 'query_recorded' : 'query_planned',
            source: 'analysis_query_history',
        }),
    }],
});

export const finalizeDataAnalysisSession = (
    session: DataAnalysisSessionState,
    status: DataAnalysisSessionState['status'],
    stopReason: string,
): DataAnalysisSessionState => ({
    ...session,
    status,
    stopReason,
    currentStepId: null,
    summary: {
        acceptedCardCount: session.acceptedOutputs.length,
        rejectedHypothesisCount: session.rejectedOutputs.length,
        exhaustedHypothesisCount: session.hypotheses.filter(hypothesis => hypothesis.status === 'exhausted').length,
        traceCount: session.trace.length,
    },
});
