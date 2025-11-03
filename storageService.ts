
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AppState, Settings, Report, ReportListItem } from './types';

const DB_NAME = 'csv-ai-assistant-db';
const REPORTS_STORE_NAME = 'reports';
const SETTINGS_KEY = 'csv-ai-assistant-settings';
export const CURRENT_SESSION_KEY = 'current_session';

interface MyDB extends DBSchema {
  [REPORTS_STORE_NAME]: {
    key: string;
    value: Report;
    indexes: { 'updatedAt': Date };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>>;

const getDb = (): Promise<IDBPDatabase<MyDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, 2, {
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

// Report History Management
export const saveReport = async (report: Report): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(REPORTS_STORE_NAME, report);
  } catch (error) {
    console.error('Failed to save report to IndexedDB:', error);
  }
};

export const getReport = async (id: string): Promise<Report | undefined> => {
  try {
    const db = await getDb();
    return await db.get(REPORTS_STORE_NAME, id);
  } catch (error)
    {
    console.error('Failed to get report from IndexedDB:', error);
    return undefined;
  }
};

export const getReportsList = async (): Promise<ReportListItem[]> => {
    try {
        const db = await getDb();
        // Get all reports from the 'updatedAt' index to sort them by most recent
        const allReports = await db.getAllFromIndex(REPORTS_STORE_NAME, 'updatedAt');
        return allReports
            // Sort descending (most recent first)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .map(({ id, filename, createdAt, updatedAt }) => ({ id, filename, createdAt, updatedAt }));
    } catch (error) {
        console.error('Failed to get reports list from IndexedDB:', error);
        return [];
    }
}

export const deleteReport = async (id: string): Promise<void> => {
    try {
        const db = await getDb();
        await db.delete(REPORTS_STORE_NAME, id);
    } catch (error) {
        console.error('Failed to delete report from IndexedDB:', error);
    }
};

// Settings Management
const defaultSettings: Settings = {
    provider: 'google',
    geminiApiKey: '',
    openAIApiKey: '',
    model: 'gemini-2.5-pro',
    language: 'English'
};

export const saveSettings = (settings: Settings): void => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error('Failed to save settings to localStorage:', error);
    }
};

export const getSettings = (): Settings => {
    try {
        const settingsJson = localStorage.getItem(SETTINGS_KEY);
        if (settingsJson) {
            const savedSettings = JSON.parse(settingsJson);
            // Migration for old settings with 'apiKey'
            if (savedSettings.apiKey && !savedSettings.geminiApiKey) {
                savedSettings.geminiApiKey = savedSettings.apiKey;
                delete savedSettings.apiKey;
            }
            return { ...defaultSettings, ...savedSettings };
        }
    } catch (error) {
        console.error('Failed to get settings from localStorage:', error);
    }
    return defaultSettings;
};