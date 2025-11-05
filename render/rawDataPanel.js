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
      `<p class="raw-panel-meta__line raw-panel-meta__line--title">${escapeHtml(metadata.reportTitle)}</p>`
    );
  }
  if (context.contextPreview) {
    metadataLines.push(
      `<p class="raw-panel-meta__line raw-panel-meta__line--preview">${escapeHtml(
        context.contextPreview
      )}</p>`
    );
  }
  if (context.contextCount) {
    metadataLines.push(
      `<p class="raw-panel-meta__line raw-panel-meta__line--muted">Extracted ${context.contextCount.toLocaleString()} rows of context data (including headers and initial data rows).</p>`
    );
  }
  metadataLines.push(
    `<p class="raw-panel-meta__line raw-panel-meta__line--muted">Original ${context.originalCount.toLocaleString()} rows • ${context.cleanedCount.toLocaleString()} rows after cleaning${
      context.removedCount > 0 ? ` • ${context.removedCount.toLocaleString()} rows removed` : ''
    }</p>`
  );
  const viewLineClasses = ['raw-panel-meta__line', 'raw-panel-meta__line--view'];
  if (context.resolvedView === 'original') {
    viewLineClasses.push('raw-panel-meta__line--highlight');
  }
  metadataLines.push(
    `<p class="${viewLineClasses.join(' ')}">Current view: ${
      context.resolvedView === 'original'
        ? 'Original CSV content (including title/total rows)'
        : 'Cleaned data ready for analysis'
    }</p>`
  );
  metadataLines.push(
    `<p class="raw-panel-meta__line raw-panel-meta__line--dataset">${escapeHtml(
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
      const classes = ['raw-panel-view-btn'];
      if (isActive) {
        classes.push('raw-panel-view-btn--active');
      }
      if (disabled) {
        classes.push('raw-panel-view-btn--disabled');
      }
      return `<button type="button" class="${classes.join(' ')}" data-raw-view="${option.key}" ${
        disabled ? 'disabled' : ''
      }>${option.label}</button>`;
    })
    .join('');

  const columnWidths = headers.reduce((map, header) => {
    map[header] = app.getResolvedRawColumnWidth(header, datasetRows);
    return map;
  }, {});

  const numberingHeader =
    '<th class="raw-panel__table-head-cell raw-panel__table-head-cell--index" style="width:60px;min-width:60px;max-width:60px;">#</th>';

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
          ? `<span class="raw-panel__table-sort raw-panel__table-sort--active raw-panel__table-sort--${direction}">${
              direction === 'ascending' ? '&#9650;' : '&#9660;'
            }</span>`
          : '<span class="raw-panel__table-sort raw-panel__table-sort--idle">&#8597;</span>';
        const cellClasses = ['raw-panel__table-head-cell'];
        if (isSorted) {
          cellClasses.push('raw-panel__table-head-cell--sorted');
        }
        const width = columnWidths[header];
        const widthStyle = Number.isFinite(width)
          ? ` style="width:${width}px;min-width:${width}px;max-width:${width}px;"`
          : '';
        const ariaSort = direction
          ? ` aria-sort="${direction === 'ascending' ? 'ascending' : 'descending'}"`
          : '';
        return `
          <th class="${cellClasses.join(' ')}"${widthStyle}${ariaSort}>
            <button type="button" class="raw-panel__table-head-button" data-raw-sort="${escapeHtml(
              header
            )}" title="Sort by ${titleLabel}">
              <span class="truncate">${label}</span>
              ${indicator}
            </button>
            <div class="raw-panel__table-resize" data-raw-resize="${escapeHtml(
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
          const datasetIndex = datasetRows.indexOf(row);
          const resolvedRowIndex = datasetIndex >= 0 ? datasetIndex : startIndex + rowIndex;
          const rowUpdates = app.getPendingRawRow(resolvedRowIndex);
          const globalRowNumber = startIndex + rowIndex + 1;
          const numberCell = `<td class="raw-panel__table-cell raw-panel__table-cell--index" style="width:60px;min-width:60px;max-width:60px;background-color:inherit;">${globalRowNumber.toLocaleString()}</td>`;
          const cells = headers
            .map(header => {
              const baseValue = row?.[header];
              const displayValue = app.getPendingRawValue(resolvedRowIndex, header, baseValue);
              const formattedDisplay = app.formatRawCellDisplay(displayValue);
              const isEdited =
                Boolean(rowUpdates) && Object.prototype.hasOwnProperty.call(rowUpdates, header);
              const cellClasses = ['raw-panel__table-cell'];
              if (editingEnabled) {
                cellClasses.push('raw-panel__table-cell--editable');
              }
              if (isEdited) {
                cellClasses.push('raw-panel__table-cell--edited');
              }
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
              return `<td class="${cellClasses.join(' ')}"${editableAttrs}${editedAttr}${columnAttr}${widthStyle}>${escapeHtml(
                formattedDisplay
              )}</td>`;
            })
            .join('');
          return `<tr class="raw-panel__table-body-row" data-row-source="${resolvedRowIndex}">${numberCell}${cells}</tr>`;
        })
        .join('')
    : '';

  let tableHtml = '';
  if (!headers.length) {
    tableHtml = '<p class="raw-panel__empty">No data rows available.</p>';
  } else if (!hasVisibleRows) {
    tableHtml = '<p class="raw-panel__empty">No rows match your filters.</p>';
  } else {
    tableHtml = `<div class="raw-panel__table-wrapper">
          <div class="raw-panel__table-scroll">
            <table class="raw-panel__table">
              <thead class="raw-panel__table-head">
                <tr class="raw-panel__table-head-row">${tableHeader}</tr>
              </thead>
              <tbody class="raw-panel__table-body">${tableBody}</tbody>
            </table>
          </div>
        </div>`;
  }

  const filterSummaryHtml = escapeHtml(filterSummary);
  const sortSummaryHtml = sortSummary ? escapeHtml(sortSummary) : '';

  const paginationHtml = showPagination
    ? `<div class="raw-panel__pagination">
          <span class="raw-panel__pagination-label">Page ${(currentPage + 1).toLocaleString()} of ${totalPages.toLocaleString()}</span>
          <div class="raw-panel__pagination-buttons">
            <button type="button" class="raw-panel__pagination-button" data-raw-page-prev ${
              currentPage === 0 ? 'disabled' : ''
            }>
              Previous
            </button>
            <button type="button" class="raw-panel__pagination-button" data-raw-page-next ${
              currentPage >= totalPages - 1 ? 'disabled' : ''
            }>
              Next
            </button>
          </div>
        </div>`
    : '';

  const editToolbar = editingEnabled
    ? `<div class="raw-panel__edit-toolbar">
          <span class="raw-panel__edit-status${
            hasPendingEdits ? ' raw-panel__edit-status--pending' : ''
          }" data-raw-unsaved-label>
            ${
              hasPendingEdits
                ? `${pendingEditCount} unsaved ${pendingEditCount === 1 ? 'cell' : 'cells'}`
                : 'No unsaved changes'
            }
          </span>
          <div class="raw-panel__edit-actions">
            <button type="button" class="raw-panel__edit-save" data-raw-save ${
              hasPendingEdits ? '' : 'disabled'
            }>
              Save changes
            </button>
            <button type="button" class="raw-panel__edit-discard" data-raw-discard ${
              hasPendingEdits ? '' : 'disabled'
            }>
              Discard
            </button>
          </div>
        </div>`
    : `<div class="raw-panel__edit-disabled">
          Switch to the cleaned dataset to make inline edits.
        </div>`;

  return `
      <section class="raw-panel">
        <div class="raw-panel__card">
          <button type="button" class="raw-panel-toggle raw-panel__toggle" data-raw-toggle aria-expanded="${
            isRawDataVisible ? 'true' : 'false'
          }">
            <div class="raw-panel-toggle__content">
              <div class="raw-panel-toggle__header">
                <h3 class="raw-panel__title">Raw Data Explorer</h3>
                <span class="raw-panel-badge${
                  currentViewBadge.tone === 'warning' ? ' raw-panel-badge--warning' : ''
                }">${currentViewBadge.label}</span>
              </div>
              ${metadataBlock}
            </div>
            <span class="raw-panel-chevron" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </span>
          </button>
          ${
            isRawDataVisible
              ? `<div class="raw-panel__body">
                    <div class="raw-panel__toolbar">
                      <div class="raw-panel__toolbar-group" role="group" aria-label="Choose dataset view">
                        ${viewButtons}
                      </div>
                      <div class="raw-panel__toolbar-group raw-panel__toolbar-group--filters">
                        <label class="raw-panel__search">
                          <span class="raw-panel__label">Search</span>
                          <div class="raw-panel__search-field">
                            <span class="raw-panel__search-icon" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" class="raw-panel__search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </span>
                            <input type="text" data-raw-search data-focus-key="raw-search" class="raw-panel__search-input" placeholder="Search table..." value="${escapeHtml(
                              rawDataFilter
                            )}" />
                          </div>
                        </label>
                        <label class="raw-panel__checkbox">
                          <input type="checkbox" data-raw-whole class="raw-panel__checkbox-input" ${
                            rawDataWholeWord ? 'checked' : ''
                          }>
                          <span class="raw-panel__checkbox-label">Match whole word only</span>
                        </label>
                        ${
                          filterActive
                            ? '<button type="button" class="raw-panel__reset" data-raw-reset>Reset filters</button>'
                            : ''
                        }
                      </div>
                    </div>
                    <div class="raw-panel__status">
                      <span class="raw-panel__status-item">${filterSummaryHtml}</span>
                      ${sortSummaryHtml ? `<span class="raw-panel__status-item">${sortSummaryHtml}</span>` : ''}
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
