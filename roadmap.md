## Vanilla Agent 統合路線圖與任務清單

此文件結合原本的 `todo.md` 與舊版 roadmap，依「先達成 React parity → 核心強化 → 進階自主」的順序，方便逐項執行與追蹤。

---

### Phase 0 — 目前基線（已完成）
- 純 HTML / CSS / ES Modules JavaScript，無 React、無 Node.js backend。
- 透過瀏覽器直接呼叫 Gemini / OpenAI HTTPS API。
- 具備 CSV 解析、AI 前處理、圖表輸出、DOM action、IndexedDB 記憶與歷史面板。
- 可用 `npm run dev` 本機開發，也能部署在 GitHub Pages 等純靜態環境。

---

### Phase 1 — 功能對齊（React → Vanilla）
目標：確保關鍵 UI 與服務行為與 `original/csv-data-analysis-agent` 等效。

1. **任務1：重建 UI 元件**  
   對照 React 原始檔案並確認交互一致；完成後跑一次 CSV 上傳與基礎互動測試。
   - ✅ FileUpload：拖放、API Key 門檻行為已核對。
   - ✅ DataPreviewPanel：預覽表格行為已對齊。
   - ✅ DataTable & EditableDataTable：內聯編輯、保存/放棄、列寬拖曳、分頁等流程已對齊。
   - ☐ ChatPanel：
     - ✅ 多步驟計畫 `ai_plan_start`、`ai_proactive_insight`、Show Related Card。  
       _測試：觸發多步驟分析，確認聊天記錄插入預期訊息。_
     - ✅ Data Prep 與 Proactive Insight UI 已呈現。  
       _測試：上傳含 pre-processing 的 CSV，確認訊息與面板內容。_
     - ☐ DOM Action 回歸測試（高亮、篩選等刷新後解析）。  
       _測試：在聊天要求 highlight / filter，刷新後重試。_
     - ☐ Memory 按鈕串接向量檢索與面板。  
       _測試：建立記憶後開啟 Memory Panel，檢查搜索結果。_
     - ☐ `applyChatActions` 節奏/延遲與 React 同步。  
       _測試：觀察聊天動作間隔是否與 React 範例一致。_
   - ☐ AnalysisPanel & 圖表互動：
     - ☐ 驗證 tooltip/縮放/選擇/TopN 與 React 行為一致。  
       _測試：在圖表上依序試 TopN、縮放、取消選擇。_
     - ☐ `runAnalysisPipeline` 重新呼叫 `generateProactiveInsights`。  
       _測試：完成分析後確認聊天收到主動洞察。_
     - ☐ `renderFinalSummary` 樣式恢復 React 白底藍邊 + 📊 表現。  
       _測試：確認總結外觀與 React 相同。_
   - ☐ 輔助元件 & 模態：
     - MemoryPanel：補齊舊記憶回灌、結果高亮、鍵盤可及性。  
       _測試：重載頁面確認舊記憶顯示；使用鍵盤操作。_
     - SettingsModal：提供商切換、對應 API Key 欄位與官方連結。  
       _測試：切換 provider，查看欄位顯示是否正確。_
     - HistoryPanel：刪檔確認提示。  
       _測試：刪除歷史項目需先跳出確認。_
     - SpreadsheetPanel / FinalSummary / InteractiveLegend：無障礙與鍵盤導覽檢查。  
       _測試：Tab/Shift+Tab 遍歷，焦點與ARIA正確。_

2. **任務2：關鍵服務**
   - ✅ `services/vectorStore.js` 移植與本地模型回退邏輯。
   - ✅ `services/geminiService.js` ReAct 提示、記憶/資料準備上下文、行為對齊。

---

### Phase 2 — 核心邏輯與策略強化
目標：提升 maintainability、恢復 React 版策略、補齊缺失流程。

