
import type { AgentEvent, AgentRuntimeEvent, AgentToolLogEntry } from '../../types';
import { createId } from '../../utils/createId';
import { toSerializable } from '../../utils/serializable';
import { normalizeAgentActivityEvent } from '../../services/agent/activity/agentActivity';

/* ── Factory functions ──────────────────────────────────── */

export const createEventObject = (
    event: Omit<AgentEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: Date },
): AgentEvent => normalizeAgentActivityEvent({
    id: event.id ?? createId('agent-event'),
    timestamp: event.timestamp ?? new Date(),
    phase: event.phase,
    step: event.step,
    status: event.status,
    message: event.message,
    detail: event.detail ? toSerializable(event.detail) : event.detail,
    sessionId: event.sessionId,
    datasetId: event.datasetId,
    runId: event.runId,
    turnId: event.turnId,
    stepId: event.stepId,
    toolCallId: event.toolCallId,
    cleaningRunId: event.cleaningRunId,
    requestId: event.requestId,
    activity: event.activity,
});

export const createToolLogEntry = (
    entry: Omit<AgentToolLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: Date },
): AgentToolLogEntry => ({
    id: entry.id ?? createId('agent-tool'),
    timestamp: entry.timestamp ?? new Date(),
    sessionId: entry.sessionId,
    datasetId: entry.datasetId,
    runId: entry.runId,
    turnId: entry.turnId,
    stepId: entry.stepId,
    toolCallId: entry.toolCallId,
    cleaningRunId: entry.cleaningRunId,
    requestId: entry.requestId,
    tool: entry.tool,
    description: entry.description,
    detail: entry.detail ? toSerializable(entry.detail) : entry.detail,
    stage: entry.stage,
    category: entry.category,
    risk: entry.risk,
    policyDecision: entry.policyDecision,
    policyReason: entry.policyReason,
});

export const createRuntimeEventObject = (
    event: Omit<AgentRuntimeEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: Date },
): AgentRuntimeEvent => ({
    id: event.id ?? createId('runtime-event'),
    timestamp: event.timestamp ?? new Date(),
    sessionId: event.sessionId,
    runId: event.runId,
    turnId: event.turnId,
    stepId: event.stepId,
    toolCallId: event.toolCallId,
    type: event.type,
    stage: event.stage,
    reason: event.reason,
    retryable: event.retryable,
    failureClass: event.failureClass,
    message: event.message,
    detail: event.detail,
});

/* ── Telemetry write buffering ──────────────────────────── */
// Agent events and runtime events are high-frequency telemetry that don't need
// to trigger a React re-render on every single write. Buffer them and flush
// to the store on a debounced schedule (200ms). This eliminates ~30 store
// mutations per card generation while preserving event ordering and completeness.
//
// Optimization: only commit to the Zustand store (triggering subscriber
// re-evaluation) when a debug modal is actually open. Otherwise, accumulate
// in module-level shadow arrays. When a modal opens, it calls
// `flushTelemetryToStore()` to sync the shadow arrays into the store.

const TELEMETRY_FLUSH_INTERVAL_MS = 200;
const MAX_AGENT_EVENTS_LIMIT = 200; // mirrors trimAgentEvents cap
const MAX_RUNTIME_EVENTS = 120;

export let pendingAgentEvents: AgentEvent[] = [];
export let pendingRuntimeEvents: AgentRuntimeEvent[] = [];
let telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null;

// Shadow arrays — always up-to-date, no React cost.
// Lazily initialized from the store on first flush to pick up any persisted events.
let shadowAgentEvents: AgentEvent[] | null = null;
let shadowRuntimeEvents: AgentRuntimeEvent[] | null = null;

export const scheduleTelemetryFlush = (
    set: (fn: (state: any) => any) => void,
    get: () => any,
) => {
    if (telemetryFlushTimer !== null) return; // already scheduled
    telemetryFlushTimer = setTimeout(() => {
        telemetryFlushTimer = null;
        const agentBatch = pendingAgentEvents.splice(0);
        const runtimeBatch = pendingRuntimeEvents.splice(0);
        if (agentBatch.length === 0 && runtimeBatch.length === 0) return;

        // Lazily initialize shadow arrays from the store (picks up persisted events).
        const state = get();
        if (shadowAgentEvents === null) shadowAgentEvents = state.agentEvents ?? [];
        if (shadowRuntimeEvents === null) shadowRuntimeEvents = state.runtimeEvents ?? [];

        // Always update shadow arrays (cheap, no React).
        if (agentBatch.length > 0) {
            shadowAgentEvents = [...shadowAgentEvents, ...agentBatch].slice(-MAX_AGENT_EVENTS_LIMIT);
        }
        if (runtimeBatch.length > 0) {
            shadowRuntimeEvents = [...shadowRuntimeEvents, ...runtimeBatch].slice(-MAX_RUNTIME_EVENTS);
        }

        // Only commit to Zustand store if a debug modal is open (expensive: triggers subscribers).
        const modalOpen = state.isDebugLogsModalOpen
            || state.isAgentModalOpen
            || state.isDataPreparationModalOpen;
        if (!modalOpen) return;

        set(() => ({
            ...(agentBatch.length > 0 ? { agentEvents: shadowAgentEvents } : {}),
            ...(runtimeBatch.length > 0 ? { runtimeEvents: shadowRuntimeEvents } : {}),
        }));
    }, TELEMETRY_FLUSH_INTERVAL_MS);
};

/** Sync shadow telemetry arrays into the store. Call when a debug modal opens. */
export const flushTelemetryToStore = (
    set: (fn: (state: any) => any) => void,
    get?: () => any,
) => {
    // Also drain any still-pending events.
    const agentBatch = pendingAgentEvents.splice(0);
    const runtimeBatch = pendingRuntimeEvents.splice(0);
    // Lazy init if needed.
    if (shadowAgentEvents === null) shadowAgentEvents = get?.().agentEvents ?? [];
    if (shadowRuntimeEvents === null) shadowRuntimeEvents = get?.().runtimeEvents ?? [];
    if (agentBatch.length > 0) {
        shadowAgentEvents = [...shadowAgentEvents, ...agentBatch].slice(-MAX_AGENT_EVENTS_LIMIT);
    }
    if (runtimeBatch.length > 0) {
        shadowRuntimeEvents = [...shadowRuntimeEvents, ...runtimeBatch].slice(-MAX_RUNTIME_EVENTS);
    }
    set(() => ({
        agentEvents: shadowAgentEvents,
        runtimeEvents: shadowRuntimeEvents,
    }));
};

export const resetAgentTelemetryBuffers = () => {
    if (telemetryFlushTimer !== null) {
        clearTimeout(telemetryFlushTimer);
        telemetryFlushTimer = null;
    }
    pendingAgentEvents = [];
    pendingRuntimeEvents = [];
    shadowAgentEvents = [];
    shadowRuntimeEvents = [];
};
