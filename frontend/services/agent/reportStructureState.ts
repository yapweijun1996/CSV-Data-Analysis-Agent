import type {
    AppState,
    CsvData,
    PipelineOutcome,
    ReportBoundary,
    ReportStructureProposal,
    ReportStructureResolution,
} from '../../types';
import { buildCsvDataFromIntakeIr, rebuildIntakeIrWithBoundary } from '../data/reportCsvIntake';
import { buildIntakeDiagnosticsSnapshot, evaluateIntakeDiagnostics } from './intakeDiagnosticsPolicy';
import { buildRuntimeTableAssessmentFromIr } from './orchestration/cleaningRuntimePolicy';
import { inspectCsvRows } from './rowInspectionService';
import { resolveReportStructure } from './reportStructureResolver';
import { canonicalizeReportTable } from './canonicalizeReportTable';
import { resolvePipelineOutcome } from './pipelineOutcomeResolver';
import { verifyCleanedDatasetShape } from './cleaningVerification';

export const getPreferredAnalysisDataset = (
    state: Pick<AppState, 'canonicalCsvData' | 'csvData'>,
): CsvData | null => state.canonicalCsvData ?? state.csvData ?? null;

export const resolveReportStructureArtifacts = (params: {
    rawCsvData: CsvData | null | undefined;
    csvData: CsvData | null | undefined;
    rawIntakeIr: AppState['rawIntakeIr'];
    cleaningRun: AppState['cleaningRun'];
    dataPreparationPlan: AppState['dataPreparationPlan'];
    columnProfiles?: AppState['columnProfiles'];
    humanBoundary?: ReportBoundary | null;
    structureProposal?: ReportStructureProposal | null;
}): {
    reportStructureResolution: ReportStructureResolution | null;
    canonicalCsvData: CsvData | null;
    canonicalBuildMeta: AppState['canonicalBuildMeta'];
    canonicalizationStatus: AppState['canonicalizationStatus'];
    pipelineOutcome: PipelineOutcome | null;
} => {
    const effectiveIntakeIr = params.humanBoundary && params.rawIntakeIr
        ? rebuildIntakeIrWithBoundary(
            params.rawIntakeIr,
            {
                headerRowIndex: params.humanBoundary.headerRowIndex ?? 0,
                headerLayerIndexes: params.humanBoundary.headerLayerRowIndexes,
                bodyStartIndex: params.humanBoundary.bodyStartIndex ?? 0,
                summaryStartIndex: params.humanBoundary.summaryStartIndex ?? params.rawIntakeIr.normalizedRows.length,
                parameterRowIndexes: params.humanBoundary.parameterRowIndexes,
                repeatedHeaderRowIndexes: params.humanBoundary.repeatedHeaderRowIndexes,
            },
            'ai_fallback_deterministic',
        )
        : params.rawIntakeIr ?? null;
    const preparedData = params.humanBoundary && effectiveIntakeIr
        ? buildCsvDataFromIntakeIr(effectiveIntakeIr)
        : params.csvData ?? null;
    if (!preparedData) {
        return {
            reportStructureResolution: null,
            canonicalCsvData: null,
            canonicalBuildMeta: null,
            canonicalizationStatus: 'idle',
            pipelineOutcome: null,
        };
    }

    const runtimeTableAssessment = params.cleaningRun?.runtimeTableAssessment
        ?? buildRuntimeTableAssessmentFromIr(effectiveIntakeIr, params.rawCsvData ?? preparedData, preparedData);
    const rowInspection = inspectCsvRows(preparedData, { source: 'cleaned' });
    const verification = params.rawCsvData
        ? verifyCleanedDatasetShape(params.rawCsvData, preparedData, params.dataPreparationPlan)
        : null;
    const shapeFailureSignalKey = verification?.signalKey ?? null;
    const reportStructureResolution = resolveReportStructure({
        rawCsvData: params.rawCsvData,
        csvData: preparedData,
        rawIntakeIr: effectiveIntakeIr,
        runtimeTableAssessment,
        rowInspection,
        humanBoundary: params.humanBoundary ?? null,
        structureProposal: params.structureProposal ?? null,
        shapeFailureSignalKey,
        shapeVerificationPassed: verification?.passed ?? null,
    });
    const canonical = canonicalizeReportTable({
        csvData: preparedData,
        rawCsvData: params.rawCsvData ?? preparedData,
        rawIntakeIr: effectiveIntakeIr,
        reportStructureResolution,
    });
    const enrichedResolution: ReportStructureResolution = {
        ...reportStructureResolution,
        resolvedRawRowRoles: canonical.resolvedRawRowRoles ?? reportStructureResolution.resolvedRawRowRoles,
        verificationSummary: canonical.verificationSummary ?? reportStructureResolution.verificationSummary,
    };
    const intakeGuard = evaluateIntakeDiagnostics(
        buildIntakeDiagnosticsSnapshot(params.rawCsvData ?? preparedData, preparedData, effectiveIntakeIr, runtimeTableAssessment),
    );
    const pipelineOutcome = resolvePipelineOutcome({
        reportStructureResolution: enrichedResolution,
        intakeGuard,
        cleaningRun: params.cleaningRun,
        sqlPrecheckStatus: params.cleaningRun?.sqlPrecheckStatus ?? params.dataPreparationPlan?.sqlPrecheck?.status ?? null,
        verificationReport: verification
            ? {
                passed: verification.passed,
                signalKey: verification.signalKey,
            }
            : null,
        hasCanonicalData: Boolean(canonical.artifact?.canonicalCsvData?.data),
        columnProfiles: params.columnProfiles ?? [],
        cleanedRowCount: preparedData?.data.length ?? 0,
    });

    return {
        reportStructureResolution: enrichedResolution,
        canonicalCsvData: canonical.artifact?.canonicalCsvData ?? null,
        canonicalBuildMeta: canonical.artifact?.canonicalBuildMeta ?? null,
        canonicalizationStatus: canonical.status,
        pipelineOutcome,
    };
};
