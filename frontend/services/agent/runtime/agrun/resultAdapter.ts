/**
 * AGRUN-004: normalizes Agrun's terminal result into the app follow-up
 * contract and projects it through the existing Zustand/runtime finalizer.
 */
import type {
    AgentObservation,
    AgentTurn,
    ClarificationRequest,
    RuntimeFailureClass,
    RuntimeOutcomeEnvelope,
} from '../../../../types';
import { createChatMessage } from '../../../../utils/messageState';
import { getTranslation } from '../../../../utils/localization';
import { finalizeRuntimeOutcome } from '../runtimeFinalize';
import {
    cancelAgentTurn,
    completeAgentTurn,
    failAgentTurn,
    markTurnWaitingForClarification,
} from '../runtimeState';
import type {
    AgrunRecord,
    AgrunRunAdapterContext,
    FollowUpRuntimeResult,
} from './types';
import { toAgrunActionName } from './actionAdapter';
import {
    buildGroundedCompleteQueryReply,
    buildGroundedDerivedCostPerResultReply,
    buildGroundedDerivedMarginReply,
    buildIncompleteRankedShareReply,
    buildGroundedRankedShareReply,
} from './groundedQueryReply';

const asRecord = (value: unknown): AgrunRecord | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as AgrunRecord
        : null;

const readString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
};

const readNumber = (...values: unknown[]): number | undefined => {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return undefined;
};

const readUsage = (
    result: AgrunRecord,
    output: AgrunRecord | null,
): FollowUpRuntimeResult['usage'] => {
    const usage = asRecord(output?.usage) ?? asRecord(result.usage);
    if (!usage) return undefined;

    const inputTokens = readNumber(usage.inputTokens, usage.input_tokens, usage.promptTokens);
    const outputTokens = readNumber(usage.outputTokens, usage.output_tokens, usage.completionTokens);
    const totalTokens = readNumber(
        usage.totalTokens,
        usage.total_tokens,
        inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined,
    );
    if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
        return undefined;
    }
    return { inputTokens, outputTokens, totalTokens };
};

const readRuntimeRunId = (
    result: AgrunRecord,
    runState: AgrunRecord | null,
): string | undefined =>
    readString(runState?.runId, result.runId);

const readResultText = (
    output: AgrunRecord | null,
    error: AgrunRecord | null,
): string | undefined =>
    readString(
        output?.text,
        output?.message,
        output?.answer,
        output?.question,
        error?.message,
    );

const readPendingApproval = (
    output: AgrunRecord | null,
    runState: AgrunRecord | null,
): AgrunRecord | null =>
    asRecord(output?.pendingApproval)
    ?? asRecord(runState?.pendingApproval);

const isCancelledStatus = (status: string | undefined) =>
    status === 'cancelled' || status === 'canceled' || status === 'interrupted';

