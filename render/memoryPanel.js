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
      <div class="relative w-full max-w-5xl max-h-[90vh] bg-white border border-slate-200 rounded-3xl shadow-[0_32px_80px_-32px_rgba(15,23,42,0.45)] flex flex-col overflow-hidden" data-memory-panel>
        <header class="relative border-b border-slate-200">
          <div class="absolute inset-0 bg-gradient-to-r from-indigo-700 via-blue-600 to-cyan-500"></div>
          <div class="relative flex flex-col gap-8 p-6 md:p-8 text-white">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div class="flex items-start gap-4">
                <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur text-3xl leading-none shadow-inner">🧠</span>
                <div>
                  <h2 class="text-2xl font-semibold tracking-tight">AI Long-Term Memory</h2>
                  <p class="mt-2 text-sm text-white/70 max-w-xl leading-relaxed">Keep an eye on what the assistant remembers. Review snapshots, trim outdated knowledge, and stay confident in every conversation.</p>
                  <div class="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-white/80 ring-1 ring-white/20">${escapeHtml(docsLabel)}</span>
                    <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-white/80 ring-1 ring-white/20">Usage ~${usage.toFixed(2)} KB</span>
                    ${modelStatus ? `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-emerald-100 ring-1 ring-emerald-300/40">${escapeHtml(modelStatus)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button class="px-3 py-2 text-sm font-medium text-white/90 rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 backdrop-blur transition" type="button" data-memory-refresh>Refresh</button>
                <button class="px-3 py-2 text-sm font-medium rounded-lg border border-rose-200/60 bg-rose-400/20 text-white hover:bg-rose-400/30 transition" type="button" data-memory-clear-all>Clear All</button>
                <button class="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/15 transition" type="button" aria-label="Close memory panel" data-memory-close>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="rounded-xl border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
                <p class="text-xs uppercase tracking-wide text-white/60">Stored Items</p>
                <p class="mt-2 text-xl font-semibold">${escapeHtml(docsLabel)}</p>
                <p class="mt-1 text-xs text-white/60">Captured memory slices ready for review.</p>
              </div>
              <div class="rounded-xl border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
                <p class="text-xs uppercase tracking-wide text-white/60">Storage Usage</p>
                <div class="mt-2 flex items-baseline gap-2">
                  <p class="text-xl font-semibold">${usage.toFixed(2)} KB</p>
                  <span class="text-xs text-white/70">of ${capacityLabel} MB</span>
                </div>
                <p class="mt-1 text-xs text-white/60">Monitor footprint to avoid overflow.</p>
              </div>
              <div class="rounded-xl border border-white/20 bg-white/10 p-4 shadow-sm backdrop-blur">
                <p class="text-xs uppercase tracking-wide text-white/60">Capacity Health</p>
                <div class="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
                  <div class="h-full rounded-full bg-white transition-all" style="width:${usagePercentage}%"></div>
                </div>
                <p class="mt-2 text-xs text-white/70">${usagePercentLabel}% of soft limit (${capacityLabel} MB)</p>
              </div>
            </div>
          </div>
        </header>
        <div class="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden bg-slate-50">
          <div class="lg:col-span-2 flex flex-col border-r border-slate-200 bg-white">
            <div class="px-6 py-5 border-b border-slate-200 bg-slate-50">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="relative flex-1">
                  <span class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
                  </span>
                  <input type="text" class="w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" placeholder="Search saved memories by keywords, tags, or dates..." value="${escapeHtml(query || '')}" data-memory-search-input />
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" class="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSearching ? 'opacity-70 cursor-wait' : ''}" data-memory-search ${isSearching ? 'disabled' : ''}>
                    ${isSearching ? 'Searching…' : 'Search'}
                  </button>
                  <button type="button" class="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 bg-white hover:bg-slate-100 transition" data-memory-refresh>
                    Refresh list
                  </button>
                </div>
              </div>
              <p class="mt-3 text-xs text-slate-500">Tip: combine a keyword with a date or topic to quickly narrow down long-running project memories.</p>
            </div>
            <div class="flex-1 overflow-y-auto px-6 py-5 bg-white">
              <ul class="space-y-3">${documentsHtml}</ul>
            </div>
          </div>
          <aside class="flex flex-col border-t lg:border-t-0 bg-gradient-to-b from-slate-100 via-slate-50 to-white">
            <div class="px-5 py-6 border-b border-slate-200 bg-white/80 backdrop-blur">
              <h3 class="text-sm font-semibold text-slate-900">Search Results</h3>
              <p class="mt-2 text-xs text-slate-500 leading-relaxed">Select a match to auto-scroll the memory list and spotlight the exact entry.</p>
            </div>
            <div class="flex-1 overflow-y-auto px-5 py-6">
              ${resultsHtml}
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;
};
