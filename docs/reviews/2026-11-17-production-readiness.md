# Production readiness review — 2026-11-17

## Verdict and scope

**Full production readiness remains unqualified.** The initial checkout failed local queries; the remediation and subsequent checks below supersede that baseline only within their stated scope.

Chrome DevTools MCP tested the checked-in root at `http://127.0.0.1:4201/`, isolated context `csv-production-review-20261117`. HEAD: `6823938e48d27d97191a92c8cc5db9909e2760ba`; UI build `v1.0.0 · 112db61`; Chrome 157 on Windows. Python static serving does not reproduce hosting security headers. No new build or public-site test occurred.

## Initial baseline checks

| Check | Result | Observed evidence |
| --- | --- | --- |
| Clean startup | PASS, bounded | Upload controls and Assistant appeared, no startup console warnings/errors. Actual file-picker upload blocked by tool path access. |
| Built-in COE import | PASS | Real UI selection; 81,090 bytes and 1,991 logical records scanned; 1,990 workspace rows. |
| Refuse cloud | PASS, bounded | Local-only selection produced explicit no-cloud-analysis messages. Observed request lists contained loopback/blob requests only; not a comprehensive privacy audit. |
| Local preview and Retry | FAIL | 0/7 columns; `DuckDB session is not ready. Rebind the session and retry.` Retry also failed. No query results obtained. |
| Engine initialization | FAIL | Console: `sql_wasm_integrity_failed`, despite HTTP 200 for WASM and worker. |
| Manifest | FAIL | 109 entries: 7 raw-byte matches, 102 mismatches, zero missing. All 102 match after diagnostic in-memory CRLF-to-LF normalization. No files rewritten. |
| Warm reload | PARTIAL | Booted with controlling service worker; required original CSV reattachment and disabled Explorer. Assistant nevertheless claimed unfinished cleaning after local-only import. Reattachment untested. |
| Narrow-screen Assistant | PASS, bounded | At effective 500px, Hide Panel worked. At emulated 390x844 touch/mobile, Assistant opened, close control measured 44x44, Escape closed it and returned focus to its opener. Document width equalled viewport width. |

## P1: Windows checkout changes integrity-pinned resources

`.gitattributes` uses `* text=auto`, this machine has `core.autocrlf=true`, and the worker has no explicit `eol`. Raw EH worker SHA-256: `aee1c7ec0e789295986000b4656c482575fc613af66a681cd1439b1f2bb8c041`. LF-normalized: `5b676545e095f06e0ca10eec23a2d3ba6375dacfd31a1cb2f07aba8be3e56910`, matching `DUCKDB_WORKER_SHA256.eh` in `frontend/services/duckdb/sqlSecurity.ts`.

`frontend/services/workers/duckDbWorker.ts` checks WASM and worker bytes with the same integrity helper/error. This identifies the worker-byte mismatch, not corrupt WASM. Qualify the remedy with a fresh LF-preserving checkout and a successful real query. Preserve integrity enforcement. CA-191.

## P2: Inconsistent recovery guidance

After reload, Assistant said `Restored an unfinished cleaning run` and offered Continue cleaning, although this journey had only performed local import. Main view correctly required source reattachment. Internal cause and Continue cleaning effects were not tested; this is not evidence of unauthorized processing. CA-192.

## Coverage limits

- Chrome DevTools upload rejected the fixture path as outside its configured workspace roots. No bypass attempted. Complex headers, totals, rejection/approval and numerical correctness remain untested here.
- Dependencies absent; Node v25.2.1 is outside required `>=22.13 <23`. No source unit/type/lint/build runs or package installation.
- No live AI, private data, insight/chart/pivot correctness, exports, deletion read-back, offline/stress, Firefox/WebKit or screen-reader qualification.
- Existing acceptance gaps remain open. Resolve CA-191, rerun local queries against an independent numerical oracle, then complex report/approval/recovery cases. CA-184 owns authorized real-model qualification.

No application source, generated bundle or integrity policy changed; no release/deployment. This is a bounded browser review, not a complete passing E2E suite.

## Authorized remediation and control run

After the initial review, the owner authorized amendments, focused tests, main-branch push and deployment, plus bounded OpenAI testing with GPT-6 Luna. The initial findings above remain the baseline.

CA-191 adds byte-preserving Git attributes for manifest-managed deployment resources. A temporary index using those attributes restored only verified CRLF-only differences from HEAD; all 109 manifest entries now match, with no generated-content diff. Integrity hashes/checks remain unchanged.

The first archive-based control still inherited converted bytes and reproduced the failure. After replacing mismatching temporary-site files with exact Git blob bytes, a fresh isolated Chrome context imported the same COE demo (79,099 LF bytes, 1,990 rows). View data (local) returned **25 rows, 7/7 columns, total 1,990**, with no integrity error. This establishes the byte-mismatch cause and bounded local-preview recovery, not full analytical correctness.

Focused release tests passed 4/4; source typecheck passed using Node 22.23.0. Further recovery/model/release evidence will be recorded separately rather than rewriting the failed baseline.

### Intermediate build 1.0.0-7b14fa8d0680

