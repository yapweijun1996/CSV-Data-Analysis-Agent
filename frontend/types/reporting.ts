import type {
    AggregationType,
    AnalysisArtifactEvidenceRef,
    AnalysisArtifactEvidenceStatus,
    CardTrustReasonCode,
    CardTrustStatus,
    DatasetQualitySignal,
    AnalysisArtifactType,
    ChartType,
    DisplayAnalysisIrHelperExposureLevel,
    DisplayAnalysisIrSemanticRole,
} from './analysis';
import type { AppView } from './app';
import type { CsvRow } from './intake';
import type { AnalysisEngine } from './querying';
import type { DataPreparationWorkflowBundle } from './inspection';
import type { LocalizedText } from './localization';

export type ReportReadiness = 'blocked' | 'partial' | 'ready';
export type ReportGenerationGate = 'blocked' | 'allowed_with_caveats' | 'allowed';
export type AnalystRole = 'data_quality' | 'business' | 'risk';
export type AnalystConfidence = 'low' | 'medium' | 'high';
export type AnalystFindingImportance = 'low' | 'medium' | 'high';
export type ForumDisagreementResolution = 'unresolved' | 'partially_resolved' | 'resolved';
export type ReportArtifactStatus = 'ready' | 'partial' | 'blocked';
export type ReportCardTrustDecision = 'included' | 'excluded';
export type ReportCardTrustReasonCode =
    | 'narrative_ineligible'
    | 'helper_exposure'
    | 'low_business_confidence'
    | 'aggregation_quality_warning'
    | 'fallback_plan'
    | 'dimension_quality_warning'
    | 'metric_quality_warning'
    | 'unclassified_share_warning'
    | 'stale_dataset_version'
    | 'unverified_provenance'
    | 'degraded_provenance';

export type ReportEvidenceKind =
    | 'dataset'
    | 'workflow'
    | 'summary'
    | 'query'
    | 'card';

export interface ReportEvidenceRef {
    id: string;
    kind: ReportEvidenceKind;
    label: string;
    source: 'derived' | 'state';
    detail: string;
}

export interface ReportStructuralSignals {
    rowExpansionRatio: number | null;
    hasMetadataRows: boolean;
    hasMultiRowHeader: boolean;
    usedFallbackContext: boolean;
}

export interface ReportCardEvidence {
    evidenceId: string;
    cardId: string;
    isFallback: boolean;
    title: string;
    displayTitle: string;
    description: string;
    artifactType: AnalysisArtifactType | null;
    chartType: ChartType;
    groupByColumn: string | null;
    valueColumn: string | null;
    aggregation: AggregationType | null;
    rowCount: number;
    summary: LocalizedText | null;
    aggregatedDataSample: CsvRow[];
    reportChartRows: CsvRow[];
    semanticRole: DisplayAnalysisIrSemanticRole | null;
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel | null;
    businessMeaningConfidence: number | null;
    aggregationQualityFlags: string[];
    sourceTopic?: string | null;
    autoAnalysisVerdict?: 'trusted' | 'caveated' | 'weak' | null;
    autoAnalysisVerdictDetail?: string | null;
    autoAnalysisReasonCodes?: string[];
    evidenceValueGateDecision?: 'pass' | 'table_only' | 'reject' | null;
    evidenceValueGateDetail?: string | null;
    evidenceValueGateReasonCodes?: string[];
    provenanceStatus?: AnalysisArtifactEvidenceStatus | 'unverified';
    provenanceDatasetVersion?: string | null;
    currentDatasetVersion?: string | null;
    provenanceIsStale?: boolean;
    provenanceReasons?: string[];
    provenanceRefs?: AnalysisArtifactEvidenceRef[];
    queryTraceId?: string | null;
    trustStatus?: CardTrustStatus;
    trustReasonCodes?: CardTrustReasonCode[];
}

export interface ReportExcludedEvidence {
    decision: ReportCardTrustDecision;
    evidenceId: string;
    cardId: string;
    title: string;
    displayTitle: string;
    detail: string;
    reasonCodes: ReportCardTrustReasonCode[];
}

export interface ReportDatasetEvidence {
    datasetVersion?: string | null;
    tableId?: string | null;
    relationshipSetId?: string | null;
    transformationRefs?: AnalysisArtifactEvidenceRef[];
    fileName: string | null;
    reportTitle: string | null;
    rawRowCount: number;
    cleanedRowCount: number;
    metadataRowCount: number;
    headerDepth: number;
    summaryRowCount: number;
    parserStrategy: string | null;
    parserConfidence: string | null;
    intakeGateStatus: 'clear' | 'warning' | 'blocked';
    preparationState: DataPreparationWorkflowBundle['summary']['preparationState'];
    analysisState: DataPreparationWorkflowBundle['summary']['analysisState'];
    reportReadiness: ReportReadiness;
    reportReadinessReason: string;
    readinessDrivers: string[];
    readinessRisks: string[];
    structuralSignals: ReportStructuralSignals;
    canAnalyze: boolean;
    cardsCount: number;
    includedCardsCount?: number;
    trustedCardsCount: number;
    caveatedCardsCount?: number;
    weakCardsCount?: number;
    caveats: string[];
    qualitySignals?: DatasetQualitySignal[];
    qualityHintsSummary?: string | null;
    reportGenerationGate: ReportGenerationGate;
    reportGenerationBlockers: string[];
}

