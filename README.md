## CSV Data Analysis Agent (Frontend-Only)

This branch rewrites the original React/TypeScript implementation into a pure ES6 Modules + Web Components application. All functionality now runs entirely in the browser and communicates directly with the Gemini or OpenAI APIs, so ensure this approach aligns with your internal security policies before distributing it.

### Core Features

- Browser-only Web Component app that renders the upload flow, analysis dashboard, and chat workspace without a backend.
- CSV ingestion with heuristics for header detection, summary/total row removal, metadata capture, and automatic column profiling.
- AI-guided preprocessing plan that can inject JavaScript transforms before analysis and updates the metadata sent back to the models.
- Local execution of AI-authored analysis plans using Chart.js, with configurable top-N groupings, hide/show toggles, and chart type overrides.
- Dual Raw Data Explorer panes (Cleaned vs Original) with keyword or whole-word filters, column sorting, and quick expand/collapse.
- Conversation-first assistant capable of issuing DOM actions, running data transforms, drafting summaries, and creating new analysis cards.
- Settings persisted to `localStorage`, Gemini/OpenAI provider switching, and scaffolding for IndexedDB-backed report history.

### Getting Started

```bash
npm install
npm run dev
```

The app also works as static files (e.g., serving `index.html` directly) provided the browser can reach the target AI endpoints from the current origin.

#### Optional: Enable Transformer Memory Locally

The assistant can maintain richer long-term memories by running the Xenova `all-MiniLM-L6-v2` embedding model in the browser. Because Hugging Face blocks cross-origin downloads, bundle the model with the app:

```bash
npm run download:model   # ~330MB download; stores files under public/models/Xenova/all-MiniLM-L6-v2
```

Then launch the dev server (`npm run dev`). The vector store will first check for these local assets; if they are missing, it falls back to the lightweight bag-of-words embedder. When deploying, copy the entire `public/models` directory to your static host so the model can be served from `/models/...`.

### Configuring API Keys

1. Launch the app and open the **Settings** button in the top-right corner.
2. Choose either Google Gemini or OpenAI as the provider.
3. Enter the corresponding API key and default model.
4. Save the settings to unlock the AI-driven workflow.

> Keys are saved in `localStorage`, so only run this build in trusted environments. For stricter security, route calls through an internal proxy instead.

### Key Files

- `index.html` – loads the custom stylesheet, Chart.js, PapaParse, idb, and bootstraps `main.js`
- `main.js` – defines the `<csv-data-analysis-app>` Web Component handling UI and state
- `utils/dataProcessor.js` – CSV parsing, profiling, aggregations, and AI transformation executor
- `services/geminiService.js` – shared wrapper for Gemini/OpenAI requests (plans, summaries, chat)
- `storageService.js` – manages settings persistence (and can be extended for report history)
- `scripts/download-model.sh` – helper script to fetch the Xenova embedding model into `public/models/...`

### Data Pipeline Overview

1. CSV files are parsed in the browser via PapaParse. The parser detects header rows, strips summary/totals, preserves leading context rows, and records metadata such as original vs cleaned row counts.
2. `profileData` inspects the parsed table to infer data types, numeric columns, categorical fields, and value ranges. These profiles feed the AI prompts and power local aggregations.
3. If an API key is present, the assistant asks Gemini/OpenAI for a preprocessing plan. Returned JavaScript (if any) is executed in the browser to reshape the dataset, after which metadata is refreshed.
4. The cleaned dataset and metadata are stored in component state and made available to both the dashboard and the conversational agent.

### AI and Chat Workflow

- `generateAnalysisPlans` proposes chart-ready plans that `executePlan` runs locally, yielding datasets for Chart.js visualizations.
- Each plan receives an AI-authored summary plus an optional top-N/Others breakdown when categories are numerous.
- After the initial batch, the agent calls `generateCoreAnalysisSummary` and `generateFinalSummary` to synthesize overall findings injected into the conversation.
- Lightweight intent detection chooses prompt templates and exposes a curated skill catalog so the model knows which reusable transforms/actions are available.
- A local memory service retrieves the most relevant prior chats, plans, and summaries (stored in IndexedDB) and feeds them back into each request.
- A pipeline auditor inspects chart configurations against the current dataset after each run, highlighting critical or warning issues for upcoming self-healing steps.
- Repair skills pair audit findings with reusable plan patches so the agent can automatically correct missing chart types, group-by columns, and value aggregations.
- Automatic remediation runs after each audit: detected issues trigger plan patches, chart rebuilds, and a follow-up audit so the dashboard stabilises without manual guidance.
- The sidebar surfaces the latest audit summary, outstanding issues, and recent auto-repair notes for quick diagnostics.
- The chat panel streams status updates, accepts freeform questions, and routes AI responses into actions: new plans, JavaScript transforms, DOM/UI adjustments, or plain text replies.

### Agent Tool Protocol

The vanilla agent behaves like a multi-step worker: every action contains a `thought`, the first action outlines the full plan, and subsequent actions update progress logs. To keep the toolchain predictable:

- Always emit a `responseType` (`text_response`, `dom_action`, `execute_js_code`, or `plan_creation`) plus the matching payload. The CLI now also accepts a literal `text_response` field, but declaring `responseType` remains the preferred path.
- DOM interactions must live under `domAction.toolName` with snake/camel/hyphen case all resolving to the same canonical name. Additional arguments go directly on `domAction`; avoid burying them under extra wrappers so parsers do not have to guess.
- `setRawDataFilter` **requires** either `query` or `value` (string) and optionally a `column` hint. Nested shapes such as `{ "filters": [{ "column": "...", "query": "..." }] }` are supported, but keeping `query` at the top level provides the most reliable path. Example:

