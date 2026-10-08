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
    /** Stage that was running (or next to run) when the run stopped. */
    stoppedStage?: { index: number; name: string };
    totalStages: number;
    fallbackWarning?: string;
}

/**
 * One-line reason for a run that produced no trusted result: names the stage and the real cause.
 * The first warning of a run is usually an unrelated note from an earlier stage, so it is only a last resort.
 */
export const describeInitialAnalysisFailure = (input: InitialAnalysisFailureInput): string => {
    const failed = input.results.find(result => result.decision === 'fail');
    if (failed) return `Stage ${failed.toolName}: ${failed.summary}`;
    if (input.errorText) {
        const stage = input.stoppedStage
            ? `Stopped at stage ${input.stoppedStage.index + 1}/${input.totalStages} (${input.stoppedStage.name}): `
            : '';
        return `${stage}${input.errorText}`;
    }
    const lastWarned = [...input.results].reverse().find(result => result.decision === 'warn');
    if (lastWarned) return `No result passed the evidence checks. Last warning from ${lastWarned.toolName}: ${lastWarned.summary}`;
    return input.fallbackWarning ?? 'No result passed the evidence checks.';
};
