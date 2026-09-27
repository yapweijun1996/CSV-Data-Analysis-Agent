import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    exportDatasetToCsv,
    exportToCsv,
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
        expect(exportToCsv([{ Town: 'WOODLANDS', Total: 100 }], 'Town total', metadata))
            .toEqual({ success: true });

        const csv = await readBlob(downloadedBlobs[0]);
        expect(csv).toContain('_export_scope');
        expect(csv).toContain('Top 10 · Town = WOODLANDS');
        expect(csv).toContain('verified');
        expect(csv).toContain('version-current');
        expect(csv).toContain('card-1');
        expect(clickedDownloads).toEqual(['Town_total.csv']);
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('downloads the complete prepared dataset without adding card metadata columns', async () => {
        expect(exportDatasetToCsv(
            [{ Row: 1 }, { Row: 2 }, { Row: 3 }],
            'cleaned_source.csv',
        )).toEqual({ success: true });

        const csv = await readBlob(downloadedBlobs[0]);
        expect(csv).toContain('Row');
        expect(csv).toContain('1');
        expect(csv).toContain('3');
        expect(csv).not.toContain('_export_scope');
        expect(clickedDownloads).toEqual(['cleaned_source.csv']);
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

        expect(result).toEqual({ success: true });
        const html = await readBlob(downloadedBlobs[0]);
        expect(html).toContain('Export provenance');
        expect(html).toContain('version-current');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('adds export provenance to PNG capture and removes it from the live card afterwards', async () => {
        const root = document.createElement('div');
        root.textContent = 'Card';

        expect(await exportToPng(root, 'Card', { metadata })).toEqual({ success: true });

        expect(toPngMock).toHaveBeenCalledTimes(1);
        const capturedRoot = toPngMock.mock.calls[0][0] as HTMLElement;
        expect(capturedRoot.querySelector('[data-analysis-export-metadata]')).toBeNull();
        expect(root.querySelector('[data-analysis-export-metadata]')).toBeNull();
    });
});
