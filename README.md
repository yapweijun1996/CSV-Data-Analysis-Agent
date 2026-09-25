# CSV Data Analysis Agent

Browser-based CSV analysis with a Vanilla JavaScript implementation and a React reference/build artifact. This document describes the **current repository state**, not an intended future deployment.

## Current entry point — read before running

The root `index.html` currently loads compiled JavaScript and CSS bundles from `assets/`, preloads a React vendor bundle, and mounts into `<div id="root">`. It does **not** import the root Vanilla `main.js` module or create `<csv-data-analysis-app>`.

The Vanilla implementation exists in root-level ES modules (`main.js`, `services/`, `utils/`, `render/`, and related directories), but the checked-in root HTML entry does not connect it. Consequently, `npm run dev`, `npm run build`, and static hosting from the repository root use the root HTML entry and currently select the compiled React application. The presence of Vanilla source files is not evidence that they are the currently served app. The React reference under `original/` is not to be modified as part of the Vanilla conversion.

The repository's project goal is a browser-only Vanilla frontend. The root-entry wiring, its dependencies, and deployment assets still need to be reconciled before claiming the Vanilla app is the active deployment.

## Development commands

Run from the repository root:

```bash
npm install
npm run dev       # Vite development server; serves the current root index.html entry
npm run build     # builds the current Vite entry, not an unreferenced main.js module
npm run preview   # previews the generated build
npm test          # runs the configured Vitest suite
```

Node.js is required for Vite and the test/build tooling. The application code is browser-side; there is no application backend in the reviewed Vanilla modules. Static hosting is possible once the intended entry and required assets are wired and verified.

Optional local embedding-model download (about 330 MB):

```bash
npm run download:model
```

The script places model files under `public/models/Xenova/all-MiniLM-L6-v2`. The Vanilla vector-store implementation has a local-model path and a bag-of-words fallback. Verify the final hosting path and browser loading behavior before relying on this model in a deployment.

## Vanilla source map

- `main.js` — large Web Component application entry; defines `<csv-data-analysis-app>`, application state, event wiring, orchestration, chat, and view integration. It is not imported by the current root `index.html`.
- `utils/dataProcessor.js` — CSV parsing, shape/header detection, profiling, preparation helpers, JavaScript transform execution, and analysis-plan execution.
- `utils/` — header mapping, data-preparation tools, DOM action parsing, export helpers, pipeline audit, and repair utilities.
- `services/` — provider requests and prompts, task orchestration, memory/RAG/vector-store logic, and the reusable skill catalog.
- `render/` and `handlers/` — chart/cards, assistant, raw-data, memory, and workflow-timeline rendering and interactions.
- `state/` and `types/` — shared constants and JSDoc typedefs.
- `storageService.js` — settings in `localStorage`, plus IndexedDB report and memory helpers.
- `sandbox/python-transformation-worker.js` — a separate Pyodide worker; the reviewed Vanilla modules do not call it for generated JavaScript transforms.
- `original/csv-data-analysis-agent/` — React/TypeScript reference project; leave unchanged.

## Vanilla source behavior

The following describes source-level implementation, not a browser-tested root deployment:

1. **CSV ingestion and profiling.** `utils/dataProcessor.js` uses PapaParse through `window.Papa`, attempts worker parsing, and falls back to non-worker parsing on `DataCloneError`. It detects headers and report/context rows, records shape and header metadata, and profiles column roles and data quality. Parsing does not guarantee that summary rows are removed; preparation is a separate step.
2. **Iterative preparation.** `services/taskOrchestrator.js` tracks Diagnose, Plan, Execute, Adjust, and Verify phases, step status, context, progress, and chat-log entries. Preparation prefers deterministic tool calls; plan normalization can supply default tools when the model provides neither tools nor JavaScript. The workflow can retry/adjust and refresh metadata after transformations.
3. **Analysis and interaction.** Source modules implement local plan execution and chart/card rendering, including grouped aggregations, scatter/correlation, clustering, trend/forecast operations, chart-type controls, Top-N/Others, selections, and raw-data filtering/sorting/editing. Availability through the current root entry has not been verified.
4. **Persistence.** Vanilla settings and API keys are saved in `localStorage`. IndexedDB helpers store reports and per-dataset memory entries. `ENABLE_MEMORY_FEATURES` is enabled in the source; `ENABLE_PIPELINE_REPAIR` is disabled by default.

## AI and security boundaries

- Gemini/OpenAI requests are sent directly from the browser to provider APIs; there is no server-side credential broker in the reviewed Vanilla source.
- API keys saved through Vanilla settings are stored in browser `localStorage`. Do not treat browser storage as a secret store.
- Prompt builders use bounded previews/samples in inspected paths. This static review did not capture runtime network traffic; do not make a stronger privacy claim without verifying every request path.
- Generated JavaScript transforms run via `new Function` in the page realm. This is **not** an isolated sandbox. The root Content Security Policy permits `unsafe-eval`.
- The Python/Pyodide worker is a separate implementation and is not evidence that JavaScript transforms are sandboxed.
- External provider access and CDN/model loading require network access and suitable browser/CSP settings.

## Tests and known limits

The repository currently has four Vitest files with 18 test cases focused on CSV processing, DOM-action utilities, header mapping, and task orchestration. They do not establish end-to-end browser behavior. The root-entry, build, and browser integration were not verified by the static inventory that informed this document; run the commands above and add browser smoke tests before claiming a working Vanilla deployment.

Other known source/document alignment points:

- Root `index.html` configuration defaults differ from the Vanilla `storageService.js` defaults; confirm which configuration should own settings when wiring the Vanilla app.
- The root service worker pre-caches the compiled root application assets. Do not assume it already caches the Vanilla app correctly.
- Several source modules implement report/history and export-related helpers; this does not prove those flows are reachable through the current root entry.
- `applyDeterministicPreprocessing()` exists in `main.js`, but no caller was found in the reviewed source. Do not describe it as an active automatic pre-processing stage without verifying its call path.

## Repository guidance

Keep application code in plain HTML, CSS, and JavaScript; do not add React or Tailwind to the Vanilla implementation. Treat `original/` as read-only. When the entry wiring changes, update this README and `roadmap.md` from the tested behavior, then run the relevant build, tests, and browser checks.
