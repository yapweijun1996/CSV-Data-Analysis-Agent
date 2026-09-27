/**
 * Runtime assessment, row inspection, and data preparation context types.
 *
 * Core data types have been split into domain-specific files:
 * - intake.ts — CSV parsing, boundaries, CsvData
 * - semantics.ts — Semantic annotation, dataset roles
 * - operations.ts — Data operations, cleaning programs, DataPreparationPlan
 * - querying.ts — Query planning, workspace queries
 * - validation.ts — Numeric reconciliation, SQL pre-check
 */

import type { CsvRow } from './intake';
import type { CleaningStrategyRequirement } from './operations';

export type RuntimeAssessmentStatus = 'confirmed' | 'ambiguous' | 'rejected';

export interface RuntimeTableAssessment {
    source: 'raw_inspect';
    status: RuntimeAssessmentStatus;
    headerRowIndex: number;
    headerLayerRowIndexes: number[];
    bodyStartIndex: number;
    summaryStartIndex: number;
    repeatedHeaderRowIndexes: number[];
    parameterRowIndexes: number[];
    noiseRowIndexes: number[];
    requiresReshape: boolean;
    requiresCleanupOnly: boolean;
    reason: string;
}

export type RowInspectionRole =
    | 'detail'
    | 'group_header'
    | 'summary_like'
    | 'note'
    | 'blank'
    | 'unknown';

export type RowInspectionSource = 'deterministic' | 'ai';

export interface RowInspectionSignal {
    nonEmptyCellCount: number;
    totalCellCount: number;
    numericDensity: number;
    textDensity: number;
    descriptorDensity: number;
    summaryTokenHit: boolean;
    sparseRowScore: number;
    contextPosition: number;
    repeatedHeaderEcho?: boolean;
    singletonLongTextNoise?: boolean;
    sparseCurrencyTotal?: boolean;
    sparseNumericSummary?: boolean;
    /** Structural: singleton long text at document edge. */
    structuralNoteHit?: boolean;
    /** Structural: sum-verification matched (subtotal/grand-total). */
    structuralSumVerificationHit?: boolean;
}

export interface RowInspectionResult {
    rowIndex: number;
    rowRole: RowInspectionRole;
    confidence: number;
    source: RowInspectionSource;
    signals: RowInspectionSignal;
    sourceRowClassCandidate?: string | null;
    sampleValues?: string[];
}

export interface RowInspectionBundle {
    generatedAt: string;
    fileName: string | null;
    source: 'raw' | 'cleaned';
    stagingTableName: string;
    stagingColumns: string[];
    totalRows: number;
    inspectedRowCount: number;
    focusRowIndexes: number[];
    countsByRole: Record<RowInspectionRole, number>;
    residualUnknownRowIndexes: number[];
    residualSummaryLikeRowIndexes: number[];
    rows: RowInspectionResult[];
}

export interface CleaningLoopIterationRecord {
    round: number;
    inspectionStatus: 'pending' | 'completed' | 'failed';
    rowCountBefore: number;
    rowCountAfter: number;
    droppedRowIndexes: number[];
    residualUnknownRowCount: number;
    residualSummaryLikeRowCount: number;
    usedAi: boolean;
    verificationPassed: boolean;
    verificationReason: string | null;
    failureSignalKey: string | null;
    recoveryPath: 'none' | 'deterministic_cleanup' | 'deterministic_reshape' | 'ai_retry' | 'sandbox_js' | 'sandbox_python';
    noiseLeakageRate: number | null;
    repeatedHeaderLeakageRate: number | null;
    artifactPaths: string[];
    summary: string;
}

export interface DataPreparationRuntimeContext {
    rowInspection?: RowInspectionBundle | null;
    residualRowsPreview?: CsvRow[];
    priorVerificationFailures?: string[];
    allowedOperationTypes?: string[];
    disallowedStrategyRequirements?: CleaningStrategyRequirement[];
    iterationContext?: {
        round: number;
        maxRounds: number;
        inspectionSummary: string;
    };
}

export interface DataPreparationPlanGenerationOptions {
    maxAttempts?: number;
    allowInternalRetry?: boolean;
    allowDeterministicFallback?: boolean;
    allowHierarchyAnnotationFallback?: boolean;
    abortSignal?: AbortSignal;
}
