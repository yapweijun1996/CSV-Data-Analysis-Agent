import { AggregationType, ChartType } from './analysis';
import type { DeriveMetricByLabelFormula } from './operations';
import type { ToolCategory, ToolName, ToolRisk, ToolStage } from './ai';

export type ColumnRole = 'dimension' | 'metric' | 'technical_key' | 'noise';

export type AgentPhase = 'file' | 'profiling' | 'topic_generation' | 'planning' | 'execution' | 'evaluation' | 'chat';

export type AgentActivityKind =
    | 'intake'
    | 'preparation'
    | 'research'
    | 'follow_up'
    | 'tool'
    | 'approval'
    | 'artifact'
    | 'terminal';

export type AgentActivityLifecycle =
    | 'queued'
    | 'running'
    | 'waiting'
    | 'degraded'
    | 'failed'
    | 'cancelled'
    | 'completed';

export type AgentActivitySource = 'app' | 'runtime' | 'tool' | 'approval' | 'artifact';

export interface AgentActivityDescriptor {
    kind: AgentActivityKind;
    lifecycle: AgentActivityLifecycle;
    source: AgentActivitySource;
    eventType: string;
    title: string;
    explanation?: string;
}

export interface CorrelationFields {
    sessionId?: string;
    datasetId?: string | null;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
    cleaningRunId?: string;
    requestId?: string;
}

export interface AgentEvent extends CorrelationFields {
    id: string;
    timestamp: Date;
    phase: AgentPhase;
    step: string;
    status: 'pending' | 'in_progress' | 'done' | 'error';
    message: string;
    detail?: Record<string, any>;
    /**
     * Canonical reader-facing activity envelope. Optional only so legacy v8
     * report events can be normalized lazily during IndexedDB migration.
     */
    activity?: AgentActivityDescriptor;
}

export interface AgentMemoryDatasetFacts {
    fileName: string;
    rowCount: number;
    columnCount: number;
    dimensions: string[];
    metrics: string[];
}

export interface AgentMemoryColumnVerdict {
    name: string;
    role: ColumnRole;
    distinctValues?: number;
    removed: boolean;
    reason?: string;
    constantValue?: string;
    sampleValues?: string[];
}

export interface DatasetKnowledgeFacts {
    originalRowCount: number;
    originalColumnCount: number;
    cleanedRowCount: number;
    cleanedColumnCount: number;
    primaryDimensions: string[];
    primaryMetrics: string[];
}

export interface DatasetColumnKnowledge {
    name: string;
    role: ColumnRole | 'metadata' | 'noise';
    type?: string;
    distinctValues?: number;
    missingPercentage?: number;
    semanticGuess?: string;
    notes?: string;
    sampleValues?: string[];
}

export interface DatasetDimensionMap {
    project: string[];
    account: string[];
    allocation: string[];
    keys: string[];
    otherDimensions: string[];
    metrics: string[];
}

export interface DatasetKnowledgeHighlight {
    name: string;
    reason: string;
    metric?: string;
    topShare?: number;
    groups?: number;
}

export type AnalysisDatasetShape =
    | 'metric_columns'
    | 'row_label_metrics'
    | 'wide_report'
    | 'generic_table'
    | 'unknown';

export type AnalysisMetricSemanticName =
    | 'revenue'
    | 'cost'
    | 'profit'
    | 'margin'
    | 'budget'
    | 'actual'
    | 'variance';

export type BaseMetricSemanticName =
    | 'revenue'
    | 'cost'
    | 'budget'
    | 'actual';

export type DerivedMetricSemanticName =
    | 'profit'
    | 'margin'
    | 'variance';

export type MetricValidationKind = 'base' | 'derived';

export type MetricCatalogMetricName =
    | 'active_user_count'
    | 'retention'
    | 'churn'
    | 'new_user_count';

export interface MetricCatalogFieldRequirement {
    semanticRole: 'date' | 'user_id' | 'user_signup_date' | 'segment' | 'value';
    required: boolean;
    acceptedPatterns: string[];
}

export interface MetricCatalogDefinition {
    metricName: MetricCatalogMetricName;
    label: string;
    description: string;
    requiredFields: MetricCatalogFieldRequirement[];
    artifactType: 'period_compare' | 'cohort_retention';
}

