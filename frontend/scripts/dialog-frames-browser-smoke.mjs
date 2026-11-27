import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

// Screenshot + layout regression for the shared dialog frames (ModalFrame / FullScreenFrame).
// For each viewport x colour scheme it opens the real dialogs and asserts: inside the viewport, no
// horizontal overflow, header/footer pinned while the body scrolls, focus trapped, Escape closes.
// Screenshots go to argv[3] (default: a temp dir) so a human can diff them after a failure.
// No provider/network access: every non-local request is aborted; consent uses "local processing only".
const base = process.argv[2] ?? 'http://127.0.0.1:4191';
assert.equal(new URL(base).hostname, '127.0.0.1');
const output = process.argv[3] ?? await mkdtemp('/tmp/dialog-frames-');
await mkdir(output, { recursive: true });
const fixture = join(output, 'messy-structure.csv');
await writeFile(fixture, [
    'Quarterly Sales Report - Confidential,,,,', 'Generated 2026-10-01,,,,', ',,,,',
    ',Region,Q1,Q2,Q3', ',,Units,Units,Units', ',North,120,130,150', ',South,90,95,99',
    ',East,70,80,85', ',West,60,66,70', ',Total,340,371,404', 'Notes: figures provisional,,,,',
].join('\n'));

const viewports = { desktop: [1280, 800], tablet: [768, 1024], mobile: [390, 844] };
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

async function geometry(dialogLocator) {
    return dialogLocator.evaluate(dialog => {
        const rect = dialog.getBoundingClientRect();
        const header = dialog.querySelector('header')?.getBoundingClientRect();
        const footer = dialog.querySelector('footer')?.getBoundingClientRect();
        return {
            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
            innerWidth, innerHeight, docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            headerTop: header?.top, headerBottom: header?.bottom, footerTop: footer?.top, footerBottom: footer?.bottom,
            focusInside: dialog.contains(document.activeElement),
        };
    });
}

async function verifyDialog(page, label, name, { fullScreen = false, expectFooter = false, escapeCloses = true } = {}) {
    // Scoped by accessible name: on phones the assistant drawer is itself a dialog underneath.
    const dialog = page.getByRole('dialog', { name });
    await dialog.waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(output, `${label}.png`) });
    const g = await geometry(dialog);
    check(g, `${label}: no dialog found`);
    if (!g) return;
    check(g.left >= -1 && g.right <= g.innerWidth + 1, `${label}: dialog exceeds viewport width (${g.left}..${g.right} of ${g.innerWidth})`);
    check(g.top >= -1 && g.bottom <= g.innerHeight + 1, `${label}: dialog exceeds viewport height (${g.top}..${g.bottom} of ${g.innerHeight})`);
    check(!g.docOverflow, `${label}: page has horizontal overflow`);
    if (!fullScreen) check(g.height <= g.innerHeight * 0.9 + 1, `${label}: dialog taller than 90% of the viewport (${g.height} > ${g.innerHeight * 0.9})`);
    if (fullScreen) check(Math.abs(g.width - g.innerWidth) <= 1 && Math.abs(g.height - g.innerHeight) <= 1, `${label}: full-screen dialog does not fill the viewport`);
    check(g.headerTop !== undefined && g.headerTop >= g.top - 1 && g.headerBottom > g.headerTop, `${label}: header missing or misplaced`);
    if (expectFooter) check(g.footerBottom !== undefined && g.footerBottom <= g.bottom + 1 && g.footerBottom > g.bottom - 4, `${label}: footer is not pinned to the dialog bottom`);
    // Scroll the longest scroll container to its end; header and footer must not move.
    const moved = await dialog.evaluate(dialog => {
        const scrollers = [...dialog.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
        const target = scrollers.sort((a, b) => b.clientHeight - a.clientHeight)[0];
        const before = [dialog.querySelector('header'), dialog.querySelector('footer')].map(el => el?.getBoundingClientRect().top);
        if (target) target.scrollTop = target.scrollHeight;
        const after = [dialog.querySelector('header'), dialog.querySelector('footer')].map(el => el?.getBoundingClientRect().top);
        return { scrolled: Boolean(target), same: before.every((v, i) => v === after[i]) };
    });
    check(moved.same, `${label}: header/footer moved while the body scrolled`);
    // Focus trap: 25 Tab presses must never leave the dialog.
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    check((await geometry(dialog))?.focusInside, `${label}: focus escaped the dialog`);
    if (escapeCloses) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        check(await dialog.count() === 0, `${label}: Escape did not close the dialog`);
    }
}

