import type {
    AgentRuntimeEvent,
    RuntimeAbortPropagationStatus,
    RuntimeAbortSource,
    RuntimeAbortMode,
    RuntimeEventContractDetail,
    RuntimeFailureClass,
    RuntimeOutcomeEnvelope,
    RuntimeRetryClass,
    RuntimeTimeoutReason,
} from '../../../types';

export const RUNTIME_EVENT_CONTRACT_VERSION = 'runtime_v1' as const;

const RETRY_CLASS_BY_FAILURE: Record<RuntimeFailureClass, RuntimeRetryClass> = {
    parse: 'parse_recovery',
    tool_policy: 'tool_policy_recovery',
    tool_contract: 'tool_contract_recovery',
    tool_execution: 'tool_execution_recovery',
    provider: 'provider_recovery',
    evaluator: 'evaluator_recovery',
    budget: 'budget_terminal',
    cancelled: 'cancelled_terminal',
};

const resolveRetryClass = ({
    retryable,
    failureClass,
    timeoutReason,
    reasonCode,
}: {
    retryable?: boolean;
    failureClass?: RuntimeFailureClass;
    timeoutReason?: RuntimeTimeoutReason;
    reasonCode?: string;
}): RuntimeRetryClass | undefined => {
    if (timeoutReason === 'model_call_timeout') {
        return retryable ? 'provider_timeout_recovery' : 'provider_recovery';
    }

    if (reasonCode === 'queue_overflow' || reasonCode === 'active_turn_running') {
        return 'queue_backpressure';
    }

    if (failureClass) {
        return RETRY_CLASS_BY_FAILURE[failureClass];
    }

    if (retryable) {
        return 'semantic_recovery';
    }

    return undefined;
};

export const buildRuntimeContractDetail = ({
    detail,
    reasonCode,
    failureClass,
    retryable,
    retryClass,
    timeoutReason,
    timeoutMs,
    abortMode,
    abortSource,
    abortPropagationStatus,
    source,
}: {
    detail?: Record<string, unknown>;
    reasonCode?: string;
    failureClass?: RuntimeFailureClass;
    retryable?: boolean;
    retryClass?: RuntimeRetryClass;
    timeoutReason?: RuntimeTimeoutReason;
    timeoutMs?: number;
    abortMode?: RuntimeAbortMode;
    abortSource?: RuntimeAbortSource | string;
    abortPropagationStatus?: RuntimeAbortPropagationStatus;
    source?: string;
}): RuntimeEventContractDetail => {
    const normalizedRetryClass = retryClass ?? resolveRetryClass({ retryable, failureClass, timeoutReason, reasonCode });
    const normalizedDetail: RuntimeEventContractDetail = {
        contractVersion: RUNTIME_EVENT_CONTRACT_VERSION,
        ...(reasonCode ? { reasonCode } : {}),
        ...(failureClass ? { failureClass } : {}),
        ...(normalizedRetryClass ? { retryClass: normalizedRetryClass } : {}),
        ...(timeoutReason ? { timeoutReason } : {}),
        ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
        ...(abortMode ? { abortMode } : {}),
        ...(abortSource ? { abortSource } : {}),
        ...(abortPropagationStatus ? { abortPropagationStatus } : {}),
        ...(source ? { source } : {}),
        ...(detail ?? {}),
    };

    return normalizedDetail;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;

const getString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const getBoolean = (value: unknown): boolean | undefined =>
    typeof value === 'boolean' ? value : undefined;

const getNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const buildSurfaceTraceContract = ({
    detail,
    reasonCode,
    failureClass,
    retryable,
    retryClass,
    timeoutReason,
    timeoutMs,
    abortMode,
    abortSource,
    abortPropagationStatus,
    source,
}: {
    detail?: unknown;
    reasonCode?: string;
    failureClass?: RuntimeFailureClass;
    retryable?: boolean;
    retryClass?: RuntimeRetryClass;
    timeoutReason?: RuntimeTimeoutReason;
    timeoutMs?: number;
    abortMode?: RuntimeAbortMode;
    abortSource?: RuntimeAbortSource | string;
    abortPropagationStatus?: RuntimeAbortPropagationStatus;
    source: string;
}): RuntimeEventContractDetail => {
    const rawDetail = asRecord(detail);
    return buildRuntimeContractDetail({
        detail: rawDetail,
        reasonCode: reasonCode ?? getString(rawDetail?.reasonCode),
        failureClass: failureClass ?? (getString(rawDetail?.failureClass) as RuntimeFailureClass | undefined),
        retryable: retryable ?? getBoolean(rawDetail?.retryable),
        retryClass: retryClass ?? (getString(rawDetail?.retryClass) as RuntimeRetryClass | undefined),
        timeoutReason: timeoutReason ?? (getString(rawDetail?.timeoutReason) as RuntimeTimeoutReason | undefined),
        timeoutMs: timeoutMs ?? getNumber(rawDetail?.timeoutMs),
        abortMode: abortMode ?? (getString(rawDetail?.abortMode) as RuntimeAbortMode | undefined),
        abortSource: abortSource ?? getString(rawDetail?.abortSource),
        abortPropagationStatus: abortPropagationStatus ?? (getString(rawDetail?.abortPropagationStatus) as RuntimeAbortPropagationStatus | undefined),
        source: getString(rawDetail?.source) ?? source,
    });
};

export const normalizeRuntimeEventPayload = (
    payload: Omit<AgentRuntimeEvent, 'id' | 'timestamp'>,
): Omit<AgentRuntimeEvent, 'id' | 'timestamp'> => ({
    ...payload,
    detail: buildRuntimeContractDetail({
        detail: payload.detail,
        reasonCode: payload.reason,
        failureClass: payload.failureClass,
        retryable: payload.retryable,
    }),
});

export const normalizeRuntimeOutcomeEnvelope = (
    outcome: RuntimeOutcomeEnvelope,
): RuntimeOutcomeEnvelope => ({
    ...outcome,
    eventDetail: buildRuntimeContractDetail({
        detail: outcome.eventDetail,
        reasonCode: outcome.reason,
        failureClass: outcome.failureClass,
        retryable: outcome.retryable,
    }),
});
