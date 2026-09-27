import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { buildCardSemanticFingerprint } from '../../cardSemanticFingerprint';
import { updateAgentTaskStatus } from '../../monitoring/agentMonitor';
import type { StoreApi } from '../../types';
import { buildToolAvailabilityContext } from '../../tools/toolGovernance';
import { recordRuntimeEvent } from '../runtimeHelpers';
import {
    createInitialAnalysisStageToolManifests,
    type InitialAnalysisStageManifest,
    type InitialAnalysisStageToolName,
} from '../../tools/manifests/initialAnalysisStageManifests';
import {
    boundAgrunValueForHost,
    toAgrunActionName,
} from './actionAdapter';
import {
    executeInitialAnalysisStageTool,
    InitialAnalysisStageToolError,
    type InitialAnalysisStageActionResult,
    type InitialAnalysisStageExecutorMap,
} from './initialAnalysisStageTools';
import type {
    InitialAnalysisCheckpointHostState,
    InitialAnalysisRunRequest,
} from './initialAnalysisTypes';
import {
    createInitialAnalysisBudgetState,
} from './initialAnalysisTypes';
import type {
    AgrunActionContext,
    AgrunActionSpec,
    AgrunModule,
    AgrunRecord,
} from './types';

export const AGRUN_INITIAL_ANALYSIS_RESULT_KIND = 'initial_analysis_stage_result';
export const INITIAL_ANALYSIS_EVIDENCE_ACTION_TIMEOUT_MS = 200_000;

export const INITIAL_ANALYSIS_PLANNER_DIRECTIVES = Object.freeze([
    'Run the host initial-analysis actions in the exact declared order.',
    'Call each action once. Do not skip, repeat, or invent actions.',
    'Use only the bounded host observations returned by those actions.',
    'Never request web access, global memory, raw CSV rows, credentials, or undeclared tools.',
    'Complete only after host_analysis_finalizeartifacts returns.',
]);

interface ActiveInitialAnalysisExecution {
    request: InitialAnalysisRunRequest;
    store: StoreApi;
    executors: InitialAnalysisStageExecutorMap;
    signal: AbortSignal;
    nextActionIndex: number;
    results: InitialAnalysisStageActionResult[];
    runtimeRunId: string;
    traceId: string;
    hostState: InitialAnalysisCheckpointHostState;
    onStageCommitted?: (
        hostState: InitialAnalysisCheckpointHostState,
    ) => void | Promise<void>;
}

export interface InitialAnalysisActionExecutionSnapshot {
    nextActionIndex: number;
    results: InitialAnalysisStageActionResult[];
    runtimeRunId: string;
    traceId: string;
    hostState: InitialAnalysisCheckpointHostState;
}

export interface InitialAnalysisActionExecutionBridge {
    register(params: {
        executionId: string;
        request: InitialAnalysisRunRequest;
        store: StoreApi;
        executors: InitialAnalysisStageExecutorMap;
        signal: AbortSignal;
        runtimeRunId: string;
        traceId: string;
        resumeHostState?: InitialAnalysisCheckpointHostState;
        onStageCommitted?: (
            hostState: InitialAnalysisCheckpointHostState,
        ) => void | Promise<void>;
    }): void;
    release(executionId: string): void;
    resolve(executionId: string): ActiveInitialAnalysisExecution | null;
    snapshot(executionId: string): InitialAnalysisActionExecutionSnapshot | null;
}

const manifests = createInitialAnalysisStageToolManifests();
const manifestNames = manifests.map(manifest => manifest.name);

const humanizeStageName = (manifest: InitialAnalysisStageManifest): string =>
    manifest.name
        .split('.')
        .at(-1)!
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, character => character.toUpperCase());

const buildStageActivityDetail = (params: {
    execution: ActiveInitialAnalysisExecution;
    manifest: InitialAnalysisStageManifest;
    stageIndex: number;
    elapsedMs?: number;
    result?: InitialAnalysisStageActionResult;
}): Record<string, unknown> => ({
    activityTitle: `${params.stageIndex}/${manifests.length} ${humanizeStageName(params.manifest)}`,
    activityKind: params.manifest.name.startsWith('dataset.')
        ? 'preparation'
        : 'research',
    phase: params.manifest.initialAnalysis.phase,
    toolName: params.manifest.name,
    stageIndex: params.stageIndex,
    totalStages: manifests.length,
    traceId: params.execution.traceId,
    datasetVersion: params.result?.datasetVersion
        ?? params.execution.request.datasetVersion,
    ...(typeof params.elapsedMs === 'number'
        ? { elapsedMs: Math.max(0, Math.round(params.elapsedMs)) }
        : {}),
    ...(params.result
        ? {
            decision: params.result.decision,
            warningCodes: params.result.warningCodes,
            cardCount: params.result.cardIds.length,
            artifactCount: params.result.artifactRefs.length,
            transformationCount: params.result.transformationIds.length,
            budget: params.execution.hostState.budget,
        }
        : {}),
});

