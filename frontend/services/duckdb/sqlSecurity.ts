import type { ScriptTokens } from '@duckdb/duckdb-wasm';

export const SQL_POLICY_VERSION = 'duckdb-local-readonly-v1';
export const SQL_LIMITS = Object.freeze({sqlBytes: 64 * 1024, rows: 5000, columns: 50, resultBytes: 2 * 1024 * 1024,
    memoryBytes: 256 * 1024 * 1024, timeoutMs: 60_000});
export const PINNED_DUCKDB_VERSION = 'v1.4.4';
export const DUCKDB_WASM_SHA256 = Object.freeze({
    mvp: '8ca65162504c30b415e5236d76d66ac5c8e2852b8ced6c4a8d612023b65c6e39',
    eh: 'b8e6bf002ce85e4b0154a4a3f0d3916dd40d115ee9a13800c7a992716c6649e8',
});
export const DUCKDB_WORKER_SHA256 = Object.freeze({mvp: '364d03dfe6f995f0f349175802c871aea98bdf03cecf8c9af87c0fff156f85e2',
    eh: '5b676545e095f06e0ca10eec23a2d3ba6375dacfd31a1cb2f07aba8be3e56910'});

interface SqlTable {numRows: number; numCols: number; schema: {fields: Array<{name: string}>}; toArray(): Array<{toJSON(): Record<string, unknown>}>}
export interface SqlEngine {query(sql: string): Promise<SqlTable>; tokenize(sql: string): Promise<ScriptTokens>; getTableNames(sql: string): Promise<string[]>}
export interface SqlBinding {tableName: string; loadVersion: string}
export interface SqlSecurityProof {policyVersion: string; engineVersion: string; locked: true; memoryBytes: number}

export const validateSqlText = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('sql_text_invalid');
    if (new TextEncoder().encode(value).byteLength > SQL_LIMITS.sqlBytes) throw new Error('sql_text_bytes_exceeded');
    return value;
};
export const validateSqlLimit = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > SQL_LIMITS.rows) throw new Error('sql_limit_invalid');
    return value;
};
export const sqlTimeout = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) throw new Error('sql_timeout_invalid');
    return Math.min(value, SQL_LIMITS.timeoutMs);
};
export const assertSqlBinding = (expected: SqlBinding | undefined, actual: SqlBinding | null): void => {
    if (!expected || !actual || expected.tableName !== actual.tableName || expected.loadVersion !== actual.loadVersion) throw new Error('sql_binding_mismatch');
};

// Reviewed pure built-ins; unknown calls are unavailable rather than inheriting
// capabilities from extensions, dynamic SQL, catalogs or replacement scans.
const functions = new Set(('abs acos asin atan atan2 cos sin tan ceil ceiling floor round trunc sqrt cbrt exp ln log log10 log2 pow power sign pi '
    + 'count sum avg min max median mode quantile quantile_cont quantile_disc approx_quantile approx_count_distinct stddev stddev_pop stddev_samp variance var_pop var_samp covar_pop covar_samp corr '
    + 'cast try_cast typeof coalesce nullif if ifnull greatest least lower upper trim ltrim rtrim lpad length char_length octet_length substring substr left right error '
    + 'concat concat_ws replace repeat regexp_replace regexp_matches regexp_full_match regexp_extract regexp_extract_all starts_with ends_with contains '
    + 'strptime try_strptime strftime date_part date_trunc date_diff datediff dateadd epoch epoch_ms epoch_us epoch_ns make_date make_timestamp '
    + 'year month day dayofmonth dayofweek week quarter hour minute second last_day current_date current_timestamp now extract '
    + 'row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value '
    + 'list array_agg list_count list_sum list_avg list_min list_max list_distinct list_sort list_reverse_sort list_value list_extract '
    + 'array_length array_slice string_split split_part string_agg bool_and bool_or bit_and bit_or bit_xor '
    + 'range generate_series unnest struct_pack struct_extract map map_extract cardinality grouping grouping_id '
    + 'as in not exists over filter within values select from using on join union distinct unpivot pivot columns decimal numeric varchar char bigint integer int smallint tinyint double float real timestamp timestamptz interval').split(' '));
