import { debugLog } from '../../../ai/llmLogger';
import { hasSavableSession } from '../../../persistence/persistedAppState';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { resolveAnalysisCompletionGate } from '../../analysisCompletionGate';
import { emitAgentEvent, updateAgentTaskStatus } from '../../monitoring/agentMonitor';
import type { StoreApi } from '../../types';
import { requestDataResearchCancellation } from '../dataResearchCancellation';
import { recordRuntimeEvent } from '../runtimeHelpers';
import {
    attachAgrunHostExecutionContext,
    toAgrunActionName,
} from './actionAdapter';
import { createAgrunEventProjector } from './eventAdapter';
import {
    agrunCheckpointCoordinator,
    type AgrunCheckpointCoordinator,
} from './checkpointCoordinator';
import type {
    AgrunCheckpointRecord,
} from './checkpointStore';
import {
    createAgrunInitialAnalysisActionPolicy,
    createAgrunInitialAnalysisActions,
    createInitialAnalysisActionExecutionBridge,
    getInitialAnalysisActionManifests,
    INITIAL_ANALYSIS_PLANNER_DIRECTIVES,
    type InitialAnalysisActionExecutionBridge,
} from './initialAnalysisActionAdapter';
import { createInitialAnalysisStageExecutors } from './initialAnalysisStageExecutors';
import type {
    InitialAnalysisStageExecutorMap,
} from './initialAnalysisStageTools';
import {
    type InitialAnalysisCheckpointHostState,
    type InitialAnalysisRunOutcome,
    type InitialAnalysisRunRequest,
} from './initialAnalysisTypes';
import {
    createAgrunInitialAnalysisRuntimeFactory,
} from './runtimeFactory';
import {
    createAgrunProviderInput,
    createAgrunProviderSkills,
} from './providerAdapter';
import type {
    AgrunModule,
    AgrunRuntime,
    AgrunRuntimeFactory,
    InitialAnalysisRuntimeAdapter,
} from './types';

interface ActiveInitialAnalysisRun {
    controller: AbortController;
    detachExternalSignal: () => void;
    runtimeRunId: string;
}

// The GA acceptance contract allows up to five minutes from import to a
// trusted, confirmation-required, or explicitly blocked result. Reserve the
// final minute for parsing, persistence, and terminal UI projection.
export const INITIAL_ANALYSIS_RUNTIME_BUDGET_MS = 240_000;
export const INITIAL_ANALYSIS_PROVIDER_ATTEMPT_TIMEOUT_MS = 45_000;

class InitialAnalysisRuntimeBudgetExpiredError extends Error {
    constructor() {
        super('The initial analysis runtime budget expired.');
        this.name = 'InitialAnalysisRuntimeBudgetExpiredError';
    }
}

const sanitizeErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    return message
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\b(?:gw_|sk-|AIza)[A-Za-z0-9._-]{12,}\b/g, '[redacted credential]')
        .replace(/([?&](?:api_?key|key|token)=)[^&\s]+/gi, '$1[redacted]');
};

