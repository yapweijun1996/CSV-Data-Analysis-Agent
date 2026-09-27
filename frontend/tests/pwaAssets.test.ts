// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages PWA source contract', () => {
    it('uses repository-relative app, manifest, and worker scope inputs', () => {
        const html = readFileSync(resolve('index.html'), 'utf8');
        const manifest = JSON.parse(readFileSync(resolve('public/manifest.webmanifest'), 'utf8'));

        expect(html).toContain('<base href="./" />');
        expect(html).toContain('href="./manifest.webmanifest"');
        expect(html).toContain('src="./index.tsx"');
        expect(manifest.start_url).toBe('./');
        expect(manifest.scope).toBe('./');
        expect(manifest.display).toBe('standalone');
    });

    it('ships CSP, an offline fallback, and a user-confirmed update worker', () => {
        const html = readFileSync(resolve('index.html'), 'utf8');
        const worker = readFileSync(resolve('public/service-worker.js'), 'utf8');
        const offline = readFileSync(resolve('public/offline.html'), 'utf8');

        expect(html).toContain('http-equiv="Content-Security-Policy"');
        expect(worker).toContain("event.data?.type === 'SKIP_WAITING'");
        expect(worker).not.toContain('self.skipWaiting();\n  })());');
        expect(worker).not.toContain('clients.claim()');
        expect(worker).toContain("request.mode === 'navigate'");
        expect(worker).toContain('Response.redirect(rootUrl.toString(), 302)');
        expect(offline).toContain('Anda di luar talian');
        expect(offline).toContain('オフラインです');
    });

    it('keeps DuckDB, Pyodide, and demo data out of the default precache list', () => {
        const worker = readFileSync(resolve('public/service-worker.js'), 'utf8');
        const precache = worker.slice(worker.indexOf('const PRECACHE_URLS'), worker.indexOf('const SHELL_CACHE'));

        expect(precache).not.toContain('duckdb/');
        expect(precache).not.toContain('pyodide/');
        expect(precache).not.toContain('demo-data/');
    });

    it('finalizes the essential offline workspace chunks without eagerly caching compute runtimes', () => {
        const finalizer = readFileSync(resolve('scripts/finalize-pwa-build.mjs'), 'utf8');

        expect(finalizer).toContain("'HistoryPanel'");
        expect(finalizer).toContain("'DatabaseModal'");
        expect(finalizer).toContain("'AnalysisPanel'");
        expect(finalizer).not.toContain("'pyodide/'");
        expect(finalizer).not.toContain("'demo-data/'");
    });
});
