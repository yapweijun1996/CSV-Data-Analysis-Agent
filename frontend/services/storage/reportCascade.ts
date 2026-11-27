import { type IDBPDatabase } from 'idb';
import type { Report, DatasetVersionRecord } from '../../types';
import { toSerializable } from '../../utils/serializable';
import { DATASET_LINEAGE_STORE_NAME, MEMORY_STORE_NAME, MyDB, ORIGINAL_DATA_STORE_NAME, REPORTS_STORE_NAME, REPORT_ARTIFACTS_STORE_NAME } from './connection';
import { MAX_REPORTS_KEPT } from './storageMaintenance';

/** Max recoverable version snapshots per dataset, including original/current. */
export const MAX_DATASET_VERSIONS_PER_DATASET = 8;

export const getCanonicalReportId = (report: Report): string =>
    report.lineage?.reportId ?? report.appState?.sessionId ?? report.id;

export const migrateAgentMemoryDatasetId = async (
    db: IDBPDatabase<MyDB>,
    legacyDatasetId: string | null,
    datasetId: string,
): Promise<void> => {
    if (!legacyDatasetId || legacyDatasetId === datasetId) return;
    try {
        const runs = await db.getAllFromIndex(
            MEMORY_STORE_NAME,
            'datasetId',
            IDBKeyRange.only(legacyDatasetId),
        );
        for (const run of runs) {
            await db.put(MEMORY_STORE_NAME, toSerializable({ ...run, datasetId }));
        }
    } catch (error) {
        console.warn('[StorageMigration] Could not migrate legacy agent-memory dataset IDs.', error);
    }
};

export const evictOldDatasetVersions = async (
    db: IDBPDatabase<MyDB>,
    datasetId: string,
): Promise<number> => {
    const records = await db.getAllFromIndex(
        DATASET_LINEAGE_STORE_NAME,
        'datasetId',
        IDBKeyRange.only(datasetId),
    );
    const versions = records
        .filter((record): record is DatasetVersionRecord => record.recordKind === 'version')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (versions.length <= MAX_DATASET_VERSIONS_PER_DATASET) return 0;

    const protectedVersionIds = new Set<string>();
    const reports = await db.getAll(REPORTS_STORE_NAME);
    for (const report of reports) {
        if (report.lineage?.datasetId !== datasetId) continue;
        protectedVersionIds.add(report.lineage.originalVersionId);
        protectedVersionIds.add(report.lineage.currentVersionId);
    }

    const removable = versions.filter(version => !protectedVersionIds.has(version.versionId));
    const deleteCount = Math.min(
        removable.length,
        versions.length - MAX_DATASET_VERSIONS_PER_DATASET,
    );
    for (const version of removable.slice(0, deleteCount)) {
        await db.delete(DATASET_LINEAGE_STORE_NAME, version.recordId);
    }
    return deleteCount;
};

export const deleteLineageForReport = async (
    db: IDBPDatabase<MyDB>,
    reportId: string,
): Promise<number> => {
    const records = await db.getAllFromIndex(
        DATASET_LINEAGE_STORE_NAME,
        'reportId',
        IDBKeyRange.only(reportId),
    );
    for (const record of records) {
        await db.delete(DATASET_LINEAGE_STORE_NAME, record.recordId);
    }
    return records.length;
};

export const deleteMemoryForDataset = async (
    db: IDBPDatabase<MyDB>,
    datasetId: string,
): Promise<number> => {
    const runs = await db.getAllFromIndex(
        MEMORY_STORE_NAME,
        'datasetId',
        IDBKeyRange.only(datasetId),
    );
    for (const run of runs) {
        await db.delete(MEMORY_STORE_NAME, run.runId);
    }
    return runs.length;
};

export const deleteReportWithCascade = async (
    db: IDBPDatabase<MyDB>,
    report: Report,
): Promise<void> => {
    const canonicalReportId = getCanonicalReportId(report);
    const sessionId = report.appState?.sessionId;
    const datasetId = report.lineage?.datasetId ?? report.appState?.currentDatasetId ?? null;

    await db.delete(REPORTS_STORE_NAME, report.id);
    await db.delete(REPORT_ARTIFACTS_STORE_NAME, report.id);

    const remainingReports = await db.getAll(REPORTS_STORE_NAME);
    const stillReferenced = remainingReports.some(candidate =>
        getCanonicalReportId(candidate) === canonicalReportId
    );
    if (stillReferenced) return;

    if (sessionId) {
        await db.delete(ORIGINAL_DATA_STORE_NAME, sessionId);
    }
    await deleteLineageForReport(db, canonicalReportId);
    if (datasetId) {
        const datasetStillReferenced = remainingReports.some(candidate =>
            candidate.lineage?.datasetId === datasetId
                || candidate.appState?.currentDatasetId === datasetId
        );
        if (!datasetStillReferenced) {
            await deleteMemoryForDataset(db, datasetId);
        }
    }
};

/**
 * Evict oldest reports beyond MAX_REPORTS_KEPT.
 * Returns the number of records deleted.
 */
