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

#### Multi-Step Data Cleaning Strategy

To keep the workflow可追蹤 and resilient, the agent treats data preparation as a chain of small verifiable steps instead of a single opaque transform:

1. **Title/Metadata pass.** AI first identifies leading report titles、日期、貨幣等資訊，並移除純 metadata 列，只保留本次任務需要的欄位。
2. **Header resolution.** 接著偵測多列 header，建立 `HEADER_MAPPING` 並記錄 canonical 欄名，避免在後續程式中硬編 `data[2]` 這類列索引。
3. **Row-level cleanup.** 最後才針對資料列做動作：在 crosstab 場景會明列 melt/unpivot 步驟；一般表格則逐步去除 summary rows、解析數值、維護層級關係。每一步都在 chat log / workflow timeline 中留下 log，便於稽核。

此 multi-pass 設計同時也反映在 prompt 中：AI 需先寫出 `stagePlan`（title → header → data）再產出 JavaScript，如此我們能在發生錯誤時要求它根據上一輪失敗原因逐步修正，而不是一次「大爆炸」式的清理。

#### Diagnose → Plan → Iterate → Recover → Done

這個 Vanilla Agent 的思維鏈可以拆成六個可追蹤階段，方便工程師與最終使用者快速判定目前進度：

1. **Ingestion.** `processCsv` 會自動偵測分隔符與換行格式，建立 `genericHeaders` / `inferredHeaders`，並把報表抬頭、leading/context rows、`removedSummaryRowCount`、`hasCrosstabShape` 等 metadata 寫好。這些 metadata 直接反映檔案複雜度（多層表頭？交叉表？含有報表敘述？）。
2. **Diagnose Phase.** UI 的 workflow log 會顯示原始/清理列數、context 行數等指標。`profileData` 對每欄做 profiling（數值 / 文字 / 日期 / 貨幣 / 百分比），統計缺值與唯一值占比，並透過 orchestrator 的 column context 標出 identifier 欄、tricky 混合欄位等角色資訊，確保接下來的 prompt 有「欄位角色地圖」。
3. **Plan Phase.** 只要 API key 啟用，就呼叫 `generateDataPreparationPlan` 產生三段式 `stagePlan`（Title Extraction、Header Resolution、Data Normalization）。每段都必須列出 checkpoints、fallbacks、expected artifacts。若 metadata 告訴我們 `hasCrosstabShape=true`，prompt 會強制要求列出 unpivot 策略，避免遺漏寬表轉換。
4. **Iterative Execution.** 每一輪 iteration 先把 stage thoughts / agent log 寫進 timeline，再依序執行：若模型回傳 `toolCalls` 就先跑 deterministic helpers（`detectHeaders`, `removeSummaryRows`, `detectIdentifierColumns` 等）；若出現 `jsFunctionBody`，會先在 sandbox 驗證不能硬編欄位、不能回傳空陣列，通過後才在瀏覽器執行並立即重新 profile + 更新 metadata snapshot，以便下一輪沿用最新資料結構。
5. **Recovery & Logging.** 任何失敗（zero rows、summary 尚未移除、JSON malformed、hard-coded structure）都會記錄在 workflow timeline，並視需要進入 adjust phase：延長 iteration budget、補充 violation guidance、回滾至上一次成功 snapshot。使用者能在 chat log 中看到 agent reasoning 與建議。
6. **Done.** 當 `stagePlan` 三段都完成或耗盡 iteration budget，流程會輸出 tidy long table：表頭統一、summary/合計列已排除、crosstab 已 unpivot，數字/日期/貨幣格式由 `_util` helpers 一致化，metadata（fingerprint、header mapping、context rows）與完整 log 可供稽核。

總結：Ingestion → Diagnose → Plan → Iterate → Recover → Done 這條鏈讓使用者在 UI 上明確知道 agent 正在哪個階段，維護成本也因為 metadata + log 完整保留而變得更低。

#### “Brains + Brakes” 升級藍圖

**Brains – 讓清理決策更聰明**

- **Shape Taxonomy.** 先用 heuristics + metadata 把 CSV 分成 Flat、Crosstab（單/多度量）、Ragged、Header-Multirow、Mixed-Report，再根據類型決定是否必須 unpivot、header 合併、summary 清理。
- **Evidence Fusion.** 同時檢查 context rows、列名 token、樣本值分布、算術一致性（Subtotal ≈ 子項總和）、日期序列連貫性，形成信心分數。任何結構性動作（例如認定 header）都要超過門檻才執行，否則 fallback。
- **Column Roles.** 為 amount/revenue/cost/qty/date/id/name/category 等欄建立多角色候選與置信度，角色後續驅動正規化、主鍵推斷、top-N 建議。
- **Multi-metric Crosstab.** 偵測 Qty/Amount/Cost 這種度量混排時，自動輸出 `(row_key, column_key, metric, value)` 長表，而不是硬擠進單列。
- **Semantic ↔ Structural Dual Track.** 結構訊號優先決定可逆操作（unpivot、summary 刪除），語義/LLM 僅負責命名、說明與模糊判斷，且產生的建議都要經過結構校驗。

**Brakes – 讓流程更穩更可回溯**

