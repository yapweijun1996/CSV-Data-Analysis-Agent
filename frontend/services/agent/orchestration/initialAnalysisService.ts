import type {
    CsvData,
    InitialAnalysisOutcome,
    InitialAnalysisTrigger,
} from '../../../types';
import { resolveProviderModelId } from '../../ai/providerConfig';
import { buildDatasetVersionId } from '../../../utils/datasetId';
import { getCurrentAnalysisDatasetVersion } from '../artifactProvenance';
import { finalizeAndSaveRun } from '../memory/memoryManager';
import {
    runPiInitialAnalysis,
} from '../runtime/pi/piInitialAnalysisRuntimeService';
import type { InitialAnalysisRunOutcome } from '../runtime/pi/initialAnalysisTypes';
import type { StoreApi } from '../types';

const toLegacyOutcome = (
    outcome: InitialAnalysisRunOutcome,
): InitialAnalysisOutcome => {
    if (outcome.status === 'completed') return { status: 'ready' };
    if (outcome.status === 'cancelled') {
        return {
            status: 'paused',
            message: 'The analysis was stopped. The last stable dataset was kept.',
        };
    }
    if (outcome.status === 'degraded') {
        return {
            status: 'degraded',
            message: outcome.warnings[0]?.message
                ?? 'The analysis completed with visible limitations.',
        };
    }
    return {
        status: 'error',
        message: outcome.error?.message
            ?? 'The governed initial analysis did not complete.',
    };
};

/**
 * The sole production entry for a first-pass or regenerated analysis.
 * Pi owns the agent loop; app services continue to own every mutation.
 */
export const handleInitialAnalysis = async (
    dataForAnalysis: CsvData,
    goal: string,
    store: StoreApi,
    _options?: { trigger?: InitialAnalysisTrigger },
): Promise<InitialAnalysisOutcome> => {
    if (!dataForAnalysis) {
        return {
            status: 'error',
            message: 'No dataset was provided for analysis.',
        };
    }

    const state = store.getState();
    const datasetVersion = getCurrentAnalysisDatasetVersion(state)
        ?? buildDatasetVersionId(
            dataForAnalysis.fileName,
            dataForAnalysis.data,
        );
    const datasetId = state.currentDatasetId ?? datasetVersion;
    store.setState({
        isChangingGoal: false,
        goalState: 'confirmed',
        confirmedAnalysisGoal: goal,
    });

    try {
        const outcome = await runPiInitialAnalysis({
            appSessionId: state.sessionId,
            datasetId,
            datasetVersion,
            researchGoal: goal,
            provider: {
                provider: state.settings.provider,
                modelId: resolveProviderModelId(state.settings),
            },
        }, store);
        return toLegacyOutcome(outcome);
    } finally {
        await finalizeAndSaveRun(store);
    }
};
