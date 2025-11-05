# TODO — 将 React 项目转换为原生前端项目

此列表追踪了将原生 JS 版本功能与原始 React/TSX 参考实现保持一致所需的工作。

## P0：关键用户功能与服务

- [ ] **任务1：重建UI组件 (功能对齐检查)**
    - [x] **FileUpload**：验证原生实现是否与 `original/csv-data-analysis-agent /components/FileUpload.tsx` 中的行为匹配。确认用户体验对齐（拖放、API密钥门控）。当前的原生实现位于 `main.js` 中。
    - [x] **DataPreviewPanel**：移植或最终确定缺失的预览面板行为。原始文件 `original/csv-data-analysis-agent /components/DataPreviewPanel.tsx` 为空。原生版本有表格渲染助手，但应将其整合。
    - [x] **DataTable & EditableDataTable**：确保与 `original/csv-data-analysis-agent /components/EditableDataTable.tsx` 完全可编辑的电子表格功能对齐。原生版本具有内联编辑功能；确认所有流程（保存/放弃、待定编辑）、分页（50行）、列宽拖动与行号显示保持一致。
    - [ ] **ChatPanel**：原生聊天逐步对齐 React 体验。
        - [x] 在多步骤动作前注入 `ai_plan_start`，恢复 `ai_proactive_insight` 消息与“Show Related Card”按钮，并在 `currentView === 'file_upload'` 时禁用输入框。
        - [x] 将数据准备计划与主动洞察输出渲染到 UI，保持与 `App.tsx` 行为一致。
        - [ ] 验证并修复 DOM 动作（高亮/筛选等）在刷新后的卡片解析流程，重点关注 `main.js` 1664-2099 与 2006-2099 段落。已新增卡片 ID 别名注册与解析逻辑重试，高亮路径待回归测试确认。
        - [ ] 将 Memory 按钮接入真实面板与向量检索；当前仅为占位并输出控制台提示。
        - [ ] 调整 `applyChatActions` 中的节奏延迟与日志顺序，使其与 React `handleChatMessage` 的 `sleep(1000/1500/750)` 行为一致，避免用户感知到不同步的执行节奏。
    - [ ] **AnalysisPanel & Chart 组件**：从 `original/csv-data-analysis-agent /components/AnalysisPanel.tsx`、`ChartRenderer.tsx` 和 `ChartTypeSwitcher.tsx` 移植任何缺失的交互。除验证工具提示、缩放、选择与 TopN 逻辑外，还需在 `runAnalysisPipeline` 中重新调用 `generateProactiveInsights`，确保分析完成后能推送对应聊天提示。
        - [ ] `renderFinalSummary` 样式与 React `FinalSummary` 对齐（白底蓝边、📊 emoji 标题、`whitespace-pre-wrap`），避免当前蓝底样式导致信息层级差异。
    - [ ] **辅助组件 & 模态框**：`MemoryPanel` 已加入底板（模型加载、搜索、删除、清空、容量条）；仍需补充：首次载入回灌旧记忆、结果高亮回滚说明与键盘可访问性。`SettingsModal` 需恢复 React 中的提供商切换按钮、按提供商显示对应 API Key 字段与获取链接。`HistoryPanel` 删档需恢复确认提示，`SpreadsheetPanel`、`FinalSummary`、`InteractiveLegend` 继续做可访问性与键盘操作对齐检查。

- [ ] **任务2：实现关键缺失服务**
    - [x] **实现 `services/vectorStore.js`**：从 `original/csv-data-analysis-agent /services/vectorStore.ts` 移植。这是启用AI使用的记忆功能、向量搜索和索引所必需的。现已优先加载本地模型 (`/models/all-MiniLM-L6-v2`)，缺失时自动回退 CDN / 轻量嵌入；后续仍需补全记忆回灌与性能评估。
    - [x] **验证 `services/geminiService.js`**：确保与原始TS实现 (`original/csv-data-analysis-agent /services/geminiService.ts`) 的功能对齐。确认提示细节、流式传输/操作和规范化。已重建 ReAct 提示、记忆/数据准备上下文与行动正规化；需继续配合 DOM 动作验证与 Memory 面板完善。

## P1：核心逻辑、集成与策略修复

- [ ] **任务3：改进核心逻辑与可维护性**
    - [ ] **状态管理**：将庞大的 `main.js` 重构为更小的模块（例如 `render.js`、`handlers.js`），并为 `AnalysisPlan`、`AnalysisCardData`、`ColumnProfile` 添加 JSDoc 类型定义以提高可维护性。
    - [ ] **启用记忆功能**：在 `vectorStore.js` 实现并测试后，在 `main.js` 中将 `ENABLE_MEMORY_FEATURES` 设置为 `true`。
    - [ ] **启用管道修复**：启用并验证管道修复标志 (`ENABLE_PIPELINE_REPAIR`) 和 `utils/repairEngine.js` 的功能对齐。
    - [ ] **验证预处理流程**：通过比较 `dataProcessor.ts` 和 `geminiService.ts` 的逻辑，确保AI驱动的预处理流程与原始版本匹配。
        - [x] 同步 React 版的 data-prep prompt 约束（crosstab、multi-header、summary 识别、\`_util\` 使用规则）。
        - [x] 恢复 `executeJavaScriptDataTransform` 中向 AI 代码注入 \`_util.parseNumber\` 与 \`_util.splitNumericString\`。
        - [x] 重新引入 data-prep 自我修正重试循环并把错误信息反馈给下一轮 prompt。
        - [x] 对齐传入 `generateDataPreparationPlan` 的 sampleData 结构，避免 generic header 与 inferred header 键名不一致。
        - [x] 恢复 “AI Data Transformation Log” 的渲染判定：仅在 `jsFunctionBody` 存在且执行成功后显示、记录行数差异。
        - [x] 为 data-prep 过程添加调试日志，在 AI 跳过转换时输出计划详情并提示控制台排查。
        - [ ] 调查 `processCsv` 在 Worker 模式下触发的 `DataCloneError` 根因，必要时调整解析线程或元数据打包方式。
    - [ ] `generateAnalysisPlans` 采样窗口与 React 对齐（React 取前 5 行，原生当前取前 20 行），避免计划描述与排序差异。
    - [ ] `runAnalysisPipeline` 日志与记忆内容对齐 React：恢复 `View #XXXX indexed / Saved as View #XXXX` 进度文案，并将记忆文本格式调整为 `[Chart: 标题] Description: ... AI Summary: ...`。
    - [ ] **补充测试覆盖**：为 `normaliseAiAction` 思路传递与 `applyChatActions` 多步骤执行建立单元/集成测试，确保 DOM 动作与聊天队列稳定。

- [ ] **任务4：解决用户体验、策略和构建约束**
    - [x] **移除 Tailwind CSS**：项目当前在 `index.html` 中加载 Tailwind。根据项目规则，必须用纯CSS样式表替换。
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
