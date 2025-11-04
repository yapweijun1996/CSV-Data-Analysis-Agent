# TODO — 将 React 项目转换为原生前端项目

此列表追踪了将原生 JS 版本功能与原始 React/TSX 参考实现保持一致所需的工作。

## P0：关键用户功能与服务

- [ ] **任务1：重建UI组件 (功能对齐检查)**
    - [x] **FileUpload**：验证原生实现是否与 `original/csv-data-analysis-agent /components/FileUpload.tsx` 中的行为匹配。确认用户体验对齐（拖放、API密钥门控）。当前的原生实现位于 `main.js` 中。
    - [ ] **DataPreviewPanel**：移植或最终确定缺失的预览面板行为。原始文件 `original/csv-data-analysis-agent /components/DataPreviewPanel.tsx` 为空。原生版本有表格渲染助手，但应将其整合。
    - [ ] **DataTable & EditableDataTable**：确保与 `original/csv-data-analysis-agent /components/EditableDataTable.tsx` 完全可编辑的电子表格功能对齐。原生版本具有内联编辑功能；确认所有流程（保存/放弃、待定编辑）工作方式相同。
    - [ ] **ChatPanel**：将行为和可访问性与 `original/csv-data-analysis-agent /components/ChatPanel.tsx` 对齐。原生聊天功能存在，但需要验证消息类型、计划/思路流程和DOM操作触发器。
    - [ ] **AnalysisPanel & Chart 组件**：从 `original/csv-data-analysis-agent /components/AnalysisPanel.tsx`、`ChartRenderer.tsx` 和 `ChartTypeSwitcher.tsx` 移植任何缺失的交互。验证工具提示、缩放、选择和 topN 逻辑的功能对齐。
    - [ ] **辅助组件 & 模态框**：确认 HistoryPanel、MemoryPanel、SpreadsheetPanel、SettingsModal、FinalSummary 和 InteractiveLegend 的功能对齐和键盘可访问性，与其在 `original/csv-data-analysis-agent /components/` 中的原始对应组件进行比较。

- [ ] **任务2：实现关键缺失服务**
    - [ ] **实现 `services/vectorStore.js`**：从 `original/csv-data-analysis-agent /services/vectorStore.ts` 移植。这是启用AI使用的记忆功能、向量搜索和索引所必需的。 **(当前缺失)**。
    - [ ] **验证 `services/geminiService.js`**：确保与原始TS实现 (`original/csv-data-analysis-agent /services/geminiService.ts`) 的功能对齐。确认提示细节、流式传输/操作和规范化。

## P1：核心逻辑、集成与策略修复

- [ ] **任务3：改进核心逻辑与可维护性**
    - [ ] **状态管理**：将庞大的 `main.js` 重构为更小的模块（例如 `render.js`、`handlers.js`），并为 `AnalysisPlan`、`AnalysisCardData`、`ColumnProfile` 添加 JSDoc 类型定义以提高可维护性。
    - [ ] **启用记忆功能**：在 `vectorStore.js` 实现并测试后，在 `main.js` 中将 `ENABLE_MEMORY_FEATURES` 设置为 `true`。
    - [ ] **启用管道修复**：启用并验证管道修复标志 (`ENABLE_PIPELINE_REPAIR`) 和 `utils/repairEngine.js` 的功能对齐。
    - [ ] **验证预处理流程**：通过比较 `dataProcessor.ts` 和 `geminiService.ts` 的逻辑，确保AI驱动的预处理流程与原始版本匹配。

- [ ] **任务4：解决用户体验、策略和构建约束**
    - [ ] **移除 Tailwind CSS**：项目当前在 `index.html` 中加载 Tailwind。根据项目规则，必须用纯CSS样式表替换。
    - [ ] **移除 CDN 依赖**：项目通过 `index.html` 中的 CDN 加载多个库。必须将这些库本地化或记录为临时措施。
    - [ ] **强制执行API密钥门控用户体验**：原始的 React `FileUpload` 在未设置API密钥时会阻止拖放。确认原生实现具有相同的行为。

## P2：润色与可选改进

- [ ] **任务5：最终润色**
    - [ ] 为 `utils/dataProcessor.js` 的行为（排序、topN、聚合）添加 JSDoc 和/或单元测试。
    - [ ] 改进导出/报告HTML模板的功能对齐。
    - [ ] 将 `main.js` 分解为更多模块（`ui/`、`services/`、`components/`）以获得更好的组织结构。
    - [ ] 对所有面板和模态框进行可访问性审查（键盘导航、ARIA标签）。

## 已完成/已验证项目

- [x] 实现可编辑电子表格核心。
- [x] 实现导出助手 (PNG/CSV/HTML)。
- [x] 恢复卡片筛选功能。
- [x] 会话持久化和历史面板。
- [x] 助手侧面板和聊天界面。
- [x] 设置模态框界面和基本的保存/加载功能。
- [x] 基本的AI分析管道（计划生成 → 执行 → 摘要）。
