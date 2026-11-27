import { resetAgentTelemetryBuffers } from './agentTelemetryHelpers';
import { captureOutgoingSessionSnapshot, beginSessionTransition, ownsTransition, captureSessionScope, ownsSessionScope, scopeStore } from '../../services/session/sessionOwnership';
import { drainSessionPersistence, queueSessionWrite } from '../../services/persistence/currentSessionPersistence';
import { buildPersistedReportRecord, hasSavableSession } from '../../services/persistence/persistedAppState';



import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { ReportListItem } from '../../types';
import { getReportsList, saveReport, getReport, deleteReport, deleteOriginalData, purgeAllStorage, CURRENT_SESSION_KEY } from '../../services/storageService';
import { vectorStore } from '../../services/vectorStore';
import { disposeDuckDbQueryEngine } from '../../services/duckdb/queryEngine';
import {
    appendUnfinishedCleaningNotice,
    normalizeRestoredAppState,
    normalizeRestoredGoalState,
} from '../../utils/messageState';
import { createIdleDuckDbSessionStatus } from '../../services/duckdb/sessionStatus';
import { createAndStoreTabSessionId, startDeliberateRepairBudgetSession } from '../sessionLifecycle';
import { openReportArtifact, printReportArtifact } from '../../services/reporting/reportArtifactViewer';
import { hydrateLatestReportWorkspaceFiles, loadReportArtifactHtml } from '../../services/reporting/reportArtifactStorage';
import { parseReportArtifactManifest } from '../../services/reporting/reportArtifactManifest';
import { getTranslation } from '../../utils/localization';
import { restoreAgentActivityHistory } from '../../services/agent/activity/agentActivity';
import {
    normalizeSavedAgentMemoryRun,
    normalizeSavedAgentMemoryRuns,
    normalizeSavedReportMemoryDocuments,
    normalizeSavedReportPendingMemoryDocuments,
    resolveReportMemoryScope,
} from '../../services/agent/memory/memoryScope';

/**
 * A saved entry without a report page is not an error. When nothing is loaded
 * (for example after a reload) the row's primary action should restore the saved
 * analysis; otherwise explain in the user's language that no report page exists yet.
 */
const createMissingArtifactHandler = (get: () => AppStore) => async (id: string): Promise<void> => {
    if (!get().csvData) {
        await get().handleLoadReport(id);
        return;
    }
    get().addProgress(getTranslation('history_report_artifact_missing', get().settings.language), 'warning');
};

const discardPiSessionCheckpoint = async (sessionId: string) => {
    const { discardPiInitialAnalysisCheckpoint } =
        await import('../../services/agent/runtime/pi/piInitialAnalysisRuntimeService');
    discardPiInitialAnalysisCheckpoint(sessionId);
};

const purgeInactivePiCheckpoints = async (activeSessionId: string) => {
    const { purgePiInitialAnalysisCheckpoints } =
        await import('../../services/agent/runtime/pi/piInitialAnalysisRuntimeService');
    purgePiInitialAnalysisCheckpoints([activeSessionId]);
};

export interface IHistorySlice {
    reportsList: ReportListItem[];
    loadReportsList: () => Promise<void>;
    loadReportsListIfNeeded: () => Promise<void>;
    handleLoadReport: (id: string) => Promise<void>;
    handleDeleteReport: (id: string) => Promise<void>;
    handlePurgeStorage: () => Promise<{ deletedReports: number; freedMB: number }>;
    handleNewSession: () => Promise<void>;
    openPersistedReportArtifact: (id: string) => Promise<void>;
    exportPersistedReportPdf: (id: string) => Promise<void>;
}

