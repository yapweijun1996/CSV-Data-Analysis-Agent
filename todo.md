# TODO — Restore React Feature Parity

- [x] Reinstate session persistence & history panel  
  - Load `CURRENT_SESSION_KEY` on startup and auto-save updates to IndexedDB  
  - Provide UI to browse, load, and delete saved reports (History drawer)

- [x] Reintroduce assistant side panel UX  
  - Editable Chat/Progress timeline with smooth autoscroll  
  - Show/Hide toggle for assistant panel, resizable layout akin to React aside

- [x] Restore settings modal workflow  
  - Modal UI to edit provider, API keys, model, language  
  - Auto-open settings when API key missing after upload/chat attempts  
  - Focus API key input for fast credential entry

- [x] Recreate analysis dashboard components  
  - Analysis cards with chart controls (chart type switch, top-N, legend toggles)  
  - Export actions (PNG, CSV, HTML) + selection detail toggles  
  - Raw data spreadsheet panel with visibility toggle and table interactions (sort indicators, reset, filtered counts)

- [x] Align CSV parsing & preprocessing behavior  
  - Use header-aware parsing and data aggregation logic matching React version (column naming, date-aware sorting)  
  - Ensure metadata/profile generation mirrors original outputs

- [x] Match chat pipeline & AI prompts  
  - Sync prompt structure, action schema, and chat handling to React baseline  
  - Default audit/repair & memory features to off for parity while keeping code paths available

All React parity tasks are now complete. Add new items here when further enhancements are needed.