export interface ReportWorkflowEvidence {
    topWarnings: string[];
    issueMappings: DataPreparationWorkflowBundle['issueSummary']['mappings'];
    verification: DataPreparationWorkflowBundle['verification'];
    diff: DataPreparationWorkflowBundle['diff'];
}

export interface ReportSummaryEvidence {
    coreAnalysisSummary: LocalizedText | null;
    finalSummary: LocalizedText | null;
    contextualSummary: string | null;
    coreProvenanceStatus?: AnalysisArtifactEvidenceStatus | 'stale' | 'unverified';
    finalProvenanceStatus?: AnalysisArtifactEvidenceStatus | 'stale' | 'unverified';
    coreEvidenceRefs?: AnalysisArtifactEvidenceRef[];
    finalEvidenceRefs?: AnalysisArtifactEvidenceRef[];
}

export interface ReportQueryEvidence {
    queryTraceId?: string | null;
    loadVersion?: string | null;
    hasActiveQuery: boolean;
    explanation: string | null;
    sqlPreview: string | null;
    engine: AnalysisEngine | null;
    totalMatchedRows: number | null;
    returnedRows: number | null;
    selectedColumns: string[];
}

export interface ReportEvidenceBundle {
    generatedAt: string;
    sessionId: string;
    datasetId: string | null;
    currentView: AppView;
    dataset: ReportDatasetEvidence;
    workflow: ReportWorkflowEvidence;
    summaries: ReportSummaryEvidence;
    query: ReportQueryEvidence | null;
    allCards: ReportCardEvidence[];
    cards: ReportCardEvidence[];
    includedCardIds: string[];
    excludedCardIds: string[];
    excludedEvidence: ReportExcludedEvidence[];
    evidenceCatalog: ReportEvidenceRef[];
}

export interface ReportArtifactFileMap {
    html?: string;
    ir?: string;
    memos?: string;
    forum?: string;
    bundle?: string;
    readiness?: string;
    manifest: string;
}

export interface ReportArtifactManifest {
    reportId: string;
    datasetVersion?: string | null;
    title: string;
    generatedAt: string;
    artifactStatus: ReportArtifactStatus;
    generationGate: ReportGenerationGate;
    reportReadiness: ReportReadiness;
    reportReadinessReason: string;
    trustedCardsCount: number;
    excludedEvidenceCount: number;
    gateReasons: string[];
    llmUsed: boolean;
    fallbacksUsed: string[];
    reportTemplate: 'board_pack' | 'executive_brief' | 'management_review' | 'audit_appendix';
    latestFiles: ReportArtifactFileMap;
    archiveFiles: ReportArtifactFileMap;
}

export interface ReportGenerationReadinessArtifact {
    reportId: string;
    datasetVersion?: string | null;
    title: string;
    generatedAt: string;
    reportReadiness: ReportReadiness;
    reportReadinessReason: string;
    generationGate: ReportGenerationGate;
    gateReasons: string[];
    trustedCardsCount: number;
    excludedEvidenceCount: number;
    excludedEvidence: ReportExcludedEvidence[];
}

export interface StoredReportArtifactRecord {
    reportId: string;
    generatedAt: string;
    manifest: ReportArtifactManifest;
    files: Record<string, string>;
}

export interface AnalystFinding {
    id: string;
    claim: string;
    importance: AnalystFindingImportance;
    evidenceRefs: string[];
    metricRefs: string[];
    caveat?: string;
}

export interface AnalystMemo {
    role: AnalystRole;
    headline: string;
    summary: string;
    findings: AnalystFinding[];
    blockers: string[];
    caveats: string[];
    confidence: AnalystConfidence;
    recommendedNextChecks: string[];
}

export interface ForumFinding {
    id: string;
    claim: string;
    supportedByRoles: AnalystRole[];
    evidenceRefs: string[];
    caveats: string[];
}

export interface ForumDisagreementPosition {
    role: AnalystRole;
    stance: string;
    evidenceRefs: string[];
}

export interface ForumDisagreement {
    id: string;
    topic: string;
    positions: ForumDisagreementPosition[];
    resolution: ForumDisagreementResolution;
}

