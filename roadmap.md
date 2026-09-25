# Vanilla Frontend Roadmap

## Status snapshot — 2026-09-25

This is a source-based status snapshot, not a runtime acceptance report. No build, tests, or browser workflow were run for this document update.

### Current baseline

- The repository contains a substantial Vanilla JavaScript implementation in root-level ES modules, including CSV processing, an iterative task orchestrator, chart/analysis modules, raw-data controls, IndexedDB helpers, and memory services.
- The root `index.html` currently loads compiled application assets and a React vendor bundle into `<div id="root">`. It does not import root `main.js` or mount `<csv-data-analysis-app>`.
- Therefore, the configured root Vite/static entry is not currently the Vanilla source app. Vanilla capabilities listed above are source-level observations, not proof of browser availability or a deployed Vanilla conversion.
- Root `package.json` provides Vite `dev`, `build`, `preview`, `download:model`, and Vitest `test` scripts. Four test files contain 18 cases; they have not been run as part of this status review.
- `ENABLE_MEMORY_FEATURES` is `true`; `ENABLE_PIPELINE_REPAIR` is `false`.
- The `original/` React reference is protected and must not be modified.

## P0 — Reconcile the application entry (blocking)

**Goal:** Make the browser entry match the Vanilla conversion target before claiming React-to-Vanilla parity.

- [ ] Change the root entry/build wiring to load the Vanilla Web Component and its actual dependencies; do not rely on the current compiled React bundles.
- [ ] Resolve ownership of `PapaParse`, `Chart.js`, `idb`, and other browser globals expected by Vanilla modules. Prefer explicit, maintainable dependency wiring.
- [ ] Reconcile root `window.__CSV_AGENT_CONFIG__` with Vanilla `storageService.js` defaults so users have one predictable settings source.
- [ ] Review Vite output paths, `service-worker.js` precache entries, manifest, offline fallback, and GitHub Pages subpath behavior after the entry changes.
- [ ] Keep `original/` unchanged.

**Acceptance evidence:** `npm run dev` and `npm run preview` mount the Vanilla custom element from the root entry; browser Network/DOM inspection confirms the intended assets load and React bundles are not accidentally the active application; a static-host build works under the configured path.

## P1 — Verify critical browser workflows

**Goal:** Establish runtime evidence for source features after P0 is complete.

- [ ] Upload representative simple, multi-header, ragged, summary-row, and crosstab CSV files; verify detected headers, context metadata, and resulting rows.
- [ ] Verify Diagnose → Plan → Execute → Adjust → Verify logs, sequential tool execution, model/tool failures, retry/rollback behavior, and no-progress termination.
- [ ] Verify initial analysis, chart rendering, Top-N/Others, filtering, selection, exports, and raw-data edit/save/discard behavior.
- [ ] Verify settings/provider switching, direct provider errors, report history, and per-dataset memory persistence/deletion.
- [ ] Verify keyboard access, small viewport layout, loading/empty/error states, and service-worker/offline behavior where supported.
- [ ] Capture browser/network evidence for provider payload boundaries before making privacy claims about uploaded data.

**Acceptance evidence:** repeatable browser smoke tests with observed normal and failure states; no claim of end-to-end completion from unit tests alone.

## P2 — Security and failure boundaries

**Goal:** Make AI-assisted execution and browser persistence safe enough for the intended users.

- [ ] Decide whether generated JavaScript remains supported. It currently uses `new Function` in the page realm and is not isolated by `sandbox/python-transformation-worker.js`.
- [ ] If JavaScript transforms remain, define and test a meaningful isolation/permission boundary; otherwise restrict or remove arbitrary code execution. Do not treat CSP `unsafe-eval` as a sandbox.
- [ ] Document that provider calls are browser-to-provider and API keys are kept in `localStorage`; evaluate a credential proxy only if the product's trust model requires it.
- [ ] Exercise parsing/provider/storage errors and transformation rollback; ensure errors are visible and do not silently discard user data.
- [ ] Keep pipeline repair explicitly disabled until its audit, repair, rollback, and regression behavior is tested.

## P3 — Maintainability and regression coverage

**Goal:** Reduce change risk after the Vanilla entry is active.

- [ ] Run the existing suite with `npm test`; baseline currently comprises 4 files / 18 cases, with coverage concentrated on parser utilities, DOM actions, header mapping, and task orchestration.
- [ ] Add tests for CSV shape/header edge cases, summary-row decisions, data-preparation tool execution, analysis plans, IndexedDB helpers, and error/retry paths.
- [ ] Add browser-level coverage for upload-to-report and follow-up chat flows.
- [ ] Split the large `main.js` by responsibility only with behavior-preserving tests; keep state and workflow ownership explicit.
- [ ] Resolve remaining README/source/config discrepancies whenever behavior changes.

## P4 — Optional product expansion

These items are future possibilities, not current capabilities or committed milestones. Prioritize only after P0–P3 evidence and product need.

- [ ] Improve local retrieval/embedding quality and provide clear memory lifecycle controls.
- [ ] Add resumable or collaborative workflows only with a defined storage and privacy model.
- [ ] Add policy-governed tool integrations beyond browser-local CSV analysis only if server/security requirements are approved.
- [ ] Add autonomy, telemetry, or scheduled work only with explicit user control, privacy limits, and measurable acceptance criteria.

## Maintenance rules

- Separate source presence, root-entry reachability, and tested runtime behavior in status reports.
- Mark work complete only with the acceptance evidence listed for that phase.
- Update `README.md` and this roadmap from current code/tests after each material change.
- Do not modify `original/` as part of the Vanilla conversion.
