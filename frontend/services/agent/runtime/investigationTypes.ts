import type {
    AnalysisSteeringPairingSignal,
    ColumnProfile,
    RuntimeSemanticUnderstanding,
    UnpivotColumnsOperation,
} from '../../../types';
import type { AnalysisColumnRole } from '../analysisColumnRoles';
import type { PeriodColumnFamily } from './periodColumnDetector';

// --- Constants ---

export const LOG_PREFIX = '[InvestigationHarness]';
export const QUERY_TIMEOUT_MS = 5000;
export const HARNESS_TIMEOUT_MS = 30_000;
/** Unique-value count above which description query uses a larger LIMIT to cap scan cost. */
export const HIGH_CARDINALITY_DESCRIPTION_THRESHOLD = 50_000;
/** Row limit used for high-cardinality description columns. */
export const HIGH_CARDINALITY_DESCRIPTION_LIMIT = 200;
/** Default row limit for description queries on normal columns. */
export const DEFAULT_DESCRIPTION_LIMIT = 50;

// --- Interfaces ---

export interface DescriptionTotal {
    description: string;
    total: number;
    rowCount: number;
}

export interface HierarchyGroup {
    parent: string;
    parentTotal: number;
    children: Array<{ description: string; total: number }>;
    coverageRatio: number;
}

export interface DuplicateLabelPair {
    descriptionA: string;
    descriptionB: string;
    total: number;
    relativeDifference: number;
}

export interface MetricRelationship {
    left: string;
    right: string;
    result: string;
    leftTotal: number;
    rightTotal: number;
    resultTotal: number;
    /** 1.0 = exact match, lower = looser */
    matchRatio: number;
}

export interface OutlierInfo {
    description: string;
    total: number;
    direction: 'high' | 'low';
    /** How many IQRs beyond the fence */
    iqrDistance: number;
}

export interface MissingColumnPattern {
    column: string;
    nullRate: number;
    blankRate: number;
    zeroRate: number;
    severity: 'moderate' | 'severe';
}

export interface TopicConstraint {
    rule: string;
    target: string;
    reason: string;
}

export interface PivotCandidate {
    rowDimension: string;
    columnDimension: string;
    metric: string;
    aggregate: 'sum' | 'count';
    crossProductSize: number;
    confidence: 'high' | 'medium';
    /** Unique value count of the row dimension — used to auto-set topN for readability. */
    rowCardinality: number;
    /** Unique value count of the column dimension. */
    columnCardinality: number;
}

/**
 * Coverage metrics for the 6 core investigation phases (hierarchy, duplicates,
 * metrics, outliers, missing-data, semantic classification). Phases skipped by
 * the time budget are counted as skipped, not failed.
 */
export interface HarnessCoverageMetric {
    /** Total core phases defined (always 6). */
    planned: number;
    /** Phases that actually ran (not skipped by the time budget). */
    attempted: number;
    /** Phases that completed without throwing. */
    succeeded: number;
    /** Phases skipped because the harness time budget was exhausted. */
    skipped: number;
    /** `succeeded / attempted`, or 1.0 when nothing was attempted. */
    successRate: number;
}

export interface ValueConcentrationResult {
    /** % of total absolute value held by the top 20% of categories (0–1) */
    top20Pct: number;
    /** True if top 20% of categories hold ≥ 80% of total value (Pareto principle) */
    isPareto: boolean;
    /** Recommended topN when Pareto is detected — shows dominant items without noise */
    recommendedTopN: number | null;
}

export interface TemporalProfile {
    /** The date column used for analysis */
    column: string;
    /** Detected data granularity derived from the modal gap between consecutive dates */
    granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'unknown';
    /** Number of missing expected periods (holes in the date sequence) */
    gapCount: number;
    /** Approximate number of expected periods over the full date span */
    spanPeriods: number;
    /** True when missing periods are ≤10% of the total span */
    isContinuous: boolean;
}

export interface DimensionCompleteness {
    /** Categorical/date/time column name */
    column: string;
    /**
     * Fraction of rows with a non-null, non-empty value (0–1).
     * Derived from ColumnProfile.missingPercentage (profiler estimate).
     */
    completenessRate: number;
    /** True when completenessRate < 0.70 — column should be deprioritized for groupBy */
    deprioritize: boolean;
}

export interface CrossDimensionCardinality {
    /** First groupBy dimension */
    dimA: string;
    /** Second groupBy dimension */
    dimB: string;
    /** Product of unique value counts (dimA.uniqueValues × dimB.uniqueValues) */
    product: number;
    /** True when product > 100 — flat bar chart becomes unreadable; pivot is preferred */
    recommendPivotOnly: boolean;
}

