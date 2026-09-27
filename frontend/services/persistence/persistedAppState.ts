import type { AppState, Report, ReportMemoryScope } from '../../types';
import type { AppStore } from '../../store/useAppStore';
// vectorStore import removed — persistence now reads the store's synced
// vectorStoreDocuments snapshot instead of calling the async worker API.
import {
    LATEST_REPORT_MANIFEST_PATH,
    LATEST_REPORT_READINESS_PATH,
} from '../reporting/reportArtifactManifest';
import { buildDatasetVersionId } from '../../utils/datasetId';
import {
    isSameReportMemoryScope,
    resolveReportMemoryScope,
} from '../agent/memory/memoryScope';

const filterPersistedWorkspaceFiles = (workspaceFiles: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
        Object.entries(workspaceFiles).filter(([path]) => {
            if (!path.startsWith('/workspace/reports/')) {
                return true;
            }

            return path === LATEST_REPORT_MANIFEST_PATH || path === LATEST_REPORT_READINESS_PATH;
        }),
    );

export const hasSavableSession = (state: AppStore): boolean =>
    Boolean(
        state.sessionId
        && state.csvData
        && state.csvData.data.length > 0
        && !state.csvData.backing?.ephemeral,
    );

const resolveMaterialDataset = (state: AppStore) =>
    state.canonicalCsvData ?? state.csvData;

const filterScopedMemoryDocuments = <
    T extends { metadata?: { scope?: ReportMemoryScope } },
>(
    state: AppStore,
    documents: T[] | null | undefined,
): T[] => {
    const scope = resolveReportMemoryScope(state);
    return (documents ?? []).filter(document =>
        isSameReportMemoryScope(document.metadata?.scope, scope));
};

const buildColumnRegistrySignature = (state: AppStore): string => (
    state.columnRegistry?.columns.map(column => [
        column.physicalName,
        column.displayLabel,
        column.aliases.join(','),
        column.analysisRole,
        column.allowedUsages.groupBy ? '1' : '0',
        column.allowedUsages.filter ? '1' : '0',
        column.allowedUsages.select ? '1' : '0',
        column.allowedUsages.orderBy ? '1' : '0',
    ].join('~')).join('|') ?? ''
);

