import type {
    AgentTurn,
    ChatLifecycleState,
    RuntimeActualOutcomeShape,
    RuntimeEvaluationScorecard,
    RuntimeExpectedOutcome,
    RuntimeLifecycleState,
    RuntimeOutcomeEnvelope,
    RuntimeRecoveryStatus,
    RuntimeRecoveryTrace,
    RuntimeRunRecord,
} from '../../../types';
import type { StoreApi } from '../types';
import { createChatMessage } from '../../../utils/messageState';
import { recordRuntimeEvent } from './runtimeHelpers';
import { normalizeRuntimeOutcomeEnvelope } from './runtimeControlPlaneContract';

const MAX_RUNTIME_RUN_HISTORY = 50;

const buildToolSequence = (turn: AgentTurn) =>
    turn.steps.map(step => step.action.type === 'tool_call' ? step.action.toolName : 'assistant_message');

const countRetries = (turn: AgentTurn) =>
    Object.values(turn.budgetStatus.retryCounts ?? {}).reduce((total, current) => total + current, 0);

const extractReviewSummary = (
    detail: Record<string, unknown> | undefined,
): Pick<RuntimeRunRecord, 'finalDecision' | 'finalReadiness' | 'recommendedNextMode' | 'scorecard'> => {
    if (!detail) return {};

    const scorecard = (detail.scorecard as RuntimeEvaluationScorecard | null | undefined) ?? null;
    const finalDecision = (detail.decision ?? detail.finalDecision) as RuntimeRunRecord['finalDecision'] ?? null;
    const finalReadiness = (detail.finalReadiness as RuntimeRunRecord['finalReadiness']) ?? null;
    const recommendedNextMode = (detail.recommendedNextMode as RuntimeRunRecord['recommendedNextMode']) ?? null;

    if (!scorecard && !finalDecision && !finalReadiness && !recommendedNextMode) return {};

    return {
        ...(finalDecision != null ? { finalDecision } : {}),
        ...(finalReadiness != null ? { finalReadiness } : {}),
        ...(recommendedNextMode != null ? { recommendedNextMode } : {}),
        ...(scorecard != null ? { scorecard } : {}),
    };
};

const resolveReviewDetail = (
    outcome: RuntimeOutcomeEnvelope,
    store: StoreApi,
): Pick<RuntimeRunRecord, 'finalDecision' | 'finalReadiness' | 'recommendedNextMode' | 'scorecard'> => {
    const fromOutcome = extractReviewSummary(outcome.eventDetail);
    if (Object.keys(fromOutcome).length > 0) return fromOutcome;

    const events = store.getState().runtimeEvents ?? [];
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event?.runId !== outcome.runId) continue;
        if (event.type === 'evaluation_completed' || event.type === 'retry_scheduled') {
            const extracted = extractReviewSummary(event.detail);
            if (Object.keys(extracted).length > 0) return extracted;
        }
    }

    return {};
};

// ---------------------------------------------------------------------------
// Recovery trace — determines whether the outcome was ideal, recovered,
// degraded, or failed relative to the originally committed goal.
// ---------------------------------------------------------------------------

const CARD_TOOL_NAMES = new Set([
    'analysis.create_plan', 'analysis.pivot_matrix', 'analysis.period_compare',
    'analysis.cohort_retention', 'analysis.root_cause_breakdown',
    'card.aggregate_table', 'card.add_calculated_column',
]);

const inferActualOutcomeShape = (turn: AgentTurn | null, outcome: RuntimeOutcomeEnvelope): RuntimeActualOutcomeShape => {
    if (outcome.outcomeKind === 'failed' || outcome.outcomeKind === 'cancelled') return 'hidden';

    const lastStep = turn?.steps.at(-1);
    if (!lastStep) return outcome.assistantMessage ? 'prose' : null;

    if (lastStep.action.type === 'assistant_message') return 'prose';
    if (lastStep.action.type === 'tool_call') {
        if (lastStep.action.toolName === 'conversation.request_clarification') return 'clarification';
        if (CARD_TOOL_NAMES.has(lastStep.action.toolName)) return 'card';
        if (lastStep.action.toolName === 'data.query') return 'table';
    }
    return outcome.assistantMessage ? 'prose' : null;
};

const mustPreserveToExpectedOutcome = (preserve: string | undefined): RuntimeExpectedOutcome | null => {
    switch (preserve) {
        case 'answer': return 'answer';
        case 'table': return 'table';
        case 'card': return 'card';
        case 'derived_metric': return 'derived_metric';
        default: return null;
    }
};

const outcomeShapeMatchesExpected = (shape: RuntimeActualOutcomeShape, expected: RuntimeExpectedOutcome | null): boolean => {
    if (!expected || !shape) return true; // no commitment → cannot be degraded
    switch (expected) {
        case 'card': return shape === 'card';
        case 'table': return shape === 'card' || shape === 'table';
        case 'derived_metric': return shape === 'card' || shape === 'table';
        case 'answer': return true; // prose is always acceptable for 'answer'
        case 'clarification': return shape === 'clarification';
        default: return true;
    }
};

