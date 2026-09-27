/**
 * Semantic annotation types for dataset roles, column roles, and row roles.
 */

import type { RuntimeSemanticUnderstanding } from './analysis';
import type { ReportStructureResolution } from './reportStructure';

export type ReportContextConfidence = 'high' | 'medium' | 'low';

export interface AiExtractedReportContext {
    reportTitle: string | null;
    reportDescription: string;
    parameterLines: string[];
    footerLines: string[];
    candidateHeaderLine: string[] | null;
    confidence: ReportContextConfidence;
    reasoning: string;
}

export interface ResolvedReportContext {
    sourceFile: string | null;
    reportTitle: string | null;
    reportDescription: string | null;
    parameterLines: string[];
    footerLines: string[];
    candidateHeaderLine: string[] | null;
    notes: string[];
    source: 'ai' | 'fallback';
    confidence?: ReportContextConfidence | null;
}

export interface ReportContextVerification {
    passed: boolean;
    usedFallback: boolean;
    reason: string | null;
    aiConfidence: ReportContextConfidence | null;
    issues: string[];
}

export interface ReportContextResolution {
    aiExtracted: AiExtractedReportContext | null;
    fallback: ResolvedReportContext;
    effective: ResolvedReportContext;
    verification: ReportContextVerification;
    generatedAt: string;
}

export type DatasetSemanticRole = 'detail_table' | 'summary_report' | 'mixed_report' | 'unknown';

export type SemanticConfidenceBand = 'high' | 'medium' | 'low';
export type SemanticEvidenceSource =
    | 'ai_prompt_context'
    | 'sample_values'
    | 'type_profile'
    | 'report_context'
    | 'deterministic_pattern';
export type SemanticLabelingSource = 'ai' | 'deterministic' | 'merged';

export type SemanticRowRole =
    | 'detail'
    | 'subtotal'
    | 'grand_total'
    | 'group_header'
    | 'footer'
    | 'note'
    | 'bucket'
    | 'noise'
    | 'unknown';

export type SemanticColumnRole =
    | 'business_entity'
    | 'business_dimension'
    | 'metric'
    | 'time_dimension'
    | 'descriptor'
    | 'code'
    | 'helper_dimension'
    | 'note'
    | 'unknown'
    | 'entity'
    | 'date'
    | 'label';

export type HeaderSemanticRole = 'grain' | 'metric' | 'helper' | 'filter_scope' | 'unknown';
export type ReportSemanticType =
    | 'financial_statement'
    | 'project_report'
    | 'operational_report'
    | 'detail_listing'
    | 'unknown';

export interface HeaderRoleHint {
    headerValue: string;
    role: HeaderSemanticRole;
    confidence: number;
    reason: string;
}

export interface HeaderScopeHints {
    period?: string | null;
    businessUnit?: string | null;
    region?: string | null;
    scenario?: string | null;
}

export interface DatasetHeaderSemantics {
    reportTitle: string | null;
    reportType: ReportSemanticType;
    headerRoleHints: HeaderRoleHint[];
    scopeHints: HeaderScopeHints;
    businessTerminology: string[];
    headerConfidence: number;
    confidenceBand?: SemanticConfidenceBand;
    evidenceSources?: SemanticEvidenceSource[];
    conflictDetected?: boolean;
    reason: string;
}

export interface SemanticLabelConflict {
    targetType: 'row' | 'column' | 'header';
    targetKey: string;
    aiValue: string | null;
    deterministicValue: string | null;
    resolvedValue: string;
    severity: 'info' | 'warn';
    reason: string;
}

export interface RowSemanticAnnotation {
    rowIndex: number;
    rowRole: SemanticRowRole;
    confidence: number;
    reason: string;
    confidenceBand?: SemanticConfidenceBand;
    evidenceSources?: SemanticEvidenceSource[];
    conflictDetected?: boolean;
    labelingSource?: SemanticLabelingSource;
    excludeFromDefaultAnalysis?: boolean;
    unsafeForNarrative?: boolean;
}

export interface ColumnSemanticAnnotation {
    columnName: string;
    semanticRole: SemanticColumnRole;
    confidence: number;
    reason: string;
    rawHeader?: string;
    businessLabel?: string | null;
    sampleValueHints?: string[];
    isPrimaryGrainCandidate?: boolean;
    isMetricCandidate?: boolean;
    isBusinessSafe?: boolean;
    confidenceBand?: SemanticConfidenceBand;
    evidenceSources?: SemanticEvidenceSource[];
    conflictDetected?: boolean;
}

export interface SemanticAnalysisView {
    mode: 'soft_exclude';
    includedRowIndices: number[];
    excludedRowIndices: number[];
    includedRowCount: number;
    excludedRowCount: number;
    reason: string;
}

export interface PreparedStructureUnderstanding {
    source: ReportStructureResolution['source'];
    purpose: string | null;
    grainColumns: string[];
    fieldRoles: Array<{
        columnName: string;
        role: string;
        confidence: number;
    }>;
    targetShape: ReportStructureResolution['decision']['targetShape'];
    verificationTier: NonNullable<ReportStructureResolution['proposalVerification']>['tier'] | 'deterministic';
    requiresHumanReview: boolean;
    issueCodes: string[];
}

export interface DatasetSemanticSnapshot {
    datasetRole: DatasetSemanticRole;
    rowAnnotations: RowSemanticAnnotation[];
    columnAnnotations: ColumnSemanticAnnotation[];
    headerSemantics?: DatasetHeaderSemantics | null;
    labelingConflicts?: SemanticLabelConflict[];
    mergedSemanticBoundary?: RuntimeSemanticUnderstanding | null;
    /** Present on newly prepared datasets; optional for persisted v8 snapshots. */
    structureUnderstanding?: PreparedStructureUnderstanding | null;
    recommendedAnalysisView: SemanticAnalysisView;
    summary: string;
    generatedAt: string;
    modelId: string;
    sourceDatasetVersion: string;
}

export type CleaningStrategy = 'simple_detail_strategy' | 'report_shape_strategy';

export interface CleaningSemanticIntent {
    reportShape: string;
    headerDepth: number;
    descriptorColumns: string[];
    identifierColumns: string[];
    valueSeriesColumns: string[];
    labelLayers: string[];
    summaryRowPolicy: 'exclude_non_detail_rows' | 'preserve_all_rows';
    targetShape: 'row_table' | 'long_fact_table' | 'long_statement_table';
    preserveHierarchy: boolean;
    preserveSourceCoordinates: boolean;
    summary: string;
}

export type SemanticSnapshotStatus = 'idle' | 'running' | 'ready' | 'fallback' | 'error';
