import { describe, expect, it } from 'vitest';
import type { ColumnProfile, CsvData } from '../types';
import { getQueryableColumnProfiles } from '../services/agent/runtime/analysisContextBuilder';

const profiles: ColumnProfile[] = [
    { name: 'town', type: 'categorical' },
    { name: 'resale_price', type: 'currency' },
    { name: 'RowRole', type: 'categorical' },
    { name: 'SectionLabel', type: 'categorical' },
];

const backedData: CsvData = {
    fileName: 'hdb.csv',
    data: [{ town: 'ANG MO KIO', resale_price: 9000, RowRole: 'detail', SectionLabel: '' }],
    backing: {
        mode: 'duckdb_file',
        loadVersion: 'hdb-load',
        datasetVersion: 'hdb-version',
        rowCount: 982_589,
        sampleRowCount: 1,
        byteSize: 80_000_000,
        columnNames: ['town', 'resale_price'],
        readOnly: true,
        ephemeral: true,
    },
};

describe('queryable analysis profiles', () => {
    it('excludes preview-only annotations from a DuckDB-backed table', () => {
        expect(getQueryableColumnProfiles(backedData, profiles, backedData).map(profile => profile.name))
            .toEqual(['town', 'resale_price']);
    });

    it('retains a structural-looking column when the source table actually contains it', () => {
        const data: CsvData = {
            ...backedData,
            backing: { ...backedData.backing!, columnNames: ['town', 'resale_price', 'RowRole'] },
        };
        expect(getQueryableColumnProfiles(data, profiles, data).map(profile => profile.name))
            .toEqual(['town', 'resale_price', 'RowRole']);
    });

    it('uses the raw preview for older backing metadata and leaves ordinary tables unchanged', () => {
        const data: CsvData = {
            ...backedData,
            backing: { ...backedData.backing!, columnNames: undefined },
        };
        const rawData: CsvData = { fileName: 'hdb.csv', data: [{ town: 'ANG MO KIO', resale_price: 9000 }] };
        expect(getQueryableColumnProfiles(data, profiles, rawData).map(profile => profile.name))
            .toEqual(['town', 'resale_price']);
        expect(getQueryableColumnProfiles(data, profiles, null)).toEqual([]);
        expect(getQueryableColumnProfiles(rawData, profiles, rawData)).toBe(profiles);
    });
});
