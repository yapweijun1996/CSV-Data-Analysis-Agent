import {
    CanonicalizationStatus,
    ColumnProfile,
    CsvData,
    CsvRow,
    DataPreparationPlan,
    PipelineOutcome,
    ReportContextResolution,
    ReportIntakeIr,
    ReportStructureResolution,
    ColumnRegistry,
    DatasetBundle,
} from '../../types';
import { buildDatasetFingerprint, buildDatasetId, getCsvDataRowCount } from '../../utils/datasetId';
import { buildDiverseSample } from '../../utils/dataHelpers';
import { processCsvWithIntakeIr } from '../data/csvParser';
import {
    DESKTOP_DUCKDB_FILE_CAPACITY,
    importCapacityMegabytes,
    resolveImportCapacity,
    shouldUseDuckDbFileIntake,
} from '../data/importCapacity';
import { buildCsvDataFromIntakeIr } from '../data/reportCsvIntake';
import { buildSchemaSnapshot, summarizeDataQualityIssues } from '../data/dataProfiler';
import type { FileOrchestrationUpdate } from './orchestration/fileOrchestrator';
import { agentMemoryCollector } from './memory/agentMemoryCollector';
import { emitAgentEvent } from './monitoring/agentMonitor';
import { emitSilentFailure } from './monitoring/silentFailureTracker';
import { buildReportContextResolution, buildReportContextWorkspaceFiles } from './reportContext';
import { StoreApi } from './types';
import { profileDataWithWorker } from '../workers/dataWorkerClient';
import { extractAiReportContext } from '../ai/reportContextExtractor';
import { getTranslation } from '../../utils/localization';
import { validateRowSchema, ROW_SCHEMA_MISMATCH_THRESHOLD } from '../data/rowSchemaValidator';
import { profileDataLightweight } from '../data/dataProfiler';
import { resolveReportStructureArtifacts } from './reportStructureState';
import { resolveReportStructureArtifactsWithProposal } from './orchestration/reportStructureOrchestrator';
import { buildColumnRegistry } from '../data/columnRegistry';
import { buildDuckDbFileIdentity, createCsvPreviewFile } from '../data/duckDbFileIntake';
import { primeDuckDbFileDataset } from '../duckdb/queryEngine';
import { createSingleTableDatasetBundle } from '../data/datasetBundle';
import { cleanupStaleOpfsSessions, stageDatasetFileInOpfs } from '../data/opfsDatasetStorage';

const LOG_PREFIX = '[FileProcessor]';
const SAMPLE_SIZE = 20;

type ProcessResult = {
    dataForAnalysis: CsvData;
    rawData: CsvData;
    rawIntakeIr: ReportIntakeIr;
    reportStructureResolution: ReportStructureResolution | null;
    canonicalCsvData: CsvData | null;
    canonicalBuildMeta: ReturnType<typeof resolveReportStructureArtifacts>['canonicalBuildMeta'];
    canonicalizationStatus: CanonicalizationStatus;
    pipelineOutcome: PipelineOutcome | null;
    initialDataSample: CsvRow[];
    columnProfiles: ColumnProfile[];
    columnRegistry: ColumnRegistry | null;
    dataPrepPlan: DataPreparationPlan | null;
    dataQualityIssues: string[];
    datasetId: string;
    workspaceFiles: Record<string, string>;
    reportContextResolution: ReportContextResolution;
    datasetBundle: DatasetBundle;
};

const cloneCsvData = (data: CsvData): CsvData => ({
    ...data,
    data: data.data.map(row => ({ ...row })),
    metadataRows: [...(data.metadataRows ?? [])].map(row => [...row]),
    headerLayers: [...(data.headerLayers ?? [])].map(row => [...row]),
    summaryRows: [...(data.summaryRows ?? [])].map(row => ({ ...row })),
    importNormalizationApplied: data.importNormalizationApplied,
    importNormalizationSummary: data.importNormalizationSummary ?? null,
    autoNamedColumns: data.autoNamedColumns?.map(rename => ({ ...rename })),
    intakeDetection: data.intakeDetection
        ? {
            ...data.intakeDetection,
            warnings: [...data.intakeDetection.warnings],
        }
        : undefined,
});

