import type { CsvData, CsvRow } from '../types';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;
const fingerprintCache = new WeakMap<CsvRow[], Map<string, string>>();

const updateHash = (hash: bigint, value: string): bigint => {
    let next = hash;
    for (let i = 0; i < value.length; i++) {
        next ^= BigInt(value.charCodeAt(i));
        next = (next * FNV_PRIME) & FNV_MASK;
    }
    return next;
};

const encodeCell = (value: CsvRow[string]): string => {
    if (value === null) return 'null';
    if (typeof value === 'string') return `s:${value.length}:${value}`;
    if (typeof value === 'number') return `n:${Object.is(value, -0) ? '-0' : String(value)}`;
    return `b:${value ? '1' : '0'}`;
};

/**
 * Full-content deterministic fingerprint.
 *
 * The previous identifier sampled only the first 20 rows, so two files with
 * the same prefix could silently share an ID. DATA-201 requires the immutable
 * source and every material version to hash all rows and sorted column names.
 */
export const buildDatasetFingerprint = (fileName: string, rows: CsvRow[]): string => {
    // Older persisted/test fixtures may omit fileName despite the current
    // CsvData contract. Normalize that legacy shape deterministically.
    const normalizedFileName = typeof fileName === 'string' ? fileName : '';
    const cached = fingerprintCache.get(rows)?.get(normalizedFileName);
    if (cached) return cached;

    let hash = updateHash(
        FNV_OFFSET_BASIS,
        `file:${normalizedFileName.length}:${normalizedFileName}|rows:${rows.length}|`,
    );
    for (const row of rows) {
        const keys = Object.keys(row).sort();
        hash = updateHash(hash, `columns:${keys.length}|`);
        for (const key of keys) {
            hash = updateHash(hash, `key:${key.length}:${key}|value:${encodeCell(row[key])}|`);
        }
        hash = updateHash(hash, 'row-end|');
    }
    const fingerprint = hash.toString(16).padStart(16, '0');
    const fileMap = fingerprintCache.get(rows) ?? new Map<string, string>();
    fileMap.set(normalizedFileName, fingerprint);
    fingerprintCache.set(rows, fileMap);
    return fingerprint;
};

export const buildSchemaFingerprint = (rows: CsvRow[]): string => {
    const columnSet = new Set<string>();
    for (const row of rows) {
        for (const column of Object.keys(row)) {
            columnSet.add(column);
        }
    }
    const columns = Array.from(columnSet).sort();
    let hash = updateHash(FNV_OFFSET_BASIS, `columns:${columns.length}|`);
    for (const column of columns) {
        hash = updateHash(hash, `${column.length}:${column}|`);
    }
    return hash.toString(16).padStart(16, '0');
};

// WeakMap-based memoization: keyed on the rows array reference, then by fileName.
// When the rows array is GC'd, the cache entry is automatically cleaned up.
// This avoids re-hashing sample rows on repeated calls with the same data.
const idCache = new WeakMap<CsvRow[], Map<string, string>>();

export const buildDatasetId = (fileName: string, rows: CsvRow[]): string => {
    const normalizedFileName = typeof fileName === 'string' ? fileName : '';
    let fileMap = idCache.get(rows);
    if (fileMap) {
        const cached = fileMap.get(normalizedFileName);
        if (cached !== undefined) return cached;
    }

    const id = `dataset-${buildDatasetFingerprint(normalizedFileName, rows)}`;

    if (!fileMap) {
        fileMap = new Map();
        idCache.set(rows, fileMap);
    }
    fileMap.set(normalizedFileName, id);
    return id;
};

export const buildDatasetVersionId = (fileName: string, rows: CsvRow[]): string =>
    `version-${buildDatasetFingerprint(fileName, rows)}`;

export const getCsvDatasetLoadVersion = (data: CsvData): string =>
    data.backing?.loadVersion ?? buildDatasetId(data.fileName, data.data);

export const getCsvDatasetVersion = (data: CsvData): string =>
    data.backing?.datasetVersion ?? buildDatasetVersionId(data.fileName, data.data);

export const getCsvDataRowCount = (data: CsvData | null | undefined): number =>
    data?.backing?.rowCount ?? data?.data.length ?? 0;
