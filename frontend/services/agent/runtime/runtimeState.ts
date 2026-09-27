import type {
    AgentBudgetStatus,
    AgentObservation,
    AgentStep,
    AgentTurn,
    AiAction,
    ClarificationRequest,
    RuntimeRecoveryState,
    RuntimeStepContract,
    RuntimeTaskCommitment,
    RuntimeLifecycleState,
    ToolExecutionResult,
} from '../../../types';
import { createInitialBudgetStatus, markBudgetStepUsed } from './runtimeBudget';
import { DEFAULT_MAX_AGENT_TURNS } from './runtimePolicySettings';
import { createId } from '../../../utils/createId';
import { STEP_ARTIFACT_RETAINED_ROWS } from '../../../config/agentDefaults';

const createRunId = () => createId('agent-run');
const createTurnId = () => createId('agent-turn');
const createStepId = () => createId('agent-step');

export const createAgentTurn = (
    userMessage: string,
    options?: {
        maxSteps?: number;
        runtimeCommitment?: RuntimeTaskCommitment | null;
        runtimeStepContract?: RuntimeStepContract | null;
        recoveryState?: RuntimeRecoveryState | null;
    },
): AgentTurn => ({
    runId: createRunId(),
    turnId: createTurnId(),
    userMessage,
    status: 'running',
    lifecycleState: 'selecting',
    startedAt: new Date(),
    finalMessage: null,
    pendingClarificationRequest: null,
    lastObservation: null,
    runtimeCommitment: options?.runtimeCommitment ?? null,
    runtimeStepContract: options?.runtimeStepContract ?? null,
    recoveryState: options?.recoveryState ?? null,
    budgetStatus: createInitialBudgetStatus(options?.maxSteps ?? DEFAULT_MAX_AGENT_TURNS),
    steps: [],
});

export const startAgentStep = (turn: AgentTurn, action: AiAction): AgentTurn => {
    const stepId = createStepId();
    const toolCallId = action.type === 'tool_call' ? stepId : undefined;

    return {
        ...turn,
        lifecycleState: 'executing',
        budgetStatus: markBudgetStepUsed(turn.budgetStatus),
        steps: [
            ...turn.steps,
            {
                stepId,
                turnId: turn.turnId,
                toolCallId,
                index: turn.steps.length + 1,
                action,
                status: 'in_progress',
                startedAt: new Date(),
            },
        ],
    };
};

export const completeAgentStep = (
    turn: AgentTurn,
    result: ToolExecutionResult,
    observation: AgentObservation,
): AgentTurn => {
    const steps = [...turn.steps];
    const currentStep = steps.at(-1);
    if (!currentStep) {
        return turn;
    }
    steps[steps.length - 1] = {
        ...currentStep,
        status: result.status === 'blocked' ? 'blocked' : result.status === 'error' ? 'error' : 'completed',
        completedAt: new Date(),
        result,
        observation,
    };

    return {
        ...turn,
        lifecycleState: 'executing',
        steps,
        lastObservation: observation,
    };
};

export const reviseLastStepObservation = (
    turn: AgentTurn,
    observation: AgentObservation,
): AgentTurn => {
    const steps = [...turn.steps];
    const currentStep = steps.at(-1);
    if (!currentStep) {
        return {
            ...turn,
            lastObservation: observation,
        };
    }

    steps[steps.length - 1] = {
        ...currentStep,
        status: observation.status === 'blocked' ? 'blocked' : observation.status === 'error' ? 'error' : currentStep.status,
        completedAt: currentStep.completedAt ?? new Date(),
        result: currentStep.result
            ? {
                ...currentStep.result,
                status: observation.status === 'blocked' ? 'blocked' : observation.status === 'error' ? 'error' : currentStep.result.status,
                observation,
                retryHint: observation.retryHint ?? currentStep.result.retryHint ?? null,
            }
            : currentStep.result,
        observation,
    };

    return {
        ...turn,
        lifecycleState: turn.lifecycleState ?? 'executing',
        steps,
        lastObservation: observation,
    };
};

export const markTurnWaitingForClarification = (
    turn: AgentTurn,
    clarification: ClarificationRequest | null,
): AgentTurn => ({
    ...turn,
    status: 'waiting_for_clarification',
    lifecycleState: 'waiting_for_clarification',
    pendingClarificationRequest: clarification,
});

