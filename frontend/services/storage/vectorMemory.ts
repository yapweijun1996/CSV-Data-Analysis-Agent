import type { Settings, VectorStoreDocument } from '../../types';
import { VECTOR_MEMORY_STORE_NAME, runWithIndexedDbReconnect } from './connection';

// Vector Memory Persistence

/** Persist vector memory documents to IndexedDB for cross-refresh survival. */
export const saveVectorMemory = async (documents: VectorStoreDocument[], key = 'current'): Promise<void> => {
    try {
        await runWithIndexedDbReconnect(db =>
            db.put(VECTOR_MEMORY_STORE_NAME, { key, documents, savedAt: Date.now() }),
        );
    } catch (error) {
        console.error('Failed to save vector memory to IndexedDB:', error);
        // Non-fatal: vectors can be rebuilt from state if IndexedDB fails.
    }
};

/** Load persisted vector memory documents. Returns [] if not found or on failure. */
export const loadVectorMemory = async (key = 'current'): Promise<VectorStoreDocument[]> => {
    try {
        const record = await runWithIndexedDbReconnect(db =>
            db.get(VECTOR_MEMORY_STORE_NAME, key),
        );
        return record?.documents ?? [];
    } catch (error) {
        console.error('Failed to load vector memory from IndexedDB:', error);
        return [];
    }
};

/** Remove persisted vector memory for a given key. */
export const clearVectorMemory = async (key = 'current'): Promise<void> => {
    try {
        await runWithIndexedDbReconnect(db =>
            db.delete(VECTOR_MEMORY_STORE_NAME, key),
        );
    } catch (error) {
        console.error('Failed to clear vector memory from IndexedDB:', error);
    }
};

// Settings Management
// Default provider is 'default' (the maintainer's shared demo gateway, no
