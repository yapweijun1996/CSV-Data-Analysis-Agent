import { AsyncZipDeflate, strToU8, Zip, ZipPassThrough } from 'fflate';
import type {
    CsvRow,
    DatasetBundle,
    DatasetLineageRecord,
    DatasetTable,
} from '../../types';

export type DatasetTableRowSource = CsvRow[] | AsyncIterable<CsvRow[]> | Blob;

export interface DatasetBundleExportInput {
    bundle: DatasetBundle;
    loadTableRows: (table: DatasetTable) => Promise<DatasetTableRowSource>;
    lineage: DatasetLineageRecord[];
    validationReport: Record<string, unknown>;
}

const sanitizeFileName = (value: string): string =>
    value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'table';

const encodeCsvCell = (value: CsvRow[string]): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toChunks = async function* (source: DatasetTableRowSource): AsyncGenerator<CsvRow[]> {
    if (Array.isArray(source)) {
        yield source;
        return;
    }
    if (source instanceof Blob) return;
    for await (const chunk of source) yield chunk;
};

const addTextFile = (zip: Zip, path: string, text: string): void => {
    const file = new ZipPassThrough(path);
    zip.add(file);
    file.push(strToU8(text), true);
};

const addTableCsv = async (
    zip: Zip,
    table: DatasetTable,
    source: DatasetTableRowSource,
): Promise<number> => {
    const path = `tables/${sanitizeFileName(table.name)}-${sanitizeFileName(table.tableId)}.csv`;
    const file = new AsyncZipDeflate(path, { level: 6 });
    zip.add(file);
    if (source instanceof Blob) {
        const reader = source.stream().getReader();
        let exportedBytes = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                file.push(value, false);
                exportedBytes += value.byteLength;
            }
        }
        file.push(new Uint8Array(), true);
        return table.rowCount > 0 ? table.rowCount : exportedBytes;
    }
    const columns = table.schema.map(column => column.name);
    file.push(strToU8(`${columns.map(encodeCsvCell).join(',')}\r\n`), false);
    let exportedRows = 0;
    for await (const rows of toChunks(source)) {
        if (rows.length === 0) continue;
        const text = rows
            .map(row => columns.map(column => encodeCsvCell(row[column])).join(','))
            .join('\r\n');
        file.push(strToU8(`${text}\r\n`), false);
        exportedRows += rows.length;
    }
    file.push(new Uint8Array(), true);
    return exportedRows;
};

const buildReadme = (bundle: DatasetBundle, exportedRows: Record<string, number>): string => [
    '# Dataset Bundle Export',
    '',
    `Source: ${bundle.source.fileName}`,
    `Source fingerprint: ${bundle.source.fingerprint}`,
    `Dataset version: ${bundle.datasetVersion}`,
    `Relationship set: ${bundle.relationshipSetId}`,
    '',
    '## Tables',
    '',
    ...bundle.tables.map(table => (
        `- ${table.name} (${table.role}): ${exportedRows[table.tableId] ?? 0} exported rows; declared ${table.rowCount} rows; tableId=${table.tableId}`
    )),
    '',
    'Relationships must have a trusted decision before the application executes a join.',
    'Original source data is not modified by this export.',
    '',
].join('\n');

/** Builds a streaming ZIP without adding table rows to application state. */
export const buildDatasetBundleZip = async (input: DatasetBundleExportInput): Promise<Blob> => {
    const outputChunks: Uint8Array[] = [];
    let resolveZip: ((blob: Blob) => void) | null = null;
    let rejectZip: ((error: Error) => void) | null = null;
    const completion = new Promise<Blob>((resolve, reject) => {
        resolveZip = resolve;
        rejectZip = reject;
    });
    const zip = new Zip((error, data, final) => {
        if (error) {
            rejectZip?.(error);
            return;
        }
        outputChunks.push(data);
        if (final) resolveZip?.(new Blob(outputChunks, { type: 'application/zip' }));
    });

    try {
        const exportedRows: Record<string, number> = {};
        for (const table of input.bundle.tables) {
            exportedRows[table.tableId] = await addTableCsv(
                zip,
                table,
                await input.loadTableRows(table),
            );
        }
        addTextFile(zip, 'relationships.json', JSON.stringify({
            relationshipSetId: input.bundle.relationshipSetId,
            relationships: input.bundle.relationships,
        }, null, 2));
        addTextFile(zip, 'lineage.json', JSON.stringify(input.lineage, null, 2));
        addTextFile(zip, 'validation-report.json', JSON.stringify(input.validationReport, null, 2));
        addTextFile(zip, 'dataset-bundle.json', JSON.stringify(input.bundle, null, 2));
        addTextFile(zip, 'README.md', buildReadme(input.bundle, exportedRows));
        zip.end();
    } catch (error) {
        zip.terminate();
        rejectZip?.(error instanceof Error ? error : new Error(String(error)));
    }
    return completion;
};

export const downloadDatasetBundleZip = async (
    input: DatasetBundleExportInput,
    fileName = 'dataset-bundle.zip',
): Promise<void> => {
    const blob = await buildDatasetBundleZip(input);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
};
