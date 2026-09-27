import * as Papa from 'papaparse';
import type { CsvRow } from '../../types';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;
const FINGERPRINT_SLICE_BYTES = 128 * 1024;

const updateHash = (hash: bigint, bytes: Uint8Array): bigint => {
    let next = hash;
    for (const byte of bytes) {
        next ^= BigInt(byte);
        next = (next * FNV_PRIME) & FNV_MASK;
    }
    return next;
};

const updateHashWithText = (hash: bigint, text: string): bigint =>
    updateHash(hash, new TextEncoder().encode(text));

/**
 * Produces a stable import identity without reading the complete large file on
 * the UI thread. The worker remains responsible for parsing every source row.
 */
export const buildDuckDbFileIdentity = async (file: File): Promise<{
    loadVersion: string;
    datasetVersion: string;
}> => {
    const head = new Uint8Array(await file.slice(0, FINGERPRINT_SLICE_BYTES).arrayBuffer());
    const tailStart = Math.max(0, file.size - FINGERPRINT_SLICE_BYTES);
    const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
    let hash = updateHashWithText(
        FNV_OFFSET_BASIS,
        `${file.name}|${file.size}|${file.lastModified}|`,
    );
    hash = updateHash(hash, head);
    hash = updateHash(hash, tail);
    const fingerprint = hash.toString(16).padStart(16, '0');
    return {
        loadVersion: `dataset-file-${fingerprint}`,
        datasetVersion: `version-file-${fingerprint}`,
    };
};

export const createCsvPreviewFile = (fileName: string, rows: CsvRow[]): File => {
    if (rows.length === 0) {
        throw new Error('The CSV did not contain any body rows.');
    }
    return new File([Papa.unparse(rows)], fileName, {
        type: 'text/csv',
        lastModified: Date.now(),
    });
};
