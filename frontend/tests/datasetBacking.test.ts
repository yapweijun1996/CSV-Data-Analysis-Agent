import { describe, expect, it } from 'vitest';
import {
    getCsvDataRowCount,
    getCsvDatasetLoadVersion,
    getCsvDatasetVersion,
} from '../utils/datasetId';

describe('DuckDB-backed CsvData identity', () => {
    it('uses full-dataset metadata instead of preview length and fingerprint', () => {
        const dataset = {
            fileName: 'large.csv',
            data: [{ month: '1990-01' }],
            backing: {
                mode: 'duckdb_file' as const,
                loadVersion: 'dataset-file-full',
                datasetVersion: 'version-file-full',
                rowCount: 982_589,
                sampleRowCount: 1,
                byteSize: 79_000_000,
                readOnly: true as const,
                ephemeral: true as const,
            },
        };

        expect(getCsvDataRowCount(dataset)).toBe(982_589);
        expect(getCsvDatasetLoadVersion(dataset)).toBe('dataset-file-full');
        expect(getCsvDatasetVersion(dataset)).toBe('version-file-full');
    });
});
