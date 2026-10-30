// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm,open} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {executeQuickJsGuest} from '../services/sandbox/quickJsGuest';
import {resolveGuestLimits} from '../services/sandbox/javascriptGuestProtocol';
import {prepareSpillCommitFixture} from '../services/data/spillCommitQualificationFixture';
import {createCandidateCommitService} from '../services/data/candidateCommit';
import {bindSpillCandidateValidationContract} from '../services/data/spillCandidateValidation';
import {recoverCandidateReview,commitRecoveredCandidate} from '../services/data/candidateRecovery';
import type {CandidateSpillFactory} from '../services/data/candidateSpill';
import {acceptedSpillCsv,verifyAcceptedSpill,verifyAcceptedSpillMarker,type AcceptedSpillStorage} from '../services/data/acceptedSpill';
import type {StorageDatabase} from '../services/storageService';
import {beginRun,finishRun,scopeRunStore,beginSessionTransition} from '../services/session/sessionOwnership';
import {preparePiExecutor} from '../services/agent/runtime/pi/piExecutorPreparation';
import {restoreAcceptedDataset} from '../services/data/datasetRecoveryActions';
import {readDetachedCandidateDraft,revokeDetachedCandidateDraft} from '../services/data/detachedCandidateDraft';
import {commitHeadKey} from '../types/datasetCommit';

