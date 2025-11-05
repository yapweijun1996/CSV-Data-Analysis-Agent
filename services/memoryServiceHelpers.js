import { initMemoryVectorStore } from './memoryService.js';
import { ENABLE_MEMORY_FEATURES } from './memoryConfig.js';

const getProgressCallback = (app, progressCallback) => {
  if (typeof progressCallback === 'function') {
    return progressCallback;
  }
  if (app && typeof app.addProgress === 'function') {
    return message => app.addProgress(message);
  }
  return () => {};
};

/**
 * Ensure the memory vector store is initialised.
 *
 * @param {object} params
 * @param {any} params.app
 * @param {(message: string) => void} [params.progressCallback]
 * @returns {Promise<boolean>}
 */
export const ensureMemoryVectorReady = async ({ app, progressCallback } = {}) => {
  if (!ENABLE_MEMORY_FEATURES) {
    return false;
  }
  if (app?.memoryVectorReady) {
    return true;
  }
  const callback = getProgressCallback(app, progressCallback);
  const initialised = await initMemoryVectorStore(callback);
  if (app) {
    app.memoryVectorReady = Boolean(initialised);
  }
  return Boolean(initialised);
};
