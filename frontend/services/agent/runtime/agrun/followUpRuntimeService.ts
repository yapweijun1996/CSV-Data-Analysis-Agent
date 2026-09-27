/**
 * App composition root for the production Agrun follow-up runtime.
 *
 * chatOrchestrator selects this service only after app-owned routing. The
 * service creates the existing AgentTurn state, then delegates the loop to one
 * singleton FollowUpRuntimeAdapter.
 */
import type {
    ClarificationOption,
    ClarificationRequest,
} from '../../../../types';
import { createChatMessage } from '../../../../utils/messageState';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { recordRuntimeEvent } from '../runtimeHelpers';
import { createAgentTurn } from '../runtimeState';
import { createAgrunEventProjector } from './eventAdapter';
import { createFollowUpRuntimeAdapter } from './followUpRuntimeAdapter';
import {
    AgrunInteractionResolutionError,
    createAgrunApprovalResumeInput,
    createAgrunInteractionResolution,
} from './interactionAdapter';
import {
    createAgrunProviderInput,
    createAgrunProviderSkills,
} from './providerAdapter';
import { createAgrunFollowUpContextInput } from './contextAdapter';
import {
    normalizeAndProjectAgrunResult,
    projectAgrunResultToStore,
} from './resultAdapter';
import type {
    FollowUpRuntimeAdapter,
    FollowUpRuntimeRequest,
    FollowUpRuntimeResult,
} from './types';
import type { StoreApi } from '../../types';
import {
    agrunCheckpointCoordinator,
    type AgrunCheckpointCoordinator,
} from './checkpointCoordinator';
import { buildAgrunCheckpointMessageFingerprint } from './checkpointStore';

const eventProjector = createAgrunEventProjector();
let singletonAdapter: FollowUpRuntimeAdapter | null = null;
export const FOLLOW_UP_PROVIDER_ATTEMPT_TIMEOUT_MS = 45_000;

type PersistSessionSnapshot = (
    state: ReturnType<StoreApi['getState']>,
) => Promise<boolean>;

const persistRecoveryAnchor: PersistSessionSnapshot = async state => {
    const { persistCurrentAppSessionSnapshot } =
        await import('../../../persistence/currentSessionPersistence');
    return persistCurrentAppSessionSnapshot(state);
};

const createAppOwnedAgrunContext = async (
    message: string,
    store: StoreApi,
    requestContext: Pick<FollowUpRuntimeRequest, 'queryUnderstandingArtifact' | 'groundingResult'> = {},
) => {
    const { readAppFollowUpMemory } =
        await import('../../memory/followUpMemory');
    const appMemory = await readAppFollowUpMemory(store, message);
    return createAgrunFollowUpContextInput(store.getState(), appMemory, requestContext);
};

const createAppAgrunAdapter = (): FollowUpRuntimeAdapter =>
    createFollowUpRuntimeAdapter({
        runtimeSkillsFactory: createAgrunProviderSkills,
        bindings: {
            createRunInput: async (request, store) => ({
                ...createAgrunProviderInput(
                    store.getState().settings,
                    request.message,
                    {
                        requestTimeoutMs: FOLLOW_UP_PROVIDER_ATTEMPT_TIMEOUT_MS,
                    },
                ),
                ...await createAppOwnedAgrunContext(request.message, store, request),
                sessionId: request.sessionId,
            }),
            createResumeInput: async (interaction, store) => ({
                ...createAgrunProviderInput(
                    store.getState().settings,
                    undefined,
                    {
                        requestTimeoutMs: FOLLOW_UP_PROVIDER_ATTEMPT_TIMEOUT_MS,
                    },
                ),
                ...await createAppOwnedAgrunContext(
                    interaction.kind === 'clarification'
                        ? interaction.answer
                        : '',
                    store,
                ),
                ...(interaction.kind === 'approval'
                    ? createAgrunApprovalResumeInput(interaction)
                    : {
                        prompt: interaction.answer,
                        sessionId: interaction.sessionId,
                    }),
            }),
            normalizeResult: normalizeAndProjectAgrunResult,
            projectEvent: (event, context) => eventProjector.project(event, context),
        },
    });

export const getAgrunFollowUpRuntimeAdapter = (): FollowUpRuntimeAdapter => {
    singletonAdapter ??= createAppAgrunAdapter();
    return singletonAdapter;
};

export const __resetAgrunFollowUpRuntimeServiceForTests = (): void => {
    singletonAdapter = null;
};

const recordAgrunStart = (
    request: FollowUpRuntimeRequest,
    store: StoreApi,
) => {
    recordRuntimeEvent(store, {
        sessionId: request.sessionId,
        runId: `agrun-${request.turnId}`,
        turnId: request.turnId,
        type: 'turn_started',
        stage: 'selecting',
        reason: 'agrun_follow_up_runtime',
        retryable: false,
        message: 'Agent Runtime JavaScript started the production follow-up turn.',
        detail: {
            source: 'agrun_follow_up_runtime_service',
            runtimeOwner: 'agrun',
        },
    });
};

export const runAgrunFollowUpTurn = async (
    request: Omit<FollowUpRuntimeRequest, 'sessionId' | 'turnId'>,
    store: StoreApi,
    adapter: FollowUpRuntimeAdapter = getAgrunFollowUpRuntimeAdapter(),
    persistSessionSnapshot: PersistSessionSnapshot = persistRecoveryAnchor,
): Promise<FollowUpRuntimeResult> => {
    const state = store.getState();
    try {
        await persistSessionSnapshot(state);
    } catch (error) {
        state.addProgress?.(
            `AI refresh recovery is temporarily unavailable: ${
                error instanceof Error ? error.message : String(error)
            }`,
            'warning',
        );
    }
    const turn = createAgentTurn(request.message);
    state.clearActiveTurnCancellation?.();
    store.setState({
        activeTurn: turn,
        isBusy: true,
        chatLifecycleState: 'running',
        pendingClarification: null,
    });

    const runtimeRequest: FollowUpRuntimeRequest = {
        ...request,
        sessionId: state.sessionId,
        turnId: turn.turnId,
    };
    recordAgrunStart(runtimeRequest, store);
    return adapter.run(runtimeRequest, store);
};

