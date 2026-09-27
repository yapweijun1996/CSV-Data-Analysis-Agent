import type { ReportIr } from '../../types';
import printFormScript from './vendor/printform.js?raw';
import {
    escapeHtml,
    titleCase,
} from './htmlUtils';
import {
    renderBadge,
    renderReadinessLabel,
    renderTableShell,
} from './htmlRenderers';
import { reportStylesheet } from './reportStyles';
import { assembleReportData, type RenderHtmlReportOptions } from './reportDataAssembly';

export type { RenderHtmlReportOptions };

export const renderHtmlReport = (ir: ReportIr, options?: RenderHtmlReportOptions): string => {
    const data = assembleReportData(ir, options);
    const {
        text,
        documentTitle,
        heroStats,
        activeContents,
        shouldRepeatRowHeader,
        shouldRenderWarningBanner,
        reportBody,
        reportTemplate,
    } = data;

    const embeddedPrintFormScript = printFormScript.replace(/<\/script/gi, '<\\/script');

    return `<!DOCTYPE html>
<html lang="${options?.language === 'Mandarin' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
${reportStylesheet}
  </style>
</head>
<body>
  <div class="viewer-toolbar">
    <div>
      <p class="eyebrow">${escapeHtml(text.viewer)}</p>
      <p class="meta-line">${escapeHtml(documentTitle)}</p>
    </div>
    <div class="toolbar-actions">
      <button type="button" class="toolbar-button" onclick="window.print()">${escapeHtml(text.exportPdf)}</button>
      <button type="button" class="toolbar-button secondary" onclick="window.close()">${escapeHtml(text.close)}</button>
    </div>
  </div>
  <main class="report-shell">
    <div
      class="paper_width printform"
      data-paper-size="A4"
      data-dpi="96"
      data-orientation="portrait"
      data-papersize-width="780"
      data-papersize-height="1080"
      data-repeat-header="n"
      data-repeat-docinfo="n"
      data-repeat-docinfo002="n"
      data-repeat-docinfo003="n"
      data-repeat-docinfo004="n"
      data-repeat-docinfo005="n"
      data-repeat-rowheader="${shouldRepeatRowHeader ? 'y' : 'n'}"
      data-repeat-ptac-rowheader="n"
      data-repeat-footer="n"
      data-repeat-paddt-rowheader="n"
      data-repeat-paddt-docinfo="n"
      data-repeat-paddt-docinfo002="n"
      data-repeat-paddt-docinfo003="n"
      data-repeat-paddt-docinfo004="n"
      data-repeat-paddt-docinfo005="n"
      data-repeat-footer-logo="n"
      data-repeat-footer-pagenum="y"
      data-insert-dummy-row-item-while-format-table="n"
      data-insert-ptac-dummy-row-items="n"
      data-insert-dummy-row-while-format-table="n"
      data-insert-footer-spacer-while-format-table="n"
      data-insert-footer-spacer-with-dummy-row-item-while-format-table="n"
      data-insert-paddt-dummy-row-items="n"
      data-report-template="${escapeHtml(reportTemplate)}"
    >
      ${renderTableShell('pheader', `
        <article class="report-header-card">
          <p class="eyebrow">${escapeHtml(text.preparedBy)}</p>
          <h1>${escapeHtml(documentTitle)}</h1>
          <p>${escapeHtml(ir.summary.executivePosition)}</p>
          <div class="badge-stack">
            ${renderBadge(`${text.readiness}: ${renderReadinessLabel(ir.dataset.readiness)}`, ir.dataset.readiness === 'ready' ? 'good' : ir.dataset.readiness === 'partial' ? 'warning' : 'danger')}
            ${renderBadge(`${text.confidence}: ${titleCase(ir.summary.overallConfidence)}`, ir.summary.overallConfidence === 'high' ? 'good' : ir.summary.overallConfidence === 'medium' ? 'warning' : 'danger')}
            ${renderBadge(`${text.generated}: ${ir.generatedAt.split('T')[0]}`, 'neutral')}
          </div>
          <div class="hero-stats">
            ${heroStats.map(stat => `
            <div class="hero-stat">
              <div class="eyebrow">${escapeHtml(stat.label)}</div>
              <div class="hero-stat-value">${escapeHtml(stat.value)}</div>
            </div>
            `).join('')}
          </div>
        </article>
      `)}

      ${renderTableShell('pdocinfo', `
        <article class="docinfo-card">
          <div>
            <p class="eyebrow">${escapeHtml(text.documentMap)}</p>
            <h2>${escapeHtml(text.contents)}</h2>
          </div>
          <div class="contents-grid">
            ${activeContents.map(item => `<a class="contents-item" href="#${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`).join('')}
          </div>
          ${shouldRenderWarningBanner && options?.manifest ? `
          <div class="caveat-notice">
            <h4>${escapeHtml(text.warningBannerTitle)}</h4>
            <p>${escapeHtml(options.manifest.reportReadinessReason)}</p>
            <p class="meta-line">${escapeHtml(text.excludedCount)}: ${escapeHtml(String(options.manifest.excludedEvidenceCount))}</p>
          </div>
          ` : ''}
        </article>
      `, { id: 'report-contents' })}

      ${reportBody}

      <table cellpadding="0" cellspacing="0" border="0" class="paper_width pfooter_pagenum report-shell-table">
        <colgroup>
          <col class="report-shell-col report-shell-col--gutter" />
          <col class="report-shell-col report-shell-col--content" />
          <col class="report-shell-col report-shell-col--gutter" />
        </colgroup>
        <tr>
          <td class="report-shell-gutter"></td>
          <td class="report-shell-content-cell">
            <div class="page-number-shell">Page <span data-page-number></span> of <span data-page-total></span></div>
          </td>
          <td class="report-shell-gutter"></td>
        </tr>
      </table>
    </div>
  </main>
  <script>${embeddedPrintFormScript}</script>
  <script>
    (function () {
      const runPrintForm = async () => {
        if (!window.PrintForm || typeof window.PrintForm.formatAll !== 'function') {
          return;
        }
        if (document.fonts && document.fonts.ready) {
          try {
            await document.fonts.ready;
          } catch (error) {
            console.error('Report font readiness failed:', error);
          }
        }
        await window.PrintForm.formatAll({ force: true });
        document.body.dataset.printformPagesReady = 'y';
        if (window.location.hash === "#print") {
          window.requestAnimationFrame(() => window.print());
        }
      };

      window.addEventListener('load', () => {
        void runPrintForm();
      }, { once: true });
    })();
  </script>
</body>
</html>`;
};
