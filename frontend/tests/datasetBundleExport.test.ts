import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createSingleTableDatasetBundle } from '../services/data/datasetBundle';
import { buildDatasetBundleZip } from '../services/data/datasetBundleExport';

describe('dataset bundle ZIP export', () => {
    it('exports tables, relationship metadata, lineage, validation, and README', async () => {
        const rows = [
            { id: 1, description: 'quoted, value', amount: 12.5 },
            { id: 2, description: 'plain', amount: 8 },
        ];
        const bundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'fingerprint-1',
            file: { name: 'sales.csv', size: 100, lastModified: 123 },
            data: { fileName: 'sales.csv', data: rows },
            now: '2026-07-27T00:00:00.000Z',
        });
        const zipBlob = await buildDatasetBundleZip({
            bundle,
            loadTableRows: async () => rows,
            lineage: [],
            validationReport: { status: 'trusted' },
        });
        const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
            reader.readAsArrayBuffer(zipBlob);
        });
        const files = unzipSync(zipBytes);
        const tablePath = Object.keys(files).find(path => path.startsWith('tables/'));

        expect(tablePath).toBeTruthy();
        expect(Object.keys(files)).toEqual(expect.arrayContaining([
            'relationships.json',
            'lineage.json',
            'validation-report.json',
            'dataset-bundle.json',
            'README.md',
        ]));
        expect(strFromU8(files[tablePath!])).toContain('"quoted, value"');
        expect(JSON.parse(strFromU8(files['validation-report.json']))).toEqual({ status: 'trusted' });
        expect(strFromU8(files['README.md'])).toContain('Original source data is not modified');
    });
});
