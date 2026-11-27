import { beginRun, finishRun, scopeRunStore, ownsRun } from '../../session/sessionOwnership';
import type {
    CsvData,
    InitialAnalysisOutcome,
    InitialAnalysisTrigger,
} from '../../../types';
import { resolveProviderModelId } from '../../ai/providerConfig';
import { buildDatasetVersionId } from '../../../utils/datasetId';
import { getCurrentAnalysisDatasetVersion } from '../artifactProvenance';
import { createChatMessage } from '../../../utils/messageState';
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
    if (outcome.status === 'cancelled'||outcome.status==='blocked') {
        return {
            status: 'paused',
            message: outcome.status==='blocked'?(outcome.error?.message ?? 'Initial analysis is paused for exact candidate review or required output verification.'): 'The analysis was stopped. The last stable dataset was kept.',
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

    const ownsLease = !store.executionContext;
    const lease = store.executionContext?.lease ?? beginRun(store, 'initial_analysis', `pi-initial-${crypto.randomUUID()}`);
    const originalStore = store;
    store = scopeRunStore(store, lease);
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
        }, store,undefined,{codingPreparation:{enabled:true,qualified:true}});
        if (outcome.telemetry && (outcome.status === 'completed' || outcome.status === 'degraded') && ownsRun(originalStore, lease) && !lease.signal.aborted) {
            const cards = outcome.trustedCardIds.length;
            originalStore.setState(prev => ({
                chatHistory: [...prev.chatHistory, createChatMessage({
                    sender: 'ai',
                    type: 'ai_message',
                    isRunSummary: true,
                    timestamp: new Date(),
                    text: `Initial analysis ${outcome.status === 'completed' ? 'finished' : 'finished with limitations'}: ${cards} verified ${cards === 1 ? 'card' : 'cards'} added to the dashboard.`,
                    telemetry: outcome.telemetry,
                })],
            }));
        }
        return toLegacyOutcome(outcome);
    } finally {
        try { if (ownsRun(originalStore, lease) && !lease.signal.aborted) await finalizeAndSaveRun(store); }
        finally { if (ownsLease) finishRun(originalStore, lease); }
    }
};
