import { StoreApi, MonitorPayload } from '../types';
import { emitAgentEvent } from './agentMonitor';
import { buildCorrelationFields } from '../correlation';

const LOG_PREFIX = '[MonitorAgent]';

export const recordMonitorEvent = (store: StoreApi, payload: MonitorPayload) => {
    const { stage, action, detail, isError, phase } = payload;
    const actionLabel = action.type === 'assistant_message'
        ? 'assistant_message'
        : (typeof action.toolName === 'string' && action.toolName.trim() ? action.toolName : 'unknown_tool');
    const message = `${stage.toUpperCase()} | ${actionLabel}${detail ? ` | ${detail}` : ''}`;
    const state = store.getState();
    const correlation = buildCorrelationFields(state, payload);
    if (state.logTelemetryEvent) {
        state.logTelemetryEvent({
            stage,
            responseType: actionLabel,
            detail,
            chunkSize: payload.chunkSize,
            sessionId: correlation.sessionId,
            datasetId: correlation.datasetId,
            turnId: correlation.turnId,
            stepId: correlation.stepId,
            cleaningRunId: correlation.cleaningRunId,
            requestId: correlation.requestId,
        });
    }
    if (isError) {
        console.error(`${LOG_PREFIX} ${message}`);
        state.addProgress(`Agent error: ${detail || 'Unknown issue'}`, 'error');
    } else {
        console.log(`${LOG_PREFIX} ${message}`);
    }
    emitAgentEvent(store, {
        phase: phase ?? 'chat',
        step: stage,
        status: isError ? 'error' : stage.endsWith('start') ? 'in_progress' : 'done',
        message,
        detail: { action: actionLabel },
        sessionId: correlation.sessionId,
        datasetId: correlation.datasetId,
        turnId: correlation.turnId,
        stepId: correlation.stepId,
        cleaningRunId: correlation.cleaningRunId,
        requestId: correlation.requestId,
    });
};
