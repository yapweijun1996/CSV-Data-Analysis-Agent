import type { CsvRow } from './intake';
import type { DatasetHeaderSemantics, SemanticLabelConflict } from './semantics';
import type { AnalysisEngine, QueryPlan, QueryAggregateFunction } from './querying';
import type { PreFilterClause } from './preFilter';
import type { LocalizedText } from './localization';

export type ChartType =
    | 'bar'
    | 'horizontal_bar'
    | 'line'
    | 'area'
    | 'pie'
    | 'doughnut'
    | 'polar_area'
    | 'scatter'
    | 'combo'
    | 'radar'
    | 'bubble'
    | 'stacked_bar'
    | 'stacked_column'
    | 'multi_line';
export const AGGREGATION_TYPES = ['sum', 'count', 'avg', 'count_distinct', 'min', 'max', 'median', 'percentile'] as const;
export type AggregationType = (typeof AGGREGATION_TYPES)[number];
export const isAggregationType = (v: unknown): v is AggregationType =>
    typeof v === 'string' && (AGGREGATION_TYPES as readonly string[]).includes(v);
export type PivotPreference = 'none' | 'explicit_preferred';
export type PivotDecision =
    | 'prefer_normal'
    | 'prefer_pivot'
    | 'reshape_then_redecide'
    | 'force_table_only';
export type AnalysisArtifactType =
    | 'pivot_matrix'
    | 'period_compare'
    | 'cohort_retention'
    | 'root_cause_breakdown'
    | 'distribution'
    | 'outlier_scan'
    | 'trend_line'
    | 'simple_regression';

export interface AnalysisArtifactMetadata {
    artifactType: AnalysisArtifactType;
    dataTableFirst?: boolean;
    tableOnlyPresentation?: boolean;
    hideChartByDefault?: boolean;
    sourceStepIds?: string[];
    analysisSessionRunId?: string | null;
    matrixColumns?: string[];
    matrixValueColumns?: string[];
    visibleMatrixValueColumns?: string[];
    foldedMatrixValueColumns?: string[];
    hiddenMatrixValueColumns?: string[];
    matrixRowLabel?: string;
    matrixColumnLabel?: string;
    matrixMetricLabel?: string;
    recommendedTotalOnlyDueToWideColumns?: boolean;
    defaultCompressedStackedView?: boolean;
    effectiveMatrixValueColumnCount?: number;
    comparisonMetricColumns?: string[];
    cohortPeriods?: string[];
    narrative?: string;
}

export interface PivotMatrixConfig {
    rows: string[];
    columns?: string[];
    metric?: string;
    aggregate: QueryAggregateFunction;
    title: string;
    description: string;
    topN?: number;
    sort?: {
        by: 'row_total' | 'label';
        direction: 'asc' | 'desc';
    };
}

export interface ColumnProfile {
    name: string;
    type: 'numerical' | 'categorical' | 'date' | 'time' | 'currency' | 'percentage';
    uniqueValues?: number;
    valueRange?: [number, number];
    missingPercentage?: number;
    /** True when the column is typed numerical but raw values contain comma-formatted
     *  thousands separators (e.g. "1,234.56"). DuckDB cannot CAST these directly;
     *  replace_values must strip commas first. */
    hasFormattedNumbers?: boolean;
    /** True when the column is typed numerical but raw values contain apostrophe-prefixed
     *  numbers (e.g. "'-852.81"). DuckDB cannot CAST these directly;
     *  replace_values must strip the leading apostrophe first. */
    hasApostrophePrefixedNumbers?: boolean;
}


/** One question Pi chose to investigate, already checked against the dataset's columns. */
export interface ResearchPlanQuestion {
    title: string;
    rationale: string;
    dimension: string | null;
    metric: string | null;
    aggregation: AggregationType | null;
    comparison: string | null;
}

/** The research plan Pi drafted for the initial analysis, consumed once by the evidence stage. */
export interface ResearchPlan {
    datasetVersion: string;
    questions: ResearchPlanQuestion[];
    /** Questions Pi proposed that failed validation, kept for diagnostics. */
    rejected: Array<{ title: string; reason: string }>;
    consumed: boolean;
}

