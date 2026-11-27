import type { CsvData, DatasetLineageRecord, DatasetVersionRecord } from '../../types';
import { toSerializable } from '../../utils/serializable';
import { buildDatasetId, buildDatasetVersionId } from '../../utils/datasetId';
import { DATASET_LINEAGE_STORE_NAME, ORIGINAL_DATA_STORE_NAME, getDb } from './connection';

/** Persist the original (pre-cleaning) CsvData for a session so it survives page refresh. */
export const saveOriginalData = async (sessionId: string, csvData: CsvData): Promise<void> => {
    try {
        const db = await getDb();
        // add() is intentionally used instead of get()+put(): the key
        // constraint makes concurrent first writes atomic and preserves the
        // immutable source snapshot.
        await db.add(ORIGINAL_DATA_STORE_NAME, {
            sessionId,
            csvData: toSerializable(csvData) as unknown as CsvData,
            savedAt: Date.now(),
            datasetId: buildDatasetId(csvData.fileName, csvData.data),
            originalVersionId: buildDatasetVersionId(csvData.fileName, csvData.data),
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'ConstraintError') {
            return;
        }
        console.error('Failed to save original data to IndexedDB:', error);
        // Non-fatal: rollback will still work from in-memory rawCsvData if IndexedDB fails.
    }
};

/** Retrieve the original (pre-cleaning) CsvData for a session. Returns null if not found. */
export const getOriginalData = async (sessionId: string): Promise<CsvData | null> => {
    try {
        const db = await getDb();
        const record = await db.get(ORIGINAL_DATA_STORE_NAME, sessionId);
        return record?.csvData ?? null;
    } catch (error) {
        console.error('Failed to read original data from IndexedDB:', error);
        return null;
    }
};

/** Remove the original data for a session (call on explicit session reset). */
export const deleteOriginalData = async (sessionId: string): Promise<void> => {
    try {
        const db = await getDb();
        await db.delete(ORIGINAL_DATA_STORE_NAME, sessionId);
    } catch (error) {
        console.error('Failed to delete original data from IndexedDB:', error);
    }
};

// Dataset Version & Transformation Lineage

/** Return the ordered lineage records for one stable dataset identity. */
export const getDatasetLineage = async (datasetId: string): Promise<DatasetLineageRecord[]> => {
    try {
        const db = await getDb();
        const records = await db.getAllFromIndex(
            DATASET_LINEAGE_STORE_NAME,
            'datasetId',
            IDBKeyRange.only(datasetId),
        );
        return records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } catch (error) {
        console.error('Failed to read dataset lineage from IndexedDB:', error);
        return [];
    }
};

/** Retrieve a recoverable material dataset snapshot by stable version ID. */
export const getDatasetVersionSnapshot = async (
    datasetId: string,
    versionId: string,
): Promise<CsvData | null> => {
    const records = await getDatasetLineage(datasetId);
    const version = records.find(
        (record): record is DatasetVersionRecord =>
            record.recordKind === 'version' && record.versionId === versionId,
    );
    return version?.snapshot ?? null;
};
