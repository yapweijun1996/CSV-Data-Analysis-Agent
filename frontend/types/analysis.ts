import type { CsvRow } from './intake';
import type { DatasetHeaderSemantics, SemanticLabelConflict } from './semantics';
import type { AnalysisEngine, QueryPlan, QueryAggregateFunction } from './querying';
import type { PreFilterClause } from './preFilter';
import type { LocalizedText } from './localization';
import type { PeriodGrain } from './reportStructure';

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

/** Whether a numeric column's values can be summed, as judged by Pi and checked by the app. */
export interface ColumnAdditivity {
    kind: 'additive' | 'non_additive';
    /** `identifier` marks a number that labels an item (an ID, code or address number) rather than measuring a quantity. */
    nature: 'flow' | 'stock' | 'ratio' | 'unit_value' | 'identifier' | 'other';
    rationale: string;
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
    /** Set when the column proves the European number style (`1.234,56`). Such a column must
     *  never be comma-stripped; its ambiguous cells (`4.567`) read as thousands. */
    numberFormat?: 'decimal_comma';
    /** True when the column is typed numerical but raw values contain apostrophe-prefixed
     *  numbers (e.g. "'-852.81"). DuckDB cannot CAST these directly;
     *  replace_values must strip the leading apostrophe first. */
    hasApostrophePrefixedNumbers?: boolean;
    /** Pi's additivity judgement (flow, stock, ratio, unit value). When set it replaces the column-name keyword guess. */
    additivity?: ColumnAdditivity;
}


/** One question Pi chose to investigate, already checked against the dataset's columns. */
export interface ResearchPlanQuestion {
    title: string;
    rationale: string;
    dimension: string | null;
    metric: string | null;
    aggregation: AggregationType | null;
    comparison: string | null;
    /** True when Pi stated that a SUM question is explicitly about total volume or value. */
    totalIntent?: boolean;
    /** Exact series value Pi named for a melted period-series table. */
    series?: string;
    /** Row filter the app attached so the question reads only comparable rows (one series, or detail rows). */
    filter?: { column: string; value: string };
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
    /** Host-owned presentation constraint; chart bindings remain available for query provenance. */
    presentationMode?: PresentationMode;
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
    /**
     * Direction in which the evidence query ranked the measure. 'asc' keeps the
     * lowest groups first in the chart, the top-N window and the KPI headline.
     * Absent means the historical largest-first ranking.
     */
    rankDirection?: 'asc' | 'desc';
    /**
     * Set on cards of a melted period-series table when the card is created.
     * The stored period is the ISO first day (2025-01-01), so display needs the
     * grain to show "2025" or "Aug 2026"; the selected series names the measure.
     */
    periodSeries?: AnalysisPlanPeriodSeries;
}

