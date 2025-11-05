import { escapeHtml } from './helpers.js';

const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'scatter'];

/**
 * 渲染分析卡片的 Legend。
 *
 * @param {object} params
 * @param {import('../types/typedefs.js').AnalysisCardData} params.card
 * @param {any[]} params.legendData
 * @param {number} params.totalValue
 * @param {string[]} params.colors
 * @returns {string}
 */
const renderLegend = ({ card, legendData, totalValue, colors, valueKey }) => {
  const plan = card.plan;
  const groupKey = plan.groupByColumn;
  if (!groupKey || plan.chartType === 'scatter') {
    return '';
  }
  const hidden = new Set(card.hiddenLabels || []);
  return `
    <div class="flex flex-col">
      <div class="text-xs uppercase tracking-wide text-slate-400 mb-2">Legend</div>
      <div class="text-sm space-y-1 max-h-48 overflow-y-auto pr-1">
        ${legendData
          .map((item, index) => {
            const label = String(item[groupKey]);
            const value = Number(item?.[valueKey]) || 0;
            const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : '0.0';
            const isHidden = hidden.has(label);
            const color = colors[index % colors.length];
            const encodedLabel = encodeURIComponent(label);
            return `
              <button
                type="button"
                class="w-full flex items-center justify-between p-1.5 rounded-md transition-all duration-200 ${isHidden ? 'opacity-50' : 'hover:bg-slate-100'}"
                data-legend-toggle="${card.id}"
                data-legend-label="${encodedLabel}"
                title="${isHidden ? 'Show' : 'Hide'} &quot;${escapeHtml(label)}&quot;"
              >
                <div class="flex items-center truncate mr-2">
                  <span class="w-3 h-3 rounded-sm mr-2 flex-shrink-0" style="background-color:${isHidden ? '#9ca3af' : color}"></span>
                  <span class="truncate text-xs ${isHidden ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHtml(label)}</span>
                </div>
                <div class="flex items-baseline ml-2 flex-shrink-0">
                  <span class="font-semibold text-xs ${isHidden ? 'text-slate-400' : 'text-slate-800'}">${value.toLocaleString()}</span>
                  <span class="text-xs text-slate-500 ml-1.5 w-12 text-right">(${percentage}%)</span>
                </div>
              </button>`;
          })
          .join('')}
      </div>
    </div>
  `;
};

/**
 * 渲染简易数据表。
 *
 * @param {any[]} data
 * @returns {string}
 */
