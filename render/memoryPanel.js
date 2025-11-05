import { escapeHtml } from './helpers.js';

const renderDocumentsList = ({ documents, highlightedId }) => {
  if (!Array.isArray(documents) || !documents.length) {
    return '<li class="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">No memories stored yet. Interact with the assistant to build its long-term context.</li>';
  }

  return documents
    .map(doc => {
      const safeId = escapeHtml(doc?.id || '');
      const fullText = typeof doc?.text === 'string' ? doc.text : '';
      const snippet = fullText.slice(0, 280);
      const displayText = snippet.length < fullText.length ? `${snippet}…` : snippet;
      const metadata = doc?.metadata || {};
      const datasetLabel = metadata.datasetId ? `Dataset: ${metadata.datasetId}` : 'Dataset: default';
      const intentLabel = metadata.intent ? `Intent: ${metadata.intent}` : '';
      const kindLabel = metadata.kind ? metadata.kind : 'note';
      const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : null;
      const createdLabel =
        createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString() : '';
      const isHighlighted = highlightedId && doc?.id === highlightedId;
      const cardId = metadata.metadata?.cardId || metadata.cardId;
      const highlightClasses = isHighlighted
        ? 'border-blue-400 ring-2 ring-blue-300 bg-blue-50'
        : 'border-slate-200 bg-white';

      const embeddingLabel =
        doc?.embedding?.type === 'transformer' && Array.isArray(doc.embedding.values)
          ? `${doc.embedding.values.length} dims (transformer)`
          : doc?.embedding?.type === 'bow' && doc.embedding.weights
          ? `${Object.keys(doc.embedding.weights).length} dims (lightweight)`
          : 'n/a';

      return `
        <li class="border ${highlightClasses} rounded-lg p-4 shadow-sm transition-colors duration-200" data-memory-doc="${safeId}">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <span class="px-2 py-0.5 bg-slate-100 rounded-md">${escapeHtml(kindLabel)}</span>
                ${intentLabel ? `<span class="px-2 py-0.5 bg-slate-100 rounded-md">${escapeHtml(intentLabel)}</span>` : ''}
                ${cardId ? `<span class="px-2 py-0.5 bg-slate-100 rounded-md">Card: ${escapeHtml(cardId)}</span>` : ''}
                ${isHighlighted ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-semibold">Highlighted</span>' : ''}
              </div>
              <p class="mt-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">${escapeHtml(displayText)}</p>
              <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>${escapeHtml(datasetLabel)}</span>
                ${createdLabel ? `<span>Saved: ${escapeHtml(createdLabel)}</span>` : ''}
                <span>Embedding: ${escapeHtml(embeddingLabel)}</span>
              </div>
            </div>
            <button class="text-rose-500 hover:text-rose-700" type="button" title="Delete memory entry" aria-label="Delete memory entry" data-memory-delete="${safeId}">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </li>
      `;
    })
    .join('');
};

const renderResultsList = ({ results, query, isSearching }) => {
  if (Array.isArray(results) && results.length) {
    return `<ul class="space-y-2">
      ${results
        .map(result => {
          const safeId = escapeHtml(result?.id || result?.text || '');
          const score =
            typeof result?.score === 'number' ? (result.score * 100).toFixed(1) : 'n/a';
          const preview =
            typeof result?.text === 'string'
              ? result.text.slice(0, 120).replace(/\s+/g, ' ')
              : '';
          return `<li>
            <button type="button" class="w-full text-left px-3 py-2 rounded-md border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors" data-memory-search-result="${safeId}">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span>Score: ${score}</span>
                <span>ID: ${escapeHtml(result?.id || 'unknown')}</span>
              </div>
              <p class="mt-1 text-sm text-slate-700">${escapeHtml(preview)}</p>
            </button>
          </li>`;
        })
        .join('')}
    </ul>`;
  }

  if (typeof query === 'string' && query.trim()) {
    const message = isSearching ? 'Searching memories…' : 'No memories match that search query yet.';
    return `<p class="text-sm text-slate-500 ${isSearching ? 'italic' : ''}">${escapeHtml(message)}</p>`;
  }

  return '<p class="text-sm text-slate-500">Use search to find relevant memories. Results appear here.</p>';
};

