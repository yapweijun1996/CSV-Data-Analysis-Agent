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

### Configuring API Keys

1. Launch the app and open the **Settings** button in the top-right corner.
2. Choose either Google Gemini or OpenAI as the provider.
3. Enter the corresponding API key and default model.
4. Save the settings to unlock the AI-driven workflow.

> Keys are saved in `localStorage`, so only run this build in trusted environments. For stricter security, route calls through an internal proxy instead.

### Key Files

- `index.html` – loads Tailwind, Chart.js, PapaParse, idb, and bootstraps `main.js`
- `main.js` – defines the `<csv-data-analysis-app>` Web Component handling UI and state
- `utils/dataProcessor.js` – CSV parsing, profiling, aggregations, and AI transformation executor
- `services/geminiService.js` – shared wrapper for Gemini/OpenAI requests (plans, summaries, chat)
- `storageService.js` – manages settings persistence (and can be extended for report history)

### Data Pipeline Overview

1. CSV files are parsed in the browser via PapaParse. The parser detects header rows, strips summary/totals, preserves leading context rows, and records metadata such as original vs cleaned row counts.
2. `profileData` inspects the parsed table to infer data types, numeric columns, categorical fields, and value ranges. These profiles feed the AI prompts and power local aggregations.
3. If an API key is present, the assistant asks Gemini/OpenAI for a preprocessing plan. Returned JavaScript (if any) is executed in the browser to reshape the dataset, after which metadata is refreshed.
4. The cleaned dataset and metadata are stored in component state and made available to both the dashboard and the conversational agent.

### AI and Chat Workflow

- `generateAnalysisPlans` proposes chart-ready plans that `executePlan` runs locally, yielding datasets for Chart.js visualizations.
- Each plan receives an AI-authored summary plus an optional top-N/Others breakdown when categories are numerous.
- After the initial batch, the agent calls `generateCoreAnalysisSummary` and `generateFinalSummary` to synthesize overall findings injected into the conversation.
- The chat panel streams status updates, accepts freeform questions, and routes AI responses into actions: new plans, JavaScript transforms, DOM/UI adjustments, or plain text replies.

### Raw Data Explorer

- Toggle between Cleaned and Original tables (if available) to compare automated cleanup results.
- Apply case-insensitive substring filters or enforce whole-word matching; clear filters interactively.
- Sort by any column in ascending/descending order. Nullish values sink to the bottom to aid inspection.
- Collapse or expand the explorer while preserving the current filter/sort state.

### Persistence Hooks

- Settings, provider choice, API keys, and language preference persist in `localStorage`.
- IndexedDB helpers (`storageService.js`) are wired for saving report history, though the current UI does not expose the feature.
- Session metadata keys allow future enhancements such as resumable conversations or report galleries.

### Roadmap

- Add client-side retrieval augmented generation (RAG) by storing embeddings of past plans, summaries, and user questions in IndexedDB to improve follow-up answers.
- Persist uploaded CSVs (original, cleaned, metadata, profiles) as reusable sessions so users can reopen prior analyses without re-uploading files.
- Introduce curated JavaScript transform snippets that the agent can reuse for common data-cleaning tasks instead of generating fresh code each time.
- Expose a History panel in the UI for browsing saved sessions, relaunching analyses, and managing stored data quota.

### Important Notes

- Exposing API keys in the browser inherently reveals them to end users; treat this build as internal tooling only.
- If you deploy with a strict Content Security Policy, allow `unsafe-eval` or rework the transformation executor so AI-authored JavaScript can run.
- For production use, consider adding a backend façade to secure credentials, enforce quotas, and audit requests.
- Exporting charts/reports and activity history is not yet ported from the React build. Although `html-to-image` and the IndexedDB helper ship with the app, the current UI does not expose them, so add your own bindings if you need that workflow.

### Usage Tips

- If a CSV includes report titles, totals, or other rows outside the column headers, the Cleaned Data view removes them automatically. Switch back to Original Data to audit what was dropped.
- When chatting with the assistant, be explicit about the data manipulation you need (for example, split a column, add a new card, or remove certain rows). The AI will execute your request via DOM actions or JavaScript transforms.
