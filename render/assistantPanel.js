import { escapeHtml } from './helpers.js';
import { formatMessageMarkdown } from './messageFormatter.js';

const formatTimeLabel = timestamp => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!date || Number.isNaN(date.getTime?.())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const resolveCardContext = (entry, resolveCardReference) => {
  if (typeof resolveCardReference !== 'function') {
    return {
      resolvedCardId: entry.cardId || null,
      resolvedCardTitle: entry.cardTitle || null,
    };
  }
  const reference = resolveCardReference(entry.cardId || null, entry.cardTitle || null) || {};
  return {
    resolvedCardId: reference.cardId || entry.cardId || null,
    resolvedCardTitle: reference.fallbackTitle || entry.cardTitle || null,
  };
};

const renderProgressEntry = (entry, timeLabel) => {
  const colorClass = entry.type === 'error' ? 'text-rose-600' : 'text-slate-500';
  return `
    <div class="flex text-xs ${colorClass}">
      <span class="mr-2 text-slate-400 assistant-log-time">${escapeHtml(timeLabel)}</span>
      <span>${escapeHtml(entry.text || '')}</span>
    </div>`;
};

const renderThinkingEntry = entry => {
  const content = formatMessageMarkdown(entry.text || '');
  return `
    <div class="my-2 p-3 bg-white border border-blue-200 rounded-lg">
      <div class="flex items-center text-blue-700 mb-2">
        <span class="text-lg mr-2">🧠</span>
        <h4 class="font-semibold">AI's Initial Analysis</h4>
      </div>
      <div class="text-sm text-slate-700 whitespace-pre-wrap">${content}</div>
    </div>`;
};

const renderPlanEntry = entry => {
  const content = formatMessageMarkdown(entry.text || '');
  return `
    <div class="my-2 bg-blue-50 border border-blue-200 rounded-lg shadow-sm plan-card">
      <details class="group" open>
        <summary class="plan-card__summary" aria-label="Toggle execution plan">
          <div class="flex items-center">
            <span class="text-lg mr-2">⚙️</span>
            <h4 class="font-semibold whitespace-nowrap">Plan Execution</h4>
          </div>
          <svg class="plan-card__chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.855a.75.75 0 111.08 1.04l-4.24 4.4a.75.75 0 01-1.08 0l-4.24-4.4a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
          </svg>
        </summary>
        <div class="plan-card__content text-sm text-slate-700">
          ${content}
        </div>
      </details>
    </div>`;
};

const renderProactiveInsightEntry = (entry, resolvedCardId, resolvedCardTitle) => {
  const content = formatMessageMarkdown(entry.text || '');
  const cardButton = resolvedCardId
    ? `<button type="button" class="btn btn-secondary text-xs mt-2" data-show-card="${escapeHtml(resolvedCardId)}"${
        resolvedCardTitle ? ` data-show-card-title="${escapeHtml(resolvedCardTitle)}"` : ''
      }>
           → Show Related Card
         </button>`
    : '';
  return `
    <div class="my-2 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
      <div class="flex items-center text-yellow-800 mb-2">
        <span class="text-lg mr-2">💡</span>
        <h4 class="font-semibold">Proactive Insight</h4>
      </div>
      <div class="text-sm text-slate-700 whitespace-pre-wrap">${content}</div>
      ${cardButton}
    </div>`;
};

const renderSystemEntry = (entry, timeLabel) => {
  const content = formatMessageMarkdown(entry.text || '');
  return `
    <div class="flex">
      <div class="rounded-lg px-3 py-2 max-w-xs lg:max-w-md bg-slate-200">
        <div class="text-xs text-slate-500 mb-1">${escapeHtml(timeLabel || 'System')}</div>
        <div class="text-sm text-slate-800 whitespace-pre-wrap">${content}</div>
      </div>
    </div>`;
};

const renderStandardEntry = (entry, timeLabel, resolvedCardId, resolvedCardTitle) => {
  const content = formatMessageMarkdown(entry.text || '');
  const sender = entry.sender;

  if (sender === 'user') {
    return `
      <div class="flex justify-end">
        <div class="bg-blue-600 rounded-lg px-3 py-2 max-w-xs lg:max-w-md">
          <div class="text-sm text-white whitespace-pre-wrap">${content}</div>
        </div>
      </div>`;
  }

  const bubbleClass = entry.isError ? 'bg-red-100' : 'bg-slate-200';
  const textClass = entry.isError ? 'text-red-800' : 'text-slate-800';

  const cardButton =
    resolvedCardId && !entry.isError
      ? `<button type="button" class="btn btn-secondary text-xs mt-2 w-full text-left" data-show-card="${escapeHtml(resolvedCardId)}"${
          resolvedCardTitle ? ` data-show-card-title="${escapeHtml(resolvedCardTitle)}"` : ''
        }>
            → Show Related Card
         </button>`
      : '';
  const quickActions =
    Array.isArray(entry.quickActions) && entry.quickActions.length
      ? entry.quickActions
          .map(action => {
            if (!action || typeof action !== 'object') {
              return '';
            }
            const label =
              typeof action.label === 'string' && action.label.trim().length
                ? escapeHtml(action.label.trim())
                : '';
            const domAction =
              action.domAction && typeof action.domAction === 'object' ? action.domAction : null;
            if (!label || !domAction) {
              return '';
            }
            const payload = escapeHtml(JSON.stringify({ domAction }));
            return `<button type="button" class="assistant-quick-action-btn" data-chat-quick-action="${payload}">${label}</button>`;
          })
          .filter(Boolean)
          .join('')
      : '';
  const quickActionsBlock = quickActions
    ? `<div class="assistant-quick-actions">${quickActions}</div>`
    : '';

  return `
    <div class="flex">
      <div class="rounded-lg px-3 py-2 max-w-xs lg:max-w-md ${bubbleClass}">
        <div class="text-sm ${textClass} whitespace-pre-wrap">${content}</div>
        ${cardButton}
        ${quickActionsBlock}
      </div>
    </div>`;
};

