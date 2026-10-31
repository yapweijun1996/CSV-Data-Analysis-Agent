import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Serve frontend/dist with Vite preview before running. Never send fixture data remotely.
const base = process.argv[2] ?? 'http://127.0.0.1:4199';
assert.equal(new URL(base).hostname, '127.0.0.1');
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const agent = assets.find(name => /^csv_data_analysis_app-agent-.*\.js$/.test(name));
const index = assets.find(name => /^csv_data_analysis_index-.*\.js$/.test(name));
assert.ok(agent && index, 'build assets missing');
const alias = /piCandidateApprovalQualification as (\w+)/.exec(await readFile(new URL(`../dist/assets/${agent}`, import.meta.url), 'utf8'))?.[1];
assert.ok(alias, 'query qualification entry missing');
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : existsSync('/snap/chromium/current/usr/lib/chromium-browser/chrome') ? { executablePath: '/snap/chromium/current/usr/lib/chromium-browser/chrome' } : {}), headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
async function scenario(name, csv, plans, check) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, serviceWorkers: 'block' });
    try {
        await context.addInitScript(() => localStorage.setItem('csv-ai-assistant-settings', JSON.stringify({ language: 'English' })));
        await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.goto(base);
        await page.getByText('Select a file', { exact: true }).first().waitFor({ timeout: 60000 });
        await page.getByText('Preparing your analysis workspace', { exact: false }).waitFor({ state: 'hidden', timeout: 90000 });
        await page.evaluate(async indexAsset => { window.smokeStore = (await import(`/assets/${indexAsset}`)).u; }, index);
        await page.waitForFunction(() => !window.smokeStore.getState().isAppInitializing, null, { timeout: 90000 });
        await page.locator('#file-upload').setInputFiles({ name: `${name}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
        await page.waitForFunction(() => {
            const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Use local processing only');
            return !window.smokeStore.getState().isBusy || (button && button.getClientRects().length > 0);
        }, null, { timeout: 90000 });
        const consent = page.getByRole('button', { name: 'Use local processing only', exact: true });
        if (await consent.isVisible()) await consent.click();
        await page.waitForFunction(() => !window.smokeStore.getState().isBusy && !!window.smokeStore.getState().csvData, null, { timeout: 90000 });
        console.log(`PASS ${name} upload: synthetic CSV uploaded through file input`);
        const results = await page.evaluate(async ({ agentAsset, exportName, plans: queryPlans }) => {
            const qa = (await import(`/assets/${agentAsset}`))[exportName];
            const state = window.smokeStore.getState();
            const columns = Object.keys(state.csvData.data[0] ?? {});
            const results = [];
            for (const plan of queryPlans) {
                try {
                    const query = await qa.executeManagedDataQuery(state.csvData, plan, columns, { inferUnitColumn: true, allowNativeFallback: false, bypassCache: true });
                    results.push({ rows: query.result.rows, unitInferred: query.result.unitInferred ?? false });
                } catch (error) { results.push({ error: String(error) }); }
            }
            return results;
        }, { agentAsset: agent, exportName: alias, plans });
        check(results);
    } catch (error) {
        failures++;
        console.log(`FAIL ${name}: ${error.message}`);
    } finally { await context.close(); }
}
const sum = { aggregates: [{ function: 'sum', column: 'amount', as: 'total' }] };
const count = { aggregates: [{ function: 'count', as: 'n' }] };
try {
    await scenario('mixed', 'item,amount,unit\nmixed,10,kg\nmixed,20,lb\nsafe,3,kg\nsafe,4,kg\n', [sum, { ...sum, where: { predicates: [{ column: 'item', operator: 'eq', value: 'safe' }] } }, count], results => {
        assert.match(results[0].error ?? '', /mixed_or_missing_units/);
        console.log('PASS mixed query entry: mixed_or_missing_units; no result rows');
        assert.equal(Number(results[1].rows[0].total), 7);
        assert.equal(results[1].unitInferred, true);
        console.log('PASS filtered query entry: total 7; unitInferred true');
        assert.equal(Number(results[2].rows[0].n), 4);
        console.log('PASS mixed count query entry: 4');
    });
    await scenario('unitless', 'item,amount\na,5\nb,6\n', [sum, count], results => {
        assert.equal(Number(results[0].rows[0].total), 11);
        assert.equal(results[0].unitInferred, false);
        console.log('PASS unitless query entry: total 11; unitInferred false');
        assert.equal(Number(results[1].rows[0].n), 2);
        console.log('PASS unitless count query entry: 2');
    });
    console.log('NOT_REACHED mixed refusal UI: live LLM not used; managed query entry does not render chat');
    console.log('NOT_REACHED filtered total and inferred label UI: live LLM not used; managed query entry does not render chat');
    console.log('NOT_REACHED unitless total and label absence UI: live LLM not used; managed query entry does not render chat');
    console.log('NOT_REACHED counts UI: live LLM not used; managed query entry does not render chat');
} finally { await browser.close(); }
if (failures) process.exitCode = 1;
