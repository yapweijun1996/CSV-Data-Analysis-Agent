import type { Report, ReportListItem } from '../../types';
import { toSerializable } from '../../utils/serializable';
import { buildReportLineageBundle } from '../persistence/datasetLineage';
import { DATASET_COMMITS_STORE } from '../../types/datasetCommit';
import { reconcileReportCommit } from '../persistence/datasetCommitProjection';
import { DATASET_LINEAGE_STORE_NAME, REPORTS_STORE_NAME, REPORT_ARTIFACTS_STORE_NAME, StorageDatabase, StorageOperationError, getDb } from './connection';
import { deleteReportWithCascade, evictOldDatasetVersions, migrateAgentMemoryDatasetId } from './reportCascade';
import { persistReportsIndex, readCachedReportsIndex, updateReportsIndexEntry } from './reportIndexCache';
import { isQuotaExceededError, runStorageCleanup } from './storageMaintenance';

// Report History Management
export const writeReportProjection = async (report: Report, database?: StorageDatabase): Promise<Report> => {
    const db = database ?? await getDb();
    const tx = db.transaction([REPORTS_STORE_NAME, DATASET_LINEAGE_STORE_NAME, DATASET_COMMITS_STORE], 'readwrite');
    void tx.done.catch(() => undefined);
    try {
        const reports = tx.objectStore(REPORTS_STORE_NAME);
        const previous = await reports.get(report.id);
        const incomingCheckpoint=report.appState.candidateRecovery, priorCheckpoint=previous?.appState.candidateRecovery;
        // Delayed snapshots cannot reset an interrupted logical task's durable counters.
        if(incomingCheckpoint&&priorCheckpoint&&incomingCheckpoint.checkpointId===priorCheckpoint.checkpointId
            &&(Object.entries(priorCheckpoint.task.budget.used).some(([key,value])=>value>incomingCheckpoint.task.budget.used[key as keyof typeof incomingCheckpoint.task.budget.used])
                ||priorCheckpoint.repetitions>incomingCheckpoint.repetitions)) {
            report={...report,appState:{...report.appState,candidateRecovery:priorCheckpoint}};
        }
        const current = await reconcileReportCommit(tx.objectStore(DATASET_COMMITS_STORE), report);
        const bundle = buildReportLineageBundle(current, previous);
        await reports.put(toSerializable(bundle.report));
        for (const record of bundle.records) await tx.objectStore(DATASET_LINEAGE_STORE_NAME).put(toSerializable(record));
        await tx.done;
        if (bundle.report.lineage) {
            await migrateAgentMemoryDatasetId(db, bundle.legacyDatasetId, bundle.report.lineage.datasetId);
            await evictOldDatasetVersions(db, bundle.report.lineage.datasetId);
        }
        return bundle.report;
    } catch (error) {
        try { tx.abort(); } catch { /* A completed transaction cannot be aborted. */ }
        await tx.done.catch(() => undefined);
        throw error;
    }
};

export const saveReport = async (report: Report): Promise<void> => {
  if (!report.id) {
      throw new StorageOperationError('saveReport', 'Report ID is undefined or null');
  }
  let normalizedReport = report;
  try {
    normalizedReport = await writeReportProjection(report);
  } catch (error) {
    if (isQuotaExceededError(error)) {
        console.warn('[saveReport] QuotaExceeded — running cleanup and retrying...');
        await runStorageCleanup(report.id);
        try {
            normalizedReport = await writeReportProjection(report);
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


export const getReport = async (id: string): Promise<Report | undefined> => {
  try {
    const start = performance.now();
    const db = await getDb();
    const dbMs = performance.now() - start;
    const readStart = performance.now();
    const tx = db.transaction([REPORTS_STORE_NAME, DATASET_COMMITS_STORE], 'readonly');
    const stored = await tx.objectStore(REPORTS_STORE_NAME).get(id);
    const report = stored ? await reconcileReportCommit(tx.objectStore(DATASET_COMMITS_STORE), stored) : undefined;
    await tx.done;
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

export const _scanReportsFromIdb = async (): Promise<ReportListItem[]> => {
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