const renderTimelineEntry = (entry, resolveCardReference) => {
  const timeLabel = formatTimeLabel(entry.timestamp);
  const { resolvedCardId, resolvedCardTitle } = resolveCardContext(entry, resolveCardReference);

  if (entry.__kind === 'progress') {
    return renderProgressEntry(entry, timeLabel);
  }
  if (entry.type === 'ai_thinking') {
    return renderThinkingEntry(entry);
  }
  if (entry.type === 'ai_plan_start') {
    return renderPlanEntry(entry);
  }
  if (entry.type === 'ai_proactive_insight') {
    return renderProactiveInsightEntry(entry, resolvedCardId, resolvedCardTitle);
  }
  if (entry.sender === 'system') {
    return renderSystemEntry(entry, timeLabel);
  }
  return renderStandardEntry(entry, timeLabel, resolvedCardId, resolvedCardTitle);
};

/**
 * Render the assistant panel including timeline and chat controls.
 *
 * @param {object} params
 * @param {Array<any>} params.timeline
 * @param {boolean} params.isApiKeySet
 * @param {boolean} params.isBusy
 * @param {boolean} params.isThinking
 * @param {string} params.currentView
 * @param {(cardId: string|null, cardTitle: string|null) => { cardId?: string; fallbackTitle?: string } | null} params.resolveCardReference
 * @returns {string}
 */
export const renderAssistantPanel = ({
  timeline,
  isApiKeySet,
  isBusy,
  isThinking,
  currentView,
  resolveCardReference,
}) => {
  const entries = Array.isArray(timeline) ? timeline : [];
  const isChatDisabled =
    !isApiKeySet || isBusy || isThinking || currentView === 'file_upload';
  const placeholder = !isApiKeySet
    ? 'Set API Key in settings to chat'
    : currentView === 'analysis_dashboard'
    ? 'Ask for a new analysis or data transformation... (Shift+Enter for newline)'
    : 'Upload a file to begin chatting';

  const conversationHtml = entries
    .map(entry => renderTimelineEntry(entry, resolveCardReference))
    .join('');

  const timelineFallback = isBusy
    ? '<p class="text-xs text-slate-400">Processing... The assistant will respond shortly.</p>'
    : '<p class="text-xs text-slate-400">No activity yet. Upload a CSV or start chatting to begin.</p>';
  const inputDisabledClass = isChatDisabled ? ' opacity-50 cursor-not-allowed' : '';

  return `
    <div class="flex flex-col h-full bg-slate-100 rounded-lg md:rounded-none">
      <div class="p-4 border-b border-slate-200 flex justify-between items-center">
        <h2 class="text-xl font-semibold text-slate-900">Assistant</h2>
        <div class="flex items-center gap-2">
          <button class="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors" title="Open Memory Panel" aria-label="Open Memory Panel" data-open-memory>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="5" y="7" width="14" height="10" rx="2" />
              <rect x="9" y="11" width="6" height="2" fill="currentColor" stroke="none" />
              <path stroke-linecap="round" d="M8 4v2M12 4v2M16 4v2M8 18v2M12 18v2M16 18v2" />
            </svg>
          </button>
          <button class="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors" title="Open Settings" aria-label="Open Settings" data-toggle-settings>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          <button class="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors" title="Hide Assistant Panel" aria-label="Hide Assistant Panel" data-toggle-aside="hide">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto space-y-4 p-4" data-conversation-log>
        ${conversationHtml || timelineFallback}
        ${isBusy ? `<div class="flex items-center text-blue-600"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</div>` : ''}
      </div>
      <div class="p-4 border-t border-slate-200 bg-white">
        <form id="chat-form">
          <textarea id="chat-input" data-focus-key="chat-input" class="w-full bg-white border border-slate-300 rounded-md py-2 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500${inputDisabledClass}" rows="3" placeholder="${escapeHtml(placeholder)}" ${isChatDisabled ? 'disabled' : ''} style="resize:none;"></textarea>
        </form>
        <p class="text-xs text-slate-400 mt-2">${
          currentView === 'analysis_dashboard'
            ? 'e.g., "Sum of sales by region", or "Remove rows for USA"'
            : ''
        }</p>
      </div>
    </div>
  `;
};