export const normalizeAgrunResult = (
    rawResult: unknown,
    context: Pick<AgrunRunAdapterContext, 'appTurnId'>,
): FollowUpRuntimeResult => {
    const result = asRecord(rawResult);
    if (!result) {
        return {
            status: 'failed',
            appTurnId: context.appTurnId,
            error: {
                code: 'agrun_result_invalid',
                message: 'Agent Runtime JavaScript returned an invalid result envelope.',
                retryable: false,
            },
        };
    }

    const existingStatus = readString(result.status);
    if (
        readString(result.appTurnId) === context.appTurnId
        && ['completed', 'blocked', 'failed', 'cancelled'].includes(existingStatus ?? '')
    ) {
        return rawResult as FollowUpRuntimeResult;
    }

    const runState = asRecord(result.runState);
    const output = asRecord(result.output);
    const error = asRecord(result.error) ?? asRecord(runState?.error);
    const runtimeStatus = readString(runState?.status, result.status)?.toLowerCase();
    const outputKind = readString(output?.kind)?.toLowerCase();
    const runtimeRunId = readRuntimeRunId(result, runState);
    const text = readResultText(output, error);
    const usage = readUsage(result, output);

    if (isCancelledStatus(runtimeStatus)) {
        return {
            status: 'cancelled',
            appTurnId: context.appTurnId,
            runtimeRunId,
            text,
            usage,
        };
    }

    if (error || runtimeStatus === 'failed') {
        return {
            status: 'failed',
            appTurnId: context.appTurnId,
            runtimeRunId,
            text,
            error: {
                code: readString(error?.code) ?? 'agrun_run_failed',
                message: readString(error?.message, text) ?? 'Agent Runtime JavaScript failed to complete this turn.',
                retryable: error?.retryable === true,
            },
            usage,
        };
    }

    if (outputKind === 'clarification') {
        return {
            status: 'blocked',
            appTurnId: context.appTurnId,
            runtimeRunId,
            text,
            pendingInteraction: {
                kind: 'clarification',
                prompt: readString(output?.question, text) ?? 'Please clarify your request.',
            },
            usage,
        };
    }

    const pendingApproval = readPendingApproval(output, runState);
    if (outputKind === 'approval_required' || pendingApproval) {
        return {
            status: 'blocked',
            appTurnId: context.appTurnId,
            runtimeRunId,
            text,
            pendingInteraction: {
                kind: 'approval',
                actionName: readString(
                    pendingApproval?.actionName,
                    output?.actionName,
                ),
                prompt: readString(
                    pendingApproval?.reason,
                    text,
                ) ?? 'Approval is required before continuing.',
                resumeToken: pendingApproval?.resumeToken,
            },
            usage,
        };
    }

    if (runtimeStatus === 'blocked') {
        return {
            status: 'blocked',
            appTurnId: context.appTurnId,
            runtimeRunId,
            text,
            usage,
        };
    }

    if (runtimeStatus === 'completed' && output) {
        return {
            status: 'completed',
            appTurnId: context.appTurnId,
            runtimeRunId,
            text,
            usage,
        };
    }

    return {
        status: 'failed',
        appTurnId: context.appTurnId,
        runtimeRunId,
        error: {
            code: 'agrun_result_invalid',
            message: 'Agent Runtime JavaScript returned no recognized terminal state.',
            retryable: false,
        },
        usage,
    };
};

const buildObservation = (result: FollowUpRuntimeResult): AgentObservation => {
    if (result.status === 'completed') {
        return {
            type: 'assistant_message',
            status: 'success',
            summary: result.text ?? 'Agent Runtime JavaScript completed the turn.',
            toolName: 'assistant_message',
        };
    }
    if (result.status === 'blocked') {
        return {
            type: result.pendingInteraction?.kind === 'clarification'
                ? 'clarification'
                : 'runtime_error',
            status: 'blocked',
            summary: result.pendingInteraction?.prompt
                ?? result.text
                ?? 'Agent Runtime JavaScript blocked the turn.',
            code: result.pendingInteraction?.kind === 'clarification'
                ? 'clarification_needed'
                : 'blocked_tool',
        };
    }
    if (result.status === 'cancelled') {
        return {
            type: 'runtime_error',
            status: 'error',
            summary: result.text ?? 'The Agent Runtime JavaScript turn was cancelled.',
            code: 'cancelled',
        };
    }
    return {
        type: 'runtime_error',
        status: 'error',
        summary: result.error?.message
            ?? result.text
            ?? 'Agent Runtime JavaScript failed to complete the turn.',
        code: 'action_execution_error',
        retryHint: result.error?.retryable ? 'Retry the follow-up turn.' : null,
        detail: result.error ? { agrunErrorCode: result.error.code } : undefined,
    };
};

