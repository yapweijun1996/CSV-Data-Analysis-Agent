import { describe, it, beforeEach, expect, vi } from 'vitest';

import { createTaskOrchestrator } from '../services/taskOrchestrator.js';

const getLastCallArg = (mock, offsetFromEnd = 1) => {
  const index = mock.mock.calls.length - offsetFromEnd;
  if (index < 0) return undefined;
  const call = mock.mock.calls[index];
  return call ? call[0] : undefined;
};

describe('TaskOrchestrator', () => {
  let callbacks;

  beforeEach(() => {
    callbacks = {
      onPlanUpdate: vi.fn(),
      onProgress: vi.fn(),
      onChatLog: vi.fn(),
    };
  });

  it('starts a session and emits initial hooks', () => {
    const orchestrator = createTaskOrchestrator(callbacks);

    const sessionId = orchestrator.startSession({
      goal: 'Investigate dataset',
      constraints: ['No server', 'Vanilla JS'],
    });

    expect(typeof sessionId).toBe('string');
    expect(callbacks.onPlanUpdate).toHaveBeenCalledTimes(1);
    const initialPlan = getLastCallArg(callbacks.onPlanUpdate);
    expect(initialPlan).toHaveLength(5);
    expect(initialPlan.every(item => item.status === 'pending')).toBe(true);

    const progressEntry = getLastCallArg(callbacks.onProgress);
    expect(progressEntry).toMatchObject({
      message: expect.stringContaining('Start session'),
      level: 'info',
      sessionId,
    });

    const chatEntry = getLastCallArg(callbacks.onChatLog);
    expect(chatEntry).toMatchObject({
      text: expect.stringContaining('Investigate dataset'),
      type: 'ai_plan_intro',
      sessionId,
    });

    const timeline = orchestrator.getTimeline();
    expect(timeline.goal).toBe('Investigate dataset');
    expect(timeline.constraints).toEqual(['No server', 'Vanilla JS']);
  });

  it('manages phase lifecycle with steps and thoughts', () => {
    const orchestrator = createTaskOrchestrator(callbacks);
    const sessionId = orchestrator.startSession({ goal: 'Phase test' });

    orchestrator.startPhase('diagnose');
    let latestPlan = getLastCallArg(callbacks.onPlanUpdate);
    const diagEntry = latestPlan.find(entry => entry.step === 'diagnose');
    expect(diagEntry.status).toBe('in_progress');

    orchestrator.appendThought('先確認欄位資訊。');
    const thoughtEntry = getLastCallArg(callbacks.onChatLog);
    expect(thoughtEntry).toMatchObject({
      type: 'ai_plan_thought',
      text: '先確認欄位資訊。',
      sessionId,
    });

    orchestrator.completeStep({ label: 'Profile columns', outcome: '12 個欄位' });
    const progressAfterStep = getLastCallArg(callbacks.onProgress);
    expect(progressAfterStep).toMatchObject({
      message: expect.stringContaining('Profile columns 完成'),
      level: 'success',
    });

    orchestrator.endPhase();
    latestPlan = getLastCallArg(callbacks.onPlanUpdate);
    expect(latestPlan.find(entry => entry.step === 'diagnose').status).toBe('completed');

    const timeline = orchestrator.getTimeline();
    expect(timeline.phases).toHaveLength(1);
    const phaseRecord = timeline.phases[0];
    expect(phaseRecord.phase).toBe('diagnose');
    expect(phaseRecord.status).toBe('completed');
    expect(phaseRecord.steps).toHaveLength(1);
    expect(phaseRecord.steps[0]).toMatchObject({
      label: 'Profile columns',
      outcome: '12 個欄位',
      status: 'completed',
    });
    expect(phaseRecord.thoughts).toHaveLength(1);
  });

  it('records failures, adjustments, and summary', () => {
    const orchestrator = createTaskOrchestrator(callbacks);
    orchestrator.startSession({ goal: 'Failure handling' });
    orchestrator.startPhase('execute');

    orchestrator.failStep({ label: 'Run plan', error: 'Timeout' });
    const progressAfterFail = getLastCallArg(callbacks.onProgress);
    expect(progressAfterFail).toMatchObject({
      level: 'error',
      message: expect.stringContaining('Timeout'),
    });

    orchestrator.endPhase('failed');
    let latestPlan = getLastCallArg(callbacks.onPlanUpdate);
    expect(latestPlan.find(entry => entry.step === 'execute').status).toBe('failed');

    orchestrator.startPhase('adjust');
    orchestrator.completeStep({ label: 'Change strategy' });
    orchestrator.endPhase();
    latestPlan = getLastCallArg(callbacks.onPlanUpdate);
    expect(latestPlan.find(entry => entry.step === 'adjust').status).toBe('completed');

    const finalTimeline = orchestrator.endSession({ summary: 'Workflow complete' });
    expect(getLastCallArg(callbacks.onProgress)).toMatchObject({
      message: 'Session completed',
      level: 'success',
    });
    expect(getLastCallArg(callbacks.onChatLog)).toMatchObject({
      text: 'Workflow complete',
      type: 'ai_final',
    });
    expect(finalTimeline.summary).toBe('Workflow complete');
    expect(finalTimeline.phases.find(phase => phase.phase === 'execute').status).toBe('failed');
    expect(finalTimeline.phases.find(phase => phase.phase === 'adjust').status).toBe('completed');
  });
});
