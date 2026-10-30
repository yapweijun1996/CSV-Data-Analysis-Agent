# Review task backlog

Follow-up work from the [review archive](docs/reviews/2026-10-30-25-persona-review.md); source evidence is not acceptance proof. See [bugs](BUG.md).

Statuses: `pending` = not established; `partial` = some scope exists; `implemented-unverified` = implementation identified but acceptance not checked; `verified-complete` = acceptance tested; `blocked` = prerequisite prevents progress; `obsolete` = no longer applicable.

## CA-175 — Vitest build-asset preflight
- Priority: P2. Status: pending. Source: backlog 5, observation 4, P15 P17.
- Acceptance: a fresh clone runs Vitest without a false missing-WASM failure after one preparation flow.
- Evidence: `frontend/package.json:11-13,22` prepares assets before build/dev but has no test preflight; `frontend/tests/duckDbSqlSecurity.test.ts:91` hashes the prepared public WASM.
- Blockers: none identified. Next: reproduce the original failing test in a clean environment and implement a bounded preflight. Related: [BUG-001](BUG.md#bug-001--vitest-asset-setup).

## CA-176 — Bounded A60 retain/recovery regression
- Priority: P2. Status: pending. Source: backlog 5, observation 3, P15 P17.
- Acceptance: repeated A60 retain/recovery runs complete without hanging.
- Evidence: `frontend/scripts/pi-dual-grain-browser-smoke.mjs:25,223-226` includes A60 and retention/reload; grouped repeatability is unverified.
- Blockers: root cause unverified. Next: run bounded repeated grouped and standalone scenarios, capture timings. [BUG-002](BUG.md#bug-002--a60-grouped-timeout).

## CA-177 — Accessible Assistant and mobile close
- Priority: P1. Status: pending. Source: backlog 4, observations 2 and 5, P21 P22 P23.
- Acceptance: real keyboard and screen-reader checks pass; named, visible, touch-sized mobile close works without Escape.
- Evidence: `frontend/components/chat/ChatComposer.tsx:453-463` has no explicit label on the textarea; `frontend/components/chat/ChatPanelHeader.tsx:74-77` defines a named 44px minimum hide button. Actual accessibility tree and touch reachability unverified.
- Blockers: manual assistive-technology verification outstanding. Next: inspect accessible names and exercise complete keyboard, screen-reader and mobile close flows. [BUG-003](BUG.md#bug-003--assistant-textarea-name), [BUG-005](BUG.md#bug-005--mobile-close-verification).

## CA-178 — Mobile Assistant first paint
- Priority: P2. Status: pending. Source: observation 1.
- Acceptance: repeat immediate and delayed opens and verify lazy-load first paint and recovery.
- Evidence: `frontend/App.tsx:303-310` renders lazy ChatPanel under a null Suspense fallback; blank duration is unverified.
- Blockers: none identified. Next: record repeated cold/warm mobile opens with timings. [BUG-004](BUG.md#bug-004--mobile-first-paint).

## CA-179 — Candidate, validation and approval evidence
- Priority: P1. Status: pending. Source: backlog 1, P01 P04 P06 P10 P11 P12 P14 P18.
- Acceptance: acceptedCommit is empty before approval; per-column source evidence and row counts are explicit, including business-row grain.
- Evidence: `frontend/scripts/header-repair-bridge-browser-smoke.mjs:35-44` asserts no accepted commit before approval; `frontend/components/task/TaskInspection.tsx:40-56` exposes task and committed version. Unified summary coverage not established.
- Blockers: none identified. Next: map the existing review UI against each evidence and grain requirement.

## CA-180 — Local-only, cloud consent and retention disclosure
- Priority: P1. Status: pending. Source: backlog 2, P02 P09 P16 P17.
- Acceptance: refusing cloud still allows local preview; deletion and storage scope have independent read-back; explain sensitive-field handling.
- Evidence: `frontend/components/DatasetRecoveryPanel.tsx:85` explains optional retained rows; `frontend/scripts/local-preview-browser-smoke.mjs:92-94` inspects local preview state. Complete privacy disclosure and independent read-back not established.
- Blockers: privacy and sensitive-data review outstanding. Next: inventory disclosures, consent, deletion and storage with independent verification.

## CA-181 — Currency, unit and DECIMAL precision
- Priority: P1. Status: pending. Source: backlog 3, P03 P08 P13.
- Acceptance: mixed units are never summed silently; exact numeric queries are consistent.
- Evidence: `frontend/scripts/exact-decimal-period-browser-smoke.mjs:46-49,100-109` checks a bounded exact-decimal period and rejects mixed units. General coverage remains unverified.
- Blockers: none identified. Next: map all aggregation paths and independently test mixed units and precision boundaries.

## CA-182 — Safe guidance for boundary diagnostics
- Priority: P2. Status: pending. Source: backlog 6, P05 P19.
- Acceptance: users understand the next step and no raw CSV cell leaks.
- Evidence: `frontend/services/agent/fileProcessor.ts:519-521` emits source scan diagnostics; `frontend/services/agent/reportStructureResolver.ts:397-398` records runtime ambiguity; `frontend/components/modals/ReportBoundaryConfirmModal.tsx:44` checks one reason.
- Blockers: user-facing coverage and privacy unverified. Next: trace both codes through UI and test sanitized guidance.

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
