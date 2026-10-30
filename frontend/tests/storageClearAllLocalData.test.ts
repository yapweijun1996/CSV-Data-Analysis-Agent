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
        vi.restoreAllMocks();
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
            incompleteStores: [],
        });
    });

    it.each(['localStorage', 'sessionStorage'] as const)(
        'reports %s failure while attempting the remaining stores',
        async failedStore => {
            const clear = Storage.prototype.clear;
            vi.spyOn(Storage.prototype, 'clear').mockImplementation(function (this: Storage) {
                if (this === window[failedStore]) throw new Error('storage unavailable');
                clear.call(this);
            });

            const result = await clearAllLocalBrowserData();

            expect(result.incompleteStores).toEqual([failedStore]);
            expect(result.localStorageCleared).toBe(failedStore !== 'localStorage');
            expect(result.sessionStorageCleared).toBe(failedStore !== 'sessionStorage');
            expect(caches.delete).toHaveBeenCalledTimes(2);
            expect(clearAllOpfsDatasetDataMock).toHaveBeenCalledOnce();
        },
    );

    it('reports a cache enumeration failure while clearing other stores', async () => {
        vi.mocked(caches.keys).mockRejectedValueOnce(new Error('cache unavailable'));

        const result = await clearAllLocalBrowserData();

        expect(result.incompleteStores).toEqual(['cacheStorage']);
        expect(result.cacheCount).toBe(0);
        expect(result.localStorageCleared).toBe(true);
        expect(result.sessionStorageCleared).toBe(true);
        expect(clearAllOpfsDatasetDataMock).toHaveBeenCalledOnce();
    });

    it.each(['reject', 'false'] as const)(
        'reports a cache deletion returning %s and continues with other caches',
        async failure => {
            if (failure === 'reject') vi.mocked(caches.delete).mockRejectedValueOnce(new Error('cache unavailable'));
            else vi.mocked(caches.delete).mockResolvedValueOnce(false);

            const result = await clearAllLocalBrowserData();

            expect(result.incompleteStores).toEqual(['cacheStorage']);
            expect(result.cacheCount).toBe(1);
            expect(caches.delete).toHaveBeenCalledTimes(2);
            expect(clearAllOpfsDatasetDataMock).toHaveBeenCalledOnce();
        },
    );

    it('allows retry after incomplete clearing', async () => {
        vi.mocked(caches.keys).mockRejectedValueOnce(new Error('cache unavailable'));

        expect((await clearAllLocalBrowserData()).incompleteStores).toEqual(['cacheStorage']);
        expect((await clearAllLocalBrowserData()).incompleteStores).toEqual([]);
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
