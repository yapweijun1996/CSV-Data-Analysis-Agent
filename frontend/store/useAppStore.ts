
import { createWithEqualityFn } from 'zustand/traditional';
import { Report, AppState, ReportListItem, MetricMappingValidationArtifact } from '../types';
import { getReport, getDefaultSettings, getSettings } from '../services/storageService';
import { vectorStore } from '../services/vectorStore';
import {
    appendUnfinishedCleaningNotice,
    normalizeRestoredAppState,
    normalizeRestoredGoalState,
} from '../utils/messageState';

import { createUISlice, IUISlice } from './slices/uiSlice';
import { createSettingsSlice, ISettingsSlice } from './slices/settingsSlice';
import { createHistorySlice, IHistorySlice } from './slices/historySlice';
import { createCardSlice, ICardSlice } from './slices/cardSlice';
import { createDataSlice, IDataSlice } from './slices/dataSlice';
import { createChatSlice, IChatSlice } from './slices/chatSlice';
import { createTelemetrySlice, ITelemetrySlice } from './slices/telemetrySlice';
import { createAgentSlice, IAgentSlice } from './slices/agentSlice';
import { createIdleDuckDbSessionStatus } from '../services/duckdb/sessionStatus';
import { restoreAgentActivityHistory } from '../services/agent/activity/agentActivity';
import { normalizeAppLanguage } from '../utils/localizedText';
import { createAndStoreTabSessionId, generateSessionId, readTabSessionId } from './sessionLifecycle';
import { hydrateLatestReportWorkspaceFiles } from '../services/reporting/reportArtifactStorage';
import { buildColumnRegistry } from '../services/data/columnRegistry';
import {
    normalizeSavedAgentMemoryRun,
    normalizeSavedAgentMemoryRuns,
    normalizeSavedReportMemoryDocuments,
    normalizeSavedReportPendingMemoryDocuments,
    resolveReportMemoryScope,
} from '../services/agent/memory/memoryScope';
import { configureCloudAiConsentRuntime } from '../services/privacy/cloudAiConsent';
import { detectSensitiveData } from '../services/privacy/sensitiveDataDetector';
import { configureLocalDiagnosticContext } from '../services/observability/localDiagnostics';

/**
 * Yield to the browser's main thread by scheduling a new macro-task via
 * MessageChannel (same technique React Scheduler uses). This lets the browser
 * process input events, paint, and run higher-priority work between chunks of
 * our JavaScript.
 */
const yieldToMainThread = (): Promise<void> =>
    new Promise(resolve => {
        if (typeof MessageChannel !== 'undefined') {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => resolve();
            ch.port2.postMessage(undefined);
        } else {
            setTimeout(resolve, 0);
        }
    });

const CHAT_DEBUG_ENABLED = import.meta.env.DEV;
const chatDebug = (message: string, detail?: unknown) => {
    if (!CHAT_DEBUG_ENABLED) return;
    if (detail === undefined) {
        console.debug(`[ChatDebug] ${message}`);
        return;
    }
    console.debug(`[ChatDebug] ${message}`, detail);
};

const normalizeMetricMappingValidationArtifact = (
    value: MetricMappingValidationArtifact | null | undefined,
): MetricMappingValidationArtifact | null => {
    if (!value) {
        return null;
    }

    return {
        ...value,
        validationIssues: Array.isArray(value.validationIssues) ? value.validationIssues : [],
        blockers: Array.isArray(value.blockers) ? value.blockers : [],
        grain: Array.isArray(value.grain) ? value.grain : [],
        sourceArtifactIds: Array.isArray(value.sourceArtifactIds) ? value.sourceArtifactIds : [],
        deriveMetricTemplate: value.deriveMetricTemplate
            ? {
                ...value.deriveMetricTemplate,
                groupByColumns: Array.isArray(value.deriveMetricTemplate.groupByColumns)
                    ? value.deriveMetricTemplate.groupByColumns
                    : [],
                expectedInputs: Array.isArray(value.deriveMetricTemplate.expectedInputs)
                    ? value.deriveMetricTemplate.expectedInputs
                    : [],
            }
            : undefined,
    };
};

export const initialAppState: AppState = {
    sessionId: generateSessionId(), // Generate a temporary ID, will be overridden in init() if restoring
    currentView: 'file_upload',
    isAppInitializing: true,
    isBusy: false,
    chatLifecycleState: 'idle',
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
    canonicalizationStatus: 'idle',
    pipelineOutcome: null,
    reportContextResolution: null,
    datasetSemanticSnapshot: null,
    semanticStatus: 'idle',
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
    vectorMemoryState: 'cold',
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
    initialAnalysisStatus: 'idle',
    initialAnalysisFailureKind: null,
    initialAnalysisPlan: null,
    confirmedAnalysisGoal: null,
    goalState: 'idle',
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
    userColumnAnnotations: {},
};

