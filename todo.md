# TODO — Restore React Feature Parity

- [ ] Reinstate session persistence & history panel  
  - Load `CURRENT_SESSION_KEY` on startup and auto-save updates to IndexedDB  
  - Provide UI to browse, load, and delete saved reports (History drawer)

- [ ] Reintroduce assistant side panel UX  
  - Editable Chat/Progress timeline with smooth autoscroll  
  - Show/Hide toggle for assistant panel, resizable layout akin to React aside

- [ ] Restore settings modal workflow  
  - Modal UI to edit provider, API keys, model, language  
  - Auto-open settings when API key missing after upload/chat attempts

- [ ] Recreate analysis dashboard components  
  - Analysis cards with chart controls (chart type switch, top-N, legend toggles)  
  - Raw data spreadsheet panel with visibility toggle and table interactions

- [ ] Align CSV parsing & preprocessing behavior  
  - Use header-aware parsing and data cleansing logic matching React version  
  - Ensure metadata/profile generation mirrors original outputs

- [ ] Match chat pipeline & AI prompts  
  - Sync prompt structure, action schema, and chat handling to React baseline  
  - Decide whether to keep or remove new audit/repair/memory features

