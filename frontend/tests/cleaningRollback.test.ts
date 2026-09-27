// @vitest-environment jsdom

/**
 * Cleaning rollback tests.
 *
 * Verifies:
 * 1. saveOriginalData → getOriginalData round-trip restores exact row count.
 * 2. getOriginalData returns null for unknown sessions.
 * 3. deleteOriginalData removes the stored record.
 * 4. Saved CsvData preserves column values exactly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CsvData } from '../types';

// ---------------------------------------------------------------------------
// Mock IndexedDB via fake in-memory store so tests run in jsdom without IDB.
// ---------------------------------------------------------------------------

const fakeStore = new Map<string, unknown>();

const fakeDb = {
    put: vi.fn(async (_storeName: string, record: { sessionId: string }) => {
        fakeStore.set(record.sessionId, record);
    }),
    add: vi.fn(async (_storeName: string, record: { sessionId: string }) => {
        if (fakeStore.has(record.sessionId)) {
            throw new DOMException('Key already exists', 'ConstraintError');
        }
        fakeStore.set(record.sessionId, record);
    }),
    get: vi.fn(async (_storeName: string, key: string) => fakeStore.get(key)),
    delete: vi.fn(async (_storeName: string, key: string) => { fakeStore.delete(key); }),
};

vi.mock('idb', () => ({
    openDB: vi.fn(async () => fakeDb),
}));

// Import after mocking so the module picks up the mocked `openDB`.
const { saveOriginalData, getOriginalData, deleteOriginalData } = await import('../services/storageService');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeOriginalCsvData = (): CsvData => ({
    fileName: 'test.csv',
    data: [
        { Name: 'Alice', Revenue: '1000' },
        { Name: 'Bob', Revenue: '2000' },
        { Name: 'Charlie', Revenue: '3000' },
    ],
    headerDepth: 1,
    summaryRows: [],
    metadataRows: [],
    headerLayers: [['Name', 'Revenue']],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    fakeStore.clear();
    vi.clearAllMocks();
});

describe('saveOriginalData / getOriginalData round-trip', () => {
    it('restores exact row count after save and load', async () => {
        const original = makeOriginalCsvData();
        await saveOriginalData('session-abc', original);

        const restored = await getOriginalData('session-abc');
        expect(restored).not.toBeNull();
        expect(restored!.data).toHaveLength(3);
    });

    it('restores exact column values after save and load', async () => {
        const original = makeOriginalCsvData();
        await saveOriginalData('session-abc', original);

        const restored = await getOriginalData('session-abc');
        expect(restored!.data[0]).toMatchObject({ Name: 'Alice', Revenue: '1000' });
        expect(restored!.data[1]).toMatchObject({ Name: 'Bob', Revenue: '2000' });
        expect(restored!.data[2]).toMatchObject({ Name: 'Charlie', Revenue: '3000' });
    });

    it('restores headerLayers', async () => {
        const original = makeOriginalCsvData();
        await saveOriginalData('session-abc', original);

        const restored = await getOriginalData('session-abc');
        expect(restored!.headerLayers).toEqual([['Name', 'Revenue']]);
    });

    it('keeps the first persisted source immutable for the session', async () => {
        const original = makeOriginalCsvData();
        const replacement: CsvData = {
            ...original,
            data: [{ Name: 'Mutated', Revenue: '9999' }],
        };

        await saveOriginalData('session-immutable', original);
        await saveOriginalData('session-immutable', replacement);

        const restored = await getOriginalData('session-immutable');
        expect(restored?.data).toEqual(original.data);
        expect(fakeDb.add).toHaveBeenCalledTimes(2);
    });
});

describe('getOriginalData for unknown session', () => {
    it('returns null when no data has been saved for the session', async () => {
        const result = await getOriginalData('nonexistent-session');
        expect(result).toBeNull();
    });
});

describe('deleteOriginalData', () => {
    it('removes the stored record so subsequent getOriginalData returns null', async () => {
        const original = makeOriginalCsvData();
        await saveOriginalData('session-xyz', original);

        // Verify it exists first
        const before = await getOriginalData('session-xyz');
        expect(before).not.toBeNull();

        // Delete and verify
        await deleteOriginalData('session-xyz');
        const after = await getOriginalData('session-xyz');
        expect(after).toBeNull();
    });
});

describe('saveOriginalData error handling', () => {
    it('does not throw when the IDB put operation fails', async () => {
        fakeDb.add.mockRejectedValueOnce(new Error('IDB write failure'));
        // Should resolve without throwing (non-fatal)
        await expect(saveOriginalData('session-fail', makeOriginalCsvData())).resolves.toBeUndefined();
    });
});