// Combine all state and action types into a single AppStore type
export type AppStore = AppState &
    IUISlice &
    ISettingsSlice &
    IHistorySlice &
    ICardSlice &
    IDataSlice &
    IChatSlice &
    ITelemetrySlice &
    IAgentSlice &
{
    init: () => void;
    // Add reportsList to the top-level type for history slice to access
    reportsList: ReportListItem[];
};

// FIX: Corrected the zustand create syntax by using the curried form `create<AppStore>()(...)`.
// This ensures TypeScript correctly infers the store's type when using multiple slices,
// fixing errors where the state was inferred as '{}' and hooks were receiving the wrong number of arguments.
export const useAppStore = createWithEqualityFn<AppStore>()((set, get, store) => ({
    ...initialAppState,
    reportsList: [], // Initial value for reportsList

    // Combine all slices
    ...createUISlice(set, get, store),
    ...createSettingsSlice(set, get, store),
    ...createHistorySlice(set, get, store),
    ...createCardSlice(set, get, store),
    ...createDataSlice(set, get, store),
    ...createChatSlice(set, get, store),
    ...createTelemetrySlice(set, get, store),
    ...createAgentSlice(set, get, store),

    // Global init function — guarded to prevent double execution from
    // React StrictMode or effect re-fires.
    init: async () => {
        if ((get() as any)._initStarted) return;
        set({ _initStarted: true } as any);
        // Load agent/AI modules in parallel with settings fetch to keep them
        // out of the cold-start static import graph (PERF-201).
        const [
            rawPersistedSettings,
            { isProviderConfigured },
            { normalizeDataPreparationPlan },
            { updateCleaningRun },
        ] = await Promise.all([
            getSettings(),
            import('../services/ai/providerConfig'),
            import('../services/agent/execution/dataOperationRunner'),
            import('../services/agent/cleaningRunState'),
        ]);
        const persistedSettings = {
            ...rawPersistedSettings,
            language: normalizeAppLanguage(rawPersistedSettings.language),
        };
        set({
            isAppInitializing: true,
            settings: persistedSettings,
            isApiKeySet: isProviderConfigured(persistedSettings),
        });
        // 1. Determine the working session for this specific browser tab.
        let activeSessionId = readTabSessionId();
        if (!activeSessionId) {
            activeSessionId = createAndStoreTabSessionId();
        }
        set({ sessionId: activeSessionId });
        void import('../services/data/opfsDatasetStorage')
            .then(({ cleanupStaleOpfsSessions }) => cleanupStaleOpfsSessions([activeSessionId]))
            .catch(error => console.warn('[Init] Could not clean abandoned OPFS imports.', error));
        if (typeof indexedDB !== 'undefined') {
            void import('../services/storageService')
                .then(storage => 'pruneExpiredLocalDiagnostics' in storage
                    && typeof storage.pruneExpiredLocalDiagnostics === 'function'
                    ? storage.pruneExpiredLocalDiagnostics()
                    : 0)
                .catch(error => console.warn('[Init] Could not prune expired local diagnostics.', error));
        }

        try {
            // 2. Try to load data from IndexedDB specific to THIS session ID
            const idbStart = performance.now();
            const currentSession = await getReport(activeSessionId);
            const idbMs = performance.now() - idbStart;

            // When launched from an external ERP page (pendingPayloadKey in URL),
            // skip restoring old session data — the external CSV will be ingested fresh.
            // The flag is set synchronously in initExternalCsvBridge() (runs before React mount),
            // so it is always available by the time this async init() executes.
            const { hasExternalPayloadPending } = await import('../utils/externalCsvBridge');

            if (currentSession && !hasExternalPayloadPending) {
                const normalizeStart = performance.now();
                const normalizedAppState = normalizeRestoredAppState(currentSession.appState);
                const restoredMemoryScope = normalizedAppState.reportMemoryScope
                    ?? (currentSession.lineage
                        ? {
                            reportId: currentSession.lineage.reportId,
                            datasetId: currentSession.lineage.datasetId,
                            datasetVersion: currentSession.lineage.currentVersionId,
                        }
                        : resolveReportMemoryScope(normalizedAppState as AppStore));
                const normalizeMs = performance.now() - normalizeStart;
                if (idbMs + normalizeMs > 100) {
                    console.warn(
                        `[Init] ⚠ Session hydration: idb=${Math.round(idbMs)}ms, normalize=${Math.round(normalizeMs)}ms`,
                    );
                }
                const clearedPersistedClarification = Boolean(normalizedAppState.pendingClarification);
                chatDebug('Hydrating persisted session state.', {
                    sessionId: activeSessionId,
                    hasPendingClarification: Boolean(normalizedAppState.pendingClarification),
                    pendingClarificationQuestion: normalizedAppState.pendingClarification?.question ?? null,
                    persistedActiveTurnStatus: normalizedAppState.activeTurn?.status ?? null,
                    persistedChatHistoryCount: normalizedAppState.chatHistory?.length ?? 0,
                    persistedCurrentView: normalizedAppState.currentView ?? null,
                    hasCsvData: Boolean(normalizedAppState.csvData),
                });
                // Yield to the main thread between the IDB read and the heavy
                // store hydration commit. This prevents the browser from attributing
                // both the async IDB completion + React re-renders to one long task.
                await yieldToMainThread();
                const restoredColumnRegistry = buildColumnRegistry({
                    data: normalizedAppState.canonicalCsvData ?? normalizedAppState.csvData,
                    columnProfiles: normalizedAppState.columnProfiles,
                    semanticSnapshot: normalizedAppState.datasetSemanticSnapshot,
                    userColumnAnnotations: normalizedAppState.userColumnAnnotations,
                    steering: normalizedAppState.latestAnalysisSession?.analysisSteering,
                    existingRegistry: normalizedAppState.columnRegistry ?? null,
                });
                const hydratedWorkspaceFiles = await hydrateLatestReportWorkspaceFiles(normalizedAppState.workspaceFiles ?? {});
                const savedSuggestions = currentSession.appState.cardEnhancementSuggestions?.map((suggestion, idx) => ({
                    ...suggestion,
                    shortCode: suggestion.shortCode ?? `S${idx + 1}`,
                })) ?? [];
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
                    initialAnalysisStatus: normalizedAppState.initialAnalysisStatus
                        ?? (
                            (normalizedAppState.analysisCards?.length ?? 0) > 0
                            || Boolean(normalizedAppState.finalSummary)
                                ? 'ready'
                                : 'idle'
                        ),
                    initialAnalysisFailureKind: normalizedAppState.initialAnalysisFailureKind ?? null,
                    cleaningRun: normalizedAppState.cleaningRun
                        ? updateCleaningRun(normalizedAppState.cleaningRun, {
                            status: normalizedAppState.cleaningRun.status === 'completed'
                                ? 'completed'
                                : 'paused',
                            shouldAutoResume: false,
                        })
                        : null,
                    sessionId: activeSessionId, // Ensure ID remains consistent
                    reportMemoryScope: restoredMemoryScope,
                    agentMemoryRun: restoredMemoryScope
                        ? normalizeSavedAgentMemoryRun(normalizedAppState.agentMemoryRun, restoredMemoryScope)
                        : null,
                    liveAgentMemoryRun: restoredMemoryScope
                        ? normalizeSavedAgentMemoryRun(normalizedAppState.liveAgentMemoryRun, restoredMemoryScope)
                        : null,
                    agentMemoryHistory: restoredMemoryScope
                        ? normalizeSavedAgentMemoryRuns(normalizedAppState.agentMemoryHistory, restoredMemoryScope)
                        : [],
                    pendingVectorMemoryDocs: restoredMemoryScope
                        ? normalizeSavedReportPendingMemoryDocuments(
                            normalizedAppState.pendingVectorMemoryDocs,
                            restoredMemoryScope,
                        )
                        : [],
                    agentEvents: restoreAgentActivityHistory(
                        normalizedAppState.agentEvents,
                        activeSessionId,
                    ),
                    agentToolLogs: normalizedAppState.agentToolLogs ?? [],
                    cardEnhancementSuggestions: savedSuggestions,
                    activeDataQuery: null,
                    activeMetricMappingValidation: normalizeMetricMappingValidationArtifact(normalizedAppState.activeMetricMappingValidation ?? null),
                    isCardReviewInProgress: false,
                    isBusy: false,
                    chatLifecycleState: 'idle' as const,
                    isGeneratingReport: false,
                    isSummaryGenerating: false,
                    aiTaskStatus: null,
                    goalState: normalizeRestoredGoalState(normalizedAppState.goalState),
                    currentView: normalizedAppState.csvData ? 'analysis_dashboard' : 'file_upload',
                    sessionCreatedAt: currentSession.createdAt,
                    isApiKeySet: isProviderConfigured(persistedSettings),
                    vectorStoreDocuments: [],
                });
                chatDebug('Hydrated session state committed.', {
                    sessionId: activeSessionId,
                    restoredPendingClarification: Boolean(get().pendingClarification),
                    restoredPendingClarificationQuestion: get().pendingClarification?.question ?? null,
                    clearedPersistedClarification,
                    activeTurnStatusAfterHydrate: get().activeTurn?.status ?? null,
                    currentViewAfterHydrate: get().currentView,
                    chatHistoryCountAfterHydrate: get().chatHistory.length,
                    isBusyAfterHydrate: get().isBusy,
                });
                // Prefer instant rehydration from saved embeddings over expensive
                // ONNX re-computation. Fall back to rebuild only for legacy sessions
                // that were saved without embedding data.
                const savedVectorDocs = restoredMemoryScope
                    ? normalizeSavedReportMemoryDocuments(
                        normalizedAppState.vectorStoreDocuments ?? [],
                        restoredMemoryScope,
                    )
                    : [];
                if (Array.isArray(savedVectorDocs) && savedVectorDocs.length > 0
                    && savedVectorDocs.every(d => Array.isArray(d.embedding) && d.embedding.length > 0)) {
                    await vectorStore.rehydrate(savedVectorDocs);
                    // Rehydrate loads pre-computed embeddings into the worker but
                    // does NOT initialize the ONNX embedder. searchIfReady() checks
                    // _isInitialized on the VectorStore facade, so marking as 'ready'
                    // here would create a false-ready state where search silently
                    // returns empty. Use 'queued' so on-demand activation properly
                    // initializes the model when needed (Ticket: restore-false-ready).
                    set({ vectorStoreDocuments: savedVectorDocs, vectorMemoryState: 'queued' });
                    get().addProgress('Restored AI long-term memory from the saved session.');
                } else {
                    // Try loading from IndexedDB before expensive rebuild.
                    const restoredFromIdb = await vectorStore.loadFromStorage();
                    const restoredScopedDocuments = restoredFromIdb && restoredMemoryScope
                        ? await vectorStore.getDocumentsForScope(restoredMemoryScope)
                        : [];
                    if (restoredScopedDocuments.length > 0) {
                        set({ vectorStoreDocuments: restoredScopedDocuments });
                        set({ vectorMemoryState: 'queued' });
                        get().addProgress('Restored AI long-term memory from local storage.');
                    } else {
                        void import('../services/agent/memory/vectorMemorySync').then(m =>
                            m.rebuildVectorMemoryFromState({ getState: get as never, setState: set as never }, {
                                reset: true,
                                includeDatasetDocs: true,
                                progressMessage: 'Rebuilding AI long-term memory from the restored session...',
                            }),
                        );
                    }
                }
                if (normalizedAppState.cleaningRun && normalizedAppState.cleaningRun.status !== 'completed') {
                    set(prev => ({
                        chatHistory: appendUnfinishedCleaningNotice(prev.chatHistory, 'session_restore'),
                    }));
                }
                if (normalizedAppState.csvData) {
                    await get().refreshDuckDbSession();
                } else {
                    set({ duckDbSessionStatus: createIdleDuckDbSessionStatus() });
                }
            }
            // Clear emergency snapshot after successful restore — it is only
            // needed when IndexedDB failed to commit during beforeunload.
            try { localStorage.removeItem('csv_agent_emergency_snapshot'); } catch { /* ignore */ }
        } finally {
            set({ isAppInitializing: false });
        }
        // Resume a Pi stage checkpoint only after app state and DuckDB are restored.
        if (get().csvData) {
            void import('../services/agent/runtime/pi/piInitialAnalysisRuntimeService')
            .then(async ({ recoverPiInitialAnalysisIfNeeded }) => {
                await recoverPiInitialAnalysisIfNeeded(store);
            })
            .catch(error => {
                get().addProgress(
                    `Could not resume the interrupted AI run: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                    'error',
                );
            });
        }
        // Defer reports list load — not needed for initial render. Never start
        // this optional IndexedDB scan while intake is active: WebKit may queue
        // consent and source-snapshot operations behind it. History loads the
        // list on demand when this opportunistic preload is skipped.
        setTimeout(() => {
            const state = get();
            if (!state.isBusy && !state.isAppInitializing) {
                void state.loadReportsList();
            }
        }, 500);
    },
}));

configureCloudAiConsentRuntime(() => {
    const state = useAppStore.getState();
    return {
        datasetId: state.currentDatasetId,
        sensitiveDataWarning: detectSensitiveData(state.rawCsvData ?? state.csvData),
        requestConsent: state.requestCloudAiConsent,
    };
});

configureLocalDiagnosticContext(() => {
    const state = useAppStore.getState();
    const activeStep = state.activeTurn?.steps.at(-1);
    const cleaningStep = state.cleaningRun?.steps.at(-1);
    return {
        runId: state.activeTurn?.runId
            ?? state.activeAnalysisSession?.runId
            ?? state.cleaningRun?.runId
            ?? null,
        phase: cleaningStep?.kind
            ?? activeStep?.status
            ?? state.initialAnalysisStatus
            ?? 'unknown',
        attempt: state.cleaningRun?.currentStep
            ?? state.activeTurn?.budgetStatus.stepsUsed
            ?? 1,
        tool: cleaningStep?.toolName
            ?? (activeStep?.action && 'toolName' in activeStep.action
                ? String(activeStep.action.toolName)
                : activeStep?.action.type)
            ?? 'ai_model',
    };
});
