/**
 * services/agent/monitoring/silentFailureTracker.ts
 *
 * Emits a `silent_failure` AgentRuntimeEvent whenever a P0 recovery guard
 * catches an error and silently degrades rather than surfacing a hard failure.
 *
 * This makes recovery frequency observable in production:
 *   "We only see sessions that succeeded" (survivorship bias) — these events
 *   let us count how often the safety nets actually fire.
 *
 * Each event records:
 *  - component   : which subsystem caught the error
 *  - errorType   : string form of the caught value (e.g. "TypeError: ...")
 *  - recoveryAction : what the catch block did instead of crashing
 *  - userNotified : whether the user saw an error message in the UI
 */

import { extractTechnicalDetail } from '../../../utils/userErrorMessage';
import type { AgentRuntimeEvent } from '../../../types';

export interface SilentFailureContext {
    /** Subsystem that caught the error, e.g. 'ChatOrchestrator', 'AnalysisOrchestrator'. */
    component: string;
    /** What the catch block did to recover, e.g. 'fallback_summary_shown'. */
    recoveryAction: string;
    /** True when the user saw an error message in the UI as part of recovery. */
    userNotified: boolean;
    /** Optional structured detail forwarded to the event's detail field. */
    detail?: Record<string, unknown>;
}

/** Minimum store shape required — compatible with both runtime StoreApi and orchestrator StoreApi. */
export type AnyStoreWithTelemetry = {
    getState: () => {
        recordRuntimeEvent?: ((event: Omit<AgentRuntimeEvent, 'id' | 'timestamp'>) => AgentRuntimeEvent) | null;
    };
};

/**
 * Emits a `silent_failure` runtime event. Never throws — telemetry must not
 * destabilise the recovery paths it observes.
 */
export const emitSilentFailure = (
    store: AnyStoreWithTelemetry,
    error: unknown,
    context: SilentFailureContext,
): void => {
    try {
        const recorder = store.getState().recordRuntimeEvent;
        if (typeof recorder !== 'function') return;

        const errorType = extractTechnicalDetail(error);
        recorder({
            type: 'silent_failure',
            message: `[${context.component}] Silent failure recovered. Error: ${errorType}. Recovery: ${context.recoveryAction}.`,
            detail: {
                component: context.component,
                errorType,
                recoveryAction: context.recoveryAction,
                userNotified: context.userNotified,
                ...context.detail,
            },
        });
    } catch {
        // Intentionally swallowed — telemetry must never break recovery paths.
    }
};
