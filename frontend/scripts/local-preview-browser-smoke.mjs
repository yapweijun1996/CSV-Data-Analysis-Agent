import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Normal file input -> real local consent -> real managed DuckDB query. No provider,
// injected candidate/result, or test-only application route. Settings seed language only.
const base = process.argv[2] ?? 'http://127.0.0.1:4191';
assert.equal(new URL(base).hostname, '127.0.0.1');
const output = process.argv[3] ?? await mkdtemp('/tmp/local-preview-browser-');
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const index = assets.find(n => /^csv_data_analysis_index-.*\.js$/.test(n));
const sw = await readFile(new URL('../dist/service-worker.js', import.meta.url), 'utf8');
const evidence = { build: /const BUILD_VERSION = '([^']+)'/.exec(sw)?.[1], scenarios: [], pageErrors: [], externalAttempts: [], workers: [] };
const invoice = 'Invoice,Date,Customer,Product,Amount\nINV-A,2026-01-01,Alpha,Widget,123.45\nINV-B,2026-01-02,Beta,Part,67.89\nINV-C,2026-01-03,Gamma,Kit,10.00';
const localButton = /View data \(local\)|查看数据（本地）/;
const consentButton = /Use local processing only|仅使用本地处理/;
const closeButton = /Close data explorer|关闭数据探索/;
const adjust = /Choose columns \/ edit query|选择列／编辑查询/;
const run = /^Run query$|^运行查询$/;
const profiles = [];
const contexts = [];
async function open(label, { width = 1365, height = 900, language = 'English', blockEngine = false, holdQueryResponse = false } = {}) {
    const profile = await mkdtemp('/tmp/local-preview-profile-'); profiles.push(profile);
    const context = await chromium.launchPersistentContext(profile, {
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: process.env.HEADED !== '1',
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        viewport: { width, height }, serviceWorkers: 'block',
    }); contexts.push(context);
    await context.addInitScript(language => localStorage.setItem('csv-ai-assistant-settings', JSON.stringify({ language })), language);
    if (holdQueryResponse) await context.addInitScript(() => {
        // Delay genuine worker messages only; never manufacture SQL/results or alter application state.
        const NativeWorker = Worker;
        globalThis.heldQueryResponses = [];
        globalThis.sentLocalQueries = 0;
        globalThis.holdLocalQuery = true;
        globalThis.Worker = class extends NativeWorker {
            constructor(...args) {
                super(...args); this.queryIds = new Set();
                this.addEventListener('message', event => {
                    if (!globalThis.holdLocalQuery || !this.queryIds.has(event.data?.id) || event.data?.progress) return;
                    event.stopImmediatePropagation();
                    globalThis.heldQueryResponses.push(() => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
                });
            }
            postMessage(message, ...args) {
                if (message?.task === 'executeCompiledQuery') { this.queryIds.add(message.id); globalThis.sentLocalQueries++; }
                return super.postMessage(message, ...args);
            }
        };
    });
    await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
        evidence.externalAttempts.push({ scenario: label, url: route.request().url(), method: route.request().method() }); return route.abort();
    });
    if (blockEngine) await context.route('**/duckdb/**', route => route.abort());
    const page = await context.newPage();
    page.on('pageerror', e => evidence.pageErrors.push(e.message));
    page.on('worker', w => evidence.workers.push(w.url()));
    page.on('dialog', d => d.accept());
    await page.goto(base);
    await page.getByText(/Select a file|选择文件/, { exact: true }).first().waitFor();
    assert.equal(await (await page.request.get(`${base}/service-worker.js`)).text(), sw);
    // Read-only observation of production state; no replacement actions or synthetic outcomes.
    await page.evaluate(async index => { globalThis.previewRoot = (await import(`/assets/${index}`)).u; }, index);
    await page.waitForFunction(() => !globalThis.previewRoot.getState().isAppInitializing);
    const renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    }); assert.match(renderer, /SwiftShader/);
    return { label, page, context, renderer };
}
async function upload(page, text = invoice, name = 'synthetic-invoices.csv') {
    await page.locator('#file-upload').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    try {
        const consent = page.getByRole('button', { name: consentButton }), local = page.getByRole('button', { name: localButton });
        await Promise.race([consent.waitFor({ timeout: 60000 }), local.waitFor({ timeout: 60000 })]);
        if (await consent.isVisible()) await consent.click();
        await local.waitFor({ timeout: 60000 });
    } catch (error) {
        await writeFile(`${output}/upload-failure.txt`, await page.locator('body').innerText());
        await page.screenshot({ path: `${output}/upload-failure.png`, fullPage: true });
        throw error;
    }
    await page.evaluate(() => {
        const s = globalThis.previewRoot.getState();
        globalThis.importBeforePreview = { csvData: s.csvData, canonical: s.canonicalCsvData, bundle: s.datasetBundle, historyLength: s.queryHistory.length };
    });
}
async function snapshot(page) {
    return page.evaluate(() => {
        const s = globalThis.previewRoot.getState(), before = globalThis.importBeforePreview;
        return { fileName: s.csvData?.fileName, failure: s.initialAnalysisFailureKind, query: s.activeDataQuery,
            queries: s.queryHistory.length, rows: s.csvData?.data.length, commit: s.datasetBundle?.acceptedCommit ?? null,
            unchanged: s.csvData === before?.csvData && s.canonicalCsvData === before?.canonical && s.datasetBundle === before?.bundle };
    });
}
async function view(page, keyboard = false) {
    const button = page.getByRole('button', { name: localButton });
    if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
    await page.getByRole('dialog').waitFor();
    await page.waitForFunction(() => globalThis.previewRoot.getState().activeDataQuery, undefined, { timeout: 60000 });
    await page.locator('[data-preview-result-grid] .tabulator-row').first().waitFor();
}
try {
    for (const [label, options] of [['desktop', {}], ['mobile-zh', { width: 390, height: 844, language: 'Mandarin' }]]) {
        const { page, context, renderer } = await open(label, options);
        await upload(page);
        await page.screenshot({ path: `${output}/after-${label}-import.png`, fullPage: true });
        await view(page, true);
        const s = await snapshot(page);
        assert.equal(s.unchanged, true); assert.equal(s.commit, null); assert.equal(s.queries, 1);
        assert.deepEqual(s.query.result.selectedColumns, ['Invoice', 'Date', 'Customer', 'Product', 'Amount']);
        assert.deepEqual(s.query.result.rows.map(r => Number(r.Amount)), [123.45, 67.89, 10]);
        assert.equal(s.query.result.returnedRows, 3); assert.equal(s.query.result.appliedLimit, 25);
        await expect(page.locator('[data-local-preview-summary]')).toContainText(/5.*5/);
        const grid = page.locator('[data-preview-result-grid]');
        assert.ok((await grid.boundingBox()).y < (options.height ?? 900), 'One click reveals the real preview without scrolling');
        await page.screenshot({ path: `${output}/after-${label}-preview.png`, fullPage: true });
        // Horizontal scrolling is confined to the data grid, not the phone viewport.
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const amountCell = grid.locator('.tabulator-cell[tabulator-field="Amount"]').first();
        await amountCell.scrollIntoViewIfNeeded(); await expect(amountCell).toContainText('123.45');
        await page.screenshot({ path: `${output}/after-${label}-amount.png`, fullPage: true });
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: localButton }).waitFor();
        assert.equal(await page.getByRole('button', { name: localButton }).evaluate(e => e === document.activeElement), true);
        await view(page);
        assert.equal((await snapshot(page)).queries, 1, 'Reopening does not run another preview');
        await page.getByText(adjust, { exact: true }).click();
        const amountChoice = page.getByRole('button', { name: 'Amount', exact: true });
        await amountChoice.click(); // Unsaved custom work must survive close/reopen too.
        await expect(amountChoice).toHaveAttribute('aria-pressed', 'false');
        await page.getByRole('button', { name: closeButton }).click();
        await view(page);
        await page.getByText(adjust, { exact: true }).click();
        await expect(page.getByRole('button', { name: 'Amount', exact: true })).toHaveAttribute('aria-pressed', 'false');
        assert.equal((await snapshot(page)).queries, 1);
        await page.getByRole('button', { name: closeButton }).click();
        // Existing cloud option still asks for consent; it must not dispatch before approval.
        await page.getByRole('button', { name: /Allow cloud AI analysis|允许云端 AI 分析/ }).click();
        await page.getByRole('button', { name: consentButton }).click();
        await page.getByRole('button', { name: localButton }).waitFor();
        evidence.scenarios.push({ label, renderer, result: s });
        await context.close();
    }
    {
        const { page, context } = await open('wide');
        const columns = [...Array.from({ length: 39 }, (_, i) => `Field${i + 1}`), 'Amount'];
        const text = [columns.join(','), ...Array.from({ length: 3 }, (_, i) => columns.map((c, j) => c === 'Amount' ? String(100 + i) : `value${i}-${j}`).join(','))].join('\n');
        await upload(page, text, 'synthetic-wide.csv'); await view(page);
        let s = await snapshot(page);
        assert.equal(s.query.result.selectedColumns.length, 12); assert.equal(s.query.result.selectedColumns.includes('Amount'), false);
        await expect(page.locator('[data-local-preview-summary]')).toContainText('12 / 40');
        await page.screenshot({ path: `${output}/after-wide-preview.png`, fullPage: true });
        await page.getByText(adjust, { exact: true }).click();
        const chooser = page.getByRole('button', { name: 'Choose columns', exact: true });
        await chooser.focus(); await page.keyboard.press('Enter');
        const amount = page.getByRole('button', { name: 'Amount', exact: true });
        await expect(amount).toHaveAttribute('aria-pressed', 'false'); await amount.focus(); await page.keyboard.press('Space');
        await expect(amount).toHaveAttribute('aria-pressed', 'true');
        await page.getByRole('button', { name: run }).click();
        await page.waitForFunction(() => globalThis.previewRoot.getState().activeDataQuery?.result.selectedColumns.includes('Amount'));
        s = await snapshot(page); assert.equal(s.queries, 2); assert.deepEqual(s.query.result.rows.map(r => Number(r.Amount)), [100, 101, 102]);
        await expect(page.locator('[data-local-preview-summary]')).toContainText('13 / 40');
        await page.screenshot({ path: `${output}/after-wide-chooser.png`, fullPage: true });
        await page.getByRole('button', { name: closeButton }).click(); await view(page);
        assert.equal((await snapshot(page)).queries, 2);
        await page.getByText(adjust, { exact: true }).click();
        await page.getByRole('button', { name: 'Choose columns', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Amount', exact: true })).toHaveAttribute('aria-pressed', 'true');
        evidence.scenarios.push({ label: 'wide-column-count-chooser-keyboard-manual-query-preserved', result: s });
        await context.close();
    }
    {
        const { page, context } = await open('empty');
        await page.locator('#file-upload').setInputFiles({ name: 'synthetic-empty.csv', mimeType: 'text/csv', buffer: Buffer.from('') });
        await page.waitForFunction(() => !globalThis.previewRoot.getState().isBusy);
        await expect(page.getByRole('button', { name: localButton })).toHaveCount(0);
        await page.screenshot({ path: `${output}/after-empty-import.png`, fullPage: true });
        evidence.scenarios.push({ label: 'empty-import-no-preview', body: await page.locator('body').innerText() });
        await context.close();
    }
    {
        const { page, context } = await open('stale-session', { holdQueryResponse: true });
        await upload(page);
        const originalSession = await page.evaluate(() => globalThis.previewRoot.getState().sessionId);
        await page.getByRole('button', { name: localButton }).click();
        await page.waitForFunction(() => globalThis.heldQueryResponses.length > 0, undefined, { timeout: 60000 });
        await expect(page.locator('[data-local-preview-summary]')).toContainText('Loading preview');
        await page.getByRole('button', { name: closeButton }).click();
        await page.getByRole('button', { name: localButton }).click();
        await expect(page.locator('[data-local-preview-summary]')).toContainText('Loading preview');
        assert.equal(await page.evaluate(() => globalThis.sentLocalQueries), 1, 'Reopening a pending preview must not dispatch a second query');
        await page.getByRole('button', { name: closeButton }).click();
        await page.getByRole('button', { name: 'New', exact: true }).click();
        await page.getByRole('dialog', { name: 'Start a new analysis?' }).getByRole('button', { name: 'Start new analysis', exact: true }).click();
        await page.getByText('Select a file', { exact: true }).waitFor();
        await upload(page, invoice.replace('123.45', '999.99'), 'synthetic-replacement.csv');
        await page.evaluate(() => { globalThis.holdLocalQuery = false; globalThis.heldQueryResponses.splice(0).forEach(release => release()); });
        await page.waitForTimeout(100);
        const beforeNewQuery = await snapshot(page);
        assert.equal(beforeNewQuery.query, null); assert.equal(beforeNewQuery.queries, 0);
        assert.notEqual(await page.evaluate(() => globalThis.previewRoot.getState().sessionId), originalSession);
        await view(page);
        const current = await snapshot(page);
        assert.equal(Number(current.query.result.rows[0].Amount), 999.99); assert.equal(current.queries, 1);
        await page.screenshot({ path: `${output}/after-stale-session-replacement.png`, fullPage: true });
        evidence.scenarios.push({ label: 'actual-late-worker-query-result-after-new-session-and-same-schema-upload', beforeNewQuery, current });
        await context.close();
    }
    {
        const { page, context } = await open('engine-error', { blockEngine: true });
        await upload(page); await page.getByRole('button', { name: localButton }).click();
        await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ timeout: 90000 });
        const failed = await snapshot(page); assert.equal(failed.query, null); assert.equal(failed.queries, 0);
        await page.screenshot({ path: `${output}/after-local-query-error.png`, fullPage: true });
        await context.unroute('**/duckdb/**');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await page.getByRole('status').filter({ hasText: /Query completed/ }).waitFor({ timeout: 90000 });
        const recovered = await snapshot(page); assert.equal(recovered.query.result.returnedRows, 3);
        evidence.scenarios.push({ label: 'real-local-engine-network-failure-visible-and-explicit-retry', failed, recovered });
        await context.close();
    }
    // The deliberately broken local-engine case may try the existing pinned public WASM
    // fallback; it is also aborted locally. No data, provider or session request is allowed.
    assert.ok(evidence.externalAttempts.every(attempt => attempt.scenario === 'engine-error' && attempt.method === 'GET'
        && attempt.url === 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev20.0/dist/duckdb-eh.wasm'));
    evidence.aiOrSessionAttempts = 0;
    assert.deepEqual(evidence.pageErrors, []);
    console.log(`PASS local preview browser: ${evidence.scenarios.length} scenarios`);
} catch (error) {
    evidence.failure = String(error); throw error;
} finally {
    await writeFile(`${output}/browser.json`, JSON.stringify(evidence, null, 2));
    for (const context of contexts) await context.close().catch(() => {});
    for (const profile of profiles) await rm(profile, { recursive: true, force: true });
}
