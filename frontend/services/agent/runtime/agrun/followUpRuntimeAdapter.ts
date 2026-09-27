/**
 * AGRUN-002: the sole app boundary that owns Agent Runtime JavaScript
 * follow-up creation, run, resume, and cancellation lifecycle.
 *
 * Provider/action input mapping and result/event projection are injected as
 * narrow bindings so later migration tickets do not create a second loop.
 */
import { debugLog } from '../../../ai/llmLogger';
import { getTranslation } from '../../../../utils/localization';
import {
    clearRuntimeTurnAbortController,
    isRuntimeAbortError,
    registerRuntimeTurnAbortController,
} from '../runtimeAbort';
import { createAgrunRuntimeFactory } from './runtimeFactory';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import {
    agrunCheckpointCoordinator,
    type AgrunCheckpointCoordinator,
} from './checkpointCoordinator';
import {
    attachAgrunHostExecutionContext,
    createAgrunActionExecutionBridge,
    createAgrunActionPolicy,
    createAgrunActions,
    getAgrunMutationCanaryManifests,
    toAgrunActionName,
    type AgrunActionExecutionBridge,
} from './actionAdapter';
import type {
    AgrunRuntime,
    AgrunRuntimeFactory,
    AgrunModule,
    FollowUpInteractionResolution,
    FollowUpRuntimeAdapter,
    FollowUpRuntimeExecutionBindings,
    FollowUpRuntimeRequest,
    FollowUpRuntimeResult,
} from './types';
import type { StoreApi } from '../../types';
import { createAgrunTokenProjector } from './streamAdapter';
import type { AgrunCheckpointRecord } from './checkpointStore';

type ActiveRun = {
    controller: AbortController;
    detachExternalSignal: () => void;
};

const sanitizeAdapterErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    return message
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\b(?:gw_|sk-|AIza)[A-Za-z0-9._-]{12,}\b/g, '[redacted credential]')
        .replace(
            /([?&](?:api_?key|key|token)=)[^&\s]+/gi,
            '$1[redacted]',
        );
};

const createSanitizedDebugError = (error: unknown): Error => {
    const sanitized = new Error(sanitizeAdapterErrorMessage(error));
    sanitized.name = error instanceof Error ? error.name : 'Error';
    return sanitized;
};

const ensureDeniedResolutionMessage = (
    rawResult: unknown,
    message: string,
): unknown => {
    if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) {
        return rawResult;
    }
    const result = rawResult as Record<string, unknown>;
    const runState = result.runState && typeof result.runState === 'object'
        ? result.runState as Record<string, unknown>
        : null;
    if (runState?.status !== 'completed') {
        return rawResult;
    }
    const output = result.output && typeof result.output === 'object'
        ? result.output as Record<string, unknown>
        : {};
    return {
        ...result,
        output: {
            ...output,
            kind: typeof output.kind === 'string'
                ? output.kind
                : 'final_response',
            text: message,
        },
    };
};

const createFailureResult = (
    appTurnId: string,
    error: unknown,
    signal?: AbortSignal,
): FollowUpRuntimeResult => {
    if (isRuntimeAbortError(error, signal) || signal?.aborted) {
        return {
            status: 'cancelled',
            appTurnId,
        };
    }

    if (
        error
        && typeof error === 'object'
        && 'name' in error
        && error.name === 'TimeoutError'
    ) {
        return {
            status: 'failed',
            appTurnId,
            error: {
                code: 'agrun_provider_timeout',
                message: 'The AI provider did not respond in time. Please retry this follow-up.',
                retryable: true,
            },
        };
    }

    return {
        status: 'failed',
        appTurnId,
        error: {
            code: 'agrun_adapter_error',
            message: sanitizeAdapterErrorMessage(error),
            retryable: false,
        },
    };
};

const createLinkedController = (
    controller: AbortController,
    externalSignal?: AbortSignal,
): ActiveRun => {
    if (!externalSignal) {
        return { controller, detachExternalSignal: () => undefined };
    }

    const forwardAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) {
        forwardAbort();
        return { controller, detachExternalSignal: () => undefined };
    }

    externalSignal.addEventListener('abort', forwardAbort, { once: true });
    return {
        controller,
        detachExternalSignal: () => externalSignal.removeEventListener('abort', forwardAbort),
    };
};

