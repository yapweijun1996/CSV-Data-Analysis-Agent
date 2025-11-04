# TODO — 恢复与 React 版本相同的功能

此列表追踪了将原生 JS 版本功能与原始 React/TSX 参考实现保持一致所需的工作。

## P0：关键的用户功能

- [ ] **任务1：重建UI组件**
    - [ ] **文件上传与数据预览：**
        - [ ] `FileUpload.tsx`: 创建文件输入和处理逻辑。
        - [ ] `DataPreviewPanel.tsx`: 创建数据预览容器。
        - [ ] `DataTable.tsx` 和 `EditableDataTable.tsx`: 为原始数据实现可编辑的HTML表格。
    - [ ] **聊天与分析界面：**
        - [ ] `ChatPanel.tsx`: 构建聊天框界面。
        - [ ] `AnalysisPanel.tsx`: 分析结果的主容器。
        - [ ] `AnalysisCard.tsx`: 用于图表和摘要的独立卡片。
        - [ ] `ChartRenderer.tsx`: 集成一个原生JS图表库（例如 Chart.js）。
        - [ ] `ChartTypeSwitcher.tsx`: 用于切换图表类型的界面。
    - [ ] **辅助面板与模态框：**
        - [ ] `HistoryPanel.tsx`: 对话历史面板。
        - [ ] `MemoryPanel.tsx`: 显示AI记忆的面板。
        - [ ] `SpreadsheetPanel.tsx` 和 `SpreadsheetTable.tsx`: 高级电子表格视图。
        - [ ] `SettingsModal.tsx`: 设置的弹出模态框。
        - [ ] `FinalSummary.tsx`: 最终摘要组件。
        - [ ] `InteractiveLegend.tsx`: 交互式图例。

- [x] **实现可编辑的电子表格**
  - [x] 在 `renderRawDataPanel` 的原始数据表格中添加 `contenteditable` 单元格或输入字段。
  - [x] 在 `bindEvents` 中创建事件处理程序以捕获单元格更改（例如，在 `blur` 或 `keydown` 事件上）。
  - [x] 实现一个“保存更改”按钮，该按钮将所有编辑收集到一个新的数据数组中，并调用 `rebuildAfterDataChange` 以重新运行分析流程。

- [x] **实现导出功能**
  - [x] 在 `renderAnalysisCard` 的每个分析卡中添加“导出”按钮/菜单（PNG, CSV）。
  - [x] 使用 `html-to-image` 库实现 `handleExportPNG` 以捕获卡片的画布/容器。
  - [x] 实现 `handleExportCSV` 以将 `card.aggregatedData` 序列化为 CSV 字符串并触发文件下载。

- [x] **恢复卡片筛选功能**
  - [x] 支持 `filterCard` DOM 操作并持久化每个卡片的筛选状态。
  - [x] 在卡片上显示当前生效的筛选器横幅，并允许 AI/用户清除筛选器。

## P1：核心逻辑与服务

- [ ] **任务2：移植核心应用逻辑**
    - [ ] 在原生JS中实现一个状态管理系统以替代React的`useState`。
    - [ ] 将所有React事件处理器（如`onClick`）转换为`main.js`中的`addEventListener`。
    - [ ] 创建当状态改变时被调用的手动UI更新函数。

- [ ] **任务3：转换并验证服务逻辑**
    - [ ] 从原始的`vectorStore.ts`创建缺失的`vectorStore.js`服务。这对AI的记忆至关重要。
    - [ ] 验证`geminiService.js`和`dataProcessor.js`与原始版本功能完全一致。

- [ ] **提高代码可维护性**
  - [ ] **任务4：定义数据结构**
    - [ ] 在相关文件（`main.js`, `dataProcessor.js`）的顶部为重要数据结构（`AnalysisPlan`, `AnalysisCardData`, `ColumnProfile`）添加JSDoc `/** @typedef */` 注释。
  - [ ] （可选）通过将UI渲染函数（`render...`）与逻辑处理函数（`handle...`）拆分到不同的模块/文件中来重构`main.js`。

## P2：用户体验优化与次要功能

- [ ] **恢复次要的UI功能**
  - [x] 实现一个更丰富的交互式图例，带有数值/百分比显示，类似于原始的`InteractiveLegend.tsx`。
  - [ ] 为分析卡添加更详细的工具提示或上下文菜单以支持高级操作。

- [ ] **重新启用上传时的API密钥验证**
  - [ ] 在缺少凭据时阻止文件解析。
  - [ ] 模仿React的用户体验，在允许文件上传前突出显示设置要求。

## 已完成项目

- [x] 恢复会话持久化和历史记录面板
- [x] 重新引入助手侧边面板用户体验
- [x] 恢复设置模态框工作流程
- [x] 重新创建分析仪表板组件（基本功能）
- [x] 对齐CSV解析和预处理行为
- [x] 匹配聊天流程和AI提示（基本功能）
