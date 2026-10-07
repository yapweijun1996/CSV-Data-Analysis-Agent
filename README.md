# CSV Data Analysis Agent

This repository contains a browser-only React CSV analysis app. It has an editable source package and a checked-in static deployment. No Node.js server is needed when users run the deployed app; Node.js is used to build and test the source.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `frontend/` | Canonical React/TypeScript source, tests, build configuration, and source documentation. |
| `frontend/components/`, `frontend/hooks/`, `frontend/icons/` | Browser UI and presentation helpers. |
| `frontend/store/` | Zustand state and feature slices. |
| `frontend/services/agent/` | Agent orchestration, planning, runtime, governed tools, and execution. |
| `frontend/services/ai/`, `frontend/services/data/`, `frontend/services/duckdb/`, `frontend/services/workers/` | Model providers, CSV processing, local query engine, and browser workers. |
| `index.html`, `assets/`, `service-worker.js`, `SHA256SUMS.txt` | Checked-in production build. Treat these as generated deployment files. |
| `duckdb/`, `pyodide/`, `sandbox/`, `demo-data/` | Browser runtime resources and sample data used by the static deployment. |
| `public/models/` | Optional local model files retained in the repository; the current app loads its vector model from a CDN. |
| `scripts/` | Build-resource preparation, guarded publication to the root, and verified GitHub Pages artifact staging. |

The active React source was recovered from `React-CSV-Data-Analysis-Agent-Backup`, revision `b268e31b37de94ea3b7a5b9e604ce3eca3a48e3d` (2026-07-28). Rebuilding that revision produced the same 74-file SHA-256 manifest, `index.html`, and service worker as the existing deployment. The earlier root-level Vanilla implementation and the older `original/` reference have been removed. Do not edit compiled files in `assets/` to change app behavior.

## Agent flow

`frontend/index.tsx` boots the React shell in `frontend/App.tsx`. The shell reads state from `frontend/store/useAppStore.ts`, which composes focused state slices. CSV intake enters `frontend/services/agent/orchestration/fileOrchestrator.ts`; planning and analysis run through the agent orchestration/runtime modules, with tool contracts under `frontend/services/agent/tools/` and execution under `frontend/services/agent/execution/`. The app records progress and verification in UI state and browser persistence. The main assistant and governed initial analysis use the browser Pi Harness. The shared demo gateway rejects the Responses API `max_output_tokens` field: Default-provider requests omit it at the final fetch boundary, including Pi and AI SDK calls. The Default provider no longer ships a gateway key: `frontend/services/ai/demoGatewaySession.ts` opens a short-lived `dmo_*` session (`POST /demo/session`, project id from `VITE_DEFAULT_GATEWAY_PROJECT_ID`), and the same boundary injects the bearer token, substitutes the session's model alias, and refreshes once on 401 or the session request cap. PWA updates are automatic by default: `frontend/services/pwa/pwaManager.ts` registers the worker with `updateViaCache: 'none'`, re-checks every 30 minutes and when the tab becomes visible, and applies a waiting worker as soon as the app is idle (`frontend/hooks/usePwaAutoUpdate.ts`; an import, analysis or report in flight defers it, and the existing banner keeps the manual refresh action). The header button (`frontend/components/PwaUpdateButton.tsx`) shows the build version and lets users run a manual check. The importing screen (`frontend/components/ImportProgressCard.tsx`) shows a four-step stage tracker (Upload, Parse, Analyse, Ready) derived from real app state, an indeterminate progress bar, two privacy cards, and an on-demand technical details panel; it never shows a percentage, row count or ETA because the import pipeline does not report them. The Pi follow-up agent supports skills: `frontend/services/agent/skills/builtin/<name>/SKILL.md` documents (pi harness format: `name` and `description` frontmatter plus instructions; metric choice, data-quality check, `data_query` patterns, pivot, period comparison, safe cleaning) are listed in its system prompt by name and description and loaded on demand with the `read_skill` tool; people can add their own skill files in Settings (Agent skills: import `.md` files, remove them; stored in this browser's localStorage, so "Clear all local data" removes them); precedence is built-in, then Settings skills, then workspace files `skills/<name>/SKILL.md` or `skills/<name>.md`, and a skill with the same name replaces the one below it. Its tools include the read-only diagnostics `data_missing`, `data_outliers` and `data_value_counts` next to `data_query`, `data_describe` and the workspace readers. During the initial analysis, Pi first drafts a research plan (`frontend/services/agent/runtime/pi/piResearchPlanner.ts`): it uses the read-only data tools and the metric skill, submits 2-6 structured questions, and the app validates them against the real columns (`researchPlan.ts`) before the evidence stage runs them; if planning fails, the previous topic planner runs. The evidence query planner also receives the text of the metric and query skills plus the person's own Settings skills, and Pi can create pivot, period-comparison, cohort, driver-breakdown and correlation cards in a card request. The checkpoint keeps Pi's research plan so a resumed run continues with it. While the initial analysis runs, the status card shows the working dataset's real row count and a "Stop analysis" button that cancels the run and keeps the last stable dataset. In the initial analysis Pi may skip the optional cleaning stages when the facts show clean data (the host refuses to skip required stages), and when a Pi research plan drove the run, Pi also designs each evidence query with the read-only data tools and skills (`frontend/services/agent/runtime/pi/piEvidencePlanner.ts`), validated by the same SQL evidence validator; if that fails the previous planner runs. Direct OpenAI requests keep their normal model settings. The optional Pi Browser Lab remains a separate read-only tool loop over the active React dataset.

