/**
 * Numeric reconciliation, SQL pre-check, label normalization, and operation validation types.
 */

import type { AiCleaningStepMode, DataOperation } from './operations';

export type MetricValidationTier = 'pass' | 'warn' | 'fail';

export interface DerivedMetricDeclaration {
    metricName: string;
    formula: string;
    operation: string;
    sourceColumns: string[];
    grain: string[];
    units: string;
    assumptions: string[];
    businessMeaning: string;
}

export interface DerivedMetricValidationSignal {
    code:
        | 'input_availability'
        | 'numeric_behavior'
        | 'denominator_safety'
        | 'reconciliation';
    status: MetricValidationTier;
    message: string;
    measuredRate?: number;
    passThreshold?: number;
    warnThreshold?: number;
}

export interface DerivedMetricEvidenceReference {
    kind: 'dataset_version' | 'operation' | 'validation';
    id: string;
    label: string;
}

export interface DerivedMetricValidationArtifact {
    artifactType: 'derived_metric_validation';
    operationId: string;
    declaration: DerivedMetricDeclaration;
    status: MetricValidationTier;
    requiresConfirmation: boolean;
    signals: DerivedMetricValidationSignal[];
    evidenceReferences: DerivedMetricEvidenceReference[];
}

export interface NumericFingerprint {
    column: string;
    parsedCount: number;
    parseRate: number;
    nullCount: number;
    blankCount: number;
    zeroCount: number;
    negativeCount: number;
    min: number | null;
    max: number | null;
    sum: number;
    absoluteSum: number;
    distinctCount: number;
}

export interface NumericReconciliationFailure {
    stepId: string;
    column: string;
    reason:
        | 'missing_after_lossless'
        | 'missing_after_reshape'
        | 'numeric_mismatch'
        | 'unsupported_reshape'
        | 'invalid_destructive_report';
    expected?: Partial<NumericFingerprint>;
    actual?: Partial<NumericFingerprint>;
    detail?: string;
}

export interface NumericDestructiveImpact {
    stepId: string;
    rowsRemoved: number;
    affectedColumns: Array<{
        column: string;
        sumDelta: number;
        absoluteSumDelta: number;
        parsedCountDelta: number;
    }>;
}

export interface NumericStepReconciliation {
    stepId: string;
    mode: AiCleaningStepMode;
    passed: boolean;
    failures: NumericReconciliationFailure[];
    destructiveImpact?: NumericDestructiveImpact | null;
}

export interface NumericReconciliationReport {
    passed: boolean;
    baselineFingerprints: NumericFingerprint[];
    finalFingerprints: NumericFingerprint[];
    steps: NumericStepReconciliation[];
    failures: NumericReconciliationFailure[];
    destructiveImpacts: NumericDestructiveImpact[];
}

export interface SqlPrecheckFinding {
    kind:
        | 'null_heavy_metric'
        | 'constant_metric'
        | 'zero_total_metric'
        | 'flat_grouped_metric'
        | 'low_distinct_dimension'
        | 'parse_failures_remaining'
        | 'high_fragmentation'
        | 'no_viable_candidates';
    severity: 'warn' | 'block';
    message: string;
    column?: string;
    metric?: string;
    dimension?: string;
    detail?: Record<string, unknown>;
}

export interface SqlPrecheckCandidatePair {
    dimension: string;
    metric: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
}

export interface SqlPrecheckEvaluatedPair extends SqlPrecheckCandidatePair {
    verificationStatus: 'viable' | 'quality_warning' | 'query_failed';
    verificationMessage: string;
    recommendedForPlanning: boolean;
    findingKinds: SqlPrecheckFinding['kind'][];
}

export interface SqlPrecheckPlannerGuidance {
    nextAction:
        | 'continue_sql_analysis'
        | 'continue_with_degraded_guidance'
        | 'retry_with_verified_pairs_only'
        | 'pause_for_manual_review'
        | 'skip_sql_gate';
    summary: string;
    preferredPairs: SqlPrecheckEvaluatedPair[];
    rejectedPairs: SqlPrecheckEvaluatedPair[];
}

export interface SqlPrecheckReport {
    status: 'passed' | 'warning' | 'blocked';
    summary: string;
    findings: SqlPrecheckFinding[];
    evaluatedPairs?: SqlPrecheckEvaluatedPair[];
    plannerGuidance?: SqlPrecheckPlannerGuidance;
}

export interface LabelNormalizationAppliedCluster {
    column: string;
    canonicalValue: string;
    replacedValues: string[];
    rowCount: number;
}

export interface LabelNormalizationDeferredSuggestion {
    column: string;
    suggestedCanonicalValue: string;
    candidateValues: string[];
    reason: string;
}

export interface LabelNormalizationMetadata {
    appliedColumns: string[];
    appliedReplacementCount: number;
    appliedClusters: LabelNormalizationAppliedCluster[];
    deferredSuggestions: LabelNormalizationDeferredSuggestion[];
    summary: string;
}

export interface DataOperationValidationResult<T extends DataOperation = DataOperation> {
    operation: T | null;
    errors: string[];
}

export interface DataOperationManifest<T extends DataOperation = DataOperation> {
    type: T['type'];
    stages: Array<'cleaning' | 'analysis'>;
    schema: Record<string, unknown>;
    requiredFields: string[];
    summarize: () => string;
    normalize: (value: unknown) => DataOperationValidationResult<T>;
}
