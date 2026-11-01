// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { compileUnpivotToDuckDbSql, compileQueryPlanToDuckDbSql } from '../services/duckdb/queryCompiler';
import { DEFAULT_DIMENSION_NORMALIZATION } from '../services/duckdb/dimensionNormalization';
import { admitSql, assertSqlResult, configureSqlDefaults, DUCKDB_WASM_SHA256, DUCKDB_WORKER_SHA256, lockSqlEngine, readOnlySql, SQL_LIMITS, sqlTimeout, validateSqlLimit } from '../services/duckdb/sqlSecurity';

const require = createRequire(import.meta.url);
const duck = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
const base = fileURLToPath(new URL('../node_modules/@duckdb/duckdb-wasm/dist/', import.meta.url));
let db: any, conn: any;
const engine = {query: async (sql: string) => conn.query(sql), tokenize: async (sql: string) => db.tokenize(sql),
    getTableNames: async (sql: string) => conn.getTableNames(sql)};
const rows = (table: any) => table.toArray().map((row: any) => row.toJSON());

beforeAll(async () => {
    db = await duck.createDuckDB({mvp: {mainModule: `${base}duckdb-mvp.wasm`}, eh: {mainModule: `${base}duckdb-eh.wasm`}}, new duck.VoidLogger(), duck.NODE_RUNTIME);
    await db.instantiate(); db.open({path: ':memory:', maximumThreads: 1, allowUnsignedExtensions: false}); conn = db.connect();
    await configureSqlDefaults(engine);
    conn.query('CREATE TABLE session_clean_dataset AS SELECT 2 amount UNION ALL SELECT 3 UNION ALL SELECT 5');
    await lockSqlEngine(engine);
}, 30000);
afterAll(() => conn?.close());