export interface DataInvestigationFindings {
    hierarchyGroups: HierarchyGroup[];
    duplicateLabels: DuplicateLabelPair[];
    metricRelationships: MetricRelationship[];
    outlierDescriptions: OutlierInfo[];
    missingDataPatterns: MissingColumnPattern[];
    semanticCategories: Record<string, string>;
    leafDescriptions: string[];
    parentDescriptions: string[];
    investigationSummary: string;
    topicConstraints: TopicConstraint[];
    /** Explicit topic suggestions derived from detected metric relationships. */
    suggestedDerivedTopics: string[];
    /** Value concentration / Pareto analysis for the primary metric column. */
    valueConcentration: ValueConcentrationResult | null;
    /** Temporal continuity profile when a date column is present. */
    temporalProfile: TemporalProfile | null;
    /** Cross-dimension cardinality for candidate 2D groupBy combinations. */
    crossDimensionCardinality: CrossDimensionCardinality[];
    /** Completeness rate for each candidate groupBy (categorical/date/time) column. */
    dimensionCompleteness: DimensionCompleteness[];
    /** Coverage metrics for the 8 core investigation phases. */
    coverageMetric: HarnessCoverageMetric;
    /** Canonical runtime steering bundle shared across downstream planning and evaluation. */
    analysisSteering: import('../../../types').EvidenceHarnessContext;
    // Runtime directives — harness intelligence that should directly steer
    // the analysis pipeline, not just inform the AI prompt.
    runtimeDirectives: {
        /** Dimensions safe for groupBy, ordered by quality (label > code) */
        preferGroupBy: string[];
        /** Dimensions to block from groupBy (codes when labels exist) */
        blockGroupBy: string[];
        /** Dimensions kept available but deprioritized when pairing evidence is only medium-confidence. */
        softDeprioritizeGroupBy: string[];
        /** Recommended LIMIT for high-cardinality dimensions */
        recommendedTopN: number | null;
        /** Descriptions to always exclude from SUM (parents + one side of duplicates) */
        excludeFromAggregation: string[];
        /** Column where hierarchy was detected (e.g. "Description") — used for WHERE injection */
        hierarchyColumn: string | null;
        /** RowClass (or equivalent) column name detected in the dataset, if any. */
        detailRowColumn: string | null;
        /** The value representing detail/fact rows (e.g. "fact"), detected dynamically. */
        detailRowValue: string | null;
        /** Pivot candidates detected from column cardinality and structure analysis. */
        suggestedPivots: PivotCandidate[];
        /** When true, the AI/executor should hide "Others" by default (Pareto-driven). */
        suggestedHideOthers: boolean;
        /** Chart type promoted by temporal analysis (continuous + sufficient span → 'line'). */
        promotedChartType: 'line' | 'bar' | null;
        /** Chart types blocked by temporal analysis (too many gaps → block 'line'). */
        blockedChartTypes: string[];
        /** True when the table is a wide pivot/cross-tab: many numerical columns where
         *  each column header is a category (e.g. project code, period) rather than a
         *  metric name. Row-based analysis is safe; column-dimension analysis requires
         *  explicit column selection or unpivoting. */
        widePivotShape: boolean;
        /** Period column families detected in wide-pivot datasets (e.g. monthly columns
         *  JAN 2010...DEC 2010 with quarter mappings Q1→[JAN,FEB,MAR], etc.). */
        periodColumnFamilies: PeriodColumnFamily[];
        /** Columns detected as comma-formatted numbers that need cleaning before SQL CAST. */
        formattedNumberColumns: string[];
        /** Deterministic code/label pairing evidence used by planner and telemetry. */
        pairingSignals: AnalysisSteeringPairingSignal[];
        /** Canonical analysis column roles used across planner/reporting. */
        columnRoles: Record<string, AnalysisColumnRole>;
        /** Business-safe dimensions promoted by the harness. */
        preferredDimensions: string[];
        /** Dimensions the harness wants downstream analysis to block entirely. */
        blockedDimensions: string[];
        /** Business-safe metrics promoted by the harness. */
        preferredMetrics: string[];
        /** Metrics the harness wants downstream analysis to avoid by default. */
        blockedMetrics: string[];
        /** Explicit detail-row filter contract when available. */
        detailRowFilter: { column: string; value: string } | null;
        /** Canonical duplicate hints for planned-tool signatures. */
        duplicateSignatureHints: string[];
        /** Auto-generated unpivot plan for wide-pivot period columns.
         *  null when no period families detected or conditions not met. */
        suggestedUnpivotPlan: UnpivotColumnsOperation | null;
        /** Columns excluded from the unpivot (matched TOTAL/summary patterns). */
        unpivotExcludedColumns: string[];
        /**
         * Harness-resolved reshape decision when conflicting signals are detected
         * (e.g. hierarchy + wide pivot + period columns).  Produced by the conflict
         * resolution phase so that downstream steering consumes a directive rather
         * than re-deriving the decision from raw signals.
         *
         * - 'reshape_required': period columns override hierarchy — unpivot before analysis.
         * - 'annotation_fallback': hierarchy dominates — keep wide shape, annotate only.
         * - null: no conflict detected or wide pivot not present.
         */
        reshapeDecision: 'reshape_required' | 'annotation_fallback' | null;
        /** Reason codes explaining how the reshape decision was reached. */
        reshapeDecisionReasons: string[];
        /** AI-inferred human-readable labels for unnamed columns (e.g. _unnamed_column_6 → "Currency Code"). */
        inferredColumnLabels: Record<string, string>;
    };
}

export interface DuckDbAnalysisBinding {
    tableName: string;
    loadVersion: string;
}

export const createEmptyRuntimeDirectives = (): DataInvestigationFindings['runtimeDirectives'] => ({
    preferGroupBy: [],
    blockGroupBy: [],
    softDeprioritizeGroupBy: [],
    recommendedTopN: null,
    excludeFromAggregation: [],
    hierarchyColumn: null,
    detailRowColumn: null,
    detailRowValue: null,
    suggestedPivots: [],
    suggestedHideOthers: false,
    promotedChartType: null,
    blockedChartTypes: [],
    widePivotShape: false,
    periodColumnFamilies: [],
    formattedNumberColumns: [],
    pairingSignals: [],
    columnRoles: {},
    preferredDimensions: [],
    blockedDimensions: [],
    preferredMetrics: [],
    blockedMetrics: [],
    detailRowFilter: null,
    duplicateSignatureHints: [],
    suggestedUnpivotPlan: null,
    unpivotExcludedColumns: [],
    reshapeDecision: null,
    reshapeDecisionReasons: [],
    inferredColumnLabels: {},
});
