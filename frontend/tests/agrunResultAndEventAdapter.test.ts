import { describe, expect, it } from 'vitest';
import { createAgentTurn } from '../services/agent/runtime/runtimeState';
import {
    normalizeAgrunResult,
    projectAgrunResultToStore,
} from '../services/agent/runtime/agrun/resultAdapter';
import {
    createAgrunEventProjector,
    normalizeAgrunLoopEvent,
} from '../services/agent/runtime/agrun/eventAdapter';
import {
    AgrunInteractionResolutionError,
    createAgrunApprovalResumeInput,
    createAgrunInteractionResolution,
} from '../services/agent/runtime/agrun/interactionAdapter';
import { readAgrunTokenDelta } from '../services/agent/runtime/agrun/streamAdapter';
import type {
    AgrunRunAdapterContext,
    FollowUpRuntimeResult,
} from '../services/agent/runtime/agrun/types';
import type { StoreApi } from '../services/agent/types';
import { createRuntimeTestStore } from './runtimeTestStore';

const createContext = (
    store: StoreApi,
    appTurnId = 'turn-1',
): AgrunRunAdapterContext => ({
    appTurnId,
    sessionId: 'session-1',
    store,
});

describe('AGRUN-004 result normalization', () => {
    it('normalizes completed, failed, clarification, and approval results', () => {
        expect(normalizeAgrunResult({
            output: { kind: 'final_response', text: 'Done.' },
            error: null,
            runState: { runId: 'run-1', status: 'completed' },
        }, { appTurnId: 'turn-1' })).toMatchObject({
            status: 'completed',
            runtimeRunId: 'run-1',
            text: 'Done.',
        });

        expect(normalizeAgrunResult({
            output: null,
            error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out.', retryable: true },
            runState: { runId: 'run-2', status: 'failed' },
        }, { appTurnId: 'turn-2' })).toMatchObject({
            status: 'failed',
            error: {
                code: 'PROVIDER_TIMEOUT',
                message: 'Timed out.',
                retryable: true,
            },
        });

        expect(normalizeAgrunResult({
            output: { kind: 'clarification', question: 'Which town?' },
            error: null,
            runState: { runId: 'run-3', status: 'completed' },
        }, { appTurnId: 'turn-3' })).toMatchObject({
            status: 'blocked',
            pendingInteraction: {
                kind: 'clarification',
                prompt: 'Which town?',
            },
        });

        expect(normalizeAgrunResult({
            output: {
                kind: 'approval_required',
                text: 'Approval required.',
                pendingApproval: {
                    actionName: 'host_data_mutate',
                    reason: 'Allow this action?',
                    resumeToken: { opaque: true },
                },
            },
            error: null,
            runState: { runId: 'run-4', status: 'blocked' },
        }, { appTurnId: 'turn-4' })).toMatchObject({
            status: 'blocked',
            pendingInteraction: {
                kind: 'approval',
                actionName: 'host_data_mutate',
                prompt: 'Allow this action?',
                resumeToken: { opaque: true },
            },
        });
    });

    it('fails visibly for malformed or unknown terminal envelopes', () => {
        expect(normalizeAgrunResult(null, { appTurnId: 'turn-1' })).toMatchObject({
            status: 'failed',
            error: { code: 'agrun_result_invalid' },
        });
        expect(normalizeAgrunResult({
            output: null,
            error: null,
            runState: { runId: 'run-1', status: 'running' },
        }, { appTurnId: 'turn-1' })).toMatchObject({
            status: 'failed',
            error: { code: 'agrun_result_invalid' },
        });
    });

    it('accepts an already-normalized adapter failure for terminal projection', () => {
        const failure: FollowUpRuntimeResult = {
            status: 'cancelled',
            appTurnId: 'turn-1',
        };
        expect(normalizeAgrunResult(failure, { appTurnId: 'turn-1' })).toBe(failure);
    });
});

