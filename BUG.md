# Review bug register

Observations are reviewer reports, not automatically confirmed product defects. See the [review archive](docs/reviews/2026-10-30-25-persona-review.md) and [task backlog](TASK.md).

Confirmed production P0 at review time: 0

Statuses: `confirmed` = reproduced or established defect; `candidate` = plausible but unconfirmed; `needs-reverify` = source contradicts or materially qualifies the report; `fixed-verified` = fix independently checked; `wontfix` = explicitly declined.

## BUG-001 — Vitest asset setup
- Severity: P2 QA environment. Status: confirmed (test setup, not product).
- Evidence: review S01 reports one missing public WASM before preparation and S02 reports 32/32 after build; these are reviewer claims, not a full clean rerun. `frontend/package.json:11-13,22` prepares build/dev assets but not test assets.
- Suspected code area: `frontend/tests/duckDbSqlSecurity.test.ts:88-91` hashes the prepared public WASM; `frontend/package.json:22` invokes Vitest without preparation.
- Workaround: prepare build assets before Vitest as in the review. Linked task: [CA-175](TASK.md#ca-175--vitest-build-asset-preflight). Next: reproduce on a fresh clone.

## BUG-002 — A60 grouped timeout
- Severity: P2 QA harness flakiness. Status: candidate.
- Evidence: reviewer reports grouped timeout and standalone pass; `frontend/scripts/pi-dual-grain-browser-smoke.mjs:25,223-226` contains A60 and retention/reload actions, not proof of a cause.
- Suspected code area: `frontend/scripts/pi-dual-grain-browser-smoke.mjs:223-226`.
- Workaround: run the A60 scenario alone as reported. Linked task: [CA-176](TASK.md#ca-176--bounded-a60-retainrecovery-regression). Next: repeat bounded grouped and standalone runs with timings.

## BUG-003 — Assistant textarea name
- Severity: P2 accessibility. Status: candidate.
- Evidence: reviewer DOM heuristic reports no explicit name; `frontend/components/chat/ChatComposer.tsx:453-463` shows no explicit label attribute on the textarea. Its computed accessible name and assistive-technology behavior remain unverified.
- Suspected code area: `frontend/components/chat/ChatComposer.tsx:453-463`.
- Workaround: NOT FOUND; keyboard and screen-reader use must be assessed. Linked task: [CA-177](TASK.md#ca-177--accessible-assistant-and-mobile-close). Next: inspect the accessibility tree and test with a screen reader.

## BUG-004 — Mobile first paint
- Severity: P2 UX. Status: candidate.
- Evidence: reviewer reports one immediate white screenshot; `frontend/App.tsx:303-310` uses a null Suspense fallback for ChatPanel. This does not establish a persistent defect.
- Suspected code area: `frontend/App.tsx:308-310`.
- Workaround: wait for the lazy panel to load; not independently verified. Linked task: [CA-178](TASK.md#ca-178--mobile-assistant-first-paint). Next: repeat timed cold/warm opens.

## BUG-005 — Mobile close verification
- Severity: P2. Status: needs-reverify.
- Evidence: reviewer only observed Escape and did not verify a close control. `frontend/components/chat/ChatPanelHeader.tsx:74-77` defines a named hide button with 44px minimum dimensions; visibility and operation on mobile remain unverified.
- Suspected code area: `frontend/components/chat/ChatPanelHeader.tsx:74-77`.
- Workaround: Escape was reported to close the panel; touch-only workaround not verified. Linked task: [CA-177](TASK.md#ca-177--accessible-assistant-and-mobile-close). Next: inspect and activate the button on a mobile viewport and with assistive technology.

## BUG-006 — Mixed-unit aggregation
- Severity: P1 decision integrity. Status: candidate.
- CA-189a source-only partial mitigation: chat structured single-column sums/averages infer a unique named unit companion and show inferred provenance; mixed/missing units refuse with a chat message. Accepted validated bindings retain precedence. Ambiguous companions are not guessed.
- 2026-10-31: two built-app Chromium runs uploaded synthetic CSVs through the file input and exercised the managed query entry: mixed-unit refusal, filtered sum 7 with inferred metadata, unitless sum 11 and counts 4/2 passed. Chat refusal, displayed totals, provenance label and counts are NOT_REACHED; the harness blocks external requests and does not use a live LLM. This is not real-chat acceptance.
- CA-189b source-only partial mitigation: spreadsheet flat/pivot groups and full-scope totals suppress mixed/missing inferred companion units (`frontend/components/spreadsheet/GroupByTest.tsx:73-95,167-196`); analysis worker dispatch uses guarded core (`frontend/services/workers/dataWorker.ts:32-33`, `frontend/services/agent/execution/executors/aggregationCore.ts:44-70`). Synthetic isolated component rendering is not a real-user upload/UI or worker check. BUG-006 remains a candidate, not fixed-verified.
- Next: verify real-user chat/worker/spreadsheet behavior and complete version-bound unit custody across remaining routes. Linked task: [CA-181](TASK.md#ca-181--currency-unit-and-decimal-precision).

## BUG-007 — Local-data deletion may silently be incomplete
- Severity: P1 privacy. Status: candidate.
- Fix implemented, unverified: `frontend/services/storageService.ts:410-430,518-526,556-603` reports incomplete web/cache storage; `frontend/components/modals/SettingsModal.tsx:158-175,522-528` warns without reloading. Failure injection: `frontend/tests/storageClearAllLocalData.test.ts:73-124` and `frontend/tests/settingsModal.test.tsx:120-159`.
- Next: independently verify IndexedDB, web storage, OPFS and cache read-back, including browser failure paths. Linked task: [CA-180](TASK.md#ca-180--local-only-cloud-consent-and-retention-disclosure).

## BUG-008 — Technical diagnostic text may expose input-derived errors
- Severity: P2 privacy. Status: candidate.
- Fix implemented, unverified: `frontend/components/modals/ReportBoundaryConfirmModal.tsx:25-36,143-153,319-326` allowlists codes and messages and replaces unknown input with a localized fallback; `frontend/tests/reportBoundaryConfirmModal.test.tsx:274-329` exercises synthetic sentinels and safe diagnostics.
- Next: independently verify the complete upload-to-review path and comprehensive disclosure. Linked task: [CA-182](TASK.md#ca-182--safe-guidance-for-boundary-diagnostics).

## BUG-009 — Spreadsheet unguarded average totals
- Severity: P1 decision integrity. Status: candidate.
- Source evidence: without an inferred unit companion, flat grand totals add group averages (`frontend/components/spreadsheet/GroupByTest.tsx:98-116`); pivot totals add rounded cells rather than recomputing the underlying average (`frontend/components/spreadsheet/GroupByTest.tsx:200-258`). Runtime reproduction not yet performed.
- Next: independently reproduce with synthetic unequal-sized groups and define a compatible correction. Linked task: [CA-190](TASK.md#ca-190--exact-decimal-arithmetic-parity).

## BUG-010 — Exact decimal AVG uses DOUBLE
- Severity: P1 decision integrity. Status: candidate.
- The compiler emits native AVG for exact columns (`frontend/services/duckdb/queryCompiler.ts:540-574`). A local DuckDB WASM query using `DECIMAL(24,0)` inputs 2 and 3 returned `typeof(avg(x)) = DOUBLE` and `avg(x) = 2.5`; end-to-end accepted-table impact remains unverified.
- Next: preserve exact scale and use a bounded half-even average, refusing unsupported paths. Linked task: [CA-190](TASK.md#ca-190--exact-decimal-arithmetic-parity).
