import { describe, expect, it } from 'vitest';
import {
    DUCKDB_LARGE_DATASET_QUERY_TIMEOUT_MS,
    DUCKDB_MEDIUM_DATASET_QUERY_TIMEOUT_MS,
    DUCKDB_QUERY_TIMEOUT_MS,
    resolveDuckDbQueryTimeoutMs,
} from '../services/duckdb/queryTimeout';

const createFileBackedDataset = (rowCount: number, byteSize: number) => ({
    fileName: 'large.csv',
    data: [{ Amount: 1 }],
    backing: {
        mode: 'duckdb_file' as const,
        loadVersion: 'load-1',
        datasetVersion: 'version-1',
        rowCount,
        sampleRowCount: 1,
        byteSize,
        readOnly: true as const,
        ephemeral: true as const,
    },
});

describe('DuckDB query timeout policy', () => {
    it('keeps the fast timeout for ordinary in-memory datasets', () => {
        expect(resolveDuckDbQueryTimeoutMs({
            fileName: 'small.csv',
            data: [{ Amount: 1 }],
        })).toBe(DUCKDB_QUERY_TIMEOUT_MS);
    });

    it('allows medium full-file scans more time', () => {
        expect(resolveDuckDbQueryTimeoutMs(
            createFileBackedDataset(500_000, 40 * 1024 * 1024),
        )).toBe(DUCKDB_MEDIUM_DATASET_QUERY_TIMEOUT_MS);
    });

    it('allows one-million-row full-file scans up to sixty seconds', () => {
        expect(resolveDuckDbQueryTimeoutMs(
            createFileBackedDataset(1_000_000, 100 * 1024 * 1024),
        )).toBe(DUCKDB_LARGE_DATASET_QUERY_TIMEOUT_MS);
    });
});
