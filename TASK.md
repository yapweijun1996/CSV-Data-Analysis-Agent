# Review task backlog

Follow-up work from the [review archive](docs/reviews/2026-10-30-25-persona-review.md); source evidence is not acceptance proof. See [bugs](BUG.md).

Statuses: `pending` = not established; `partial` = some scope exists; `implemented-unverified` = implementation identified but acceptance not checked; `verified-complete` = acceptance tested; `blocked` = prerequisite prevents progress; `obsolete` = no longer applicable.

## CA-175 — Vitest build-asset preflight
- Priority: P2. Status: implemented-unverified. Source: backlog 5, observation 4, P15 P17.
- Acceptance: a fresh clone runs Vitest without a false missing-WASM failure after one preparation flow.
- Evidence: `frontend/package.json:22-23` runs `scripts/prepare-frontend-assets.mjs` before Vitest.
- Blockers: fresh-clone acceptance not independently established. Related: [BUG-001](BUG.md#bug-001--vitest-asset-setup).

## CA-176 — Bounded A60 retain/recovery regression
- Priority: P2. Status: implemented-unverified. Source: backlog 5, observation 3, P15 P17.
- Acceptance: repeated A60 retain/recovery runs complete without hanging.
- Evidence: `frontend/scripts/pi-a60-repeat-smoke.mjs:4-24` runs standalone A60 with per-run timing and a hard timeout.
- Blockers: repeated grouped acceptance remains unverified. Related: [BUG-002](BUG.md#bug-002--a60-grouped-timeout).

## CA-177 — Accessible Assistant and mobile close
- Priority: P1. Status: implemented-unverified. Source: backlog 4, observations 2 and 5, P21 P22 P23.
- Acceptance: real keyboard and screen-reader checks pass; named, visible, touch-sized mobile close works without Escape.
- Evidence: `frontend/components/chat/ChatComposer.tsx:453-456`, `frontend/components/chat/ChatPanelHeader.tsx:73-77`, and `frontend/tests/chatPanelBehavior.test.tsx:89-100`.
- Blockers: manual assistive-technology verification outstanding. Related: [BUG-003](BUG.md#bug-003--assistant-textarea-name), [BUG-005](BUG.md#bug-005--mobile-close-verification).

## CA-178 — Mobile Assistant first paint
- Priority: P2. Status: implemented-unverified. Source: observation 1.
- Acceptance: repeat immediate and delayed opens and verify lazy-load first paint and recovery.
- Evidence: `frontend/App.tsx:300-310` renders a localized status while the lazy ChatPanel loads.
- Blockers: repeated cold/warm mobile acceptance unverified. Related: [BUG-004](BUG.md#bug-004--mobile-first-paint).

## CA-179 — Candidate, validation and approval evidence
- Priority: P1. Status: partial. Source: backlog 1, P01 P04 P06 P10 P11 P12 P14 P18.
- Acceptance: acceptedCommit is empty before approval; per-column source evidence and row counts are explicit, including business-row grain.
- Exists: `frontend/scripts/header-repair-bridge-browser-smoke.mjs:35-44` asserts no accepted commit in its initial approval scenario (not run here); `frontend/components/task/TaskInspection.tsx:52-56,107-133` shows committed state, counts, validation and dual-grain relationships.
- Missing: the bounded projection drops general column mappings (`frontend/services/agent/runtime/pi/piTaskInspection.ts:113-129`); other candidate lanes lack a unified business-grain and included/excluded count explanation. An existing prior commit must be distinguished from a new uncommitted candidate. Next: design a review-bound evidence projection with explicit unavailable/truncated states and test initial, prior-commit and all candidate lanes.

## CA-180 — Local-only, cloud consent and retention disclosure
- Priority: P1. Status: partial. Source: backlog 2, P02 P09 P16 P17.
- Acceptance: refusing cloud still allows local preview; deletion and storage scope have independent read-back; explain sensitive-field handling.
- Exists: refusal stops cloud calls (`frontend/services/privacy/cloudAiConsent.ts:150-174`); import degrades locally (`frontend/services/agent/orchestration/fileOrchestrator.ts:617-621`) and offers preview (`frontend/components/AnalysisPanel.tsx:435-437`). Storage disclosure is at `frontend/utils/localization.ts:1524-1528`; sensitive scan limits and lack of masking are now disclosed at `:1536-1540`, with consent version bumped (`cloudAiConsent.ts:9`).
- Deletion failure reporting: `frontend/services/storageService.ts:410-430,556-603`, `frontend/components/modals/SettingsModal.tsx:158-175,522-528`; injected failure cases: `frontend/tests/storageClearAllLocalData.test.ts:73-124`, `frontend/tests/settingsModal.test.tsx:120-159`.
- Browser evidence: PASS clear failure warning and no reload: Local data could not be fully cleared. Close other app tabs and retry. Not fully cleared: local storage.
- Browser evidence: PASS normal clear reload: main frame reloaded; window marker cleared.
- Missing: independent deletion/storage read-back and provider retention scope. Next: verify IndexedDB, web storage, OPFS and cache read-back, including failures and provider-side policy ([BUG-007](BUG.md#bug-007--local-data-deletion-may-silently-be-incomplete)).

## CA-181 — Currency, unit and DECIMAL precision
- Priority: P1. Status: partial. Source: backlog 3, P03 P08 P13.
- Acceptance: mixed units are never summed silently; exact numeric queries are consistent.
- Exists: validated decimal period columns require matching units (`frontend/services/duckdb/queryCompiler.ts:522-533`); weighted statistics check supplied units (`frontend/services/agent/execution/weightedMean.ts:19-23`). Source-only single-column sum/avg row-unit guards now exist in DuckDB and in-memory query paths (`frontend/services/duckdb/queryCompiler.ts:717-748`, `frontend/services/agent/execution/dataQueryExecutor.ts:386-390`).
- Missing: spreadsheet totals and separate worker analysis aggregation remain unguarded (`frontend/components/spreadsheet/GroupByTest.tsx:48-72,116-163`, `frontend/services/workers/dataWorker.ts:32-35`); ordinary numeric SQL uses DOUBLE (`frontend/services/duckdb/numericSql.ts:55-56`). Full unit meaning/result presentation and precision remain open; see [BUG-006](BUG.md#bug-006--mixed-unit-aggregation).
- Design: [unit and decimal policy](docs/design/ca-181-unit-and-decimal-policy.md); staged work: CA-187–CA-190.
- Verification run (2026-10-30, local Chromium against the built main, 127.0.0.1 only): `frontend/scripts/exact-decimal-period-browser-smoke.mjs` passed for compatible, mixed-types and mixed-units scenarios with 0 page errors and 0 external requests. This covers the exact-decimal period path only; other aggregation paths remain unverified.

## CA-182 — Safe guidance for boundary diagnostics
- Priority: P2. Status: partial. Source: backlog 6, P05 P19.
- Acceptance: users understand the next step and no raw CSV cell leaks.
- Exists: `frontend/services/agent/fileProcessor.ts:511-522` blocks on source anomalies; `frontend/components/CsvSourceScanPanel.tsx:39-47` now gives correction/re-import guidance and displays structural coordinates, not cells. `frontend/services/agent/reportStructureResolver.ts:397-398` emits the runtime ambiguity code; `frontend/components/modals/ReportBoundaryConfirmModal.tsx:123-129,261-264` renders a localized reason and action.
- Diagnostic sanitization: `frontend/components/modals/ReportBoundaryConfirmModal.tsx:25-36,143-153,319-326`; expanded-detail synthetic sentinel and safe-message cases: `frontend/tests/reportBoundaryConfirmModal.test.tsx:274-329`.
- Browser evidence: PASS ragged upload scan guidance and privacy: source scan guidance visible; sentinel absent before and after expanding details.
- Browser evidence: NOT_REACHED multi-section boundary technical privacy: boundary confirm modal with Technical details not reached through real upload; no state injected. Technical diagnostics remain unverified by this browser check.
- Missing: independent end-to-end browser and comprehensive disclosure verification. Next: verify the complete upload-to-review path and technical details with synthetic inputs ([BUG-008](BUG.md#bug-008--technical-diagnostic-text-may-expose-input-derived-errors)).

## CA-183 — Download, offline and stress coverage
- Priority: P2. Status: pending. Source: backlog 7, P20 P24.
- Acceptance: low-bandwidth/offline offers a visible recovery hint; Worker and RSS peaks are monitored during long-running and large-file tests.
- Evidence: `frontend/components/PwaUpdateButton.tsx:32-46` handles update state and disables checks offline; `frontend/scripts/pi-dual-grain-browser-smoke.mjs:26-27` samples browser heap. Cold-start recovery and total process resources unverified.
- Blockers: suitable offline and resource instrumentation needed. Next: exercise first download, cold offline and bounded stress with worker/RSS monitoring.

## CA-184 — Real-model and real-data gate
- Priority: P2. Status: pending. Source: backlog 8, P07 P14 P25.
- Acceptance: release report states scope, denominators and failure types; synthetic samples do not replace real validation.
- Evidence: `frontend/scripts/coding-agent-evaluation/runner.mjs:37-40` records a mock campaign; it does not establish real-model quality.
- Blockers: authorized real provider and appropriate real-data access required. Next: define a privacy-preserving gate and report actual outcomes.

## CA-185 — Firefox and WebKit verification
- Priority: P2. Status: pending. Source: coverage gap S11.
- Acceptance: exercise supported critical flows in Firefox and WebKit with matching browser binaries and report failures and scope.
- Evidence: `frontend/scripts/production-startup-browser-smoke.mjs:1,8` launches Chromium; this does not establish other engines.
- Blockers: matching browser binaries reported absent. Next: obtain approved local binaries and run equivalent scenarios.

## CA-186 — Version-bound convenience features
- Priority: P3. Status: pending. Source: backlog 9, P06 P07 P10 P11 P12 P13 P18.
- Acceptance: schema/audit exports, cohorts, named SQL, school templates and versioned saves bind to a controlled dataset version.
- Evidence: `frontend/components/task/TaskExport.tsx:25-28` offers a task bundle; `frontend/services/agent/execution/analysisSkillExecutor.ts:835-850` implements a cohort path; `frontend/components/dashboard/ReportDelivery.tsx:172-175` lists report templates. Requested complete version-bound set is unverified.
- Blockers: none identified. Next: inventory existing features and version custody before specifying gaps.

## CA-187 — Bind reviewed unit meaning
- Priority: P1. Status: partial. Source: CA-181.
- Acceptance: version-bound confirmed or inferred fixed/row units reject stale, blank, ambiguous and conflicting evidence; inferred units are visibly labelled wherever guarded results are shown.
- Exists: standalone contract and header inference (`frontend/services/data/unitMeaning.ts:1-51`); validated metric/backing units carry provenance/source with legacy confirmed/user defaults (`frontend/services/data/candidateValidation.ts:5`, `frontend/types/intake.ts:235-236`, `frontend/services/duckdb/queryEngine.ts:528-541`).
- Missing: visible inferred-unit labels and complete version-bound meaning integration. Inferred accepted row bindings and inferred exact-period units fail closed (`frontend/services/duckdb/queryEngine.ts:484-500`); the existing period guard still accepts identical nonblank strings (`frontend/services/duckdb/queryCompiler.ts:522-533`).
- Next: integrate version-bound inferred meaning and presentation without changing legacy period behavior.

## CA-188 — Guard query and worker aggregation units
- Priority: P1. Status: partial. Source: CA-181; depends on CA-187.
- Implemented-unverified slice: accepted row bindings and explicit aggregate `unitColumn` guard single-column sum/avg per filtered group. CA-189a additionally infers a unique named companion for chat structured queries with visible traces; other routes and ambiguous candidates remain unchanged (`frontend/services/duckdb/queryEngine.ts:510-525`, `frontend/services/agent/execution/dataQueryExecution.ts:280-281`).
- Missing: full coverage of other aggregate paths, inferred accepted/fixed-unit integration, and independent real browser/worker acceptance. Separate worker analysis and spreadsheet totals remain unguarded.

## CA-189 — Guard spreadsheet aggregation and totals
- Priority: P1. Status: partial. Source: CA-181; depends on CA-187.
- CA-189a source-only slice wires deterministic chat query companions and localized inferred labels/refusals; no real-browser verification. Ambiguous columns are not guessed.
- Acceptance remains open: spreadsheet groups and every subtotal/grand total must respect units; averages use underlying counts. Next: handle pivot, hidden groups and explicitly split totals.

## CA-190 — Exact decimal arithmetic parity
- Priority: P1. Status: pending. Source: CA-181; depends on CA-187–CA-189.
- Acceptance: supported routes agree on exact sums and rounded averages; overflow never falls back to DOUBLE.
- Next: qualify precision, scale, serialization and fail-closed unsupported paths.
