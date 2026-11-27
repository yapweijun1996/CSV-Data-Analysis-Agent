import type { AgentMemoryRun } from '../../types';
import { pruneSourceFiles } from './sourceFiles';
import { CURRENT_SESSION_KEY, DATASET_LINEAGE_STORE_NAME, MEMORY_STORE_NAME, ORIGINAL_DATA_STORE_NAME, REPORTS_STORE_NAME, REPORT_ARTIFACTS_STORE_NAME, VECTOR_MEMORY_STORE_NAME, getDb } from './connection';
import { deleteReportWithCascade, getCanonicalReportId } from './reportCascade';
import { REPORTS_INDEX_CACHE_KEY } from './reportIndexCache';
import { getReportsList } from './reports';
import { type StorageEstimate, getStorageEstimate, resetCacheStorageBytesEstimate } from './storageEstimate';

export const isQuotaExceededError = (error: unknown): boolean => {
    if (error instanceof DOMException) {
        return error.name === 'QuotaExceededError'
            || error.code === 22                  // legacy Safari
            || error.code === 1014;               // Firefox
    }
    return false;
};

/** Max reports to keep (excluding CURRENT_SESSION_KEY). Oldest are evicted first. */
export const MAX_REPORTS_KEPT = 20;
/** Max agent memory runs per dataset. Oldest are evicted first. */
export const MAX_MEMORY_RUNS_PER_DATASET = 5;
/** Max original data records. Oldest are evicted first. */
export const MAX_ORIGINAL_DATA_KEPT = 10;
/** Auto-cleanup trigger threshold (percent of quota). */
export const CLEANUP_THRESHOLD_PERCENT = 75;
/** Hard storage cap in bytes. When usage exceeds this, auto-cleanup runs regardless of quota %. */
export const HARD_STORAGE_CAP_BYTES = 50 * 1024 * 1024; // 50 MB

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
        const liveSourceFingerprints = new Set<string>();
        for (const reportKey of reportKeys) {
            // The report key itself could be a sessionId reference.
            liveSessionIds.add(reportKey as string);
            // Also extract sessionId from appState if stored inside the report.
            try {
                const report = await db.get(REPORTS_STORE_NAME, reportKey);
                if (report) {
                    liveCanonicalReportIds.add(getCanonicalReportId(report));
                }
                const sourceFingerprint = report?.appState?.datasetBundle?.source?.fingerprint;
                if (sourceFingerprint) liveSourceFingerprints.add(sourceFingerprint);
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

        await pruneSourceFiles(liveSourceFingerprints);

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
export const evictBySize = async (activeSessionId?: string, targetBytes: number = HARD_STORAGE_CAP_BYTES * 0.8): Promise<number> => {
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
export const shouldRunIdbCleanup = async (): Promise<{ needed: boolean; reportCount: number; originalDataCount: number }> => {
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

    // 3b. Keep stored source files only for the reports that remain.
    const remainingFingerprints = new Set<string>();
    for (const key of await db.getAllKeys(REPORTS_STORE_NAME)) {
        const remaining = await db.get(REPORTS_STORE_NAME, key);
        const fingerprint = remaining?.appState?.datasetBundle?.source?.fingerprint;
        if (fingerprint) remainingFingerprints.add(fingerprint);
    }
    await pruneSourceFiles(remainingFingerprints);

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
    resetCacheStorageBytesEstimate();

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