export const completeAgentTurn = (turn: AgentTurn, finalMessage: string | null = null): AgentTurn => ({
    ...turn,
    status: 'completed',
    lifecycleState: 'completed',
    completedAt: new Date(),
    finalMessage,
    pendingClarificationRequest: null,
});

export const failAgentTurn = (turn: AgentTurn, observation: AgentObservation): AgentTurn => ({
    ...turn,
    status: 'failed',
    lifecycleState: 'failed',
    completedAt: new Date(),
    lastObservation: observation,
    finalMessage: observation.summary,
});

export const cancelAgentTurn = (turn: AgentTurn, observation: AgentObservation): AgentTurn => ({
    ...turn,
    status: 'cancelled',
    lifecycleState: 'cancelled',
    completedAt: new Date(),
    lastObservation: observation,
    finalMessage: observation.summary,
    pendingClarificationRequest: null,
});

export const withUpdatedBudgetStatus = (turn: AgentTurn, budgetStatus: AgentBudgetStatus): AgentTurn => ({
    ...turn,
    budgetStatus,
});

export const withLifecycleState = (turn: AgentTurn, lifecycleState: RuntimeLifecycleState): AgentTurn => ({
    ...turn,
    lifecycleState,
});

export const withLastObservation = (turn: AgentTurn, observation: AgentObservation): AgentTurn => ({
    ...turn,
    lastObservation: observation,
});

export const withRuntimeContractState = (
    turn: AgentTurn,
    options: {
        runtimeCommitment?: RuntimeTaskCommitment | null;
        runtimeStepContract?: RuntimeStepContract | null;
        recoveryState?: RuntimeRecoveryState | null;
    },
): AgentTurn => ({
    ...turn,
    runtimeCommitment: options.runtimeCommitment ?? turn.runtimeCommitment ?? null,
    runtimeStepContract: options.runtimeStepContract ?? turn.runtimeStepContract ?? null,
    recoveryState: options.recoveryState ?? turn.recoveryState ?? null,
});

/**
 * Truncate row arrays in the last step's result.artifacts to prevent
 * unbounded memory growth on multi-step turns.
 *
 * Call AFTER evaluateHarness has consumed the full row data — it reads
 * from the local `result` variable, not from the turn's stored copy.
 *
 * Mirrors the truncation pattern in runtimeEvaluator.ts truncateArtifactRows().
 */
export const truncateStepResultArtifacts = (turn: AgentTurn): AgentTurn => {
    const lastStep = turn.steps.at(-1);
    if (!lastStep?.result?.artifacts) return turn;

    const artifacts = { ...lastStep.result.artifacts } as Record<string, unknown>;
    let changed = false;

    // activeDataQuery.result.rows (data.query path)
    const adq = artifacts.activeDataQuery as Record<string, unknown> | undefined;
    if (adq?.result && typeof adq.result === 'object') {
        const result = adq.result as Record<string, unknown>;
        if (Array.isArray(result.rows) && result.rows.length > STEP_ARTIFACT_RETAINED_ROWS) {
            artifacts.activeDataQuery = {
                ...adq,
                result: {
                    ...result,
                    rows: result.rows.slice(0, STEP_ARTIFACT_RETAINED_ROWS),
                    _truncatedFrom: result.rows.length,
                },
            };
            changed = true;
        }
    }

    // Top-level rows / aggregatedData arrays
    for (const key of ['rows', 'aggregatedData'] as const) {
        if (Array.isArray(artifacts[key]) && (artifacts[key] as unknown[]).length > STEP_ARTIFACT_RETAINED_ROWS) {
            const original = artifacts[key] as unknown[];
            artifacts[key] = original.slice(0, STEP_ARTIFACT_RETAINED_ROWS);
            artifacts[`_${key}TruncatedFrom`] = original.length;
            changed = true;
        }
    }

    if (!changed) return turn;

    const steps = [...turn.steps];
    steps[steps.length - 1] = {
        ...lastStep,
        result: { ...lastStep.result, artifacts },
    };
    return { ...turn, steps };
};