- **Tool-first, LLM-second.** 先跑 deterministic helpers（header detection、summary removal、identifier scan），LLM 僅能給建議或小規模重寫。
- **Phase Gates.** Diagnose → Plan 必須確認 ≥80% 欄位角色、header 可信度過閾；Plan → Iterate 需有完整 checkpoints；Iterate 完成則需連續兩輪 header 不變、摘要列=0、日期/金額一致。
- **Sandbox & Snapshots.** 每次 js transform 先在 sandbox 驗證（row count > 0、掉行 < 90%、無硬編索引、無 summary 污染），通過後才真正寫入；同時保存快照，失敗就回滾並降級成 “工具-only” 重試。
- **Violation Library.** 硬編欄位、刪主鍵、把 context 當資料等違例會被記錄、提示並觸發降級，避免跨階段亂跳。
- **Health Scores.** 追蹤結構穩定度（header 變更率）、型別一致性、完整度、合理性，未達標就繼續迭代或以保守輸出結束。
- **Fixtures & Fingerprints.** 為 Flat/Crosstab/Multi-header/Mixed 等類型準備基準 CSV，結合 fingerprint 快取與低溫 LLM，可重複驗證成果。

這套 “Brains + Brakes” 可以映射到實作：shape detector + evidence fusion 填入 metadata；column roles 驅動分析與工具；phase gate、sandbox、snapshot 則由 orchestrator 控制，最終健康分數決定是否 “出關”。未來若要擴充，也只需在 README 這些子項下對應模組即可。

**Complex CSV Challenges & 對策**

- **Multi-row headers / merged cells.** 先保留 level1/level2，必要時拼接成 canonical header，同時保留 genericHeaders 以便回查。
- **隱性 subtotal / 夾心 total.** 不只看關鍵字，還用算術一致性 + 排版線索判斷，低信心就暫留並標記以待 review。
- **Ragged/洞列 (merged export).** 以左/上文填補並跑對齊校驗，低置信度則保留 generic 欄位避免誤清理。
- **多日期格式混用.** 先計算格式占比，若有主格式則統一；否則新增一個標準化欄位，保留原值供審計。
- **Multi-metric crosstab.** 自動產生 (rowKey, column_key, metric, value) 長表，確保後續聚合不失真。
- **髒金額/百分比.** `_util.parseNumber` 會處理「RM 1,200.00」「1 200,00 €」「(500)」等格式，並允許保留原欄 + 規範化欄避免資訊遺失。
- **Mixed-report（說明 + 資料）.** 以 shape taxonomy 檢測 context rows，必要時把說明段落保留在 metadata 供 LLM 參考。

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

### Error Handling & Self-Heal Roadmap

- **Diagnose (Upload/Parsing)** – Failed CSV parses keep the file buffer alive, surface explicit reasons in the workflow timeline, and prepare the next run to reuse the same artifact. Upcoming work adds alternate parsing profiles plus a lightweight “manual header” prompt when repeated failures occur.
- **Data Prep Iterations** – The existing preprocessing loop already retries malformed AI plans, tracks violations (hard-coded columns, malformed JSON), and expands its iteration budget when mistakes repeat. The roadmap extends this by auto-injecting header-mapping or summary-removal tools before giving up and by downgrading to “minimal cleaning” after three zero-row outcomes.
- **Plan Generation** – When Gemini/OpenAI refuses to yield viable chart plans, the agent falls back to the curated skill catalog (categorical sums, counts, time trends). Each rejected plan logs its validation error so the next prompt knows what to avoid.
- **Execution Guardrails** – `executePlan` failures trigger a pipeline audit and, once `ENABLE_PIPELINE_REPAIR` is toggled on, patched plans are rebuilt automatically (fixing missing chart type/group-by/value columns). The roadmap adds retries that switch to simplified aggregations (for example, count by the top-ranked categorical column) after two failed rebuilds.
- **Chat Tool Recovery** – Unsupported or malformed DOM/JS tool calls already degrade to text replies. Future iterations attach structured error codes so the agent can refill missing `cardId`, recompile transforms, or replace a DOM action with an explanatory message before replaying the remaining steps in its multi-step plan.
- **Memory & History Consistency** – Every auto-heal attempt captures a lightweight snapshot (dataset id, card list, audit summary) so failures can roll back without user intervention. Chat logs label these intervals as “Agent 自我修復中” to keep operators informed.
- **Governance & Telemetry** – Audit reports (critical/warning/info) stay the single source of truth. Each repair action is tied to those stats, and retry counters plus repair success rates are mirrored in the workflow timeline so engineers can tune or debug cheaply.

#### Enabling Pipeline Repair (Experimental)

1. Open `state/constants.js` and switch `ENABLE_PIPELINE_REPAIR` from `false` to `true`. This flag is read during component bootstrap, so a hard refresh (or restarting `npm run dev`) is required.
2. Load a CSV that produces at least one audit issue (for example, delete a `chartType` from an analysis card via DevTools or upload a file with missing columns) and trigger an analysis run.
3. Watch the Progress log: after `runPipelineAudit`, the agent should log `Auto-repair starting...` followed by the patch summary. Cards with missing metadata will be rebuilt automatically and a follow-up audit will run.
4. Validate regression risk by inspecting the DevTools console for `Repair action failure` entries and by confirming the rebuilt cards now have valid `plan.chartType`, `plan.groupByColumn`, and `plan.valueColumn` values.
5. For CI/manual testing, capture the three expected states: (a) audit clean → no repair actions, (b) audit critical issues but no skills available, (c) audit issues patched successfully (cards rebuilt, second audit clean). This ensures engineers can toggle the flag confidently before shipping.

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