const renderDataTable = data => {
  if (!Array.isArray(data) || data.length === 0) {
    return '<p class="text-xs text-slate-500 p-2">No data available.</p>';
  }
  const headers = Object.keys(data[0]);
  return `
    <div class="overflow-auto">
      <table class="min-w-full text-xs text-left">
        <thead class="bg-slate-100 text-slate-600">
          <tr>
            ${headers.map(header => `<th class="px-3 py-2 font-semibold">${escapeHtml(header)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(row => `
              <tr class="border-t border-slate-100">
                ${headers
                  .map(header => `<td class="px-3 py-2 text-slate-700">${escapeHtml(row[header])}</td>`)
                  .join('')}
              </tr>`)
            .join('')}
        </tbody>
      </table>
    </div>
  `;
};

/**
 * @param {import('../types/typedefs.js').ChartType} type
 * @returns {string}
 */
const renderChartTypeIcon = type => {
  switch (type) {
    case 'bar':
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4zM8 8a1 1 0 011-1h1a1 1 0 011 1v6a1 1 0 01-1 1H9a1 1 0 01-1-1V8zM14 4a1 1 0 011-1h1a1 1 0 011 1v10a1 1 0 01-1 1h-1a1 1 0 01-1-1V4z" /></svg>';
    case 'line':
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a1 1 0 001 1h12a1 1 0 100-2H5V3a1 1 0 00-2 0zm12.293 4.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L15 8.414l-2.293 2.293a1 1 0 01-1.414 0l-2-2a1 1 0 111.414-1.414L12 7.586l1.293-1.293z" clip-rule="evenodd" /></svg>';
    case 'pie':
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg>';
    case 'doughnut':
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 10a3 3 0 116 0 3 3 0 01-6 0z" clip-rule="evenodd" /></svg>';
    case 'scatter':
      return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 100 4 2 2 0 000-4zM5 13a2 2 0 100 4 2 2 0 000-4zM15 3a2 2 0 100 4 2 2 0 000-4zM15 13a2 2 0 100 4 2 2 0 000-4zM8 8a2 2 0 100 4 2 2 0 000-4zM12 8a2 2 0 100 4 2 2 0 000-4z" /></svg>';
    default:
      return '';
  }
};

/**
 * 渲染单个分析卡片。
 *
 * @param {object} params
 * @param {any} params.app 原应用实例
 * @param {import('../types/typedefs.js').AnalysisCardData} params.card
 * @param {string[]} params.colors
 * @returns {string}
 */
export const renderAnalysisCard = ({ app, card, colors }) => {
  const state = app.state || {};
  const plan = card.plan;
  const chartId = `chart-${card.id}`;
  const displayType = card.displayChartType || plan.chartType;
  const isHighlighted = state.highlightedCardId === card.id;
  const legendData = app.getCardLegendData(card);
  const displayData = app.getCardDisplayData(card);
  const totalValue = app.getCardTotalValue(card);
  const summary = app.splitSummary(card.summary || '');
  const selectedData = Array.isArray(card.selectedIndices)
    ? card.selectedIndices.map(index => displayData[index]).filter(Boolean)
    : [];
  const selectionExpanded = card.showSelectionDetails !== false;
  const isExporting = Boolean(card.isExporting);
  const showTopNControls = plan.chartType !== 'scatter' && legendData.length > 5;
  const filter = card.filter;
  const filterValues = filter && Array.isArray(filter.values) ? filter.values.join(', ') : '';
  const filterColumn = filter && filter.column ? escapeHtml(filter.column) : '';
  const filterValueDisplay = filterValues ? escapeHtml(filterValues) : '';
  const topNValue = card.topN ? String(card.topN) : 'all';
  const totalSummary =
    plan.aggregation === 'sum'
      ? `<p class="text-xs text-slate-500">Total: <span class="font-semibold text-slate-800">${totalValue.toLocaleString()}</span></p>`
      : '';

  const valueKey = app.getCardValueKey(card);
  const legendHtml = renderLegend({ card, legendData, totalValue, colors, valueKey });
  const showLegend = Boolean(legendHtml);

  const selectionDetails = selectedData.length
    ? `
      <div class="mt-4 bg-slate-50 p-3 rounded-md text-sm border border-slate-200">
        <div class="flex items-center justify-between gap-3">
          <button type="button" class="font-semibold text-blue-600 flex items-center gap-1" data-toggle-selection="${card.id}">
            <span>${selectionExpanded ? '▾' : '▸'}</span>
            <span>Selection details (${selectedData.length})</span>
          </button>
          <button type="button" class="text-xs text-slate-500 hover:text-slate-700" data-clear-selection="${card.id}">
            Clear selection
          </button>
        </div>
        ${
          selectionExpanded
            ? `<div class="mt-2 border border-slate-200 rounded-md max-h-48 overflow-auto">${renderDataTable(
                selectedData
              )}</div>`
            : ''
        }
      </div>
    `
    : '';

  const dataTableHtml = card.isDataVisible
    ? `<div class="mt-3 border border-slate-200 rounded-md max-h-48 overflow-auto">${renderDataTable(
        displayData
      )}</div>`
    : '';

  const secondarySummary = summary.secondary
    ? `<p class="text-xs text-slate-500 mt-2">${escapeHtml(summary.secondary)}</p>`
    : '';

  const legendColumn = showLegend ? `<div class="flex flex-col">${legendHtml}</div>` : '';

  const filterBanner =
    filter && filter.column && Array.isArray(filter.values) && filter.values.length
      ? `<div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <strong>AI Filter Active:</strong> Showing where '${filterColumn}' is '${filterValueDisplay}'. Ask the assistant to "clear filter" to remove.
        </div>`
      : '';

  const topNOptions = ['all', '5', '8', '10', '20']
    .map(
      option =>
        `<option value="${option}" ${topNValue === option ? 'selected' : ''}>${
          option === 'all' ? 'All' : `Top ${option}`
        }</option>`
    )
    .join('');

  return `
    <article class="bg-white rounded-xl shadow border border-slate-200 p-4 flex flex-col gap-4 transition-shadow ${
      isHighlighted ? 'ring-2 ring-blue-400 shadow-lg' : ''
    }" data-card-id="${card.id}">
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(plan.title)}</h3>
          <p class="text-sm text-slate-500">${escapeHtml(plan.description || '')}</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <div class="chart-switcher" role="group" aria-label="Chart type">
            ${CHART_TYPES.map(type => `
              <button
                type="button"
                class="chart-switcher__btn ${displayType === type ? 'is-active' : ''}"
                data-chart-type="${type}"
                data-card="${card.id}"
                aria-pressed="${displayType === type ? 'true' : 'false'}"
                title="Switch to ${type} chart"
              >
                ${renderChartTypeIcon(type)}
              </button>`).join('')}
          </div>
          <div class="relative" data-export-menu-container data-export-ignore>
            <button
              type="button"
              class="chart-switcher__export ${isExporting ? 'cursor-wait' : ''}"
              data-export-menu-toggle
              data-card="${card.id}"
              aria-haspopup="true"
              aria-expanded="false"
              ${isExporting ? 'disabled' : ''}
              title="Export card"
              data-export-ignore
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <div class="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-md shadow-lg hidden z-20" data-export-menu data-export-ignore>
              <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" data-export-card="png" data-card="${card.id}" data-export-ignore>
                <span>Export as PNG</span>
                <span class="text-xs text-slate-400">.png</span>
              </button>
              <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" data-export-card="csv" data-card="${card.id}" data-export-ignore>
                <span>Export data (CSV)</span>
                <span class="text-xs text-slate-400">.csv</span>
              </button>
              <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-b-md" data-export-card="html" data-card="${card.id}" data-export-ignore>
                <span>Export report (HTML)</span>
                <span class="text-xs text-slate-400">.html</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-${showLegend ? '2' : '1'}">
        <div class="relative h-72">
          <canvas id="${chartId}"></canvas>
          <div class="absolute top-2 right-2 flex items-center space-x-1">
            ${
              selectedData.length > 0
                ? `<button class="p-1.5 bg-white/70 rounded-full hover:bg-white text-slate-600" data-clear-selection="${card.id}" title="Clear selection">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /><path d="M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 01-1.414-1.414l2-2zM7.707 14.707a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L7 12.586V10a1 1 0 112 0v2.586l1.293-1.293a1 1 0 011.414 1.414l-2 2z" /></svg>
                  </button>`
                : ''
            }
            ${
              card.isZoomed
                ? `<button class="p-1.5 bg-white/70 rounded-full hover:bg-white text-slate-600" data-reset-zoom="${card.id}" title="Reset zoom">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /><path d="M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 011.414 1.414l-2 2z" /></svg>
                  </button>`
                : ''
            }
          </div>
        </div>
        ${legendColumn}
      </div>

      ${filterBanner}

      <div class="border-t border-slate-200 pt-3 text-sm text-slate-700">
        <p>${escapeHtml(summary.primary)}</p>
        ${secondarySummary}
        ${totalSummary}
      </div>

      <div class="flex flex-wrap justify-between items-center gap-3 text-sm">
        <button type="button" class="text-blue-600 hover:underline" data-toggle-data="${card.id}">
          ${card.isDataVisible ? 'Hide' : 'Show'} full data table
        </button>
        ${
          showTopNControls
            ? `<div class="flex items-center space-x-2 text-xs">
                <label class="text-slate-500" for="top-n-${card.id}">Show</label>
                <select id="top-n-${card.id}" class="bg-white border border-slate-300 text-slate-800 rounded-md py-1 px-2" data-top-n="${card.id}">${topNOptions}</select>
                ${
                  topNValue !== 'all'
                    ? `<label class="flex items-center space-x-1 text-slate-500">
                         <input type="checkbox" class="h-3.5 w-3.5 text-blue-600 border-slate-300 rounded" data-hide-others="${card.id}" ${card.hideOthers ? 'checked' : ''}>
                         <span>Hide "Others"</span>
                       </label>`
                    : ''
                }
              </div>`
            : ''
        }
      </div>

      ${selectionDetails}
      ${dataTableHtml}
    </article>
  `;
};
