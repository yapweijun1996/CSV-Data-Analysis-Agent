import type { AgentBudgetStatus } from '../../../types';
import { DEFAULT_MAX_AGENT_TURNS } from './runtimePolicySettings';
import { AGENT_MAX_RETRIES_PER_KEY } from '../../../config/agentDefaults';

export const MAX_AGENT_TURN_STEPS = DEFAULT_MAX_AGENT_TURNS;
export const MAX_AGENT_RETRIES_PER_KEY = AGENT_MAX_RETRIES_PER_KEY;

export const createInitialBudgetStatus = (maxSteps: number = MAX_AGENT_TURN_STEPS): AgentBudgetStatus => ({
    maxSteps,
    stepsUsed: 0,
    retryCounts: {},
    exhausted: false,
});

export const markBudgetStepUsed = (budgetStatus: AgentBudgetStatus): AgentBudgetStatus => {
    const stepsUsed = budgetStatus.stepsUsed + 1;
    return {
        ...budgetStatus,
        stepsUsed,
        exhausted: stepsUsed >= budgetStatus.maxSteps,
    };
};

export const noteRetry = (budgetStatus: AgentBudgetStatus, key: string): AgentBudgetStatus => ({
    ...budgetStatus,
    retryCounts: {
        ...budgetStatus.retryCounts,
        [key]: (budgetStatus.retryCounts[key] ?? 0) + 1,
    },
});

export const canRetry = (budgetStatus: AgentBudgetStatus, key: string): boolean =>
    (budgetStatus.retryCounts[key] ?? 0) <= MAX_AGENT_RETRIES_PER_KEY;
