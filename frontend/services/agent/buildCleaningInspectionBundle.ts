import type { AppStore } from '../../store/useAppStore';
import type {
    CleaningInspectionBundle,
    CleaningInspectionLogEntry,
    CleaningInspectionTelemetryEntry,
    CleaningInspectionToolLogEntry,
    CsvRow,
    InspectionSample,
} from '../../types';
import { diffSchemas, summarizeSchemaChanges, type ColumnDecision, type SchemaSnapshot } from '../data/dataProfiler';
import { isProviderConfigured } from '../ai/providerConfig';
import { buildCleaningVerificationReport, verifyCleanedDatasetShape } from './cleaningVerification';
import { deriveCleaningExecutionState } from './deriveCleaningExecutionState';
import { buildIntakeDiagnosticsSnapshot } from './intakeDiagnosticsPolicy';
import { detectReportShape } from './reportShapeDetector';
import { buildReshapeHypotheses } from './reportShapeHypothesis';
import { toCorrelationRecord } from './correlation';
import { buildReportContextResolution, resolveReportContextData } from './reportContext';
import { buildSurfaceTraceContract } from './runtime/runtimeControlPlaneContract';

const MAX_SAMPLE_ROWS = 12;
const MAX_METADATA_ROWS = 6;
const MAX_SUMMARY_ROWS = 6;
const MAX_LOG_ENTRIES = 80;

