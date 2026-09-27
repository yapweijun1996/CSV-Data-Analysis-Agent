// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    deleteDBMock,
    openDBMock,
    closeMock,
    clearAllOpfsDatasetDataMock,
} = vi.hoisted(() => {
    const closeMock = vi.fn();
    return {
        deleteDBMock: vi.fn(async () => undefined),
        openDBMock: vi.fn(async () => ({ close: closeMock })),
        closeMock,
        clearAllOpfsDatasetDataMock: vi.fn(async () => true),
    };
});

vi.mock('idb', () => ({
    openDB: openDBMock,
    deleteDB: deleteDBMock,
}));

vi.mock('../services/data/opfsDatasetStorage', () => ({
    clearAllOpfsDatasetData: clearAllOpfsDatasetDataMock,
}));

const {
    __resetStorageClearStateForTests,
    clearAllLocalBrowserData,
    getDefaultSettings,
    saveSettings,
} = await import('../services/storageService');

describe('clearAllLocalBrowserData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetStorageClearStateForTests();
        localStorage.setItem('saved-api-key', 'secret');
        sessionStorage.setItem('active-session', 'session-data');
        vi.stubGlobal('caches', {
            keys: vi.fn(async () => ['model-cache', 'asset-cache']),
            delete: vi.fn(async () => true),
        });
    });

    afterEach(() => {
        __resetStorageClearStateForTests();
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('deletes IndexedDB, web storage, OPFS, and every Cache Storage entry', async () => {
        const result = await clearAllLocalBrowserData();

        expect(deleteDBMock).toHaveBeenCalledWith('csv-ai-assistant-db');
        expect(localStorage.length).toBe(0);
        expect(sessionStorage.length).toBe(0);
        expect(caches.delete).toHaveBeenCalledTimes(2);
        expect(clearAllOpfsDatasetDataMock).toHaveBeenCalledOnce();
        expect(result).toEqual({
            indexedDbDeleted: true,
            localStorageCleared: true,
            sessionStorageCleared: true,
            cacheCount: 2,
            opfsCleared: true,
        });
    });

    it('locks persistence after clearing so late async work cannot recreate records', async () => {
        await clearAllLocalBrowserData();

        await expect(saveSettings(getDefaultSettings())).rejects.toThrow(
            'Local data was cleared; reload before creating new records.',
        );
        expect(openDBMock).not.toHaveBeenCalled();
        expect(closeMock).not.toHaveBeenCalled();
    });

    it('allows a retry when OPFS clearing fails partway through', async () => {
        clearAllOpfsDatasetDataMock
            .mockRejectedValueOnce(new Error('OPFS unavailable'))
            .mockResolvedValueOnce(true);

        await expect(clearAllLocalBrowserData()).rejects.toThrow('OPFS unavailable');
        await expect(clearAllLocalBrowserData()).resolves.toEqual(expect.objectContaining({
            opfsCleared: true,
        }));
    });
});
