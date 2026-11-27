import { describe, expect, it } from 'vitest';
import type { StoreApi } from '../services/agent/types';
import { beginRun, beginSessionTransition, finishRun, cancelOwnedRun } from '../services/session/sessionOwnership';
import { createAgentTask, createTaskExecutionEnvelope, restoreAgentTask, reviseAgentTaskScope,
    transitionAgentTask, type AgentTaskDefinition } from '../services/agent/runtime/pi/piTaskContract';
import { chargeTaskBudget, createTaskBudget as createTaskBudgetUnbounded, pauseTaskBudget, restoreTaskBudget, resumeTaskBudget } from '../services/agent/runtime/pi/piTaskBudget';

const digest = 'a'.repeat(64);
const definition = (): AgentTaskDefinition => ({
    goal: 'Repair the report and answer October only.', kind: 'repair',
    requiredOutputs: [{ id: 'prepared-data', kind: 'dataset', required: true }, { id: 'answer', kind: 'answer', required: true }],
    inputBindings: [{ tableId: 'table-1', datasetVersion: 'v1', relationshipSetId: 'relations-1' }],
    protectedInvariants: [{ id: 'original-source', digest }],
    scope: { digest, intentDigest: digest, answer: { requiresEvidence: true, queries: [], complete: true, unresolved: ['Metric must be resolved.'] } },
    capabilityGrants: [{ id: 'task-code', digest }],
});
const makeStore = () => {
    let state = { sessionId: 's1', datasetBundle: { relationshipSetId: 'relations-1',
        tables: [{ tableId: 'table-1', datasetVersion: 'v1' }] } } as unknown as ReturnType<StoreApi['getState']>;
    return { getState: () => state, setState: patch => {
        state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    } } satisfies StoreApi;
};
const options = { executorId: 'browser-js', executorGeneration: 'generation-1', workspaceRevision: 'workspace-1', grantRef: 'task-code' };

describe('logical Pi task foundations', () => {
    it('uses existing live ownership and rejects model-supplied identity or a forged lease', () => {
        const store = makeStore(); const lease = beginRun(store, 'follow_up', 'real-run', 'real-turn');
        const task = createAgentTask(store, lease, definition());
        expect(task).toMatchObject({ sessionId: 's1', revision: 1, status: 'queued' });
        expect(() => createAgentTask(store, lease, { ...definition(), runId: 'forged' } as never)).toThrow('task_definition_invalid');
        expect(() => createAgentTask(store, { ...lease }, definition())).toThrow();
        cancelOwnedRun(store);
        expect(() => createAgentTask(store, lease, definition())).toThrow();
    });

    it('serializes no live lease/epoch/controller and requires a fresh lease after approval or restore', () => {
        const store = makeStore(); const old = beginRun(store, 'follow_up', 'old', 'old-turn');
        let task = createAgentTask(store, old, definition());
        for (const status of ['inspecting', 'programming', 'executing', 'validating', 'awaiting_approval'] as const) {
            task = transitionAgentTask(store, task, old, status);
        }
        const charged = chargeTaskBudget(task.budget, { activeMs: 4000 });
        expect(charged.budget.used.activeMs).toBe(0);
        const saved = JSON.stringify(task);
        expect(saved).not.toMatch(/controller|signal|epoch|old-turn/);
        const restored = restoreAgentTask(JSON.parse(saved));
        expect(() => restoreAgentTask({ ...JSON.parse(saved), budget: { ...task.budget, pausedForUser: false } })).toThrow('task_checkpoint_invalid');
        expect(() => restoreAgentTask({ ...JSON.parse(saved), lease: old })).toThrow('task_checkpoint_invalid');
        finishRun(store, old);
        const current = beginRun(store, 'follow_up', 'new', 'new-turn');
        expect(() => transitionAgentTask(store, restored, old, 'committing')).toThrow();
        const resumed = transitionAgentTask(store, restored, current, 'committing');
        expect(resumed.taskId).toBe(task.taskId);
        expect(resumed.budget.used).toEqual(task.budget.used);
        expect(resumed.budget.pausedForUser).toBe(false);
        const envelope = createTaskExecutionEnvelope(store, resumed, { lease: current, toolCallId: 'real-pi-call' }, options);
        expect(envelope.context.lease).toBe(current);
        expect(envelope.context.toolCallId).toBe('real-pi-call');
    });

    it('captures each execution binding before a permitted version change without pinning the entire run', () => {
        const store = makeStore(); const lease = beginRun(store, 'follow_up', 'run', 'turn');
        const task = transitionAgentTask(store, createAgentTask(store, lease, definition()), lease, 'inspecting');
        const first = createTaskExecutionEnvelope(store, task, { lease, toolCallId: 'before-cleaning' }, options);
        store.setState({ datasetBundle: { ...store.getState().datasetBundle,
            tables: [{ ...store.getState().datasetBundle.tables[0], datasetVersion: 'v2' }] } });
        const second = createTaskExecutionEnvelope(store, task, { lease, toolCallId: 'after-cleaning' }, options);
        expect(first.inputBindings[0].datasetVersion).toBe('v1');
        expect(second.inputBindings[0].datasetVersion).toBe('v2');
        expect(first.context.lease).toBe(second.context.lease);
        expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
        expect(() => createTaskExecutionEnvelope(store, task, { lease, toolCallId: 'call' }, { ...options, runId: 'model' } as never)).toThrow();
        expect(() => createTaskExecutionEnvelope(store, task, { lease, toolCallId: 'call' }, { ...options, grantRef: 'model-grant' })).toThrow();
        beginSessionTransition(store);
        expect(() => createTaskExecutionEnvelope(store, task, { lease, toolCallId: 'late' }, options)).toThrow();
    });

    it('invalidates dependent evidence on semantic scope change while preserving intent and budgets', () => {
        const store = makeStore(); const lease = beginRun(store, 'follow_up', 'run', 'turn');
        const original = createAgentTask(store, lease, definition());
        const charged = chargeTaskBudget(original.budget, { toolCalls: 3, providerTurns: 2 });
        const task = { ...original, budget: charged.budget };
        const wording = reviseAgentTaskScope(store, task, lease, task.scope, 'Investigate and answer October only.');
        expect(wording.task.revision).toBe(task.revision);
        expect(wording.invalidated).toEqual([]);
        const revised = reviseAgentTaskScope(store, task, lease, { ...task.scope, digest: 'b'.repeat(64) });
        expect(revised.task.revision).toBe(task.revision + 1);
        expect(revised.invalidated).toEqual(['evidence', 'candidates', 'approvals']);
        expect(revised.task.budget.used).toEqual(task.budget.used);
        expect(() => reviseAgentTaskScope(store, task, lease, { ...task.scope, intentDigest: 'c'.repeat(64) })).toThrow('task_intent_change_requires_clarification');
        expect(() => reviseAgentTaskScope(store, task, lease, { ...task.scope,
            answer: { ...task.scope.answer, complete: false } })).toThrow('task_scope_digest_mismatch');
    });

    it('rejects vacuous outputs, skipped validation, terminal resurrection and foreign-session tasks', () => {
        const store = makeStore(); const lease = beginRun(store, 'follow_up', 'run', 'turn');
        expect(() => createAgentTask(store, lease, { ...definition(), requiredOutputs: [] })).toThrow();
        const task = createAgentTask(store, lease, definition());
        expect(() => transitionAgentTask(store, task, lease, 'completed')).toThrow('task_transition_invalid');
        const cancelled = transitionAgentTask(store, task, lease, 'cancelled');
        expect(() => transitionAgentTask(store, cancelled, lease, 'inspecting')).toThrow();
        expect(() => transitionAgentTask(store, { ...task, sessionId: 'foreign' }, lease, 'inspecting')).toThrow('task_session_mismatch');
    });
});

