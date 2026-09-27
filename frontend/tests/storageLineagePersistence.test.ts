// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, CsvData, Report } from '../types';
import { buildDatasetId, buildDatasetVersionId } from '../utils/datasetId';

const stores = new Map<string, Map<string, any>>();
const store = (name: string): Map<string, any> => {
    const existing = stores.get(name);
    if (existing) return existing;
    const next = new Map<string, any>();
    stores.set(name, next);
    return next;
};
const keyFor = (name: string, value: any): string => {
    if (name === 'reports') return value.id;
    if (name === 'dataset_lineage') return value.recordId;
    if (name === 'agent_memory_runs') return value.runId;
    throw new Error(`Unsupported fake store: ${name}`);
};
const put = async (name: string, value: any) => {
    store(name).set(keyFor(name, value), value);
};
const fakeDb = {
    get: vi.fn(async (name: string, key: string) => store(name).get(key)),
    getAll: vi.fn(async (name: string) => Array.from(store(name).values())),
    getAllFromIndex: vi.fn(async (name: string, index: string, query: string) =>
        Array.from(store(name).values()).filter(value => value[index] === query)
    ),
    put: vi.fn(put),
    delete: vi.fn(async (name: string, key: string) => {
        store(name).delete(key);
    }),
    transaction: vi.fn((names: string[] | string) => ({
        objectStore: (name: string) => ({
            put: (value: any) => put(name, value),
            openCursor: vi.fn(async () => null),
        }),
        done: Promise.resolve(),
        names,
    })),
};

vi.mock('idb', () => ({
    openDB: vi.fn(async () => fakeDb),
}));

Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: { only: (value: string) => value },
});

const {
    CURRENT_SESSION_KEY,
    deleteReport,
    getDatasetLineage,
    getDatasetVersionSnapshot,
    getReport,
    saveReport,
} = await import('../services/storageService');

const csv = (values: number[]): CsvData => ({
    fileName: 'sales.csv',
    data: values.map((value, index) => ({ Row: index + 1, Revenue: value })),
});

const report = (raw: CsvData, current: CsvData, updatedAt: Date): Report => ({
    id: 'session-1',
    filename: raw.fileName,
    createdAt: new Date('2026-07-25T00:00:00.000Z'),
    updatedAt,
    appState: {
        sessionId: 'session-1',
        rawCsvData: raw,
        csvData: current,
        currentDatasetId: 'dataset-v8-legacy',
        runtimeRunHistory: [],
        activeTurn: null,
        cleaningRun: {
            runId: 'cleaning-run-storage-test',
            status: 'completed',
            currentStep: 1,
            steps: [],
            lastModelResponse: null,
            startedAt: new Date('2026-07-25T00:00:00.000Z'),
            updatedAt,
            targetPath: '/workspace/dataset/clean.csv',
        },
        dataPreparationPlan: {
            explanation: 'Persist deterministic mutation.',
            operations: [{
                id: 'replace-1',
                type: 'replace_values',
                reason: 'Normalize source value.',
                column: 'Revenue',
                replacements: [{ from: '20', to: 200 }],
            }],
            outputColumns: [],
            planStatus: 'operations',
            consistencyIssues: [],
        },
    } as AppState,
});

beforeEach(() => {
    stores.clear();
    vi.clearAllMocks();
});

describe('storage lineage persistence', () => {
    it('persists successive recoverable versions and input/output transformation links', async () => {
        const raw = csv([10, 20]);
        const prepared = csv([10, 200]);
        const derived = csv([10, 250]);

        await saveReport(report(raw, prepared, new Date('2026-07-25T01:00:00.000Z')));
        await saveReport(report(raw, derived, new Date('2026-07-25T02:00:00.000Z')));

        const datasetId = buildDatasetId(raw.fileName, raw.data);
        const lineage = await getDatasetLineage(datasetId);
        const versions = lineage.filter(record => record.recordKind === 'version');
        const transformations = lineage.filter(record => record.recordKind === 'transformation');

        expect(versions.map(version => version.versionId)).toEqual([
            buildDatasetVersionId(raw.fileName, raw.data),
            buildDatasetVersionId(prepared.fileName, prepared.data),
            buildDatasetVersionId(derived.fileName, derived.data),
        ]);
        expect(transformations).toHaveLength(2);
        expect(transformations.at(-1)).toMatchObject({
            inputVersionId: buildDatasetVersionId(prepared.fileName, prepared.data),
            outputVersionId: buildDatasetVersionId(derived.fileName, derived.data),
            rollbackVersionId: buildDatasetVersionId(prepared.fileName, prepared.data),
        });
        await expect(
            getDatasetVersionSnapshot(datasetId, buildDatasetVersionId(prepared.fileName, prepared.data)),
        ).resolves.toEqual(prepared);
    });

    it('returns a normalized v9 report contract after saving a legacy record', async () => {
        const raw = csv([5, 6]);
        await saveReport(report(raw, raw, new Date('2026-07-25T01:00:00.000Z')));

        const restored = await getReport('session-1');

        expect(restored?.lineage).toMatchObject({
            schemaVersion: 1,
            datasetId: buildDatasetId(raw.fileName, raw.data),
            currentVersionId: buildDatasetVersionId(raw.fileName, raw.data),
        });
        expect(restored?.appState.currentDatasetId).toBe(restored?.lineage?.datasetId);
    });

    it('persists the canonical prepared dataset as the current recoverable version', async () => {
        const raw = csv([10, 20]);
        const cleaned = csv([10, 200]);
        const canonical: CsvData = {
            ...csv([10, 200]),
            fileName: 'sales.canonical.csv',
            data: [{ Row: 1, Revenue: 10, RowRole: 'fact' }],
        };
        const saved = report(raw, cleaned, new Date('2026-07-25T01:00:00.000Z'));
        saved.appState.canonicalCsvData = canonical;

        await saveReport(saved);

        const restored = await getReport('session-1');
        const canonicalVersionId = buildDatasetVersionId(canonical.fileName, canonical.data);
        expect(restored?.lineage?.currentVersionId).toBe(canonicalVersionId);
        await expect(
            getDatasetVersionSnapshot(restored!.lineage!.datasetId, canonicalVersionId),
        ).resolves.toEqual(canonical);
    });

    it('keeps canonical lineage while the current-session alias still references it', async () => {
        const raw = csv([5, 6]);
        const saved = report(raw, raw, new Date('2026-07-25T01:00:00.000Z'));
        await saveReport(saved);
        await saveReport({ ...saved, id: CURRENT_SESSION_KEY });
        const datasetId = buildDatasetId(raw.fileName, raw.data);

        await deleteReport('session-1');
        expect(await getDatasetLineage(datasetId)).not.toHaveLength(0);

        await deleteReport(CURRENT_SESSION_KEY);
        expect(await getDatasetLineage(datasetId)).toHaveLength(0);
    });
});
