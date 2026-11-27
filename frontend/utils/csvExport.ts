import * as Papa from 'papaparse';
import type { CsvRow } from '../types';

/** UTF-8 byte order mark: lets Excel detect UTF-8 so CJK / accented text is not garbled. */
export const CSV_BOM = '﻿';
const CHUNK_ROWS = 5000;
const CRLF = '\r\n';

const yieldToBrowser = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export const safeFileStem = (value: string): string => {
  const normalized = value.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '');
  return normalized || 'export';
};

/** Builds `<stem>[_suffix]_YYYY-MM-DD.csv` from an original file name. */
export const buildCsvFileName = (name: string, suffix = '', now: Date = new Date()): string => {
  const stem = safeFileStem(name.replace(/\.(csv|tsv|txt|xlsx?)$/i, ''));
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  return `${stem}${suffix ? `_${safeFileStem(suffix)}` : ''}_${date}.csv`;
};

export interface CsvBlobOptions {
  /** Physical keys to write, in order. Defaults to the keys of the first row. */
  columns?: string[];
  /** Optional header text per column key. */
  labels?: Record<string, string>;
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Serialises rows in chunks and yields between them so very large datasets do not
 * freeze the UI. The Blob is assembled from parts, so the full text is never one string.
 */
export const buildCsvBlob = async (rows: readonly CsvRow[], options: CsvBlobOptions = {}): Promise<Blob> => {
  const columns = options.columns?.length ? options.columns : Object.keys(rows[0] ?? {});
  const fields = columns.map(column => options.labels?.[column] ?? column);
  const chunkSize = options.chunkSize ?? CHUNK_ROWS;
  const header = Papa.unparse({ fields, data: [[]] as unknown[][] }, { header: true }).split(CRLF)[0];
  const parts: string[] = [CSV_BOM, header, CRLF];
  for (let start = 0; start < rows.length; start += chunkSize) {
    const data = rows.slice(start, start + chunkSize).map(row => columns.map(column => row[column]));
    parts.push(Papa.unparse({ fields, data }, { header: false }), CRLF);
    options.onProgress?.(Math.min(start + chunkSize, rows.length), rows.length);
    if (start + chunkSize < rows.length) await yieldToBrowser();
  }
  return new Blob(parts, { type: 'text/csv;charset=utf-8;' });
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', fileName);
  link.click();
  URL.revokeObjectURL(objectUrl);
};
