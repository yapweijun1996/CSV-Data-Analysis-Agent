/* eslint-disable no-undef */

const ensureGlobal = (name, fallback = null) => {
  if (typeof window !== 'undefined' && window[name]) {
    return window[name];
  }
  return fallback;
};

const scriptPromises = new Map();

const HTML_TO_IMAGE_URL = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

const Papa = ensureGlobal('Papa');

const loadScriptOnce = url => {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Cannot load scripts outside of the browser environment.'));
  }
  if (scriptPromises.has(url)) {
    return scriptPromises.get(url);
  }
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = event => reject(event instanceof ErrorEvent ? event.error || event : event);
    document.head.appendChild(script);
  });
  scriptPromises.set(url, promise);
  return promise;
};

let htmlToImagePromise = null;
const getHtmlToImage = async () => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (window.htmlToImage) {
    return window.htmlToImage;
  }
  if (!htmlToImagePromise) {
    htmlToImagePromise = loadScriptOnce(HTML_TO_IMAGE_URL)
      .then(() => window.htmlToImage || null)
      .catch(error => {
        htmlToImagePromise = null;
        throw error;
      });
  }
  return htmlToImagePromise;
};

let html2canvasPromise = null;
const getHtml2Canvas = async () => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (window.html2canvas) {
    return window.html2canvas;
  }
  if (!html2canvasPromise) {
    html2canvasPromise = loadScriptOnce(HTML2CANVAS_URL)
      .then(() => window.html2canvas || null)
      .catch(error => {
        html2canvasPromise = null;
        throw error;
      });
  }
  return html2canvasPromise;
};

const makeSafeFilename = (title, extension) => {
  const base = String(title || 'analysis-card')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base || 'analysis-card'}.${extension}`;
};

const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
};

const handleExportError = error => {
  if (!error) {
    return new Error('Unknown error occurred while exporting the card.');
  }
  if (error instanceof Error) {
    return error;
  }
  if (typeof window !== 'undefined' && error instanceof window.Event) {
    const reason = error?.target?.src
      ? `Failed to load generated image (${error.target.src.slice(0, 64)}...)`
      : 'Rendered image could not be loaded (possible cross-origin or styling issue).';
    return new Error(reason);
  }
  return new Error(typeof error === 'string' ? error : 'An unexpected export error occurred.');
};

const exportWithHtml2Canvas = async (element, title) => {
  const html2canvas = await getHtml2Canvas();
  if (!html2canvas) {
    throw new Error('PNG export fallback is unavailable because html2canvas failed to load.');
  }

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.min((window.devicePixelRatio || 1) * 1.5, 3),
    useCORS: true,
    logging: false,
    removeContainer: true,
    scrollX: 0,
    scrollY: -window.scrollY || 0,
    onclone: clonedDocument => {
      clonedDocument.querySelectorAll('[data-export-menu]').forEach(menu => {
        menu.classList.add('hidden');
      });
      clonedDocument.querySelectorAll('[data-export-ignore]').forEach(node => {
        node.remove();
      });
    },
  });
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  downloadDataUrl(dataUrl, makeSafeFilename(title, 'png'));
};

export const exportToPng = async (element, title) => {
  if (!element) {
    throw new Error('PNG export requires a valid card element.');
  }

  const options = {
    backgroundColor: '#ffffff',
    pixelRatio: Math.min(window.devicePixelRatio ? window.devicePixelRatio * 2 : 2, 4),
    cacheBust: true,
    useCORS: true,
    style: {
      transform: 'scale(1)',
      transformOrigin: 'top left',
    },
    filter: node => {
      if (!(node instanceof Element)) return true;
      if (node.hasAttribute('data-export-ignore')) {
        return false;
      }
      return true;
    },
  };

  let primaryError = null;
  const htmlToImage = await getHtmlToImage().catch(error => {
    primaryError = handleExportError(error);
    return null;
  });

  if (htmlToImage) {
    try {
      const canvas = await htmlToImage.toCanvas(element, options);
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      downloadDataUrl(dataUrl, makeSafeFilename(title, 'png'));
      return;
    } catch (error) {
      primaryError = handleExportError(error);
      console.warn('html-to-image PNG export failed; attempting html2canvas fallback.', primaryError);
    }
  } else {
    primaryError = new Error(
      'html-to-image library is unavailable; attempting html2canvas fallback.'
    );
  }

  try {
    await exportWithHtml2Canvas(element, title);
  } catch (fallbackError) {
    const normalisedFallbackError = handleExportError(fallbackError);
    if (primaryError) {
      throw new Error(`${primaryError.message} (fallback error: ${normalisedFallbackError.message})`);
    }
    throw normalisedFallbackError;
  }
};

export const exportToCsv = (rows, title) => {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('No data available for CSV export.');
  }
  if (!Papa) {
    throw new Error('PapaParse is unavailable for CSV export.');
  }
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', makeSafeFilename(title, 'csv'));
  link.click();
};

export const exportToHtml = async (element, title, rows, summaryText) => {
  if (!element) {
    throw new Error('HTML export requires a rendered card element.');
  }
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('No data available for HTML export.');
  }

  const chartCanvas = element.querySelector('canvas');
  if (!chartCanvas) {
    throw new Error('Chart canvas not found for export.');
  }

  const chartImage = chartCanvas.toDataURL('image/png');
  const headers = Object.keys(rows[0] || {});
  const dataTableHtml = `
    <table border="1" style="border-collapse:collapse;width:100%;font-family:sans-serif;color:#333;">
      <thead>
        <tr style="background-color:#f2f2f2;">
          ${headers.map(header => `<th style="padding:8px;">${header}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `<tr>${headers
              .map(header => `<td style="padding:8px;">${row[header] ?? ''}</td>`)
              .join('')}</tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  const safeTitle = String(title || 'analysis-card').trim();
  const normalisedTitle = makeSafeFilename(safeTitle, 'html').replace(/\.html$/i, '');
  const summaryHtml = String(summaryText || '')
    .replace(/\n/g, '<br>')
    .replace(/---/g, '<hr>');

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: sans-serif; line-height: 1.6; padding: 24px; color: #111827; }
      h1, h2 { margin-bottom: 12px; }
      .card { border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 24px; background: #ffffff; }
      img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; }
      table { margin-top: 12px; }
    </style>
  </head>
  <body>
    <h1>Analysis Report: ${safeTitle}</h1>
    <div class="card">
      <h2>Chart</h2>
      <img src="${chartImage}" alt="Chart for ${safeTitle}" />
    </div>
    <div class="card">
      <h2>AI Summary</h2>
      <p>${summaryHtml}</p>
    </div>
    <div class="card">
      <h2>Data</h2>
      ${dataTableHtml}
    </div>
    <p style="font-size:0.8rem;color:#6b7280;">Generated by CSV Data Analysis Agent on ${new Date().toLocaleString()}</p>
  </body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `Report_${normalisedTitle}.html`);
  link.click();
};