export interface MetricCatalogResolution {
    definition: MetricCatalogDefinition;
    resolvedFields: Partial<Record<MetricCatalogFieldRequirement['semanticRole'], string>>;
    blockers: string[];
}

export interface AnalysisMetricSemantic {
    name: AnalysisMetricSemanticName;
    source: 'column' | 'row_label';
    confidence: 'high' | 'medium' | 'low';
    columns: string[];
    labelColumn?: string;
    valueColumn?: string;
    matchedLabels?: string[];
}

export interface MetricBinding {
    source: 'column' | 'row_label';
    column?: string;
    labelColumn?: string;
    valueColumn?: string;
    matchedValues?: string[];
    confidence: 'high' | 'medium' | 'low';
}

export interface MetricDefinition {
    name: AnalysisMetricSemanticName;
    expressionType: 'base' | 'derived_difference' | 'derived_ratio';
    bindings: MetricBinding[];
    grainCandidates: string[];
    sourceKinds: Array<'column' | 'row_label'>;
    confidence: 'high' | 'medium' | 'low';
    requiresDerivation: boolean;
    notes: string[];
}

export interface MetricValidationIssue {
    code:
        | 'metric_definition_missing'
        | 'grain_ambiguous'
        | 'mixed_metric_sources'
        | 'missing_numeric_value'
        | 'duplicate_grain_risk'
        | 'unsupported_metric_request';
    severity: 'error' | 'warn';
    metricName?: AnalysisMetricSemanticName;
    message: string;
}

export type MetricMappingRecommendation = 'clarify' | 'derive_metric' | 'visualize' | 'answer';

export interface MetricDerivationTemplate {
    groupByColumns: string[];
    labelColumn: string;
    valueColumn: string;
    expectedInputs: string[];
    outputMetricLabel: string;
    formula: DeriveMetricByLabelFormula;
}

export interface MetricMappingValidationArtifact {
    artifactType: 'metric_mapping_validation';
    metricName: AnalysisMetricSemanticName;
    validationKind?: MetricValidationKind;
    metricDefinition: MetricDefinition | null;
    validationIssues: MetricValidationIssue[];
    blockers: string[];
    recommendedAction: MetricMappingRecommendation;
    recommendedPath: AnalysisBrief['recommendedPath'];
    suggestedNextTool?: ToolName | 'assistant_message';
    deriveMetricTemplate?: MetricDerivationTemplate;
    grain: string[];
    sourceArtifactIds: string[];
    originRunId?: string | null;
    originTurnId?: string | null;
    requestFingerprint?: string;
    requestMessage?: string;
}

export interface AnalysisBrief {
    datasetShape: AnalysisDatasetShape;
    recommendedPath:
        | 'direct_plan'
        | 'derive_column_then_plan'
        | 'derive_metric_by_label_then_plan'
        | 'reshape_then_derive'
        | 'inspect_first';
    questionSummary?: string;
    targetMetrics?: AnalysisMetricSemanticName[];
    expectedArtifact?: 'answer' | 'table' | 'card' | 'derived_metric';
    comparisonMode?: 'none' | 'variance' | 'ratio' | 'segment_compare';
    semanticMetrics: AnalysisMetricSemantic[];
    metricDefinitions: MetricDefinition[];
    supportedDerivedMetrics: AnalysisMetricSemanticName[];
    grainCandidates: string[];
    blockers: string[];
    validationIssues: MetricValidationIssue[];
    notes: string[];
}

export type AnalysisIntentBrief = AnalysisBrief;

export type AgentMemoryExplorationVerdict =
    | 'useful'
    | 'flat_metric'
    | 'no_data'
    | 'error'
    | 'skipped'
    | 'noisy';

export interface AgentMemoryExploration {
    id: string;
    startedAt: Date;
    planTitle: string;
    groupBy: string[];
    metric?: string | null;
    aggregation?: AggregationType;
    verdict: AgentMemoryExplorationVerdict;
    dropReason?: string;
    metrics?: {
        groups: number;
        uniqueValues: number;
        topShare: number | null;
    };
    commentary?: string;
    cardCreated?: boolean;
}

