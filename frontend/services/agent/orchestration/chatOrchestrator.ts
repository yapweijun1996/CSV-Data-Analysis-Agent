import { beginRun, finishRun, scopeRunStore, ownsRun, awaitOwned, rootStore } from '../../session/sessionOwnership';
import {piCandidateApprovalRunKind} from '../runtime/pi/piCandidateApproval';
import { cancelAgentTurn, completeAgentTurn, createAgentTurn, failAgentTurn, markTurnWaitingForClarification } from '../runtime/runtimeState';
import { finalizeRuntimeOutcome } from '../runtime/runtimeFinalize';
import { isRuntimeAbortError } from '../runtime/runtimeAbort';
import type { ClarificationOption, ColumnProfile } from '../../../types';
import { validateProviderHealth } from '../../ai/providerConfig';
import type { StoreApi } from '../types';
import { runRowDeletePreflight, tryHandlePendingMutationConfirmation } from './chatMutationWorkflow';
import { classifyRowDeleteIntent } from './rowDeleteIntent';
import { createChatMessage } from '../../../utils/messageState';
import { getTranslation } from '../../../utils/localization';
import { formatUserError } from '../../../utils/userErrorMessage';
import { emitSilentFailure } from '../monitoring/silentFailureTracker';
import { resolveEffectivePendingClarification } from '../runtime/runtimeClarification';
import { classifyChatIntent } from '../runtime/intentClassifier';
import { resolveGrounding } from '../runtime/runtimeGrounding';
import { getKnownColumnAliases, resolveColumnReference } from '../../data/columnRegistry';
import { preparePiTask } from '../runtime/pi/piCodingTask';

const LOG_PREFIX = '[ChatOrchestrator]';

// ─── Query-aware column summary for classifier ─────────────────────────

/** Max total characters for the column summary string sent to the classifier. */
const COLUMN_SUMMARY_CHAR_BUDGET = 1800;

/**
 * Build a column summary for the classifier that prioritizes columns
 * the user's message likely references, then fills remaining budget
 * with global context columns.
 *
 * Strategy:
 * 1. Score each column by fuzzy match against the user message
 * 2. Include all matched columns first (query-relevant)
 * 3. Fill remaining budget with unmatched columns by position
 * 4. If truncated, append count of omitted columns
 *
 * This avoids the silent loss of columns beyond a fixed positional cutoff.
 */
