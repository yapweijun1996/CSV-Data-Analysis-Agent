import { CsvRow } from '../types';
import { toPng } from 'html-to-image';
import * as Papa from 'papaparse';

// --- Export theme constants ---

const EXPORT_THEME = {
  bgWhite: '#ffffff',
  bgHeader: '#f2f2f2',
  textBody: '#333',
  textHeading: '#111827',
  textFooter: '#888',
  border: '#ddd',
  fontFamily: 'sans-serif',
  lineHeight: '1.6',
  cellPadding: '8px',
  cardPadding: '20px',
  cardRadius: '8px',
  bodyPadding: '20px',
} as const;

/**
 * Temporarily swap all <canvas> elements inside `root` with <img> snapshots
 * so that html-to-image can serialize them reliably via foreignObject.
 * Returns a restore function that undoes the swap.
 */
const swapCanvasesToImages = (root: HTMLElement): (() => void) => {
  const entries: { canvas: HTMLCanvasElement; img: HTMLImageElement }[] = [];
  root.querySelectorAll('canvas').forEach(canvas => {
    try {
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      // Match the canvas display size so the layout doesn't shift.
      const rect = canvas.getBoundingClientRect();
      img.style.width = `${rect.width}px`;
      img.style.height = `${rect.height}px`;
      img.style.display = 'block';
      canvas.parentNode?.insertBefore(img, canvas);
      canvas.style.display = 'none';
      entries.push({ canvas, img });
    } catch {
      // Tainted canvas or other error — skip silently.
    }
  });
  return () => {
    entries.forEach(({ canvas, img }) => {
      canvas.style.display = '';
      img.remove();
    });
  };
};

/**
 * Hide all elements marked with the given data attribute inside `root`.
 * Returns a restore function.
 */
const hideExportExcluded = (root: HTMLElement, attr = 'data-export-exclude'): (() => void) => {
  const hidden: { el: HTMLElement; prev: string }[] = [];
  root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach(el => {
    hidden.push({ el, prev: el.style.display });
    el.style.display = 'none';
  });
  return () => {
    hidden.forEach(({ el, prev }) => {
      el.style.display = prev;
    });
  };
};

export interface ExportResult {
  success: boolean;
  error?: string;
}

export interface AnalysisExportMetadata {
  cardId: string;
  scope: string;
  trustStatus: string;
  datasetVersion: string;
}

export interface ExportToPngOptions {
  /** When true, data tables are included in the PNG. Default: false (chart-only). */
  includeTable?: boolean;
  metadata?: AnalysisExportMetadata;
}

const safeFileStem = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'analysis_export';
};

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const triggerBlobDownload = (blob: Blob, fileName: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', fileName);
  link.click();
  URL.revokeObjectURL(objectUrl);
};

const appendExportMetadata = (
  root: HTMLElement,
  metadata: AnalysisExportMetadata | undefined,
): (() => void) => {
  if (!metadata) return () => undefined;

  const footer = document.createElement('div');
  footer.setAttribute('data-analysis-export-metadata', 'true');
  footer.style.cssText = [
    'margin-top:12px',
    'padding:8px 12px',
    `border:1px solid ${EXPORT_THEME.border}`,
    'border-radius:6px',
    'font-size:11px',
    `color:${EXPORT_THEME.textBody}`,
    `background:${EXPORT_THEME.bgHeader}`,
  ].join(';');
  footer.textContent = `Scope: ${metadata.scope} · Trust: ${metadata.trustStatus} · Dataset: ${metadata.datasetVersion} · Card: ${metadata.cardId}`;
  root.appendChild(footer);
  return () => footer.remove();
};

const withExportMetadataColumns = (
  data: CsvRow[],
  metadata: AnalysisExportMetadata | undefined,
): CsvRow[] => {
  if (!metadata) return data;
  const rows = data.length > 0 ? data : [{}];
  return rows.map(row => ({
    ...row,
    _export_scope: metadata.scope,
    _export_trust: metadata.trustStatus,
    _dataset_version: metadata.datasetVersion,
    _source_card_id: metadata.cardId,
  }));
};

/**
 * When including the data table in PNG export, temporarily remove
 * max-height / overflow constraints so the full table is visible.
 */
