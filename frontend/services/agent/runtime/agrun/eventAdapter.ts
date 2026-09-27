/**
 * AGRUN-004: projects Agrun's closed loop-event vocabulary into the existing
 * runtime telemetry contract. Unknown native steps remain debug telemetry and
 * never become primary UI activities.
 */
import type {
    AgentRuntimeEvent,
    RuntimeStage,
} from '../../../../types';
import { buildSurfaceTraceContract } from '../runtimeControlPlaneContract';
import { recordRuntimeEvent } from '../runtimeHelpers';
import { boundAgrunValueForHost } from './actionAdapter';
import type {
    AgrunRecord,
    AgrunRunAdapterContext,
} from './types';

export type AgrunLoopEventType =
    | 'phase'
    | 'tool_start'
    | 'tool_result'
    | 'budget_warning'
    | 'repair_attempt'
    | 'circuit_breaker_tripped'
    | 'completed';

export interface NormalizedAgrunLoopEvent {
    type: AgrunLoopEventType;
    phase?: string | null;
    transition?: string | null;
    detail: AgrunRecord | null;
    sourceType: string;
}

const CLOSED_EVENT_TYPES = new Set<AgrunLoopEventType>([
    'phase',
    'tool_start',
    'tool_result',
    'budget_warning',
    'repair_attempt',
    'circuit_breaker_tripped',
    'completed',
]);
const MAX_EVENT_FINGERPRINTS = 500;
const HIGH_FREQUENCY_STREAM_EVENT_TYPES = new Set([
    'provider-text-delta',
    'provider-reasoning-delta',
]);

const asRecord = (value: unknown): AgrunRecord | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as AgrunRecord
        : null;

const readString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
};

const normalizeNativeEventType = (
    sourceType: string,
): AgrunLoopEventType | null => {
    if (CLOSED_EVENT_TYPES.has(sourceType as AgrunLoopEventType)) {
        return sourceType as AgrunLoopEventType;
    }
    if (/^phase-(observe|orient|decide|act|evaluate)-(started|completed)$/.test(sourceType)) {
        return 'phase';
    }
    if (sourceType === 'action-executing' || sourceType === 'action_executing') {
        return 'tool_start';
    }
    if ([
        'action-executed',
        'action_executed',
        'action-error',
        'action_error',
        'tool-result',
    ].includes(sourceType)) {
        return 'tool_result';
    }
    if (sourceType === 'cost-budget-warning') return 'budget_warning';
    if (sourceType === 'planner-circuit-open') return 'circuit_breaker_tripped';
    if (
        sourceType === 'repair'
        || sourceType === 'planner-invalid-action'
        || sourceType === 'planner-invalid-signal-escalated'
        || sourceType.includes('repair')
    ) {
        return 'repair_attempt';
    }
    if (sourceType === 'run-completed') return 'completed';
    return null;
};

export const normalizeAgrunLoopEvent = (
    rawEvent: unknown,
): NormalizedAgrunLoopEvent | null => {
    const event = asRecord(rawEvent);
    const sourceType = readString(event?.type);
    if (!event || !sourceType) return null;
    const type = normalizeNativeEventType(sourceType);
    if (!type) return null;

    const phaseMatch = /^phase-(observe|orient|decide|act|evaluate)-(started|completed)$/.exec(sourceType);
    const detail = asRecord(event.detail);
    return {
        type,
        phase: readString(event.phase, phaseMatch?.[1]) ?? null,
        transition: readString(detail?.transition, phaseMatch?.[2]) ?? null,
        detail,
        sourceType,
    };
};

const mapStage = (event: NormalizedAgrunLoopEvent): RuntimeStage => {
    if (event.type === 'phase') {
        if (event.phase === 'decide') return 'selecting';
        if (event.phase === 'act') return 'executing';
        if (event.phase === 'evaluate') return 'evaluating';
    }
    if (event.type === 'tool_start' || event.type === 'tool_result') return 'executing';
    if (event.type === 'repair_attempt') return 'retrying';
    if (event.type === 'completed') return 'finalizing';
    return 'evaluating';
};