const buildRecoveryChain = (turn: AgentTurn): string[] => {
    const chain: string[] = [];
    for (const step of turn.steps) {
        const toolName = step.action.type === 'tool_call' ? step.action.toolName : 'assistant_message';
        const obsCode = step.observation?.code;
        const obsStatus = step.observation?.status ?? step.status;

        if (obsStatus === 'blocked' || obsStatus === 'error') {
            chain.push(`${obsCode ?? 'error'}:${toolName}`);
        } else if (obsCode && obsCode !== 'empty_result') {
            chain.push(`${obsCode}:${toolName}`);
        } else {
            chain.push(`ok:${toolName}`);
        }
    }
    return chain;
};

const resolveRecoveryStatus = (
    outcomeKind: RuntimeOutcomeEnvelope['outcomeKind'],
    retryCount: number,
    outcomeMatches: boolean,
): RuntimeRecoveryStatus => {
    if (outcomeKind === 'failed' || outcomeKind === 'cancelled' || outcomeKind === 'blocked') {
        return 'failed';
    }
    if (!outcomeMatches) return 'degraded';
    if (retryCount > 0) return 'recovered';
    return 'ideal';
};

export const buildRecoveryTrace = (
    turn: AgentTurn | null,
    outcome: RuntimeOutcomeEnvelope,
): RuntimeRecoveryTrace | null => {
    if (!turn) return null;

    const originalExpectedOutcome = mustPreserveToExpectedOutcome(
        turn.runtimeCommitment?.mustPreserveOutcome,
    );
    const actualOutcomeShape = inferActualOutcomeShape(turn, outcome);
    const retryCount = countRetries(turn);
    const outcomeMatches = outcomeShapeMatchesExpected(actualOutcomeShape, originalExpectedOutcome);

    const recoveryStatus = resolveRecoveryStatus(outcome.outcomeKind, retryCount, outcomeMatches);
    const recoveryChain = buildRecoveryChain(turn);

    // Count contract re-derivations: each retry represents a contract change.
    const contractChanges = Object.values(turn.budgetStatus.retryCounts ?? {}).reduce(
        (total, current) => total + current, 0,
    );

    const degradationReason = recoveryStatus === 'degraded'
        ? `expected=${originalExpectedOutcome ?? 'unknown'} actual=${actualOutcomeShape ?? 'unknown'} reason=${outcome.reason}`
        : null;

    return {
        recoveryStatus,
        originalExpectedOutcome,
        actualOutcomeShape,
        degradationReason,
        recoveryChain,
        contractChanges,
    };
};

// ---------------------------------------------------------------------------

const buildRunRecord = (
    turn: AgentTurn | null,
    outcome: RuntimeOutcomeEnvelope,
    userMessage: string,
    store: StoreApi,
): RuntimeRunRecord => ({
    runId: outcome.runId,
    turnId: outcome.turnId ?? turn?.turnId ?? null,
    sessionId: outcome.sessionId,
    userMessage,
    lifecycleState: outcome.lifecycleState,
    outcomeKind: outcome.outcomeKind,
    failureClass: outcome.failureClass,
    reason: outcome.reason,
    retryCount: turn ? countRetries(turn) : 0,
    toolSequence: turn ? buildToolSequence(turn) : [],
    finalObservationSummary: turn?.lastObservation?.summary ?? outcome.assistantMessage ?? null,
    createdAt: new Date(),
    ...resolveReviewDetail(outcome, store),
    recoveryTrace: buildRecoveryTrace(turn, outcome),
});

