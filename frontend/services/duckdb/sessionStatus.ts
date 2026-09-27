import type { DuckDbFallbackStage, DuckDbSessionStatus } from '../../types';
import type { DuckDbDatasetBinding, ManagedDataQueryExecution } from './queryEngine';

/**
 * Structural equality check for DuckDbSessionStatus.
 * Compares all scalar/string/null fields by value, skipping Date fields
 * (which are decorative timestamps and should not trigger re-renders).
 */
export const isDuckDbSessionStatusEqual = (
    a: DuckDbSessionStatus | null | undefined,
    b: DuckDbSessionStatus | null | undefined,
): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    const keys = Object.keys(a) as Array<keyof DuckDbSessionStatus>;
    for (const key of keys) {
        const va = a[key];
        const vb = b[key];
        if (va instanceof Date || vb instanceof Date) continue;
        if (va !== vb) return false;
    }
    return true;
};

const normalizeFallbackStatus = (
    fallbackStage: DuckDbFallbackStage | null | undefined,
    fallbackReason: string | null | undefined,
): DuckDbSessionStatus['status'] => {
    if (!fallbackStage || fallbackStage === 'no_dataset') {
        return 'idle';
    }
    if (fallbackStage === 'duckdb_disabled' || fallbackStage === 'bind_failed' || fallbackStage === 'query_failed') {
        return 'degraded';
    }
    return fallbackReason ? 'error' : 'idle';
};

export const createIdleDuckDbSessionStatus = (): DuckDbSessionStatus => ({
    status: 'idle',
    engine: null,
    tableName: null,
    loadVersion: null,
    fallbackReason: null,
    fallbackStage: null,
    lastSyncedAt: null,
});

export const createBindingDuckDbSessionStatus = (
    previous?: Partial<DuckDbSessionStatus> | null,
): DuckDbSessionStatus => ({
    status: 'binding',
    engine: previous?.engine ?? null,
    tableName: previous?.tableName ?? null,
    loadVersion: previous?.loadVersion ?? null,
    fallbackReason: null,
    fallbackStage: null,
    lastSyncedAt: previous?.lastSyncedAt ?? null,
});

export const createDuckDbSessionStatusFromBinding = (
    binding: DuckDbDatasetBinding,
    syncedAt = new Date(),
): DuckDbSessionStatus => {
    if (binding.engine === 'duckdb') {
        return {
            status: 'ready',
            engine: 'duckdb',
            tableName: binding.tableName,
            loadVersion: binding.loadVersion,
            fallbackReason: null,
            fallbackStage: null,
            lastSyncedAt: syncedAt,
        };
    }

    return {
        status: normalizeFallbackStatus(binding.fallbackStage, binding.fallbackReason),
        engine: 'native',
        tableName: binding.tableName,
        loadVersion: binding.loadVersion,
        fallbackReason: binding.fallbackReason ?? null,
        fallbackStage: binding.fallbackStage ?? null,
        lastSyncedAt: syncedAt,
    };
};

export const createDuckDbSessionStatusFromExecution = (
    execution: ManagedDataQueryExecution,
    syncedAt = new Date(),
): DuckDbSessionStatus => {
    if (execution.engine === 'duckdb') {
        return {
            status: 'ready',
            engine: 'duckdb',
            tableName: execution.tableName,
            loadVersion: execution.loadVersion,
            fallbackReason: null,
            fallbackStage: null,
            lastSyncedAt: syncedAt,
        };
    }

    return {
        status: normalizeFallbackStatus(execution.fallbackStage, execution.fallbackReason),
        engine: 'native',
        tableName: execution.tableName,
        loadVersion: execution.loadVersion,
        fallbackReason: execution.fallbackReason ?? null,
        fallbackStage: execution.fallbackStage ?? null,
        lastSyncedAt: syncedAt,
    };
};

export const createDuckDbSessionErrorStatus = (
    error: unknown,
    previous?: Partial<DuckDbSessionStatus> | null,
    syncedAt = new Date(),
    fallbackStage: DuckDbFallbackStage | null = null,
): DuckDbSessionStatus => ({
    status: 'error',
    engine: previous?.engine ?? 'native',
    tableName: previous?.tableName ?? null,
    loadVersion: previous?.loadVersion ?? null,
    fallbackReason: error instanceof Error ? error.message : String(error),
    fallbackStage,
    lastSyncedAt: syncedAt,
});
