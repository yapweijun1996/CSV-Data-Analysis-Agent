import type { RuntimeEventContractDetail } from '../../types';

export type TraceContractSeverity = 'neutral' | 'warning' | 'error';

export interface TraceContractSummary {
    contractVersion: string;
    reasonCode: string | null;
    retryClass: string | null;
    failureClass: string | null;
    abortMode: string | null;
    abortSource: string | null;
    abortPropagationStatus: string | null;
    source: string | null;
    timeoutReason: string | null;
    severity: TraceContractSeverity;
}

export const summarizeTraceContract = (
    traceContract: RuntimeEventContractDetail | null | undefined,
): TraceContractSummary | null => {
    if (!traceContract) {
        return null;
    }

    const failureClass = typeof traceContract.failureClass === 'string' ? traceContract.failureClass : null;
    const retryClass = typeof traceContract.retryClass === 'string' ? traceContract.retryClass : null;
    const abortMode = typeof traceContract.abortMode === 'string' ? traceContract.abortMode : null;
    const severity: TraceContractSeverity = failureClass
        ? 'error'
        : abortMode || retryClass || typeof traceContract.timeoutReason === 'string'
            ? 'warning'
            : 'neutral';

    return {
        contractVersion: traceContract.contractVersion,
        reasonCode: typeof traceContract.reasonCode === 'string' ? traceContract.reasonCode : null,
        retryClass,
        failureClass,
        abortMode,
        abortSource: typeof traceContract.abortSource === 'string' ? traceContract.abortSource : null,
        abortPropagationStatus: typeof traceContract.abortPropagationStatus === 'string' ? traceContract.abortPropagationStatus : null,
        source: typeof traceContract.source === 'string' ? traceContract.source : null,
        timeoutReason: typeof traceContract.timeoutReason === 'string' ? traceContract.timeoutReason : null,
        severity,
    };
};
