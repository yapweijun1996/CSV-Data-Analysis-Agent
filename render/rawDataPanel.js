import { escapeHtml } from './helpers.js';

/**
 * 渲染原始数据面板。
 *
 * @param {object} options
 * @param {any} options.app CsvDataAnalysisApp 实例
 * @param {number} options.rowsPerPage 每页显示行数
 * @returns {string}
 */
export const renderRawDataPanel = ({ app, rowsPerPage }) => {
  const { state } = app;
  const { csvData, isRawDataVisible, rawDataFilter, rawDataWholeWord } = state;
  if (!csvData || !Array.isArray(csvData.data)) {
    return '';
  }

  const context = app.getDatasetViewContext();
  if (!context) {
    return '';
  }

  const metadata = context.metadata;
  const activeDataset = context.activeDataset || csvData;
  const headers = context.headers;
  const sortState = state.rawDataSort || null;
  const datasetRows = Array.isArray(activeDataset?.data) ? activeDataset.data : [];
  const processedRows = app.getProcessedRawData(activeDataset);
  const totalRows = processedRows.length;
  const totalRowsInDataset =
    context.allRows.length || (Array.isArray(activeDataset?.data) ? activeDataset.data.length : 0);
  const filterActive = Boolean(rawDataFilter || rawDataWholeWord || sortState);
  const totalPages = totalRows ? Math.ceil(totalRows / rowsPerPage) : 1;
  const currentPageState = state.rawDataPage || 0;
  const currentPage = Math.min(currentPageState, Math.max(totalPages - 1, 0));
  const startIndex = totalRows ? currentPage * rowsPerPage : 0;
  const endIndex = totalRows ? Math.min(startIndex + rowsPerPage, totalRows) : 0;
  const visibleRows = processedRows.slice(startIndex, endIndex);
  const hasVisibleRows = visibleRows.length > 0;
  const filterSummary = totalRows
    ? `Showing ${(startIndex + 1).toLocaleString()} - ${endIndex.toLocaleString()} of ${(filterActive ? totalRows : totalRowsInDataset).toLocaleString()} ${filterActive ? 'matching rows' : 'rows'}`
    : filterActive
    ? 'No rows match your filters.'
    : 'No data rows available.';
  const sortSummary = sortState
    ? `Sorted by ${sortState.key} (${sortState.direction === 'ascending' ? 'ascending' : 'descending'})`
    : '';
  const showPagination = totalPages > 1 && totalRows > 0;

  app.ensureRawEditContext();

  const metadataLines = [];
  if (metadata?.reportTitle) {
    metadataLines.push(
      `<p class="raw-panel-meta-line raw-panel-title text-xs font-semibold text-slate-600">${escapeHtml(
        metadata.reportTitle
      )}</p>`
    );
  }
  if (context.contextPreview) {
    metadataLines.push(
      `<p class="raw-panel-meta-line raw-panel-preview text-[11px] text-slate-500 mt-0.5">${escapeHtml(
        context.contextPreview
      )}</p>`
    );
  }
  if (context.contextCount) {
    metadataLines.push(
      `<p class="raw-panel-meta-line text-[11px] text-slate-400 mt-0.5">Extracted ${context.contextCount.toLocaleString()} rows of context data (including headers and initial data rows).</p>`
    );
  }
  metadataLines.push(
    `<p class="raw-panel-meta-line text-[11px] text-slate-400 mt-0.5">Original ${context.originalCount.toLocaleString()} rows • ${context.cleanedCount.toLocaleString()} rows after cleaning${
      context.removedCount > 0 ? ` • ${context.removedCount.toLocaleString()} rows removed` : ''
    }</p>`
  );
  metadataLines.push(
    `<p class="raw-panel-meta-line text-[11px] ${
      context.resolvedView === 'original' ? 'text-amber-600' : 'text-slate-400'
    } mt-0.5">Current view: ${
      context.resolvedView === 'original'
        ? 'Original CSV content (including title/total rows)'
        : 'Cleaned data ready for analysis'
    }</p>`
  );
  metadataLines.push(
    `<p class="raw-panel-meta-line raw-panel-dataset text-xs text-slate-500 mt-3">${escapeHtml(
      csvData.fileName
    )} • ${csvData.data.length.toLocaleString()} rows (${context.resolvedView === 'original' ? 'original' : 'cleaned'})</p>`
  );
  const metadataBlock = `<div class="raw-panel-meta">${metadataLines.join('')}</div>`;

  const currentViewBadge =
    context.resolvedView === 'original'
      ? { label: 'Original CSV view', tone: 'warning' }
      : { label: 'Cleaned dataset', tone: 'default' };

  const viewButtons = app
    .getDatasetViewOptions()
    .map(option => {
      const isActive = context.resolvedView === option.key;
      const disabled = option.key === 'original' && !context.originalAvailable;
      const classes = [
        'px-3 py-1 text-xs font-medium rounded-md transition-colors',
        isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<button type="button" class="${classes}" data-raw-view="${option.key}" ${
        disabled ? 'disabled' : ''
      }>${option.label}</button>`;
    })
    .join('<span class="w-1"></span>');

  const columnWidths = headers.reduce((map, header) => {
    map[header] = app.getResolvedRawColumnWidth(header, datasetRows);
    return map;
  }, {});

  const numberingHeader =
    '<th class="px-3 py-2 text-xs font-semibold text-slate-500 text-center sticky left-0 z-20 bg-slate-100 border-r border-slate-200" style="width:60px;min-width:60px;max-width:60px;">#</th>';

  const tableHeader = numberingHeader.concat(
    headers
      .map((header, index) => {
        const columnLetter = app.getColumnLetter(index);
        const displayHeader = columnLetter ? `${columnLetter} - ${header}` : header;
        const label = escapeHtml(displayHeader);
        const titleLabel = escapeHtml(header);
        const isSorted = sortState && sortState.key === header;
        const direction = isSorted ? sortState.direction : null;
        const indicator = direction
          ? `<span class="text-[10px] ${isSorted ? 'text-blue-600' : 'text-slate-400'}">${
              direction === 'ascending' ? '&#9650;' : '&#9660;'
            }</span>`
          : '<span class="text-[10px] text-slate-300">&#8597;</span>';
        const cellClasses = [
          'px-3 py-2 text-xs font-semibold select-none relative',
          isSorted ? 'text-blue-600 bg-blue-50/60' : 'text-slate-600',
        ].join(' ');
        const width = columnWidths[header];
        const widthStyle = Number.isFinite(width)
          ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"`
          : '';
        return `
          <th class="${cellClasses}"${widthStyle}>
            <button type="button" class="w-full flex items-center justify-between gap-1 text-left" data-raw-sort="${escapeHtml(
              header
            )}" title="Sort by ${titleLabel}">
              <span class="truncate">${label}</span>
              ${indicator}
            </button>
            <div class="absolute top-0 right-0 h-full w-2 cursor-col-resize z-20" data-raw-resize="${escapeHtml(
              header
            )}"></div>
          </th>`;
      })
      .join('')
  );

  const editingEnabled = context.resolvedView === 'cleaned';
  const pendingEditCount = app.getPendingRawEditCount();
  const hasPendingEdits = pendingEditCount > 0;

  const tableBody = hasVisibleRows
    ? visibleRows
        .map((row, rowIndex) => {
          const rowBackground = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
          const datasetIndex = datasetRows.indexOf(row);
          const resolvedRowIndex = datasetIndex >= 0 ? datasetIndex : startIndex + rowIndex;
          const rowUpdates = app.getPendingRawRow(resolvedRowIndex);
          const globalRowNumber = startIndex + rowIndex + 1;
          const numberCell = `<td class="px-3 py-2 text-xs text-slate-400 text-center sticky left-0 z-10 border-r border-slate-200" style="width:60px;min-width:60px;max-width:60px;background-color:inherit;">${globalRowNumber.toLocaleString()}</td>`;
          const cells = headers
            .map(header => {
              const baseValue = row?.[header];
              const displayValue = app.getPendingRawValue(resolvedRowIndex, header, baseValue);
              const formattedDisplay = app.formatRawCellDisplay(displayValue);
              const isEdited =
                Boolean(rowUpdates) && Object.prototype.hasOwnProperty.call(rowUpdates, header);
              const cellClasses = [
                'px-3 py-2 text-xs whitespace-nowrap align-top text-slate-700',
                editingEnabled ? 'focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400' : '',
                isEdited ? 'bg-amber-50 ring-2 ring-amber-200 rounded-sm shadow-inner' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const originalString =
                baseValue === null || baseValue === undefined ? '' : String(baseValue);
              const editableAttrs = editingEnabled
                ? ` contenteditable="true" spellcheck="false" data-raw-cell data-row-index="${resolvedRowIndex}" data-col-key="${escapeHtml(
                    header
                  )}" data-original-value="${escapeHtml(originalString)}"`
                : '';
              const editedAttr = isEdited ? ' data-edited="true"' : '';
              const columnAttr = ` data-raw-cell-col="${escapeHtml(header)}"`;
              const width = columnWidths[header];
              const widthStyle = Number.isFinite(width)
                ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"`
                : '';
              return `<td class="${cellClasses}"${editableAttrs}${editedAttr}${columnAttr}${widthStyle}>${escapeHtml(
                formattedDisplay
              )}</td>`;
            })
            .join('');
          return `<tr class="border-t border-slate-100 ${rowBackground} hover:bg-blue-50/40 transition-colors" data-row-source="${resolvedRowIndex}">${numberCell}${cells}</tr>`;
        })
        .join('')
    : '';

  let tableHtml = '';
  if (!headers.length) {
    tableHtml = '<p class="text-xs text-slate-500">No data rows available.</p>';
  } else if (!hasVisibleRows) {
    tableHtml = '<p class="text-xs text-slate-500">No rows match your filters.</p>';
  } else {
    tableHtml = `<div class="overflow-auto border border-slate-200 rounded-md shadow-sm" style="max-height: 60vh;">
          <table class="min-w-full text-left text-xs table-fixed">
            <thead class="bg-slate-100 sticky top-0 z-10 shadow-sm">
              <tr>${tableHeader}</tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>`;
  }

  const filterSummaryHtml = escapeHtml(filterSummary);
  const sortSummaryHtml = sortSummary ? escapeHtml(sortSummary) : '';

  const paginationHtml = showPagination
    ? `<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Page ${(currentPage + 1).toLocaleString()} of ${totalPages.toLocaleString()}</span>
          <div class="flex items-center gap-2">
            <button type="button" class="px-2 py-1 text-xs bg-slate-200 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300" data-raw-page-prev ${
              currentPage === 0 ? 'disabled' : ''
            }>
              Previous
            </button>
            <button type="button" class="px-2 py-1 text-xs bg-slate-200 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300" data-raw-page-next ${
              currentPage >= totalPages - 1 ? 'disabled' : ''
            }>
              Next
            </button>
          </div>
        </div>`
    : '';

  const editToolbar = editingEnabled
    ? `<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span class="${hasPendingEdits ? 'text-amber-600 font-medium' : 'text-slate-500'}" data-raw-unsaved-label>
            ${
              hasPendingEdits
                ? `${pendingEditCount} unsaved ${pendingEditCount === 1 ? 'cell' : 'cells'}`
                : 'No unsaved changes'
            }
          </span>
          <div class="flex items-center gap-2">
            <button type="button" class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white transition disabled:opacity-60 disabled:cursor-not-allowed${
              hasPendingEdits ? ' hover:bg-blue-700' : ''
            }" data-raw-save ${hasPendingEdits ? '' : 'disabled'}>
              Save changes
            </button>
            <button type="button" class="text-xs text-slate-500 transition disabled:opacity-40 disabled:cursor-not-allowed${
              hasPendingEdits ? ' hover:text-slate-700' : ''
            }" data-raw-discard ${hasPendingEdits ? '' : 'disabled'}>
              Discard
            </button>
          </div>
        </div>`
    : `<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Switch to the cleaned dataset to make inline edits.
        </div>`;

  return `
      <section class="mx-auto max-w-6xl pb-8">
        <div class="bg-white border border-slate-200 rounded-xl shadow-sm">
          <button type="button" class="raw-panel-toggle flex justify-between items-start w-full px-4 py-3 text-left" data-raw-toggle aria-expanded="${
            isRawDataVisible ? 'true' : 'false'
          }">
            <div class="raw-panel-toggle__content">
              <div class="raw-panel-toggle__header">
                <h3 class="text-base font-semibold text-slate-900">Raw Data Explorer</h3>
                <span class="raw-panel-badge${
                  currentViewBadge.tone === 'warning' ? ' raw-panel-badge--warning' : ''
                }">${currentViewBadge.label}</span>
              </div>
              ${metadataBlock}
            </div>
            <span class="raw-panel-chevron" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </span>
          </button>
          ${
            isRawDataVisible
              ? `<div class="px-4 pb-4 space-y-4">
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div class="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-md p-1">
                        ${viewButtons}
                      </div>
                      <div class="flex flex-wrap items-center gap-4">
                        <div class="relative">
                          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          </div>
                          <input type="text" data-raw-search data-focus-key="raw-search" class="bg-white border border-slate-300 rounded-md py-1.5 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Search table..." value="${escapeHtml(
                            rawDataFilter
                          )}" />
                        </div>
                        <label class="flex items-center space-x-2 text-xs text-slate-600">
                          <input type="checkbox" data-raw-whole class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${
                            rawDataWholeWord ? 'checked' : ''
                          }>
                          <span>Match whole word only</span>
                        </label>
                        ${
                          filterActive
                            ? '<button type="button" class="text-xs text-slate-500 hover:text-slate-700 underline" data-raw-reset>Reset filters</button>'
                            : ''
                        }
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>${filterSummaryHtml}</span>
                      ${sortSummaryHtml ? `<span>${sortSummaryHtml}</span>` : ''}
                    </div>
                    ${paginationHtml}
                    ${editToolbar}
                    ${tableHtml}
                  </div>`
              : ''
          }
        </div>
      </section>
    `;
};
