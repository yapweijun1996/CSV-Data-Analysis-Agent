import { AnalysisPlan, ChartType, AggregationType, PivotMatrixConfig } from './analysis';
import { ClarificationRequest } from './chat';
import type { CsvData } from './intake';
import type { DataOperation, FilterRowsOperation } from './operations';
import type { QueryAggregateFunction, QueryPlan } from './querying';
import type { CleaningLoopIterationRecord, RowInspectionBundle, RuntimeTableAssessment } from './data';
import { PreFilterClause } from './preFilter';
import type {
    AnalysisMetricSemanticName,
    BaseMetricSemanticName,
    DerivedMetricSemanticName,
    MetricCatalogMetricName,
    MetricValidationKind,
} from './agent';

export interface MicroTask {
    name: string;
    status: 'pending' | 'in_progress' | 'done' | 'error';
}

export interface AiTaskStatusMessage {
    status: 'thinking' | 'acting' | 'observing' | 'done' | 'error';
    title: string;
    subtitle?: string;
    titleKey?: string;
    subtitleKey?: string;
    titleParams?: Record<string, string | number>;
    subtitleParams?: Record<string, string | number>;
    microTasks?: MicroTask[];
    totalSteps: number;
    currentStep: number;
    /** Rows in the dataset the analysis is working on right now; omitted when unknown. */
    rowCount?: number | null;
    error?: string;
}

export interface DomAction {
    toolName: 'highlightCard' | 'changeCardChartType' | 'showCardData' | 'filterCard';
    args: { [key: string]: any };
}

export interface AggregateTableRequest {
    cardId?: string;
    title?: string;
    description?: string;
    chartType?: ChartType;
    groupByColumn?: string;
    valueColumn?: string;
    aggregation?: AggregationType;
    preFilter?: PreFilterClause[];
}

export interface StatisticalAnalysisRequest {
    analysisType: 'correlation' | 'distribution' | 'outlier_scan' | 'trend_line' | 'simple_regression';
    column?: string;
    columnA?: string;
    columnB?: string;
    dateColumn?: string;
    valueColumn?: string;
    title: string;
    description: string;
}

export interface PivotMatrixRequest extends PivotMatrixConfig {}

export interface PeriodCompareRequest {
    dateColumn: string;
    metricColumn?: string;
    aggregate: QueryAggregateFunction;
    grain: 'day' | 'week' | 'month' | 'quarter' | 'year';
    comparisonMode: 'previous_period' | 'previous_year';
    segmentColumns?: string[];
    title: string;
    description: string;
    topN?: number;
}

export interface CohortRetentionRequest {
    metricName?: MetricCatalogMetricName;
    dateColumn?: string;
    userIdColumn?: string;
    signupDateColumn?: string;
    segmentColumn?: string;
    timeUnit: 'day' | 'week' | 'month';
    periods?: number;
    title: string;
    description: string;
}

export interface RootCauseBreakdownRequest {
    dateColumn: string;
    metricColumn?: string;
    aggregate: QueryAggregateFunction;
    grain: 'day' | 'week' | 'month' | 'quarter' | 'year';
    comparisonMode: 'previous_period' | 'previous_year';
    dimensionColumns: string[];
    limit?: number;
    title: string;
    description: string;
}

type MetricMappingValidationBaseRequest = {
    validationKind: 'base';
    metricName: BaseMetricSemanticName;
    requestedGrain?: string[];
    proposedMapping?: {
        sourceKind?: 'column' | 'row_label';
        column?: string;
        labelColumn?: string;
        valueColumn?: string;
        expectedInputs?: string[];
    };
};

type MetricMappingValidationDerivedRequest = {
    validationKind: 'derived';
    metricName: DerivedMetricSemanticName;
    requestedGrain?: string[];
    proposedMapping?: {
        sourceKind?: 'column' | 'row_label';
        column?: string;
        labelColumn?: string;
        valueColumn?: string;
        expectedInputs?: string[];
    };
};

export type MetricMappingValidationRequest =
    | MetricMappingValidationBaseRequest
    | MetricMappingValidationDerivedRequest;

export interface WorkspaceFileAction {
    operation: 'list' | 'tree' | 'read' | 'search' | 'grep' | 'head' | 'diff' | 'replace' | 'write' | 'append';
    path?: string;
    comparePath?: string;
    query?: string;
    content?: string;
    oldText?: string;
    newText?: string;
    replaceAll?: boolean;
    limit?: number;
    recursive?: boolean;
    caseSensitive?: boolean;
}