```json
{
  "responseType": "dom_action",
  "thought": "Focus the raw data on a single payee before writing the summary.",
  "domAction": {
    "toolName": "setRawDataFilter",
    "query": "General Ledger",
    "column": "Payee Name",
    "wholeWord": false
  }
}
```

- When a text reply should be sent without any DOM work, return `{"responseType":"text_response","thought":"...", "text":"...markdown..."}` (or set `toolName: "text_response"`). The normalizer also accepts `text_response`/`textResponse` fields for compatibility, but sticking to the canonical shape keeps telemetry consistent.
- If an action fails (for example, the query is missing), the agent surfaces the exact error in the chat log so the LLM can immediately retry with corrected parameters.

### Autonomy Scope

This build aims to automate the CSV-insight workflow inside the browser, but it is **not** a fully autonomous employee-style agent yet.

- **What it can automate:** Upload-time parsing, AI-authored preprocessing, chart creation, DOM interactions, JavaScript transforms, audits, and repair loops all run without additional prompts once the user starts a session.
- **What still needs a human:** Providing CSVs, configuring API keys, and initiating new analyses or chat intents. The assistant only touches data inside the current tab—there is no shell access, external web search, API crawling, or filesystem probing.
- **Memory boundaries:** IndexedDB memories persist per browser profile. They help the LLM remain context-aware, but they are not a global knowledge base, nor do they support multi-user learning.
- **Safety considerations:** AI-generated JavaScript executes via `new Function` in the browser. There is no sandboxed rollback, test harness, or permission model, so treat transformations as untrusted code and keep the app in controlled environments.
- **Growing into a “worker”:** Reaching hands-off autonomy would require adding background schedulers, policy-enforced tool runners (HTTP, shell, databases), secure credential management, human-in-the-loop auditing, and a shared long-term memory service. Those features are outside the current vanilla scope.

### Skill Catalog & Intent Handling

- `utils/intentClassifier.js` tags each prompt as analysis, cleaning, narrative, or general based on keywords and column metadata.
- `services/skillLibrary.js` lists reusable skills (group sums, Top-N, time trends, cleaning actions) that the LLM can reference instead of writing raw code.
- `services/geminiService.js` injects the detected intent and available skills into the system prompt so the agent can self-correct before asking users for clarification.
- `utils/repairEngine.js` ranks fallback categorical/numeric columns by coverage and variance so repaired plans default to meaningful dimensions.

### Agent Workflow Timeline & Lifecycle

- **Iterative phases.** `services/taskOrchestrator.js` mirrors Diagnose → Plan → Execute → Adjust → Verify. Each phase records start/end timestamps, completed steps, and 🤔 thoughts so you can audit the agent’s reasoning trail.
- **Session management.** `main.js` starts a workflow session when a CSV upload begins (or when a chat action needs orchestration) and calls `finalizeWorkflow` whenever the dataset is replaced, a new session starts, or a history report is loaded. This prevents prior plans from leaking into the next dataset.
- **UI surface.** `render/workflowTimeline.js` now renders the live plan snapshot, constraints, and phase cards inside the main scroll area. Engineers can confirm the agent is progressing in small, verifiable steps without digging through console logs.
- **Persistence.** The orchestrator snapshot (goal, constraints, phases, steps, summary) is serialized in `captureSerializableAppState()`. If users reopen a saved report, the timeline immediately explains what the agent already tried, which repairs succeeded, and where it paused.
- **Context helpers.** Header mapping context, auto-task flags, and chat history entries are all written through the orchestrator so retries can reference prior knowledge (for example, “header mapping already detected”).

### Raw Data Explorer

- Toggle between Cleaned and Original tables (if available) to compare automated cleanup results.
- Apply case-insensitive substring filters or enforce whole-word matching; clear filters interactively.
- Sort by any column in ascending/descending order. Nullish values sink to the bottom to aid inspection.
- Collapse or expand the explorer while preserving the current filter/sort state.

### Persistence Hooks

- Settings, provider choice, API keys, and language preference persist in `localStorage`.
- IndexedDB helpers (`storageService.js`) now store AI memories (plans, summaries, chats) and are wired for saving report history, though the current UI does not expose the history browser yet.
- Session metadata keys allow future enhancements such as resumable conversations or report galleries.

### Roadmap

- Enhance the client-side retrieval augmented generation (RAG) stack with richer embeddings and cross-session sharing of insights stored in IndexedDB.
- Persist uploaded CSVs (original, cleaned, metadata, profiles) as reusable sessions so users can reopen prior analyses without re-uploading files.
- Introduce curated JavaScript transform snippets that the agent can reuse for common data-cleaning tasks instead of generating fresh code each time.
- Expose a History panel in the UI for browsing saved sessions, relaunching analyses, and managing stored data quota.

### Important Notes

- Exposing API keys in the browser inherently reveals them to end users; treat this build as internal tooling only.
- If you deploy with a strict Content Security Policy, allow `unsafe-eval` or rework the transformation executor so AI-authored JavaScript can run.
- For production use, consider adding a backend façade to secure credentials, enforce quotas, and audit requests.
- If the transformer model fails to load (for example, missing `public/models` assets), the app automatically falls back to lightweight embeddings and logs the reason in the DevTools console.
- Exporting charts/reports and activity history is not yet ported from the React build. Although `html-to-image` and the IndexedDB helper ship with the app, the current UI does not expose them, so add your own bindings if you need that workflow.

### Usage Tips

- If a CSV includes report titles, totals, or other rows outside the column headers, the Cleaned Data view removes them automatically. Switch back to Original Data to audit what was dropped.
- When chatting with the assistant, be explicit about the data manipulation you need (for example, split a column, add a new card, or remove certain rows). The AI will execute your request via DOM actions or JavaScript transforms.
