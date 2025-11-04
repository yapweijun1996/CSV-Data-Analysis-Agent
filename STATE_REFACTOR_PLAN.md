# State Management Refactor Plan

## Goals

- Reduce `main.js` complexity by splitting responsibilities into dedicated vanilla JS modules.
- Preserve existing functionality while improving maintainability and enabling stricter typing via JSDoc.
- Provide a migration path that mirrors the original React component structure (render vs. handlers vs. state helpers).

## Target Module Layout

```
src/
  state/
    stateManager.js          // holds app state container, setState wrapper, persistence helpers
    selectors.js             // derived data helpers (e.g., getNumericColumns)
  render/
    appShell.js              // orchestrates top-level layout and mounts sub-views
    analysisPanel.js         // builds analysis cards grid & summary
    analysisCard.js          // renders single card, legend, export controls
    chartRenderer.js         // wraps Chart.js instantiation & zoom controls
    chatPanel.js             // renders assistant timeline + input area
    rawDataPanel.js          // spreadsheet explorer (filter/sort/pagination)
    helpers.js               // shared templating utilities / escapeHtml etc.
  handlers/
    uploadHandlers.js        // file upload / drag-drop / API key gating
    cardHandlers.js          // chart type, topN, legend toggles, DOM actions
    chatHandlers.js          // send message, auto-scroll, AI response pipeline
    memoryHandlers.js        // vectorStore wiring, memory panel interactions
    historyHandlers.js       // report load/delete, session archive
  types/
    typedefs.js              // central JSDoc typedef exports (AnalysisPlan, etc.)
main.js                      // orchestration entry: wires modules, bootstraps custom element
```

> Locations use `src/` prefix for future organisation; actual files can live alongside `main.js` initially and be moved as directories stabilise.

## Extraction Phases

1. **Documentation & Typing**
   - Add `types/typedefs.js` with `AnalysisPlan`, `AnalysisCardData`, `ColumnProfile`.
   - Reference typedefs via `@typedef` and `@type` tags inside `main.js`.
2. **Render Layer Separation**
   - Move pure render utilities (`renderAnalysisCard`, `renderAssistantPanel`, `renderRawDataPanel`) into `render/`.
   - Ensure render functions accept state slices + callbacks (no direct DOM manipulation).
3. **Handler Layer Separation**
   - Relocate action handlers (`handleFileInput`, `handleChatSubmit`, DOM action map) into `handlers/`.
   - Keep side-effects (storage, vector store, Chart updates) within handlers and expose minimal APIs.
4. **State Container Extraction**
   - Extract `setState`, `captureSerializableAppState`, session save/restore, scroll tracking into `state/stateManager.js`.
   - Provide explicit lifecycle hooks (mount/unmount) for custom element.
5. **Progressive Cleanup**
   - Replace `main.js` method bodies with module imports, ensuring custom element delegates logic.
   - Update `todo.md` progress once each phase is validated.

## High-Risk Areas

- **DOM Action Queue (main.js 2000–3500):** depends on card registries and real-time DOM updates. Needs careful coordination when moving to handlers.
- **Chart.js Instances:** currently stored on `this.chartInstances`. When moving to `render/chartRenderer.js`, ensure references persist via state or handler-managed maps.
- **Session Persistence:** `scheduleSessionSave` uses timers tied to component instance; state module must retain timer management to avoid leaks.
- **Memory Panel:** enabling vector store requires asynchronous init; handlers should expose readiness checks to render layer without direct store access.

## Verification Checklist

- Upload CSV -> cards render -> TopN/legend toggles function.
- Chat message pipeline (plan start, proactive insight) still updates timeline.
- Memory panel search/delete reflects vector store operations.
- History panel load/delete operations update UI.
- Export actions (PNG/CSV/HTML) still work for analysis cards.

