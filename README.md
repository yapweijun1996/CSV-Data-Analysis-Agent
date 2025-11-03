## CSV Data Analysis Agent (Frontend-Only)

This branch rewrites the original React/TypeScript implementation into a pure ES6 Modules + Web Components application. All functionality now runs entirely in the browser and communicates directly with the Gemini or OpenAI APIs, so ensure this approach aligns with your internal security policies before distributing it.

### 核心功能

- CSV 上傳、原始資料解析與欄位自動檔案型態判斷
- 雙版本 Raw Data Explorer：可即時切換「原始 CSV」與「清理後資料」比較差異
- AI 產生的分析計畫、Chart.js 視覺化與多語敘事摘要
- 互動式進度訊息＋聊天助手，可下達 UI 操作、執行資料清理或新增分析卡片
- 支援 AI 產生的 JavaScript 轉換函式，直接在瀏覽器內對資料進行加工
- Metadata 擷取（報表標題、前導列、原始/清理列數）並傳入每次 AI 呼叫以提升理解力
- 設定面板可切換 Gemini / OpenAI、API KEY、模型與回應語系

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

### Important Notes

- Exposing API keys in the browser inherently reveals them to end users; treat this build as internal tooling only.
- If you deploy with a strict Content Security Policy, allow `unsafe-eval` or rework the transformation executor so AI-authored JavaScript can run.
- For production use, consider adding a backend façade to secure credentials, enforce quotas, and audit requests.
- 匯出圖表/報表與歷程紀錄功能尚未復刻自 React 版（雖仍引入 `html-to-image`、IndexedDB helper，但目前前端未綁定對應 UI），如需此能力可自行補強。

### 使用小提醒

- 若 CSV 含表頭以外的報表標題、總計列等，系統會在「清理後資料」中自動移除；可切換成「原始資料」查驗被移除的列。
- 與聊天助手溝通時可明確指示需要的資料操作（例如拆欄、建立新卡片、刪除指定列），AI 會透過 DOM action 或 JS transform 呼叫完成。
