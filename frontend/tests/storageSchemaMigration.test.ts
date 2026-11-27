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

describe('IndexedDB v14 source file store migration', () => {
    it('opens the existing database at version 14', async () => {
        await getStorageBreakdown();

        expect(STORAGE_DB_VERSION).toBe(14);
        expect(openDBMock).toHaveBeenCalledWith(
            'csv-ai-assistant-db',
            14,
            expect.objectContaining({ upgrade: expect.any(Function) }),
        );
    });

    it('adds commit uniqueness and diagnostic stores while preserving existing records', async () => {
        await getStorageBreakdown();
        const createIndex = vi.fn();
        const createdStore = {
            indexNames: { contains: vi.fn(() => false) },
            createIndex,
        };
        const upgradeDb = {
            objectStoreNames: {
                contains: vi.fn((name: string) => ![
                    'dataset_commits',
                    'dataset_retention',
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
            13,
            { objectStore: vi.fn(() => existingStore) },
        );

        expect(upgradeDb.createObjectStore).toHaveBeenCalledTimes(4);
        expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('dataset_retention', { keyPath: 'recordId' });
        expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('dataset_commits', { keyPath: 'recordId' });
        expect(createIndex).toHaveBeenCalledWith('intentKey', 'intentKey', { unique: true });
        expect(createIndex).toHaveBeenCalledWith('approvalKey', 'approvalKey', { unique: true });
        expect(upgradeDb.createObjectStore).toHaveBeenCalledWith(
            CLOUD_AI_CONSENTS_STORE_NAME,
            { keyPath: 'key' },
        );
        expect(upgradeDb.createObjectStore).toHaveBeenCalledWith(
            LOCAL_DIAGNOSTICS_STORE_NAME,
            { keyPath: 'id' },
        );
        expect(createIndex.mock.calls.map(call => call[0])).toEqual([
            'sessionId',
            'commitId',
            'sessionId',
            'intentKey',
            'approvalKey',
            'commitId',
            'datasetId',
            'provider',
            'recordedAt',
            'expiresAt',
        ]);
    });
});
