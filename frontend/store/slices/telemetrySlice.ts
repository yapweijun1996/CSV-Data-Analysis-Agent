import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { TelemetryEvent } from '../../types';
import type { AgentStage } from '../../services/agent/types';
import { buildCorrelationFields } from '../../services/agent/correlation';
import { createId } from '../../utils/createId';

const MAX_TELEMETRY_EVENTS = 200;
const TELEMETRY_FLUSH_INTERVAL_MS = 500;

export interface ITelemetrySlice {
    telemetryEvents: TelemetryEvent[];
    logTelemetryEvent: (event: {
        stage: AgentStage;
        responseType: string;
        detail?: string;
        chunkSize?: number;
        meta?: Record<string, unknown>;
        sessionId?: string;
        datasetId?: string | null;
        runId?: string;
        turnId?: string;
        stepId?: string;
        toolCallId?: string;
        cleaningRunId?: string;
        requestId?: string;
    }) => void;
    clearTelemetry: () => void;
    syncTelemetryEventsToStore: () => void;
}

// Shadow buffer — avoids immediate setState on every telemetry event.
// Events are committed to the Zustand store only when a debug modal is open.
let shadowTelemetryEvents: TelemetryEvent[] | null = null;
let pendingTelemetryEvents: TelemetryEvent[] = [];
let telemetryEventsFlushTimer: ReturnType<typeof setTimeout> | null = null;

export const createTelemetrySlice: StateCreator<AppStore, [], [], ITelemetrySlice> = (set, get) => ({
    telemetryEvents: [],

    logTelemetryEvent: (eventInput) => {
        const { stage, responseType, detail, chunkSize, meta } = eventInput;
        const provider = get().settings.provider;
        const correlation = buildCorrelationFields(get(), eventInput);
        const event: TelemetryEvent = {
            id: createId('telemetry'),
            provider,
            stage,
            responseType,
            detail,
            chunkSize,
            // meta values from worker diagnostics are already plain primitives —
            // skip the expensive toSerializable deep-clone.
            meta: meta ?? undefined,
            timestamp: new Date(),
            sessionId: correlation.sessionId,
            datasetId: correlation.datasetId,
            runId: correlation.runId,
            turnId: correlation.turnId,
            stepId: correlation.stepId,
            toolCallId: correlation.toolCallId,
            cleaningRunId: correlation.cleaningRunId,
            requestId: correlation.requestId,
        };

        // Buffer the event — no immediate setState.
        pendingTelemetryEvents.push(event);

        // Schedule a debounced flush that only commits to the store when a
        // debug modal is open (same pattern as agentSlice telemetry).
        if (telemetryEventsFlushTimer !== null) return;
        telemetryEventsFlushTimer = setTimeout(() => {
            telemetryEventsFlushTimer = null;
            const batch = pendingTelemetryEvents.splice(0);
            if (batch.length === 0) return;

            // Lazy-init shadow from store.
            if (shadowTelemetryEvents === null) {
                shadowTelemetryEvents = get().telemetryEvents ?? [];
            }
            shadowTelemetryEvents = [...shadowTelemetryEvents, ...batch].slice(-MAX_TELEMETRY_EVENTS);

            // Only commit when a debug modal is open.
            const state = get();
            if (!state.isDebugLogsModalOpen && !state.isAgentModalOpen) return;

            set(() => ({ telemetryEvents: shadowTelemetryEvents! }));
        }, TELEMETRY_FLUSH_INTERVAL_MS);
    },

    clearTelemetry: () => {
        shadowTelemetryEvents = [];
        pendingTelemetryEvents = [];
        set({ telemetryEvents: [] });
    },

    syncTelemetryEventsToStore: () => {
        const batch = pendingTelemetryEvents.splice(0);
        if (shadowTelemetryEvents === null) {
            shadowTelemetryEvents = get().telemetryEvents ?? [];
        }
        if (batch.length > 0) {
            shadowTelemetryEvents = [...shadowTelemetryEvents, ...batch].slice(-MAX_TELEMETRY_EVENTS);
        }
        set(() => ({ telemetryEvents: shadowTelemetryEvents! }));
    },
});