class DefaultFollowUpRuntimeAdapter implements FollowUpRuntimeAdapter {
    private readonly runtimeFactory: AgrunRuntimeFactory;
    private readonly bindings: FollowUpRuntimeExecutionBindings;
    private readonly actionExecutionBridge: AgrunActionExecutionBridge;
    private readonly checkpointCoordinator: AgrunCheckpointCoordinator;
    private readonly tokenProjector = createAgrunTokenProjector();
    private readonly activeRuns = new Map<string, ActiveRun>();
    private runtimePromise: Promise<AgrunRuntime> | null = null;

    constructor(
        bindings: FollowUpRuntimeExecutionBindings,
        runtimeFactory: AgrunRuntimeFactory,
        actionExecutionBridge: AgrunActionExecutionBridge,
        checkpointCoordinator: AgrunCheckpointCoordinator,
    ) {
        this.bindings = bindings;
        this.runtimeFactory = runtimeFactory;
        this.actionExecutionBridge = actionExecutionBridge;
        this.checkpointCoordinator = checkpointCoordinator;
    }

    initialize(): Promise<void> {
        if (!this.runtimePromise) {
            this.runtimePromise = this.runtimeFactory().catch((error: unknown) => {
                this.runtimePromise = null;
                throw error;
            });
        }
        return this.runtimePromise.then(() => undefined);
    }

    run(
        request: FollowUpRuntimeRequest,
        store: StoreApi,
    ): Promise<FollowUpRuntimeResult> {
        return this.execute(
            request.turnId,
            request.sessionId,
            request.signal,
            store,
            { message: request.message },
            async (runtime, executionId) => runtime.run(
                attachAgrunHostExecutionContext(
                    await this.bindings.createRunInput(request, store),
                    executionId,
                ),
                this.buildRunOptions(request.turnId, request.sessionId, store),
            ),
        );
    }

    recover(
        request: FollowUpRuntimeRequest,
        checkpoint: AgrunCheckpointRecord,
        store: StoreApi,
    ): Promise<FollowUpRuntimeResult> {
        return this.execute(
            request.turnId,
            request.sessionId,
            request.signal,
            store,
            { checkpoint },
            async (runtime, executionId) => {
                if (!runtime.importCheckpointState) {
                    throw new Error('Agent Runtime JavaScript checkpoint import is unavailable.');
                }
                return runtime.run(
                    attachAgrunHostExecutionContext(
                        await this.bindings.createRunInput(request, store),
                        executionId,
                    ),
                    this.buildRunOptions(request.turnId, request.sessionId, store, {
                        resumeState: runtime.importCheckpointState(checkpoint.envelope),
                    }),
                );
            },
        );
    }

    async resume(
        interaction: FollowUpInteractionResolution,
        store: StoreApi,
    ): Promise<FollowUpRuntimeResult> {
        const checkpoint = await this.checkpointCoordinator.readValid(
            interaction.sessionId,
            getCurrentAnalysisDatasetVersion(store.getState()),
        );
        return this.execute(
            interaction.turnId,
            interaction.sessionId,
            interaction.signal,
            store,
            checkpoint
                ? { checkpoint }
                : {
                    message: interaction.kind === 'clarification'
                        ? interaction.answer
                        : `approval:${interaction.decision}`,
                },
            async (runtime, executionId) => {
                const resumeState = checkpoint && runtime.importCheckpointState
                    ? runtime.importCheckpointState(checkpoint.envelope)
                    : undefined;
                const rawResult = await runtime.run(
                    attachAgrunHostExecutionContext(
                    await this.bindings.createResumeInput(interaction, store),
                    executionId,
                    ),
                    this.buildRunOptions(
                        interaction.turnId,
                        interaction.sessionId,
                        store,
                        interaction.kind === 'approval' && interaction.decision === 'deny'
                            ? {
                                disabledActions: getAgrunMutationCanaryManifests()
                                    .map(manifest => toAgrunActionName(manifest.name)),
                                ...(resumeState ? { resumeState } : {}),
                            }
                            : resumeState
                                ? { resumeState }
                                : undefined,
                    ),
                );
                return interaction.kind === 'approval' && interaction.decision === 'deny'
                    ? ensureDeniedResolutionMessage(
                        rawResult,
                        getTranslation(
                            'approval_denied_no_changes',
                            store.getState().settings?.language ?? 'English',
                        ),
                    )
                    : rawResult;
            },
        );
    }

