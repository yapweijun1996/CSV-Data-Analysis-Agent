
import type { CsvRow, CsvData, ReportIntakeIr } from './intake';
import type { DataPreparationPlan, DataOperation } from './operations';
import type { ActiveDataQuery, QueryTraceEntry, DuckDbSessionStatus } from './querying';
import type { ReportContextResolution, DatasetSemanticSnapshot, SemanticSnapshotStatus } from './semantics';
import { AnalysisArtifactProvenance, AnalysisCardData, AnalysisPlan, ColumnProfile } from './analysis';
import { ColumnRegistry } from './columns';
import { ChatMessage, ClarificationRequest, PendingMutationConfirmation, QueuedChatTurn, ResolvedClarification } from './chat';
import { AiTaskStatusMessage, CleaningRun, RuntimeAccessControlSettings, WorkspaceActionHistoryEntry } from './ai';
import { ReportMemoryScope, VectorStoreDocument, VectorStoreDocumentMetadata } from './vector';
import { AgentEvent, AgentMemoryRun, AgentToolLogEntry, CardEnhancementSuggestion, MetricMappingValidationArtifact } from './agent';
import {
    AgentRuntimeEvent,
    AgentTurn,
    ChatLifecycleState,
    DataAnalysisSessionState,
    QueuedAgentRun,
    RuntimeRunRecord,
    VisibleAnalysisTraceEntry,
} from './runtime';
import { ActiveSpreadsheetFilter } from './spreadsheet';
import { AppLanguage, LocalizedText } from './localization';
import {
    CanonicalBuildMeta,
    CanonicalizationStatus,
    PipelineOutcome,
    ReportStructureResolution,
} from './reportStructure';
import type { DatasetBundle } from './datasetBundle';


export interface Settings {
    /** 'default' uses the maintainer's shared demo gateway — no user API key needed. */
    provider: 'google' | 'openai' | 'default';
    geminiApiKey: string;
    openAIApiKey: string;
    simpleModel: string;
    complexModel: string;
    /** Fallback model used when the primary model returns a transient error (e.g. 503). */
    fallbackModel?: string;
    /**
     * Reasoning/thinking depth applied to every model call. Maps to Gemini's
     * thinkingConfig.thinkingBudget or OpenAI/gateway's reasoningEffort
     * provider option depending on the active provider.
     */
    reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
    language: AppLanguage;
    reportTemplate: 'board_pack' | 'executive_brief' | 'management_review' | 'audit_appendix';
    autoConfirmGoal: boolean;
    maxAgentTurns?: number;
    toolOutputCutoff?: number;
    runtimeAccessControl: RuntimeAccessControlSettings;
    enableSearchGrounding?: boolean;
    /** Enable AI visual evaluation of rendered charts (settings-gated, default: false). */
    enableVisualEvaluation?: boolean;
}

export type CloudAiProvider = Settings['provider'];

export type SensitiveDataReasonCode =
    | 'identity_document'
    | 'contact_information'
    | 'financial_account'
    | 'health_information'
    | 'payment_card';

export interface SensitiveDataWarning {
    reasonCodes: SensitiveDataReasonCode[];
    matchedColumns: string[];
    sampleMatchCount: number;
}

export interface CloudAiConsentRequest {
    datasetId: string;
    provider: CloudAiProvider;
    disclosureVersion: string;
    consentScope?: 'provider' | 'sensitive_dataset';
    sensitiveDataWarning?: SensitiveDataWarning | null;
}

export interface CloudAiConsentRecord extends CloudAiConsentRequest {
    key: string;
    grantedAt: string;
}

export type AppView = 'file_upload' | 'analysis_dashboard';
export type VectorMemoryState = 'cold' | 'queued' | 'initializing' | 'ready' | 'error';
export type VectorMemoryTrigger = 'memory_panel' | 'followup_chat' | 'explicit_user_action';
export interface PendingVectorMemoryDoc {
    id: string;
    text: string;
    metadata?: VectorStoreDocumentMetadata;
}
export type InitialAnalysisStatus = 'idle' | 'running' | 'ready' | 'degraded' | 'paused' | 'error';
export type InitialAnalysisTrigger = 'automatic' | 'manual';
export type InitialAnalysisReasonCode =
    | 'parse_errors'
    | 'malformed_quote'
    | 'header_shape_drift'
    | 'intake_diagnostics_missing'
    | 'intake_structure_uncertain';

export interface InitialAnalysisOutcome {
    status: 'ready' | 'degraded' | 'paused' | 'error';
    reasonCode?: InitialAnalysisReasonCode;
    message?: string;
    /** Resolves when all background summary chat messages have been appended.
     *  Callers that need to append messages *after* summaries should await this. */
    summaryPromise?: Promise<void>;
}

export interface ProgressMessage {
    id: string;
    text: string;
    type: 'system' | 'warning' | 'error';
    timestamp: Date;
    model?: string;
}

export interface TelemetryEvent {
    id: string;
    provider: Settings['provider'];
    stage: string;
    responseType: string;
    detail?: string;
    chunkSize?: number;
    meta?: Record<string, unknown>;
    timestamp: Date;
    sessionId?: string;
    datasetId?: string | null;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
    cleaningRunId?: string;
    requestId?: string;
}

