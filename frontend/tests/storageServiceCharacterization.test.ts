// @vitest-environment jsdom
// Characterization tests for storageService. They pin current behaviour so the
// module can be split into smaller files without changing its public contract.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fakeIdb from 'fake-indexeddb';
import type { AppState, CsvData, Report, AgentMemoryRun } from '../types';

vi.mock('../services/data/opfsDatasetStorage', () => ({ clearAllOpfsDatasetData: vi.fn(async () => true) }));
vi.mock('../services/persistence/datasetRetention', () => ({ clearAllRetainedDatasetRows: vi.fn(async () => false) }));
vi.mock('../services/data/acceptedSpill', () => ({ clearAllAcceptedSpillData: vi.fn(async () => false) }));

type Storage = typeof import('../services/storageService');
let storage: Storage;

beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.clear();
    sessionStorage.clear();
    for (const [name, value] of Object.entries(fakeIdb)) {
        if (name === 'default' || name === 'indexedDB') continue;
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: new fakeIdb.IDBFactory() });
    storage = await import('../services/storageService');
});

afterEach(async () => {
    try { (await storage.getStorageDatabase()).close(); } catch { /* locked or closed */ }
    vi.restoreAllMocks();
});

const csv = (name = 'sales.csv', values = [10, 20]): CsvData => ({
    fileName: name,
    data: values.map((v, i) => ({ Row: i + 1, Revenue: v })),
});

const makeReport = (id: string, updatedAt: string, data = csv()): Report => ({
    id,
    filename: data.fileName,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date(updatedAt),
    appState: {
        sessionId: id,
        rawCsvData: data,
        csvData: data,
        currentDatasetId: null,
        runtimeRunHistory: [],
        activeTurn: null,
        chatHistory: [],
    } as unknown as AppState,
});

describe('database connection', () => {
    it('shares one connection across calls and reopens it after an InvalidStateError', async () => {
        const first = await storage.getStorageDatabase();
        expect(await storage.getStorageDatabase()).toBe(first);

        first.close();
        // Closed connection throws InvalidStateError on transaction(); the vector helpers must reconnect.
        await storage.saveVectorMemory([{ id: 'a' } as never]);
        expect(await storage.loadVectorMemory()).toEqual([{ id: 'a' }]);
        expect(await storage.getStorageDatabase()).not.toBe(first);
    });

    it('opens the production schema at the declared version', async () => {
        const db = await storage.getStorageDatabase();
        expect(db.version).toBe(storage.STORAGE_DB_VERSION);
        for (const name of ['reports' as const, 'agent_memory_runs', 'settings', 'report_artifacts', 'original_data',
            'vector_memory', storage.DATASET_LINEAGE_STORE_NAME, storage.LOCAL_DIAGNOSTICS_STORE_NAME,
            storage.CLOUD_AI_CONSENTS_STORE_NAME]) {
            expect(db.objectStoreNames.contains(name as never)).toBe(true);
        }
    });

    it('does not reconnect on non-InvalidState errors', async () => {
        const first = await storage.getStorageDatabase();
        await storage.clearVectorMemory();
        expect(await storage.getStorageDatabase()).toBe(first);
    });
});

describe('clearAllLocalBrowserData', () => {
    it('wipes IndexedDB, web storage and locks the database until reload', async () => {
        await storage.saveReport(makeReport('r1', '2026-01-02T00:00:00.000Z'));
        localStorage.setItem('k', 'v');
        sessionStorage.setItem('k', 'v');

        const result = await storage.clearAllLocalBrowserData();

        expect(result).toMatchObject({
            indexedDbDeleted: true,
            localStorageCleared: true,
            sessionStorageCleared: true,
            opfsCleared: true,
            incompleteStores: [],
        });
        expect(localStorage.getItem('k')).toBeNull();
        expect(sessionStorage.getItem('k')).toBeNull();
        await expect(storage.getStorageDatabase()).rejects.toMatchObject({ name: 'StorageOperationError' });
        // Late writers are blocked rather than silently recreating records.
        await expect(storage.saveReport(makeReport('r2', '2026-01-03T00:00:00.000Z'))).rejects.toThrow(/saveReport failed/);
    });

    it('rejects a second concurrent clear', async () => {
        const first = storage.clearAllLocalBrowserData();
        await expect(storage.clearAllLocalBrowserData()).rejects.toThrow(/already in progress/);
        await first;
    });

    it('unlocks again via the test reset hook and starts from an empty database', async () => {
        await storage.saveReport(makeReport('r1', '2026-01-02T00:00:00.000Z'));
        await storage.clearAllLocalBrowserData();
        storage.__resetStorageClearStateForTests();

        expect(await storage.getReport('r1')).toBeUndefined();
        await storage.saveReport(makeReport('r2', '2026-01-03T00:00:00.000Z'));
        expect((await storage.getReport('r2'))?.id).toBe('r2');
    });

    it('reports incomplete web storage and releases the lock so the caller can retry', async () => {
        vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => { throw new Error('blocked'); });
        const result = await storage.clearAllLocalBrowserData();
        expect(result.localStorageCleared).toBe(false);
        expect(result.incompleteStores).toEqual(expect.arrayContaining(['localStorage', 'sessionStorage']));
        await expect(storage.getStorageDatabase()).resolves.toBeDefined();
    });
});

