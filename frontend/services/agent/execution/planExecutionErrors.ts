export type PlanExecutionSoftErrorCode =
    | 'empty_result'
    | 'no_card_created'
    | 'duckdb_unavailable';

export class PlanExecutionSoftError extends Error {
    code: PlanExecutionSoftErrorCode;
    detail?: Record<string, unknown>;

    constructor(code: PlanExecutionSoftErrorCode, message: string, detail?: Record<string, unknown>) {
        super(message);
        this.name = 'PlanExecutionSoftError';
        this.code = code;
        this.detail = detail;
    }
}

export const isPlanExecutionSoftError = (value: unknown): value is PlanExecutionSoftError =>
    value instanceof PlanExecutionSoftError;
