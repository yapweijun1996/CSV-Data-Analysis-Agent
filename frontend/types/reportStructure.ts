import type { CsvData, ReportIntakeIr } from './intake';
import type { RuntimeTableAssessment, RowInspectionBundle } from './data';

export type ReportRowRole =
    | 'title'
    | 'parameter'
    | 'header'
    | 'detail'
    | 'group_header'
    | 'subtotal'
    | 'summary'
    | 'note'
    | 'footer'
    | 'blank'
    | 'unknown';

export interface ReportBoundary {
    headerRowIndex: number | null;
    headerLayerRowIndexes: number[];
    bodyStartIndex: number | null;
    summaryStartIndex: number | null;
    parameterRowIndexes: number[];
    repeatedHeaderRowIndexes: number[];
}

export interface ReportBoundaryConfidence {
    header: number;
    body: number;
    summary: number;
    overall: number;
    sourceAgreement: number;
}

export interface ReportRowRoleAssignment {
    rowIndex: number;
    dataset: 'raw' | 'prepared';
    role: ReportRowRole;
    confidence: number;
    source: 'intake' | 'runtime' | 'deterministic' | 'human' | 'ai';
    notes?: string[];
}

export type ReportStructureFieldRole =
    | 'grain'
    | 'metric'
    | 'time_dimension'
    | 'identifier'
    | 'descriptor'
    | 'helper'
    | 'unknown';

export type ReportStructurePivotShape =
    | 'row_table'
    | 'wide_pivot'
    | 'statement_table'
    | 'unknown';

export interface ReportStructurePurposeProposal {
    summary: string;
    confidence: number;
}

export interface ReportStructureGrainProposal {
    columns: string[];
    description: string;
    confidence: number;
}

export interface ReportStructureFieldProposal {
    columnName: string;
    role: ReportStructureFieldRole;
    confidence: number;
    reasoning: string;
}

export interface ReportStructurePivotProposal {
    shape: ReportStructurePivotShape;
    dimensionColumns: string[];
    measureColumns: string[];
    labelColumns: string[];
    confidence: number;
}

export interface ReportStructureProposal {
    purpose: ReportStructurePurposeProposal;
    grain: ReportStructureGrainProposal;
    fields: ReportStructureFieldProposal[];
    pivot: ReportStructurePivotProposal;
    bodyRowRoles: Array<{
        rowIndex: number;
        role: ReportRowRole;
        confidence: number;
        notes?: string[];
    }>;
    carryForwardColumns: string[];
    sectionLabelColumns: string[];
    detailInclusionRoles: ReportRowRole[];
    confidence: number;
    reasoning: string;
}

export type ReportStructureProposalVerificationTier = 'pass' | 'warn' | 'fail';

export interface ReportStructureProposalVerificationIssue {
    code:
        | 'purpose_missing'
        | 'grain_missing'
        | 'grain_column_unresolved'
        | 'field_column_unresolved'
        | 'field_role_evidence_mismatch'
        | 'pivot_shape_unknown'
        | 'pivot_shape_conflict'
        | 'proposal_low_confidence'
        | 'high_impact_low_confidence'
        | 'normalization_warning';
    severity: 'warning' | 'error';
    message: string;
    columns?: string[];
}

export interface ReportStructureProposalVerification {
    tier: ReportStructureProposalVerificationTier;
    proposalConfidence: number;
    purpose: string | null;
    grainColumns: string[];
    fields: ReportStructureFieldProposal[];
    pivotShape: CanonicalizationDecision['targetShape'] | null;
    issues: ReportStructureProposalVerificationIssue[];
    accepted: boolean;
    autoApplySafe: boolean;
    requiresHumanConfirmation: boolean;
}

export interface CarryForwardColumnPolicy {
    columnName: string;
    source: 'deterministic' | 'ai' | 'human';
    reason: string;
}

export interface ReportNormalizationPlan {
    mergedHeaders: string[];
    carryForwardColumns: CarryForwardColumnPolicy[];
    sectionLabelColumns: string[];
    detailInclusionRoles: ReportRowRole[];
    excludedRoles: ReportRowRole[];
    rawRowRoleOverrides: ReportRowRoleAssignment[];
}

