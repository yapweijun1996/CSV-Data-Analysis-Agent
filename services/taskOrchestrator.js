const PHASE_ORDER = ['diagnose', 'plan', 'execute', 'adjust', 'verify'];

const createInitialPlanSnapshot = () =>
  PHASE_ORDER.map(step => ({
    step,
    status: 'pending',
  }));

const isoNow = () => new Date().toISOString();

const normaliseColumnName = value => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
};

const summariseColumnContext = (columnProfiles = [], metadata = null) => {
  const columns = Array.isArray(columnProfiles) ? columnProfiles : [];
  const totalColumns = columns.length;
  const categoricalColumns = columns.filter(profile => profile?.type === 'categorical').length;
  const numericalColumns = columns.filter(profile => profile?.type === 'numerical').length;
  const sampleNames = columns
    .map(profile => normaliseColumnName(profile?.name))
    .filter(Boolean)
    .slice(0, 15);
  const genericHeaders = Array.isArray(metadata?.genericHeaders)
    ? metadata.genericHeaders.map(normaliseColumnName).filter(Boolean)
    : [];
  const inferredHeaders = Array.isArray(metadata?.inferredHeaders)
    ? metadata.inferredHeaders.map(normaliseColumnName)
    : [];
  const headerPairs = genericHeaders
    .map((header, index) => {
      if (!header) {
        return null;
      }
      const alias = inferredHeaders[index];
      const target = alias && alias.trim() ? alias.trim() : '(unknown)';
      return `${header} -> ${target}`;
    })
    .filter(Boolean)
    .slice(0, 15);

  if (!totalColumns && !headerPairs.length) {
    return null;
  }

  return {
    totalColumns,
    categoricalColumns,
    numericalColumns,
    sampleNames,
    headerPairs,
    datasetFingerprint: metadata?.datasetFingerprint || metadata?.datasetId || null,
    updatedAt: isoNow(),
  };
};

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
  let contextStore = {};
  let autoTaskFlags = {};

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
      context: {},
      autoTasks: {},
    };
    activePhase = null;
    planSnapshot = createInitialPlanSnapshot();
    contextStore = {};
    autoTaskFlags = {};
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

  const setContextValue = (key, value) => {
    ensureSession();
    if (typeof key !== 'string' || !key.trim()) {
      return;
    }
    contextStore[key] = value;
    if (session) {
      session.context[key] = value;
    }
  };

  const getContextValue = key => {
    ensureSession();
    if (!session) return null;
    if (typeof key === 'string' && key.trim()) {
      const stored = contextStore[key.trim()];
      if (stored === undefined) {
        return undefined;
      }
      return deepClone(stored);
    }
    return deepClone(contextStore);
  };

  const clearContextValue = key => {
    ensureSession();
    if (typeof key !== 'string' || !key.trim()) {
      contextStore = {};
      if (session) {
        session.context = {};
      }
      return;
    }
    delete contextStore[key.trim()];
    if (session) {
      delete session.context[key.trim()];
    }
  };

  const setAutoTaskFlag = (taskId, flagValue) => {
    ensureSession();
    if (typeof taskId !== 'string' || !taskId.trim()) {
      return;
    }
    const normalisedId = taskId.trim();
    autoTaskFlags[normalisedId] = Boolean(flagValue);
    if (session && session.autoTasks) {
      session.autoTasks[normalisedId] = autoTaskFlags[normalisedId];
    }
  };

  const getAutoTaskFlag = taskId => {
    ensureSession();
    if (typeof taskId === 'string' && taskId.trim()) {
      const normalisedId = taskId.trim();
      return Boolean(autoTaskFlags[normalisedId]);
    }
    return deepClone(autoTaskFlags);
  };

  const injectColumnContext = (columns, metadata) => {
    ensureSession();
    const summary = summariseColumnContext(columns, metadata);
    if (!summary) {
      return null;
    }
    contextStore.columnSummary = summary;
    if (session) {
      session.context.columnSummary = summary;
    }
    return deepClone(summary);
  };

  return {
    startSession,
    startPhase,
    appendThought,
    completeStep,
    failStep,
    endPhase,
    endSession,
    getTimeline,
    setContextValue,
    getContextValue,
    clearContextValue,
    setAutoTaskFlag,
    getAutoTaskFlag,
    injectColumnContext,
  };
};
