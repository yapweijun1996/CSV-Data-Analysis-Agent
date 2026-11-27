import { admitComputationEvidence, formatComputationEvidence, type ComputationEvidenceReceipt } from '../../execution/computationEvidence';
import { publishTaskOutcome } from './piTaskInspection';
import { discardPiCandidateApproval, pendingPiCandidateApproval, sealPiCandidateApproval } from './piCandidateApproval';
import { preparePiExecutor } from './piExecutorPreparation';
import { taskDependencyBlock } from './piTaskPlan';
import {formatPinnedSkills} from '../../skills/skillSnapshot';
import { resolveAnswerScope, admitQueryEvidence, formatValidatedCalculation, formatValidatedQueryReply, type QueryExecutionReceipt } from './queryEvidence';
import { beginRun, scopeRunStore, rootStore, ownsRun, canCommitRun, assertRunActive, awaitOwned, finishRun } from '../../../session/sessionOwnership';
import { presentGatewayError } from '../../../../utils/gatewayErrorMessage';
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
import { requiresCompleteAggregateEvidence } from '../../derivedMetricIntent';
import { readAppFollowUpMemory } from '../../memory/followUpMemory';
import { persistCurrentAppSessionSnapshot } from '../../../persistence/currentSessionPersistence';
import { ensureCloudAiConsent } from '../../../privacy/cloudAiConsent';
import { finalizeRuntimeOutcome } from '../runtimeFinalize';
import { assessTaskOutputs } from '../taskOutputContract';
import type { RuntimeAcceptedTaskOutput } from '../../../../types';
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
import { type PiTaskContinuation } from './piCodingTask';
import { gatePiCreatedCards, type PiCardGateRejection } from './piCardEvidenceGate';
import { createPiFollowUpSystemPrompt } from './piContext';
import { createReplyTelemetryTracker } from '../../../../utils/replyTelemetry';
import { createPiCompactionTelemetry, createPiProviderContextTransform, createPiProviderStream, resolvePiModel, resolvePiThinkingLevel } from './piProvider';
import {
    buildGroundedCompleteQueryReply,
    buildGroundedDerivedCostPerResultReply,
    buildGroundedDerivedMarginReply,
    buildGroundedRankedShareReply,
    buildIncompleteRankedShareReply,
} from './groundedQueryReply';

