import { resolveProviderModelId } from '../../../ai/providerConfig';
import { DEFAULT_AUTO_ANALYSIS_GOAL } from '../../analysisDefaults';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { buildCardSemanticFingerprint } from '../../cardSemanticFingerprint';
import type { StoreApi } from '../../types';
import {
    agrunCheckpointCoordinator,
    type AgrunCheckpointCoordinator,
} from './checkpointCoordinator';
import {
    buildAgrunCheckpointMessageFingerprint,
} from './checkpointStore';
import {
    createInitialAnalysisRuntimeAdapter,
} from './initialAnalysisRuntimeAdapter';
import type {
    InitialAnalysisRunOutcome,
    InitialAnalysisRunRequest,
} from './initialAnalysisTypes';
import type {
    InitialAnalysisRuntimeAdapter,
} from './types';

let singletonAdapter: InitialAnalysisRuntimeAdapter | null = null;

export const getInitialAnalysisRuntimeAdapter = (
): InitialAnalysisRuntimeAdapter => {
    singletonAdapter ??= createInitialAnalysisRuntimeAdapter();
    return singletonAdapter;
};

export const runAgrunInitialAnalysis = (
    request: InitialAnalysisRunRequest,
    store: StoreApi,
): Promise<InitialAnalysisRunOutcome> =>
    getInitialAnalysisRuntimeAdapter().run(request, store);

const hasRecoverableCommittedState = (
    store: StoreApi,
    committedTransformationIds: string[],
    materializedCardFingerprints: string[],
): boolean => {
    const state = store.getState();
    const currentTransformations = new Set(
        (state.dataPreparationPlan?.operations ?? []).map(operation => operation.id),
    );
    const currentCards = new Set(
        state.analysisCards
            .map(card => buildCardSemanticFingerprint(
                card.plan,
                card.provenance?.datasetVersion,
            ))
            .filter((value): value is string => Boolean(value)),
    );
    return committedTransformationIds.every(id => currentTransformations.has(id))
        && materializedCardFingerprints.every(fingerprint =>
            currentCards.has(fingerprint));
};

export const recoverAgrunInitialAnalysisIfNeeded = async (
    store: StoreApi,
    options: {
        adapter?: InitialAnalysisRuntimeAdapter;
        checkpointCoordinator?: AgrunCheckpointCoordinator;
    } = {},
): Promise<InitialAnalysisRunOutcome | null> => {
    const state = store.getState();
    const datasetVersion = getCurrentAnalysisDatasetVersion(state);
    if (!datasetVersion || !state.currentDatasetId) return null;
    const checkpointCoordinator =
        options.checkpointCoordinator ?? agrunCheckpointCoordinator;
    const checkpoint = await checkpointCoordinator.readValid(
        state.sessionId,
        datasetVersion,
        Date.now(),
        'initial_analysis',
    );
    if (
        !checkpoint
        || checkpoint.runKind !== 'initial_analysis'
        || checkpoint.hostState.runKind !== 'initial_analysis'
    ) {
        return null;
    }

    const researchGoal =
        state.confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
    const messageMatches =
        checkpoint.messageFingerprint
        === buildAgrunCheckpointMessageFingerprint(researchGoal);
    const committedStateMatches = hasRecoverableCommittedState(
        store,
        checkpoint.hostState.committedTransformationIds,
        checkpoint.hostState.materializedCardFingerprints,
    );
    if (!messageMatches || !committedStateMatches) {
        await checkpointCoordinator.discardSession(state.sessionId);
        state.addProgress?.(
            'The interrupted automatic analysis could not be resumed safely because its goal or committed artifacts changed.',
            'warning',
        );
        return null;
    }

    const adapter = options.adapter ?? getInitialAnalysisRuntimeAdapter();
    if (!adapter.recover) {
        await checkpointCoordinator.discardSession(state.sessionId);
        throw new Error('Initial-analysis checkpoint recovery is unavailable.');
    }
    return adapter.recover({
        appSessionId: state.sessionId,
        datasetId: state.currentDatasetId,
        datasetVersion,
        researchGoal,
        provider: {
            provider: state.settings.provider,
            modelId: resolveProviderModelId(state.settings),
        },
    }, checkpoint, store);
};

export const cancelAgrunInitialAnalysis = (appSessionId: string): void => {
    getInitialAnalysisRuntimeAdapter().cancel(appSessionId);
};

export const resetInitialAnalysisRuntimeForTests = (): void => {
    singletonAdapter = null;
};
