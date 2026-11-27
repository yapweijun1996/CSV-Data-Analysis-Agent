import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4183';
const output = process.argv[3] ?? '/tmp/source-record-stream-browser.json';
assert.equal(new URL(base).hostname, '127.0.0.1');
const profile = await mkdtemp('/tmp/source-record-stream-profile-');
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const agent = assets.find(name => /^csv_data_analysis_app-agent-.*\.js$/.test(name));
const code = await readFile(new URL(`../dist/assets/${agent}`, import.meta.url), 'utf8');
const alias = /piCandidateApprovalQualification as (\w+)/.exec(code)?.[1];
assert.ok(alias);
const evidence = { browser: '', pageErrors: [], externalAttempts: [], workerCount: 0, scenarios: [],
    memoryMethod: 'CDP Runtime.getHeapUsage sampled every 200 ms after app load and disk File selection; renderer V8 heap only, not worker/WASM/Blob/OPFS/process RSS. Excludes Node fixture construction and pre-sampling peaks. Observed high-water, not a proven process peak.' };
let context;
try {
    context = await chromium.launchPersistentContext(profile, {
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true,
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], serviceWorkers: 'block',
    });
    evidence.browser = context.browser()?.version() ?? 'persistent Chromium';
    await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
        evidence.externalAttempts.push(route.request().url()); return route.abort();
    });
    for (const rows of process.argv[4] ? [Number(process.argv[4])] : [9000, 27000]) {
        const page = await context.newPage();
        page.on('pageerror', error => evidence.pageErrors.push(error.message));
        page.on('worker', () => evidence.workerCount++);
        const cdp = await context.newCDPSession(page);
        // Do not clear origin storage between scenarios: a CDP Storage.clearDataForOrigin here made the second
        // scenario fail (InvalidStateError); the mechanism is not established. The profile already starts empty.
        await page.goto(base);
        const fixture = `${profile}/synthetic-${rows}.csv`;
        await writeFile(fixture, 'key,payload,value\r\n' + Array.from({ length: rows }, (_, i) =>
            `${i},"${'x'.repeat(1000)}${i === rows - 1 ? 'α\r\n末尾' : ''}",${i % 2 ? '-1' : '0'}${i === rows - 1 ? ',,' : ''}\r\n`).join(''));
        await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'stream-fixture'; document.body.append(input); });
        await page.locator('#stream-fixture').setInputFiles(fixture);
        let peakHeap = 0, samples = 0, sampling = false;
        const sample = async () => {
            if (sampling) return;
            sampling = true;
            try { const heap = await cdp.send('Runtime.getHeapUsage'); samples++; peakHeap = Math.max(peakHeap, heap.usedSize); }
            finally { sampling = false; }
        };
        const timer = setInterval(() => { void sample().catch(() => {}); }, 200);
        const started = Date.now();
        let result;
        try {
            result = await page.evaluate(async ({ agent, alias, rows }) => {
                const qa = (await import(`/assets/${agent}`))[alias];
                const f = await qa.qualifySourceStream(rows, undefined, undefined, document.querySelector('#stream-fixture').files[0]);
                try {
                    const outcome = await f.dispatch();
                    const receipt = outcome.artifacts?.codeExecution;
                    if (receipt?.status !== 'succeeded' || !receipt.sourceStream) throw new Error(JSON.stringify(outcome));
                    let commitBlocked = false;
                    try { f.adapter.assertCommitEligible(receipt.jobId, f.context); } catch { commitBlocked = true; }
                    const opfs = await navigator.storage.getDirectory();
                    const app = await opfs.getDirectoryHandle('csv-analysis-agent-temp');
                    const session = await app.getDirectoryHandle(f.root.getState().sessionId);
                    const generation = await session.getDirectoryHandle(`candidate-${receipt.sourceStream.manifest.generation}`);
                    const saved = JSON.parse(await (await (await generation.getFileHandle('manifest.json')).getFile()).text());
                    const last = JSON.parse(await (await (await generation.getFileHandle(`chunk-${saved.chunks - 1}.json`)).getFile()).text());
                    return { status: receipt.status, sourceBytes: f.source.byteSize, sourceSha256: f.source.sha256,
                        scan: { rows: f.scan.rows, anomalies: f.scan.counts }, reads: f.reads, ...receipt.sourceStream,
                        persistedManifestMatches: JSON.stringify(saved) === JSON.stringify(receipt.sourceStream.manifest),
                        tail: { sourceRow: last.rows.at(-1).sourceRow, value: last.rows.at(-1).cells[2],
                            utf8Multiline: last.rows.at(-1).cells[1].endsWith('α\r\n末尾'), width: last.rows.at(-1).cells.length },
                        commitBlocked, acceptedVersion: f.root.getState().datasetBundle.tables[0].datasetVersion };
                } finally { f.adapter.dispose(); }
            }, { agent, alias, rows });
        } finally { clearInterval(timer); await sample(); }
        assert.equal(result.status, 'succeeded', JSON.stringify(result));
        assert.ok(result.sourceBytes > (rows === 9000 ? 8 : 25) * 1024 * 1024);
        assert.equal(result.reads.fullReads, 0); assert.ok(result.reads.maxBytes <= 65536);
        assert.ok(result.reads.bytes <= 3 * result.sourceBytes + 3);
        assert.equal(result.metrics.physicalReadBytes, 2 * result.sourceBytes);
        assert.equal(result.metrics.validatedRows, rows + 1); assert.equal(result.manifest.sourceRows, rows + 1);
        assert.equal(result.manifest.semanticValidation, 'not_performed'); assert.equal(result.manifest.commitAllowed, false);
        assert.equal(result.persistedManifestMatches, true); assert.equal(result.tail.utf8Multiline, true);
        assert.equal(result.tail.sourceRow, rows); assert.equal(result.tail.width, 3);
        assert.equal(result.commitBlocked, true); assert.equal(result.acceptedVersion, 'v1');
        evidence.scenarios.push({ rows, durationMs: Date.now() - started, sampledRendererHeapHighWaterBytes: peakHeap, heapSamples: samples, ...result });
        console.log(JSON.stringify(evidence.scenarios.at(-1)));
        const unavailableBlob = await page.evaluate(async ({ agent, alias }) => {
            const qa = (await import(`/assets/${agent}`))[alias];
            const f = await qa.qualifySourceStream(3);
            const original = Blob.prototype.arrayBuffer;
            try {
                // Inject an unavailable native-read boundary after successful intake, not a browser fix.
                Blob.prototype.arrayBuffer = async () => { throw new DOMException('unavailable fixture', 'NotReadableError'); };
                const receipt = await f.adapter.run(f.request, f.context);
                return { status: receipt.status, reason: receipt.reasonCode, acceptedVersion: f.root.getState().datasetBundle.tables[0].datasetVersion };
            } finally { Blob.prototype.arrayBuffer = original; f.adapter.dispose(); }
        }, { agent, alias });
        assert.deepEqual(unavailableBlob, { status: 'blocked', reason: 'source_record_scan_failed', acceptedVersion: 'v1' });
        evidence.scenarios.at(-1).injectedUnavailableBlob = unavailableBlob;
        await page.close();
    }
    assert.deepEqual(evidence.pageErrors, []); assert.deepEqual(evidence.externalAttempts, []);
    assert.ok(evidence.workerCount >= evidence.scenarios.reduce((sum, scenario) => sum + scenario.metrics.batches, 0), `Only ${evidence.workerCount} workers observed`);
} finally {
    await writeFile(output, JSON.stringify(evidence, null, 2));
    await context?.close(); await rm(profile, { recursive: true, force: true });
}
console.log(`PASS: real browser worker/QuickJS/OPFS structural stream; evidence ${output}`);
