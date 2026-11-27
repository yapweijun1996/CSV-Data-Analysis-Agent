// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// demo-data/ lives at the repository root, one level above the frontend package.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const demoDir = path.join(repoRoot, 'demo-data');
const catalogPath = path.join(demoDir, 'catalog.json');

const LANGUAGES = ['English', 'Mandarin', 'Malay', 'Japanese', 'Vietnamese'] as const;
const THEMES = ['housing', 'jobs', 'business', 'transport', 'tourism', 'environment', 'population'];
const SPEEDS = ['fast', 'slow'];
const ENTRY_KEYS = ['columns', 'description', 'file', 'id', 'rows', 'sizeBytes', 'source', 'speed', 'suggestedQuestion', 'theme', 'title'];
const SOURCE_KEYS = ['datasetIds', 'licence', 'publisher', 'url'];
const LOCALIZED_FIELDS = ['title', 'description', 'suggestedQuestion'] as const;

type CatalogEntry = Record<string, unknown> & {
    id: string;
    file: string;
    rows: number;
    columns: number;
    sizeBytes: number;
    source: Record<string, unknown>;
};

// Byte-level, quote-aware CSV scan. It counts records without materialising rows,
// so the 83 MB full HDB file stays cheap to verify. Blank lines are not records.
const scanCsv = (bytes: Buffer) => {
    const QUOTE = 0x22;
    const COMMA = 0x2c;
    const LF = 0x0a;
    const CR = 0x0d;
    let inQuotes = false;
    let headerColumns = 0;
    let headerDone = false;
    let records = 0;
    let recordHasContent = false;
    for (let index = 0; index < bytes.length; index += 1) {
        const byte = bytes[index];
        if (inQuotes) {
            if (byte === QUOTE) {
                if (bytes[index + 1] === QUOTE) index += 1;
                else inQuotes = false;
            }
            continue;
        }
        if (byte === QUOTE) {
            inQuotes = true;
            recordHasContent = true;
        } else if (byte === COMMA) {
            if (!headerDone) headerColumns += 1;
            recordHasContent = true;
        } else if (byte === LF) {
            if (!headerDone) {
                headerColumns += 1;
                headerDone = true;
            } else if (recordHasContent) {
                records += 1;
            }
            recordHasContent = false;
        } else if (byte !== CR) {
            recordHasContent = true;
        }
    }
    if (!headerDone) headerColumns += 1;
    else if (recordHasContent) records += 1;
    return { columns: headerColumns, rows: records, unterminatedQuote: inQuotes };
};

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { version: unknown; datasets: CatalogEntry[] };

describe('demo-data catalog', () => {
    it('has the expected top-level shape', () => {
        expect(Object.keys(catalog).sort()).toEqual(['datasets', 'version']);
        expect(catalog.version).toBe(1);
        expect(Array.isArray(catalog.datasets)).toBe(true);
        expect(catalog.datasets.length).toBeGreaterThan(0);
    });

    it('lists the two existing HDB demos first', () => {
        expect(catalog.datasets[0]).toMatchObject({ id: 'sg-hdb-resale-sample', file: 'singapore-hdb-resale-prices-sample.csv', speed: 'fast' });
        expect(catalog.datasets[1]).toMatchObject({ id: 'sg-hdb-resale-full', file: 'singapore-hdb-resale-prices.csv', speed: 'slow' });
    });

    it('uses unique kebab-case ids and unique files', () => {
        const ids = catalog.datasets.map((entry) => entry.id);
        const files = catalog.datasets.map((entry) => entry.file);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(files).size).toBe(files.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    });

    it('catalogs every CSV shipped in demo-data', () => {
        const csvFiles = fs.readdirSync(demoDir).filter((name) => name.endsWith('.csv')).sort();
        expect(catalog.datasets.map((entry) => entry.file).sort()).toEqual(csvFiles);
    });

    describe.each(catalog.datasets.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
        it('matches the entry schema', () => {
            expect(Object.keys(entry).sort()).toEqual(ENTRY_KEYS);
            expect(THEMES).toContain(entry.theme);
            expect(SPEEDS).toContain(entry.speed);
            for (const field of ['rows', 'columns', 'sizeBytes'] as const) {
                expect(Number.isInteger(entry[field]) && entry[field] > 0, `${field} must be a positive integer`).toBe(true);
            }
            expect(Object.keys(entry.source).sort()).toEqual(SOURCE_KEYS);
            expect(typeof entry.source.publisher === 'string' && entry.source.publisher.trim().length > 0).toBe(true);
            expect(typeof entry.source.licence === 'string' && entry.source.licence.trim().length > 0).toBe(true);
            expect(entry.source.url).toMatch(/^https:\/\/data\.gov\.sg\//);
            const datasetIds = entry.source.datasetIds as unknown[];
            expect(Array.isArray(datasetIds) && datasetIds.length > 0).toBe(true);
            for (const datasetId of datasetIds) expect(datasetId).toMatch(/^d_[0-9a-f]{32}$/);
        });

        it('has every language string', () => {
            for (const field of LOCALIZED_FIELDS) {
                const localized = entry[field] as Record<string, unknown>;
                expect(Object.keys(localized).sort(), `${field} languages`).toEqual([...LANGUAGES].sort());
                for (const language of LANGUAGES) {
                    const value = localized[language];
                    expect(typeof value === 'string' && value.trim().length > 0, `${field}.${language} must be non-empty`).toBe(true);
                }
            }
        });

        it('matches the file on disk', () => {
            // A bare file name keeps the catalog from pointing outside demo-data/.
            expect(path.basename(entry.file)).toBe(entry.file);
            expect(entry.file.endsWith('.csv')).toBe(true);
            const filePath = path.join(demoDir, entry.file);
            expect(fs.existsSync(filePath), `${entry.file} exists`).toBe(true);
            const bytes = fs.readFileSync(filePath);
            const scan = scanCsv(bytes);
            expect(scan.unterminatedQuote).toBe(false);
            expect(bytes.length).toBe(entry.sizeBytes);
            expect(scan.rows).toBe(entry.rows);
            expect(scan.columns).toBe(entry.columns);

            // Generated open-data demos also carry <id>.manifest.json; keep it in sync.
            const manifestPath = path.join(demoDir, `${entry.id}.manifest.json`);
            if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                expect(manifest.output).toMatchObject({
                    file: entry.file,
                    rowCount: entry.rows,
                    columnCount: entry.columns,
                    sizeBytes: entry.sizeBytes,
                    sha256: createHash('sha256').update(bytes).digest('hex'),
                });
                expect(manifest.sources.map((source: { datasetId: string }) => source.datasetId)).toEqual(entry.source.datasetIds);
            }
        });
    });
});