const writeKeywords = new Set(('INSERT UPDATE DELETE CREATE DROP ALTER COPY ATTACH DETACH INSTALL LOAD SET RESET PRAGMA CALL EXECUTE PREPARE '
    + 'EXPORT IMPORT VACUUM CHECKPOINT GRANT REVOKE BEGIN COMMIT ROLLBACK EXPLAIN').split(' '));
const identifier = (value: string) => value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"').toLowerCase() : value.toLowerCase();
const parenthesizedPredicateKeywords = new Set(['WHERE','HAVING','AND','OR','WHEN','THEN','ELSE']);

const tokenText = (span: string, type: number): string => {
    // Native offsets omit comments, so a span can include a following comment.
    if (type === 3) return /^[();.]/.exec(span)?.[0] ?? span.trim();
    if (type === 0 || type === 4) return /^"(?:[^"]|"")*"/s.exec(span)?.[0]
        ?? /^[\p{L}\p{N}_$]+/u.exec(span)?.[0] ?? span.trim();
    return span.trim();
};

/** DuckDB's tokenizer offsets are UTF-8 bytes, not JS string indices. */
export const admitSql = async (engine: SqlEngine, input: string, tableName: string): Promise<string> => {
    const sql = validateSqlText(input), bytes = new TextEncoder().encode(sql);
    let parsed: ScriptTokens;
    try {parsed = await engine.tokenize(sql);} catch {throw new Error('sql_parser_rejected');}
    if (!parsed || !Array.isArray(parsed.offsets) || !Array.isArray(parsed.types) || !parsed.offsets.length
        || parsed.offsets.length !== parsed.types.length || parsed.offsets.some((offset, i) => !Number.isInteger(offset)
            || offset < 0 || offset >= bytes.length || (i > 0 && offset <= parsed.offsets[i - 1])
            || !Number.isInteger(parsed.types[i]) || parsed.types[i] < 0 || parsed.types[i] > 5)) throw new Error('sql_parser_unavailable');
    const decoder = new TextDecoder();
    const tokens = parsed.offsets.map((offset, i) => ({offset, type: parsed.types[i],
        text: tokenText(decoder.decode(bytes.subarray(offset, parsed.offsets[i + 1] ?? bytes.length)), parsed.types[i])})).filter(token => token.type !== 5);
    if (!tokens.length || !['SELECT', 'WITH', 'VALUES', 'UNPIVOT'].includes(tokens[0].text.toUpperCase())) throw new Error('sql_statement_rejected');
    const separators = tokens.filter(token => token.type === 3 && token.text === ';');
    if (separators.length > 1 || (separators.length && tokens.at(-1) !== separators[0])) throw new Error('sql_multiple_statements');
    const base = separators.length ? decoder.decode(bytes.subarray(0, separators[0].offset)).trim() : sql.trim();
    // CTE column declarations are not function calls. Only their actual
    // declaration position is exempt; an identically named call is not.
    const declarations = new Set<number>();
    if (tokens[0].text.toUpperCase() === 'WITH') {
        let i = 1;
        if (tokens[i]?.text.toUpperCase() === 'RECURSIVE') throw new Error('sql_recursive_unavailable');
        while (i < tokens.length) {
            const name = i++;
            if (tokens[i]?.text === '(') {declarations.add(name); let depth = 1; i++;
                while (i < tokens.length && depth) {if (tokens[i].text === '(') depth++; if (tokens[i].text === ')') depth--; i++;}}
            if (tokens[i++]?.text.toUpperCase() !== 'AS') break;
            if (tokens[i]?.text.toUpperCase() === 'NOT') i++;
            if (tokens[i]?.text.toUpperCase() === 'MATERIALIZED') i++;
            if (tokens[i++]?.text !== '(') break;
            let depth = 1;
            while (i < tokens.length && depth) {if (tokens[i].type === 3 && tokens[i].text === '(') depth++;
                if (tokens[i].type === 3 && tokens[i].text === ')') depth--; i++;}
            if (tokens[i]?.text !== ',') break;
            i++;
        }
    }
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i], name = identifier(token.text);
        if (token.type === 4 && writeKeywords.has(token.text.toUpperCase())) throw new Error('sql_statement_rejected');
        if ([0, 4].includes(token.type) && ['information_schema', 'pg_catalog'].includes(name) && tokens[i + 1]?.text === '.') throw new Error('sql_catalog_rejected');
        // Native keyword tokens introduce parenthesized predicates, not callable functions.
        // Quoted identifiers with these names still require the reviewed function allowlist.
        const predicateSyntax = token.type === 4 && parenthesizedPredicateKeywords.has(token.text.toUpperCase());
        if ([0, 4].includes(token.type) && tokens[i + 1]?.text === '(' && !predicateSyntax && !functions.has(name) && !declarations.has(i)) throw new Error('sql_function_unavailable');
    }
    try {
        const tables = await engine.getTableNames(base);
        if (!Array.isArray(tables) || tables.some(name => typeof name !== 'string')) throw new Error('sql_parser_rejected');
        if (tables.some(name => name.toLowerCase() !== tableName.toLowerCase())) throw new Error('sql_table_rejected');
    } catch (error) {if (error instanceof Error && error.message === 'sql_table_rejected') throw error; throw new Error('sql_parser_rejected');}
    return base;
};

