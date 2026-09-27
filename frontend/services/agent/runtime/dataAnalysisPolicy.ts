import type {
    DataAnalysisHypothesis,
    DataAnalysisSessionState,
    DataAnalysisSessionStatus,
} from '../../../types';
import {
    DATA_ANALYSIS_MAX_STEPS as _MAX_STEPS,
    DATA_ANALYSIS_MAX_HYPOTHESES as _MAX_HYPOTHESES,
    DATA_ANALYSIS_MAX_QUERY_ATTEMPTS as _MAX_QUERY_ATTEMPTS,
    DATA_ANALYSIS_MAX_ACCEPTED_CARDS as _MAX_ACCEPTED_CARDS,
    DATA_ANALYSIS_FINALIZE_RESERVE_STEPS as _FINALIZE_RESERVE_STEPS,
    DATA_ANALYSIS_MIN_HYPOTHESIS_STEPS as _MIN_HYPOTHESIS_STEPS,
    DATA_ANALYSIS_MIN_TARGET_CARDS as _MIN_TARGET_CARDS,
    DATA_ANALYSIS_MAX_TOPIC_ROUNDS as _MAX_TOPIC_ROUNDS,
} from '../../../config/agentDefaults';

export const DATA_ANALYSIS_MAX_STEPS = _MAX_STEPS;
export const DATA_ANALYSIS_MAX_HYPOTHESES = _MAX_HYPOTHESES;
export const DATA_ANALYSIS_MAX_QUERY_ATTEMPTS = _MAX_QUERY_ATTEMPTS;
export const DATA_ANALYSIS_MAX_ACCEPTED_CARDS = _MAX_ACCEPTED_CARDS;
export const DATA_ANALYSIS_FINALIZE_RESERVE_STEPS = _FINALIZE_RESERVE_STEPS;
export const DATA_ANALYSIS_MIN_HYPOTHESIS_STEPS = _MIN_HYPOTHESIS_STEPS;
export const DATA_ANALYSIS_MIN_TARGET_CARDS = _MIN_TARGET_CARDS;
export const DATA_ANALYSIS_MAX_TOPIC_ROUNDS = _MAX_TOPIC_ROUNDS;

export const getNextPendingHypothesis = (session: DataAnalysisSessionState): DataAnalysisHypothesis | null =>
    session.hypotheses
        .filter(hypothesis => hypothesis.status === 'pending')
        .sort((left, right) => right.priority - left.priority)[0] ?? null;

export const computeFinalSessionStatus = (session: DataAnalysisSessionState): DataAnalysisSessionStatus => {
    if (session.acceptedOutputs.length > 0) {
        return 'completed';
    }
    if (session.trace.length > 0 || session.rejectedOutputs.length > 0 || session.queryHistory.length > 0) {
        return 'degraded';
    }
    return 'failed';
};

export const getRemainingDataAnalysisSteps = (session: DataAnalysisSessionState) =>
    Math.max(0, session.maxSteps - session.stepsUsed);

export const canStartNextHypothesis = (session: DataAnalysisSessionState) =>
    getRemainingDataAnalysisSteps(session) >= (DATA_ANALYSIS_MIN_HYPOTHESIS_STEPS + DATA_ANALYSIS_FINALIZE_RESERVE_STEPS);

export const shouldStopDataAnalysisSession = (session: DataAnalysisSessionState): string | null => {
    if (session.acceptedOutputs.length >= DATA_ANALYSIS_MAX_ACCEPTED_CARDS) {
        return 'accepted_card_limit_reached';
    }
    if (session.stepsUsed >= session.maxSteps - DATA_ANALYSIS_FINALIZE_RESERVE_STEPS) {
        return 'step_budget_exhausted';
    }
    const hasRemaining = session.hypotheses.some(hypothesis => hypothesis.status === 'pending' || hypothesis.status === 'active');
    if (!hasRemaining) {
        return 'all_hypotheses_exhausted';
    }
    return null;
};
