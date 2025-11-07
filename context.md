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
- **Follow-up**: Deterministic cleanup now reports both context-row removal and summary-row removal into the workflow timeline via `completeWorkflowStep`, keeping Raw Data Explorer actions auditable.
- **Open Questions / TODO**:
  1. Should we auto-augment `dataForAnalysis.data` with canonical header aliases before invoking AI JS to reduce mapping errors?
  2. Would adding a guardrail that scans `jsFunctionBody` for `_util.applyHeaderMapping` (or forbidding `HEADER_MAPPING.column`) prevent the undefined `includes` crash?
  3. Need proposal for deterministic fallback steps when AI returns non-array; e.g., auto-run helper pipeline based on stage plan instead of skipping.
- **Next Step**: Provide bilingual review + action options covering ingestion flow, prompt/pipeline gaps, and mitigation ideas for the reported errors.
