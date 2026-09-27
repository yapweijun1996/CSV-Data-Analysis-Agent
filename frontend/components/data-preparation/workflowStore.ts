import type { AppStore } from '../../store/useAppStore';

export type DataPreparationWorkflowState = Pick<AppStore,
    | 'sessionId'
    | 'currentView'
    | 'currentDatasetId'
    | 'csvData'
    | 'rawCsvData'
    | 'rawIntakeIr'
    | 'initialDataSample'
    | 'columnProfiles'
    | 'dataPreparationPlan'
    | 'dataQualityIssues'
    | 'cleaningRun'
    | 'reportStructureResolution'
    | 'canonicalCsvData'
    | 'canonicalBuildMeta'
    | 'canonicalizationStatus'
    | 'pipelineOutcome'
    | 'analysisCards'
    | 'finalSummary'
    | 'agentEvents'
    | 'agentToolLogs'
    | 'runtimeEvents'
    | 'runtimeRunHistory'
    | 'telemetryEvents'
    | 'spreadsheetFilterFunction'
    | 'activeSpreadsheetFilter'
    | 'aiFilterExplanation'
    | 'activeDataQuery'
    | 'settings'
    | 'isGeneratingReport'
>;

export const pickDataPreparationWorkflowState = (state: AppStore): DataPreparationWorkflowState => ({
    sessionId: state.sessionId,
    currentView: state.currentView,
    currentDatasetId: state.currentDatasetId,
    csvData: state.csvData,
    rawCsvData: state.rawCsvData,
    rawIntakeIr: state.rawIntakeIr,
    initialDataSample: state.initialDataSample,
    columnProfiles: state.columnProfiles,
    dataPreparationPlan: state.dataPreparationPlan,
    dataQualityIssues: state.dataQualityIssues,
    cleaningRun: state.cleaningRun,
    reportStructureResolution: state.reportStructureResolution,
    canonicalCsvData: state.canonicalCsvData,
    canonicalBuildMeta: state.canonicalBuildMeta,
    canonicalizationStatus: state.canonicalizationStatus,
    pipelineOutcome: state.pipelineOutcome,
    analysisCards: state.analysisCards,
    finalSummary: state.finalSummary,
    agentEvents: state.agentEvents,
    agentToolLogs: state.agentToolLogs,
    runtimeEvents: state.runtimeEvents,
    runtimeRunHistory: state.runtimeRunHistory,
    telemetryEvents: state.telemetryEvents,
    spreadsheetFilterFunction: state.spreadsheetFilterFunction,
    activeSpreadsheetFilter: state.activeSpreadsheetFilter,
    aiFilterExplanation: state.aiFilterExplanation,
    activeDataQuery: state.activeDataQuery,
    settings: state.settings,
    isGeneratingReport: state.isGeneratingReport,
});
