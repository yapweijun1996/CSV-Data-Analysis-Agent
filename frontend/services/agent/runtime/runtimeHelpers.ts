/**
 * Consolidated thin runtime utilities.
 * Merged from: runtimeEvents.ts, runtimeRequestFingerprint.ts, runtimeMonitorOutcome.ts
 */

import type { AgentObservation, AgentRuntimeEvent, AiAction } from '../../../types';
import { recordMonitorEvent } from '../monitoring/monitorAgent';
import type { StoreApi } from '../types';
import { normalizeRuntimeEventPayload } from './runtimeControlPlaneContract';

// --- Runtime event recording (was runtimeEvents.ts) ---

type RuntimeEventInput = Omit<AgentRuntimeEvent, 'id' | 'timestamp'>;

export const recordRuntimeEvent = (
    store: StoreApi,
    payload: RuntimeEventInput,
): AgentRuntimeEvent | null => {
    const recorder = store.getState().recordRuntimeEvent;
    if (typeof recorder !== 'function') {
        return null;
    }
    return recorder(normalizeRuntimeEventPayload(payload));
};

// --- Request fingerprinting (was runtimeRequestFingerprint.ts) ---

type RuntimeRequestFingerprintContext = {
    sessionId?: string | null;
    datasetId?: string | null;
};

const normalizeRequestText = (message: string) =>
    message
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

export const buildRuntimeRequestFingerprint = (
    message: string,
    context?: RuntimeRequestFingerprintContext,
) => {
    const normalizedMessage = normalizeRequestText(message);
    const sessionId = String(context?.sessionId ?? '').trim() || 'no-session';
    const datasetId = String(context?.datasetId ?? '').trim() || 'no-dataset';
    return [sessionId, datasetId, normalizedMessage].join('::');
};

// --- Monitor outcome recording (was runtimeMonitorOutcome.ts) ---

const mapActionPhase = (action: AiAction) => {
    if (action.type === 'assistant_message') return 'chat' as const;
    if (action.toolName.startsWith('analysis.')) return 'planning' as const;
    if (action.toolName.startsWith('data.') || action.toolName.startsWith('workspace.') || action.toolName.startsWith('card.')) {
        return 'execution' as const;
    }
    return 'chat' as const;
};

export const recordAcceptedMonitorOutcome = (store: StoreApi, action: AiAction) => {
    recordMonitorEvent(store, { stage: 'executor_success', action, phase: mapActionPhase(action) });
};

export const recordBlockedMonitorOutcome = (
    store: StoreApi,
    action: AiAction,
    observation: AgentObservation,
) => {
    recordMonitorEvent(store, {
        stage: 'executor_blocked',
        action,
        detail: observation.summary,
        phase: mapActionPhase(action),
    });
};
