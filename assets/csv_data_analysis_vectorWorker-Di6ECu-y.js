const isSameReportMemoryScope = (candidate, expected) => Boolean(
  candidate && expected && candidate.reportId === expected.reportId && candidate.datasetId === expected.datasetId && candidate.datasetVersion === expected.datasetVersion
);
const VECTOR_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const HUGGINGFACE_CDN_HOST = "https://huggingface.co";
const HUGGINGFACE_CDN_PATH_TEMPLATE = "{model}/resolve/{revision}/";
const HUGGINGFACE_CDN_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
const ctx = self;
let embedder = null;
let documents = [];
const DEFAULT_MAX_DOCUMENTS = 5e4;
let maxDocuments = DEFAULT_MAX_DOCUMENTS;
const accessTimestamps = /* @__PURE__ */ new Map();
const evictIfNeeded = () => {
  if (documents.length <= maxDocuments) return 0;
  const excess = documents.length - maxDocuments;
  const sorted = [...accessTimestamps.entries()].sort((a, b) => a[1] - b[1]).slice(0, excess);
  const evictIds = new Set(sorted.map(([id]) => id));
  documents = documents.filter((d) => !evictIds.has(d.id));
  for (const [id] of sorted) accessTimestamps.delete(id);
  if (evictIds.size > 0) {
    console.log(`[VectorWorker] Evicted ${evictIds.size} LRU documents. Count: ${documents.length}/${maxDocuments}`);
  }
  return evictIds.size;
};
let isInitialized = false;
let permanentlyFailed = false;
let initializationPromise = null;
let lastProgressUpdate = 0;
let lastReportedTotal = 0;
let workerStatus = "idle";
let lastError = null;
const emitProgress = (message) => {
  ctx.postMessage({ type: "progress", message });
};
const emitStatus = (status, error) => {
  workerStatus = status;
  lastError = error ?? null;
  ctx.postMessage({ type: "status", status, error });
};
const respond = (id, success, result, error) => {
  ctx.postMessage({ id, success, result, error });
};
const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
const handleInit = async () => {
  if (isInitialized || permanentlyFailed) return;
  if (initializationPromise) {
    await initializationPromise;
    return;
  }
  const initialization = async () => {
    var _a;
    emitStatus("loading");
    emitProgress("Loading AI memory model from CDN...");
    const transformers = await import("./csv_data_analysis_transformers.web-DBa1zjpU.js");
    const { env, pipeline } = transformers;
    const loadPipeline = pipeline;
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.localModelPath = "";
    if ((_a = env.backends.onnx) == null ? void 0 : _a.wasm) {
      env.backends.onnx.wasm.wasmPaths = HUGGINGFACE_CDN_WASM_PATH;
    }
    env.remoteHost = HUGGINGFACE_CDN_HOST;
    env.remotePathTemplate = HUGGINGFACE_CDN_PATH_TEMPLATE;
    embedder = await loadPipeline("feature-extraction", VECTOR_MODEL_ID, {
      progress_callback: (progress) => {
        if (progress.status === "progress" && progress.total > 0) {
          if (progress.total < lastReportedTotal) return;
          lastReportedTotal = progress.total;
          const now = Date.now();
          if (now - lastProgressUpdate < 250 && progress.loaded < progress.total) return;
          lastProgressUpdate = now;
          const loaded = (progress.loaded / 1024 / 1024).toFixed(2);
          const total = (progress.total / 1024 / 1024).toFixed(2);
          emitProgress(`Loading AI memory model: ${loaded}MB / ${total}MB`);
        }
      },
      local_files_only: false,
      dtype: "q8"
    });
    emitProgress("AI memory model loaded.");
    isInitialized = true;
    emitStatus("ready");
  };
  initializationPromise = initialization().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[VectorWorker] Failed to initialize:", error);
    isInitialized = false;
    permanentlyFailed = true;
    emitStatus("error", message);
    throw error;
  }).finally(() => {
    initializationPromise = null;
  });
  await initializationPromise;
};
const handleAddDocument = async (payload) => {
  if (!embedder) {
    if (permanentlyFailed) return;
    if (!isInitialized) return;
    await handleInit();
    if (!embedder) return;
  }
  const embedding = await embedder(payload.text, { pooling: "mean", normalize: true });
  const newDoc = {
    ...payload,
    embedding: Array.from(embedding.data)
  };
  const existingIndex = documents.findIndex((d) => d.id === payload.id);
  if (existingIndex > -1) {
    documents[existingIndex] = newDoc;
  } else {
    documents.push(newDoc);
  }
  accessTimestamps.set(payload.id, Date.now());
  evictIfNeeded();
};
const handleAddDocumentBatch = async (payload) => {
  if (!embedder) {
    if (permanentlyFailed) return { count: 0 };
    if (!isInitialized) return { count: 0 };
    await handleInit();
    if (!embedder) return { count: 0 };
  }
  let count = 0;
  for (const doc of payload.docs) {
    try {
      const embedding = await embedder(doc.text, { pooling: "mean", normalize: true });
      const newDoc = {
        ...doc,
        embedding: Array.from(embedding.data)
      };
      const existingIndex = documents.findIndex((d) => d.id === doc.id);
      if (existingIndex > -1) {
        documents[existingIndex] = newDoc;
      } else {
        documents.push(newDoc);
      }
      accessTimestamps.set(doc.id, Date.now());
      count++;
    } catch (error) {
      console.error(`[VectorWorker] Failed to embed document ${doc.id}:`, error);
    }
  }
  evictIfNeeded();
  return { count };
};
const handleSearch = async (payload) => {
  if (!embedder) {
    if (permanentlyFailed) return [];
    await handleInit();
  }
  if (!embedder || documents.length === 0) return [];
  const embedStart = Date.now();
  const queryEmbedding = await embedder(payload.queryText, { pooling: "mean", normalize: true });
  const queryVector = Array.from(queryEmbedding.data);
  const embedMs = Date.now() - embedStart;
  const searchStart = Date.now();
  const eligibleDocuments = payload.scope ? documents.filter((document) => {
    var _a;
    return isSameReportMemoryScope((_a = document.metadata) == null ? void 0 : _a.scope, payload.scope);
  }) : documents;
  const results = eligibleDocuments.map((doc) => ({
    id: doc.id,
    text: doc.text,
    score: cosineSimilarity(queryVector, doc.embedding),
    metadata: doc.metadata
  })).filter((r) => r.score > 0.5).sort((a, b) => b.score - a.score).slice(0, payload.k);
  const searchMs = Date.now() - searchStart;
  if (embedMs + searchMs > 50) {
    console.warn(
      `[VectorWorker] ⚠ Slow search: embed=${embedMs}ms, similarity=${searchMs}ms | docs=${eligibleDocuments.length}/${documents.length}, results=${results.length}`
    );
  }
  const now = Date.now();
  for (const r of results) {
    accessTimestamps.set(r.id, now);
  }
  return results;
};
const handleRehydrate = (payload) => {
  documents = payload.documents;
  accessTimestamps.clear();
  const now = Date.now();
  documents.forEach((d, i) => accessTimestamps.set(d.id, now - (documents.length - i)));
  evictIfNeeded();
};
const handleClear = () => {
  documents = [];
  accessTimestamps.clear();
};
const handleDeleteDocument = (payload) => {
  const initialLength = documents.length;
  documents = documents.filter((doc) => doc.id !== payload.id);
  accessTimestamps.delete(payload.id);
  return documents.length < initialLength;
};
const handleGetDocuments = () => {
  return [...documents];
};
const handleGetDocumentCount = () => {
  return documents.length;
};
const handleGetStatus = () => ({
  status: workerStatus,
  isInitialized,
  permanentlyFailed,
  documentCount: documents.length,
  maxDocuments,
  lastError
});
ctx.onmessage = async (event) => {
  const { id, task, payload } = event.data;
  try {
    let result;
    switch (task) {
      case "init":
        await handleInit();
        result = { initialized: true };
        break;
      case "addDocument":
        await handleAddDocument(payload);
        result = { added: true };
        break;
      case "addDocumentBatch":
        result = await handleAddDocumentBatch(payload);
        break;
      case "deleteDocument":
        result = { deleted: handleDeleteDocument(payload) };
        break;
      case "search":
        result = await handleSearch(payload);
        break;
      case "rehydrate":
        handleRehydrate(payload);
        result = { count: documents.length };
        break;
      case "clear":
        handleClear();
        result = { cleared: true };
        break;
      case "getDocuments":
        result = handleGetDocuments();
        break;
      case "getDocumentCount":
        result = handleGetDocumentCount();
        break;
      case "getStatus":
        result = handleGetStatus();
        break;
      case "ping":
        result = { pong: true };
        break;
      case "configure":
        if (typeof (payload == null ? void 0 : payload.maxDocuments) === "number" && payload.maxDocuments > 0) {
          maxDocuments = payload.maxDocuments;
          evictIfNeeded();
        }
        result = { maxDocuments };
        break;
      default:
        respond(id, false, void 0, `Unknown task: ${task}`);
        return;
    }
    respond(id, true, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respond(id, false, void 0, message);
  }
};
