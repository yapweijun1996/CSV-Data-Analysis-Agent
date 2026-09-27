/**
 * Retry strategy and error classification for topic processing.
 *
 * Provides retry limits, planner feedback, and reason code mapping
 * for SQL evidence query execution failures.
 */

import { SqlAutoAnalysisError, isSqlAutoAnalysisError } from './planGenerator';
import type { TopicProcessingFailure } from './topicProcessor';

// ─── Constants ─────────────────────────────────────────────────

export const MAX_EXECUTION_ATTEMPTS = 3;
export const RETRYABLE_EXECUTION_CODES = new Set(['empty_result']);
export const SOFT_SKIP_CODES = new Set(['empty_result']);

const EXECUTION_RETRY_LIMIT_BY_CODE: Record<Extract<TopicProcessingFailure['code'], 'empty_result'>, number> = {
    empty_result: 2,
};

const EXECUTION_TYPED_REASON_BY_CODE: Record<Extract<TopicProcessingFailure['code'], 'empty_result'>, 'empty_result' | 'unsafe_chart' | 'weak_evidence'> = {
    empty_result: 'empty_result',
};

// ─── Public API ────────────────────────────────────────────────

/** Get the maximum retry attempts for a given error code. */
export const getExecutionRetryLimit = (code: SqlAutoAnalysisError['code']) =>
    EXECUTION_RETRY_LIMIT_BY_CODE[code as keyof typeof EXECUTION_RETRY_LIMIT_BY_CODE] ?? MAX_EXECUTION_ATTEMPTS;

/** Map an execution error code to a planner replan reason code. */
export const buildExecutionReplanReasonCode = (code: SqlAutoAnalysisError['code']) => {
    switch (code) {
        case 'empty_result':
            return 'replan_after_empty_result';
        default:
            return code;
    }
};

/** Map an execution error code to a typed reason code for telemetry. */
export const buildTypedExecutionReasonCode = (code: SqlAutoAnalysisError['code']) =>
    EXECUTION_TYPED_REASON_BY_CODE[code as keyof typeof EXECUTION_TYPED_REASON_BY_CODE] ?? code;

/** Build human-readable planner feedback for a specific execution error. */
export const buildPlannerFeedbackForExecutionError = (topic: string, error: SqlAutoAnalysisError) => {
    switch (error.code) {
        case 'empty_result':
            return `The previous SQL evidence query returned no rows. Rewrite the plan so it still answers "${topic}" but broadens the query enough to produce a non-empty result.`;
        default:
            return undefined;
    }
};

/** Classify an unknown error into a standardized topic processing failure. */
export const classifyTopicFailure = (error: unknown) => {
    if (isSqlAutoAnalysisError(error)) {
        return { code: error.code, message: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
        code: 'planning_invalid' as const,
        message,
    };
};
