const idbGlobal = typeof window !== 'undefined' ? window.idb : null;

if (!idbGlobal) {
  console.warn('The idb helper is not available; report history and settings will not persist to IndexedDB.');
}

const DB_NAME = 'csv-ai-assistant-db';
const REPORTS_STORE_NAME = 'reports';
const SETTINGS_KEY = 'csv-ai-assistant-settings';
export const CURRENT_SESSION_KEY = 'current_session';

let dbPromise;

const getDb = async () => {
  if (!idbGlobal) {
    throw new Error('IndexedDB helper (idb) is not loaded.');
  }

  if (!dbPromise) {
    dbPromise = idbGlobal.openDB(DB_NAME, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(REPORTS_STORE_NAME)) {
            const store = db.createObjectStore(REPORTS_STORE_NAME, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt');
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
