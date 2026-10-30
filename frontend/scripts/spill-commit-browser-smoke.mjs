import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,writeFile,rm} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.argv[2]??'http://127.0.0.1:4193',output=process.argv[3]??'/tmp/spill-commit-browser.json';
assert.equal(new URL(base).hostname,'127.0.0.1');
const profile=await mkdtemp('/tmp/spill-commit-profile-'),assets=await readdir(new URL('../dist/assets/',import.meta.url));
const agent=assets.find(n=>/^csv_data_analysis_app-agent-.*\.js$/.test(n)),index=assets.find(n=>/^csv_data_analysis_index-.*\.js$/.test(n));
const alias=/piCandidateApprovalQualification as (\w+)/.exec(await readFile(new URL(`../dist/assets/${agent}`,import.meta.url),'utf8'))?.[1];assert.ok(alias&&index);
const sw=await readFile(new URL('../dist/service-worker.js',import.meta.url),'utf8');
const evidence={build:/const BUILD_VERSION = '([^']+)'/.exec(sw)?.[1],browser:'',pageErrors:[],externalAttempts:[],workers:0,scenarios:[],
    method:'Deterministic synthetic host-supported meaning, real File/QuickJS/OPFS/React Review→Approve/exact service/isolated DuckDB/IndexedDB/recovery. Ten queries use fixed expectations, NOT live AI answers.',
    memoryMethod:'CDP renderer Runtime.getHeapUsage every 200ms, excludes workers/WASM/Blob/OPFS/RSS; observed high-water, not aggregate peak memory.'};