export interface CanonicalVerificationResult {
    passed: boolean;
    footerTotalsMatched: boolean | null;
    unresolvedMissingKeyDimensions: string[];
    warnings: string[];
    comparedFooterTotals: Record<string, {
        canonical: number;
        footer: number;
        matched: boolean;
    }>;
}

export interface CanonicalizationDecision {
    targetShape: 'row_table' | 'long_fact_table' | 'long_statement_table';
    shouldCanonicalize: boolean;
    reason: string;
}

export interface ReportStructureResolution {
    headerRowIndex: number | null;
    headerLayerRowIndexes: number[];
    bodyStartIndex: number | null;
    summaryStartIndex: number | null;
    parameterRowIndexes: number[];
    repeatedHeaderRowIndexes: number[];
    rowRoles: ReportRowRoleAssignment[];
    confidence: ReportBoundaryConfidence;
    blockingReasons: string[];
    requiresHumanReview: boolean;
    source: 'intake_provisional' | 'runtime_resolved' | 'human_confirmed' | 'ai_confirmed';
    decision: CanonicalizationDecision;
    rawIntakeBoundary: ReportBoundary | null;
    runtimeBoundary: ReportBoundary | null;
    humanBoundary: ReportBoundary | null;
    runtimeTableAssessment: RuntimeTableAssessment | null;
    rowInspection: RowInspectionBundle | null;
    proposalSource: 'none' | 'ai' | 'human';
    structureProposal: ReportStructureProposal | null;
    proposalVerification: ReportStructureProposalVerification | null;
    normalizationPlan: ReportNormalizationPlan;
    resolvedRawRowRoles: ReportRowRoleAssignment[];
    verificationSummary: CanonicalVerificationResult | null;
}

export type CanonicalizationStatus = 'idle' | 'ready' | 'needs_review' | 'failed';

export type CanonicalBuildSource = ReportStructureResolution['source'] | 'analysis_reshape';

export interface CanonicalReshapeProvenance {
    reshapedFromWidePivot: boolean;
    reshapeOperationId: string;
    reshapeAppliedAt: string;
    sourceColumnCountBefore: number;
    rowCountBefore: number;
    rowCountAfter: number;
}

export interface CanonicalBuildMeta {
    shape: CanonicalizationDecision['targetShape'];
    source: CanonicalBuildSource;
    rowCount: number;
    columnCount: number;
    lineageColumns: string[];
    summary: string;
    excludedRowCounts: Partial<Record<ReportRowRole, number>>;
    carryForwardAppliedCounts: Record<string, number>;
    footerTotalsMatched: boolean | null;
    reshapeProvenance?: CanonicalReshapeProvenance;
}

export interface CanonicalDatasetArtifact {
    canonicalCsvData: CsvData;
    canonicalSchema: string[];
    canonicalBuildMeta: CanonicalBuildMeta;
}

export type PipelineOutcomeStatus =
    | 'ready'
    | 'needs_structure_review'
    | 'blocked_by_intake'
    | 'blocked_by_shape_verification'
    | 'blocked_by_sql_precheck'
    | 'degraded_but_usable'
    | 'cleaning_failed';

export interface PipelineOutcome {
    status: PipelineOutcomeStatus;
    canAutoAnalyze: boolean;
    severity: 'info' | 'warning' | 'blocked';
    reasonCode: string;
    message: string;
}

export interface ResolveReportStructureInput {
    rawCsvData: CsvData | null | undefined;
    csvData: CsvData | null | undefined;
    rawIntakeIr: ReportIntakeIr | null | undefined;
    runtimeTableAssessment?: RuntimeTableAssessment | null | undefined;
    rowInspection?: RowInspectionBundle | null | undefined;
    humanBoundary?: ReportBoundary | null | undefined;
    structureProposal?: ReportStructureProposal | null | undefined;
    shapeFailureSignalKey?: string | null | undefined;
    shapeVerificationPassed?: boolean | null | undefined;
}
