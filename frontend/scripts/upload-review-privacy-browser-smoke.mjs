import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4199';
assert.equal(new URL(base).hostname, '127.0.0.1');
const output = process.argv[3] ?? '/tmp/upload-review-privacy-evidence.json';
const sentinel = 'PRIVATE_CELL_SENTINEL';
const evidence = { base, checks: [], pageErrors: [], externalAttempts: [] };
const allowCodes = new Set(['boundary_incomplete', 'header_shape_drift', 'stacked_sections_set_aside', 'not_delimited_text', 'runtime_boundary_ambiguous', 'runtime_boundary_rejected', 'repeated_header_leakage', 'repeated_header_leakage_rate', 'low_structure_confidence', 'structure_proposal_verification_failed', 'complex_report_requires_confirmation', 'empty_dataset_guard', 'raw_inspection_completed', 'dominant_block_resolved', 'mixed_report_block_resolution', 'label_layer_retention_complete', 'multi_header_layer_retention_rate', 'wide_reshape_contract_complete', 'summary_like_series_key_leakage', 'summary_series_exclusion_rate', 'suspicious_collapse_score', 'hierarchy_depth_retention_rate', 'noise_leakage_rate', 'numeric_parse_rate', 'detail_series_coverage_rate', 'descriptor_preservation_rate', 'header_band_resolved', 'fact_key_uniqueness_rate', 'needs_structure_review', 'structure_outcome_unavailable', 'canonicalization_missing', 'shape_verification_failed', 'cleaning_failed', 'blocked_by_intake', 'parse_errors', 'intake_structure_uncertain', 'intake_diagnostics_missing', 'sql_precheck_pending', 'unknown_diagnostic']);
const indexAsset = (await readdir(new URL('../dist/assets/', import.meta.url))).find(name => /^csv_data_analysis_index-.*\.js$/.test(name));
assert.ok(indexAsset, 'built app index asset missing');
let browser;
async function open(label, failClear = false) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(fail => {
        localStorage.setItem('csv-ai-assistant-settings', JSON.stringify({ language: 'English' }));
        if (fail) {
            const original = Storage.prototype.clear;
            Storage.prototype.clear = function () {
                if (this === localStorage) throw new Error('synthetic localStorage.clear failure');
                return original.call(this);
            };
        }
    }, failClear);
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(base).origin) return route.continue();
        evidence.externalAttempts.push({ check: label, url: url.href, method: route.request().method() });
        return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => evidence.pageErrors.push({ check: label, error: error.message }));
    await page.goto(base);
    await page.getByText('Select a file', { exact: true }).first().waitFor({ timeout: 60000 });
    await page.getByText('Preparing your analysis workspace', { exact: false }).waitFor({ state: 'hidden', timeout: 90000 });
    await page.evaluate(async index => { window.__smokeStore = (await import(`/assets/${index}`)).u; }, indexAsset);
    await page.waitForFunction(() => !window.__smokeStore.getState().isAppInitializing, null, { timeout: 90000 });
    return { context, page };
}
async function expandDetails(page) {
    for (let i = 0; i < 20; i++) {
        const collapsed = page.locator('details:not([open]) > summary:visible, button[aria-expanded="false"]:visible').filter({ hasText: /details|technical/i }).first();
        if (!await collapsed.count()) return;
        await collapsed.click();
    }
    throw new Error('Too many expandable detail elements');
}
async function check(name, fn) {
    try {
        const result = await fn();
        const item = { name, status: result?.status ?? 'PASS', detail: result?.detail ?? '' };
        evidence.checks.push(item); console.log(`${item.status} ${name}${item.detail ? ': ' + item.detail : ''}`);
    } catch (error) {
        const item = { name, status: 'FAIL', detail: String(error) };
        evidence.checks.push(item); console.log(`FAIL ${name}: ${item.detail}`);
    }
}
async function upload(page, name, text) {
    await page.locator('#file-upload').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
}
async function settleUpload(page) {
    await page.waitForFunction(() => {
        const consent = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Use local processing only');
        return !window.__smokeStore.getState().isBusy || (consent && consent.getClientRects().length > 0);
    }, null, { timeout: 90000 });
    const consent = page.getByRole('button', { name: 'Use local processing only', exact: true });
    if (await consent.isVisible()) {
        await consent.click();
        await page.waitForFunction(() => !window.__smokeStore.getState().isBusy, null, { timeout: 90000 });
    }
}
async function clearData(page) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 30000 });
    await page.getByRole('button', { name: 'Clear all local data', exact: true }).click();
    await page.getByRole('button', { name: 'Delete everything', exact: true }).click();
}
try {
    browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : existsSync('/snap/chromium/current/usr/lib/chromium-browser/chrome') ? { executablePath: '/snap/chromium/current/usr/lib/chromium-browser/chrome' } : {}), headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    await check('ragged upload scan guidance and privacy', async () => {
        const { page, context } = await open('ragged');
        try {
            await upload(page, 'synthetic-ragged.csv', `a,b\n1,2,${sentinel}\n`);
            const panel = page.getByRole('region', { name: 'Full-source CSV scan' }).first();
            await panel.getByText('Full-source parsing complete — structural evidence needs repair').waitFor({ timeout: 90000 });
            assert.match(await panel.innerText(), /correct the original CSV and re-import it/);
            assert.ok(!(await page.locator('body').innerText()).includes(sentinel), 'sentinel visible before expanding details');
            await settleUpload(page);
            await expandDetails(page);
            assert.ok(!(await page.locator('body').innerText()).includes(sentinel), 'sentinel visible after expanding details');
            return { detail: 'source scan guidance visible; sentinel absent before and after expanding details' };
        } finally { await context.close(); }
    });
    await check('multi-section boundary technical privacy', async () => {
        const { page, context } = await open('multi-section');
        try {
            const fixture = await readFile(new URL('../tests/fixtures/weird-reports/w3_three_sections.csv', import.meta.url), 'utf8');
            const csv = fixture.replace('EVERGREEN SUPPLIES', sentinel);
            assert.notEqual(csv, fixture);
            await upload(page, 'synthetic-three-sections.csv', csv);
            const scan = page.getByRole('region', { name: 'Full-source CSV scan' }).first();
            await scan.getByText(/Full-source parsing complete/).waitFor({ timeout: 90000 });
            await settleUpload(page);
            const review = page.getByRole('button', { name: /Review structural interpretations|Review and repair/i }).first();
            if (await review.isVisible()) await review.click();
            const technical = page.locator('summary', { hasText: 'Technical details' });
            const dialog = page.getByRole('dialog').filter({ has: technical });
            if (!await dialog.isVisible()) {
                return { status: 'NOT_REACHED', detail: 'boundary confirm modal with Technical details not reached through real upload; no state injected' };
            }
            await expandDetails(page);
            assert.ok(!((await technical.locator('..').innerText()).includes(sentinel)), 'sentinel visible in technical details');
            const text = await technical.locator('..').innerText();
            const codeLine = text.split('\n').find(line => line.startsWith('Check codes:'));
            if (codeLine) for (const code of codeLine.slice('Check codes:'.length).split(',').map(x => x.trim())) assert.ok(allowCodes.has(code), `non-allowlisted code: ${code}`);
            return { detail: `technical details contain no sentinel; ${codeLine ?? 'no check codes displayed'}` };
        } finally { await context.close(); }
    });
    await check('clear failure warning and no reload', async () => {
        const { page, context } = await open('clear-failure', true);
        try {
            await page.evaluate(() => { window.__clearMarker = 'same-document'; });
            await clearData(page);
            const alert = page.getByRole('alert').filter({ hasText: 'Local data could not be fully cleared.' });
            await alert.waitFor({ timeout: 30000 });
            assert.match(await alert.innerText(), /Not fully cleared:.*local storage/);
            assert.equal(await page.evaluate(() => window.__clearMarker), 'same-document');
            return { detail: await alert.innerText() };
        } finally { await context.close(); }
    });
    await check('normal clear reload', async () => {
        const { page, context } = await open('clear-success');
        try {
            await page.evaluate(() => { window.__clearMarker = 'same-document'; });
            const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 30000 });
            await clearData(page);
            await navigation;
            assert.equal(await page.evaluate(() => window.__clearMarker), undefined);
            return { detail: 'main frame reloaded; window marker cleared' };
        } finally { await context.close(); }
    });
} catch (error) {
    evidence.checks.push({ name: 'harness', status: 'FAIL', detail: String(error) });
    console.log(`FAIL harness: ${error}`);
} finally {
    if (browser) await browser.close();
    for (const name of ['pageErrors', 'externalAttempts']) {
        const status = evidence[name].length ? 'FAIL' : 'PASS';
        evidence.checks.push({ name, status, detail: JSON.stringify(evidence[name]) });
        console.log(`${status} ${name}: ${JSON.stringify(evidence[name])}`);
    }
    await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
    if (evidence.checks.some(item => item.status === 'FAIL')) process.exitCode = 1;
}