export interface AnalysisPlan {
    chartType: ChartType;
    title: string;
    description: string;
    aggregation?: AggregationType;
    groupByColumn?: string;
    valueColumn?: string;
    /** Multiple value columns for multi-series charts (e.g., monthly period columns). */
    valueColumns?: string[];
    xValueColumn?: string;
    yValueColumn?: string;
    secondaryValueColumn?: string;
    secondaryAggregation?: AggregationType;
    defaultTopN?: number;
    defaultHideOthers?: boolean;
    preFilter?: PreFilterClause[];
    isFallback?: boolean;
    artifactType?: AnalysisArtifactType;
    artifactMetadata?: AnalysisArtifactMetadata;
    defaultDataVisible?: boolean;
    disableTopNControls?: boolean;
}

export interface SqlAnalysisBindings {
    groupByColumn?: string;
    valueColumn?: string;
    valueColumns?: string[];
    secondaryValueColumn?: string;
    xValueColumn?: string;
    yValueColumn?: string;
}

export interface SqlAnalysisPlan {
    chartType: ChartType;
    title: string;
    description: string;
    queryMode: 'aggregate' | 'rowset';
    query: QueryPlan;
    bindings: SqlAnalysisBindings;
    aggregation?: AggregationType;
    secondaryAggregation?: AggregationType;
    defaultTopN?: number;
    defaultHideOthers?: boolean;
    preFilter?: PreFilterClause[];
}

export type SqlEvidenceQueryPreferredResultShape =
    | 'ranked_aggregate'
    | 'time_series'
    | 'rowset_scatter_candidate'
    | 'detail_table';

export type BusinessGrainConfidence = 'high' | 'medium' | 'low';
export type DetailRowPolicy = 'exclude_non_detail_rows' | 'preserve_all_rows' | 'uncertain';
export type ReportShapeClass =
    | 'detail_table'
    | 'hierarchical_statement'
    | 'wide_pivot'
    | 'mixed_tabular'
    | 'uncertain';
export type AnalysisSteeringHierarchyMode = 'none' | 'preserve' | 'annotation_fallback' | 'uncertain';
export type AnalysisSteeringWidePivotMode = 'none' | 'reshape_required' | 'annotation_fallback' | 'uncertain';
export type AnalysisSteeringSignalSource =
    | 'semantic_annotations'
    | 'analysis_brief'
    | 'report_context'
    | 'investigation_harness'
    | 'fallback_heuristics';
export type SteeringSignalConfidence = 'high' | 'medium' | 'low';

export interface RuntimeSemanticUnderstanding {
    businessGrains: string[];
    candidateMetrics: string[];
    timeGrains: string[];
    helperDimensions: string[];
    blockedDimensions: string[];
    detailRowPolicy: DetailRowPolicy;
    businessGlossary: string[];
    businessGrainConfidence: BusinessGrainConfidence;
    unsafeForBusinessNarrative: boolean;
    /** True when the only available business grains were fallback-promoted from helpers. */
    fallbackPromotedGrains?: boolean;
    headerSemantics?: DatasetHeaderSemantics | null;
    columnLabelingSummary?: string[];
    rowLabelingSummary?: string[];
    conflicts?: SemanticLabelConflict[];
    diagnosticModeRecommended?: boolean;
    signalSources?: AnalysisSteeringSignalSource[];
    signalConfidence?: SteeringSignalConfidence;
}

export type SteeringPairingConfidence = 'high' | 'medium';
export type SteeringPairingSource = 'shared_family' | 'semantic_context' | 'shared_family_regex_fallback' | 'semantic_context_regex_fallback';
export type SteeringPairingAction = 'block_code' | 'soft_deprioritize_code';

export interface AnalysisSteeringPairingSignal {
    codeColumn: string;
    labelColumn: string;
    pairingConfidence: SteeringPairingConfidence;
    pairingSource: SteeringPairingSource;
    action: SteeringPairingAction;
}

export type FinalSemanticBoundary = RuntimeSemanticUnderstanding;