const cloneReportIntakeIr = (intakeIr: ReportIntakeIr): ReportIntakeIr => ({
    ...intakeIr,
    rawRows: intakeIr.rawRows.map(row => [...row]),
    normalizedRows: intakeIr.normalizedRows.map(row => [...row]),
    detection: intakeIr.detection
        ? {
            ...intakeIr.detection,
            warnings: [...intakeIr.detection.warnings],
        }
        : undefined,
    segments: intakeIr.segments.map(segment => ({
        ...segment,
        notes: [...segment.notes],
    })),
    provisionalTable: intakeIr.provisionalTable
        ? {
            ...intakeIr.provisionalTable,
            headerLayerRowIndexes: [...intakeIr.provisionalTable.headerLayerRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable.repeatedHeaderRowIndexes],
            metadataRowIndexes: [...intakeIr.provisionalTable.metadataRowIndexes],
            parameterRowIndexes: [...intakeIr.provisionalTable.parameterRowIndexes],
        }
        : null,
    diagnostics: {
        ...intakeIr.diagnostics,
        segmentCountsByKind: { ...intakeIr.diagnostics.segmentCountsByKind },
        autoNamedColumns: intakeIr.diagnostics.autoNamedColumns?.map(rename => ({ ...rename })),
    },
});

export async function* processAndCleanFile(file: File, store: StoreApi): AsyncGenerator<FileOrchestrationUpdate, ProcessResult, unknown> {
    const language = store.getState().settings.language;
    const importCapacity = resolveImportCapacity();
    const useDuckDbFileIntake = shouldUseDuckDbFileIntake(file.size, importCapacity);

    // Reject oversized files before reading bytes so the browser tab remains
    // responsive on both desktop and memory-constrained mobile devices.
    if (file.size > importCapacity.maxBytes && !useDuckDbFileIntake) {
        const effectiveCapacity = importCapacity.deviceClass === 'desktop'
            ? DESKTOP_DUCKDB_FILE_CAPACITY
            : importCapacity;
        const maxMb = importCapacityMegabytes(effectiveCapacity);
        const userMessage = getTranslation('file_too_large', language, {
            maxMb,
            deviceClass: importCapacity.deviceClass,
        });
        emitAgentEvent(store, {
            phase: 'file',
            step: 'file_too_large',
            status: 'error',
            message: `File "${file.name}" is ${Math.round(file.size / (1024 * 1024))}MB — exceeds the ${maxMb}MB limit.`,
            detail: {
                fileName: file.name,
                sizeBytes: file.size,
                limitBytes: effectiveCapacity.maxBytes,
                deviceClass: importCapacity.deviceClass,
            },
        });
        yield { type: 'progress', message: userMessage, messageType: 'error' };
        throw new Error(userMessage);
    }

    yield { type: 'progress', message: 'Parsing CSV file...' };
    emitAgentEvent(store, {
        phase: 'file',
        step: 'parsing_started',
        status: 'in_progress',
        message: `Started parsing CSV file "${file.name}".`,
        detail: { fileName: file.name, size: file.size },
    });

    let sourceDatasetId: string | null = null;
    let parsedData: CsvData;
    let intakeIr: ReportIntakeIr;
    if (useDuckDbFileIntake) {
        yield {
            type: 'progress',
            message: 'Large-file mode: loading the original CSV directly into the local query engine...',
        };
        const identity = await buildDuckDbFileIdentity(file);
        const sessionId = store.getState().sessionId;
        let opfsPath: string | null = null;
        try {
            await cleanupStaleOpfsSessions([sessionId]);
            opfsPath = await stageDatasetFileInOpfs(sessionId, file);
        } catch (error) {
            console.warn(`${LOG_PREFIX} OPFS staging was unavailable; continuing with the File-backed worker.`, error);
        }
        sourceDatasetId = identity.loadVersion;
        store.setState({ currentDatasetId: identity.loadVersion });
        const loaded = await primeDuckDbFileDataset(file, identity.loadVersion, {
            previewRows: 2000,
        });
        if (loaded.rowCount > DESKTOP_DUCKDB_FILE_CAPACITY.maxRows) {
            const userMessage = getTranslation('file_too_many_rows', language, {
                maxRows: DESKTOP_DUCKDB_FILE_CAPACITY.maxRows.toLocaleString(),
                deviceClass: 'desktop',
            });
            yield { type: 'progress', message: userMessage, messageType: 'error' };
            throw new Error(userMessage);
        }
        const previewFile = createCsvPreviewFile(file.name, loaded.preview);
        const parsedPreview = await processCsvWithIntakeIr(
            previewFile,
            store.getState().settings,
            store.getState(),
        );
        parsedData = parsedPreview.csvData;
        intakeIr = parsedPreview.intakeIr;
        parsedData.backing = {
            mode: 'duckdb_file',
            loadVersion: identity.loadVersion,
            datasetVersion: identity.datasetVersion,
            rowCount: loaded.rowCount,
            sampleRowCount: parsedData.data.length,
            byteSize: file.size,
            columnNames: Object.keys(loaded.preview[0] ?? {}),
            readOnly: true,
            ephemeral: true,
            opfsPath,
        };
        yield {
            type: 'progress',
            message: `Loaded all ${loaded.rowCount.toLocaleString()} original rows. The interface keeps a ${parsedData.data.length.toLocaleString()}-row preview; aggregate queries use the full dataset.`,
            messageType: 'warning',
        };
    } else {
        const parsed = await processCsvWithIntakeIr(
            file,
            store.getState().settings,
            store.getState(),
            {
                onDatasetIdentified: datasetId => {
                    sourceDatasetId = datasetId;
                    store.setState({ currentDatasetId: datasetId });
                },
            },
        );
        parsedData = parsed.csvData;
        intakeIr = parsed.intakeIr;
    }
    if (!parsedData.data || !Array.isArray(parsedData.data)) {
        throw new Error('CSV parsing failed.');
    }
    if (!useDuckDbFileIntake && parsedData.data.length > importCapacity.maxRows) {
        const userMessage = getTranslation('file_too_many_rows', language, {
            maxRows: importCapacity.maxRows.toLocaleString(),
            deviceClass: importCapacity.deviceClass,
        });
        emitAgentEvent(store, {
            phase: 'file',
            step: 'file_row_limit_exceeded',
            status: 'error',
            message: `File "${file.name}" contains ${parsedData.data.length} rows — exceeds the ${importCapacity.maxRows} row limit.`,
            detail: {
                fileName: file.name,
                rowCount: parsedData.data.length,
                limitRows: importCapacity.maxRows,
                deviceClass: importCapacity.deviceClass,
            },
        });
        yield { type: 'progress', message: userMessage, messageType: 'error' };
        throw new Error(userMessage);
    }

    const importedRowCount = getCsvDataRowCount(parsedData);
    yield { type: 'progress', message: `Imported ${importedRowCount} body rows without deterministic cleaning.` };
    emitAgentEvent(store, {
        phase: 'file',
        step: 'parsing_completed',
        status: 'done',
        message: `Parsed CSV and preserved ${importedRowCount} body rows for analysis.`,
        detail: {
            rowCount: importedRowCount,
            headerDepth: parsedData.headerDepth ?? 1,
            summaryRowCount: parsedData.summaryRows?.length ?? 0,
            parserStrategy: parsedData.intakeDetection?.strategy ?? null,
            parserConfidence: parsedData.intakeDetection?.confidence ?? null,
            detectedDelimiter: parsedData.intakeDetection?.delimiter ?? null,
            detectedQuoteChar: parsedData.intakeDetection?.quoteChar ?? null,
            parserWarningCount: parsedData.intakeDetection?.warnings.length ?? 0,
            parserWarnings: parsedData.intakeDetection?.warnings ?? [],
            selectedHeaderRowIndex: intakeIr.provisionalTable?.headerRowIndex ?? null,
            bodyStartIndex: intakeIr.provisionalTable?.bodyStartIndex ?? null,
            summaryStartIndex: intakeIr.provisionalTable?.summaryStartIndex ?? null,
            parameterRowCount: intakeIr.provisionalTable?.parameterRowIndexes.length ?? 0,
            repeatedHeaderRowCount: intakeIr.provisionalTable?.repeatedHeaderRowIndexes.length ?? 0,
            segmentCountsByKind: intakeIr.diagnostics.segmentCountsByKind,
            singleColumnFallbackApplied: intakeIr.diagnostics.singleColumnFallbackApplied,
            bodyEvidenceKind: intakeIr.diagnostics.bodyEvidenceKind,
        },
    });

    if ((parsedData.intakeDetection?.warnings.length ?? 0) > 0) {
        const warningPreview = parsedData.intakeDetection?.warnings.slice(0, 2).map(warning => warning.message).join(' ') ?? '';
        yield {
            type: 'progress',
            message: `CSV intake used ${parsedData.intakeDetection?.strategy ?? 'parser fallback'} with ${parsedData.intakeDetection?.confidence ?? 'low'} confidence. ${warningPreview}`.trim(),
            messageType: 'warning',
        };
    }

    const rawIntakeIr = cloneReportIntakeIr(intakeIr);
    const rawData = cloneCsvData(buildCsvDataFromIntakeIr(rawIntakeIr));
    const dataForAnalysis = cloneCsvData(parsedData);
    if (parsedData.backing) {
        rawData.backing = { ...parsedData.backing };
        dataForAnalysis.backing = { ...parsedData.backing };
    }
    // Dataset identity is anchored to the immutable staged source. Prepared
    // and derived states receive separate version IDs.
    const datasetId = sourceDatasetId ?? buildDatasetId(file.name, rawData.data);

    yield { type: 'progress', message: 'Inferring report title and parameters...' };
    const aiExtractedReportContext = await extractAiReportContext(rawData, store.getState().settings, store.getState());
    const reportContextResolution = buildReportContextResolution(rawData, aiExtractedReportContext);
    const workspaceFiles = buildReportContextWorkspaceFiles(reportContextResolution);

    emitAgentEvent(store, {
        phase: 'file',
        step: 'report_context_extracted',
        status: reportContextResolution.verification.usedFallback ? 'error' : 'done',
        message: reportContextResolution.verification.usedFallback
            ? `AI report-context extraction fell back to validated heuristics (${reportContextResolution.verification.reason ?? 'unknown reason'}).`
            : 'AI report-context extraction succeeded and passed deterministic verification.',
        detail: {
            aiConfidence: reportContextResolution.verification.aiConfidence,
            usedFallback: reportContextResolution.verification.usedFallback,
            reportTitle: reportContextResolution.effective.reportTitle,
        },
    });

    // Post-parse schema validation: check that all rows have consistent key sets.
    // If >ROW_SCHEMA_MISMATCH_THRESHOLD of rows are ragged, normalize them (fill
    // missing keys with null) so profiling and SQL execution see a clean schema.
    {
        const schemaValidation = validateRowSchema(dataForAnalysis.data);
        if (schemaValidation.mismatchCount > 0) {
            if (schemaValidation.wasNormalized) {
                dataForAnalysis.data = schemaValidation.normalizedRows;
                dataForAnalysis.importNormalizationApplied = true;
                dataForAnalysis.importNormalizationSummary = `${schemaValidation.mismatchCount} rows were normalized at import time by filling missing keys with null and dropping extra keys.`;
                emitAgentEvent(store, {
                    phase: 'file',
                    step: 'row_schema_normalized',
                    status: 'done',
                    message: `${schemaValidation.mismatchCount} rows had inconsistent key sets (${Math.round(schemaValidation.mismatchRatio * 100)}% mismatch, threshold ${Math.round(ROW_SCHEMA_MISMATCH_THRESHOLD * 100)}%). Rows normalized by filling missing keys with null.`,
                    detail: {
                        mismatchCount: schemaValidation.mismatchCount,
                        totalRows: schemaValidation.totalCount,
                        mismatchRatio: schemaValidation.mismatchRatio,
                        expectedKeys: schemaValidation.expectedKeys,
                    },
                });
                yield { type: 'progress', message: `CSV row normalization applied: ${schemaValidation.mismatchCount} ragged rows fixed.`, messageType: 'warning' };
            } else {
                dataForAnalysis.importNormalizationApplied = false;
                dataForAnalysis.importNormalizationSummary = `${schemaValidation.mismatchCount} rows had inconsistent key sets, but the mismatch ratio stayed below the normalization threshold.`;
                emitAgentEvent(store, {
                    phase: 'file',
                    step: 'row_schema_warning',
                    status: 'done',
                    message: `${schemaValidation.mismatchCount} rows have inconsistent key sets (${Math.round(schemaValidation.mismatchRatio * 100)}% mismatch). Below normalization threshold — analysis proceeds with original rows.`,
                    detail: {
                        mismatchCount: schemaValidation.mismatchCount,
                        totalRows: schemaValidation.totalCount,
                        mismatchRatio: schemaValidation.mismatchRatio,
                    },
                });
            }
        } else {
            dataForAnalysis.importNormalizationApplied = false;
            dataForAnalysis.importNormalizationSummary = null;
        }
    }

    const initialDataSample = buildDiverseSample(rawData.data, SAMPLE_SIZE);

    yield { type: 'progress', message: 'Profiling imported dataset...' };
    // Profiling guard: if the worker-based profiler (and its main-thread fallback)
    // both fail, fall back to a lightweight sampled profiler so analysis is never
    // blocked by a profiling failure.
    let profiles: ReturnType<typeof profileDataLightweight>['profiles'];
    let issues: string[];
    try {
        ({ profiles, issues } = await profileDataWithWorker(dataForAnalysis.data));
    } catch (profilingError) {
        console.error(`${LOG_PREFIX} profileDataWithWorker failed, using lightweight fallback profiler.`, profilingError);
        emitSilentFailure(store, profilingError, {
            component: 'FileProcessor',
            recoveryAction: 'lightweight_profiler_fallback',
            userNotified: false,
            detail: { fileName: file.name, rowCount: dataForAnalysis.data.length },
        });
        const fallbackWarning = getTranslation('profiling_fallback_warning', language);
        emitAgentEvent(store, {
            phase: 'profiling',
            step: 'profiling_fallback',
            status: 'error',
            message: `Profiling failed — using lightweight fallback. ${profilingError instanceof Error ? profilingError.message : String(profilingError)}`,
            detail: { fileName: file.name, rowCount: dataForAnalysis.data.length },
        });
        yield { type: 'progress', message: fallbackWarning, messageType: 'warning' };
        ({ profiles, issues } = profileDataLightweight(dataForAnalysis.data));
    }
    if (dataForAnalysis.backing?.mode === 'duckdb_file') {
        issues = [
            ...issues,
            `Large-file read-only mode: quality profiling uses a ${dataForAnalysis.backing.sampleRowCount.toLocaleString()}-row preview; SQL summaries use all ${dataForAnalysis.backing.rowCount.toLocaleString()} source rows.`,
            'The original large file is not persisted. Re-import it after a page refresh.',
        ];
    }
    const schema = buildSchemaSnapshot(profiles);

    emitAgentEvent(store, {
        phase: 'profiling',
        step: 'profiling_complete',
        status: 'done',
        message: `Profiled ${profiles.length} columns before AI cleaning.`,
        detail: {
            columnCount: profiles.length,
            rowCount: dataForAnalysis.data.length,
            issues,
            schema,
        },
    });

    if (issues.length > 0) {
        const warningSummary = summarizeDataQualityIssues(issues) ?? getTranslation('file_processor_quality_warning_fallback', store.getState().settings.language);
        console.warn(`${LOG_PREFIX} ${warningSummary}`, {
            fileName: file.name,
            issueCount: issues.length,
            issues,
        });
        yield { type: 'progress', message: warningSummary, messageType: 'warning' };
    }

    const dataPrepPlan: DataPreparationPlan = {
        explanation: getTranslation('file_processor_plan_explanation', store.getState().settings.language),
        operations: [],
        outputColumns: profiles,
        planStatus: 'schema_only',
        consistencyIssues: [],
    };
    const columnRegistry = buildColumnRegistry({
        data: dataForAnalysis,
        columnProfiles: profiles,
        userColumnAnnotations: store.getState().userColumnAnnotations,
        existingRegistry: store.getState().columnRegistry,
    });

    agentMemoryCollector.startRun({
        datasetId,
        fileName: file.name,
        rowCount: getCsvDataRowCount(dataForAnalysis),
        columnProfiles: profiles,
    });
    agentMemoryCollector.updateDatasetFacts({
        fileName: file.name,
        rowCount: getCsvDataRowCount(dataForAnalysis),
        columnProfiles: profiles,
    });
    issues.forEach(issue => agentMemoryCollector.recordDataIssue(issue));

    emitAgentEvent(store, {
        phase: 'file',
        step: 'dataset_ready_for_ai_cleaning',
        status: 'done',
        message: getTranslation('file_processor_dataset_ready', store.getState().settings.language),
        detail: {
            rowCount: getCsvDataRowCount(dataForAnalysis),
            columnCount: profiles.length,
        },
    });

    const reportStructureArtifacts = await resolveReportStructureArtifactsWithProposal({
        rawCsvData: rawData,
        csvData: dataForAnalysis,
        rawIntakeIr,
        cleaningRun: null,
        dataPreparationPlan: dataPrepPlan,
        columnProfiles: profiles,
        settings: store.getState().settings,
        telemetryTarget: {
            sessionId: store.getState().sessionId,
            currentDatasetId: datasetId,
        },
    });

    const materialDataset = reportStructureArtifacts.canonicalCsvData ?? dataForAnalysis;
    const datasetBundle = createSingleTableDatasetBundle({
        datasetId,
        sourceFingerprint: dataForAnalysis.backing?.mode === 'duckdb_file'
            ? dataForAnalysis.backing.loadVersion
            : buildDatasetFingerprint(file.name, rawData.data),
        file,
        data: materialDataset,
        structureResolution: {
            status: reportStructureArtifacts.pipelineOutcome?.canAutoAnalyze
                ? reportStructureArtifacts.pipelineOutcome.severity === 'warning'
                    ? 'needs_confirmation'
                    : 'trusted'
                : 'blocked',
            reasonCodes: [reportStructureArtifacts.pipelineOutcome?.reasonCode ?? 'structure_outcome_unavailable'],
            recoveryGuidance: reportStructureArtifacts.pipelineOutcome?.canAutoAnalyze
                ? []
                : [reportStructureArtifacts.pipelineOutcome?.message ?? 'Review and confirm the detected table structure.'],
        },
    });

    console.log(`${LOG_PREFIX} AI-first intake complete for ${file.name}.`);

    return {
        dataForAnalysis,
        rawData,
        rawIntakeIr,
        reportStructureResolution: reportStructureArtifacts.reportStructureResolution,
        canonicalCsvData: reportStructureArtifacts.canonicalCsvData,
        canonicalBuildMeta: reportStructureArtifacts.canonicalBuildMeta,
        canonicalizationStatus: reportStructureArtifacts.canonicalizationStatus,
        pipelineOutcome: reportStructureArtifacts.pipelineOutcome,
        initialDataSample,
        columnProfiles: profiles,
        columnRegistry,
        dataPrepPlan,
        dataQualityIssues: issues,
        datasetId,
        workspaceFiles,
        reportContextResolution,
        datasetBundle,
    };
}
