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
/**
 * Default demo gateway only: largest serialized Responses request body (UTF-8 bytes) Pi plans
 * to send. The live gateway accepted bodies up to 202,295 bytes and rejected 209,109 bytes
 * (51 input items, 24 tools; token safety bound) and 216,016 / 226,328 bytes (size bound) with
 * HTTP 400 DEMO_INPUT_TOO_LARGE. The 200k-token planning window would only compact at about
 * 480 KB of JSON, so the Default provider also compacts on serialized bytes. 150 KB leaves
 * ~50 KB of headroom below the lowest observed rejection for estimate error.
 * The budget includes the tool declarations sent on every request: the 24-tool qualified
 * initial-analysis set measured ~34 KB on the wire, the 10-tool follow-up set ~33 KB.
 */
export const DEFAULT_GATEWAY_PI_REQUEST_BYTE_BUDGET = 150_000;
/**
 * Request bytes outside the transcript that the byte estimate does not see (model, reasoning,
 * include, stream flags, per-tool `type`/`strict` wrappers). Measured ~0.9 KB with 24 tools.
 */
export const DEFAULT_GATEWAY_PI_REQUEST_OVERHEAD_BYTES = 4_000;
/** Recent history kept verbatim after a Default-gateway compaction. */
export const DEFAULT_GATEWAY_PI_KEEP_RECENT_BYTES = 40_000;
/** Measured wire size of the 24-tool qualified initial-analysis declarations (see above). */
export const DEFAULT_GATEWAY_PI_TOOL_DECLARATION_BYTES = 34_000;
/**
 * Room left below the compaction trigger right after a compaction, so the next summary call
 * waits for several more turns (a tool turn adds ~6.5 KB) instead of firing every turn.
 */
export const DEFAULT_GATEWAY_PI_POST_COMPACTION_HEADROOM_BYTES = 56_000;
/**
 * Default gateway only: largest accepted summary in UTF-8 bytes (JSON-escaped, as sent).
 * A character cap is not enough: 20,000 CJK characters are ~60 KB of UTF-8, which would put a
 * compacted request right at the trigger. Derived as trigger − tools − recent − headroom
 * = 150,000 − 4,000 − 34,000 − 40,000 − 56,000 = 16,000 bytes.
 */
export const DEFAULT_GATEWAY_PI_SUMMARY_MAX_BYTES = DEFAULT_GATEWAY_PI_REQUEST_BYTE_BUDGET
    - DEFAULT_GATEWAY_PI_REQUEST_OVERHEAD_BYTES
    - DEFAULT_GATEWAY_PI_TOOL_DECLARATION_BYTES
    - DEFAULT_GATEWAY_PI_KEEP_RECENT_BYTES
    - DEFAULT_GATEWAY_PI_POST_COMPACTION_HEADROOM_BYTES;
export const PROVIDER_GEMINI_CONTEXT_WINDOW = 250_000;
export const PROVIDER_GEMMA_CONTEXT_WINDOW = 128_000;
export const PROVIDER_GPT_CONTEXT_WINDOW = PROVIDER_CONTEXT_WINDOW_CAP;
export const PROVIDER_ANTHROPIC_CONTEXT_WINDOW = PROVIDER_CONTEXT_WINDOW_CAP;
export const PROVIDER_RESERVE_RATIO = 0.08;
export const PROVIDER_KEEP_RECENT_RATIO = 0.02;
export const PROVIDER_MIN_RESERVE_TOKENS = 20_000;
export const PROVIDER_MIN_KEEP_RECENT_TOKENS = 4_000;
