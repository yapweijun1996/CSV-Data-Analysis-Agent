## Current Work Context

- **Goal**: Deliver a Vanilla JS CSV Agent that truly matches the “Brains + Brakes” blueprint from README — deterministic detection of shape/roles, safe preprocessing (tools first), fallback-only JS, and transparent logging.
- **Recent Progress**:
  - Added shape taxonomy + metadata flags (ragged, multi-header, multi-metric) with deterministic header merge/unpivot.
  - Implemented Diagnose phase gate (header confidence + role coverage + ragged risk) plus health scores & dataset snapshots.
  - Deterministic preprocessing trims whitespace, removes summary rows, and logs actions before AI plan.
  - `executeJavaScriptDataTransform` now exposes `_util.getMetadata / setMetadata / log`, preventing “did not return array” crashes.
  - Prompt updated with tool schemas; LLM is instructed to orchestrate tools via `{"tool":"name","args":"{...}"}` JSON calls.
- **Issues Observed**:
  - Some CSVs still trigger repeated “function did not return array” when LLM insists on custom JS.
  - Need stronger tool-first guardrails and deterministic fallbacks when plan fails.
- **Next Targets**:
  1. Build explicit tool registry / API so LLM only uses deterministic helpers for raw-data manipulations.
  2. Expand evidence fusion (context rows, subtotal verification) and integrate into phase gates.
  3. Add fixtures/tests for each shape type to validate Brains + Brakes coverage.
  4. Ensure README + code stay aligned after each capability milestone.

## 2025-11-07 Session Notes

- **User Goal**: Review the current vanilla agent to ensure CSV ingestion works via `index.html` upload and `main_page.html` postMessage feeds, and diagnose AI preprocessing failures (`function did not return array`, header-mapping `includes` crash).
- **Key Observations**:
  - `processCsv` still emits `column_N` keys while canonical headers live in metadata/header mapping; AI transforms must call `_util.applyHeaderMapping`, otherwise lookups like `cleanedData[0][HEADER_MAPPING.column_2]` fail (`utils/dataProcessor.js` + `services/geminiService.js` prompts).
  - `executeJavaScriptDataTransform` only validates return shape after execution; there is no static lint to block functions with missing `return` or without `_util.applyHeaderMapping`, so malformed code repeatedly trips retries (`utils/dataProcessor.js:1172`).
  - Tool-first orchestration exists, but plans skip tools when `toolCalls` is empty, so repeated JS retries fall back to deterministic dataset without actually remediating the dirty CSV (`main.js:1887` onward).
  - `window.postMessage` bridge at `main.js:7047` trusts same-origin only; duplicates filtered via `signature`, so upstream sender must ensure identical payloads aren’t resent unintentionally.
  - Raw Data Explorer still shows report titles/embedded header rows (e.g., `KINETICS INDUSTRIES...`, `No / Payee Name / Amount ...`) because the deterministic `processCsv` step merely copies those rows into `structuredRows` unless `rowLooksLikeSummary` / `removeSummaryRows` flags them; current heuristics treat them as data rows after ingestion, so AI cleanup must explicitly drop them.
- **Latest Change**: Added deterministic leading/header row stripping inside `applyDeterministicPreprocessing` (see `main.js:3232+ removeContextualRows`) so title rows, duplicated header lines, and metadata-leading rows are removed before summary detection, with metadata counters (`removedContextRowCount`) and log entries for traceability.
- **Follow-up**: Raw data cleaning is now fully agent-driven. Stage plans/toolCalls are surfaced in the UI so users can verify each micro-step. `remove_leading_rows` pulls tokens from metadata + agent `keywords` args (no hardcoded list), and deterministic fallbacks only run when explicitly invoked by the LLM via tool calls.
- **Open Questions / TODO**:
  1. Should we auto-augment `dataForAnalysis.data` with canonical header aliases before invoking AI JS to reduce mapping errors?
  2. Would adding a guardrail that scans `jsFunctionBody` for `_util.applyHeaderMapping` (or forbidding `HEADER_MAPPING.column`) prevent the undefined `includes` crash?
  3. Need proposal for deterministic fallback steps when AI returns non-array; e.g., auto-run helper pipeline based on stage plan instead of skipping.