const createPendingInteractionRequest = (
    result: FollowUpRuntimeResult,
    sessionId: string,
    language: Parameters<typeof getTranslation>[1],
): ClarificationRequest | null => {
    const interaction = result.pendingInteraction ?? (
        result.status === 'blocked'
            ? {
                kind: 'clarification' as const,
                prompt: result.text ?? 'Please clarify how you want to continue.',
            }
            : null
    );
    if (!interaction) return null;
    const isApproval = interaction.kind === 'approval';
    const approvalPrompt = interaction.actionName === toAgrunActionName('data.mutate')
        ? getTranslation('approval_dataset_mutation_prompt', language)
        : interaction.prompt;
    return {
        question: isApproval ? approvalPrompt : interaction.prompt,
        options: isApproval
            ? [
                { label: getTranslation('approval_approve', language), value: 'approve' },
                { label: getTranslation('approval_deny', language), value: 'deny' },
            ]
            : [],
        allowFreeText: !isApproval,
        clarificationMode: isApproval ? 'options' : 'free_text',
        interactionKind: interaction.kind,
        resumeContext: {
            turnId: result.appTurnId,
            resumeTargetRunId: result.runtimeRunId,
            resumeTargetTurnId: result.appTurnId,
            followUpRuntimeInteraction: {
                owner: 'agrun',
                kind: interaction.kind,
                sessionId,
                turnId: result.appTurnId,
                runtimeRunId: result.runtimeRunId,
                resumeToken: interaction.resumeToken,
            },
        },
    };
};

const updateTurn = (
    turn: AgentTurn,
    result: FollowUpRuntimeResult,
    observation: AgentObservation,
    clarification: ClarificationRequest | null,
): AgentTurn => {
    const correlatedTurn = {
        ...turn,
        runId: result.runtimeRunId ?? turn.runId,
    };
    if (result.status === 'completed') {
        return completeAgentTurn(correlatedTurn, result.text ?? null);
    }
    if (result.status === 'cancelled') {
        return cancelAgentTurn(correlatedTurn, observation);
    }
    if (result.status === 'failed') {
        return failAgentTurn(correlatedTurn, observation);
    }
    return markTurnWaitingForClarification(correlatedTurn, clarification);
};

const inferFailureClass = (result: FollowUpRuntimeResult): RuntimeFailureClass => {
    const code = result.error?.code ?? '';
    return /provider|model|api|rate|timeout/i.test(code)
        ? 'provider'
        : 'tool_execution';
};

const buildOutcome = (
    result: FollowUpRuntimeResult,
    context: AgrunRunAdapterContext,
    observation: AgentObservation,
): RuntimeOutcomeEnvelope => {
    const runId = result.runtimeRunId ?? `agrun-${context.appTurnId}`;
    if (result.status === 'completed') {
        return {
            runId,
            turnId: context.appTurnId,
            sessionId: context.sessionId,
            outcomeKind: 'accepted',
            lifecycleState: 'completed',
            stage: 'finalizing',
            reason: 'agrun_completed',
            retryable: false,
            eventType: 'turn_completed',
            eventMessage: observation.summary,
            eventDetail: {
                source: 'agrun_result_adapter',
                usage: result.usage,
                groundingMode: result.groundingMode ?? null,
            },
            assistantMessage: result.text ?? null,
        };
    }
    if (result.status === 'blocked') {
        return {
            runId,
            turnId: context.appTurnId,
            sessionId: context.sessionId,
            outcomeKind: 'blocked',
            lifecycleState: 'waiting_for_clarification',
            stage: 'finalizing',
            reason: result.pendingInteraction?.kind === 'approval'
                ? 'agrun_approval_required'
                : 'agrun_clarification_required',
            retryable: true,
            failureClass: 'tool_policy',
            eventType: 'turn_blocked',
            eventMessage: observation.summary,
            eventDetail: {
                source: 'agrun_result_adapter',
                pendingInteractionKind: result.pendingInteraction?.kind ?? null,
            },
            assistantMessage: null,
        };
    }
    if (result.status === 'cancelled') {
        return {
            runId,
            turnId: context.appTurnId,
            sessionId: context.sessionId,
            outcomeKind: 'cancelled',
            lifecycleState: 'cancelled',
            stage: 'finalizing',
            reason: 'agrun_cancelled',
            retryable: false,
            failureClass: 'cancelled',
            eventType: 'turn_cancelled',
            eventMessage: observation.summary,
            eventDetail: { source: 'agrun_result_adapter' },
            assistantMessage: null,
        };
    }
    return {
        runId,
        turnId: context.appTurnId,
        sessionId: context.sessionId,
        outcomeKind: 'failed',
        lifecycleState: 'failed',
        stage: 'finalizing',
        reason: result.error?.code ?? 'agrun_run_failed',
        retryable: result.error?.retryable ?? false,
        failureClass: inferFailureClass(result),
        eventType: 'turn_failed',
        eventMessage: observation.summary,
        eventDetail: {
            source: 'agrun_result_adapter',
            agrunErrorCode: result.error?.code ?? null,
        },
        assistantMessage: observation.summary,
        assistantMessageIsError: true,
    };
};

