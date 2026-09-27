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

## 2025-11-07 Context & README Review Request

- **Goal**: Audit `context.md` + `README.md` so upcoming Vanilla conversion work mirrors the documented agent behavior (multi-step plan, deterministic tool-first cleaning, bilingual comms).
- **What to achieve**: Summarize current instructions, highlight any gaps/risks worth addressing before extending the vanilla agent, and prep feedback for the user’s review ask.
- **Current TODO**:
  1. Re-read `context.md` to ensure latest goals/next steps remain accurate.
  2. Re-read `README.md` for alignment with agent expectations (no React/Tailwind, multi-step workflow, tool orchestration).
  3. Report findings + next-step options back to the user in Mandarin-English mixed, numbered list style.
- **Notes**: Vanilla build already documents Diagnose → Plan → Execute flow, tool schema, and safety constraints; need to double-check if README mentions “Original” folder preservation or other migration caveats.
- **Risks / Questions**: README still references dev server workflow and optional model download (npm commands) even though final deliverable should avoid Node requirements—confirm whether static build instructions need further simplification.

## 2025-11-08 Bugfix: metadataForPlan ReferenceError

- **Issue**: Upload flow crashed with `ReferenceError: metadataForPlan is not defined` (stack: `buildAnalysisPlanPrompt → generateAnalysisPlans → handleInitialAnalysis`). Root cause: `buildAnalysisPlanPrompt` referenced `metadataForPlan` without defining it; only other prompt builders perform `ensurePlanMetadataHeaders`.
- **Fix**: Inside `buildAnalysisPlanPrompt`, derive `metadataForPlan` via `ensurePlanMetadataHeaders(metadata, rawSampleRows)` before calling `formatMetadataContext`, so all analysis plans get consistent metadata context without runtime errors.
- **Follow-up**: Should add regression coverage (unit or smoke) ensuring every prompt helper either receives `metadataForPlan` as an argument or computes it locally before formatting context.

## 2025-11-08 Bugfix: Plan generator `lastError` ReferenceError

- **Issue**: `generateDataPreparationPlan` crashed every iteration with `ReferenceError: lastError is not defined`, so Diagnose → Plan loop stalled after tool planning attempts. Function lacked a working body after the prompt builder, so it never called Gemini/OpenAI nor normalized outputs.
- **Fix**:
  - Added normalization helpers (`normaliseDataPreparationPlan`, `normaliseAnalysisSteps`, etc.) plus a deterministic fallback tool sequence (`remove_leading_rows → detect_headers → remove_summary_rows`) when the LLM omits tool calls and JS.
  - Rebuilt `generateDataPreparationPlan` to build the user prompt, call OpenAI/Gemini with schema + raw capture, sanitize the response, and return a structured plan (explanation, analysisSteps, stagePlan, agentLog, toolCalls, jsFunctionBody, outputColumns, status).
  - Error handler now attaches raw responses for debugging, so upstream violations log meaningful failureContext instead of hard `ReferenceError`.
- **Impact**: Vanilla agent can progress past Plan phase again; empty toolCalls now auto-synth to deterministic helpers so Execute step always has work even when the LLM only narrates.

## 2025-11-08 Prep Debug Logging

- **Goal**: Give QA clearer console breadcrumbs when Plan iterations stall or JS transforms fail so logs can be copy/pasted for remote debugging.
- **Implementation** (`main.js`):
  - Added helper `logDataPrepDebug(event, details)` that prints `[CSV Agent][PrepDebug]` with session ID, iteration, attempt, tool counts, JS preview, etc., truncating raw responses to <=400 chars.
  - Emitted logs for plan requests/responses, malformed JSON, planner failures, tool execution summaries, tool-only iterations, JS start/success/failure.
- **Usage**: When testing locally, open DevTools console and search for `PrepDebug`. Share the snippets (they already redact large payloads) so we can reconstruct the planner state without full network traces.

## 2025-11-08 Guardrail: HEADER_MAPPING misuse

- **Issue**: LLM 會生成 `data[0][HEADER_MAPPING.column_1]` 這類寫法，導致 runtime `undefined.trim`（raw rows只有 `column_N` key，無 canonical key）。
- **Fix**: `services/geminiService.js` 的 `normaliseDataPreparationPlan` 會在 `sanitizeJsFunctionBody` 後呼叫 `enforceSafeHeaderMappingUsage`。凡匹配 pattern `data[..][HEADER_MAPPING.column_N]` 會主動丟出錯誤，並塞 `failureContext.type = 'hard_coded_structure'` / `reason` 提醒模型必須改用 raw column key + `_util.applyHeaderMapping`。
- **Effect**: Runtime 不再等 JS 執行才爆錯；Plan 階段立即回報違規，內建 violation handler 會重啟迭代並帶入錯誤訊息，節省來回嘗試。

