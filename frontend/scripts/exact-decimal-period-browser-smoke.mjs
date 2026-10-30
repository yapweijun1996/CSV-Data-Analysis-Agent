import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4198';
const output = process.argv[3] ?? '/tmp/exact-decimal-period-browser.json';
assert.equal(new URL(base).hostname, '127.0.0.1');
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const agent = assets.find(n => /^csv_data_analysis_app-agent-.*\.js$/.test(n));
const index = assets.find(n => /^csv_data_analysis_index-.*\.js$/.test(n));
const alias = /piCandidateApprovalQualification as (\w+)/.exec(await readFile(new URL(`../dist/assets/${agent}`, import.meta.url), 'utf8'))?.[1];
assert.ok(alias && index);
const serviceWorker = await readFile(new URL('../dist/service-worker.js', import.meta.url), 'utf8');
const evidence = { build: /const BUILD_VERSION = '([^']+)'/.exec(serviceWorker)?.[1], scenarios: [], pageErrors: [], externalAttempts: [], workers: 0,
    method: 'Synthetic resolved host meaning; real QuickJS/OPFS/React exact review+approval/accepted typed DuckDB WASM/managed queries/true reload and durable recovery. No live AI.' };
const profile = await mkdtemp('/tmp/decimal-period-profile-');
let context;
try {
    context = await chromium.launchPersistentContext(profile, { executablePath: '/snap/chromium/current/usr/lib/chromium-browser/chrome', headless: true,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    evidence.browser = context.browser()?.version();
    await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
        evidence.externalAttempts.push(route.request().url()); return route.abort();
    });
    for (const mode of ['compatible', 'mixed-types', 'mixed-units']) {
        const page = await context.newPage();
        page.on('pageerror', error => evidence.pageErrors.push(error.message));
        page.on('worker', () => evidence.workers++);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'all' });
        await page.goto(base); await page.getByText('Select a file', { exact: true }).waitFor();
        assert.equal(await (await page.request.get(`${base}/service-worker.js`)).text(), serviceWorker);
        await page.evaluate(async ({ index }) => { globalThis.qaRoot = (await import(`/assets/${index}`)).u; }, { index });
        await page.waitForFunction(() => !globalThis.qaRoot.getState().isAppInitializing);
        const fixture = `${profile}/${mode}.csv`;
        await writeFile(fixture, 'key,payload,OCT 2010,NOV 2010,DEC 2010\r\n'
            + '0,a,90071992547409.90,0.01,0\r\n1,b,90071992547409.90,0.02,0\r\n'
            + '2,c,-90071992547409.90,-0.01,0\r\n3,d,-90071992547409.90,-0.02,0\r\n');
        await page.evaluate(() => { const input = document.createElement('input'); input.id = 'period-file'; input.type = 'file'; document.body.append(input); });
        await page.locator('#period-file').setInputFiles(fixture);
        const pending = await page.evaluate(async ({ agent, alias, mode }) => {
            const root = globalThis.qaRoot, qa = (await import(`/assets/${agent}`))[alias];
            root.setState({ ensureDatasetSemanticSnapshot: async () => null });
            const columns = [{ name: 'key', sourceColumn: 0, conversion: 'identity' }, { name: 'payload', sourceColumn: 1, conversion: 'identity' },
                { name: 'OCT 2010', sourceColumn: 2, conversion: 'decimal', scale: 2, unit: 'SGD' },
                mode === 'mixed-types' ? { name: 'NOV 2010', sourceColumn: 3, conversion: 'identity' }
                    : { name: 'NOV 2010', sourceColumn: 3, conversion: 'decimal', scale: 6, unit: 'SGD' },
                { name: 'DEC 2010', sourceColumn: 4, conversion: 'decimal', scale: 0, unit: mode === 'mixed-units' ? 'count' : 'SGD' }];
            const f = await qa.prepareSpillApprovalUiSmoke(root, document.querySelector('#period-file').files[0], 2, columns);
            globalThis.periodQa = { qa, root };
            return { accepted: root.getState().datasetBundle.acceptedCommit ?? null, pending: !!root.getState().pendingClarification,
                reads: f.reads, sourceBytes: f.source.byteSize, receipt: f.validation.receiptDigest, columns };
        }, { agent, alias, mode });
        assert.equal(pending.accepted, null); assert.equal(pending.pending, true);
        assert.equal(pending.reads.fullReads, 0); assert.equal(pending.reads.bytes, pending.sourceBytes * 4 + 3);
        const show = page.getByRole('button', { name: 'Show Assistant panel', exact: true }); if (await show.isVisible()) await show.click();
        await page.getByRole('button', { name: 'Inspect task', exact: true }).click();
        const review = page.getByRole('dialog', { name: 'Task inspection', exact: true });
        await review.getByRole('button', { name: 'Review', exact: true }).click();
        await review.getByText('Decision: validated', { exact: true }).waitFor();
        await review.getByRole('button', { name: 'Read draft from start', exact: true }).click();
        await review.getByLabel('Draft rows', { exact: true }).waitFor();
        await page.screenshot({ path: `${output}.${mode}.png` });
        await review.getByRole('button', { name: 'Approve', exact: true }).click();
        await page.waitForFunction(() => { const s = globalThis.qaRoot.getState(); return !s.isBusy && !s.activeExecution && !s.pendingClarification && s.datasetCommitBindingStatus === 'ready'; }, undefined, { timeout: 180000 });
        const query = async () => page.evaluate(async ({ agent, alias }) => {
            const root = globalThis.qaRoot, qa = (await import(`/assets/${agent}`))[alias], state = root.getState();
            const columns = ['key', 'payload', 'OCT 2010', 'NOV 2010', 'DEC 2010'], period = columns.slice(2).join(' + ');
            const plans = [
                { select: columns, orderBy: [{ column: 'key', direction: 'asc' }] },
                { aggregates: [{ function: 'count', column: period, as: 'n' }] },
                ...['count_distinct', 'sum', 'min', 'max'].map(fn => ({ aggregates: [{ function: fn, column: period, as: 'n' }] })),
                ...[['0', '1'], ['2', '3']].map(keys => ({ where: { predicates: [{ column: 'key', operator: 'in', value: keys }] }, aggregates: [{ function: 'sum', column: period, as: 'n' }] })),
                { aggregates: [{ function: 'sum', column: 'OCT 2010', as: 'n' }] },
                { where: { predicates: [{ column: 'OCT 2010', operator: 'eq', value: '90071992547409.90' }] }, aggregates: [{ function: 'count', as: 'n' }] },
            ];
            const queries = [];
            for (const plan of plans) {
                try {
                    const q = await qa.executeManagedDataQuery(state.csvData, plan, columns, { allowNativeFallback: false, bypassCache: true });
                    queries.push({ plan, rows: q.result.rows, engine: q.engine, sql: q.sqlPreview, loadVersion: q.loadVersion, boundary: q.result.executionBoundary });
                } catch (error) { queries.push({ plan, error: String(error) }); }
            }
            // Small synthetic fixture only: directly inspect persisted decimal spelling too.
            const backing = state.csvData.backing;
            let directory = await navigator.storage.getDirectory();
            const parts = backing.opfsPath.split('/').filter(Boolean);
            for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
            const file = await (await directory.getFileHandle(parts.at(-1))).getFile();
            if (file.size > 65536) throw new Error('qualification_fixture_too_large');
            return { queries, backing, rawAcceptedCsv: await file.text(), commit: state.datasetBundle.acceptedCommit, version: state.datasetBundle.datasetVersion };
        }, { agent, alias });
        const check = result => {
            assert.ok(result.queries.filter(q => !q.error).every(q => q.engine === 'duckdb' && q.sql && q.boundary && q.loadVersion === result.version));
            assert.equal(result.queries[0].rows[0]['OCT 2010'], '90071992547409.90');
            assert.equal(result.queries[0].rows[2]['OCT 2010'], '-90071992547409.90');
            assert.equal(result.queries[1].rows[0].n, 4);
            assert.equal(result.queries[8].rows[0].n, '0.00'); assert.equal(result.queries[9].rows[0].n, 2);
            assert.match(result.rawAcceptedCsv, /90071992547409\.90/);
            assert.deepEqual(result.backing.exactDecimalColumns, pending.columns.filter(c => c.conversion === 'decimal').map(({ name, scale, unit, provenance = 'confirmed', source = 'user' }) => ({ name, scale, unit, provenance, source })));
            if (mode === 'compatible') {
                for (const [i, value] of [[2, 4], [3, '0.000000'], [4, '-90071992547409.920000'], [5, '90071992547409.920000'], [6, '180143985094819.830000'], [7, '-180143985094819.830000']]) {
                    assert.equal(result.queries[i].rows[0].n, value); assert.ok(!result.queries[i].sql.includes('AS DOUBLE'));
                }
                assert.match(result.rawAcceptedCsv, /0\.010000/);
            } else {
                const reason = mode === 'mixed-types' ? /exact_decimal_period_mixed_types_unsupported/ : /exact_decimal_period_units_require_meaning/;
                for (let i = 2; i < 8; i++) assert.match(result.queries[i].error, reason);
            }
        };
        const committed = await query(); console.log('COMMITTED', mode, JSON.stringify(committed)); check(committed);
        await page.reload();
        await page.evaluate(async ({ index }) => { globalThis.qaRoot = (await import(`/assets/${index}`)).u; }, { index });
        await page.waitForFunction(() => !globalThis.qaRoot.getState().isAppInitializing);
        if (!await page.getByRole('button', { name: 'Restore local rows', exact: true }).count()) {
            await page.getByRole('button', { name: 'History', exact: true }).click();
            await page.getByRole('button', { name: 'Resume analysis', exact: true }).first().click();
        }
        await page.getByRole('button', { name: 'Restore local rows', exact: true }).waitFor({ timeout: 60000 });
        await page.getByRole('button', { name: 'Restore local rows', exact: true }).click();
        await page.waitForFunction(() => { const s = globalThis.qaRoot.getState(); return !s.isBusy && !s.activeExecution && !!s.csvData && s.datasetCommitBindingStatus === 'ready'; }, undefined, { timeout: 180000 });
        const restored = await query(); check(restored); assert.equal(restored.commit.commitId, committed.commit.commitId);
        evidence.scenarios.push({ mode, pending, committed, restored });
        await page.close();
    }
    assert.deepEqual(evidence.pageErrors, []); assert.deepEqual(evidence.externalAttempts, []);
} finally {
    await writeFile(output, JSON.stringify(evidence, null, 2)); await context?.close(); await rm(profile, { recursive: true, force: true });
}
console.log(`PASS: exact decimal period aggregation and recovery; ${output}`);