export interface SqlEvidenceQueryPlan {
    title: string;
    queryMode: 'aggregate' | 'rowset';
    query: QueryPlan;
    intentSummary: string;
    preferredResultShape?: SqlEvidenceQueryPreferredResultShape;
    preFilter?: PreFilterClause[];
}

export type PresentationMode = 'table' | 'chart' | 'table_then_chart' | 'hidden';

export interface SqlPresentationPlan {
    title: string;
    description: string;
    presentationMode: PresentationMode;
    chartType?: ChartType;
    bindings?: SqlAnalysisBindings;
    defaultTopN?: number;
    defaultHideOthers?: boolean;
    /**
     * Set by applyPresentationSafetyFloor when a pivot-only dimension pair is detected.
     * buildAnalysisPlanFromPresentation will use this to set artifactType: 'pivot_matrix'.
     */
    pivotPresentation?: boolean;
    pivotPreference?: PivotPreference;
    pivotDecision?: PivotDecision;
    pivotRequest?: PivotMatrixConfig;
}

export interface SqlEvidenceQueryResultSummary {
    queryMode: 'aggregate' | 'rowset';
    preferredResultShape?: SqlEvidenceQueryPreferredResultShape;
    rowCount: number;
    columnCount: number;
    columns: string[];
    numericColumns: string[];
    categoricalColumns: string[];
    timeColumns: string[];
    distinctGroupCount?: number | null;
    totalValue?: number | null;
    isTimeSeriesCandidate: boolean;
    isWideCategorySet: boolean;
    hasSecondaryMetric: boolean;
    hasNegativeValues: boolean;
    previewRows: CsvRow[];
}

export type RuntimeEvidenceNextAction =
    | 'refine_query'
    | 'accept_table'
    | 'promote_to_presentation'
    | 'stop_low_value';

export interface EvidenceLoopState {
    queryPlan: SqlEvidenceQueryPlan;
    resultSummary: SqlEvidenceQueryResultSummary;
    semanticRisk: 'low' | 'medium' | 'high';
    nextBestAction: RuntimeEvidenceNextAction;
}

export type EvidenceValueGateDecision = 'pass' | 'table_only' | 'reject';
export type EvidenceValueGateReasonCode =
    | 'helper_dimension'
    | 'helper_metric'
    | 'blocked_dimension'
    | 'soft_deprioritized_dimension'
    | 'unsafe_business_narrative'
    | 'too_few_rows'
    | 'single_group_result'
    | 'fragmented_groups'
    | 'duplicate_query'
    | 'duplicate_semantic'
    | 'low_business_confidence'
    | 'dimension_value_type_mismatch'
    | 'hierarchy_contamination'
    | 'duplicate_label_contamination'
    | 'missing_detail_row_filter'
    | 'reshape_required'
    | 'low_signal_confidence'
    | 'not_chart_worthy'
    | 'zero_total_value';

export interface EvidenceValueGateResult {
    decision: EvidenceValueGateDecision;
    reasonCodes: EvidenceValueGateReasonCode[];
    detail: string;
    querySignature: string;
    semanticSignature: string;
    semanticRisk: 'low' | 'medium' | 'high';
    /** Audit trail of which signal degraded the decision (e.g. 'blocked_dimension→table_only'). */
    degradationPath?: string;
}

