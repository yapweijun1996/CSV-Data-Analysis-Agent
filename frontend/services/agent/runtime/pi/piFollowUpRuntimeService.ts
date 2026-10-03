import { Agent, type AgentEvent, type StreamFn } from '@earendil-works/pi-agent-core';
import type { AnalysisCardData, ClarificationRequest } from '../../../../types';
import { createChatMessage } from '../../../../utils/messageState';
import { attachAutoAnalysisEvaluationToCards } from '../../autoAnalysisEvaluation';
import { emitSilentFailure } from '../../monitoring/silentFailureTracker';
import { resolveDisplayPlanLabels } from '../../../dashboard/displayLabelContext';
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
import { createPiCompactionTelemetry, createPiProviderContextTransform, createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
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

/** Open-ended analysis requests may create several cards; explicit card requests create one. */
const BATCH_ANALYSIS_CARD_TARGET = 3;
const BATCH_ANALYSIS_MAX_TOOL_CALLS = 8;
const BATCH_ANALYSIS_MAX_PROVIDER_TURNS = 10;
const DEFAULT_MAX_PROVIDER_TURNS = 6;

/**
 * Pi-created cards start without a persisted quality verdict, so the trust
 * model would label every one of them unverified. Evaluate them against the
 * full card set (as the initial-analysis lifecycle owner does) and persist the
 * verdict on the new cards only; existing cards keep their stored verdicts.
 */
const attachEvidenceVerdicts = (store: StoreApi, cardIds: string[]): void => {
    if (cardIds.length === 0) return;
    try {
        store.setState(state => {
            const evaluated = new Map(
                attachAutoAnalysisEvaluationToCards(state.analysisCards, {
                    columnProfiles: state.columnProfiles,
                }).map(card => [card.id, card]),
            );
            return {
                analysisCards: state.analysisCards.map(card =>
                    cardIds.includes(card.id) ? evaluated.get(card.id) ?? card : card),
            };
        });
    } catch (error) {
        // The card stays visible and is labelled unverified; the failure is only telemetry.
        emitSilentFailure(store, error, {
            component: 'PiFollowUpRuntime',
            recoveryAction: 'card_left_unverified',
            userNotified: false,
            detail: { cardIds },
        });
    }
};

const findSavedCards = (store: StoreApi, cardIds: string[]): AnalysisCardData[] => {
    const cards = store.getState().analysisCards;
    return cardIds.flatMap(id => cards.find(card => card.id === id) ?? []);
};

const describeCreatedCards = (cards: AnalysisCardData[]): string => {
    const describe = (card: AnalysisCardData) => {
        const title = resolveDisplayPlanLabels(card.plan).title;
        const rowCount = card.aggregatedData.length;
        return `"${title}" with ${rowCount} result row${rowCount === 1 ? '' : 's'}`;
    };
    return cards.length === 1
        ? `Created dashboard card ${describe(cards[0])}.`
        : `Created ${cards.length} dashboard cards:\n${cards.map(card => `- ${describe(card)}`).join('\n')}`;
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
    const createdCardIds: string[] = [];
    let failureClass: 'provider' | 'tool_execution' = 'provider';
    const isBatchAnalysis = request.intentFindings?.intent === 'batch_analysis';
    const allowCardCreation = request.queryUnderstandingArtifact?.expectedOutput === 'chart_card'
        || request.intentFindings?.intent === 'precise_card'
        || isBatchAnalysis;
    const cardTarget = isBatchAnalysis ? BATCH_ANALYSIS_CARD_TARGET : 1;
    const maxProviderTurns = isBatchAnalysis ? BATCH_ANALYSIS_MAX_PROVIDER_TURNS : DEFAULT_MAX_PROVIDER_TURNS;
    try {
        await persistCurrentAppSessionSnapshot(state);
        if (!streamOverride) await ensureCloudAiConsent(state.settings.provider);
        const appMemory = await readAppFollowUpMemory(store, request.message);
        if (controller.signal.aborted) throw controller.signal.reason;
        const prompt = createPiFollowUpSystemPrompt(store.getState(), appMemory, {
            ...request,
            allowCardCreation,
            cardTarget,
        });
        agent = new Agent({
            initialState: {
                systemPrompt: prompt,
                model: resolvePiModel(state.settings),
                thinkingLevel: resolvePiThinkingLevel(state.settings),
                tools: createPiAppTools(store, datasetVersion, {
                    allowCardCreation,
                    ...(isBatchAnalysis ? { maxToolCalls: BATCH_ANALYSIS_MAX_TOOL_CALLS } : {}),
                    onCardCreated: cardId => { createdCardIds.push(cardId); },
                }),
            },
            streamFn: streamOverride ?? createPiProviderStream(state.settings),
            transformContext: createPiProviderContextTransform(state.settings, createPiCompactionTelemetry(store)),
            toolExecution: 'sequential',
            finishTurn: () => {
                providerTurns += 1;
                return pendingMutation || createdCardIds.length >= cardTarget || providerTurns >= maxProviderTurns
                    ? { action: 'end' } : undefined;
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
        const createdCards = findSavedCards(store, createdCardIds);
        if (allowCardCreation && !isBatchAnalysis && createdCards.length === 0) {
            failureClass = 'tool_execution';
            text = 'Pi could not add the requested dashboard card. The query result was not saved as a card. Please retry or review the analysis data.';
            status = 'failed';
        } else if (createdCards.length > 0) {
            store.getState().setResultsViewMode?.('explore');
            text = describeCreatedCards(createdCards);
            status = 'completed';
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
        }
    } catch (error) {
        status = controller.signal.aborted ? 'cancelled' : 'failed';
        // A card that already reached the dashboard must not be reported as a
        // failure: the retry action would create a duplicate.
        const savedCards = status === 'failed' ? findSavedCards(store, createdCardIds) : [];
        if (savedCards.length > 0) {
            text = `${describeCreatedCards(savedCards)} Pi then stopped early: ${sanitizeError(error)}`;
            status = 'completed';
        } else {
            text = status === 'cancelled'
                ? 'The request was cancelled.'
                : `Pi could not complete this request: ${sanitizeError(error)}`;
        }
    } finally {
        attachEvidenceVerdicts(store, createdCardIds);
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
                ...(status === 'failed' ? { failureClass } : {}),
                eventType: status === 'completed' ? 'turn_completed'
                    : status === 'blocked' ? 'turn_blocked'
                        : status === 'cancelled' ? 'turn_cancelled' : 'turn_failed',
                eventMessage: text,
                eventDetail: { runtimeOwner: 'pi' },
                assistantMessage: status === 'cancelled' || status === 'blocked' ? null : text,
                assistantMessageIsError: status === 'failed',
                assistantCardId: status === 'completed' ? (createdCardIds[createdCardIds.length - 1] ?? null) : null,
            },
        });
        if (status === 'blocked') store.setState({ isBusy: false, chatLifecycleState: 'blocked' });
    }
    return { status, appTurnId: turn.turnId, text };
};

export const cancelPiFollowUpTurn = (turnId: string): void => {
    activeAgents.get(turnId)?.abort();
};
