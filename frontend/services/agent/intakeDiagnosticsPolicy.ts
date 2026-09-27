import type {
    CleaningInspectionBundle,
    CleaningInspectionIntakeDiagnostics,
    CsvData,
    CsvIntakeWarningCode,
    InitialAnalysisReasonCode,
    ReportIntakeIr,
    RuntimeTableAssessment,
} from '../../types';
import { evaluateCleaningIrGate } from './orchestration/cleaningIrGate';

export type IntakeGateSeverity = 'clear' | 'warning' | 'blocked';

export interface IntakeGuardDecision {
    severity: IntakeGateSeverity;
    blockingReasonCode: InitialAnalysisReasonCode | null;
    shouldWarnDuringCleaning: boolean;
    shouldBlockAutomaticAnalysis: boolean;
    inspectMessage: string | null;
    verifyMessage: string | null;
    analysisBlockedMessage: string | null;
    cleaningPromptSummary: string | null;
}

const LOW_CONFIDENCE_MESSAGE = 'File imported, but structure confidence is limited.';
const PARSE_ERRORS_INSPECT_MESSAGE = 'Parsing errors were detected during CSV intake. Review the import diagnostics before trusting the detected structure.';
const PARSE_ERRORS_VERIFY_MESSAGE = 'Parsing errors were detected. Automatic analysis is paused until you review the import diagnostics or rerun cleaning.';
const MALFORMED_QUOTE_INSPECT_MESSAGE = 'Quoted-field structure looks malformed during CSV intake. Review the import diagnostics before trusting the detected rows.';
const MALFORMED_QUOTE_VERIFY_MESSAGE = 'Quoted-field structure looks malformed. Automatic analysis is paused until you review the import diagnostics or rerun cleaning.';
const HEADER_DRIFT_INSPECT_MESSAGE = 'Header/body structure drift was detected during CSV intake. Review the detected table boundary before trusting the imported columns.';
const HEADER_DRIFT_VERIFY_MESSAGE = 'Header/body structure drift was detected. Automatic analysis is paused until you review the detected table boundary or rerun cleaning.';
const MISSING_DIAGNOSTICS_INSPECT_MESSAGE = 'Import diagnostics are unavailable for a report-like dataset. Review the detected structure before trusting automatic analysis.';
const MISSING_DIAGNOSTICS_VERIFY_MESSAGE = 'Import diagnostics are unavailable for a report-like dataset. Automatic analysis is paused until you review the structure or rerun cleaning.';
const HEADER_NOT_FOUND_INSPECT_MESSAGE = 'No header row could be identified during CSV intake. The title or metadata row was used as the header, producing incorrect column names. Review the raw file structure before trusting automatic analysis.';
const HEADER_NOT_FOUND_VERIFY_MESSAGE = 'No header row could be identified. Automatic analysis is paused until you review the raw file structure or rerun cleaning.';
const STRUCTURE_UNCERTAIN_INSPECT_MESSAGE = 'A report-like dataset was imported with low structure confidence. Review the intake diagnostics before trusting automatic analysis.';
const STRUCTURE_UNCERTAIN_VERIFY_MESSAGE = 'A report-like dataset was imported with low structure confidence. Automatic analysis is paused until you review the structure or rerun cleaning.';

const hasWarningCode = (
    intakeDiagnostics: CleaningInspectionBundle['intakeDiagnostics'],
    code: CsvIntakeWarningCode,
) => intakeDiagnostics.warnings.some(warning => warning.code === code);

const usesFallbackDetection = (intakeDiagnostics: CleaningInspectionBundle['intakeDiagnostics']) =>
    intakeDiagnostics.strategy === 'papaparse_auto_fallback'
    || intakeDiagnostics.strategy === 'raw_line_fallback';

const hasStrongReportLikeStructure = (intakeDiagnostics: CleaningInspectionBundle['intakeDiagnostics']) =>
    intakeDiagnostics.headerDepth > 1
    || intakeDiagnostics.summaryRowCount > 0;

const buildBlockedDecision = ({
    blockingReasonCode,
    inspectMessage,
    verifyMessage,
    cleaningPromptSummary,
}: {
    blockingReasonCode: InitialAnalysisReasonCode;
    inspectMessage: string;
    verifyMessage: string;
    cleaningPromptSummary: string;
}): IntakeGuardDecision => ({
    severity: 'blocked',
    blockingReasonCode,
    shouldWarnDuringCleaning: true,
    shouldBlockAutomaticAnalysis: true,
    inspectMessage,
    verifyMessage,
    analysisBlockedMessage: verifyMessage,
    cleaningPromptSummary,
});

