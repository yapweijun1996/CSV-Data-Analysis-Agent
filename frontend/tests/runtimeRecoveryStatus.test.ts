// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { AgentTurn, RuntimeOutcomeEnvelope } from '../types';
import { buildRecoveryTrace } from '../services/agent/runtime/runtimeFinalize';

const makeTurn = (overrides?: Partial<AgentTurn>): AgentTurn => ({
    turnId: 'turn-1',
    runId: 'run-1',
    userMessage: 'show me revenue by region',
    status: 'completed',
    startedAt: new Date(),
    budgetStatus: {
        maxSteps: 8,
        stepsUsed: 1,
        retryCounts: {},
        exhausted: false,
    },
    steps: [],
    ...overrides,
});

const makeOutcome = (overrides?: Partial<RuntimeOutcomeEnvelope>): RuntimeOutcomeEnvelope => ({
    runId: 'run-1',
    turnId: 'turn-1',
    sessionId: 'session-1',
    outcomeKind: 'accepted',
    lifecycleState: 'completed',
    stage: 'finalizing',
    reason: 'accepted',
    retryable: false,
    eventType: 'turn_completed',
    eventMessage: 'Turn completed.',
    ...overrides,
});

describe('buildRecoveryTrace', () => {
    it('returns null when turn is null', () => {
        expect(buildRecoveryTrace(null, makeOutcome())).toBeNull();
    });

    it('reports ideal when card requested and card delivered with 0 retries', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'show revenue by region',
                committedObjective: 'create a revenue by region card',
                selectedPath: 'analysis.create_plan',
                successOutcome: 'card',
                mustPreserveOutcome: 'card',
                assumptionMode: 'none',
            },
            steps: [{
                stepId: 'step-1',
                turnId: 'turn-1',
                index: 0,
                action: { type: 'tool_call', toolName: 'analysis.create_plan', args: {} },
                status: 'completed',
                startedAt: new Date(),
                observation: { type: 'tool_result', status: 'success', summary: 'Card created.' },
            }],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome());

        expect(trace).not.toBeNull();
        expect(trace!.recoveryStatus).toBe('ideal');
        expect(trace!.originalExpectedOutcome).toBe('card');
        expect(trace!.actualOutcomeShape).toBe('card');
        expect(trace!.degradationReason).toBeNull();
        expect(trace!.contractChanges).toBe(0);
    });

    it('reports recovered when card requested and card delivered after retries', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'show revenue by region',
                committedObjective: 'create a revenue by region card',
                selectedPath: 'analysis.create_plan',
                successOutcome: 'card',
                mustPreserveOutcome: 'card',
                assumptionMode: 'none',
            },
            budgetStatus: {
                maxSteps: 8,
                stepsUsed: 3,
                retryCounts: { 'tool_contract:analysis.create_plan': 2 },
                exhausted: false,
            },
            steps: [
                {
                    stepId: 'step-1',
                    turnId: 'turn-1',
                    index: 0,
                    action: { type: 'tool_call', toolName: 'analysis.create_plan', args: {} },
                    status: 'error',
                    startedAt: new Date(),
                    observation: { type: 'tool_result', status: 'error', summary: 'Validation failed.', code: 'validation_failed' },
                },
                {
                    stepId: 'step-2',
                    turnId: 'turn-1',
                    index: 1,
                    action: { type: 'tool_call', toolName: 'analysis.create_plan', args: {} },
                    status: 'error',
                    startedAt: new Date(),
                    observation: { type: 'tool_result', status: 'error', summary: 'Validation failed again.', code: 'validation_failed' },
                },
                {
                    stepId: 'step-3',
                    turnId: 'turn-1',
                    index: 2,
                    action: { type: 'tool_call', toolName: 'analysis.create_plan', args: {} },
                    status: 'completed',
                    startedAt: new Date(),
                    observation: { type: 'tool_result', status: 'success', summary: 'Card created.' },
                },
            ],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome());

        expect(trace!.recoveryStatus).toBe('recovered');
        expect(trace!.originalExpectedOutcome).toBe('card');
        expect(trace!.actualOutcomeShape).toBe('card');
        expect(trace!.degradationReason).toBeNull();
        expect(trace!.contractChanges).toBe(2);
        expect(trace!.recoveryChain).toEqual([
            'validation_failed:analysis.create_plan',
            'validation_failed:analysis.create_plan',
            'ok:analysis.create_plan',
        ]);
    });

    it('reports degraded when card requested but assistant_message delivered', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'show revenue by region',
                committedObjective: 'create a revenue by region card',
                selectedPath: 'analysis.create_plan',
                successOutcome: 'card',
                mustPreserveOutcome: 'card',
                assumptionMode: 'none',
            },
            budgetStatus: {
                maxSteps: 8,
                stepsUsed: 2,
                retryCounts: { 'tool_policy:analysis.create_plan': 1 },
                exhausted: false,
            },
            steps: [
                {
                    stepId: 'step-1',
                    turnId: 'turn-1',
                    index: 0,
                    action: { type: 'tool_call', toolName: 'analysis.create_plan', args: {} },
                    status: 'blocked',
                    startedAt: new Date(),
                    observation: { type: 'tool_result', status: 'blocked', summary: 'Tool blocked.', code: 'blocked_tool' },
                },
                {
                    stepId: 'step-2',
                    turnId: 'turn-1',
                    index: 1,
                    action: { type: 'assistant_message' as const, message: 'Based on available evidence...' },
                    status: 'completed',
                    startedAt: new Date(),
                    observation: { type: 'assistant_message', status: 'success', summary: 'Provided answer from evidence.' },
                },
            ],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome({ reason: 'accepted_assistant_message' }));

        expect(trace!.recoveryStatus).toBe('degraded');
        expect(trace!.originalExpectedOutcome).toBe('card');
        expect(trace!.actualOutcomeShape).toBe('prose');
        expect(trace!.degradationReason).toContain('expected=card');
        expect(trace!.degradationReason).toContain('actual=prose');
        expect(trace!.recoveryChain).toEqual([
            'blocked_tool:analysis.create_plan',
            'ok:assistant_message',
        ]);
    });

    it('reports failed when budget exhausted', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'create a card',
                committedObjective: 'create a card',
                selectedPath: 'analysis.create_plan',
                successOutcome: 'card',
                mustPreserveOutcome: 'card',
                assumptionMode: 'none',
            },
            budgetStatus: {
                maxSteps: 8,
                stepsUsed: 8,
                retryCounts: { 'tool_contract:analysis.create_plan': 2 },
                exhausted: true,
            },
            steps: [],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome({
            outcomeKind: 'failed',
            failureClass: 'budget',
            reason: 'budget_exhausted',
        }));

        expect(trace!.recoveryStatus).toBe('failed');
    });

    it('reports ideal when prose requested and prose delivered', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'explain the data',
                committedObjective: 'explain the data',
                selectedPath: 'assistant_message',
                successOutcome: 'answer',
                mustPreserveOutcome: 'answer',
                assumptionMode: 'none',
            },
            steps: [{
                stepId: 'step-1',
                turnId: 'turn-1',
                index: 0,
                action: { type: 'assistant_message' as const, message: 'The data shows...' },
                status: 'completed',
                startedAt: new Date(),
                observation: { type: 'assistant_message', status: 'success', summary: 'Explanation provided.' },
            }],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome());

        expect(trace!.recoveryStatus).toBe('ideal');
        expect(trace!.originalExpectedOutcome).toBe('answer');
        expect(trace!.actualOutcomeShape).toBe('prose');
        expect(trace!.degradationReason).toBeNull();
    });

    it('reports ideal when no commitment exists (cannot assess degradation)', () => {
        const turn = makeTurn({
            steps: [{
                stepId: 'step-1',
                turnId: 'turn-1',
                index: 0,
                action: { type: 'assistant_message' as const, message: 'Hello!' },
                status: 'completed',
                startedAt: new Date(),
                observation: { type: 'assistant_message', status: 'success', summary: 'Greeted.' },
            }],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome());

        expect(trace!.recoveryStatus).toBe('ideal');
        expect(trace!.originalExpectedOutcome).toBeNull();
    });

    it('reports failed when outcomeKind is cancelled', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'create a card',
                committedObjective: 'create a card',
                selectedPath: 'analysis.create_plan',
                successOutcome: 'card',
                mustPreserveOutcome: 'card',
                assumptionMode: 'none',
            },
            steps: [],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome({
            outcomeKind: 'cancelled',
            reason: 'user_cancelled',
        }));

        expect(trace!.recoveryStatus).toBe('failed');
    });

    it('reports table delivery as matching table expected outcome', () => {
        const turn = makeTurn({
            runtimeCommitment: {
                originalUserRequest: 'query the data',
                committedObjective: 'run a query',
                selectedPath: 'data.query',
                successOutcome: 'table',
                mustPreserveOutcome: 'table',
                assumptionMode: 'none',
            },
            steps: [{
                stepId: 'step-1',
                turnId: 'turn-1',
                index: 0,
                action: { type: 'tool_call', toolName: 'data.query', args: {} },
                status: 'completed',
                startedAt: new Date(),
                observation: { type: 'tool_result', status: 'success', summary: 'Query executed.' },
            }],
        });

        const trace = buildRecoveryTrace(turn, makeOutcome());

        expect(trace!.recoveryStatus).toBe('ideal');
        expect(trace!.actualOutcomeShape).toBe('table');
    });
});
