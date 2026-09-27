import type { AgentEvent, AgentToolLogEntry } from './agent';
import type { ColumnDecision, SchemaSnapshot } from '../services/data/dataProfiler';
import type { ColumnProfile } from './analysis';
import type { TelemetryEvent } from './app';
import type { CsvRow, CsvIntakeConfidence, CsvIntakeDetectionStrategy, CsvIntakeWarning, ReportIntakeBodyEvidenceKind, ReportIntakeSegmentKind } from './intake';
import type { DataOperation } from './operations';
import type { AnalysisEngine, QueryPlan, QueryOrderByClause } from './querying';
import type { LabelNormalizationMetadata, SqlPrecheckFinding } from './validation';
import type { ReportContextResolution } from './semantics';
import type { CleaningLoopIterationRecord, RowInspectionBundle } from './data';
import type { SpreadsheetFilterObservation, SpreadsheetFilterOrigin } from './spreadsheet';
import type { ReportShapeProfile, ReshapeHypothesis, VerificationReport } from './reportShape';
import type {
    CanonicalBuildMeta,
    CanonicalizationStatus,
    PipelineOutcome,
    ReportBoundary,
    ReportBoundaryConfidence,
    ReportStructureResolution,
} from './reportStructure';
import type { RuntimeEventContractDetail } from './runtime';

export interface InspectionSample {
    totalRows: number;
    columns: string[];
    rows: CsvRow[];
    truncated: boolean;
}

export interface CleaningInspectionLogEntry {
    id: string;
    timestamp: string;
    phase: AgentEvent['phase'];
    step: string;
    status: AgentEvent['status'];
    message: string;
    detail?: Record<string, unknown>;
    traceContract?: RuntimeEventContractDetail;
    correlation?: {
        sessionId: string | null;
        datasetId: string | null;
        turnId: string | null;
        stepId: string | null;
        cleaningRunId: string | null;
        requestId: string | null;
    };
}

export interface CleaningInspectionTelemetryEntry {
    id: string;
    timestamp: string;
    stage: string;
    responseType: string;
    detail?: string;
    meta?: Record<string, unknown>;
    traceContract?: RuntimeEventContractDetail;
    correlation?: CleaningInspectionLogEntry['correlation'];
}

export interface CleaningInspectionToolLogEntry {
    id: string;
    timestamp: string;
    tool: AgentToolLogEntry['tool'];
    description: string;
    detail?: Record<string, unknown>;
    traceContract?: RuntimeEventContractDetail;
    correlation?: CleaningInspectionLogEntry['correlation'];
}

export interface CleaningInspectionIntakeDiagnostics {
    available: boolean;
    fileName: string | null;
    strategy: CsvIntakeDetectionStrategy | null;
    confidence: CsvIntakeConfidence | null;
    delimiter: string | null;
    quoteChar: string | null;
    warnings: CsvIntakeWarning[];
    candidateCount: number | null;
    parserErrorCount: number | null;
    sampledNonEmptyLines: number | null;
    topScore: number | null;
    runnerUpScore: number | null;
    rawRowCount: number;
    cleanedRowCount: number;
    metadataRowCount: number;
    headerDepth: number;
    summaryRowCount: number;
    selectedHeaderRowIndex: number | null;
    bodyStartIndex: number | null;
    summaryStartIndex: number | null;
    parameterRowCount: number;
    repeatedHeaderRowCount: number;
    segmentCountsByKind: Partial<Record<ReportIntakeSegmentKind, number>>;
    singleColumnFallbackApplied: boolean;
    /** True when no header row exists and synthetic headers were generated (headerless file). */
    syntheticHeaderApplied: boolean;
    bodyEvidenceKind: ReportIntakeBodyEvidenceKind;
    aiBoundaryAccepted: boolean | null;
    aiBoundaryComparisonReason: string | null;
    aiRejectionReason: string | null;
    autoNamedColumns: Array<{ from: string; to: string; reason: string }>;
    importNormalizationApplied: boolean;
    importNormalizationSummary: string | null;
    // IR-first cleaning gate diagnostics
    irStableSingleLayerDetail: boolean | null;
    irAllowsDeterministicCleanup: boolean | null;
    irAllowsDeterministicReshape: boolean | null;
    irRequiresInspectFirst: boolean | null;
    irRoutingReason: string | null;
    // Intake provisional evidence
    intakeProvisionalHeaderRowIndex: number | null;
    intakeEvidenceStrength: string | null;
    // Runtime confirmed structure
    runtimeConfirmedHeaderRowIndex: number | null;
    runtimeConfirmedBodyStartIndex: number | null;
    runtimeRequiresReshape: boolean | null;
    runtimeRequiresCleanupOnly: boolean | null;
    runtimeAssessmentStatus: string | null;
    runtimeAssessmentReason: string | null;
    // Routing authority
    cleaningRoutingAuthority: 'runtime_confirmed_structure' | 'intake_provisional' | null;
}