const toIsoString = (value: Date | string | null | undefined): string => {
    if (!value) return '';
    if (value instanceof Date) {
        return value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const cloneRows = (rows: CsvRow[], limit: number): CsvRow[] => rows.slice(0, limit).map(row => ({ ...row }));

const dedupeStrings = (values: string[] | null | undefined): string[] => {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const value of values ?? []) {
        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        deduped.push(normalized);
    }
    return deduped;
};

const buildSample = (rows: CsvRow[] | null | undefined, limit = MAX_SAMPLE_ROWS): InspectionSample => {
    const safeRows = rows ?? [];
    const preview = cloneRows(safeRows, limit);
    return {
        totalRows: safeRows.length,
        columns: preview[0] ? Object.keys(preview[0]) : [],
        rows: preview,
        truncated: safeRows.length > preview.length,
    };
};

const sanitizeDetail = (detail: Record<string, any> | undefined): Record<string, unknown> | undefined => {
    if (!detail) return undefined;
    try {
        return JSON.parse(JSON.stringify(detail)) as Record<string, unknown>;
    } catch {
        return undefined;
    }
};

const mapEvent = (event: AppStore['agentEvents'][number]): CleaningInspectionLogEntry => ({
    id: event.id,
    timestamp: toIsoString(event.timestamp),
    phase: event.phase,
    step: event.step,
    status: event.status,
    message: event.message,
    detail: sanitizeDetail(event.detail),
    traceContract: buildSurfaceTraceContract({
        detail: event.detail,
        reasonCode: event.step,
        source: 'cleaning_pipeline_event',
    }),
    correlation: toCorrelationRecord(event),
});

const mapToolLog = (entry: AppStore['agentToolLogs'][number]): CleaningInspectionToolLogEntry => ({
    id: entry.id,
    timestamp: toIsoString(entry.timestamp),
    tool: entry.tool,
    description: entry.description,
    detail: sanitizeDetail(entry.detail),
    traceContract: buildSurfaceTraceContract({
        detail: entry.detail,
        reasonCode: entry.tool,
        source: 'cleaning_tool_log',
    }),
    correlation: toCorrelationRecord(entry),
});

const mapTelemetry = (event: AppStore['telemetryEvents'][number]): CleaningInspectionTelemetryEntry => ({
    id: event.id,
    timestamp: toIsoString(event.timestamp),
    stage: event.stage,
    responseType: event.responseType,
    detail: event.detail,
    meta: event.meta ? JSON.parse(JSON.stringify(event.meta)) as Record<string, unknown> : undefined,
    traceContract: buildSurfaceTraceContract({
        detail: event.meta,
        reasonCode: typeof event.meta?.reasonCode === 'string' ? event.meta.reasonCode : event.responseType,
        source: 'cleaning_telemetry',
    }),
    correlation: toCorrelationRecord(event),
});

const findEventDetail = <T>(events: AppStore['agentEvents'], step: string): T | null => {
    const found = [...events].reverse().find(event => event.step === step);
    return (found?.detail as T | undefined) ?? null;
};

const normalizeSchema = (schema: SchemaSnapshot | null | undefined): SchemaSnapshot => schema ?? [];

const schemaSnapshotToColumnProfiles = (schema: SchemaSnapshot): CleaningInspectionBundle['profiling']['outputSchema'] =>
    schema.map(column => ({
        name: column.name,
        type: column.type,
        uniqueValues: column.uniqueValues,
        missingPercentage: column.missingPercentage,
        valueRange: column.valueRange,
    }));

const normalizeColumnEvaluation = (
    detail: { keepColumns?: { name: string; role: string }[]; dropColumns?: ColumnDecision[] } | null,
) => ({
    keepColumns: detail?.keepColumns ?? [],
    dropColumns: detail?.dropColumns ?? [],
});

export const buildCleaningInspectionBundle = (state: AppStore): CleaningInspectionBundle => {
    const derivedCleaning = deriveCleaningExecutionState(state);
    const pipelineEvents = [...state.agentEvents]
        .filter(event => ['file', 'profiling', 'evaluation'].includes(event.phase))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .slice(-MAX_LOG_ENTRIES);

    const toolLogs = [...state.agentToolLogs]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, MAX_LOG_ENTRIES);

    const telemetry = [...state.telemetryEvents]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, MAX_LOG_ENTRIES);

    const beforeSchemaDetail = findEventDetail<{ schema?: SchemaSnapshot }>(state.agentEvents, 'schema_snapshot_before');
    const afterSchemaDetail = findEventDetail<{ schema?: SchemaSnapshot }>(state.agentEvents, 'schema_snapshot_after');
    const beforeSchema = normalizeSchema(beforeSchemaDetail?.schema ?? []);
    const hasBeforeSchemaSnapshot = beforeSchema.length > 0;
    const afterSchema = normalizeSchema(afterSchemaDetail?.schema ?? state.columnProfiles.map(profile => ({
        name: profile.name,
        type: profile.type,
        uniqueValues: profile.uniqueValues,
        missingPercentage: profile.missingPercentage,
        valueRange: profile.valueRange,
    })));
    const canonicalOutputSchema = schemaSnapshotToColumnProfiles(afterSchema);
    const schemaDiff = hasBeforeSchemaSnapshot
        ? diffSchemas(beforeSchema, afterSchema)
        : {
            addedColumns: [],
            removedColumns: [],
            changedColumns: [],
        };
    const columnEvaluation = normalizeColumnEvaluation(
        findEventDetail<{ keepColumns?: { name: string; role: string }[]; dropColumns?: ColumnDecision[] }>(state.agentEvents, 'column_evaluation'),
    );
    const profilingComplete = findEventDetail<{ issues?: string[] }>(state.agentEvents, 'profiling_complete');
    const baselineNoiseRowsRemoved = findEventDetail<{ removedRowCount?: number }>(state.agentEvents, 'baseline_noise_rows_removed')?.removedRowCount ?? 0;
    const contextDiagnostics = telemetry
        .filter(event => event.responseType === 'data_prep' || event.meta?.callType === 'data_prep')
        .map(mapTelemetry);

    const rawRows = state.rawCsvData?.data ?? [];
    const cleanedRows = state.csvData?.data ?? [];
    const intakeDiagnostics = buildIntakeDiagnosticsSnapshot(state.rawCsvData, state.csvData, state.rawIntakeIr);
    const reportContextData = resolveReportContextData(state.rawCsvData, state.csvData);
    const reportContext = state.reportContextResolution
        ?? (reportContextData
            ? buildReportContextResolution(reportContextData, null)
            : {
                aiExtracted: null,
                fallback: {
                    sourceFile: state.csvData?.fileName ?? state.rawCsvData?.fileName ?? null,
                    reportTitle: state.csvData?.fileName ?? state.rawCsvData?.fileName ?? null,
                    reportDescription: null,
                    parameterLines: [],
                    footerLines: [],
                    candidateHeaderLine: null,
                    notes: [],
                    source: 'fallback' as const,
                    confidence: null,
                },
                effective: {
                    sourceFile: state.csvData?.fileName ?? state.rawCsvData?.fileName ?? null,
                    reportTitle: state.csvData?.fileName ?? state.rawCsvData?.fileName ?? null,
                    reportDescription: null,
                    parameterLines: [],
                    footerLines: [],
                    candidateHeaderLine: null,
                    notes: [],
                    source: 'fallback' as const,
                    confidence: null,
                },
                verification: {
                    passed: false,
                    usedFallback: true,
                    reason: 'report_context_unavailable',
                    aiConfidence: null,
                    issues: ['Report context was unavailable during bundle generation.'],
                },
                generatedAt: new Date().toISOString(),
            });
    const dedupedIssues = dedupeStrings(profilingComplete?.issues ?? state.dataQualityIssues ?? []);
    const failedChecks: string[] = [];
    const reportShapeProfile = state.rawCsvData ? detectReportShape(state.rawCsvData) : null;
    const reshapeHypotheses = reportShapeProfile ? buildReshapeHypotheses(reportShapeProfile, state.rawCsvData) : [];
    const shapeVerification = verifyCleanedDatasetShape(state.rawCsvData, state.csvData, state.dataPreparationPlan);
    const shapeVerificationReport = buildCleaningVerificationReport(state.rawCsvData, state.csvData, state.dataPreparationPlan);
    const sqlPrecheck = state.dataPreparationPlan?.sqlPrecheck ?? null;
    const sqlPrecheckBlockingFindings = (sqlPrecheck?.findings ?? []).filter(finding => finding.severity === 'block');
    const sqlPrecheckStatus: CleaningInspectionBundle['verification']['sqlPrecheckStatus'] = sqlPrecheck
        ? sqlPrecheck.status
        : 'not_run';
    const datasetSafetyStatus: CleaningInspectionBundle['verification']['datasetSafetyStatus'] = (state.csvData && cleanedRows.length === 0) || !shapeVerification.passed
        ? 'failed'
        : 'passed';
    if (datasetSafetyStatus === 'failed') {
        failedChecks.push(shapeVerification.reason ?? 'Dataset became empty after cleaning.');
    }
    if (!state.dataPreparationPlan && state.rawCsvData && !isProviderConfigured(state.settings)) {
        failedChecks.push('AI cleaning skipped because no API key was configured.');
    }
    failedChecks.push(...dedupeStrings(state.dataPreparationPlan?.consistencyIssues));
    // Inconsistent plans should degrade gracefully (use baseline data), not block analysis entirely.
    // Only truly unsafe states (empty dataset, shape verification failure) should block.
    const downstreamAnalysisBlocked = datasetSafetyStatus === 'failed';
    const cleaningConsistencyStatus: CleaningInspectionBundle['verification']['cleaningConsistencyStatus'] = state.dataPreparationPlan?.planStatus === 'inconsistent'
        ? 'degraded'
        : downstreamAnalysisBlocked
            ? 'blocked'
            : 'passed';
    const overallStatus: CleaningInspectionBundle['verification']['overallStatus'] = datasetSafetyStatus === 'failed'
        ? 'failed'
        : downstreamAnalysisBlocked
            ? 'blocked'
            : 'passed';

    const cleaningStatus: CleaningInspectionBundle['cleaning']['status'] = !state.dataPreparationPlan
        ? 'not_started'
        : derivedCleaning.effectivePlanStatus === 'inconsistent'
            ? 'inconsistent'
        : derivedCleaning.effectivePlanStatus === 'operations'
            ? 'operations'
        : state.dataPreparationPlan.legacy?.jsFunctionBody
            ? 'legacy_js'
            : state.dataPreparationPlan.outputColumns.length > 0
                ? 'schema_only'
                : 'no_ai_cleaning';

    return {
        session: {
            sessionId: state.sessionId,
            currentView: state.currentView,
            generatedAt: new Date().toISOString(),
            datasetId: state.currentDatasetId,
        },
        importFacts: {
            fileName: intakeDiagnostics.fileName,
            rawRowCount: intakeDiagnostics.rawRowCount,
            cleanedRowCount: intakeDiagnostics.cleanedRowCount,
            metadataRowCount: intakeDiagnostics.metadataRowCount,
            headerDepth: intakeDiagnostics.headerDepth,
            summaryRowCount: intakeDiagnostics.summaryRowCount,
            parserStrategy: intakeDiagnostics.strategy,
            parserConfidence: intakeDiagnostics.confidence,
            detectedDelimiter: intakeDiagnostics.delimiter,
            detectedQuoteChar: intakeDiagnostics.quoteChar,
            parserWarnings: intakeDiagnostics.warnings.map(warning => warning.message),
        },
        intakeDiagnostics,
        profiling: {
            originalSchema: beforeSchema,
            outputSchema: canonicalOutputSchema,
            detectedIssues: dedupedIssues,
            columnEvaluation,
        },
        reportShape: {
            profile: reportShapeProfile,
            hypotheses: reshapeHypotheses,
        },
        reportContext,
        rowInspection: {
            latest: state.cleaningRun?.latestRowInspection ?? null,
            inspectionStatus: state.cleaningRun?.inspectionStatus ?? null,
            residualUnknownRowCount: state.cleaningRun?.residualUnknownRowCount ?? 0,
            residualSummaryLikeRowCount: state.cleaningRun?.residualSummaryLikeRowCount ?? 0,
        },
        loopHistory: state.cleaningRun?.iterationArtifacts ?? [],
        cleaning: {
            status: cleaningStatus,
            planStatus: derivedCleaning.effectivePlanStatus,
            consistencyIssues: [...(state.dataPreparationPlan?.consistencyIssues ?? [])],
            explanation: derivedCleaning.effectiveExplanation,
            outputColumns: canonicalOutputSchema,
            operations: derivedCleaning.syntheticOperations.length > 0
                ? derivedCleaning.syntheticOperations as CleaningInspectionBundle['cleaning']['operations']
                : state.dataPreparationPlan?.operations ?? [],
            operationCount: derivedCleaning.syntheticOperations.length > 0
                ? derivedCleaning.syntheticOperations.length
                : state.dataPreparationPlan?.operations.length ?? 0,
            normalizedPlaceholderColumns: dedupeStrings(state.dataPreparationPlan?.normalizedPlaceholderColumns),
            numericStringNormalizedColumns: dedupeStrings(state.dataPreparationPlan?.numericStringNormalizedColumns),
            derivedFromWorkspaceEdits: derivedCleaning.hasDatasetEdits,
            workspaceEditCount: derivedCleaning.datasetEditCount,
            baselineNoiseRowsRemoved,
            legacyJsPreview: state.dataPreparationPlan?.legacy?.jsFunctionBody?.slice(0, 2000) ?? null,
            labelNormalization: state.dataPreparationPlan?.labelNormalization ?? null,
            contextDiagnostics,
        },
        spreadsheetFilter: {
            requestId: state.activeSpreadsheetFilter?.requestId ?? null,
            origin: state.activeSpreadsheetFilter?.origin ?? null,
            query: state.activeSpreadsheetFilter?.query ?? null,
            finalReply: state.activeSpreadsheetFilter?.finalReply ?? state.aiFilterExplanation ?? null,
            operation: state.activeSpreadsheetFilter?.operation ?? state.spreadsheetFilterFunction ?? null,
            observation: state.activeSpreadsheetFilter?.observation ?? null,
            active: Boolean(state.activeSpreadsheetFilter ?? state.spreadsheetFilterFunction),
        },
        dataQuery: {
            active: Boolean(state.activeDataQuery),
            explanation: state.activeDataQuery?.explanation ?? null,
            plan: state.activeDataQuery?.plan ?? null,
            engine: state.activeDataQuery?.engine ?? null,
            sqlPreview: state.activeDataQuery?.sqlPreview ?? null,
            tableName: state.activeDataQuery?.tableName ?? null,
            loadVersion: state.activeDataQuery?.loadVersion ?? null,
            fallbackReason: state.activeDataQuery?.fallbackReason ?? null,
            totalMatchedRows: state.activeDataQuery?.result.totalMatchedRows ?? 0,
            returnedRows: state.activeDataQuery?.result.returnedRows ?? 0,
            truncated: state.activeDataQuery?.result.truncated ?? false,
            selectedColumns: state.activeDataQuery?.result.selectedColumns ?? [],
            appliedOrderBy: state.activeDataQuery?.result.appliedOrderBy ?? [],
            durationMs: state.activeDataQuery?.result.durationMs ?? null,
        },
        execution: {
            rowCountBefore: rawRows.length,
            rowCountAfter: cleanedRows.length,
            rowCountDelta: cleanedRows.length - rawRows.length,
            removedColumns: schemaDiff.removedColumns.map(column => column.name),
            addedColumns: schemaDiff.addedColumns.map(column => column.name),
            changedColumns: schemaDiff.changedColumns,
        },
        verification: {
            emptyDatasetGuardPassed: datasetSafetyStatus === 'passed',
            datasetSafetyStatus,
            cleaningConsistencyStatus,
            overallStatus,
            sqlPrecheckStatus,
            sqlPrecheckSummary: sqlPrecheck?.summary ?? null,
            sqlPrecheckBlockingFindings,
            shapeFailureSignalKey: shapeVerification.signalKey,
            shapeFailureDetail: shapeVerification.detail,
            failedChecks: dedupeStrings(failedChecks),
            warnings: dedupedIssues,
            schemaSummary: hasBeforeSchemaSnapshot
                ? summarizeSchemaChanges(beforeSchema, afterSchema)
                : 'Schema comparison skipped because no pre-cleaning schema snapshot was recorded.',
            downstreamAnalysisBlocked,
            shapeVerification: shapeVerificationReport,
        },
        samples: {
            rawSample: buildSample(rawRows),
            cleanedSample: buildSample(cleanedRows),
            metadataPreview: (state.rawCsvData?.metadataRows ?? state.csvData?.metadataRows ?? []).slice(0, MAX_METADATA_ROWS).map(row => [...row]),
            summaryPreview: cloneRows(state.rawCsvData?.summaryRows ?? state.csvData?.summaryRows ?? [], MAX_SUMMARY_ROWS),
        },
        logs: {
            pipeline: pipelineEvents.map(mapEvent),
            toolLogs: toolLogs.map(mapToolLog),
            telemetry: telemetry.map(mapTelemetry),
        },
    };
};