export const buildColumnSummaryForClassifier = (
    message: string,
    columnProfiles?: ColumnProfile[],
): string | undefined => {
    if (!columnProfiles?.length) return undefined;

    const messageLower = message.toLowerCase();
    const messageTokens = messageLower.split(/[\s,;:'"()\[\]{}]+/).filter(t => t.length > 1);

    // Score columns: exact substring match in message, standard semantic alias,
    // or token overlap. This keeps common abbreviations such as CCY visible
    // when the user asks for the corresponding business term ("currency").
    const scored = columnProfiles.map((col, index) => {
        const nameLower = col.name.toLowerCase();
        const knownAliases = getKnownColumnAliases(col.name);
        // Exact substring match (handles multi-word column names like "BU NAME")
        const exactMatch = nameLower.length > 2
            ? messageLower.includes(nameLower)
            : messageTokens.includes(nameLower);
        const aliasMatch = knownAliases.some(alias => messageLower.includes(alias.toLowerCase()));
        // Token overlap: any word in the column name appears in the message
        const nameTokens = nameLower.split(/[\s_-]+/).filter(t => t.length > 1);
        // Substring overlap only for tokens of 3+ chars; 2-char tokens such as
        // "id" or "no" would otherwise match ordinary words ("provide", "know").
        const tokenOverlap = nameTokens.some(nt => messageTokens.some(mt =>
            mt === nt || (nt.length > 2 && mt.length > 2 && (mt.includes(nt) || nt.includes(mt)))));
        const matched = exactMatch || aliasMatch || tokenOverlap;
        return { col, index, matched };
    });

    // Split into matched (query-relevant) and unmatched (global context)
    const matched = scored.filter(s => s.matched);
    const unmatched = scored.filter(s => !s.matched);

    const formatCol = (col: ColumnProfile) => {
        const aliases = getKnownColumnAliases(col.name);
        const aliasSuffix = aliases.length > 0 ? `; aliases: ${aliases.join(', ')}` : '';
        return `${col.name} (${col.type ?? 'unknown'}${aliasSuffix})`;
    };

    // Build summary: matched first, then fill remaining budget with unmatched
    const parts: string[] = [];
    let charCount = 0;

    for (const { col } of matched) {
        const entry = formatCol(col);
        if (charCount + entry.length + 2 > COLUMN_SUMMARY_CHAR_BUDGET) break;
        parts.push(entry);
        charCount += entry.length + 2; // +2 for ", "
    }

    for (const { col } of unmatched) {
        const entry = formatCol(col);
        if (charCount + entry.length + 2 > COLUMN_SUMMARY_CHAR_BUDGET) break;
        parts.push(entry);
        charCount += entry.length + 2;
    }

    const omitted = columnProfiles.length - parts.length;
    const suffix = omitted > 0 ? ` (+${omitted} more columns)` : '';
    return parts.join(', ') + suffix;
};

const isRestartCleaningIntent = (message: string): boolean => {
    const normalized = message.trim().toLowerCase();
    return /\b(restart|redo|re-?run|retry)\b.*\b(clean|cleaning|cleanup)\b/.test(normalized)
        || /\b(clean|cleaning|cleanup)\b.*\b(restart|redo|re-?run|retry|again|from scratch)\b/.test(normalized);
};

const handleOwnedClarificationResponse = async (
    userChoice: ClarificationOption,
    store: StoreApi,
) => {
    const { getState, setState } = store;
    const pendingClarification = resolveEffectivePendingClarification(getState());
    if (!pendingClarification) {
        return;
    }

    console.log(`${LOG_PREFIX} Resuming runtime turn from clarification.`, { userChoice });
    setState({ isBusy: true });
    try {
        if (pendingClarification.resumeContext?.piSpillMeaningChoice) {
            const { resumeSpillMeaningChoice } = await import('../runtime/pi/piSpillMeaningChoice');
            await resumeSpillMeaningChoice(store, pendingClarification, userChoice);
        } else if (pendingClarification.resumeContext?.piCandidateApproval) {
            const {resumePiCandidateApproval}=await import('../runtime/pi/piCandidateApproval');
            await resumePiCandidateApproval(pendingClarification,userChoice,store);
        } else if (pendingClarification.resumeContext?.piMutationApproval) {
            const { resumePiMutationApproval } = await import('../runtime/pi/piMutationApproval');
            await resumePiMutationApproval(pendingClarification, userChoice, store);
        } else if (pendingClarification.interactionKind === 'approval') {
            setState({ pendingClarification: null, activeTurn: null });
            setState(prev => ({
                chatHistory: [...prev.chatHistory, createChatMessage({
                    sender: 'ai',
                    text: 'This approval belongs to an interrupted older runtime turn. No changes were made. Start a new request to review the action again.',
                    timestamp: new Date(),
                    type: 'ai_message',
                })],
            }));
        } else {
            const { preparePiClarificationCompatibilityRequest } =
                await import('../runtime/pi/clarificationCompatibility');
            const request = await preparePiClarificationCompatibilityRequest(userChoice, store);
            if (request) {
                const { runPiFollowUpTurn } = await import('../runtime/pi/piFollowUpRuntimeService');
                await runPiFollowUpTurn(request, store);
            }
        }
    } catch (error) {
        console.error(`${LOG_PREFIX} resumeAgentTurnFromClarification threw unexpectedly.`, error);
        const language = getState().settings.language;
        const userError = formatUserError(error, { surface: 'chat', language });
        emitSilentFailure(store, error, {
            component: 'ChatOrchestrator',
            recoveryAction: 'clarification_resume_error_message_shown',
            userNotified: true,
        });
        setState(prev => ({
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    // fullText = message + suggestion, replacing the fixed localization key
                    text: userError.fullText,
                    timestamp: new Date(),
                    type: 'ai_message',
                    isError: true,
                }),
            ],
        }));
    } finally {
        setState({ isBusy: false });
    }
};

