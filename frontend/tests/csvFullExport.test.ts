import { describe, expect, it, vi } from 'vitest';
import type { CsvData } from '../types';

const executeRawSqlQuery = vi.hoisted(() => vi.fn());
vi.mock('../services/duckdb/queryEngine', () => ({ executeRawSqlQuery }));

import { CsvExportCancelledError, exportBackedDatasetToCsv, type FullCsvExportOptions } from '../services/duckdb/csvFullExport';
import { sortRowsForExport, type CsvSink } from '../utils/csvExport';

const dataset = { fileName: 'big.csv', data: [], backing: { mode: 'duckdb_file', rowCount: 5, loadVersion: 'v1' } } as unknown as CsvData;
const exportBackedDatasetToCsvBlob = async (data: CsvData, options: FullCsvExportOptions = {}): Promise<Blob> => {
    const parts: BlobPart[] = [];
    const sink: CsvSink = { write: t => { parts.push(t); }, writeBlob: b => { parts.push(b); }, close: () => undefined, abort: () => undefined };
    await exportBackedDatasetToCsv(data, sink, options);
    return new Blob(parts);
};
const readText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
});

describe('full DuckDB CSV export', () => {
    it('pages through every row, shrinks pages on size errors and reports progress', async () => {
        const all = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `n,${i}` }));
        let first = true;
        executeRawSqlQuery.mockImplementation(async (_d: unknown, sql: string) => {
            if (first) { first = false; throw new Error('sql_result_bytes_exceeded'); }
            const [, a, b] = /rowid >= (\d+) AND rowid < (\d+)/.exec(sql)!.map(Number);
            return { result: { rows: all.slice(a, b), selectedColumns: ['id', 'name'] } };
        });
        const progress: number[] = [];
        const blob = await exportBackedDatasetToCsvBlob(dataset, { labels: { id: 'ID' }, onProgress: done => progress.push(done) });
        const text = await readText(blob);
        expect(text.split('\r\n').filter(Boolean)).toEqual(['ID,name', '0,"n,0"', '1,"n,1"', '2,"n,2"', '3,"n,3"', '4,"n,4"']);
        expect(progress.at(-1)).toBe(5);
    });

    it('uses ORDER BY with offset paging when a sort is active', async () => {
        executeRawSqlQuery.mockResolvedValueOnce({ result: { rows: [{ id: 3, __export_rid: 7 }], selectedColumns: ['id', '__export_rid'] } })
            .mockResolvedValueOnce({ result: { rows: [{ id: 2, __export_rid: 4 }], selectedColumns: ['id', '__export_rid'] } });
        const blob = await exportBackedDatasetToCsvBlob({ ...dataset, backing: { ...dataset.backing!, rowCount: 2 } }, { sort: { column: 'id', direction: 'desc' } });
        expect(executeRawSqlQuery.mock.calls.at(-2)![1]).toContain('ORDER BY "id" DESC NULLS LAST, rowid LIMIT');
        expect(executeRawSqlQuery.mock.calls.at(-1)![1]).toContain(`WHERE "id" < '3' OR ("id" = '3' AND rowid > 7) OR "id" IS NULL`);
        expect((await readText(blob)).split('\r\n').filter(Boolean)).toEqual(['id', '3', '2']);
    });

    it('stops with a cancellation error when aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(exportBackedDatasetToCsvBlob(dataset, { signal: controller.signal })).rejects.toBeInstanceOf(CsvExportCancelledError);
    });
});

describe('sortRowsForExport', () => {
    it('sorts numerically, keeps blanks last and does not mutate input', () => {
        const rows = [{ v: '10' }, { v: '' }, { v: '9' }, { v: '100' }];
        expect(sortRowsForExport(rows, { column: 'v', direction: 'asc' }).map(r => r.v)).toEqual(['9', '10', '100', '']);
        expect(sortRowsForExport(rows, { column: 'v', direction: 'desc' }).map(r => r.v)).toEqual(['100', '10', '9', '']);
        expect(rows[0].v).toBe('10');
    });
});

