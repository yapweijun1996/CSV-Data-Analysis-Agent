/**
 * Isolated worker factory for DuckDB.
 *
 * Vite detects `new Worker(new URL('...', import.meta.url))` as a static
 * pattern and compiles the referenced file into a hashed .js worker asset.
 * This MUST be a top-level expression — wrapping it in conditionals or
 * dynamic `.then()` callbacks prevents Vite's static analysis from
 * recognising it as a worker entry point.
 */
export const createDuckDbWorker = (): Worker =>
    new Worker(new URL('./duckDbWorker.ts', import.meta.url), { type: 'module' });
