import type {
    AppState,
    CsvData,
    DataOperation,
    DatasetLineageManifest,
    DatasetLineageRecord,
    DatasetTransformationRecord,
    DatasetVersionKind,
    DatasetVersionRecord,
    LineageVerificationStatus,
    Report,
    TransformationKind,
} from '../../types';
import { DATASET_LINEAGE_SCHEMA_VERSION } from '../../types';
import {
    buildDatasetFingerprint,
    buildDatasetId,
    buildDatasetVersionId,
    buildSchemaFingerprint,
} from '../../utils/datasetId';

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const collectColumnNames = (data: CsvData): string[] => {
    const columns = new Set<string>();
    for (const row of data.data) {
        for (const column of Object.keys(row)) {
            columns.add(column);
        }
    }
    return Array.from(columns).sort();
};

const canonicalReportId = (report: Report): string =>
    report.appState?.sessionId?.trim() || report.id;

const resolveSourceData = (report: Report): CsvData | null =>
    report.appState?.rawCsvData ?? report.appState?.csvData ?? null;

const resolveCurrentData = (report: Report): CsvData | null =>
    report.appState?.canonicalCsvData
    ?? report.appState?.csvData
    ?? report.appState?.rawCsvData
    ?? null;

const resolveRunId = (state: AppState, reportId: string): string => {
    const runtimeRun = state.runtimeRunHistory?.at(-1);
    return state.activeTurn?.runId
        ?? runtimeRun?.runId
        ?? state.cleaningRun?.runId
        ?? `migration-${reportId}`;
};

const resolveVerificationStatus = (state: AppState): LineageVerificationStatus => {
    const metricValidations = state.dataPreparationPlan?.derivedMetricValidations ?? [];
    if (metricValidations.some(validation => validation.status === 'fail')) return 'failed';
    if (metricValidations.some(validation => validation.status === 'warn')) return 'warning';
    if (metricValidations.length > 0
        && metricValidations.every(validation => validation.status === 'pass')) return 'passed';
    const sqlStatus = state.dataPreparationPlan?.sqlPrecheck?.status;
    if (sqlStatus === 'blocked') return 'failed';
    if (sqlStatus === 'warning') return 'warning';
    if (sqlStatus === 'passed') return 'passed';
    if (state.cleaningRun?.status === 'failed') return 'failed';
    if (state.cleaningRun?.status === 'completed') return 'passed';
    return 'pending';
};

const resolveVerificationReasons = (state: AppState): string[] => {
    const reasons = [
        ...(state.dataPreparationPlan?.derivedMetricValidations ?? []).flatMap(validation =>
            validation.signals.map(signal =>
                `${validation.declaration.metricName} ${signal.code}: ${signal.message}`)),
        state.dataPreparationPlan?.sqlPrecheck?.summary,
        state.cleaningRun?.lastVerificationReason,
        state.cleaningRun?.lastError,
    ].filter((value): value is string => Boolean(value?.trim()));
    return unique(reasons);
};

const resolveEvidenceReferences = (state: AppState) => {
    const references = (state.dataPreparationPlan?.derivedMetricValidations ?? [])
        .flatMap(validation => validation.evidenceReferences);
    return references.filter((reference, index, entries) =>
        entries.findIndex(candidate =>
            candidate.kind === reference.kind && candidate.id === reference.id
        ) === index);
};

const resolveVersionKind = (
    isOriginal: boolean,
    operations: DataOperation[],
): DatasetVersionKind => {
    if (isOriginal) return 'original';
    if (operations.some(operation =>
        operation.type === 'derive_column' || operation.type === 'derive_metric_by_label'
    )) {
        return 'derived';
    }
    return 'prepared';
};

const resolveTransformationKind = (operations: DataOperation[], runId: string): TransformationKind => {
    if (runId.startsWith('migration-')) return 'migration';
    if (operations.some(operation =>
        operation.type === 'derive_column' || operation.type === 'derive_metric_by_label'
    )) {
        return 'derived_metric';
    }
    if (runId.startsWith('cleaning-run-')) return 'cleaning';
    return 'mutation';
};

const buildTransformationId = (
    datasetId: string,
    inputVersionId: string,
    outputVersionId: string,
    runId: string,
): string => {
    const fingerprint = buildDatasetFingerprint(
        `${datasetId}:${inputVersionId}:${outputVersionId}:${runId}`,
        [],
    );
    return `transformation-${fingerprint}`;
};

const buildVersionRecord = ({
    reportId,
    datasetId,
    data,
    parentVersionId,
    kind,
    runId,
    createdAt,
}: {
    reportId: string;
    datasetId: string;
    data: CsvData;
    parentVersionId: string | null;
    kind: DatasetVersionKind;
    runId: string | null;
    createdAt: Date;
}): DatasetVersionRecord => {
    const versionId = buildDatasetVersionId(data.fileName, data.data);
    const contentFingerprint = buildDatasetFingerprint(data.fileName, data.data);
    return {
        recordId: `version:${reportId}:${versionId}`,
        recordKind: 'version',
        versionId,
        datasetId,
        reportId,
        parentVersionId,
        kind,
        contentFingerprint,
        schemaFingerprint: buildSchemaFingerprint(data.data),
        rowCount: data.data.length,
        columnNames: collectColumnNames(data),
        createdAt,
        createdByRunId: runId,
        recoverable: true,
        snapshot: data,
    };
};