When the user explicitly asks the main assistant to create a dashboard card, Pi can call the governed `analysis.create_plan` action. The turn succeeds only after the new card exists in app state; the dashboard switches to Explore so the card is visible, and chat links to it. Other follow-up requests retain the bounded read-only tool set. A query table in chat alone does not count as a created card.

Dashboard cards distinguish additive measures (`sum`, `count`) from averages and other non-additive measures. Top N on an average card shows only the selected groups; it does not invent an `Others` average, sum group averages, or display each average as a share of that sum. Dense average comparisons default to a horizontal bar chart, and the full chart scrolls vertically so labels remain readable. The table exposes the full grouped values. Temporal average trends can still use line or area charts.

When SQL evidence is designated table-only, its card opens with the data table visible and omits the chart controls and chart-only export. Count legends display whole numbers. Full-group views do not claim that an `Others` bucket is hidden.

The app caps model context planning at 200,000 tokens. Pi's provider context starts automatic summarization at an estimated 80% of that window, preserving the system instruction and recent tool-call/result pairs. Its estimate counts non-ASCII text conservatively and retains only recent messages that fit the configured reserve. The transcript stored for UI/history remains intact. If summarization fails, Pi retains the original context and the provider may still reject an oversized request; a successful summary is not inferred from the trigger alone. AI chart and executive summaries state aggregate-row coverage and include up to 24 rows per card so partial samples are not presented as complete series.

After loading a CSV, open **Pi Lab** from the Assistant header. **Run mock tool cycle** exercises Pi's inspect → aggregate → answer loop without a provider call. For **Run live OpenAI**, select OpenAI and enter your own key in Settings; the lab uses `gpt-5.4-mini` with medium reasoning and the app's cloud AI consent flow. The question, schema, and bounded aggregate results go to OpenAI; raw CSV rows remain in the browser. A direct browser call exposes the user-provided key to that browser, so do not put an API key in a production build or a committed `.env` file. The lab uses the existing DuckDB query engine for full-dataset aggregates, including backed datasets, and rejects results with more than 30 groups. It does not replace the main chat/report workflow.

