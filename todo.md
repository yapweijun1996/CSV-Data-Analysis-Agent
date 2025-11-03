# TODO — 恢复与 React 版本相同的功能

此列表追踪了将原生 JS 版本功能与原始 React/TSX 参考实现保持一致所需的工作。

## P0：关键的用户功能

- [x] **实现可编辑的电子表格**
  - [x] 在 `renderRawDataPanel` 的原始数据表格中添加 `contenteditable` 单元格或输入字段。
  - [x] 在 `bindEvents` 中创建事件处理程序以捕获单元格更改（例如，在 `blur` 或 `keydown` 事件上）。
  - [x] 实现一个“保存更改”按钮，该按钮将所有编辑收集到一个新的数据数组中，并调用 `rebuildAfterDataChange` 以重新运行分析流程。

- [ ] **实现导出功能**
  - [ ] 在 `renderAnalysisCard` 的每个分析卡中添加“导出”按钮/菜单（PNG, CSV）。
  - [ ] 使用 `html-to-image` 库实现 `handleExportPNG` 以捕获卡片的画布/容器。
  - [ ] 实现 `handleExportCSV` 以将 `card.aggregatedData` 序列化为 CSV 字符串并触发文件下载。

- [ ] **恢复卡片筛选功能**
  - [ ] 支持 `filterCard` DOM 操作并持久化每个卡片的筛选状态。
  - [ ] 在卡片上显示当前生效的筛选器横幅，并允许 AI/用户清除筛选器。

## P1：可维护性与开发者体验

- [ ] **提高代码可维护性**
  - [ ] 在相关文件（`main.js`, `dataProcessor.js`）的顶部为重要数据结构（`AnalysisPlan`, `AnalysisCardData`, `ColumnProfile`）添加 JSDoc `/** @typedef */` 注释。
  - [ ] （可选）通过将 UI 渲染函数（`render...`）与逻辑处理函数（`handle...`）拆分到不同的模块/文件中来重构 `main.js`。

## P2：用户体验优化与次要功能

- [ ] **恢复次要的 UI 功能**
  - [ ] 实现一个更丰富的交互式图例，带有数值/百分比显示，类似于原始的 `InteractiveLegend.tsx`。
  - [ ] 为分析卡添加更详细的工具提示或上下文菜单以支持高级操作。

- [ ] **重新启用上传时的 API 密钥验证**
  - [ ] 在缺少凭据时阻止文件解析。
  - [ ] 模仿 React 的用户体验，在允许文件上传前突出显示设置要求。

## 已完成项目

- [x] 恢复会话持久化和历史记录面板
- [x] 重新引入助手侧边面板用户体验
- [x] 恢复设置模态框工作流程
- [x] 重新创建分析仪表板组件（基本功能）
- [x] 对齐 CSV 解析和预处理行为
- [x] 匹配聊天流程和 AI 提示（基本功能）