export const recoverAgrunFollowUpTurnIfNeeded = async (
    store: StoreApi,
    adapter: FollowUpRuntimeAdapter = getAgrunFollowUpRuntimeAdapter(),
    checkpointCoordinator: AgrunCheckpointCoordinator = agrunCheckpointCoordinator,
): Promise<FollowUpRuntimeResult | null> => {
    const state = store.getState();
    if (!state.csvData || state.isBusy) return null;

    const checkpoint = await checkpointCoordinator.readValid(
        state.sessionId,
        getCurrentAnalysisDatasetVersion(state),
    );
    if (!checkpoint) return null;

    const latestUserMessage = [...state.chatHistory]
        .reverse()
        .find(message => message.sender === 'user' && message.type === 'user_message');
    if (
        !latestUserMessage
        || buildAgrunCheckpointMessageFingerprint(latestUserMessage.text)
            !== checkpoint.messageFingerprint
    ) {
        await checkpointCoordinator.discardSession(state.sessionId);
        return null;
    }

    const turn = {
        ...createAgentTurn(latestUserMessage.text),
        turnId: checkpoint.turnId,
    };
    state.clearActiveTurnCancellation?.();
    store.setState({
        activeTurn: turn,
        isBusy: true,
        chatLifecycleState: 'running',
        pendingClarification: null,
    });
    const request: FollowUpRuntimeRequest = {
        message: latestUserMessage.text,
        sessionId: state.sessionId,
        turnId: checkpoint.turnId,
    };
    recordRuntimeEvent(store, {
        sessionId: state.sessionId,
        runId: `agrun-${checkpoint.turnId}`,
        turnId: checkpoint.turnId,
        type: 'turn_started',
        stage: 'selecting',
        reason: 'agrun_checkpoint_recovery',
        retryable: false,
        message: 'Agent Runtime JavaScript resumed an interrupted follow-up turn.',
        detail: {
            source: 'agrun_follow_up_runtime_service',
            runtimeOwner: 'agrun',
        },
    });
    if (!adapter.recover) {
        await checkpointCoordinator.discardSession(state.sessionId);
        throw new Error('Agent Runtime JavaScript checkpoint recovery is unavailable.');
    }
    return adapter.recover(request, checkpoint, store);
};

export const discardAgrunFollowUpSession = (
    sessionId: string,
): Promise<void> => agrunCheckpointCoordinator.discardSession(sessionId);

export const purgeAgrunFollowUpCheckpoints = (
    keepSessionIds: Iterable<string> = [],
): Promise<number> => agrunCheckpointCoordinator.purge(keepSessionIds);

const appendInteractionSelection = (
    choice: ClarificationOption,
    store: StoreApi,
) => {
    const text = (choice.label || choice.value).trim();
    store.setState(prev => ({
        pendingClarification: null,
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'user',
                text,
                timestamp: new Date(),
                type: 'user_message',
                clarificationSelection: choice,
            }),
        ],
        activeTurn: prev.activeTurn
            ? {
                ...prev.activeTurn,
                status: 'running',
                lifecycleState: 'selecting',
                completedAt: undefined,
                pendingClarificationRequest: null,
            }
            : null,
        isBusy: true,
        chatLifecycleState: 'running',
    }));
};

const projectInteractionResolutionFailure = (
    error: AgrunInteractionResolutionError,
    clarification: ClarificationRequest,
    store: StoreApi,
): FollowUpRuntimeResult => {
    const metadata = clarification.resumeContext?.followUpRuntimeInteraction;
    const turnId = metadata?.turnId
        ?? store.getState().activeTurn?.turnId
        ?? clarification.resumeContext?.turnId
        ?? 'agrun-stale-interaction';
    const sessionId = metadata?.sessionId || store.getState().sessionId;
    const result: FollowUpRuntimeResult = {
        status: 'failed',
        appTurnId: turnId,
        runtimeRunId: metadata?.runtimeRunId,
        error: {
            code: error.code,
            message: error.message,
            retryable: false,
        },
    };
    projectAgrunResultToStore(result, {
        appTurnId: turnId,
        sessionId,
        store,
    });
    return result;
};

export const resumeAgrunFollowUpInteraction = async (
    clarification: ClarificationRequest,
    choice: ClarificationOption,
    store: StoreApi,
    adapter: FollowUpRuntimeAdapter = getAgrunFollowUpRuntimeAdapter(),
): Promise<FollowUpRuntimeResult> => {
    appendInteractionSelection(choice, store);

    let resolution;
    try {
        resolution = createAgrunInteractionResolution({
            clarification,
            choice,
        });
    } catch (error) {
        if (error instanceof AgrunInteractionResolutionError) {
            return projectInteractionResolutionFailure(error, clarification, store);
        }
        throw error;
    }

    const activeTurnId = store.getState().activeTurn?.turnId;
    if (activeTurnId !== resolution.turnId) {
        return projectInteractionResolutionFailure(
            new AgrunInteractionResolutionError(
                'agrun_interaction_stale',
                'The Agent Runtime JavaScript interaction belongs to a stale turn.',
            ),
            clarification,
            store,
        );
    }

    return adapter.resume(resolution, store);
};
