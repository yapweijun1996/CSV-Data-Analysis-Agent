import { DEFAULT_RAW_COLUMN_WIDTH, MIN_RAW_COLUMN_WIDTH } from '../state/constants.js';

export const rawDataEditingMethods = {
  formatRawCellDisplay(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return String(value);
  },

  getColumnLetter(index) {
    if (!Number.isInteger(index) || index < 0) {
      return '';
    }
    let remainder = index;
    let label = '';
    while (remainder >= 0) {
      const mod = remainder % 26;
      label = String.fromCharCode(65 + mod) + label;
      remainder = Math.floor(remainder / 26) - 1;
    }
    return label;
  },

  getDefaultRawColumnWidth(header, datasetRows) {
    const labelLength = header ? header.length : 0;
    const headerEstimate = labelLength * 8 + 30;
    const firstRow = Array.isArray(datasetRows) && datasetRows.length ? datasetRows[0] : null;
    const sampleValue = firstRow ? firstRow[header] : '';
    const sampleEstimate = String(sampleValue ?? '').length * 7 + 30;
    return Math.max(DEFAULT_RAW_COLUMN_WIDTH, headerEstimate, sampleEstimate);
  },

  getResolvedRawColumnWidth(header, datasetRows) {
    const overrides = this.state?.rawDataColumnWidths || {};
    const overrideValue = overrides?.[header];
    if (Number.isFinite(overrideValue) && overrideValue > 0) {
      return Math.max(MIN_RAW_COLUMN_WIDTH, Math.floor(overrideValue));
    }
    return this.getDefaultRawColumnWidth(header, datasetRows);
  },

  persistRawColumnWidth(header, width) {
    if (!header || !Number.isFinite(width)) {
      return;
    }
    this.setState(prev => {
      const previous = prev.rawDataColumnWidths || {};
      const next = { ...previous, [header]: Math.max(MIN_RAW_COLUMN_WIDTH, Math.floor(width)) };
      return { rawDataColumnWidths: next };
    });
  },

  normalizeRawCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/\u00a0/g, ' ').replace(/\r?\n/g, ' ').trim();
  },

  normaliseComparisonValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  },

  ensureRawEditContext() {
    const datasetId = this.getCurrentDatasetId();
    if (this.rawEditDatasetId !== datasetId) {
      this.pendingRawEdits = new Map();
      this.rawEditDatasetId = datasetId;
      this.updateRawEditControls();
    }
  },

  clearPendingRawEdits() {
    this.pendingRawEdits = new Map();
    this.rawEditDatasetId = this.getCurrentDatasetId();
    this.updateRawEditControls();
  },

  hasPendingRawEdits() {
    if (!this.pendingRawEdits || !(this.pendingRawEdits instanceof Map)) {
      return false;
    }
    for (const entry of this.pendingRawEdits.values()) {
      if (entry && Object.keys(entry).length > 0) {
        return true;
      }
    }
    return false;
  },

  getPendingRawEditCount() {
    if (!this.pendingRawEdits || !(this.pendingRawEdits instanceof Map)) {
      return 0;
    }
    let count = 0;
    for (const entry of this.pendingRawEdits.values()) {
      count += Object.keys(entry || {}).length;
    }
    return count;
  },

  getPendingRawRow(rowIndex) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      return null;
    }
    const key = String(rowIndex);
    return this.pendingRawEdits?.get(key) || null;
  },

  getPendingRawValue(rowIndex, column, fallback) {
    const rowUpdates = this.getPendingRawRow(rowIndex);
    if (rowUpdates && Object.prototype.hasOwnProperty.call(rowUpdates, column)) {
      return rowUpdates[column];
    }
    return fallback;
  },

  getBaseRawValue(rowIndex, column) {
    const dataRows = this.state?.csvData?.data;
    if (!Array.isArray(dataRows) || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= dataRows.length) {
      return '';
    }
    const baseValue = dataRows[rowIndex]?.[column];
    if (baseValue === null || baseValue === undefined) {
      return '';
    }
    return baseValue;
  },

  setPendingRawEdit(rowIndex, column, newValue) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || !column) {
      return 'unchanged';
    }
    const key = String(rowIndex);
    const baseValue = this.getBaseRawValue(rowIndex, column);

    const baseComparison = this.normaliseComparisonValue(baseValue);
    const newComparison = this.normaliseComparisonValue(newValue);

    if (newComparison === baseComparison) {
      if (this.pendingRawEdits?.has(key)) {
        const existing = { ...this.pendingRawEdits.get(key) };
        if (Object.prototype.hasOwnProperty.call(existing, column)) {
          delete existing[column];
          if (Object.keys(existing).length === 0) {
            this.pendingRawEdits.delete(key);
          } else {
            this.pendingRawEdits.set(key, existing);
          }
          this.updateRawEditControls();
          return 'removed';
        }
      }
      this.updateRawEditControls();
      return 'unchanged';
    }

    const currentUpdates = this.pendingRawEdits?.get(key) || {};
    const updated = { ...currentUpdates, [column]: newValue };
    this.pendingRawEdits.set(key, updated);
    this.updateRawEditControls();
    return 'added';
  },

  discardPendingRawEdits() {
    this.clearPendingRawEdits();
    this.scheduleRender();
  },

  coerceRawCellValue(baseValue, newValue) {
    if (newValue === null || newValue === undefined) {
      return '';
    }
    if (typeof baseValue === 'number') {
      const normalised = String(newValue).replace(/,/g, '').trim();
      const parsed = Number(normalised);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    if (typeof baseValue === 'boolean') {
      const lower = String(newValue).trim().toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return newValue;
  },

  applyPendingRawEditsToDataset() {
    const currentData = this.state?.csvData;
    if (!currentData || !Array.isArray(currentData.data)) {
      return null;
    }
    if (!this.hasPendingRawEdits()) {
      return currentData.data;
    }
    const cloned = currentData.data.map(row => ({ ...row }));
    for (const [key, updates] of this.pendingRawEdits.entries()) {
      const rowIndex = Number(key);
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= cloned.length) {
        continue;
      }
      const originalRow = cloned[rowIndex];
      const sourceRow = currentData.data[rowIndex] || {};
      const nextRow = { ...originalRow };
      for (const [column, value] of Object.entries(updates)) {
        const coerced = this.coerceRawCellValue(sourceRow[column], value);
        nextRow[column] = coerced;
      }
      cloned[rowIndex] = nextRow;
    }
    return cloned;
  },

  updateRawEditControls() {
    if (typeof document === 'undefined' || !this.isConnected) {
      return;
    }
    const saveButton = this.querySelector('[data-raw-save]');
    const discardButton = this.querySelector('[data-raw-discard]');
    const label = this.querySelector('[data-raw-unsaved-label]');
    const count = this.getPendingRawEditCount();
    const hasEdits = count > 0;

    if (saveButton) {
      saveButton.disabled = !hasEdits;
      saveButton.classList.toggle('opacity-60', !hasEdits);
      saveButton.classList.toggle('cursor-not-allowed', !hasEdits);
      saveButton.classList.toggle('hover:bg-blue-700', hasEdits);
    }
    if (discardButton) {
      discardButton.disabled = !hasEdits;
      discardButton.classList.toggle('opacity-40', !hasEdits);
      discardButton.classList.toggle('cursor-not-allowed', !hasEdits);
      discardButton.classList.toggle('hover:text-slate-700', hasEdits);
    }
    if (label) {
      label.textContent = hasEdits
        ? `${count} unsaved ${count === 1 ? 'cell' : 'cells'}`
        : 'No unsaved changes';
      label.classList.toggle('text-amber-600', hasEdits);
      label.classList.toggle('text-slate-500', !hasEdits);
    }
  },

  getProcessedRawData(dataSource) {
    const { rawDataFilter, rawDataWholeWord, rawDataSort } = this.state;
    if (!dataSource || !Array.isArray(dataSource.data)) {
      return [];
    }
    let rows = [...dataSource.data];

    if (rawDataFilter) {
      if (rawDataWholeWord) {
        const escaped = rawDataFilter.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        rows = rows.filter(row =>
          Object.values(row).some(value => regex.test(String(value)))
        );
      } else {
        const needle = rawDataFilter.toLowerCase();
        rows = rows.filter(row =>
          Object.values(row).some(value =>
            String(value).toLowerCase().includes(needle)
          )
        );
      }
    }

    if (rawDataSort && rawDataSort.key) {
      const { key, direction } = rawDataSort;
      const asc = direction === 'ascending';
      rows.sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (!Number.isNaN(Number(aValue)) && !Number.isNaN(Number(bValue))) {
          const delta = Number(aValue) - Number(bValue);
          return asc ? delta : -delta;
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        if (aStr < bStr) return asc ? -1 : 1;
        if (aStr > bStr) return asc ? 1 : -1;
        return 0;
      });
    }

    return rows;
  },

  processRawCellChange(cell, options = {}) {
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const { commit = false } = options || {};
    const rowIndexRaw = cell.dataset.rowIndex;
    const columnKey = cell.dataset.colKey;
    if (columnKey === undefined) {
      return;
    }
    const rowIndex = Number(rowIndexRaw);
    const newValue = this.normalizeRawCellValue(cell.textContent);
    if (commit && cell.textContent !== newValue) {
      cell.textContent = newValue;
    }
    const action = this.setPendingRawEdit(rowIndex, columnKey, newValue);
    if (action === 'added') {
      cell.classList.add('bg-amber-50', 'ring-2', 'ring-amber-200', 'rounded-sm', 'shadow-inner');
      cell.setAttribute('data-edited', 'true');
    } else if (action === 'removed') {
      cell.classList.remove('bg-amber-50', 'ring-2', 'ring-amber-200', 'rounded-sm', 'shadow-inner');
      cell.removeAttribute('data-edited');
    }
    cell.dataset.currentValue = newValue;
  },

  resetRawCellToBaseValue(cell) {
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const rowIndex = Number(cell.dataset.rowIndex);
    const columnKey = cell.dataset.colKey;
    const baseValue = this.getBaseRawValue(rowIndex, columnKey);
    const baseString = baseValue === null || baseValue === undefined ? '' : String(baseValue);
    cell.textContent = baseString;
    cell.dataset.currentValue = baseString;
    this.setPendingRawEdit(rowIndex, columnKey, baseString);
    cell.classList.remove('bg-amber-50', 'ring-2', 'ring-amber-200', 'rounded-sm', 'shadow-inner');
    cell.removeAttribute('data-edited');
  },

  handleRawCellInput(event) {
    const cell = event.currentTarget;
    this.processRawCellChange(cell);
  },

  handleRawCellBlur(event) {
    const cell = event.currentTarget;
    this.processRawCellChange(cell, { commit: true });
  },

  handleRawCellKeydown(event) {
    const cell = event.currentTarget;
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      cell.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.resetRawCellToBaseValue(cell);
      cell.blur();
    }
  },
};
