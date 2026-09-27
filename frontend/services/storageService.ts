
import { deleteDB, openDB, DBSchema, IDBPDatabase } from 'idb';
import {
    AppState,
    Settings,
    Report,
    ReportListItem,
    AgentMemoryRun,
    StoredReportArtifactRecord,
    CsvData,
    VectorStoreDocument,
    DatasetLineageRecord,
    DatasetVersionRecord,
    ReportMemoryScope,
    CloudAiConsentRecord,
    LocalDiagnosticRecord,
} from '../types';
import { getRuntimeDefaultSettings, getForceSimpleModel, getForceComplexModel, getForceFallbackModel } from '../config/runtimeConfig';
import { DEFAULT_GATEWAY_MODEL } from '../config/defaultGatewayConfig';
import { normalizeRuntimePolicySettings } from './agent/runtime/runtimePolicySettings';
import { createDefaultRuntimeAccessControl, normalizeRuntimeAccessControlSettings } from './runtimeAccessControl';
import { toSerializable } from '../utils/serializable';
import { normalizeAppLanguage } from '../utils/localizedText';
import {
    buildReportLineageBundle,
} from './persistence/datasetLineage';
import { buildDatasetId, buildDatasetVersionId } from '../utils/datasetId';

const DB_NAME = 'csv-ai-assistant-db';
export const STORAGE_DB_VERSION = 11;
const REPORTS_STORE_NAME = 'reports';
const MEMORY_STORE_NAME = 'agent_memory_runs';
const SETTINGS_STORE_NAME = 'settings';
export const CLOUD_AI_CONSENTS_STORE_NAME = 'ai_consents';
const REPORT_ARTIFACTS_STORE_NAME = 'report_artifacts';
const ORIGINAL_DATA_STORE_NAME = 'original_data';
const VECTOR_MEMORY_STORE_NAME = 'vector_memory';
export const DATASET_LINEAGE_STORE_NAME = 'dataset_lineage';
export const LOCAL_DIAGNOSTICS_STORE_NAME = 'local_diagnostics';
const SETTINGS_KEY = 'csv-ai-assistant-settings';
const SETTINGS_RECORD_KEY = 'app_settings';
export const CURRENT_SESSION_KEY = 'current_session';