export const createHistorySlice: StateCreator<AppStore, [], [], IHistorySlice> = (set, get) => ({
    reportsList: [],
    loadReportsList: async () => {
        const list = await getReportsList();
        set({ reportsList: list });
    },
    /** Load reports list only if cache is empty or stale (>30s). */
    loadReportsListIfNeeded: async () => {
        const current = get().reportsList;
        const lastLoaded = (get() as any)._reportsListLoadedAt as number | undefined;
        const now = Date.now();
        // Skip if we have data and it was loaded within the last 30 seconds.
        if (current.length > 0 && lastLoaded && (now - lastLoaded) < 30_000) return;
        const list = await getReportsList();
        set({ reportsList: list, _reportsListLoadedAt: now } as any);
    },
    handleLoadReport: async (id) => {
        const store = { getState: get, setState: set };
        const outgoing = captureOutgoingSessionSnapshot(store);
        const token = beginSessionTransition(store);
        resetAgentTelemetryBuffers();
        const assertTransition = () => ownsTransition(store, token);
        try {
        get().addProgress(`Loading report ${id}...`);
        let [report, { normalizeDataPreparationPlan }, { updateCleaningRun, hasUnfinishedCleaningRun }] = await Promise.all([
            getReport(id),
            import('../../services/agent/execution/dataOperationRunner'),
            import('../../services/agent/cleaningRunState'),
        ]);
        if (!assertTransition()) return;
        if (report) {
            if (outgoing.csvData || hasSavableSession(outgoing)) await queueSessionWrite(() => saveReport(buildPersistedReportRecord({ ...outgoing, initialAnalysisStatus: outgoing.initialAnalysisStatus === 'running' ? 'paused' : outgoing.initialAnalysisStatus, isBusy: false, isGeneratingReport: false }, { id: outgoing.sessionId, filename: outgoing.csvData?.fileName ?? outgoing.datasetBundle?.source.fileName ?? 'analysis-session' })));
            await drainSessionPersistence();
            if (!assertTransition()) return;
            // A commit admitted before replacement may have advanced this report during the barrier.
            report = await getReport(id);
            if (!assertTransition()) return;
            if (!report) throw new Error('The selected report is no longer available.');
            await discardPiSessionCheckpoint(outgoing.sessionId);
            const normalizedAppState = normalizeRestoredAppState(report.appState);
            const hasUnfinishedRestoredCleaning = hasUnfinishedCleaningRun(normalizedAppState.cleaningRun);
            const restoredMemoryScope = normalizedAppState.reportMemoryScope
                ?? (report.lineage
                    ? {
                        reportId: report.lineage.reportId,
                        datasetId: report.lineage.datasetId,
                        datasetVersion: report.lineage.currentVersionId,
                    }
                    : resolveReportMemoryScope(normalizedAppState as AppStore));
            const hydratedWorkspaceFiles = await hydrateLatestReportWorkspaceFiles(normalizedAppState.workspaceFiles ?? {});
            if (!assertTransition()) return;
            const loadedAt = new Date();
            await disposeDuckDbQueryEngine();
            if (!assertTransition()) return;
            await vectorStore.clear();
            if (!assertTransition()) return;
            const nextSessionId = createAndStoreTabSessionId();
            set({
                ...normalizedAppState,
                sessionId: nextSessionId,
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
                activeExecution: null,
                queuedChatTurns: [],
                queuedAgentRuns: [],
                cancelRequestedTurnId: null,
                runtimeEvents: [],
                runtimeRunHistory: [],
                lastInsightExtractedAtTurn: 0,
                agentEvents: restoreAgentActivityHistory(
                    normalizedAppState.agentEvents,
                    nextSessionId,
                ),
                cleaningRun: normalizedAppState.cleaningRun
                    ? updateCleaningRun(normalizedAppState.cleaningRun, {
                        status: hasUnfinishedRestoredCleaning
                            ? 'paused'
                            : normalizedAppState.cleaningRun.status,
                        shouldAutoResume: false,
                    })
                    : null,
                analysisCards: hasUnfinishedRestoredCleaning
                    ? []
                    : normalizedAppState.analysisCards,
                finalSummary: hasUnfinishedRestoredCleaning
                    ? null
                    : normalizedAppState.finalSummary,
                aiCoreAnalysisSummary: hasUnfinishedRestoredCleaning
                    ? null
                    : normalizedAppState.aiCoreAnalysisSummary,
                initialAnalysisStatus: normalizedAppState.initialAnalysisStatus
                    ?? (
                        hasUnfinishedRestoredCleaning
                            ? 'idle'
                            : ((normalizedAppState.analysisCards?.length ?? 0) > 0 || Boolean(normalizedAppState.finalSummary)
                                ? 'ready'
                                : 'idle')
                    ),
                initialAnalysisFailureKind: normalizedAppState.initialAnalysisFailureKind ?? null,
                initialAnalysisRecovery: null,
                goalState: normalizeRestoredGoalState(normalizedAppState.goalState),
                // Saved results are shown read-only even though history does not keep CSV rows.
                currentView: (normalizedAppState.csvData
                    || (normalizedAppState.datasetBundle
                        && ((normalizedAppState.analysisCards?.length ?? 0) > 0 || normalizedAppState.finalSummary)))
                    ? 'analysis_dashboard'
                    : 'file_upload',
                isHistoryPanelOpen: false,
                isWorkspaceModalOpen: false,
                isDataPreparationModalOpen: false,
                isDebugLogsModalOpen: false,
                activeDataQuery: null,
                activeSpreadsheetFilter: normalizedAppState.activeSpreadsheetFilter ?? null,
                isBusy: false,
                chatLifecycleState: 'idle' as const,
                isGeneratingReport: false,
                isSummaryGenerating: false,
                reportGenerationProgress: null,
                isCardReviewInProgress: false,
                aiTaskStatus: null,
                sessionCreatedAt: loadedAt,
                vectorStoreDocuments: [],
            });
            const restoredScope = captureSessionScope(store);
            const restoredStore = scopeStore(store, restoredScope);
            void import('../../services/agent/runtime/pi/piInitialAnalysisRuntimeService').then(({ recoverPiInitialAnalysisIfNeeded }) => {
                if (ownsSessionScope(store, restoredScope)) return recoverPiInitialAnalysisIfNeeded(restoredStore);
            }).catch(error => {
                if (ownsSessionScope(store, restoredScope)) restoredStore.getState().addProgress(`Could not inspect checkpoint recovery: ${error instanceof Error ? error.message : String(error)}`, 'warning');
            });
            // Prefer instant rehydration from saved embeddings over expensive
            // ONNX re-computation. Fall back to rebuild only for legacy sessions
            // that were saved without embedding data.
            // Rehydrate vector memory in the background so report loading
            // is never blocked by a slow or timed-out vector worker.
            const savedVectorDocs = restoredMemoryScope
                ? normalizeSavedReportMemoryDocuments(
                    normalizedAppState.vectorStoreDocuments ?? [],
                    restoredMemoryScope,
                )
                : [];
            if (Array.isArray(savedVectorDocs) && savedVectorDocs.length > 0
                && savedVectorDocs.every(d => Array.isArray(d.embedding) && d.embedding.length > 0)) {
                void (async () => {
                    try {
                        await vectorStore.rehydrate(savedVectorDocs);
                        if (!ownsSessionScope(store, restoredScope)) return;
                        set({
                            vectorStoreDocuments: savedVectorDocs,
                            vectorMemoryState: 'queued',
                        });
                        vectorStore.schedulePersist();
                        get().addProgress('Restored AI long-term memory from the loaded report.');
                    } catch {
                        // Non-blocking — rehydrate timeout is acceptable.
                    }
                })();
            } else {
                void import('../../services/agent/memory/vectorMemorySync').then(m =>
                    m.rebuildVectorMemoryFromState(restoredStore as never, {
                        reset: true,
                        includeDatasetDocs: true,
                        progressMessage: 'Rebuilding AI long-term memory from the loaded report...',
                    }),
                );
            }
            if (!hasUnfinishedRestoredCleaning) {
                await get().refreshDuckDbSession(undefined, restoredScope);
                if (!ownsSessionScope(store, restoredScope)) return;
            } else {
                set(prev => ({
                    chatHistory: appendUnfinishedCleaningNotice(prev.chatHistory, 'history_load'),
                }));
            }
            get().addProgress(`Report "${report.filename}" loaded.`);
            // History keeps lineage, not rows: restore the full dataset from the stored original file.
            if (!normalizedAppState.csvData && ownsSessionScope(store, restoredScope)) {
                void get().restoreSavedSource?.();
            }
        } else {
            set({ isBusy: false });
            get().addProgress(`Failed to load report ${id}.`, 'error');
        }
        } catch (error) {
            if (assertTransition()) { set({ isBusy: false }); get().addProgress(`Failed to load report: ${error instanceof Error ? error.message : String(error)}`, 'error'); }
        }
    },
    handleDeleteReport: async (id) => {
        try {
            await deleteReport(id);
            await get().loadReportsList();
        } catch (error) {
            get().addProgress(`Failed to delete report: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    },
    handlePurgeStorage: async () => {
        try {
            const result = await purgeAllStorage(get().sessionId);
            await purgeInactivePiCheckpoints(get().sessionId);
            await get().loadReportsList();
            return result;
        } catch (error) {
            get().addProgress(`Failed to purge storage: ${error instanceof Error ? error.message : String(error)}`, 'error');
            return { deletedReports: 0, freedMB: 0 };
        }
    },
    openPersistedReportArtifact: async (id) => {
        const handleMissingReportArtifact = createMissingArtifactHandler(get);
        const report = await getReport(id);
        const manifest = parseReportArtifactManifest(report?.appState?.workspaceFiles?.['/workspace/reports/latest-analyst-report.manifest.json']);
        const html = manifest ? await loadReportArtifactHtml(manifest.reportId) : null;

        if (!html) {
            await handleMissingReportArtifact(id);
            return;
        }

        const openedWindow = openReportArtifact(html);
        if (!openedWindow) {
            get().addProgress(`Failed to open the saved report for ${id}.`, 'error');
        }
    },
    exportPersistedReportPdf: async (id) => {
        const handleMissingReportArtifact = createMissingArtifactHandler(get);
        const report = await getReport(id);
        const manifest = parseReportArtifactManifest(report?.appState?.workspaceFiles?.['/workspace/reports/latest-analyst-report.manifest.json']);
        const html = manifest ? await loadReportArtifactHtml(manifest.reportId) : null;

        if (!html) {
            await handleMissingReportArtifact(id);
            return;
        }

        const openedWindow = printReportArtifact(html);
        if (!openedWindow) {
            get().addProgress(`Failed to open the saved report for PDF export: ${id}.`, 'error');
        }
    },
    handleNewSession: async () => {
        const store = { getState: get, setState: set };
        const outgoing = captureOutgoingSessionSnapshot(store);
        const token = beginSessionTransition(store);
        resetAgentTelemetryBuffers();
        try {
            const outgoingSessionId = get().sessionId;
            const settings = get().settings;
            const isApiKeySet = get().isApiKeySet;
            let archivedSession: Parameters<typeof saveReport>[0] | null = null;

            // Block file intake immediately. Session cleanup and history
            // archiving are asynchronous; without this guard a fast upload can
            // still see the outgoing DatasetBundle and be misclassified as a
            // restore attempt.
            set({
                currentView: 'file_upload',
                isBusy: true,
                chatLifecycleState: 'running' as const,
            });

            if (outgoing.csvData || hasSavableSession(outgoing)) await queueSessionWrite(() => saveReport(buildPersistedReportRecord({ ...outgoing, isBusy: false, isGeneratingReport: false, initialAnalysisStatus: outgoing.initialAnalysisStatus === 'running' ? 'paused' : outgoing.initialAnalysisStatus }, { id: outgoing.sessionId, filename: outgoing.csvData?.fileName ?? outgoing.datasetBundle?.source.fileName ?? 'analysis-session' })));
            await drainSessionPersistence();
            if (!ownsTransition(store, token)) return;
            await disposeDuckDbQueryEngine();
            if (!ownsTransition(store, token)) return;
            if (outgoing.csvData) {
                const existingSession = await getReport(CURRENT_SESSION_KEY);
                if (existingSession) {
                    const archiveId = `report-${existingSession.createdAt.getTime()}`;
                    archivedSession = { ...existingSession, id: archiveId, updatedAt: new Date() };
                }
            }
            await vectorStore.clear();
            if (!ownsTransition(store, token)) return;
            await queueSessionWrite(() => deleteReport(CURRENT_SESSION_KEY));
            if (!ownsTransition(store, token)) return;
            void import('../../services/data/opfsDatasetStorage')
                .then(({ removeOpfsDatasetSession }) => removeOpfsDatasetSession(outgoingSessionId))
                .catch(error => console.warn('[History] Could not clear temporary OPFS data.', error));
            void import('../../services/data/sandboxTableRegistry')
                .then(({ clearSandboxTableRows }) => clearSandboxTableRows(outgoing.datasetBundle?.bundleId))
                .catch(error => console.warn('[History] Could not clear temporary sandbox tables.', error));
            const nextSessionId = createAndStoreTabSessionId();
            startDeliberateRepairBudgetSession(nextSessionId);

            // FIX: Replaced direct import of `initialAppState` to break a circular dependency.
            // This circular dependency was causing widespread type inference failures in Zustand.
            // The state is now manually reset to its initial values here.
            set({
                currentView: 'file_upload',
                sessionId: nextSessionId,
                isBusy: false,
                chatLifecycleState: 'idle' as const,
                progressMessages: [],
                telemetryEvents: [],
                agentEvents: [],
                agentMemoryRun: null,
                liveAgentMemoryRun: null,
                agentMemoryHistory: [],
                selectedMemoryRunId: null,
                currentDatasetId: null,
                datasetBundle: null,
                candidateRecovery: null,
                datasetCommitBindingStatus: undefined,
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
                activeExecution: null,
                queuedChatTurns: [],
                queuedAgentRuns: [],
                cancelRequestedTurnId: null,
                runtimeEvents: [],
                runtimeRunHistory: [],
                aiTaskStatus: null,
                initialAnalysisStatus: 'idle',
                initialAnalysisFailureKind: null,
                initialAnalysisPlan: null,
                initialAnalysisRecovery: null,
                confirmedAnalysisGoal: null,
                goalState: 'idle',
                dataQualityIssues: null,
                isChangingGoal: false,
                planQueue: [],
                contextualSummary: null,
                isGeneratingReport: false,
                isSummaryGenerating: false,
                reportGenerationProgress: null,
                sessionCreatedAt: new Date(),
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
                settings: settings,
                isApiKeySet: isApiKeySet,
            });

            // The new upload surface must not wait for a potentially large
            // history archive or checkpoint cleanup. The old current-session
            // record has already been removed, so these operations are safe to
            // finish after the visible reset without deleting new-session data.
            const maintenanceResults = await Promise.allSettled([
                archivedSession ? queueSessionWrite(() => saveReport(archivedSession!)) : Promise.resolve(),
                outgoingSessionId
                    ? discardPiSessionCheckpoint(outgoingSessionId)
                    : Promise.resolve(),
                outgoingSessionId
                    ? deleteOriginalData(outgoingSessionId)
                    : Promise.resolve(),
            ]);
            if (!ownsTransition(store, token)) return;
            if (maintenanceResults.some(result => result.status === 'rejected')) {
                get().addProgress(
                    'The new session is ready, but some previous-session cleanup could not finish.',
                    'warning',
                );
            }
            await get().loadReportsList();
        } catch (error) {
            if (!ownsTransition(store, token)) return;
            set({
                isBusy: false,
                chatLifecycleState: 'idle' as const,
                currentView: outgoing.currentView,
            });
            get().addProgress(`Failed to start a new session: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    },
});
