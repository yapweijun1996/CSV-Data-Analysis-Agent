// Synthetic generated-app capacity and UI qualification. Local browser only; no provider calls.
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require(path.join(process.env.CA172_NODE_MODULES || path.resolve(__dirname, '../../node_modules'), 'playwright-core'));
const root = process.env.CA172_SITE_ROOT || path.resolve(__dirname, '../../dist'), out = process.env.CA172_OUTPUT_DIR;
if (!out || !process.env.CA172_BROWSER_PATH)
    throw Error('CA172_OUTPUT_DIR and CA172_BROWSER_PATH are required');
const mime = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (req.url === '/')
    p = path.join(root, 'index.html'); if (!p.startsWith(root + '/')) {
    res.writeHead(403);
    return res.end();
} fs.readFile(p, (e, b) => { if (e) {
    res.writeHead(404);
    return res.end('missing');
} res.setHeader('Content-Type', mime[path.extname(p)] || 'application/octet-stream'); res.end(b); }); });
const read = n => { try {
    return fs.readFileSync('/sys/fs/cgroup/' + n, 'utf8').trim();
}
catch {
    return null;
} };
(async () => {
    const { atomicWrite } = await import('./fixtureKit.mjs');
    const atomic = (name, value) => atomicWrite(path.join(out, name), JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n');
    await new Promise(r => server.listen(8769, '127.0.0.1', r));
    const browser = await chromium.launch({ executablePath: process.env.CA172_BROWSER_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
    const workerTargets=[];
    const targetCdp=await browser.newBrowserCDPSession();
    targetCdp.on('Target.targetCreated',({targetInfo})=>{if(targetInfo.type==='worker')workerTargets.push({id:targetInfo.targetId,url:targetInfo.url,created:Date.now()});});
    targetCdp.on('Target.targetInfoChanged',({targetInfo})=>{const target=workerTargets.find(t=>t.id===targetInfo.targetId);if(target)target.url=targetInfo.url;});
    targetCdp.on('Target.targetDestroyed',({targetId})=>{const target=workerTargets.find(t=>t.id===targetId);if(target)target.closed=Date.now();});
    await targetCdp.send('Target.setDiscoverTargets',{discover:true});
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
    // Observe host delivery/termination without changing guest requests or outcomes.
    await page.addInitScript(() => {
        const records = [], byWorker = new WeakMap();
        window.ca172WorkerObservations = records;
        const post = Worker.prototype.postMessage, terminate = Worker.prototype.terminate;
        Worker.prototype.postMessage = function (...args) {
            const request = args[0];
            if (request && typeof request.generation === 'number' && typeof request.code === 'string') {
                const record = {generation:request.generation, infinite:request.code==='while(true){}', postedAt:Date.now()};
                byWorker.set(this, record); records.push(record);
                this.addEventListener('message', event => {if(event.data?.event==='executing')record.startedAt=Date.now();});
            }
            return post.apply(this,args);
        };
        Worker.prototype.terminate = function () {
            const record=byWorker.get(this);if(record)record.terminateCalledAt=Date.now();
            return terminate.call(this);
        };
    });
    const workers = [], events = [], health = [], resource = [];
    let sample;
    page.on('worker', w => { const x = { url: w.url(), created: Date.now() }; workers.push(x); w.on('close', () => { x.closed = Date.now(); }); });
    page.on('console', m => { if (['warning', 'error'].includes(m.type()))
        events.push({ type: m.type(), text: m.text().slice(0, 300) }); });
    page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message.slice(0, 300) }));
    page.on('requestfailed', r => events.push({ type: 'requestfailed', url: r.url(), error: r.failure()?.errorText }));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8769/') ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:8769/?debug_yn=y');
    await page.waitForFunction(() => document.body.innerText.includes('Select a file'));
    const assets = fs.readdirSync(root + '/assets'), capacity = assets.find(n => /^csv_data_analysis_app-agent-.*\.js$/.test(n));
    if (!capacity)
        throw Error('missing capacity chunk');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    let busy = false;
    sample = setInterval(async () => { resource.push({ at: Date.now(), current: Number(read('memory.current')), peak: Number(read('memory.peak')) }); if (busy)
        return; busy = true; const started = Date.now(); try {
        const x = await cdp.send('Performance.getMetrics');
        health.push({ at: started, elapsedMs: Date.now() - started, metrics: x.metrics.filter(m => ['JSHeapUsedSize', 'JSHeapTotalSize', 'TaskDuration'].includes(m.name)) });
    }
    catch (e) {
        health.push({ at: started, error: e.message.slice(0, 100) });
    }
    finally {
        busy = false;
    } }, 200);
    let expectedSqlTargets=[];
    await page.exposeFunction('recordCapacity', x => {if(x.id==='sql-million-row-file')expectedSqlTargets=workerTargets.filter(t=>!t.closed&&(t.url.includes('duckDbWorker')||t.url.startsWith('blob:'))); console.log(JSON.stringify({ id: x.id, passed: x.passed, elapsedMs: x.elapsedMs, heartbeat: x.maxHeartbeatGapMs, reason: x.details?.error ?? x.details?.receipt?.reasonCode, sql: x.id.startsWith('sql-') ? x.details : undefined }, (_k, v) => typeof v === 'bigint' ? String(v) : v)); });
    const start = Date.now();
    let result;
    const capacityAlias = /codeCapacityQualification as (\w+)/.exec(fs.readFileSync(root + '/assets/' + capacity, 'utf8'))[1];
    try {
        result = await page.evaluate(async ({ url, alias }) => { const mod = await import(url); return mod[alias].qualifyCodeCapacity(new AbortController().signal, x => void window.recordCapacity(x)); }, { url: '/assets/' + capacity, alias: capacityAlias });
    }
    finally {
        clearInterval(sample);
    }
    await page.waitForTimeout(200);
    const stop = result.observations.find(x => x.id === 'native-stop');
    const sqlStop = result.observations.find(x => x.id === 'sql-stop');
    const sqlCloses = workers.filter(w => w.closed >= sqlStop?.details?.stopAtEpochMs && w.created <= sqlStop?.details?.stopAtEpochMs).map(w => ({ url: w.url, closureMs: w.closed - sqlStop.details.stopAtEpochMs }));
    const closes = workers.filter(w => w.closed >= stop?.details?.stopAtEpochMs && w.created <= stop?.details?.stopAtEpochMs).map(w => ({ url: w.url, closureMs: w.closed - stop.details.stopAtEpochMs }));
    const stopTarget=workerTargets.filter(t=>t.url.includes('javascriptGuestWorker')&&t.created>=stop.details.receipt.startedAt&&t.created<=stop.details.stopAtEpochMs);
    for(let i=0;i<30&&(expectedSqlTargets.some(t=>!t.closed)||stopTarget.some(t=>!t.closed));i++)await page.waitForTimeout(100);
    const targetProof=(targets,at)=>targets.map(t=>({...t,closureMs:t.closed?t.closed-at:null}));
    const guestTargetProof=targetProof(stopTarget,stop.details.stopAtEpochMs),sqlTargetProof=targetProof(expectedSqlTargets,sqlStop.details.stopAtEpochMs);
    const targetPass=guestTargetProof.length===1&&sqlTargetProof.length>=2&&[...guestTargetProof,...sqlTargetProof].every(t=>t.closureMs!==null&&t.closureMs>=0&&t.closureMs<=3000);
    const record = { workerTargetTermination:{passed:targetPass,guest:guestTargetProof,sql:sqlTargetProof},workerTargets,build: { indexSha256: require('crypto').createHash('sha256').update(fs.readFileSync(root + '/index.html')).digest('hex'), capacityChunk: capacity }, browser: await browser.version(), nodeHarness: process.version, profile: { cpuMax: read('cpu.max'), memoryMax: read('memory.max'), memorySwapMax: read('memory.swap.max'), memoryEvents: read('memory.events'), memoryPeak: read('memory.peak') }, elapsedMs: Date.now() - start, result, workerCloseAfterStop: closes, sqlWorkerCloseAfterStop: sqlCloses, workers, health, resource, events };
    await atomic('native.json', record);
    console.log('NATIVE_RESULT', result.passed,'targetProof',JSON.stringify(record.workerTargetTermination), 'workers', workers.length, 'closed', workers.filter(w => w.closed).length, 'stopClosure', JSON.stringify(closes));
    await atomicWrite(path.join(out, 'root.png'), await page.screenshot({ fullPage: true }));
    // Supplement the task matrix with the existing SQL result/text ceilings.
    const sqlAlias=/DuckDbWorkerClient as (\w+)/.exec(fs.readFileSync(root+'/assets/'+capacity,'utf8'))[1];
    const sqlQuotas=await page.evaluate(async({url,alias})=>{
        const Client=(await import(url))[alias],client=new Client(),binding={tableName:'session_clean_dataset',loadVersion:'ca172-sql-quotas'};
        const observations=[];
        const raw=(sql,limit=500)=>client.executeRawQuery({sql,limit,selectedColumns:[],expectedBinding:binding},10000);
        const refused=async(sql,limit,reason)=>{try{await raw(sql,limit);return false;}catch(e){return e.message===reason;}};
        const check=async(id,work)=>{
            let last=performance.now(),gap=0;const start=last;
            const tick=()=>{const now=performance.now();gap=Math.max(gap,now-last);last=now;};const timer=setInterval(tick,20);
            try{const result=await work();tick();observations.push({id,...result,elapsedMs:Math.round(performance.now()-start),maxHeartbeatGapMs:Math.round(gap)});}finally{clearInterval(timer);}
        };
        try{
            await client.initDuckDb(45000);await client.loadCleanDataset({...binding,csvText:'v\n1',csvFileName:'synthetic-quota.csv'},45000);
            await check('sql-rows-exact',async()=>{const r=await raw('SELECT range AS v FROM range(5001) ORDER BY v',5000);return{passed:r.rows.length===5000&&r.totalMatchedRows===5001&&r.truncated&&r.rows[0].v===0&&r.rows[4999].v===4999,details:{returnedRows:r.returnedRows,totalMatchedRows:r.totalMatchedRows,truncated:r.truncated}};});
            await check('sql-rows-overflow',async()=>({passed:await refused('SELECT 1 n',5001,'sql_limit_invalid'),details:{reason:'sql_limit_invalid'}}));
            await check('sql-columns-boundary',async()=>{const sql=n=>'SELECT '+Array.from({length:n},(_,i)=>'1 AS c'+i).join(',');const r=await raw(sql(50));return{passed:r.selectedColumns.length===50&&Object.keys(r.rows[0]).length===50&&await refused(sql(51),500,'sql_result_columns_exceeded'),details:{columns:50,overflowColumns:51}};});
            await check('sql-result-bytes-exact',async()=>{const r=await raw("SELECT repeat('x',2097141) AS v");const accounted=3+new TextEncoder().encode(JSON.stringify(r.rows[0])).length;return{passed:r.rows[0].v.length===2097141&&accounted===2097152&&!r.truncated,details:{accountedResultBytes:accounted,actualRowsJsonBytes:new TextEncoder().encode(JSON.stringify(r.rows)).length}};});
            await check('sql-result-bytes-overflow',async()=>({passed:await refused("SELECT repeat('x',2097142) AS v",500,'sql_result_bytes_exceeded'),details:{reason:'sql_result_bytes_exceeded'}}));
            await check('sql-text-boundary',async()=>{const prefix='SELECT 1 n /*',suffix='*/',sql=prefix+'x'.repeat(65536-prefix.length-suffix.length)+suffix;const r=await raw(sql);return{passed:r.rows[0].n===1&&await refused(sql+' ',500,'sql_text_bytes_exceeded'),details:{acceptedTextBytes:65536,rejectedTextBytes:65537}};});
            const expected=['sql-rows-exact','sql-rows-overflow','sql-columns-boundary','sql-result-bytes-exact','sql-result-bytes-overflow','sql-text-boundary'];
            return{passed:observations.length===expected.length&&new Set(observations.map(x=>x.id)).size===expected.length&&expected.every(id=>observations.some(x=>x.id===id))&&observations.every(x=>x.passed===true&&x.maxHeartbeatGapMs<=1000),observations};
        }finally{client.retireSession();}
    },{url:'/assets/'+capacity,alias:sqlAlias});
    await atomic('sql-quotas.json',{build:record.build,...sqlQuotas});console.log('SQL_QUOTAS',JSON.stringify(sqlQuotas));
    if (process.env.CA172_UI === '1') {
        const index = assets.find(n => /^csv_data_analysis_index-.*\.js$/.test(n));
        const bundleAlias = /createSingleTableDatasetBundle as (\w+)/.exec(fs.readFileSync(root + '/assets/' + capacity, 'utf8'))[1];
        await page.evaluate(async ({ index, capacity, bundleAlias }) => {
            const store = (await import('/assets/' + index)).u, agent = await import('/assets/' + capacity);
            const data = { fileName: 'synthetic-ui.csv', data: [{ v: 0 }, { v: -5 }, { v: 10 }] };
            const bundle = agent[bundleAlias]({ datasetId: 'ca172-ui', sourceFingerprint: 'synthetic-ui', file: { name: data.fileName, size: 15, lastModified: 0 }, data });
            store.setState({ currentView: 'analysis_dashboard', csvData: data, canonicalCsvData: data, datasetBundle: bundle, currentDatasetId: 'ca172-ui', semanticDatasetVersion: bundle.datasetVersion, isAsideVisible: true });
            window.ca172Store = store;
            window.ca172Snapshot = () => JSON.stringify([store.getState().canonicalCsvData, store.getState().datasetBundle, store.getState().analysisCards, store.getState().activeDataQuery]);
            window.ca172Before = window.ca172Snapshot();
            document.addEventListener('click', e => { if (e.target.textContent === 'Stop local checks')
                window.ca172UiStopAt = Date.now(); }, true);
        }, { index, capacity, bundleAlias });
        await page.getByRole('button', { name: 'Open Pi Browser Lab' }).click();
        const run = page.getByRole('button', { name: 'Run local capacity checks', exact: true });
        await run.click();
        await page.waitForFunction(() => document.querySelector('[role="dialog"] pre[role="status"]')?.textContent.includes('post-stop-job: pass'), null, { timeout: 60000 });
        await page.waitForFunction(() => document.body.innerText.includes('Stop local checks'));
        await page.waitForTimeout(200);
        const executing = await page.evaluate(() => window.ca172WorkerObservations.filter(w=>w.infinite&&w.startedAt&&!w.terminateCalledAt));
        const owned = workers.filter(w => w.url.includes('javascriptGuestWorker')).slice(-1);
        if (executing.length !== 1 || owned.length !== 1)
            throw Error('UI Stop requires one executing owned native guest');
        await page.getByRole('button', { name: 'Stop local checks', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[role="dialog"] pre[role="status"]')?.textContent.includes('Checks cancelled. Results are incomplete.'), null, { timeout: 3000 });
        const uiStop = await page.evaluate(() => ({ stopAt: window.ca172UiStopAt, acknowledgementMs: Date.now() - window.ca172UiStopAt, unchanged: window.ca172Snapshot() === window.ca172Before, text: document.querySelector('[role="dialog"] pre[role="status"]')?.textContent }));
        await run.waitFor({ state: 'visible' });
        if (!await run.isEnabled())
            throw Error('UI controls did not recover');
        for (let i = 0; i < 30 && owned.some(w => !w.closed); i++)
            await page.waitForTimeout(100);
        uiStop.executionObservation=executing[0];
        uiStop.workerClosureMs = owned.map(w => w.closed ? w.closed - uiStop.stopAt : null);
        if (!uiStop.unchanged || uiStop.acknowledgementMs > 1000 || uiStop.workerClosureMs.some(ms => ms === null || ms > 3000))
            throw Error('UI Stop target failed');
        await atomicWrite(path.join(out, 'ui-stop.png'), await page.screenshot({ fullPage: true }));
        await run.click();
        await page.waitForFunction(() => document.querySelector('[role="dialog"] pre[role="status"]')?.textContent.includes('Local capacity checks passed.') || document.querySelector('[role="dialog"] pre[role="status"]')?.textContent.includes('Local capacity checks incomplete or failed.'), null, { timeout: 180000 });
        const uiRepeat = await page.evaluate(() => ({ unchanged: window.ca172Snapshot() === window.ca172Before, text: document.querySelector('[role="dialog"] pre[role="status"]')?.textContent }));
        if (!uiRepeat.unchanged || !uiRepeat.text.includes('Local capacity checks passed.') || !await run.isEnabled())
            throw Error('UI repeat matrix failed');
        await atomicWrite(path.join(out, 'ui-repeat.png'), await page.screenshot({ fullPage: true }));
        await page.getByRole('button', { name: 'Close Pi Browser Lab' }).click();
        await page.reload();
        await page.waitForFunction(() => !document.body.innerText.includes('Stop local checks'));
        const reload = { noLocalBusyControls: await page.getByRole('button', { name: 'Stop local checks', exact: true }).count() === 0, body: await page.locator('body').innerText() };
        await atomic('ui.json', { uiStop, uiRepeat, reload,finalProfile:{memoryPeak:read('memory.peak'),memoryEvents:read('memory.events')},workerObservations:await page.evaluate(()=>window.ca172WorkerObservations) });
        console.log('UI_RESULT', JSON.stringify({ acknowledgementMs: uiStop.acknowledgementMs, workerClosureMs: uiStop.workerClosureMs, unchanged: uiRepeat.unchanged }));
    }
    await browser.close();
    server.close();
    if (!result.passed || !sqlQuotas.passed || !targetPass || health.some(x => x.error || x.elapsedMs > 1000) || events.some(x => x.type === 'pageerror'))
        process.exitCode = 1;
})().catch(e => { console.error(e); server.close(); process.exit(1); });
