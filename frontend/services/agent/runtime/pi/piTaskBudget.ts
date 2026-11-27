/** Counters are still recorded for inspection, but no dimension is capped: the user's Stop button is the control. */
export const UNBOUNDED_TASK_LIMIT = Number.MAX_SAFE_INTEGER;
export const DEFAULT_TASK_LIMITS = Object.freeze({
    toolCalls: UNBOUNDED_TASK_LIMIT, skillReads: UNBOUNDED_TASK_LIMIT, providerTurns: UNBOUNDED_TASK_LIMIT,
    transformationAttempts: UNBOUNDED_TASK_LIMIT, activeMs: UNBOUNDED_TASK_LIMIT,
});
export type TaskBudgetDimension = keyof typeof DEFAULT_TASK_LIMITS;
export interface TaskBudget {
    limits: Record<TaskBudgetDimension, number>;
    used: Record<TaskBudgetDimension, number>;
    pausedForUser: boolean;
}
const dimensions = Object.keys(DEFAULT_TASK_LIMITS) as TaskBudgetDimension[];
const validCounters = (input: unknown, minimum: number): input is Record<TaskBudgetDimension, number> =>
    Boolean(input && typeof input === 'object' && !Array.isArray(input)
        && Object.keys(input).sort().join('|') === [...dimensions].sort().join('|')
        && dimensions.every(key => Number.isSafeInteger(input[key]) && input[key] >= minimum));
const freeze = (budget: TaskBudget): TaskBudget => Object.freeze({
    limits: Object.freeze({ ...budget.limits }), used: Object.freeze({ ...budget.used }), pausedForUser: budget.pausedForUser,
});

export const createTaskBudget = (limits: Record<TaskBudgetDimension, number> = DEFAULT_TASK_LIMITS): TaskBudget => {
    if (!validCounters(limits, 1)) throw new Error('task_budget_invalid');
    return freeze({ limits: { ...limits }, used: { toolCalls: 0, skillReads: 0, providerTurns: 0,
        transformationAttempts: 0, activeMs: 0 }, pausedForUser: false });
};
export const restoreTaskBudget = (value: unknown): TaskBudget => {
    const candidate = value as TaskBudget;
    if (!candidate || Object.keys(candidate).sort().join(',') !== 'limits,pausedForUser,used'
        || !validCounters(candidate.limits, 1) || !validCounters(candidate.used, 0)
        || typeof candidate.pausedForUser !== 'boolean'
        || dimensions.some(key => candidate.used[key] > candidate.limits[key])) throw new Error('task_budget_invalid');
    return freeze(candidate);
};
export const pauseTaskBudget = (budget: TaskBudget): TaskBudget => freeze({ ...restoreTaskBudget(budget), pausedForUser: true });
export const resumeTaskBudget = (budget: TaskBudget): TaskBudget => freeze({ ...restoreTaskBudget(budget), pausedForUser: false });

/** Pure accounting snapshots. The existing lease remains the authority to execute or commit. */
export const chargeTaskBudget = (budget: TaskBudget, delta: Partial<Record<TaskBudgetDimension, number>>):
    { accepted: true; budget: TaskBudget } | { accepted: false; budget: TaskBudget; reason: string; dimension?: TaskBudgetDimension } => {
    const current = restoreTaskBudget(budget);
    if (!delta || typeof delta !== 'object' || Array.isArray(delta)
        || Object.entries(delta).some(([key, value]) => !dimensions.includes(key as TaskBudgetDimension)
            || !Number.isSafeInteger(value) || value < 0)) throw new Error('task_budget_delta_invalid');
    if (current.pausedForUser && dimensions.some(key => key !== 'activeMs' && (delta[key] ?? 0) > 0)) {
        return { accepted: false, budget: current, reason: 'task_budget_paused' };
    }
    const used = { ...current.used };
    for (const key of dimensions) {
        const next = used[key] + (key === 'activeMs' && current.pausedForUser ? 0 : delta[key] ?? 0);
        if (!Number.isSafeInteger(next) || next > current.limits[key]) {
            return { accepted: false, budget: current, reason: 'task_budget_exhausted', dimension: key };
        }
        used[key] = next;
    }
    return { accepted: true, budget: freeze({ ...current, used }) };
};
