import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Settings, Report, AgentMemoryRun, StoredReportArtifactRecord, CsvData, VectorStoreDocument, DatasetLineageRecord, CloudAiConsentRecord, LocalDiagnosticRecord } from '../../types';
import { DATASET_COMMITS_STORE, type DatasetCommitRecord } from '../../types/datasetCommit';
import { DATASET_RETENTION_STORE, type DatasetRetainedArtifact } from '../data/datasetRecoveryContract';

export const DB_NAME = 'csv-ai-assistant-db';
export const STORAGE_DB_VERSION = 14;
export const REPORTS_STORE_NAME = 'reports';
export const MEMORY_STORE_NAME = 'agent_memory_runs';
export const SETTINGS_STORE_NAME = 'settings';
export const CLOUD_AI_CONSENTS_STORE_NAME = 'ai_consents';
export const REPORT_ARTIFACTS_STORE_NAME = 'report_artifacts';
export const ORIGINAL_DATA_STORE_NAME = 'original_data';
/** Original CSV file bytes keyed by source fingerprint, so History can restore full data without re-selecting the file. */
export const SOURCE_FILES_STORE_NAME = 'source_files';
export const VECTOR_MEMORY_STORE_NAME = 'vector_memory';
export const DATASET_LINEAGE_STORE_NAME = 'dataset_lineage';
export const LOCAL_DIAGNOSTICS_STORE_NAME = 'local_diagnostics';
export const SETTINGS_KEY = 'csv-ai-assistant-settings';
export const SETTINGS_RECORD_KEY = 'app_settings';
export const CURRENT_SESSION_KEY = 'current_session';

