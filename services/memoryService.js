import { embedText, cosineSimilarity } from './ragService.js';
import { vectorStore } from './vectorStore.js';
import {
  saveMemoryEntry,
  getMemoriesByDataset,
  pruneMemoriesByDataset,
  deleteMemoryEntry,
  clearAllMemories,
} from '../storageService.js';

const MAX_MEMORIES_PER_DATASET = 200;
const ensureDatasetId = datasetId => datasetId || 'default_dataset';

const sanitizeText = text => {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
};

export const initMemoryVectorStore = async progressCallback => {
  try {
    await vectorStore.init(progressCallback);
  } catch (error) {
    console.error('Vector store initialization failed:', error);
  }
  return vectorStore.getIsInitialized();
};

export const clearMemoryVectorStore = () => {
  vectorStore.clear();
};

export const storeMemory = async (datasetId, payload) => {
  const text = sanitizeText(payload.text || payload.summary || '');
  if (!text) return null;
  const embedding = embedText(text);
  const entry = {
    id: payload.id,
    datasetId: ensureDatasetId(datasetId),
    kind: payload.kind || 'note',
    intent: payload.intent || 'unknown',
    text,
    summary: payload.summary || text.slice(0, 180),
    metadata: payload.metadata || {},
    embedding,
    createdAt: payload.createdAt || new Date(),
    updatedAt: payload.updatedAt || new Date(),
  };
  const saved = await saveMemoryEntry(entry);
  await pruneMemoriesByDataset(entry.datasetId, MAX_MEMORIES_PER_DATASET);

  if (saved && vectorStore.getIsInitialized()) {
    try {
      await vectorStore.addDocument({
        id: saved.id,
        text: saved.text,
        metadata: {
          datasetId: saved.datasetId,
          kind: saved.kind,
          intent: saved.intent,
          summary: saved.summary,
          metadata: saved.metadata,
          createdAt: saved.createdAt instanceof Date ? saved.createdAt.toISOString() : saved.createdAt,
        },
      });
    } catch (error) {
      console.warn('Failed to store vector memory document.', error);
    }
  }

  return saved;
};

export const removeMemory = async id => {
  if (!id) return false;
  let didDelete = false;
  try {
    didDelete = await deleteMemoryEntry(id);
  } catch (error) {
    console.error('Failed to delete memory entry from IndexedDB:', error);
  }
  if (vectorStore.getIsInitialized()) {
    vectorStore.deleteDocument(id);
  }
  return didDelete;
};

export const clearMemoryStore = async () => {
  await clearAllMemories();
  vectorStore.clear();
};

export const retrieveRelevantMemories = async (datasetId, query, limit = 5) => {
  const text = sanitizeText(query);
  if (!text) return [];
  const targetDatasetId = ensureDatasetId(datasetId);

  if (vectorStore.getIsInitialized() && vectorStore.getDocumentCount() > 0) {
    try {
      const vectorResults = await vectorStore.search(text, Math.max(limit * 2, 5));
      const filteredVectorResults = vectorResults
        .filter(result => {
          const docDatasetId = result.metadata?.datasetId;
          return !docDatasetId || docDatasetId === targetDatasetId;
        })
        .slice(0, limit);
      if (filteredVectorResults.length) {
        return filteredVectorResults.map(result => ({
          id: result.id || null,
          text: result.text,
          summary:
            result.metadata?.summary ||
            (typeof result.text === 'string' ? result.text.slice(0, 220) : ''),
          kind: result.metadata?.kind || 'note',
          intent: result.metadata?.intent || 'unknown',
          metadata: result.metadata?.metadata || {},
          createdAt: result.metadata?.createdAt ? new Date(result.metadata.createdAt) : new Date(),
          score: result.score,
        }));
      }
    } catch (error) {
      console.warn('Vector memory search failed, falling back to local scoring.', error);
    }
  }

  const embedding = embedText(text);
  if (!embedding || !embedding.norm) return [];
  const memories = await getMemoriesByDataset(targetDatasetId);
  if (!memories.length) return [];

  const scored = memories
    .map(memory => {
      const similarity = cosineSimilarity(embedding, memory.embedding || { weights: {}, norm: 0 });
      return {
        id: memory.id,
        text: memory.text,
        summary: memory.summary,
        kind: memory.kind,
        intent: memory.intent,
        metadata: memory.metadata,
        createdAt: memory.createdAt,
        score: similarity,
      };
    })
    .filter(item => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return scored;
};
