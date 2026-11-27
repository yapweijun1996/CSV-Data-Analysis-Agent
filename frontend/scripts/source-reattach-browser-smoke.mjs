import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// CA-191/CA-192: local-only import -> reload -> cancel / wrong file / original file.
// Uses only real UI and a loopback server. No provider calls or injected state.
// SITE_ROOT defaults to the checked-in deployment; CHROMIUM_PATH is optional.
const root = process.env.SITE_ROOT ?? fileURLToPath(new URL('../../', import.meta.url));
const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
    try {
        if (!file.startsWith(normalize(root + sep))) throw new Error('outside root');
        const body = await readFile(file);
        response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const name = 'synthetic-invoices.csv';
const original = 'Invoice,Customer,Amount\nINV-A,Alpha,123.45\nINV-B,Beta,67.89\nINV-C,Gamma,10.00\n';
const altered = original.replace('123.45', '999.45'); // Same name and byte size, different content.
const csv = text => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

const prompt = /Re-select the original CSV to restore this analysis/;
const mismatch = /does not match the saved source fingerprint/;
const localOnly = /Use local processing only/;
const viewData = /View data \(local\)/;
const unfinished = /unfinished cleaning|Continue cleaning/i;
// Positive control: the lazy Assistant must have rendered restored history before absence checks.
const restoredHistory = /Dataset imported using local processing only/;
const notReady = /session is not ready|Rebind the session/i;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pageErrors = [];
const external = [];
const results = [];

const check = async (label, assertion) => {
    try {
        await assertion();
        results.push({ label, pass: true });
    } catch (error) {
        results.push({ label, pass: false, error: error.message.split('\n')[0] });
        for (const context of browser.contexts()) {
            for (const page of context.pages()) console.log(`--- ${label}\n${(await page.locator('body').innerText()).slice(0, 900)}`);
        }
    }
};
const visible = (page, text, timeout = 30000) => page.getByText(text).first().waitFor({ timeout });

// The local-only consent dialog can appear for any selection, before the source is verified.
async function select(page, text, outcome) {
    await page.locator('#file-upload').setInputFiles(csv(text));
    const consent = page.getByRole('button', { name: localOnly });
    const done = page.getByText(outcome).or(page.getByRole('button', { name: outcome })).first();
    await consent.or(done).first().waitFor({ timeout: 60000 });
    if (await consent.isVisible()) await consent.click();
    await done.waitFor({ timeout: 60000 });
}

async function importThenReload() {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1365, height: 900 } });
    await context.addInitScript(() => {
        if (!localStorage.getItem('csv-ai-assistant-settings')) {
            localStorage.setItem('csv-ai-assistant-settings', JSON.stringify({ language: 'English' }));
        }
    });
    await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === base) return route.continue();
        external.push(route.request().url());
        return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(base);
    await visible(page, /Select a file/);
    await select(page, original, viewData);
    await page.waitForTimeout(4000); // Autosave debounce is 1.5 s.
    await page.reload();
    await visible(page, prompt);
    return { context, page };
}

// The restored dataset must be queryable again, which proves the DuckDB rebind.
async function assertOriginalRestored(page) {
    await select(page, original, viewData);
    await page.getByRole('button', { name: viewData }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Data explorer' });
    await dialog.getByText(/Query completed: 3 rows/).waitFor({ timeout: 60000 });
    await dialog.getByText('3 / 3 columns visible').waitFor();
    const grid = dialog.locator('[data-preview-result-grid]');
    await grid.locator('.tabulator-row').first().waitFor();
    assert.equal(await grid.locator('.tabulator-row').count(), 3);
    await grid.getByText('123.45', { exact: true }).waitFor();
    assert.equal(await page.getByText(notReady).count(), 0);
    assert.equal(await page.getByText(mismatch).count(), 0);
}

try {
    {
        const { context, page } = await importThenReload();
        await check('reload asks for the original source without false cleaning text', async () => {
            await visible(page, restoredHistory);
            assert.equal(await page.getByText(unfinished).count(), 0);
        });
        await check('cancelled file selection keeps the restore prompt', async () => {
            const chooser = page.waitForEvent('filechooser');
            await page.getByRole('button', { name: /Select a file/ }).click();
            await (await chooser).setFiles([]);
            await visible(page, prompt, 5000);
        });
        await check('original file restores and queries locally', () => assertOriginalRestored(page));
        await context.close();
    }
    {
        const { context, page } = await importThenReload();
        await check('altered file is rejected and the restore prompt stays', async () => {
            await select(page, altered, mismatch);
            await visible(page, prompt, 5000);
        });
        await check('original file still restores after a rejected file', () => assertOriginalRestored(page));
        await context.close();
    }
    {
        const { context, page } = await importThenReload();
        await check('second altered-file attempt is rejected', () => select(page, altered, mismatch));
        await page.waitForTimeout(4000);
        await page.reload();
        await check('restore prompt survives a reload after a rejected file', () => visible(page, prompt, 15000));
        await check('original file restores after that reload', () => assertOriginalRestored(page));
        await context.close();
    }
} finally {
    await browser.close();
    server.close();
}

console.log(JSON.stringify({ results, pageErrors, externalAttempts: external }, null, 2));
if (results.some(result => !result.pass) || pageErrors.length) process.exitCode = 1;