export const getInitialAnalysisActionManifests = (
): InitialAnalysisStageManifest[] => [...manifests];

export const createInitialAnalysisActionExecutionBridge = (
): InitialAnalysisActionExecutionBridge => {
    const executions = new Map<string, ActiveInitialAnalysisExecution>();
    return {
        register: params => {
            if (executions.has(params.executionId)) {
                throw new Error('initial_analysis_execution_already_registered');
            }
            const completedToolNames =
                params.resumeHostState?.completedToolNames ?? [];
            const hasValidPrefix = completedToolNames.every(
                (toolName, index) => manifestNames[index] === toolName,
            );
            if (!hasValidPrefix) {
                throw new Error('initial_analysis_checkpoint_sequence_invalid');
            }
            executions.set(params.executionId, {
                request: params.request,
                store: params.store,
                executors: params.executors,
                signal: params.signal,
                nextActionIndex: completedToolNames.length,
                results: [],
                runtimeRunId:
                    params.resumeHostState?.runtimeRunId
                    || params.runtimeRunId,
                traceId:
                    params.resumeHostState?.traceId
                    || params.traceId,
                hostState: params.resumeHostState ?? {
                    runKind: 'initial_analysis',
                    runtimeRunId: params.runtimeRunId,
                    traceId: params.traceId,
                    phase: manifests[0].initialAnalysis.phase,
                    phaseAttempt: 1,
                    budget: createInitialAnalysisBudgetState(),
                    committedTransformationIds: [],
                    materializedCardFingerprints: [],
                    warningCodes: [],
                    completedToolNames: [],
                },
                onStageCommitted: params.onStageCommitted,
            });
        },
        release: executionId => {
            executions.delete(executionId);
        },
        resolve: executionId => executions.get(executionId) ?? null,
        snapshot: executionId => {
            const execution = executions.get(executionId);
            return execution
                ? {
                    nextActionIndex: execution.nextActionIndex,
                    results: [...execution.results],
                    runtimeRunId: execution.runtimeRunId,
                    traceId: execution.traceId,
                    hostState: execution.hostState,
                }
                : null;
        },
    };
};

const readExecutionId = (context: AgrunActionContext): string => {
    const executionId = context.request?.agrunSessionId;
    return typeof executionId === 'string' ? executionId.trim() : '';
};

const createFailureResult = (
    manifest: InitialAnalysisStageManifest,
    datasetVersion: string,
    code: string,
    message: string,
): InitialAnalysisStageActionResult => ({
    decision: 'fail',
    phase: manifest.initialAnalysis.phase,
    toolName: manifest.name,
    datasetVersion,
    summary: message,
    warningCodes: [code],
    artifactRefs: [],
    transformationIds: [],
    cardIds: [],
});

const buildStageArgs = (
    execution: ActiveInitialAnalysisExecution,
    manifest: InitialAnalysisStageManifest,
    args: AgrunRecord,
): AgrunRecord => {
    const datasetVersion = getCurrentAnalysisDatasetVersion(
        execution.store.getState(),
    ) ?? execution.request.datasetVersion;
    const phaseAttempt = 1;
    return {
        ...args,
        datasetId: execution.request.datasetId,
        datasetVersion,
        runtimeRunId: execution.runtimeRunId,
        traceId: execution.traceId,
        phaseAttempt,
        idempotencyKey: [
            execution.request.appSessionId,
            datasetVersion,
            manifest.initialAnalysis.phase,
            phaseAttempt,
            manifest.name,
        ].join(':'),
    };
};

