import { generateText } from 'ai';
import type { AiAction, ToolName } from '../../../types';
import type { LlmError } from '../../ai/llmLogger';
import { buildAiSdkTools } from '../../ai/aiSdkToolAdapter';
import { createProviderModel, isProviderConfigured } from '../../ai/providerConfig';
import { withTransientRetry } from '../../ai/transientRetry';
import { handleAiAction } from '../actionHandler';
import { shouldResumeCleaningRun, updateCleaningRun } from '../cleaningRunState';
import { emitAgentEvent } from '../monitoring/agentMonitor';
import type { StoreApi } from '../types';
import { WORKSPACE_DATASET_CLEAN_CSV } from '../workspaceFileUtils';
import { parseAiActionResponse } from './actionResponseParser';
import { buildCleaningRequest, buildDeterministicRepairFeedback, getWideCrosstabRepairGuidance, serializeCleaningRequestForTelemetry, type CleaningLlmRequest } from './cleaningRequestBuilder';
import { reduceCleaningActionResult, reduceCleaningInvalidAction } from './cleaningRuntimePolicy';
import { resolveCleaningStrategy, type CleaningStrategyDecision } from './cleaningStrategyResolver';
import {
    canCompleteCleaningWithoutEdit,
    completeCleaningRun,
    failCleaningRun,
    getWideCrosstabCorrection,
    recoverNoEditCleaningRun,
    startCleaningRun,
} from './cleaningTerminalState';
import {
    buildCleaningVerificationReport,
} from '../cleaningVerification';
import { detectReportShape } from '../reportShapeDetector';
import { buildReshapeHypotheses } from '../reportShapeHypothesis';
import {
    buildRuntimeTableAssessmentFromIr,
    createCleaningRuntimeState,
    exceedsCleaningPhaseAttempts,
    getCleaningRetryTelemetry,
    hasRemainingCleaningPhaseAttempts,
    noteCleaningPhaseAttempt,
    restartCleaningFromInspect,
    shouldReinspectAfterReplaceFailure,
    transitionCleaningPhase,
    validateCleaningActionForPhase,
    type CleaningFailureCode,
    type CleaningPhase,
    type CleaningRuntimeState,
} from './cleaningRuntimePolicy';

const LOG_PREFIX = '[CleaningOrchestrator]';
const MAX_CLEANING_TURNS = 20;

type GeneratedToolCall = {
    toolName: string;
    input?: unknown;
};

const TOOL_NAME_PREFIXES = ['analysis.', 'card.', 'ui.', 'data.', 'spreadsheet.', 'workspace.', 'conversation.'];
const isToolNameLike = (value: unknown): value is ToolName =>
    typeof value === 'string' && TOOL_NAME_PREFIXES.some(prefix => value.startsWith(prefix));

const parseToolCallArgs = (toolCall: GeneratedToolCall): Record<string, unknown> => {
    if (toolCall.input && typeof toolCall.input === 'object' && !Array.isArray(toolCall.input)) {
        return toolCall.input as Record<string, unknown>;
    }
    return {};
};

const normalizeProviderToolCalls = (toolCalls: GeneratedToolCall[] | undefined): AiAction[] =>
    (toolCalls ?? [])
        .map(toolCall => {
            if (!toolCall?.toolName || !toolCall.toolName.trim() || !isToolNameLike(toolCall.toolName)) return null;
            return {
                type: 'tool_call' as const,
                thought: `Execute ${toolCall.toolName}.`,
                toolName: toolCall.toolName,
                args: parseToolCallArgs(toolCall),
            };
        })
        .filter((action): action is NonNullable<typeof action> => action !== null);

const normalizeAssistantSummary = (content: string): AiAction[] => {
    const trimmed = content.trim();
    if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return [];
    return [{
        type: 'assistant_message',
        thought: 'Summarize the cleaning result.',
        message: trimmed,
    }];
};

const resolveCleaningActions = (content: string, toolCalls: GeneratedToolCall[] | undefined): AiAction[] => {
    const providerActions = normalizeProviderToolCalls(toolCalls);
    const summaryActions = normalizeAssistantSummary(content);

    if (providerActions.length > 0) {
        return [...providerActions, ...summaryActions];
    }

    if (!content.trim()) {
        return summaryActions;
    }

    if (summaryActions.length > 0) {
        return summaryActions;
    }

    return parseAiActionResponse(content).actions;
};

