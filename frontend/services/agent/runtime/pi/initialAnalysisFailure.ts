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

const codeKey = (code: string): string => {
    // Codes with a dynamic suffix (`evidence_run_<status>`, `query_engine_<status>`) share one message.
    if (code.startsWith('evidence_run_') && code !== 'evidence_run_incomplete') return 'analysis_failure_code_evidence_run_incomplete';
    if (code.startsWith('query_engine_')) return 'analysis_failure_code_query_engine_unavailable';
    return `analysis_failure_code_${code}`;
};

interface FailureStageResult {
    decision: 'pass' | 'warn' | 'fail';
    toolName: string;
    summary: string;
}

export interface InitialAnalysisFailureInput {
    results: readonly (FailureStageResult & { warningCodes?: readonly string[] })[];
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
    // The stage's own warning code maps to a localised reason; unknown codes keep the runtime's English summary.
    const detailOf = (result: { summary: string; warningCodes?: readonly string[] }): string => {
        for (const code of result.warningCodes ?? []) {
            const key = codeKey(code);
            const text = translate(key);
            if (text !== key) return text;
        }
        return result.summary;
    };
    const failed = input.results.find(result => result.decision === 'fail');
    if (failed) {
        return translate('analysis_failure_stage_failed', {
            ...stageParams(stageNames.indexOf(failed.toolName)), detail: detailOf(failed),
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
            ...stageParams(stageNames.indexOf(lastWarned.toolName)), detail: detailOf(lastWarned),
        });
    }
    return input.fallbackWarning ?? translate('analysis_failure_no_result');
};
