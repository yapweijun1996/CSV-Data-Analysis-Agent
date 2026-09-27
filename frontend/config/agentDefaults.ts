/**
 * Centralized agent and runtime configuration defaults.
 *
 * All cross-boundary thresholds, limits, and budgets live here so that
 * changing a policy value requires editing exactly one file.
 */

// --- Runtime turn / budget defaults ---

export const AGENT_DEFAULT_MAX_TURNS = 100;
export const AGENT_MIN_MAX_TURNS = 1;
export const AGENT_MAX_MAX_TURNS = 1000;

export const AGENT_DEFAULT_TOOL_OUTPUT_CUTOFF = 10;
export const AGENT_MIN_TOOL_OUTPUT_CUTOFF = 1;
export const AGENT_MAX_TOOL_OUTPUT_CUTOFF = 25;

export const AGENT_MAX_RETRIES_PER_KEY = 2;
export const AGENT_MAX_QUEUED_RUNS_PER_SESSION = 10;

// --- Data analysis session defaults ---

export const DATA_ANALYSIS_MAX_STEPS = 150;
export const DATA_ANALYSIS_MAX_HYPOTHESES = 8;
export const DATA_ANALYSIS_MAX_QUERY_ATTEMPTS = 2;
export const DATA_ANALYSIS_MAX_ACCEPTED_CARDS = 5;
export const DATA_ANALYSIS_FINALIZE_RESERVE_STEPS = 1;
export const DATA_ANALYSIS_MIN_HYPOTHESIS_STEPS = 4;
export const DATA_ANALYSIS_MIN_TARGET_CARDS = 3;
export const DATA_ANALYSIS_MAX_TOPIC_ROUNDS = 3;

// --- Context budget defaults ---

export const CONTEXT_COMPACTION_SUMMARY_MAX_PARTS = 4;
export const CONTEXT_COMPACTION_SUMMARY_OVERHEAD_TOKENS = 2048;
export const CONTEXT_COMPACTION_SAFETY_MARGIN = 1.2;
/** Hard budget ratio — if estimated prompt tokens exceed this fraction of the
 *  model context window, the runtime must NOT issue a model call. */
export const CONTEXT_HARD_BUDGET_RATIO = 0.92;
export const CONTEXT_CHAT_SOFT_BUDGET_CAP = 32000;
export const CONTEXT_PLANNER_SOFT_BUDGET_CAP = 20000;
export const CONTEXT_SUMMARY_SOFT_BUDGET_CAP = 10000;
export const CONTEXT_RUNTIME_EVAL_SOFT_BUDGET_CAP = 5000;
export const CONTEXT_SUMMARY_TRIGGER_LENGTH = 14;
export const CONTEXT_SUMMARY_REFRESH_DELTA = 6;
export const CONTEXT_MAX_SQL_PREVIEW_CHARS = 320;
export const CONTEXT_MAX_WORKSPACE_ACTION_CHARS = 220;
export const CONTEXT_MAX_OBSERVATION_CHARS = 240;
export const CONTEXT_ARTIFACT_PREVIEW_ROWS = 5;
export const CONTEXT_ARTIFACT_SUMMARY_MAX_CHARS = 1200;
/** Maximum serialized size (chars) for observation.detail before clamping. */
export const OBSERVATION_DETAIL_MAX_CHARS = 4000;
/** Maximum rows kept on step.result.artifacts after harness evaluation. */
export const STEP_ARTIFACT_RETAINED_ROWS = 5;

// --- Provider model defaults ---

export const PROVIDER_CONTEXT_WINDOW_CAP = 200_000;
export const PI_CONTEXT_COMPACTION_TRIGGER_RATIO = 0.8;
export const PI_CONTEXT_COMPACTION_KEEP_RECENT_TOKENS = 20_000;
export const PROVIDER_GEMINI_CONTEXT_WINDOW = 250_000;
export const PROVIDER_GEMMA_CONTEXT_WINDOW = 128_000;
export const PROVIDER_GPT_CONTEXT_WINDOW = PROVIDER_CONTEXT_WINDOW_CAP;
export const PROVIDER_RESERVE_RATIO = 0.08;
export const PROVIDER_KEEP_RECENT_RATIO = 0.02;
export const PROVIDER_MIN_RESERVE_TOKENS = 20_000;
export const PROVIDER_MIN_KEEP_RECENT_TOKENS = 4_000;