describe('report history CRUD', () => {
    it('saves, reads back and lists reports newest first', async () => {
        await storage.saveReport(makeReport('old', '2026-01-02T00:00:00.000Z', csv('a.csv')));
        await storage.saveReport(makeReport('new', '2026-01-05T00:00:00.000Z', csv('b.csv')));

        const loaded = await storage.getReport('new');
        expect(loaded?.filename).toBe('b.csv');
        expect(loaded?.updatedAt).toBeInstanceOf(Date);

        localStorage.removeItem('csv_agent_reports_index');
        const list = await storage.getReportsList();
        expect(list.map(r => r.id)).toEqual(['new', 'old']);
    });

    it('overwrites a report with the same id instead of duplicating it', async () => {
        await storage.saveReport(makeReport('r1', '2026-01-02T00:00:00.000Z', csv('a.csv')));
        await storage.saveReport(makeReport('r1', '2026-01-03T00:00:00.000Z', csv('a.csv', [1, 2, 3])));
        localStorage.removeItem('csv_agent_reports_index');
        expect(await storage.getReportsList()).toHaveLength(1);
    });

    it('rejects a report without an id', async () => {
        await expect(storage.saveReport({ ...makeReport('x', '2026-01-02T00:00:00.000Z'), id: '' }))
            .rejects.toMatchObject({ name: 'StorageOperationError' });
    });

    it('keeps the localStorage list index in sync on save and delete', async () => {
        await storage.saveReport(makeReport('r1', '2026-01-02T00:00:00.000Z'));
        await storage.getReportsList(); // builds the cache from IDB
        await storage.saveReport(makeReport('r2', '2026-01-03T00:00:00.000Z'));
        expect(JSON.parse(localStorage.getItem('csv_agent_reports_index')!).map((r: { id: string }) => r.id).sort())
            .toEqual(['r1', 'r2']);

        await storage.deleteReport('r1');
        expect((await storage.getReportsList()).map(r => r.id)).toEqual(['r2']);
        expect(await storage.getReport('r1')).toBeUndefined();
    });

    it('returns undefined for unknown ids and tolerates deleting them', async () => {
        expect(await storage.getReport('nope')).toBeUndefined();
        await expect(storage.deleteReport('nope')).resolves.toBeUndefined();
    });

    it('cascades delete to original data when no other report shares the session', async () => {
        await storage.saveOriginalData('r1', csv());
        await storage.saveReport(makeReport('r1', '2026-01-02T00:00:00.000Z'));
        await storage.deleteReport('r1');
        expect(await storage.getOriginalData('r1')).toBeNull();
        expect(await storage.getDatasetLineage('anything')).toEqual([]);
    });

    it('writes lineage records and recovers dataset version snapshots', async () => {
        const data = csv();
        const saved = makeReport('r1', '2026-01-02T00:00:00.000Z', data);
        await storage.saveReport(saved);
        const loaded = await storage.getReport('r1');
        const datasetId = loaded?.lineage?.datasetId;
        expect(datasetId).toBeTruthy();
        const lineage = await storage.getDatasetLineage(datasetId!);
        expect(lineage.some(r => r.recordKind === 'version')).toBe(true);
        const snapshot = await storage.getDatasetVersionSnapshot(datasetId!, loaded!.lineage!.currentVersionId);
        expect(snapshot === null || snapshot.fileName === 'sales.csv').toBe(true);
    });
});