describe('pinned real DuckDB SQL admission and engine restrictions', () => {
    it('admits actual compiled dimension/AND/OR/post-aggregate predicates as syntax',async()=>{
        const compiled=compileQueryPlanToDuckDbSql({groupBy:['amount'],aggregates:[{function:'sum',column:'amount',as:'total'}],
            where:{predicates:[{column:'amount',operator:'gte',value:2}],groups:[{predicates:[{column:'amount',operator:'eq',value:2}]},{predicates:[{column:'amount',operator:'gt',value:3}]}]},
            postAggregateFilter:{predicates:[{column:'total',operator:'gt',value:1}]},orderBy:[{column:'total',direction:'desc'}],limit:500},
            {tableName:'session_clean_dataset',allowedColumns:['amount'],dimensionNormalization:DEFAULT_DIMENSION_NORMALIZATION});
        for(const sql of [compiled.sql,compiled.countSql])await expect(admitSql(engine,sql,'session_clean_dataset')).resolves.toBe(sql.trim());
        expect(rows(await readOnlySql(engine,()=>engine.query(compiled.sql))).map((r:any)=>Number(r.total))).toEqual([5,2]);
    });
    it('admits and executes the compiled exact average through the read-only boundary', async () => {
        const compiled = compileQueryPlanToDuckDbSql(
            { aggregates: [{ function: 'avg', column: 'amount', as: 'mean' }] },
            { tableName: 'session_clean_dataset', allowedColumns: ['amount'], exactDecimalColumns: ['amount'] },
        );
        const sql = await admitSql(engine, compiled.sql, 'session_clean_dataset');
        expect(rows(await readOnlySql(engine, () => engine.query(sql)))).toEqual([{ mean: '3' }]);
        await expect(admitSql(engine, compiled.countSql, 'session_clean_dataset')).resolves.toBe(compiled.countSql.trim());
    });
    it('supports native parser CTE/window/union and harmless literal/comment punctuation', async () => {
        const sql = await admitSql(engine, "/* outer */ WITH q(x) AS (SELECT amount FROM session_clean_dataset) SELECT sum(x) OVER () n, '; DROP TABLE x' note FROM q UNION ALL SELECT 10, '十月'; -- trailing", 'session_clean_dataset');
        const result = await readOnlySql(engine, () => engine.query(`SELECT * FROM (${sql}) result LIMIT 5`));
        expect(rows(result).map((row: any) => Number(row.n))).toEqual([10, 10, 10, 10]);
    });
    it.each([
        'SELECT 1; DROP TABLE session_clean_dataset',
        'WITH x AS (DELETE FROM session_clean_dataset RETURNING *) SELECT * FROM x',
        'SELECT * FROM read_csv(\'https://example.invalid/data.csv\')',
        'SELECT * FROM "read_text"(\'/private/secret\')',
        'SELECT * FROM glob(\'/private/*\')',
        'SELECT * FROM query(\'DELETE FROM session_clean_dataset RETURNING *\')',
        'SELECT * FROM query_table(\'session_clean_dataset\')',
        'SELECT write_log(\'secret\')',
        'SELECT * FROM duckdb_settings()',
        'SELECT * FROM information_schema.tables',
        'SELECT * FROM another_session',
        'SELECT "where"(amount) FROM session_clean_dataset',
        'SELECT "and"(amount) FROM session_clean_dataset',
        'SELECT * FROM \'https://example.invalid/data.csv\'',
        'INSTALL httpfs', 'LOAD httpfs', "ATTACH 'other.db'", "COPY session_clean_dataset TO 'out.csv'",
        'EXPLAIN ANALYZE DELETE FROM session_clean_dataset', 'SET enable_external_access=true',
        'SELECT 1) result; DELETE FROM session_clean_dataset; SELECT (1',
    ])('rejects unsafe SQL without running it: %s', async sql => {
        await expect(admitSql(engine, sql, 'session_clean_dataset')).rejects.toThrow(/^sql_/);
    });
    it('locks actual settings and blocks engine-level access even without host admission', async () => {
        const proof = await lockSqlEngine(engine);
        expect(proof.engineVersion).toBe('v1.4.4'); expect(proof.locked).toBe(true);
        expect(proof.memoryBytes).toBe(SQL_LIMITS.memoryBytes);
        for (const sql of ["SELECT * FROM read_text('/private/synthetic-secret')", "SELECT * FROM read_csv('https://example.invalid/data.csv')",
            'SET enable_external_access=true', 'SET memory_limit=\'2GB\'', "LOAD httpfs", "COPY session_clean_dataset TO 'out.csv'"]) {
            expect(() => conn.query(sql)).toThrow();
        }
    });
    it('rejects actual hidden database writes in READ ONLY and rolls back after failure', async () => {
        await expect(readOnlySql(engine, () => engine.query('DELETE FROM session_clean_dataset'))).rejects.toThrow(/read.only/i);
        const result = await readOnlySql(engine, () => engine.query('SELECT sum(amount) n FROM session_clean_dataset'));
        expect(Number(rows(result)[0].n)).toBe(10);
    });
    it('refuses an unavailable/malformed parser or security configuration', async () => {
        await expect(admitSql({...engine, getTableNames: async () => {throw new Error('unsupported');}}, 'SELECT 1', 'session_clean_dataset')).rejects.toThrow('sql_parser_rejected');
        await expect(lockSqlEngine({...engine, query: async () => ({numRows: 0, numCols: 0, schema: {fields: []}, toArray: () => []})})).rejects.toThrow('sql_capability_unavailable');
    });
    it('bounds SQL bytes and validates raw limit without coercing control values', async () => {
        await expect(admitSql(engine, `SELECT '${'x'.repeat(SQL_LIMITS.sqlBytes)}'`, 'session_clean_dataset')).rejects.toThrow('sql_text_bytes_exceeded');
        for (const value of [0, -1, null, '500', NaN, Infinity, 5001]) expect(() => validateSqlLimit(value)).toThrow('sql_limit_invalid');
        expect(validateSqlLimit(5000)).toBe(5000);
    });
    it('pins the actual shipped WASM and nested worker bytes', () => {
        for (const variant of ['mvp', 'eh'] as const) {
            const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
            expect(hash(`${base}duckdb-${variant}.wasm`)).toBe(DUCKDB_WASM_SHA256[variant]);
            expect(hash(`${base}duckdb-browser-${variant}.worker.js`)).toBe(DUCKDB_WORKER_SHA256[variant]);
            expect(hash(fileURLToPath(new URL(`../public/duckdb/duckdb-${variant}.wasm`, import.meta.url)))).toBe(DUCKDB_WASM_SHA256[variant]);
        }
    });
    it('checks actual wide and large native output, then keeps the connection usable', async () => {
        for (const [sql, reason] of [
            [`SELECT ${Array.from({length: 51}, (_, i) => `${i} c${i}`).join(',')}`, 'sql_result_columns_exceeded'],
            [`SELECT repeat('x', ${SQL_LIMITS.resultBytes + 1}) AS large`, 'sql_result_bytes_exceeded'],
        ]) {
            const admitted = await admitSql(engine, sql, 'session_clean_dataset');
            await expect(readOnlySql(engine, async () => {
                const table = await engine.query(admitted); assertSqlResult(table, rows(table));
            })).rejects.toThrow(reason);
        }
        expect(Number(rows(await engine.query('SELECT sum(amount) n FROM session_clean_dataset'))[0].n)).toBe(10);
    });
    it('caps timeouts and rejects invalid control values', () => {
        expect(sqlTimeout(180000)).toBe(60000);
        for (const value of [0, -1, NaN, Infinity]) expect(() => sqlTimeout(value)).toThrow('sql_timeout_invalid');
    });
    it('preserves the actual app unpivot compiler while refusing unsupported native UNPIVOT binding', async () => {
        const compiled = compileUnpivotToDuckDbSql({sourceColumns: ['amount'], nameAs: 'metric', valueAs: 'total', aggregate: 'sum'},
            {tableName: 'session_clean_dataset', allowedColumns: ['amount']});
        const sql = await admitSql(engine, compiled.sql, 'session_clean_dataset');
        expect(Number(rows(await readOnlySql(engine, () => engine.query(sql)))[0].total)).toBe(10);
        await expect(admitSql(engine, 'UNPIVOT session_clean_dataset ON amount INTO NAME metric VALUE value', 'session_clean_dataset'))
            .rejects.toThrow('sql_parser_rejected');
    });
    it('enforces native allocator exhaustion with spilling disabled', async () => {
        const bounded = await duck.createDuckDB({mvp: {mainModule: `${base}duckdb-mvp.wasm`}, eh: {mainModule: `${base}duckdb-eh.wasm`}}, new duck.VoidLogger(), duck.NODE_RUNTIME);
        await bounded.instantiate(); bounded.open({path: ':memory:', maximumThreads: 1, allowUnsignedExtensions: false});
        const connection = bounded.connect();
        try {
            connection.query("SET memory_limit='8MB'"); connection.query("SET temp_directory=''");
            connection.query("SET max_temp_directory_size='0B'");
            connection.query('SET enable_external_access=false'); connection.query('SET lock_configuration=true');
            expect(() => connection.query('SELECT list(i) FROM range(10000000) t(i)')).toThrow(/out of memory/i);
            expect(Number(rows(connection.query('SELECT 7 n'))[0].n)).toBe(7);
        } finally {connection.close();}
    }, 30000);
});