const getUsagePercentage = (memoryUsage, capacityKb) => {
  if (!Number.isFinite(memoryUsage) || memoryUsage <= 0) return 0;
  if (!Number.isFinite(capacityKb) || capacityKb <= 0) return 0;
  return Math.min((memoryUsage / capacityKb) * 100, 100);
};

/**
 * 渲染記憶面板。
 *
 * @param {object} params
 * @param {Array<any>} params.documents
 * @param {string} params.query
 * @param {Array<any>} params.results
 * @param {boolean} params.isSearching
 * @param {string|null} params.highlightedId
 * @param {number} params.memoryUsage
 * @param {number} params.capacityKb
 * @param {string} params.modelStatus
 * @returns {string}
 */
export const renderMemoryPanel = ({
  documents,
  query,
  results,
  isSearching,
  highlightedId,
  memoryUsage,
  capacityKb,
  modelStatus,
}) => {
  const safeDocuments = Array.isArray(documents) ? documents : [];
  const usage = Number.isFinite(memoryUsage) ? Math.max(memoryUsage, 0) : 0;
  const usagePercentage = getUsagePercentage(usage, capacityKb);
  const docsLabel = `${safeDocuments.length} item${safeDocuments.length === 1 ? '' : 's'}`;
  const capacityLabel = Number.isFinite(capacityKb) && capacityKb > 0 ? capacityKb / 1024 : 0;
  const usagePercentLabel = Number.isFinite(usagePercentage) ? usagePercentage.toFixed(1) : '0.0';

  const documentsHtml = renderDocumentsList({ documents: safeDocuments, highlightedId });
  const resultsHtml = renderResultsList({ results, query, isSearching });

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6" data-memory-overlay>
      <div class="relative w-full max-w-5xl max-h-[90vh] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col" data-memory-panel>
        <header class="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
          <div>
            <div class="flex items-center gap-3">
              <span class="text-3xl">🧠</span>
              <div>
                <h2 class="text-2xl font-semibold text-slate-900">AI Long-Term Memory</h2>
                <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>${escapeHtml(docsLabel)}</span>
                  <span>Usage ~${usage.toFixed(2)} KB</span>
                  <span>${escapeHtml(modelStatus || '')}</span>
                </div>
              </div>
            </div>
            <div class="mt-3">
              <div class="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div class="h-full bg-blue-500" style="width:${usagePercentage}%"></div>
              </div>
              <p class="mt-1 text-xs text-slate-400">${usagePercentLabel}% of visual capacity (soft limit ${capacityLabel} MB)</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-100" type="button" data-memory-refresh>Refresh</button>
            <button class="px-3 py-2 text-sm border border-rose-300 text-rose-600 rounded-md hover:bg-rose-50" type="button" data-memory-clear-all>Clear All</button>
            <button class="p-2 text-slate-500 hover:text-slate-700 rounded-md" type="button" aria-label="Close memory panel" data-memory-close>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-0 flex-1 overflow-hidden">
          <div class="lg:col-span-2 flex flex-col border-r border-slate-200">
            <div class="px-6 py-4 border-b border-slate-200">
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <span class="absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
                  </span>
                  <input type="text" class="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Search across saved memories..." value="${escapeHtml(query || '')}" data-memory-search-input />
                </div>
                <button type="button" class="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 ${isSearching ? 'opacity-70' : ''}" data-memory-search ${isSearching ? 'disabled' : ''}>
                  ${isSearching ? 'Searching…' : 'Search'}
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-4">
              <ul class="space-y-3">${documentsHtml}</ul>
            </div>
          </div>
          <aside class="flex flex-col bg-slate-50">
            <div class="px-5 py-4 border-b border-slate-200">
              <h3 class="text-sm font-semibold text-slate-900">Search Results</h3>
              <p class="text-xs text-slate-500 mt-1">Click a result to highlight the associated memory entry.</p>
            </div>
            <div class="flex-1 overflow-y-auto px-5 py-4">
              ${resultsHtml}
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;
};