export interface ForumSummary {
    consensusFindings: ForumFinding[];
    disagreements: ForumDisagreement[];
    overallConfidence: AnalystConfidence;
    executiveSummary: string;
    recommendedActions: string[];
}

/**
 * Optional data quality snapshot populated from DataInvestigationFindings when available.
 * Surfaced in the markdown report front matter and "Data Quality Summary" section.
 */
export interface ReportDataQualitySummary {
    /** Harness phases that successfully ran (e.g. 'hierarchy', 'pareto', 'temporal'). */
    harnessPhasesCovered: string[];
    /** Number of value hierarchy groups detected (parent/child label relationships). */
    hierarchyGroupCount: number;
    /** Number of duplicate label pairs detected in the description column. */
    duplicateLabelCount: number;
    /** Number of columns with notable missing data patterns. */
    missingDataPatternCount: number;
    /** True when Pareto concentration was detected (top few rows dominate the total). */
    paretoDetected: boolean;
    /** Human-readable temporal profile summary, or null if no temporal data found. */
    temporalProfileSummary: string | null;
}

export interface ReportIr {
    version: 'report_ir_v1';
    reportId: string;
    generatedAt: string;
    dataset: ReportDatasetSection;
    summary: ReportSummarySection;
    contents: ReportContentsItem[];
    kpiHighlights: ReportKpiHighlight[];
    reportVisuals: ReportVisual[];
    sections: ReportSection[];
    appendix: ReportAppendixSection;
    /** Optional data quality snapshot from the investigation harness. */
    dataQualitySummary?: ReportDataQualitySummary | null;
}

export interface ReportDatasetSection {
    title: string;
    datasetName: string | null;
    datasetVersion?: string | null;
    readiness: ReportReadiness;
    readinessReason: string;
    generationGate: ReportGenerationGate;
    generationBlockers: string[];
    workflowStatus: string;
    shapeSummary: string;
    readinessDrivers: string[];
    readinessRisks: string[];
    structuralSignals: ReportStructuralSignals;
    caveats: string[];
    trustedCardsCount: number;
    excludedEvidenceCount: number;
}

export interface ReportSummarySection {
    title: string;
    executiveSummary: string;
    executivePosition: string;
    topImplication: string;
    mainCaution: string;
    overallConfidence: AnalystConfidence;
    managementHighlights: string[];
    recommendedActions: string[];
}

export type ReportVisualChartType = 'bar' | 'line' | 'pie' | 'doughnut';
export type ReportVisualDisplayType = ReportVisualChartType | 'table';

export interface ReportChartPayload {
    chartType: ReportVisualChartType;
    title: string;
    groupByColumn: string | null;
    valueColumn: string | null;
    rows: CsvRow[];
    sortedRows: CsvRow[];
    labels: string[];
    displayLabels: string[];
    numericValues: number[];
    formattedValues: string[];
    chartNarrative: string;
    valueDomain: 'positive' | 'negative' | 'mixed';
    aggregationApplied: boolean;
    aggregatedOtherValue: number | null;
    chartWarnings: string[];
}

export interface ReportFallbackTable {
    columns: string[];
    rows: string[][];
}

export interface ReportVisual {
    cardId: string;
    title: string;
    businessTitle: string;
    topicKey: string;
    chartType: ReportVisualDisplayType;
    chartPayload: ReportChartPayload | null;
    svgMarkup: string | null;
    fallbackTable: ReportFallbackTable | null;
    whatItShows: string;
    whyItMatters: string;
    caveat: string | null;
    calloutValue: string | null;
    chartWarnings: string[];
}

export interface ReportContentsItem {
    id: string;
    label: string;
}

export interface ReportKpiHighlight {
    label: string;
    value: string;
    supportingNote: string;
    tone: 'neutral' | 'good' | 'warning' | 'danger';
}

export interface ReportFindingSection {
    type: 'findings';
    title: string;
    items: Array<{
        id: string;
        claim: string;
        importance: AnalystFindingImportance;
        supportedByRoles: AnalystRole[];
        caveats: string[];
        evidenceRefs: string[];
    }>;
}

export interface ReportDisagreementSection {
    type: 'disagreements';
    title: string;
    items: Array<{
        id: string;
        topic: string;
        resolution: ForumDisagreementResolution;
        positions: ForumDisagreementPosition[];
    }>;
}

export interface ReportEvidenceSection {
    type: 'evidence';
    title: string;
    cards: Array<{
        cardId: string;
        title: string;
        artifactType: string | null;
        whyItMatters: string;
    }>;
}

export type ReportSection =
    | ReportFindingSection
    | ReportDisagreementSection
    | ReportEvidenceSection;

export interface ReportAppendixSection {
    title: string;
    evidenceCatalog: ReportEvidenceRef[];
    excludedEvidence: ReportExcludedEvidence[];
}