export interface WorkspaceActionHistoryEntry {
    timestamp: Date;
    operation: WorkspaceFileAction['operation'];
    path: string;
    success: boolean;
    message: string;
    output?: string;
    durationMs?: number;
    stage?: ToolStage;
    toolCategory?: ToolCategory | 'unknown';
    policyDecision?: 'allowed' | 'blocked';
    policyReason?: string | null;
}

export interface CleaningRunStep {
    stepId: string;
    kind: 'inspect' | 'edit' | 'verify' | 'commit';
    thought?: string;
    toolName?: string;
    path?: string;
    diffSummary?: string;
    status: 'in_progress' | 'done' | 'warning' | 'error' | 'blocked';
    timestamp: Date;
}

export interface CleaningAttemptedStrategy {
    strategyId: string;
    source: 'agent_primary' | 'agent_retry' | 'sandbox_js' | 'sandbox_python' | 'hierarchy_annotation' | 'deterministic_cleanup';
    requirement: 'hierarchical_shape' | 'wide_shape' | 'label_preservation' | null;
    round: number;
    reasonCode: string | null;
    executed: boolean;
}

export interface CleaningRecoveryState {
    activeStrategyId: string | null;
    attemptedStrategies: CleaningAttemptedStrategy[];
    lastReasonCode: string | null;
    recoveredBy: 'agent_retry' | 'sandbox_js' | 'sandbox_python' | 'hierarchy_annotation' | 'deterministic_cleanup' | null;
    analysisMode: 'normal' | 'degraded_safe';
}

export interface CleaningRun {
    runId: string;
    status: 'idle' | 'running' | 'paused' | 'failed' | 'completed';
    currentStep: number;
    steps: CleaningRunStep[];
    lastModelResponse: string | null;
    startedAt: Date;
    updatedAt: Date;
    targetPath: string;
    lastError?: string | null;
    shouldAutoResume?: boolean;
    strategyKind?: 'already_valid' | 'deterministic_cleanup' | 'deterministic_reshape' | 'llm_guided';
    strategy?: 'simple_detail_strategy' | 'report_shape_strategy';
    targetShape?: 'row_table' | 'long_fact_table' | 'long_statement_table';
    lastVerificationReason?: string | null;
    aiProgramId?: string | null;
    preExecutionSnapshotId?: string | null;
    lastExecutionTrace?: string[] | null;
    numericReconciliationStatus?: 'pending' | 'passed' | 'failed' | null;
    sqlPrecheckStatus?: 'pending' | 'passed' | 'warning' | 'blocked' | null;
    semanticIntentStatus?: 'pending' | 'passed' | 'failed' | null;
    recoveryStatus?: 'idle' | 'running' | 'passed' | 'failed' | null;
    rollbackReason?: string | null;
    // IR-first gate diagnostics
    irStableSingleLayerDetail?: boolean | null;
    irAllowsDeterministicCleanup?: boolean | null;
    irAllowsDeterministicReshape?: boolean | null;
    irRequiresInspectFirst?: boolean | null;
    irRoutingReason?: string | null;
    // Runtime table assessment
    runtimeTableAssessment?: RuntimeTableAssessment | null;
    loopCount?: number;
    inspectionStatus?: 'pending' | 'completed' | 'failed' | null;
    residualUnknownRowCount?: number | null;
    residualSummaryLikeRowCount?: number | null;
    lastFailedStage?: 'inspect' | 'mutate' | 'verify' | 'commit' | null;
    latestRowInspection?: RowInspectionBundle | null;
    iterationArtifacts?: CleaningLoopIterationRecord[];
    recoveryState?: CleaningRecoveryState | null;
    userFacingMessage?: string | null;
    actionTakenMessage?: string | null;
    dataSafetyMessage?: string | null;
    nextStateMessage?: string | null;
    technicalDetail?: string | null;
}

export type ToolRisk = 'low' | 'medium' | 'high';

export type ToolCategory = 'analysis' | 'card' | 'ui' | 'data' | 'spreadsheet' | 'workspace' | 'conversation';

export type ToolStage = 'cleaning' | 'analysis' | 'debug';

export type ToolDefaultPolicy = 'allow' | 'deny';

