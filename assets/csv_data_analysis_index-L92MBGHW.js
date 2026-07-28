const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js","./csv_data_analysis_vendor-data-gCZ_DPYi.js","./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-ai-google-CTyAUw0K.js","./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js","./csv_data_analysis_ChatPanel-vrqHZ0-b.js","./csv_data_analysis_vendor-react-core-C-mUT8EF.js","./csv_data_analysis_vendor-state-LvY-J6mW.js","./csv_data_analysis_MarkdownRenderer-8qXuZeTk.js","./csv_data_analysis_vendor-ui-DPkU1-1J.js","./csv_data_analysis_IconInsights-miXHhJGo.js","./csv_data_analysis_IconSettings-B7Z7C3gl.js","./csv_data_analysis_IconMemory-CuUVrq-7.js","./csv_data_analysis_IconAi-zaXrTUAQ.js","./csv_data_analysis_AnalysisPanel-CkBOuQ3L.js","./csv_data_analysis_exportUtils-CPeSo2GB.js","./csv_data_analysis_IconClose-Cz0XDY4R.js","./csv_data_analysis_TabulatorTable-DqiIrnfv.js","./csv_data_analysis_CleaningRunBanner-BisHlpXC.js","./csv_data_analysis_AiTaskStatusBubble-BAgmBWor.js","./csv_data_analysis_IconSearch-BADyiBOM.js","./csv_data_analysis_SpreadsheetPanel-OhyWDqNn.js","./csv_data_analysis_SettingsModal-D8B1HDw5.js","./csv_data_analysis_HistoryPanel-MKT2jDTR.js","./csv_data_analysis_MemoryPanel-DvzFwn3R.js","./csv_data_analysis_AgentMonitorModal-CUnWcB6K.js","./csv_data_analysis_AgentActivityView-DyuWYDYj.js","./csv_data_analysis_DatabaseModal-CLuwnKwA.js","./csv_data_analysis_WorkspaceModal-CKQ65e1W.js","./csv_data_analysis_DataPreparationWorkflowModal-BUhaUGvB.js","./csv_data_analysis_copyText-Di0nQNpb.js","./csv_data_analysis_DebugLogsModal-ByHTXZkr.js","./csv_data_analysis_ReportBoundaryConfirmModal-BWcnLoqL.js","./csv_data_analysis_ApiKeyRequiredModal-BinkYOhc.js","./csv_data_analysis_CloudAiConsentModal-DBLQcV0O.js"])))=>i.map(i=>d[i]);
import { r as reactDomExports, j as jsxRuntimeExports, a as reactExports, W as We, R as ReactDOM } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { b as buildCloudAiConsentKey, s as shouldAllowAgentThinkingSurface, a as shouldAllowLongTermMemorySurface, c as shouldAllowLogsSurface, d as shouldAllowWorkflowSurface, e as shouldAllowWorkspaceSurface, f as shouldAllowDatabaseSurface, g as shouldAllowSettingsSurface, h as grantCloudAiConsent, i as getDefaultSettings, _ as __vitePreload, n as normalizeRuntimeAccessControlSettings, j as normalizeAppLanguage, k as saveSettings, l as createId, m as disposeDuckDbQueryEngine, o as getReport, C as CURRENT_SESSION_KEY, v as vectorStore, p as deleteReport, q as createIdleDuckDbSessionStatus, r as saveReport, t as deleteOriginalData, u as parseReportArtifactManifest, w as loadReportArtifactHtml, x as printReportArtifact, y as openReportArtifact, z as purgeAllStorage, A as normalizeRestoredAppState, B as resolveReportMemoryScope, D as hydrateLatestReportWorkspaceFiles, E as normalizeRestoredGoalState, F as restoreAgentActivityHistory, G as normalizeSavedReportPendingMemoryDocuments, H as normalizeSavedAgentMemoryRuns, I as normalizeSavedAgentMemoryRun, J as normalizeSavedReportMemoryDocuments, K as appendUnfinishedCleaningNotice, L as getReportsList, M as createChatMessage, N as navigateToCard, O as buildColumnRegistry, P as duckDbWorkerClient, Q as DUCKDB_INIT_TIMEOUT_MS, R as profileDataWithWorker, S as createBindingDuckDbSessionStatus, T as getOriginalData, U as getTranslation, V as getAllowedColumns, W as createProgressMessage, X as trimProgressMessages, Y as isDuckDbSessionStatusEqual, Z as primeDuckDbDataset, $ as createDuckDbSessionStatusFromBinding, a0 as buildEffectiveColumnRegistryFromState, a1 as createWorkerDiagnosticsTelemetryReporter, a2 as parseCardMentions, a3 as buildCorrelationFields, a4 as toSerializable, a5 as normalizeAgentActivityEvent, a6 as LATEST_REPORT_MANIFEST_PATH, a7 as hasOpenableLatestReport, a8 as getCurrentAnalysisDatasetVersion, a9 as LATEST_REPORT_HTML_PATH, aa as generateAnalystReportArtifacts, ab as saveReportArtifacts, ac as buildPersistedReportRecord, ad as isRuntimeAbortError, ae as recordLocalDiagnosticBestEffort, af as projectToolLogToActivity, ag as projectRuntimeEventToActivity, ah as getSettings, ai as configureCloudAiConsentRuntime, aj as configureLocalDiagnosticContext, ak as shouldShowNewSessionButton, al as shouldShowHistoryButton, am as shouldShowDatabaseButton, an as shouldShowWorkflowButton, ao as shouldShowLogsButton, ap as shouldShowChangeGoalButton, aq as shouldShowAssistantToggleButton, ar as buildPersistedAppStateSignature, as as checkStorageHealth, at as persistCurrentAppSessionSnapshot, au as APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, av as shouldShowAgentThinkingModal, aw as shouldShowLongTermMemory, ax as formatUserError } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { c as createWithEqualityFn, s as shallow$1 } from "./csv_data_analysis_vendor-state-LvY-J6mW.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;
const MIN_MAIN_WIDTH = 600;
let pendingConsentCoordinator = null;
const createUISlice = (set, get) => ({
  // Start with the Assistant closed on every device. Before a dataset exists,
  // the empty panel competes with the only useful action: importing a CSV.
  // The header keeps an explicit Assistant control available at all times.
  isAsideVisible: false,
  resultsViewMode: (() => {
    try {
      return window.sessionStorage.getItem("csv_agent_results_view") === "explore" ? "explore" : "simple";
    } catch {
      return "simple";
    }
  })(),
  asideWidth: window.innerWidth / 4 > MIN_ASIDE_WIDTH ? window.innerWidth / 4 : MIN_ASIDE_WIDTH,
  isSpreadsheetVisible: false,
  isSettingsModalOpen: false,
  isHistoryPanelOpen: false,
  isDatabaseModalOpen: false,
  isWorkspaceModalOpen: false,
  isDataPreparationModalOpen: false,
  isDebugLogsModalOpen: false,
  isMemoryPanelOpen: false,
  isAgentModalOpen: false,
  isReportBoundaryConfirmModalOpen: false,
  isApiKeyRequiredModalOpen: false,
  pendingCloudAiConsent: null,
  cloudAiConsentError: null,
  isResizing: false,
  pendingPrecomputedCardData: null,
  globalErrorToast: null,
  setGlobalErrorToast: (toast) => set({ globalErrorToast: toast }),
  setResultsViewMode: (mode) => {
    try {
      window.sessionStorage.setItem("csv_agent_results_view", mode);
    } catch {
    }
    set({ resultsViewMode: mode });
  },
  setPendingPrecomputedCardData: (data) => set({ pendingPrecomputedCardData: data }),
  handleAsideMouseDown: (e) => {
    e.preventDefault();
    set({ isResizing: true });
    const handleMouseMove = (moveEvent) => {
      const maxAllowedAsideWidth = window.innerWidth - MIN_MAIN_WIDTH;
      let newWidth = window.innerWidth - moveEvent.clientX;
      newWidth = Math.max(MIN_ASIDE_WIDTH, newWidth);
      newWidth = Math.min(MAX_ASIDE_WIDTH, newWidth, maxAllowedAsideWidth);
      set({ asideWidth: newWidth });
    };
    const handleMouseUp = () => {
      set({ isResizing: false });
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  },
  setIsAsideVisible: (isVisible) => set({ isAsideVisible: isVisible }),
  setIsSpreadsheetVisible: (isVisible) => set({ isSpreadsheetVisible: isVisible }),
  setIsSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen ? shouldAllowSettingsSurface() : false }),
  setIsHistoryPanelOpen: (isOpen) => set({ isHistoryPanelOpen: isOpen }),
  setIsDatabaseModalOpen: (isOpen) => set({ isDatabaseModalOpen: isOpen ? shouldAllowDatabaseSurface() : false }),
  setIsWorkspaceModalOpen: (isOpen) => set({ isWorkspaceModalOpen: isOpen ? shouldAllowWorkspaceSurface() : false }),
  setIsDataPreparationModalOpen: (isOpen) => set({ isDataPreparationModalOpen: isOpen ? shouldAllowWorkflowSurface() : false }),
  setIsDebugLogsModalOpen: (isOpen) => set({ isDebugLogsModalOpen: isOpen ? shouldAllowLogsSurface() : false }),
  setIsMemoryPanelOpen: (isOpen) => set({ isMemoryPanelOpen: isOpen ? shouldAllowLongTermMemorySurface() : false }),
  setIsAgentModalOpen: (isOpen) => set({ isAgentModalOpen: isOpen ? shouldAllowAgentThinkingSurface() : false }),
  setIsReportBoundaryConfirmModalOpen: (isOpen) => set({ isReportBoundaryConfirmModalOpen: isOpen }),
  setIsApiKeyRequiredModalOpen: (isOpen) => set({ isApiKeyRequiredModalOpen: isOpen }),
  requestCloudAiConsent: (request) => {
    const key = buildCloudAiConsentKey(request);
    if ((pendingConsentCoordinator == null ? void 0 : pendingConsentCoordinator.key) === key) {
      return pendingConsentCoordinator.promise;
    }
    pendingConsentCoordinator == null ? void 0 : pendingConsentCoordinator.resolve(false);
    let resolveConsent;
    const promise = new Promise((resolve) => {
      resolveConsent = resolve;
    });
    pendingConsentCoordinator = {
      key,
      promise,
      resolve: resolveConsent
    };
    set({
      pendingCloudAiConsent: request,
      cloudAiConsentError: null
    });
    return promise;
  },
  resolveCloudAiConsent: async (granted) => {
    const coordinator = pendingConsentCoordinator;
    if (!coordinator) return;
    if (granted) {
      try {
        const request = get().pendingCloudAiConsent;
        if (!request) {
          throw new Error("The pending cloud AI consent request is unavailable.");
        }
        await grantCloudAiConsent(request);
      } catch (error) {
        set({
          cloudAiConsentError: error instanceof Error ? error.message : "Cloud AI consent could not be saved."
        });
        return;
      }
    }
    pendingConsentCoordinator = null;
    set({
      pendingCloudAiConsent: null,
      cloudAiConsentError: null
    });
    coordinator.resolve(granted);
  }
});
let _isProviderConfigured$1 = null;
const defaultSettings = getDefaultSettings();
const createSettingsSlice = (set, get) => ({
  settings: defaultSettings,
  isApiKeySet: false,
  handleSaveSettings: async (newSettings) => {
    if (!_isProviderConfigured$1) {
      const mod = await __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c4), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      _isProviderConfigured$1 = mod.isProviderConfigured;
    }
    const normalizedSettings = {
      ...newSettings,
      language: normalizeAppLanguage(newSettings.language),
      runtimeAccessControl: normalizeRuntimeAccessControlSettings(newSettings.runtimeAccessControl)
    };
    set({ settings: normalizedSettings, isApiKeySet: _isProviderConfigured$1(normalizedSettings) });
    const { invalidateProviderHealthCache } = await __vitePreload(async () => {
      const { invalidateProviderHealthCache: invalidateProviderHealthCache2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c4);
      return { invalidateProviderHealthCache: invalidateProviderHealthCache2 };
    }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
    invalidateProviderHealthCache();
    void saveSettings(normalizedSettings).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      get().addProgress(`Failed to save settings: ${message}`, "error");
    });
  },
  setReportTemplate: (reportTemplate) => {
    const currentSettings = get().settings;
    get().handleSaveSettings({
      ...currentSettings,
      reportTemplate
    });
  }
});
const TAB_SESSION_STORAGE_KEY = "csv_agent_tab_session_id";
const isSessionStorageAvailable = () => typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
const generateSessionId = () => createId("session");
const readTabSessionId = () => {
  if (!isSessionStorageAvailable()) {
    return null;
  }
  return window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
};
const writeTabSessionId = (sessionId) => {
  if (!isSessionStorageAvailable()) {
    return sessionId;
  }
  window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
};
const createAndStoreTabSessionId = () => writeTabSessionId(generateSessionId());
const discardAgrunSessionCheckpoint = async (sessionId) => {
  const { discardAgrunFollowUpSession } = await __vitePreload(async () => {
    const { discardAgrunFollowUpSession: discardAgrunFollowUpSession2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cg);
    return { discardAgrunFollowUpSession: discardAgrunFollowUpSession2 };
  }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
  await discardAgrunFollowUpSession(sessionId);
};
const purgeInactiveAgrunCheckpoints = async (activeSessionId) => {
  const { purgeAgrunFollowUpCheckpoints } = await __vitePreload(async () => {
    const { purgeAgrunFollowUpCheckpoints: purgeAgrunFollowUpCheckpoints2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cg);
    return { purgeAgrunFollowUpCheckpoints: purgeAgrunFollowUpCheckpoints2 };
  }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
  await purgeAgrunFollowUpCheckpoints([activeSessionId]);
};
const createHistorySlice = (set, get) => ({
  reportsList: [],
  loadReportsList: async () => {
    const list = await getReportsList();
    set({ reportsList: list });
  },
  /** Load reports list only if cache is empty or stale (>30s). */
  loadReportsListIfNeeded: async () => {
    const current = get().reportsList;
    const lastLoaded = get()._reportsListLoadedAt;
    const now = Date.now();
    if (current.length > 0 && lastLoaded && now - lastLoaded < 3e4) return;
    const list = await getReportsList();
    set({ reportsList: list, _reportsListLoadedAt: now });
  },
  handleLoadReport: async (id) => {
    var _a, _b;
    const activeTurn = get().activeTurn;
    if (activeTurn && activeTurn.status === "running") {
      get().addProgress("Cannot load a report while an AI turn is running. Please wait for it to finish or cancel it first.", "error");
      return;
    }
    get().addProgress(`Loading report ${id}...`);
    const [report, { normalizeDataPreparationPlan }, { updateCleaningRun }] = await Promise.all([
      getReport(id),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c2), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cb), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
    ]);
    if (report) {
      await discardAgrunSessionCheckpoint(get().sessionId);
      const normalizedAppState = normalizeRestoredAppState(report.appState);
      const restoredMemoryScope = normalizedAppState.reportMemoryScope ?? (report.lineage ? {
        reportId: report.lineage.reportId,
        datasetId: report.lineage.datasetId,
        datasetVersion: report.lineage.currentVersionId
      } : resolveReportMemoryScope(normalizedAppState));
      const hydratedWorkspaceFiles = await hydrateLatestReportWorkspaceFiles(normalizedAppState.workspaceFiles ?? {});
      const nextSessionId = createAndStoreTabSessionId();
      const loadedAt = /* @__PURE__ */ new Date();
      await disposeDuckDbQueryEngine();
      await vectorStore.clear();
      set({
        ...normalizedAppState,
        sessionId: nextSessionId,
        reportMemoryScope: restoredMemoryScope,
        agentMemoryRun: restoredMemoryScope ? normalizeSavedAgentMemoryRun(normalizedAppState.agentMemoryRun, restoredMemoryScope) : null,
        liveAgentMemoryRun: restoredMemoryScope ? normalizeSavedAgentMemoryRun(normalizedAppState.liveAgentMemoryRun, restoredMemoryScope) : null,
        agentMemoryHistory: restoredMemoryScope ? normalizeSavedAgentMemoryRuns(normalizedAppState.agentMemoryHistory, restoredMemoryScope) : [],
        pendingVectorMemoryDocs: restoredMemoryScope ? normalizeSavedReportPendingMemoryDocuments(
          normalizedAppState.pendingVectorMemoryDocs,
          restoredMemoryScope
        ) : [],
        workspaceFiles: hydratedWorkspaceFiles,
        workspaceActionHistory: normalizedAppState.workspaceActionHistory ?? [],
        queryHistory: normalizedAppState.queryHistory ?? [],
        // Report state can persist a formerly-ready binding, but the
        // active worker session was disposed before this restore.
        duckDbSessionStatus: createIdleDuckDbSessionStatus(),
        dataPreparationPlan: normalizeDataPreparationPlan(normalizedAppState.dataPreparationPlan),
        pendingClarification: null,
        pendingMutationConfirmation: normalizedAppState.pendingMutationConfirmation ?? null,
        activeTurn: null,
        queuedChatTurns: [],
        queuedAgentRuns: [],
        cancelRequestedTurnId: null,
        runtimeEvents: [],
        runtimeRunHistory: [],
        lastInsightExtractedAtTurn: 0,
        agentEvents: restoreAgentActivityHistory(
          normalizedAppState.agentEvents,
          nextSessionId
        ),
        cleaningRun: normalizedAppState.cleaningRun ? updateCleaningRun(normalizedAppState.cleaningRun, {
          status: normalizedAppState.cleaningRun.status === "completed" ? "completed" : "paused",
          shouldAutoResume: false
        }) : null,
        analysisCards: normalizedAppState.cleaningRun && normalizedAppState.cleaningRun.status !== "completed" ? [] : normalizedAppState.analysisCards,
        finalSummary: normalizedAppState.cleaningRun && normalizedAppState.cleaningRun.status !== "completed" ? null : normalizedAppState.finalSummary,
        aiCoreAnalysisSummary: normalizedAppState.cleaningRun && normalizedAppState.cleaningRun.status !== "completed" ? null : normalizedAppState.aiCoreAnalysisSummary,
        initialAnalysisStatus: normalizedAppState.initialAnalysisStatus ?? (normalizedAppState.cleaningRun && normalizedAppState.cleaningRun.status !== "completed" ? "idle" : (((_a = normalizedAppState.analysisCards) == null ? void 0 : _a.length) ?? 0) > 0 || Boolean(normalizedAppState.finalSummary) ? "ready" : "idle"),
        goalState: normalizeRestoredGoalState(normalizedAppState.goalState),
        currentView: normalizedAppState.csvData ? "analysis_dashboard" : "file_upload",
        isHistoryPanelOpen: false,
        isWorkspaceModalOpen: false,
        isDataPreparationModalOpen: false,
        isDebugLogsModalOpen: false,
        activeDataQuery: null,
        activeSpreadsheetFilter: normalizedAppState.activeSpreadsheetFilter ?? null,
        isBusy: false,
        chatLifecycleState: "idle",
        isGeneratingReport: false,
        isSummaryGenerating: false,
        reportGenerationProgress: null,
        isCardReviewInProgress: false,
        aiTaskStatus: null,
        sessionCreatedAt: loadedAt,
        vectorStoreDocuments: []
      });
      const savedVectorDocs = restoredMemoryScope ? normalizeSavedReportMemoryDocuments(
        normalizedAppState.vectorStoreDocuments ?? [],
        restoredMemoryScope
      ) : [];
      if (Array.isArray(savedVectorDocs) && savedVectorDocs.length > 0 && savedVectorDocs.every((d) => Array.isArray(d.embedding) && d.embedding.length > 0)) {
        void (async () => {
          try {
            await vectorStore.rehydrate(savedVectorDocs);
            set({
              vectorStoreDocuments: savedVectorDocs,
              vectorMemoryState: "queued"
            });
            vectorStore.schedulePersist();
            get().addProgress("Restored AI long-term memory from the loaded report.");
          } catch {
          }
        })();
      } else {
        void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(
          (m) => m.rebuildVectorMemoryFromState({ getState: get, setState: set }, {
            reset: true,
            includeDatasetDocs: true,
            progressMessage: "Rebuilding AI long-term memory from the loaded report..."
          })
        );
      }
      if (((_b = normalizedAppState.cleaningRun) == null ? void 0 : _b.status) === "completed" || !normalizedAppState.cleaningRun) {
        await get().refreshDuckDbSession();
      } else {
        set((prev) => ({
          chatHistory: appendUnfinishedCleaningNotice(prev.chatHistory, "history_load")
        }));
      }
      get().addProgress(`Report "${report.filename}" loaded.`);
    } else {
      get().addProgress(`Failed to load report ${id}.`, "error");
    }
  },
  handleDeleteReport: async (id) => {
    try {
      await deleteReport(id);
      await get().loadReportsList();
    } catch (error) {
      get().addProgress(`Failed to delete report: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  },
  handlePurgeStorage: async () => {
    try {
      const result = await purgeAllStorage(get().sessionId);
      await purgeInactiveAgrunCheckpoints(get().sessionId);
      await get().loadReportsList();
      return result;
    } catch (error) {
      get().addProgress(`Failed to purge storage: ${error instanceof Error ? error.message : String(error)}`, "error");
      return { deletedReports: 0, freedMB: 0 };
    }
  },
  openPersistedReportArtifact: async (id) => {
    var _a, _b;
    const report = await getReport(id);
    const manifest = parseReportArtifactManifest((_b = (_a = report == null ? void 0 : report.appState) == null ? void 0 : _a.workspaceFiles) == null ? void 0 : _b["/workspace/reports/latest-analyst-report.manifest.json"]);
    const html = manifest ? await loadReportArtifactHtml(manifest.reportId) : null;
    if (!html) {
      get().addProgress(`No saved report artifact was found for ${id}.`, "error");
      return;
    }
    const openedWindow = openReportArtifact(html);
    if (!openedWindow) {
      get().addProgress(`Failed to open the saved report for ${id}.`, "error");
    }
  },
  exportPersistedReportPdf: async (id) => {
    var _a, _b;
    const report = await getReport(id);
    const manifest = parseReportArtifactManifest((_b = (_a = report == null ? void 0 : report.appState) == null ? void 0 : _a.workspaceFiles) == null ? void 0 : _b["/workspace/reports/latest-analyst-report.manifest.json"]);
    const html = manifest ? await loadReportArtifactHtml(manifest.reportId) : null;
    if (!html) {
      get().addProgress(`No saved report artifact was found for ${id}.`, "error");
      return;
    }
    const openedWindow = printReportArtifact(html);
    if (!openedWindow) {
      get().addProgress(`Failed to open the saved report for PDF export: ${id}.`, "error");
    }
  },
  handleNewSession: async () => {
    try {
      const outgoingSessionId = get().sessionId;
      const settings = get().settings;
      const isApiKeySet = get().isApiKeySet;
      let archivedSession = null;
      set({
        currentView: "file_upload",
        isBusy: true,
        chatLifecycleState: "running"
      });
      await disposeDuckDbQueryEngine();
      if (get().csvData) {
        const existingSession = await getReport(CURRENT_SESSION_KEY);
        if (existingSession) {
          const archiveId = `report-${existingSession.createdAt.getTime()}`;
          archivedSession = { ...existingSession, id: archiveId, updatedAt: /* @__PURE__ */ new Date() };
        }
      }
      await vectorStore.clear();
      await deleteReport(CURRENT_SESSION_KEY);
      void __vitePreload(async () => {
        const { removeOpfsDatasetSession } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c8);
        return { removeOpfsDatasetSession };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(({ removeOpfsDatasetSession }) => removeOpfsDatasetSession(get().sessionId)).catch((error) => console.warn("[History] Could not clear temporary OPFS data.", error));
      void __vitePreload(async () => {
        const { clearSandboxTableRows } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ci);
        return { clearSandboxTableRows };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(({ clearSandboxTableRows }) => {
        var _a;
        return clearSandboxTableRows((_a = get().datasetBundle) == null ? void 0 : _a.bundleId);
      }).catch((error) => console.warn("[History] Could not clear temporary sandbox tables.", error));
      const nextSessionId = createAndStoreTabSessionId();
      set({
        currentView: "file_upload",
        sessionId: nextSessionId,
        isBusy: false,
        chatLifecycleState: "idle",
        progressMessages: [],
        telemetryEvents: [],
        agentEvents: [],
        agentMemoryRun: null,
        liveAgentMemoryRun: null,
        agentMemoryHistory: [],
        selectedMemoryRunId: null,
        currentDatasetId: null,
        datasetBundle: null,
        csvData: null,
        rawCsvData: null,
        rawIntakeIr: null,
        reportStructureResolution: null,
        canonicalCsvData: null,
        canonicalBuildMeta: null,
        canonicalizationStatus: "idle",
        pipelineOutcome: null,
        reportContextResolution: null,
        datasetSemanticSnapshot: null,
        semanticStatus: "idle",
        semanticDatasetVersion: null,
        columnProfiles: [],
        columnRegistry: null,
        analysisCards: [],
        chatHistory: [],
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        dataPreparationPlan: null,
        initialDataSample: null,
        vectorStoreDocuments: [],
        vectorMemoryState: "cold",
        pendingVectorMemoryDocs: [],
        reportMemoryScope: null,
        spreadsheetFilterFunction: null,
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        aiFilterExplanation: null,
        pendingClarification: null,
        resolvedClarifications: null,
        pendingMutationConfirmation: null,
        activeTurn: null,
        queuedChatTurns: [],
        queuedAgentRuns: [],
        cancelRequestedTurnId: null,
        runtimeEvents: [],
        runtimeRunHistory: [],
        aiTaskStatus: null,
        initialAnalysisStatus: "idle",
        confirmedAnalysisGoal: null,
        goalState: "idle",
        dataQualityIssues: null,
        isChangingGoal: false,
        planQueue: [],
        contextualSummary: null,
        isGeneratingReport: false,
        isSummaryGenerating: false,
        reportGenerationProgress: null,
        sessionCreatedAt: /* @__PURE__ */ new Date(),
        agentToolLogs: [],
        cardEnhancementSuggestions: [],
        isCardReviewInProgress: false,
        isWorkspaceModalOpen: false,
        isDataPreparationModalOpen: false,
        isDebugLogsModalOpen: false,
        workspaceFiles: {},
        workspaceActionHistory: [],
        cleaningRun: null,
        queryHistory: [],
        duckDbSessionStatus: createIdleDuckDbSessionStatus(),
        // Now, restore settings and other preserved state
        settings,
        isApiKeySet
      });
      const maintenanceResults = await Promise.allSettled([
        archivedSession ? saveReport(archivedSession) : Promise.resolve(),
        outgoingSessionId ? discardAgrunSessionCheckpoint(outgoingSessionId) : Promise.resolve(),
        outgoingSessionId ? deleteOriginalData(outgoingSessionId) : Promise.resolve()
      ]);
      if (maintenanceResults.some((result) => result.status === "rejected")) {
        get().addProgress(
          "The new session is ready, but some previous-session cleanup could not finish.",
          "warning"
        );
      }
      await get().loadReportsList();
    } catch (error) {
      set({
        isBusy: false,
        chatLifecycleState: "idle",
        currentView: "file_upload"
      });
      get().addProgress(`Failed to start a new session: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }
});
const MAX_CACHE_SIZE = 100;
const cache = /* @__PURE__ */ new Map();
function computeDataContentHash(data) {
  if (!data || data.length === 0) return "0::";
  const first = JSON.stringify(data[0]);
  const last = data.length > 1 ? JSON.stringify(data[data.length - 1]) : first;
  return `${data.length}:${first}:${last}`;
}
function computeChartCacheKey(input) {
  const sorted = {};
  for (const key of Object.keys(input).sort()) {
    sorted[key] = input[key];
  }
  return JSON.stringify(sorted);
}
function getCachedChart(cardId) {
  return cache.get(cardId);
}
function setCachedChart(cardId, entry) {
  if (!cache.has(cardId) && cache.size >= MAX_CACHE_SIZE) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, val] of cache) {
      if (val.capturedAt < oldestTime) {
        oldestTime = val.capturedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(cardId, entry);
}
function invalidateChart(cardId) {
  cache.delete(cardId);
}
const createCardSlice = (set, get) => ({
  updateCardVisualSummary: (cardId, visualSummary) => set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, visualSummary, visuallyGrounded: true } : c) })),
  handleChartTypeChange: (cardId, newType) => {
    invalidateChart(cardId);
    set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, displayChartType: newType } : c) }));
  },
  updateCardVisualEvaluation: (cardId, evaluation, correctedChartType) => set((state2) => ({
    analysisCards: state2.analysisCards.map((c) => {
      if (c.id !== cardId) return c;
      if (correctedChartType) {
        return {
          ...c,
          visualEvaluation: evaluation,
          visuallyEvaluated: true,
          displayChartType: correctedChartType,
          plan: { ...c.plan, chartType: correctedChartType },
          visuallyGrounded: false
          // reset so visual summary re-fires for corrected chart
        };
      }
      return { ...c, visualEvaluation: evaluation, visuallyEvaluated: true };
    })
  })),
  handleToggleDataVisibility: (cardId) => set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, isDataVisible: !c.isDataVisible } : c) })),
  handleTopNChange: (cardId, topN) => {
    invalidateChart(cardId);
    set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, topN } : c) }));
  },
  handleHideOthersChange: (cardId, hide) => {
    invalidateChart(cardId);
    set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, hideOthers: hide } : c) }));
  },
  handleHideZeroValueRowsChange: (cardId, hide) => {
    invalidateChart(cardId);
    set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, hideZeroValueRows: hide } : c) }));
  },
  handlePivotColumnTopNChange: (cardId, topN) => set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, pivotColumnTopN: topN } : c) })),
  handlePivotHideOtherColumnsChange: (cardId, hide) => set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, pivotHideOtherColumns: hide } : c) })),
  handleTogglePivotSeriesLabel: (cardId, label) => {
    set((state2) => ({
      analysisCards: state2.analysisCards.map((c) => {
        if (c.id === cardId) {
          const currentHidden = c.hiddenPivotSeriesLabels || [];
          const newHidden = currentHidden.includes(label) ? currentHidden.filter((l) => l !== label) : [...currentHidden, label];
          return { ...c, hiddenPivotSeriesLabels: newHidden };
        }
        return c;
      })
    }));
  },
  handleResetPivotSeriesLabels: (cardId) => set((state2) => ({
    analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, hiddenPivotSeriesLabels: [] } : c)
  })),
  handleToggleLegendLabel: (cardId, label) => {
    set((state2) => ({
      analysisCards: state2.analysisCards.map((c) => {
        if (c.id === cardId) {
          const currentHidden = c.hiddenLabels || [];
          const newHidden = currentHidden.includes(label) ? currentHidden.filter((l) => l !== label) : [...currentHidden, label];
          return { ...c, hiddenLabels: newHidden };
        }
        return c;
      })
    }));
  },
  handleToggleDataLabels: (cardId) => {
    invalidateChart(cardId);
    set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, showDataLabels: !c.showDataLabels } : c) }));
  },
  handleTableSortChange: (cardId, sort) => set((state2) => ({ analysisCards: state2.analysisCards.map((c) => c.id === cardId ? { ...c, tableSort: sort } : c) })),
  handleShowCardFromChat: (cardId) => {
    navigateToCard(cardId);
  },
  deleteAnalysisCard: (cardId) => {
    var _a, _b, _c, _d;
    const card = get().analysisCards.find((item) => item.id === cardId);
    if (!card) return;
    invalidateChart(cardId);
    void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(
      (m) => m.removeCardMemoryDocument({ getState: get, setState: set }, cardId)
    );
    (_b = (_a = get()).addProgress) == null ? void 0 : _b.call(_a, `Removed card "${card.plan.title}".`);
    (_d = (_c = get()).logAgentToolUsage) == null ? void 0 : _d.call(_c, {
      tool: "card.delete",
      description: `Removed card "${card.plan.title}"`,
      detail: { cardId: card.id, title: card.plan.title }
    });
    set((state2) => ({
      analysisCards: state2.analysisCards.filter((item) => item.id !== cardId),
      finalSummary: null,
      finalSummaryProvenance: null,
      aiCoreAnalysisSummary: null,
      aiCoreAnalysisSummaryProvenance: null,
      cardEnhancementSuggestions: state2.cardEnhancementSuggestions.filter((suggestion) => suggestion.cardId !== cardId),
      chatHistory: [
        ...state2.chatHistory,
        createChatMessage({
          sender: "ai",
          text: `Deleted card **${card.plan.title}**.`,
          timestamp: /* @__PURE__ */ new Date(),
          type: "ai_message"
        })
      ]
    }));
  },
  addCalculatedColumnToCard: (cardId, newColumnName, formula, updateChart) => {
    let didUpdate = false;
    set((state2) => {
      var _a, _b;
      const cardIndex = state2.analysisCards.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) {
        console.error(`addCalculatedColumnToCard: Card with ID "${cardId}" not found.`);
        return {};
      }
      const card = state2.analysisCards[cardIndex];
      const { aggregatedData } = card;
      if (!aggregatedData || aggregatedData.length === 0) {
        console.error(`addCalculatedColumnToCard: Card with ID "${cardId}" has no data.`);
        return {};
      }
      try {
        const columnNames = Object.keys(aggregatedData[0]);
        const columnSet = new Set(columnNames);
        const tokens = formula.split(/([+\-*/\(\)\s])/).filter((t) => t.trim() !== "");
        const safeTokens = tokens.map((token) => {
          const cleanToken = token.replace(/^['"]|['"]$/g, "");
          if (columnSet.has(cleanToken)) {
            return `row['${cleanToken}']`;
          }
          return token;
        });
        const code = `return ${safeTokens.join("")}`;
        const calcFunction = new Function("row", code);
        const newData = aggregatedData.map((row) => {
          try {
            const value = calcFunction(row);
            const finalValue = typeof value === "number" && isFinite(value) ? value : null;
            return { ...row, [newColumnName]: finalValue };
          } catch (e) {
            console.error(`Error calculating column '${newColumnName}' for row:`, row, e);
            return { ...row, [newColumnName]: null };
          }
        });
        const numericCount = newData.filter((row) => typeof row[newColumnName] === "number" && isFinite(row[newColumnName])).length;
        if (numericCount === 0) {
          console.warn(`addCalculatedColumnToCard: Formula "${formula}" for "${newColumnName}" produced no numeric values.`);
          (_b = (_a = get()).addProgress) == null ? void 0 : _b.call(_a, `Skipped "${newColumnName}" because the formula produced no numeric values.`, "error");
          return {};
        }
        const newCards = [...state2.analysisCards];
        const newCard = { ...card, aggregatedData: newData };
        if (updateChart) {
          const newPlan = { ...newCard.plan };
          if (updateChart.useAs === "primaryY") {
            newPlan.valueColumn = newColumnName;
          } else if (updateChart.useAs === "secondaryY") {
            newPlan.secondaryValueColumn = newColumnName;
            if (updateChart.newChartType === "combo" && !newPlan.secondaryAggregation) {
              newPlan.secondaryAggregation = "sum";
            }
          }
          if (updateChart.newChartType) {
            newCard.displayChartType = updateChart.newChartType;
          }
          newCard.plan = newPlan;
        } else {
          const newPlan = { ...newCard.plan, valueColumn: newColumnName };
          if (newPlan.chartType === "scatter") {
            newPlan.chartType = "bar";
            newCard.displayChartType = "bar";
          }
          newCard.plan = newPlan;
        }
        newCards[cardIndex] = newCard;
        didUpdate = true;
        return {
          analysisCards: newCards,
          finalSummary: null,
          finalSummaryProvenance: null,
          aiCoreAnalysisSummary: null,
          aiCoreAnalysisSummaryProvenance: null
        };
      } catch (e) {
        console.error(`Failed to create calculation function for formula: "${formula}"`, e);
        return {};
      }
    });
    if (didUpdate) {
      void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(
        (m) => m.upsertCardMemoryDocument({ getState: get, setState: set }, cardId)
      );
    }
  }
});
const resolvePendingDatasetBundleRestore = (state2) => !state2.csvData ? state2.datasetBundle : null;
const createDataSlice = (set, get) => {
  const storeApi = { getState: get, setState: set };
  let inFlightSemanticSnapshot = null;
  let inFlightSemanticDatasetVersion = null;
  let inFlightDuckDbSessionRefresh = null;
  let inFlightDuckDbSessionDatasetVersion = null;
  let inFlightExternalPayloadId = null;
  const recentlyProcessedExternalPayloads = /* @__PURE__ */ new Map();
  let duckDbRefreshHelpersPromise = null;
  const describeTransport = (transport) => {
    switch (transport) {
      case "postMessage":
        return "postMessage";
      case "localStorage":
        return "localStorage";
      case "sessionStorage":
        return "sessionStorage";
      default:
        return "external";
    }
  };
  const buildSyntheticFileName = (event) => {
    const headerBase = (event.payload.header || "ai-chart-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ai-chart-report";
    const timestamp = new Date(event.meta.receivedAt).toISOString().replace(/[:]/g, "-");
    return `${headerBase}-${describeTransport(event.meta.transport)}-${timestamp}.csv`;
  };
  const markExternalPayloadProcessed = (payloadId) => {
    const now = Date.now();
    recentlyProcessedExternalPayloads.set(payloadId, now);
    for (const [candidateId, processedAt] of recentlyProcessedExternalPayloads.entries()) {
      if (now - processedAt > 6e4) {
        recentlyProcessedExternalPayloads.delete(candidateId);
      }
    }
  };
  const cloneCsvData = (data) => ({
    ...data,
    data: data.data.map((row) => ({ ...row })),
    metadataRows: [...data.metadataRows ?? []].map((row) => [...row]),
    headerLayers: [...data.headerLayers ?? []].map((row) => [...row]),
    summaryRows: [...data.summaryRows ?? []].map((row) => ({ ...row }))
  });
  const buildRegistryForDataset = (dataset, profilesOverride, semanticSnapshotOverride) => buildEffectiveColumnRegistryFromState(get(), {
    datasetOverride: dataset,
    columnProfilesOverride: profilesOverride,
    semanticSnapshotOverride
  });
  const persistCurrentSessionSnapshot = async (reason) => {
    const state2 = get();
    if (!state2.sessionId || !state2.csvData || state2.csvData.data.length === 0) {
      return;
    }
    try {
      const [
        { buildPersistedReportRecord: buildPersistedReportRecord2 },
        { CURRENT_SESSION_KEY: CURRENT_SESSION_KEY2, saveReport: saveReport2 }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c7), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c0), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      const currentReport = buildPersistedReportRecord2(state2, {
        id: state2.sessionId,
        filename: state2.csvData.fileName || "Current Session"
      });
      await saveReport2(currentReport);
      await saveReport2({
        ...currentReport,
        id: CURRENT_SESSION_KEY2
      });
    } catch (error) {
      console.warn(`[DataSlice] Failed to persist the current session snapshot after ${reason}.`, error);
    }
  };
  const proposeGoalsAfterAnalysisSummaries = async (analysisDataset, analysisOutcome) => {
    if (analysisOutcome == null ? void 0 : analysisOutcome.summaryPromise) {
      await analysisOutcome.summaryPromise;
    }
    await get().proposeAnalysisGoals(analysisDataset);
  };
  const getDuckDbRefreshHelpers = async () => {
    duckDbRefreshHelpersPromise ?? (duckDbRefreshHelpersPromise = Promise.all([
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cd), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
    ]).then(([
      { getPreferredAnalysisDataset },
      { resolveDatasetBindingTarget, isDuckDbSessionCurrentForDataset }
    ]) => ({
      getPreferredAnalysisDataset,
      resolveDatasetBindingTarget,
      isDuckDbSessionCurrentForDataset
    })));
    return duckDbRefreshHelpersPromise;
  };
  const refreshDuckDbSession = async (datasetOverride) => {
    const t0 = performance.now();
    const {
      getPreferredAnalysisDataset,
      resolveDatasetBindingTarget,
      isDuckDbSessionCurrentForDataset
    } = await getDuckDbRefreshHelpers();
    console.log(`[Perf:RefreshDuckDb] dynamic imports: ${Math.round(performance.now() - t0)}ms`);
    const t1 = performance.now();
    const preferredDataset = datasetOverride ?? getPreferredAnalysisDataset(get());
    const currentSnapshot = get().datasetSemanticSnapshot;
    const currentSemanticDatasetVersion = get().semanticDatasetVersion;
    const bindingTarget = resolveDatasetBindingTarget({
      mode: "workspace",
      csvData: preferredDataset,
      snapshot: currentSnapshot,
      semanticDatasetVersion: currentSemanticDatasetVersion
    });
    console.log(`[Perf:RefreshDuckDb] resolveBindingTarget: ${Math.round(performance.now() - t1)}ms`);
    if (!bindingTarget) {
      const idleStatus = createIdleDuckDbSessionStatus();
      set({ duckDbSessionStatus: idleStatus });
      return idleStatus;
    }
    const currentStatus = get().duckDbSessionStatus;
    if (currentStatus.status === "ready" && isDuckDbSessionCurrentForDataset(currentStatus, bindingTarget.dataset)) {
      return currentStatus;
    }
    if (inFlightDuckDbSessionRefresh && inFlightDuckDbSessionDatasetVersion === bindingTarget.datasetVersion) {
      console.log(`[Perf:RefreshDuckDb] reusing in-flight refresh for ${bindingTarget.datasetVersion}`);
      return inFlightDuckDbSessionRefresh;
    }
    const refreshPromise = (async () => {
      const reportDiagnostics = createWorkerDiagnosticsTelemetryReporter(storeApi);
      const bindingStatus = createBindingDuckDbSessionStatus(get().duckDbSessionStatus);
      if (!isDuckDbSessionStatusEqual(get().duckDbSessionStatus, bindingStatus)) {
        set({ duckDbSessionStatus: bindingStatus });
      }
      const t2 = performance.now();
      const registry = buildRegistryForDataset(bindingTarget.dataset);
      console.log(`[Perf:RefreshDuckDb] buildRegistryForDataset: ${Math.round(performance.now() - t2)}ms (${bindingTarget.dataset.data.length} rows)`);
      const t3 = performance.now();
      const binding = await primeDuckDbDataset(
        bindingTarget.dataset,
        void 0,
        reportDiagnostics,
        void 0,
        registry
      );
      console.log(`[Perf:RefreshDuckDb] primeDuckDbDataset (await): ${Math.round(performance.now() - t3)}ms`);
      const t4 = performance.now();
      const nextStatus = binding ? createDuckDbSessionStatusFromBinding(binding) : createIdleDuckDbSessionStatus();
      if (!isDuckDbSessionStatusEqual(get().duckDbSessionStatus, nextStatus)) {
        set({ duckDbSessionStatus: nextStatus });
      }
      console.log(`[Perf:RefreshDuckDb] set(duckDbSessionStatus): ${Math.round(performance.now() - t4)}ms`);
      console.log(`[Perf:RefreshDuckDb] total: ${Math.round(performance.now() - t0)}ms`);
      if ((binding == null ? void 0 : binding.engine) === "duckdb") {
        get().logAgentToolUsage({
          tool: "duckdb_query_engine",
          description: "DuckDB analyst workspace session is ready.",
          detail: {
            tableName: binding.tableName,
            loadVersion: binding.loadVersion,
            semanticDatasetApplied: bindingTarget.semanticDatasetApplied
          }
        });
      } else if ((binding == null ? void 0 : binding.fallbackStage) === "bind_failed" || (binding == null ? void 0 : binding.fallbackStage) === "query_failed") {
        get().logAgentToolUsage({
          tool: "duckdb_query_engine",
          description: "DuckDB analyst workspace session is degraded.",
          detail: {
            tableName: binding.tableName,
            loadVersion: binding.loadVersion,
            fallbackStage: binding.fallbackStage,
            error: binding.fallbackReason,
            semanticDatasetApplied: bindingTarget.semanticDatasetApplied
          }
        });
      }
      return nextStatus;
    })();
    inFlightDuckDbSessionRefresh = refreshPromise;
    inFlightDuckDbSessionDatasetVersion = bindingTarget.datasetVersion;
    try {
      return await refreshPromise;
    } finally {
      if (inFlightDuckDbSessionRefresh === refreshPromise) {
        inFlightDuckDbSessionRefresh = null;
        inFlightDuckDbSessionDatasetVersion = null;
      }
    }
  };
  const rebuildStructureArtifacts = async (humanBoundary) => {
    var _a;
    const [
      { resolveReportStructureArtifactsWithProposal },
      { getPreferredAnalysisDataset },
      { buildSemanticDatasetVersion }
    ] = await Promise.all([
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cj), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c1), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
    ]);
    const state2 = get();
    const artifacts = await resolveReportStructureArtifactsWithProposal({
      rawCsvData: state2.rawCsvData,
      csvData: state2.csvData,
      rawIntakeIr: state2.rawIntakeIr,
      cleaningRun: state2.cleaningRun,
      dataPreparationPlan: state2.dataPreparationPlan,
      columnProfiles: state2.columnProfiles,
      humanBoundary: humanBoundary ?? (((_a = state2.reportStructureResolution) == null ? void 0 : _a.source) === "human_confirmed" ? state2.reportStructureResolution.humanBoundary : null),
      settings: state2.settings,
      telemetryTarget: {
        sessionId: state2.sessionId,
        currentDatasetId: state2.currentDatasetId
      }
    });
    const prevPreferred = getPreferredAnalysisDataset(get());
    const nextPreferred = artifacts.canonicalCsvData ?? get().csvData;
    const prevVersion = prevPreferred ? buildSemanticDatasetVersion(prevPreferred) : null;
    const nextVersion = nextPreferred ? buildSemanticDatasetVersion(nextPreferred) : null;
    const datasetVersionChanged = prevVersion !== nextVersion;
    set((prev) => ({
      reportStructureResolution: artifacts.reportStructureResolution,
      canonicalCsvData: artifacts.canonicalCsvData,
      canonicalBuildMeta: artifacts.canonicalBuildMeta,
      canonicalizationStatus: artifacts.canonicalizationStatus,
      pipelineOutcome: artifacts.pipelineOutcome,
      ...datasetVersionChanged ? {
        datasetSemanticSnapshot: null,
        semanticStatus: "idle",
        semanticDatasetVersion: null,
        columnRegistry: buildRegistryForDataset(nextPreferred, get().columnProfiles, null)
      } : {},
      activeDataQuery: null,
      duckDbSessionStatus: createBindingDuckDbSessionStatus(prev.duckDbSessionStatus)
    }));
  };
  const runFilePipeline = async (file) => {
    const restoreBundle = resolvePendingDatasetBundleRestore(get());
    reactDomExports.flushSync(() => set({
      isBusy: true,
      csvData: { fileName: file.name, data: [] },
      currentView: "file_upload"
    }));
    const { orchestrateFileUpload } = await __vitePreload(async () => {
      const { orchestrateFileUpload: orchestrateFileUpload2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cl);
      return { orchestrateFileUpload: orchestrateFileUpload2 };
    }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
    try {
      for await (const update of orchestrateFileUpload(file, storeApi, { restoreBundle })) {
        switch (update.type) {
          case "progress":
            get().addProgress(update.message, update.messageType, update.model);
            break;
          case "state":
            if (update.payload.currentView === "analysis_dashboard" && update.payload.csvData) {
              reactDomExports.flushSync(() => set(update.payload));
            } else {
              set(update.payload);
            }
            break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[FileProcessor] File processing failed:`, error);
      get().addProgress(`File Processing Error: ${errorMessage}`, "error");
      set({
        isBusy: false,
        chatLifecycleState: "idle",
        currentView: "file_upload",
        ...restoreBundle ? { datasetBundle: restoreBundle } : {}
      });
    }
  };
  return {
    addProgress: (message, type = "system", model) => {
      const newMessage = createProgressMessage({ text: message, type, timestamp: /* @__PURE__ */ new Date(), model });
      set((state2) => ({ progressMessages: trimProgressMessages([...state2.progressMessages, newMessage]) }));
    },
    handleInitialAnalysis: async (dataForAnalysis, goal, options) => {
      const { handleInitialAnalysis } = await __vitePreload(async () => {
        const { handleInitialAnalysis: handleInitialAnalysis2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cq);
        return { handleInitialAnalysis: handleInitialAnalysis2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      return handleInitialAnalysis(dataForAnalysis, goal, storeApi, options);
    },
    proposeAnalysisGoals: async (dataForAnalysis) => {
      const { proposeAnalysisGoals: proposeGoals } = await __vitePreload(async () => {
        const { proposeAnalysisGoals: proposeGoals2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cr);
        return { proposeAnalysisGoals: proposeGoals2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      return proposeGoals(dataForAnalysis, storeApi);
    },
    handleFileUpload: runFilePipeline,
    ingestExternalCsvPayload: async (event) => {
      if (!event || !event.payload || typeof event.payload.csv !== "string") {
        get().addProgress("Received malformed CSV payload from legacy report page.", "error");
        return;
      }
      if (event.payloadId === inFlightExternalPayloadId || recentlyProcessedExternalPayloads.has(event.payloadId)) {
        console.debug("[ExternalCsvBridge] Skipped duplicate payload at store ingestion.", {
          payloadId: event.payloadId,
          transport: event.meta.transport
        });
        return;
      }
      const csvText = event.payload.csv;
      if (!csvText.trim()) {
        get().addProgress("External CSV payload was empty.", "error");
        return;
      }
      const fileName = buildSyntheticFileName(event);
      get().addProgress(`Loading dataset shared via ${describeTransport(event.meta.transport)} bridge...`);
      const file = new File([csvText], fileName, { type: "text/csv;charset=utf-8" });
      inFlightExternalPayloadId = event.payloadId;
      try {
        await runFilePipeline(file);
        markExternalPayloadProcessed(event.payloadId);
      } finally {
        if (inFlightExternalPayloadId === event.payloadId) {
          inFlightExternalPayloadId = null;
        }
      }
    },
    regenerateAnalyses: async (newData) => {
      const { regenerateAnalysesWithNewData } = await __vitePreload(async () => {
        const { regenerateAnalysesWithNewData: regenerateAnalysesWithNewData2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cs);
        return { regenerateAnalysesWithNewData: regenerateAnalysesWithNewData2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      await regenerateAnalysesWithNewData(newData, storeApi);
    },
    reproposeAnalysisGoals: async () => {
      const { reproposeAnalysisGoals: reproposeGoalsService } = await __vitePreload(async () => {
        const { reproposeAnalysisGoals: reproposeGoalsService2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cs);
        return { reproposeAnalysisGoals: reproposeGoalsService2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      reproposeGoalsService(storeApi);
    },
    ensureDatasetSemanticSnapshot: async (dataset, options) => {
      const [
        { getPreferredAnalysisDataset },
        { buildSemanticDatasetVersion, isCurrentSemanticFallback, isSemanticSnapshotCurrent, getSemanticHiddenRowCount },
        { resolveAnalysisDatasetProfiles },
        { annotateDatasetSemantics }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c1), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cn), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ct), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      const targetDataset = dataset ?? getPreferredAnalysisDataset(get());
      if (!targetDataset) {
        inFlightSemanticSnapshot = null;
        inFlightSemanticDatasetVersion = null;
        set({ datasetSemanticSnapshot: null, semanticStatus: "idle", semanticDatasetVersion: null, columnRegistry: null });
        return null;
      }
      const datasetVersion = buildSemanticDatasetVersion(targetDataset);
      const existingSnapshot = get().datasetSemanticSnapshot;
      if (!(options == null ? void 0 : options.force) && isSemanticSnapshotCurrent(existingSnapshot, datasetVersion)) {
        if (get().semanticStatus !== "ready") set({ semanticStatus: "ready" });
        return existingSnapshot ?? null;
      }
      if (!(options == null ? void 0 : options.force) && isCurrentSemanticFallback(
        get().semanticStatus,
        get().semanticDatasetVersion,
        datasetVersion
      )) {
        return null;
      }
      if (!(options == null ? void 0 : options.force) && inFlightSemanticSnapshot && inFlightSemanticDatasetVersion === datasetVersion) {
        return inFlightSemanticSnapshot;
      }
      const effectiveColumns = resolveAnalysisDatasetProfiles(targetDataset, get().columnProfiles);
      if (effectiveColumns !== get().columnProfiles) {
        set({
          columnProfiles: effectiveColumns,
          columnRegistry: buildRegistryForDataset(targetDataset, effectiveColumns, get().datasetSemanticSnapshot)
        });
      }
      set({ semanticStatus: "running", semanticDatasetVersion: datasetVersion });
      const semanticPromise = (async () => {
        const SEMANTIC_ANNOTATION_TIMEOUT_MS = 15e3;
        const semanticStart = performance.now();
        let snapshot;
        try {
          const state2 = get();
          const annotationPromise = annotateDatasetSemantics({
            data: targetDataset,
            rawData: state2.rawCsvData ?? state2.csvData ?? targetDataset,
            columns: effectiveColumns,
            settings: state2.settings,
            reportContextResolution: state2.reportContextResolution,
            reportStructureResolution: state2.reportStructureResolution,
            telemetryTarget: { sessionId: state2.sessionId, currentDatasetId: state2.currentDatasetId }
          });
          const timeoutPromise = new Promise(
            (resolve) => setTimeout(() => resolve(null), SEMANTIC_ANNOTATION_TIMEOUT_MS)
          );
          snapshot = await Promise.race([annotationPromise, timeoutPromise]);
        } catch (error) {
          console.warn(`[Perf:Semantic] Annotation failed after ${Math.round(performance.now() - semanticStart)}ms`, error);
          set((s) => s.semanticDatasetVersion === datasetVersion ? {
            datasetSemanticSnapshot: null,
            semanticStatus: "fallback",
            semanticDatasetVersion: datasetVersion,
            columnRegistry: buildRegistryForDataset(targetDataset, effectiveColumns, null)
          } : {});
          return null;
        }
        if (!snapshot) {
          console.warn(`[Perf:Semantic] Annotation timed out after ${Math.round(performance.now() - semanticStart)}ms`);
          set((s) => s.semanticDatasetVersion === datasetVersion ? {
            datasetSemanticSnapshot: null,
            semanticStatus: "fallback",
            semanticDatasetVersion: datasetVersion,
            columnRegistry: buildRegistryForDataset(targetDataset, effectiveColumns, null)
          } : {});
          return null;
        }
        console.log(`[Perf:Semantic] Annotation completed: ${Math.round(performance.now() - semanticStart)}ms, ${targetDataset.data.length} rows`);
        const tSemanticSet = performance.now();
        const semanticRegistry = buildRegistryForDataset(targetDataset, effectiveColumns, snapshot);
        console.log(`[Perf:Semantic] buildRegistryForDataset (post-annotation): ${Math.round(performance.now() - tSemanticSet)}ms`);
        const tSemanticStateUpdate = performance.now();
        set((s) => s.semanticDatasetVersion === datasetVersion ? {
          datasetSemanticSnapshot: snapshot,
          semanticStatus: "ready",
          semanticDatasetVersion: datasetVersion,
          columnRegistry: semanticRegistry
        } : {});
        console.log(`[Perf:Semantic] set(snapshot+registry): ${Math.round(performance.now() - tSemanticStateUpdate)}ms`);
        const hiddenRowCount = getSemanticHiddenRowCount(snapshot, datasetVersion, targetDataset);
        if (hiddenRowCount > 0 && get().semanticDatasetVersion === datasetVersion) {
          get().addProgress(`AI semantic view prepared. ${hiddenRowCount} non-detail row(s) will be hidden by default.`, "system", snapshot.modelId);
        }
        return snapshot;
      })();
      inFlightSemanticSnapshot = semanticPromise;
      inFlightSemanticDatasetVersion = datasetVersion;
      try {
        return await semanticPromise;
      } finally {
        if (inFlightSemanticSnapshot === semanticPromise) {
          inFlightSemanticSnapshot = null;
          inFlightSemanticDatasetVersion = null;
        }
      }
    },
    refreshDuckDbSession,
    promoteToCanonicalDataset: ({ reason, reshapeProvenance }) => {
      var _a;
      const currentData = get().csvData;
      if (!currentData) return;
      const columns = ((_a = buildRegistryForDataset(currentData)) == null ? void 0 : _a.columns.map((entry) => entry.physicalName)) ?? [];
      set({
        canonicalCsvData: currentData,
        canonicalBuildMeta: {
          shape: "long_fact_table",
          source: "analysis_reshape",
          rowCount: currentData.data.length,
          columnCount: columns.length,
          lineageColumns: columns,
          summary: reason,
          excludedRowCounts: {},
          carryForwardAppliedCounts: {},
          footerTotalsMatched: null,
          reshapeProvenance
        },
        canonicalizationStatus: "ready",
        // DATA-603: reset semantic snapshot so it rebuilds against the long table
        datasetSemanticSnapshot: null,
        semanticStatus: "idle",
        semanticDatasetVersion: null,
        columnRegistry: buildRegistryForDataset(currentData, get().columnProfiles, null)
      });
    },
    runWorkspaceDataQuery: async (payload) => {
      const [
        { getPreferredAnalysisDataset },
        { resolveDatasetBindingTarget, isDuckDbSessionCurrentForDataset },
        { compileWorkspaceDataQuery },
        { executeStructuredDataQuery }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cd), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cu), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cc), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      const resolveCurrentWorkspaceTarget = () => {
        const currentState = get();
        const preferredDataset = getPreferredAnalysisDataset(currentState);
        return {
          state: currentState,
          bindingTarget: resolveDatasetBindingTarget({
            mode: "workspace",
            csvData: preferredDataset,
            snapshot: currentState.datasetSemanticSnapshot,
            semanticDatasetVersion: currentState.semanticDatasetVersion
          })
        };
      };
      let { state: state2, bindingTarget } = resolveCurrentWorkspaceTarget();
      if (!bindingTarget) throw new Error("Load a dataset before running an analyst workspace query.");
      let sessionStatus = state2.duckDbSessionStatus;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (sessionStatus.status === "ready" && isDuckDbSessionCurrentForDataset(sessionStatus, bindingTarget.dataset)) {
          break;
        }
        sessionStatus = await refreshDuckDbSession(bindingTarget.dataset);
        const latest = resolveCurrentWorkspaceTarget();
        if (!latest.bindingTarget) {
          throw new Error("Load a dataset before running an analyst workspace query.");
        }
        state2 = latest.state;
        if (latest.bindingTarget.datasetVersion !== bindingTarget.datasetVersion) {
          bindingTarget = latest.bindingTarget;
          sessionStatus = get().duckDbSessionStatus;
          continue;
        }
        break;
      }
      if (sessionStatus.status !== "ready" || !isDuckDbSessionCurrentForDataset(sessionStatus, bindingTarget.dataset)) {
        throw new Error("DuckDB session is not ready. Rebind the session and retry.");
      }
      const columnRegistry = buildRegistryForDataset(bindingTarget.dataset);
      const compiled = compileWorkspaceDataQuery(
        payload,
        {
          selectableColumns: getAllowedColumns(columnRegistry, "select").length > 0 ? getAllowedColumns(columnRegistry, "select") : state2.columnProfiles.map((p) => p.name),
          groupableColumns: getAllowedColumns(columnRegistry, "groupBy")
        }
      );
      let committedTrace = null;
      const query = await executeStructuredDataQuery(storeApi, {
        datasetOverride: bindingTarget.dataset,
        explanation: compiled.explanation,
        plan: compiled.plan,
        phase: "analysis",
        origin: "workspace",
        columnRegistryOverride: columnRegistry,
        templateId: compiled.templateId,
        formSnapshot: compiled.formSnapshot,
        policyReason: "Database analyst workspace",
        toolCategory: "data",
        appendChatTrace: false,
        appendCleaningRunTrace: false,
        scrollToRawDataExplorer: false,
        allowNativeFallback: false,
        progressMessage: `Running analyst workspace query: ${compiled.explanation}`,
        onTraceCommitted: (trace) => {
          committedTrace = trace;
        }
      });
      const committedState = get();
      const committedTraceId = committedTrace == null ? void 0 : committedTrace.id;
      const activeQueryCommitted = committedState.activeDataQuery === query;
      const historyCommitted = Boolean(
        committedTraceId && committedState.queryHistory.some((entry) => entry.id === committedTraceId)
      );
      if (!activeQueryCommitted || !historyCommitted || !committedTraceId) {
        committedState.logAgentToolUsage({
          tool: "data.query",
          description: "Workspace query result was not committed.",
          detail: {
            errorCode: "query_result_not_committed",
            activeQueryCommitted,
            historyCommitted,
            templateId: payload.templateId,
            loadVersion: query.loadVersion
          }
        });
        throw new Error("query_result_not_committed: The query finished, but its result was not committed. Retry the query.");
      }
      return {
        query,
        traceId: committedTraceId,
        committedAt: new Date(committedTrace.appliedAt)
      };
    },
    resumeCleaningRun: async () => {
      var _a, _b, _c, _d, _e, _f;
      const [
        { updateAgentTaskStatus },
        { orchestrateAutonomousAiCleaning },
        { getPreferredAnalysisDataset },
        { DEFAULT_AUTO_ANALYSIS_GOAL }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c9), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.co), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ck), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      updateAgentTaskStatus(storeApi, {
        status: "thinking",
        title: "Resuming cleaning",
        titleKey: "ai_task_cleaning_title",
        subtitle: "Continuing cleaning run...",
        totalSteps: 4,
        currentStep: 1
      });
      try {
        await orchestrateAutonomousAiCleaning(storeApi, { resume: true });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Cleaning failed unexpectedly.";
        updateAgentTaskStatus(storeApi, {
          status: "error",
          title: "Cleaning failed",
          titleKey: "ai_task_cleaning_failed",
          subtitle: errorMessage,
          totalSteps: 4,
          currentStep: 1,
          error: errorMessage
        });
        return;
      }
      if (((_a = get().cleaningRun) == null ? void 0 : _a.status) !== "completed") {
        const errorMessage = ((_b = get().cleaningRun) == null ? void 0 : _b.userFacingMessage) ?? ((_c = get().cleaningRun) == null ? void 0 : _c.lastError) ?? "Cleaning did not complete.";
        const technicalDetail = ((_d = get().cleaningRun) == null ? void 0 : _d.technicalDetail) ?? ((_e = get().cleaningRun) == null ? void 0 : _e.lastError) ?? errorMessage;
        updateAgentTaskStatus(storeApi, {
          status: "error",
          title: "Cleaning failed",
          titleKey: "ai_task_cleaning_failed",
          subtitle: errorMessage,
          totalSteps: 4,
          currentStep: 1,
          error: technicalDetail
        });
      }
      if (((_f = get().cleaningRun) == null ? void 0 : _f.status) === "completed" && get().csvData) {
        const transitionStart = performance.now();
        await rebuildStructureArtifacts();
        const analysisDataset = getPreferredAnalysisDataset(get());
        duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {
        });
        await get().ensureDatasetSemanticSnapshot(analysisDataset);
        await refreshDuckDbSession();
        console.log(`[Perf:PostClean] resume cleaning→analysis-ready: ${Math.round(performance.now() - transitionStart)}ms`);
        if (analysisDataset) {
          const pipelineOutcome = get().pipelineOutcome;
          if ((pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "ready" || (pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "degraded_but_usable") {
            const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
            const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: "automatic" });
            if (analysisOutcome.status !== "paused" && analysisOutcome.status !== "error") {
              await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome);
            }
          } else {
            await proposeGoalsAfterAnalysisSummaries(analysisDataset);
          }
        }
      }
    },
    revertToOriginal: async () => {
      const [
        { createCleaningRun },
        { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV, buildWorkspaceCsv }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cb), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.b$), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      const sessionId = get().sessionId;
      let originalData = sessionId ? await getOriginalData(sessionId) : null;
      if (!originalData) originalData = get().rawCsvData;
      if (!originalData) {
        get().addProgress(getTranslation("data_restore_unavailable", get().settings.language), "error");
        return;
      }
      const restoredData = cloneCsvData(originalData);
      const profileResult = await profileDataWithWorker(restoredData.data);
      const restoredRegistry = buildRegistryForDataset(restoredData, profileResult.profiles, null);
      set((prev) => ({
        csvData: restoredData,
        canonicalCsvData: null,
        canonicalBuildMeta: null,
        canonicalizationStatus: "idle",
        pipelineOutcome: null,
        reportStructureResolution: null,
        columnProfiles: profileResult.profiles,
        columnRegistry: restoredRegistry,
        datasetSemanticSnapshot: null,
        semanticStatus: "idle",
        semanticDatasetVersion: null,
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        queryHistory: [],
        analysisCards: [],
        activeAnalysisSession: null,
        latestAnalysisSession: null,
        visibleAnalysisTrace: [],
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        duckDbSessionStatus: createBindingDuckDbSessionStatus(get().duckDbSessionStatus),
        reportGenerationProgress: null,
        isGeneratingReport: false,
        workspaceFiles: {
          ...prev.workspaceFiles ?? {},
          [WORKSPACE_DATASET_RAW_CSV]: buildWorkspaceCsv(restoredData),
          [WORKSPACE_DATASET_CLEAN_CSV]: buildWorkspaceCsv(restoredData)
        },
        dataPreparationPlan: {
          explanation: getTranslation("data_restore_explanation", get().settings.language),
          operations: [],
          outputColumns: profileResult.profiles,
          planStatus: "schema_only",
          consistencyIssues: []
        },
        cleaningRun: createCleaningRun()
      }));
      get().addProgress(getTranslation("data_restore_success", get().settings.language));
      await refreshDuckDbSession();
    },
    restartCleaningRun: async () => {
      var _a, _b, _c, _d, _e, _f;
      const [
        { createCleaningRun },
        { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV, buildWorkspaceCsv },
        { updateAgentTaskStatus },
        { orchestrateAutonomousAiCleaning },
        { getPreferredAnalysisDataset },
        { DEFAULT_AUTO_ANALYSIS_GOAL }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cb), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.b$), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c9), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.co), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ck), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      const rawCsvData = get().rawCsvData;
      if (!rawCsvData) {
        get().addProgress("Cannot restart cleaning because the original dataset is unavailable.", "error");
        return;
      }
      const currentState = get();
      const preferredDataset = getPreferredAnalysisDataset(currentState) ?? rawCsvData;
      const preferredWasCanonical = Boolean(currentState.canonicalCsvData && preferredDataset === currentState.canonicalCsvData);
      const resetCsvData = cloneCsvData(preferredDataset);
      const profileResult = await profileDataWithWorker(resetCsvData.data);
      const resetRegistry = buildRegistryForDataset(resetCsvData, profileResult.profiles, null);
      set((prev) => ({
        csvData: resetCsvData,
        canonicalCsvData: preferredWasCanonical ? resetCsvData : null,
        canonicalBuildMeta: preferredWasCanonical ? prev.canonicalBuildMeta : null,
        canonicalizationStatus: preferredWasCanonical ? prev.canonicalizationStatus : "idle",
        pipelineOutcome: null,
        reportStructureResolution: prev.reportStructureResolution,
        columnProfiles: profileResult.profiles,
        columnRegistry: resetRegistry,
        datasetSemanticSnapshot: null,
        semanticStatus: "idle",
        semanticDatasetVersion: null,
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        queryHistory: [],
        analysisCards: [],
        activeAnalysisSession: null,
        latestAnalysisSession: null,
        visibleAnalysisTrace: [],
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        duckDbSessionStatus: createBindingDuckDbSessionStatus(get().duckDbSessionStatus),
        reportGenerationProgress: null,
        isGeneratingReport: false,
        workspaceFiles: {
          ...prev.workspaceFiles ?? {},
          [WORKSPACE_DATASET_RAW_CSV]: buildWorkspaceCsv(rawCsvData),
          [WORKSPACE_DATASET_CLEAN_CSV]: buildWorkspaceCsv(resetCsvData)
        },
        dataPreparationPlan: {
          explanation: "AI-first cleaning session restarted. cleaned.csv has been reset to a fresh writable copy of the current prepared dataset snapshot.",
          operations: [],
          outputColumns: profileResult.profiles,
          planStatus: "schema_only",
          consistencyIssues: []
        },
        cleaningRun: createCleaningRun()
      }));
      get().addProgress("Cleaning workflow reset to the current prepared dataset snapshot.");
      await persistCurrentSessionSnapshot("restart cleaning");
      await refreshDuckDbSession();
      updateAgentTaskStatus(storeApi, {
        status: "thinking",
        title: "Restarting cleaning",
        titleKey: "ai_task_cleaning_title",
        subtitle: "Restarting cleaning run from the current prepared dataset...",
        totalSteps: 4,
        currentStep: 1
      });
      try {
        await orchestrateAutonomousAiCleaning(storeApi);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Cleaning failed unexpectedly.";
        updateAgentTaskStatus(storeApi, {
          status: "error",
          title: "Cleaning failed",
          titleKey: "ai_task_cleaning_failed",
          subtitle: errorMessage,
          totalSteps: 4,
          currentStep: 1,
          error: errorMessage
        });
        return;
      }
      if (((_a = get().cleaningRun) == null ? void 0 : _a.status) !== "completed") {
        const errorMessage = ((_b = get().cleaningRun) == null ? void 0 : _b.userFacingMessage) ?? ((_c = get().cleaningRun) == null ? void 0 : _c.lastError) ?? "Cleaning did not complete.";
        const technicalDetail = ((_d = get().cleaningRun) == null ? void 0 : _d.technicalDetail) ?? ((_e = get().cleaningRun) == null ? void 0 : _e.lastError) ?? errorMessage;
        updateAgentTaskStatus(storeApi, {
          status: "error",
          title: "Cleaning failed",
          titleKey: "ai_task_cleaning_failed",
          subtitle: errorMessage,
          totalSteps: 4,
          currentStep: 1,
          error: technicalDetail
        });
      }
      if (((_f = get().cleaningRun) == null ? void 0 : _f.status) === "completed" && get().csvData) {
        const transitionStart = performance.now();
        await rebuildStructureArtifacts();
        const analysisDataset = getPreferredAnalysisDataset(get());
        duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {
        });
        await get().ensureDatasetSemanticSnapshot(analysisDataset);
        await refreshDuckDbSession();
        console.log(`[Perf:PostClean] restart cleaning→analysis-ready: ${Math.round(performance.now() - transitionStart)}ms`);
        if (analysisDataset) {
          const pipelineOutcome = get().pipelineOutcome;
          if ((pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "ready" || (pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "degraded_but_usable") {
            const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
            const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: "automatic" });
            if (analysisOutcome.status !== "paused" && analysisOutcome.status !== "error") {
              await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome);
            }
          } else {
            await proposeGoalsAfterAnalysisSummaries(analysisDataset);
          }
        }
      }
    },
    saveReportStructureBoundaryOverride: async (boundary) => {
      const [
        { getPreferredAnalysisDataset },
        { resolveAnalysisDatasetProfiles },
        { DEFAULT_AUTO_ANALYSIS_GOAL }
      ] = await Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c6), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cn), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ck), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]);
      await rebuildStructureArtifacts(boundary);
      get().setIsReportBoundaryConfirmModalOpen(false);
      const pipelineOutcome = get().pipelineOutcome;
      const structureAccepted = (pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "ready" || (pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "degraded_but_usable";
      get().recordAgentEvent({
        phase: "file",
        step: "structure_confirmation_applied",
        status: structureAccepted ? "done" : "error",
        message: structureAccepted ? "The confirmed report boundary was applied to the prepared dataset." : "The boundary confirmation was saved, but remaining verification issues still limit automatic analysis.",
        activity: {
          kind: "approval",
          lifecycle: structureAccepted ? "completed" : "degraded",
          source: "approval",
          eventType: "structure_confirmation_applied",
          title: structureAccepted ? "Structure confirmed" : "Structure confirmation degraded",
          explanation: pipelineOutcome == null ? void 0 : pipelineOutcome.message
        }
      });
      if ((pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "ready" || (pipelineOutcome == null ? void 0 : pipelineOutcome.status) === "degraded_but_usable") {
        const analysisDataset = getPreferredAnalysisDataset(get());
        if (analysisDataset) {
          const resolvedProfiles = resolveAnalysisDatasetProfiles(analysisDataset, get().columnProfiles);
          set({
            columnProfiles: resolvedProfiles,
            columnRegistry: buildRegistryForDataset(analysisDataset, resolvedProfiles, get().datasetSemanticSnapshot)
          });
          duckDbWorkerClient.initDuckDb(DUCKDB_INIT_TIMEOUT_MS).catch(() => {
          });
          await get().ensureDatasetSemanticSnapshot(analysisDataset, { force: true });
          await refreshDuckDbSession();
          const goal = get().confirmedAnalysisGoal ?? DEFAULT_AUTO_ANALYSIS_GOAL;
          const analysisOutcome = await get().handleInitialAnalysis(analysisDataset, goal, { trigger: "manual" });
          if (analysisOutcome.status !== "paused" && analysisOutcome.status !== "error") {
            await proposeGoalsAfterAnalysisSummaries(analysisDataset, analysisOutcome);
          }
        }
        get().addProgress("Report structure was confirmed and canonical data is ready for analysis.");
      } else {
        get().addProgress((pipelineOutcome == null ? void 0 : pipelineOutcome.message) ?? "Report structure review was saved.", (pipelineOutcome == null ? void 0 : pipelineOutcome.severity) === "blocked" ? "warning" : "system");
      }
    },
    setColumnAnnotation: (annotation) => {
      set((prev) => {
        var _a;
        return {
          userColumnAnnotations: {
            ...prev.userColumnAnnotations,
            [annotation.columnName]: annotation
          },
          columnRegistry: buildColumnRegistry({
            data: prev.canonicalCsvData ?? prev.csvData,
            columnProfiles: prev.columnProfiles,
            semanticSnapshot: prev.datasetSemanticSnapshot,
            userColumnAnnotations: {
              ...prev.userColumnAnnotations,
              [annotation.columnName]: annotation
            },
            steering: (_a = prev.latestAnalysisSession) == null ? void 0 : _a.analysisSteering,
            existingRegistry: prev.columnRegistry
          })
        };
      });
      void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(
        (m) => m.upsertColumnAnnotationDoc(storeApi, annotation)
      );
    },
    removeColumnAnnotation: (columnName) => {
      set((prev) => {
        var _a;
        const next = { ...prev.userColumnAnnotations };
        delete next[columnName];
        return {
          userColumnAnnotations: next,
          columnRegistry: buildColumnRegistry({
            data: prev.canonicalCsvData ?? prev.csvData,
            columnProfiles: prev.columnProfiles,
            semanticSnapshot: prev.datasetSemanticSnapshot,
            userColumnAnnotations: next,
            steering: (_a = prev.latestAnalysisSession) == null ? void 0 : _a.analysisSteering,
            existingRegistry: prev.columnRegistry
          })
        };
      });
      void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(
        (m) => m.removeColumnAnnotationDoc(storeApi, columnName)
      );
    }
  };
};
let _resolveEffectivePendingClarification = null;
let _isProviderConfigured = null;
const LOG_PREFIX = "[ChatSlice]";
const chatDebug$1 = (message, detail) => {
  return;
};
const createChatSlice = (set, get) => {
  const storeApi = { getState: get, setState: set };
  let isDrainingQueuedTurns = false;
  const storeResolvedClarification = (clarification, value) => {
    if (!value.trim()) return;
    const key = clarification.targetProperty ?? clarification.question.slice(0, 60);
    const resolvedAtTurn = get().chatHistory.length;
    const entry = { key, question: clarification.question, value, resolvedAtTurn };
    set((prev) => ({
      resolvedClarifications: [
        ...(prev.resolvedClarifications ?? []).filter((c) => c.key !== key),
        entry
      ]
    }));
    void __vitePreload(async () => {
      const { upsertAcceptedDecisionDoc } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch);
      return { upsertAcceptedDecisionDoc };
    }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(({ upsertAcceptedDecisionDoc }) => upsertAcceptedDecisionDoc(storeApi, entry)).catch((error) => {
      console.warn(`${LOG_PREFIX} Failed to retain accepted decision (non-blocking):`, error);
    });
  };
  let isRefreshingContext = false;
  const refreshContextualSummaryIfNeeded = async () => {
    var _a, _b;
    if (isRefreshingContext) return;
    isRefreshingContext = true;
    try {
      const { shouldRefreshContextualSummary, generateContextualSummary, markContextualSummaryRefreshed } = await __vitePreload(async () => {
        const { shouldRefreshContextualSummary: shouldRefreshContextualSummary2, generateContextualSummary: generateContextualSummary2, markContextualSummaryRefreshed: markContextualSummaryRefreshed2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ca);
        return { shouldRefreshContextualSummary: shouldRefreshContextualSummary2, generateContextualSummary: generateContextualSummary2, markContextualSummaryRefreshed: markContextualSummaryRefreshed2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      const state2 = get();
      if (!shouldRefreshContextualSummary(state2.sessionId, state2.chatHistory.length)) {
        return;
      }
      const nextSummary = await generateContextualSummary({
        settings: state2.settings,
        confirmedGoal: state2.confirmedAnalysisGoal,
        aiCoreAnalysisSummary: ((_a = state2.aiCoreAnalysisSummary) == null ? void 0 : _a.text) ?? null,
        contextualSummary: state2.contextualSummary,
        datasetKnowledge: (_b = state2.agentMemoryRun) == null ? void 0 : _b.findings.datasetKnowledge,
        chatHistory: state2.chatHistory,
        analysisCards: state2.analysisCards,
        telemetryTarget: state2
      });
      set({ contextualSummary: nextSummary.summary });
      markContextualSummaryRefreshed(state2.sessionId, get().chatHistory.length);
    } finally {
      isRefreshingContext = false;
    }
  };
  const fireContextRefresh = () => {
    refreshContextualSummaryIfNeeded().catch(
      (err) => console.warn(`${LOG_PREFIX} Background context refresh failed (non-blocking):`, err)
    );
  };
  const appendUserMessage = (text) => {
    const { cardIds, displayText } = parseCardMentions(text);
    set((prev) => ({
      chatHistory: [
        ...prev.chatHistory,
        createChatMessage({
          sender: "user",
          text: displayText,
          timestamp: /* @__PURE__ */ new Date(),
          type: "user_message",
          ...cardIds.length > 0 ? { referencedCardIds: cardIds } : {}
        })
      ]
    }));
  };
  const getQueuedChatTurns = () => get().queuedChatTurns ?? [];
  const getEffectivePendingClarification = () => {
    if (!_resolveEffectivePendingClarification) return null;
    return _resolveEffectivePendingClarification(get());
  };
  const hasRunningTurn = () => {
    var _a;
    return ((_a = get().activeTurn) == null ? void 0 : _a.status) === "running";
  };
  const canDrainQueuedTurns = () => {
    const state2 = get();
    return !hasRunningTurn() && !getEffectivePendingClarification() && !state2.pendingMutationConfirmation;
  };
  const enqueueChatTurn = (message) => {
    const queuedTurn = {
      id: createId("queued-chat-turn"),
      message,
      enqueuedAt: /* @__PURE__ */ new Date()
    };
    set((prev) => ({
      queuedChatTurns: [...prev.queuedChatTurns ?? [], queuedTurn]
    }));
  };
  const appendAiMessage = (text, type = "ai_message", extras) => {
    set((prev) => ({
      chatHistory: [
        ...prev.chatHistory,
        createChatMessage({
          sender: "ai",
          text,
          timestamp: /* @__PURE__ */ new Date(),
          type,
          ...extras
        })
      ]
    }));
  };
  const executeControlledSpreadsheetFilter = async (rawQuery, origin) => {
    var _a, _b, _c;
    const query = rawQuery.trim();
    if (!query) return;
    const action = {
      type: "tool_call",
      toolName: "spreadsheet.filter",
      args: { query }
    };
    appendUserMessage(query);
    set({ isBusy: true, chatLifecycleState: "running", pendingClarification: null });
    try {
      const { handleAiAction } = await __vitePreload(async () => {
        const { handleAiAction: handleAiAction2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cf);
        return { handleAiAction: handleAiAction2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      const result = await handleAiAction(action, storeApi, { spreadsheetFilterOrigin: origin });
      if (result.status === "success") {
        const observedReply = ((_b = (_a = result.observation) == null ? void 0 : _a.summary) == null ? void 0 : _b.trim()) || result.message;
        if (observedReply) {
          appendAiMessage(observedReply);
        }
        return;
      }
      appendAiMessage(((_c = result.observation) == null ? void 0 : _c.summary) ?? result.message, "ai_message", { isError: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendAiMessage(
        getTranslation("chat_temporary_filter_failed", get().settings.language, { message: errorMessage }),
        "ai_message",
        { isError: true }
      );
    } finally {
      set({ isBusy: false, chatLifecycleState: "idle" });
    }
  };
  const ensureProviderHealthy = async () => {
    const settings = get().settings;
    if (_isProviderConfigured && !_isProviderConfigured(settings)) {
      const message2 = shouldAllowSettingsSurface() ? "API Key is not set." : getTranslation("api_key_required_managed_message", settings.language);
      if (shouldAllowSettingsSurface()) {
        get().addProgress(message2, "error");
        get().setIsSettingsModalOpen(true);
      } else {
        get().addProgress(message2, "error");
      }
      appendAiMessage(message2, "ai_message", { isError: true });
      return false;
    }
    if (!_isProviderConfigured) return false;
    const { validateProviderHealth } = await __vitePreload(async () => {
      const { validateProviderHealth: validateProviderHealth2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c4);
      return { validateProviderHealth: validateProviderHealth2 };
    }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
    const health = await validateProviderHealth(settings);
    if (health.status === "healthy") return true;
    const errorMessages = {
      not_configured: "API Key is not set.",
      invalid_key: getTranslation("provider_health_invalid_key", settings.language),
      unreachable: getTranslation("provider_health_unreachable", settings.language)
    };
    const message = errorMessages[health.status] ?? "AI provider is unavailable.";
    if (shouldAllowSettingsSurface() && health.status !== "unreachable") {
      get().addProgress(message, "error");
      get().setIsSettingsModalOpen(true);
    } else {
      get().addProgress(message, "error");
    }
    appendAiMessage(message, "ai_message", { isError: true });
    return false;
  };
  const runImmediateChatTurn = async (message, options) => {
    if (options.appendUserMessage) {
      set((prev) => ({
        isBusy: true,
        chatLifecycleState: "running",
        pendingClarification: null,
        chatHistory: [
          ...prev.chatHistory,
          createChatMessage({ sender: "user", text: options.displayText ?? message, timestamp: /* @__PURE__ */ new Date(), type: "user_message" })
        ]
      }));
    } else {
      set({ isBusy: true, chatLifecycleState: "running", pendingClarification: null });
    }
    try {
      const { orchestrateChatResponse } = await __vitePreload(async () => {
        const { orchestrateChatResponse: orchestrateChatResponse2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cv);
        return { orchestrateChatResponse: orchestrateChatResponse2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      await orchestrateChatResponse(message, storeApi);
      fireContextRefresh();
      if (options.drainAfter !== false) {
        await drainQueuedChatTurns();
      }
    } finally {
      const currentLifecycle = get().chatLifecycleState;
      set({
        isBusy: false,
        ...currentLifecycle === "running" ? { chatLifecycleState: "failed" } : {}
      });
    }
  };
  const drainQueuedChatTurns = async () => {
    if (isDrainingQueuedTurns || !canDrainQueuedTurns()) {
      return;
    }
    isDrainingQueuedTurns = true;
    try {
      while (canDrainQueuedTurns()) {
        let nextMessage;
        set((prev) => {
          const queue = prev.queuedChatTurns ?? [];
          if (queue.length === 0) return prev;
          nextMessage = queue[0].message;
          return { queuedChatTurns: queue.slice(1) };
        });
        if (!nextMessage) return;
        await runImmediateChatTurn(nextMessage, {
          appendUserMessage: false,
          drainAfter: false
        });
      }
    } finally {
      isDrainingQueuedTurns = false;
    }
  };
  return {
    isAiFiltering: false,
    streamingMessage: null,
    setStreamingMessage: (text) => {
      set((prev) => ({
        streamingMessage: prev.streamingMessage ? { ...prev.streamingMessage, text } : { text, isStreaming: true, startedAt: /* @__PURE__ */ new Date() }
      }));
    },
    clearStreamingMessage: () => set({ streamingMessage: null }),
    confirmGoal: async (goalTitle) => {
      const { confirmAnalysisGoal } = await __vitePreload(async () => {
        const { confirmAnalysisGoal: confirmAnalysisGoal2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cs);
        return { confirmAnalysisGoal: confirmAnalysisGoal2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      await confirmAnalysisGoal(goalTitle, storeApi);
    },
    handleChatMessage: async (message, options) => {
      var _a, _b, _c, _d;
      const displayText = (options == null ? void 0 : options.displayText) ?? message;
      const source = (options == null ? void 0 : options.source) ?? "composer";
      const hasPendingClar = Boolean(get().pendingClarification) && !hasRunningTurn();
      if ((source === "composer" || source === "action") && !hasPendingClar) {
        appendUserMessage(displayText);
      }
      if (!_resolveEffectivePendingClarification || !_isProviderConfigured) {
        const [clarificationMod, providerMod] = await Promise.all([
          __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ce), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
          __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c4), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
          __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cv), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
        ]);
        _resolveEffectivePendingClarification = clarificationMod.resolveEffectivePendingClarification;
        _isProviderConfigured = providerMod.isProviderConfigured;
      }
      if (get().goalState === "awaiting_user_confirmation") {
        await get().confirmGoal(message);
        return;
      }
      if (!await ensureProviderHealthy()) {
        return;
      }
      const pendingClarification = getEffectivePendingClarification();
      if (pendingClarification && !hasRunningTurn()) {
        chatDebug$1("Composer message intercepted by pending clarification.", {
          clarificationQuestion: pendingClarification.question,
          clarificationMode: pendingClarification.clarificationMode ?? null,
          allowFreeText: pendingClarification.allowFreeText ?? null,
          activeTurnStatus: ((_a = get().activeTurn) == null ? void 0 : _a.status) ?? null,
          pendingClarificationInStore: Boolean(get().pendingClarification)
        });
        const { buildClarificationFollowUpPrompt, handleClarificationResponse: processClarificationResponse } = await __vitePreload(async () => {
          const { buildClarificationFollowUpPrompt: buildClarificationFollowUpPrompt2, handleClarificationResponse: processClarificationResponse2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ce);
          return { buildClarificationFollowUpPrompt: buildClarificationFollowUpPrompt2, handleClarificationResponse: processClarificationResponse2 };
        }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(async (clarMod) => {
          const { handleClarificationResponse: procClarResp } = await __vitePreload(async () => {
            const { handleClarificationResponse: procClarResp2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cv);
            return { handleClarificationResponse: procClarResp2 };
          }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
          return { ...clarMod, handleClarificationResponse: procClarResp };
        });
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
          set((prev) => ({
            chatHistory: [
              ...prev.chatHistory,
              createChatMessage({
                sender: "ai",
                text: buildClarificationFollowUpPrompt(pendingClarification, get().settings.language),
                timestamp: /* @__PURE__ */ new Date(),
                type: "ai_message"
              })
            ]
          }));
          return;
        }
        storeResolvedClarification(pendingClarification, trimmedMessage);
        await processClarificationResponse({
          label: trimmedMessage,
          value: trimmedMessage
        }, storeApi);
        fireContextRefresh();
        await drainQueuedChatTurns();
        return;
      }
      if (hasRunningTurn()) {
        if (source !== "composer") {
          chatDebug$1("Ignored non-composer message while a runtime turn is running.", {
            activeTurnId: ((_b = get().activeTurn) == null ? void 0 : _b.turnId) ?? null
          });
          return;
        }
        console.log(`${LOG_PREFIX} Queued composer message while another turn is running.`, { message });
        chatDebug$1("Queued composer message while runtime turn is running.", {
          activeTurnId: ((_c = get().activeTurn) == null ? void 0 : _c.turnId) ?? null,
          queuedCountBeforeEnqueue: getQueuedChatTurns().length
        });
        enqueueChatTurn(message);
        return;
      }
      console.log(`${LOG_PREFIX} User message received for runtime turn.`, { message });
      chatDebug$1("Starting fresh runtime turn from composer input.", {
        currentView: get().currentView,
        isBusy: get().isBusy,
        activeTurnStatus: ((_d = get().activeTurn) == null ? void 0 : _d.status) ?? null,
        hasPendingClarification: Boolean(getEffectivePendingClarification())
      });
      await runImmediateChatTurn(message, {
        appendUserMessage: false,
        displayText: options == null ? void 0 : options.displayText
      });
    },
    handleClarificationResponse: async (userChoice) => {
      var _a, _b, _c, _d;
      if (get().isBusy) {
        chatDebug$1("Ignored clarification response because chat is already busy.", {
          activeTurnStatus: ((_a = get().activeTurn) == null ? void 0 : _a.status) ?? null,
          hasPendingClarification: Boolean(getEffectivePendingClarification())
        });
        return;
      }
      set({ isBusy: true, chatLifecycleState: "running" });
      chatDebug$1("Handling clarification response.", {
        activeTurnStatus: ((_b = get().activeTurn) == null ? void 0 : _b.status) ?? null,
        pendingClarificationQuestion: ((_c = getEffectivePendingClarification()) == null ? void 0 : _c.question) ?? null
      });
      try {
        if (!_resolveEffectivePendingClarification) {
          const mod = await __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ce), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
          _resolveEffectivePendingClarification = mod.resolveEffectivePendingClarification;
        }
        const pendingClarification = getEffectivePendingClarification();
        if (pendingClarification) {
          storeResolvedClarification(pendingClarification, userChoice.value || userChoice.label);
        }
        const { handleClarificationResponse: processClarificationResponse } = await __vitePreload(async () => {
          const { handleClarificationResponse: processClarificationResponse2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cv);
          return { handleClarificationResponse: processClarificationResponse2 };
        }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
        await processClarificationResponse(userChoice, storeApi);
        fireContextRefresh();
        await drainQueuedChatTurns();
      } finally {
        chatDebug$1("Clarification response handling finished.", {
          activeTurnStatus: ((_d = get().activeTurn) == null ? void 0 : _d.status) ?? null,
          hasPendingClarification: Boolean(getEffectivePendingClarification()),
          isBusy: get().isBusy
        });
        const currentLifecycle = get().chatLifecycleState;
        set({
          isBusy: false,
          ...currentLifecycle === "running" ? { chatLifecycleState: "failed" } : {}
        });
      }
    },
    handleNaturalLanguageQuery: async (query) => {
      await executeControlledSpreadsheetFilter(query, "spreadsheet_panel");
      fireContextRefresh();
    },
    clearAiFilter: () => {
      set({ activeSpreadsheetFilter: null, spreadsheetFilterFunction: null, aiFilterExplanation: null });
      get().addProgress("AI data filter cleared.");
      console.log(`${LOG_PREFIX} AI spreadsheet filter cleared.`);
    },
    clearActiveDataQuery: () => {
      set({ activeDataQuery: null });
      get().addProgress("AI data query cleared.");
      console.log(`${LOG_PREFIX} AI data query cleared.`);
    }
  };
};
const TELEMETRY_FLUSH_INTERVAL_MS$1 = 500;
let shadowTelemetryEvents = null;
let pendingTelemetryEvents = [];
let telemetryEventsFlushTimer = null;
const createTelemetrySlice = (set, get) => ({
  telemetryEvents: [],
  logTelemetryEvent: (eventInput) => {
    const { stage, responseType, detail, chunkSize, meta } = eventInput;
    const provider = get().settings.provider;
    const correlation = buildCorrelationFields(get(), eventInput);
    const event = {
      id: createId("telemetry"),
      provider,
      stage,
      responseType,
      detail,
      chunkSize,
      // meta values from worker diagnostics are already plain primitives —
      // skip the expensive toSerializable deep-clone.
      meta: meta ?? void 0,
      timestamp: /* @__PURE__ */ new Date(),
      sessionId: correlation.sessionId,
      datasetId: correlation.datasetId,
      runId: correlation.runId,
      turnId: correlation.turnId,
      stepId: correlation.stepId,
      toolCallId: correlation.toolCallId,
      cleaningRunId: correlation.cleaningRunId,
      requestId: correlation.requestId
    };
    pendingTelemetryEvents.push(event);
    if (telemetryEventsFlushTimer !== null) return;
    telemetryEventsFlushTimer = setTimeout(() => {
      telemetryEventsFlushTimer = null;
      const batch = pendingTelemetryEvents.splice(0);
      if (batch.length === 0) return;
      if (shadowTelemetryEvents === null) {
        shadowTelemetryEvents = get().telemetryEvents ?? [];
      }
      shadowTelemetryEvents = [...shadowTelemetryEvents, ...batch].slice(-200);
      const state2 = get();
      if (!state2.isDebugLogsModalOpen && !state2.isAgentModalOpen) return;
      set(() => ({ telemetryEvents: shadowTelemetryEvents }));
    }, TELEMETRY_FLUSH_INTERVAL_MS$1);
  },
  clearTelemetry: () => {
    shadowTelemetryEvents = [];
    pendingTelemetryEvents = [];
    set({ telemetryEvents: [] });
  },
  syncTelemetryEventsToStore: () => {
    const batch = pendingTelemetryEvents.splice(0);
    if (shadowTelemetryEvents === null) {
      shadowTelemetryEvents = get().telemetryEvents ?? [];
    }
    if (batch.length > 0) {
      shadowTelemetryEvents = [...shadowTelemetryEvents, ...batch].slice(-200);
    }
    set(() => ({ telemetryEvents: shadowTelemetryEvents }));
  }
});
const createEventObject = (event) => normalizeAgentActivityEvent({
  id: event.id ?? createId("agent-event"),
  timestamp: event.timestamp ?? /* @__PURE__ */ new Date(),
  phase: event.phase,
  step: event.step,
  status: event.status,
  message: event.message,
  detail: event.detail ? toSerializable(event.detail) : event.detail,
  sessionId: event.sessionId,
  datasetId: event.datasetId,
  runId: event.runId,
  turnId: event.turnId,
  stepId: event.stepId,
  toolCallId: event.toolCallId,
  cleaningRunId: event.cleaningRunId,
  requestId: event.requestId,
  activity: event.activity
});
const createToolLogEntry = (entry) => ({
  id: entry.id ?? createId("agent-tool"),
  timestamp: entry.timestamp ?? /* @__PURE__ */ new Date(),
  sessionId: entry.sessionId,
  datasetId: entry.datasetId,
  runId: entry.runId,
  turnId: entry.turnId,
  stepId: entry.stepId,
  toolCallId: entry.toolCallId,
  cleaningRunId: entry.cleaningRunId,
  requestId: entry.requestId,
  tool: entry.tool,
  description: entry.description,
  detail: entry.detail ? toSerializable(entry.detail) : entry.detail,
  stage: entry.stage,
  category: entry.category,
  risk: entry.risk,
  policyDecision: entry.policyDecision,
  policyReason: entry.policyReason
});
const createRuntimeEventObject = (event) => ({
  id: event.id ?? createId("runtime-event"),
  timestamp: event.timestamp ?? /* @__PURE__ */ new Date(),
  sessionId: event.sessionId,
  runId: event.runId,
  turnId: event.turnId,
  stepId: event.stepId,
  toolCallId: event.toolCallId,
  type: event.type,
  stage: event.stage,
  reason: event.reason,
  retryable: event.retryable,
  failureClass: event.failureClass,
  message: event.message,
  detail: event.detail
});
const TELEMETRY_FLUSH_INTERVAL_MS = 200;
let pendingAgentEvents = [];
let pendingRuntimeEvents = [];
let telemetryFlushTimer = null;
let shadowAgentEvents = null;
let shadowRuntimeEvents = null;
const scheduleTelemetryFlush = (set, get) => {
  if (telemetryFlushTimer !== null) return;
  telemetryFlushTimer = setTimeout(() => {
    telemetryFlushTimer = null;
    const agentBatch = pendingAgentEvents.splice(0);
    const runtimeBatch = pendingRuntimeEvents.splice(0);
    if (agentBatch.length === 0 && runtimeBatch.length === 0) return;
    const state2 = get();
    if (shadowAgentEvents === null) shadowAgentEvents = state2.agentEvents ?? [];
    if (shadowRuntimeEvents === null) shadowRuntimeEvents = state2.runtimeEvents ?? [];
    if (agentBatch.length > 0) {
      shadowAgentEvents = [...shadowAgentEvents, ...agentBatch].slice(-200);
    }
    if (runtimeBatch.length > 0) {
      shadowRuntimeEvents = [...shadowRuntimeEvents, ...runtimeBatch].slice(-120);
    }
    const modalOpen = state2.isDebugLogsModalOpen || state2.isAgentModalOpen || state2.isDataPreparationModalOpen;
    if (!modalOpen) return;
    set(() => ({
      ...agentBatch.length > 0 ? { agentEvents: shadowAgentEvents } : {},
      ...runtimeBatch.length > 0 ? { runtimeEvents: shadowRuntimeEvents } : {}
    }));
  }, TELEMETRY_FLUSH_INTERVAL_MS);
};
const flushTelemetryToStore = (set, get) => {
  const agentBatch = pendingAgentEvents.splice(0);
  const runtimeBatch = pendingRuntimeEvents.splice(0);
  if (shadowAgentEvents === null) shadowAgentEvents = (get == null ? void 0 : get().agentEvents) ?? [];
  if (shadowRuntimeEvents === null) shadowRuntimeEvents = (get == null ? void 0 : get().runtimeEvents) ?? [];
  if (agentBatch.length > 0) {
    shadowAgentEvents = [...shadowAgentEvents, ...agentBatch].slice(-200);
  }
  if (runtimeBatch.length > 0) {
    shadowRuntimeEvents = [...shadowRuntimeEvents, ...runtimeBatch].slice(-120);
  }
  set(() => ({
    agentEvents: shadowAgentEvents,
    runtimeEvents: shadowRuntimeEvents
  }));
};
const resetAgentTelemetryBuffers = () => {
  if (telemetryFlushTimer !== null) {
    clearTimeout(telemetryFlushTimer);
    telemetryFlushTimer = null;
  }
  pendingAgentEvents = [];
  pendingRuntimeEvents = [];
  shadowAgentEvents = [];
  shadowRuntimeEvents = [];
};
const REPORT_GENERATION_TIMEOUT_MS = 3e5;
let reportAbortController = null;
let reportTimeoutHandle = null;
const cleanupReportAbort = () => {
  if (reportTimeoutHandle) {
    clearTimeout(reportTimeoutHandle);
    reportTimeoutHandle = null;
  }
  reportAbortController = null;
};
const createAgentReportActions = (set, get) => ({
  generateAnalystReport: async () => {
    var _a;
    if (get().isGeneratingReport) {
      get().addProgress("Another report or analysis run is already in progress.", "warning");
      return;
    }
    const state2 = get();
    if (!state2.csvData && !state2.rawCsvData) {
      state2.addProgress("Cannot generate an analyst report because no dataset is loaded.", "error");
      return;
    }
    const reportRunId = `report-run-${Date.now()}`;
    let lastRecordedProgress = -1;
    const updateProgress = (progress) => {
      set({
        reportGenerationProgress: {
          completed: progress.completed,
          total: progress.total,
          mode: "artifact"
        },
        aiTaskStatus: {
          status: progress.completed >= progress.total ? "done" : "thinking",
          title: progress.title,
          subtitle: progress.subtitle,
          totalSteps: progress.total,
          currentStep: Math.min(progress.total, Math.max(1, progress.completed || 1))
        }
      });
      if (progress.completed !== lastRecordedProgress) {
        lastRecordedProgress = progress.completed;
        get().recordAgentEvent({
          runId: reportRunId,
          phase: "execution",
          step: "analyst_report_progress",
          status: progress.completed >= progress.total ? "done" : "in_progress",
          message: progress.subtitle,
          detail: {
            completed: progress.completed,
            total: progress.total
          },
          activity: {
            kind: "artifact",
            lifecycle: progress.completed >= progress.total ? "completed" : "running",
            source: "artifact",
            eventType: "analyst_report_progress",
            title: progress.title
          }
        });
      }
    };
    set({
      isGeneratingReport: true,
      reportGenerationProgress: {
        completed: 0,
        total: 7,
        mode: "artifact"
      },
      aiTaskStatus: {
        status: "thinking",
        title: "Preparing analyst report",
        subtitle: "Collecting the verified dataset and trusted analysis evidence.",
        totalSteps: 7,
        currentStep: 1
      }
    });
    state2.recordAgentEvent({
      runId: reportRunId,
      phase: "execution",
      step: "analyst_report_started",
      status: "in_progress",
      message: "Started generating bounded analyst report artifacts from verified evidence.",
      activity: {
        kind: "artifact",
        lifecycle: "running",
        source: "artifact",
        eventType: "analyst_report_started",
        title: "Analyst Report Started"
      }
    });
    const controller = new AbortController();
    reportAbortController = controller;
    reportTimeoutHandle = setTimeout(() => {
      controller.abort(new Error("Report generation timed out after 5 minutes."));
    }, REPORT_GENERATION_TIMEOUT_MS);
    try {
      const artifacts = await generateAnalystReportArtifacts(state2, state2.settings, {
        onProgress: updateProgress,
        abortSignal: controller.signal
      });
      await saveReportArtifacts(artifacts.manifest.reportId, artifacts.manifest, artifacts.storedArtifactFiles);
      set((prev) => ({
        workspaceFiles: {
          ...Object.fromEntries(
            Object.entries(prev.workspaceFiles ?? {}).filter(([path]) => !path.startsWith("/workspace/reports/latest-analyst-report."))
          ),
          ...artifacts.workspaceFiles
        },
        isGeneratingReport: false,
        reportGenerationProgress: null,
        aiTaskStatus: null,
        chatHistory: artifacts.artifactStatus === "blocked" ? prev.chatHistory : [
          ...prev.chatHistory,
          createChatMessage({
            sender: "ai",
            text: `Analyst report ready. Workspace artifacts were saved for ${artifacts.title}, and a history snapshot was archived.`,
            timestamp: /* @__PURE__ */ new Date(),
            type: "ai_message"
          })
        ]
      }));
      const nextState = get();
      const reportGeneratedAt = Number.isNaN(new Date(artifacts.manifest.generatedAt).getTime()) ? /* @__PURE__ */ new Date() : new Date(artifacts.manifest.generatedAt);
      const sessionCreatedAt = nextState.sessionCreatedAt ?? reportGeneratedAt;
      if (!nextState.sessionCreatedAt) {
        set({ sessionCreatedAt });
      }
      const currentSessionReport = buildPersistedReportRecord(nextState, {
        id: nextState.sessionId,
        filename: ((_a = nextState.csvData) == null ? void 0 : _a.fileName) || "Current Session",
        createdAt: sessionCreatedAt
      });
      const archivedReport = buildPersistedReportRecord(nextState, {
        id: `report-artifact-${Date.now()}`,
        filename: artifacts.title,
        createdAt: reportGeneratedAt
      });
      await saveReport(currentSessionReport);
      await saveReport({
        ...currentSessionReport,
        id: CURRENT_SESSION_KEY
      });
      if (artifacts.artifactStatus !== "blocked") {
        await saveReport(archivedReport);
      }
      await nextState.loadReportsList();
      if (artifacts.artifactStatus === "blocked") {
        const blockerSummary = artifacts.manifest.gateReasons.length > 0 ? artifacts.manifest.gateReasons.join(" | ") : "Readiness blockers were recorded in the workspace artifacts.";
        nextState.addProgress(`Analyst report was blocked: ${blockerSummary}`, "warning");
        nextState.recordAgentEvent({
          runId: reportRunId,
          phase: "execution",
          step: "analyst_report_blocked",
          status: "error",
          message: "Blocked analyst report generation before synthesis.",
          activity: {
            kind: "artifact",
            lifecycle: "failed",
            source: "artifact",
            eventType: "analyst_report_blocked",
            title: "Analyst Report Blocked",
            explanation: blockerSummary
          },
          detail: {
            reportId: artifacts.manifest.reportId,
            generationGate: artifacts.manifest.generationGate,
            trustedCardsCount: artifacts.manifest.trustedCardsCount,
            excludedEvidenceCount: artifacts.manifest.excludedEvidenceCount,
            artifactStatus: artifacts.manifest.artifactStatus,
            gateReasons: artifacts.manifest.gateReasons
          }
        });
        return;
      }
      const reportHtml = artifacts.workspaceFiles[LATEST_REPORT_HTML_PATH];
      if (!reportHtml) {
        nextState.addProgress("Analyst report HTML is unavailable.", "warning");
      }
      nextState.addProgress(`Analyst report generated: "${artifacts.title}".`, "system");
      nextState.recordAgentEvent({
        runId: reportRunId,
        phase: "execution",
        step: "analyst_report_generated",
        status: "done",
        message: "Generated bounded analyst report artifacts.",
        activity: {
          kind: "artifact",
          lifecycle: "completed",
          source: "artifact",
          eventType: "analyst_report_generated",
          title: "Analyst Report Completed"
        },
        detail: {
          reportId: artifacts.manifest.reportId,
          title: artifacts.title,
          htmlPath: LATEST_REPORT_HTML_PATH,
          irPath: "/workspace/reports/latest-analyst-report.ir.json",
          generationGate: artifacts.manifest.generationGate,
          trustedCardsCount: artifacts.manifest.trustedCardsCount,
          excludedEvidenceCount: artifacts.manifest.excludedEvidenceCount,
          artifactStatus: artifacts.manifest.artifactStatus
        }
      });
      if (artifacts.manifest.fallbacksUsed.length > 0) {
        nextState.recordAgentEvent({
          runId: reportRunId,
          phase: "execution",
          step: "analyst_report_fallback_used",
          status: "done",
          message: "Analyst report generation used bounded fallback paths.",
          activity: {
            kind: "artifact",
            lifecycle: "degraded",
            source: "artifact",
            eventType: "analyst_report_fallback_used",
            title: "Analyst Report Used Fallbacks"
          },
          detail: {
            reportId: artifacts.manifest.reportId,
            generationGate: artifacts.manifest.generationGate,
            trustedCardsCount: artifacts.manifest.trustedCardsCount,
            excludedEvidenceCount: artifacts.manifest.excludedEvidenceCount,
            artifactStatus: artifacts.manifest.artifactStatus,
            fallbacksUsed: artifacts.manifest.fallbacksUsed
          }
        });
      }
    } catch (error) {
      const cancelled = isRuntimeAbortError(error, controller.signal);
      const message = cancelled ? "Report generation was cancelled." : error instanceof Error ? error.message : String(error);
      console.error("Analyst report generation failed:", error);
      set({
        isGeneratingReport: false,
        reportGenerationProgress: null,
        aiTaskStatus: cancelled ? null : {
          status: "error",
          title: "Analyst report failed",
          subtitle: message,
          totalSteps: 7,
          currentStep: 1,
          error: message
        }
      });
      get().addProgress(
        cancelled ? "Report generation cancelled." : `Analyst report generation failed: ${message}`,
        cancelled ? "system" : "error"
      );
      get().recordAgentEvent({
        runId: reportRunId,
        phase: "execution",
        step: cancelled ? "analyst_report_cancelled" : "analyst_report_failed",
        status: cancelled ? "done" : "error",
        message: cancelled ? "Analyst report generation was cancelled." : "Failed to generate bounded analyst report artifacts.",
        detail: {
          error: message
        },
        activity: {
          kind: "artifact",
          lifecycle: cancelled ? "cancelled" : "failed",
          source: "artifact",
          eventType: cancelled ? "analyst_report_cancelled" : "analyst_report_failed",
          title: cancelled ? "Analyst Report Cancelled" : "Analyst Report Failed",
          explanation: message
        }
      });
    } finally {
      cleanupReportAbort();
    }
  },
  cancelReportGeneration: () => {
    if (reportAbortController && !reportAbortController.signal.aborted) {
      reportAbortController.abort(new Error("Report generation cancelled by user."));
    }
  },
  openLatestAnalystReport: () => {
    const workspaceFiles = get().workspaceFiles ?? {};
    const manifest = parseReportArtifactManifest(workspaceFiles[LATEST_REPORT_MANIFEST_PATH]);
    if (!manifest || !hasOpenableLatestReport(workspaceFiles)) {
      const message = (manifest == null ? void 0 : manifest.artifactStatus) === "blocked" ? "The latest analyst report is blocked. Review the readiness artifact in the workspace." : "No analyst report HTML is available to open yet.";
      get().addProgress(message, "warning");
      return;
    }
    const html = workspaceFiles[LATEST_REPORT_HTML_PATH];
    const openedWindow = openReportArtifact(html);
    if (!openedWindow) {
      get().addProgress("Failed to open the analyst report in a new tab.", "error");
    }
  },
  exportLatestAnalystReportPdf: () => {
    const workspaceFiles = get().workspaceFiles ?? {};
    const manifest = parseReportArtifactManifest(workspaceFiles[LATEST_REPORT_MANIFEST_PATH]);
    if (!manifest || !hasOpenableLatestReport(workspaceFiles)) {
      const message = (manifest == null ? void 0 : manifest.artifactStatus) === "blocked" ? "The latest analyst report is blocked. Review the readiness artifact in the workspace." : "No analyst report HTML is available to export yet.";
      get().addProgress(message, "warning");
      return;
    }
    const state2 = get();
    const currentDatasetVersion = getCurrentAnalysisDatasetVersion(state2);
    if (manifest.datasetVersion && currentDatasetVersion && manifest.datasetVersion !== currentDatasetVersion) {
      state2.addProgress(
        "The latest report belongs to an older dataset version. Generate a new report before exporting PDF.",
        "warning"
      );
      return;
    }
    const html = workspaceFiles[LATEST_REPORT_HTML_PATH];
    const openedWindow = printReportArtifact(html);
    if (!openedWindow) {
      get().addProgress("Failed to open the analyst report for PDF export.", "error");
    }
  }
});
const createAgentSlice = (set, get) => ({
  agentEvents: [],
  agentToolLogs: [],
  activeTurn: null,
  queuedAgentRuns: [],
  cancelRequestedTurnId: null,
  runtimeEvents: [],
  runtimeRunHistory: [],
  lastInsightExtractedAtTurn: 0,
  cardEnhancementSuggestions: [],
  isCardReviewInProgress: false,
  agentMemoryRun: null,
  liveAgentMemoryRun: null,
  agentMemoryHistory: [],
  selectedMemoryRunId: null,
  currentDatasetId: null,
  recordAgentEvent: (eventInput) => {
    var _a, _b, _c, _d, _e;
    const correlation = buildCorrelationFields(get(), eventInput);
    const event = createEventObject({
      ...eventInput,
      sessionId: eventInput.sessionId ?? correlation.sessionId,
      datasetId: eventInput.datasetId ?? correlation.datasetId,
      runId: eventInput.runId ?? correlation.runId,
      turnId: eventInput.turnId ?? correlation.turnId,
      stepId: eventInput.stepId ?? correlation.stepId,
      toolCallId: eventInput.toolCallId ?? correlation.toolCallId,
      cleaningRunId: eventInput.cleaningRunId ?? correlation.cleaningRunId,
      requestId: eventInput.requestId ?? correlation.requestId
    });
    pendingAgentEvents.push(event);
    recordLocalDiagnosticBestEffort({
      runId: event.runId ?? null,
      phase: event.phase,
      attempt: typeof ((_a = event.detail) == null ? void 0 : _a.attempt) === "number" ? event.detail.attempt : void 0,
      tool: event.step,
      provider: ((_b = get().settings) == null ? void 0 : _b.provider) ?? "local",
      model: ((_c = get().settings) == null ? void 0 : _c.complexModel) ?? null,
      durationMs: typeof ((_d = event.detail) == null ? void 0 : _d.durationMs) === "number" ? event.detail.durationMs : null,
      outcome: event.status === "error" ? "failed" : event.status === "done" ? "succeeded" : "started",
      reasonCode: typeof ((_e = event.detail) == null ? void 0 : _e.reasonCode) === "string" ? event.detail.reasonCode : event.step,
      payload: event
    });
    scheduleTelemetryFlush(set, get);
    return event;
  },
  recordRuntimeEvent: (eventInput) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const event = createRuntimeEventObject({
      ...eventInput,
      sessionId: eventInput.sessionId ?? get().sessionId,
      runId: eventInput.runId ?? ((_a = get().activeTurn) == null ? void 0 : _a.runId),
      turnId: eventInput.turnId ?? ((_b = get().activeTurn) == null ? void 0 : _b.turnId),
      toolCallId: eventInput.toolCallId ?? ((_d = (_c = get().activeTurn) == null ? void 0 : _c.steps.at(-1)) == null ? void 0 : _d.toolCallId) ?? ((_f = (_e = get().activeTurn) == null ? void 0 : _e.steps.at(-1)) == null ? void 0 : _f.stepId)
    });
    pendingRuntimeEvents.push(event);
    pendingAgentEvents.push(projectRuntimeEventToActivity(event));
    recordLocalDiagnosticBestEffort({
      runId: event.runId ?? null,
      phase: event.stage ?? "runtime",
      attempt: typeof ((_g = event.detail) == null ? void 0 : _g.retryAttempt) === "number" ? event.detail.retryAttempt : void 0,
      tool: event.type,
      provider: ((_h = get().settings) == null ? void 0 : _h.provider) ?? "local",
      model: ((_i = get().settings) == null ? void 0 : _i.complexModel) ?? null,
      durationMs: typeof ((_j = event.detail) == null ? void 0 : _j.durationMs) === "number" ? event.detail.durationMs : null,
      outcome: event.type === "turn_cancelled" ? "cancelled" : event.type === "turn_failed" || event.type === "action_execution_error" ? "failed" : event.type === "turn_blocked" ? "blocked" : event.type === "turn_completed" ? "succeeded" : "started",
      reasonCode: event.reason ?? event.failureClass ?? event.type,
      payload: event
    });
    scheduleTelemetryFlush(set, get);
    return event;
  },
  enqueueAgentRun: (run) => {
    set((state2) => ({
      queuedAgentRuns: [...state2.queuedAgentRuns, run]
    }));
  },
  dequeueQueuedAgentRun: (queueId) => {
    const queuedRun = get().queuedAgentRuns.find((run) => run.queueId === queueId) ?? null;
    if (!queuedRun) {
      return null;
    }
    set((state2) => ({
      queuedAgentRuns: state2.queuedAgentRuns.filter((run) => run.queueId !== queueId)
    }));
    return queuedRun;
  },
  appendRuntimeRunRecord: (record) => {
    set((state2) => ({
      runtimeRunHistory: [...state2.runtimeRunHistory, record].slice(-50)
    }));
  },
  setActiveTurn: (turn) => set({ activeTurn: turn }),
  clearActiveTurn: () => set({ activeTurn: null, isBusy: false, chatLifecycleState: "idle" }),
  requestActiveTurnCancellation: async () => {
    const activeTurn = get().activeTurn;
    if (!activeTurn || activeTurn.status !== "running") {
      return;
    }
    if (get().cancelRequestedTurnId === activeTurn.turnId) {
      return;
    }
    const [{ abortRuntimeTurn }, { buildRuntimeContractDetail }] = await Promise.all([
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c3), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c5), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
    ]);
    set({ cancelRequestedTurnId: activeTurn.turnId });
    abortRuntimeTurn(activeTurn.turnId);
    get().recordRuntimeEvent({
      turnId: activeTurn.turnId,
      type: "turn_cancellation_requested",
      message: "Cancellation requested for the active agent turn.",
      detail: buildRuntimeContractDetail({
        reasonCode: "cancellation_requested",
        retryable: false,
        abortMode: "checkpoint_abort",
        abortSource: "runtime_cancellation",
        abortPropagationStatus: "checkpoint_only",
        source: "runtime_cancellation_request"
      })
    });
  },
  clearActiveTurnCancellation: () => set({ cancelRequestedTurnId: null }),
  requestActiveResearchCancellation: async () => {
    const researchRun = get().activeAnalysisSession;
    if (!researchRun || researchRun.status !== "running") return;
    const { requestDataResearchCancellation } = await __vitePreload(async () => {
      const { requestDataResearchCancellation: requestDataResearchCancellation2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cm);
      return { requestDataResearchCancellation: requestDataResearchCancellation2 };
    }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
    requestDataResearchCancellation(researchRun.runId);
    set((state2) => {
      var _a;
      return {
        activeAnalysisSession: ((_a = state2.activeAnalysisSession) == null ? void 0 : _a.runId) === researchRun.runId ? {
          ...state2.activeAnalysisSession,
          cancellationRequestedAt: state2.activeAnalysisSession.cancellationRequestedAt ?? /* @__PURE__ */ new Date()
        } : state2.activeAnalysisSession
      };
    });
    get().recordAgentEvent({
      runId: researchRun.runId,
      phase: "execution",
      step: "research_run_cancellation_requested",
      status: "in_progress",
      message: "Cancellation requested. The research run will stop at the next safe checkpoint.",
      activity: {
        kind: "research",
        lifecycle: "waiting",
        source: "app",
        eventType: "research_run_cancellation_requested",
        title: "Stopping research run",
        explanation: "The current operation may finish, but no later research question will start."
      }
    });
  },
  logAgentToolUsage: (entryInput) => {
    var _a, _b, _c, _d;
    const activeTurn = get().activeTurn;
    const activeStep = activeTurn == null ? void 0 : activeTurn.steps.at(-1);
    const correlation = buildCorrelationFields(get(), entryInput);
    const entry = createToolLogEntry({
      ...entryInput,
      sessionId: entryInput.sessionId ?? correlation.sessionId ?? get().sessionId,
      datasetId: entryInput.datasetId ?? correlation.datasetId,
      runId: entryInput.runId ?? correlation.runId ?? (activeTurn == null ? void 0 : activeTurn.runId),
      turnId: entryInput.turnId ?? correlation.turnId ?? (activeTurn == null ? void 0 : activeTurn.turnId),
      stepId: entryInput.stepId ?? correlation.stepId ?? (activeStep == null ? void 0 : activeStep.stepId),
      toolCallId: entryInput.toolCallId ?? correlation.toolCallId ?? (activeStep == null ? void 0 : activeStep.toolCallId) ?? (activeStep == null ? void 0 : activeStep.stepId),
      cleaningRunId: entryInput.cleaningRunId ?? correlation.cleaningRunId,
      requestId: entryInput.requestId ?? correlation.requestId
    });
    recordLocalDiagnosticBestEffort({
      runId: entry.runId ?? null,
      phase: entry.stage ?? "tool",
      attempt: typeof ((_a = entry.detail) == null ? void 0 : _a.attempt) === "number" ? entry.detail.attempt : void 0,
      tool: entry.tool,
      provider: ((_b = get().settings) == null ? void 0 : _b.provider) ?? "local",
      model: ((_c = get().settings) == null ? void 0 : _c.complexModel) ?? null,
      durationMs: typeof ((_d = entry.detail) == null ? void 0 : _d.durationMs) === "number" ? entry.detail.durationMs : null,
      outcome: entry.policyDecision === "blocked" ? "blocked" : "succeeded",
      reasonCode: entry.policyReason ?? entry.tool,
      payload: entry
    });
    pendingAgentEvents.push(projectToolLogToActivity(entry));
    scheduleTelemetryFlush(set, get);
    set((state2) => {
      const updated = [...state2.agentToolLogs, entry];
      return { agentToolLogs: updated.slice(-200) };
    });
  },
  runCardEnhancementReview: async () => {
    const { analysisCards, settings, addProgress } = get();
    if (analysisCards.length === 0) {
      addProgress("No cards available to review yet.", "system");
      return;
    }
    set({ isCardReviewInProgress: true });
    try {
      const { generateCardEnhancementSuggestions } = await __vitePreload(async () => {
        const { generateCardEnhancementSuggestions: generateCardEnhancementSuggestions2 } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cw);
        return { generateCardEnhancementSuggestions: generateCardEnhancementSuggestions2 };
      }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url);
      const cardContext = analysisCards.map((card) => ({
        id: card.id,
        title: card.plan.title,
        aggregatedDataSample: card.aggregatedData.slice(0, 15),
        groupByColumn: card.plan.groupByColumn,
        valueColumn: card.plan.valueColumn,
        aggregation: card.plan.aggregation
      }));
      const suggestions = await generateCardEnhancementSuggestions(cardContext, settings);
      if (!suggestions || suggestions.length === 0) {
        set((prev) => ({
          cardEnhancementSuggestions: [],
          isCardReviewInProgress: false,
          chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
              sender: "ai",
              text: "AI reviewed all cards but found no additional enhancements at the moment.",
              timestamp: /* @__PURE__ */ new Date(),
              type: "ai_message"
            })
          ]
        }));
        addProgress("AI review complete – no enhancements suggested.", "system");
        return;
      }
      const cardTitleMap = new Map(analysisCards.map((card) => [card.id, card.plan.title]));
      const suggestionsWithMeta = suggestions.map((suggestion, idx) => ({
        ...suggestion,
        cardTitle: String(suggestion.cardTitle ?? cardTitleMap.get(suggestion.cardId) ?? suggestion.cardId),
        id: suggestion.id ?? `card-enhancement-${Date.now()}-${idx}`,
        createdAt: /* @__PURE__ */ new Date(),
        shortCode: `S${idx + 1}`,
        status: "pending",
        updateChart: suggestion.updateChart ? {
          ...suggestion.updateChart,
          newChartType: suggestion.updateChart.newChartType
        } : void 0
      }));
      set((prev) => ({
        cardEnhancementSuggestions: suggestionsWithMeta,
        isCardReviewInProgress: false,
        chatHistory: [
          ...prev.chatHistory,
          createChatMessage({
            sender: "ai",
            text: `AI reviewed all cards and proposed ${suggestionsWithMeta.length} enhancement${suggestionsWithMeta.length > 1 ? "s" : ""}. Reply "Approve S1" or "Dismiss S1" to act on a suggestion.`,
            timestamp: /* @__PURE__ */ new Date(),
            type: "ai_message"
          }),
          ...suggestionsWithMeta.map((s) => createChatMessage({
            sender: "ai",
            text: `Suggestion ${s.shortCode} (${s.priority.toUpperCase()}) for **${s.cardTitle}**:
${s.rationale}

Proposed column: ${s.proposedColumnName ? `**${s.proposedColumnName}** = ${s.formula}` : "N/A"}
Reply "Approve ${s.shortCode}" to apply or "Dismiss ${s.shortCode}" to skip.`,
            timestamp: /* @__PURE__ */ new Date(),
            type: "ai_enhancement_suggestion",
            enhancementSuggestionId: s.id
          }))
        ]
      }));
      addProgress(`AI proposed ${suggestionsWithMeta.length} potential enhancement${suggestionsWithMeta.length > 1 ? "s" : ""}.`, "system");
    } catch (error) {
      console.error("Card enhancement review failed:", error);
      get().addProgress("AI card review failed. Please try again.", "error");
      set({ isCardReviewInProgress: false });
    }
  },
  /* ── Report actions (delegated to agentReportActions.ts) ── */
  ...createAgentReportActions(set, get),
  applyCardEnhancementSuggestion: async (suggestionId) => {
    const { cardEnhancementSuggestions, addCalculatedColumnToCard, addProgress } = get();
    const suggestion = cardEnhancementSuggestions.find((s) => s.id === suggestionId);
    if (!suggestion || suggestion.status === "applied" || suggestion.status === "dismissed") return;
    set({
      cardEnhancementSuggestions: cardEnhancementSuggestions.map(
        (s) => s.id === suggestionId ? { ...s, status: "applying" } : s
      )
    });
    try {
      if (suggestion.action === "add_calculated_column" && suggestion.proposedColumnName && suggestion.formula) {
        const updateInstructions = suggestion.updateChart ?? { useAs: "primaryY" };
        addCalculatedColumnToCard(suggestion.cardId, suggestion.proposedColumnName, suggestion.formula, updateInstructions);
        set({
          cardEnhancementSuggestions: get().cardEnhancementSuggestions.map(
            (s) => s.id === suggestionId ? { ...s, status: "applied" } : s
          )
        });
        addProgress(`Applied enhancement on ${suggestion.cardTitle}.`, "system");
      } else {
        addProgress(`Suggestion ${suggestion.shortCode} is informational only and cannot be auto-applied.`, "error");
        set({
          cardEnhancementSuggestions: get().cardEnhancementSuggestions.map(
            (s) => s.id === suggestionId ? { ...s, status: "failed" } : s
          )
        });
        return;
      }
    } catch (error) {
      console.error("Failed to apply enhancement suggestion:", error);
      addProgress(`Failed to apply enhancement on ${suggestion.cardTitle}.`, "error");
      set({
        cardEnhancementSuggestions: get().cardEnhancementSuggestions.map(
          (s) => s.id === suggestionId ? { ...s, status: "failed" } : s
        )
      });
    }
  },
  dismissCardEnhancementSuggestion: (suggestionId) => {
    set((state2) => ({
      cardEnhancementSuggestions: state2.cardEnhancementSuggestions.map(
        (s) => s.id === suggestionId ? { ...s, status: "dismissed" } : s
      )
    }));
  },
  setAiTaskStatus: (status) => set({ aiTaskStatus: status }),
  setAgentMemoryRun: (run) => set({ agentMemoryRun: run, selectedMemoryRunId: (run == null ? void 0 : run.runId) ?? null }),
  setLiveAgentMemoryRun: (run) => set({ liveAgentMemoryRun: run }),
  setAgentMemoryHistory: (runs) => set({ agentMemoryHistory: runs }),
  selectAgentMemoryRun: (runId) => {
    if (!runId) {
      const live = get().liveAgentMemoryRun ?? null;
      set({
        agentMemoryRun: live,
        // `null` is the explicit live-view sentinel used by the
        // activity modal. Keeping the live run id here incorrectly
        // switches the timeline to the stored memory snapshot and can
        // hide the current agent event stream.
        selectedMemoryRunId: null
      });
      return;
    }
    const historyRun = get().agentMemoryHistory.find((run) => run.runId === runId);
    if (historyRun) {
      set({
        agentMemoryRun: historyRun,
        selectedMemoryRunId: runId
      });
    }
  },
  setCurrentDatasetId: (datasetId) => set({ currentDatasetId: datasetId }),
  clearAgentEvents: () => {
    resetAgentTelemetryBuffers();
    set({
      agentEvents: [],
      runtimeEvents: [],
      agentToolLogs: [],
      cardEnhancementSuggestions: []
    });
  },
  syncTelemetryToStore: () => flushTelemetryToStore(set, get)
});
const MAX_SAMPLE_ROWS = 200;
const MAX_MATCHED_COLUMNS = 12;
const HEADER_SIGNALS = [
  { reasonCode: "identity_document", pattern: /^(nric|fin|passport(?:_?(?:no|number))?|social_?security(?:_?(?:no|number))?|ssn)$/i },
  { reasonCode: "contact_information", pattern: /^(e_?mail|email_?address|phone|phone_?(?:no|number)|mobile|mobile_?(?:no|number)|telephone|contact_?(?:no|number)|home_?address|date_?of_?birth|dob)$/i },
  { reasonCode: "financial_account", pattern: /^(bank_?account|bank_?account_?(?:no|number)|iban|swift|bic)$/i },
  { reasonCode: "health_information", pattern: /^(patient_?(?:id|name)|diagnosis|medical_?(?:record|condition)|health_?(?:record|condition)|medication)$/i },
  { reasonCode: "payment_card", pattern: /^(credit_?card|debit_?card|card_?(?:no|number)|pan)$/i }
];
const normalizeHeader = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const matchesNric = (value) => /^[STFGM]\d{7}[A-Z]$/i.test(value.trim());
const matchesEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
const passesLuhn = (digits) => {
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
};
const matchesPaymentCard = (value) => {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digits) && passesLuhn(digits);
};
const getHeaderSignal = (column) => {
  var _a;
  const normalized = normalizeHeader(column);
  return ((_a = HEADER_SIGNALS.find((signal) => signal.pattern.test(normalized))) == null ? void 0 : _a.reasonCode) ?? null;
};
const getRowColumns = (rows) => {
  const columns = /* @__PURE__ */ new Set();
  rows.slice(0, MAX_SAMPLE_ROWS).forEach((row) => {
    Object.keys(row).forEach((column) => columns.add(column));
  });
  return [...columns];
};
const detectSensitiveData = (csvData) => {
  var _a;
  if (!((_a = csvData == null ? void 0 : csvData.data) == null ? void 0 : _a.length)) return null;
  const rows = csvData.data.slice(0, MAX_SAMPLE_ROWS);
  const columns = getRowColumns(rows);
  const reasons = /* @__PURE__ */ new Set();
  const matchedColumns = /* @__PURE__ */ new Set();
  let sampleMatchCount = 0;
  columns.forEach((column) => {
    const headerReason = getHeaderSignal(column);
    if (headerReason) {
      reasons.add(headerReason);
      matchedColumns.add(column);
    }
    rows.forEach((row) => {
      const rawValue = row[column];
      if (rawValue === null || rawValue === void 0) return;
      const value = String(rawValue).trim();
      if (!value) return;
      if (matchesNric(value)) {
        reasons.add("identity_document");
        matchedColumns.add(column);
        sampleMatchCount += 1;
      } else if (matchesEmail(value)) {
        reasons.add("contact_information");
        matchedColumns.add(column);
        sampleMatchCount += 1;
      } else if (headerReason === "payment_card" && matchesPaymentCard(value)) {
        reasons.add("payment_card");
        matchedColumns.add(column);
        sampleMatchCount += 1;
      }
    });
  });
  if (reasons.size === 0) return null;
  return {
    reasonCodes: [...reasons].sort(),
    matchedColumns: [...matchedColumns].slice(0, MAX_MATCHED_COLUMNS),
    sampleMatchCount
  };
};
const yieldToMainThread = () => new Promise((resolve) => {
  if (typeof MessageChannel !== "undefined") {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(void 0);
  } else {
    setTimeout(resolve, 0);
  }
});
const chatDebug = (message, detail) => {
  return;
};
const normalizeMetricMappingValidationArtifact = (value) => {
  if (!value) {
    return null;
  }
  return {
    ...value,
    validationIssues: Array.isArray(value.validationIssues) ? value.validationIssues : [],
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
    grain: Array.isArray(value.grain) ? value.grain : [],
    sourceArtifactIds: Array.isArray(value.sourceArtifactIds) ? value.sourceArtifactIds : [],
    deriveMetricTemplate: value.deriveMetricTemplate ? {
      ...value.deriveMetricTemplate,
      groupByColumns: Array.isArray(value.deriveMetricTemplate.groupByColumns) ? value.deriveMetricTemplate.groupByColumns : [],
      expectedInputs: Array.isArray(value.deriveMetricTemplate.expectedInputs) ? value.deriveMetricTemplate.expectedInputs : []
    } : void 0
  };
};
const initialAppState = {
  sessionId: generateSessionId(),
  // Generate a temporary ID, will be overridden in init() if restoring
  currentView: "file_upload",
  isAppInitializing: true,
  isBusy: false,
  chatLifecycleState: "idle",
  settings: getDefaultSettings(),
  progressMessages: [],
  telemetryEvents: [],
  agentEvents: [],
  agentToolLogs: [],
  agentMemoryRun: null,
  liveAgentMemoryRun: null,
  agentMemoryHistory: [],
  selectedMemoryRunId: null,
  currentDatasetId: null,
  datasetBundle: null,
  csvData: null,
  rawCsvData: null,
  rawIntakeIr: null,
  reportStructureResolution: null,
  canonicalCsvData: null,
  canonicalBuildMeta: null,
  canonicalizationStatus: "idle",
  pipelineOutcome: null,
  reportContextResolution: null,
  datasetSemanticSnapshot: null,
  semanticStatus: "idle",
  semanticDatasetVersion: null,
  columnProfiles: [],
  columnRegistry: null,
  analysisCards: [],
  chatHistory: [],
  finalSummary: null,
  aiCoreAnalysisSummary: null,
  finalSummaryProvenance: null,
  aiCoreAnalysisSummaryProvenance: null,
  dataPreparationPlan: null,
  initialDataSample: null,
  vectorStoreDocuments: [],
  vectorMemoryState: "cold",
  pendingVectorMemoryDocs: [],
  reportMemoryScope: null,
  spreadsheetFilterFunction: null,
  activeDataQuery: null,
  activeMetricMappingValidation: null,
  activeSpreadsheetFilter: null,
  aiFilterExplanation: null,
  pendingClarification: null,
  resolvedClarifications: null,
  pendingMutationConfirmation: null,
  activeTurn: null,
  queuedChatTurns: [],
  queuedAgentRuns: [],
  cancelRequestedTurnId: null,
  runtimeEvents: [],
  runtimeRunHistory: [],
  lastInsightExtractedAtTurn: 0,
  activeAnalysisSession: null,
  latestAnalysisSession: null,
  analysisSessionHistory: [],
  visibleAnalysisTrace: [],
  aiTaskStatus: null,
  initialAnalysisStatus: "idle",
  confirmedAnalysisGoal: null,
  goalState: "idle",
  dataQualityIssues: null,
  isChangingGoal: false,
  planQueue: [],
  contextualSummary: null,
  isGeneratingReport: false,
  isSummaryGenerating: false,
  reportGenerationProgress: null,
  sessionCreatedAt: null,
  cardEnhancementSuggestions: [],
  isCardReviewInProgress: false,
  workspaceFiles: {},
  workspaceActionHistory: [],
  cleaningRun: null,
  queryHistory: [],
  duckDbSessionStatus: createIdleDuckDbSessionStatus(),
  userColumnAnnotations: {}
};
const useAppStore = createWithEqualityFn()((set, get, store) => ({
  ...initialAppState,
  reportsList: [],
  // Initial value for reportsList
  // Combine all slices
  ...createUISlice(set, get),
  ...createSettingsSlice(set, get),
  ...createHistorySlice(set, get),
  ...createCardSlice(set, get),
  ...createDataSlice(set, get),
  ...createChatSlice(set, get),
  ...createTelemetrySlice(set, get),
  ...createAgentSlice(set, get),
  // Global init function — guarded to prevent double execution from
  // React StrictMode or effect re-fires.
  init: async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (get()._initStarted) return;
    set({ _initStarted: true });
    const [
      rawPersistedSettings,
      { isProviderConfigured },
      { normalizeDataPreparationPlan },
      { updateCleaningRun }
    ] = await Promise.all([
      getSettings(),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c4), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c2), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
      __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cb), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
    ]);
    const persistedSettings = {
      ...rawPersistedSettings,
      language: normalizeAppLanguage(rawPersistedSettings.language)
    };
    set({
      isAppInitializing: true,
      settings: persistedSettings,
      isApiKeySet: isProviderConfigured(persistedSettings)
    });
    let activeSessionId = readTabSessionId();
    if (!activeSessionId) {
      activeSessionId = createAndStoreTabSessionId();
    }
    set({ sessionId: activeSessionId });
    void __vitePreload(async () => {
      const { cleanupStaleOpfsSessions } = await import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c8);
      return { cleanupStaleOpfsSessions };
    }, true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(({ cleanupStaleOpfsSessions }) => cleanupStaleOpfsSessions([activeSessionId])).catch((error) => console.warn("[Init] Could not clean abandoned OPFS imports.", error));
    if (typeof indexedDB !== "undefined") {
      void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.c0), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then((storage) => "pruneExpiredLocalDiagnostics" in storage && typeof storage.pruneExpiredLocalDiagnostics === "function" ? storage.pruneExpiredLocalDiagnostics() : 0).catch((error) => console.warn("[Init] Could not prune expired local diagnostics.", error));
    }
    try {
      const idbStart = performance.now();
      const currentSession = await getReport(activeSessionId);
      const idbMs = performance.now() - idbStart;
      const { hasExternalPayloadPending: hasExternalPayloadPending2 } = await __vitePreload(async () => {
        const { hasExternalPayloadPending: hasExternalPayloadPending3 } = await Promise.resolve().then(() => externalCsvBridge);
        return { hasExternalPayloadPending: hasExternalPayloadPending3 };
      }, true ? void 0 : void 0, import.meta.url);
      if (currentSession && !hasExternalPayloadPending2) {
        const normalizeStart = performance.now();
        const normalizedAppState = normalizeRestoredAppState(currentSession.appState);
        const restoredMemoryScope = normalizedAppState.reportMemoryScope ?? (currentSession.lineage ? {
          reportId: currentSession.lineage.reportId,
          datasetId: currentSession.lineage.datasetId,
          datasetVersion: currentSession.lineage.currentVersionId
        } : resolveReportMemoryScope(normalizedAppState));
        const normalizeMs = performance.now() - normalizeStart;
        if (idbMs + normalizeMs > 100) {
          console.warn(
            `[Init] ⚠ Session hydration: idb=${Math.round(idbMs)}ms, normalize=${Math.round(normalizeMs)}ms`
          );
        }
        const clearedPersistedClarification = Boolean(normalizedAppState.pendingClarification);
        chatDebug("Hydrating persisted session state.", {
          sessionId: activeSessionId,
          hasPendingClarification: Boolean(normalizedAppState.pendingClarification),
          pendingClarificationQuestion: ((_a = normalizedAppState.pendingClarification) == null ? void 0 : _a.question) ?? null,
          persistedActiveTurnStatus: ((_b = normalizedAppState.activeTurn) == null ? void 0 : _b.status) ?? null,
          persistedChatHistoryCount: ((_c = normalizedAppState.chatHistory) == null ? void 0 : _c.length) ?? 0,
          persistedCurrentView: normalizedAppState.currentView ?? null,
          hasCsvData: Boolean(normalizedAppState.csvData)
        });
        await yieldToMainThread();
        const restoredColumnRegistry = buildColumnRegistry({
          data: normalizedAppState.canonicalCsvData ?? normalizedAppState.csvData,
          columnProfiles: normalizedAppState.columnProfiles,
          semanticSnapshot: normalizedAppState.datasetSemanticSnapshot,
          userColumnAnnotations: normalizedAppState.userColumnAnnotations,
          steering: (_d = normalizedAppState.latestAnalysisSession) == null ? void 0 : _d.analysisSteering,
          existingRegistry: normalizedAppState.columnRegistry ?? null
        });
        const hydratedWorkspaceFiles = await hydrateLatestReportWorkspaceFiles(normalizedAppState.workspaceFiles ?? {});
        const savedSuggestions = ((_e = currentSession.appState.cardEnhancementSuggestions) == null ? void 0 : _e.map((suggestion, idx) => ({
          ...suggestion,
          shortCode: suggestion.shortCode ?? `S${idx + 1}`
        }))) ?? [];
        set({
          ...initialAppState,
          ...normalizedAppState,
          settings: persistedSettings,
          workspaceFiles: hydratedWorkspaceFiles,
          workspaceActionHistory: normalizedAppState.workspaceActionHistory ?? [],
          queryHistory: normalizedAppState.queryHistory ?? [],
          // A persisted "ready" status describes a worker from the
          // previous page lifetime. Workers and in-memory bindings
          // do not survive reload, so force a real rebind below.
          duckDbSessionStatus: createIdleDuckDbSessionStatus(),
          userColumnAnnotations: normalizedAppState.userColumnAnnotations ?? {},
          columnRegistry: restoredColumnRegistry,
          dataPreparationPlan: normalizeDataPreparationPlan(normalizedAppState.dataPreparationPlan),
          pendingClarification: null,
          pendingMutationConfirmation: normalizedAppState.pendingMutationConfirmation ?? null,
          activeTurn: null,
          activeAnalysisSession: normalizedAppState.activeAnalysisSession ?? null,
          latestAnalysisSession: normalizedAppState.latestAnalysisSession ?? null,
          analysisSessionHistory: normalizedAppState.analysisSessionHistory ?? [],
          visibleAnalysisTrace: normalizedAppState.visibleAnalysisTrace ?? [],
          queuedChatTurns: [],
          queuedAgentRuns: [],
          cancelRequestedTurnId: null,
          runtimeEvents: normalizedAppState.runtimeEvents ?? [],
          runtimeRunHistory: normalizedAppState.runtimeRunHistory ?? [],
          initialAnalysisStatus: normalizedAppState.initialAnalysisStatus ?? ((((_f = normalizedAppState.analysisCards) == null ? void 0 : _f.length) ?? 0) > 0 || Boolean(normalizedAppState.finalSummary) ? "ready" : "idle"),
          cleaningRun: normalizedAppState.cleaningRun ? updateCleaningRun(normalizedAppState.cleaningRun, {
            status: normalizedAppState.cleaningRun.status === "completed" ? "completed" : "paused",
            shouldAutoResume: false
          }) : null,
          sessionId: activeSessionId,
          // Ensure ID remains consistent
          reportMemoryScope: restoredMemoryScope,
          agentMemoryRun: restoredMemoryScope ? normalizeSavedAgentMemoryRun(normalizedAppState.agentMemoryRun, restoredMemoryScope) : null,
          liveAgentMemoryRun: restoredMemoryScope ? normalizeSavedAgentMemoryRun(normalizedAppState.liveAgentMemoryRun, restoredMemoryScope) : null,
          agentMemoryHistory: restoredMemoryScope ? normalizeSavedAgentMemoryRuns(normalizedAppState.agentMemoryHistory, restoredMemoryScope) : [],
          pendingVectorMemoryDocs: restoredMemoryScope ? normalizeSavedReportPendingMemoryDocuments(
            normalizedAppState.pendingVectorMemoryDocs,
            restoredMemoryScope
          ) : [],
          agentEvents: restoreAgentActivityHistory(
            normalizedAppState.agentEvents,
            activeSessionId
          ),
          agentToolLogs: normalizedAppState.agentToolLogs ?? [],
          cardEnhancementSuggestions: savedSuggestions,
          activeDataQuery: null,
          activeMetricMappingValidation: normalizeMetricMappingValidationArtifact(normalizedAppState.activeMetricMappingValidation ?? null),
          isCardReviewInProgress: false,
          isBusy: false,
          chatLifecycleState: "idle",
          isGeneratingReport: false,
          isSummaryGenerating: false,
          aiTaskStatus: null,
          goalState: normalizeRestoredGoalState(normalizedAppState.goalState),
          currentView: normalizedAppState.csvData ? "analysis_dashboard" : "file_upload",
          sessionCreatedAt: currentSession.createdAt,
          isApiKeySet: isProviderConfigured(persistedSettings),
          vectorStoreDocuments: []
        });
        chatDebug("Hydrated session state committed.", {
          sessionId: activeSessionId,
          restoredPendingClarification: Boolean(get().pendingClarification),
          restoredPendingClarificationQuestion: ((_g = get().pendingClarification) == null ? void 0 : _g.question) ?? null,
          clearedPersistedClarification,
          activeTurnStatusAfterHydrate: ((_h = get().activeTurn) == null ? void 0 : _h.status) ?? null,
          currentViewAfterHydrate: get().currentView,
          chatHistoryCountAfterHydrate: get().chatHistory.length,
          isBusyAfterHydrate: get().isBusy
        });
        const savedVectorDocs = restoredMemoryScope ? normalizeSavedReportMemoryDocuments(
          normalizedAppState.vectorStoreDocuments ?? [],
          restoredMemoryScope
        ) : [];
        if (Array.isArray(savedVectorDocs) && savedVectorDocs.length > 0 && savedVectorDocs.every((d) => Array.isArray(d.embedding) && d.embedding.length > 0)) {
          await vectorStore.rehydrate(savedVectorDocs);
          set({ vectorStoreDocuments: savedVectorDocs, vectorMemoryState: "queued" });
          get().addProgress("Restored AI long-term memory from the saved session.");
        } else {
          const restoredFromIdb = await vectorStore.loadFromStorage();
          const restoredScopedDocuments = restoredFromIdb && restoredMemoryScope ? await vectorStore.getDocumentsForScope(restoredMemoryScope) : [];
          if (restoredScopedDocuments.length > 0) {
            set({ vectorStoreDocuments: restoredScopedDocuments });
            set({ vectorMemoryState: "queued" });
            get().addProgress("Restored AI long-term memory from local storage.");
          } else {
            void __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.ch), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url).then(
              (m) => m.rebuildVectorMemoryFromState({ getState: get, setState: set }, {
                reset: true,
                includeDatasetDocs: true,
                progressMessage: "Rebuilding AI long-term memory from the restored session..."
              })
            );
          }
        }
        if (normalizedAppState.cleaningRun && normalizedAppState.cleaningRun.status !== "completed") {
          set((prev) => ({
            chatHistory: appendUnfinishedCleaningNotice(prev.chatHistory, "session_restore")
          }));
        }
        if (normalizedAppState.csvData) {
          await get().refreshDuckDbSession();
        } else {
          set({ duckDbSessionStatus: createIdleDuckDbSessionStatus() });
        }
      }
      try {
        localStorage.removeItem("csv_agent_emergency_snapshot");
      } catch {
      }
    } finally {
      set({ isAppInitializing: false });
    }
    if (get().csvData) {
      void Promise.all([
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cp), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
        __vitePreload(() => import("./csv_data_analysis_app-agent-DytoEScF.js").then((n) => n.cg), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
      ]).then(async ([
        { recoverAgrunInitialAnalysisIfNeeded },
        { recoverAgrunFollowUpTurnIfNeeded }
      ]) => {
        const initialOutcome = await recoverAgrunInitialAnalysisIfNeeded(store);
        if (!initialOutcome) {
          await recoverAgrunFollowUpTurnIfNeeded(store);
        }
      }).catch((error) => {
        get().addProgress(
          `Could not resume the interrupted AI run: ${error instanceof Error ? error.message : String(error)}`,
          "error"
        );
      });
    }
    setTimeout(() => {
      const state2 = get();
      if (!state2.isBusy && !state2.isAppInitializing) {
        void state2.loadReportsList();
      }
    }, 500);
  }
}));
configureCloudAiConsentRuntime(() => {
  const state2 = useAppStore.getState();
  return {
    datasetId: state2.currentDatasetId,
    sensitiveDataWarning: detectSensitiveData(state2.rawCsvData ?? state2.csvData),
    requestConsent: state2.requestCloudAiConsent
  };
});
configureLocalDiagnosticContext(() => {
  var _a, _b, _c, _d, _e, _f, _g;
  const state2 = useAppStore.getState();
  const activeStep = (_a = state2.activeTurn) == null ? void 0 : _a.steps.at(-1);
  const cleaningStep = (_b = state2.cleaningRun) == null ? void 0 : _b.steps.at(-1);
  return {
    runId: ((_c = state2.activeTurn) == null ? void 0 : _c.runId) ?? ((_d = state2.activeAnalysisSession) == null ? void 0 : _d.runId) ?? ((_e = state2.cleaningRun) == null ? void 0 : _e.runId) ?? null,
    phase: (cleaningStep == null ? void 0 : cleaningStep.kind) ?? (activeStep == null ? void 0 : activeStep.status) ?? state2.initialAnalysisStatus ?? "unknown",
    attempt: ((_f = state2.cleaningRun) == null ? void 0 : _f.currentStep) ?? ((_g = state2.activeTurn) == null ? void 0 : _g.budgetStatus.stepsUsed) ?? 1,
    tool: (cleaningStep == null ? void 0 : cleaningStep.toolName) ?? ((activeStep == null ? void 0 : activeStep.action) && "toolName" in activeStep.action ? String(activeStep.action.toolName) : activeStep == null ? void 0 : activeStep.action.type) ?? "ai_model"
  };
});
const IconApiKeyRequired = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "w-16 h-16 text-slate-400 mb-4", fill: "none", viewBox: "0 0 24 24", strokeWidth: "1.5", stroke: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" }) });
const IconFileUpload = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "w-16 h-16 text-slate-400 mb-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2z" }) });
const IconLoadingSpinner = (props) => {
  const { className, ...rest } = props;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: `animate-spin ${className || "h-5 w-5"}`, xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", ...rest, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })
  ] });
};
const FileUpload = ({ isWorkspaceRestoring = false }) => {
  const {
    handleFileUpload,
    isBusy,
    isApiKeySet,
    progressMessages,
    aiTaskStatus,
    setIsDebugLogsModalOpen,
    datasetBundle,
    fileName,
    language,
    cleaningRunStatus
  } = useAppStore((state2) => {
    var _a, _b;
    return {
      handleFileUpload: state2.handleFileUpload,
      isBusy: state2.isBusy,
      isApiKeySet: state2.isApiKeySet,
      progressMessages: state2.progressMessages,
      aiTaskStatus: state2.aiTaskStatus,
      setIsDebugLogsModalOpen: state2.setIsDebugLogsModalOpen,
      datasetBundle: state2.datasetBundle,
      fileName: ((_a = state2.csvData) == null ? void 0 : _a.fileName) ?? null,
      language: state2.settings.language,
      cleaningRunStatus: ((_b = state2.cleaningRun) == null ? void 0 : _b.status) ?? null
    };
  }, shallow$1);
  const openDebugLogs = reactExports.useCallback(() => setIsDebugLogsModalOpen(true), [setIsDebugLogsModalOpen]);
  const [dragActive, setDragActive] = reactExports.useState(false);
  const [demoLoadState, setDemoLoadState] = reactExports.useState("idle");
  const DEMO_DATA_URL = "demo-data/singapore-hdb-resale-prices.csv";
  const DEMO_DATA_FILE_NAME = "singapore-hdb-resale-prices.csv";
  const handleLoadDemoData = reactExports.useCallback(async () => {
    if (!isApiKeySet || isBusy || isWorkspaceRestoring) return;
    setDemoLoadState("loading");
    try {
      const response = await fetch(DEMO_DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], DEMO_DATA_FILE_NAME, { type: "text/csv" });
      setDemoLoadState("idle");
      handleFileUpload(file);
    } catch (error) {
      console.error("Failed to load demo dataset:", error);
      setDemoLoadState("error");
    }
  }, [DEMO_DATA_URL, handleFileUpload, isApiKeySet, isBusy, isWorkspaceRestoring]);
  const handleDrag = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isApiKeySet || isWorkspaceRestoring) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, [isApiKeySet, isWorkspaceRestoring]);
  const handleDrop = reactExports.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!isApiKeySet || isWorkspaceRestoring) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, [handleFileUpload, isApiKeySet, isWorkspaceRestoring]);
  const handleChange = (e) => {
    if (!isApiKeySet || isWorkspaceRestoring) return;
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };
  const apiKeyMessage = shouldAllowSettingsSurface() ? getTranslation("api_key_required_settings_message", language) : getTranslation("api_key_required_managed_message", language);
  const allowManualUpload = shouldShowNewSessionButton();
  const latestProgress = progressMessages[progressMessages.length - 1] ?? null;
  const canOpenLogs = shouldAllowLogsSurface();
  const isUploadUnavailable = isBusy || isWorkspaceRestoring;
  const resolveBusyCard = () => {
    if ((latestProgress == null ? void 0 : latestProgress.type) === "error") {
      return {
        title: getTranslation("upload_status_preparing_title", language),
        detail: latestProgress.text,
        tone: "error"
      };
    }
    if (aiTaskStatus && aiTaskStatus.status !== "done" && aiTaskStatus.status !== "error") {
      return {
        title: getTranslation("upload_status_generating_title", language),
        detail: aiTaskStatus.subtitle || getTranslation("upload_status_generating_detail", language),
        tone: "info"
      };
    }
    if (cleaningRunStatus === "running") {
      return {
        title: getTranslation("upload_status_preparing_title", language),
        detail: (latestProgress == null ? void 0 : latestProgress.text) || getTranslation("upload_status_preparing_detail", language),
        tone: "info"
      };
    }
    return {
      title: getTranslation("upload_status_importing_title", language),
      detail: (latestProgress == null ? void 0 : latestProgress.text) || getTranslation("upload_status_importing_detail", language),
      tone: "info"
    };
  };
  if (isBusy && fileName) {
    const busyCard = resolveBusyCard();
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `w-full max-w-2xl rounded-card border p-6 shadow-sm ${busyCard.tone === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50"}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center text-slate-900", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconLoadingSpinner, { className: "mr-3 h-6 w-6" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold", children: busyCard.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-slate-600", children: getTranslation("upload_working_on_file", language, { fileName }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `mt-5 text-sm leading-6 ${busyCard.tone === "error" ? "text-red-700" : "text-slate-600"}`, children: busyCard.detail }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-slate-500", children: getTranslation("data_privacy_note", language) }),
        canOpenLogs && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: openDebugLogs,
            className: "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50",
            children: getTranslation("view_technical_details", language)
          }
        )
      ] })
    ] }) });
  }
  if (!allowManualUpload) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-3xl rounded-card border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-8 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-bold tracking-tight text-slate-900", children: getTranslation("managed_reports_welcome_title", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 max-w-2xl text-base leading-7 text-slate-600", children: getTranslation("managed_reports_welcome_message", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 max-w-2xl text-sm leading-6 text-slate-500", children: getTranslation("managed_reports_welcome_detail", language) })
    ] }) });
  }
  if (!isApiKeySet && !isWorkspaceRestoring) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-card border-slate-300 h-full", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(IconApiKeyRequired, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-semibold text-slate-800", children: getTranslation("api_key_required_title", language) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-sm text-center text-slate-500", children: apiKeyMessage }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-6 text-xs text-slate-400", children: getTranslation("data_privacy_note", language) })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      onDragEnter: handleDrag,
      onDragLeave: handleDrag,
      onDragOver: handleDrag,
      onDrop: handleDrop,
      "aria-busy": isWorkspaceRestoring,
      className: `flex h-full flex-col items-center justify-center rounded-card border-2 border-dashed p-8 transition-colors duration-300 ${isWorkspaceRestoring ? "border-slate-300 bg-slate-50" : dragActive ? "border-blue-500 bg-slate-100" : "border-slate-300 hover:border-blue-500"}`,
      children: [
        isWorkspaceRestoring && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            role: "status",
            "aria-live": "polite",
            className: "mb-6 flex w-full max-w-xl items-start gap-3 rounded-card border border-blue-200 bg-blue-50 p-4 text-left",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(IconLoadingSpinner, { className: "mt-0.5 h-5 w-5 shrink-0 text-blue-600" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-slate-900", children: getTranslation("file_upload_restoring_title", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm leading-6 text-slate-600", children: getTranslation("file_upload_restoring_detail", language) })
              ] })
            ]
          }
        ),
        !isWorkspaceRestoring && (latestProgress == null ? void 0 : latestProgress.type) === "error" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            role: "alert",
            className: "mb-6 w-full max-w-xl rounded-card border border-red-200 bg-red-50 p-4 text-left",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-red-800", children: getTranslation("file_upload_processing_error_title", language) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 break-words text-sm leading-6 text-red-700", children: latestProgress.text })
            ]
          }
        ),
        !isWorkspaceRestoring && datasetBundle && !fileName && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "status", className: "mb-6 w-full max-w-xl rounded-card border border-amber-300 bg-amber-50 p-4 text-left", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-amber-950", children: "Re-select the original CSV to restore this analysis" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-sm leading-6 text-amber-900", children: [
            "History keeps the source fingerprint and transformation lineage, not the CSV rows. Select ",
            datasetBundle.source.fileName,
            "; the app will verify its fingerprint before replaying any transformation."
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconFileUpload, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mb-2 text-2xl font-bold tracking-tight text-slate-900", children: getTranslation("file_upload_title", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-5 max-w-xl text-center text-sm leading-6 text-slate-600", children: getTranslation("file_upload_outcome", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-2 text-lg text-slate-500", children: getTranslation("file_upload_drag_drop", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-slate-600", children: getTranslation("file_upload_or", language) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "label",
          {
            htmlFor: "file-upload",
            "aria-disabled": isUploadUnavailable,
            className: `mt-4 rounded-card px-4 py-2 font-bold text-white transition-colors ${isUploadUnavailable ? "cursor-wait bg-slate-400" : "cursor-pointer bg-blue-600 hover:bg-blue-700"}`,
            children: isWorkspaceRestoring ? getTranslation("file_upload_preparing_action", language) : getTranslation("file_upload_select", language)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { id: "file-upload", type: "file", accept: ".csv", onChange: handleChange, className: "hidden", disabled: isUploadUnavailable }),
        !datasetBundle && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 w-full max-w-sm rounded-card border border-blue-100 bg-blue-50 p-4 text-center", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-600", children: getTranslation("file_upload_load_demo_hint", language) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: handleLoadDemoData,
              disabled: isUploadUnavailable || demoLoadState === "loading",
              className: "mt-3 inline-flex items-center justify-center gap-2 rounded-card border-2 border-blue-600 bg-white px-4 py-2 font-bold text-blue-600 transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60",
              children: [
                demoLoadState === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx(IconLoadingSpinner, { className: "h-4 w-4" }),
                demoLoadState === "loading" ? getTranslation("file_upload_load_demo_loading", language) : getTranslation("file_upload_load_demo", language)
              ]
            }
          ),
          demoLoadState === "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-red-600", children: getTranslation("file_upload_load_demo_error", language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-xs text-slate-500", children: getTranslation("data_privacy_note", language) })
      ]
    }
  );
};
const IconNew = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) });
const IconHistory = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" }) });
const IconShowAssistant = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" }) });
const IconChangeGoal = (props) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z", clipRule: "evenodd" })
] });
const IconCode = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5 mr-2", viewBox: "0 0 20 20", fill: "currentColor", ...props, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fillRule: "evenodd", d: "M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z", clipRule: "evenodd" }) });
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");
const getFocusableElements = (dialog) => Array.from(
  dialog.querySelectorAll(FOCUSABLE_SELECTOR)
).filter(
  (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.closest("[hidden]") === null
);
const useDialogAccessibility = (isOpen, onClose, options) => {
  const dialogRef = reactExports.useRef(null);
  const onCloseRef = reactExports.useRef(onClose);
  onCloseRef.current = onClose;
  reactExports.useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const overlay = dialog.classList.contains("fixed") ? dialog : dialog.parentElement;
    const applicationRoot = overlay == null ? void 0 : overlay.parentElement;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertedSiblings = applicationRoot ? Array.from(applicationRoot.children).filter((element) => element !== overlay).map((element) => {
      const htmlElement = element;
      const wasInert = htmlElement.inert;
      const hadInertAttribute = htmlElement.hasAttribute("inert");
      const previousAriaHidden = htmlElement.getAttribute("aria-hidden");
      htmlElement.inert = true;
      htmlElement.setAttribute("inert", "");
      htmlElement.setAttribute("aria-hidden", "true");
      return { htmlElement, wasInert, hadInertAttribute, previousAriaHidden };
    }) : [];
    const focusInitialElement = () => {
      const preferred = dialog.querySelector("[data-dialog-initial-focus]");
      (preferred ?? getFocusableElements(dialog)[0] ?? dialog).focus();
    };
    const frameId = requestAnimationFrame(focusInitialElement);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      var _a;
      cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", handleKeyDown);
      inertedSiblings.forEach(({ htmlElement, wasInert, hadInertAttribute, previousAriaHidden }) => {
        htmlElement.inert = wasInert;
        if (!hadInertAttribute) {
          htmlElement.removeAttribute("inert");
        }
        if (previousAriaHidden === null) {
          htmlElement.removeAttribute("aria-hidden");
        } else {
          htmlElement.setAttribute("aria-hidden", previousAriaHidden);
        }
      });
      const preferredRestoreTarget = (options == null ? void 0 : options.restoreFocusSelector) ? document.querySelector(options.restoreFocusSelector) : null;
      (_a = preferredRestoreTarget ?? previouslyFocused) == null ? void 0 : _a.focus();
      if (!preferredRestoreTarget && (options == null ? void 0 : options.restoreFocusSelector)) {
        requestAnimationFrame(() => {
          var _a2;
          (_a2 = document.querySelector(options.restoreFocusSelector)) == null ? void 0 : _a2.focus();
        });
      }
    };
  }, [isOpen, options == null ? void 0 : options.restoreFocusSelector]);
  return dialogRef;
};
const AppHeader = () => {
  const primaryButtonClass = "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium leading-none transition-colors md:min-h-0 md:min-w-0 md:py-1.5";
  const secondaryButtonClass = `${primaryButtonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`;
  const {
    onNewSession,
    onOpenHistory,
    onOpenDatabase,
    onOpenWorkflow,
    onOpenLogs,
    isAsideVisible,
    onShowAssistant,
    confirmedAnalysisGoal,
    reproposeAnalysisGoals,
    showAnalysisTools,
    hasPendingRestore,
    language
  } = useAppStore(
    (state2) => {
      var _a;
      return {
        onNewSession: state2.handleNewSession,
        onOpenHistory: () => {
          state2.loadReportsListIfNeeded();
          state2.setIsHistoryPanelOpen(true);
        },
        onOpenDatabase: () => state2.setIsDatabaseModalOpen(true),
        onOpenWorkflow: () => state2.setIsDataPreparationModalOpen(true),
        onOpenLogs: () => state2.setIsDebugLogsModalOpen(true),
        isAsideVisible: state2.isAsideVisible,
        onShowAssistant: () => state2.setIsAsideVisible(true),
        confirmedAnalysisGoal: state2.confirmedAnalysisGoal,
        reproposeAnalysisGoals: state2.reproposeAnalysisGoals,
        showAnalysisTools: Boolean(state2.csvData),
        hasPendingRestore: Boolean(state2.datasetBundle && !state2.csvData),
        language: ((_a = state2.settings) == null ? void 0 : _a.language) ?? "English"
      };
    },
    shallow$1
  );
  const showNewSessionButton = shouldShowNewSessionButton();
  const showHistoryButton = shouldShowHistoryButton();
  const showDatabaseButton = shouldShowDatabaseButton();
  const showWorkflowButton = shouldShowWorkflowButton();
  const showLogsButton = shouldShowLogsButton();
  const showChangeGoalButton = shouldShowChangeGoalButton();
  const showAssistantToggleButton = shouldShowAssistantToggleButton();
  const [isAdvancedOpen, setIsAdvancedOpen] = reactExports.useState(false);
  const [isNewSessionConfirmOpen, setIsNewSessionConfirmOpen] = reactExports.useState(false);
  const advancedRootRef = reactExports.useRef(null);
  const advancedMenuRef = reactExports.useRef(null);
  const advancedButtonRef = reactExports.useRef(null);
  const firstAdvancedItemRef = reactExports.useRef(null);
  const [advancedMenuPosition, setAdvancedMenuPosition] = reactExports.useState({
    left: 12,
    top: 56
  });
  const newSessionDialogRef = useDialogAccessibility(
    isNewSessionConfirmOpen,
    () => setIsNewSessionConfirmOpen(false),
    { restoreFocusSelector: '[data-new-session-trigger="true"]' }
  );
  const showAdvancedMenu = Boolean(
    showAnalysisTools && (showWorkflowButton || showLogsButton || confirmedAnalysisGoal && showChangeGoalButton)
  );
  const updateAdvancedMenuPosition = reactExports.useCallback(() => {
    const trigger = advancedButtonRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const viewportMargin = 12;
    const menuGap = 8;
    const menuWidth = Math.min(288, Math.max(0, window.innerWidth - viewportMargin * 2));
    const maximumLeft = Math.max(viewportMargin, window.innerWidth - menuWidth - viewportMargin);
    const anchoredLeft = triggerRect.right - menuWidth;
    setAdvancedMenuPosition({
      left: Math.min(Math.max(viewportMargin, anchoredLeft), maximumLeft),
      top: Math.max(viewportMargin, triggerRect.bottom + menuGap),
      width: menuWidth
    });
  }, []);
  reactExports.useEffect(() => {
    var _a;
    if (!isAdvancedOpen) return;
    updateAdvancedMenuPosition();
    (_a = firstAdvancedItemRef.current) == null ? void 0 : _a.focus();
    const handlePointerDown = (event) => {
      var _a2, _b;
      const target = event.target;
      if (!((_a2 = advancedRootRef.current) == null ? void 0 : _a2.contains(target)) && !((_b = advancedMenuRef.current) == null ? void 0 : _b.contains(target))) {
        setIsAdvancedOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      var _a2;
      if (event.key === "Escape") {
        event.preventDefault();
        setIsAdvancedOpen(false);
        (_a2 = advancedButtonRef.current) == null ? void 0 : _a2.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateAdvancedMenuPosition);
    window.addEventListener("scroll", updateAdvancedMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateAdvancedMenuPosition);
      window.removeEventListener("scroll", updateAdvancedMenuPosition, true);
    };
  }, [isAdvancedOpen, updateAdvancedMenuPosition]);
  const runAdvancedAction = (action) => {
    setIsAdvancedOpen(false);
    action();
  };
  const confirmNewSession = () => {
    setIsNewSessionConfirmOpen(false);
    void onNewSession();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "header",
      {
        "data-app-header-root": "true",
        className: "flex min-w-0 flex-row flex-nowrap items-center gap-2 overflow-hidden px-0 py-2",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "whitespace-nowrap text-xl font-extrabold leading-tight text-slate-900", children: "AI Analysis" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "nav",
            {
              "aria-label": getTranslation("header_analysis_actions", language),
              className: "ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5 overflow-visible",
              children: [
                showNewSessionButton && (showAnalysisTools || hasPendingRestore) && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: () => setIsNewSessionConfirmOpen(true),
                    "data-new-session-trigger": "true",
                    className: `${primaryButtonClass} bg-blue-600 text-white hover:bg-blue-700`,
                    title: getTranslation("header_new_title", language),
                    "aria-label": getTranslation("header_new", language),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(IconNew, {}),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden lg:inline", children: getTranslation("header_new", language) })
                    ]
                  }
                ),
                showHistoryButton && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: onOpenHistory,
                    "data-history-trigger": "true",
                    className: secondaryButtonClass,
                    title: getTranslation("header_history_title", language),
                    "aria-label": getTranslation("header_history", language),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(IconHistory, {}),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden lg:inline", children: getTranslation("header_history", language) })
                    ]
                  }
                ),
                showDatabaseButton && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: showAnalysisTools ? onOpenDatabase : void 0,
                    "data-data-explorer-trigger": "true",
                    className: `${secondaryButtonClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`,
                    title: getTranslation(
                      showAnalysisTools ? "header_data_explorer_title" : "header_data_explorer_requires_upload",
                      language
                    ),
                    "aria-label": getTranslation("header_data_explorer", language),
                    "aria-disabled": !showAnalysisTools,
                    disabled: !showAnalysisTools,
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(IconCode, { className: "h-5 w-5 m-0" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden md:inline", children: getTranslation("header_data_explorer", language) })
                    ]
                  }
                ),
                showAdvancedMenu && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: advancedRootRef, className: "relative shrink-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      ref: advancedButtonRef,
                      "data-advanced-trigger": "true",
                      type: "button",
                      className: secondaryButtonClass,
                      title: getTranslation("header_advanced_title", language),
                      "aria-label": getTranslation("header_advanced", language),
                      "aria-haspopup": "menu",
                      "aria-expanded": isAdvancedOpen,
                      onClick: () => setIsAdvancedOpen((open) => !open),
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(IconCode, { className: "h-5 w-5 m-0" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden md:inline", children: getTranslation("header_advanced", language) })
                      ]
                    }
                  ),
                  isAdvancedOpen && reactDomExports.createPortal(
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "div",
                      {
                        ref: advancedMenuRef,
                        role: "menu",
                        "aria-label": getTranslation("header_advanced", language),
                        className: "fixed z-50 grid gap-1 rounded-card border border-slate-200 bg-white p-1.5 shadow-xl",
                        style: advancedMenuPosition,
                        children: [
                          showAnalysisTools && showWorkflowButton && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "button",
                            {
                              ref: firstAdvancedItemRef,
                              type: "button",
                              role: "menuitem",
                              onClick: () => runAdvancedAction(onOpenWorkflow),
                              className: "min-h-[44px] rounded-card px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block font-medium", children: getTranslation("header_workflow", language) }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs text-slate-500", children: getTranslation("header_workflow_hint", language) })
                              ]
                            }
                          ),
                          showAnalysisTools && showLogsButton && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "button",
                            {
                              ref: !showWorkflowButton ? firstAdvancedItemRef : void 0,
                              type: "button",
                              role: "menuitem",
                              onClick: () => runAdvancedAction(onOpenLogs),
                              className: "min-h-[44px] rounded-card px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block font-medium", children: getTranslation("header_logs", language) }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-xs text-slate-500", children: getTranslation("header_logs_hint", language) })
                              ]
                            }
                          ),
                          confirmedAnalysisGoal && showChangeGoalButton && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "button",
                            {
                              ref: !(showAnalysisTools && (showWorkflowButton || showLogsButton)) ? firstAdvancedItemRef : void 0,
                              type: "button",
                              role: "menuitem",
                              onClick: () => runAdvancedAction(reproposeAnalysisGoals),
                              className: "flex min-h-[44px] items-center gap-2 rounded-card px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx(IconChangeGoal, {}),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: getTranslation("header_change_goal", language) })
                              ]
                            }
                          )
                        ]
                      }
                    ),
                    document.body
                  )
                ] }),
                !isAsideVisible && showAssistantToggleButton && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: onShowAssistant,
                    "data-mobile-assistant-trigger": "true",
                    className: `${primaryButtonClass} bg-blue-600 text-white hover:bg-blue-700`,
                    "aria-label": getTranslation("header_show_assistant", language),
                    title: getTranslation("header_show_assistant", language),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(IconShowAssistant, {}),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden lg:inline", children: getTranslation("assistant", language) })
                    ]
                  }
                )
              ]
            }
          )
        ]
      }
    ),
    isNewSessionConfirmOpen && reactDomExports.createPortal(
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm",
          onClick: () => setIsNewSessionConfirmOpen(false),
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              ref: newSessionDialogRef,
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "new-session-confirm-title",
              "aria-describedby": "new-session-confirm-description",
              tabIndex: -1,
              className: "w-full max-w-md rounded-card border border-slate-200 bg-white p-5 shadow-2xl",
              onClick: (event) => event.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { id: "new-session-confirm-title", className: "text-lg font-bold text-slate-950", children: getTranslation("new_session_confirm_title", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { id: "new-session-confirm-description", className: "mt-2 text-sm leading-6 text-slate-600", children: getTranslation("new_session_confirm_description", language) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      "data-dialog-initial-focus": true,
                      onClick: () => setIsNewSessionConfirmOpen(false),
                      className: "min-h-[44px] rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50",
                      children: getTranslation("new_session_confirm_cancel", language)
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: confirmNewSession,
                      className: "min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                      children: getTranslation("new_session_confirm_action", language)
                    }
                  )
                ] })
              ]
            }
          )
        }
      ),
      document.body
    )
  ] });
};
const AUTOSAVE_DEBOUNCE_MS = 1500;
const STORAGE_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
const INITIAL_STORAGE_HEALTH_CHECK_DELAY_MS = 5e3;
const AutoSaveManager = () => {
  const lastSavedSignatureRef = reactExports.useRef(null);
  const timeoutRef = reactExports.useRef(null);
  const isSavingRef = reactExports.useRef(false);
  const pendingFlushRef = reactExports.useRef(false);
  const lastSaveErrorRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const flushSave = async () => {
      const state2 = useAppStore.getState();
      const nextSignature = buildPersistedAppStateSignature(state2);
      if (!nextSignature || nextSignature === lastSavedSignatureRef.current) {
        return;
      }
      if (isSavingRef.current) {
        pendingFlushRef.current = true;
        return;
      }
      isSavingRef.current = true;
      try {
        await persistCurrentAppSessionSnapshot(state2);
        lastSavedSignatureRef.current = nextSignature;
        lastSaveErrorRef.current = null;
        if (!state2.sessionCreatedAt) {
          useAppStore.setState({ sessionCreatedAt: /* @__PURE__ */ new Date() });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (lastSaveErrorRef.current !== message) {
          state2.addProgress(`Autosave failed: ${message}`, "error");
          lastSaveErrorRef.current = message;
        }
      } finally {
        isSavingRef.current = false;
        if (pendingFlushRef.current) {
          pendingFlushRef.current = false;
          void flushSave();
        }
      }
    };
    const scheduleSave = (delay = AUTOSAVE_DEBOUNCE_MS) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        void flushSave();
      }, delay);
    };
    const flushImmediately = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      void flushSave();
    };
    const emergencySyncSnapshot = () => {
      var _a;
      try {
        const state2 = useAppStore.getState();
        if (!state2.sessionId || !state2.csvData) return;
        const snapshot = {
          sessionId: state2.sessionId,
          fileName: state2.csvData.fileName,
          currentView: state2.currentView,
          aiTaskStatus: state2.aiTaskStatus,
          initialAnalysisStatus: state2.initialAnalysisStatus,
          goalState: state2.goalState,
          pipelineOutcome: ((_a = state2.pipelineOutcome) == null ? void 0 : _a.status) ?? null,
          cardCount: state2.analysisCards.length,
          chatCount: state2.chatHistory.length,
          savedAt: Date.now()
        };
        localStorage.setItem("csv_agent_emergency_snapshot", JSON.stringify(snapshot));
      } catch {
      }
    };
    lastSavedSignatureRef.current = buildPersistedAppStateSignature(useAppStore.getState());
    const unsubscribe = useAppStore.subscribe((state2) => {
      const nextSignature = buildPersistedAppStateSignature(state2);
      if (!nextSignature || nextSignature === lastSavedSignatureRef.current) {
        return;
      }
      scheduleSave();
    });
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushImmediately();
      }
    };
    const handleBeforeUnload = () => {
      emergencySyncSnapshot();
      flushImmediately();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    const runHealthCheck = async () => {
      const currentState = useAppStore.getState();
      if (currentState.isBusy || currentState.isAppInitializing) return;
      const sessionId = currentState.sessionId;
      const { evictedReports } = await checkStorageHealth(sessionId);
      if (evictedReports > 0) {
        useAppStore.getState().addProgress(
          `Storage cleanup: removed ${evictedReports} old report(s) to free space.`,
          "warning"
        );
      }
    };
    const healthCheckInterval = setInterval(() => {
      void runHealthCheck();
    }, STORAGE_HEALTH_CHECK_INTERVAL_MS);
    const initialHealthCheckTimer = setTimeout(() => {
      void runHealthCheck();
    }, INITIAL_STORAGE_HEALTH_CHECK_DELAY_MS);
    return () => {
      unsubscribe();
      clearInterval(healthCheckInterval);
      clearTimeout(initialHealthCheckTimer);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);
  return null;
};
const listeners$1 = /* @__PURE__ */ new Set();
const seenPayloadIds = /* @__PURE__ */ new Set();
let lastEvent = null;
let initialized$1 = false;
const PENDING_QUERY_KEY = "pendingPayloadKey";
let hasExternalPayloadPending = false;
const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
const sanitizeHeaderForFileName = (raw) => {
  if (!raw) return "";
  const firstLine = raw.split(/\r?\n/)[0] ?? raw;
  return firstLine.trim();
};
const buildEventId = () => createId("csv-event");
const hashCsvPayload = (csv, header) => {
  const input = `${header ?? ""}
${csv}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `csv-payload-${(hash >>> 0).toString(36)}`;
};
const emitEvent = (event) => {
  if (seenPayloadIds.has(event.payloadId)) {
    console.debug("[ExternalCsvBridge] Ignored duplicate external CSV payload.", {
      payloadId: event.payloadId,
      transport: event.meta.transport
    });
    return;
  }
  seenPayloadIds.add(event.payloadId);
  lastEvent = event;
  listeners$1.forEach((listener) => listener(event));
};
const normalizePayload = (data, transport, pendingKey) => {
  if (!data || typeof data !== "object") return null;
  if (data.type !== "table_csv") return null;
  if (typeof data.csv !== "string" || !data.csv.trim()) return null;
  const payloadId = typeof data.payloadId === "string" && data.payloadId.trim() ? data.payloadId.trim() : hashCsvPayload(data.csv, typeof data.header === "string" ? data.header : void 0);
  return {
    payload: {
      csv: data.csv,
      header: typeof data.header === "string" ? sanitizeHeaderForFileName(data.header) : void 0
    },
    payloadId,
    meta: {
      transport,
      receivedAt: Date.now(),
      pendingKey
    },
    eventId: buildEventId()
  };
};
const recoverSessionPayload = (pendingKey) => {
  if (!isBrowser) return null;
  const stores = [];
  try {
    if (window.sessionStorage) stores.push([window.sessionStorage, "sessionStorage"]);
  } catch {
  }
  try {
    if (window.localStorage) stores.push([window.localStorage, "localStorage"]);
  } catch {
  }
  for (const [store, transport] of stores) {
    try {
      const raw = store.getItem(pendingKey);
      if (!raw) continue;
      store.removeItem(pendingKey);
      const parsed = JSON.parse(raw);
      const event = normalizePayload(parsed, transport, pendingKey);
      if (event) return event;
    } catch (error) {
      console.error(`[ExternalCsvBridge] Failed to recover payload from ${transport}:`, error);
    }
  }
  return null;
};
const notifyOpenerReady = () => {
  if (!isBrowser) return;
  const targetOrigin = window.location.origin;
  if (!window.opener || window.opener === window) return;
  try {
    window.opener.postMessage({ type: "ready" }, targetOrigin);
  } catch (error) {
    console.warn("[ExternalCsvBridge] Unable to notify opener about readiness:", error);
  }
};
const handlePostMessage = (event) => {
  if (!isBrowser) return;
  if (event.origin !== window.location.origin) return;
  const normalized = normalizePayload(event.data, "postMessage");
  if (normalized) {
    emitEvent(normalized);
  }
};
const removePendingQueryParam = () => {
  if (!isBrowser) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PENDING_QUERY_KEY)) return;
  url.searchParams.delete(PENDING_QUERY_KEY);
  const newUrl = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
  window.history.replaceState({}, document.title, newUrl);
};
const initExternalCsvBridge = () => {
  if (!isBrowser || initialized$1) return;
  initialized$1 = true;
  const params = new URLSearchParams(window.location.search);
  const pendingKey = params.get(PENDING_QUERY_KEY);
  let recoveredFromStorage = false;
  if (pendingKey) {
    hasExternalPayloadPending = true;
    const sessionEvent = recoverSessionPayload(pendingKey);
    if (sessionEvent) {
      recoveredFromStorage = true;
      emitEvent(sessionEvent);
    } else {
      console.warn("[ExternalCsvBridge] Pending payload key found but no data restored.");
    }
    removePendingQueryParam();
  }
  if (!recoveredFromStorage) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      notifyOpenerReady();
    } else {
      window.addEventListener("DOMContentLoaded", notifyOpenerReady, { once: true });
    }
    window.addEventListener("message", handlePostMessage);
  }
};
const subscribeToExternalCsvPayload = (listener) => {
  listeners$1.add(listener);
  if (lastEvent) {
    listener(lastEvent);
  }
  return () => {
    listeners$1.delete(listener);
  };
};
const externalCsvBridge = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get hasExternalPayloadPending() {
    return hasExternalPayloadPending;
  },
  initExternalCsvBridge,
  subscribeToExternalCsvPayload
}, Symbol.toStringTag, { value: "Module" }));
const ExternalPayloadListener = () => {
  const ingestExternalCsvPayload = useAppStore((state2) => state2.ingestExternalCsvPayload);
  const isAppInitializing = useAppStore((state2) => state2.isAppInitializing);
  const processedPayloadIdsRef = reactExports.useRef(/* @__PURE__ */ new Set());
  reactExports.useEffect(() => {
    if (!ingestExternalCsvPayload) return;
    if (hasExternalPayloadPending && isAppInitializing) return;
    const unsubscribe = subscribeToExternalCsvPayload((event) => {
      const processedPayloadIds = processedPayloadIdsRef.current;
      if (processedPayloadIds.has(event.payloadId)) return;
      processedPayloadIds.add(event.payloadId);
      ingestExternalCsvPayload(event);
    });
    return () => {
      unsubscribe();
    };
  }, [ingestExternalCsvPayload, isAppInitializing]);
  return null;
};
const IconWarning = ({ className }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        d: "M12 9v4m0 4h.01M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    )
  }
);
class ErrorBoundary extends We.Component {
  constructor() {
    super(...arguments);
    this.state = {
      hasError: false
    };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      const { language } = this.props;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-red-50 border border-red-200 rounded-card p-4 shadow-sm text-red-800", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(IconWarning, { className: "w-5 h-5 mr-2" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-sm uppercase tracking-wide", children: getTranslation("error_boundary_title", language) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: getTranslation("error_boundary_message", language) }),
        this.state.error && /* @__PURE__ */ jsxRuntimeExports.jsxs("pre", { className: "mt-2 text-xs bg-red-100 p-2 rounded overflow-auto", children: [
          this.state.error.name,
          ": ",
          this.state.error.message
        ] })
      ] });
    }
    return this.props.children;
  }
}
const SCROLL_DELTA_THRESHOLD = 10;
const TOP_REVEAL_THRESHOLD = 12;
const useAutoHideHeader = ({
  scrollContainerRef
}) => {
  const headerRef = reactExports.useRef(null);
  const lastScrollTopRef = reactExports.useRef(0);
  const forcedHiddenTimeoutRef = reactExports.useRef(null);
  const [headerHeight, setHeaderHeight] = reactExports.useState(0);
  const [isHeaderHidden, setIsHeaderHidden] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement) {
      return;
    }
    const updateHeaderHeight = () => {
      setHeaderHeight(headerElement.getBoundingClientRect().height);
    };
    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(() => {
      updateHeaderHeight();
    });
    resizeObserver.observe(headerElement);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  reactExports.useEffect(() => {
    const handleTemporaryHide = (event) => {
      var _a;
      const customEvent = event;
      const durationMs = ((_a = customEvent.detail) == null ? void 0 : _a.durationMs) ?? 1200;
      if (forcedHiddenTimeoutRef.current !== null) {
        window.clearTimeout(forcedHiddenTimeoutRef.current);
      }
      setIsHeaderHidden(true);
      forcedHiddenTimeoutRef.current = window.setTimeout(() => {
        setIsHeaderHidden(false);
        forcedHiddenTimeoutRef.current = null;
      }, durationMs);
    };
    window.addEventListener(APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, handleTemporaryHide);
    return () => {
      window.removeEventListener(APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT, handleTemporaryHide);
      if (forcedHiddenTimeoutRef.current !== null) {
        window.clearTimeout(forcedHiddenTimeoutRef.current);
      }
    };
  }, []);
  reactExports.useEffect(() => {
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) {
      return;
    }
    const onScroll = () => {
      const scrollTop = scrollElement.scrollTop;
      const delta = scrollTop - lastScrollTopRef.current;
      if (forcedHiddenTimeoutRef.current !== null) {
        lastScrollTopRef.current = scrollTop;
        return;
      }
      if (scrollTop <= TOP_REVEAL_THRESHOLD) {
        setIsHeaderHidden(false);
        lastScrollTopRef.current = scrollTop;
        return;
      }
      if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) {
        return;
      }
      if (delta > 0 && scrollTop > headerHeight) {
        setIsHeaderHidden(true);
      } else if (delta < 0) {
        setIsHeaderHidden(false);
      }
      lastScrollTopRef.current = scrollTop;
    };
    lastScrollTopRef.current = scrollElement.scrollTop;
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
    };
  }, [headerHeight, scrollContainerRef]);
  return {
    headerRef,
    headerHeight,
    isHeaderHidden
  };
};
const STALE_CHUNK_RELOAD_KEY = "csv-data-analysis:stale-chunk-reload";
const RELOAD_COOLDOWN_MS = 15e3;
function readReloadMarker(storage) {
  try {
    const raw = storage.getItem(STALE_CHUNK_RELOAD_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed.href !== "string" || typeof parsed.at !== "number") {
      return null;
    }
    return { href: parsed.href, at: parsed.at };
  } catch {
    return null;
  }
}
function writeReloadMarker(storage, href, now) {
  try {
    storage.setItem(STALE_CHUNK_RELOAD_KEY, JSON.stringify({ href, at: now }));
  } catch {
  }
}
function readErrorMessage(reason) {
  if (typeof reason === "string") {
    return reason;
  }
  if (!reason || typeof reason !== "object") {
    return "";
  }
  if ("message" in reason && typeof reason.message === "string") {
    return reason.message;
  }
  if ("reason" in reason) {
    return readErrorMessage(reason.reason);
  }
  if ("payload" in reason) {
    return readErrorMessage(reason.payload);
  }
  if ("detail" in reason) {
    return readErrorMessage(reason.detail);
  }
  return "";
}
function isRecoverableChunkLoadError(reason) {
  const message = readErrorMessage(reason).trim();
  if (!message) {
    return false;
  }
  return message.includes("Failed to fetch dynamically imported module") || message.includes("Importing a module script failed") || message.includes("ChunkLoadError") || message.includes("Loading chunk");
}
function shouldReloadForStaleChunk(storage, href, now) {
  const lastReload = readReloadMarker(storage);
  if (lastReload && lastReload.href === href && now - lastReload.at < RELOAD_COOLDOWN_MS) {
    return false;
  }
  writeReloadMarker(storage, href, now);
  return true;
}
function installStaleChunkRecovery(targetWindow = window) {
  const recover = (reason) => {
    if (!isRecoverableChunkLoadError(reason)) {
      return;
    }
    const canReload = shouldReloadForStaleChunk(
      targetWindow.sessionStorage,
      targetWindow.location.href,
      Date.now()
    );
    if (!canReload) {
      console.error("Dynamic import failed after a recent stale chunk reload attempt.", reason);
      return;
    }
    targetWindow.location.reload();
  };
  const handlePreloadError = (event) => {
    var _a;
    const preloadEvent = event;
    const payload = preloadEvent.payload ?? preloadEvent.detail;
    if (!isRecoverableChunkLoadError(payload)) {
      return;
    }
    (_a = event.preventDefault) == null ? void 0 : _a.call(event);
    recover(payload);
  };
  const handleUnhandledRejection = (event) => {
    if (!isRecoverableChunkLoadError(event.reason)) {
      return;
    }
    event.preventDefault();
    recover(event.reason);
  };
  targetWindow.addEventListener("vite:preloadError", handlePreloadError);
  targetWindow.addEventListener("unhandledrejection", handleUnhandledRejection);
  return () => {
    targetWindow.removeEventListener("vite:preloadError", handlePreloadError);
    targetWindow.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}
const GlobalErrorToast = ({
  toast,
  language,
  onDismiss,
  onStartOver
}) => {
  const [isDetailExpanded, setIsDetailExpanded] = reactExports.useState(false);
  const handleDismiss = () => {
    setIsDetailExpanded(false);
    onDismiss();
  };
  const handleStartOver = () => {
    setIsDetailExpanded(false);
    onStartOver();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      role: "alert",
      "aria-live": "assertive",
      className: "fixed bottom-4 right-4 z-[9999] w-80 rounded-lg border border-amber-300 bg-amber-50 shadow-lg p-4",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-amber-900 leading-snug flex-1", children: toast.message }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleDismiss,
              className: "shrink-0 text-amber-600 hover:text-amber-900 text-lg leading-none",
              "aria-label": "close",
              children: "×"
            }
          )
        ] }),
        toast.errorSummary && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setIsDetailExpanded((v) => !v),
            className: "mt-1 text-xs text-amber-600 hover:underline",
            children: getTranslation(isDetailExpanded ? "error_detail_hide" : "error_detail_show", language)
          }
        ),
        isDetailExpanded && toast.errorSummary && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "mt-1 text-xs bg-amber-100 rounded p-2 overflow-auto max-h-24 text-amber-800 whitespace-pre-wrap break-all", children: toast.errorSummary }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleStartOver,
              className: "flex-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700",
              children: getTranslation("global_error_restart_button", language)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleDismiss,
              className: "flex-1 rounded border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100",
              children: getTranslation("global_error_dismiss_button", language)
            }
          )
        ] })
      ]
    }
  );
};
let state = {
  status: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "idle",
  isOnline: typeof navigator === "undefined" || navigator.onLine !== false,
  version: null,
  storageUsageBytes: null,
  storageQuotaBytes: null
};
let registration = null;
let initialized = false;
let reloadOnControllerChange = false;
const listeners = /* @__PURE__ */ new Set();
const emit = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};
const getPwaLifecycleState = () => state;
const subscribePwaLifecycle = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const refreshPwaStorageEstimate = async () => {
  var _a, _b;
  try {
    const estimate = await ((_b = (_a = navigator.storage) == null ? void 0 : _a.estimate) == null ? void 0 : _b.call(_a));
    emit({
      storageUsageBytes: (estimate == null ? void 0 : estimate.usage) ?? null,
      storageQuotaBytes: (estimate == null ? void 0 : estimate.quota) ?? null
    });
  } catch {
    emit({ storageUsageBytes: null, storageQuotaBytes: null });
  }
};
const markWaitingWorker = (worker) => {
  if (!navigator.serviceWorker.controller) {
    emit({ status: state.isOnline ? "ready" : "offline" });
    worker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  emit({ status: state.isOnline ? "update_available" : "offline" });
};
const registerPwa = async () => {
  var _a;
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    emit({ status: "unsupported" });
    return;
  }
  const handleOnline = () => emit({ isOnline: true, status: (registration == null ? void 0 : registration.waiting) ? "update_available" : "ready" });
  const handleOffline = () => emit({ isOnline: false, status: "offline" });
  const handleControllerChange = () => {
    if (reloadOnControllerChange) window.location.reload();
  };
  const handleMessage = (event) => {
    var _a2;
    if (((_a2 = event.data) == null ? void 0 : _a2.type) === "PWA_VERSION") emit({ version: String(event.data.version) });
  };
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  navigator.serviceWorker.addEventListener("message", handleMessage);
  try {
    const workerUrl = new URL("service-worker.js", document.baseURI);
    registration = await navigator.serviceWorker.register(workerUrl.toString(), {
      scope: new URL("./", workerUrl).pathname
    });
    if (registration.waiting) markWaitingWorker(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const installing = registration == null ? void 0 : registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") markWaitingWorker(installing);
      });
    });
    (_a = registration.active) == null ? void 0 : _a.postMessage({ type: "GET_VERSION" });
    if (!registration.waiting) emit({ status: state.isOnline ? "ready" : "offline" });
    await refreshPwaStorageEstimate();
  } catch {
    emit({ status: state.isOnline ? "error" : "offline" });
  }
};
const applyPwaUpdate = async () => {
  if (!registration) return false;
  if (!registration.waiting) await registration.update();
  if (!registration.waiting) return false;
  reloadOnControllerChange = true;
  emit({ status: "applying_update" });
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
};
const usePwaLifecycle = () => reactExports.useSyncExternalStore(
  subscribePwaLifecycle,
  getPwaLifecycleState,
  getPwaLifecycleState
);
const PwaStatusBanner = () => {
  const { language, isRunActive } = useAppStore((state2) => {
    var _a;
    return {
      language: state2.settings.language,
      isRunActive: state2.isBusy || state2.initialAnalysisStatus === "running" || ((_a = state2.activeTurn) == null ? void 0 : _a.status) === "running" || state2.isGeneratingReport || state2.isSummaryGenerating
    };
  }, shallow$1);
  const pwa = usePwaLifecycle();
  const [applyFailed, setApplyFailed] = reactExports.useState(false);
  if (pwa.status === "offline") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "status", "aria-live": "polite", className: "fixed inset-x-3 top-3 z-[80] mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "font-semibold", children: getTranslation("pwa_offline_title", language) }),
      " ",
      getTranslation("pwa_offline_detail", language)
    ] });
  }
  if (pwa.status !== "update_available" && pwa.status !== "applying_update") return null;
  const handleApply = async () => {
    setApplyFailed(false);
    if (!await applyPwaUpdate()) setApplyFailed(true);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { role: "status", "aria-live": "polite", className: "fixed inset-x-3 top-3 z-[80] mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 shadow-lg sm:flex-row sm:items-center sm:justify-between", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "font-semibold", children: getTranslation("pwa_update_title", language) }),
      " ",
      getTranslation(
        isRunActive ? "pwa_update_after_run" : "pwa_update_detail",
        language
      ),
      applyFailed && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { role: "alert", className: "mt-1 text-red-800", children: getTranslation("pwa_update_error", language) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => void handleApply(),
        disabled: isRunActive || pwa.status === "applying_update",
        className: "min-h-[44px] shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
        children: getTranslation(
          pwa.status === "applying_update" ? "pwa_update_applying" : "pwa_update_action",
          language
        )
      }
    )
  ] });
};
const ChatPanel = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_ChatPanel-vrqHZ0-b.js"), true ? __vite__mapDeps([5,6,7,0,1,2,3,4,8,9,10,11,12,13]) : void 0, import.meta.url).then((m) => ({ default: m.ChatPanel })));
const AnalysisPanel = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_AnalysisPanel-CkBOuQ3L.js"), true ? __vite__mapDeps([14,6,7,10,8,9,0,1,2,3,4,15,16,17,18,19,20,11]) : void 0, import.meta.url).then((m) => ({ default: m.AnalysisPanel })));
const SpreadsheetPanel = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_SpreadsheetPanel-OhyWDqNn.js"), true ? __vite__mapDeps([21,6,17,9,0,1,2,3,4,16,13,20,7,18,10]) : void 0, import.meta.url).then((m) => ({ default: m.SpreadsheetPanel })));
const SettingsModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_SettingsModal-D8B1HDw5.js"), true ? __vite__mapDeps([22,6,7,0,1,2,3,4]) : void 0, import.meta.url).then((module) => ({ default: module.SettingsModal })));
const HistoryPanel = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_HistoryPanel-MKT2jDTR.js"), true ? __vite__mapDeps([23,6,7,0,1,2,3,4,16]) : void 0, import.meta.url).then((module) => ({ default: module.HistoryPanel })));
const MemoryPanel = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_MemoryPanel-DvzFwn3R.js"), true ? __vite__mapDeps([24,6,0,1,2,3,4,16,12,7]) : void 0, import.meta.url).then((module) => ({ default: module.MemoryPanel })));
const AgentMonitorModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_AgentMonitorModal-CUnWcB6K.js"), true ? __vite__mapDeps([25,6,7,16,19,20,11,0,1,2,3,4,26]) : void 0, import.meta.url).then((module) => ({ default: module.AgentMonitorModal })));
const DatabaseModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_DatabaseModal-CLuwnKwA.js"), true ? __vite__mapDeps([27,6,7,17,9,0,1,2,3,4,16]) : void 0, import.meta.url).then((module) => ({ default: module.DatabaseModal })));
const WorkspaceModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_WorkspaceModal-CKQ65e1W.js"), true ? __vite__mapDeps([28,0,1,2,3,4,6,7,16]) : void 0, import.meta.url).then((module) => ({ default: module.WorkspaceModal })));
const DataPreparationWorkflowModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_DataPreparationWorkflowModal-BUhaUGvB.js"), true ? __vite__mapDeps([29,6,7,0,1,2,3,4,30,16,26,15]) : void 0, import.meta.url).then((module) => ({ default: module.DataPreparationWorkflowModal })));
const DebugLogsModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_DebugLogsModal-ByHTXZkr.js"), true ? __vite__mapDeps([31,6,7,0,1,2,3,4,30,16]) : void 0, import.meta.url).then((module) => ({ default: module.DebugLogsModal })));
const ReportBoundaryConfirmModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_ReportBoundaryConfirmModal-BWcnLoqL.js"), true ? __vite__mapDeps([32,6,0,1,2,3,4,7]) : void 0, import.meta.url).then((module) => ({ default: module.ReportBoundaryConfirmModal })));
const ApiKeyRequiredModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_ApiKeyRequiredModal-BinkYOhc.js"), true ? __vite__mapDeps([33,6,0,1,2,3,4,7]) : void 0, import.meta.url).then((module) => ({ default: module.ApiKeyRequiredModal })));
const CloudAiConsentModal = reactExports.lazy(() => __vitePreload(() => import("./csv_data_analysis_CloudAiConsentModal-DBLQcV0O.js"), true ? __vite__mapDeps([34,6,7,0,1,2,3,4]) : void 0, import.meta.url).then((module) => ({ default: module.CloudAiConsentModal })));
const SpreadsheetPanelGate = We.memo(({ isVisible }) => {
  const isPipelineActive = useAppStore((state2) => {
    const task = state2.aiTaskStatus;
    const isTaskRunning = Boolean(task && task.status !== "done" && task.status !== "error");
    const isSummaryPending = state2.analysisCards.length > 0 && !state2.finalSummary;
    return isTaskRunning || isSummaryPending;
  });
  const prevActiveRef = reactExports.useRef(isPipelineActive);
  reactExports.useEffect(() => {
    if (prevActiveRef.current && !isPipelineActive) {
      useAppStore.getState().setIsSpreadsheetVisible(false);
    }
    prevActiveRef.current = isPipelineActive;
  }, [isPipelineActive]);
  if (isPipelineActive) {
    return null;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SpreadsheetPanel, { isVisible }, "spreadsheet");
});
const App = () => {
  const {
    init,
    currentView,
    csvData,
    isAppInitializing,
    isAsideVisible,
    asideWidth,
    isResizing,
    handleAsideMouseDown,
    isSpreadsheetVisible,
    resultsViewMode,
    isSettingsModalOpen,
    isHistoryPanelOpen,
    isDatabaseModalOpen,
    isWorkspaceModalOpen,
    isDataPreparationModalOpen,
    isDebugLogsModalOpen,
    isMemoryPanelOpen,
    isAgentModalOpen,
    isReportBoundaryConfirmModalOpen,
    isApiKeyRequiredModalOpen,
    pendingCloudAiConsent,
    language,
    globalErrorToast,
    setGlobalErrorToast
  } = useAppStore(
    (state2) => ({
      init: state2.init,
      currentView: state2.currentView,
      csvData: state2.csvData,
      isAppInitializing: state2.isAppInitializing,
      isAsideVisible: state2.isAsideVisible,
      asideWidth: state2.asideWidth,
      isResizing: state2.isResizing,
      handleAsideMouseDown: state2.handleAsideMouseDown,
      isSpreadsheetVisible: state2.isSpreadsheetVisible,
      resultsViewMode: state2.resultsViewMode ?? "simple",
      isSettingsModalOpen: state2.isSettingsModalOpen,
      isHistoryPanelOpen: state2.isHistoryPanelOpen,
      isDatabaseModalOpen: state2.isDatabaseModalOpen,
      isWorkspaceModalOpen: state2.isWorkspaceModalOpen,
      isDataPreparationModalOpen: state2.isDataPreparationModalOpen,
      isDebugLogsModalOpen: state2.isDebugLogsModalOpen,
      isMemoryPanelOpen: state2.isMemoryPanelOpen,
      isAgentModalOpen: state2.isAgentModalOpen,
      isReportBoundaryConfirmModalOpen: state2.isReportBoundaryConfirmModalOpen,
      isApiKeyRequiredModalOpen: state2.isApiKeyRequiredModalOpen,
      pendingCloudAiConsent: state2.pendingCloudAiConsent,
      language: state2.settings.language,
      globalErrorToast: state2.globalErrorToast,
      setGlobalErrorToast: state2.setGlobalErrorToast
    }),
    shallow$1
  );
  const setIsAsideVisible = useAppStore((state2) => state2.setIsAsideVisible);
  const handleNewSession = useAppStore((state2) => state2.handleNewSession);
  const logTelemetryEvent = useAppStore((state2) => state2.logTelemetryEvent);
  const [isMobileLayout, setIsMobileLayout] = reactExports.useState(false);
  const mobileAssistantRef = useDialogAccessibility(
    isMobileLayout && isAsideVisible,
    () => setIsAsideVisible(false),
    { restoreFocusSelector: '[data-mobile-assistant-trigger="true"]' }
  );
  reactExports.useEffect(() => {
    void init();
  }, [init]);
  reactExports.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileLayout(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  reactExports.useEffect(() => {
    const handleUnhandledRejection = (event) => {
      if (isRecoverableChunkLoadError(event.reason)) return;
      const userError = formatUserError(event.reason, { surface: "general", language });
      console.error("[App] Unhandled promise rejection caught by global error boundary:", event.reason);
      logTelemetryEvent({
        stage: "executor_error",
        responseType: "unhandled_rejection",
        detail: userError.technicalDetail
      });
      setGlobalErrorToast({
        // Combine message + suggestion so the toast body is complete
        message: userError.fullText,
        errorSummary: userError.technicalDetail
      });
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, [language, logTelemetryEvent, setGlobalErrorToast]);
  const showAgentThinking = shouldShowAgentThinkingModal();
  const showLongTermMemory = shouldShowLongTermMemory();
  const canUseSettingsSurface = shouldAllowSettingsSurface();
  const canUseDatabaseSurface = shouldAllowDatabaseSurface();
  const canUseWorkspaceSurface = shouldAllowWorkspaceSurface();
  const canUseWorkflowSurface = shouldAllowWorkflowSurface();
  const canUseLogsSurface = shouldAllowLogsSurface();
  const canUseAgentThinkingSurface = shouldAllowAgentThinkingSurface();
  const canUseLongTermMemorySurface = shouldAllowLongTermMemorySurface();
  const scrollContainerRef = reactExports.useRef(null);
  const { headerRef, headerHeight, isHeaderHidden } = useAutoHideHeader({ scrollContainerRef });
  const renderMainContent = () => {
    if (currentView === "file_upload" || !csvData) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileUpload, { isWorkspaceRestoring: isAppInitializing }) });
    }
    if (isAppInitializing) {
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center text-slate-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconLoadingSpinner, { className: "mr-2" }),
        " Restoring workspace..."
      ] }) });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorBoundary, { language, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-64 items-center justify-center", role: "status", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center text-slate-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconLoadingSpinner, { className: "mr-2" }),
        " Loading analysis workspace..."
      ] }) }), children: /* @__PURE__ */ jsxRuntimeExports.jsx(AnalysisPanel, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: null, children: resultsViewMode === "explore" && /* @__PURE__ */ jsxRuntimeExports.jsx(SpreadsheetPanelGate, { isVisible: isSpreadsheetVisible }) }) })
    ] }) });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalPayloadListener, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AutoSaveManager, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(PwaStatusBanner, {}),
    globalErrorToast && /* @__PURE__ */ jsxRuntimeExports.jsx(
      GlobalErrorToast,
      {
        toast: globalErrorToast,
        language,
        onDismiss: () => setGlobalErrorToast(null),
        onStartOver: () => {
          setGlobalErrorToast(null);
          void handleNewSession();
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Suspense, { fallback: null, children: [
      canUseSettingsSurface && isSettingsModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsModal, {}),
      showAgentThinking && canUseAgentThinkingSurface && isAgentModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(AgentMonitorModal, {}),
      isHistoryPanelOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(HistoryPanel, {}),
      canUseDatabaseSurface && isDatabaseModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(DatabaseModal, {}),
      canUseWorkspaceSurface && isWorkspaceModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(WorkspaceModal, {}),
      canUseWorkflowSurface && isDataPreparationModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(DataPreparationWorkflowModal, {}),
      isReportBoundaryConfirmModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(ReportBoundaryConfirmModal, {}),
      isApiKeyRequiredModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(ApiKeyRequiredModal, {}),
      pendingCloudAiConsent && /* @__PURE__ */ jsxRuntimeExports.jsx(CloudAiConsentModal, {}),
      canUseLogsSurface && isDebugLogsModalOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(DebugLogsModal, {}),
      showLongTermMemory && canUseLongTermMemorySurface && isMemoryPanelOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(MemoryPanel, {})
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "main",
      {
        className: "relative flex flex-1 flex-col overflow-hidden px-4 pb-4 pt-0",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            id: "app-main-scroll-container",
            ref: scrollContainerRef,
            className: "min-h-0 flex-1 overflow-y-auto",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  ref: headerRef,
                  className: "sticky top-0 z-20 bg-slate-50 pb-4 transition-transform duration-200",
                  style: { transform: isHeaderHidden ? `translateY(-${headerHeight}px)` : "translateY(0)" },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(AppHeader, {})
                }
              ),
              renderMainContent()
            ]
          }
        )
      }
    ),
    isAsideVisible && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          onMouseDown: handleAsideMouseDown,
          onDoubleClick: () => setIsAsideVisible(false),
          className: "hidden md:flex group items-center justify-center w-2.5 cursor-col-resize",
          title: "Drag to resize, double-click to hide",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: `w-0.5 h-8 bg-slate-300 rounded-full transition-colors duration-200 group-hover:bg-brand-secondary ${isResizing ? "!bg-blue-600" : ""}`
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "aside",
        {
          ref: mobileAssistantRef,
          role: isMobileLayout ? "dialog" : "complementary",
          "aria-modal": isMobileLayout ? "true" : void 0,
          "aria-label": isMobileLayout ? getTranslation("assistant", language) : void 0,
          className: "fixed inset-0 z-40 flex h-[100dvh] w-full flex-col border-l border-slate-200 bg-white md:static md:z-auto md:h-full md:w-[var(--aside-width)]",
          style: { "--aside-width": `${asideWidth}px` },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: null, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChatPanel, {}) })
        }
      )
    ] })
  ] });
};
initExternalCsvBridge();
installStaleChunkRecovery();
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
const root = ReactDOM.createRoot(rootElement);
root.render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(We.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(App, {}) })
);
{
  void registerPwa();
}
export {
  ErrorBoundary as E,
  IconChangeGoal as I,
  IconWarning as a,
  computeDataContentHash as b,
  computeChartCacheKey as c,
  useDialogAccessibility as d,
  IconLoadingSpinner as e,
  usePwaLifecycle as f,
  getCachedChart as g,
  IconApiKeyRequired as h,
  refreshPwaStorageEstimate as r,
  setCachedChart as s,
  useAppStore as u
};
