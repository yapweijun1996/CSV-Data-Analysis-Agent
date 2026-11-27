import * as Papa from 'papaparse';
import type { CsvData, CsvRow } from '../../types';
import { CSV_BOM } from '../../utils/csvExport';
import { executeRawSqlQuery } from './queryEngine';

const TABLE_NAME = 'session_clean_dataset';
const CRLF = '\r\n';
const MAX_PAGE_ROWS = 4000;
const MIN_PAGE_ROWS = 50;

export interface FullCsvExportOptions {
    labels?: Record<string, string>;
    sort?: { column: string | null; direction: 'asc' | 'desc' } | null;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
}

export class CsvExportCancelledError extends Error {
    constructor() { super('csv_export_cancelled'); this.name = 'CsvExportCancelledError'; }
}

const RID_ALIAS = '__export_rid';
type SortCursor = { value: unknown; rowid: number };
const sqlLiteral = (value: unknown): string => `'${String(value).replace(/'/g, "''")}'`;

/**
 * Keyset paging keeps every sorted page a bounded top-N scan instead of re-sorting and
 * skipping OFFSET rows. Order is (column, NULLS LAST, rowid) so ties and blanks are stable.
 */
const buildSortedPageSql = (column: string, direction: 'ASC' | 'DESC', limit: number, cursor: SortCursor | null): string => {
    const col = quoteIdentifier(column);
    const cmp = direction === 'ASC' ? '>' : '<';
    let where = '';
    if (cursor) {
        where = cursor.value === null
            ? `WHERE ${col} IS NULL AND rowid > ${cursor.rowid}`
            : `WHERE ${col} ${cmp} ${sqlLiteral(cursor.value)} OR (${col} = ${sqlLiteral(cursor.value)} AND rowid > ${cursor.rowid}) OR ${col} IS NULL`;
    }
    return `SELECT *, rowid AS ${RID_ALIAS} FROM ${TABLE_NAME} ${where} ORDER BY ${col} ${direction} NULLS LAST, rowid LIMIT ${limit}`;
};

const quoteIdentifier = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/**
 * Streams every row of a DuckDB-backed dataset into a CSV Blob, page by page, so the
 * complete table never sits in the React heap as objects. Each page is a read-only SELECT
 * through the same admitted-SQL path as other queries (5,000-row / 2 MB per-result limits),
 * so the page size shrinks automatically for wide tables.
 */
export const exportBackedDatasetToCsvBlob = async (dataset: CsvData, options: FullCsvExportOptions = {}): Promise<Blob> => {
    const total = dataset.backing?.rowCount ?? 0;
    if (!dataset.backing || total <= 0) throw new Error('csv_export_no_backing');
    const parts: BlobPart[] = [CSV_BOM];
    let columns: string[] | null = null;
    let pageSize = Math.min(MAX_PAGE_ROWS, 2000);
    let offset = 0;
    let cursor: SortCursor | null = null;
    const sortColumn = options.sort?.column ?? null;
    while (offset < total) {
        if (options.signal?.aborted) throw new CsvExportCancelledError();
        // Without a sort, rowid ranges are contiguous and cheap. A sort needs OFFSET paging with a rowid tie-break.
        const sql = sortColumn
            ? buildSortedPageSql(sortColumn, options.sort?.direction === 'desc' ? 'DESC' : 'ASC', pageSize, cursor)
            : `SELECT * FROM ${TABLE_NAME} WHERE rowid >= ${offset} AND rowid < ${offset + pageSize} ORDER BY rowid`;
        let rows: CsvRow[];
        try {
            const execution = await executeRawSqlQuery(dataset, sql, [], { limit: pageSize, bypassCache: true, abortSignal: options.signal });
            rows = execution.result.rows as CsvRow[];
            if (!columns) {
                columns = execution.result.selectedColumns.filter(column => column !== RID_ALIAS);
                const fields = columns.map(column => options.labels?.[column] ?? column);
                parts.push(Papa.unparse({ fields, data: [[]] as unknown[][] }, { header: true }).split(CRLF)[0], CRLF);
            }
        } catch (error) {
            if (options.signal?.aborted) throw new CsvExportCancelledError();
            if (error instanceof Error && error.message === 'sql_result_bytes_exceeded' && pageSize > MIN_PAGE_ROWS) {
                pageSize = Math.max(MIN_PAGE_ROWS, Math.floor(pageSize / 2));
                continue;
            }
            throw error;
        }
        if (rows.length === 0 && !sortColumn) { offset += pageSize; continue; }
        if (rows.length === 0) break;
        const cols = columns!;
        parts.push(Papa.unparse({ fields: cols, data: rows.map(row => cols.map(column => row[column])) }, { header: false }), CRLF);
        if (sortColumn) {
            const last = rows[rows.length - 1];
            cursor = { value: last[sortColumn] ?? null, rowid: Number(last[RID_ALIAS]) };
        }
        offset += sortColumn ? rows.length : pageSize;
        options.onProgress?.(Math.min(offset, total), total);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return new Blob(parts, { type: 'text/csv;charset=utf-8;' });
};