- **Pending Validation**: Confirm latest contextual-row heuristics remove the user-provided KINETICS dataset title/header rows in Raw Data Explorer; if still visible, extend fingerprint logic (e.g., ordinal prefixes).
- **Next Step**: Provide bilingual review + action options covering ingestion flow, prompt/pipeline gaps, and mitigation ideas for the reported errors.

## 2025-11-07 Follow-up (AI prep iteration 1 attempt 1)

- **User Ask**: “study : AI prep iteration 1 attempt 1: requesting updated preprocessing plan...” — provide a refreshed plan for the very first AI preprocessing pass/attempt.
- **Agent Intent**: Keep iteration 1 focused on deterministic, multi-step hygiene (tools-first) so later attempts only need targeted JS; surface thinking/logs for each micro-step.
- **Proposed Iteration 1 Attempt 1 Flow**:
  1. **Diagnose & Align Headers** – log dataset shape, call `detect_headers` + `remove_leading_rows` with metadata-derived keywords, refresh header mapping context, and append reasoning to chat log.
  2. **Cull Noise Rows** – run `remove_summary_rows` (plus `trim_and_normalize` if whitespace creep is detected) while echoing removed-row stats so users can see what got dropped.
  3. **Structure Validation** – execute `detect_identifier_columns`, restate status=`continue`, and explain what remains (e.g., JS unpivot or type coercion) before handing off to iteration 1 attempt 2.
- **Notes / TODO**:
  - Ensure `_util.applyHeaderMapping` is referenced in any follow-up JS to avoid the `column_N.includes` crash path.
  - Track tool outputs in `toolHistory` so retry prompts describe what was already applied.
  - Highlight in README that iteration 1 favors tool-only passes unless Diagnose gate flags a shape needing JS immediately.

## 2025-11-07 Study Log (geminiService.js:1802 context)

- **Observation**: Iteration 1 attempt 1 plan responded with `status="continue"`, `jsFunctionBody=null`, `stagePlan` sections `titleExtraction`, `headerResolution`, `dataNormalization`, and seven analysis steps describing metadata removal, header row location (row index 3), summary row handling, amount parsing deferral, etc. (`services/geminiService.js:1802-1814`). Crosstab flag was `false`, so no unpivot planned.
- **Execution State**: UI logs show Diagnose → Plan phases, with tool-only steps marked `[pending]`; no tool call yet because plan explanation/agent log pointed to `_util.removeLeadingRows`, `_util.detectHeaders`, `_util.removeSummaryRows`, but orchestration still needs to convert those into actual `toolCalls` for attempt 2.
- **Implication**: Need to ensure stagePlan converts to deterministic calls automatically; otherwise plan remains descriptive without actions, and attempt 2 will re-request plan without applying the queued tool sequence.
- **Next Action**: Study iteration 1 attempt 2 output to confirm whether tool calls fire, and if not, patch plan executor to translate stagePlan entries into tool invocations (or update prompt to force explicit `toolCalls`).

## 2025-11-07 Study Log (js validation warning not surfaced in UI)

- **Observation**: Later attempt log shows `Sanitized jsFunctionBody preview` with a huge `HEADER_MAPPING` mapping actual data values, followed by `function cleanAndReshape(...) { ... }` that *never returns anything at the top level*; it only defines the helper and returns from inside that helper. `services/geminiService.js:1850-1864` validates by executing `new Function('data','_util', body)` directly, so the absence of a top-level `return cleanAndReshape(data, _util);` makes the evaluation yield `undefined`, triggering `Transform function returned non-array` and `Generated function did not return an array.` This happens before orchestration hands control back to the UI, so the assistant panel never sees a warning unless we propagate `failureContext`.
- **Implication**: Model prompt needs to explicitly require top-level `return` statements (no nested helper-only definitions), and runtime should surface `failureContext.reason` into `addProgress`/agent log so users know why an attempt failed. Without this, validation loops silently, confusing users who only see the plan request spam.
- **Action Idea**: 1) Strengthen prompt schema to forbid helper-only bodies (or auto-wrap: if body defines `function cleanAndReshape`, append `return cleanAndReshape(data, _util);`). 2) When `lastError.failureContext` is set, push a progress/error log entry (e.g., `AI JS validation failed: Generated function did not return an array.`) so the assistant panel reflects the warning.

## 2025-11-07 Implementation (top-level return + surfaced warnings)

