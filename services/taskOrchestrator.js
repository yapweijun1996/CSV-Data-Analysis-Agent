const PHASE_ORDER = ['diagnose', 'plan', 'execute', 'adjust', 'verify'];

const createInitialPlanSnapshot = () =>
  PHASE_ORDER.map(step => ({
    step,
    status: 'pending',
  }));

const isoNow = () => new Date().toISOString();

const deepClone = value => JSON.parse(JSON.stringify(value));

const normaliseConstraints = constraints => {
  if (!constraints) return [];
  if (Array.isArray(constraints)) return constraints;
  return [constraints];
};

export const createTaskOrchestrator = ({
  onPlanUpdate,
  onProgress,
  onChatLog,
} = {}) => {
  let session = null;
  let activePhase = null;
  let planSnapshot = createInitialPlanSnapshot();

  const emitPlanUpdate = () => {
    if (typeof onPlanUpdate === 'function') {
      onPlanUpdate(deepClone(planSnapshot));
    }
  };

  const emitProgress = (message, level = 'info') => {
    if (typeof onProgress === 'function') {
      onProgress({
        message,
        level,
        sessionId: session?.id ?? null,
        phase: activePhase?.phase ?? null,
        timestamp: isoNow(),
      });
    }
  };

  const emitChat = (text, type = 'ai_plan_thought') => {
    if (typeof onChatLog === 'function') {
      onChatLog({
        text,
        type,
        sessionId: session?.id ?? null,
        phase: activePhase?.phase ?? null,
        timestamp: isoNow(),
      });
    }
  };

  const ensureSession = () => {
    if (!session) {
      throw new Error('TaskOrchestrator: startSession must be called before managing workflow phases.');
    }
  };

  const pickPlanEntry = phaseId => {
    const candidate = planSnapshot.find(entry => entry.step === phaseId && entry.status !== 'completed');
    if (candidate) {
      return candidate;
    }
    const fresh = { step: phaseId, status: 'pending' };
    planSnapshot.push(fresh);
    return fresh;
  };

  const findLatestPlanEntry = phaseId => {
    for (let index = planSnapshot.length - 1; index >= 0; index -= 1) {
      if (planSnapshot[index].step === phaseId) {
        return planSnapshot[index];
      }
    }
    return null;
  };

  const ensurePhaseId = phaseId => {
    if (!PHASE_ORDER.includes(phaseId)) {
      throw new Error(`TaskOrchestrator: Unsupported phase "${phaseId}".`);
    }
  };

  const startSession = ({ goal, constraints } = {}) => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    session = {
      id: sessionId,
      goal: goal || 'Unnamed goal',
      constraints: normaliseConstraints(constraints),
      createdAt: isoNow(),
      phases: [],
      summary: null,
      completedAt: null,
    };
    activePhase = null;
    planSnapshot = createInitialPlanSnapshot();
    emitPlanUpdate();
    emitProgress(`Start session: ${session.goal}`);
    emitChat(`準備進行任務：「${session.goal}」`, 'ai_plan_intro');
    return sessionId;
  };

  const startPhase = phaseId => {
    ensureSession();
    ensurePhaseId(phaseId);
    if (activePhase && activePhase.status === 'in_progress') {
      endPhase('completed');
    }
    const phaseEntry = pickPlanEntry(phaseId);
    phaseEntry.status = 'in_progress';
    const phase = {
      id: `${phaseId}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      phase: phaseId,
      status: 'in_progress',
      startedAt: isoNow(),
      finishedAt: null,
      steps: [],
      thoughts: [],
    };
    session.phases.push(phase);
    activePhase = phase;
    emitPlanUpdate();
    emitProgress(`進入階段 ${phaseId}`);
    return deepClone(phase);
  };

  const appendThought = thought => {
    ensureSession();
    if (!activePhase) {
      return;
    }
    const text = typeof thought === 'string' ? thought.trim() : '';
    if (!text) {
      return;
    }
    activePhase.thoughts.push({
      text,
      timestamp: isoNow(),
    });
    emitChat(text, 'ai_plan_thought');
  };

  const completeStep = ({ label, outcome } = {}) => {
    ensureSession();
    if (!activePhase) return;
    const entry = {
      label: label || 'Unnamed step',
      outcome: outcome || null,
      status: 'completed',
      completedAt: isoNow(),
    };
    activePhase.steps.push(entry);
    emitProgress(`${entry.label} 完成`, 'success');
  };

  const failStep = ({ label, error } = {}) => {
    ensureSession();
    if (!activePhase) return;
    const message = error instanceof Error ? error.message : error;
    const entry = {
      label: label || 'Unnamed step',
      error: message || 'Unknown error',
      status: 'failed',
      completedAt: isoNow(),
    };
    activePhase.steps.push(entry);
    emitProgress(`${entry.label} 失敗：${entry.error}`, 'error');
    appendThought(`需要調整：${entry.error}`);
  };

  const endPhase = (status = 'completed') => {
    ensureSession();
    if (!activePhase) {
      return;
    }
    activePhase.status = status;
    activePhase.finishedAt = isoNow();
    const planEntry = findLatestPlanEntry(activePhase.phase);
    if (planEntry) {
      planEntry.status = status === 'failed' ? 'failed' : 'completed';
    }
    emitPlanUpdate();
    emitProgress(`階段 ${activePhase.phase} 結束（狀態：${status}）`);
    activePhase = null;
  };

  const endSession = ({ summary } = {}) => {
    ensureSession();
    if (activePhase && activePhase.status === 'in_progress') {
      endPhase('completed');
    }
    session.summary = summary || null;
    session.completedAt = isoNow();
    emitProgress('Session completed', 'success');
    if (summary) {
      emitChat(summary, 'ai_final');
    }
    const snapshot = deepClone(session);
    session = snapshot;
    return deepClone(snapshot);
  };

  const getTimeline = () => (session ? deepClone(session) : null);

  return {
    startSession,
    startPhase,
    appendThought,
    completeStep,
    failStep,
    endPhase,
    endSession,
    getTimeline,
  };
};