export type ToolGroup =
    | 'analysis.plan'
    | 'analysis.statistics'
    | 'analysis.validate'
    | 'analysis.matrix'
    | 'analysis.compare'
    | 'analysis.cohort'
    | 'analysis.diagnose'
    | 'card.aggregate'
    | 'card.mutate'
    | 'card.review'
    | 'ui.interaction'
    | 'data.mutation'
    | 'data.query'
    | 'data.diagnostic'
    | 'data.reshape'
    | 'spreadsheet.filter'
    | 'workspace.inspect'
    | 'workspace.inspect.tree'
    | 'workspace.inspect.diff'
    | 'workspace.edit'
    | 'conversation.clarification'
    | 'cleaning.inspect'
    | 'cleaning.edit'
    | 'cleaning.verify'
    | 'cleaning.verify.query'
    | 'analysis.presentation';

export type ToolName =
    | 'analysis.create_plan'
    | 'analysis.correlation'
    | 'analysis.pivot_matrix'
    | 'analysis.period_compare'
    | 'analysis.cohort_retention'
    | 'analysis.root_cause_breakdown'
    | 'analysis.validate_metric_mapping'
    | 'card.refine'
    | 'card.aggregate_table'
    | 'card.add_calculated_column'
    | 'card.delete'
    | 'card.review'
    | 'card.suggestion.apply'
    | 'card.suggestion.dismiss'
    | 'ui.highlight_card'
    | 'ui.change_chart_type'
    | 'ui.show_card_data'
    | 'ui.filter_card'
    | 'cleaning.resume'
    | 'cleaning.restart'
    | 'data.mutate'
    | 'data.query'
    | 'data.describe'
    | 'data.value_counts'
    | 'data.outliers'
    | 'data.missing'
    | 'data.reshape'
    | 'data.keep_wide'
    | 'dataset.profileStructure'
    | 'dataset.detectNoiseRows'
    | 'dataset.suggestCleaningPlan'
    | 'dataset.applyTransform'
    | 'dataset.validatePreparedData'
    | 'dataset.bindQueryEngine'
    | 'analysis.researchQuestions'
    | 'analysis.executeEvidence'
    | 'analysis.finalizeArtifacts'
    | 'spreadsheet.filter'
    | 'workspace.list'
    | 'workspace.tree'
    | 'workspace.read'
    | 'workspace.search'
    | 'workspace.grep'
    | 'workspace.head'
    | 'workspace.diff'
    | 'workspace.replace'
    | 'workspace.write'
    | 'workspace.append'
    | 'conversation.request_clarification'
    | 'analysis.presentation_upgrade';

export type RuntimePermissionMode = 'open' | 'balanced' | 'strict';

export type RuntimeToolOverride = 'allow' | 'deny';

export interface RuntimeWorkspaceRules {
    deniedPathPrefixes: string[];
}

export interface RuntimeAccessControlSettings {
    permissionMode: RuntimePermissionMode;
    toolOverrides: Partial<Record<ToolName, RuntimeToolOverride>>;
    workspaceRules: RuntimeWorkspaceRules;
}

export interface ToolAvailabilityContext {
    cardIds: string[];
    columnNames: string[];
    csvData?: CsvData | null;
    hasCsvData: boolean;
    hasCards: boolean;
    hasCleaningRun?: boolean;
    cleaningRunStatus?: string | null;
    suggestionIds?: string[];
    cleaningCompleted?: boolean;
    sessionId?: string;
    datasetId?: string | null;
    settingsKey?: string;
    toolStage?: ToolStage;
    allowOverrides?: ToolName[];
    denyOverrides?: ToolName[];
    runtimeAccessControl?: RuntimeAccessControlSettings;
}

export interface ToolRegistryError {
    code:
        | 'unknown_tool'
        | 'invalid_tool_name'
        | 'blocked_tool'
        | 'tool_unavailable'
        | 'invalid_action'
        | 'invalid_args'
        | 'malformed_tool_payload'
        | 'malformed_operation_payload'
        | 'duplicate_tool'
        | 'missing_schema'
        | 'invalid_category'
        | 'invalid_risk'
        | 'invalid_stage'
        | 'invalid_policy';
    message: string;
    toolName?: string;
    detail?: Record<string, unknown>;
}

export interface ToolRegistryDiagnostic {
    level: 'error' | 'warn';
    code: ToolRegistryError['code'];
    message: string;
    toolName?: ToolName;
    detail?: Record<string, unknown>;
}

export type ToolRegistryDiagnostics = ToolRegistryDiagnostic[];

export interface ToolPolicyContext extends ToolAvailabilityContext {
    toolStage: ToolStage;
}