export const buildIntakeDiagnosticsSnapshot = (
    rawCsvData: CsvData | null | undefined,
    csvData: CsvData | null | undefined,
    rawIntakeIr?: ReportIntakeIr | null,
    tableAssessment?: RuntimeTableAssessment | null,
): CleaningInspectionIntakeDiagnostics => {
    const intakeDetection = rawCsvData?.intakeDetection ?? csvData?.intakeDetection ?? null;
    const provisionalTable = rawIntakeIr?.provisionalTable ?? null;

    return {
        available: Boolean(intakeDetection),
        fileName: csvData?.fileName ?? rawCsvData?.fileName ?? null,
        strategy: intakeDetection?.strategy ?? null,
        confidence: intakeDetection?.confidence ?? null,
        delimiter: intakeDetection?.delimiter ?? null,
        quoteChar: intakeDetection?.quoteChar ?? null,
        warnings: (intakeDetection?.warnings ?? []).map(warning => ({ ...warning })),
        candidateCount: intakeDetection?.candidateCount ?? null,
        parserErrorCount: intakeDetection?.parserErrorCount ?? null,
        sampledNonEmptyLines: intakeDetection?.sampledNonEmptyLines ?? null,
        topScore: intakeDetection?.topScore ?? null,
        runnerUpScore: intakeDetection?.runnerUpScore ?? null,
        rawRowCount: rawCsvData?.data.length ?? 0,
        cleanedRowCount: csvData?.data.length ?? 0,
        metadataRowCount: rawCsvData?.metadataRows?.length ?? csvData?.metadataRows?.length ?? 0,
        headerDepth: rawCsvData?.headerDepth ?? csvData?.headerDepth ?? 1,
        summaryRowCount: rawCsvData?.summaryRows?.length ?? csvData?.summaryRows?.length ?? 0,
        selectedHeaderRowIndex: provisionalTable?.headerRowIndex ?? null,
        bodyStartIndex: provisionalTable?.bodyStartIndex ?? null,
        summaryStartIndex: provisionalTable?.summaryStartIndex ?? null,
        parameterRowCount: provisionalTable?.parameterRowIndexes.length ?? 0,
        repeatedHeaderRowCount: provisionalTable?.repeatedHeaderRowIndexes.length ?? 0,
        segmentCountsByKind: rawIntakeIr?.diagnostics.segmentCountsByKind ?? {},
        singleColumnFallbackApplied: rawIntakeIr?.diagnostics.singleColumnFallbackApplied ?? false,
        syntheticHeaderApplied: rawIntakeIr?.diagnostics.syntheticHeaderApplied ?? false,
        bodyEvidenceKind: rawIntakeIr?.diagnostics.bodyEvidenceKind ?? 'unknown',
        aiBoundaryAccepted: rawIntakeIr?.diagnostics.aiBoundaryAccepted ?? null,
        aiBoundaryComparisonReason: rawIntakeIr?.diagnostics.aiBoundaryComparisonReason ?? null,
        aiRejectionReason: rawIntakeIr?.diagnostics.aiRejectionReason ?? null,
        autoNamedColumns: csvData?.autoNamedColumns?.map(rename => ({ ...rename }))
            ?? rawIntakeIr?.diagnostics.autoNamedColumns?.map(rename => ({ ...rename }))
            ?? [],
        importNormalizationApplied: csvData?.importNormalizationApplied ?? false,
        importNormalizationSummary: csvData?.importNormalizationSummary ?? null,
        // IR-first cleaning gate diagnostics
        ...(() => {
            const irGate = evaluateCleaningIrGate({
                rawCsvData: rawCsvData ?? null,
                rawIntakeIr: rawIntakeIr ?? null,
                reportShapeProfile: null,
            });
            return {
                irStableSingleLayerDetail: irGate.isStableSingleLayerDetail,
                irAllowsDeterministicCleanup: irGate.allowsDeterministicCleanup,
                irAllowsDeterministicReshape: irGate.allowsDeterministicReshape,
                irRequiresInspectFirst: irGate.requiresInspectFirst,
                irRoutingReason: irGate.reason,
            };
        })(),
        // Intake provisional evidence
        intakeProvisionalHeaderRowIndex: provisionalTable?.headerRowIndex ?? null,
        intakeEvidenceStrength: rawIntakeIr?.diagnostics.evidenceStrength ?? null,
        // Runtime confirmed structure
        runtimeConfirmedHeaderRowIndex: tableAssessment?.status === 'confirmed' ? tableAssessment.headerRowIndex : null,
        runtimeConfirmedBodyStartIndex: tableAssessment?.status === 'confirmed' ? tableAssessment.bodyStartIndex : null,
        runtimeRequiresReshape: tableAssessment?.status === 'confirmed' ? tableAssessment.requiresReshape : null,
        runtimeRequiresCleanupOnly: tableAssessment?.status === 'confirmed' ? tableAssessment.requiresCleanupOnly : null,
        runtimeAssessmentStatus: tableAssessment?.status ?? null,
        runtimeAssessmentReason: tableAssessment?.reason ?? null,
        // Routing authority
        cleaningRoutingAuthority: tableAssessment?.status === 'confirmed'
            ? 'runtime_confirmed_structure'
            : 'intake_provisional',
    };
};