export interface CleaningInspectionBundle {
    session: {
        sessionId: string;
        currentView: string;
        generatedAt: string;
        datasetId: string | null;
    };
    importFacts: {
        fileName: string | null;
        rawRowCount: number;
        cleanedRowCount: number;
        metadataRowCount: number;
        headerDepth: number;
        summaryRowCount: number;
        parserStrategy: string | null;
        parserConfidence: string | null;
        detectedDelimiter: string | null;
        detectedQuoteChar: string | null;
        parserWarnings: string[];
    };
    intakeDiagnostics: CleaningInspectionIntakeDiagnostics;
    profiling: {
        originalSchema: SchemaSnapshot;
        outputSchema: ColumnProfile[];
        detectedIssues: string[];
        columnEvaluation: {
            keepColumns: { name: string; role: string }[];
            dropColumns: ColumnDecision[];
        } | null;
    };
    reportShape: {
        profile: ReportShapeProfile | null;
        hypotheses: ReshapeHypothesis[];
    };
    reportContext: ReportContextResolution;
    rowInspection: {
        latest: RowInspectionBundle | null;
        inspectionStatus: 'pending' | 'completed' | 'failed' | null;
        residualUnknownRowCount: number;
        residualSummaryLikeRowCount: number;
    };
    loopHistory: CleaningLoopIterationRecord[];
    cleaning: {
        status: 'not_started' | 'schema_only' | 'operations' | 'inconsistent' | 'legacy_js' | 'no_ai_cleaning';
        planStatus: 'operations' | 'schema_only' | 'inconsistent' | null;
        consistencyIssues: string[];
        explanation: string | null;
        outputColumns: ColumnProfile[];
        operations: DataOperation[];
        operationCount: number;
        normalizedPlaceholderColumns: string[];
        numericStringNormalizedColumns: string[];
        derivedFromWorkspaceEdits: boolean;
        workspaceEditCount: number;
        baselineNoiseRowsRemoved: number;
        legacyJsPreview: string | null;
        labelNormalization: LabelNormalizationMetadata | null;
        contextDiagnostics: CleaningInspectionTelemetryEntry[];
    };
    spreadsheetFilter: {
        requestId: string | null;
        origin: SpreadsheetFilterOrigin | null;
        query: string | null;
        finalReply: string | null;
        operation: DataOperation | null;
        observation: SpreadsheetFilterObservation | null;
        active: boolean;
    };
    dataQuery: {
        active: boolean;
        explanation: string | null;
        plan: QueryPlan | null;
        engine: AnalysisEngine | null;
        sqlPreview: string | null;
        tableName: string | null;
        loadVersion: string | null;
        fallbackReason: string | null;
        totalMatchedRows: number;
        returnedRows: number;
        truncated: boolean;
        selectedColumns: string[];
        appliedOrderBy: QueryOrderByClause[];
        durationMs: number | null;
    };
    execution: {
        rowCountBefore: number;
        rowCountAfter: number;
        rowCountDelta: number;
        removedColumns: string[];
        addedColumns: string[];
        changedColumns: { name: string; before?: string; after?: string }[];
    };
    verification: {
        emptyDatasetGuardPassed: boolean;
        datasetSafetyStatus: 'passed' | 'failed';
        cleaningConsistencyStatus: 'passed' | 'degraded' | 'blocked';
        overallStatus: 'passed' | 'blocked' | 'failed';
        sqlPrecheckStatus: 'not_run' | 'passed' | 'warning' | 'blocked';
        sqlPrecheckSummary: string | null;
        sqlPrecheckBlockingFindings: SqlPrecheckFinding[];
        shapeFailureSignalKey: string | null;
        shapeFailureDetail: string | null;
        failedChecks: string[];
        warnings: string[];
        schemaSummary: string;
        downstreamAnalysisBlocked: boolean;
        shapeVerification: VerificationReport | null;
    };
    samples: {
        rawSample: InspectionSample;
        cleanedSample: InspectionSample;
        metadataPreview: string[][];
        summaryPreview: CsvRow[];
    };
    logs: {
        pipeline: CleaningInspectionLogEntry[];
        toolLogs: CleaningInspectionToolLogEntry[];
        telemetry: CleaningInspectionTelemetryEntry[];
    };
}

