import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, any>();
const fakeDb = {
    put: vi.fn(async (_store: string, value: any) => { rows.set(value.fingerprint, value); }),
    get: vi.fn(async (_store: string, key: string) => rows.get(key)),
    getAllKeys: vi.fn(async () => [...rows.keys()]),
    delete: vi.fn(async (_store: string, key: string) => { rows.delete(key); }),
};

vi.mock('../services/storage/connection', () => ({
    SOURCE_FILES_STORE_NAME: 'source_files',
    getDb: async () => fakeDb,
}));

const { saveSourceFile, getSourceFile, pruneSourceFiles, SOURCE_FILE_MAX_BYTES } = await import('../services/storage/sourceFiles');

describe('stored source files for History restore', () => {
    beforeEach(() => { rows.clear(); vi.clearAllMocks(); });

    it('round-trips the original file by fingerprint', async () => {
        const file = new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' });
        expect(await saveSourceFile('fp-1', file)).toBe(true);
        const restored = await getSourceFile('fp-1', { fileName: 'data.csv', byteSize: file.size });
        expect(restored?.name).toBe('data.csv');
        expect(restored?.size).toBe(file.size);
    });

    it('returns null when missing or when the size disagrees with the saved bundle', async () => {
        const file = new File(['a,b\n'], 'data.csv');
        await saveSourceFile('fp-1', file);
        expect(await getSourceFile('nope')).toBeNull();
        expect(await getSourceFile('fp-1', { byteSize: file.size + 1 })).toBeNull();
    });

    it('skips files above the size cap and never throws on storage errors', async () => {
        const huge = { size: SOURCE_FILE_MAX_BYTES + 1 } as File;
        expect(await saveSourceFile('fp-big', huge)).toBe(false);
        fakeDb.put.mockRejectedValueOnce(new Error('quota'));
        expect(await saveSourceFile('fp-2', new File(['x'], 'x.csv'))).toBe(false);
    });

    it('prunes files that no report references', async () => {
        await saveSourceFile('keep', new File(['x'], 'a.csv'));
        await saveSourceFile('drop', new File(['y'], 'b.csv'));
        expect(await pruneSourceFiles(new Set(['keep']))).toBe(1);
        expect([...rows.keys()]).toEqual(['keep']);
    });
});