export interface MyDB extends DBSchema {
  [DATASET_RETENTION_STORE]: { key: string; value: DatasetRetainedArtifact; indexes: { sessionId: string; commitId: string } };
  [DATASET_COMMITS_STORE]: {
    key: string;
    value: DatasetCommitRecord;
    indexes: { 'sessionId': string; 'intentKey': string; 'approvalKey': string; 'commitId': string };
  };
  [REPORTS_STORE_NAME]: {
    key: string;
    value: Report;
    indexes: { 'updatedAt': Date };
  };
  [MEMORY_STORE_NAME]: {
    key: string;
    value: AgentMemoryRun;
    indexes: { 'datasetId': string; 'createdAt': Date };
  };
  [SETTINGS_STORE_NAME]: {
    key: string;
    value: {
      key: string;
      settings?: Settings;
      /** Restrictive coordinator accounting, never settings or executable authority. */
      coordinatorBudget?: import('../agent/runtime/pi/piRepairReservation').RepairBudgetCheckpoint;
    };
  };
  [CLOUD_AI_CONSENTS_STORE_NAME]: {
    key: string;
    value: CloudAiConsentRecord;
    indexes: {
      'datasetId': string;
      'provider': Settings['provider'];
    };
  };
  [REPORT_ARTIFACTS_STORE_NAME]: {
    key: string;
    value: StoredReportArtifactRecord;
    indexes: { 'generatedAt': string };
  };
  [ORIGINAL_DATA_STORE_NAME]: {
    key: string;
    value: {
      sessionId: string;
      csvData: CsvData;
      savedAt: number;
      datasetId?: string;
      originalVersionId?: string;
    };
  };
  [SOURCE_FILES_STORE_NAME]: {
    key: string;
    value: { fingerprint: string; fileName: string; byteSize: number; mimeType: string; lastModified: number; blob: Blob; savedAt: number };
  };
  [VECTOR_MEMORY_STORE_NAME]: {
    key: string;
    value: { key: string; documents: VectorStoreDocument[]; savedAt: number };
  };
  [DATASET_LINEAGE_STORE_NAME]: {
    key: string;
    value: DatasetLineageRecord;
    indexes: {
      'datasetId': string;
      'reportId': string;
      'recordKind': 'version' | 'transformation';
      'createdAt': Date;
    };
  };
  [LOCAL_DIAGNOSTICS_STORE_NAME]: {
    key: string;
    value: LocalDiagnosticRecord;
    indexes: {
      'recordedAt': string;
      'expiresAt': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>> | undefined;
let localDataClearInProgress = false;

/** True while (or after) a clear-all-local-data run has locked the database. */
export const isLocalDataClearInProgress = (): boolean => localDataClearInProgress;
/** Lock the database so late async work cannot recreate records. */
export const lockLocalDataClear = (): void => { localDataClearInProgress = true; };
export const unlockLocalDataClear = (): void => { localDataClearInProgress = false; };
/** Detach and return the current connection promise so the caller can close it. */
export const detachDatabaseConnection = (): Promise<IDBPDatabase<MyDB>> | undefined => {
    const stale = dbPromise;
    dbPromise = undefined;
    return stale;
};
export const resetConnectionStateForTests = (): void => {
    localDataClearInProgress = false;
    dbPromise = undefined;
};

export class StorageOperationError extends Error {
  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${operation} failed: ${detail}`);
    this.name = 'StorageOperationError';
  }
}

export const getDb = (): Promise<IDBPDatabase<MyDB>> => {
  if (localDataClearInProgress) {
    return Promise.reject(new StorageOperationError(
      'openDatabase',
      'Local data was cleared; reload before creating new records.',
    ));
  }
  dbPromise ??= openStorageDatabase();
  return dbPromise;
};

export type StorageDatabase = IDBPDatabase<MyDB>;
export const getStorageDatabase = getDb;
/** Qualification opens a separate database through the exact production schema. */
export const openStorageDatabase = (name = DB_NAME): Promise<StorageDatabase> => openDB<MyDB>(name, STORAGE_DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(DATASET_RETENTION_STORE)) {
            const retention = db.createObjectStore(DATASET_RETENTION_STORE, { keyPath: 'recordId' });
            retention.createIndex('sessionId', 'sessionId'); retention.createIndex('commitId', 'commitId');
        }
        if (!db.objectStoreNames.contains(DATASET_COMMITS_STORE)) {
            const commits = db.createObjectStore(DATASET_COMMITS_STORE, { keyPath: 'recordId' });
            commits.createIndex('sessionId', 'sessionId');
            commits.createIndex('intentKey', 'intentKey', { unique: true });
            commits.createIndex('approvalKey', 'approvalKey', { unique: true });
            commits.createIndex('commitId', 'commitId');
        }
        // FIX: Removed explicit `IDBObjectStore` type to allow type inference
        // of the `idb` library's `IDBPObjectStore` wrapper.
        let reportStore;
        if (!db.objectStoreNames.contains(REPORTS_STORE_NAME)) {
            reportStore = db.createObjectStore(REPORTS_STORE_NAME, { keyPath: 'id' });
        } else if (transaction) {
            reportStore = transaction.objectStore(REPORTS_STORE_NAME);
        }
        if (reportStore && !reportStore.indexNames.contains('updatedAt')) {
            reportStore.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains(MEMORY_STORE_NAME)) {
            const memoryStore = db.createObjectStore(MEMORY_STORE_NAME, { keyPath: 'runId' });
            memoryStore.createIndex('datasetId', 'datasetId');
            memoryStore.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
            db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
        }
        let consentStore;
        if (!db.objectStoreNames.contains(CLOUD_AI_CONSENTS_STORE_NAME)) {
            consentStore = db.createObjectStore(CLOUD_AI_CONSENTS_STORE_NAME, { keyPath: 'key' });
        } else if (transaction) {
            consentStore = transaction.objectStore(CLOUD_AI_CONSENTS_STORE_NAME);
        }
        if (consentStore && !consentStore.indexNames.contains('datasetId')) {
            consentStore.createIndex('datasetId', 'datasetId');
        }
        if (consentStore && !consentStore.indexNames.contains('provider')) {
            consentStore.createIndex('provider', 'provider');
        }
        let artifactStore;
        if (!db.objectStoreNames.contains(REPORT_ARTIFACTS_STORE_NAME)) {
            artifactStore = db.createObjectStore(REPORT_ARTIFACTS_STORE_NAME, { keyPath: 'reportId' });
        } else if (transaction) {
            artifactStore = transaction.objectStore(REPORT_ARTIFACTS_STORE_NAME);
        }
        if (artifactStore && !artifactStore.indexNames.contains('generatedAt')) {
            artifactStore.createIndex('generatedAt', 'generatedAt');
        }
        if (!db.objectStoreNames.contains(ORIGINAL_DATA_STORE_NAME)) {
            db.createObjectStore(ORIGINAL_DATA_STORE_NAME, { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains(SOURCE_FILES_STORE_NAME)) {
            db.createObjectStore(SOURCE_FILES_STORE_NAME, { keyPath: 'fingerprint' });
        }
        if (!db.objectStoreNames.contains(VECTOR_MEMORY_STORE_NAME)) {
            db.createObjectStore(VECTOR_MEMORY_STORE_NAME, { keyPath: 'key' });
        }
        let lineageStore;
        if (!db.objectStoreNames.contains(DATASET_LINEAGE_STORE_NAME)) {
            lineageStore = db.createObjectStore(DATASET_LINEAGE_STORE_NAME, { keyPath: 'recordId' });
        } else if (transaction) {
            lineageStore = transaction.objectStore(DATASET_LINEAGE_STORE_NAME);
        }
        if (lineageStore && !lineageStore.indexNames.contains('datasetId')) {
            lineageStore.createIndex('datasetId', 'datasetId');
        }
        if (lineageStore && !lineageStore.indexNames.contains('reportId')) {
            lineageStore.createIndex('reportId', 'reportId');
        }
        if (lineageStore && !lineageStore.indexNames.contains('recordKind')) {
            lineageStore.createIndex('recordKind', 'recordKind');
        }
        if (lineageStore && !lineageStore.indexNames.contains('createdAt')) {
            lineageStore.createIndex('createdAt', 'createdAt');
        }
        let diagnosticsStore;
        if (!db.objectStoreNames.contains(LOCAL_DIAGNOSTICS_STORE_NAME)) {
            diagnosticsStore = db.createObjectStore(LOCAL_DIAGNOSTICS_STORE_NAME, { keyPath: 'id' });
        } else if (transaction) {
            diagnosticsStore = transaction.objectStore(LOCAL_DIAGNOSTICS_STORE_NAME);
        }
        if (diagnosticsStore && !diagnosticsStore.indexNames.contains('recordedAt')) {
            diagnosticsStore.createIndex('recordedAt', 'recordedAt');
        }
        if (diagnosticsStore && !diagnosticsStore.indexNames.contains('expiresAt')) {
            diagnosticsStore.createIndex('expiresAt', 'expiresAt');
        }
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        if (name === DB_NAME) dbPromise = undefined;
      },
    });

export const isInvalidStateError = (error: unknown) =>
    typeof DOMException !== 'undefined' && error instanceof DOMException
        ? error.name === 'InvalidStateError'
        : error instanceof Error && (
            error.name === 'InvalidStateError'
            || /InvalidStateError/i.test(error.message)
        );

export const reopenDbAfterInvalidState = async () => {
    const stalePromise = detachDatabaseConnection();
    if (!stalePromise) return;
    try {
        (await stalePromise).close();
    } catch {
        // The stale connection may already be closed or its open request failed.
    }
};

export const runWithIndexedDbReconnect = async <T>(
    operation: (db: IDBPDatabase<MyDB>) => Promise<T>,
): Promise<T> => {
    try {
        return await operation(await getDb());
    } catch (error) {
        if (!isInvalidStateError(error)) {
            throw error;
        }
        await reopenDbAfterInvalidState();
        return operation(await getDb());
    }
};