export interface EvidenceHarnessContext {
    preferGroupBy: string[];
    blockGroupBy: string[];
    softDeprioritizeGroupBy?: string[];
    preferredDimensions?: string[];
    blockedDimensions?: string[];
    preferredMetrics?: string[];
    blockedMetrics?: string[];
    columnRoles?: Record<string, 'structural_metadata' | 'helper_dimension' | 'repeated_bundle_member' | 'business_dimension' | 'business_metric'>;
    reportShapeClass?: ReportShapeClass;
    detailRowPolicy?: DetailRowPolicy;
    hierarchyMode?: AnalysisSteeringHierarchyMode;
    widePivotMode?: AnalysisSteeringWidePivotMode;
    signalSources?: AnalysisSteeringSignalSource[];
    signalConfidence?: SteeringSignalConfidence;
    excludeFromAggregation: string[];
    hierarchyColumn: string | null;
    parentDescriptions: string[];
    duplicateDescriptions: string[];
    /** RowClass (or equivalent) column name detected by the harness, if any. */
    detailRowColumn: string | null;
    /** The value representing detail/fact rows (e.g. "fact"), detected dynamically. */
    detailRowValue: string | null;
    detailRowFilter?: { column: string; value: string } | null;
    /**
     * Chart type to prefer when the data supports it (e.g. 'line' for continuous temporal data).
     * Set by the temporal profile harness phase. Null or absent means no preference.
     */
    promotedChartType?: 'line' | 'bar' | null;
    /**
     * Chart types that should NOT be used because the data structure makes them misleading
     * (e.g. 'line' blocked when date gaps exceed 30%). Enforced deterministically in the safety floor.
     */
    blockedChartTypes?: string[];
    /**
     * When true, the Pareto phase detected a dominant value concentration (top-N covers ≥ 80%).
     * The presentation planner should set defaultHideOthers = true regardless of rowCount.
     */
    suggestedHideOthers?: boolean;
    /** Recommended top-N for high-cardinality ranking views. */
    recommendedTopN?: number | null;
    /** True when the dataset looks like a wide pivot/cross-tab and should stay table-first. */
    widePivotShape?: boolean;
    /** Period column families detected in wide-pivot datasets (e.g. monthly columns with quarter mappings). */
    periodColumnFamilies?: Array<{
        pattern: 'monthly' | 'quarterly';
        year: string | null;
        columns: string[];
        quarterMap: Record<string, string[]>;
        ytdColumns: string[];
    }>;
    /** Columns with formatted numeric strings that still need deterministic cleanup before SQL casting. */
    formattedNumberColumns?: string[];
    /**
     * Dimension pairs where the cardinality product exceeds 100 — a flat bar chart would be
     * unreadable and the presentation should be forced to pivot/table mode instead.
     * Set by the harness crossDimensionCardinality phase.
     */
    pivotOnlyCombinations?: Array<{ dimA: string; dimB: string; product: number }>;
    /** Deterministic code/label pairing decisions produced by the harness. */
    pairingSignals?: AnalysisSteeringPairingSignal[];
    /** Canonical duplicate hint signatures for non-SQL planned tool outputs. */
    duplicateSignatureHints?: string[];
    /**
     * Harness-resolved reshape decision produced by the conflict resolution phase.
     * Consumed by deriveWidePivotMode so that downstream steering uses a structured
     * directive instead of re-deriving the decision from raw signals.
     */
    reshapeDecision?: 'reshape_required' | 'annotation_fallback' | null;
    /** Reason codes explaining how the reshape decision was reached. */
    reshapeDecisionReasons?: string[];
    /** AI-inferred human-readable labels for unnamed columns detected by the harness. */
    inferredColumnLabels?: Record<string, string>;
}

export type PendingPlan = Partial<AnalysisPlan> & { [key: string]: any; };

export type AnalysisArtifactEvidenceStatus = 'verified' | 'degraded' | 'hypothesis';

export interface AnalysisArtifactEvidenceRef {
    kind: 'dataset_version' | 'query_trace' | 'transformation' | 'metric_validation' | 'source_step' | 'analysis_card';
    id: string;
    label: string;
}

export interface AnalysisArtifactMethod {
    operation: string;
    groupByColumns: string[];
    aggregations: Array<{
        function: QueryAggregateFunction;
        column: string | null;
        alias: string;
    }>;
    sourceColumns: string[];
    filterCount: number;
    pivotRows: string[];
    pivotColumns: string[];
}

export interface AnalysisArtifactQueryEvidence {
    traceId: string;
    engine: AnalysisEngine;
    loadVersion: string | null;
    sqlPreview: string | null;
    fallbackReason: string | null;
}

