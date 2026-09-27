// @vitest-environment node
//
// Tests for AGENT-306 query result cache in queryEngine.ts.
// Uses dynamic imports (like dataQueryEngine.test.ts) to ensure
// module-level state is properly isolated between tests.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/runtimeConfig', () => ({
    shouldEnableDuckDbQueryEngine: vi.fn(),
}));

vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: {
        initDuckDb: vi.fn(),
        loadCleanDataset: vi.fn(),
        executeCompiledQuery: vi.fn(),
        executeRawQuery: vi.fn(),
        disposeDuckDbSession: vi.fn(),
    },
}));

vi.mock('../services/data/arqueroEngine', () => ({
    executeArqueroQuery: vi.fn().mockReturnValue({ supported: false }),
}));

vi.mock('../services/data/columnRegistry', () => ({
    collectOrderedColumnNames: vi.fn().mockReturnValue(['col1', 'col2']),
}));

const MOCK_DATA = {
    fileName: 'test.csv',
    data: [{ col1: 'a', col2: 1 }],
};

const MOCK_QUERY_RESULT = {
    rows: [{ col1: 'a', col2: 1 }],
    returnedRows: 1,
    totalMatchedRows: 1,
    durationMs: 5,
    columns: ['col1', 'col2'],
};

describe('query result cache (AGENT-306)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns cached result on second identical query (HIT)', async () => {
        vi.resetModules();
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClient = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClient.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.executeCompiledQuery).mockResolvedValue(MOCK_QUERY_RESULT as never);

        const { executeManagedDataQuery, getQueryCacheStats } = await import('../services/duckdb/queryEngine');
        const plan = { select: ['col1', 'col2'] };

        // First call: MISS → Worker executed
        const result1 = await executeManagedDataQuery(MOCK_DATA as never, plan as never, ['col1', 'col2']);
        expect(workerClient.duckDbWorkerClient.executeCompiledQuery).toHaveBeenCalledTimes(1);
        expect(result1.engine).toBe('duckdb');
        expect(getQueryCacheStats().size).toBe(1);

        // Second call: HIT → no Worker call
        const result2 = await executeManagedDataQuery(MOCK_DATA as never, plan as never, ['col1', 'col2']);
        expect(workerClient.duckDbWorkerClient.executeCompiledQuery).toHaveBeenCalledTimes(1); // still 1
        expect(result2.result).toEqual(MOCK_QUERY_RESULT);
    });

    it('calls Worker again when compiled SQL changes (MISS)', async () => {
        vi.resetModules();
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClient = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClient.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.executeCompiledQuery).mockResolvedValue(MOCK_QUERY_RESULT as never);

        const { executeManagedDataQuery } = await import('../services/duckdb/queryEngine');

        // First query
        await executeManagedDataQuery(MOCK_DATA as never, { select: ['col1', 'col2'] } as never, ['col1', 'col2']);
        expect(workerClient.duckDbWorkerClient.executeCompiledQuery).toHaveBeenCalledTimes(1);

        // Different query plan → different compiled SQL → MISS
        await executeManagedDataQuery(MOCK_DATA as never, { select: ['col1'], limit: 10 } as never, ['col1']);
        expect(workerClient.duckDbWorkerClient.executeCompiledQuery).toHaveBeenCalledTimes(2);
    });

    it('caches raw SQL query results', async () => {
        vi.resetModules();
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClient = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClient.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.executeRawQuery).mockResolvedValue(MOCK_QUERY_RESULT as never);

        const { executeRawSqlQuery } = await import('../services/duckdb/queryEngine');
        const rawSql = 'SELECT * FROM session_clean_dataset LIMIT 10';

        // First call: MISS
        await executeRawSqlQuery(MOCK_DATA as never, rawSql, ['col1', 'col2']);
        expect(workerClient.duckDbWorkerClient.executeRawQuery).toHaveBeenCalledTimes(1);

        // Second call: HIT
        await executeRawSqlQuery(MOCK_DATA as never, rawSql, ['col1', 'col2']);
        expect(workerClient.duckDbWorkerClient.executeRawQuery).toHaveBeenCalledTimes(1); // still 1
    });

    it('reports cache stats correctly', async () => {
        vi.resetModules();
        const runtimeConfig = await import('../config/runtimeConfig');
        vi.mocked(runtimeConfig.shouldEnableDuckDbQueryEngine).mockReturnValue(true);
        const workerClient = await import('../services/workers/duckDbWorkerClient');
        vi.mocked(workerClient.duckDbWorkerClient.initDuckDb).mockResolvedValue({ initialized: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.loadCleanDataset).mockResolvedValue({ loaded: true } as never);
        vi.mocked(workerClient.duckDbWorkerClient.executeCompiledQuery).mockResolvedValue(MOCK_QUERY_RESULT as never);

        const { executeManagedDataQuery, getQueryCacheStats } = await import('../services/duckdb/queryEngine');
        expect(getQueryCacheStats()).toEqual({ size: 0, maxSize: 50 });

        await executeManagedDataQuery(MOCK_DATA as never, { select: ['col1'] } as never, ['col1']);
        expect(getQueryCacheStats()).toEqual({ size: 1, maxSize: 50 });
    });
});
