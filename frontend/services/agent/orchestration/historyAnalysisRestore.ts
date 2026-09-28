import type { AppStore } from '../../../store/useAppStore';

type RestoredAnalysisFields = Pick<AppStore,
    | 'analysisCards'
    | 'finalSummary'
    | 'finalSummaryProvenance'
    | 'aiCoreAnalysisSummary'
    | 'confirmedAnalysisGoal'
    | 'goalState'
    | 'chatHistory'
    | 'workspaceFiles'
    | 'queryHistory'
    | 'activeAnalysisSession'
    | 'latestAnalysisSession'
    | 'visibleAnalysisTrace'
    | 'cleaningRun'
    | 'reportMemoryScope'
    | 'agentMemoryRun'
    | 'liveAgentMemoryRun'
    | 'agentMemoryHistory'
    | 'pendingVectorMemoryDocs'
    | 'vectorStoreDocuments'
    | 'vectorMemoryState'
    | 'selectedMemoryRunId'
>;

export interface HistoryAnalysisSnapshot extends RestoredAnalysisFields {
    datasetVersion: string;
    analysisDatasetVersion: string;
}

export const captureHistoryAnalysisSnapshot = (state: AppStore): HistoryAnalysisSnapshot | null => {
    if (
        state.csvData
        || !state.datasetBundle
        || state.initialAnalysisStatus !== 'ready'
        || state.cleaningRun?.status !== 'completed'
        || (state.analysisCards.length === 0 && !state.finalSummary)
    ) {
        return null;
    }

    return {
        datasetVersion: state.datasetBundle.datasetVersion,
        analysisDatasetVersion: state.reportMemoryScope?.datasetVersion
            ?? state.analysisCards.find(card => card.provenance?.datasetVersion)?.provenance?.datasetVersion
            ?? state.datasetBundle.datasetVersion,
        analysisCards: state.analysisCards,
        finalSummary: state.finalSummary,
        finalSummaryProvenance: state.finalSummaryProvenance,
        aiCoreAnalysisSummary: state.aiCoreAnalysisSummary,
        confirmedAnalysisGoal: state.confirmedAnalysisGoal,
        goalState: state.goalState,
        chatHistory: state.chatHistory,
        workspaceFiles: state.workspaceFiles,
        queryHistory: state.queryHistory,
        activeAnalysisSession: state.activeAnalysisSession,
        latestAnalysisSession: state.latestAnalysisSession,
        visibleAnalysisTrace: state.visibleAnalysisTrace,
        cleaningRun: state.cleaningRun,
        reportMemoryScope: state.reportMemoryScope,
        agentMemoryRun: state.agentMemoryRun,
        liveAgentMemoryRun: state.liveAgentMemoryRun,
        agentMemoryHistory: state.agentMemoryHistory,
        pendingVectorMemoryDocs: state.pendingVectorMemoryDocs,
        vectorStoreDocuments: state.vectorStoreDocuments,
        vectorMemoryState: state.vectorMemoryState,
        selectedMemoryRunId: state.selectedMemoryRunId,
    };
};

export const canRestoreHistoryAnalysis = (
    snapshot: HistoryAnalysisSnapshot | null | undefined,
    replayVerified: boolean,
    materialDatasetVersion: string,
): snapshot is HistoryAnalysisSnapshot => Boolean(
    snapshot
    && replayVerified
    && snapshot.datasetVersion === materialDatasetVersion,
);

export const getRestoredHistoryAnalysisState = (
    snapshot: HistoryAnalysisSnapshot,
    currentWorkspaceFiles: AppStore['workspaceFiles'],
): Partial<AppStore> => ({
    analysisCards: snapshot.analysisCards,
    finalSummary: snapshot.finalSummary,
    finalSummaryProvenance: snapshot.finalSummaryProvenance,
    aiCoreAnalysisSummary: snapshot.aiCoreAnalysisSummary,
    confirmedAnalysisGoal: snapshot.confirmedAnalysisGoal,
    goalState: snapshot.goalState,
    chatHistory: snapshot.chatHistory,
    workspaceFiles: { ...snapshot.workspaceFiles, ...currentWorkspaceFiles },
    queryHistory: snapshot.queryHistory,
    activeAnalysisSession: snapshot.activeAnalysisSession,
    latestAnalysisSession: snapshot.latestAnalysisSession,
    visibleAnalysisTrace: snapshot.visibleAnalysisTrace,
    cleaningRun: snapshot.cleaningRun,
    reportMemoryScope: snapshot.reportMemoryScope,
    agentMemoryRun: snapshot.agentMemoryRun,
    liveAgentMemoryRun: snapshot.liveAgentMemoryRun,
    agentMemoryHistory: snapshot.agentMemoryHistory,
    pendingVectorMemoryDocs: snapshot.pendingVectorMemoryDocs,
    vectorStoreDocuments: snapshot.vectorStoreDocuments,
    vectorMemoryState: snapshot.vectorMemoryState,
    selectedMemoryRunId: snapshot.selectedMemoryRunId,
    initialAnalysisStatus: 'ready',
    initialAnalysisFailureKind: null,
});