export const evaluateIntakeDiagnostics = (
    intakeDiagnostics: CleaningInspectionBundle['intakeDiagnostics'],
): IntakeGuardDecision => {
    if (hasWarningCode(intakeDiagnostics, 'parse_errors')) {
        return buildBlockedDecision({
            blockingReasonCode: 'parse_errors',
            inspectMessage: PARSE_ERRORS_INSPECT_MESSAGE,
            verifyMessage: PARSE_ERRORS_VERIFY_MESSAGE,
            cleaningPromptSummary: 'CSV intake reported parser errors. Inspect raw.csv and report_context.json first, do not assume the current header boundary is final, and do not treat cleaned.csv as query-ready until the structure is re-verified.',
        });
    }

    if (hasWarningCode(intakeDiagnostics, 'malformed_quote')) {
        // Downgraded from blocked → warning.  Malformed quotes are common in
        // real-world exports and the parser already applies fallback behavior.
        // Blocking auto-analysis here forces manual intervention for files that
        // are usually recoverable.  The cleaning pipeline still receives the
        // diagnostic guidance so it can verify row boundaries.
        return {
            severity: 'warning',
            blockingReasonCode: null,
            shouldWarnDuringCleaning: true,
            shouldBlockAutomaticAnalysis: false,
            inspectMessage: MALFORMED_QUOTE_INSPECT_MESSAGE,
            verifyMessage: null,
            analysisBlockedMessage: null,
            cleaningPromptSummary: 'CSV intake reported malformed quoted fields. Inspect raw.csv first, verify whether row boundaries shifted, and validate that the cleaned dataset has correct row counts before analysis.',
        };
    }

    if (hasWarningCode(intakeDiagnostics, 'header_shape_drift')) {
        return buildBlockedDecision({
            blockingReasonCode: 'header_shape_drift',
            inspectMessage: HEADER_DRIFT_INSPECT_MESSAGE,
            verifyMessage: HEADER_DRIFT_VERIFY_MESSAGE,
            cleaningPromptSummary: 'CSV intake detected header/body shape drift. Inspect raw.csv and report_context.json before mutating, verify the detected table boundary explicitly, and do not assume cleaned.csv is already query-ready.',
        });
    }

    // Block when intake failed to find any header row: the title/metadata row
    // was used as the header, producing wrong column names. Cleaning on a wrong
    // schema will be blocked by downstream hardening anyway, so fail early.
    const headerNotFound = intakeDiagnostics.selectedHeaderRowIndex === null
        && intakeDiagnostics.singleColumnFallbackApplied === true
        && intakeDiagnostics.bodyEvidenceKind === 'unknown';
    if (headerNotFound) {
        return buildBlockedDecision({
            blockingReasonCode: 'intake_structure_uncertain',
            inspectMessage: HEADER_NOT_FOUND_INSPECT_MESSAGE,
            verifyMessage: HEADER_NOT_FOUND_VERIFY_MESSAGE,
            cleaningPromptSummary: 'CSV intake could not identify a header row. The first row was used as a fallback header, which is likely wrong for this report-shaped file. Inspect raw.csv to locate the real header/body boundary before any cleaning or analysis.',
        });
    }

    const fallbackDetection = usesFallbackDetection(intakeDiagnostics);
    const lowConfidence = intakeDiagnostics.confidence === 'low';

    if (!intakeDiagnostics.available && hasStrongReportLikeStructure(intakeDiagnostics)) {
        return buildBlockedDecision({
            blockingReasonCode: 'intake_diagnostics_missing',
            inspectMessage: MISSING_DIAGNOSTICS_INSPECT_MESSAGE,
            verifyMessage: MISSING_DIAGNOSTICS_VERIFY_MESSAGE,
            cleaningPromptSummary: 'CSV intake diagnostics are unavailable for a report-like dataset. Inspect raw.csv and verify the table boundary before trusting any automatic cleaning or analysis step.',
        });
    }

    if (hasStrongReportLikeStructure(intakeDiagnostics) && (fallbackDetection || lowConfidence)) {
        return buildBlockedDecision({
            blockingReasonCode: 'intake_structure_uncertain',
            inspectMessage: STRUCTURE_UNCERTAIN_INSPECT_MESSAGE,
            verifyMessage: STRUCTURE_UNCERTAIN_VERIFY_MESSAGE,
            cleaningPromptSummary: 'CSV intake confidence is too low for a report-like dataset. Review raw.csv, header depth, metadata rows, and summary rows before trusting the current imported table shape.',
        });
    }

    const warningOnly = !intakeDiagnostics.available
        || lowConfidence
        || fallbackDetection
        || hasWarningCode(intakeDiagnostics, 'low_confidence')
        || intakeDiagnostics.warnings.length > 0;

    if (warningOnly) {
        return {
            severity: 'warning',
            blockingReasonCode: null,
            shouldWarnDuringCleaning: true,
            shouldBlockAutomaticAnalysis: false,
            inspectMessage: !intakeDiagnostics.available
                ? 'Import diagnostics are limited. Review the detected structure before trusting automatic assumptions.'
                : LOW_CONFIDENCE_MESSAGE,
            verifyMessage: null,
            analysisBlockedMessage: null,
            cleaningPromptSummary: !intakeDiagnostics.available
                ? 'CSV intake diagnostics are limited or unavailable. Review the detected structure before assuming the imported table boundary is final.'
                : 'CSV intake confidence is limited. Review the selected delimiter, quote handling, and warning list before assuming the first detected header row is final.',
        };
    }

    return {
        severity: 'clear',
        blockingReasonCode: null,
        shouldWarnDuringCleaning: false,
        shouldBlockAutomaticAnalysis: false,
        inspectMessage: null,
        verifyMessage: null,
        analysisBlockedMessage: null,
        cleaningPromptSummary: null,
    };
};