export const buildPersistedAppState = (state: AppStore): AppState => ({
    sessionId: state.sessionId,
    settings: state.settings,
    currentView: state.datasetBundle ? 'file_upload' : state.currentView,
    isAppInitializing: state.isAppInitializing,
    isBusy: state.isBusy,
    chatLifecycleState: state.chatLifecycleState,
    progressMessages: state.progressMessages,
    // Production history is artifact/lineage metadata only. Source and
    // prepared rows are rehydrated by selecting the original file again.
    csvData: state.datasetBundle ? null : state.csvData,
    rawCsvData: state.datasetBundle ? null : state.rawCsvData,
    rawIntakeIr: state.datasetBundle ? null : state.rawIntakeIr,
    reportStructureResolution: state.reportStructureResolution,
    canonicalCsvData: state.datasetBundle ? null : state.canonicalCsvData,
    canonicalBuildMeta: state.canonicalBuildMeta,
    canonicalizationStatus: state.canonicalizationStatus,
    pipelineOutcome: state.pipelineOutcome,
    reportContextResolution: state.reportContextResolution,
    datasetSemanticSnapshot: state.datasetSemanticSnapshot,
    semanticStatus: state.semanticStatus,
    semanticDatasetVersion: state.semanticDatasetVersion,
    columnProfiles: state.columnProfiles,
    columnRegistry: state.columnRegistry,
    analysisCards: state.analysisCards,
    chatHistory: state.chatHistory,
    finalSummary: state.finalSummary,
    aiCoreAnalysisSummary: state.aiCoreAnalysisSummary,
    finalSummaryProvenance: state.finalSummaryProvenance ?? null,
    aiCoreAnalysisSummaryProvenance: state.aiCoreAnalysisSummaryProvenance ?? null,
    dataPreparationPlan: state.dataPreparationPlan,
    initialDataSample: state.datasetBundle ? null : state.initialDataSample,
    // Use the store's already-synced snapshot — avoids an async call to the
    // vector worker during persistence and keeps buildPersistedAppState sync.
    vectorStoreDocuments: filterScopedMemoryDocuments(
        state,
        state.vectorStoreDocuments,
    ),
    vectorMemoryState: state.vectorMemoryState,
    pendingVectorMemoryDocs: filterScopedMemoryDocuments(
        state,
        state.pendingVectorMemoryDocs,
    ),
    reportMemoryScope: resolveReportMemoryScope(state),
    spreadsheetFilterFunction: state.spreadsheetFilterFunction,
    activeDataQuery: null,
    activeMetricMappingValidation: state.activeMetricMappingValidation,
    activeSpreadsheetFilter: state.activeSpreadsheetFilter,
    aiFilterExplanation: state.aiFilterExplanation,
    pendingClarification: null,
    resolvedClarifications: state.resolvedClarifications,
    pendingMutationConfirmation: state.pendingMutationConfirmation,
    activeTurn: null,
    queuedChatTurns: [],
    queuedAgentRuns: [],
    cancelRequestedTurnId: null,
    runtimeEvents: state.runtimeEvents,
    runtimeRunHistory: state.runtimeRunHistory,
    lastInsightExtractedAtTurn: state.lastInsightExtractedAtTurn,
    activeAnalysisSession: state.activeAnalysisSession,
    latestAnalysisSession: state.latestAnalysisSession,
    analysisSessionHistory: state.analysisSessionHistory ?? [],
    visibleAnalysisTrace: state.visibleAnalysisTrace,
    aiTaskStatus: state.aiTaskStatus,
    initialAnalysisStatus: state.initialAnalysisStatus,
    telemetryEvents: state.telemetryEvents,
    agentEvents: state.agentEvents,
    agentToolLogs: state.agentToolLogs,
    confirmedAnalysisGoal: state.confirmedAnalysisGoal,
    goalState: state.goalState,
    agentMemoryRun: state.agentMemoryRun,
    liveAgentMemoryRun: state.liveAgentMemoryRun,
    agentMemoryHistory: state.agentMemoryHistory,
    selectedMemoryRunId: state.selectedMemoryRunId,
    currentDatasetId: state.currentDatasetId,
    // Metadata only: source rows remain in their backing store and are never
    // copied into the bundle persisted with the application session.
    datasetBundle: state.datasetBundle,
    dataQualityIssues: state.dataQualityIssues,
    isChangingGoal: state.isChangingGoal,
    planQueue: state.planQueue,
    contextualSummary: state.contextualSummary,
    isGeneratingReport: state.isGeneratingReport,
    isSummaryGenerating: state.isSummaryGenerating,
    reportGenerationProgress: state.reportGenerationProgress,
    sessionCreatedAt: state.sessionCreatedAt,
    cardEnhancementSuggestions: state.cardEnhancementSuggestions,
    isCardReviewInProgress: state.isCardReviewInProgress,
    workspaceFiles: filterPersistedWorkspaceFiles(state.workspaceFiles),
    workspaceActionHistory: state.workspaceActionHistory,
    cleaningRun: state.cleaningRun,
    queryHistory: state.queryHistory,
    duckDbSessionStatus: state.duckDbSessionStatus,
    userColumnAnnotations: state.userColumnAnnotations ?? {},
});

/**
 * Build a lightweight change-detection signature from key state counters
 * instead of serializing the entire app state on every store update.
 *
 * Previously this did a full JSON.stringify of the entire persisted state
 * (including csvData, all cards, chat history, embeddings, events…) which
 * could be 10–50 MB and block the main thread for hundreds of milliseconds
 * on every Zustand subscription fire.
 *
 * The new approach hashes only the fields that change frequently during a
 * session — card count, chat length, event counts, view, and busy flags —
 * giving O(1) signature computation instead of O(state-size).
 */
