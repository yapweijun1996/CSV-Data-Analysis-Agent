const PROVIDER_ERROR_PATTERN = /\b(?:api key|authentication|unauthorized|forbidden|quota|rate limit|overloaded|provider|model not found|network error|networkerror|failed to fetch|fetch failed|timed out|timeout|connection reset|econnreset)\b/i;

export const isInitialAnalysisProviderFailure = (error: unknown): boolean => {
    const candidate = error && typeof error === 'object' ? error as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        message?: unknown;
    } : null;
    const status = candidate?.status ?? candidate?.statusCode;
    if (typeof status === 'number' && [400, 401, 403, 404, 408, 429, 500, 502, 503, 504].includes(status)) {
        return true;
    }
    const detail = [candidate?.code, candidate?.message, error instanceof Error ? error.message : error]
        .filter(value => typeof value === 'string')
        .join(' ');
    return /\b(?:400|401|403|404|408|429|500|502|503|504)\b/.test(detail)
        || PROVIDER_ERROR_PATTERN.test(detail);
};

interface FailureStageResult {
    decision: 'pass' | 'warn' | 'fail';
    toolName: string;
    summary: string;
}

export interface InitialAnalysisFailureInput {
    results: readonly FailureStageResult[];
    /** Sanitised error from the run, already passed through the gateway presenter. */
    errorText: string;
    /** Tool names of the governed stages in run order; the index gives the stage number. */
    stageNames: readonly string[];
    /** Index of the stage that was running (or next to run) when the run stopped. */
    stoppedStageIndex?: number;
    /** Localised text lookup (`getTranslation` bound to the user's language). */
    translate: (key: string, params?: Record<string, string | number>) => string;
    fallbackWarning?: string;
}

/**
 * One-line reason for a run that produced no trusted result: names the stage and the real cause.
 * The first warning of a run is usually an unrelated note from an earlier stage, so it is only a last resort.
 * Stage names are localised; the detail text (stage summary or error) is the runtime's own wording.
 */
export const describeInitialAnalysisFailure = (input: InitialAnalysisFailureInput): string => {
    const { translate, stageNames } = input;
    const stageParams = (index: number) => ({
        n: index + 1,
        total: stageNames.length,
        stage: index >= 0 && index < stageNames.length ? translate(`analysis_initial_stage_${index + 1}_short`) : '?',
    });
    const failed = input.results.find(result => result.decision === 'fail');
    if (failed) {
        return translate('analysis_failure_stage_failed', {
            ...stageParams(stageNames.indexOf(failed.toolName)), detail: failed.summary,
        });
    }
    if (input.errorText) {
        return input.stoppedStageIndex === undefined
            ? input.errorText
            : translate('analysis_failure_stopped_at', { ...stageParams(input.stoppedStageIndex), detail: input.errorText });
    }
    const lastWarned = [...input.results].reverse().find(result => result.decision === 'warn');
    if (lastWarned) {
        return translate('analysis_failure_no_result_warned', {
            ...stageParams(stageNames.indexOf(lastWarned.toolName)), detail: lastWarned.summary,
        });
    }
    return input.fallbackWarning ?? translate('analysis_failure_no_result');
};