The app's tool and data policies live with the agent and data services. UI components display state and user decisions; they should not duplicate business rules. The local source backup also contains internal planning notes and a business-report regression corpus; those are not included in this public repository.

Ordinary row-oriented CSV files, including the bundled HDB resale demo, proceed through structure detection without requiring users to assign every column role. The review dialog is reserved for ambiguous report boundaries or transformations that cannot be verified automatically.

History saves reports and analysis evidence without embedding the original CSV rows. To reopen a saved report, select its original CSV. The app checks the source fingerprint and reproduces the prepared dataset version before restoring saved cards and report content. A different file is rejected while keeping the saved report available for another attempt. If the prepared version cannot be reproduced, the app runs a fresh analysis and does not reuse the saved conclusions. In Data Explorer, a historical query may retain its row count without a row preview; the interface marks that preview unavailable and offers query templates for inspecting the current dataset.

When initial analysis cannot finish, the results page uses the recorded failure reason for its next action. Provider errors offer **Retry analysis** and **Change provider**; verified structure blocks offer **Review and repair data structure**; missing trusted conclusions offer **Review analysis evidence**. Imported data stays available for retry. A provider failure does not by itself imply a CSV structure or cleaning problem, so the cleaning failure banner is hidden for that case.

For large CSVs backed directly by DuckDB, analysis queries use the columns returned by the backing table. Preview-only lineage and row-role annotations remain available in the interface but are excluded from SQL planning unless they are actual source columns.

## Develop and verify

Use Node.js `>=22.13 <23` for the source package. Its lockfile pins the dependencies.

```bash
npm ci --prefix frontend
npm run dev
npm run typecheck
npm run test
npm run build
```

`npm run dev` serves editable source on port 3000. `npm run build` writes `frontend/dist/`; it does not replace the checked-in deployment. The build scripts copy the existing root `duckdb/` and `demo-data/` resources into the source package's ignored `frontend/public/` directory, and copy Pyodide from the installed dependency. Those generated copies are not committed. The current vector worker loads its model from a CDN, and the build intentionally excludes local model files.

After reviewing the generated output, run `npm run publish:root` to rebuild and copy manifest-managed deployment files to the repository root. The publisher verifies source checksums, refuses to overwrite modified or unmanaged root files, removes only unchanged obsolete build files, and leaves source, documentation, and model resources untouched. Its safety tests run with `npm run test:publish`.

To preview the checked-in deployment without Node.js, serve the repository root over HTTP:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. CSV-to-report, provider-backed AI, offline behavior, and mobile flows require separate end-to-end checks before a release.

## GitHub Pages release

GitHub Pages is configured to publish from GitHub Actions. `.github/workflows/publish-pages.yml` runs only when manually dispatched from `main`; it does not publish on every push. It verifies the staging scripts, checks each file against `SHA256SUMS.txt`, and uploads only the allowed site files from `pages-artifact/`. The artifact contains the app entry, bundles, service worker, offline page, manifest, and required browser resources under `demo-data/`, `duckdb/`, `pyodide/`, and `sandbox/`. It excludes `frontend/`, tests, repository documents, the legacy `main_page.html`, and `public/models/`.

For a new release, first build and review the source, run `npm run publish:root`, and verify the checked-in deployment. Merge the release files into `main`, then manually run **Publish verified GitHub Pages site** in GitHub Actions. The workflow is already on `main`. `npm run test:publish` checks the publisher and stager locally; `npm run stage:pages` creates the ignored `pages-artifact/` directory for inspection and requires that directory to be absent before it runs. The workflow stages a fresh artifact on each run. Until it is manually run, Pages continues serving its last published version.

The recovered `frontend/` source came from a private backup. The public package contains the reviewed application source and synthetic unit tests; local business CSVs, derived benchmark snapshots, and operator-only notes and tests are excluded by `frontend/.gitignore`. Review new files before committing them. The Pages artifact allowlist limits what the website serves; it does not make files in a public Git repository private.
