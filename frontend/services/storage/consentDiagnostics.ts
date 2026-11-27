import type { CloudAiConsentRecord, LocalDiagnosticRecord } from '../../types';
import { CLOUD_AI_CONSENTS_STORE_NAME, LOCAL_DIAGNOSTICS_STORE_NAME, StorageOperationError, runWithIndexedDbReconnect } from './connection';

export const getCloudAiConsent = async (
    key: string,
): Promise<CloudAiConsentRecord | null> => {
    try {
        const record = await runWithIndexedDbReconnect(db =>
            db.get(CLOUD_AI_CONSENTS_STORE_NAME, key),
        );
        return record ?? null;
    } catch (error) {
        console.error('Failed to read cloud AI consent from IndexedDB:', error);
        throw new StorageOperationError('getCloudAiConsent', error);
    }
};

export const saveCloudAiConsent = async (
    record: CloudAiConsentRecord,
): Promise<void> => {
    try {
        await runWithIndexedDbReconnect(db =>
            db.put(CLOUD_AI_CONSENTS_STORE_NAME, record),
        );
    } catch (error) {
        console.error('Failed to save cloud AI consent to IndexedDB:', error);
        throw new StorageOperationError('saveCloudAiConsent', error);
    }
};

export const pruneExpiredLocalDiagnostics = async (
    now = Date.now(),
): Promise<number> => runWithIndexedDbReconnect(async db => {
    const records = await db.getAll(LOCAL_DIAGNOSTICS_STORE_NAME);
    const expired = records.filter(record =>
        !Number.isFinite(Date.parse(record.expiresAt))
        || Date.parse(record.expiresAt) <= now);
    await Promise.all(expired.map(record =>
        db.delete(LOCAL_DIAGNOSTICS_STORE_NAME, record.id)));
    return expired.length;
});

export const saveLocalDiagnostic = async (
    record: LocalDiagnosticRecord,
    options: { now?: number; maxTotalBytes: number },
): Promise<void> => runWithIndexedDbReconnect(async db => {
    const now = options.now ?? Date.now();
    const records = (await db.getAll(LOCAL_DIAGNOSTICS_STORE_NAME))
        .filter(existing => Number.isFinite(Date.parse(existing.expiresAt))
            && Date.parse(existing.expiresAt) > now)
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const keepIds = new Set(records.map(existing => existing.id));
    const allKeys = await db.getAllKeys(LOCAL_DIAGNOSTICS_STORE_NAME);
    await Promise.all(allKeys
        .filter(key => !keepIds.has(String(key)))
        .map(key => db.delete(LOCAL_DIAGNOSTICS_STORE_NAME, key)));

    let totalBytes = records.reduce(
        (total, existing) => total + Math.max(0, existing.estimatedBytes || 0),
        Math.max(0, record.estimatedBytes || 0),
    );
    while (records.length > 0 && totalBytes > options.maxTotalBytes) {
        const oldest = records.shift()!;
        totalBytes -= Math.max(0, oldest.estimatedBytes || 0);
        await db.delete(LOCAL_DIAGNOSTICS_STORE_NAME, oldest.id);
    }
    await db.put(LOCAL_DIAGNOSTICS_STORE_NAME, record);
});

export const getRecentLocalDiagnostics = async (
    limit = 200,
    now = Date.now(),
): Promise<LocalDiagnosticRecord[]> => runWithIndexedDbReconnect(async db => {
    const records = await db.getAllFromIndex(
        LOCAL_DIAGNOSTICS_STORE_NAME,
        'recordedAt',
    );
    const active = records.filter(record =>
        Number.isFinite(Date.parse(record.expiresAt))
        && Date.parse(record.expiresAt) > now);
    return active.slice(-Math.max(1, Math.trunc(limit))).reverse();
});