- **Prompt Update**: Added explicit rule in `services/geminiService.js` multi-pass instructions telling the LLM that any emitted `jsFunctionBody` must end with a top-level `return cleanAndReshape(data, _util);`-style statement—no helper-only definitions.
- **Sanitizer Guardrail**: `sanitizeJsFunctionBody` now auto-detects lone named functions without a top-level return and appends `return <name>(data, _util);` so validator/runtime always see an array-producing snippet.
- **Error Surfacing**: When JS validation fails, `failureContext.reason` is attached to the thrown error and `main.js` logs `AI JS 驗證失敗：<reason>，模型已重新規劃。`, ensuring assistant panel shows the warning instead of silently looping.

## 2025-11-07 Enforcement (toolCalls required + violation counter)

- **Schema/Prompt Enforcement**: `services/geminiService.js` now normalizes toolCalls, requires at least one deterministic tool invocation whenever `jsFunctionBody` is absent and status≠done, and the prompt explicitly states “no JS ⇒ toolCalls must be populated.” Plans missing both actions are rejected with `failureContext.type = 'missing_actions'`.
- **UI Feedback + Safeguard**: `main.js` now inspects `failureContext.type` to log either “AI JS 驗證失敗” or “計畫結構錯誤” and increments violation counters (`js_validation_error`, `missing_actions`). Two consecutive hits auto-trigger `enterAdjustPhase` + iteration budget extension, preventing infinite retries with empty plans.

## 2025-11-07 Header Refresh & Sample Normalisation

- **Prompt Input Fix**: `generateDataPreparationPlan` now pre-processes metadata via `ensurePlanMetadataHeaders`, scanning context/leading rows plus sample data to pick the highest-scoring header row (no硬編字詞). The resulting headers overwrite `inferredHeaders` before constructing the `HEADER_MAPPING`, so `column_1` finally maps to `Code/Description/...`.
- **Sample Slimming**: `normaliseSampleDataForPlan` only emits canonical keys (alias names take precedence; falls back to generic key when no alias exists). Duplicate `column_N` + canonical pairs are removed, reducing token noise and keeping the LLM focused on the tidy schema.
- **Net Effect**: Iteration 1 now receives both accurate header mapping and leaner sample rows, which should unblock deterministic tool calls (remove_leading_rows/detect_headers/remove_summary_rows) without relying on JS heuristics.

## 2025-11-07 Prompt Chunking (Diagnose snapshot → Tool plan → Optional JS)

- **README Alignment**: Documented the three-phase request flow (Diagnose snapshot, Tool plan, Optional JS) so future contributors understand why we chunk prompts instead of dumping whole CSVs.
- **Implementation**:
  - Added `formatDiagnoseSnapshot`, `selectPreviewColumns`, and `formatSamplePreview` so `generateDataPreparationPlan` now sends a tiny dataset summary plus 3-5 canonical rows instead of the full 20-row blob.
  - Updated `buildUserPrompt` to weave in the snapshot/sample blocks ahead of the stage instructions, while `formatMetadataContext` can skip context rows/sample previews when unnecessary.
  - Schema now requires `toolCalls`; if the LLM forgets, we auto-synthesize deterministic calls (remove leading → detect headers → remove summary) from the stage plan, ensuring each iteration actually runs a tool before retrying JS.

## 2025-11-08 Prompt Slimming & Syntax Fixes

- **Issue**: The plan prompt still concatenated 47-column schema + 20-row sample JSON blobs straight into a template literal and sprinkled unescaped backticks (e.g., `_util.parseNumber`), which triggered `Uncaught SyntaxError: unexpected token: identifier` in `services/geminiService.js` when the browser parsed the string.
- **Change**: Replaced the raw blob with a `leadBlock + instructionLines` workflow. Each guideline line now lives inside plain string arrays (double quotes), then `instructionsBlock = instructionLines.join('\n')` feeds the template via `${instructionsBlock}`. No more inline JSON dumps, no accidental backticks.
- **Snapshot Discipline**: Documented the 6-row cap for `contextRows` / `leadingRows` and the 5-row cap for `sampleDataRows` so future tweaks don’t reintroduce token bloat.
- **Verification**: Could not run `node --check services/geminiService.js` because the file uses ESM exports; run `node --input-type=module --check` or Vite build if we need static syntax validation.
