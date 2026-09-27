/**
 * cleaningPipelineTermination.ts
 *
 * Terminal failure + graceful degradation logic extracted from
 * autonomousCleaningPipeline.ts (REFACTOR-101 P2-B).
 */

import type { AppStore } from '../../../store/useAppStore';
import type { ColumnProfile, CsvData, DataPreparationPlan } from '../../../types';
import { createChatMessage } from '../../../utils/messageState';
import { updateCleaningRun } from '../cleaningRunState';
import type { StoreApi } from '../types';
import { inspectCsvRows } from '../rowInspectionService';
import { persistSuccessfulCleaning } from './cleaningPipelinePersistence';
import { buildPlanExplanation, translateCleaning } from './cleaningPipelineHelpers';
import {
    buildCleaningFailureDetail,
    toCleaningFailureChatText,
} from './cleaningStrategyRecovery';

/**
 * Emit a terminal failure state + chat message.
 * Called when the cleaning loop exhausts all strategies.
 */
export const emitFailure = (
    store: StoreApi,
    message: string,
    rollbackReason: string,
    extra?: { recoveryStatus?: 'idle' | 'running' | 'passed' | 'failed' },
) => {
    const lang = store.getState().settings.language;
    const failureDetail = buildCleaningFailureDetail({
        summary: translateCleaning(lang, 'cleaning_terminal_failure_summary'),
        actionTaken: translateCleaning(lang, 'cleaning_terminal_failure_action'),
        dataSafety: translateCleaning(lang, 'cleaning_terminal_failure_data_safety'),
        nextState: translateCleaning(lang, 'cleaning_terminal_failure_next'),
        technicalDetail: message,
    });
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            status: 'failed',
            lastError: message,
            lastVerificationReason: message,
            rollbackReason,
            lastFailedStage: prev.cleaningRun?.lastFailedStage ?? 'verify',
            userFacingMessage: failureDetail.summary,
            actionTakenMessage: failureDetail.actionTaken,
            dataSafetyMessage: failureDetail.dataSafety,
            nextStateMessage: failureDetail.nextState,
            technicalDetail: failureDetail.technicalDetail,
            ...(extra?.recoveryStatus ? { recoveryStatus: extra.recoveryStatus } : {}),
        }),
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'ai',
                text: toCleaningFailureChatText(failureDetail),
                timestamp: new Date(),
                type: 'ai_cleaning_failure',
                isError: true,
                cleaningRunId: prev.cleaningRun?.runId,
                resolved: false,
                cleaningFailure: failureDetail,
                suggestedActions: [
                    { label: 'Continue safe mode', action: 'continue cleaning' },
                    { label: 'Retry AI cleaning', action: 'restart cleaning' },
                    { label: 'Inspect technical detail', action: 'show technical detail' },
                ],
            }),
        ],
    }));
};

/**
 * Attempt graceful degradation when the cleaning loop is exhausted.
 * Accepts partially-cleaned data if ≥70% of rows are detail rows.
 *
 * @returns true if data was accepted (caller should return), false if terminal failure needed.
 */
export const attemptGracefulDegradation = async (params: {
    store: StoreApi;
    workingData: CsvData;
    workingProfiles: ColumnProfile[];
    rawData: CsvData;
    lastError: Error | null;
}): Promise<boolean> => {
    const { store, workingData, workingProfiles, rawData, lastError } = params;
    const getState = () => store.getState();

    if (workingData.data.length === 0) return false;

    const finalInspection = inspectCsvRows(workingData, { source: 'cleaned' });
    const noiseCount = finalInspection.residualUnknownRowIndexes.length
        + finalInspection.residualSummaryLikeRowIndexes.length;
    const detailRowRatio = 1 - (noiseCount / workingData.data.length);

    // Accept if at least 70% of rows are detail rows — noise is tolerable
    // and downstream RowRole annotations will exclude non-detail rows at query time.
    if (detailRowRatio < 0.7) return false;

    const latestState = getState();
    const degradedPlan: DataPreparationPlan = {
        explanation: buildPlanExplanation(workingData.data.length, false, latestState.settings.language),
        operations: [],
        outputColumns: workingProfiles,
        planStatus: 'schema_only',
        consistencyIssues: [],
    };

    console.warn(
        `[CleaningPipeline] Accepting partially-cleaned data (${detailRowRatio.toFixed(2)} detail-row ratio, ${noiseCount} residual noise rows).`,
    );
    latestState.addProgress?.(
        translateCleaning(latestState.settings.language, 'autonomous_cleaning_degraded_accept'),
        'warning',
    );
    store.setState(prev => ({
        cleaningRun: updateCleaningRun(prev.cleaningRun, {
            recoveryState: {
                activeStrategyId: prev.cleaningRun?.recoveryState?.activeStrategyId ?? null,
                attemptedStrategies: prev.cleaningRun?.recoveryState?.attemptedStrategies ?? [],
                lastReasonCode: prev.cleaningRun?.recoveryState?.lastReasonCode ?? null,
                recoveredBy: prev.cleaningRun?.recoveryState?.recoveredBy ?? 'deterministic_cleanup',
                analysisMode: 'degraded_safe',
            },
            userFacingMessage: translateCleaning(latestState.settings.language, 'cleaning_partial_noise_ok'),
            actionTakenMessage: translateCleaning(latestState.settings.language, 'cleaning_keep_snapshot_exclude_noise'),
            dataSafetyMessage: translateCleaning(latestState.settings.language, 'cleaning_original_snapshot_both_safe'),
            nextStateMessage: translateCleaning(latestState.settings.language, 'cleaning_analysis_labeled_safe_mode'),
            technicalDetail: lastError?.message ?? null,
        }),
    }));

    await persistSuccessfulCleaning({
        store,
        rawData,
        latestState: store.getState(),
        workingData,
        workingProfiles,
        plan: degradedPlan,
    });

    return true;
};
