import { escapeHtml } from './helpers.js';
import { renderReportPanel } from './reportPanel.js';

/**
 * 构建最终总结区块 HTML，同时可包含報告面板。
 *
 * @param {string|null|undefined} summary
 * @param {object|null} reportPayload
 * @returns {string}
 */
export const renderFinalSummary = (summary, reportPayload = null) => {
  if (!summary && !reportPayload) {
    return '';
  }
  const reportHtml = reportPayload ? renderReportPanel(reportPayload) : '';
  const summaryHtml = summary
    ? `<article class="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4">
        <h2 class="text-lg font-semibold mb-2">AI Summary</h2>
        <p class="text-sm leading-relaxed whitespace-pre-line">${escapeHtml(summary)}</p>
      </article>`
    : '';
  return `${summaryHtml}${reportHtml}`;
};
