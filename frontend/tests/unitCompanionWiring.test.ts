// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryPlan } from '../types';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type * as DuckDbBlocking from '@duckdb/duckdb-wasm/dist/duckdb-node-blocking';
import { tableToRows } from '../services/workers/duckDbRows';

const io = vi.hoisted(() => ({ enabled: false, execute: vi.fn(), init: vi.fn(), load: vi.fn(), arquero: vi.fn() }));
vi.mock('../config/runtimeConfig', () => ({ shouldEnableDuckDbQueryEngine: () => io.enabled }));
vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: { initDuckDb: io.init, loadCleanDataset: io.load, executeCompiledQuery: io.execute, retireSession: vi.fn() },
    DuckDbWorkerClient: class {
        async initDuckDb() {}
        async loadFileDataset() { return { rowCount: 1 }; }
        async executeCompiledQuery(payload: unknown) { return io.execute(payload); }
        retireSession() {}
    },
}));
vi.mock('../services/data/arqueroEngine', () => ({ executeArqueroQuery: io.arquero }));

import { executeManagedDataQuery, prepareAcceptedTablesBinding } from '../services/duckdb/queryEngine';
import type { DatasetCommitMarker } from '../types/datasetCommit';
import type { CandidateOutput } from '../services/data/candidateContract';
const plan: QueryPlan = { aggregates: [{ function: 'sum', column: 'Amount', as: 'total' }] };
const opt = { inferUnitColumn: true };
const columns = ['Amount', 'uNiTs'];
const single = { fileName: 'synthetic.csv', data: [{ Amount: 2, uNiTs: 'kg' }, { Amount: 3, uNiTs: 'kg' }] };

beforeEach(() => {
    io.enabled = false;
    io.execute.mockReset(); io.init.mockReset(); io.load.mockReset(); io.arquero.mockReset();
    io.arquero.mockReturnValue({ supported: false });
});