export const finalizeRuntimeOutcome = ({
    store,
    turn,
    outcome,
    preserveActiveTurn = true,
}: {
    store: StoreApi;
    turn: AgentTurn | null;
    outcome: RuntimeOutcomeEnvelope;
    preserveActiveTurn?: boolean;
}) => {
    const normalizedOutcome = normalizeRuntimeOutcomeEnvelope(outcome);
    store.getState().syncTelemetryToStore?.();

    // BUG-UI-204: Set chatLifecycleState to the real terminal state
    // (completed/failed/cancelled) so downstream can distinguish outcomes.
    // Do NOT collapse all terminals to 'idle' — that loses the distinction.
    const RUNTIME_TO_CHAT_LIFECYCLE: Partial<Record<RuntimeLifecycleState, ChatLifecycleState>> = {
        completed: 'completed',
        failed: 'failed',
        cancelled: 'cancelled',
    };

    // -------------------------------------------------------------------------
    // Batched state update — consolidates activeTurn, isBusy, chatLifecycleState,
    // chatHistory, and runtimeRunHistory into a single setState call to avoid
    // triggering multiple Zustand subscriber re-evaluations (was 4 separate calls).
    // -------------------------------------------------------------------------
    const runRecord = buildRunRecord(turn, normalizedOutcome, turn?.userMessage ?? '', store);

    store.setState(prev => {
        const patch: Partial<typeof prev> = {};

        // (was setActiveTurn / clearActiveTurn)
        // AGENT-312: Terminal turns (completed/failed/cancelled) clear recoveryState
        // to prevent downstream readers from seeing stale blocked/denied signals.
        // Only waiting_for_clarification preserves recoveryState for resume path.
        if (turn && preserveActiveTurn) {
            const isTerminal = normalizedOutcome.lifecycleState !== 'waiting_for_clarification';
            patch.activeTurn = isTerminal
                ? { ...turn, recoveryState: null }
                : turn;
        } else if (!preserveActiveTurn) {
            patch.activeTurn = null;
            patch.isBusy = false;
            patch.chatLifecycleState = 'idle' as ChatLifecycleState;
        }

        // (was standalone setState for isBusy + chatLifecycleState)
        if (normalizedOutcome.lifecycleState !== 'waiting_for_clarification') {
            const chatState: ChatLifecycleState =
                RUNTIME_TO_CHAT_LIFECYCLE[normalizedOutcome.lifecycleState] ?? 'idle';
            patch.isBusy = false;
            patch.chatLifecycleState = chatState;
        }

        // (was appendRuntimeAssistantMessage)
        if (normalizedOutcome.assistantMessage) {
            // Clear streaming bubble before appending the final message
            // so both don't show simultaneously.
            patch.streamingMessage = null;
            patch.chatHistory = [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: normalizedOutcome.assistantMessage,
                    timestamp: new Date(),
                    type: 'ai_message',
                    isError: normalizedOutcome.assistantMessageIsError ?? false,
                }),
            ];
        }

        // (was appendRuntimeRunRecord)
        patch.runtimeRunHistory = [
            ...prev.runtimeRunHistory,
            runRecord,
        ].slice(-MAX_RUNTIME_RUN_HISTORY);

        return patch;
    });

    // recordRuntimeEvent calls are already debounce-buffered (200ms) in
    // agentSlice, so they don't cause immediate re-renders — keep them separate.
    recordRuntimeEvent(store, {
        runId: normalizedOutcome.runId,
        turnId: normalizedOutcome.turnId ?? turn?.turnId,
        stepId: normalizedOutcome.stepId ?? turn?.steps.at(-1)?.stepId,
        type: normalizedOutcome.eventType,
        stage: normalizedOutcome.stage,
        reason: normalizedOutcome.reason,
        retryable: normalizedOutcome.retryable,
        failureClass: normalizedOutcome.failureClass,
        message: normalizedOutcome.eventMessage,
        detail: normalizedOutcome.eventDetail,
    });

    // P1 Chat turn health check: emit a summary for every terminal turn.
    // Covers all finalization paths (accepted step, failed, cancelled, budget-exhausted).
    if (turn && normalizedOutcome.lifecycleState !== 'waiting_for_clarification') {
        const completedAt = turn.completedAt ?? new Date();
        const durationMs = completedAt.getTime() - turn.startedAt.getTime();
        const stepsCompleted = turn.steps.length;
        const correlatedToolLogs = (store.getState().agentToolLogs ?? []).filter(entry =>
            entry.turnId === turn.turnId
            || (entry.runId != null && entry.runId === normalizedOutcome.runId));
        const toolLogFailures = correlatedToolLogs.filter(entry =>
            entry.policyDecision === 'blocked'
            || Boolean(entry.detail?.error));
        const errorsEncountered = turn.steps.filter(s => s.status === 'error').length
            + toolLogFailures.filter(entry => entry.policyDecision !== 'blocked').length;
        const blockedSteps = turn.steps.filter(s => s.status === 'blocked').length
            + toolLogFailures.filter(entry => entry.policyDecision === 'blocked').length;
        const runtimeActivityCount = correlatedToolLogs.filter(entry => entry.tool !== 'context_manager').length;
        recordRuntimeEvent(store, {
            runId: normalizedOutcome.runId,
            turnId: normalizedOutcome.turnId ?? turn.turnId,
            type: 'turn_health_summary',
            stage: 'finalizing',
            reason: normalizedOutcome.reason,
            message: `Turn ${normalizedOutcome.outcomeKind}: ${runtimeActivityCount || stepsCompleted} runtime activity event(s), ${errorsEncountered} error(s), ${blockedSteps} blocked event(s), ${durationMs}ms.`,
            detail: {
                durationMs,
                stepsCompleted,
                runtimeActivityCount,
                errorsEncountered,
                blockedSteps,
                finalStatus: normalizedOutcome.outcomeKind,
                lifecycleState: normalizedOutcome.lifecycleState,
            },
        });
    }
};

export const appendStandaloneRuntimeRunRecord = (
    store: StoreApi,
    record: RuntimeRunRecord,
) => {
    const appendRuntimeRunRecord = store.getState().appendRuntimeRunRecord;
    if (typeof appendRuntimeRunRecord === 'function') {
        appendRuntimeRunRecord(record);
    }
};