- Generated through the publisher; 109/109 manifest entries and bundle budget passed. Local COE preview again returned 25/1,990 rows and seven columns. A query with no group-by was correctly rejected by the aggregate template; no global aggregate result was claimed.
- CA-192's first patch passed the idle-state unit test but failed the real import/reload flow: persisted state was already paused with zero steps. The patch was returned for correction; do not count this intermediate build as a successful fix.
- Clear all local data was exercised through Settings in the isolated test context. After its reload, independent IndexedDB counts were zero for reports, original_data, dataset_commits, ai_consents and settings; OPFS was empty and the old filename absent. Fresh tab/report-index keys and a runtime cache were recreated by startup. This covers normal deletion, not failures, historical caches or provider retention.
- Upload-screen document widths matched 320, 390, 430, 768, 1024 and 1440px viewports. This is bounded overflow evidence, not complete visual/accessibility acceptance.
- Offline emulation was not accepted as an offline test: an uncached probe still reached the server (404) and navigator.onLine stayed true. No offline readiness claim follows.
- Focused tests: 49 cases across report boundaries, complex summary rows, storage clearing and chat behavior; 34 cases across unit meaning, worker aggregation guards and local preview intent. Settings restore 11/11 and history memory 16/16 passed. An initial combined-run timeout did not reproduce when baseline/current history tests were independently rerun; it is not labelled a proven pre-existing failure.

### Bounded live model attempt

The existing local key was used only in a separate isolated Playwright Chrome context. Exact model `gpt-6-luna` was available via official model metadata. COE import/preview and explicit OpenAI consent passed; three inference requests all used that model and returned HTTP 200, with no page errors. The final expected count was not observed within the bounded run, so analytical acceptance remains incomplete. No further inference retry was made after that run's three-request budget. The test context was closed to remove its temporary credential/state. HTTP success is not answer-quality evidence.

Harness review makes this outcome **inconclusive**, not proof of a wrong application answer: it stopped at the first nonempty new Assistant message without establishing terminal lifecycle state. Final text, usage, response bodies, blocked external domains and elapsed time were not retained; three unrelated external attempts were blocked but their purpose cannot be inferred. Preserve the three calls as consumed. Correct terminal-state observation before a separately budgeted future run; do not selectively rerun and replace this attempt with a success claim.

### Final local release: 1.0.0-89457e9eb0ea

The publisher rebuilt the canonical frontend using Node 22.23.0. All 109 manifest hashes, bundle budgets and whitespace checks passed. Cold and warm browser startup passed with operable file chooser, no page errors and no external requests in the startup harness. Full CI was intentionally not run.

Chrome DevTools MCP, isolated context `csv-final-89457`, verified the real COE demo journey: local-only consent, preview of 25/1,990 rows with seven columns (7ms), and Aggregate breakdown / Count / vehicle_class. Five groups each returned 398 (18ms), matching Python csv/Counter over the same public fixture. This proves this count, not general financial precision or business meaning.

Reload required original-source reattachment and displayed neither the false unfinished-cleaning message nor Continue cleaning. New imports now persist idle instead of paused; legacy normalization is narrowly limited to empty consent-declined placeholders. Genuine interrupted state is retained by unit tests. File reattachment remains untested because the MCP upload path was unavailable.

Final focused recovery checks covered 48 tests across cleaning state, file orchestration, settings persistence and history. The combined run initially had a wrong mock persistence assertion and a History cold-runtime import timeout. The assertion now tests the actual state seam; History mocks the unrelated Pi runtime boundary rather than importing the whole runtime. The 32 other cases and the final 16 History cases passed. This isolation does not qualify Pi checkpoint internals. Earlier 83 boundary/privacy/unit/preview tests and four release-script tests also passed. The source typecheck passed before the final test-only adjustments; its final rerun is recorded with release status below.

The UI proposal remains a reviewable static preview, not an implemented redesign. The live-model attempt above remains inconclusive and its three inference calls remain consumed.

Final typecheck passed after all source/test edits. The staged Git index independently matched all 109 manifest hashes. A bounded staged-file scan (72 files) found neither the authorized local key nor OpenAI key-shaped strings; `.env` remains ignored and unstaged.

### Published release and remaining acceptance

Commit `26504abeaa878516baafba10c19821c8179769c6` was pushed to `origin/main`. The existing manual [Pages workflow](https://github.com/yapweijun1996/CSV-Data-Analysis-Agent/actions/runs/44013051743) completed successfully; no full CI campaign was triggered. A fresh local Windows clone/checkout with `core.autocrlf=true` preserved all 109 manifest hashes and the LF frontend HTML template.

A fresh Chrome DevTools context at the [public site](https://yapweijun1996.github.io/CSV-Data-Analysis-Agent/) displayed build `89457e9`. The COE demo, local-only consent and Data Explorer preview passed online: 25/1,990 rows, seven columns, 5ms. Public reload also required source reattachment without false unfinished-cleaning or Continue cleaning guidance. This is a real deployment smoke check, not full analytical E2E qualification.

CA-191 remains partial only for original-file reattachment/rebind coverage. CA-192's reproduced false recovery message is fixed; cancellation and source identity end-to-end coverage remain open. The wider TASK backlog is not complete: representative final AI answer quality, precision/version custody across routes, complex approval/recovery, offline/stress, Firefox/WebKit and broad accessibility/design acceptance need further evidence. No credentials were committed or included in the published assets. Verified byte-preservation and local-only restore lessons were saved to KB-MCP with source references; the facade retains its default unverified metadata label.

### Cleanup rejection and execution accountability

After deployment, the execution tool's automatic safety policy rejected a PowerShell batch operation to remove temporary test directories and its helper script. The response was `blocked by policy`; no more specific rationale was supplied. The rejected command did not run. Test servers had already been stopped, and the temporary files were retained outside the repository.

This rejection applied to cleanup only. It did not prohibit further development or testing, and neither the user, KB-MCP nor GitHub blocked that work. The agent ended the preceding run early despite the owner's request to continue through TASK.md. The unfinished backlog is therefore not explained by the cleanup rejection. Preserve the verified release results, keep unmet acceptance open, and continue independent authorized work rather than treating this event as a global blocker. No cleanup retry or new runtime verification was performed for this documentation correction.
