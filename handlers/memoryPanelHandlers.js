import { removeMemory, clearMemoryStore } from '../services/memoryService.js';
import { vectorStore } from '../services/vectorStore.js';
import { ENABLE_MEMORY_FEATURES } from '../services/memoryConfig.js';
import { ensureMemoryVectorReady } from '../services/memoryServiceHelpers.js';

const ensureMemoryEnabled = enableMemory => {
  const isEnabled = enableMemory ?? ENABLE_MEMORY_FEATURES;
  if (!isEnabled) {
    return false;
  }
  return true;
};

export const refreshMemoryDocuments = ({ app, enableMemory }) => {
  if (!app) return;
  if (!ensureMemoryEnabled(enableMemory)) {
    return;
  }
  const docs = vectorStore.getDocuments();
  app.setState(prev => ({
    memoryPanelDocuments: docs,
    memoryPanelHighlightedId: docs.some(doc => doc.id === prev.memoryPanelHighlightedId)
      ? prev.memoryPanelHighlightedId
      : null,
  }));
};

export const searchMemoryPanel = async ({ app, query, enableMemory }) => {
  if (!app) return;
  if (!ensureMemoryEnabled(enableMemory)) {
    return;
  }
  const text = typeof query === 'string' ? query : '';
  const trimmed = text.trim();
  app.setState({
    memoryPanelIsSearching: true,
    memoryPanelHighlightedId: null,
    memoryPanelQuery: text,
  });
  if (!trimmed) {
    if (text.length) {
      app.addProgress('Enter non-whitespace characters to search memories.', 'error');
    }
    app.setState({
      memoryPanelResults: [],
      memoryPanelIsSearching: false,
    });
    return;
  }
  await ensureMemoryVectorReady({ app });
  try {
    app.addProgress(`Searching memory for "${trimmed}"...`);
    const results = await vectorStore.search(trimmed, 5);
    app.setState({
      memoryPanelResults: results,
      memoryPanelIsSearching: false,
    });
    app.addProgress(
      results.length
        ? `Found ${results.length} matching memory item${results.length === 1 ? '' : 's'}.`
        : 'No stored memories matched that query.'
    );
  } catch (error) {
    console.warn('Memory search failed.', error);
    app.setState({
      memoryPanelResults: [],
      memoryPanelIsSearching: false,
    });
    app.addProgress('Unable to search memory right now.', 'error');
  }
};

export const handleMemoryDelete = async ({ app, id, enableMemory }) => {
  if (!app) return;
  if (!id) return;
  if (!ensureMemoryEnabled(enableMemory)) {
    return;
  }

  if (typeof window !== 'undefined' && !window.confirm('Delete this memory entry? This action cannot be undone.')) {
    return;
  }
  const success = await removeMemory(id);
  if (!success) {
    app.addProgress('Failed to delete memory entry.', 'error');
    return;
  }
  refreshMemoryDocuments({ app, enableMemory });
  app.setState(prev => ({
    memoryPanelResults: Array.isArray(prev.memoryPanelResults)
      ? prev.memoryPanelResults.filter(item => item.id !== id)
      : [],
    memoryPanelHighlightedId: prev.memoryPanelHighlightedId === id ? null : prev.memoryPanelHighlightedId,
  }));
};

export const handleMemoryClear = async ({ app, enableMemory }) => {
  if (!app) return;
  if (!ensureMemoryEnabled(enableMemory)) {
    return;
  }
  if (
    typeof window !== 'undefined' &&
    !window.confirm('Clear all memorised items for this assistant? This cannot be undone.')
  ) {
    return;
  }
  try {
    await clearMemoryStore();
    refreshMemoryDocuments({ app, enableMemory });
    app.setState({
      memoryPanelResults: [],
      memoryPanelHighlightedId: null,
      memoryPanelQuery: '',
    });
  } catch (error) {
    console.warn('Failed to clear memory store.', error);
    app.addProgress('Failed to clear AI memory entries.', 'error');
  }
};