const orchestrateOwnedChatResponse = async (message: string, store: StoreApi) => {
    const { getState, setState } = store;
    if (await tryHandlePendingMutationConfirmation(message, store)) {
        return;
    }

    const settings = getState().settings;

    const health = await awaitOwned(validateProviderHealth(settings), store, store.executionContext!.lease);
    if (health.status !== 'healthy') {
        const healthMessages: Record<string, string> = {
            not_configured: getTranslation('provider_health_not_configured', settings.language),
            invalid_key: getTranslation('provider_health_invalid_key', settings.language),
            unreachable: getTranslation('provider_health_unreachable', settings.language),
        };
        setState(prev => ({
            isBusy: false,
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: healthMessages[health.status] ?? 'AI provider is unavailable.',
                    timestamp: new Date(),
                    type: 'ai_message',
                    isError: true,
                }),
            ],
        }));
        // Auto-open settings for key issues (not network issues).
        // setIsSettingsModalOpen has its own shouldAllowSettingsSurface() guard.
        if (health.status !== 'unreachable') {
            getState().setIsSettingsModalOpen(true);
        }
        return;
    }

    if (isRestartCleaningIntent(message) && getState().cleaningRun) {
        console.log(`${LOG_PREFIX} Detected restart-cleaning intent, routing to restartCleaningRun.`);
        setState({ isBusy: true, pendingClarification: null });
        try {
            await getState().restartCleaningRun();
        } catch (error) {
            console.error(`${LOG_PREFIX} restartCleaningRun threw unexpectedly.`, error);
            const language = getState().settings.language;
            setState(prev => ({
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: formatUserError(error, { surface: 'chat', language }).fullText,
                        timestamp: new Date(),
                        type: 'ai_message',
                        isError: true,
                    }),
                ],
            }));
        } finally {
            setState({ isBusy: false });
        }
        return;
    }

    // Promote app-owned report memory once; it remains the source of truth.
    void import('../memory/followUpMemory')
        .then(({ promoteAppFollowUpMemory }) =>
            promoteAppFollowUpMemory(store, message))
        .catch(error => {
            console.warn(
                `${LOG_PREFIX} Follow-up memory promotion degraded (non-blocking):`,
                error,
            );
        });

    setState({ isBusy: true, pendingClarification: null });
    try {
        const { runPiFollowUpTurn } = await import(
            '../runtime/pi/piFollowUpRuntimeService'
        );
        await runPiFollowUpTurn({
            message,
        }, store);
    } catch (error) {
        console.error(`${LOG_PREFIX} follow-up runtime threw unexpectedly.`, error);
        const language = getState().settings.language;
        const userError = formatUserError(error, { surface: 'chat', language });
        emitSilentFailure(store, error, {
            component: 'ChatOrchestrator',
            recoveryAction: 'run_agent_turn_error_message_shown',
            userNotified: true,
        });
        setState(prev => ({
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: userError.fullText,
                    timestamp: new Date(),
                    type: 'ai_message',
                    isError: true,
                }),
            ],
        }));
    } finally {
        setState({ isBusy: false });
    }
};