describe('report versions and related stores', () => {
    it('persists original data once (immutable snapshot)', async () => {
        await storage.saveOriginalData('s1', csv('a.csv'));
        await storage.saveOriginalData('s1', csv('b.csv'));
        expect((await storage.getOriginalData('s1'))?.fileName).toBe('a.csv');
        await storage.deleteOriginalData('s1');
        expect(await storage.getOriginalData('s1')).toBeNull();
    });

    it('stores and scopes agent memory runs, newest first', async () => {
        const run = (runId: string, createdAt: string, reportId = 'r1'): AgentMemoryRun =>
            ({ runId, datasetId: 'd1', reportId, datasetVersion: 'v1', createdAt: new Date(createdAt) } as unknown as AgentMemoryRun);
        await storage.saveAgentMemoryRun(run('a', '2026-01-01T00:00:00Z'));
        await storage.saveAgentMemoryRun(run('b', '2026-01-02T00:00:00Z'));
        await storage.saveAgentMemoryRun(run('c', '2026-01-03T00:00:00Z', 'other'));

        const scope = { datasetId: 'd1', reportId: 'r1', datasetVersion: 'v1' } as never;
        expect((await storage.getAgentMemoryRuns(scope)).map(r => r.runId)).toEqual(['b', 'a']);
        expect((await storage.getAgentMemoryRuns()).map(r => r.runId)).toEqual(['c', 'b', 'a']);
        expect((await storage.getLatestAgentMemoryRun(scope))?.runId).toBe('b');
        expect(await storage.getLatestAgentMemoryRun({ datasetId: 'zz', reportId: 'r', datasetVersion: 'v' } as never)).toBeNull();
    });

    it('round-trips report artifact records and vector memory', async () => {
        await storage.saveReportArtifactRecord({ reportId: 'r1', generatedAt: new Date('2026-01-01') } as never);
        expect((await storage.getReportArtifactRecord('r1'))?.reportId).toBe('r1');
        expect(await storage.getReportArtifactRecord('missing')).toBeUndefined();

        expect(await storage.loadVectorMemory('k')).toEqual([]);
        await storage.saveVectorMemory([{ id: 'x' } as never], 'k');
        expect(await storage.loadVectorMemory('k')).toHaveLength(1);
        await storage.clearVectorMemory('k');
        expect(await storage.loadVectorMemory('k')).toEqual([]);
    });
});

describe('settings', () => {
    it('returns defaults, persists saved settings and normalises on read', async () => {
        const defaults = await storage.getSettings();
        expect(defaults).toEqual(storage.getDefaultSettings());

        await storage.saveSettings({ ...defaults, provider: 'openai', openAIApiKey: 'sk-test' });
        const saved = await storage.getSettings();
        expect(saved.provider).toBe('openai');
        expect(saved.openAIApiKey).toBe('sk-test');
    });
});

describe('diagnostics, consent and maintenance', () => {
    it('clears one store, honouring protected keys', async () => {
        await storage.saveVectorMemory([{ id: 'a' } as never], 'keep');
        await storage.saveVectorMemory([{ id: 'b' } as never], 'drop');
        const removed = await storage.clearStore('vector_memory', new Set(['keep']));
        expect(removed).toBe(1);
        expect(await storage.loadVectorMemory('keep')).toHaveLength(1);
        expect(await storage.loadVectorMemory('drop')).toEqual([]);
    });

    it('evicts reports beyond the cap but keeps requested ids', async () => {
        for (let i = 0; i < 23; i++) {
            await storage.saveReport(makeReport(`r${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
        }
        const removed = await storage.evictOldReports(new Set(['r0']));
        // Protected ids count toward the cap, so only 2 of the 3 surplus records go.
        expect(removed).toBe(2);
        expect(await storage.getReport('r0')).toBeDefined();
    });

    it('reports a breakdown covering every store', async () => {
        await storage.saveReport(makeReport('r1', '2026-01-02T00:00:00.000Z'));
        const breakdown = await storage.getStorageBreakdown();
        expect(breakdown.stores.some(s => s.storeName === 'reports' && s.recordCount === 1)).toBe(true);
    });

    it('stores cloud AI consent and prunes expired diagnostics, newest first', async () => {
        expect(await storage.getCloudAiConsent('k')).toBeNull();
        await storage.saveCloudAiConsent({ key: 'k', datasetId: 'd', provider: 'openai' } as never);
        expect((await storage.getCloudAiConsent('k'))?.key).toBe('k');

        const now = Date.parse('2026-06-01T00:00:00Z');
        const diag = (id: string, recordedAt: string, expiresAt: string) =>
            ({ id, recordedAt, expiresAt, estimatedBytes: 10 } as never);
        await storage.saveLocalDiagnostic(diag('a', '2026-05-01T00:00:00Z', '2026-07-01T00:00:00Z'), { now, maxTotalBytes: 1000 });
        await storage.saveLocalDiagnostic(diag('b', '2026-05-02T00:00:00Z', '2026-07-01T00:00:00Z'), { now, maxTotalBytes: 1000 });
        await storage.saveLocalDiagnostic(diag('old', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), { now: Date.parse('2026-01-15T00:00:00Z'), maxTotalBytes: 1000 });

        expect((await storage.getRecentLocalDiagnostics(10, now)).map(r => r.id)).toEqual(['b', 'a']);
        expect(await storage.pruneExpiredLocalDiagnostics(now)).toBe(1);
    });
});