let context;
try{
    context=await chromium.launchPersistentContext(profile,{executablePath:'/snap/chromium/current/usr/lib/chromium-browser/chrome',headless:true,
        args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],viewport:{width:1440,height:1000},serviceWorkers:'block'});
    evidence.browser=context.browser()?.version()??'Chromium';
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();evidence.externalAttempts.push(route.request().url());return route.abort();});
    for(const mode of ['deny','stale','decimal','decimal-ceiling','approve']){
        const decimal=mode.startsWith('decimal'),ceiling=mode==='decimal-ceiling';
        const rows=mode==='approve'?Number(process.argv[4]??27000):decimal?4:3,page=await context.newPage(),cdp=await context.newCDPSession(page);
        page.on('pageerror',e=>evidence.pageErrors.push(e.message));page.on('worker',()=>evidence.workers++);
        page.on('console',m=>{if(m.type()==='error'||m.text().startsWith('RECOVERYTRACE'))console.error('BROWSER',m.text());});
        await cdp.send('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'all'});await page.goto(base);await page.getByText('Select a file',{exact:true}).waitFor();
        await page.evaluate(async({index})=>{globalThis.qaRoot=(await import(`/assets/${index}`)).u;},{index});
        await page.waitForFunction(()=>!globalThis.qaRoot.getState().isAppInitializing);
        const fixture=`${profile}/${mode}.csv`;
        await writeFile(fixture,'key,payload,value\r\n'+Array.from({length:rows},(_,i)=>`${i},"${'x'.repeat(1000)}${i===rows-1?'α\r\n末尾':''}",${i%2?(ceiling?'-90071992547409.90':decimal?'-1.25':'-1'):'0'}${i===rows-1?',,':''}\r\n`).join(''));
        await page.evaluate(()=>{const i=document.createElement('input');i.id='spill-file';i.type='file';document.body.append(i);});await page.locator('#spill-file').setInputFiles(fixture);
        let heap=0,samples=0,busy=false;
        const sample=async()=>{if(busy)return;busy=true;try{heap=Math.max(heap,(await cdp.send('Runtime.getHeapUsage')).usedSize);samples++;}finally{busy=false;}};
        const timer=setInterval(()=>void sample().catch(()=>{}),200),started=Date.now();
        try{
            const pending=await page.evaluate(async({agent,index,alias,decimal})=>{
                const root=(await import(`/assets/${index}`)).u,qa=(await import(`/assets/${agent}`))[alias];
                root.setState({ensureDatasetSemanticSnapshot:async()=>null});
                const f=await qa.prepareSpillApprovalUiSmoke(root,document.querySelector('#spill-file').files[0],decimal?2:0);
                globalThis.spillQa={root,qa,f};const s=root.getState();
                return {candidateId:f.candidate.candidateId,result:f.result,before:f.before,bytes:f.source.byteSize,reads:{...f.reads},accepted:s.datasetBundle.acceptedCommit??null,
                    leaseReleased:!s.activeExecution,pending:!!s.pendingClarification?.resumeContext?.piCandidateApproval,
                    structural:f.candidate.spill.manifest,receipt:f.validation.receiptDigest,taskId:s.activeAgentTask.taskId};
            },{agent,index,alias,decimal});
            console.log('PENDING',JSON.stringify(pending));assert.equal(pending.accepted,null);assert.equal(pending.pending,true);assert.equal(pending.leaseReleased,true);
            assert.equal(pending.structural.commitAllowed,false);assert.equal(pending.structural.semanticValidation,'not_performed');
            const show=page.getByRole('button',{name:'Show Assistant panel',exact:true});if(await show.isVisible())await show.click();
            await page.getByRole('button',{name:'Inspect task',exact:true}).click();const review=page.getByRole('dialog',{name:'Task inspection',exact:true});
            await review.getByRole('button',{name:'Review',exact:true}).click();await review.getByText('Decision: validated',{exact:true}).waitFor();
            await review.getByRole('button',{name:'Read draft from start',exact:true}).click();await review.getByLabel('Draft rows',{exact:true}).waitFor();
            if(mode==='approve'&&rows>10){await review.getByRole('button',{name:'Next draft rows',exact:true}).click();await review.getByText(/Rows 11/).waitFor();}
            await page.screenshot({path:output+`.${mode}-review.png`});
            if(mode==='stale')await page.evaluate(async()=>{
                const f=globalThis.spillQa.f,p=f.candidate.execution.program;
                await f.store.codeExecution.workspace.write(p.path,'return {};',p.revision);
            });
            if(mode==='decimal'){
                // An interrupted unapproved proposal is not a saved grant. Revalidate through the actual recovery UI.
                await page.reload();await page.evaluate(async({index})=>{globalThis.qaRoot=(await import(`/assets/${index}`)).u;},{index});
                await page.waitForFunction(()=>!globalThis.qaRoot.getState().isAppInitializing);
                await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('button',{name:'Resume analysis',exact:true}).first().click();
                await page.getByLabel('Interrupted candidate original CSV',{exact:true}).setInputFiles(fixture);
                try{await page.getByRole('button',{name:'Approve recovered candidate',exact:true}).waitFor({timeout:60000});}
                catch(e){console.error('RECOVERY BLOCKED',await page.getByRole('region',{name:'Accepted dataset recovery'}).textContent().catch(()=>page.locator('body').innerText()));throw e;}
                await page.getByRole('button',{name:'Read draft from start',exact:true}).click();await page.getByLabel('Draft rows',{exact:true}).waitFor();
                await page.evaluate(async({agent,index,alias,pending})=>{const root=(await import(`/assets/${index}`)).u,qa=(await import(`/assets/${agent}`))[alias];
                    if(root.getState().datasetBundle.acceptedCommit)throw new Error('recovery_promoted_metadata');
                    if(root.getState().candidateRecovery.proposal.candidateId===pending.candidateId)throw new Error('recovery_reused_candidate');
                    globalThis.spillQa={root,qa,f:{reads:pending.reads,source:{byteSize:pending.bytes}}};},{agent,index,alias,pending});
                await page.getByRole('button',{name:'Approve recovered candidate',exact:true}).click();
            }else await review.getByRole('button',{name:mode!=='deny'?'Approve':'Deny',exact:true}).click();
            await page.waitForFunction(mode=>{const s=globalThis.spillQa.root.getState();return !s.isBusy&&!s.activeExecution&&!s.pendingClarification;},mode,{timeout:180000});
            if(mode==='deny'||mode==='stale'){
                const denied=await page.evaluate(()=>{const s=globalThis.spillQa.root.getState();return {accepted:s.datasetBundle.acceptedCommit??null,recovery:s.candidateRecovery,reads:globalThis.spillQa.f.reads};});
                assert.equal(denied.accepted,null);if(mode==='deny')assert.equal(denied.recovery,null);
                if(mode==='stale')assert.match(await page.locator('body').innerText(),/workspace_conflict|approval_invalid/);
                evidence.scenarios.push({mode,pending,denied});continue;
            }
            const committed=await page.evaluate(async({rows,decimal,ceiling})=>{
                const {root,qa,f}=globalThis.spillQa,s=root.getState();
                if(s.datasetCommitBindingStatus!=='ready')throw new Error(JSON.stringify({binding:s.datasetCommitBindingStatus,chat:s.chatHistory.slice(-3),task:s.activeAgentTask}));
                const plans=[{aggregates:[{function:'count',as:'n'}]}, {aggregates:[{function:'sum',column:'value',as:'n'}]},
                    {aggregates:[{function:'min',column:'value',as:'n'}]}, {aggregates:[{function:'max',column:'value',as:'n'}]},
                    {aggregates:[{function:'avg',column:'value',as:'n'}]}, {aggregates:[{function:'count_distinct',column:'key',as:'n'}]},
                    {where:{predicates:[{column:'value',operator:'eq',value:ceiling?-90071992547409.9:decimal?-1.25:-1}]},aggregates:[{function:'count',as:'n'}]},
                    {where:{predicates:[{column:'key',operator:'eq',value:String(rows-1)}]},select:['key','payload','value'],limit:1},
                    {where:{predicates:[{column:'key',operator:'eq',value:'0'}]},select:['key','value'],limit:1},
                    {groupBy:['value'],aggregates:[{function:'count',as:'n'}],orderBy:[{column:'value',direction:'asc'}]}];
                const queries=[];for(const plan of plans){const q=await qa.executeManagedDataQuery(s.csvData,plan,['key','payload','value'],{allowNativeFallback:false,bypassCache:true});
                    queries.push({rows:q.result.rows,engine:q.engine,sql:q.sqlPreview,loadVersion:q.loadVersion,boundary:q.result.executionBoundary});}
                return {commit:s.datasetBundle.acceptedCommit,binding:s.datasetCommitBindingStatus,backing:s.csvData.backing,previewRows:s.csvData.data.length,
                    queries,reads:f.reads,version:s.datasetBundle.datasetVersion,sourceBytes:f.source.byteSize};
            },{rows,decimal,ceiling});
            console.log('COMMITTED',JSON.stringify(committed));
            assert.equal(committed.queries.length,10);assert.ok(committed.queries.every(q=>q.engine==='duckdb'&&q.sql&&q.loadVersion===committed.version&&q.boundary));
            const unit=ceiling?90071992547409.9:decimal?1.25:1;
            for(const [i,value] of [rows,-Math.floor(rows/2)*unit,-unit,0,-Math.floor(rows/2)*unit/rows,rows,Math.floor(rows/2)].entries())assert.equal(Number(committed.queries[i].rows[0].n),value);
            assert.equal(committed.queries[7].rows[0].key,String(rows-1));
            assert.equal(committed.queries[7].rows[0].payload,'x'.repeat(1000)+'α\r\n末尾');
            assert.equal(committed.queries[8].rows[0].key,'0');assert.equal(committed.queries[9].rows.length,2);
            assert.deepEqual(committed.backing.exactDecimalColumns,[{name:'value',scale:decimal?2:0,unit:decimal?'SGD':'count',provenance:'confirmed',source:'user'}]);
            assert.match(committed.queries[1].sql,/SUM\("value"\)/);
            if(ceiling)assert.equal(committed.queries[1].rows[0].n,'-180143985094819.80');
            const repeated=await page.evaluate(async()=>{
                const root=globalThis.spillQa.root,before=root.getState().datasetBundle.acceptedCommit.commitId;
                await root.getState().handleClarificationResponse({label:'Approve',value:'approve'});
                return {before,after:root.getState().datasetBundle.acceptedCommit.commitId};
            });
            assert.equal(repeated.before,repeated.after);
            assert.equal(committed.backing.ephemeral,false);assert.ok(committed.previewRows<=20);assert.equal(committed.reads.bytes,committed.sourceBytes*4+3);assert.equal(committed.reads.fullReads,0);
            if(rows>=27000)assert.ok(committed.sourceBytes>25*1024*1024);
            // True reload discards every live approval, task, source handle and worker; recovery must use durable backing.
            await page.reload();await page.evaluate(async({index})=>{globalThis.qaRoot=(await import(`/assets/${index}`)).u;},{index});await page.waitForFunction(()=>!globalThis.qaRoot.getState().isAppInitializing);
            console.log('RELOAD',JSON.stringify(await page.evaluate(async({index})=>{const s=(await import(`/assets/${index}`)).u.getState();return {sessionId:s.sessionId,view:s.currentView,bundle:s.datasetBundle?.acceptedCommit,buttons:[...document.querySelectorAll('button')].map(b=>b.textContent)};},{index})));
            if(!await page.getByRole('button',{name:'Restore local rows',exact:true}).count()){
                await page.getByRole('button',{name:'History',exact:true}).click();
                await page.getByRole('button',{name:'Resume analysis',exact:true}).first().click();
            }
            await page.getByRole('button',{name:'Restore local rows',exact:true}).waitFor({timeout:60000});
            await page.evaluate(async({index})=>{const root=(await import(`/assets/${index}`)).u;globalThis.recoveryTrace=[];root.subscribe(s=>globalThis.recoveryTrace.push({csv:!!s.csvData,binding:s.datasetCommitBindingStatus,busy:s.isBusy,run:s.activeExecution?.runId}));},{index});
            await page.getByRole('button',{name:'Restore local rows',exact:true}).click();
            await page.waitForFunction(()=>{const s=globalThis.qaRoot.getState();return !s.isBusy&&!s.activeExecution&&!!s.csvData&&s.datasetCommitBindingStatus==='ready';},undefined,{timeout:180000});
            const restored=await page.evaluate(async({agent,index,alias})=>{
                const root=(await import(`/assets/${index}`)).u,qa=(await import(`/assets/${agent}`))[alias],s=root.getState();
                console.log('RECOVERYTRACE',JSON.stringify(globalThis.recoveryTrace));
                if(!s.csvData)throw new Error(JSON.stringify({recoveryTrace:globalThis.recoveryTrace,binding:s.datasetCommitBindingStatus,view:s.currentView}));
                const q=await qa.executeManagedDataQuery(s.csvData,{aggregates:[{function:'count',as:'n'}]},['key','payload','value'],{allowNativeFallback:false,bypassCache:true});
                globalThis.spillQa={root,qa};return {commit:s.datasetBundle.acceptedCommit,binding:s.datasetCommitBindingStatus,count:q.result.rows[0].n,engine:q.engine,pending:s.pendingClarification??null};
            },{agent,index,alias});
            assert.equal(restored.commit.commitId,committed.commit.commitId);assert.equal(Number(restored.count),rows);assert.equal(restored.engine,'duckdb');assert.equal(restored.pending,null);
            // Explicit source reattachment rechecks original bytes as bounded scanner slices as well as accepted backing.
            await page.reload();await page.evaluate(async({index})=>{globalThis.qaRoot=(await import(`/assets/${index}`)).u;},{index});
            await page.waitForFunction(()=>!globalThis.qaRoot.getState().isAppInitializing);
            await page.getByLabel('Recovery original CSV',{exact:true}).setInputFiles(fixture);
            await page.waitForFunction(()=>{const s=globalThis.qaRoot.getState();return !s.isBusy&&!s.activeExecution&&!!s.csvData&&s.datasetCommitBindingStatus==='ready';},undefined,{timeout:180000});
            evidence.scenarios.push({mode,pending,committed,restored,elapsedMs:Date.now()-started,sampledRendererHeapHighWater:heap,samples});
        }finally{clearInterval(timer);await sample();await page.close();}
    }
    assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.externalAttempts,[]);
}finally{await writeFile(output,JSON.stringify(evidence,null,2));await context?.close();await rm(profile,{recursive:true,force:true});}
console.log(`PASS: supported large exact commit and accepted recovery; evidence ${output}`);
