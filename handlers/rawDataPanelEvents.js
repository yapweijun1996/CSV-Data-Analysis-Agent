export function bindRawDataPanelEvents(app) {
  if (!app || typeof app.querySelector !== 'function') {
    return;
  }

  const scope = app;

  const rawToggle = scope.querySelector('[data-raw-toggle]');
  if (rawToggle) {
    rawToggle.addEventListener('click', () => app.handleRawDataToggle());
  }

  scope.querySelectorAll('[data-raw-view]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.rawView;
      if (mode) {
        app.handleRawDataViewChange(mode);
      }
    });
  });

  const rawSearch = scope.querySelector('[data-raw-search]');
  if (rawSearch) {
    rawSearch.addEventListener('input', event => {
      app.handleRawDataFilterChange(event.target.value);
    });
  }

  const rawWholeWord = scope.querySelector('[data-raw-whole]');
  if (rawWholeWord) {
    rawWholeWord.addEventListener('change', event => {
      app.handleRawDataWholeWordChange(event.target.checked);
    });
  }

  const rawReset = scope.querySelector('[data-raw-reset]');
  if (rawReset) {
    rawReset.addEventListener('click', () => app.handleRawDataReset());
  }

  scope.querySelectorAll('[data-raw-sort]').forEach(header => {
    header.addEventListener('click', () => {
      const column = header.dataset.rawSort;
      if (column) {
        app.handleRawDataSort(column);
      }
    });
  });

  const rawPrevPage = scope.querySelector('[data-raw-page-prev]');
  if (rawPrevPage) {
    rawPrevPage.addEventListener('click', () => app.handleRawDataPageChange('prev'));
  }

  const rawNextPage = scope.querySelector('[data-raw-page-next]');
  if (rawNextPage) {
    rawNextPage.addEventListener('click', () => app.handleRawDataPageChange('next'));
  }

  const rawSaveButton = scope.querySelector('[data-raw-save]');
  if (rawSaveButton) {
    rawSaveButton.addEventListener('click', () => app.handleRawDataSave(rawSaveButton));
  }

  const rawDiscardButton = scope.querySelector('[data-raw-discard]');
  if (rawDiscardButton) {
    rawDiscardButton.addEventListener('click', () => app.handleRawDataDiscard());
  }

  scope.querySelectorAll('[data-raw-cell]').forEach(cell => {
    if (cell.getAttribute('contenteditable') === 'true') {
      cell.addEventListener('keydown', event => app.handleRawCellKeydown(event));
      cell.addEventListener('input', event => app.handleRawCellInput(event));
      cell.addEventListener('blur', event => app.handleRawCellBlur(event));
    }
  });

  scope.querySelectorAll('[data-raw-resize]').forEach(handle => {
    handle.addEventListener('pointerdown', event => app.handleRawColumnResizeStart(event));
  });

  if (typeof app.updateRawEditControls === 'function') {
    app.updateRawEditControls();
  }
}