export interface DataPreparationWorkflowBundle {
    summary: {
        fileName: string | null;
        reportTitle: string | null;
        rawRowCount: number;
        preparedRowCount: number;
        metadataRowCount: number;
        headerDepth: number;
        summaryRowCount: number;
        parserStrategy: string | null;
        parserConfidence: string | null;
        detectedDelimiter: string | null;
        detectedQuoteChar: string | null;
        parserWarnings: string[];
        intakeGateStatus: 'clear' | 'warning' | 'blocked';
        intakeGateMessage: string | null;
        issueCount: number;
        operationCount: number;
        baselineNoiseRowsRemoved: number;
        preparationState: 'not_started' | 'baseline_prepared' | 'ai_cleaned' | 'cleaning_blocked';
        planStatus: CleaningInspectionBundle['cleaning']['planStatus'];
        downstreamAnalysisBlocked: boolean;
        canAnalyze: boolean;
        analysisState: 'not_started' | 'running' | 'ready' | 'blocked';
        pipelineOutcomeStatus: PipelineOutcome['status'] | null;
        canonicalizationStatus: CanonicalizationStatus;
        canonicalRowCount: number;
        cardsCount: number;
        hasFinalSummary: boolean;
    };
    reportContext: CleaningInspectionBundle['reportContext'];
    steps: Array<{
        id: 'import' | 'inspect' | 'prepare' | 'verify' | 'analyze';
        label: string;
        status: 'done' | 'warning' | 'blocked' | 'not_started';
        description: string;
    }>;
    issueSummary: {
        topWarnings: string[];
        mappings: Array<{
            issue: string;
            action: string;
            result: 'baseline-fixed' | 'ai-executed' | 'proposed-only' | 'blocked';
        }>;
    };
    preparation: {
        badgeLabel: 'AI Cleaned' | 'No Data Edits Applied Yet' | 'Cleaning Blocked' | 'Baseline Prepared' | null;
        explanation: string | null;
        operationCount: number;
        operations: Array<{
            id: string;
            type: string;
            reason: string;
        }>;
        noExecutableOperations: boolean;
        blockedMessage: string | null;
    };
    structureReview: {
        requiresHumanReview: boolean;
        source: ReportStructureResolution['source'] | null;
        confidence: ReportBoundaryConfidence | null;
        blockingReasons: string[];
        detectedBoundary: ReportBoundary | null;
        intakeBoundary: ReportBoundary | null;
        runtimeBoundary: ReportBoundary | null;
        humanBoundary: ReportBoundary | null;
        proposalSource: ReportStructureResolution['proposalSource'] | null;
        proposalVerification: ReportStructureResolution['proposalVerification'] | null;
        verificationSummary: ReportStructureResolution['verificationSummary'] | null;
        canonicalizationStatus: CanonicalizationStatus;
        canonicalBuildMeta: CanonicalBuildMeta | null;
        pipelineOutcome: PipelineOutcome | null;
    } | null;
    verification: CleaningInspectionBundle['verification'];
    diff: CleaningInspectionBundle['execution'];
    operationalSignals: {
        latestPipelineTrace: CleaningInspectionBundle['logs']['pipeline'][number]['traceContract'] | null;
        latestToolTrace: CleaningInspectionBundle['logs']['toolLogs'][number]['traceContract'] | null;
        latestTelemetryTrace: CleaningInspectionBundle['logs']['telemetry'][number]['traceContract'] | null;
        latestFallbackPath: string | null;
    };
    cta: {
        primaryLabel: 'Proceed to Analysis' | 'Open Workspace Artifacts' | 'Analysis Ready';
        primaryAction: 'scroll_to_analysis' | 'open_workspace';
        secondaryLabel: 'Open Workspace Artifacts';
    };
    samples: Pick<CleaningInspectionBundle['samples'], 'rawSample' | 'cleanedSample'>;
}

