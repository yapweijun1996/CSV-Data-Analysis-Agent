import { deleteDB } from 'idb';
import { DB_NAME, StorageOperationError, detachDatabaseConnection, isLocalDataClearInProgress, lockLocalDataClear, resetConnectionStateForTests, unlockLocalDataClear } from './connection';
import { clearCacheStorage } from './storageEstimate';

export type IncompleteLocalDataStore = 'localStorage' | 'sessionStorage' | 'cacheStorage';

export interface ClearAllLocalBrowserDataResult {
    indexedDbDeleted: true;
    localStorageCleared: boolean;
    sessionStorageCleared: boolean;
    cacheCount: number;
    opfsCleared: boolean;
    incompleteStores: IncompleteLocalDataStore[];
}

/**
 * Delete every browser-persisted app record, including settings and BYOK keys.
 * Database access stays locked after success so late async work cannot recreate
 * records before the caller reloads the application.
 */
export const clearAllLocalBrowserData = async (): Promise<ClearAllLocalBrowserDataResult> => {
    if (isLocalDataClearInProgress()) {
        throw new StorageOperationError('clearAllLocalBrowserData', 'A local-data clear is already in progress.');
    }
    lockLocalDataClear();

    const stalePromise = detachDatabaseConnection();
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
        unlockLocalDataClear();
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
    let cacheStorageCleared: boolean;
    let opfsCleared: boolean;
    try {
        const [{ clearAllOpfsDatasetData }, clearedCaches] = await Promise.all([
            import('../data/opfsDatasetStorage'),
            clearCacheStorage(),
        ]);
        cacheCount = clearedCaches.count;
        cacheStorageCleared = clearedCaches.complete;
        opfsCleared = await clearAllOpfsDatasetData();
        const { clearAllRetainedDatasetRows } = await import('../persistence/datasetRetention');
        opfsCleared = await clearAllRetainedDatasetRows() || opfsCleared;
        const { clearAllAcceptedSpillData } = await import('../data/acceptedSpill');
        opfsCleared = await clearAllAcceptedSpillData() || opfsCleared;
    } catch (error) {
        unlockLocalDataClear();
        throw new StorageOperationError('clearAllLocalBrowserData', error);
    }

    const incompleteStores: IncompleteLocalDataStore[] = [];
    if (!localStorageCleared) incompleteStores.push('localStorage');
    if (!sessionStorageCleared) incompleteStores.push('sessionStorage');
    if (!cacheStorageCleared) incompleteStores.push('cacheStorage');
    if (incompleteStores.length) unlockLocalDataClear();

    return {
        indexedDbDeleted: true,
        localStorageCleared,
        sessionStorageCleared,
        cacheCount,
        opfsCleared,
        incompleteStores,
    };
};

export const __resetStorageClearStateForTests = (): void => {
    resetConnectionStateForTests();
};

// ---------------------------------------------------------------------------
// Storage Health — quota check + auto-cleanup
// ---------------------------------------------------------------------------