describe('AGRUN-004 result projection', () => {
    it('projects completion once, clears busy state, and appends the final message', () => {
        const turn = {
            ...createAgentTurn('Summarize the data.'),
            turnId: 'turn-1',
        };
        const store = createRuntimeTestStore({
            activeTurn: turn,
            isBusy: true,
            chatLifecycleState: 'running',
        } as never) as unknown as StoreApi;
        const result: FollowUpRuntimeResult = {
            status: 'completed',
            appTurnId: 'turn-1',
            runtimeRunId: 'agrun-run-1',
            text: 'The summary is ready.',
        };
        const context = createContext(store);

        projectAgrunResultToStore(result, context);
        projectAgrunResultToStore(result, context);

        expect(store.getState().activeTurn?.status).toBe('completed');
        expect(store.getState().isBusy).toBe(false);
        expect(store.getState().chatLifecycleState).toBe('completed');
        expect(store.getState().chatHistory).toHaveLength(1);
        expect(store.getState().chatHistory[0]?.text).toBe('The summary is ready.');
        expect(store.getState().runtimeRunHistory).toHaveLength(1);
    });

    it('does not confuse a restarted Agrun run id with a different app turn', () => {
        const firstTurn = {
            ...createAgentTurn('First question.'),
            turnId: 'turn-first',
        };
        const store = createRuntimeTestStore({
            activeTurn: firstTurn,
            isBusy: true,
            chatLifecycleState: 'running',
        } as never) as unknown as StoreApi;

        projectAgrunResultToStore({
            status: 'completed',
            appTurnId: 'turn-first',
            runtimeRunId: 'run-1',
            text: 'First answer.',
        }, createContext(store, 'turn-first'));

        const secondTurn = {
            ...createAgentTurn('Second question.'),
            turnId: 'turn-second',
        };
        store.setState({
            activeTurn: secondTurn,
            isBusy: true,
            chatLifecycleState: 'running',
            streamingMessage: {
                text: 'Second answer.',
                isStreaming: true,
                startedAt: new Date(),
            },
        });

        projectAgrunResultToStore({
            status: 'completed',
            appTurnId: 'turn-second',
            runtimeRunId: 'run-1',
            text: 'Second answer.',
        }, createContext(store, 'turn-second'));

        expect(store.getState().activeTurn?.status).toBe('completed');
        expect(store.getState().streamingMessage).toBeNull();
        expect(store.getState().chatHistory.map(message => message.text)).toEqual([
            'First answer.',
            'Second answer.',
        ]);
        expect(store.getState().runtimeRunHistory).toHaveLength(2);
    });

    it('projects clarification as a non-busy blocked turn with resume context', () => {
        const turn = {
            ...createAgentTurn('Compare towns.'),
            turnId: 'turn-2',
        };
        const store = createRuntimeTestStore({
            activeTurn: turn,
            isBusy: true,
            chatLifecycleState: 'running',
        } as never) as unknown as StoreApi;
        const result: FollowUpRuntimeResult = {
            status: 'blocked',
            appTurnId: 'turn-2',
            runtimeRunId: 'agrun-run-2',
            pendingInteraction: {
                kind: 'clarification',
                prompt: 'Which towns should I compare?',
            },
        };

        projectAgrunResultToStore(result, createContext(store, 'turn-2'));

        expect(store.getState().activeTurn?.status).toBe('waiting_for_clarification');
        expect(store.getState().pendingClarification?.question).toBe('Which towns should I compare?');
        expect(store.getState().pendingClarification?.interactionKind).toBe('clarification');
        expect(store.getState().pendingClarification?.resumeContext?.followUpRuntimeInteraction).toMatchObject({
            owner: 'agrun',
            kind: 'clarification',
            sessionId: 'session-1',
            turnId: 'turn-2',
        });
        expect(store.getState().isBusy).toBe(false);
        expect(store.getState().chatLifecycleState).toBe('blocked');
        expect(store.getState().chatHistory[0]).toMatchObject({
            type: 'ai_clarification',
            text: 'Which towns should I compare?',
        });
    });

    it('projects approval as Approve/Deny UI without exposing token semantics', () => {
        const turn = {
            ...createAgentTurn('Inspect the workspace.'),
            turnId: 'turn-approval',
        };
        const store = createRuntimeTestStore({
            activeTurn: turn,
            isBusy: true,
            chatLifecycleState: 'running',
        } as never) as unknown as StoreApi;
        const resumeToken = { opaque: 'token' };
        const result: FollowUpRuntimeResult = {
            status: 'blocked',
            appTurnId: 'turn-approval',
            runtimeRunId: 'agrun-run-approval',
            pendingInteraction: {
                kind: 'approval',
                prompt: 'Allow the read-only action?',
                resumeToken,
            },
        };

        projectAgrunResultToStore(result, createContext(store, 'turn-approval'));

        expect(store.getState().pendingClarification).toMatchObject({
            interactionKind: 'approval',
            options: [
                { label: 'Approve', value: 'approve' },
                { label: 'Deny', value: 'deny' },
            ],
            allowFreeText: false,
            clarificationMode: 'options',
        });
        expect(
            store.getState().pendingClarification
                ?.resumeContext
                ?.followUpRuntimeInteraction
                ?.resumeToken,
        ).toBe(resumeToken);
        expect(store.getState().chatHistory).toHaveLength(1);
    });

    it('replaces the internal mutation alias with a localized approval prompt', () => {
        const turn = {
            ...createAgentTurn('Clean the dataset.'),
            turnId: 'turn-mutation-approval',
        };
        const baselineSettings = createRuntimeTestStore().getState().settings;
        const store = createRuntimeTestStore({
            activeTurn: turn,
            isBusy: true,
            chatLifecycleState: 'running',
            settings: {
                ...baselineSettings,
                language: 'Mandarin',
            },
        } as never) as unknown as StoreApi;
        const result: FollowUpRuntimeResult = {
            status: 'blocked',
            appTurnId: 'turn-mutation-approval',
            pendingInteraction: {
                kind: 'approval',
                actionName: 'host_data_mutate',
                prompt: 'Action "host_data_mutate" requires approval.',
                resumeToken: { opaque: true },
            },
        };

        projectAgrunResultToStore(
            result,
            createContext(store, 'turn-mutation-approval'),
        );

        expect(store.getState().pendingClarification?.question).toBe(
            '是否批准对当前数据集进行这项永久更改？',
        );
        expect(store.getState().pendingClarification?.question).not.toContain(
            'host_data_mutate',
        );
    });
});