// ---------------------------------------------------------------------------
// Post-cleaning gate relaxation harness
//
// Pattern: investigate → structured findings → runtime directive.
//
// The intake gate accurately reports intake-time issues (header_shape_drift,
// parse_errors, etc.).  This harness evaluates *post-cleaning* evidence to
// decide whether those issues have been sufficiently resolved and the gate
// can be relaxed from "blocked" to "warning".
//
// All signals are derived from deterministic post-cleaning state — no column
// names, file names, or threshold overrides are hard-coded.
// ---------------------------------------------------------------------------

export interface PostCleaningGateEvidence {
    /** Cleaning pipeline finished without error. */
    cleaningCompleted: boolean;
    /** SQL precheck is usable — passed or warning (not blocked/pending). */
    sqlPrecheckPassed: boolean;
    /** Number of rows in the cleaned dataset. */
    cleanedRowCount: number;
    /** Number of columns classified as queryable metrics (numerical/currency/percentage). */
    queryableMetricCount: number;
    /** Number of columns classified as queryable dimensions (categorical/date/time). */
    queryableDimensionCount: number;
    /** Number of rows the row inspector could not classify. */
    residualUnknownRowCount: number;
}

export interface IntakeGateRelaxationDirective {
    canRelax: boolean;
    reason: string;
    evidence: PostCleaningGateEvidence;
}

/**
 * Evaluate whether post-cleaning evidence is strong enough to relax an
 * intake-level gate block.  Every check is deterministic and evidence-based.
 */
export const evaluatePostCleaningGateRelaxation = (
    evidence: PostCleaningGateEvidence,
): IntakeGateRelaxationDirective => {
    if (!evidence.cleaningCompleted) {
        return { canRelax: false, reason: 'Cleaning has not completed.', evidence };
    }
    if (!evidence.sqlPrecheckPassed) {
        return { canRelax: false, reason: 'SQL precheck did not pass.', evidence };
    }
    if (evidence.cleanedRowCount === 0) {
        return { canRelax: false, reason: 'Cleaned dataset has no rows.', evidence };
    }
    if (evidence.queryableDimensionCount === 0) {
        return { canRelax: false, reason: 'No queryable dimension columns detected.', evidence };
    }

    // Residual unknown rows should not dominate the dataset.
    const residualRatio = evidence.cleanedRowCount > 0
        ? evidence.residualUnknownRowCount / evidence.cleanedRowCount
        : 1;
    if (residualRatio > 0.5) {
        return {
            canRelax: false,
            reason: `Residual unknown rows (${(residualRatio * 100).toFixed(0)}%) exceed tolerance.`,
            evidence,
        };
    }

    return {
        canRelax: true,
        reason: `Post-cleaning evidence passed: ${evidence.cleanedRowCount} rows, `
            + `${evidence.queryableMetricCount} metrics, ${evidence.queryableDimensionCount} dimensions, `
            + `${evidence.queryableMetricCount > 0 ? 'metric aggregation' : 'count-based aggregation'} available, `
            + `SQL precheck passed.`,
        evidence,
    };
};