export interface AnalysisArtifactProvenance {
    schemaVersion: 1;
    datasetId: string | null;
    datasetVersion: string | null;
    /** Optional schema-v1 extension used by the multi-table dataset graph. */
    tableId?: string | null;
    relationshipSetId?: string | null;
    evidenceStatus: AnalysisArtifactEvidenceStatus;
    evidenceReasons: string[];
    method: AnalysisArtifactMethod;
    queryEvidence: AnalysisArtifactQueryEvidence | null;
    /**
     * True when the artifact was produced from a structured data query and must
     * retain an exact query trace to qualify as verified evidence.
     *
     * Optional for backward compatibility with persisted schema-v1 artifacts.
     */
    queryEvidenceRequired?: boolean;
    evidenceRefs: AnalysisArtifactEvidenceRef[];
    createdAt: string;
}

export type CardTrustStatus = 'verified' | 'caveated' | 'unverified' | 'stale' | 'weak';

export type CardTrustReasonCode =
    | 'provenance_missing'
    | 'dataset_version_missing'
    | 'dataset_stale'
    | 'evidence_hypothesis'
    | 'evidence_degraded'
    | 'query_trace_missing'
    | 'quality_evaluation_missing'
    | 'quality_caveat'
    | 'quality_weak';

export interface CardTrustDecision {
    status: CardTrustStatus;
    reasonCodes: CardTrustReasonCode[];
    detail: string;
}

export interface AnalysisCardData {
    id: string;
    plan: AnalysisPlan;
    aggregatedData: CsvRow[];
    summary: LocalizedText;
    visualSummary?: LocalizedText | null;
    visuallyGrounded?: boolean;
    /** AI visual evaluation result (requires settings.enableVisualEvaluation). */
    visualEvaluation?: {
        quality: 'good' | 'acceptable' | 'poor';
        suggestedChartType?: ChartType;
        reason?: string;
    } | null;
    /** Guard flag — prevents visual evaluation from re-triggering. */
    visuallyEvaluated?: boolean;
    displayChartType: ChartType;
    isDataVisible: boolean;
    topN: number | null;
    hideOthers: boolean;
    hideZeroValueRows?: boolean;
    pivotColumnTopN?: number | null;
    pivotHideOtherColumns?: boolean;
    hiddenPivotSeriesLabels?: string[];
    disableAnimation?: boolean;
    filter?: { column: string; values: (string | number)[] };
    hiddenLabels?: string[];
    showDataLabels?: boolean;
    tableSort?: { column: string; direction: 'asc' | 'desc' } | null;
    sourceTopic?: string | null;
    sourceStepIds?: string[];
    analysisSessionRunId?: string | null;
    provenance?: AnalysisArtifactProvenance | null;
    evidenceValueGate?: (EvidenceValueGateResult & {
        evaluatedAt: string;
        source: 'evidence_value_gate_v1';
    }) | null;
    autoAnalysisEvaluation?: {
        verdict: 'trusted' | 'caveated' | 'weak';
        reasonCodes: AutoAnalysisEvaluationReasonCode[];
        detail: string;
        evaluatedAt: string;
        source: 'auto_analysis_evaluator_v1';
    } | null;
    qualityWarnings?: string[];
}

export type AutoAnalysisEvaluationReasonCode =
    | 'helper_exposure'
    | 'narrative_ineligible'
    | 'low_business_confidence'
    | 'aggregation_quality_warning'
    | 'fallback_plan'
    | 'value_gate_table_only'
    | 'value_gate_reject'
    | 'duplicate_semantic'
    | 'unsafe_business_narrative'
    | 'dimension_quality_warning'
    | 'metric_quality_warning'
    | 'unclassified_share_warning';

export type AnalysisQualitySeverity = 'info' | 'warning' | 'critical';
export type AnalysisDimensionQualityAction = 'allow' | 'avoid' | 'block';
export type AnalysisMetricQualityAction = 'allow' | 'avoid';
export type DatasetQualitySignalCode =
    | 'row_expansion_warning'
    | 'row_expansion_critical'
    | 'high_unclassified_share'
    | 'zero_trusted_cards';