/** User-authored column annotation for the data dictionary. */
export interface UserColumnAnnotation {
    columnName: string;
    businessLabel: string;
    description: string;
    businessRole?: 'dimension' | 'metric' | 'identifier' | 'helper';
}

export interface AppState {
    sessionId: string;
    currentView: AppView;
    isAppInitializing: boolean;
    isBusy: boolean;
    chatLifecycleState: ChatLifecycleState;
    settings: Settings;
    progressMessages: ProgressMessage[];
    csvData: CsvData | null;
    rawCsvData: CsvData | null;
    rawIntakeIr: ReportIntakeIr | null;
    reportStructureResolution: ReportStructureResolution | null;
    canonicalCsvData: CsvData | null;
    canonicalBuildMeta: CanonicalBuildMeta | null;
    canonicalizationStatus: CanonicalizationStatus;
    pipelineOutcome: PipelineOutcome | null;
    reportContextResolution: ReportContextResolution | null;
    datasetSemanticSnapshot: DatasetSemanticSnapshot | null;
    semanticStatus: SemanticSnapshotStatus;
    semanticDatasetVersion: string | null;
    columnProfiles: ColumnProfile[];
    columnRegistry: ColumnRegistry | null;
    analysisCards: AnalysisCardData[];
    chatHistory: ChatMessage[];
    finalSummary: LocalizedText | null;
    aiCoreAnalysisSummary: LocalizedText | null;
    finalSummaryProvenance?: AnalysisArtifactProvenance | null;
    aiCoreAnalysisSummaryProvenance?: AnalysisArtifactProvenance | null;
    dataPreparationPlan: DataPreparationPlan | null;
    initialDataSample: CsvRow[] | null;
    vectorStoreDocuments: VectorStoreDocument[];
    vectorMemoryState: VectorMemoryState;
    pendingVectorMemoryDocs: PendingVectorMemoryDoc[];
    /** Stable report identity plus the latest material dataset/version scope. */
    reportMemoryScope: ReportMemoryScope | null;
    spreadsheetFilterFunction: DataOperation | null;
    activeDataQuery: ActiveDataQuery | null;
    activeMetricMappingValidation: MetricMappingValidationArtifact | null;
    activeSpreadsheetFilter: ActiveSpreadsheetFilter | null;
    aiFilterExplanation: string | null;
    pendingClarification: ClarificationRequest | null;
    resolvedClarifications: ResolvedClarification[] | null;
    pendingMutationConfirmation: PendingMutationConfirmation | null;
    activeTurn: AgentTurn | null;
    queuedChatTurns: QueuedChatTurn[];
    queuedAgentRuns: QueuedAgentRun[];
    cancelRequestedTurnId: string | null;
    runtimeEvents: AgentRuntimeEvent[];
    runtimeRunHistory: RuntimeRunRecord[];
    /** Last user-turn boundary promoted into app-owned report memory. */
    lastInsightExtractedAtTurn: number;
    activeAnalysisSession: DataAnalysisSessionState | null;
    latestAnalysisSession: DataAnalysisSessionState | null;
    /** Finished report-scoped research runs; absent in legacy saved reports. */
    analysisSessionHistory?: DataAnalysisSessionState[];
    visibleAnalysisTrace: VisibleAnalysisTraceEntry[];
    aiTaskStatus: AiTaskStatusMessage | null;
    initialAnalysisStatus: InitialAnalysisStatus;
    agentEvents: AgentEvent[];
    agentToolLogs: AgentToolLogEntry[];
    confirmedAnalysisGoal: string | null;
    goalState: 'idle' | 'pending_ai' | 'awaiting_user_confirmation' | 'confirmed';
    agentMemoryRun: AgentMemoryRun | null;
    liveAgentMemoryRun: AgentMemoryRun | null;
    agentMemoryHistory: AgentMemoryRun[];
    selectedMemoryRunId: string | null;
    currentDatasetId: string | null;
    /** Metadata-only graph; table rows remain in memory, DuckDB, or OPFS backing. */
    datasetBundle: DatasetBundle | null;
    dataQualityIssues: string[] | null;
    isChangingGoal: boolean;
    planQueue: AnalysisPlan[];
    contextualSummary: string | null;
    telemetryEvents: TelemetryEvent[];
    isGeneratingReport: boolean;
    /** True while generateAllSummaries + follow-up goals are still running in the background. */
    isSummaryGenerating: boolean;
    reportGenerationProgress: { completed: number; total: number; mode?: 'analysis' | 'artifact' } | null;
    sessionCreatedAt: Date | null;
    cardEnhancementSuggestions: CardEnhancementSuggestion[];
    isCardReviewInProgress: boolean;
    workspaceFiles: Record<string, string>;
    workspaceActionHistory: WorkspaceActionHistoryEntry[];
    cleaningRun: CleaningRun | null;
    queryHistory: QueryTraceEntry[];
    duckDbSessionStatus: DuckDbSessionStatus;
    /** User-authored column annotations (data dictionary). */
    userColumnAnnotations: Record<string, UserColumnAnnotation>;
}