const isAbortError = (error: unknown, signal: AbortSignal): boolean =>
    signal.aborted
    || (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError');

const runWithAbortSignal = <T>(
    operation: Promise<T>,
    signal: AbortSignal,
): Promise<T> => new Promise((resolve, reject) => {
    const rejectForAbort = () => {
        reject(signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Initial analysis was cancelled.', 'AbortError'));
    };
    if (signal.aborted) {
        rejectForAbort();
        return;
    }
    signal.addEventListener('abort', rejectForAbort, { once: true });
    operation.then(
        value => {
            signal.removeEventListener('abort', rejectForAbort);
            resolve(value);
        },
        error => {
            signal.removeEventListener('abort', rejectForAbort);
            reject(error);
        },
    );
});

const createRunIdentity = (prefix: string): string => {
    const uuid = globalThis.crypto?.randomUUID?.();
    return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
};

const linkAbortSignal = (
    controller: AbortController,
    runtimeRunId: string,
    externalSignal?: AbortSignal,
): ActiveInitialAnalysisRun => {
    if (!externalSignal) {
        return {
            controller,
            detachExternalSignal: () => undefined,
            runtimeRunId,
        };
    }
    const forwardAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) {
        forwardAbort();
        return {
            controller,
            detachExternalSignal: () => undefined,
            runtimeRunId,
        };
    }
    externalSignal.addEventListener('abort', forwardAbort, { once: true });
    return {
        controller,
        detachExternalSignal: () =>
            externalSignal.removeEventListener('abort', forwardAbort),
        runtimeRunId,
    };
};

const buildRuntimePrompt = (
    request: InitialAnalysisRunRequest,
    beginInstruction =
        'Begin with host_dataset_profilestructure and an empty argument object.',
): string => {
    const orderedActions = getInitialAnalysisActionManifests()
        .map((manifest, index) =>
            `${index + 1}. ${toAgrunActionName(manifest.name)} (${manifest.name})`)
        .join('\n');
    return [
        'Run the app-governed initial analysis lifecycle.',
        `Dataset reference: ${request.datasetId} at ${request.datasetVersion}.`,
        `Research goal: ${request.researchGoal}`,
        'Call these registered Agrun host actions exactly once and in this order:',
        orderedActions,
        beginInstruction,
        'Do not request raw rows, credentials, web access, memory, or any other action.',
        'Do not provide a prose answer before finalization.',
    ].join('\n');
};

const buildRuntimeFormatRepairPrompt = (
    request: InitialAnalysisRunRequest,
): string => [
    'FORMAT REPAIR: the previous response called zero host actions.',
    'Do not answer with prose.',
    'Your first planner envelope must be exactly this shape:',
    '{"type":"action","name":"host_dataset_profilestructure","args":{},"reasoning":"Begin the governed initial-analysis sequence."}',
    buildRuntimePrompt(request),
    'Start now by calling the first declared host action.',
].join('\n');

const buildRuntimeSequenceRepairPrompt = (
    request: InitialAnalysisRunRequest,
    nextAction: string,
    completedActionCount: number,
): string => [
    'SEQUENCE REPAIR: the previous planner run stopped before the governed lifecycle finished.',
    `${completedActionCount} governed host actions are already committed and must not be repeated.`,
    `Call ${nextAction} now with an empty argument object.`,
    'After its observation, continue with each remaining declared host action exactly once and in order.',
    'Do not answer with prose and do not restart the lifecycle.',
    buildRuntimePrompt(
        request,
        `Resume with ${nextAction}; do not repeat any committed action.`,
    ),
].join('\n');

const getInitialAnalysisDisabledActions = (
    runtime: AgrunRuntime,
): string[] => {
    const allowedActions = new Set(
        getInitialAnalysisActionManifests().map(manifest =>
            toAgrunActionName(manifest.name)),
    );
    return (runtime.getActionRegistry?.() ?? [])
        .map(action => action && typeof action === 'object'
            ? (action as Record<string, unknown>).name
            : null)
        .filter((name): name is string =>
            typeof name === 'string'
            && !allowedActions.has(name));
};

const summarizeRuntimeResult = (value: unknown): Record<string, unknown> => {
    const result = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
    const runState = result.runState && typeof result.runState === 'object'
        ? result.runState as Record<string, unknown>
        : {};
    const output = result.output && typeof result.output === 'object'
        ? result.output as Record<string, unknown>
        : {};
    const error = result.error && typeof result.error === 'object'
        ? result.error as Record<string, unknown>
        : {};
    const errorDetails = error.details && typeof error.details === 'object'
        ? error.details as Record<string, unknown>
        : {};
    const steps = Array.isArray(result.steps)
        ? result.steps.slice(-8).map(step => {
            const item = step && typeof step === 'object'
                ? step as Record<string, unknown>
                : {};
            const detail = item.detail && typeof item.detail === 'object'
                ? item.detail as Record<string, unknown>
                : {};
            return {
                type: typeof item.type === 'string' ? item.type : null,
                code: typeof detail.code === 'string' ? detail.code : null,
                reason: typeof detail.reason === 'string'
                    ? detail.reason
                    : null,
                error: typeof detail.error === 'string'
                    ? sanitizeErrorMessage(detail.error)
                    : null,
            };
        })
        : [];
    return {
        outputKind: typeof output.kind === 'string' ? output.kind : null,
        errorCode: typeof error.code === 'string' ? error.code : null,
        errorMessage: typeof error.message === 'string'
            ? sanitizeErrorMessage(error.message)
            : null,
        errorCause: typeof error.cause === 'string'
            ? sanitizeErrorMessage(error.cause)
            : null,
        errorDetail: {
            provider: typeof errorDetails.provider === 'string'
                ? errorDetails.provider
                : null,
            status: typeof errorDetails.status === 'number'
                ? errorDetails.status
                : null,
            reason: typeof errorDetails.reason === 'string'
                ? errorDetails.reason
                : null,
            retryable: typeof errorDetails.retryable === 'boolean'
                ? errorDetails.retryable
                : null,
        },
        status: typeof runState.status === 'string' ? runState.status : null,
        cycleCount: typeof runState.cycleCount === 'number'
            ? runState.cycleCount
            : null,
        stepCount: typeof runState.stepCount === 'number'
            ? runState.stepCount
            : null,
        lastAction: typeof runState.lastAction === 'string'
            ? runState.lastAction
            : null,
        finalAnswerSource: typeof runState.finalAnswerSource === 'string'
            ? runState.finalAnswerSource
            : null,
        availableActions: Array.isArray(runState.availableActions)
            ? runState.availableActions.filter(
                (item): item is string => typeof item === 'string',
            )
            : [],
        recentSteps: steps,
    };
};

const createTerminalOutcome = (params: {
    request: InitialAnalysisRunRequest;
    runtimeRunId: string;
    traceId: string;
    store: StoreApi;
    results: NonNullable<ReturnType<InitialAnalysisActionExecutionBridge['snapshot']>>['results'];
    hostState: InitialAnalysisCheckpointHostState;
}): InitialAnalysisRunOutcome => {
    const finalVersion = getCurrentAnalysisDatasetVersion(params.store.getState())
        ?? params.request.datasetVersion;
    const expectedActionCount = getInitialAnalysisActionManifests().length;
    const completedActionCount = params.hostState.completedToolNames.length;
    if (completedActionCount !== expectedActionCount) {
        const failedStage = [...params.results]
            .reverse()
            .find(result => result.decision === 'fail');
        if (failedStage) {
            return {
                status: 'degraded',
                currentDatasetVersion: params.request.datasetVersion,
                finalDatasetVersion: finalVersion,
                trustedCardIds: [],
                warnings: [{
                    code: 'initial_analysis_stopped_after_governed_failure',
                    message: [
                        failedStage.summary,
                        `The lifecycle stopped after ${completedActionCount}/${expectedActionCount} governed actions and retained the last stable dataset.`,
                    ].join(' '),
                    phase: failedStage.phase,
                }],
                runtimeRunId: params.runtimeRunId,
                traceId: params.traceId,
            };
        }
        const zeroActions = completedActionCount === 0;
        return {
            status: 'degraded',
            currentDatasetVersion: params.request.datasetVersion,
            finalDatasetVersion: finalVersion,
            trustedCardIds: [],
            warnings: [{
                code: zeroActions
                    ? 'initial_analysis_action_contract_not_followed'
                    : 'initial_analysis_sequence_incomplete',
                message: [
                    zeroActions
                        ? 'The AI provider returned no governed action after one format-repair attempt.'
                        : `Initial analysis completed ${completedActionCount}/${expectedActionCount} governed actions.`,
                    'The last stable dataset was retained, and no result was presented as trusted.',
                ].join(' '),
                phase: params.hostState.phase,
            }],
            runtimeRunId: params.runtimeRunId,
            traceId: params.traceId,
        };
    }

    const liveWarnings = params.results.flatMap(result =>
        result.warningCodes.map(code => ({
            code,
            message: result.summary,
            phase: result.phase,
        })));
    const liveWarningCodes = new Set(liveWarnings.map(warning => warning.code));
    const warnings = [
        ...liveWarnings,
        ...params.hostState.warningCodes
            .filter(code => !liveWarningCodes.has(code))
            .map(code => ({
                code,
                message: 'Recovered initial-analysis stage retained this caveat.',
                phase: params.hostState.phase,
            })),
    ];
    const state = params.store.getState();
    const trustedCardIds = resolveAnalysisCompletionGate({
        cards: state.analysisCards,
        currentDatasetVersion: finalVersion,
        columnProfiles: state.columnProfiles,
    }).trustedBusinessCardIds;
    const degraded = params.results.some(result => result.decision !== 'pass')
        || params.hostState.warningCodes.length > 0;
    return {
        status: degraded ? 'degraded' : 'completed',
        currentDatasetVersion: params.request.datasetVersion,
        finalDatasetVersion: finalVersion,
        trustedCardIds,
        warnings,
        runtimeRunId: params.runtimeRunId,
        traceId: params.traceId,
    };
};

class DefaultInitialAnalysisRuntimeAdapter
implements InitialAnalysisRuntimeAdapter {
    private runtimePromise: Promise<AgrunRuntime> | null = null;
    private readonly activeRuns = new Map<string, ActiveInitialAnalysisRun>();
    private readonly eventProjector = createAgrunEventProjector();

    constructor(
        private readonly runtimeFactory: AgrunRuntimeFactory,
        private readonly bridge: InitialAnalysisActionExecutionBridge,
        private readonly executors: InitialAnalysisStageExecutorMap,
        private readonly checkpointCoordinator: AgrunCheckpointCoordinator,
        private readonly persistSessionSnapshot: (
            store: StoreApi,
        ) => Promise<boolean>,
        private readonly runtimeBudgetMs: number,
    ) {}

    initialize(): Promise<void> {
        return this.getRuntime().then(() => undefined);
    }

    async run(
        request: InitialAnalysisRunRequest,
        store: StoreApi,
    ): Promise<InitialAnalysisRunOutcome> {
        return this.execute(request, store);
    }

    async recover(
        request: InitialAnalysisRunRequest,
        checkpoint: AgrunCheckpointRecord,
        store: StoreApi,
    ): Promise<InitialAnalysisRunOutcome> {
        return this.execute(request, store, checkpoint);
    }

    private async execute(
        request: InitialAnalysisRunRequest,
        store: StoreApi,
        checkpoint?: AgrunCheckpointRecord,
    ): Promise<InitialAnalysisRunOutcome> {
        if (this.activeRuns.has(request.appSessionId)) {
            return {
                status: 'failed',
                currentDatasetVersion: request.datasetVersion,
                finalDatasetVersion:
                    getCurrentAnalysisDatasetVersion(store.getState())
                    ?? request.datasetVersion,
                trustedCardIds: [],
                warnings: [],
                runtimeRunId: '',
                traceId: '',
                error: {
                    code: 'initial_analysis_already_running',
                    message: 'Initial analysis is already running for this app session.',
                    retryable: false,
                },
            };
        }

        const checkpointHostState =
            checkpoint?.runKind === 'initial_analysis'
            && checkpoint.hostState.runKind === 'initial_analysis'
                ? checkpoint.hostState
                : undefined;
        if (checkpoint && !checkpointHostState) {
            return {
                status: 'failed',
                currentDatasetVersion: request.datasetVersion,
                finalDatasetVersion:
                    getCurrentAnalysisDatasetVersion(store.getState())
                    ?? request.datasetVersion,
                trustedCardIds: [],
                warnings: [],
                runtimeRunId: '',
                traceId: '',
                error: {
                    code: 'initial_analysis_checkpoint_invalid',
                    message: 'The saved initial-analysis checkpoint is incompatible.',
                    retryable: false,
                },
            };
        }
        const executionId = checkpoint?.turnId
            ?? createRunIdentity('initial-execution');
        const runtimeRunId = checkpointHostState?.runtimeRunId
            || createRunIdentity('initial-run');
        const traceId = checkpointHostState?.traceId
            || createRunIdentity('initial-trace');
        const supportsRecoveryAnchor = Boolean(checkpoint)
            || hasSavableSession(store.getState());
        const activeRun = linkAbortSignal(
            new AbortController(),
            runtimeRunId,
            request.signal,
        );
        this.activeRuns.set(request.appSessionId, activeRun);
        if (checkpoint) {
            this.checkpointCoordinator.beginRecovery(checkpoint);
        } else if (supportsRecoveryAnchor) {
            this.checkpointCoordinator.begin({
                datasetVersion: request.datasetVersion,
                message: request.researchGoal,
                runKind: 'initial_analysis',
                sessionId: request.appSessionId,
                turnId: executionId,
            });
        }
        this.bridge.register({
            executionId,
            request,
            store,
            executors: this.executors,
            signal: activeRun.controller.signal,
            runtimeRunId,
            traceId,
            resumeHostState: checkpointHostState,
            onStageCommitted: async hostState => {
                // Large local-file datasets are intentionally ephemeral: the
                // browser cannot persist the source rows, so a checkpoint would
                // be unrecoverable after refresh. Continue the live lifecycle
                // without creating a false recovery anchor.
                if (!supportsRecoveryAnchor) return;
                const persisted = await this.persistSessionSnapshot(store);
                if (!persisted) {
                    throw new Error(
                        'initial_analysis_snapshot_not_persisted',
                    );
                }
                await this.checkpointCoordinator.updateHostState(
                    request.appSessionId,
                    executionId,
                    hostState,
                );
            },
        });
        store.setState({
            isBusy: true,
            isGeneratingReport: true,
            initialAnalysisStatus: 'running',
        });
        updateAgentTaskStatus(store, {
            status: 'thinking',
            title: 'Starting automatic analysis',
            titleKey: 'ai_task_starting_analysis',
            subtitle: 'Agrun.js is coordinating the governed analysis stages',
            subtitleKey: 'ai_task_starting_analysis_subtitle',
            totalSteps: getInitialAnalysisActionManifests().length,
            currentStep: 1,
        });
        emitAgentEvent(store, {
            runId: runtimeRunId,
            phase: 'execution',
            step: 'agrun_initial_analysis_started',
            status: 'in_progress',
            message: 'Agrun.js started the governed initial-analysis lifecycle.',
            detail: {
                runtimeOwner: 'agrun',
                datasetVersion: request.datasetVersion,
                traceId,
                recoveryAvailable: supportsRecoveryAnchor,
            },
            activity: {
                kind: 'research',
                lifecycle: 'running',
                source: 'app',
                eventType: 'agrun_initial_analysis_started',
                title: 'Initial analysis started',
                explanation: supportsRecoveryAnchor
                    ? 'Stage checkpoints are enabled for this dataset.'
                    : 'This large local dataset is analyzed live and must be re-imported after refresh.',
            },
        });
        if (!supportsRecoveryAnchor) {
            emitAgentEvent(store, {
                runId: runtimeRunId,
                phase: 'execution',
                step: 'initial_analysis_recovery_unavailable',
                status: 'done',
                message: 'Checkpoint recovery is unavailable because the large source file is intentionally not persisted in browser storage.',
                detail: {
                    reasonCode: 'ephemeral_dataset_recovery_unavailable',
                    datasetVersion: request.datasetVersion,
                    traceId,
                },
                activity: {
                    kind: 'preparation',
                    lifecycle: 'degraded',
                    source: 'app',
                    eventType: 'initial_analysis_recovery_unavailable',
                    title: 'Refresh recovery unavailable',
                    explanation: 'The current analysis can continue normally, but this source file must be re-imported after a refresh.',
                },
            });
        }

        let terminalOutcome: InitialAnalysisRunOutcome;
        let checkpointOutcome: InitialAnalysisRunOutcome['status'] = 'failed';
        let latestRuntimeFailure: Record<string, unknown> | null = null;
        const runtimeBudgetTimer = setTimeout(() => {
            requestDataResearchCancellation(runtimeRunId);
            if (!activeRun.controller.signal.aborted) {
                activeRun.controller.abort(
                    new InitialAnalysisRuntimeBudgetExpiredError(),
                );
            }
        }, this.runtimeBudgetMs);
        try {
            const runtime = await this.getRuntime();
            const context = {
                appTurnId: executionId,
                sessionId: request.appSessionId,
                store,
            };
            const canProject = () =>
                this.activeRuns.get(request.appSessionId) === activeRun
                && !activeRun.controller.signal.aborted;
            const guardPrematureFinalization = () => {
                const snapshot = this.bridge.snapshot(executionId);
                const nextManifest = getInitialAnalysisActionManifests()[
                    snapshot?.hostState.completedToolNames.length ?? 0
                ];
                if (!nextManifest) return null;
                const nextAction = toAgrunActionName(nextManifest.name);
                return {
                    continue: true,
                    observation: [
                        'The governed initial-analysis sequence is incomplete.',
                        `Call ${nextAction} next with an empty argument object.`,
                        'Do not finalize or answer with prose yet.',
                    ].join(' '),
                };
            };
            const resumeState = checkpoint
                ? runtime.importCheckpointState?.(checkpoint.envelope)
                : undefined;
            if (checkpoint && !resumeState) {
                throw new Error(
                    'Agent Runtime JavaScript checkpoint import is unavailable.',
                );
            }
            const disabledActions = getInitialAnalysisDisabledActions(runtime);
            const firstRunResult = await runWithAbortSignal(runtime.run(
                attachAgrunHostExecutionContext({
                    ...createAgrunProviderInput(
                        store.getState().settings,
                        buildRuntimePrompt(request),
                        { requestTimeoutMs: INITIAL_ANALYSIS_PROVIDER_ATTEMPT_TIMEOUT_MS },
                    ),
                    sessionId: request.appSessionId,
                    datasetId: request.datasetId,
                    datasetVersion: request.datasetVersion,
                    researchGoal: request.researchGoal,
                    traceId,
                }, executionId),
                {
                    abortSignal: activeRun.controller.signal,
                    disabledActions,
                    plannerDirectives: INITIAL_ANALYSIS_PLANNER_DIRECTIVES,
                    onBeforeFinalize: guardPrematureFinalization,
                    ...(resumeState ? { resumeState } : {}),
                    onCheckpoint: envelope => {
                        const snapshot = this.bridge.snapshot(executionId);
                        if (!supportsRecoveryAnchor || !snapshot || !canProject()) return;
                        return this.checkpointCoordinator.checkpoint(
                            request.appSessionId,
                            envelope,
                            snapshot.hostState,
                        );
                    },
                    onStep: event => {
                        if (canProject()) {
                            this.eventProjector.project(event, context);
                        }
                    },
                    // Initial analysis consumes structured planner envelopes,
                    // not prose tokens. Avoid registering a stream consumer so
                    // Agrun uses its non-streaming provider path, which is
                    // compatible with mobile WebKit response handling.
                },
            ), activeRun.controller.signal);
            const firstRunSummary = summarizeRuntimeResult(firstRunResult);
            if (firstRunSummary.errorCode) {
                latestRuntimeFailure = firstRunSummary;
            }
            const firstRunSnapshot = this.bridge.snapshot(executionId);
            if (
                firstRunSummary.errorCode
                || firstRunSnapshot?.hostState.completedToolNames.length
                    !== getInitialAnalysisActionManifests().length
            ) {
                debugLog(
                    'agrun_initial_analysis_runtime_result',
                    firstRunSummary,
                );
            }
            if (activeRun.controller.signal.aborted) {
                throw activeRun.controller.signal.reason
                    ?? new DOMException('Initial analysis was cancelled.', 'AbortError');
            }
            let snapshot = this.bridge.snapshot(executionId);
            const completedAfterFirstRun =
                snapshot?.hostState.completedToolNames.length ?? 0;
            const expectedActionCount = getInitialAnalysisActionManifests().length;
            if (
                !checkpoint
                && completedAfterFirstRun < expectedActionCount
                && !activeRun.controller.signal.aborted
            ) {
                const zeroActions = completedAfterFirstRun === 0;
                const nextManifest = getInitialAnalysisActionManifests()[
                    completedAfterFirstRun
                ];
                const nextAction = nextManifest
                    ? toAgrunActionName(nextManifest.name)
                    : null;
                updateAgentTaskStatus(store, {
                    status: 'thinking',
                    title: zeroActions
                        ? 'Repairing automatic analysis format'
                        : 'Resuming automatic analysis sequence',
                    subtitle: zeroActions
                        ? 'The model returned no governed actions; retrying once with the required action contract.'
                        : `The planner stopped after ${completedAfterFirstRun}/${expectedActionCount} governed stages; resuming once from the next safe stage.`,
                    totalSteps: expectedActionCount,
                    currentStep: Math.min(
                        expectedActionCount,
                        completedAfterFirstRun + 1,
                    ),
                });
                emitAgentEvent(store, {
                    runId: runtimeRunId,
                    phase: 'execution',
                    step: zeroActions
                        ? 'agrun_initial_analysis_format_repair'
                        : 'agrun_initial_analysis_sequence_repair',
                    status: 'in_progress',
                    message: zeroActions
                        ? 'Agrun.js is retrying an empty action response once.'
                        : `Agrun.js is resuming once from governed stage ${completedAfterFirstRun + 1}.`,
                    detail: {
                        runtimeOwner: 'agrun',
                        traceId,
                        reasonCode: zeroActions
                            ? 'initial_analysis_zero_actions'
                            : 'initial_analysis_sequence_incomplete',
                        completedActionCount: completedAfterFirstRun,
                        nextAction,
                    },
                });
                const repairPrompt = zeroActions
                    ? buildRuntimeFormatRepairPrompt(request)
                    : buildRuntimeSequenceRepairPrompt(
                        request,
                        nextAction!,
                        completedAfterFirstRun,
                    );
                const repairRunResult = await runWithAbortSignal(runtime.run(
                    attachAgrunHostExecutionContext({
                        ...createAgrunProviderInput(
                            store.getState().settings,
                            repairPrompt,
                            { requestTimeoutMs: INITIAL_ANALYSIS_PROVIDER_ATTEMPT_TIMEOUT_MS },
                        ),
                        // Use a fresh Agrun conversation for the format repair.
                        // Reusing a session that already finalized with zero
                        // actions can anchor the model to the invalid answer.
                        sessionId: `${request.appSessionId}:${zeroActions
                            ? 'initial-format-repair'
                            : 'initial-sequence-repair'}`,
                        datasetId: request.datasetId,
                        datasetVersion: request.datasetVersion,
                        researchGoal: request.researchGoal,
                        traceId,
                    }, executionId),
                    {
                        abortSignal: activeRun.controller.signal,
                        disabledActions,
                        plannerDirectives: INITIAL_ANALYSIS_PLANNER_DIRECTIVES,
                        onBeforeFinalize: guardPrematureFinalization,
                        onCheckpoint: envelope => {
                            const repairSnapshot = this.bridge.snapshot(executionId);
                            if (!supportsRecoveryAnchor || !repairSnapshot || !canProject()) return;
                            return this.checkpointCoordinator.checkpoint(
                                request.appSessionId,
                                envelope,
                                repairSnapshot.hostState,
                            );
                        },
                        onStep: event => {
                            if (canProject()) {
                                this.eventProjector.project(event, context);
                            }
                        },
                    },
                ), activeRun.controller.signal);
                const repairRunSummary = summarizeRuntimeResult(repairRunResult);
                if (repairRunSummary.errorCode) {
                    latestRuntimeFailure = repairRunSummary;
                }
                debugLog(
                    'agrun_initial_analysis_repair_result',
                    repairRunSummary,
                );
                snapshot = this.bridge.snapshot(executionId);
            }
            terminalOutcome = snapshot
                ? createTerminalOutcome({
                    request,
                    runtimeRunId: snapshot.runtimeRunId,
                    traceId: snapshot.traceId,
                    store,
                    results: snapshot.results,
                    hostState: snapshot.hostState,
                })
                : {
                    status: 'failed',
                    currentDatasetVersion: request.datasetVersion,
                    finalDatasetVersion:
                        getCurrentAnalysisDatasetVersion(store.getState())
                        ?? request.datasetVersion,
                    trustedCardIds: [],
                    warnings: [],
                    runtimeRunId,
                    traceId,
                    error: {
                        code: 'initial_analysis_context_missing',
                        message: 'Initial-analysis execution state was lost before finalization.',
                        retryable: true,
                    },
                };
            const completedStageCount = snapshot?.hostState.completedToolNames.length ?? 0;
            if (completedStageCount === 0 && latestRuntimeFailure) {
                const errorDetail = latestRuntimeFailure.errorDetail
                    && typeof latestRuntimeFailure.errorDetail === 'object'
                    ? latestRuntimeFailure.errorDetail as Record<string, unknown>
                    : {};
                const failureText = [
                    latestRuntimeFailure.errorMessage,
                    latestRuntimeFailure.errorCause,
                    errorDetail.reason,
                ].filter(value => typeof value === 'string').join(' ');
                const isRateLimited = errorDetail.status === 429
                    || /rate limit|token limit|quota|too many requests/i.test(failureText);
                const reasonCode = isRateLimited
                    ? 'initial_analysis_provider_rate_limited'
                    : 'initial_analysis_provider_unavailable';
                const failureMessage = isRateLimited
                    ? 'The AI provider usage limit was reached before governed analysis could begin. The dataset is safe, but no analysis result was produced. Retry after the provider limit resets or select another configured provider.'
                    : 'The AI provider failed before governed analysis could begin. The dataset is safe, but no analysis result was produced. Retry or select another configured provider.';
                terminalOutcome = {
                    ...terminalOutcome,
                    status: 'degraded',
                    warnings: [{
                        code: reasonCode,
                        message: failureMessage,
                        phase: snapshot?.hostState.phase,
                    }],
                    error: undefined,
                };
                emitAgentEvent(store, {
                    runId: runtimeRunId,
                    phase: 'execution',
                    step: 'agrun_initial_analysis_provider_failure',
                    status: 'error',
                    message: failureMessage,
                    detail: {
                        reasonCode,
                        failureClass: 'provider',
                        provider: errorDetail.provider ?? null,
                        status: errorDetail.status ?? null,
                        runtimeErrorCode: latestRuntimeFailure.errorCode ?? null,
                        traceId,
                    },
                    activity: {
                        kind: 'terminal',
                        lifecycle: 'failed',
                        source: 'app',
                        eventType: 'agrun_initial_analysis_provider_failure',
                        title: isRateLimited
                            ? 'AI provider limit reached'
                            : 'AI provider unavailable',
                        explanation: failureMessage,
                    },
                });
                recordRuntimeEvent(store, {
                    sessionId: request.appSessionId,
                    runId: runtimeRunId,
                    turnId: executionId,
                    type: 'turn_failed',
                    stage: 'selecting',
                    reason: reasonCode,
                    retryable: true,
                    failureClass: 'provider',
                    message: failureMessage,
                    detail: {
                        activityTitle: isRateLimited
                            ? 'AI provider limit reached'
                            : 'AI provider unavailable',
                        activityKind: 'terminal',
                        provider: errorDetail.provider ?? null,
                        status: errorDetail.status ?? null,
                        runtimeErrorCode: latestRuntimeFailure.errorCode ?? null,
                        traceId,
                    },
                });
            }
            checkpointOutcome = terminalOutcome.status;
        } catch (error) {
            const budgetExpired =
                activeRun.controller.signal.reason
                    instanceof InitialAnalysisRuntimeBudgetExpiredError;
            const cancelled = !budgetExpired
                && isAbortError(error, activeRun.controller.signal);
            const budgetSnapshot = budgetExpired
                ? this.bridge.snapshot(executionId)
                : null;
            const completedStageCount = budgetSnapshot?.hostState.completedToolNames.length ?? 0;
            const finalDatasetVersion =
                getCurrentAnalysisDatasetVersion(store.getState())
                ?? request.datasetVersion;
            const trustedCardIds = budgetExpired
                ? resolveAnalysisCompletionGate({
                    cards: store.getState().analysisCards,
                    currentDatasetVersion: finalDatasetVersion,
                    columnProfiles: store.getState().columnProfiles,
                }).trustedBusinessCardIds
                : [];
            terminalOutcome = {
                status: budgetExpired
                    ? 'degraded'
                    : cancelled
                        ? 'cancelled'
                        : 'failed',
                currentDatasetVersion: request.datasetVersion,
                finalDatasetVersion,
                trustedCardIds,
                warnings: budgetExpired
                    ? [{
                        code: completedStageCount === 0
                            ? 'initial_analysis_provider_timeout'
                            : 'initial_analysis_runtime_budget_expired',
                        message: completedStageCount === 0
                            ? 'The AI provider did not return the first governed action before the runtime budget expired. The dataset is safe, but no analysis result was produced. Retry or select another configured provider.'
                            : 'Automatic analysis reached its time budget. The last stable dataset was kept and the result is available with limitations.',
                        phase: budgetSnapshot?.hostState.phase,
                    }]
                    : [],
                runtimeRunId,
                traceId,
                ...(cancelled || budgetExpired
                    ? {}
                    : {
                        error: {
                            code: 'initial_analysis_runtime_error',
                            message: sanitizeErrorMessage(error),
                            retryable: true,
                        },
                    }),
            };
            const runtimeDiagnostic = {
                sessionId: request.appSessionId,
                runtimeRunId,
                traceId,
            };
            if (budgetExpired) {
                debugLog(
                    'agrun_initial_analysis_budget_expired',
                    runtimeDiagnostic,
                );
            } else {
                debugLog(
                    'agrun_initial_analysis_failure',
                    runtimeDiagnostic,
                    new Error(cancelled
                        ? 'Initial analysis was cancelled.'
                        : sanitizeErrorMessage(error)),
                );
            }
            checkpointOutcome = terminalOutcome.status;
        } finally {
            clearTimeout(runtimeBudgetTimer);
            try {
                if (supportsRecoveryAnchor) {
                    await this.checkpointCoordinator.finish(
                        request.appSessionId,
                        executionId,
                        checkpointOutcome,
                    );
                }
            } catch (error) {
                debugLog(
                    'agrun_initial_checkpoint_finish_failure',
                    {
                        sessionId: request.appSessionId,
                        runtimeRunId,
                        traceId,
                    },
                    new Error(sanitizeErrorMessage(error)),
                );
            }
            activeRun.detachExternalSignal();
            this.activeRuns.delete(request.appSessionId);
            this.bridge.release(executionId);
        }

        const providerFailureWarning = terminalOutcome.warnings.find(warning =>
            warning.code === 'initial_analysis_provider_rate_limited'
            || warning.code === 'initial_analysis_provider_unavailable'
            || warning.code === 'initial_analysis_provider_timeout');
        const noUsableResults = (
            terminalOutcome.status === 'completed'
            || terminalOutcome.status === 'degraded'
        ) && terminalOutcome.trustedCardIds.length === 0;
        const uiStatus = noUsableResults
            ? 'error'
            : terminalOutcome.status === 'completed'
            ? 'ready'
            : terminalOutcome.status === 'degraded'
                ? 'degraded'
                : terminalOutcome.status === 'cancelled'
                    ? 'paused'
                    : 'error';
        const title = noUsableResults
            ? 'Unable to reliably analyze'
            : terminalOutcome.status === 'completed'
            ? 'Analysis ready'
            : terminalOutcome.status === 'degraded'
                ? 'Analysis ready with limitations'
                : terminalOutcome.status === 'cancelled'
                    ? 'Analysis stopped'
                    : 'Analysis failed';
        const summary = noUsableResults
            ? providerFailureWarning?.message
                ?? 'No business conclusion passed the dataset-version, query-trace, scope, and quality checks. Review the detected structure before trying again.'
            : terminalOutcome.error?.message
            ?? (terminalOutcome.status === 'degraded'
                ? 'The analysis completed with visible evidence or data-quality caveats.'
                : terminalOutcome.status === 'cancelled'
                    ? 'The analysis was cancelled and the last stable dataset was kept.'
                    : 'The governed analysis lifecycle completed.');
        store.setState({
            isBusy: false,
            isGeneratingReport: false,
            initialAnalysisStatus: uiStatus,
        });
        const terminalState = store.getState();
        if (
            noUsableResults
            && terminalState.pipelineOutcome?.canAutoAnalyze === false
            && terminalState.reportStructureResolution
            && terminalState.rawIntakeIr
        ) {
            terminalState.setIsReportBoundaryConfirmModalOpen?.(true);
        }
        updateAgentTaskStatus(store, {
            status: terminalOutcome.status === 'failed' || noUsableResults ? 'error' : 'done',
            title,
            subtitle: summary,
            totalSteps: getInitialAnalysisActionManifests().length,
            currentStep: terminalOutcome.status === 'failed' ? 1 : getInitialAnalysisActionManifests().length,
            ...(terminalOutcome.error ? { error: terminalOutcome.error.message } : {}),
        });
        store.getState().addProgress?.(
            summary,
            terminalOutcome.status === 'failed'
                ? 'error'
                : terminalOutcome.status === 'degraded'
                    ? 'warning'
                    : 'system',
        );
        emitAgentEvent(store, {
            runId: runtimeRunId,
            phase: 'execution',
            step: 'agrun_initial_analysis_terminal',
            status: terminalOutcome.status === 'failed' || noUsableResults
                ? 'error'
                : 'done',
            message: summary,
            detail: {
                runtimeOwner: 'agrun',
                outcome: terminalOutcome.status,
                traceId,
                warningCodes: terminalOutcome.warnings.map(warning => warning.code),
                errorCode: terminalOutcome.error?.code ?? null,
                cardCount: store.getState().analysisCards.length,
            },
            activity: {
                kind: 'terminal',
                lifecycle: noUsableResults || terminalOutcome.status === 'failed'
                    ? 'failed'
                    : terminalOutcome.status === 'cancelled'
                        ? 'cancelled'
                        : terminalOutcome.status === 'degraded'
                            ? 'degraded'
                            : 'completed',
                source: 'app',
                eventType: 'agrun_initial_analysis_terminal',
                title,
                explanation: terminalOutcome.warnings.length > 0
                    ? `${terminalOutcome.warnings.length} diagnostic warning(s) recorded.`
                    : undefined,
            },
        });
        const terminalReasonCode = noUsableResults
            ? providerFailureWarning?.code
                ?? terminalOutcome.warnings.at(-1)?.code
                ?? 'analysis_no_usable_cards'
            : terminalOutcome.error?.code
                ?? (terminalOutcome.status === 'degraded'
                    ? terminalOutcome.warnings.at(-1)?.code
                        ?? 'initial_analysis_degraded'
                    : `initial_analysis_${terminalOutcome.status}`);
        recordRuntimeEvent(store, {
            sessionId: request.appSessionId,
            runId: runtimeRunId,
            turnId: executionId,
            type: noUsableResults || terminalOutcome.status === 'failed'
                ? 'turn_failed'
                : terminalOutcome.status === 'cancelled'
                    ? 'turn_cancelled'
                    : 'turn_completed',
            stage: 'finalizing',
            reason: terminalReasonCode,
            retryable: noUsableResults || terminalOutcome.error?.retryable === true,
            ...(noUsableResults || terminalOutcome.status === 'failed'
                ? {
                    failureClass: providerFailureWarning
                        ? 'provider' as const
                        : 'tool_execution' as const,
                }
                : {}),
            message: summary,
            detail: {
                activityTitle: title,
                activityKind: 'terminal',
                outcome: terminalOutcome.status,
                traceId,
                warningCodes: terminalOutcome.warnings.map(warning => warning.code),
                errorCode: terminalOutcome.error?.code ?? null,
                cardCount: store.getState().analysisCards.length,
                trustedCardCount: terminalOutcome.trustedCardIds.length,
                recoveryAvailable: supportsRecoveryAnchor,
            },
        });
        if (supportsRecoveryAnchor) {
            try {
                const persisted = await this.persistSessionSnapshot(store);
                if (!persisted) {
                    throw new Error('initial_analysis_terminal_snapshot_not_persisted');
                }
            } catch (error) {
                const reasonCode = 'initial_analysis_terminal_snapshot_not_persisted';
                const message = 'Analysis reached a terminal state, but refresh recovery could not be saved. Keep this tab open or re-import the file.';
                store.getState().addProgress?.(message, 'warning');
                emitAgentEvent(store, {
                    runId: runtimeRunId,
                    phase: 'evaluation',
                    step: 'initial_analysis_terminal_persistence',
                    status: 'error',
                    message,
                    detail: {
                        reasonCode,
                        datasetVersion: request.datasetVersion,
                        traceId,
                    },
                    activity: {
                        kind: 'preparation',
                        lifecycle: 'degraded',
                        source: 'app',
                        eventType: 'initial_analysis_terminal_persistence',
                        title: 'Refresh recovery unavailable',
                        explanation: message,
                    },
                });
                debugLog(
                    reasonCode,
                    {
                        sessionId: request.appSessionId,
                        runtimeRunId,
                        traceId,
                    },
                    new Error(sanitizeErrorMessage(error)),
                );
            }
        }
        return terminalOutcome;
    }

    cancel(appSessionId: string): void {
        const run = this.activeRuns.get(appSessionId);
        if (!run || run.controller.signal.aborted) return;
        requestDataResearchCancellation(run.runtimeRunId);
        run.controller.abort(new DOMException(
            'Initial analysis was cancelled.',
            'AbortError',
        ));
    }

    private getRuntime(): Promise<AgrunRuntime> {
        if (!this.runtimePromise) {
            this.runtimePromise = this.runtimeFactory().catch(error => {
                this.runtimePromise = null;
                throw error;
            });
        }
        return this.runtimePromise;
    }
}

export const createInitialAnalysisRuntimeAdapter = ({
    runtimeFactory,
    runtimeSkillsFactory = createAgrunProviderSkills,
    bridge = createInitialAnalysisActionExecutionBridge(),
    executors = createInitialAnalysisStageExecutors(),
    checkpointCoordinator = agrunCheckpointCoordinator,
    persistSessionSnapshot = async store => {
        const { persistCurrentAppSessionSnapshot } =
            await import('../../../persistence/currentSessionPersistence');
        return persistCurrentAppSessionSnapshot(store.getState());
    },
    runtimeBudgetMs = INITIAL_ANALYSIS_RUNTIME_BUDGET_MS,
}: {
    runtimeFactory?: AgrunRuntimeFactory;
    runtimeSkillsFactory?: (
        module: AgrunModule,
    ) => unknown[] | Promise<unknown[]>;
    bridge?: InitialAnalysisActionExecutionBridge;
    executors?: InitialAnalysisStageExecutorMap;
    checkpointCoordinator?: AgrunCheckpointCoordinator;
    persistSessionSnapshot?: (store: StoreApi) => Promise<boolean>;
    runtimeBudgetMs?: number;
} = {}): InitialAnalysisRuntimeAdapter =>
    new DefaultInitialAnalysisRuntimeAdapter(
        runtimeFactory ?? createAgrunInitialAnalysisRuntimeFactory({
            runtimeOptionsFactory: async module => ({
                skills: await runtimeSkillsFactory(module),
                customActions: createAgrunInitialAnalysisActions({
                    bridge,
                    module,
                }),
                actionPolicy: createAgrunInitialAnalysisActionPolicy(),
                plannerDirectives: INITIAL_ANALYSIS_PLANNER_DIRECTIVES,
            }),
        }),
        bridge,
        executors,
        checkpointCoordinator,
        persistSessionSnapshot,
        runtimeBudgetMs,
    );