## 2025-11-08 Diagnose Metrics Upgrade (Plan A Step 1)

- **Goal**: 讓 Diagnose 指標可計算、可追蹤，後續好套 headerConfidence/shapeScore gate。
- **Implementation**:
  - `utils/dataProcessor.js:1011+` 的 `profileData` 現在對每欄輸出 `fillRate`, `typeShares {numeric/text/date}`, `nonEmptyCount/totalCount`，作為後續 header confidence 基礎。
  - `main.js:180-230` 新增 `computeHeaderQualityMetrics`、`computeShapeScoreFromMetadata` 等 helper，依照公式 `0.35*fill + 0.25*uniq + 0.2*structureMatch + 0.2*typeParse` 計算 `headerConfidence`，並把 breakdown 寫回 `metadata.structureEvidence`.
  - `evaluateHealthScores` 重構：`structureStability` 結合 headerConfidence、`reasonableness` 改用 `shapeScore`，`formatHealthScoreSummary` 會顯示 header%。
- **Impact**: Diagnose gate、Plan prompt 現在可取得真實 headerConfidence/shapeScore，後續步驟才能根據 minHeaderConfidence=0.7 這類條件做自動決策。

## 2025-11-08 Diagnose Metrics Upgrade (Plan A Step 2)

- **Profiler parity**: `profileData` 追加 `uniqRate = unique/nonEmpty`、`numericParseRate/dateParseRate/textParseRate`，metadata.columnProfiles 直接攜帶這些比例，Plan/Diagnose 無需二次計算。
- **Header evidence** (`main.js:198-374`):
  - `computeHeaderQualityMetrics` 現在輸出 `headerRegexHits`, `groupPatternHits`, `positionHint`, 以及 top-3 `weakColumns`（最低 fill/uniq）。
  - `metadata.structureEvidence.breakdown` 保存上述指標，UI/Plan prompt 可明確看到 headerConfidence 的計分來源。
- **Shape scores** (`utils/dataProcessor.js:457-530`):
  - `detectShapeTaxonomy` 回傳 `scores`（narrow/wide/crosstab/mixed）與 `shapeAmbiguous` flag。若前兩名差 < 0.08，標記 ambiguous，Plan 端可先重跑 detect_headers。
  - shapeScore 門檻：crosstab≥0.75、wide≥0.65、narrow≥0.55，否則 fallback 成 safer shape。
- **Plan context** (`main.js`, `services/geminiService.js`):
  - `buildPlanContextPayload` 統一傳遞 `headerConfidence/roleCoverage/shape/shapeScores` 至 Plan prompt（`Diagnose metrics` 區塊）。
  - `normaliseDataPreparationPlan` 強制 `shape∈{narrow,wide,crosstab,mixed}`、`expectedSchema.columns.length>0`、`toolCalls` 為陣列，違反直接拋 `invalid_plan`。
- **Structure evidence寫回**：`metadata.structureEvidence` 現在含 `headerConfidenceBreakdown`, `roleCoverage`, `shapeScore`, `weakColumns`，未來 UI 可直接渲染「診斷報告」。

## 2026-09-27 Codebase Review: React and PI Harness

- **User question / goal**: Determine whether the current project uses React and PI Harness. This is a read-only code review; do not modify application code or `original/`.
- **Review steps completed**: Checked the root HTML entry and bundled imports, root and reference package manifests, service-worker asset list, Vanilla entry and task orchestrator, README, and repository-wide PI Harness identifiers in relevant source and generated assets.
- **React finding (verified)**: The active root `index.html` loads `assets/csv_data_analysis_index-L92MBGHW.js` and preloads `assets/csv_data_analysis_vendor-react-core-C-mUT8EF.js`. The application bundle imports React DOM from that vendor chunk; the service worker also pre-caches it. The root `package.json` does not declare React, because the served bundle is already compiled. The separate `original/csv-data-analysis-agent/` reference declares React and React DOM.
- **Vanilla finding (verified)**: Root `main.js` defines and mounts `<csv-data-analysis-app>` as a Web Component, but root `index.html` does not import `main.js`. The checked-in root page therefore still selects the React build, while the Vanilla implementation exists as disconnected source.
- **PI Harness finding (static evidence)**: No PI Harness package, import, or named integration was found in the checked repository manifests, lockfile, source, or bundled assets. `services/taskOrchestrator.js` is a project-owned phase/status manager used by Vanilla `main.js`; its multi-step workflow alone does not establish PI Harness usage. This is a static-code conclusion, not a runtime audit of remote services.
- **Current status / TODO**: Review complete; report the concise distinction between active React page, disconnected Vanilla source, and no detected PI Harness. No application change or test is needed for this identification-only request.
- **Follow-up clarification**: The user asked whether the repository has two versions. Answer: yes, it contains a React implementation (reference source under `original/` and a compiled React app loaded by root `index.html`) and a separate Vanilla JavaScript implementation in root modules. Only the compiled React app is wired to the current root page. Do not assume the checked-in compiled bundle was produced from the exact `original/` source without build provenance evidence. No further code change was requested.

