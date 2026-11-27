import { describe, expect, it } from 'vitest';
import type { RuntimeOutcomeEnvelope } from '../types';
import type { StoreApi } from '../services/agent/types';
import { finalizeRuntimeOutcome } from '../services/agent/runtime/runtimeFinalize';
import { createAgentTurn, completeAgentTurn } from '../services/agent/runtime/runtimeState';

const run = (retryId: string | null, isError = false) => {
    let state = {
        sessionId: 's', runtimeRunHistory: [], runtimeEvents: [], agentToolLogs: [], isBusy: true, pendingReplyRetryId: retryId,
        chatHistory: [{ id: 'a1', sender: 'ai', type: 'ai_message', text: 'first', timestamp: new Date(0) }],
    } as unknown as ReturnType<StoreApi['getState']>;
    const store: StoreApi = { getState: () => state, setState: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; } };
    const turn = completeAgentTurn(createAgentTurn('q'), 'second');
    const outcome: RuntimeOutcomeEnvelope = {
        runId: turn.runId, turnId: turn.turnId, sessionId: 's', outcomeKind: isError ? 'failed' : 'accepted', lifecycleState: isError ? 'failed' : 'completed', stage: 'finalizing',
        reason: 'x', retryable: false, eventType: isError ? 'turn_failed' : 'turn_completed', eventMessage: 'second', assistantMessage: 'second', assistantMessageIsError: isError,
        assistantTelemetry: { durationMs: 5 },
    };
    finalizeRuntimeOutcome({ store, turn, outcome });
    return store.getState();
};

describe('retry finalization', () => {
    it('stores the new answer as a version of the retried bubble', () => {
        const state = run('a1');
        expect(state.chatHistory).toHaveLength(1);
        expect(state.chatHistory[0]).toMatchObject({ text: 'second', versionIndex: 1, telemetry: { durationMs: 5 } });
        expect(state.chatHistory[0].versions).toHaveLength(2);
        expect(state.pendingReplyRetryId).toBeNull();
    });
    it('appends a normal bubble without a retry target', () => {
        expect(run(null).chatHistory).toHaveLength(2);
    });
    it('does not hide a failed retry inside the versions', () => {
        const state = run('a1', true);
        expect(state.chatHistory).toHaveLength(2);
        expect(state.pendingReplyRetryId).toBeNull();
    });
});
