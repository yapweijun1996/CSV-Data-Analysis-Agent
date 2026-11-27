// Public storage API. Implementation lives in ./storage/*; keep this export list stable.

export { saveAgentMemoryRun, getAgentMemoryRuns, getLatestAgentMemoryRun, saveReportArtifactRecord, getReportArtifactRecord } from './storage/agentMemory';
export { STORAGE_DB_VERSION, CLOUD_AI_CONSENTS_STORE_NAME, DATASET_LINEAGE_STORE_NAME, LOCAL_DIAGNOSTICS_STORE_NAME, CURRENT_SESSION_KEY, StorageOperationError, getStorageDatabase, openStorageDatabase } from './storage/connection';
export type { StorageDatabase } from './storage/connection';
export { getCloudAiConsent, saveCloudAiConsent, pruneExpiredLocalDiagnostics, saveLocalDiagnostic, getRecentLocalDiagnostics } from './storage/consentDiagnostics';
export { clearAllLocalBrowserData, __resetStorageClearStateForTests } from './storage/localDataClear';
export type { IncompleteLocalDataStore, ClearAllLocalBrowserDataResult } from './storage/localDataClear';
export { saveOriginalData, getOriginalData, deleteOriginalData, getDatasetLineage, getDatasetVersionSnapshot } from './storage/originalData';
export { writeReportProjection, saveReport, getReport, getReportsList, deleteReport } from './storage/reports';
export { getDefaultSettings, saveSettings, getSettings } from './storage/settings';
export { clearAllCacheStorage, getStorageEstimate } from './storage/storageEstimate';
export type { StorageEstimate } from './storage/storageEstimate';
export { getStorageBreakdown, clearStore } from './storage/storageInspector';
export type { StorageStoreInfo, StorageBreakdownResult } from './storage/storageInspector';
export { evictOldReports, evictOldMemoryRuns, evictOldOriginalData, evictOrphanedArtifacts, runStorageCleanup, checkStorageHealth, purgeAllStorage } from './storage/storageMaintenance';
export { saveVectorMemory, loadVectorMemory, clearVectorMemory } from './storage/vectorMemory';