const dirs:string[]=[];const cleanups:Array<()=>void>=[];
afterEach(async()=>{cleanups.splice(0).forEach(f=>f());vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const wasm=newQuickJSWASMModuleFromVariant(variant);
const guest={get running(){return false;},run:(code,inputJson,options)=>executeQuickJsGuest({generation:1,code,inputJson,limits:resolveGuestLimits(options.limits)},()=>wasm,options.onStarted),cancel(){},dispose(){}} satisfies NonNullable<Parameters<typeof prepareSpillCommitFixture>[0]['guest']> & {readonly running:boolean};
const setup=async(options:{file?:File;scale?:number}={})=>{
    const dir=await mkdtemp(join(tmpdir(),'spill-commit-'));dirs.push(dir);let scratch='';
    const factory:CandidateSpillFactory=async(_sid,generation)=>{const owned=join(dir,generation);scratch=owned;await mkdir(owned);return {put:(n,t)=>writeFile(join(owned,n),t,{flag:'wx'}),get:n=>readFile(join(owned,n),'utf8'),remove:()=>rm(owned,{recursive:true,force:true})};};
    const f=await prepareSpillCommitFixture({file:options.file??new File(['key,payload,value\n0," α ",-2\n1,"",0\n2,"line\nlast",-1,,\n'],'synthetic.csv'),scale:options.scale,guest,spillFactory:factory});
    cleanups.push(f.cleanup);
    let fault='',worker='old',writes=0,removed=0;
    const storage:AcceptedSpillStorage=async(generation,create,current)=>{
        current();const path=join(dir,'accepted-'+generation);if(create)await mkdir(path);
        return {async writeCsv(parts,fence){const h=await open(join(path,'data.csv'),'wx');try{for await(const p of parts){fence();if(fault==='copy')throw new Error('injected_copy');if(fault==='quota')throw new DOMException('quota','QuotaExceededError');await h.write(p);writes++;}}finally{await h.close();}},
            seal:(t)=>writeFile(join(path,'manifest.json'),t,{flag:'wx'}),manifest:()=>readFile(join(path,'manifest.json'),'utf8'),
            file:async()=>new File([await openAsBlob(join(path,'data.csv'))],'data.csv'),remove:async()=>{removed++;await rm(path,{recursive:true,force:true});}};
    };
    let records=new Map<string,any>();
    const key=(name:string,k:string)=>name+'::'+k;
    // Transaction model for deterministic failures; real IndexedDB is independently exercised by browser qualification.
    const db={get:async(n,k)=>structuredClone(records.get(key(n,k))),transaction:()=>{
        if(fault==='persist')throw new Error('injected_persistence');
        const next=new Map(records);let abort=false;
        const done=new Promise<void>((resolve,reject)=>setTimeout(()=>{if(abort)reject(new Error('abort'));else{records=next;resolve();}},0));
        return {done,abort(){abort=true;},objectStore:(n:string)=>({get:async(k:string)=>structuredClone(next.get(key(n,k))),
            put:async(v:any)=>{next.set(key(n,v.recordId??v.id),structuredClone(v));},add:async(v:any)=>{if(next.has(key(n,v.recordId)))throw new Error('constraint');next.set(key(n,v.recordId),structuredClone(v));},
            delete:async(k:string)=>{next.delete(key(n,k));},index:()=>({get:async(k:string)=>[...next.values()].find(v=>v.approvalKey===k)})})};
    }} as unknown as StorageDatabase;
    const prepare=vi.fn(async(_file,m,current)=>{current();const previousWorker=worker;if(fault==='worker')throw new Error('injected_worker');return {binding:{engine:'duckdb' as const,tableName:'session_clean_dataset',loadVersion:`accepted-${m.digest}`,fallbackReason:null,fallbackStage:null},preview:[{key:'0',payload:' α ',value:-2}],
        activate(){current();worker='new';if(fault==='activate')throw new Error('injected_activation');},rollback(){worker=previousWorker;},finish(){}};});
    const service=createCandidateCommitService(f.store,{database:async()=>db,acceptedStorage:storage,prepareSpillBinding:prepare});
    return {...f,dir,storage,db,service,prepare,factory,get scratch(){return scratch;},get worker(){return worker;},get writes(){return writes;},get removed(){return removed;},fault:(v:string)=>{fault=v;}};
};
const reviewed=async(f:Awaited<ReturnType<typeof setup>>)=>f.service.review(f.candidate.candidateId,{idempotencyKey:'spill-intent-123456',primaryTable:'records'});

describe('supported exact spill commit and durable custody',()=>{
    it('prepares without writing; copies authenticated typed CSV only after exact approval, persists and activates',async()=>{
        const f=await setup(),before=f.root.getState().datasetBundle,r=await reviewed(f);
        expect(r.rowStorage).toBe('durable_spill');expect(r.spill?.rowCount).toBe(3);expect(f.writes).toBe(0);expect(f.root.getState().datasetBundle).toBe(before);
        expect(await f.service.commit({...f.service.approve(r)})).toMatchObject({status:'not_committed',reason:'approval_invalid'});
        const a=f.service.approve(r),out=await f.service.commit(a);expect(out).toMatchObject({status:'committed',acknowledgement:'installed'});
        expect(f.worker).toBe('new');expect(f.root.getState().csvData?.backing).toMatchObject({rowCount:3,ephemeral:false,readOnly:true});
        expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');expect(f.root.getState().csvData?.data.length).toBe(1);
        const m=await verifyAcceptedSpillMarker(out.marker!);expect((await verifyAcceptedSpill(m,()=>{},f.storage)).size).toBe(m.bytes);
        expect(m.meaning.columns.find(c=>c.name==='value')).toMatchObject({provenance:'confirmed',source:'user'});
        const persisted=JSON.parse(await readFile(join(f.dir,'accepted-'+m.generation,'manifest.json'),'utf8'));
        expect(persisted.meaning.columns.find((c:{name:string})=>c.name==='value')).toMatchObject({provenance:'confirmed',source:'user'});
        expect(acceptedSpillCsv(persisted).backing?.exactDecimalColumns).toEqual([{name:'value',scale:0,unit:'count',provenance:'confirmed',source:'user'}]);
        const legacy=structuredClone(persisted),column=legacy.meaning.columns.find((c:{name:string})=>c.name==='value');
        delete column.provenance;delete column.source;
        expect(acceptedSpillCsv(legacy).backing?.exactDecimalColumns).toEqual([{name:'value',scale:0,unit:'count',provenance:'confirmed',source:'user'}]);
        column.provenance='inferred';column.source='header';
        expect(acceptedSpillCsv(JSON.parse(JSON.stringify(legacy))).backing?.exactDecimalColumns).toEqual([{name:'value',scale:0,unit:'count',provenance:'inferred',source:'header'}]);
        expect(await readFile(join(f.dir,'accepted-'+m.generation,'data.csv'),'utf8')).toBe('"key","payload","value"\n"0"," α ",-2\n"1","",0\n"2","line\nlast",-1\n');
        expect(await f.service.commit(a)).toMatchObject({status:'not_committed',reason:'approval_consumed'});
        expect(()=>f.service.approve(r)).toThrow('input_version_changed');
    });
    it('preserves decimal minor units near the safe-integer ceiling without binary toFixed rounding',async()=>{
        const f=await setup({file:new File(['key,payload,value\n0,"",90071992547409.90\n1,"",-90071992547409.90\n'],'decimal.csv'),scale:2});
        const r=await reviewed(f),out=await f.service.commit(f.service.approve(r));
        expect(out).toMatchObject({status:'committed',acknowledgement:'installed'});
        expect(await readFile(join(f.dir,'accepted-'+r.spill!.generation,'data.csv'),'utf8'))
            .toBe('"key","payload","value"\n"0","",90071992547409.90\n"1","",-90071992547409.90\n');
    });
    it.each(['chunk','manifest','program','source','session','meaning','receipt'])('rejects %s mutation after review without replacing accepted data',async mode=>{
        const f=await setup(),r=await reviewed(f),a=f.service.approve(r),old=f.root.getState().datasetBundle;
        if(mode==='chunk')await writeFile(join(f.scratch,'chunk-0.json'),'{}');
        if(mode==='manifest')await writeFile(join(f.scratch,'manifest.json'),'{}');
        if(mode==='program')await f.store.codeExecution!.workspace.write(f.candidate.execution.program!.path,'return {};',1);
        if(mode==='source')f.root.setState({datasetBundle:{...old!,source:{...old!.source,inspection:{...f.source,byteSize:f.source.byteSize+1}}}});
        if(mode==='session')beginSessionTransition(f.root);
        if(mode==='meaning')f.root.candidateValidationContract={...f.root.candidateValidationContract!,spill:{...f.root.candidateValidationContract!.spill!,digest:'f'.repeat(64)}};
        if(mode==='receipt')await f.store.candidateStaging!.validate(f.candidate.candidateId,{lease:f.lease,toolCallId:'new',stepId:'new'});
        expect(await f.service.commit(a)).toMatchObject({status:'not_committed'});expect(f.worker).toBe('old');expect(f.root.getState().datasetBundle?.acceptedCommit).toBeUndefined();
    });
    it.each(['copy','quota','worker','persist'])('preserves old data and cleans only new generation on %s failure',async fault=>{
        const f=await setup(),r=await reviewed(f),old=f.root.getState().datasetBundle;f.fault(fault);
        expect(await f.service.commit(f.service.approve(r))).toMatchObject({status:'not_committed'});expect(f.root.getState().datasetBundle).toBe(old);expect(f.worker).toBe('old');
        expect(f.removed).toBe(1);expect(await f.db.get('dataset_commits',commitHeadKey(f.root.getState().sessionId))).toBeUndefined();
    });
    it.each(['copy','quota','worker','persist','activate','publication'])('preserves a REAL previously accepted generation on second-commit %s failure',async fault=>{
        const f=await setup(),first=await reviewed(f),out=await f.service.commit(f.service.approve(first));expect(out.acknowledgement).toBe('installed');
        const accepted=f.root.getState().datasetBundle!,oldFile=await verifyAcceptedSpill(out.marker!.acceptedSpill!,()=>{},f.storage);
        f.prep.task.close('completed');finishRun(f.root,f.lease);
        const lease=beginRun(f.root,'follow_up','second','second'),store=scopeRunStore(f.root,lease),goal='A fresh supported second candidate';
        f.root.candidateValidationContract=await bindSpillCandidateValidationContract(store,goal,out.marker!.acceptedSpill!.meaning);
        const prep=await preparePiExecutor(store,{entryPoint:'follow_up',goal,guest,spillFactory:f.factory});
        try{
            const p=await store.codeExecution!.workspace.write('/workspace/second.js',out.marker!.program.content,0),request={program:{path:p.path,revision:p.revision,sha256:p.sha256},inputs:[],mode:'source_records' as const,
                sourceRecords:{sourceId:f.source.sourceId,sha256:f.source.sha256,width:3,initialState:{}},output:{path:'/workspace/second.json',expectedRevision:0,format:'json' as const}};
            const context={lease,toolCallId:'second',stepId:'second'};await prep.task.beforeTool('code.run',request,'second');
            const e=await store.codeExecution!.run(request,context);expect(e.status).toBe('succeeded');
            prep.task.afterTool('code.run',{status:'success',toolName:'code.run',message:e.reasonCode,shouldStop:false,artifacts:{codeExecution:e}},context);
            const c=await store.candidateStaging!.stage(e.jobId,context);expect((await store.candidateStaging!.validate(c.candidateId,context)).decision).toBe('validated');
            const service=createCandidateCommitService(store,{database:async()=>f.db,acceptedStorage:f.storage,prepareSpillBinding:f.prepare});
            const r=await service.review(c.candidateId,{primaryTable:'records',idempotencyKey:'second-intent-123456'});
            f.fault(fault);
            if(fault==='publication'){const original=f.root.setState;f.root.setState=p=>{if(typeof p!=='function'&&p.datasetBundle?.acceptedCommit&&p.datasetBundle.acceptedCommit.commitId!==accepted.acceptedCommit!.commitId)throw new Error('injected_publication');original(p);};}
            expect(await service.commit(service.approve(r))).toMatchObject({status:'not_committed'});
            expect(f.root.getState().datasetBundle?.acceptedCommit?.commitId).toBe(out.marker!.commitId);expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');expect(f.worker).toBe('new');
            expect((await verifyAcceptedSpill(out.marker!.acceptedSpill!,()=>{},f.storage)).size).toBe(oldFile.size);
            expect((await f.db.get('dataset_commits',commitHeadKey(out.marker!.sessionId)))?.commitId).toBe(out.marker!.commitId);
        }finally{prep.task.close('cancelled');finishRun(f.root,lease);}
    });
    it.each(['chunk','manifest'])('reauthenticates all %s backing before preparing any exact review',async mode=>{
        const f=await setup();await writeFile(join(f.scratch,mode==='chunk'?'chunk-0.json':'manifest.json'),'{}');
        await expect(reviewed(f)).rejects.toThrow();expect(f.writes).toBe(0);expect(f.worker).toBe('old');
    });
    it('rejects expired exact approval before copying or admission',async()=>{
        const f=await setup(),r=await reviewed(f),a=f.service.approve(r);
        vi.spyOn(Date,'now').mockReturnValue(r.expiresAt+1);
        expect(()=>f.service.approve(r)).toThrow();expect(await f.service.commit(a)).toMatchObject({status:'not_committed',admitted:false});
        expect(f.writes).toBe(0);expect(f.worker).toBe('old');
    });
    it.each(['cancel','session','source'])('fences %s changes during isolated worker preparation before journal admission',async mode=>{
        const f=await setup(),r=await reviewed(f),old=f.root.getState().datasetBundle;
        f.prepare.mockImplementationOnce(async()=>{
            if(mode==='cancel')finishRun(f.root,f.lease);
            if(mode==='session')beginSessionTransition(f.root);
            if(mode==='source')f.root.setState({datasetBundle:{...old!,source:{...old!.source,inspection:{...f.source,byteSize:f.source.byteSize+1}}}});
            throw new Error('scope_revoked');
        });
        expect(await f.service.commit(f.service.approve(r))).toMatchObject({status:'not_committed',admitted:false});
        expect(f.worker).toBe('old');expect(f.removed).toBe(1);
        expect(await f.db.get('dataset_commits',commitHeadKey(f.root.getState().sessionId))).toBeUndefined();
    });
    it.each(['chunk','program','source','session','meaning','task','receipt'])('revokes suspended read-only draft after %s mutation',async mode=>{
        const f=await setup(),r=await reviewed(f);f.service.suspend(r);
        const pending=f.prep.task.suspend({question:'Exact review',interactionKind:'approval',options:[],resumeContext:{piCandidateApproval:{reviewId:r.reviewId,reviewDigest:r.reviewDigest}}});
        f.root.setState({pendingClarification:pending,activeAgentTask:f.prep.task.snapshot});
        if(mode==='task'){
            // A different task revision is not permission to keep displaying the old validated draft.
            f.root.setState({activeAgentTask:{...f.prep.task.snapshot,revision:f.prep.task.snapshot.revision+1}});
        }
        f.prep.task.close('blocked');finishRun(f.root,f.lease);
        if(mode==='chunk')await writeFile(join(f.scratch,'chunk-0.json'),'{}');
        if(mode==='program')await f.store.codeExecution!.workspace.write(f.candidate.execution.program!.path,'return {};',1);
        if(mode==='source')f.root.setState({datasetBundle:{...f.root.getState().datasetBundle!,source:{...f.root.getState().datasetBundle!.source,inspection:{...f.source,byteSize:f.source.byteSize+1}}}});
        if(mode==='session')beginSessionTransition(f.root);
        if(mode==='meaning')f.root.candidateValidationContract={...f.root.candidateValidationContract!,spill:{...f.root.candidateValidationContract!.spill!,digest:'f'.repeat(64)}};
        await expect(readDetachedCandidateDraft(f.root,f.candidate.candidateId,'records',mode==='receipt'?'f'.repeat(64):f.validation.receiptDigest)).rejects.toThrow();
        expect(f.writes).toBe(0);expect(f.worker).toBe('old');
    });
    it('compensates a failed state publication and keeps consumed approval plus both generations',async()=>{
        const f=await setup(),r=await reviewed(f),old=f.root.getState().datasetBundle,original=f.root.setState;
        f.root.setState=p=>{if(typeof p!=='function'&&p.datasetBundle?.acceptedCommit)throw new Error('injected_publication');original(p);};
        const out=await f.service.commit(f.service.approve(r));expect(out).toMatchObject({status:'not_committed',admitted:true});
        expect(f.worker).toBe('old');expect(f.root.getState().datasetBundle).toBe(old);expect(f.removed).toBe(0);
        expect(await f.db.get('dataset_commits',commitHeadKey(f.root.getState().sessionId))).toBeUndefined();
    });
    it('retains a narrow suspended draft port, then resumes exact service approval under a fresh real task lease',async()=>{
        const f=await setup(),r=await reviewed(f),capsule=f.service.suspend(r);
        const pending=f.prep.task.suspend({question:'Exact review',interactionKind:'approval',options:[],resumeContext:{piCandidateApproval:{reviewId:r.reviewId,reviewDigest:r.reviewDigest}}});
        f.root.setState({pendingClarification:pending,activeAgentTask:f.prep.task.snapshot});f.prep.task.close('blocked');finishRun(f.root,f.lease);
        expect((await readDetachedCandidateDraft(f.root,f.candidate.candidateId,'records',f.validation.receiptDigest,1)).rows).toHaveLength(2);
        await expect(f.store.candidateStaging!.previewAsync(f.candidate.candidateId,'records',f.validation.receiptDigest)).rejects.toThrow();
        const fresh=beginRun(f.root,'follow_up','fresh-spill','fresh-spill'),scoped=scopeRunStore({getState:f.root.getState,setState:f.root.setState},fresh);
        const prep=await preparePiExecutor(scoped,{entryPoint:'follow_up',goal:f.prep.task.snapshot.goal,continuation:pending.resumeContext!.piTaskContinuation,guest});
        try{f.service.resume(capsule,scoped);expect(await f.service.commit(f.service.approve(r))).toMatchObject({status:'committed',acknowledgement:'installed'});}
        finally{prep.task.close('completed');finishRun(f.root,fresh);}
        revokeDetachedCandidateDraft(f.root.getState,r.reviewId);
        await expect(readDetachedCandidateDraft(f.root,f.candidate.candidateId,'records',f.validation.receiptDigest)).rejects.toThrow();
    });
    it('requires explicit source revalidation after reload and issues a new exact service approval, never saved permission',async()=>{
        const f=await setup(),r=await reviewed(f),checkpoint=await f.service.recoveryCheckpoint(r);
        f.root.setState({candidateRecovery:checkpoint});f.prep.task.close('cancelled');finishRun(f.root,f.lease);beginSessionTransition(f.root);
        f.root.setState({csvData:null,canonicalCsvData:null});
        const dependencies={database:async()=>f.db,acceptedStorage:f.storage,prepareSpillBinding:f.prepare,spillFactory:f.factory,persist:async()=>true};
        const fresh=beginRun(f.root,'follow_up','revalidate','revalidate'),scoped=scopeRunStore(f.root,fresh);
        const file=new File(['key,payload,value\n0," α ",-2\n1,"",0\n2,"line\nlast",-1,,\n'],'synthetic.csv');
        await expect(recoverCandidateReview(scoped,{},dependencies)).rejects.toThrow('recovery_source_unavailable');
        const recovered=await recoverCandidateReview(scoped,{file,guest},dependencies);expect(recovered.status).toBe('review');
        if(recovered.status!=='review')throw new Error('test_expected_review');
        expect(recovered.review.digest).not.toBe(r.reviewDigest);expect(recovered.review.exact?.candidateId).not.toBe(r.candidateId);
        expect((await readDetachedCandidateDraft(f.root,recovered.review.exact!.candidateId,'records',recovered.review.exact!.validationDigest)).rows).toHaveLength(3);
        finishRun(f.root,fresh);
        const approving=beginRun(f.root,'follow_up','recovered-approve','recovered-approve'),target=scopeRunStore(f.root,approving);
        try{expect(await commitRecoveredCandidate(target,recovered.review,dependencies)).toMatchObject({rowStorage:'durable_spill'});
            await expect(commitRecoveredCandidate(target,{...recovered.review},dependencies)).rejects.toThrow('approval_invalid');
            expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');}
        finally{finishRun(f.root,approving);}
    });
    it('recovers accepted backing after a new session epoch without restoring approval; corrupt/missing storage fails closed',async()=>{
        const f=await setup(),r=await reviewed(f),out=await f.service.commit(f.service.approve(r));expect(out.status).toBe('committed');
        f.prep.task.close('completed');finishRun(f.root,f.lease);beginSessionTransition(f.root);
        f.root.setState({csvData:null,canonicalCsvData:null,datasetCommitBindingStatus:'awaiting_source'});
        const fresh=beginRun(f.root,'follow_up','restore','restore'),scoped=scopeRunStore(f.root,fresh);
        try{
            await restoreAcceptedDataset(scoped,{}, {database:async()=>f.db,acceptedStorage:f.storage,prepareSpillBinding:f.prepare});
            expect(f.root.getState().datasetCommitBindingStatus).toBe('ready');
            await writeFile(join(f.dir,'accepted-'+r.spill!.generation,'data.csv'),'broken');
            await expect(restoreAcceptedDataset(scoped,{}, {database:async()=>f.db,acceptedStorage:f.storage,prepareSpillBinding:f.prepare})).rejects.toThrow('accepted_content_mismatch');
            expect(f.root.getState().datasetCommitBindingStatus).toBe('binding_failed');
            await rm(join(f.dir,'accepted-'+r.spill!.generation),{recursive:true});
            await expect(restoreAcceptedDataset(scoped,{}, {database:async()=>f.db,acceptedStorage:f.storage,prepareSpillBinding:f.prepare})).rejects.toThrow();
        }finally{finishRun(f.root,fresh);}
    });
});