describe('persistent task budget accounting', () => {
    // The app no longer caps tasks by default; the accounting primitive still enforces explicit finite limits.
    const finite = { toolCalls: 40, skillReads: 8, providerTurns: 32, transformationAttempts: 3, activeMs: 900000 };
    const createTaskBudget = (limits = finite) => createTaskBudgetUnbounded(limits);
    it('accepts exact limits, rejects the next attempt atomically and keeps all counters', () => {
        const original = createTaskBudget();
        const accepted = chargeTaskBudget(original, { toolCalls: 40, skillReads: 8, providerTurns: 32,
            transformationAttempts: 3, activeMs: 900000 });
        expect(accepted.accepted).toBe(true);
        const rejected = chargeTaskBudget(accepted.budget, { toolCalls: 1, providerTurns: 1 });
        expect(rejected).toMatchObject({ accepted: false, reason: 'task_budget_exhausted', dimension: 'toolCalls' });
        expect(rejected.budget.used).toEqual(accepted.budget.used);
        expect(original.used.toolCalls).toBe(0);
        const restored = restoreTaskBudget(JSON.parse(JSON.stringify(accepted.budget)));
        expect(chargeTaskBudget(restored, { transformationAttempts: 1 }).accepted).toBe(false);
    });

    it('pauses user waiting, forbids new tools and resumes without resetting usage', () => {
        const budget = chargeTaskBudget(createTaskBudget(), { transformationAttempts: 2, activeMs: 1000 }).budget;
        const paused = pauseTaskBudget(budget);
        expect(chargeTaskBudget(paused, { activeMs: 999999 }).budget.used.activeMs).toBe(1000);
        expect(chargeTaskBudget(paused, { toolCalls: 1 })).toMatchObject({ accepted: false, reason: 'task_budget_paused' });
        const resumed = resumeTaskBudget(restoreTaskBudget(JSON.parse(JSON.stringify(paused))));
        expect(chargeTaskBudget(resumed, { transformationAttempts: 1 }).accepted).toBe(true);
        expect(chargeTaskBudget(resumed, { transformationAttempts: 2 }).accepted).toBe(false);
    });

    it.each(['2', -1, NaN, Infinity, null, Number.MAX_SAFE_INTEGER + 1])('refuses malformed raw counters %s', value => {
        expect(() => chargeTaskBudget(createTaskBudget(), { providerTurns: value } as never)).toThrow('task_budget_delta_invalid');
    });

    it('rejects undeclared counters and invalid restored ceilings', () => {
        expect(() => chargeTaskBudget(createTaskBudget(), { freeRetries: 1 } as never)).toThrow();
        const budget = createTaskBudget();
        expect(() => restoreTaskBudget({ ...budget, used: { ...budget.used, toolCalls: 41 } })).toThrow();
        expect(() => restoreTaskBudget({ ...budget, pausedForUser: 'true' })).toThrow();
    });
});
