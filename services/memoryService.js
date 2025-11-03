import { embedText, cosineSimilarity } from './ragService.js';
import {
  saveMemoryEntry,
  getMemoriesByDataset,
  pruneMemoriesByDataset,
} from '../storageService.js';

const MAX_MEMORIES_PER_DATASET = 200;

const sanitizeText = text => {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
};

export const storeMemory = async (datasetId, payload) => {
  const text = sanitizeText(payload.text || payload.summary || '');
  if (!text) return null;
  const embedding = embedText(text);
  const entry = {
    id: payload.id,
    datasetId,
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
  await pruneMemoriesByDataset(datasetId, MAX_MEMORIES_PER_DATASET);
  return saved;
};

export const retrieveRelevantMemories = async (datasetId, query, limit = 5) => {
  const text = sanitizeText(query);
  if (!text) return [];
  const embedding = embedText(text);
  if (!embedding || !embedding.norm) return [];
  const memories = await getMemoriesByDataset(datasetId);
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
