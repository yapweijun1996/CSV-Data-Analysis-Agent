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

export interface CsvWriteOptions {
  /** Physical keys to write, in order. Defaults to the keys of the first row. */
  columns?: string[];
  /** Optional header text per column key. */
  labels?: Record<string, string>;
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Destination for CSV output. `abort` discards partial output (cancelled or failed). */
export interface CsvSink {
  write(text: string): Promise<void> | void;
  writeBlob(blob: Blob): Promise<void> | void;
  close(): Promise<void> | void;
  abort(): Promise<void> | void;
}

/**
 * Serialises rows in chunks into the sink and yields between chunks so very large row sets
 * do not freeze the UI. The BOM and header are written first.
 */
export const writeCsvRows = async (sink: CsvSink, rows: readonly CsvRow[], options: CsvWriteOptions = {}): Promise<void> => {
  const columns = options.columns?.length ? options.columns : Object.keys(rows[0] ?? {});
  const fields = columns.map(column => options.labels?.[column] ?? column);
  const chunkSize = options.chunkSize ?? CHUNK_ROWS;
  const header = Papa.unparse({ fields, data: [[]] as unknown[][] }, { header: true }).split(CRLF)[0];
  await sink.write(CSV_BOM + header + CRLF);
  for (let start = 0; start < rows.length; start += chunkSize) {
    const data = rows.slice(start, start + chunkSize).map(row => columns.map(column => row[column]));
    await sink.write(Papa.unparse({ fields, data }, { header: false }) + CRLF);
    options.onProgress?.(Math.min(start + chunkSize, rows.length), rows.length);
    if (start + chunkSize < rows.length) await yieldToBrowser();
  }
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', fileName);
  link.click();
  URL.revokeObjectURL(objectUrl);
};

export type CsvSortState = { column: string | null; direction: 'asc' | 'desc' };

/**
 * Orders rows like the Explorer grid does: numbers compare numerically, everything else
 * with a natural, locale-aware text compare; blanks sort last. Stable, returns a copy.
 */
export const sortRowsForExport = (rows: readonly CsvRow[], sort: CsvSortState | null | undefined): CsvRow[] => {
  if (!sort?.column) return rows as CsvRow[];
  const { column, direction } = sort;
  const factor = direction === 'desc' ? -1 : 1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const isBlank = (value: unknown) => value === null || value === undefined || value === '';
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = a.row[column];
    const right = b.row[column];
    if (isBlank(left) || isBlank(right)) {
      if (isBlank(left) && isBlank(right)) return a.index - b.index;
      return isBlank(left) ? 1 : -1;
    }
    const numLeft = typeof left === 'number' ? left : Number(left);
    const numRight = typeof right === 'number' ? right : Number(right);
    const compared = Number.isFinite(numLeft) && Number.isFinite(numRight)
      ? numLeft - numRight
      : collator.compare(String(left), String(right));
    return compared === 0 ? a.index - b.index : compared * factor;
  }).map(entry => entry.row);
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName?: string; types?: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{
    createWritable: () => Promise<{ write: (data: BufferSource | Blob) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }>;
  }>;
};

export const supportsDirectCsvSave = (): boolean =>
  typeof window !== 'undefined' && typeof (window as SaveFilePickerWindow).showSaveFilePicker === 'function';

const createBlobSink = (fileName: string): CsvSink => {
  const parts: BlobPart[] = [];
  return {
    write: text => { parts.push(text); },
    writeBlob: blob => { parts.push(blob); },
    close: () => downloadBlob(new Blob(parts, { type: 'text/csv;charset=utf-8;' }), fileName),
    abort: () => { parts.length = 0; },
  };
};

/**
 * Opens the destination for a CSV file. With the File System Access API (Chromium) the person
 * picks a file and output streams straight to disk, so large exports do not sit in memory.
 * Elsewhere it collects parts and downloads a Blob on close. Returns null when the save dialog
 * is dismissed. Call it first in the click handler: the dialog needs the click's user activation.
 */
export const createCsvSaver = async (fileName: string): Promise<CsvSink | null> => {
  if (!supportsDirectCsvSave()) return createBlobSink(fileName);
  let writable: Awaited<ReturnType<NonNullable<SaveFilePickerWindow['showSaveFilePicker']>>>['createWritable'] extends () => Promise<infer W> ? W : never;
  try {
    const handle = await (window as SaveFilePickerWindow).showSaveFilePicker!({
      suggestedName: fileName,
      types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
    });
    writable = await handle.createWritable();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    return createBlobSink(fileName); // picker blocked or failed: fall back to a normal download
  }
  const encoder = new TextEncoder();
  return {
    write: text => writable.write(encoder.encode(text)),
    writeBlob: blob => writable.write(blob),
    close: () => writable.close(),
    abort: () => writable.abort().catch(() => undefined),
  };
};

/**
 * Runs `produce` against a CSV destination. Returns false if the person dismissed the save
 * dialog; throws (after discarding partial output) if producing failed.
 */
export const saveCsv = async (fileName: string, produce: (sink: CsvSink) => Promise<void>): Promise<boolean> => {
  const sink = await createCsvSaver(fileName);
  if (!sink) return false;
  try {
    await produce(sink);
    await sink.close();
    return true;
  } catch (error) {
    await sink.abort();
    throw error;
  }
};
