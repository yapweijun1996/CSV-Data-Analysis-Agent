import type { AiTaskStatusMessage } from '../../../types';

const INITIAL_STAGE_KEY_PREFIX = 'analysis_initial_stage_';

/**
 * The initial analysis shows a nine-step tracker. Sub-tasks that run inside one
 * stage (for example hypothesis verification) report their own progress; keep
 * the stage frame (title and step) and take only the sub-task's detail line so
 * the tracker never seems to restart or disappear.
 */
export const keepInitialAnalysisStageFrame = (
    previous: AiTaskStatusMessage | null | undefined,
    next: AiTaskStatusMessage | null,
): AiTaskStatusMessage | null => {
    if (!next || !previous?.titleKey?.startsWith(INITIAL_STAGE_KEY_PREFIX)) return next;
    if (previous.status === 'done' || previous.status === 'error') return next;
    if (next.titleKey?.startsWith(INITIAL_STAGE_KEY_PREFIX)) return next;
    if (next.status === 'done' || next.status === 'error') return next;
    return {
        ...next,
        title: previous.title,
        titleKey: previous.titleKey,
        titleParams: previous.titleParams,
        totalSteps: previous.totalSteps,
        currentStep: previous.currentStep,
        rowCount: next.rowCount ?? previous.rowCount,
    };
};
