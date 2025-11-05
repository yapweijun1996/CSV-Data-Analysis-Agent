import { escapeHtml } from './helpers.js';

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
      <span class="mr-2 text-slate-400">${escapeHtml(timeLabel)}</span>
      <span>${escapeHtml(entry.text || '')}</span>
    </div>`;
};

const renderThinkingEntry = entry => `
  <div class="my-2 p-3 bg-white border border-blue-200 rounded-lg">
    <div class="flex items-center text-blue-700 mb-2">
      <span class="text-lg mr-2">🧠</span>
      <h4 class="font-semibold">AI's Initial Analysis</h4>
    </div>
    <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(entry.text || '')}</p>
  </div>`;

const renderPlanEntry = entry => `
  <div class="my-2 p-3 bg-slate-100 border border-slate-200 rounded-lg shadow-sm">
    <div class="flex items-center text-slate-700 mb-2">
      <span class="text-lg mr-2">⚙️</span>
      <h4 class="font-semibold">Plan Execution</h4>
    </div>
    <p class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(entry.text || '')}</p>
  </div>`;

const renderProactiveInsightEntry = (entry, resolvedCardId, resolvedCardTitle) => {
  const cardButton = resolvedCardId
    ? `<button type="button" class="mt-2 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-md hover:bg-amber-200 transition-colors font-medium" data-show-card="${escapeHtml(resolvedCardId)}"${
        resolvedCardTitle ? ` data-show-card-title="${escapeHtml(resolvedCardTitle)}"` : ''
      }>
           → Show Related Card
         </button>`
    : '';
  return `
    <div class="my-2 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
      <div class="flex items-center text-amber-700 mb-2">
        <span class="text-lg mr-2">💡</span>
        <h4 class="font-semibold">Proactive Insight</h4>
      </div>
      <p class="text-sm text-amber-800 whitespace-pre-wrap">${escapeHtml(entry.text || '')}</p>
      ${cardButton}
    </div>`;
};

const renderSystemEntry = (entry, timeLabel) => {
  const badge = timeLabel
    ? `<span class="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-semibold">${escapeHtml(timeLabel)}</span>`
    : '';
  return `
    <div class="flex justify-start w-full">
      <div class="flex items-start gap-2 max-w-full text-left">
        <span class="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 7a1 1 0 112 0v1a1 1 0 01-2 0V7zm2 3a1 1 0 10-2 0v4a1 1 0 102 0v-4z" clip-rule="evenodd" />
          </svg>
        </span>
        <div class="flex flex-col items-start gap-1 min-w-0">
          <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-amber-500">
            ${badge}
            <span class="px-1.5 py-0.5 rounded-full bg-amber-50 font-semibold text-amber-600">System</span>
          </div>
          <div class="inline-block max-w-[28rem] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-sm">
            ${escapeHtml(entry.text || '')}
          </div>
        </div>
      </div>
    </div>`;
};

const renderStandardEntry = (entry, timeLabel, resolvedCardId, resolvedCardTitle) => {
  const sender = entry.sender;
  const alignmentClass = sender === 'user' ? 'justify-end' : 'justify-start';
  const orientationClass = sender === 'user' ? 'items-end text-right' : 'items-start text-left';

  let bubbleClass;
  if (entry.isError) {
    bubbleClass = 'bg-rose-100 text-rose-800 border border-rose-200';
  } else if (sender === 'user') {
    bubbleClass = 'bg-blue-600 text-white shadow-sm';
  } else {
    bubbleClass = 'bg-slate-200 text-slate-800';
  }

  const metaParts = [];
  if (timeLabel) metaParts.push(timeLabel);
  if (resolvedCardId) metaParts.push(`Card ${resolvedCardId}`);
  const metaLine = metaParts.filter(Boolean).map(part => escapeHtml(part)).join(' • ');

  const senderBadge =
    sender === 'user'
      ? '<span class="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold text-[10px] uppercase tracking-wide">You</span>'
      : sender === 'ai'
      ? '<span class="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold text-[10px] uppercase tracking-wide">AI</span>'
      : '';

  const cardButton =
    resolvedCardId && !entry.isError
      ? `<button type="button" class="mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md hover:bg-blue-200 transition-colors w-full text-left font-medium" data-show-card="${escapeHtml(resolvedCardId)}"${
          resolvedCardTitle ? ` data-show-card-title="${escapeHtml(resolvedCardTitle)}"` : ''
        }>
            → Show Related Card
         </button>`
      : '';

  return `
    <div class="flex ${alignmentClass} w-full">
      <div class="flex flex-col ${orientationClass} max-w-full gap-1">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
          ${senderBadge}
          ${metaLine ? `<span>${metaLine}</span>` : ''}
        </div>
        <div class="inline-block max-w-[28rem] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${bubbleClass}">
          ${escapeHtml(entry.text || '')}
          ${cardButton}
        </div>
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
    ? 'Ask for a new analysis or data transformation...'
    : 'Upload a file to begin chatting';

  const conversationHtml = entries
    .map(entry => renderTimelineEntry(entry, resolveCardReference))
    .join('');

  const timelineFallback = isBusy
    ? '<p class="text-xs text-slate-400">Processing... The assistant will respond shortly.</p>'
    : '<p class="text-xs text-slate-400">No activity yet. Upload a CSV or start chatting to begin.</p>';

  return `
    <div class="flex flex-col h-full">
      <div class="p-4 border-b border-slate-200 flex justify-between items-center">
        <h2 class="text-xl font-semibold text-slate-900">Assistant</h2>
        <div class="flex items-center gap-2">
          <button class="p-1 text-slate-500 rounded-full hover:bg-slate-200 hover:text-slate-800 transition-colors" title="Open Memory Panel" aria-label="Open Memory Panel" data-open-memory>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 2-1-2-1.257-.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 1 1 0 000-2zM6 8a1 1 0 112 0 1 1 0 01-2 0zm2 3a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" />
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
      <div class="flex-1 overflow-y-auto space-y-4 p-4 bg-slate-100" data-conversation-log>
        ${conversationHtml || timelineFallback}
        ${isBusy ? `<div class="flex items-center text-blue-600"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</div>` : ''}
      </div>
      <div class="p-4 border-t border-slate-200 bg-white">
        <form id="chat-form" class="flex gap-2">
          <input type="text" id="chat-input" data-focus-key="chat-input" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="${escapeHtml(placeholder)}" ${isChatDisabled ? 'disabled' : ''} />
          <button type="submit" class="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg ${
            !isChatDisabled ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'
          }" ${isChatDisabled ? 'disabled' : ''}>Send</button>
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
