const idbGlobal = typeof window !== 'undefined' ? window.idb : null;

if (!idbGlobal) {
  console.warn('The idb helper is not available; report history and settings will not persist to IndexedDB.');
}

const DB_NAME = 'csv-ai-assistant-db';
const REPORTS_STORE_NAME = 'reports';
const MEMORY_STORE_NAME = 'memories';
const SETTINGS_KEY = 'csv-ai-assistant-settings';
export const CURRENT_SESSION_KEY = 'current_session';

let dbPromise;

const getDb = async () => {
  if (!idbGlobal) {
    throw new Error('IndexedDB helper (idb) is not loaded.');
  }

  if (!dbPromise) {
    dbPromise = idbGlobal.openDB(DB_NAME, 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(REPORTS_STORE_NAME)) {
            const store = db.createObjectStore(REPORTS_STORE_NAME, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt');
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(MEMORY_STORE_NAME)) {
            const memoryStore = db.createObjectStore(MEMORY_STORE_NAME, { keyPath: 'id' });
            memoryStore.createIndex('datasetId', 'datasetId');
            memoryStore.createIndex('updatedAt', 'updatedAt');
          }
        }
      },
    });
  }
  return dbPromise;
};

export const saveReport = async report => {
  try {
    const db = await getDb();
    await db.put(REPORTS_STORE_NAME, report);
  } catch (error) {
    console.error('Failed to save report to IndexedDB:', error);
  }
};

export const getReport = async id => {
  try {
    const db = await getDb();
    return await db.get(REPORTS_STORE_NAME, id);
  } catch (error) {
    console.error('Failed to get report from IndexedDB:', error);
    return undefined;
  }
};

export const getReportsList = async () => {
  try {
    const db = await getDb();
    const allReports = await db.getAllFromIndex(REPORTS_STORE_NAME, 'updatedAt');
    return allReports
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(({ id, filename, createdAt, updatedAt }) => ({
        id,
        filename,
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
      }));
  } catch (error) {
    console.error('Failed to get reports list from IndexedDB:', error);
    return [];
  }
};

export const deleteReport = async id => {
  try {
    const db = await getDb();
    await db.delete(REPORTS_STORE_NAME, id);
  } catch (error) {
    console.error('Failed to delete report from IndexedDB:', error);
  }
};

const ensureDatasetId = datasetId => datasetId || 'default_dataset';

export const saveMemoryEntry = async entry => {
  const payload = {
    ...entry,
    id: entry.id || `${entry.datasetId || 'session'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    datasetId: ensureDatasetId(entry.datasetId),
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
    createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
  };
  try {
    const db = await getDb();
    await db.put(MEMORY_STORE_NAME, payload);
    return payload;
  } catch (error) {
    console.error('Failed to save memory entry to IndexedDB:', error);
    return null;
  }
};

export const getMemoriesByDataset = async datasetId => {
  try {
    const db = await getDb();
    const store = db.transaction(MEMORY_STORE_NAME).store;
    const index = store.index('datasetId');
    const targetId = ensureDatasetId(datasetId);
    return await index.getAll(targetId);
  } catch (error) {
    console.error('Failed to read memories from IndexedDB:', error);
    return [];
  }
};

export const pruneMemoriesByDataset = async (datasetId, maxEntries = 200) => {
  try {
    const db = await getDb();
    const targetId = ensureDatasetId(datasetId);
    const txn = db.transaction(MEMORY_STORE_NAME, 'readwrite');
    const index = txn.store.index('datasetId');
    const records = await index.getAll(targetId);
    if (records.length <= maxEntries) {
      await txn.done;
      return;
    }
    records
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, Math.max(0, records.length - maxEntries))
      .forEach(record => {
        txn.store.delete(record.id);
      });
    await txn.done;
  } catch (error) {
    console.error('Failed to prune memories in IndexedDB:', error);
  }
};

const defaultSettings = {
  provider: 'google',
  geminiApiKey: '',
  openAIApiKey: '',
  model: 'gemini-2.5-pro',
  language: 'English',
};

export const saveSettings = settings => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to localStorage:', error);
  }
};

export const getSettings = () => {
  try {
    const settingsJson = localStorage.getItem(SETTINGS_KEY);
    if (settingsJson) {
      const savedSettings = JSON.parse(settingsJson);
      if (savedSettings.apiKey && !savedSettings.geminiApiKey) {
        savedSettings.geminiApiKey = savedSettings.apiKey;
        delete savedSettings.apiKey;
      }
      return { ...defaultSettings, ...savedSettings };
    }
  } catch (error) {
    console.error('Failed to get settings from localStorage:', error);
  }
  return { ...defaultSettings };
};
