import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@latest';
import { embedText, cosineSimilarity as bowCosineSimilarity } from './ragService.js';

const HUGGING_FACE_BASE = 'https://huggingface.co';
const TRANSFORMER_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const TRANSFORMER_RESOLVE_BASE = `${HUGGING_FACE_BASE}/${TRANSFORMER_MODEL_ID}/resolve/main`;
const TRANSFORMER_CONFIG_URL = `${TRANSFORMER_RESOLVE_BASE}/config.json`;

const appendDownloadQuery = url => {
  if (typeof url !== 'string') return url;
  if (/[?&]download=1(?:$|&)/i.test(url)) {
    return url;
  }
  const [base, hash] = url.split('#');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}download=1${hash ? `#${hash}` : ''}`;
};

class VectorStore {
  constructor() {
    this.embedder = null;
    this.useLocalEmbeddings = false;
    this.documents = [];
    this.isInitializing = false;
    this.isInitialized = false;
    this.remoteFetchConfigured = false;
  }

  static getInstance() {
    if (!VectorStore.instance) {
      VectorStore.instance = new VectorStore();
    }
    return VectorStore.instance;
  }

  getIsInitialized() {
    return this.isInitialized;
  }

  async init(progressCallback) {
    if (this.isInitialized || this.isInitializing) return;
    this.isInitializing = true;

    try {
      this.embedder = await this.tryLoadTransformer(progressCallback);
      this.useLocalEmbeddings = !this.embedder;
      if (this.useLocalEmbeddings) {
        progressCallback?.('Falling back to lightweight local embeddings.');
      } else {
        progressCallback?.('AI memory model loaded.');
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      progressCallback?.(
        `Error loading AI memory model: ${error instanceof Error ? error.message : String(error)}`
      );
      await this.setLocalEmbeddingsMode(progressCallback);
      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  async addDocument(doc) {
    if (!doc || !doc.id || !doc.text) {
      console.warn('Invalid document payload. Skipping add/update.');
      return;
    }

    try {
      const embedding = await this.computeEmbedding(doc.text);
      if (!embedding) return;
      const newDoc = {
        ...doc,
        embedding,
      };
      const existingIndex = this.documents.findIndex(item => item.id === doc.id);
      if (existingIndex > -1) {
        this.documents[existingIndex] = newDoc;
      } else {
        this.documents.push(newDoc);
      }
    } catch (error) {
      console.error(`Failed to create embedding for document ${doc.id}:`, error);
    }
  }

  deleteDocument(id) {
    const initial = this.documents.length;
    this.documents = this.documents.filter(doc => doc.id !== id);
    return this.documents.length < initial;
  }

  getDocumentCount() {
    return this.documents.length;
  }

  getDocuments() {
    return [...this.documents];
  }

  clear() {
    this.documents = [];
  }

  async search(queryText, k = 5) {
    if (!this.documents.length || !queryText) {
      return [];
    }
    try {
      const queryEmbedding = await this.computeEmbedding(queryText);
      if (!queryEmbedding) {
        return [];
      }
      const results = this.documents.map(doc => ({
        text: doc.text,
        score: this.computeSimilarity(queryEmbedding, doc.embedding),
        id: doc.id,
        metadata: doc.metadata,
      }));
      return results
        .filter(result => result.score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    } catch (error) {
      console.error('Failed to perform vector search:', error);
      return [];
    }
  }

  async computeEmbedding(text) {
    if (!text) return null;
    if (!this.useLocalEmbeddings && this.embedder) {
      try {
        const embedding = await this.embedder(text, { pooling: 'mean', normalize: true });
        const values = Array.from(embedding.data || embedding);
        return {
          type: 'transformer',
          values,
        };
      } catch (error) {
        console.warn('Transformer embedding failed, falling back to lightweight embeddings.', error);
        await this.setLocalEmbeddingsMode();
      }
    }
    return this.buildLocalEmbedding(text);
  }

  computeSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a.type === 'transformer' && b.type === 'transformer') {
      const vecA = Array.isArray(a.values) ? a.values : [];
      const vecB = Array.isArray(b.values) ? b.values : [];
      if (!vecA.length || !vecB.length) return 0;
      const length = Math.min(vecA.length, vecB.length);
      let dot = 0;
      let normA = 0;
      let normB = 0;
      for (let index = 0; index < length; index += 1) {
        const valA = vecA[index];
        const valB = vecB[index];
        dot += valA * valB;
        normA += valA * valA;
        normB += valB * valB;
      }
      if (!normA || !normB) return 0;
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    const bowA =
      a.type === 'bow'
        ? a
        : {
            norm: Array.isArray(a.values) ? Math.sqrt(a.values.reduce((sum, value) => sum + value * value, 0)) : 0,
            weights: {},
          };
    const bowB =
      b.type === 'bow'
        ? b
        : {
            norm: Array.isArray(b.values) ? Math.sqrt(b.values.reduce((sum, value) => sum + value * value, 0)) : 0,
            weights: {},
          };
    return bowCosineSimilarity(bowA, bowB);
  }

  configureRemoteFetch() {
    if (this.remoteFetchConfigured) {
      return;
    }
    const baseFetch =
      typeof env.fetch === 'function'
        ? env.fetch.bind(globalThis)
        : typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : null;
    if (!baseFetch) {
      console.warn('Global fetch is unavailable; cannot configure remote model fetch override.');
      return;
    }
    env.fetch = async (url, options) => {
      const target = appendDownloadQuery(url);
      const response = await baseFetch(target, options);
      if (!response || !response.ok) {
        throw new Error(
          `Failed to download AI memory model asset (${response?.status ?? 'no status'}).`
        );
      }
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('AI memory model CDN returned HTML instead of the expected asset.');
      }
      return response;
    };
    this.remoteFetchConfigured = true;
  }

  async verifyRemoteModelAvailability(progressCallback) {
    try {
      progressCallback?.('Verifying AI memory model availability...');
      const remoteFetch =
        typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
          ? globalThis.fetch.bind(globalThis)
          : null;
      if (!remoteFetch) {
        throw new Error('Fetch API is not available in this environment.');
      }
      const response = await remoteFetch(appendDownloadQuery(TRANSFORMER_CONFIG_URL), {
        cache: 'no-cache',
        mode: 'cors',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers?.get?.('content-type') || '';
      const bodyText = await response.text();
      if (contentType.includes('text/html')) {
        throw new Error('Received HTML content instead of JSON configuration.');
      }
      JSON.parse(bodyText);
      return true;
    } catch (error) {
      console.warn('Remote model availability check failed.', error);
      progressCallback?.(
        'Unable to reach the Hugging Face model files. Continuing with lightweight embeddings.'
      );
      throw error;
    }
  }

  async tryLoadTransformer(progressCallback) {
    try {
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.remoteModelPath = HUGGING_FACE_BASE;
      this.configureRemoteFetch();
      await this.verifyRemoteModelAvailability(progressCallback);
      progressCallback?.('Downloading AI memory model from Hugging Face (~34MB)...');
      return await pipeline('feature-extraction', TRANSFORMER_MODEL_ID, {
        progress_callback: progress => {
          if (progress?.status === 'progress' && progress.total > 0) {
            const loaded = (progress.loaded / 1024 / 1024).toFixed(2);
            const total = (progress.total / 1024 / 1024).toFixed(2);
            progressCallback?.(`Downloading AI memory model: ${loaded}MB / ${total}MB`);
          }
        },
      });
    } catch (error) {
      const message =
        error instanceof Error && /json\.parse/i.test(error.message)
          ? 'Hugging Face returned a non-JSON response. Please confirm the model URL is accessible.'
          : error instanceof Error
          ? error.message
          : String(error);
      console.warn('Remote model load failed, switching to lightweight embeddings.', error);
      progressCallback?.(
        `Remote model load failed (${message}). Switching to lightweight embeddings.`
      );
    }
    return null;
  }

  buildLocalEmbedding(text) {
    const fallback = embedText(text);
    return {
      type: 'bow',
      weights: fallback.weights,
      norm: fallback.norm,
    };
  }

  async setLocalEmbeddingsMode(progressCallback) {
    if (this.useLocalEmbeddings) {
      return;
    }
    this.useLocalEmbeddings = true;
    this.embedder = null;
    progressCallback?.(
      'AI memory is now running in lightweight local mode. Check your network or model settings to restore full memory features.'
    );
    if (Array.isArray(this.documents) && this.documents.length) {
      this.documents = this.documents.map(doc => ({
        ...doc,
        embedding: this.buildLocalEmbedding(doc.text || ''),
      }));
    }
  }
}

VectorStore.instance = null;

export const vectorStore = VectorStore.getInstance();