export interface DimensionQualityDecision {
    column: string;
    action: AnalysisDimensionQualityAction;
    reasonCodes: string[];
    detail: string;
    missingRate: number;
    nullLikeShare: number;
    distinctCount: number | null;
}

export interface MetricQualityDecision {
    column: string;
    action: AnalysisMetricQualityAction;
    reasonCodes: string[];
    detail: string;
    missingRate: number;
    hasFormattedNumbers: boolean;
}

export interface DatasetQualitySignal {
    code: DatasetQualitySignalCode;
    severity: AnalysisQualitySeverity;
    message: string;
}

export interface AnalysisQualityGovernanceResult {
    dimensionDecisions: DimensionQualityDecision[];
    metricDecisions: MetricQualityDecision[];
    datasetSignals: DatasetQualitySignal[];
    blockedDimensions: string[];
    avoidDimensions: string[];
    avoidMetrics: string[];
    qualityHintsSummary: string;
}

export interface AnalysisGoalCandidate {
    title: string;
    description: string;
    confidence: number;
    isRecommended?: boolean;
}

export interface CardContext {
    id: string;
    title: string;
    description?: string;
    summary?: string;
    chartType?: ChartType;
    groupByColumn?: string;
    valueColumn?: string;
    aggregation?: AggregationType;
    rowCount?: number;
    aggregatedDataSample: CsvRow[];
}

export type DisplayAnalysisIrSemanticRole =
    | 'business_dimension'
    | 'repeated_bundle_member'
    | 'helper_dimension'
    | 'helper_row_index'
    | 'helper_classification'
    | 'metric_only'
    | 'fallback';

export type DisplayAnalysisIrHelperExposureLevel = 'none' | 'low' | 'medium' | 'high';
export type DisplayAnalysisIrNarrativeEligibility = 'preferred' | 'allowed_neutral' | 'avoid_if_possible';

export interface DisplayAnalysisIrSafeNarrativeLabels {
    title: string;
    dimension: string | null;
    metric: string | null;
}

export interface DisplayAnalysisIr {
    cardId: string;
    sourcePlan: AnalysisPlan;
    displayTitle: string;
    displayDescription: string;
    displayGroupLabel: string;
    displayMetricLabel: string | null;
    groupByColumn?: string;
    valueColumn?: string;
    aggregation?: AggregationType;
    aggregatedData: CsvRow[];
    aggregatedRows: number;
    isFallback: boolean;
    semanticRole: DisplayAnalysisIrSemanticRole;
    autoAnalysisVerdict?: 'trusted' | 'caveated' | 'weak' | null;
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel;
    businessMeaningConfidence: number;
    aggregationQualityFlags: string[];
    safeNarrativeLabels: DisplayAnalysisIrSafeNarrativeLabels;
    narrativeEligibility: DisplayAnalysisIrNarrativeEligibility;
    selectionScore: number;
    selectionReasons: string[];
}

export interface DisplayAnalysisNarrativeInput {
    cardId: string;
    displayTitle: string;
    displayDescription: string;
    safeNarrativeLabels: DisplayAnalysisIrSafeNarrativeLabels;
    semanticRole: DisplayAnalysisIrSemanticRole;
    autoAnalysisVerdict?: 'trusted' | 'caveated' | 'weak' | null;
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel;
    businessMeaningConfidence: number;
    aggregationQualityFlags: string[];
    narrativeEligibility: DisplayAnalysisIrNarrativeEligibility;
    selectionScore: number;
    selectionReasons: string[];
    summary: string;
    aggregatedDataSample: CsvRow[];
    aggregatedRowCount?: number;
    isFallback: boolean;
}

export interface CardReference {
    id: string;
    title: string;
    description: string;
    displayTitle?: string;
    displayDescription?: string;
    chartType: ChartType;
    groupByColumn?: string;
    valueColumn?: string;
    aggregation?: AggregationType;
    summary: LocalizedText;
    relevance: number;
    semanticRole?: DisplayAnalysisIrSemanticRole;
    helperExposureLevel?: DisplayAnalysisIrHelperExposureLevel;
    narrativeEligibility?: DisplayAnalysisIrNarrativeEligibility;
}
