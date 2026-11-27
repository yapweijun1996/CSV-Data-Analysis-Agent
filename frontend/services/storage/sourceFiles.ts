import { SOURCE_FILES_STORE_NAME, getDb } from './connection';

/** Largest source file kept for History restore. Bigger files fall back to re-selecting the CSV. */
export const SOURCE_FILE_MAX_BYTES = 200 * 1024 * 1024;

/** Keep the original CSV file in IndexedDB so History can restore the full dataset later. Never throws. */
export const saveSourceFile = async (fingerprint: string, file: File): Promise<boolean> => {
    if (!fingerprint || file.size > SOURCE_FILE_MAX_BYTES) return false;
    try {
        const db = await getDb();
        await db.put(SOURCE_FILES_STORE_NAME, {
            fingerprint,
            fileName: file.name,
            byteSize: file.size,
            mimeType: file.type || 'text/csv',
            lastModified: file.lastModified,
            blob: file,
            savedAt: Date.now(),
        });
        return true;
    } catch (error) {
        console.warn('Could not keep the source file for History restore:', error);
        return false;
    }
};

/** Return the stored original file for a source fingerprint, or null when missing or inconsistent. */
export const getSourceFile = async (fingerprint: string, expected?: { fileName?: string; byteSize?: number }): Promise<File | null> => {
    try {
        const db = await getDb();
        const record = await db.get(SOURCE_FILES_STORE_NAME, fingerprint);
        if (!record?.blob) return null;
        if (expected?.byteSize !== undefined && record.byteSize !== expected.byteSize) return null;
        return new File([record.blob], expected?.fileName ?? record.fileName, {
            type: record.mimeType,
            lastModified: record.lastModified,
        });
    } catch (error) {
        console.warn('Could not read the stored source file:', error);
        return null;
    }
};

/** Delete stored source files whose fingerprint is not in the live set. Returns the number removed. */
export const pruneSourceFiles = async (liveFingerprints: ReadonlySet<string>): Promise<number> => {
    try {
        const db = await getDb();
        let removed = 0;
        for (const key of await db.getAllKeys(SOURCE_FILES_STORE_NAME)) {
            if (!liveFingerprints.has(key as string)) {
                await db.delete(SOURCE_FILES_STORE_NAME, key);
                removed += 1;
            }
        }
        return removed;
    } catch (error) {
        console.warn('Could not prune stored source files:', error);
        return 0;
    }
};