const isProviderContractError = (error: unknown, provider: 'google' | 'openai' | 'default') => {
    const llmError = error as LlmError | undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (provider !== 'google') return false;
    return llmError?.status === 400
        || llmError?.code === 'INVALID_ARGUMENT'
        || message.includes('GenerateContentRequest.tools')
        || message.includes('INVALID_ARGUMENT');
};

const getPhaseExhaustionFailureCode = (
    phase: CleaningPhase,
    editApplied: boolean,
): CleaningFailureCode => {
    if (phase === 'verify') return editApplied ? 'failed_verification' : 'failed_no_edit';
    return editApplied ? 'failed_stalled' : 'failed_no_edit';
};

const getNoProgressFailureCode = (detail: string | null, editApplied: boolean): CleaningFailureCode => {
    if (detail?.startsWith('Repeated ')) {
        return 'failed_stalled';
    }
    return editApplied ? 'failed_stalled' : 'failed_no_edit';
};

const shouldStrictlyFailNoEditRun = (
    decision: CleaningStrategyDecision,
    runtime: CleaningRuntimeState,
) => decision.kind === 'already_valid' && !runtime.editApplied;

const canUseDeterministicRecovery = (
    decision: CleaningStrategyDecision,
    deterministicRecoveryUsed: boolean,
    repeatedPreferredActionCount: number,
) => !deterministicRecoveryUsed
    && (
        repeatedPreferredActionCount >= 2
        || decision.preferredActionSource === 'raw'
    );

const buildActionFingerprint = (action: AiAction) =>
    action.type === 'tool_call'
        ? `${action.toolName}:${JSON.stringify(action.args ?? {})}`
        : `assistant_message:${action.message}`;

const resolveCurrentCleaningStrategy = (
    store: StoreApi,
    runtime: CleaningRuntimeState,
): CleaningStrategyDecision => {
    const state = store.getState();
    const verificationReport = buildCleaningVerificationReport(
        state.rawCsvData,
        state.csvData,
        state.dataPreparationPlan,
    );
    const reportShapeProfile = state.rawCsvData ? detectReportShape(state.rawCsvData) : null;
    const reshapeHypotheses = reportShapeProfile ? buildReshapeHypotheses(reportShapeProfile, state.rawCsvData) : [];

    return resolveCleaningStrategy({
        rawData: state.rawCsvData,
        cleanedData: state.csvData,
        rawIntakeIr: state.rawIntakeIr,
        runtimeTableAssessment: runtime.tableAssessment,
        dataPreparationPlan: state.dataPreparationPlan,
        runtimeState: runtime,
        verificationReport,
        reportShapeProfile,
        reshapeHypotheses,
    });
};

const syncCleaningRunStrategy = (store: StoreApi, decision: CleaningStrategyDecision) => {
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            strategyKind: decision.kind,
            targetShape: decision.targetShape,
            lastVerificationReason: decision.verificationGap,
        }),
    }));
};