const buildCheckpointHostState = (
    execution: ActiveInitialAnalysisExecution,
    result: InitialAnalysisStageActionResult,
): InitialAnalysisCheckpointHostState => {
    const state = execution.store.getState();
    const completedToolNames = [
        ...execution.hostState.completedToolNames,
        result.toolName,
    ];
    const nextManifest = manifests[completedToolNames.length];
    const currentBudget = execution.hostState.budget;
    const hypothesesUsed = Math.min(
        8,
        state.latestAnalysisSession?.hypotheses.length
            ?? currentBudget.hypothesesUsed,
    );
    const acceptedCards = Math.min(
        5,
        state.latestAnalysisSession?.acceptedOutputs.length
            ?? currentBudget.acceptedCards,
    );
    const cardFingerprints = state.analysisCards
        .map(card => buildCardSemanticFingerprint(
            card.plan,
            card.provenance?.datasetVersion,
        ))
        .filter((value): value is string => Boolean(value));
    return {
        ...execution.hostState,
        runtimeRunId: execution.runtimeRunId,
        traceId: execution.traceId,
        phase: nextManifest?.initialAnalysis.phase ?? result.phase,
        budget: {
            ...currentBudget,
            cleaningRoundsUsed: Math.min(
                3,
                state.cleaningRun?.loopCount
                    ?? currentBudget.cleaningRoundsUsed,
            ),
            hypothesesUsed,
            acceptedCards,
            finalizationStepsReserved:
                result.toolName === 'analysis.finalizeArtifacts' ? 0 : 1,
        },
        committedTransformationIds: Array.from(new Set([
            ...execution.hostState.committedTransformationIds,
            ...result.transformationIds,
        ])),
        materializedCardFingerprints: Array.from(new Set([
            ...execution.hostState.materializedCardFingerprints,
            ...cardFingerprints,
        ])),
        warningCodes: Array.from(new Set([
            ...execution.hostState.warningCodes,
            ...result.warningCodes,
        ])),
        completedToolNames,
    };
};

