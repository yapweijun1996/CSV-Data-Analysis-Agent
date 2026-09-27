import { describe, expect, it } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import { createAgentSlice } from '../store/slices/agentSlice';
import type { AgentTurn } from '../types';

const buildActiveTurn = (): AgentTurn => ({
    turnId: 'turn-123',
    userMessage: 'Find top customers',
    status: 'running',
    startedAt: new Date('2026-03-12T10:00:00.000Z'),
    finalMessage: null,
    pendingClarificationRequest: null,
    lastObservation: null,
    budgetStatus: {
        maxSteps: 8,
        stepsUsed: 1,
        retryCounts: {},
        exhausted: false,
    },
    steps: [
        {
            stepId: 'step-123',
            turnId: 'turn-123',
            index: 1,
            action: {
                type: 'tool_call',
                toolName: 'data.query',
                thought: 'Inspect the visible rows before answering.',
                args: {
                    explanation: 'Inspect top customers',
                    plan: {
                        select: ['customer'],
                        limit: 5,
                    },
                },
            },
            status: 'in_progress',
            startedAt: new Date('2026-03-12T10:00:01.000Z'),
        },
    ],
});

const createSliceHarness = () => {
    let state = {
        sessionId: 'session-123',
        currentDatasetId: 'dataset-123',
        activeTurn: buildActiveTurn(),
        cleaningRun: { runId: 'cleaning-run-1' },
        activeSpreadsheetFilter: { requestId: 'request-1' },
        agentToolLogs: [],
        runtimeEvents: [],
    } as unknown as AppStore;

    const setState = (partial: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = {
            ...state,
            ...next,
        };
    };

    const getState = () => state;
    const slice = createAgentSlice(setState as never, getState as never, {} as never);
    state = {
        ...state,
        ...slice,
        sessionId: 'session-123',
        currentDatasetId: 'dataset-123',
        activeTurn: buildActiveTurn(),
        cleaningRun: { runId: 'cleaning-run-1' } as AppStore['cleaningRun'],
        activeSpreadsheetFilter: { requestId: 'request-1' } as AppStore['activeSpreadsheetFilter'],
    };

    return {
        getState: () => state,
        setState,
    };
};

describe('agentSlice runtime context defaults', () => {
    it('defaults runtime events to the current session id', async () => {
        const store = createSliceHarness();

        store.getState().recordRuntimeEvent({
            turnId: 'turn-123',
            stepId: 'step-123',
            type: 'turn_started',
            message: 'Runtime turn started.',
        });
        store.getState().syncTelemetryToStore();

        expect(store.getState().runtimeEvents.at(-1)).toMatchObject({
            sessionId: 'session-123',
            turnId: 'turn-123',
            stepId: 'step-123',
        });
    });

    it('defaults tool logs to the current session, turn, and step ids', () => {
        const store = createSliceHarness();

        store.getState().logAgentToolUsage({
            tool: 'assistant_message',
            description: 'Prepared final answer.',
        });

        expect(store.getState().agentToolLogs.at(-1)).toMatchObject({
            sessionId: 'session-123',
            datasetId: 'dataset-123',
            turnId: 'turn-123',
            stepId: 'step-123',
            cleaningRunId: 'cleaning-run-1',
            requestId: 'request-1',
            tool: 'assistant_message',
        });
    });

    it('snapshots tool log detail so later mutations do not rewrite history', () => {
        const store = createSliceHarness();
        const detail = {
            parserWarnings: [{ code: 'low_confidence', message: 'warning' }],
        };

        store.getState().logAgentToolUsage({
            tool: 'workspace_builder',
            description: 'Captured debug snapshot.',
            detail,
        });

        detail.parserWarnings.length = 0;

        expect(store.getState().agentToolLogs.at(-1)?.detail).toEqual({
            parserWarnings: [{ code: 'low_confidence', message: 'warning' }],
        });
    });

    it('keeps the live activity sentinel when selecting the current memory run', () => {
        const store = createSliceHarness();
        const liveRun: AppStore['liveAgentMemoryRun'] = {
            runId: 'live-run-1',
            datasetId: 'dataset-123',
            createdAt: new Date('2026-07-26T00:00:00.000Z'),
            findings: {
                datasetFacts: null,
                columnVerdicts: [],
                explorations: [],
                warnings: [],
            },
            timeline: [],
        };
        store.setState({ liveAgentMemoryRun: liveRun });

        store.getState().selectAgentMemoryRun(null);

        expect(store.getState().agentMemoryRun).toBe(liveRun);
        expect(store.getState().selectedMemoryRunId).toBeNull();
    });
});
