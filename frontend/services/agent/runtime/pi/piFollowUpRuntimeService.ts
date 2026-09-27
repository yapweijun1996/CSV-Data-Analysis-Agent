import { Agent, type AgentEvent, type StreamFn } from '@earendil-works/pi-agent-core';
import type { ClarificationRequest } from '../../../../types';
import { createChatMessage } from '../../../../utils/messageState';
import { validateDataMutatePayload } from '../../execution/dataMutateContract';
import { isDestructiveRowDeleteAction } from '../../execution/destructiveRowDelete';
import type { GroundingResult, IntentClassificationFindings, QueryUnderstandingArtifact } from '../intentClassificationTypes';
import type { StoreApi } from '../../types';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { readAppFollowUpMemory } from '../../memory/followUpMemory';
import { persistCurrentAppSessionSnapshot } from '../../../persistence/currentSessionPersistence';
import { ensureCloudAiConsent } from '../../../privacy/cloudAiConsent';
import { finalizeRuntimeOutcome } from '../runtimeFinalize';
import {
    clearRuntimeTurnAbortController,
    registerRuntimeTurnAbortController,
} from '../runtimeAbort';
import {
    cancelAgentTurn,
    completeAgentTurn,
    createAgentTurn,
    failAgentTurn,
    markTurnWaitingForClarification,
} from '../runtimeState';
import { createPiAppTools } from './piAppTools';
import { createPiFollowUpSystemPrompt } from './piContext';
import { createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
import {
    buildGroundedCompleteQueryReply,
    buildGroundedDerivedCostPerResultReply,
    buildGroundedDerivedMarginReply,
    buildGroundedRankedShareReply,
    buildIncompleteRankedShareReply,
} from './groundedQueryReply';

export interface PiFollowUpRequest {
    message: string;
    intentFindings?: IntentClassificationFindings;
    queryUnderstandingArtifact?: QueryUnderstandingArtifact;
    groundingResult?: GroundingResult;
}

export interface PiFollowUpResult {
    status: 'completed' | 'blocked' | 'failed' | 'cancelled';
    appTurnId: string;
    text?: string;
}

const activeAgents = new Map<string, Agent>();

const sanitizeError = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error))
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\b(?:gw_|sk-|AIza)[A-Za-z0-9._-]{12,}\b/g, '[redacted credential]')
        .replace(/([?&](?:api_?key|key|token)=)[^&\s]+/gi, '$1[redacted]');

const readAssistantText = (event: AgentEvent): string => {
    if (event.type !== 'message_update' || event.message.role !== 'assistant') return '';
    return event.message.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
};