export interface PiFollowUpRequest {
    /** Host-only resumed context, never supplied by model tool arguments. */
    continuation?: {scope: import('./queryEvidence').ResolvedAnswerScope; history: import('@earendil-works/pi-agent-core').AgentMessage[]; commitId: string};
    taskContinuation?: PiTaskContinuation;
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
// Room for up to two skill reads and three app tools before the final answer.
const DEFAULT_MAX_PROVIDER_TURNS = 8;

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

const describeCreatedCards = (cards: AnalysisCardData[], tableOnlyIds: ReadonlySet<string>): string => {
    const describe = (card: AnalysisCardData) => {
        const title = resolveDisplayPlanLabels(card.plan).title;
        const rowCount = card.aggregatedData.length;
        const tableNote = tableOnlyIds.has(card.id) ? ' (evidence supports table presentation only)' : '';
        return `"${title}" with ${rowCount} result row${rowCount === 1 ? '' : 's'}${tableNote}`;
    };
    return cards.length === 1
        ? `Created dashboard card ${describe(cards[0])}.`
        : `Created ${cards.length} dashboard cards:\n${cards.map(card => `- ${describe(card)}`).join('\n')}`;
};

const describeRejectedCards = (rejections: PiCardGateRejection[]): string =>
    `${rejections.length} candidate card${rejections.length === 1 ? ' was' : 's were'} removed because the evidence check rejected ${rejections.length === 1 ? 'it' : 'them'}:\n${rejections.map(item => `- "${item.title}": ${item.detail}`).join('\n')}`;

export const runPiFollowUpTurn = async (
    request: PiFollowUpRequest,
    store: StoreApi,
    streamOverride?: StreamFn,
): Promise<PiFollowUpResult> => {
    const state = store.getState();
    const createdTurn = createAgentTurn(request.message);
    const ownLease = !store.executionContext;
    const lease = store.executionContext?.lease ?? beginRun(store, 'follow_up', createdTurn.runId, createdTurn.turnId);
    const originalStore = rootStore(store);
    const taskPort = store.piTask;
    let logicalTask = taskPort;
    store = scopeRunStore(store, lease);
    taskPort?.attach(store);
    const turn = { ...createdTurn, runId: lease.runId, turnId: lease.turnId ?? createdTurn.turnId };
    const runId = turn.runId;
    const datasetVersion = getCurrentAnalysisDatasetVersion(state);
    const controller = registerRuntimeTurnAbortController(turn.turnId, lease.controller);
    state.clearActiveTurnCancellation?.();
    store.setState({
        activeTurn: turn,
        isBusy: true,
        chatLifecycleState: 'running',
        pendingClarification: null,
    });
    const receipts: QueryExecutionReceipt[] = [];
    const mcpObservations: import('../../connectors/httpMcpContract').McpObservationReceipt[] = [];
    let mcpAttempted = false;
    const computationReceipts: ComputationEvidenceReceipt[] = [];
    let understoodArtifact=request.queryUnderstandingArtifact;
    let answerScope = request.continuation?.scope ?? resolveAnswerScope(request.message, request.queryUnderstandingArtifact, request.groundingResult, store, request.intentFindings);
    let groundingVerdict: import('./queryEvidence').QueryGroundingVerdict | undefined;
    let agent: Agent | null = null;
    let unsubscribe: (() => void) | undefined;
    const telemetry = createReplyTelemetryTracker();
    let status: PiFollowUpResult['status'] = 'failed';
    let text = '';
    let pendingMutation: Record<string, unknown> | null = null;
    let pendingClarification: ClarificationRequest | null = null;
    let providerTurns = 0;
    let terminalReason = '';
    let acceptedQueryIds: string[] = [], acceptedComputationIds: string[] = [];
    let acceptedArtifact: ReturnType<NonNullable<typeof logicalTask>['outputReceipt']>;
    let evidenceRevision = 0;
    const collectAcceptedWork = () => {
        if (!logicalTask || !canCommitRun(store, lease)) return;
        evidenceRevision = logicalTask.snapshot.revision;
        acceptedQueryIds = admitQueryEvidence(store, lease, answerScope, receipts).verdict.queryIds;
        const computation = answerScope.computation ? admitComputationEvidence(store, lease, computationReceipts).receipt : undefined;
        acceptedComputationIds = computation ? [computation.evidenceId] : [];
        try { acceptedArtifact = logicalTask.outputReceipt(); } catch { acceptedArtifact = undefined; }
    };
    let createdCardIds: string[] = [];
    const gatedCardIds = new Set<string>();
    const tableOnlyCardIds = new Set<string>();
    const gateRejections: PiCardGateRejection[] = [];
    // Open-ended analysis is the only route held to the evidence value gate;
    // explicit card requests keep the user's exact specification.
    const settleCreatedCards = () => {
        if (!isBatchAnalysis) return;
        const pending = createdCardIds.filter(id => !gatedCardIds.has(id));
        if (pending.length === 0) return;
        pending.forEach(id => gatedCardIds.add(id));
        const gate = gatePiCreatedCards(store, pending);
        gate.tableOnlyIds.forEach(id => tableOnlyCardIds.add(id));
        gateRejections.push(...gate.rejected);
        const rejectedIds = new Set(gate.rejected.map(item => item.cardId));
        createdCardIds = createdCardIds.filter(id => !rejectedIds.has(id));
    };
    let failureClass: 'provider' | 'tool_execution' = 'provider';
    const isBatchAnalysis = request.intentFindings?.intent === 'batch_analysis';
    const allowCardCreation = request.queryUnderstandingArtifact?.expectedOutput === 'chart_card'
        || !request.queryUnderstandingArtifact && request.intentFindings?.intent === 'precise_card'
        || isBatchAnalysis;
    const cardTarget = isBatchAnalysis ? BATCH_ANALYSIS_CARD_TARGET : 1;
    const maxProviderTurns = isBatchAnalysis ? BATCH_ANALYSIS_MAX_PROVIDER_TURNS : DEFAULT_MAX_PROVIDER_TURNS;
    try {
        logicalTask = (await preparePiExecutor(store, {entryPoint:'follow_up',goal:request.message,continuation:request.taskContinuation})).task;
        await logicalTask.resolveScope(answerScope);
        if (allowCardCreation) logicalTask.requireOutputs([
            {id:'card',kind:'card',required:true},
            ...(!isBatchAnalysis && answerScope.requiresEvidence ? [{id:'reply',kind:'answer' as const,required:true}] : []),
        ]);
        logicalTask.attach(store);
        await persistCurrentAppSessionSnapshot(state, { store, scope: lease.scope });
        if (!streamOverride) await ensureCloudAiConsent(state.settings.provider);
        const appMemory = await awaitOwned(readAppFollowUpMemory(store, request.message), store, lease);
        if (controller.signal.aborted) throw controller.signal.reason;
        const prompt = createPiFollowUpSystemPrompt(store.getState(), appMemory, {
            ...request,queryUnderstandingArtifact:understoodArtifact,
            allowCardCreation,
            cardTarget,
            codingTask: logicalTask.snapshot,
            taskPlan: logicalTask.plan,
            skillsPrompt:formatPinnedSkills(logicalTask.skills,store),
        });
        const providerStream = streamOverride ?? createPiProviderStream(state.settings);
        agent = new Agent({
            initialState: {
                systemPrompt: prompt,
                messages: request.continuation?.history,
                model: resolvePiModel(state.settings),
                thinkingLevel: resolvePiThinkingLevel(state.settings),
                tools: createPiAppTools(store, datasetVersion, {
                    allowCardCreation,
                    ...(!request.continuation&&request.queryUnderstandingArtifact?{scopeRepair:{context:{message:request.message,artifact:request.queryUnderstandingArtifact,grounding:request.groundingResult,findings:request.intentFindings},onResolved:scope=>{answerScope=scope;understoodArtifact={...understoodArtifact!,filterDescription:scope.computation?.where?understoodArtifact!.filterDescription:null,requestedComputationScope:scope.computation};}}}:{}),
                    ...(isBatchAnalysis ? { maxToolCalls: BATCH_ANALYSIS_MAX_TOOL_CALLS } : {}),
                    onComputationValidated: receipt => { computationReceipts.push(receipt); collectAcceptedWork(); },
                    onQueryExecuted: receipt => { receipts.push(receipt); collectAcceptedWork(); },
                    onMcpObserved: receipt => { mcpObservations.push(receipt); },
                    onCardCreated: cardId => { createdCardIds.push(cardId); },
                }),
            },
            streamFn: (...args) => { logicalTask!.providerTurn(maxProviderTurns); return providerStream(...args); },
            transformContext: createPiProviderContextTransform(state.settings, createPiCompactionTelemetry(store)),
            toolExecution: 'sequential',
            finishTurn: async ({message, toolResults}) => {
                providerTurns += 1;
                collectAcceptedWork();
                if (toolResults.some(result => result.isError && result.content.some(part => part.type === 'text'
                    && part.text.includes('The dataset changed during tool execution.')))) throw new Error('The dataset changed during tool execution. Start a fresh request against the current version.');
                if (toolResults.some(result => result.isError && result.content.some(part => part.type === 'text'
                    && /The limit of \d+ app tools was reached/.test(part.text)))) terminalReason = 'task_budget_exhausted:toolCalls';
                // Pi 0.87.1 bypasses afterToolCall for schema-validation failures. Finished tool results cover both paths.
                if (!pendingMutation) for (const result of toolResults) {
                    if (result.isError && !logicalTask!.blockedReason && (logicalTask!.coding
                        || /^(code_|workspace_(write|replace|append))/.test(result.toolName))) {
                        const call = message.content.find(part => part.type === 'toolCall' && part.id === result.toolCallId);
                        await logicalTask!.toolFailure(result.toolName, call?.type === 'toolCall' ? call.arguments : undefined,
                            result.content.filter(part => part.type === 'text').map(part => part.text).join('\n'), result.toolCallId);
                    }
                }
                pendingClarification ??= pendingPiCandidateApproval(store) ?? store.getState().pendingClarification;
                if (!pendingMutation && !pendingClarification && createdCardIds.length < cardTarget
                    && providerTurns >= (logicalTask.coding ? logicalTask.snapshot.budget.limits.providerTurns : maxProviderTurns)
                    && message.content.some(part => part.type === 'toolCall')) terminalReason = 'task_budget_exhausted:providerTurns';
                return pendingMutation || pendingClarification || logicalTask.blockedReason || createdCardIds.length >= cardTarget
                    || terminalReason
                    || providerTurns >= (logicalTask.coding ? logicalTask.snapshot.budget.limits.providerTurns : maxProviderTurns)
                    ? { action: 'end' } : undefined;
            },
            beforeToolCall: async ({ toolCall, args, assistantMessage }) => {
                if (logicalTask.blockedReason) return { block: true, reason: logicalTask.blockedReason, terminate: true };
                const dependency=taskDependencyBlock(toolCall.name,assistantMessage.content.filter(part=>part.type==='toolCall').map(part=>part.name));
                if(dependency)return {block:true,reason:dependency};
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
            unsubscribe = agent.subscribe(event => {
                if (!canCommitRun(store, lease)) return;
                const hadMcpAttempt = mcpAttempted;
                if (event.type === 'tool_execution_start' && event.toolName.startsWith('mcp_')) mcpAttempted = true;
                if ((event.type === 'message_start' || event.type === 'message_update' || event.type === 'message_end')
                    && event.message.role === 'assistant' && event.message.content.some(part => part.type === 'toolCall' && part.name.startsWith('mcp_'))) mcpAttempted = true;
                if (mcpAttempted && !hadMcpAttempt) store.setState({streamingMessage:null});
                telemetry.observe(event);
                const partial = readAssistantText(event);
                if (partial && !mcpAttempted) store.getState().setStreamingMessage?.(partial);
            });
            if (controller.signal.aborted) throw controller.signal.reason;
            await awaitOwned(agent.prompt(request.continuation
                ? `Exact candidate approval committed ${request.continuation.commitId}. Continue the same task. Old queries and code output are historical. ${answerScope.computation
                    ? 'Write a separate task-specific program, execute code_run on the complete committed table, and pass its actual jobId to computation_validate. A data_query preview cannot complete this computation.'
                    : 'Execute fresh data.query for the fixed verification scope.'} Fixed verification scope: ${JSON.stringify(answerScope)}. Then complete the original request: ${request.message}`
                : request.message), store, lease);
        } finally {
            controller.signal.removeEventListener('abort', abort);
        }
        assertRunActive(store, lease);
        if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
        const lastAssistant = [...agent.state.messages].reverse().find(message => message.role === 'assistant');
        if (lastAssistant?.stopReason === 'length') terminalReason = 'task_budget_exhausted:providerOutput';
        settleCreatedCards();
        if (logicalTask.blockedReason || terminalReason) {
            status = 'blocked'; text = `The task stopped: ${logicalTask.blockedReason || terminalReason}. Accepted work is retained. Start a new request to continue within a fresh budget.`;
        } else if (pendingClarification) {
            status = 'blocked'; text = pendingClarification.question;
        } else if (pendingMutation) {
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
        const gateNote = gateRejections.length > 0 ? `\n${describeRejectedCards(gateRejections)}` : '';
        if (createdCards.length > 0 && answerScope.requiresEvidence && (!isBatchAnalysis || request.queryUnderstandingArtifact)) {
            const admitted = admitQueryEvidence(store, lease, answerScope, receipts);
            groundingVerdict = admitted.verdict;
            text = admitted.verdict.status === 'accepted'
                ? `${describeCreatedCards(createdCards, tableOnlyCardIds)}\nEvidence: ${admitted.verdict.queryIds.join(', ')}`
                : `Cards were saved for review. No verified answer is available: ${admitted.verdict.reasons.join(' ')}`;
            status = admitted.verdict.status === 'accepted' ? 'completed' : 'blocked';
        } else if (allowCardCreation && !isBatchAnalysis && createdCards.length === 0) {
            failureClass = 'tool_execution';
            text = 'Pi could not add the requested dashboard card. The query result was not saved as a card. Please retry or review the analysis data.';
            status = 'failed';
        } else if (createdCards.length > 0) {
            store.getState().setResultsViewMode?.('explore');
            text = `${describeCreatedCards(createdCards, tableOnlyCardIds)}${gateNote}`;
            status = 'completed';
        } else if (gateRejections.length > 0) {
            text = describeRejectedCards(gateRejections);
            status = 'blocked';
        } else {
            const last = [...agent.state.messages].reverse().find(message => message.role === 'assistant');
            text = last?.content.filter(part => part.type === 'text')
                .map(part => part.text).join('\n').trim() ?? '';
            if (!text && !answerScope.requiresEvidence) throw new Error('Pi completed without an answer.');
            if (answerScope.requiresEvidence && answerScope.computation) {
                const admitted = admitComputationEvidence(store, lease, computationReceipts);
                const reasons = [...answerScope.unresolved, ...(admitted.receipt ? [] : [admitted.reason!])];
                status = reasons.length ? 'blocked' : 'completed';
                groundingVerdict = {status:reasons.length ? answerScope.unresolved.length ? 'clarification' : 'blocked' : 'accepted', queryIds:[],
                    computationIds: admitted.receipt ? [admitted.receipt.evidenceId] : [], reasons, scope:answerScope};
                text = status === 'completed' ? formatComputationEvidence(admitted.receipt!) : `No verified answer is available: ${reasons.join(' ')}`;
                if (groundingVerdict.status === 'clarification') { pendingClarification={question:text,options:[],allowFreeText:true,clarificationMode:'free_text'}; store.setState({pendingClarification}); }
            } else if (answerScope.requiresEvidence) {
                const admitted = admitQueryEvidence(store, lease, answerScope, receipts);
                groundingVerdict = admitted.verdict;
                if (admitted.verdict.status !== 'accepted') {
                    text = `No verified answer is available: ${admitted.verdict.reasons.join(' ')}`;
                    status = 'blocked';
                    if (admitted.verdict.status === 'clarification') {
                        pendingClarification = { question: text, options: [], allowFreeText: true, clarificationMode: 'free_text' };
                        store.setState({ pendingClarification });
                    }
                } else {
                    const currentState = store.getState();
                    const params = { userMessage: request.message, query: admitted.evidence[0],
                        fileName: state.csvData?.fileName ?? null, language: state.settings.language,
                        qualityCaveats: currentState.dataQualityIssues };
                    const derived = formatValidatedCalculation(answerScope, admitted.evidence);
                    const derivedReply = derived ?? (admitted.evidence.length === 1
                        ? buildGroundedDerivedMarginReply(params)
                            ?? buildGroundedDerivedCostPerResultReply(params)
                            ?? buildGroundedRankedShareReply(params)
                        : null);
                    const emptyResult = admitted.evidence.every(query => query.result.returnedRows === 0 && query.result.totalMatchedRows === 0);
                    // Accepted inputs alone do not fulfill a derived answer; a raw table is not the requested calculation.
                    if ((answerScope.calculation && !derived)
                        || (requiresCompleteAggregateEvidence(request.message) && !derivedReply && !emptyResult)) {
                        status = 'blocked';
                        text = buildIncompleteRankedShareReply(params)
                            ?? 'The current query inputs cannot safely complete the requested calculation (missing group, value, or nonzero denominator).';
                        groundingVerdict = { ...admitted.verdict, status: 'blocked', reasons: [text] };
                    } else {
                        const formatted = derivedReply ?? (admitted.evidence.length === 1
                            ? buildGroundedCompleteQueryReply(params)
                                ?? formatValidatedQueryReply(admitted.evidence[0], state.settings.language)
                            : admitted.evidence.map((query, index) => `${answerScope.queries[index].role}:\n${formatValidatedQueryReply(query, state.settings.language)}`).join('\n\n'));
                        text = `${formatted}\n\nEvidence: ${admitted.verdict.queryIds.join(', ')}`;
                        status = 'completed';
                    }
                }
            } else if (logicalTask.coding) {
                const output = logicalTask.outputReceipt();
                if (!output) {
                    status = 'blocked';
                    const observation = store.getState().taskInspection?.observations.at(-1);
                    const detail = observation && observation.status !== 'success' && observation.status !== 'succeeded'
                        ? ` Last execution issue: ${sanitizeError(observation.message).slice(0,500)}` : '';
                    text = `No current successful code execution supports this output.${detail} Restore the required executor/source/artifact, then repair and run the program before completing the task.`;
                }
                else {
                    status = 'completed';
                    const validation=logicalTask.validationState().receipt;
                    text = `Staged ${output.output!.path} revision ${output.output!.revision} (execution ${output.jobId}; program revision ${output.program!.revision}). ${validation?.decision==='validated'?`Independent host validation passed (${validation.validationId}; contract ${validation.contractDigest}). Exact approval and dataset commit remain pending.`:'Independent data validation and dataset commit remain pending.'} Accepted data is unchanged.`;
                }
            } else if (mcpAttempted) {
                status = 'blocked';
                const observed = mcpObservations.length > 0;
                text = `${observed ? `External observations received (${mcpObservations.map(receipt => receipt.receiptId).join(', ')}).` : 'No accepted external observation was received.'} No verified factual answer is available: upstream selection, completeness and snapshot are unverified. Review the diagnostic tool results or run a current dataset query for a local-data answer.`;
                groundingVerdict = {status:'blocked',queryIds:[],reasons:[observed?'remote_observation_not_verified':'remote_execution_not_accepted'],scope:answerScope};
            } else status = 'completed';
        }
        }
        const validation=logicalTask.validationState();
        if(validation.requested&&validation.receipt?.decision!=='validated'){
            status='blocked';text=`Candidate validation cannot complete this task: ${validation.receipt?.reasonCodes.join(', ')||'validation_receipt_unavailable'}.`;
            if(validation.receipt?.decision==='clarification'){
                text+=' Accepted data is unchanged. Repair meaning must be inferred automatically and checked from complete source before code execution; no user semantic confirmation is required. Start a new task with candidate_infer_meaning before code_run if the current task already executed without a meaning contract.';
            }
        }
    } catch (error) {
        status = !ownsRun(store, lease) || controller.signal.aborted ? 'cancelled' : store.piTask?.blockedReason ? 'blocked' : 'failed';
        if (canCommitRun(store, lease)) settleCreatedCards();
            if (logicalTask?.blockedReason && ownsRun(store, lease)) status = 'blocked';
            text = logicalTask?.blockedReason && status === 'blocked' ? `The task stopped: ${logicalTask.blockedReason}.`
                : status === 'cancelled'
                ? 'The request was cancelled.'
                : `Pi could not complete this request: ${presentGatewayError(sanitizeError(error), state.settings.language)}`;
    } finally {
        if (canCommitRun(store, lease)) attachEvidenceVerdicts(store, createdCardIds);
        unsubscribe?.();
        activeAgents.delete(turn.turnId);
        clearRuntimeTurnAbortController(turn.turnId, controller);
        if (ownsRun(store, lease)) {
            collectAcceptedWork();
            let approvalSealed=false;
            if (status==='blocked' && pendingClarification && logicalTask && !logicalTask.blockedReason && canCommitRun(store, lease)) {
                try {
                    pendingClarification = logicalTask.suspend(pendingClarification);
                    if (pendingClarification.resumeContext?.piCandidateApproval) {
                        sealPiCandidateApproval(store,pendingClarification,{...request,queryUnderstandingArtifact:understoodArtifact},agent?.state.messages??[],answerScope,streamOverride);
                        approvalSealed=true;
                    } else store.setState({ pendingClarification });
                } catch {
                    status=lease.signal.aborted?'cancelled':'blocked';
                    text=`The task could not suspend: ${logicalTask.blockedReason||'approval_unavailable'}.`;
                    pendingClarification=null;
                    originalStore.setState({pendingClarification:null});
                    if(logicalTask.snapshot.status==='awaiting_approval'&&canCommitRun(store,lease))logicalTask.rejectApproval();
                }
            }
            if(!approvalSealed){
                discardPiCandidateApproval(store);
                if(pendingClarification?.resumeContext?.piCandidateApproval)pendingClarification=null;
            }
            const acceptedOutputs: RuntimeAcceptedTaskOutput[] = [];
            const requirements = logicalTask?.snapshot.requiredOutputs ?? [{id:'reply',kind:'answer' as const,required:true}];
            if (evidenceRevision !== logicalTask?.snapshot.revision) { acceptedQueryIds=[]; acceptedComputationIds=[]; acceptedArtifact=undefined; }
            const acceptedCards = findSavedCards(store, createdCardIds).filter(card => card.evidenceValueGate?.decision !== 'reject');
            for (const requirement of requirements) {
                if (requirement.kind === 'dataset' && logicalTask?.plan.repairCommit) acceptedOutputs.push({requirementId:requirement.id,kind:'dataset',references:[logicalTask.plan.repairCommit.commitId]});
                if (requirement.kind === 'card' && acceptedCards.length) acceptedOutputs.push({requirementId:requirement.id,kind:'card',references:acceptedCards.map(card=>card.id)});
                if (requirement.kind === 'artifact' && acceptedArtifact?.output) acceptedOutputs.push({requirementId:requirement.id,kind:'artifact',references:[acceptedArtifact.jobId,`${acceptedArtifact.output.path}@${acceptedArtifact.output.revision}`]});
                if (requirement.kind === 'answer' && status === 'completed' && text.trim()
                    && (!answerScope.requiresEvidence || groundingVerdict?.status === 'accepted')) acceptedOutputs.push({requirementId:requirement.id,kind:'answer',references:answerScope.requiresEvidence?[...acceptedQueryIds,...acceptedComputationIds]:[`reply:${turn.turnId}`]});
            }
            let taskOutputs = assessTaskOutputs({taskId:logicalTask?.snapshot.taskId??`unprepared:${turn.turnId}`,taskRevision:logicalTask?.snapshot.revision??0,
                runId,sessionId:lease.scope.sessionId,requiredOutputs:requirements,acceptedOutputs,queryIds:acceptedQueryIds,computationIds:acceptedComputationIds,
                reasons:status==='completed'?[]:[terminalReason||logicalTask?.blockedReason||text]});
            if (status === 'completed' && taskOutputs.status !== 'complete') {
                status='blocked';text=`The task cannot complete: ${taskOutputs.reasons.join(' ')}. Review the retained outputs and execute the missing verified step.`;
            }
            const closedStatus = logicalTask?.close(status);
            if (closedStatus === 'blocked' && status === 'completed') { status='blocked';text=`The task stopped: ${logicalTask!.blockedReason}. Accepted work is retained.`; }
            taskOutputs = assessTaskOutputs({...taskOutputs,reasons:status==='completed'?[]:[...taskOutputs.reasons,terminalReason||logicalTask?.blockedReason||text]});
            if (logicalTask?.blockedReason && status === 'completed') {
                status = 'blocked'; text = `The task stopped: ${logicalTask.blockedReason}.`;
            }
            if (status !== 'completed' && (taskOutputs.acceptedOutputs.length || taskOutputs.queryIds.length || taskOutputs.computationIds.length)) {
                text += `\nAccepted partial work is retained: ${[...taskOutputs.acceptedOutputs.flatMap(output=>output.references),...taskOutputs.queryIds,...taskOutputs.computationIds].join(', ')}. Review these outputs before retrying to avoid duplicates.`;
            }
            publishTaskOutcome(store, text, groundingVerdict, receipts, computationReceipts, taskOutputs);
            store = originalStore;
            store.setState({ streamingMessage: null });
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
                    ? markTurnWaitingForClarification(turn, pendingClarification?.resumeContext?.piCandidateApproval ? null : pendingClarification)
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
                    eventDetail: { runtimeOwner: 'pi', ...(logicalTask?.coding ? { task: logicalTask.snapshot, codingBlockedReason: logicalTask.blockedReason } : {}), ...(groundingVerdict ? { groundingVerdict } : {}) },
                    taskOutputs,
                    assistantMessage: status === 'cancelled' || pendingMutation || pendingClarification?.resumeContext?.piCandidateApproval ? null : text,
                    assistantMessageIsError: status === 'failed',
                    assistantTelemetry: telemetry.snapshot(state.settings.reasoningEffort),
                    assistantCardId: status === 'completed' ? (createdCardIds[createdCardIds.length - 1] ?? null) : null,
                },
            });
            if (status === 'blocked') store.setState({ isBusy: false, chatLifecycleState: 'blocked' });
            if (pendingClarification?.resumeContext?.piCandidateApproval) {
                // Ownership release and review publication are one store commit, including the activeTurn fallback.
                finishRun(store,lease,prev=>({pendingClarification,activeAgentTask:logicalTask!.snapshot,
                    activeTurn:prev.activeTurn?{...prev.activeTurn,pendingClarificationRequest:pendingClarification}:null,
                    chatHistory:[...prev.chatHistory,createChatMessage({sender:'ai',text:pendingClarification!.question,
                        type:'ai_clarification',timestamp:new Date(),clarificationRequest:pendingClarification!})]}));
            } else if(ownLease) finishRun(store,lease);
        } else discardPiCandidateApproval(store);
        logicalTask?.close(status);
    }
    return { status, appTurnId: turn.turnId, text };
};

export const cancelPiFollowUpTurn = (turnId: string): void => {
    activeAgents.get(turnId)?.abort();
};