export const projectAgrunResultToStore = (
    result: FollowUpRuntimeResult,
    context: AgrunRunAdapterContext,
): void => {
    const runId = result.runtimeRunId ?? `agrun-${context.appTurnId}`;
    const state = context.store.getState();
    const outcomeKind = result.status === 'completed'
        ? 'accepted'
        : result.status;
    if ((state.runtimeRunHistory ?? []).some(record =>
        record.runId === runId
        && record.turnId === context.appTurnId
        && record.outcomeKind === outcomeKind)) {
        return;
    }

    const activeTurn = state.activeTurn?.turnId === context.appTurnId
        ? state.activeTurn
        : null;
    const observation = buildObservation(result);
    const pendingInteraction = createPendingInteractionRequest(
        result,
        context.sessionId,
        state.settings.language,
    );
    const projectedTurn = activeTurn
        ? updateTurn(activeTurn, result, observation, pendingInteraction)
        : null;

    if (result.status === 'blocked' && pendingInteraction) {
        context.store.setState(prev => ({
            pendingClarification: pendingInteraction,
            streamingMessage: null,
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: pendingInteraction.question,
                    timestamp: new Date(),
                    type: 'ai_clarification',
                    clarificationRequest: pendingInteraction,
                }),
            ],
        }));
    } else {
        context.store.setState({
            pendingClarification: null,
            streamingMessage: null,
        });
    }

    finalizeRuntimeOutcome({
        store: context.store,
        turn: projectedTurn,
        outcome: buildOutcome(result, context, observation),
        preserveActiveTurn: Boolean(projectedTurn),
    });

    if (result.status === 'blocked') {
        context.store.setState({
            isBusy: false,
            chatLifecycleState: 'blocked',
        });
    }
};

export const normalizeAndProjectAgrunResult = (
    rawResult: unknown,
    context: AgrunRunAdapterContext,
): FollowUpRuntimeResult => {
    const normalizedResult = normalizeAgrunResult(rawResult, context);
    const state = context.store.getState();
    const groundingParams = {
            userMessage: state.activeTurn?.userMessage ?? '',
            query: state.activeDataQuery,
            fileName: state.csvData?.fileName ?? null,
            language: state.settings.language,
            qualityCaveats: state.dataQualityIssues,
        };
    const groundedMarginReply = normalizedResult.status === 'completed'
        ? buildGroundedDerivedMarginReply(groundingParams)
        : null;
    const groundedCostPerResultReply = normalizedResult.status === 'completed'
        ? buildGroundedDerivedCostPerResultReply(groundingParams)
        : null;
    const groundedRankedShareReply = normalizedResult.status === 'completed'
        ? buildGroundedRankedShareReply(groundingParams)
        : null;
    const incompleteRankedShareReply = normalizedResult.status === 'completed'
        ? buildIncompleteRankedShareReply(groundingParams)
        : null;
    const groundedReply = normalizedResult.status === 'completed'
        ? groundedMarginReply
            ?? groundedCostPerResultReply
            ?? groundedRankedShareReply
            ?? incompleteRankedShareReply
            ?? buildGroundedCompleteQueryReply(groundingParams)
        : null;
    const result = groundedReply
        ? {
            ...normalizedResult,
            text: groundedReply,
            groundingMode: groundedMarginReply
                ? 'deterministic_derived_margin_table' as const
                : groundedCostPerResultReply
                    ? 'deterministic_derived_cost_per_result_table' as const
                    : groundedRankedShareReply || incompleteRankedShareReply
                        ? 'deterministic_ranked_share' as const
                : 'deterministic_complete_query_table' as const,
        }
        : normalizedResult;
    projectAgrunResultToStore(result, context);
    return result;
};