const createActionSpec = (
    bridge: InitialAnalysisActionExecutionBridge,
    manifest: InitialAnalysisStageManifest,
): AgrunActionSpec => ({
    name: toAgrunActionName(manifest.name),
    description: manifest.description,
    planner: {
        // Dataset identity, trace, phase attempt, and idempotency fields are
        // trusted host state. The planner must call the governed stage with
        // empty args; buildStageArgs injects and validates those fields before
        // dispatching through the canonical app manifest.
        argsSchema: {},
        argsExample: {},
        guidance: [
            `This is action ${manifests.indexOf(manifest) + 1} of ${manifests.length}.`,
            `Call it only after ${manifests[manifests.indexOf(manifest) - 1]?.name ?? 'the run starts'}.`,
            manifest.resultShape ?? '',
        ].filter(Boolean).join(' '),
    },
    tier: manifest.risk === 'high' ? 2 : 1,
    ...(manifest.name === 'analysis.executeEvidence'
        ? {
            timeoutMs: INITIAL_ANALYSIS_EVIDENCE_ACTION_TIMEOUT_MS,
            timeoutBehavior: 'error_as_result',
        }
        : {}),
    permission: {
        effect: manifest.capabilities?.mutatesState
            ? 'local_state_mutation'
            : 'read_only',
        interruptBehavior: manifest.capabilities?.mutatesState
            ? 'rollback_safe'
            : 'abort_safe',
        isConcurrencySafe: manifest.capabilities?.mutatesState !== true,
        isDestructive: false,
        isReadOnly: manifest.capabilities?.mutatesState !== true,
        needsApproval: false,
        source: 'initial_analysis_app_manifest',
    },
    outputSchema: {
        kinds: [AGRUN_INITIAL_ANALYSIS_RESULT_KIND],
        controls: manifest.name === 'analysis.finalizeArtifacts'
            ? ['complete']
            : ['continue'],
    },
    async execute(context, args) {
        const executionId = readExecutionId(context);
        const execution = executionId ? bridge.resolve(executionId) : null;
        if (!execution) {
            return {
                control: 'continue',
                summary: 'The initial-analysis execution context is unavailable.',
                output: {
                    kind: AGRUN_INITIAL_ANALYSIS_RESULT_KIND,
                    ok: false,
                    decision: 'fail',
                    toolName: manifest.name,
                    warningCodes: ['initial_analysis_context_missing'],
                },
            };
        }

        if (execution.signal.aborted || context.request?.signal?.aborted) {
            throw execution.signal.reason instanceof Error
                ? execution.signal.reason
                : new DOMException('Initial analysis was cancelled.', 'AbortError');
        }

        const expected = manifests[execution.nextActionIndex];
        if (expected?.name !== manifest.name) {
            const message = expected
                ? `Expected ${expected.name} before ${manifest.name}.`
                : `No further initial-analysis action is allowed after finalization.`;
            return {
                control: 'continue',
                summary: message,
                output: {
                    kind: AGRUN_INITIAL_ANALYSIS_RESULT_KIND,
                    ok: false,
                    decision: 'fail',
                    toolName: manifest.name,
                    warningCodes: ['initial_analysis_action_out_of_order'],
                },
            };
        }

        const stageArgs = buildStageArgs(execution, manifest, args);
        const stageIndex = execution.nextActionIndex + 1;
        const stageStartedAt = performance.now();
        updateAgentTaskStatus(execution.store, {
            status: 'thinking',
            title: 'Analyzing data',
            titleKey: 'ai_task_analyzing_data',
            subtitle: humanizeStageName(manifest),
            totalSteps: manifests.length,
            currentStep: stageIndex,
        });
        recordRuntimeEvent(execution.store, {
            sessionId: execution.request.appSessionId,
            runId: execution.runtimeRunId,
            turnId: executionId,
            type: 'observation_recorded',
            stage: 'executing',
            reason: 'initial_analysis_stage_started',
            retryable: false,
            message: `Started ${humanizeStageName(manifest)}.`,
            detail: buildStageActivityDetail({
                execution,
                manifest,
                stageIndex,
            }),
        });
        let result: InitialAnalysisStageActionResult;
        try {
            const state = execution.store.getState();
            result = await executeInitialAnalysisStageTool({
                toolName: manifest.name,
                phase: manifest.initialAnalysis.phase,
                args: stageArgs,
                availability: buildToolAvailabilityContext(state, {
                    toolStage: manifest.stageAvailability?.[0],
                    datasetId: execution.request.datasetId,
                }),
                context: {
                    request: execution.request,
                    store: execution.store,
                    signal: execution.signal,
                },
                executors: execution.executors,
            });
        } catch (error) {
            if (
                execution.signal.aborted
                || context.request?.signal?.aborted
                || (error instanceof DOMException && error.name === 'AbortError')
            ) {
                throw error;
            }
            const code = error instanceof InitialAnalysisStageToolError
                ? error.code
                : 'initial_stage_execution_failed';
            const message = error instanceof Error
                ? error.message
                : String(error);
            result = createFailureResult(
                manifest,
                String(stageArgs.datasetVersion),
                code,
                message,
            );
        }
        if (execution.signal.aborted || context.request?.signal?.aborted) {
            throw execution.signal.reason instanceof Error
                ? execution.signal.reason
                : new DOMException('Initial analysis was cancelled.', 'AbortError');
        }

        execution.results.push(result);
        execution.nextActionIndex += 1;
        execution.hostState = buildCheckpointHostState(execution, result);
        const reasonCode = result.warningCodes[0]
            ?? (result.decision === 'pass'
                ? 'initial_analysis_stage_passed'
                : 'initial_analysis_stage_degraded');
        recordRuntimeEvent(execution.store, {
            sessionId: execution.request.appSessionId,
            runId: execution.runtimeRunId,
            turnId: executionId,
            type: result.decision === 'fail'
                ? 'action_execution_error'
                : result.decision === 'warn'
                    ? 'tool_degraded'
                    : 'action_executed',
            stage: 'executing',
            reason: reasonCode,
            retryable: false,
            ...(result.decision === 'fail'
                ? { failureClass: 'tool_execution' as const }
                : {}),
            message: result.summary,
            detail: buildStageActivityDetail({
                execution,
                manifest,
                stageIndex,
                elapsedMs: performance.now() - stageStartedAt,
                result,
            }),
        });
        if (execution.onStageCommitted) {
            await execution.onStageCommitted(execution.hostState);
        }
        const isFinal = manifest.name === 'analysis.finalizeArtifacts';
        return {
            control: isFinal ? 'complete' : 'continue',
            summary: result.summary,
            output: {
                kind: AGRUN_INITIAL_ANALYSIS_RESULT_KIND,
                // A stage-level fail is a governed data-quality decision, not
                // an Agrun transport/action failure. Keep the lifecycle moving
                // so the remaining stages can preserve the stable snapshot and
                // finalize an explicit degraded outcome.
                ok: true,
                decision: result.decision,
                phase: result.phase,
                toolName: result.toolName,
                datasetVersion: result.datasetVersion,
                warningCodes: result.warningCodes,
                artifactRefs: boundAgrunValueForHost(result.artifactRefs),
                transformationIds: result.transformationIds,
                cardIds: result.cardIds,
            },
        };
    },
});

export const createAgrunInitialAnalysisActions = ({
    bridge,
    module,
}: {
    bridge: InitialAnalysisActionExecutionBridge;
    module: AgrunModule;
}): unknown[] =>
    manifests.map(manifest => module.defineAction(
        createActionSpec(bridge, manifest),
    ));

export const createAgrunInitialAnalysisActionPolicy = (): AgrunRecord =>
    Object.fromEntries(
        manifests.map(manifest => [
            toAgrunActionName(manifest.name),
            {
                action: 'allow',
                reason: 'governed_initial_analysis_stage',
            },
        ]),
    );