export interface AnalysisPlanPeriodSeries {
    periodColumn: string;
    periodGrain: PeriodGrain;
    /** Series key the card's filter selects (`DataSeries = X`); null when it reads several series or none. */
    seriesName: string | null;
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
    | 'zero_total_value'
    /** A SUM ranking that mirrors the groups' row counts, without a stated total-volume intent. */
    | 'volume_driven_sum'
    /** The same volume-driven ranking where the question explicitly asked for a total; informational only. */
    | 'volume_driven_total'
    /** A leading group of the ranking rests on very few source rows; a caveat, not a rejection. */
    | 'small_group_leader'
    /** Aggregates a series-dependent measure across series not verified to share a unit; rejected. */
    | 'cross_series_aggregate'
    /** Sums a series-dependent measure over a published total and its own components; rejected. */
    | 'series_hierarchy_double_count'
    /** Compares series not verified to share a unit on one axis; kept as a table. */
    | 'mixed_unit_series_comparison'
    /** Shows a published total next to its own components; kept as a table. */
    | 'series_hierarchy_mix'
    /** Counts records per series or period of a melted table, which only reflects publication coverage. */
    | 'series_record_count';

/** A leading group whose value is computed from very few source rows. */
export interface EvidenceSmallGroupLeader {
    label: string;
    rows: number;
    /** 1-based position in the card's ranking direction. */
    rank: number;
}

export interface EvidenceSampleSizeCaveat {
    leaders: EvidenceSmallGroupLeader[];
    /** Median source rows per compared group. */
    medianGroupRows: number;
    /** Groups with fewer rows than this are flagged. */
    minAdequateRows: number;
}

export interface EvidenceValueGateResult {
    decision: EvidenceValueGateDecision;
    reasonCodes: EvidenceValueGateReasonCode[];
    detail: string;
    querySignature: string;
    semanticSignature: string;
    semanticRisk: 'low' | 'medium' | 'high';
    /** Audit trail of which signal degraded the decision (e.g. 'blocked_dimension→table_only'). */
    degradationPath?: string;
    /** Present when leading groups rest on very few rows; the card shows it as a visible caveat. */
    sampleSizeCaveat?: EvidenceSampleSizeCaveat;
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

/** One numeric column whose two independent readings disagree. */
export interface NumericParseFinding {
    column: string;
    /** What disagreed: the column total or its median. */
    kind: 'sum' | 'median';
    /** Sum of the column parsed from the original imported text. */
    sourceSum: number | null;
    /** Sum the query engine computes over the loaded column (what the cards use). */
    loadedSum: number | null;
    /** loadedSum / sourceSum; null when either side is missing or the source sum is 0. */
    ratio: number | null;
    sourceMedian: number | null;
    loadedMedian: number | null;
}

/**
 * Result of comparing every numeric column of the loaded dataset against the
 * original imported text. A mismatch means a cleaning, canonicalization or SQL
 * step changed the numbers, so cards that aggregate the column must not be
 * shown as verified.
 */
export interface NumericParseCheck {
    /** Semantic dataset version the check ran on; a check for another version is ignored. */
    datasetVersion: string | null;
    status: 'passed' | 'mismatch' | 'skipped';
    checkedColumns: string[];
    findings: NumericParseFinding[];
    /** Why the check was skipped, in English for the technical details. */
    note: string | null;
    durationMs: number;
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
    /** Set when a column this artifact aggregates failed the numeric parse reconciliation. */
    numericParseMismatch?: { columns: string[]; findings: NumericParseFinding[] };
    /**
     * How a narrative (final summary) was written. Absent on cards and on summaries saved
     * before this was recorded. `ai_summary` is the AI text that passed the evidence checks;
     * the other two are text the app read from the verified cards itself.
     */
    narrativeSource?: 'ai_summary' | 'evidence_fallback' | 'deterministic';
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
    | 'quality_weak'
    | 'numeric_parse_mismatch';

export interface CardTrustDecision {
    status: CardTrustStatus;
    reasonCodes: CardTrustReasonCode[];
    detail: string;
}

/**
 * What the rows of a ranked additive card (SUM or COUNT per group) cover,
 * recorded when its evidence query ran. The query returns at most `limit`
 * groups, so the rows alone cannot give the total over every group.
 */
export interface AnalysisCardGroupCoverage {
    /** `complete`: the rows are every group the query matched. `partial`: the query limit cut groups off. */
    status: 'complete' | 'partial';
    /** Groups the query matched before its row limit; null when unknown. */
    groupCount: number | null;
    /**
     * The aggregate over every matched group, measured by a companion query
     * with the same filters and no grouping or limit. Null when a partial
     * result could not be measured: no share or overall total may be shown then.
     */
    overallTotal: number | null;
}

export interface AnalysisCardData {
    id: string;
    plan: AnalysisPlan;
    aggregatedData: CsvRow[];
    /** The aggregation inferred a companion unit column; it was not confirmed. */
    unitInferred?: boolean;
    /** Absent on cards saved before coverage was recorded and on cards whose rows are aggregated in the client. */
    groupCoverage?: AnalysisCardGroupCoverage | null;
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
    | 'unclassified_share_warning'
    | 'volume_driven_aggregate'
    | 'small_sample_leader'
    | 'tied_leading_values'
    | 'cross_series_aggregate'
    | 'series_scope_warning';

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
    periodSeries?: AnalysisPlanPeriodSeries;
    rowCount?: number;
    /** Present when the rows are only the top of a ranking: the total over all groups, or that it is unknown. */
    scopeNote?: string;
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
    /** Present when the rows are only the top of a ranking: the total over all groups, or that it is unknown. */
    scopeNote?: string;
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