## 2026-09-27 React versus Vanilla Comparison

- **User goal**: Compare the two implementations and recommend which is better for this project, using the checked-in code and separating current usability from long-term fit.
- **Review TODO completed**: Rechecked root entry, React reference source and component/agent flow, Vanilla Web Component and task orchestration, feature modules, dependency loading, README/roadmap, and existing test coverage. This was a static review; no browser workflow or performance benchmark was run. `node_modules` is absent, so the Vitest suite was not run for this comparison.
- **Current readiness**: The root page loads the compiled React app. The Vanilla Web Component source is not loaded by that entry. Therefore React is currently the only root-entry implementation available to users; neither version's end-to-end quality was newly verified here.
- **Feature evidence**: React reference source includes chat actions, data preparation, charts, raw data, history, memory, settings, and exports. Vanilla source contains corresponding modules plus explicit Diagnose/Plan/Execute/Adjust/Verify phase tracking and tool-call/retry logic. Source presence alone does not prove feature parity or runtime reliability. The active compiled React bundle cannot be assumed identical to the `original/` source without provenance.
- **Engineering trade-offs**: The React reference uses TypeScript and split UI components; Vanilla aligns with the requested HTML/CSS/JS target and has a more explicit project-owned orchestration model. Vanilla also has a roughly 7,500-line `main.js`, depends on browser globals such as `window.Papa`, `window.Chart`, and `window.idb`, and needs entry/dependency wiring. Both inspected source variants execute generated JavaScript with `new Function`, so neither has an established isolation advantage.
- **Recommendation / next action**: For immediate use, keep treating the current React build as the available app. For the stated product goal, complete and verify the Vanilla entry, then compare representative CSV-to-report and chat workflows before claiming Vanilla is better. No application code change is authorized by this review request.

## 2026-09-27 React Preview in Codex Browser

- **User goal**: Open the current React version in the Codex app browser for user preview.
- **Action completed**: Started a temporary localhost static server from the repository root at `http://127.0.0.1:8765/` and opened that URL in a visible Codex in-app browser tab, marked to remain available after this turn. No application source was changed.
- **Verification**: HTTP checks returned 200 for the root HTML, application bundle, and React vendor bundle. The browser accessibility view showed the rendered `AI Analysis` page with `Upload a CSV to begin`, History, Data Explorer, and Assistant controls. This confirms initial React UI mounting, not CSV workflow or AI behavior.
- **Note**: The preview depends on the temporary local static server remaining running. The user can inspect the open tab; later work should not treat this preview as a completed end-to-end test.

## 2026-09-27 Project Direction: Remove Vanilla Implementation

- **Latest user goal**: Remove the Vanilla version from this repository. Remove `original/` only if it is no longer needed. Keep the current React app available.
- **Decision on `original/`**: Retained `original/csv-data-analysis-agent/`. File inventory found it is the only checked-in React/TypeScript source tree; deleting it now would leave only compiled React bundles. It is a reference source, and its exact provenance relative to the active bundle is unverified.
- **Removal completed**: Deleted root Vanilla `main.js`, `storageService.js`, `styles.css`, its `services/`, `render/`, `handlers/`, `utils/`, `state/`, `types/`, and `tests/` trees, plus the Vanilla-only `STATE_REFACTOR_PLAN.md` and `roadmap.md`. Removed the obsolete root Vitest script/dependency, synchronized the package lock, and rewrote `README.md` and `AGENTS.md` for the React-only root entry. Historical notes in this file remain for traceability.
- **Runtime resources retained**: `assets/`, `index.html`, `service-worker.js`, `sandbox/python-transformation-worker.js`, `duckdb/`, `pyodide/`, `public/models/`, and `demo-data/` were retained. The compiled app-agent bundle references the sandbox worker, and a compiled vector worker names the local embedding model. The unrelated legacy `main_page.html` was also left untouched because it is not wired to the removed Vanilla app.
- **Verification completed**: `git diff --check` passed. All 23 service-worker precache paths exist. On a fresh localhost origin, the React app mounted and showed `AI Analysis` with the CSV upload screen; initial requested assets returned HTTP 200. This verifies initial load, not CSV, AI, export, history, or offline workflows.
- **Preview cleanup / remaining risk**: Stopped the temporary Vanilla preview server and deleted its temporary script. The React preview on port 8765 remains available. The active bundle's matching source/build process is still unknown; recover it before substantial React feature changes.
- **Follow-up question on `original/`**: The user asked why it was retained. It is the only checked-in React/TypeScript source reference, while the active root app consists of compiled bundles. Retaining it preserves some editable source for investigation, but there is no verified build provenance linking it to the current bundles. If the project intentionally keeps only static artifacts, `original/` can be removed; the consequence is losing the repository's only React source reference. No further deletion was requested in this question.

