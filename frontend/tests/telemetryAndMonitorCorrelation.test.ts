import { describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { createTelemetrySlice } from '../store/slices/telemetrySlice';
import { recordMonitorEvent } from '../services/agent/monitoring/monitorAgent';
import { createWorkerDiagnosticsTelemetryReporter } from '../services/workers/workerDiagnostics';

const createStoreHarness = () => {
    let state = {
        sessionId: 'session-123',
        currentDatasetId: 'dataset-123',
        activeTurn: {
            turnId: 'turn-123',
            steps: [{ stepId: 'step-123' }],
        },
        cleaningRun: {
            runId: 'cleaning-run-123',
        },
        activeSpreadsheetFilter: {
            requestId: 'request-123',
        },
        telemetryEvents: [],
        settings: {
            provider: 'google',
        },
        addProgress: vi.fn(),
        recordAgentEvent: vi.fn(),
    } as unknown as AppStore;

    const setState = (partial: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = {
            ...state,
            ...next,
        };
    };

    const getState = () => state;
    const telemetrySlice = createTelemetrySlice(setState as never, getState as never, {} as never);
    state = {
        ...state,
        ...telemetrySlice,
    };

    return {
        getState,
    };
};

describe('telemetry correlation defaults', () => {
    it('injects correlation fields into telemetry events', () => {
        const store = createStoreHarness();

        store.getState().logTelemetryEvent({
            stage: 'context_prepared',
            responseType: 'planner',
            detail: 'Prepared planner context.',
        });
        store.getState().syncTelemetryEventsToStore();

        expect(store.getState().telemetryEvents.at(-1)).toMatchObject({
            sessionId: 'session-123',
            datasetId: 'dataset-123',
            turnId: 'turn-123',
            stepId: 'step-123',
            cleaningRunId: 'cleaning-run-123',
            requestId: 'request-123',
        });
    });
});

describe('recordMonitorEvent phase propagation', () => {
    it('emits monitor events with the provided phase instead of hardcoded chat', () => {
        const store = createStoreHarness();

        recordMonitorEvent({
            getState: store.getState,
            setState: vi.fn(),
        }, {
            stage: 'executor_success',
            phase: 'execution',
            action: {
                type: 'tool_call',
                toolName: 'data.query',
                thought: 'Check rows',
                args: {},
            },
        });

        expect(store.getState().recordAgentEvent).toHaveBeenCalledWith(expect.objectContaining({
            phase: 'execution',
            sessionId: 'session-123',
            datasetId: 'dataset-123',
            cleaningRunId: 'cleaning-run-123',
        }));
    });
});

describe('worker diagnostics telemetry reporter', () => {
    it('writes diagnostics into telemetry events with correlation and meta payload', () => {
        const store = createStoreHarness();
        const reporter = createWorkerDiagnosticsTelemetryReporter({
            getState: store.getState,
            setState: vi.fn(),
        });

        reporter({
            workerFamily: 'data',
            task: 'executeDataQuery',
            phase: 'success',
            requestId: 7,
            payloadBytes: 2048,
            resultBytes: 4096,
            roundTripMs: 73,
            handlerMs: 11,
            rowCount: 1000,
            columnCount: 5,
            returnedRows: 200,
            totalMatchedRows: 300,
            selectedColumnCount: 5,
            truncated: true,
        });
        store.getState().syncTelemetryEventsToStore();

        expect(store.getState().telemetryEvents.at(-1)).toMatchObject({
            stage: 'worker_diagnostics',
            responseType: 'data.executeDataQuery',
            sessionId: 'session-123',
            datasetId: 'dataset-123',
            turnId: 'turn-123',
            stepId: 'step-123',
            cleaningRunId: 'cleaning-run-123',
            requestId: 'request-123',
            meta: expect.objectContaining({
                workerFamily: 'data',
                task: 'executeDataQuery',
                workerRequestId: 7,
                payloadBytes: 2048,
                resultBytes: 4096,
                returnedRows: 200,
                totalMatchedRows: 300,
            }),
        });
    });
});