const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: process.env.HEADED !== '1', args: ['--no-sandbox'],
});
try {
    for (const scheme of ['light', 'dark']) {
        for (const [name, [width, height]] of Object.entries(viewports)) {
            const tag = `${name}-${scheme}`;
            const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, serviceWorkers: 'block' });
            await context.addInitScript(theme => { try { localStorage.setItem('theme', theme); } catch { /* storage may be blocked */ } }, scheme);
            await context.route('**/*', route => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${base}/index.html`);
            await page.waitForTimeout(2500);

            await page.getByRole('button', { name: /^History/i }).first().click();
            await verifyDialog(page, `${tag}-history`, /Analysis History/, { expectFooter: false });

            if (name === 'mobile') {
                await page.getByRole('button', { name: /Show Assistant panel/i }).click();
                await page.waitForTimeout(600);
            }
            await page.getByRole('button', { name: /^Settings$/i }).first().click();
            await page.getByRole('button', { name: 'Google Gemini' }).click();
            const pressed = await page.locator('[aria-pressed="true"]').evaluateAll(els => els.filter(el => /Default|Gemini|OpenAI|Anthropic|OpenRouter/.test(el.textContent ?? '')).length);
            check(pressed === 1, `${tag}-settings: ${pressed} providers are selected, expected exactly 1`);
            await page.getByLabel('Gemini API Key').fill('AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDUMMY');
            check(await page.getByLabel('Gemini API Key').getAttribute('type') === 'password', `${tag}-settings: API key is not masked by default`);
            await verifyDialog(page, `${tag}-settings`, /^Settings$/, { expectFooter: true });

            await page.getByRole('button', { name: /Report problem/i }).first().click();
            await verifyDialog(page, `${tag}-report-problem`, /Report a problem/, { expectFooter: true });

            // Real upload -> consent dialog -> local processing only -> structure repair review.
            await page.locator('input[type=file]').first().setInputFiles(fixture);
            await verifyDialog(page, `${tag}-cloud-consent`, /Allow this AI provider/, { expectFooter: true, escapeCloses: false });
            // Allowing the provider only moves the flow on; any outbound request is aborted by the route above.
            await page.getByRole('button', { name: /Allow and continue/ }).click();
            await verifyDialog(page, `${tag}-structure-repair`, /Review and repair data structure/, { expectFooter: true, escapeCloses: false });
            await page.getByRole('button', { name: 'Cancel' }).first().click();

            if (name !== 'mobile') {
                // The explorer needs a loaded dataset, so it opens after the repair review is dismissed.
                await page.getByRole('button', { name: /^Data Explorer/i }).first().click({ timeout: 15000 }).catch(() => failures.push(`${tag}: Data Explorer button stayed disabled`));
                await verifyDialog(page, `${tag}-data-explorer`, /Data explorer/i, { fullScreen: true });
            }

            check(errors.length === 0, `${tag}: page errors: ${errors.join(' | ')}`);
            await context.close();
        }
    }
} finally {
    await browser.close();
}
if (failures.length) {
    console.error(`dialog-frames smoke FAILED (${failures.length}); screenshots in ${output}`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}
console.log(`dialog-frames smoke passed; screenshots in ${output}`);
