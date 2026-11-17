import type { CleaningRun, CleaningRunStep } from '../../types';
import { WORKSPACE_DATASET_CLEAN_CSV } from './workspaceFileUtils';
import { createId } from '../../utils/createId';

export const createCleaningRun = (): CleaningRun => {
    const now = new Date();
    return {
        runId: createId('cleaning-run'),
        status: 'idle',
        currentStep: 0,
        steps: [],
        lastModelResponse: null,
        startedAt: now,
        updatedAt: now,
        targetPath: WORKSPACE_DATASET_CLEAN_CSV,
        lastError: null,
        shouldAutoResume: false,
        loopCount: 0,
        inspectionStatus: null,
        residualUnknownRowCount: null,
        residualSummaryLikeRowCount: null,
        lastFailedStage: null,
        latestRowInspection: null,
        iterationArtifacts: [],
        recoveryState: {
            activeStrategyId: null,
            attemptedStrategies: [],
            lastReasonCode: null,
            recoveredBy: null,
            analysisMode: 'normal',
        },
        userFacingMessage: null,
        actionTakenMessage: null,
        dataSafetyMessage: null,
        nextStateMessage: null,
        technicalDetail: null,
    };
};

export const appendCleaningRunStep = (
    run: CleaningRun | null,
    stepInput: Omit<CleaningRunStep, 'stepId' | 'timestamp'>,
): CleaningRun => {
    const baseRun = run ?? createCleaningRun();
    const step: CleaningRunStep = {
        ...stepInput,
        stepId: createId('step'),
        timestamp: new Date(),
    };
    return {
        ...baseRun,
        steps: [...baseRun.steps, step],
        currentStep: baseRun.steps.length + 1,
        updatedAt: new Date(),
    };
};

export const updateCleaningRun = (
    run: CleaningRun | null,
    updates: Partial<CleaningRun>,
): CleaningRun => {
    const baseRun = run ?? createCleaningRun();
    return {
        ...baseRun,
        ...updates,
        // The origin describes one specific failure write; any later update supersedes it.
        failureOrigin: updates.failureOrigin ?? null,
        updatedAt: new Date(),
    };
};

/**
 * An idle run is the persisted placeholder created when a dataset is imported.
 * Only runs that have started, paused, or failed represent unfinished cleaning.
 */
export const hasUnfinishedCleaningRun = (run: CleaningRun | null | undefined): boolean =>
    Boolean(run && run.status !== 'idle' && run.status !== 'completed');

export const shouldResumeCleaningRun =(run: CleaningRun | null) =>
    Boolean(run && (run.status === 'running' || run.shouldAutoResume));