## 2026-09-27 React Build Provenance Check and Reference Cleanup

- **User choice / goal**: The user selected Option A: verify which source corresponds to the current React bundle, then decide whether the old `original/` folder is needed. Earlier authorization allowed removing `original/` if it was no longer needed.
- **Evidence**: The old `original/csv-data-analysis-agent/App.tsx` was last changed in commit `0b0f8be` on 2025-11-05. The active `assets/csv_data_analysis_index-L92MBGHW.js` arrived in commit `7095284` on 2026-07-28. The active bundle loads Database, Workspace, Agent Monitor, and Data Preparation Workflow components and a separate state vendor module; those modules do not exist in the old React source tree. The bundle commit added compiled assets and deployment resources without matching React source. Repository refs and the remote expose only `main`; no source maps or alternative current React source files were found.
- **Conclusion / decision**: The exact source and build process for the active React bundle cannot be identified from this repository. The older `original/` folder cannot reproduce the current app as checked in and is not a runtime dependency. It was removed under the user's conditional cleanup authorization. Git history remains available to recover that obsolete reference if needed.
- **Documentation**: Updated `README.md` and `AGENTS.md` to state that the active app is a compiled React build with no matching checked-in source. The removed Vanilla implementation remains removed. No commit or push was made.
- **Verification completed**: `git diff --check` passed; no runtime entry/asset reference to `original/csv-data-analysis-agent/` was found; all 23 service-worker precache files remain present; the root page, React bundle, and Python worker returned HTTP 200; and the Codex browser still displayed the React `AI Analysis` upload screen. This confirms initial loading, not CSV-to-report or AI workflows. The source-provenance gap remains the main engineering risk for future feature work.

## 2026-09-27 KB Agent Bootstrap: Current Project Goal

- **User request / goal**: Bootstrap KB Agent context and state the current goal of this `CSV-Data-Analysis-Agent` repository.
- **Completed TODO**: (1) Checked live KB Agent Brain status and recalled project context. (2) Matched the KB project record to this repository and reviewed current `AGENTS.md`, `README.md`, `roadmap.md`, `index.html`, Git origin, and recent `context.md` notes. (3) Summarized goal, current state, and next priority. This was a documentation/context update only.
- **Project goal**: Convert the protected `original/` React reference into a browser-only HTML/CSS/JavaScript CSV analysis application. The Vanilla Agent should handle complex CSV work through visible, sequential Diagnose → Plan → Execute → Adjust → Verify steps, choose tools from evidence rather than hardcoded task answers, log progress, and support analysis/report workflows. Keep `original/` unchanged and document the architecture and behavior for maintainers.
- **Current state / gap**: Root `index.html` still loads the compiled React application, while Vanilla `main.js` and supporting modules are present but not wired into that root entry. The roadmap's P0 entry/dependency/deployment reconciliation remains the first implementation priority; browser-level Vanilla workflow verification follows it. Source presence alone does not establish a working Vanilla deployment.
- **KB evidence and identity**: `kb_brain_status` returned healthy retrieval, embedding, and recent context. The matching KB item is “CSV-Data-Analysis-Agent (Vanilla) — codebase inventory and deployment-state review (2026-09-25)” in `csv-data-analysis-agent-project-knowledge`. Initial generic recall/search also returned memories for the separate `React-CSV-Data-Analysis-Agent` repository; those claims were excluded from this repository's current goal. The mismatched cross-KB search was marked unhelpful.
- **Verification / limits**: Current Git origin matches `yapweijun1996/CSV-Data-Analysis-Agent`; root HTML and the repository documents corroborate the entry mismatch. No application code, `original/` files, build, tests, or new browser workflow were changed or run in this bootstrap turn. Preserve the pre-existing uncommitted `context.md` edits.

## 2026-09-27 Direction Change: Keep React; Explore Browser Pi Harness