const withFollowUpLease = async (message: string, store: StoreApi, operation: (owned: StoreApi) => Promise<void>): Promise<void> => {
    const turn = createAgentTurn(message);
    const pending=store.getState().pendingClarification;
    const kind=pending?.resumeContext?.piSpillMeaningChoice?'initial_analysis':pending?.resumeContext?.piCandidateApproval?piCandidateApprovalRunKind(store,pending):'follow_up';
    const lease = beginRun(store, kind, turn.runId, turn.turnId);
    const scoped = scopeRunStore(store, lease);
    const startingMessageCount = store.getState().chatHistory.length;
    let failed = false;
    store.setState({ isBusy: true, activeTurn: turn, chatLifecycleState: 'running' });
    try {
        await preparePiTask(scoped, message, store.getState().pendingClarification?.resumeContext?.piTaskContinuation);
        await awaitOwned(operation(scoped), scoped, lease);
    }
    catch (error) {
        if (!isRuntimeAbortError(error) && !lease.signal.aborted) {
            failed = true;
            if (error instanceof Error && error.message === 'task_continuation_unavailable') {
                // Saved locators carry no execution authority after reload. Clear
                // the unusable prompt so the next request can acquire a new task.
                scoped.setState(prev => ({
                    pendingClarification: null,
                    chatHistory: [...prev.chatHistory, createChatMessage({
                        sender: 'ai',
                        text: 'The saved coding task cannot resume in this session. No changes were made. Start a new request.',
                        timestamp: new Date(),
                        type: 'ai_message',
                        isError: true,
                    })],
                }));
                return;
            }
            throw error;
        }
    } finally {
        if (ownsRun(store, lease)) {
            const root = rootStore(store);
            const state = root.getState();
            // Pi finalizes its own turn. Preflight exits must also leave a terminal
            // turn, otherwise the chat queue treats an unavailable provider as busy.
            if (state.activeTurn?.turnId === turn.turnId && state.activeTurn.status === 'running') {
                const lastMessage = state.chatHistory.slice(startingMessageCount).filter(item => item.sender === 'ai').at(-1);
                const status = lease.signal.aborted ? 'cancelled'
                    : state.pendingClarification || state.pendingMutationConfirmation ? 'blocked'
                        : failed || lastMessage?.isError ? 'failed' : 'completed';
                const summary = status === 'cancelled' ? 'The request was cancelled during preflight.'
                    : lastMessage?.text ?? `Follow-up preflight ${status}.`;
                const observation = { type: 'runtime_error' as const, status: 'error' as const, summary };
                const finished = status === 'cancelled' ? cancelAgentTurn(state.activeTurn, observation)
                    : status === 'failed' ? failAgentTurn(state.activeTurn, observation)
                        : status === 'blocked' ? markTurnWaitingForClarification(state.activeTurn, state.pendingClarification)
                            : completeAgentTurn(state.activeTurn, summary);
                finalizeRuntimeOutcome({
                    store: root,
                    turn: finished,
                    outcome: {
                        runId: lease.runId,
                        turnId: lease.turnId,
                        sessionId: lease.scope.sessionId,
                        outcomeKind: status === 'completed' ? 'accepted' : status,
                        lifecycleState: status === 'blocked' ? 'waiting_for_clarification' : status,
                        stage: 'finalizing',
                        reason: `pi_preflight_${status}`,
                        retryable: status === 'failed',
                        eventType: status === 'completed' ? 'turn_completed' : status === 'cancelled' ? 'turn_cancelled'
                            : status === 'blocked' ? 'turn_blocked' : 'turn_failed',
                        eventMessage: summary,
                        eventDetail: { runtimeOwner: 'pi' },
                        assistantMessage: null,
                    },
                });
                root.setState({ streamingMessage: null, ...(status === 'blocked' ? { chatLifecycleState: 'blocked' as const } : {}) });
                root.getState().clearActiveTurnCancellation?.();
            }
            root.setState({ isBusy: false, ...(lease.kind === 'initial_analysis' && lease.signal.aborted
                ? {isGeneratingReport: false, initialAnalysisStatus: 'paused' as const, initialAnalysisFailureKind: null} : {}) });
        }
        scoped.piTask?.close(lease.signal.aborted ? 'cancelled' : failed || store.getState().chatLifecycleState === 'failed' ? 'failed'
            : store.getState().chatLifecycleState === 'blocked' ? 'blocked' : 'completed');
        finishRun(store, lease);
    }
};
export const orchestrateChatResponse = (message: string, store: StoreApi): Promise<void> =>
    withFollowUpLease(message, store, owned => orchestrateOwnedChatResponse(message, owned));
export const handleClarificationResponse = (choice: ClarificationOption, store: StoreApi): Promise<void> =>
    withFollowUpLease(choice.label, store, owned => handleOwnedClarificationResponse(choice, owned));
