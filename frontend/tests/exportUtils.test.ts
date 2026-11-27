import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    exportDatasetToCsv,
    exportToCsv,
    exportRowsToCsvAsync,
    exportToHtml,
    exportToPng,
    type AnalysisExportMetadata,
} from '../utils/exportUtils';

const { toPngMock } = vi.hoisted(() => ({
    toPngMock: vi.fn(async (_element: HTMLElement) => 'data:image/png;base64,export'),
}));

vi.mock('html-to-image', () => ({
    toPng: toPngMock,
}));

const metadata: AnalysisExportMetadata = {
    cardId: 'card-1',
    scope: 'Top 10 · Town = WOODLANDS',
    trustStatus: 'verified',
    datasetVersion: 'version-current',
};

const readBytes = (blob: Blob): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
});

const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
});

describe('analysis exports', () => {
    let downloadedBlobs: Blob[];
    let clickedDownloads: string[];

    beforeEach(() => {
        downloadedBlobs = [];
        clickedDownloads = [];
        vi.clearAllMocks();
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn((blob: Blob) => {
                downloadedBlobs.push(blob);
                return `blob:export-${downloadedBlobs.length}`;
            }),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
            clickedDownloads.push(this.download);
        });
    });

    it('adds the same scope, trust, dataset version, and card id to card CSV exports', async () => {
        expect(await exportToCsv([{ Town: 'WOODLANDS', Total: 100 }], 'Town total', metadata))
            .toMatchObject({ success: true });

        const csv = await readBlob(downloadedBlobs[0]);
        expect(csv).toContain('_export_scope');
        expect(csv).toContain('Top 10 · Town = WOODLANDS');
        expect(csv).toContain('verified');
        expect(csv).toContain('version-current');
        expect(csv).toContain('card-1');
        expect(clickedDownloads).toEqual([expect.stringMatching(/^Town_total_\d{4}-\d{2}-\d{2}\.csv$/)]);
        expect(Array.from(new Uint8Array(await readBytes(downloadedBlobs[0])).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('downloads the complete prepared dataset without adding card metadata columns', async () => {
        expect(await exportDatasetToCsv(
            [{ Row: 1 }, { Row: 2 }, { Row: 3 }],
            'cleaned_source.csv',
        )).toMatchObject({ success: true });

        const csv = await readBlob(downloadedBlobs[0]);
        expect(csv).toContain('Row');
        expect(csv).toContain('1');
        expect(csv).toContain('3');
        expect(csv).not.toContain('_export_scope');
        expect(clickedDownloads).toEqual([expect.stringMatching(/^cleaned_source_\d{4}-\d{2}-\d{2}\.csv$/)]);
    });

    it('streams large row sets in chunks with BOM, labels and escaping', async () => {
        const rows = Array.from({ length: 12001 }, (_, i) => ({ name: i === 0 ? '中文,"quote"' : `n${i}`, v: i }));
        const result = await exportRowsToCsvAsync(rows, 'sales.csv', { columns: ['name', 'v'], labels: { name: 'Name' }, suffix: 'filtered' });
        expect(result).toMatchObject({ success: true, rowCount: 12001 });
        const csv = await readBlob(downloadedBlobs[0]);
        expect(csv.startsWith('Name,v\r\n"中文,""quote""",0')).toBe(true);
        expect(csv.trim().split('\r\n')).toHaveLength(12002);
        expect(clickedDownloads[0]).toMatch(/^sales_filtered_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('streams straight to disk when the File System Access API is available and skips output on dismiss', async () => {
        const written: Uint8Array[] = [];
        const close = vi.fn();
        const picker = vi.fn(async () => ({ createWritable: async () => ({ write: async (d: Uint8Array) => { written.push(d); }, close, abort: vi.fn() }) }));
        (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker;
        try {
            expect(await exportToCsv([{ a: '中' }], 'disk')).toEqual({ success: true, cancelled: false });
            expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: expect.stringMatching(/^disk_\d{4}-\d{2}-\d{2}\.csv$/) }));
            expect(Array.from(written[0].slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
            expect(close).toHaveBeenCalledTimes(1);
            expect(downloadedBlobs).toHaveLength(0);
            picker.mockRejectedValueOnce(new DOMException('dismissed', 'AbortError'));
            expect(await exportToCsv([{ a: 1 }], 'disk')).toEqual({ success: true, cancelled: true });
        } finally {
            delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
        }
    });

    it('embeds provenance in HTML and safely escapes report values', async () => {
        const root = document.createElement('div');
        const result = await exportToHtml(
            root,
            '<Town report>',
            [{ Town: '<script>alert(1)</script>', Total: 100 }],
            '<b>summary</b>',
            metadata,
        );

        expect(result).toMatchObject({ success: true });
        const html = await readBlob(downloadedBlobs[0]);
        expect(html).toContain('Export provenance');
        expect(html).toContain('version-current');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('adds export provenance to PNG capture and removes it from the live card afterwards', async () => {
        const root = document.createElement('div');
        root.textContent = 'Card';

        expect(await exportToPng(root, 'Card', { metadata })).toMatchObject({ success: true });

        expect(toPngMock).toHaveBeenCalledTimes(1);
        const capturedRoot = toPngMock.mock.calls[0][0] as HTMLElement;
        expect(capturedRoot.querySelector('[data-analysis-export-metadata]')).toBeNull();
        expect(root.querySelector('[data-analysis-export-metadata]')).toBeNull();
    });

    it('captures every row of a vertically scrollable chart and restores its viewport', async () => {
        const root = document.createElement('div');
        const chartScroll = document.createElement('div');
        chartScroll.className = 'max-h-[540px] overflow-y-auto';
        chartScroll.dataset.exportChartScroll = 'true';
        root.appendChild(chartScroll);
        toPngMock.mockImplementationOnce(async () => {
            expect(chartScroll.style.maxHeight).toBe('none');
            expect(chartScroll.style.overflowY).toBe('visible');
            return 'data:image/png;base64,export';
        });

        expect(await exportToPng(root, 'All Towns')).toMatchObject({ success: true });
        expect(chartScroll.style.maxHeight).toBe('');
        expect(chartScroll.style.overflowY).toBe('');
    });

    it('enforces restricted table content at the HTML and PNG boundaries even when chart nodes remain', async () => {
        const root = document.createElement('div');
        root.innerHTML = '<canvas></canvas><svg data-chart="prohibited"></svg><div data-export-table><table><tbody><tr><td>October -5</td></tr></tbody></table></div>';
        const restricted = { ...metadata, presentation: 'table' as const, returnedRows: 1, totalRows: 2, completeness: 'visible_subset' as const };
        await exportToHtml(root, 'Restricted', [{Month:'October', Amount:-5}], 'Table only.', restricted);
        const html = await readBlob(downloadedBlobs[0]);
        expect(html).toContain('October'); expect(html).toContain('-5'); expect(html).toContain('visible_subset');
        expect(html).not.toContain('<img'); expect(html).not.toContain('<canvas'); expect(html).not.toContain('<svg');
        toPngMock.mockImplementationOnce(async element => {
            expect(element).not.toBe(root); expect(element.querySelector('table')?.textContent).toContain('October -5');
            expect(element.querySelector('canvas, svg')).toBeNull();
            expect((element.querySelector('[data-export-table]') as HTMLElement).style.display).not.toBe('none');
            expect(element.textContent).toContain('visible_subset');
            return 'data:image/png;base64,export';
        });
        expect(await exportToPng(root, 'Restricted', {metadata:restricted})).toEqual({success:true});
        expect(root.querySelector('canvas')).not.toBeNull(); expect(document.querySelector('[data-analysis-export-metadata]')).toBeNull();
    });
});