export interface ToolPolicyDecision {
    toolName: ToolName;
    stage: ToolStage;
    allowed: boolean;
    source: 'stage_allowlist' | 'default_policy' | 'permission_mode' | 'allow_override' | 'deny_override' | 'availability';
    reason: string;
    category: ToolCategory | 'unknown';
    risk: ToolRisk | 'unknown';
    overrideOrigin?: 'runtime_contract' | 'settings' | 'both';
}

export interface ToolExecutionResult {
    status: 'success' | 'blocked' | 'error';
    toolName: ToolName | 'assistant_message';
    message: string;
    observation?: AgentObservation;
    artifacts?: Record<string, unknown>;
    artifactMetadata?: Record<string, unknown>;
    statePatch?: Record<string, unknown>;
    retryHint?: string | null;
    payload?: Record<string, unknown>;
    shouldStop: boolean;
    diagnostics?: ToolRegistryError[];
    policyDecision?: ToolPolicyDecision;
}

export interface ToolPolicy {
    allow: ToolName[];
    deny: string[];
}

export interface ToolManifest {
    name: ToolName;
    description: string;
    category: ToolCategory;
    risk: ToolRisk;
    enabledByDefault: boolean;
    inputSchema: Record<string, unknown>;
    parameterSchema?: Record<string, unknown>;
    stageAvailability?: ToolStage[];
    groups?: ToolGroup[];
    requiresCleaningCompleted?: boolean;
    defaultPolicy?: ToolDefaultPolicy;
    promptHints?: string[];
    resultShape?: string;
    isAvailable?: (context: ToolAvailabilityContext) => { available: boolean; reason?: string };
    validate?: (args: Record<string, any>, context: ToolAvailabilityContext) => string[];
    /** Explicit capability flags — lets the runtime pre-check feasibility
     *  instead of discovering limitations through execution failures. */
    capabilities?: Record<string, boolean>;
}

export type ToolDescriptor = ToolManifest;

export interface ResolvedToolExposure {
    toolName: ToolName;
    manifest: ToolManifest;
    decision: ToolPolicyDecision;
    available: boolean;
    availabilityReason?: string;
}

export interface ToolRegistry {
    manifests: ToolManifest[];
    descriptors: ToolDescriptor[];
    groups: Partial<Record<ToolGroup, ToolName[]>>;
    diagnostics: ToolRegistryDiagnostics;
    policy: ToolPolicy;
}

export interface AssistantMessageEnvelope {
    type: 'assistant_message';
    thought?: string;
    message: string;
    cardId?: string;
    suggestedActions?: { label: string; action: string }[];
}

export interface ToolCallEnvelope {
    type: 'tool_call';
    thought?: string;
    toolName: ToolName;
    args: Record<string, any>;
}

export type AiAction = AssistantMessageEnvelope | ToolCallEnvelope;
export const isToolCallAction = (action: AiAction): action is ToolCallEnvelope => action.type === 'tool_call';

export interface AiActionBatch {
    actions: AiAction[];
}

export interface AgentObservation {
    type: 'assistant_message' | 'tool_result' | 'clarification' | 'runtime_error';
    status: 'success' | 'blocked' | 'error';
    summary: string;
    toolName?: ToolName | 'assistant_message';
    code?: 'invalid_action_json' | 'invalid_action_shape' | 'validation_failed' | 'confirmation_required' | 'tool_contract' | 'semantic_miss' | 'clarification_needed' | 'cancelled' | 'budget_exhausted' | 'blocked_tool' | 'tool_unavailable' | 'empty_result' | 'flat_metric' | 'no_total' | 'low_signal' | 'no_card_created' | 'duckdb_unavailable' | 'action_execution_error' | 'provider_timeout';
    queryMode?: 'preview' | 'filtered' | 'aggregate';
    retryHint?: string | null;
    detail?: Record<string, unknown>;
}

export type StopReason = 'stop' | 'tool_calls' | 'max_tokens' | 'safety' | 'recitation' | 'other' | 'unknown';

export interface AiChatResponse {
    actions: AiAction[];
    stopReason?: StopReason;
}

export interface AiFilterResponse {
    explanation: string;
    operation: DataOperation;
}

export interface NextStepResponse {
    thought: string;
    updatedContextualSummary: string;
    nextAction: {
        type: 'EXECUTE_PLAN' | 'CREATE_AND_EXECUTE_PLAN' | 'FINISH_AND_SUMMARIZE';
        plan?: AnalysisPlan;
        reasonForFinishing?: string;
    };
}
