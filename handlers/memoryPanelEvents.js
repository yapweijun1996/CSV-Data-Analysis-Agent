/**
 * 綁定記憶面板的互動事件。
 *
 * @param {HTMLElement & {
 *   state: any;
 *   closeMemoryPanel: () => void;
 *   handleMemoryClear: () => void;
 *   refreshMemoryDocuments: () => void;
 *   setState: (updater: any) => void;
 *   searchMemoryPanel: (query: string) => void;
 *   focusMemoryDocument: (id: string | null) => void;
 *   handleMemoryDelete: (id: string | null) => void;
 * }} app
 */
export const bindMemoryPanelEvents = app => {
  if (!app || typeof app.querySelector !== 'function') {
    return;
  }
  if (!app.state?.isMemoryPanelOpen) {
    return;
  }

  const overlay = app.querySelector('[data-memory-overlay]');
  if (overlay) {
    overlay.addEventListener('click', () => app.closeMemoryPanel());
  }

  const panel = app.querySelector('[data-memory-panel]');
  if (panel) {
    panel.addEventListener('click', event => event.stopPropagation());
  }

  const closeBtn = app.querySelector('[data-memory-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => app.closeMemoryPanel());
  }

  const clearBtn = app.querySelector('[data-memory-clear-all]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => app.handleMemoryClear());
  }

  const refreshBtn = app.querySelector('[data-memory-refresh]');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      app.refreshMemoryDocuments({ showSpinner: true });
    });
  }

  const searchInput = app.querySelector('[data-memory-search-input]');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      const value = event.target?.value ?? '';
      app.setState({ memoryPanelQuery: value });
    });
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        const value = event.target?.value ?? '';
        app.searchMemoryPanel(value);
      }
    });
    if (typeof HTMLElement !== 'undefined' && searchInput instanceof HTMLElement) {
      if (!searchInput.disabled) {
        searchInput.focus();
        searchInput.setSelectionRange?.(searchInput.value.length, searchInput.value.length);
      }
    }
  }

  const searchButton = app.querySelector('[data-memory-search]');
  if (searchButton) {
    searchButton.addEventListener('click', () => {
      const input = app.querySelector('[data-memory-search-input]');
      const value = input?.value || '';
      app.searchMemoryPanel(value);
    });
  }

  const deleteButtons = app.querySelectorAll('[data-memory-delete]');
  deleteButtons.forEach(btn => {
    const id = btn.getAttribute('data-memory-delete');
    btn.addEventListener('click', () => {
      app.handleMemoryDelete(id);
    });
  });

  const resultButtons = app.querySelectorAll('[data-memory-search-result]');
  resultButtons.forEach(btn => {
    const docId = btn.getAttribute('data-memory-search-result');
    btn.addEventListener('click', () => {
      if (docId) {
        app.focusMemoryDocument(docId);
      }
    });
  });
};