- **User decision**: Keep the React version and remove the separate Vanilla implementation. Another AI agent is performing that cleanup. This supersedes the earlier Vanilla-conversion goal recorded above; do not treat older README/roadmap/KB summaries as the current product direction until the other agent's changes are completed and verified.
- **Question**: Can this React CSV project integrate a framework-independent Pi-style harness that runs in the browser without a Node.js application server?
- **Assessment**: The full official Pi coding-agent CLI requires Node.js 22.19+ and terminal/system capabilities. The official `pi-agent-core` package documents browser app integration and separates Node-specific session backends; `pi-ai` documents browser support. A browser agent loop using Pi core, browser-safe CSV tools, and a React UI is feasible in principle. This is a documentation-based feasibility assessment, not a tested integration in this repository.
- **Runtime/build distinction**: No Node.js server is required for a statically hosted browser app, but the current React/Vite build and dependency bundling may still use Node.js during development/build. A strict no-Node-at-any-stage requirement would need a separately produced, pinned browser bundle or another build strategy and is not yet verified.
- **Boundaries to prove**: Browser tools can operate on user-selected files, in-memory/IndexedDB data, charts, and app state; the CLI's shell/filesystem/process tools are outside browser scope. Direct model API calls require browser-compatible provider access and expose user-supplied credentials to the browser; a backend proxy is needed if the application must hide its own keys. Keep one owner for each agent turn and preserve the CSV app's data/analysis responsibilities.
- **Current evidence / TODO**: Official Pi docs reviewed on 2026-09-27: `earendil-works/pi` coding-agent README, agent-core README, and pi-ai README. Current working tree shows another agent's React-preservation/Vanilla-removal edits in progress; their completion and runtime behavior were not checked here. Recommended next technical step after that cleanup: a small browser-only Pi core spike with one read-only CSV tool, event log, and direct-provider or proxy decision.
- **KB memory**: Saved the user-confirmed direction as a project-scoped semantic decision. The KB preview surfaced similarly worded memories for the different `React-CSV-Data-Analysis-Agent` repository; explicit repository identity resolved that false conflict. The current project's React cleanup remains in progress and was not marked complete.

## 2026-09-27 Repository Tree Refactor Assessment

- **User goal**: Make the repository easier to understand and maintain; determine whether a source-code or folder-tree refactor is appropriate after the Vanilla and `original/` removal.
- **Current state**: The live root `index.html` loads hashed React bundles in `assets/`. `service-worker.js` pre-caches specific bundle paths. The remaining `duckdb/`, `pyodide/`, `sandbox/`, and `public/models/` directories contain browser runtime resources. `demo-data/` is example data. `main_page.html` is a 313 KB legacy HTML fragment and `package.json.tmp` is an empty tracked file; neither is referenced by the current app entry or deployment configuration.
- **Source gap and discovery**: No matching source tree for the active compiled React bundle is checked into this repository; its other local branch contains only the older `original/` reference. A sibling repository, `React-CSV-Data-Analysis-Agent-Backup`, has a `Backup/v8/React-CSV-Data-Analysis-Agent/` source tree with the active app's `AgentMonitor`, `DatabaseModal`, `DataPreparationWorkflow`, Agrun runtime, build tooling, and tests. Its source changes and this repository's build addition both date to 2026-07-28. This is a strong same-lineage candidate, but byte-identical build provenance has not been verified. The sibling repository also has later changes, so importing its current state without selecting a matching revision could change behavior.
- **Decision / recommended order**: Treat this repository's current tree as a deployment artifact. First identify the correct sibling source revision and reproduce/compare its build. Then bring in the editable source and build process as the source of truth, organize source by feature/responsibility under `src/`, generate deployment assets, and verify browser, worker, model, and offline paths. Rearranging runtime folders now would mainly change URLs and service-worker references without improving source maintainability.
- **Scope / verification**: This turn was an assessment; no runtime path or application file was moved. Inspected the current file tree, package/Vite configuration, root entry, service-worker precache, local branch, sibling repository source/history, and references to the two legacy root files. The existing cleanup changes remain uncommitted and should be preserved. No source rebuild was run; installed Node v23 is outside the sibling source's declared Node 22 engine range.

## 2026-09-27 React Source Restoration and Tree Refactor

- **User choice / goal**: Execute Option A: identify the React source revision matching the active deployment, restore a reproducible source/build path in this repository, and make the repository tree maintainable while preserving the current preview.
- **Provenance (verified)**: `React-CSV-Data-Analysis-Agent-Backup` revision `b268e31b37de94ea3b7a5b9e604ce3eca3a48e3d` (2026-07-28 09:45 +08:00) rebuilt the current deployment. An isolated build and a second build after integration produced the same 74-entry `SHA256SUMS.txt`, root `index.html`, service worker, and hashed bundle names. The current root build was checked in at 10:31 +08:00 on the same day.
- **Tree decision**: Added one `frontend/` React/TypeScript source package, preserving the source's established component, store, service, worker, and test boundaries. The root remains the existing static deployment and keeps its fixed runtime URLs. Excluded the separate 16,000-file study-only sample projects and their four fixture-dependent tests. Removed six unused zero-byte source stubs and a dev-only Vite rule for omitted legacy HTML. No user-facing app behavior was intentionally changed.
- **Build path**: Root npm scripts now call the source package. `npm run build` writes `frontend/dist`; `npm run publish:root` builds and copies only checksum-managed deployment files after verifying current and new hashes. `scripts/prepare-frontend-assets.mjs` copies shared DuckDB and demo resources into ignored source-public directories and optionally local models for development. Pyodide is copied from the installed dependency. Removed the obsolete root Vite config and empty `package.json.tmp`. Updated README/AGENTS and added a frontend README.
- **Verification**: Fresh `npm ci --prefix frontend --ignore-scripts` succeeded. Full Vitest suite passed after removing the study-only fixture test: 367 test files and 3,504 tests. Typecheck, lint baseline, bundle-budget check, publisher safety tests (2), `git diff --check`, exact deployment checksum comparison, and a guarded publish to root passed. Git reports no modifications to the deployed `index.html`, bundles, worker, or checksum manifest. The root 8765 browser still displayed the React app; the source Vite dev server started on port 3000 and returned HTTP 200 for HTML, source module, sandbox worker, and DuckDB worker, then was stopped. The 8765 preview was left running.
- **Remaining considerations**: Node v23 on this machine is outside the source package's declared Node 22 range, although install/build/tests passed. npm reported 22 dependency advisories; no dependency upgrades were made in this structural task. A production host should publish only generated site files plus required runtime models, not the whole repository with source and test fixtures. Provider-backed AI and a new CSV-to-report browser flow were not re-run. Existing earlier cleanup changes and this refactor remain uncommitted and unpushed.