export interface ReportLineageBundle {
    report: Report;
    records: DatasetLineageRecord[];
    legacyDatasetId: string | null;
}

/**
 * Normalize both new and pre-v9 reports into one lineage contract.
 *
 * Existing reports remain loadable without an eager, quota-heavy migration.
 * Their raw/current snapshots are materialized into dataset_lineage on the
 * next normal save.
 */
export const buildReportLineageBundle = (
    report: Report,
    previousReport?: Report,
): ReportLineageBundle => {
    const sourceData = resolveSourceData(report);
    const currentData = resolveCurrentData(report);
    if (!sourceData || !currentData) {
        return { report, records: [], legacyDatasetId: null };
    }

    const reportId = canonicalReportId(report);
    const sessionId = report.appState.sessionId || reportId;
    const datasetId = buildDatasetId(sourceData.fileName, sourceData.data);
    const sourceFingerprint = buildDatasetFingerprint(sourceData.fileName, sourceData.data);
    const originalVersionId = buildDatasetVersionId(sourceData.fileName, sourceData.data);
    const currentVersionId = buildDatasetVersionId(currentData.fileName, currentData.data);
    const previousManifest = previousReport?.lineage?.schemaVersion === DATASET_LINEAGE_SCHEMA_VERSION
        && previousReport.lineage.datasetId === datasetId
        ? previousReport.lineage
        : report.lineage?.schemaVersion === DATASET_LINEAGE_SCHEMA_VERSION
            && report.lineage.datasetId === datasetId
            ? report.lineage
            : null;
    const previousCurrentVersionId = previousManifest?.currentVersionId ?? originalVersionId;
    const now = report.updatedAt instanceof Date ? report.updatedAt : new Date(report.updatedAt);
    const createdAt = previousManifest?.createdAt
        ?? (report.createdAt instanceof Date ? report.createdAt : new Date(report.createdAt));
    const runId = resolveRunId(report.appState, reportId);
    const operations = report.appState.dataPreparationPlan?.operations ?? [];
    const transformationNeeded = previousCurrentVersionId !== currentVersionId;
    const transformationId = transformationNeeded
        ? buildTransformationId(datasetId, previousCurrentVersionId, currentVersionId, runId)
        : null;
    const legacyDatasetId = report.appState.currentDatasetId
        && report.appState.currentDatasetId !== datasetId
        ? report.appState.currentDatasetId
        : null;

    const manifest: DatasetLineageManifest = {
        schemaVersion: DATASET_LINEAGE_SCHEMA_VERSION,
        reportId,
        sessionId,
        datasetId,
        sourceFingerprint,
        originalVersionId,
        currentVersionId,
        versionIds: unique([
            ...(previousManifest?.versionIds ?? []),
            originalVersionId,
            currentVersionId,
        ]),
        transformationIds: unique([
            ...(previousManifest?.transformationIds ?? []),
            ...(transformationId ? [transformationId] : []),
        ]),
        createdAt,
        updatedAt: now,
        ...(legacyDatasetId ? { migratedFrom: 'legacy-report-v8' as const } : {}),
    };

    const normalizedReport: Report = {
        ...report,
        appState: {
            ...report.appState,
            currentDatasetId: datasetId,
            reportMemoryScope: {
                reportId,
                datasetId,
                datasetVersion: currentVersionId,
            },
            semanticDatasetVersion: report.appState.semanticDatasetVersion
                ? currentVersionId
                : report.appState.semanticDatasetVersion,
            datasetSemanticSnapshot: report.appState.datasetSemanticSnapshot
                ? {
                    ...report.appState.datasetSemanticSnapshot,
                    sourceDatasetVersion: currentVersionId,
                }
                : report.appState.datasetSemanticSnapshot,
            columnRegistry: report.appState.columnRegistry
                ? {
                    ...report.appState.columnRegistry,
                    datasetVersion: currentVersionId,
                }
                : report.appState.columnRegistry,
        },
        lineage: manifest,
    };

    const records: DatasetLineageRecord[] = [
        buildVersionRecord({
            reportId,
            datasetId,
            data: sourceData,
            parentVersionId: null,
            kind: 'original',
            runId: null,
            createdAt,
        }),
    ];

    if (currentVersionId !== originalVersionId) {
        records.push(buildVersionRecord({
            reportId,
            datasetId,
            data: currentData,
            parentVersionId: previousCurrentVersionId,
            kind: resolveVersionKind(false, operations),
            runId,
            createdAt: now,
        }));
    }

    if (transformationNeeded && transformationId) {
        const transformation: DatasetTransformationRecord = {
            recordId: `transformation:${reportId}:${transformationId}`,
            recordKind: 'transformation',
            transformationId,
            datasetId,
            reportId,
            runId,
            kind: resolveTransformationKind(operations, runId),
            inputVersionId: previousCurrentVersionId,
            outputVersionId: currentVersionId,
            rollbackVersionId: previousCurrentVersionId,
            operations,
            status: 'committed',
            verification: {
                status: resolveVerificationStatus(report.appState),
                reasons: resolveVerificationReasons(report.appState),
            },
            evidenceReferences: resolveEvidenceReferences(report.appState),
            createdAt: now,
            completedAt: now,
        };
        records.push(transformation);
    }

    return { report: normalizedReport, records, legacyDatasetId };
};

export const normalizeLegacyReportLineage = (report: Report): Report =>
    buildReportLineageBundle(report).report;