export const runPiFollowUpTurn = async (
    request: PiFollowUpRequest,
    store: StoreApi,
    streamOverride?: StreamFn,
): Promise<PiFollowUpResult> => {
    const state = store.getState();
    const turn = createAgentTurn(request.message);
    const runId = `pi-${turn.turnId}`;
    const datasetVersion = getCurrentAnalysisDatasetVersion(state);
    const controller = registerRuntimeTurnAbortController(turn.turnId);
    state.clearActiveTurnCancellation?.();
    store.setState({
        activeTurn: turn,
        isBusy: true,
        chatLifecycleState: 'running',
        pendingClarification: null,
    });
    let agent: Agent | null = null;
    let status: PiFollowUpResult['status'] = 'failed';
    let text = '';
    let pendingMutation: Record<string, unknown> | null = null;
    let pendingClarification: ClarificationRequest | null = null;
    let providerTurns = 0;
    try {
        await persistCurrentAppSessionSnapshot(state);
        if (!streamOverride) await ensureCloudAiConsent(state.settings.provider);
        const appMemory = await readAppFollowUpMemory(store, request.message);
        if (controller.signal.aborted) throw controller.signal.reason;
        const prompt = createPiFollowUpSystemPrompt(store.getState(), appMemory, request);
        agent = new Agent({
            initialState: {
                systemPrompt: prompt,
                model: resolvePiModel(state.settings),
                thinkingLevel: resolvePiThinkingLevel(state.settings),
                tools: createPiAppTools(store, datasetVersion),
            },
            streamFn: streamOverride ?? createPiProviderStream(state.settings),
            toolExecution: 'sequential',
            finishTurn: () => {
                providerTurns += 1;
                return pendingMutation || providerTurns >= 6 ? { action: 'end' } : undefined;
            },
            beforeToolCall: async ({ toolCall, args }) => {
                if (toolCall.name !== 'data_mutate') return undefined;
                if (!args || typeof args !== 'object' || Array.isArray(args)) {
                    return { block: true, reason: 'Invalid mutation arguments.' };
                }
                const candidate = args as Record<string, unknown>;
                const validationErrors = validateDataMutatePayload(candidate);
                if (validationErrors.length > 0) {
                    return { block: true, reason: validationErrors.join(' ') };
                }
                if (isDestructiveRowDeleteAction({ type: 'tool_call', thought: 'Check row deletion.',
                    toolName: 'data.mutate', args: candidate })) {
                    return { block: true, reason: 'Use the app row-deletion preflight and confirmation flow for this action.', terminate: true };
                }
                const review = JSON.stringify(candidate);
                if (review.length > 4_000) {
                    return { block: true, reason: 'This proposed mutation is too large to review in chat.', terminate: true };
                }
                pendingMutation = candidate;
                return { block: true, reason: 'App approval is required before changing data.', terminate: true };
            },
        });
        activeAgents.set(turn.turnId, agent);
        const abort = () => agent?.abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        try {
            agent.subscribe(event => {
                if (controller.signal.aborted) return;
                const partial = readAssistantText(event);
                if (partial) store.getState().setStreamingMessage?.(partial);
            });
            if (controller.signal.aborted) throw controller.signal.reason;
            await agent.prompt(request.message);
        } finally {
            controller.signal.removeEventListener('abort', abort);
        }
        if (controller.signal.aborted) throw controller.signal.reason;
        if (getCurrentAnalysisDatasetVersion(store.getState()) !== datasetVersion) {
            throw new Error('The dataset changed during this turn. Start a new request.');
        }
        if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
        if (pendingMutation) {
            const review = JSON.stringify(pendingMutation, null, 2);
            pendingClarification = {
                question: `Approve this exact dataset change?\n${review}`,
                options: [
                    { label: 'Approve', value: 'approve' },
                    { label: 'Deny', value: 'deny' },
                ],
                allowFreeText: false,
                clarificationMode: 'options',
                interactionKind: 'approval',
                resumeContext: { piMutationApproval: {
                    sessionId: state.sessionId,
                    datasetVersion,
                    originalRequest: request.message,
                    args: pendingMutation,
                } },
            };
            store.setState(prev => ({
                pendingClarification,
                streamingMessage: null,
                chatHistory: [...prev.chatHistory, createChatMessage({
                    sender: 'ai',
                    text: pendingClarification!.question,
                    timestamp: new Date(),
                    type: 'ai_clarification',
                    clarificationRequest: pendingClarification!,
                })],
            }));
            status = 'blocked';
            text = pendingClarification.question;
        } else {
        const last = [...agent.state.messages].reverse().find(message => message.role === 'assistant');
        text = last?.content.filter(part => part.type === 'text')
            .map(part => part.text).join('\n').trim() ?? '';
        if (!text) throw new Error('Pi completed without an answer.');
        const currentState = store.getState();
        const groundingParams = {
            userMessage: request.message,
            query: currentState.activeDataQuery,
            fileName: currentState.csvData?.fileName ?? null,
            language: currentState.settings.language,
            qualityCaveats: currentState.dataQualityIssues,
        };
        text = buildGroundedDerivedMarginReply(groundingParams)
            ?? buildGroundedDerivedCostPerResultReply(groundingParams)
            ?? buildGroundedRankedShareReply(groundingParams)
            ?? buildIncompleteRankedShareReply(groundingParams)
            ?? buildGroundedCompleteQueryReply(groundingParams)
            ?? text;
        status = 'completed';
        }
    } catch (error) {
        status = controller.signal.aborted ? 'cancelled' : 'failed';
        text = status === 'cancelled'
            ? 'The request was cancelled.'
            : `Pi could not complete this request: ${sanitizeError(error)}`;
    } finally {
        activeAgents.delete(turn.turnId);
        clearRuntimeTurnAbortController(turn.turnId);
        store.getState().clearActiveTurnCancellation?.();
        const observation = {
            type: status === 'blocked' ? 'clarification' as const : 'runtime_error' as const,
            status: status === 'completed' ? 'success' as const
                : status === 'blocked' ? 'blocked' as const : 'error' as const,
            summary: text,
        };
        const finishedTurn = status === 'completed'
            ? completeAgentTurn(turn, text)
            : status === 'blocked'
                ? markTurnWaitingForClarification(turn, pendingClarification)
            : status === 'cancelled'
                ? cancelAgentTurn(turn, observation)
                : failAgentTurn(turn, observation);
        finalizeRuntimeOutcome({
            store,
            turn: finishedTurn,
            preserveActiveTurn: true,
            outcome: {
                runId,
                turnId: turn.turnId,
                sessionId: state.sessionId,
                outcomeKind: status === 'completed' ? 'accepted' : status,
                lifecycleState: status === 'blocked' ? 'waiting_for_clarification' : status,
                stage: 'finalizing',
                reason: `pi_follow_up_${status}`,
                retryable: status === 'failed',
                ...(status === 'failed' ? { failureClass: 'provider' as const } : {}),
                eventType: status === 'completed' ? 'turn_completed'
                    : status === 'blocked' ? 'turn_blocked'
                        : status === 'cancelled' ? 'turn_cancelled' : 'turn_failed',
                eventMessage: text,
                eventDetail: { runtimeOwner: 'pi' },
                assistantMessage: status === 'cancelled' || status === 'blocked' ? null : text,
                assistantMessageIsError: status === 'failed',
            },
        });
        if (status === 'blocked') store.setState({ isBusy: false, chatLifecycleState: 'blocked' });
    }
    return { status, appTurnId: turn.turnId, text };
};

export const cancelPiFollowUpTurn = (turnId: string): void => {
    activeAgents.get(turnId)?.abort();
};