    cancel(turnId: string): void {
        const activeRun = this.activeRuns.get(turnId);
        if (!activeRun || activeRun.controller.signal.aborted) return;
        activeRun.controller.abort(new DOMException(
            'Cancelled the current Agent Runtime JavaScript turn.',
            'AbortError',
        ));
    }

    private async execute(
        appTurnId: string,
        sessionId: string,
        externalSignal: AbortSignal | undefined,
        store: StoreApi,
        checkpointContext: {
            checkpoint?: AgrunCheckpointRecord;
            message?: string;
        },
        invoke: (runtime: AgrunRuntime, executionId: string) => Promise<unknown>,
    ): Promise<FollowUpRuntimeResult> {
        if (this.activeRuns.has(appTurnId)) {
            return {
                status: 'failed',
                appTurnId,
                error: {
                    code: 'agrun_turn_already_running',
                    message: `Agent Runtime JavaScript turn "${appTurnId}" is already running.`,
                    retryable: false,
                },
            };
        }

        const activeRun = createLinkedController(
            registerRuntimeTurnAbortController(appTurnId),
            externalSignal,
        );
        // The action bridge is scoped to a single app turn so parallel or
        // resumed conversations cannot share an action-call budget.
        const executionId = appTurnId;
        const context = { appTurnId, sessionId, store };
        if (checkpointContext.checkpoint) {
            this.checkpointCoordinator.beginRecovery(checkpointContext.checkpoint);
        } else {
            this.checkpointCoordinator.begin({
                sessionId,
                turnId: appTurnId,
                datasetVersion: getCurrentAnalysisDatasetVersion(store.getState()),
                message: checkpointContext.message ?? '',
            });
        }
        this.activeRuns.set(appTurnId, activeRun);
        this.actionExecutionBridge.register(executionId, store, {
            actionCalls:
                checkpointContext.checkpoint?.hostState
                && 'actionCalls' in checkpointContext.checkpoint.hostState
                    ? checkpointContext.checkpoint.hostState.actionCalls
                    : 0,
            beforeMutation: () =>
                this.checkpointCoordinator.invalidateForMutation(
                    sessionId,
                    appTurnId,
                ),
            onActionCall: hostState =>
                this.checkpointCoordinator.updateHostState(
                    sessionId,
                    appTurnId,
                    hostState,
                ),
        });
        debugLog('agrun_follow_up_run_start', { appTurnId, sessionId });
        let executionOutcome: FollowUpRuntimeResult['status'] = 'failed';

        try {
            const runtime = await this.getRuntime();
            const result = await invoke(runtime, executionId);
            // Some provider adapters resolve a failed envelope after fetch
            // abort instead of rejecting. The host AbortSignal remains the
            // authoritative cancellation source, so never surface that
            // provider-shaped envelope as a user-visible failure.
            if (activeRun.controller.signal.aborted) {
                const cancelled = await this.bindings.normalizeResult({
                    status: 'cancelled',
                    appTurnId,
                }, context);
                executionOutcome = cancelled.status;
                return cancelled;
            }
            const normalized = await this.bindings.normalizeResult(result, context);
            executionOutcome = normalized.status;
            return normalized;
        } catch (error) {
            debugLog(
                'agrun_follow_up_run_failure',
                { appTurnId, sessionId },
                createSanitizedDebugError(error),
            );
            const failure = createFailureResult(appTurnId, error, activeRun.controller.signal);
            try {
                const normalizedFailure = await this.bindings.normalizeResult(failure, context);
                executionOutcome = normalizedFailure.status;
                return normalizedFailure;
            } catch (projectionError) {
                debugLog(
                    'agrun_follow_up_failure_projection_error',
                    { appTurnId, sessionId },
                    createSanitizedDebugError(projectionError),
                );
                executionOutcome = failure.status;
                return failure;
            }
        } finally {
            try {
                await this.checkpointCoordinator.finish(
                    sessionId,
                    appTurnId,
                    executionOutcome,
                );
            } catch (error) {
                debugLog(
                    'agrun_checkpoint_finish_failure',
                    { appTurnId, sessionId },
                    createSanitizedDebugError(error),
                );
            }
            activeRun.detachExternalSignal();
            this.activeRuns.delete(appTurnId);
            this.actionExecutionBridge.release(executionId, executionOutcome);
            this.tokenProjector.clear(appTurnId);
            clearRuntimeTurnAbortController(appTurnId);
            store.getState().clearActiveTurnCancellation?.();
        }
    }