export const buildPersistedAppStateSignature = (state: AppStore): string | null => {
    if (!hasSavableSession(state)) {
        return null;
    }

    // Lightweight composite key — changes when any meaningful state changes.
    // IMPORTANT: every persisted field that can change independently must have
    // a representative signal here, otherwise the change is silently dropped
    // until the next coincidental signature bump.
    return [
        state.sessionId,
        state.currentView,
        // --- cards (track count, IDs, AND content mutations) ---
        state.analysisCards.length,
        state.analysisCards.map(c => `${c.id}:${c.displayChartType}:${c.topN ?? ''}:${c.isDataVisible ? '1' : '0'}`).join(','),
        // --- chat (track count + last message) ---
        state.chatHistory.length,
        state.chatHistory.at(-1)?.id ?? '',
        state.chatHistory.at(-1)?.text?.slice(0, 64) ?? '',
        // --- column/profile state ---
        state.columnProfiles.length,
        buildColumnRegistrySignature(state),
        // --- pipeline / analysis status ---
        state.finalSummary ? 'fs' : '',
        state.aiCoreAnalysisSummary ? 'acs' : '',
        state.initialAnalysisStatus ?? '',
        state.goalState ?? '',
        state.cleaningRun?.status ?? '',
        state.dataPreparationPlan?.sqlPrecheck?.status ?? '',
        state.confirmedAnalysisGoal ?? '',
        state.isGeneratingReport ? 'rg' : '',
        state.semanticStatus ?? '',
        state.canonicalizationStatus ?? '',
        state.pipelineOutcome?.status ?? '',
        // --- AI task / status messages ---
        state.aiTaskStatus ?? '',
        (state.progressMessages ?? []).length,
        // --- analysis session ---
        state.latestAnalysisSession?.sessionId ?? '',
        state.latestAnalysisSession?.status ?? '',
        state.activeAnalysisSession?.status ?? '',
        (state.analysisSessionHistory ?? []).length,
        state.analysisSessionHistory?.at(-1)?.runId ?? '',
        // --- data quality / clarifications ---
        (state.dataQualityIssues ?? []).length,
        (state.resolvedClarifications ?? []).length,
        state.contextualSummary ? 'cs' : '',
        // --- runtime / agent events ---
        (state.runtimeEvents ?? []).length,
        (state.runtimeRunHistory ?? []).length,
        state.lastInsightExtractedAtTurn ?? 0,
        (state.agentEvents ?? []).length,
        (state.agentToolLogs ?? []).length,
        // --- vector / memory ---
        (state.vectorStoreDocuments ?? []).length,
        state.vectorMemoryState ?? '',
        state.selectedMemoryRunId ?? '',
        state.reportMemoryScope?.reportId ?? '',
        state.reportMemoryScope?.datasetId ?? '',
        state.reportMemoryScope?.datasetVersion ?? '',
        state.datasetBundle?.datasetVersion ?? '',
        state.datasetBundle?.relationshipSetId ?? '',
        state.datasetBundle?.transformationPrograms.length ?? 0,
        // --- query / workspace ---
        (state.queryHistory ?? []).length,
        resolveMaterialDataset(state)?.fileName ?? '',
        resolveMaterialDataset(state)?.data.length ?? 0,
        resolveMaterialDataset(state)
            ? buildDatasetVersionId(
                resolveMaterialDataset(state)!.fileName,
                resolveMaterialDataset(state)!.data,
            )
            : '',
        Object.keys(state.workspaceFiles).length,
        (state.workspaceActionHistory ?? []).length,
        // --- misc persistence-worthy state ---
        state.duckDbSessionStatus ?? '',
        state.reportGenerationProgress ?? '',
        state.isCardReviewInProgress ? '1' : '0',
        Object.keys(state.userColumnAnnotations ?? {}).length,
    ].join('|');
};

export const buildPersistedReportRecord = (
    state: AppStore,
    options: {
        id: string;
        filename: string;
        createdAt?: Date;
        updatedAt?: Date;
    },
): Report => ({
    id: options.id,
    filename: options.filename,
    createdAt: options.createdAt ?? state.sessionCreatedAt ?? new Date(),
    updatedAt: options.updatedAt ?? new Date(),
    appState: buildPersistedAppState(state),
});
