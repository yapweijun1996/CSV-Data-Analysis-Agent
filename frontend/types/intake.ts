/**
 * CSV parsing, intake detection, structural boundary identification, and core data containers.
 */

export type CsvCellValue = string | number | boolean | null;
export type CsvRow = { [key: string]: CsvCellValue };

export type CsvIntakeDetectionStrategy = 'scored_candidate' | 'papaparse_auto_fallback' | 'raw_line_fallback';
export type CsvIntakeConfidence = 'high' | 'medium' | 'low';
export type CsvIntakeWarningCode =
    | 'mixed_delimiter'
    | 'malformed_quote'
    | 'header_shape_drift'
    | 'low_confidence'
    | 'parse_errors';

export interface CsvIntakeWarning {
    code: CsvIntakeWarningCode;
    message: string;
}

export interface CsvIntakeDetectionResult {
    strategy: CsvIntakeDetectionStrategy;
    confidence: CsvIntakeConfidence;
    delimiter: string | null;
    quoteChar: string | null;
    warnings: CsvIntakeWarning[];
    candidateCount?: number;
    parserErrorCount?: number;
    sampledNonEmptyLines?: number;
    topScore?: number | null;
    runnerUpScore?: number | null;
}

export type ReportIntakeSegmentKind =
    | 'title'
    | 'subtitle'
    | 'metadata'
    | 'parameter'
    | 'header'
    | 'repeated_header'
    | 'body'
    | 'summary'
    | 'footer'
    | 'blank'
    | 'unknown';

export type ReportIntakeBodyEvidenceKind =
    | 'numeric'
    | 'summary_numeric'
    | 'dated_row_sequence'
    | 'code_date_sequence'
    | 'hierarchical_sequence'
    | 'unknown';

export interface ReportIntakeSegment {
    kind: ReportIntakeSegmentKind;
    rowStart: number;
    rowEnd: number;
    confidence: number;
    notes: string[];
}

export interface SelectedTableBoundary {
    headerRowIndex: number;
    headerLayerRowIndexes: number[];
    bodyStartIndex: number;
    summaryStartIndex: number;
    repeatedHeaderRowIndexes: number[];
    metadataRowIndexes: number[];
    parameterRowIndexes: number[];
}

/** @deprecated Use ProvisionalTableBoundary — SelectedTableBoundary is kept as an alias for migration. */
export type ProvisionalTableBoundary = SelectedTableBoundary;

export type IntakeEvidenceStrength = 'strong' | 'moderate' | 'weak' | 'none';

export interface IntakeHeaderCandidate {
    rowIndex: number;
    confidence: number;
    reason: string;
}

export interface IntakeBodyStartCandidate {
    rowIndex: number;
    confidence: number;
    evidenceKind: ReportIntakeBodyEvidenceKind;
    reason: string;
}

export type IntakeRowClassification =
    | 'blank'
    | 'title'
    | 'footer'
    | 'metadata_pair'
    | 'parameter'
    | 'header_candidate'
    | 'data_candidate'
    | 'sparse_text'
    | 'unknown';

export interface IntakeRowSignal {
    rowIndex: number;
    classification: IntakeRowClassification;
    nonEmptyCellCount: number;
    totalCellCount: number;
    numericRatio: number;
    bodyEvidenceKind: ReportIntakeBodyEvidenceKind;
}

export interface IntakePreScanSignals {
    rowSignals: IntakeRowSignal[];
    headerCandidateIndexes: number[];
    dataCandidateIndexes: number[];
    titleRowIndexes: number[];
    blankRowIndexes: number[];
    footerRowIndexes: number[];
    parameterRowIndexes: number[];
    metadataPairRowIndexes: number[];
    sparseTextRowIndexes: number[];
    /** Best deterministic header selection (current heuristic logic). */
    deterministicSelection: IntakeHeaderCandidate | null;
    deterministicConfidence: number;
    /** Deterministic summary boundary from full backward scan of all rows. */
    deterministicSummaryStartIndex?: number;
}