export const configureSqlDefaults = async (engine: Pick<SqlEngine, 'query'>): Promise<void> => {
    for (const sql of ["SET temp_directory=''", "SET max_temp_directory_size='0B'", `SET memory_limit='${SQL_LIMITS.memoryBytes}B'`,
        'SET threads=1', 'SET autoinstall_known_extensions=false', 'SET autoload_known_extensions=false', 'SET allow_community_extensions=false']) await engine.query(sql);
};

export const lockSqlEngine = async (engine: Pick<SqlEngine, 'query'>): Promise<SqlSecurityProof> => {
    try {
        const state = (await engine.query("SELECT current_setting('lock_configuration') AS locked")).toArray();
        if (state.length !== 1 || typeof state[0].toJSON().locked !== 'boolean') throw new Error('unverified');
        if (!state[0].toJSON().locked) {
            await engine.query('SET enable_external_access=false');
            await engine.query('SET lock_configuration=true');
        }
        const table = await engine.query(`SELECT version() AS version, current_setting('enable_external_access') AS external_access,
            current_setting('autoinstall_known_extensions') AS autoinstall, current_setting('autoload_known_extensions') AS autoload,
            current_setting('allow_community_extensions') AS community, current_setting('allow_unsigned_extensions') AS unsigned,
            current_setting('lock_configuration') AS locked, current_setting('memory_limit') AS memory,
            current_setting('temp_directory') AS temp_directory, current_setting('max_temp_directory_size') AS temp_size,
            current_setting('threads') AS threads, len(current_setting('allowed_paths')) AS paths,
            len(current_setting('allowed_directories')) AS directories`);
        const values = table.toArray().map(row => row.toJSON());
        const row = values[0];
        if (values.length !== 1 || row.version !== PINNED_DUCKDB_VERSION || row.external_access !== false || row.autoinstall !== false
            || row.autoload !== false || row.community !== false || row.unsigned !== false || row.locked !== true
            || row.memory !== '256.0 MiB' || row.temp_directory !== '' || row.temp_size !== '0 bytes' || ![1, 1n].includes(row.threads as number | bigint)
            || ![0, 0n].includes(row.paths as number | bigint) || ![0, 0n].includes(row.directories as number | bigint)) throw new Error('unverified');
        return {policyVersion: SQL_POLICY_VERSION, engineVersion: PINNED_DUCKDB_VERSION, locked: true, memoryBytes: SQL_LIMITS.memoryBytes};
    } catch {throw new Error('sql_capability_unavailable');}
};

/** Host-only imports precede locking. Every user query executes in READ ONLY. */
export const readOnlySql = async <T>(engine: Pick<SqlEngine, 'query'>, execute: () => Promise<T>): Promise<T> => {
    await engine.query('BEGIN TRANSACTION READ ONLY');
    try {return await execute();} finally {await engine.query('ROLLBACK');}
};

export const assertSqlResult = (table: Pick<SqlTable, 'numCols'>, rows: unknown[]): void => {
    if (table.numCols > SQL_LIMITS.columns) throw new Error('sql_result_columns_exceeded');
    let size = 2;
    for (const row of rows) {size += new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
        if (size > SQL_LIMITS.resultBytes) throw new Error('sql_result_bytes_exceeded');}
};
