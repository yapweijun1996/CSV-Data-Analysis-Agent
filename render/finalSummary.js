import { escapeHtml } from './helpers.js';

/**
 * 构建最终总结区块 HTML。
 *
 * @param {string|null|undefined} summary
 * @returns {string}
 */
export const renderFinalSummary = summary => {
  if (!summary) {
    return '';
  }

  return `<article class="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4">
    <h2 class="text-lg font-semibold mb-2">AI Summary</h2>
    <p class="text-sm leading-relaxed whitespace-pre-line">${escapeHtml(summary)}</p>
  </article>`;
};
