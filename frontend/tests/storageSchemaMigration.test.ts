// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

let capturedUpgrade: ((...args: any[]) => void) | undefined;

const emptyCursorStore = {
    openCursor: vi.fn(async () => null),
};
const fakeDb = {
    transaction: vi.fn(() => ({
        objectStore: () => emptyCursorStore,
    })),
};
const openDBMock = vi.fn(async (_name: string, _version: number, options: {
    upgrade: (...args: any[]) => void;
}) => {
    capturedUpgrade = options.upgrade;
    return fakeDb;
});

vi.mock('idb', () => ({
    openDB: openDBMock,
    deleteDB: vi.fn(),
}));

const {
    CLOUD_AI_CONSENTS_STORE_NAME,
    LOCAL_DIAGNOSTICS_STORE_NAME,
    STORAGE_DB_VERSION,
    getStorageBreakdown,
} = await import('../services/storageService');

describe('IndexedDB v11 local diagnostics migration', () => {
    it('opens the existing database at version 11', async () => {
        await getStorageBreakdown();

        expect(STORAGE_DB_VERSION).toBe(11);
        expect(openDBMock).toHaveBeenCalledWith(
            'csv-ai-assistant-db',
            11,
            expect.objectContaining({ upgrade: expect.any(Function) }),
        );
    });

    it('adds consent and local diagnostic stores while preserving existing stores', async () => {
        await getStorageBreakdown();
        const createIndex = vi.fn();
        const createdStore = {
            indexNames: { contains: vi.fn(() => false) },
            createIndex,
        };
        const upgradeDb = {
            objectStoreNames: {
                contains: vi.fn((name: string) => ![
                    CLOUD_AI_CONSENTS_STORE_NAME,
                    LOCAL_DIAGNOSTICS_STORE_NAME,
                ].includes(name)),
            },
            createObjectStore: vi.fn(() => createdStore),
        };
        const existingStore = {
            indexNames: { contains: vi.fn(() => true) },
            createIndex: vi.fn(),
        };

        capturedUpgrade?.(
            upgradeDb,
            9,
            11,
            { objectStore: vi.fn(() => existingStore) },
        );

        expect(upgradeDb.createObjectStore).toHaveBeenCalledTimes(2);
        expect(upgradeDb.createObjectStore).toHaveBeenCalledWith(
            CLOUD_AI_CONSENTS_STORE_NAME,
            { keyPath: 'key' },
        );
        expect(upgradeDb.createObjectStore).toHaveBeenCalledWith(
            LOCAL_DIAGNOSTICS_STORE_NAME,
            { keyPath: 'id' },
        );
        expect(createIndex.mock.calls.map(call => call[0])).toEqual([
            'datasetId',
            'provider',
            'recordedAt',
            'expiresAt',
        ]);
    });
});
