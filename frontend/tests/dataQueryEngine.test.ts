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
        retireDatasetIfOwned: vi.fn(),
    },
}));

vi.mock('../services/data/arqueroEngine', () => ({
    executeArqueroQuery: vi.fn().mockResolvedValue({ supported: false }),
}));

describe('dataQueryEngine', () => {
    it('binds accepted metric unit and currency columns without letting callers override custody', async () => {
        // This suite reloads the engine after resetting its mocked worker modules.
        const { bindAcceptedMetricUnits } = await import('../services/duckdb/queryEngine');
        const metric = { column:'Amount', scale:2, toleranceMinor:0, unit:'money', unitColumn:'Unit' };
        const plan = { aggregates:[{function:'sum' as const,column:'amount',as:'total'}] };
        expect(bindAcceptedMetricUnits(plan,[metric]).aggregates?.[0].unitColumn).toBe('Unit');
        expect(plan.aggregates[0]).not.toHaveProperty('unitColumn');
        expect(bindAcceptedMetricUnits({aggregates:[{function:'avg',column:'Amount',as:'mean'}]},[{...metric,unitColumn:undefined,currencyColumn:'Currency'}]).aggregates?.[0].unitColumn).toBe('Currency');
        expect(bindAcceptedMetricUnits({aggregates:[{function:'max',column:'Amount',as:'max'}]},[metric]).aggregates?.[0].unitColumn).toBeUndefined();
        expect(() => bindAcceptedMetricUnits({aggregates:[{function:'sum',column:'Amount',unitColumn:'Other',as:'total'}]},[metric])).toThrow('mixed_or_missing_units');
        expect(() => bindAcceptedMetricUnits(plan,[{...metric,currencyColumn:'Currency'}])).toThrow('mixed_or_missing_units');
        expect(bindAcceptedMetricUnits(plan,[{...metric,currencyColumn:'Unit'}]).aggregates?.[0].unitColumn).toBe('Unit');
        expect(() => bindAcceptedMetricUnits(plan,[{...metric,provenance:'inferred',source:'unit_column'}])).toThrow('mixed_or_missing_units');
        expect(bindAcceptedMetricUnits({aggregates:[{function:'max',column:'Amount',as:'max'}]},[{...metric,provenance:'inferred',source:'unit_column'}]).aggregates?.[0].unitColumn).toBeUndefined();
    });
    it('excludes inferred fixed units from period arithmetic while preserving exact columns', async () => {
        // Reload after the mocked worker modules, as in the other engine tests.
        const {confirmedExactUnits} = await import('../services/duckdb/queryEngine');
        const {compileQueryPlanToDuckDbSql} = await import('../services/duckdb/queryCompiler');
        const columns = ['OCT 2010','NOV 2010','DEC 2010'];
        const units = confirmedExactUnits([{name:columns[0],unit:'SGD'}, {name:columns[1],unit:'SGD',provenance:'confirmed'}, {name:columns[2],unit:'SGD',provenance:'inferred'}]);
        expect(units).toEqual({[columns[0]]:'SGD',[columns[1]]:'SGD'});
        const opts = {tableName:'accepted',allowedColumns:columns,exactDecimalColumns:columns,exactDecimalUnits:units};
        expect(() => compileQueryPlanToDuckDbSql({aggregates:[{function:'sum',column:columns.join(' + '),as:'n'}]},opts)).toThrow('exact_decimal_period_units_require_meaning');
        expect(() => compileQueryPlanToDuckDbSql({aggregates:[{function:'count',column:columns.join(' + '),as:'n'}]},opts)).not.toThrow();
        expect(compileQueryPlanToDuckDbSql({aggregates:[{function:'sum',column:columns[2],as:'n'}]},opts).sql).toContain('SUM("DEC 2010")');
    });
    it('retires only the exact diagnostic binding and preserves a later dataset',async()=>{
        const config=await import('../config/runtimeConfig');vi.mocked(config.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const worker=await import('../services/workers/duckDbWorkerClient');
        vi.mocked(worker.duckDbWorkerClient.initDuckDb).mockResolvedValue({initialized:true});
        vi.mocked(worker.duckDbWorkerClient.loadCleanDataset).mockImplementation(async args=>({loaded:true,loadVersion:args.loadVersion,tableName:args.tableName}));
        const engine=await import('../services/duckdb/queryEngine');
        const old=await engine.primeDuckDbDataset({fileName:'old.csv',data:[{Amount:1}]});
        const fresh=await engine.primeDuckDbDataset({fileName:'fresh.csv',data:[{Amount:2}]});
        await engine.retireDuckDbQueryBinding(old);
        expect(worker.duckDbWorkerClient.disposeDuckDbSession).not.toHaveBeenCalled();
        await engine.retireDuckDbQueryBinding(fresh);
        expect(worker.duckDbWorkerClient.disposeDuckDbSession).toHaveBeenCalledOnce();
    });
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it.each(['init', 'load'])('fences a superseded file import during worker %s without retiring the newer queued binding', async phase => {
        const worker = (await import('../services/workers/duckDbWorkerClient')).duckDbWorkerClient;
        let release!: () => void, reached = false, current = true;
        const deferred = new Promise<void>(resolve => { release = resolve; });
        vi.mocked(worker.initDuckDb).mockImplementation(async () => { if (phase === 'init') { reached = true; await deferred; } return { initialized: true }; });
        vi.mocked(worker.loadFileDataset).mockImplementation(async args => {
            if (args.loadVersion === 'old' && phase === 'load') { reached = true; await deferred; }
            return { loaded: true, loadVersion: args.loadVersion, tableName: args.tableName, rowCount: 1, preview: [{ key: args.loadVersion }] };
        });
        vi.mocked(worker.retireDatasetIfOwned).mockReturnValue(true);
        const engine = await import('../services/duckdb/queryEngine');
        const old = engine.primeDuckDbFileDataset(new File(['key\nx\n'], 'old.csv'), 'old', { assertCurrent: () => { if (!current) throw new Error('stale_source'); } });
        void old.catch(() => {});
        for (let i = 0; i < 100 && !reached; i += 1) await new Promise(resolve => setTimeout(resolve, 1));
        expect(reached).toBe(true);
        current = false;
        const newer = engine.primeDuckDbFileDataset(new File(['key\ny\n'], 'new.csv'), 'new');
        release();
        await expect(old).rejects.toThrow('stale_source');
        expect((await newer).binding.loadVersion).toBe('new');
        if (phase === 'init') expect(worker.retireDatasetIfOwned).not.toHaveBeenCalled();
        else expect(worker.retireDatasetIfOwned).toHaveBeenCalledExactlyOnceWith('old');
        expect(worker.disposeDuckDbSession).not.toHaveBeenCalled();
        expect(vi.mocked(worker.loadFileDataset).mock.calls.map(call => call[0].loadVersion)).toEqual(phase === 'init' ? ['new'] : ['old', 'new']);
    });

    it('retires a stale owned load even when revocation lands in the post-load await gap', async () => {
        const worker = (await import('../services/workers/duckDbWorkerClient')).duckDbWorkerClient;
        vi.mocked(worker.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(worker.loadFileDataset).mockResolvedValue({ loaded: true, loadVersion: 'old', tableName: 'session_clean_dataset', rowCount: 1, preview: [{ key: 'old' }] });
        vi.mocked(worker.retireDatasetIfOwned).mockReturnValue(true);
        let checks = 0, current = true;
        const engine = await import('../services/duckdb/queryEngine');
        await expect(engine.primeDuckDbFileDataset(new File(['key\nx\n'], 'old.csv'), 'old', { assertCurrent: () => {
            checks += 1;
            if (checks === 3) queueMicrotask(() => { current = false; });
            if (!current) throw new Error('stale_source');
        } })).rejects.toThrow('stale_source');
        expect(worker.retireDatasetIfOwned).toHaveBeenCalledExactlyOnceWith('old');
        expect(worker.disposeDuckDbSession).not.toHaveBeenCalled();
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

    it('does not fall back to approximate execution after decimal overflow', async () => {
        // The suite resets mocked modules between cases; load this engine after the reset.
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const worker = (await import('../services/workers/duckDbWorkerClient')).duckDbWorkerClient;
        vi.mocked(worker.initDuckDb).mockResolvedValue({ initialized: true });
        vi.mocked(worker.loadCleanDataset).mockResolvedValue({ loaded: true, loadVersion: 'dataset-1', tableName: 'session_clean_dataset' });
        vi.mocked(worker.executeCompiledQuery).mockRejectedValue(new Error('exact_decimal_overflow'));
        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');
        await expect(executeManagedDataQuery(
            { fileName: 'sales.csv', data: [{ Revenue: 1 }] },
            { aggregates: [{ function: 'avg', column: 'Revenue', as: 'mean' }] },
            ['Revenue'],
        )).rejects.toThrow('exact_decimal_overflow');
        const { executeArqueroQuery } = await import('../services/data/arqueroEngine');
        expect(executeArqueroQuery).not.toHaveBeenCalled();
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