1. **任務3：核心邏輯**
   - ☐ 狀態管理模組化（拆分 `main.js`、補 JSDoc 型別）。  
     _測試：Lint/Type check 無誤，基本流程無回歸。_
   - ☐ 啟用記憶旗標 `ENABLE_MEMORY_FEATURES`（現行 true 需完整驗證）。  
     _測試：記憶寫入、讀取、刪除全流程。_
   - ☐ 啟用並驗證 `ENABLE_PIPELINE_REPAIR` 與 `utils/repairEngine.js`。  
     _測試：刻意製造破圖後確認自動修復。_
   - ☐ 預處理流程檢查：
     - ✅ prompt 約束、`_util` 注入、自我修正 loop、sampleData 對齊、日志顯示。
   - ☐ Worker 模式 `DataCloneError` 追蹤/解法。  
      _測試：大型 CSV 仍可在 worker 模式解析。_
   - ☐ 本地 Transformer 模型載入體驗：
     - ✅ `scripts/download-model.sh` 與 README 指南。  
     - ☐ Dev server / 部署靜態資源設定（避免 304 與 HTML fallback）。  
       _測試：`http(s)://<host>/models/Xenova/all-MiniLM-L6-v2/onnx/model.onnx` 200。_
     - ☐ `env.fetch` 304 fallback/unit test。  
       _測試：重新整理後仍能載入 transformer，不回退至 lightweight。_
   - ☐ `generateAnalysisPlans` 取樣窗口與 React 對齊（前 5 行）。  
     _測試：比對 plan 樣式與 React 是否一致。_
   - ☐ `runAnalysisPipeline` 日誌與記憶格式對齊（`View #XXXX indexed` 等）。  
     _測試：重跑 pipeline 確認 log 與記憶內容。_
   - ☐ `normaliseAiAction`、`applyChatActions` 補單元或整合測試。  
     _測試：Jest/整合測試覆蓋多步動作與 DOM 指令。_

2. **任務4：策略／體驗／構建限制**
   - ✅ 移除 Tailwind，改用原生 CSS。
   - ☐ CDN 依賴替換或標註暫行方案。  
     _測試：離線環境仍能載入必要資源。_
   - ☐ API Key 門控 UX：檢查無金鑰時拖放/上傳是否被正確阻擋。  
     _測試：在無 key 狀態下嘗試上傳，應提示並阻止。_

---

### Phase 3 — 潤色與最佳實務（原 P2）
目標：在核心穩定後進行品質與可維運性優化。

1. **任務5：最終潤飾**
   - ☐ `utils/dataProcessor.js` 加上 JSDoc / 單元測試（排序、TopN、聚合）。  
     _測試：單元測試全部通過。_
   - ☐ 導出/報表 HTML 模板功能對齊。  
     _測試：導出 PNG/CSV/HTML 與 React 版結果一致。_
   - ☐ `main.js` 結構化成 `ui/`、`services/`、`components/` 模組。  
     _測試：重新打包後功能無回歸。_
   - ☐ 全面無障礙審查（鍵盤導航、ARIA、焦點管理）。  
     _測試：使用屏幕閱讀器與自動化分析工具檢查。_

---

### Phase 4 — 自主與政策控管（原 Roadmap Phase 3）
目標：讓 agent 能在無需頻繁 prompt 的情況下自我迭代，並有安全界線。

1. **任務6：任務 DSL / 規劃器**
   - 設計輕量語法描述目標、限制、終止條件。
   - 建置 plan → act → evaluate 循環，必要時記錄 step log。

2. **任務7：安全護欄**
   - 維護允許/拒絕清單，限制危險操作。
   - 高風險操作需額外政策檢查或人確認。

3. **任務8：Telemetry 學習**
   - 收集成功率、耗時、錯誤等指標。
   - 依據指標調整工具優先順序或觸發再訓練流程。

---

### Phase 5 — 員工級行為（原 Roadmap Phase 4）
目標：讓 agent 具備像團隊成員一樣的持續產出與匯報能力。

1. **任務9：多任務協同**
   - 支援多個任務並行，每個任務有進度、狀態與輸出。

2. **任務10：自我擴充機制**
   - 建立 sandbox 測試區，先驗證新 JS snippet 或 prompt skill，再正式採用。

3. **任務11：人類匯報模式**
   - 自動產生日/週報，摘要完成事項、阻塞、下一步。
   - 支援匯出 Markdown / HTML，方便審閱。

---

### 橫向考量（所有 Phase 需持續關注）
- **UX Transparency**：提供即時狀態/進度，讓使用者清楚 agent 正在做什麼。
- **Testing**：每階段維持手動情境測試與自動 hook，確認穩定後再推進到下一階段。

> 建議與 `todo.md` 同步更新或移轉到同一追蹤系統，以免分散維護。此文件未標註完成狀態的項目請依實際開發進度調整。 
