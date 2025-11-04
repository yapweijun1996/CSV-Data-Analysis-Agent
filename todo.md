# TODO — 恢复与 React 版本相同的功能

此列表追踪了将原生 JS 版本功能与原始 React/TSX 参考实现保持一致所需的工作。

## P0：关键的用户功能

- [ ] **任务1：重建UI组件 (Rebuild UI components)**
    - [ ] **文件上传与数据预览 (File Upload & Data Preview):**
        - [ ] `FileUpload.tsx`: 移植文件上传 UI 和处理逻辑到 vanilla JS. (React source: `original/csv-data-analysis-agent /components/FileUpload.tsx`)
        - [ ] `DataPreviewPanel.tsx`: **实现/移植数据预览面板 (源文件为空).** (React source: `original/csv-data-analysis-agent /components/DataPreviewPanel.tsx`)
        - [ ] `DataTable.tsx` & `EditableDataTable.tsx`: 移植为 vanilla HTML 表格和编辑处理器.
    - [ ] **聊天与分析界面 (Chat & Analysis Interface):**
        - [ ] `ChatPanel.tsx`: 移植聊天 UI 和发送处理器.
        - [ ] `AnalysisPanel.tsx`, `AnalysisCard.tsx`, `ChartRenderer.tsx`, `ChartTypeSwitcher.tsx`: 移植图表和控件 (使用 Chart.js).
    - [ ] **辅助面板与模态框 (Auxiliary Panels & Modals):**
        - [ ] `HistoryPanel.tsx`, `MemoryPanel.tsx`, `SpreadsheetPanel.tsx`, `SpreadsheetTable.tsx`, `SettingsModal.tsx`, `FinalSummary.tsx`, `InteractiveLegend.tsx`: 移植所有辅助 UI 和行为.

- [x] **实现可编辑的电子表格 (Implement editable spreadsheet)**
- [x] **实现导出功能 (Implement export features)**
- [x] **恢复卡片筛选功能 (Restore card filtering)**

## P1：核心逻辑与服务

- [ ] **任务2：移植核心应用逻辑 (Port Core App Logic)**
    - [ ] 在 `main.js` 中实现一个状态管理系统以替代 React state.
    - [ ] 将所有 React 事件处理器 (`onClick`, etc.) 转换为 `addEventListener`.
    - [ ] 创建当状态改变时被调用的手动 UI 更新函数.

- [ ] **任务3：转换并验证服务逻辑 (Convert & Verify Service Logic)**
    - [ ] **创建 `services/vectorStore.js` (当前缺失).** (React source: `original/csv-data-analysis-agent /services/vectorStore.ts`)
    - [ ] 验证 `services/geminiService.js` 和 `utils/dataProcessor.js` 与原始 TS 版本功能完全一致.

- [ ] **任务4：提高代码可维护性 (Improve Code Maintainability)**
    - [ ] 为关键数据结构 (`AnalysisPlan`, `AnalysisCardData`, `ColumnProfile`) 添加 JSDoc `/** @typedef */` 注释.
    - [ ] (可选) 将 `main.js` 重构为渲染 (`render...`) 和逻辑 (`handle...`) 模块.

## P2：用户体验优化与次要功能

- [ ] **恢复次要的UI功能 (Restore Minor UI Features)**
  - [ ] 为分析卡添加更详细的工具提示或上下文菜单.
  - [x] 实现一个更丰富的交互式图例 (已完成).

- [ ] **重新启用上传时的API密钥验证 (Re-enable API Key validation on upload)**
  - [ ] 在缺少凭据时阻止文件解析.
  - [ ] 模仿 React 的 UX，在允许上传前突出显示设置要求.

## 已完成项目 (Completed Items)

- [x] 恢复会话持久化和历史记录面板
- [x] 重新引入助手侧边面板用户体验
- [x] 恢复设置模态框工作流程
- [x] 重新创建分析仪表板组件（基本功能）
- [x] 对齐CSV解析和预处理行为
- [x] 匹配聊天流程和AI提示（基本功能）