const expandOverflowContainers = (root: HTMLElement, selector: string): (() => void) => {
  const restored: { el: HTMLElement; maxHeight: string; overflow: string; overflowY: string }[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach(el => {
    restored.push({
      el,
      maxHeight: el.style.maxHeight,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY,
    });
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
    el.style.overflowY = 'visible';
  });
  return () => {
    restored.forEach(({ el, maxHeight, overflow, overflowY }) => {
      el.style.maxHeight = maxHeight;
      el.style.overflow = overflow;
      el.style.overflowY = overflowY;
    });
  };
};

export const exportToPng = async (element: HTMLElement, title: string, options?: ExportToPngOptions): Promise<ExportResult> => {
  const { includeTable = false, metadata } = options ?? {};
  let restoreCanvases: (() => void) | null = null;
  let restoreExcluded: (() => void) | null = null;
  let restoreTableContent: (() => void) | null = null;
  let restoreOverflow: (() => void) | null = null;
  let restoreChartOverflow: (() => void) | null = null;
  let restoreMetadata: (() => void) | null = null;
  try {
    // 1. Hide interactive UI controls that should not appear in the screenshot
    restoreExcluded = hideExportExcluded(element);
    restoreChartOverflow = expandOverflowContainers(element, '[data-export-chart-scroll]');
    // 2. Optionally hide data-table content when exporting chart-only
    if (!includeTable) {
      restoreTableContent = hideExportExcluded(element, 'data-export-table');
    } else {
      // When including table, expand overflow so full table is captured
      restoreOverflow = expandOverflowContainers(element, '[data-export-table] [class*="max-h-"], [data-export-table][class*="max-h-"]');
    }
    // 3. Replace <canvas> with <img> so html-to-image captures chart content
    restoreCanvases = swapCanvasesToImages(element);
    // 4. Add the same scope/trust/version footer used by other card exports.
    restoreMetadata = appendExportMetadata(element, metadata);

    const dataUrl = await toPng(element, {
      backgroundColor: EXPORT_THEME.bgWhite,
      pixelRatio: 2,
    });
    const link = document.createElement('a');
    link.download = `${safeFileStem(title)}.png`;
    link.href = dataUrl;
    link.click();
    return { success: true };
  } catch (error) {
    console.error('Error exporting to PNG:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown export error' };
  } finally {
    // Always restore DOM regardless of success/failure
    restoreMetadata?.();
    restoreCanvases?.();
    restoreOverflow?.();
    restoreChartOverflow?.();
    restoreTableContent?.();
    restoreExcluded?.();
  }
};

export const exportToCsv = (
  data: CsvRow[],
  title: string,
  metadata?: AnalysisExportMetadata,
): ExportResult => {
  try {
    const csv = Papa.unparse(withExportMetadataColumns(data, metadata));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `${safeFileStem(title)}.csv`);
    return { success: true };
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown export error' };
  }
};

export const exportDatasetToCsv = (data: CsvRow[], fileName: string): ExportResult => {
  try {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `${safeFileStem(fileName.replace(/\.csv$/i, ''))}.csv`);
    return { success: true };
  } catch (error) {
    console.error('Error exporting dataset to CSV:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown export error' };
  }
};

export const exportToHtml = async (
  element: HTMLElement,
  title: string,
  data: CsvRow[],
  summary: string,
  metadata?: AnalysisExportMetadata,
): Promise<ExportResult> => {
   try {
    // Gracefully handle cards without a chart canvas (e.g. table-first cards)
    let chartSectionHtml = '';
    const chartCanvas = element.querySelector('canvas');
    if (chartCanvas) {
      try {
        const chartImage = chartCanvas.toDataURL('image/png');
        chartSectionHtml = `
          <div class="card">
            <h2>Chart</h2>
            <img src="${chartImage}" alt="Chart for ${escapeHtml(title)}" style="max-width: 100%; border: 1px solid ${EXPORT_THEME.border}; border-radius: 4px;">
          </div>`;
      } catch {
        // Tainted canvas — skip chart image silently
      }
    }

    const dataTableHtml = data.length > 0 ? `
      <table border="1" style="border-collapse: collapse; width: 100%; font-family: ${EXPORT_THEME.fontFamily}; color: ${EXPORT_THEME.textBody};">
        <thead>
          <tr style="background-color: ${EXPORT_THEME.bgHeader};">
            ${Object.keys(data[0]).map(key => `<th style="padding: ${EXPORT_THEME.cellPadding};">${escapeHtml(key)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>
              ${Object.values(row).map(val => `<td style="padding: ${EXPORT_THEME.cellPadding};">${escapeHtml(val)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No data available.</p>';
    const summaryHtml = escapeHtml(summary).replace(/\n/g, '<br>').replace('---', '<hr>');
    const metadataHtml = metadata ? `
      <div class="card">
        <h2>Export provenance</h2>
        <dl>
          <dt>Scope</dt><dd>${escapeHtml(metadata.scope)}</dd>
          <dt>Trust</dt><dd>${escapeHtml(metadata.trustStatus)}</dd>
          <dt>Dataset version</dt><dd>${escapeHtml(metadata.datasetVersion)}</dd>
          <dt>Source card</dt><dd>${escapeHtml(metadata.cardId)}</dd>
        </dl>
      </div>
    ` : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${escapeHtml(title)}</title>
          <style> body { font-family: ${EXPORT_THEME.fontFamily}; line-height: ${EXPORT_THEME.lineHeight}; padding: ${EXPORT_THEME.bodyPadding}; } h1, h2 { color: ${EXPORT_THEME.textHeading}; } .card { border: 1px solid ${EXPORT_THEME.border}; padding: ${EXPORT_THEME.cardPadding}; border-radius: ${EXPORT_THEME.cardRadius}; margin-bottom: 20px; } </style>
        </head>
        <body>
          <h1>Analysis Report: ${escapeHtml(title)}</h1>
          ${metadataHtml}
          ${chartSectionHtml}
          <div class="card">
            <h2>AI Summary</h2>
            <p>${summaryHtml}</p>
          </div>
          <div class="card">
            <h2>Data</h2>
            ${dataTableHtml}
          </div>
          <p style="font-size: 0.8em; color: ${EXPORT_THEME.textFooter};">Generated by CSV Data Analysis Agent on ${new Date().toLocaleString()}</p>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    triggerBlobDownload(blob, `Report_${safeFileStem(title)}.html`);
    return { success: true };
  } catch (error) {
    console.error('Error exporting to HTML:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown export error' };
  }
};