export const orchestrateAiCleaning = async (store: StoreApi, options?: { resume?: boolean }) => {
    const resume = Boolean(options?.resume);
    const { getState } = store;
    if (!isProviderConfigured(getState().settings) || !getState().csvData || !getState().rawCsvData) {
        return;
    }
    if (resume && !shouldResumeCleaningRun(getState().cleaningRun) && getState().cleaningRun?.status !== 'paused' && getState().cleaningRun?.status !== 'failed') {
        return;
    }

    startCleaningRun(store, resume);
    const providerName = getState().settings.provider;
    const providerModel = createProviderModel(getState().settings, getState().settings.complexModel);
    let selfCorrectionFeedback: string | null = getState().cleaningRun?.lastError ?? null;
    let runtime = createCleaningRuntimeState();
    let deterministicRecoveryUsed = false;
    let lastPreferredActionFingerprint: string | null = null;
    let repeatedPreferredActionCount = 0;

    for (let turn = 1; turn <= MAX_CLEANING_TURNS && runtime.phase !== 'done' && runtime.phase !== 'failed'; turn += 1) {
        runtime = noteCleaningPhaseAttempt(runtime);
        const strategyDecision = resolveCurrentCleaningStrategy(store, runtime);
        syncCleaningRunStrategy(store, strategyDecision);
        const preferredActionFingerprint = strategyDecision.preferredAction
            ? buildActionFingerprint(strategyDecision.preferredAction)
            : null;
        if (preferredActionFingerprint && preferredActionFingerprint === lastPreferredActionFingerprint) {
            repeatedPreferredActionCount += 1;
        } else {
            repeatedPreferredActionCount = preferredActionFingerprint ? 1 : 0;
        }
        lastPreferredActionFingerprint = preferredActionFingerprint;

        if (exceedsCleaningPhaseAttempts(runtime)) {
            const failureCode = getPhaseExhaustionFailureCode(runtime.phase, runtime.editApplied);
            if (failureCode === 'failed_no_edit' || failureCode === 'failed_stalled') {
                if (shouldStrictlyFailNoEditRun(strategyDecision, runtime)) {
                    failCleaningRun(store, failureCode, runtime.noProgressReason);
                    return;
                }
                const recovery = await recoverNoEditCleaningRun(
                    store,
                    runtime,
                    strategyDecision,
                    canUseDeterministicRecovery(strategyDecision, deterministicRecoveryUsed, repeatedPreferredActionCount),
                    runtime.noProgressReason,
                );
                if (recovery.resolved) {
                    deterministicRecoveryUsed = deterministicRecoveryUsed || Boolean(strategyDecision.preferredAction);
                    return;
                }
                failCleaningRun(store, recovery.failureCode ?? failureCode, recovery.reason);
                return;
            }
            failCleaningRun(store, failureCode, runtime.noProgressReason);
            return;
        }

        try {
            getState().addProgress(`AI cleaning turn ${turn}/${MAX_CLEANING_TURNS} (${runtime.phase})...`, 'system', getState().settings.complexModel);
            const { request: llmRequest, toolPolicySnapshot } = buildCleaningRequest(store, runtime, selfCorrectionFeedback, strategyDecision);
            const retryTelemetry = getCleaningRetryTelemetry(runtime, turn, MAX_CLEANING_TURNS);
            getState().logAgentToolUsage({
                tool: 'tool_registry',
                description: `Prepared cleaning tool policy for ${runtime.phase} turn ${turn}.`,
                stage: 'cleaning',
                category: 'conversation',
                risk: 'low',
                policyDecision: 'allowed',
                policyReason: `Resolved ${toolPolicySnapshot.allowedTools.length} allowed tool(s) for the ${runtime.phase} phase.`,
                detail: toolPolicySnapshot,
            });
            getState().logTelemetryEvent?.({
                stage: 'llm_request',
                responseType: 'ai_cleaning',
                detail: `Cleaning LLM request turn ${turn}/${MAX_CLEANING_TURNS} (${runtime.phase})`,
                meta: {
                    turn,
                    phase: runtime.phase,
                    retryBudget: retryTelemetry,
                    payload: serializeCleaningRequestForTelemetry(llmRequest as CleaningLlmRequest),
                    toolPolicy: toolPolicySnapshot,
                },
            });
            const result = await withTransientRetry(
                (fb) => generateText({
                    model: fb ?? providerModel.model,
                    messages: llmRequest.messages,
                    tools: buildAiSdkTools(llmRequest.tools, { provider: providerName }),
                    toolChoice: llmRequest.tools.length > 0 ? llmRequest.toolChoice : undefined,
                }),
                { settings: getState().settings, primaryModelId: providerModel.modelId, label: 'cleaningOrchestrator' },
            );
            const content = result.text ?? '';
            getState().logTelemetryEvent?.({
                stage: 'llm_response',
                responseType: 'ai_cleaning',
                detail: `Cleaning LLM response turn ${turn}/${MAX_CLEANING_TURNS} (${runtime.phase})`,
                meta: {
                    turn,
                    phase: runtime.phase,
                    retryBudget: retryTelemetry,
                    stopReason: result.finishReason ?? null,
                    content,
                    toolCalls: result.toolCalls ?? [],
                },
            });
            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    lastModelResponse: content || null,
                }),
            }));

            let actions: AiAction[] = [];
            try {
                actions = resolveCleaningActions(content, result.toolCalls as GeneratedToolCall[] | undefined);
            } catch (error) {
                getState().logTelemetryEvent?.({
                    stage: 'executor_error',
                    responseType: 'ai_cleaning_invalid_response',
                    detail: error instanceof Error ? error.message : String(error),
                    meta: {
                        turn,
                        phase: runtime.phase,
                        retryBudget: retryTelemetry,
                        content,
                        toolCalls: result.toolCalls ?? [],
                    },
                });
                selfCorrectionFeedback = `Your last ${runtime.phase} response could not be executed: ${error instanceof Error ? error.message : String(error)}. Return valid native tool calls only. ${strategyDecision.promptGuidance}`;
                continue;
            }

            if (actions.length === 0) {
                getState().logTelemetryEvent?.({
                    stage: 'executor_error',
                    responseType: 'ai_cleaning_invalid_response',
                    detail: `No valid ${runtime.phase} actions were returned.`,
                    meta: {
                        turn,
                        phase: runtime.phase,
                        retryBudget: retryTelemetry,
                        content,
                        toolCalls: result.toolCalls ?? [],
                    },
                });
                selfCorrectionFeedback = `No valid ${runtime.phase} actions were returned. Use the allowed tools for this phase. ${strategyDecision.promptGuidance}`;
                continue;
            }

            let executedToolAction = false;
            for (const action of actions) {
                const validationError = validateCleaningActionForPhase(
                    action,
                    runtime,
                    providerName,
                    getState().rawCsvData,
                    getState().rawIntakeIr,
                );
                if (validationError) {
                    getState().logTelemetryEvent?.({
                        stage: 'executor_error',
                        responseType: 'ai_cleaning_invalid_action',
                        detail: validationError,
                        meta: {
                            turn,
                            phase: runtime.phase,
                            retryBudget: retryTelemetry,
                            action,
                        },
                    });
                    runtime = reduceCleaningInvalidAction(runtime, action);
                    if (runtime.repeatedActionCount >= 2) {
                        failCleaningRun(store, 'failed_stalled', runtime.noProgressReason);
                        return;
                    }
                    selfCorrectionFeedback = `${validationError} ${strategyDecision.promptGuidance}`;
                    continue;
                }

                if (action.type === 'assistant_message') {
                    continue;
                }

                const actionResult = await handleAiAction(action, store, { toolStage: 'cleaning' });
                if (actionResult.status !== 'success') {
                    continue;
                }

                executedToolAction = true;
                runtime = reduceCleaningActionResult(runtime, action, actionResult);
                if (runtime.noProgressReason) {
                    failCleaningRun(store, getNoProgressFailureCode(runtime.noProgressReason, runtime.editApplied), runtime.noProgressReason);
                    return;
                }
            }

            if (runtime.phase === 'inspect') {
                if (!executedToolAction) {
                    selfCorrectionFeedback = selfCorrectionFeedback ?? `Inspect phase must begin by reading ${WORKSPACE_DATASET_CLEAN_CSV}. ${strategyDecision.promptGuidance}`;
                    continue;
                }
                if (
                    ['wide_crosstab', 'multi_header_matrix', 'mixed_report', 'hierarchical_statement'].includes(getState().rawCsvData ? detectReportShape(getState().rawCsvData).primaryKind : 'unknown')
                    && !runtime.inspectedCleaned
                ) {
                    selfCorrectionFeedback = `Inspect phase must read ${WORKSPACE_DATASET_CLEAN_CSV} after /dataset/raw.csv before deciding whether the staged table is acceptable. ${strategyDecision.promptGuidance}`;
                    continue;
                }

                // Produce RuntimeTableAssessment when inspect phase completes
                if (!runtime.tableAssessment && runtime.rawStructureInspected) {
                    const assessment = buildRuntimeTableAssessmentFromIr(
                        getState().rawIntakeIr,
                        getState().rawCsvData,
                        getState().csvData,
                    );
                    if (assessment) {
                        runtime = { ...runtime, tableAssessment: assessment };
                        // Persist to store for workspace sidecar visibility
                        store.setState(prev => ({
                            cleaningRun: updateCleaningRun(prev.cleaningRun, {
                                runtimeTableAssessment: assessment,
                            }),
                        }));
                    }
                }

                const verification = canCompleteCleaningWithoutEdit(store, runtime);
                if (verification) {
                    runtime = transitionCleaningPhase(runtime, 'verify');
                    selfCorrectionFeedback = null;
                    continue;
                }
                runtime = transitionCleaningPhase(runtime, 'edit');
                selfCorrectionFeedback = null;
                continue;
            }

            if (runtime.phase === 'edit') {
                if (!runtime.editApplied) {
                    selfCorrectionFeedback = getWideCrosstabRepairGuidance(store)
                        ?? `Edit phase did not modify ${WORKSPACE_DATASET_CLEAN_CSV}. Apply a real data.mutate operation to ${WORKSPACE_DATASET_CLEAN_CSV}. ${strategyDecision.promptGuidance}`;
                    continue;
                }
                runtime = transitionCleaningPhase(runtime, 'inspect');
                selfCorrectionFeedback = null;
                continue;
            }

            if (runtime.phase === 'verify') {
                if (!runtime.verifyCompleted) {
                    selfCorrectionFeedback = `Verify the cleaned result with a read-only check on ${WORKSPACE_DATASET_CLEAN_CSV}. ${strategyDecision.promptGuidance}`;
                    continue;
                }

                const completed = await completeCleaningRun(store, runtime, runtime.editApplied ? undefined : { noEdit: true });
                if (!completed.completed) {
                    if (strategyDecision.preferredAction && hasRemainingCleaningPhaseAttempts(runtime, 'edit') && turn < MAX_CLEANING_TURNS) {
                        runtime = transitionCleaningPhase(runtime, 'edit');
                        selfCorrectionFeedback = buildDeterministicRepairFeedback(strategyDecision, completed.reason);
                        continue;
                    }
                    const correction = getWideCrosstabCorrection(store);
                    if (correction && hasRemainingCleaningPhaseAttempts(runtime, 'edit') && turn < MAX_CLEANING_TURNS) {
                        runtime = transitionCleaningPhase(runtime, 'edit');
                        selfCorrectionFeedback = buildDeterministicRepairFeedback(strategyDecision, correction);
                        continue;
                    }
                    failCleaningRun(store, 'failed_verification', completed.reason);
                    return;
                }
                runtime = transitionCleaningPhase(runtime, 'done');
                return;
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`${LOG_PREFIX} Cleaning turn failed:`, error);
            if (isProviderContractError(error, providerName)) {
                failCleaningRun(store, 'failed_provider_contract', detail);
                return;
            }
            if (shouldReinspectAfterReplaceFailure(detail)) {
                runtime = restartCleaningFromInspect(runtime);
                selfCorrectionFeedback = `workspace.replace failed because the current ${WORKSPACE_DATASET_CLEAN_CSV} content no longer matches the oldText anchor. Re-read the latest ${WORKSPACE_DATASET_CLEAN_CSV} with workspace.read before attempting another edit, then base the next replace on the current file content.`;
            } else {
                selfCorrectionFeedback = `The last ${runtime.phase} attempt failed with: ${detail}. Stay in the ${runtime.phase} phase and use the allowed tools only.`;
            }
            store.setState(prev => ({
                cleaningRun: updateCleaningRun(prev.cleaningRun, {
                    lastError: detail,
                }),
            }));
        }
    }

    if (!runtime.editApplied) {
        const strategyDecision = resolveCurrentCleaningStrategy(store, runtime);
        syncCleaningRunStrategy(store, strategyDecision);
        if (shouldStrictlyFailNoEditRun(strategyDecision, runtime)) {
            failCleaningRun(store, getNoProgressFailureCode(runtime.noProgressReason, runtime.editApplied), runtime.noProgressReason);
            return;
        }
        const recovery = await recoverNoEditCleaningRun(
            store,
            runtime,
            strategyDecision,
            canUseDeterministicRecovery(strategyDecision, deterministicRecoveryUsed, repeatedPreferredActionCount),
            runtime.noProgressReason,
        );
        if (recovery.resolved) {
            return;
        }
        failCleaningRun(store, recovery.failureCode ?? 'failed_no_edit', recovery.reason);
        return;
    }

    failCleaningRun(store, 'failed_verification', runtime.noProgressReason);
};
