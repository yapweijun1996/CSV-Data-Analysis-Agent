import { escapeHtml } from './helpers.js';

/**
 * Render loading state when analysis cards are being generated.
 *
 * @param {import('../types/typedefs.js').AnalysisCardData[]} cards
 * @param {{ progressMessages: Array<{ text: string; type?: string; timestamp?: Date }> }} options
 * @returns {string}
 */
const StagePlanPreview = ({ stagePlanMessages }) => {
  const entries = Array.isArray(stagePlanMessages) ? stagePlanMessages : [];
  if (!entries.length) return '';
  const items = entries
    .map(entry => {
      const checkpoints = Array.isArray(entry.checkpoints)
        ? entry.checkpoints.slice(0, 3).map(escapeHtml).join(' → ')
        : '';
      const status = entry.status ? `<span class="text-xs text-slate-500">${escapeHtml(entry.status)}</span>` : '';
      return `
        <li class="flex flex-col gap-0.5">
          <div class="flex items-center justify-between text-xs text-slate-600">
            <span>${escapeHtml(entry.label)}</span>
            ${status}
          </div>
          ${entry.goal ? `<p class="text-sm text-slate-700">${escapeHtml(entry.goal)}</p>` : ''}
          ${checkpoints ? `<p class="text-xs text-slate-500">${checkpoints}</p>` : ''}
        </li>`;
    })
    .join('');
  return `
    <div class="mt-4">
      <p class="text-xs uppercase tracking-wide text-slate-500">Stage plan</p>
      <ul class="mt-1 space-y-2">${items}</ul>
    </div>`;
};

const renderCardsLoadingState = ({ progressMessages, stagePlanMessages }) => {
  const recentProgress = Array.isArray(progressMessages) ? progressMessages.slice(-5) : [];
  const progressItems = recentProgress
    .map(message => {
      const text = escapeHtml(message?.text || '');
      const isError = message?.type === 'error';
      const indicator = `<span class="${isError ? 'bg-rose-400' : 'bg-blue-400'} h-1.5 w-1.5 rounded-full"></span>`;
      return `<li class="flex items-center gap-2 text-xs ${isError ? 'text-rose-600' : 'text-slate-500'}">
        ${indicator}
        <span class="truncate">${text}</span>
      </li>`;
    })
    .join('');
  const progressHtml = progressItems ? `<ul class="mt-4 space-y-1">${progressItems}</ul>` : '';
  const stagePlanHtml = StagePlanPreview({ stagePlanMessages });

  return `
    <div class="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-4 shadow-sm">
      <div class="h-12 w-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
      <div class="flex-1">
        <h3 class="text-base font-semibold text-slate-900">AI is analyzing the data</h3>
        <p class="text-sm text-slate-500">The system will complete data analysis, chart generation, and summary in sequence. Please wait.</p>
        ${progressHtml}
        ${stagePlanHtml}
      </div>
    </div>
  `;
};

/**
 * Render empty state when no cards exist.
 *
 * @param {boolean} hasCsv
 * @returns {string}
 */
const renderEmptyCardsState = hasCsv => {
  const title = hasCsv ? 'No analysis cards at the moment' : 'Analysis has not started yet';
  const subtitle = hasCsv
    ? 'You can ask the AI to create a new analysis through the conversation on the right, or re-upload data to explore.'
    : 'After uploading the CSV, AI-generated analysis cards and insights will be displayed here.';

  return `
    <div class="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7l9-4 9 4-9 4-9-4z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12l-9 4-9-4" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 17l-9 4-9-4" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(title)}</h3>
      <p class="mt-2 text-sm text-slate-500">${escapeHtml(subtitle)}</p>
    </div>
  `;
};

/**
 * 渲染分析卡片區域（含 loading/empty 狀態）。
 *
 * @param {object} params
 * @param {import('../types/typedefs.js').AnalysisCardData[]} params.cards
 * @param {boolean} params.isBusy
 * @param {boolean} params.hasCsv
 * @param {string} params.cardsHtml
 * @param {Array<{ text: string; type?: string; timestamp?: Date }>} params.progressMessages
 * @returns {string}
 */
export const renderAnalysisSection = ({ isBusy, hasCsv, cardsHtml, progressMessages, stagePlanMessages }) => {
  if (cardsHtml) {
    return `<div class="grid gap-6 grid-cols-1 xl:grid-cols-2">${cardsHtml}</div>`;
  }
  if (isBusy && hasCsv) {
    return renderCardsLoadingState({ progressMessages, stagePlanMessages });
  }
  return renderEmptyCardsState(hasCsv);
};
