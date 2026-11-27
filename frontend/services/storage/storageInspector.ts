import { DATASET_COMMITS_STORE } from '../../types/datasetCommit';
import { DATASET_RETENTION_STORE } from '../data/datasetRecoveryContract';
import { CLOUD_AI_CONSENTS_STORE_NAME, DATASET_LINEAGE_STORE_NAME, LOCAL_DIAGNOSTICS_STORE_NAME, MEMORY_STORE_NAME, ORIGINAL_DATA_STORE_NAME, REPORTS_STORE_NAME, REPORT_ARTIFACTS_STORE_NAME, SETTINGS_STORE_NAME, StorageOperationError, VECTOR_MEMORY_STORE_NAME, getDb } from './connection';
import { deleteReportWithCascade } from './reportCascade';
import { REPORTS_INDEX_CACHE_KEY } from './reportIndexCache';

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
export const estimateRecordBytes = (value: unknown): number => {
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
    type StoreName = 'reports' | 'report_artifacts' | 'original_data' | 'agent_memory_runs' | 'vector_memory' | 'dataset_lineage' | 'settings' | 'ai_consents' | 'local_diagnostics' | 'dataset_commits';
    const storeConfigs: { name: StoreName; label: string }[] = [
        { name: REPORTS_STORE_NAME, label: 'Reports (sessions)' },
        { name: REPORT_ARTIFACTS_STORE_NAME, label: 'Report Artifacts (HTML)' },
        { name: ORIGINAL_DATA_STORE_NAME, label: 'Original CSV Data' },
        { name: MEMORY_STORE_NAME, label: 'Agent Memory Runs' },
        { name: VECTOR_MEMORY_STORE_NAME, label: 'Vector Memory' },
        { name: DATASET_LINEAGE_STORE_NAME, label: 'Dataset Versions & Lineage' },
        { name: DATASET_COMMITS_STORE, label: 'Dataset Commit Journal' },
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
    if (storeName === DATASET_COMMITS_STORE || storeName === DATASET_RETENTION_STORE) throw new StorageOperationError('clearStore', 'Commit records require Clear all local data; partial journal deletion is unavailable.');
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
