import type { ContextTelemetryTarget } from '../../ai/contextManager';

export const PLANNER_STABILITY_REASON_CODES = {
    intentMismatchRecovered: 'intent_mismatch_recovered',
    presentationTimeoutFallback: 'presentation_timeout_fallback',
    tableForcedByValueGate: 'table_forced_by_value_gate',
    plannerDegradedNonBlocking: 'planner_degraded_non_blocking',
} as const;

export type PlannerStabilityReasonCode =
    typeof PLANNER_STABILITY_REASON_CODES[keyof typeof PLANNER_STABILITY_REASON_CODES];

export const PLANNER_STABILITY_REASON_CODE_SET = new Set<PlannerStabilityReasonCode>(
    Object.values(PLANNER_STABILITY_REASON_CODES),
);

export const isPlannerStabilityReasonCode = (value: unknown): value is PlannerStabilityReasonCode =>
    typeof value === 'string' && PLANNER_STABILITY_REASON_CODE_SET.has(value as PlannerStabilityReasonCode);

export const logPlannerStabilitySignal = (
    telemetryTarget: Pick<ContextTelemetryTarget, 'logTelemetryEvent'> | undefined,
    reasonCode: PlannerStabilityReasonCode,
    detail: string,
    meta?: Record<string, unknown>,
) => telemetryTarget?.logTelemetryEvent?.({
    stage: 'planner_ready',
    responseType: 'planner_stability_signal',
    detail,
    meta: {
        reasonCode,
        ...(meta?.reasonCodes ? {} : { reasonCodes: [reasonCode] }),
        ...(meta ?? {}),
    },
});