## 2026-09-27 GitHub Pages Artifact Boundary

- **User choice / goal**: Execute Option A from the tree refactor: inspect deployment settings and ensure GitHub Pages publishes only the compiled site and required browser resources. Preserve manual release control and do not deploy a new app version as part of this check.
- **Current deployment evidence**: `yapweijun1996/CSV-Data-Analysis-Agent` is PUBLIC, while the sibling source backup is PRIVATE. Pages previously used `main /`, which could expose any source and fixtures pushed to the repository. Changed Pages `build_type` to `workflow` through the GitHub API; a follow-up API read confirms `workflow` and `built`. The live Pages homepage still returns HTTP 200. This setting change does not publish new content.
- **Source exposure decision**: The restored `frontend/` source, tests, and sample CSV files remain local and unpushed. An explicit user decision is pending before any of them are published to the public remote. A Pages artifact allowlist protects the hosted site, but it cannot hide files committed to a public Git repository. README and AGENTS now record this boundary. The previous note saying hosted releases need local model files is superseded: the current vector worker explicitly uses a CDN, and the current build excludes local models.
- **Implementation**: Added a manual-only GitHub Pages workflow and `scripts/stage-pages-artifact.mjs`. Staging reads `SHA256SUMS.txt`, verifies every hash and regular file, allows only site entries plus `assets/`, `demo-data/`, `duckdb/`, `pyodide/`, and `sandbox/`, and adds `.nojekyll`. It refuses unknown manifest paths or an existing output directory. `scripts/site-manifest.mjs` shares manifest parsing and hashing with the guarded root publisher. Root scripts provide `npm run test:publish` and `npm run stage:pages`; README explains the release path. The workflow itself uses only Node built-ins and does not depend on the pending source refactor.
- **Safe review branch**: Created an isolated worktree from remote `main`, committed only four deployment files as `55db350` on `codex/pages-artifact-release`, pushed that branch, and opened draft [PR #1](https://github.com/yapweijun1996/CSV-Data-Analysis-Agent/pull/1). PR file inspection confirms only `.github/workflows/publish-pages.yml`, `scripts/site-manifest.mjs`, `scripts/stage-pages-artifact.mjs`, and its test are included. No restored private source or sample CSV is in the PR. No merge or workflow dispatch occurred. The workflow must be merged to `main` and manually dispatched before it can publish; the existing site remains on its last deployment meanwhile.
- **Verification**: On the isolated clean checkout, staging tests passed 2/2, workflow YAML parsed, and a real staging run produced 74 verified manifest files plus `SHA256SUMS.txt` and `.nojekyll`: 76 regular files, no symlinks, about 210 MB, with no `frontend/`, `original/`, `main.js`, or `public/models/`. In the main working tree, publisher and stager tests passed 4/4 and `git diff --check` passed. PR #1 is OPEN/DRAFT; GitHub reports no CI checks for that branch. Production deployment has not been exercised.
- **Next decision**: Keep the React source private by default until the user decides whether the private backup material may enter the public repository. Review/merge PR #1 when ready, then manually run the Pages workflow for an actual release. The primary working tree still contains earlier cleanup and source restoration as uncommitted local changes.

## 2026-09-27 Pages PR Commit and Merge

- **User request / scope**: The user said “commit and merge” after reviewing the Pages artifact PR. Interpreted this as authorization to merge PR #1 only. The unrelated local React source restoration remains outside this public PR because its source repository is private and public release has not been authorized.
- **Completed**: Rechecked PR #1: it contained exactly four deployment files and was mergeable. Re-ran the isolated staging tests (2/2 passed), marked the draft ready, and merged it into `main`. The source branch commit is `55db350`; the remote `main` merge commit is `888477e7931840f14413e9dc9b155f3fb6154ea7`. GitHub reports PR #1 as `MERGED`, and the workflow file is available on remote `main`.
- **Post-merge verification**: GitHub Pages remains configured with `build_type: workflow` and status `built`. The live homepage returns HTTP 200. `gh run list --workflow publish-pages.yml` returned no runs, so no manual deployment occurred. This merge installs the controlled deployment path without publishing a new app version.
- **Local state / remaining decision**: The primary local `main` worktree still has the prior Vanilla cleanup and private React source restoration as uncommitted changes; it was not pulled, committed, or pushed during this request. Its local `main` is now behind remote `main`; reconcile only after deciding which private source files may enter the public repository. PR #1's publication guard controls the Pages artifact, not the visibility of files committed to the public repository.

## 2026-09-27 Pull Merged Pages Changes into Local Main

- **User request / goal**: Pull remote `main` into the primary local checkout and resolve any conflicts while preserving the existing uncommitted source and cleanup work.
- **Conflict diagnosis**: Remote `main` added exactly four Pages deployment files. The primary checkout already had those four as untracked local files. Their Git blob hashes matched the remote versions byte-for-byte. No tracked local modifications overlapped with the remote additions, so there was no substantive content conflict; Git's untracked-file overwrite protection was the only obstacle.
- **Action**: Moved the four identical untracked files to a temporary backup, ran `git pull --ff-only origin main`, and compared the pulled tracked files with the backup before removing the backup. The pull fast-forwarded from `ac71519` to merge commit `888477e`. No stash, reset, or force operation was used.
- **Verification / current state**: Local `HEAD` and `origin/main` are both `888477e7931840f14413e9dc9b155f3fb6154ea7`. There are no unmerged paths. All four pulled file hashes equal the remote blobs, `npm run test:publish` passed 4/4, and `git diff --check` passed. `frontend/App.tsx` and the local publisher scripts remain present. The earlier Vanilla removals, React source restoration, docs, and build-script changes remain uncommitted and unpushed by design, pending the private-source publication decision.

## 2026-09-27 Public Source Candidate and Private Corpus Audit

- **User choice / goal**: Execute Option A after the pull: audit recovered React source and sample CSV files, then prepare a source commit that can be reviewed for public publication. This authorizes a local candidate, not publication of material from the private backup. A direct question asking whether cleaned source may be pushed to the PUBLIC repository is pending.
- **Data findings**: `frontend/sample csv/` contains 64 business reports (about 5.9 MB); a content classification found financial terms in 63, customer/supplier terms in 35, contact-related terms in 33, and project/employee terms in 28. The classification is heuristic and does not prove the presence or absence of personal data. `frontend/tests/benchmark/golden/` contains 50 JSON snapshots with `values` derived from report inputs. Those data files, the benchmark suite, and internal planning documents are excluded from the candidate. The dependency repository `Agent-Runtime-JavaScript` is PUBLIC. No actual credential material was found by the targeted pattern scan of the candidate, but pattern scanning is not a complete secret audit.
- **Safety boundary**: Added Git ignore rules for `.env` files, the business report corpus, benchmark snapshots, and local planning/operator notes. Built an explicit source-file allowlist for the candidate instead of using `git add -A`. The candidate excludes the raw CSVs, benchmark data, internal `docs/`, live/corpus-dependent tests and scripts, key-shaped test literals, and internal planning documents. It retains application source, static source templates, build tooling, and synthetic unit tests. The main working directory still contains the omitted local files as untracked or ignored files; they were not deleted.
- **Local commits only**: Created `codex/react-source-public-prep` from `main` and made three local commits: `ce6ddbd` (React source and prior authorized Vanilla/original cleanup without private fixtures), `8bbc891` (safe gateway test helper needed by a retained unit test), and `123d31c` (remove three tests that required omitted internal docs, plus ignore rules). The branch has no remote counterpart and was not pushed. `context.md` remains unstaged because it is a local conversation record.
- **Clean-checkout verification**: Reused an isolated managed worktree checked out at `123d31c`, with dependencies linked from the already installed local package. TypeScript typecheck passed. The first test run found three document tests that required unpublished docs; removing them from the candidate yielded 336 passing test files and 2,799 passing tests. A clean-candidate build produced the exact 74-entry `SHA256SUMS.txt` already checked in at the root. Bundle-budget and publication safety checks passed (4/4). The candidate Git tree contains 1,033 `frontend/` files, zero paths under `sample csv/`, `tests/benchmark/`, or internal `docs/`, and no key-shaped strings matching the targeted private-key, OpenAI, Google, AWS, or GitHub token patterns.
- **Known limits / next decision**: Source-code ownership/publication still needs the user's explicit business decision because the source came from a PRIVATE backup; no scan can grant publication rights. The public candidate has fewer regression tests than the original local suite because private corpus-dependent tests are not included. The clean-checkout build reused installed dependencies rather than repeating a fresh `npm ci`. Imported source has pre-existing trailing-whitespace warnings in `git diff --check`; this structural preparation did not reformat application code. Keep the candidate local until publication is authorized, then review its final diff and remote destination again before any push.

## 2026-09-27 Publish Filtered React Source to Main

- **User authorization / goal**: The user explicitly requested “setup git ignore and commit and merge to main” after reviewing the local source candidate and its private-data exclusions. This provided the previously pending public-publication decision for the filtered source, not for the local business CSV corpus or operator-only files.
- **Ignore protection**: Expanded `frontend/.gitignore` to cover the 64 local business CSV files, benchmark snapshots, internal planning notes, local configuration, and the exact corpus-dependent or operator-only tests/scripts omitted from the public candidate. Before push, `git ls-files --others --exclude-standard` returned zero, and targeted `git check-ignore` checks confirmed representative CSV, benchmark, test, and operator-config files were ignored while the retained gateway helper remained tracked.
- **Final source audit**: Candidate commit `34bfa25` held 1,033 tracked `frontend/` files with zero paths under `sample csv/`, `tests/benchmark/`, or internal `docs/`. The targeted scan found zero files matching private-key, OpenAI, Google, AWS, or GitHub token shapes. The checked-in static `index.html`, bundles, service worker, and checksum manifest were unchanged. This is a targeted audit, not a guarantee against every possible sensitive value.
- **Published commits**: Pushed `codex/react-source-public-prep` and merged [PR #2](https://github.com/yapweijun1996/CSV-Data-Analysis-Agent/pull/2) into remote `main` at merge commit `7142b679c8c744cc8e27d228e28c4681cf3802b4`. A documentation follow-up corrected the README and AGENTS descriptions from “candidate” to current public state; [PR #3](https://github.com/yapweijun1996/CSV-Data-Analysis-Agent/pull/3) merged at `97571f2d5e68eec67bf8767874984095eed1da7a`. The primary local `main` now tracks that same remote commit.
- **Verification and deployment**: The isolated public-source checkout passed 336 test files / 2,799 tests, TypeScript typecheck, bundle budget, four publisher/stager tests, and rebuilt the exact 74-entry deployment checksum manifest. GitHub reports both PRs `MERGED`; final remote `main` contains `frontend/.gitignore` and zero private corpus or benchmark paths. The Pages workflow has no runs; the live site still returns HTTP 200. The source merge did not deploy a new website version.
- **Local-only state**: Private CSVs, internal docs, and omitted tests remain locally ignored rather than deleted. `context.md` retains this conversation record as an uncommitted local modification; it was not part of the public PRs. Future additions to the public source still need a data/credential review before push.

## 2026-09-27 Pi Browser Lab Integration

- **User choice / goal**: Execute Option B: connect the validated browser-only Pi spike to the canonical React application, keeping the existing Agrun report/chat flow intact. Work is in managed worktree `codex/pi-react-integration` based on clean `main`.
- **Architecture decision**: Add an optional Pi Browser Lab in the Assistant header after a CSV is loaded. Its Pi agent owns only a read-only inspect/aggregate question loop. It takes the active React dataset and column registry from the existing store and delegates full-dataset queries to the existing DuckDB query engine, including file-backed datasets. This avoids a second CSV parser or dataset state owner. The tool limits each response to 30 groups and six filters. Main chat and reports continue through Agrun.
- **Provider and privacy**: Mock mode runs a real Pi tool cycle without a key or provider call. Live mode uses the OpenAI BYOK value already saved in Settings, fixed `gpt-5.4-mini` / medium reasoning, and the existing cloud AI consent gate. No key was added to source or deployment output. The live mode was not re-run because the prior local key was exposed during the spike and needs rotation.
- **Verification**: The focused Pi tests pass (2 files / 5 tests): backed row count, bounded DuckDB query plan compilation, invalid-filter rejection, a complete keyless Pi inspect → aggregate → answer cycle, and a React dialog mock cycle. React typecheck and lint passed. The full frontend suite passed 337 files / 2,802 tests before the final focused test was added. Final `publish:root` passed after the source changes and produced 76 checksum-verified deployment entries; bundle budget and four publication tests passed. The generated app-agent bundle contains the invalid-filter guard, and `git diff --check` passed. A static browser load mounted the React upload page, and a synthetic CSV entered intake through its documented same-origin bridge with external HTTPS blocked. The main flow then requested structure review after provider consent was declined, so the Pi modal itself was verified through the React component test rather than that browser flow. A live OpenAI turn remains unverified after the prior key exposure.
- **Current state**: Source, tests, docs, and checksum-verified deployment output are committed locally on `codex/pi-react-integration`; the worktree is clean. No push, PR, Pages workflow dispatch, or live OpenAI request was made. The earlier standalone spike and its `.env.example` remain in the separate `codex/pi-browser-spike` worktree.