const mapEventType = (
    event: NormalizedAgrunLoopEvent,
): AgentRuntimeEvent['type'] => {
    if (event.type === 'tool_start') return 'decision_received';
    if (event.type === 'tool_result') return 'action_executed';
    if (event.type === 'budget_warning' || event.type === 'circuit_breaker_tripped') {
        return 'tool_degraded';
    }
    if (event.type === 'repair_attempt') return 'retry_scheduled';
    if (event.type === 'completed') {
        const terminalKind = readString(event.detail?.terminalKind);
        return terminalKind && terminalKind !== 'done'
            ? 'turn_failed'
            : 'turn_completed';
    }
    if (event.phase === 'evaluate' && event.transition === 'started') {
        return 'evaluation_started';
    }
    if (event.phase === 'evaluate' && event.transition === 'completed') {
        return 'evaluation_completed';
    }
    return 'observation_recorded';
};

const describeEvent = (event: NormalizedAgrunLoopEvent): string => {
    const actionName = readString(
        event.detail?.actionName,
        event.detail?.toolName,
    );
    if (event.type === 'tool_start') {
        return actionName
            ? `Agent Runtime JavaScript started ${actionName}.`
            : 'Agent Runtime JavaScript started a read-only action.';
    }
    if (event.type === 'tool_result') {
        return actionName
            ? `Agent Runtime JavaScript completed ${actionName}.`
            : 'Agent Runtime JavaScript received an action result.';
    }
    if (event.type === 'phase') {
        return `Agent Runtime JavaScript ${event.phase ?? 'runtime'} phase ${event.transition ?? 'updated'}.`;
    }
    if (event.type === 'budget_warning') return 'Agent Runtime JavaScript reported a budget warning.';
    if (event.type === 'repair_attempt') return 'Agent Runtime JavaScript is repairing the current step.';
    if (event.type === 'circuit_breaker_tripped') return 'Agent Runtime JavaScript opened a circuit breaker.';
    return 'Agent Runtime JavaScript completed the run.';
};

const safeFingerprint = (
    event: NormalizedAgrunLoopEvent,
    context: AgrunRunAdapterContext,
): string => {
    try {
        return JSON.stringify([
            context.sessionId,
            context.appTurnId,
            event.sourceType,
            event.phase,
            event.transition,
            boundAgrunValueForHost(event.detail),
        ]);
    } catch {
        return `${context.sessionId}:${context.appTurnId}:${event.sourceType}`;
    }
};

export interface AgrunEventProjector {
    project(event: unknown, context: AgrunRunAdapterContext): void;
}

export const createAgrunEventProjector = (): AgrunEventProjector => {
    const seen = new Set<string>();
    const seenOrder: string[] = [];
    return {
        project(rawEvent, context) {
            const event = normalizeAgrunLoopEvent(rawEvent);
            if (!event) {
                const raw = asRecord(rawEvent);
                const sourceType = readString(raw?.type) ?? 'unknown';
                // Final prose is already projected by onToken. These
                // token-level native events can occur hundreds of times per
                // response and are intentionally excluded from diagnostics.
                if (HIGH_FREQUENCY_STREAM_EVENT_TYPES.has(sourceType)) return;
                context.store.getState().logTelemetryEvent?.({
                    stage: 'worker_diagnostics',
                    responseType: 'agrun_event_unmapped',
                    detail: sourceType,
                    sessionId: context.sessionId,
                    turnId: context.appTurnId,
                    meta: {
                        agrunEventType: sourceType,
                        agrunDetail: boundAgrunValueForHost(raw?.detail),
                    },
                });
                return;
            }

            const fingerprint = safeFingerprint(event, context);
            if (seen.has(fingerprint)) return;
            seen.add(fingerprint);
            seenOrder.push(fingerprint);
            if (seenOrder.length > MAX_EVENT_FINGERPRINTS) {
                const oldestFingerprint = seenOrder.shift();
                if (oldestFingerprint) seen.delete(oldestFingerprint);
            }

            const detail = boundAgrunValueForHost(event.detail);
            recordRuntimeEvent(context.store, {
                sessionId: context.sessionId,
                runId: readString(event.detail?.runId),
                turnId: context.appTurnId,
                toolCallId: readString(event.detail?.callId),
                type: mapEventType(event),
                stage: mapStage(event),
                reason: `agrun_${event.type}`,
                retryable: event.type === 'repair_attempt'
                    || event.type === 'budget_warning',
                message: describeEvent(event),
                detail: buildSurfaceTraceContract({
                    detail: {
                        agrunEventType: event.sourceType,
                        agrunPhase: event.phase ?? null,
                        agrunTransition: event.transition ?? null,
                        agrunDetail: detail,
                    },
                    reasonCode: `agrun_${event.type}`,
                    retryable: event.type === 'repair_attempt'
                        || event.type === 'budget_warning',
                    source: 'agrun_event_adapter',
                }),
            });
        },
    };
};