interface MyDB extends DBSchema {
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
      settings: Settings;
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

export class StorageOperationError extends Error {
  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${operation} failed: ${detail}`);
    this.name = 'StorageOperationError';
  }
}

const getDb = (): Promise<IDBPDatabase<MyDB>> => {
  if (localDataClearInProgress) {
    return Promise.reject(new StorageOperationError(
      'openDatabase',
      'Local data was cleared; reload before creating new records.',
    ));
  }
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, STORAGE_DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
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
      blocking(_currentVersion, blockedVersion, event) {
        if (blockedVersion === null) {
          (event.target as IDBDatabase | null)?.close();
        }
      },
    });
  }
  return dbPromise;
};

const isInvalidStateError = (error: unknown) =>
    typeof DOMException !== 'undefined' && error instanceof DOMException
        ? error.name === 'InvalidStateError'
        : error instanceof Error && (
            error.name === 'InvalidStateError'
            || /InvalidStateError/i.test(error.message)
        );

const reopenDbAfterInvalidState = async () => {
    const stalePromise = dbPromise;
    dbPromise = undefined;
    if (!stalePromise) return;
    try {
        (await stalePromise).close();
    } catch {
        // The stale connection may already be closed or its open request failed.
    }
};

const runWithIndexedDbReconnect = async <T>(
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

// ---------------------------------------------------------------------------
// Storage Breakdown — per-store diagnostics
// ---------------------------------------------------------------------------

export interface StorageStoreInfo {
    storeName: string;
    label: string;
    recordCount: number;
    estimatedBytes: number;
}

export interface StorageBreakdownResult {
    stores: StorageStoreInfo[];
    cacheStorage: { cacheCount: number; estimatedBytes: number };
    totalIdbBytes: number;
    totalWithCacheBytes: number;
    rawOriginBytes: number;
}

/** Rough byte estimate of a JS value via JSON serialization. */
const estimateRecordBytes = (value: unknown): number => {
    try {
        return new Blob([JSON.stringify(value)]).size;
    } catch {
        return 0;
    }
};

/**
 * Enumerate all IndexedDB stores and Cache Storage with record counts and sizes.
 * Designed for the Storage Inspector UI.
 */
export const getStorageBreakdown = async (): Promise<StorageBreakdownResult> => {
    const db = await getDb();
    type StoreName = 'reports' | 'report_artifacts' | 'original_data' | 'agent_memory_runs' | 'vector_memory' | 'dataset_lineage' | 'settings' | 'ai_consents' | 'local_diagnostics';
    const storeConfigs: { name: StoreName; label: string }[] = [
        { name: REPORTS_STORE_NAME, label: 'Reports (sessions)' },
        { name: REPORT_ARTIFACTS_STORE_NAME, label: 'Report Artifacts (HTML)' },
        { name: ORIGINAL_DATA_STORE_NAME, label: 'Original CSV Data' },
        { name: MEMORY_STORE_NAME, label: 'Agent Memory Runs' },
        { name: VECTOR_MEMORY_STORE_NAME, label: 'Vector Memory' },
        { name: DATASET_LINEAGE_STORE_NAME, label: 'Dataset Versions & Lineage' },
        { name: SETTINGS_STORE_NAME, label: 'Settings' },
        { name: CLOUD_AI_CONSENTS_STORE_NAME, label: 'Cloud AI Consent Records' },
        { name: LOCAL_DIAGNOSTICS_STORE_NAME, label: 'Local Debug Diagnostics (7 days)' },
    ];

    const stores: StorageStoreInfo[] = [];
    let totalIdbBytes = 0;

    for (const { name, label } of storeConfigs) {
        try {
            const tx = db.transaction(name, 'readonly');
            const store = tx.objectStore(name);
            let cursor = await store.openCursor();
            let recordCount = 0;
            let estimatedBytes = 0;
            while (cursor) {
                recordCount += 1;
                estimatedBytes += estimateRecordBytes(cursor.value);
                cursor = await cursor.continue();
            }
            stores.push({ storeName: name, label, recordCount, estimatedBytes });
            totalIdbBytes += estimatedBytes;
        } catch {
            stores.push({ storeName: name, label, recordCount: 0, estimatedBytes: 0 });
        }
    }

    // Cache Storage (ONNX models etc.)
    let cacheCount = 0;
    let cacheBytes = 0;
    try {
        if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            cacheCount = keys.length;
            for (const key of keys) {
                const cache = await caches.open(key);
                const requests = await cache.keys();
                for (const req of requests) {
                    try {
                        const resp = await cache.match(req);
                        if (resp) {
                            const cl = resp.headers.get('content-length');
                            cacheBytes += cl ? (parseInt(cl, 10) || 0) : (await resp.clone().arrayBuffer()).byteLength;
                        }
                    } catch { /* skip */ }
                }
            }
        }
    } catch { /* non-fatal */ }

    let rawOriginBytes = 0;
    try {
        if (navigator?.storage?.estimate) {
            const est = await navigator.storage.estimate();
            rawOriginBytes = est.usage ?? 0;
        }
    } catch { /* non-fatal */ }

    return {
        stores,
        cacheStorage: { cacheCount, estimatedBytes: cacheBytes },
        totalIdbBytes,
        totalWithCacheBytes: totalIdbBytes + cacheBytes,
        rawOriginBytes,
    };
};

/** Clear a specific IndexedDB store (all records). Returns number of records deleted. */
export const clearStore = async (storeName: string, protectKeys?: Set<string>): Promise<number> => {
    const db = await getDb();
    const allKeys = await db.getAllKeys(storeName as any);
    let deleted = 0;
    for (const key of allKeys) {
        if (protectKeys?.has(key as string)) continue;
        if (storeName === REPORTS_STORE_NAME) {
            const report = await db.get(REPORTS_STORE_NAME, key as string);
            if (report) {
                await deleteReportWithCascade(db, report);
            } else {
                await db.delete(REPORTS_STORE_NAME, key as string);
            }
        } else {
            await db.delete(storeName as any, key);
        }
        deleted += 1;
    }
    if (storeName === REPORTS_STORE_NAME) {
        try { localStorage.removeItem(REPORTS_INDEX_CACHE_KEY); } catch { /* ignore */ }
    }
    return deleted;
};

/** Clear all Cache Storage entries. Returns number of caches deleted. */
export const clearAllCacheStorage = async (): Promise<number> => {
    let cleared = 0;
    try {
        if (typeof caches !== 'undefined') {
            const keys = await caches.keys();
            for (const key of keys) {
                await caches.delete(key);
                cleared += 1;
            }
        }
    } catch { /* non-fatal */ }
    _cacheStorageBytesEstimate = null;
    return cleared;
};

export const getCloudAiConsent = async (
    key: string,
): Promise<CloudAiConsentRecord | null> => {
    try {
        const record = await runWithIndexedDbReconnect(db =>
            db.get(CLOUD_AI_CONSENTS_STORE_NAME, key),
        );
        return record ?? null;
    } catch (error) {
        console.error('Failed to read cloud AI consent from IndexedDB:', error);
        throw new StorageOperationError('getCloudAiConsent', error);
    }
};

export const saveCloudAiConsent = async (
    record: CloudAiConsentRecord,
): Promise<void> => {
    try {
        await runWithIndexedDbReconnect(db =>
            db.put(CLOUD_AI_CONSENTS_STORE_NAME, record),
        );
    } catch (error) {
        console.error('Failed to save cloud AI consent to IndexedDB:', error);
        throw new StorageOperationError('saveCloudAiConsent', error);
    }
};

export const pruneExpiredLocalDiagnostics = async (
    now = Date.now(),
): Promise<number> => runWithIndexedDbReconnect(async db => {
    const records = await db.getAll(LOCAL_DIAGNOSTICS_STORE_NAME);
    const expired = records.filter(record =>
        !Number.isFinite(Date.parse(record.expiresAt))
        || Date.parse(record.expiresAt) <= now);
    await Promise.all(expired.map(record =>
        db.delete(LOCAL_DIAGNOSTICS_STORE_NAME, record.id)));
    return expired.length;
});

export const saveLocalDiagnostic = async (
    record: LocalDiagnosticRecord,
    options: { now?: number; maxTotalBytes: number },
): Promise<void> => runWithIndexedDbReconnect(async db => {
    const now = options.now ?? Date.now();
    const records = (await db.getAll(LOCAL_DIAGNOSTICS_STORE_NAME))
        .filter(existing => Number.isFinite(Date.parse(existing.expiresAt))
            && Date.parse(existing.expiresAt) > now)
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const keepIds = new Set(records.map(existing => existing.id));
    const allKeys = await db.getAllKeys(LOCAL_DIAGNOSTICS_STORE_NAME);
    await Promise.all(allKeys
        .filter(key => !keepIds.has(String(key)))
        .map(key => db.delete(LOCAL_DIAGNOSTICS_STORE_NAME, key)));

    let totalBytes = records.reduce(
        (total, existing) => total + Math.max(0, existing.estimatedBytes || 0),
        Math.max(0, record.estimatedBytes || 0),
    );
    while (records.length > 0 && totalBytes > options.maxTotalBytes) {
        const oldest = records.shift()!;
        totalBytes -= Math.max(0, oldest.estimatedBytes || 0);
        await db.delete(LOCAL_DIAGNOSTICS_STORE_NAME, oldest.id);
    }
    await db.put(LOCAL_DIAGNOSTICS_STORE_NAME, record);
});

export const getRecentLocalDiagnostics = async (
    limit = 200,
    now = Date.now(),
): Promise<LocalDiagnosticRecord[]> => runWithIndexedDbReconnect(async db => {
    const records = await db.getAllFromIndex(
        LOCAL_DIAGNOSTICS_STORE_NAME,
        'recordedAt',
    );
    const active = records.filter(record =>
        Number.isFinite(Date.parse(record.expiresAt))
        && Date.parse(record.expiresAt) > now);
    return active.slice(-Math.max(1, Math.trunc(limit))).reverse();
});

export interface ClearAllLocalBrowserDataResult {
    indexedDbDeleted: true;
    localStorageCleared: boolean;
    sessionStorageCleared: boolean;
    cacheCount: number;
    opfsCleared: boolean;
}

/**
 * Delete every browser-persisted app record, including settings and BYOK keys.
 * Database access stays locked after success so late async work cannot recreate
 * records before the caller reloads the application.
 */
export const clearAllLocalBrowserData = async (): Promise<ClearAllLocalBrowserDataResult> => {
    if (localDataClearInProgress) {
        throw new StorageOperationError('clearAllLocalBrowserData', 'A local-data clear is already in progress.');
    }
    localDataClearInProgress = true;

    const stalePromise = dbPromise;
    dbPromise = undefined;
    try {
        if (stalePromise) {
            try {
                (await stalePromise).close();
            } catch {
                // The connection may already be closed.
            }
        }
        await deleteDB(DB_NAME);
    } catch (error) {
        localDataClearInProgress = false;
        throw new StorageOperationError('clearAllLocalBrowserData', error);
    }

    let localStorageCleared = false;
    let sessionStorageCleared = false;
    try {
        localStorage.clear();
        localStorageCleared = true;
    } catch {
        // Storage can be unavailable in hardened/private browser modes.
    }
    try {
        sessionStorage.clear();
        sessionStorageCleared = true;
    } catch {
        // Storage can be unavailable in hardened/private browser modes.
    }
    let cacheCount: number;
    let opfsCleared: boolean;
    try {
        const [{ clearAllOpfsDatasetData }, clearedCaches] = await Promise.all([
            import('./data/opfsDatasetStorage'),
            clearAllCacheStorage(),
        ]);
        cacheCount = clearedCaches;
        opfsCleared = await clearAllOpfsDatasetData();
    } catch (error) {
        localDataClearInProgress = false;
        throw new StorageOperationError('clearAllLocalBrowserData', error);
    }

    return {
        indexedDbDeleted: true,
        localStorageCleared,
        sessionStorageCleared,
        cacheCount,
        opfsCleared,
    };
};

export const __resetStorageClearStateForTests = (): void => {
    localDataClearInProgress = false;
    dbPromise = undefined;
};

// ---------------------------------------------------------------------------
// Storage Health — quota check + auto-cleanup
// ---------------------------------------------------------------------------

/** Estimated usage / quota via the Storage Manager API (best-effort). */
export interface StorageEstimate {
    usageBytes: number;
    quotaBytes: number;
    usagePercent: number;
}

/**
 * Estimate Cache Storage size (used by @huggingface/transformers ONNX model cache).
 * Cached after first call since Cache Storage content rarely changes during a session.
 */
let _cacheStorageBytesEstimate: number | null = null;
const estimateCacheStorageBytes = async (): Promise<number> => {
    if (_cacheStorageBytesEstimate !== null) return _cacheStorageBytesEstimate;
    try {
        if (typeof caches === 'undefined') { _cacheStorageBytesEstimate = 0; return 0; }
        const keys = await caches.keys();
        if (keys.length === 0) { _cacheStorageBytesEstimate = 0; return 0; }
        let total = 0;
        for (const key of keys) {
            const cache = await caches.open(key);
            const requests = await cache.keys();
            for (const req of requests) {
                try {
                    const resp = await cache.match(req);
                    if (resp) {
                        // Use Content-Length header if available (cheap), else read body size.
                        const cl = resp.headers.get('content-length');
                        if (cl) {
                            total += parseInt(cl, 10) || 0;
                        } else {
                            const body = await resp.clone().arrayBuffer();
                            total += body.byteLength;
                        }
                    }
                } catch { /* non-fatal — skip this entry */ }
            }
        }
        _cacheStorageBytesEstimate = total;
        return total;
    } catch {
        _cacheStorageBytesEstimate = 0;
        return 0;
    }
};

/**
 * Get storage estimate excluding Cache Storage (ONNX model cache).
 * navigator.storage.estimate() includes ALL origin storage (IndexedDB + Cache API + etc).
 * Since Cache Storage is used by @huggingface/transformers for ONNX model files (~200-300 MB)
 * and we cannot control it, we subtract it to get the actual IndexedDB usage.
 */
export const getStorageEstimate = async (): Promise<StorageEstimate | null> => {
    try {
        if (!navigator?.storage?.estimate) return null;
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        const cacheBytes = await estimateCacheStorageBytes();
        const idbUsage = Math.max(0, usage - cacheBytes);
        return {
            usageBytes: idbUsage,
            quotaBytes: quota,
            usagePercent: quota > 0 ? (idbUsage / quota) * 100 : 0,
        };
    } catch {
        return null;
    }
};

const isQuotaExceededError = (error: unknown): boolean => {
    if (error instanceof DOMException) {
        return error.name === 'QuotaExceededError'
            || error.code === 22                  // legacy Safari
            || error.code === 1014;               // Firefox
    }
    return false;
};

/** Max reports to keep (excluding CURRENT_SESSION_KEY). Oldest are evicted first. */
const MAX_REPORTS_KEPT = 20;
/** Max agent memory runs per dataset. Oldest are evicted first. */
const MAX_MEMORY_RUNS_PER_DATASET = 5;
/** Max original data records. Oldest are evicted first. */
const MAX_ORIGINAL_DATA_KEPT = 10;
/** Max recoverable version snapshots per dataset, including original/current. */
const MAX_DATASET_VERSIONS_PER_DATASET = 8;
/** Auto-cleanup trigger threshold (percent of quota). */
const CLEANUP_THRESHOLD_PERCENT = 75;
/** Hard storage cap in bytes. When usage exceeds this, auto-cleanup runs regardless of quota %. */
const HARD_STORAGE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB

const getCanonicalReportId = (report: Report): string =>
    report.lineage?.reportId ?? report.appState?.sessionId ?? report.id;

const migrateAgentMemoryDatasetId = async (
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

const evictOldDatasetVersions = async (
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

const deleteLineageForReport = async (
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

const deleteMemoryForDataset = async (
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

const deleteReportWithCascade = async (
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
export const evictOldReports = async (keepIds?: Set<string>): Promise<number> => {
    try {
        const db = await getDb();
        const allReports = await db.getAllFromIndex(REPORTS_STORE_NAME, 'updatedAt');
        // Sort ascending (oldest first)
        allReports.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        const protected_ = new Set([CURRENT_SESSION_KEY, ...(keepIds ?? [])]);
        const candidates = allReports.filter(r => !protected_.has(r.id));
        const evictCount = Math.max(0, candidates.length - MAX_REPORTS_KEPT);
        if (evictCount === 0) return 0;
        const toEvict = candidates.slice(0, evictCount);
        for (const report of toEvict) {
            await deleteReportWithCascade(db, report);
        }
        console.log(`[StorageCleanup] Evicted ${toEvict.length} old reports`);
        // Invalidate localStorage cache so next getReportsList rebuilds it.
        try { localStorage.removeItem(REPORTS_INDEX_CACHE_KEY); } catch { /* ignore */ }
        return toEvict.length;
    } catch (error) {
        console.error('[StorageCleanup] Failed to evict old reports:', error);
        return 0;
    }
};

/** Evict old agent memory runs beyond MAX_MEMORY_RUNS_PER_DATASET per dataset. */
export const evictOldMemoryRuns = async (): Promise<number> => {
    try {
        const db = await getDb();
        const allRuns = await db.getAll(MEMORY_STORE_NAME);
        const byDataset = new Map<string, AgentMemoryRun[]>();
        for (const run of allRuns) {
            const key = run.datasetId ?? '__unknown__';
            const list = byDataset.get(key) ?? [];
            list.push(run);
            byDataset.set(key, list);
        }
        let evicted = 0;
        for (const [, runs] of byDataset) {
            runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            const excess = runs.slice(MAX_MEMORY_RUNS_PER_DATASET);
            for (const run of excess) {
                await db.delete(MEMORY_STORE_NAME, run.runId);
                evicted += 1;
            }
        }
        if (evicted > 0) console.log(`[StorageCleanup] Evicted ${evicted} old memory runs`);
        return evicted;
    } catch (error) {
        console.error('[StorageCleanup] Failed to evict old memory runs:', error);
        return 0;
    }
};

/** Evict old original data records beyond MAX_ORIGINAL_DATA_KEPT. */
export const evictOldOriginalData = async (keepSessionIds?: Set<string>): Promise<number> => {
    try {
        const db = await getDb();
        const allRecords = await db.getAll(ORIGINAL_DATA_STORE_NAME);
        allRecords.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0)); // oldest first
        const protected_ = keepSessionIds ?? new Set<string>();
        const candidates = allRecords.filter(r => !protected_.has(r.sessionId));
        const evictCount = Math.max(0, candidates.length - MAX_ORIGINAL_DATA_KEPT);
        if (evictCount === 0) return 0;
        const toEvict = candidates.slice(0, evictCount);
        for (const record of toEvict) {
            await db.delete(ORIGINAL_DATA_STORE_NAME, record.sessionId);
        }
        if (toEvict.length > 0) console.log(`[StorageCleanup] Evicted ${toEvict.length} old original data records`);
        return toEvict.length;
    } catch (error) {
        console.error('[StorageCleanup] Failed to evict old original data:', error);
        return 0;
    }
};

/** Evict orphaned child records whose parent report/session no longer exists. */
export const evictOrphanedArtifacts = async (): Promise<{
    orphanedArtifacts: number;
    orphanedVectorMemory: number;
    orphanedOriginalData: number;
    orphanedLineage: number;
}> => {
    let orphanedArtifacts = 0;
    let orphanedVectorMemory = 0;
    let orphanedOriginalData = 0;
    let orphanedLineage = 0;
    try {
        const db = await getDb();
        const reportKeys = new Set(await db.getAllKeys(REPORTS_STORE_NAME));

        // Orphaned report_artifacts: reportId has no matching report.
        const allArtifactKeys = await db.getAllKeys(REPORT_ARTIFACTS_STORE_NAME);
        for (const key of allArtifactKeys) {
            if (!reportKeys.has(key as string)) {
                await db.delete(REPORT_ARTIFACTS_STORE_NAME, key);
                orphanedArtifacts += 1;
            }
        }

        // Orphaned vector_memory: only 'current' is valid in normal operation.
        const allVectorKeys = await db.getAllKeys(VECTOR_MEMORY_STORE_NAME);
        for (const key of allVectorKeys) {
            if (key !== 'current') {
                await db.delete(VECTOR_MEMORY_STORE_NAME, key);
                orphanedVectorMemory += 1;
            }
        }

        // Orphaned original_data: sessionId not referenced by any report's sessionId or appState.
        // Collect all sessionIds that are still referenced by existing reports.
        const liveSessionIds = new Set<string>();
        const liveCanonicalReportIds = new Set<string>();
        for (const reportKey of reportKeys) {
            // The report key itself could be a sessionId reference.
            liveSessionIds.add(reportKey as string);
            // Also extract sessionId from appState if stored inside the report.
            try {
                const report = await db.get(REPORTS_STORE_NAME, reportKey);
                if (report) {
                    liveCanonicalReportIds.add(getCanonicalReportId(report));
                }
                if (report?.appState?.sessionId) {
                    liveSessionIds.add(report.appState.sessionId);
                }
            } catch { /* non-fatal — skip this report */ }
        }
        // Also protect the current tab sessionId stored in sessionStorage.
        try {
            const tabSessionId = sessionStorage.getItem('csv_agent_tab_session_id');
            if (tabSessionId) liveSessionIds.add(tabSessionId);
        } catch { /* non-fatal */ }

        const allOriginalDataKeys = await db.getAllKeys(ORIGINAL_DATA_STORE_NAME);
        for (const key of allOriginalDataKeys) {
            if (!liveSessionIds.has(key as string)) {
                await db.delete(ORIGINAL_DATA_STORE_NAME, key);
                orphanedOriginalData += 1;
            }
        }

        const allLineageRecords = await db.getAll(DATASET_LINEAGE_STORE_NAME);
        for (const record of allLineageRecords) {
            if (!liveCanonicalReportIds.has(record.reportId)) {
                await db.delete(DATASET_LINEAGE_STORE_NAME, record.recordId);
                orphanedLineage += 1;
            }
        }

        if (orphanedArtifacts > 0 || orphanedVectorMemory > 0 || orphanedOriginalData > 0 || orphanedLineage > 0) {
            console.log(`[StorageCleanup] Evicted ${orphanedArtifacts} orphaned artifacts, ${orphanedVectorMemory} orphaned vector memory, ${orphanedOriginalData} orphaned original_data entries, ${orphanedLineage} orphaned lineage records`);
        }
    } catch (error) {
        console.error('[StorageCleanup] Failed to evict orphaned records:', error);
    }
    return { orphanedArtifacts, orphanedVectorMemory, orphanedOriginalData, orphanedLineage };
};

/** Size-aware eviction: delete oldest reports (+ artifacts + original_data) until storage is under targetBytes. */
const evictBySize = async (activeSessionId?: string, targetBytes: number = HARD_STORAGE_CAP_BYTES * 0.8): Promise<number> => {
    try {
        const estimate = await getStorageEstimate();
        if (!estimate || estimate.usageBytes < targetBytes) return 0;

        const db = await getDb();

        // Phase A: evict oldest reports + their cascading data.
        const allReports = await db.getAllFromIndex(REPORTS_STORE_NAME, 'updatedAt');
        allReports.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()); // oldest first
        const protected_ = new Set([CURRENT_SESSION_KEY, ...(activeSessionId ? [activeSessionId] : [])]);
        const candidates = allReports.filter(r => !protected_.has(r.id));

        let evicted = 0;
        const MAX_EVICTIONS = 50;
        for (let i = 0; i < candidates.length && evicted < MAX_EVICTIONS; i++) {
            const report = candidates[i];
            await deleteReportWithCascade(db, report);
            evicted += 1;

            // Re-check storage every 3 deletions to avoid over-deleting.
            if (evicted % 3 === 0) {
                const current = await getStorageEstimate();
                if (current && current.usageBytes < targetBytes) break;
            }
        }

        // Phase B: if still over target, evict oldest original_data records directly.
        // These may be orphans or just large blobs not linked to evicted reports.
        let postCheck = await getStorageEstimate();
        if (postCheck && postCheck.usageBytes >= targetBytes) {
            const allOriginal = await db.getAll(ORIGINAL_DATA_STORE_NAME);
            allOriginal.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0)); // oldest first
            // Protect the current active session.
            const protectedSessions = new Set<string>();
            if (activeSessionId) protectedSessions.add(activeSessionId);
            try {
                const tabSessionId = sessionStorage.getItem('csv_agent_tab_session_id');
                if (tabSessionId) protectedSessions.add(tabSessionId);
            } catch { /* non-fatal */ }

            for (const record of allOriginal) {
                if (protectedSessions.has(record.sessionId)) continue;
                await db.delete(ORIGINAL_DATA_STORE_NAME, record.sessionId);
                evicted += 1;
                // Re-check after each deletion since original_data can be very large.
                const current = await getStorageEstimate();
                if (current && current.usageBytes < targetBytes) break;
            }
        }

        if (evicted > 0) {
            console.log(`[StorageCleanup] Size-aware eviction: deleted ${evicted} oldest reports to reduce storage`);
            try { localStorage.removeItem(REPORTS_INDEX_CACHE_KEY); } catch { /* ignore */ }
        }
        return evicted;
    } catch (error) {
        console.error('[StorageCleanup] Size-aware eviction failed:', error);
        return 0;
    }
};

/**
 * Run all cleanup routines. Called automatically when storage exceeds
 * CLEANUP_THRESHOLD_PERCENT or after a QuotaExceededError.
 */
export const runStorageCleanup = async (activeSessionId?: string): Promise<{
    evictedReports: number;
    evictedMemoryRuns: number;
    evictedOriginalData: number;
    orphanedArtifacts: number;
    orphanedVectorMemory: number;
    orphanedOriginalData: number;
    orphanedLineage: number;
}> => {
    const keepIds = activeSessionId ? new Set([activeSessionId]) : undefined;
    const [evictedReports, evictedMemoryRuns, evictedOriginalData] = await Promise.all([
        evictOldReports(keepIds),
        evictOldMemoryRuns(),
        evictOldOriginalData(keepIds),
    ]);
    // Run orphan cleanup after parent eviction to avoid racing two deletion
    // paths over the same report children.
    const orphanResult = await evictOrphanedArtifacts();
    return {
        evictedReports, evictedMemoryRuns, evictedOriginalData,
        orphanedArtifacts: orphanResult.orphanedArtifacts,
        orphanedVectorMemory: orphanResult.orphanedVectorMemory,
        orphanedOriginalData: orphanResult.orphanedOriginalData,
        orphanedLineage: orphanResult.orphanedLineage,
    };
};

/**
 * Lightweight IDB record count check — fast enough to run on every startup.
 * Returns true if any store exceeds its eviction threshold.
 */
const shouldRunIdbCleanup = async (): Promise<{ needed: boolean; reportCount: number; originalDataCount: number }> => {
    try {
        const db = await getDb();
        const reportCount = await db.count(REPORTS_STORE_NAME);
        const originalDataCount = await db.count(ORIGINAL_DATA_STORE_NAME);
        // Trigger cleanup when record counts exceed thresholds.
        const needed = reportCount > MAX_REPORTS_KEPT + 1 || originalDataCount > MAX_ORIGINAL_DATA_KEPT;
        return { needed, reportCount, originalDataCount };
    } catch {
        return { needed: false, reportCount: 0, originalDataCount: 0 };
    }
};

/**
 * Check storage health and auto-cleanup if IDB record counts exceed thresholds.
 * Uses actual IDB record counts instead of navigator.storage.estimate() which
 * includes uncontrollable storage (Vite dev cache, ONNX model cache, etc).
 */
export const checkStorageHealth = async (activeSessionId?: string): Promise<{
    estimate: StorageEstimate | null;
    evictedReports: number;
}> => {
    const { needed, reportCount, originalDataCount } = await shouldRunIdbCleanup();
    if (!needed) {
        return { estimate: null, evictedReports: 0 };
    }

    console.warn(
        `[StorageHealth] IDB cleanup needed: reports=${reportCount} (max ${MAX_REPORTS_KEPT}), `
        + `originalData=${originalDataCount} (max ${MAX_ORIGINAL_DATA_KEPT}). Running auto-cleanup...`,
    );

    // Phase 1: count-based eviction + orphan cleanup.
    const result = await runStorageCleanup(activeSessionId);

    // Phase 2: log cleanup summary.
    console.log(
        `[StorageHealth] Cleanup complete: `
        + `reports=${result.evictedReports}, `
        + `memoryRuns=${result.evictedMemoryRuns}, `
        + `originalData=${result.evictedOriginalData}, `
        + `orphanedArtifacts=${result.orphanedArtifacts}, `
        + `orphanedVectorMemory=${result.orphanedVectorMemory}, `
        + `orphanedOriginalData=${result.orphanedOriginalData}, `
        + `orphanedLineage=${result.orphanedLineage}.`,
    );

    return { estimate: null, evictedReports: result.evictedReports };
};

/**
 * Purge ALL non-current-session data from IndexedDB.
 * Deletes all reports (except current_session), all original_data (except active session),
 * all agent memory runs, all artifacts, and all vector memory.
 * Returns the storage freed in MB.
 */
export const purgeAllStorage = async (activeSessionId?: string): Promise<{ deletedReports: number; freedMB: number }> => {
    const beforeEstimate = await getStorageEstimate();
    const db = await getDb();

    // Protect only current_session report and active session's original_data.
    const protectedReportIds = new Set([CURRENT_SESSION_KEY]);
    const protectedSessionIds = new Set<string>();
    if (activeSessionId) protectedSessionIds.add(activeSessionId);
    try {
        const tabSessionId = sessionStorage.getItem('csv_agent_tab_session_id');
        if (tabSessionId) protectedSessionIds.add(tabSessionId);
    } catch { /* non-fatal */ }
    const currentAlias = await db.get(REPORTS_STORE_NAME, CURRENT_SESSION_KEY);
    if (currentAlias) {
        protectedSessionIds.add(getCanonicalReportId(currentAlias));
    }

    // 1. Delete all non-protected reports.
    let deletedReports = 0;
    const allReportKeys = await db.getAllKeys(REPORTS_STORE_NAME);
    for (const key of allReportKeys) {
        if (!protectedReportIds.has(key as string)) {
            await db.delete(REPORTS_STORE_NAME, key);
            deletedReports += 1;
        }
    }

    // 2. Clear all report_artifacts.
    const allArtifactKeys = await db.getAllKeys(REPORT_ARTIFACTS_STORE_NAME);
    for (const key of allArtifactKeys) {
        await db.delete(REPORT_ARTIFACTS_STORE_NAME, key);
    }

    // 3. Clear all original_data except active session.
    const allOriginalKeys = await db.getAllKeys(ORIGINAL_DATA_STORE_NAME);
    for (const key of allOriginalKeys) {
        if (!protectedSessionIds.has(key as string)) {
            await db.delete(ORIGINAL_DATA_STORE_NAME, key);
        }
    }

    // 4. Clear lineage except for the active/current session.
    const allLineageRecords = await db.getAll(DATASET_LINEAGE_STORE_NAME);
    for (const record of allLineageRecords) {
        if (!protectedSessionIds.has(record.reportId)) {
            await db.delete(DATASET_LINEAGE_STORE_NAME, record.recordId);
        }
    }

    // 5. Clear all agent memory runs.
    const allMemoryKeys = await db.getAllKeys(MEMORY_STORE_NAME);
    for (const key of allMemoryKeys) {
        await db.delete(MEMORY_STORE_NAME, key);
    }

    // 6. Clear all vector memory (except 'current').
    const allVectorKeys = await db.getAllKeys(VECTOR_MEMORY_STORE_NAME);
    for (const key of allVectorKeys) {
        if (key !== 'current') {
            await db.delete(VECTOR_MEMORY_STORE_NAME, key);
        }
    }

    // 7. Clear Cache Storage (ONNX model files from @huggingface/transformers).
    let cacheCleared = 0;
    try {
        if (typeof caches !== 'undefined') {
            const cacheKeys = await caches.keys();
            for (const key of cacheKeys) {
                await caches.delete(key);
                cacheCleared += 1;
            }
        }
    } catch { /* non-fatal */ }
    // Reset the cached estimate so next check recalculates.
    _cacheStorageBytesEstimate = null;

    // Invalidate localStorage cache.
    try { localStorage.removeItem(REPORTS_INDEX_CACHE_KEY); } catch { /* ignore */ }

    const afterEstimate = await getStorageEstimate();
    const freedMB = beforeEstimate && afterEstimate
        ? (beforeEstimate.usageBytes - afterEstimate.usageBytes) / 1024 / 1024
        : 0;
    console.log(
        `[StoragePurge] Deleted ${deletedReports} reports, ${cacheCleared} cache stores. `
        + `Storage: ${beforeEstimate ? (beforeEstimate.usageBytes / 1024 / 1024).toFixed(1) : '?'} MB → `
        + `${afterEstimate ? (afterEstimate.usageBytes / 1024 / 1024).toFixed(1) : '?'} MB `
        + `(freed ${freedMB.toFixed(1)} MB)`,
    );

    return { deletedReports, freedMB };
};

// Report History Management
export const saveReport = async (report: Report): Promise<void> => {
  if (!report.id) {
      throw new StorageOperationError('saveReport', 'Report ID is undefined or null');
  }
  let normalizedReport = report;
  try {
    const db = await getDb();
    const previousReport = await db.get(REPORTS_STORE_NAME, report.id);
    const bundle = buildReportLineageBundle(report, previousReport);
    normalizedReport = bundle.report;
    const tx = db.transaction(
        [REPORTS_STORE_NAME, DATASET_LINEAGE_STORE_NAME],
        'readwrite',
    );
    await tx.objectStore(REPORTS_STORE_NAME).put(toSerializable(normalizedReport));
    for (const record of bundle.records) {
        await tx.objectStore(DATASET_LINEAGE_STORE_NAME).put(toSerializable(record));
    }
    await tx.done;
    if (normalizedReport.lineage) {
        await migrateAgentMemoryDatasetId(
            db,
            bundle.legacyDatasetId,
            normalizedReport.lineage.datasetId,
        );
        const evictedVersions = await evictOldDatasetVersions(db, normalizedReport.lineage.datasetId);
        if (evictedVersions > 0) {
            console.log(`[StorageCleanup] Evicted ${evictedVersions} old dataset version snapshot(s).`);
        }
    }
  } catch (error) {
    if (isQuotaExceededError(error)) {
        console.warn('[saveReport] QuotaExceeded — running cleanup and retrying...');
        await runStorageCleanup(report.id);
        try {
            const db = await getDb();
            const previousReport = await db.get(REPORTS_STORE_NAME, report.id);
            const bundle = buildReportLineageBundle(report, previousReport);
            normalizedReport = bundle.report;
            const tx = db.transaction(
                [REPORTS_STORE_NAME, DATASET_LINEAGE_STORE_NAME],
                'readwrite',
            );
            await tx.objectStore(REPORTS_STORE_NAME).put(toSerializable(normalizedReport));
            for (const record of bundle.records) {
                await tx.objectStore(DATASET_LINEAGE_STORE_NAME).put(toSerializable(record));
            }
            await tx.done;
        } catch (retryError) {
            console.error('[saveReport] Retry after cleanup also failed:', retryError);
            throw new StorageOperationError('saveReport', retryError);
        }
    } else {
        console.error('Failed to save report to IndexedDB:', error);
        throw new StorageOperationError('saveReport', error);
    }
  }
  // Keep the localStorage reports index cache in sync.
  updateReportsIndexEntry(normalizedReport);
};

/** Update a single entry in the cached reports index without a full IDB scan. */
const updateReportsIndexEntry = (report: Report) => {
    const cached = readCachedReportsIndex();
    if (!cached) return; // No cache yet — will be built on next full load.
    const idx = cached.findIndex(r => r.id === report.id);
    const eff = report.appState?.reportContextResolution?.effective;
    const entry: ReportListItem = {
        id: report.id,
        filename: report.filename,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        reportTitle: eff?.reportTitle ?? null,
        reportDescription: eff?.reportDescription ?? null,
    };
    if (idx >= 0) {
        cached[idx] = entry;
    } else {
        cached.push(entry);
    }
    persistReportsIndex(cached);
};

export const getReport = async (id: string): Promise<Report | undefined> => {
  try {
    const start = performance.now();
    const db = await getDb();
    const dbMs = performance.now() - start;
    const readStart = performance.now();
    const report = await db.get(REPORTS_STORE_NAME, id);
    const readMs = performance.now() - readStart;
    const totalMs = performance.now() - start;
    if (totalMs > 100) {
      console.warn(
        `[StorageService] ⚠ Slow getReport: ${Math.round(totalMs)}ms` +
        ` | dbOpen=${Math.round(dbMs)}ms, read=${Math.round(readMs)}ms` +
        ` | hasData=${Boolean(report)}, chatHistory=${report?.appState?.chatHistory?.length ?? 0}`,
      );
    }
    if (!report) return undefined;
    const bundle = buildReportLineageBundle(report);
    if (bundle.report.lineage) {
        await migrateAgentMemoryDatasetId(
            db,
            bundle.legacyDatasetId,
            bundle.report.lineage.datasetId,
        );
    }
    return bundle.report;
  } catch (error)
    {
    console.error('Failed to get report from IndexedDB:', error);
    return undefined;
  }
};

const REPORTS_INDEX_CACHE_KEY = 'csv_agent_reports_index';

/** Persist lightweight report metadata to localStorage for instant reads. */
const persistReportsIndex = (items: ReportListItem[]) => {
    try {
        const serialized = items.map(r => ({
            id: r.id,
            filename: r.filename,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
            updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
            reportTitle: r.reportTitle ?? null,
            reportDescription: r.reportDescription ?? null,
        }));
        localStorage.setItem(REPORTS_INDEX_CACHE_KEY, JSON.stringify(serialized));
    } catch { /* quota exceeded or private mode — non-fatal */ }
};

/** Read cached report index from localStorage (<1ms). */
const readCachedReportsIndex = (): ReportListItem[] | null => {
    try {
        const raw = localStorage.getItem(REPORTS_INDEX_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Array<{
            id: string; filename: string; createdAt: string; updatedAt: string;
            reportTitle?: string | null; reportDescription?: string | null;
        }>;
        // One-time cache invalidation: force IDB rescan to populate new fields.
        if (parsed.length > 0 && !('reportTitle' in parsed[0])) return null;
        return parsed.map(r => ({
            id: r.id,
            filename: r.filename,
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
            reportTitle: r.reportTitle ?? null,
            reportDescription: r.reportDescription ?? null,
        }));
    } catch {
        return null;
    }
};

// In-flight dedup: if an IDB scan is already running, reuse its promise
// instead of launching a parallel scan (saves 820ms on double-call during init).
let _reportsListInflight: Promise<ReportListItem[]> | null = null;

export const getReportsList = async (): Promise<ReportListItem[]> => {
    // Fast path: return cached index from localStorage if available.
    const cached = readCachedReportsIndex();
    if (cached && cached.length > 0) {
        cached.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return cached;
    }
    // Dedup: reuse in-flight IDB scan if one is already running.
    if (_reportsListInflight) return _reportsListInflight;
    _reportsListInflight = _scanReportsFromIdb();
    try {
        return await _reportsListInflight;
    } finally {
        _reportsListInflight = null;
    }
};

const _scanReportsFromIdb = async (): Promise<ReportListItem[]> => {
    // Slow path: full IDB scan (only on first load or after cache invalidation).
    try {
        const start = performance.now();
        const db = await getDb();
        const tx = db.transaction(REPORTS_STORE_NAME, 'readonly');
        const store = tx.objectStore(REPORTS_STORE_NAME);
        const items: ReportListItem[] = [];
        let cursor = await store.openCursor();
        while (cursor) {
            const { id, filename, createdAt, updatedAt, appState } = cursor.value;
            const eff = appState?.reportContextResolution?.effective;
            items.push({
                id, filename, createdAt, updatedAt,
                reportTitle: eff?.reportTitle ?? null,
                reportDescription: eff?.reportDescription ?? null,
            });
            cursor = await cursor.continue();
        }
        items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        persistReportsIndex(items);
        const totalMs = performance.now() - start;
        if (totalMs > 100) {
            console.warn(
                `[StorageService] ⚠ Slow getReportsList (IDB scan): ${Math.round(totalMs)}ms` +
                ` | reports=${items.length}`,
            );
        }
        return items;
    } catch (error) {
        console.error('Failed to get reports list from IndexedDB:', error);
        return [];
    }
};

export const deleteReport = async (id: string): Promise<void> => {
    try {
        const db = await getDb();
        const report = await db.get(REPORTS_STORE_NAME, id);
        if (report) {
            await deleteReportWithCascade(db, report);
        } else {
            await db.delete(REPORTS_STORE_NAME, id);
            await db.delete(REPORT_ARTIFACTS_STORE_NAME, id);
        }
        // Remove from localStorage cache.
        const cached = readCachedReportsIndex();
        if (cached) {
            persistReportsIndex(cached.filter(r => r.id !== id));
        }
    } catch (error) {
        console.error('Failed to delete report from IndexedDB:', error);
        throw new StorageOperationError('deleteReport', error);
    }
};

export const saveAgentMemoryRun = async (run: AgentMemoryRun): Promise<void> => {
    try {
        const db = await getDb();
        await db.put(MEMORY_STORE_NAME, toSerializable(run));
    } catch (error) {
        console.error('Failed to save agent memory run:', error);
    }
};

export const getAgentMemoryRuns = async (
    scope?: ReportMemoryScope,
): Promise<AgentMemoryRun[]> => {
    try {
        const db = await getDb();
        if (scope) {
            const runs = await db.getAllFromIndex(
                MEMORY_STORE_NAME,
                'datasetId',
                IDBKeyRange.only(scope.datasetId),
            );
            const scopedRuns = runs.filter(run =>
                run.reportId === scope.reportId
                && run.datasetVersion === scope.datasetVersion);
            return scopedRuns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        const allRuns = await db.getAll(MEMORY_STORE_NAME);
        return allRuns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
        console.error('Failed to read agent memory runs:', error);
        return [];
    }
};

export const getLatestAgentMemoryRun = async (
    scope: ReportMemoryScope,
): Promise<AgentMemoryRun | null> => {
    try {
        const runs = await getAgentMemoryRuns(scope);
        if (runs.length === 0) return null;
        return runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    } catch (error) {
        console.error('Failed to load latest agent memory run:', error);
        return null;
    }
};

export const saveReportArtifactRecord = async (record: StoredReportArtifactRecord): Promise<void> => {
    try {
        const db = await getDb();
        await db.put(REPORT_ARTIFACTS_STORE_NAME, toSerializable(record));
    } catch (error) {
        console.error('Failed to save report artifact record:', error);
        throw new StorageOperationError('saveReportArtifactRecord', error);
    }
};

export const getReportArtifactRecord = async (reportId: string): Promise<StoredReportArtifactRecord | undefined> => {
    try {
        const db = await getDb();
        return await db.get(REPORT_ARTIFACTS_STORE_NAME, reportId);
    } catch (error) {
        console.error('Failed to read report artifact record:', error);
        return undefined;
    }
};

// Original Data Management (for cleaning rollback)

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

// Vector Memory Persistence

/** Persist vector memory documents to IndexedDB for cross-refresh survival. */
export const saveVectorMemory = async (documents: VectorStoreDocument[], key = 'current'): Promise<void> => {
    try {
        await runWithIndexedDbReconnect(db =>
            db.put(VECTOR_MEMORY_STORE_NAME, { key, documents, savedAt: Date.now() }),
        );
    } catch (error) {
        console.error('Failed to save vector memory to IndexedDB:', error);
        // Non-fatal: vectors can be rebuilt from state if IndexedDB fails.
    }
};

/** Load persisted vector memory documents. Returns [] if not found or on failure. */
export const loadVectorMemory = async (key = 'current'): Promise<VectorStoreDocument[]> => {
    try {
        const record = await runWithIndexedDbReconnect(db =>
            db.get(VECTOR_MEMORY_STORE_NAME, key),
        );
        return record?.documents ?? [];
    } catch (error) {
        console.error('Failed to load vector memory from IndexedDB:', error);
        return [];
    }
};

/** Remove persisted vector memory for a given key. */
export const clearVectorMemory = async (key = 'current'): Promise<void> => {
    try {
        await runWithIndexedDbReconnect(db =>
            db.delete(VECTOR_MEMORY_STORE_NAME, key),
        );
    } catch (error) {
        console.error('Failed to clear vector memory from IndexedDB:', error);
    }
};

// Settings Management
// Default provider is 'default' (the maintainer's shared demo gateway, no
// key needed) rather than 'google' — a brand-new visitor with no localStorage
// state yet should be able to try the app (including "Load Demo Data") with
// zero setup. isApiKeySet derives from isProviderConfigured(), which treats
// 'default' as always configured.
const staticDefaultSettings: Settings = {
    provider: 'default',
    geminiApiKey: '',
    openAIApiKey: '',
    simpleModel: DEFAULT_GATEWAY_MODEL,
    complexModel: DEFAULT_GATEWAY_MODEL,
    reasoningEffort: 'medium',
    language: 'English',
    reportTemplate: 'management_review',
    autoConfirmGoal: true,
    runtimeAccessControl: createDefaultRuntimeAccessControl(),
    ...normalizeRuntimePolicySettings({}),
};

/** Apply deployment-level model overrides from __CSV_AGENT_CONFIG__. */
const applyForceModelOverrides = (settings: Settings): Settings => {
    const forceSimple = getForceSimpleModel();
    const forceComplex = getForceComplexModel();
    const forceFallback = getForceFallbackModel();
    if (!forceSimple && !forceComplex && !forceFallback) return settings;
    return {
        ...settings,
        ...(forceSimple ? { simpleModel: forceSimple } : {}),
        ...(forceComplex ? { complexModel: forceComplex } : {}),
        ...(forceFallback ? { fallbackModel: forceFallback } : {}),
    };
};

export const getDefaultSettings = (): Settings => applyForceModelOverrides({
    ...staticDefaultSettings,
    ...getRuntimeDefaultSettings(),
});

const normalizeStoredSettings = (settings: Partial<Settings> & { model?: string; apiKey?: string }): Partial<Settings> => {
    const normalizedSettings = { ...settings };
    // Before the keyless Default provider existed, Google was the app default.
    // A persisted Google selection without a Gemini key therefore represents
    // legacy setup state, not a usable provider choice. Migrate only that
    // unconfigured state; users who supplied a Gemini key keep Google selected.
    if (
        normalizedSettings.provider === 'google'
        && !String(normalizedSettings.geminiApiKey ?? '').trim()
    ) {
        normalizedSettings.provider = 'default';
    }
    if (normalizedSettings.provider === 'default') {
        normalizedSettings.simpleModel = DEFAULT_GATEWAY_MODEL;
        normalizedSettings.complexModel = DEFAULT_GATEWAY_MODEL;
        normalizedSettings.fallbackModel = undefined;
    }
    if (normalizedSettings.model) {
        normalizedSettings.simpleModel = normalizedSettings.model;
        normalizedSettings.complexModel = normalizedSettings.model;
        delete normalizedSettings.model;
    }
    if (normalizedSettings.apiKey) {
        delete normalizedSettings.apiKey;
    }
    normalizedSettings.language = normalizeAppLanguage(normalizedSettings.language);
    normalizedSettings.runtimeAccessControl = normalizeRuntimeAccessControlSettings(normalizedSettings.runtimeAccessControl);
    Object.assign(normalizedSettings, normalizeRuntimePolicySettings(normalizedSettings));
    return normalizedSettings;
};

const readLegacyLocalStorageSettings = (): Settings | null => {
    try {
        const settingsJson = localStorage.getItem(SETTINGS_KEY);
        if (!settingsJson) {
            return null;
        }

        const savedSettings = JSON.parse(settingsJson);
        const normalizedSettings = normalizeStoredSettings(savedSettings);
        localStorage.removeItem(SETTINGS_KEY);
        return { ...getDefaultSettings(), ...normalizedSettings };
    } catch (error) {
        console.error('Failed to migrate settings from localStorage:', error);
        return null;
    }
};

export const saveSettings = async (settings: Settings): Promise<void> => {
    try {
        const db = await getDb();
        const normalizedSettings: Settings = {
            ...getDefaultSettings(),
            ...normalizeStoredSettings(settings),
        };
        await db.put(SETTINGS_STORE_NAME, {
            key: SETTINGS_RECORD_KEY,
            settings: normalizedSettings,
        });
    } catch (error) {
        console.error('Failed to save settings to IndexedDB:', error);
        throw new StorageOperationError('saveSettings', error);
    }
};

export const getSettings = async (): Promise<Settings> => {
    const runtimeAwareDefaults = getDefaultSettings();
    try {
        const db = await getDb();
        const savedSettingsRecord = await db.get(SETTINGS_STORE_NAME, SETTINGS_RECORD_KEY);
        if (savedSettingsRecord?.settings) {
            const normalizedSettings = normalizeStoredSettings(savedSettingsRecord.settings);
            return applyForceModelOverrides({ ...runtimeAwareDefaults, ...normalizedSettings });
        }

        const legacySettings = readLegacyLocalStorageSettings();
        if (legacySettings) {
            await saveSettings(legacySettings);
            return applyForceModelOverrides(legacySettings);
        }
    } catch (error) {
        console.error('Failed to get settings from IndexedDB:', error);
    }
    return runtimeAwareDefaults;
};