describe('AGRUN-005 streaming and AGRUN-006 interaction mapping', () => {
    it('accepts only explicit text-bearing token delta shapes', () => {
        expect(readAgrunTokenDelta('Hello')).toBe('Hello');
        expect(readAgrunTokenDelta({ delta: ' world' })).toBe(' world');
        expect(readAgrunTokenDelta({ internal: { secret: true } })).toBe('');
    });

    it('maps approval selections to the exact Agrun approval resolution envelope', () => {
        const resumeToken = { opaque: true };
        const clarification = {
            question: 'Approve?',
            options: [
                { label: 'Approve', value: 'approve' },
                { label: 'Deny', value: 'deny' },
            ],
            interactionKind: 'approval' as const,
            resumeContext: {
                followUpRuntimeInteraction: {
                    owner: 'agrun' as const,
                    kind: 'approval' as const,
                    sessionId: 'session-1',
                    turnId: 'turn-1',
                    runtimeRunId: 'run-1',
                    resumeToken,
                },
            },
        };

        const resolution = createAgrunInteractionResolution({
            clarification,
            choice: { label: 'Approve', value: 'approve' },
        });

        expect(resolution).toEqual({
            kind: 'approval',
            sessionId: 'session-1',
            turnId: 'turn-1',
            decision: 'approve',
            resumeToken,
            signal: undefined,
        });
        if (resolution.kind !== 'approval') {
            throw new Error('Expected an approval resolution.');
        }
        expect(createAgrunApprovalResumeInput(resolution)).toEqual({
            type: 'approval_resolution',
            decision: 'approve',
            resumeToken,
        });
    });

    it('rejects stale and invalid interaction selections before runtime resume', () => {
        expect(() => createAgrunInteractionResolution({
            clarification: {
                question: 'Old request',
                options: [],
            },
            choice: { label: 'Continue', value: 'continue' },
        })).toThrow(AgrunInteractionResolutionError);

        expect(() => createAgrunInteractionResolution({
            clarification: {
                question: 'Approve?',
                options: [],
                resumeContext: {
                    followUpRuntimeInteraction: {
                        owner: 'agrun',
                        kind: 'approval',
                        sessionId: 'session-1',
                        turnId: 'turn-1',
                        resumeToken: { opaque: true },
                    },
                },
            },
            choice: { label: 'Maybe', value: 'maybe' },
        })).toThrow(/Approve or Deny/);
    });
});

describe('AGRUN-004 event projection', () => {
    it('normalizes closed and native Agrun event spellings', () => {
        expect(normalizeAgrunLoopEvent({
            type: 'phase-decide-started',
            detail: { cycle: 1 },
        })).toMatchObject({
            type: 'phase',
            phase: 'decide',
            transition: 'started',
        });
        expect(normalizeAgrunLoopEvent({
            type: 'action-executing',
            detail: { actionName: 'data.query' },
        })).toMatchObject({
            type: 'tool_start',
            sourceType: 'action-executing',
        });
    });

    it('projects known events once and keeps unknown events in debug telemetry', () => {
        const store = createRuntimeTestStore() as unknown as StoreApi;
        const context = createContext(store);
        const projector = createAgrunEventProjector();
        const known = {
            type: 'action-executing',
            detail: { actionName: 'data.query', callId: 'call-1' },
        };

        projector.project(known, context);
        projector.project(known, context);
        projector.project({
            type: 'native-internal-step',
            detail: { secretToken: 'hidden' },
        }, context);

        expect(store.getState().runtimeEvents).toHaveLength(1);
        expect(store.getState().runtimeEvents[0]).toMatchObject({
            type: 'decision_received',
            turnId: 'turn-1',
            toolCallId: 'call-1',
            detail: {
                agrunEventType: 'action-executing',
                source: 'agrun_event_adapter',
            },
        });
        expect(store.getState().logTelemetryEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                responseType: 'agrun_event_unmapped',
                detail: 'native-internal-step',
            }),
        );
    });

    it('silently ignores token-level provider events already handled by streaming', () => {
        const store = createRuntimeTestStore() as unknown as StoreApi;
        const context = createContext(store);
        const projector = createAgrunEventProjector();

        projector.project({ type: 'provider-text-delta', detail: { delta: 'A' } }, context);
        projector.project({ type: 'provider-reasoning-delta', detail: { delta: 'B' } }, context);

        expect(store.getState().runtimeEvents).toHaveLength(0);
        expect(store.getState().logTelemetryEvent).not.toHaveBeenCalled();
    });
});
