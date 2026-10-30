// @vitest-environment node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type * as DuckDbBlocking from '@duckdb/duckdb-wasm/dist/duckdb-node-blocking';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QueryPlan } from '../types';
import { compileQueryPlanToDuckDbSql } from '../services/duckdb/queryCompiler';
import { tableToRows } from '../services/workers/duckDbRows';

const require = createRequire(import.meta.url);
// The node-blocking bundle is a CommonJS entry point with a matching declaration.
const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs') as typeof DuckDbBlocking;
const wasmBase = fileURLToPath(new URL('../node_modules/@duckdb/duckdb-wasm/dist/', import.meta.url));
let conn: DuckDbBlocking.DuckDBConnection;
beforeAll(async () => {
    const db = await duckdb.createDuckDB({ mvp: { mainModule: `${wasmBase}duckdb-mvp.wasm` }, eh: { mainModule: `${wasmBase}duckdb-eh.wasm` } }, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
    await db.instantiate();
    db.open({ path: ':memory:', maximumThreads: 1 });
    conn = db.connect();
    conn.query(`CREATE TABLE facts (grp VARCHAR, value VARCHAR, unit VARCHAR, keep VARCHAR)`);
    conn.query(`INSERT INTO facts VALUES ('a','10','kg','yes'), ('a','20','kg','yes'), ('a','na','','yes'), ('a','100','lb','no'), ('b','1','kg','yes'), ('b','2','lb','yes')`);
}, 30_000);
afterAll(() => conn?.close());

const options = { allowedColumns: ['grp', 'value', 'unit', 'keep'], tableName: 'facts' };
const compile = (plan: QueryPlan) => compileQueryPlanToDuckDbSql(plan, options);
const invalidGroups = (plan: QueryPlan) => {
    const compiled = compile(plan);
    return Number(tableToRows(conn.query(compiled.unitGuardSql!))[0].total);
};
const aggregate = { function: 'sum' as const, column: 'value', unitColumn: 'unit', as: 'total' };
const keepYes = { predicates: [{ column: 'keep', operator: 'eq' as const, value: 'yes' }] };

describe('DuckDB aggregate unit guard', () => {
    it('guards each group before ordering, limiting, and post-aggregate filtering', () => {
        const plan: QueryPlan = { groupBy: ['grp'], aggregates: [aggregate], where: keepYes,
            orderBy: [{ column: 'total', direction: 'desc' }], limit: 1,
            postAggregateFilter: { predicates: [{ column: 'total', operator: 'gt', value: 10 }] } };
        expect(invalidGroups(plan)).toBe(1);
        expect(invalidGroups({ ...plan, groupBy: ['grp', 'unit'] })).toBe(0);
    });
    it('applies query and aggregate filters and ignores nonnumeric values', () => {
        const plan: QueryPlan = { groupBy: ['grp'], where: { predicates: [{ column: 'grp', operator: 'eq', value: 'a' }] },
            aggregates: [{ ...aggregate, where: keepYes }, { function: 'avg', column: 'value', unitColumn: 'unit', as: 'mean', where: keepYes }] };
        const compiled = compile(plan);
        expect(invalidGroups(plan)).toBe(0);
        const row = tableToRows(conn.query(compiled.sql))[0];
        expect(Number(row.total)).toBe(30);
        expect(Number(row.mean)).toBe(15);
        expect(invalidGroups({ ...plan, aggregates: [aggregate] })).toBe(1);
    });
    it('detects blank and unequal raw strings, including whitespace and case', () => {
        conn.query(`INSERT INTO facts VALUES ('c','3','kg','yes'), ('c','4',' kg','yes'), ('d','0','   ','yes'), ('e','2','KG','yes'), ('e','1','kg','yes')`);
        expect(invalidGroups({ groupBy: ['grp'], aggregates: [aggregate], where: keepYes })).toBe(4);
    });
    it('ignores unit bindings for count and count distinct', () => {
        const aggregates = [
            { function: 'count' as const, column: 'value', as: 'n' },
            { function: 'count_distinct' as const, column: 'value', as: 'distinct_n' },
        ];
        const plain = compile({ aggregates });
        const bound = compile({ aggregates: aggregates.map(item => ({ ...item, unitColumn: 'unit' })) });
        expect(bound.unitGuardSql).toBeUndefined();
        expect(bound.sql).toBe(plain.sql);
        expect(tableToRows(conn.query(bound.sql))).toEqual(tableToRows(conn.query(plain.sql)));
    });
    it('rejects unsupported bindings and leaves unguarded queries unchanged', () => {
        expect(() => compile({ aggregates: [{ ...aggregate, unitColumn: 'unknown' }] })).toThrow(/missing column/);
        expect(() => compile({ aggregates: [{ ...aggregate, unitColumn: '' }] })).toThrow(/non-empty column/);
        expect(() => compile({ aggregates: [{ ...aggregate, function: 'min' }] })).toThrow(/only for sum and avg/);
        expect(compile({ aggregates: [{ function: 'sum', column: 'value', as: 'total' }] }).unitGuardSql).toBeUndefined();
    });
});