export interface ReportIntakeDiagnostics {
    hasRepeatedHeader: boolean;
    hasParameterRowsBetweenHeaderAndBody: boolean;
    headerShapeDrift: boolean;
    singleColumnFallbackApplied: boolean;
    bodyEvidenceKind: ReportIntakeBodyEvidenceKind;
    segmentCountsByKind: Partial<Record<ReportIntakeSegmentKind, number>>;
    /** Weak evidence: candidate header rows with confidence scores. */
    headerCandidates: IntakeHeaderCandidate[];
    /** Weak evidence: candidate body start rows with confidence scores. */
    bodyStartCandidates: IntakeBodyStartCandidate[];
    /** Overall evidence strength for the intake structural determination. */
    evidenceStrength: IntakeEvidenceStrength;
    /** Reason if intake fell back to a weaker detection path. */
    fallbackReason: string | null;
    /** Pre-scan row-level signals for AI structure detection harness. */
    preScanSignals?: IntakePreScanSignals | null;
    /** Source of the structure detection decision. */
    structureSource?: 'deterministic' | 'ai' | 'ai_fallback_deterministic';
    /** Raw AI boundary response before validation (when AI was attempted). */
    aiStructureBoundary?: AiIntakeStructureBoundary | null;
    /** Rejection reason if AI boundary was attempted but failed validation. */
    aiRejectionReason?: string | null;
    /** Whether an AI boundary was accepted after comparative quality checks. */
    aiBoundaryAccepted?: boolean;
    /** Comparative acceptance or rejection reason for the AI boundary. */
    aiBoundaryComparisonReason?: string | null;
    /** Reason deterministic intake was retained after stability tie-breaking. */
    boundaryStabilizationReason?: string | null;
    /** High-confidence analysis-view header renames derived from empty raw headers. */
    autoNamedColumns?: Array<{ from: string; to: string; reason: string }>;
    /** True when no header row exists and synthetic headers were generated (headerless file). */
    syntheticHeaderApplied?: boolean;
    /** Column indexes (0-based) where ≥30% of raw cells were zero-placeholder markers ('-, etc.). */
    zeroPlaceholderColumnIndexes?: number[];
}

export interface AiIntakeStructureBoundary {
    /** Zero-based header row index, or -1 when no header row exists (headerless file). */
    headerRowIndex: number;
    headerLayerIndexes?: number[];
    bodyStartIndex: number;
    summaryStartIndex: number;
    parameterRowIndexes?: number[];
    repeatedHeaderRowIndexes?: number[];
    confidence: number;
    reasoning: string;
    /** AI-inferred column names when no header row exists (headerRowIndex === -1). */
    syntheticHeaders?: string[];
}

export interface ReportIntakeIr {
    fileName: string;
    columnCount: number;
    rawRows: string[][];
    normalizedRows: string[][];
    detection?: CsvIntakeDetectionResult;
    segments: ReportIntakeSegment[];
    /**
     * Provisional table boundary — candidate structure, NOT confirmed.
     * Runtime inspect is the only authority that can confirm or reject this.
     * @see RuntimeTableAssessment
     */
    provisionalTable: ProvisionalTableBoundary | null;
    diagnostics: ReportIntakeDiagnostics;
}

export type StagingConfidence = 'high' | 'medium' | 'low';
export type StagingSource = 'intake_provisional' | 'runtime_confirmed' | 'runtime_rebuilt';

/**
 * Describes a dataset whose complete rows live in the DuckDB worker instead of
 * the React/Zustand heap. `CsvData.data` remains a bounded preview so existing
 * schema and presentation code can operate without materialising the full CSV.
 */
export interface CsvDatasetBacking {
    mode: 'duckdb_file';
    loadVersion: string;
    datasetVersion: string;
    rowCount: number;
    sampleRowCount: number;
    byteSize: number;
    /** Columns returned by the backing DuckDB table, before preview-only annotations. */
    columnNames?: string[];
    readOnly: true;
    ephemeral: true;
    /** Session-scoped OPFS copy used for recovery/worker hand-off when available. */
    opfsPath?: string | null;
}

export interface CsvData {
    fileName: string;
    data: CsvRow[];
    backing?: CsvDatasetBacking;
    metadataRows?: string[][];
    headerLayers?: string[][];
    summaryRows?: CsvRow[];
    headerDepth?: number;
    summaryRowCount?: number;
    intakeDetection?: CsvIntakeDetectionResult;
    /** Confidence level of this staged dataset. */
    stagingConfidence?: StagingConfidence;
    /** Source that produced this staged dataset. */
    stagingSource?: StagingSource;
    /** Whether import-time row normalization modified the staging dataset. */
    importNormalizationApplied?: boolean;
    /** Human-readable summary of import-time row normalization, if any. */
    importNormalizationSummary?: string | null;
    /** High-confidence analysis-view header renames applied after intake. */
    autoNamedColumns?: Array<{ from: string; to: string; reason: string }>;
}