export interface WorkspaceFile {
    path: string;
    label: string;
    language: 'json' | 'ndjson' | 'markdown' | 'text' | 'javascript' | 'csv';
    content: string;
    group: 'dataset' | 'workspace' | 'debug';
    badges?: Array<'virtual' | 'generated' | 'editable' | 'debug'>;
}

export interface WorkspaceBundle {
    summary: {
        sessionId: string;
        datasetId: string | null;
        reportTitle: string | null;
        activeGoal: string | null;
        provider: string;
        model: string;
        rawRowCount: number;
        cleanedRowCount: number;
        rawColumnCount: number;
        cleanedColumnCount: number;
        latestMutationStatus: string;
        preparationState: DataPreparationWorkflowBundle['summary']['preparationState'];
        overallStatus: DataPreparationWorkflowBundle['verification']['overallStatus'];
        analysisState: DataPreparationWorkflowBundle['summary']['analysisState'];
        availableFiles: string[];
    };
    files: WorkspaceFile[];
    primaryFiles: WorkspaceFile[];
    debugFiles: WorkspaceFile[];
    editableFiles: WorkspaceFile[];
}

export interface ChartReviewBundle {
    generatedAt: string;
    session: {
        sessionId: string;
        datasetId: string | null;
        activeGoal: string | null;
        provider: string;
        model: string;
    };
    dataset: {
        fileName: string | null;
        rawRowCount: number;
        cleanedRowCount: number;
        columnCount: number;
        qualityIssues: string[];
    };
    cleaning: {
        status: CleaningInspectionBundle['cleaning']['status'];
        planStatus: CleaningInspectionBundle['cleaning']['planStatus'];
        consistencyIssues: string[];
        explanation: string | null;
        operationCount: number;
        baselineNoiseRowsRemoved: number;
        operations: DataOperation[];
    };
    verification: {
        datasetSafetyStatus: CleaningInspectionBundle['verification']['datasetSafetyStatus'];
        cleaningConsistencyStatus: CleaningInspectionBundle['verification']['cleaningConsistencyStatus'];
        overallStatus: CleaningInspectionBundle['verification']['overallStatus'];
        downstreamAnalysisBlocked: boolean;
    };
    spreadsheetFilter: CleaningInspectionBundle['spreadsheetFilter'];
    cards: Array<{
        id: string;
        title: string;
        description: string;
        isFallback: boolean;
        chartType: string;
        displayChartType: string;
        aggregation: string | null;
        groupByColumn: string | null;
        valueColumn: string | null;
        secondaryValueColumn: string | null;
        rowCount: number;
        aggregatedDataSample: CsvRow[];
        summary: string;
        summaryLanguage?: string;
        topN: number | null;
        hideOthers: boolean;
        hiddenLabels: string[];
        cardFilter: { column: string; values: (string | number)[] } | null;
        isDataVisible: boolean;
    }>;
    chartReviewHints: {
        totalCards: number;
        cardsWithNoRows: string[];
        cardsWithSingleRow: string[];
        cardsUsingFallbackChartType: string[];
        fallbackCardTitles: string[];
        allCardsAreFallback: boolean;
    };
    relevantLogs: {
        agentEvents: CleaningInspectionLogEntry[];
        telemetry: CleaningInspectionTelemetryEntry[];
    };
    finalSummary: string | null;
}