    private buildRunOptions(
        appTurnId: string,
        sessionId: string,
        store: StoreApi,
        overrides?: {
            disabledActions?: string[];
            resumeState?: Record<string, unknown>;
        },
    ) {
        const context = { appTurnId, sessionId, store };
        const projectEvent = this.bindings.projectEvent;
        const projectToken = this.bindings.projectToken;
        const activeRun = this.activeRuns.get(appTurnId);
        const canProject = () =>
            Boolean(activeRun)
            && this.activeRuns.get(appTurnId) === activeRun
            && activeRun?.controller.signal.aborted !== true;
        const safelyProject = async (
            kind: 'event' | 'token',
            project: ((value: unknown, runContext: typeof context) => void | Promise<void>),
            value: unknown,
        ) => {
            if (!canProject()) return;
            try {
                await project(value, context);
            } catch (error) {
                debugLog(
                    `agrun_follow_up_${kind}_projection_error`,
                    { appTurnId, sessionId },
                    createSanitizedDebugError(error),
                );
            }
        };
        return {
            abortSignal: activeRun?.controller.signal,
            ...(overrides?.disabledActions?.length
                ? { disabledActions: overrides.disabledActions }
                : {}),
            ...(overrides?.resumeState
                ? { resumeState: overrides.resumeState }
                : {}),
            onCheckpoint: (envelope: unknown) =>
                this.checkpointCoordinator.checkpoint(
                    sessionId,
                    envelope,
                    this.actionExecutionBridge.snapshot(appTurnId)
                        ?? { actionCalls: 0 },
                ),
            onToken: (delta: unknown) => safelyProject(
                'token',
                projectToken ?? ((value, runContext) =>
                    this.tokenProjector.project(value, runContext)),
                delta,
            ),
            ...(projectEvent
                ? {
                    onStep: (event: unknown) =>
                        safelyProject('event', projectEvent, event),
                    onStreamEvent: (event: unknown) =>
                        safelyProject('event', projectEvent, event),
                }
                : {}),
        };
    }

    private getRuntime(): Promise<AgrunRuntime> {
        if (!this.runtimePromise) {
            this.runtimePromise = this.runtimeFactory().catch((error: unknown) => {
                this.runtimePromise = null;
                throw error;
            });
        }
        return this.runtimePromise;
    }
}

export const createFollowUpRuntimeAdapter = ({
    bindings,
    runtimeFactory,
    actionExecutionBridge = createAgrunActionExecutionBridge(),
    checkpointCoordinator = agrunCheckpointCoordinator,
    runtimeSkillsFactory,
}: {
    bindings: FollowUpRuntimeExecutionBindings;
    runtimeFactory?: AgrunRuntimeFactory;
    actionExecutionBridge?: AgrunActionExecutionBridge;
    checkpointCoordinator?: AgrunCheckpointCoordinator;
    runtimeSkillsFactory?: (module: AgrunModule) => unknown[] | Promise<unknown[]>;
}): FollowUpRuntimeAdapter =>
    new DefaultFollowUpRuntimeAdapter(
        bindings,
        runtimeFactory ?? createAgrunRuntimeFactory({
            runtimeOptionsFactory: async module => {
                const skills = runtimeSkillsFactory
                    ? await runtimeSkillsFactory(module)
                    : [];
                return {
                    skills,
                    customActions: createAgrunActions({
                        bridge: actionExecutionBridge,
                        module,
                    }),
                    actionPolicy: createAgrunActionPolicy(),
                };
            },
        }),
        actionExecutionBridge,
        checkpointCoordinator,
    );