describe('managed unit companion wiring', () => {
    it('guards and labels inferred sum and average in native fallback', async () => {
        for (const fn of ['sum', 'avg'] as const) {
            const result = await executeManagedDataQuery(single, { aggregates: [{ function: fn, column: 'amount', as: 'total' }] }, columns, opt);
            expect(result.engine).toBe('native');
            expect(result.result.unitInferred).toBe(true);
            expect(result.result.rows[0].total).toBe(fn === 'sum' ? 5 : 2.5);
        }
        expect(io.arquero).not.toHaveBeenCalled();
    });
    it('refuses mixed or missing units but accepts a filtered group', async () => {
        const mixed = { ...single, data: [{ Amount: 2, uNiTs: 'kg' }, { Amount: 3, uNiTs: 'lb' }] };
        await expect(executeManagedDataQuery(mixed, plan, columns, opt)).rejects.toThrow('mixed_or_missing_units');
        await expect(executeManagedDataQuery({ ...single, data: [{ Amount: 2, uNiTs: '' }] }, plan, columns, opt)).rejects.toThrow('mixed_or_missing_units');
        const filtered: QueryPlan = { ...plan, where: { predicates: [{ column: 'uNiTs', operator: 'eq', value: 'kg' }] } };
        expect((await executeManagedDataQuery(mixed, filtered, columns, opt)).result.unitInferred).toBe(true);
    });
    it('does not infer without opt-in, for explicit bindings, ambiguity, or unitless data', async () => {
        const explicit: QueryPlan = { aggregates: [{ function: 'sum', column: 'Amount', unitColumn: 'uNiTs', as: 'total' }] };
        expect((await executeManagedDataQuery(single, plan, columns)).result.unitInferred).toBeUndefined();
        expect((await executeManagedDataQuery(single, explicit, columns, opt)).result.unitInferred).toBeUndefined();
        const ambiguous = { fileName: 'synthetic.csv', data: [{ Amount: 2, Unit: 'kg', Currency: 'USD' }] };
        expect((await executeManagedDataQuery(ambiguous, plan, ['Amount', 'Unit', 'Currency'], opt)).result.unitInferred).toBeUndefined();
        const unitless = { fileName: 'synthetic.csv', data: [{ Amount: 2 }] };
        expect((await executeManagedDataQuery(unitless, plan, ['Amount', 'Unit'], opt)).result.unitInferred).toBeUndefined();
        const notExact = { fileName: 'synthetic.csv', data: [{ Amount: 2, ' unit ': 'kg' }] };
        expect((await executeManagedDataQuery(notExact, plan, ['Amount', ' unit '], opt)).result.unitInferred).toBeUndefined();
    });
    it('agrees with native fallback using real DuckDB SQL for inferred units', async () => {
        const duckdb = createRequire(import.meta.url)('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs') as typeof DuckDbBlocking;
        const wasm = fileURLToPath(new URL('../node_modules/@duckdb/duckdb-wasm/dist/', import.meta.url));
        const db = await duckdb.createDuckDB({ mvp: { mainModule: `${wasm}duckdb-mvp.wasm` }, eh: { mainModule: `${wasm}duckdb-eh.wasm` } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
        await db.instantiate();
        db.open({ path: ':memory:', maximumThreads: 1 });
        const conn = db.connect();
        try {
            conn.query(`CREATE TABLE session_clean_dataset ("Amount" VARCHAR, "uNiTs" VARCHAR)`);
            conn.query(`INSERT INTO session_clean_dataset VALUES ('2','kg'),('3','kg')`);
            io.enabled = true;
            io.execute.mockImplementation(async payload => {
                if (payload.unitGuardSql && Number(tableToRows(conn.query(payload.unitGuardSql))[0].total) > 0) {
                    throw new Error('mixed_or_missing_units: Cannot calculate');
                }
                return { rows: tableToRows(conn.query(payload.sql)), totalMatchedRows: 1, returnedRows: 1, truncated: false, durationMs: 1, selectedColumns: ['total'], appliedLimit: 500, appliedOrderBy: [] };
            });
            const duck = await executeManagedDataQuery(single, plan, columns, { ...opt, bypassCache: true });
            io.enabled = false;
            const native = await executeManagedDataQuery(single, plan, columns, opt);
            expect(duck.result.unitInferred).toBe(true);
            expect(Number(duck.result.rows[0].total)).toBe(native.result.rows[0].total);
            conn.query(`UPDATE session_clean_dataset SET "uNiTs" = 'lb' WHERE "Amount" = '3'`);
            const mixed = { ...single, data: [{ Amount: 2, uNiTs: 'kg' }, { Amount: 3, uNiTs: 'lb' }] };
            io.enabled = true;
            await expect(executeManagedDataQuery(mixed, plan, columns, { ...opt, bypassCache: true })).rejects.toThrow('mixed_or_missing_units');
            io.enabled = false;
            await expect(executeManagedDataQuery(mixed, plan, columns, opt)).rejects.toThrow('mixed_or_missing_units');
        } finally {
            conn.close();
        }
    }, 30_000);
    it('does not bind a companion to an expanded period expression', async () => {
        io.enabled = true;
        io.execute.mockResolvedValue({ rows: [{ total: 6 }], totalMatchedRows: 1, returnedRows: 1, truncated: false, durationMs: 1, selectedColumns: ['total'], appliedLimit: 500, appliedOrderBy: [] });
        const period = { fileName: 'periods.csv', data: [{ 'OCT 2010': 1, 'NOV 2010': 2, 'DEC 2010': 3, Unit: 'kg' }] };
        const periodPlan: QueryPlan = { aggregates: [{ function: 'sum', column: 'OCT 2010 + NOV 2010 + DEC 2010', as: 'total' }] };
        const execution = await executeManagedDataQuery(period, periodPlan, Object.keys(period.data[0]), { ...opt, bypassCache: true });
        expect(execution.result.unitInferred).toBeUndefined();
        expect(io.execute.mock.calls[0][0].unitGuardSql).toBeUndefined();
    });
    it('keeps accepted metric custody ahead of named inference and rejects conflicts', async () => {
        const schema = [{ name: 'Amount', dataType: 'number', nullable: false }, { name: 'Unit', dataType: 'string', nullable: false }, { name: 'Currency', dataType: 'string', nullable: false }];
        const output = { tables: [{ name: 'facts', schema, rows: [{ Amount: 2, Unit: 'kg', Currency: 'USD' }], rowCount: 1 }] } as unknown as CandidateOutput;
        const marker = { commitId: 'synthetic', bundle: { primaryTableId: 'facts-id', tables: [{ ...output.tables[0], tableId: 'facts-id' }] },
            replayManifest: { validationBinding: { contract: { tables: [{ name: 'facts', metrics: [{ column: 'Amount', scale: 2, unit: 'mass', unitColumn: 'Unit', toleranceMinor: 0 }] }] } } } } as unknown as DatasetCommitMarker;
        const data = { fileName: 'synthetic.csv', data: output.tables[0].rows };
        const binding = await prepareAcceptedTablesBinding(marker, output, () => {});
        binding.activate(data, () => true);
        io.execute.mockResolvedValue({ rows: [{ total: 2 }], totalMatchedRows: 1, returnedRows: 1, truncated: false, durationMs: 1, selectedColumns: ['total'], appliedLimit: 500, appliedOrderBy: [] });
        const execution = await executeManagedDataQuery(data, plan, [], opt);
        expect(execution.result.unitInferred).toBeUndefined();
        expect(io.execute.mock.calls[0][0].unitGuardSql).toContain('\"Unit\"');
        await expect(executeManagedDataQuery(data, { aggregates: [{ function: 'sum', column: 'Amount', unitColumn: 'Currency', as: 'total' }] }, [], opt)).rejects.toThrow('mixed_or_missing_units');
        binding.dispose();
    });
});
