import type { CsvData } from '../../types';

export const DUCKDB_QUERY_TIMEOUT_MS = 10_000;
export const DUCKDB_MEDIUM_DATASET_QUERY_TIMEOUT_MS = 20_000;
export const DUCKDB_LARGE_DATASET_QUERY_TIMEOUT_MS = 60_000;

/**
 * Give full-file DuckDB scans enough time without weakening the bounded runtime.
 * In-memory datasets retain the fast 10-second failure boundary.
 */
export const resolveDuckDbQueryTimeoutMs = (data: CsvData): number => {
    const rowCount = data.backing?.rowCount ?? data.data.length;
    const byteSize = data.backing?.byteSize ?? 0;

    if (rowCount >= 750_000 || byteSize >= 75 * 1024 * 1024) {
        return DUCKDB_LARGE_DATASET_QUERY_TIMEOUT_MS;
    }
    if (rowCount >= 250_000 || byteSize >= 25 * 1024 * 1024) {
        return DUCKDB_MEDIUM_DATASET_QUERY_TIMEOUT_MS;
    }
    return DUCKDB_QUERY_TIMEOUT_MS;
};
