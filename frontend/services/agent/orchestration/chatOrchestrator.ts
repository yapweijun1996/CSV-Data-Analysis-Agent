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
import { runDataAnalysisSession } from '../runtime/dataAnalysisSessionRunner';
import { classifyChatIntent } from '../runtime/intentClassifier';
import { resolveGrounding } from '../runtime/runtimeGrounding';
import { getKnownColumnAliases, resolveColumnReference } from '../../data/columnRegistry';

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
        const exactMatch = messageLower.includes(nameLower);
        const aliasMatch = knownAliases.some(alias => messageLower.includes(alias.toLowerCase()));
        // Token overlap: any word in the column name appears in the message
        const nameTokens = nameLower.split(/[\s_-]+/).filter(t => t.length > 1);
        const tokenOverlap = nameTokens.some(nt => messageTokens.some(mt => mt.includes(nt) || nt.includes(mt)));
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

export const handleClarificationResponse = async (
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
        const { resumeAgrunFollowUpInteraction, runAgrunFollowUpTurn } =
            await import('../runtime/agrun/followUpRuntimeService');
        if (pendingClarification.resumeContext?.followUpRuntimeInteraction?.owner === 'agrun') {
            await resumeAgrunFollowUpInteraction(
                pendingClarification,
                userChoice,
                store,
            );
        } else {
            const { prepareAgrunClarificationCompatibilityRequest } =
                await import(
                    '../runtime/agrun/clarificationCompatibility'
                );
            const request =
                await prepareAgrunClarificationCompatibilityRequest(
                    userChoice,
                    store,
                );
            if (request) await runAgrunFollowUpTurn(request, store);
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

export const orchestrateChatResponse = async (message: string, store: StoreApi) => {
    const { getState, setState } = store;
    if (await tryHandlePendingMutationConfirmation(message, store)) {
        return;
    }

    const settings = getState().settings;

    const health = await validateProviderHealth(settings);
    if (health.status !== 'healthy') {
        const healthMessages: Record<string, string> = {
            not_configured: 'Cloud AI is disabled. API Key not provided.',
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

    const rowDeleteIntent = classifyRowDeleteIntent(message);
    if (rowDeleteIntent.kind === 'supported') {
        setState({ isBusy: true, pendingClarification: null });
        try {
            await runRowDeletePreflight(message, store);
        } finally {
            setState({ isBusy: false });
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

    // Build query-aware column summary for the classifier (AGENT-101).
    // Strategy: include columns that the user's message likely references,
    // plus a compact global context of remaining columns.
    // This avoids the silent loss of columns beyond a fixed positional cutoff.
    const columnSummary = buildColumnSummaryForClassifier(message, getState().columnProfiles);

    // Intent classification harness: AI-first with query understanding artifact
    getState().addProgress(getTranslation('chat_classifying_intent', settings.language));
    const routingDirective = await classifyChatIntent(
        message,
        settings,
        Boolean(getState().csvData),
        columnSummary,
    );
    console.log(`${LOG_PREFIX} Routing: ${routingDirective.target} (intent=${routingDirective.findings.intent}, by=${routingDirective.findings.classifiedBy}, confidence=${routingDirective.findings.confidence}${routingDirective.artifact ? ', artifact=' + routingDirective.artifact.taskSignal : ''})`);

    if (routingDirective.target === 'data_analysis_session') {
        setState({ isBusy: true, pendingClarification: null });
        try {
            const result = await runDataAnalysisSession({
                origin: 'chat_follow_up',
                goal: message,
                store,
                dataForAnalysis: getState().csvData,
            });
            const language = getState().settings.language;
            const goalLabel = message.length > 120 ? message.slice(0, 117) + '…' : message;
            const summaryText = result.acceptedCardCount > 0
                ? getTranslation('chat_analysis_session_success', language, { count: result.acceptedCardCount, goal: goalLabel })
                : getTranslation('chat_analysis_session_no_cards', language, { goal: goalLabel });
            // Link the newest accepted card so the chat bubble shows a
            // clickable "Show Card" button for quick navigation.
            const newestCardId = result.session.acceptedOutputs.length > 0
                ? result.session.acceptedOutputs[result.session.acceptedOutputs.length - 1].cardId
                : undefined;
            setState(prev => ({
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: summaryText,
                        timestamp: new Date(),
                        type: 'ai_message',
                        cardId: newestCardId,
                    }),
                ],
            }));
        } catch (error) {
            setState(prev => ({
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: getTranslation('chat_analysis_session_error', getState().settings.language, { error: error instanceof Error ? error.message : String(error) }),
                        timestamp: new Date(),
                        type: 'ai_message',
                        isError: true,
                    }),
                ],
            }));
        } finally {
            setState({ isBusy: false, aiTaskStatus: null });
        }
        return;
    }

    // AGENT-102: Resolve follow-up references against runtime state
    const groundingResult = routingDirective.artifact?.needsGrounding
        ? resolveGrounding(routingDirective.artifact, getState())
        : undefined;
    if (groundingResult?.resolvedAnchors.length) {
        console.log(`${LOG_PREFIX} Grounding: ${groundingResult.groundingConfidence} (${groundingResult.resolvedAnchors.length} resolved, ${groundingResult.unresolvedAnchors.length} unresolved)`);
    }

    // AGENT-207: Grounding-aware outcome resolution moved to queryUnderstandingResolver.
    // The contract builder now resolves needs_clarification → concrete outcome via
    // resolveExpectedOutcomeFromArtifact(artifact, groundingResult). No artifact mutation needed here.

    // Layer 3: Artifact continuity — when responding to a pending clarification,
    // preserve the ORIGINAL artifact (from the initial request) instead of using
    // the weak re-classification of "i dont know" / "continue". This prevents
    // the contract builder from defaulting to 'inspect' taskMode.
    const pendingClarification = getState().pendingClarification;
    const effectiveArtifact = pendingClarification?.resumeContext?.queryUnderstandingArtifact ?? routingDirective.artifact;
    const effectiveGrounding = pendingClarification?.resumeContext?.groundingResult ?? groundingResult;
    if (pendingClarification?.resumeContext?.queryUnderstandingArtifact) {
        console.log(`${LOG_PREFIX} Artifact continuity: using original artifact (${effectiveArtifact?.taskSignal}) instead of re-classified (${routingDirective.artifact?.taskSignal})`);
    }

    // AGRUN-010: promote app-owned report memory once, before selecting either
    // follow-up runtime. Agrun global memory remains disabled.
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
        const { runAgrunFollowUpTurn } = await import(
            '../runtime/agrun/followUpRuntimeService'
        );
        const canonicalArtifact = effectiveArtifact && getState().columnRegistry
            ? {
                ...effectiveArtifact,
                referencedColumns: effectiveArtifact.referencedColumns.map(column =>
                    resolveColumnReference(column, getState().columnRegistry) ?? column),
                groupingColumns: effectiveArtifact.groupingColumns.map(column =>
                    resolveColumnReference(column, getState().columnRegistry) ?? column),
            }
            : effectiveArtifact;
        await runAgrunFollowUpTurn({
            message,
            intentFindings: routingDirective.findings,
            queryUnderstandingArtifact: canonicalArtifact,
            groundingResult: effectiveGrounding,
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