export type AgentMemoryWarningType = 'dropped_column' | 'data_issue';

export interface AgentMemoryWarning {
    id: string;
    type: AgentMemoryWarningType;
    message: string;
    relatedColumns?: string[];
}

export interface DatasetGroupByInsight {
    groupBy: string[];
    metric?: string | null;
    verdict: AgentMemoryExplorationVerdict;
    topShare?: number | null;
    uniqueValues?: number;
    commentary?: string;
    dropReason?: string;
}

export interface DatasetKnowledge {
    facts: DatasetKnowledgeFacts;
    columns: DatasetColumnKnowledge[];
    dimensionMap: DatasetDimensionMap;
    highValueDimensions: DatasetKnowledgeHighlight[];
    suspiciousMetrics: DatasetKnowledgeHighlight[];
    groupByInsights: DatasetGroupByInsight[];
    summary?: string;
}

export interface AgentMemoryFindings {
    datasetFacts: AgentMemoryDatasetFacts | null;
    columnVerdicts: AgentMemoryColumnVerdict[];
    explorations: AgentMemoryExploration[];
    warnings: AgentMemoryWarning[];
    datasetKnowledge?: DatasetKnowledge;
}

export interface AgentMemoryRun {
    runId: string;
    datasetId: string;
    /** MEMORY-201 scope; optional only for legacy IndexedDB records. */
    reportId?: string;
    datasetVersion?: string;
    origin?: import('./vector').ReportMemoryOrigin;
    createdAt: Date;
    findings: AgentMemoryFindings;
    timeline?: AgentEvent[];
}

export interface AgentToolLogEntry extends CorrelationFields {
    id: string;
    timestamp: Date;
    tool: ToolName | 'assistant_message' | 'context_manager' | 'workspace_builder' | 'duckdb_query_engine' | 'tool_registry' | 'cleaning_runtime';
    description: string;
    detail?: Record<string, any>;
    stage?: ToolStage;
    category?: ToolCategory | 'unknown';
    risk?: ToolRisk | 'unknown';
    policyDecision?: 'allowed' | 'blocked';
    policyReason?: string | null;
}

export type AnalystCapabilityPackageKind = 'skill' | 'recipe';

export type AnalystCapabilityContextKey =
    | 'analysis_intent_brief'
    | 'card_context'
    | 'column_quality_snapshot'
    | 'dataset_columns'
    | 'dataset_knowledge'
    | 'query_trace'
    | 'visible_evidence';

export interface AnalystCapabilityPackage {
    id: string;
    kind: AnalystCapabilityPackageKind;
    label: string;
    intent: string;
    description: string;
    allowedToolNames: ToolName[];
    requiredContext: AnalystCapabilityContextKey[];
    completionChecks: string[];
    /** AGENT-112: Override task mode when this capability is selected. */
    overrideTaskMode?:
        | 'inspect'
        | 'derive_metric'
        | 'validate_metric'
        | 'visualize'
        | 'explain'
        | 'pivot_matrix'
        | 'period_compare'
        | 'cohort_retention'
        | 'root_cause_breakdown'
        | 'statistical_analysis';
    /** AGENT-112: Override expected outcome when this capability is selected. */
    overrideExpectedOutcome?:
        | 'answer'
        | 'table'
        | 'card'
        | 'derived_metric'
        | 'clarification';
    /** AGENT-112: Preferred fallback strategy when tools are blocked. */
    preferredFallback?: 'answer' | 'clarify' | 'replan';
}

export interface AnalystCapabilitySelection {
    skill: AnalystCapabilityPackage | null;
    recipe: AnalystCapabilityPackage | null;
    rationale: string[];
    resolvedToolNames: ToolName[];
}

export type CardEnhancementAction = 'add_calculated_column' | 'none';

export interface CardEnhancementSuggestion {
    id: string;
    cardId: string;
    cardTitle: string;
    shortCode: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
    action: CardEnhancementAction;
    proposedColumnName?: string;
    formula?: string;
    updateChart?: {
        useAs: 'primaryY' | 'secondaryY';
        newChartType?: ChartType;
    };
    status: 'pending' | 'applying' | 'applied' | 'dismissed' | 'failed';
    createdAt: Date;
}
