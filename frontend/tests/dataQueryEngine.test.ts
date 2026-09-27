// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/runtimeConfig', () => ({
    shouldEnableDuckDbQueryEngine: vi.fn(),
}));

vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: {
        initDuckDb: vi.fn(),
        loadCleanDataset: vi.fn(),
        loadFileDataset: vi.fn(),
        executeCompiledQuery: vi.fn(),
        disposeDuckDbSession: vi.fn(),
    },
}));

vi.mock('../services/data/arqueroEngine', () => ({
    executeArqueroQuery: vi.fn().mockResolvedValue({ supported: false }),
}));

describe('dataQueryEngine', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('stays on the native executor when the runtime flag is disabled', async () => {
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(false);
        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');

        const execution = await executeManagedDataQuery({
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1200 }],
        }, {
            select: ['Region'],
            limit: 5,
        }, ['Region', 'Revenue']);

        expect(execution.engine).toBe('native');
        expect(execution.fallbackReason).toBe('duckdb_disabled');
        expect(execution.fallbackStage).toBe('duckdb_disabled');
        expect(execution.result.rows).toEqual([{ Region: 'East' }]);
    });

    it('falls back to the native executor when DuckDB query execution fails', async () => {
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClientModule = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClientModule.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(workerClientModule.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true, loadVersion: 'dataset-1', tableName: 'session_clean_dataset' });
        vi.mocked(workerClientModule.duckDbWorkerClient.executeCompiledQuery).mockRejectedValue(new Error('duckdb offline'));

        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');
        const execution = await executeManagedDataQuery({
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1200 }],
        }, {
            select: ['Region'],
            limit: 5,
        }, ['Region', 'Revenue']);

        expect(execution.engine).toBe('native');
        expect(execution.fallbackReason).toContain('duckdb offline');
        expect(execution.fallbackStage).toBe('query_failed');
        expect(execution.sqlPreview).toContain('SELECT');
        expect(execution.result.rows).toEqual([{ Region: 'East' }]);
    });

    it('classifies dataset binding failures separately from query execution failures', async () => {
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClientModule = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClientModule.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(workerClientModule.duckDbWorkerClient.loadCleanDataset).mockRejectedValue(new Error('load worker crashed'));

        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');
        const execution = await executeManagedDataQuery({
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1200 }],
        }, {
            select: ['Region'],
            limit: 5,
        }, ['Region', 'Revenue']);

        expect(execution.engine).toBe('native');
        expect(execution.fallbackReason).toContain('load worker crashed');
        expect(execution.fallbackStage).toBe('bind_failed');
        expect(execution.sqlPreview).toContain('SELECT');
    });

    it('rethrows aborts instead of falling back to the native executor', async () => {
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClientModule = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClientModule.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(workerClientModule.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true, loadVersion: 'dataset-1', tableName: 'session_clean_dataset' });
        vi.mocked(workerClientModule.duckDbWorkerClient.executeCompiledQuery).mockImplementation(async (_payload, _timeoutMs, abortSignal) => new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        }));

        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');
        const controller = new AbortController();
        const executionPromise = executeManagedDataQuery({
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1200 }],
        }, {
            select: ['Region'],
            limit: 5,
        }, ['Region', 'Revenue'], {
            abortSignal: controller.signal,
        });

        controller.abort(new DOMException('Cancelled the current agent run.', 'AbortError'));

        await expect(executionPromise).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('reuses the current DuckDB dataset binding for repeated queries on the same dataset', async () => {
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClientModule = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClientModule.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(workerClientModule.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true, loadVersion: 'dataset-1', tableName: 'session_clean_dataset' });
        vi.mocked(workerClientModule.duckDbWorkerClient.executeCompiledQuery)
            .mockResolvedValueOnce({
                rows: [{ Region: 'East' }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region'],
                appliedOrderBy: [],
                appliedLimit: 5,
                durationMs: 5,
            })
            .mockResolvedValueOnce({
                rows: [{ Revenue: 1200 }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Revenue'],
                appliedOrderBy: [],
                appliedLimit: 5,
                durationMs: 5,
            });

        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');
        const dataset = {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1200 }],
        };

        await executeManagedDataQuery(dataset, {
            select: ['Region'],
            limit: 5,
        }, ['Region', 'Revenue']);
        await executeManagedDataQuery(dataset, {
            select: ['Revenue'],
            limit: 5,
        }, ['Region', 'Revenue']);

        expect(workerClientModule.duckDbWorkerClient.initDuckDb).toHaveBeenCalledTimes(1);
        expect(workerClientModule.duckDbWorkerClient.loadCleanDataset).toHaveBeenCalledTimes(1);
        expect(workerClientModule.duckDbWorkerClient.executeCompiledQuery).toHaveBeenCalledTimes(2);
    });

    it('reuses a directly loaded large-file binding without serializing the preview sample', async () => {
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClientModule = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClientModule.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(workerClientModule.duckDbWorkerClient.loadFileDataset).mockResolvedValue({
            loaded: true,
            loadVersion: 'dataset-file-full',
            tableName: 'session_clean_dataset',
            rowCount: 982_589,
            preview: [{ month: '1990-01', town: 'ANG MO KIO' }],
        });
        vi.mocked(workerClientModule.duckDbWorkerClient.executeCompiledQuery).mockResolvedValue({
            rows: [{ month: '1990-01' }],
            totalMatchedRows: 982_589,
            returnedRows: 1,
            truncated: true,
            selectedColumns: ['month'],
            appliedOrderBy: [],
            appliedLimit: 1,
            durationMs: 4,
        });

        const { executeManagedDataQuery, primeDuckDbFileDataset } = await import('../services/duckdb/queryEngine');
        const file = new File(['month,town\n1990-01,ANG MO KIO'], 'large.csv');
        const loaded = await primeDuckDbFileDataset(file, 'dataset-file-full');
        const dataset = {
            fileName: 'large.csv',
            data: loaded.preview,
            backing: {
                mode: 'duckdb_file' as const,
                loadVersion: 'dataset-file-full',
                datasetVersion: 'version-file-full',
                rowCount: 982_589,
                sampleRowCount: 1,
                byteSize: 79_000_000,
                readOnly: true as const,
                ephemeral: true as const,
            },
        };

        const execution = await executeManagedDataQuery(dataset, {
            select: ['month'],
            limit: 1,
        }, ['month', 'town']);

        expect(execution.engine).toBe('duckdb');
        expect(execution.result.totalMatchedRows).toBe(982_589);
        expect(workerClientModule.duckDbWorkerClient.loadFileDataset).toHaveBeenCalledOnce();
        expect(workerClientModule.duckDbWorkerClient.loadCleanDataset).not.toHaveBeenCalled();
    });

    it('reopens the worker once when a reused large-file binding loses its preview rows', async () => {
        const workerClientModule = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClientModule.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(workerClientModule.duckDbWorkerClient.loadFileDataset)
            .mockResolvedValueOnce({
                loaded: false,
                loadVersion: 'dataset-file-full',
                tableName: 'session_clean_dataset',
                rowCount: 1_000_000,
                preview: [],
            })
            .mockResolvedValueOnce({
                loaded: true,
                loadVersion: 'dataset-file-full',
                tableName: 'session_clean_dataset',
                rowCount: 1_000_000,
                preview: [{ Region: 'East', Amount: '1200.25' }],
            });

        const { primeDuckDbFileDataset } = await import('../services/duckdb/queryEngine');
        const file = new File(['Region,Amount\nEast,1200.25'], 'large.csv');
        const result = await primeDuckDbFileDataset(file, 'dataset-file-full');

        expect(result.preview).toEqual([{ Region: 'East', Amount: '1200.25' }]);
        expect(workerClientModule.duckDbWorkerClient.disposeDuckDbSession).toHaveBeenCalledOnce();
        expect(workerClientModule.duckDbWorkerClient.initDuckDb).toHaveBeenCalledTimes(2);
        expect(workerClientModule.duckDbWorkerClient.loadFileDataset).toHaveBeenCalledTimes(2);
    });
});
