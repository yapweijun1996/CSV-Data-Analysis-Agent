// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {createAssistantMessageEventStream,type AssistantMessage} from '@earendil-works/pi-ai';
import type {StreamFn} from '@earendil-works/pi-agent-core';
import {executeQuickJsGuest} from '../services/sandbox/quickJsGuest';
import {resolveGuestLimits} from '../services/sandbox/javascriptGuestProtocol';
import {prepareCandidateCommitFixture} from '../services/data/candidateCommitQualificationFixture';
import {runPiFollowUpTurn} from '../services/agent/runtime/pi/piFollowUpRuntimeService';
import {resumePiCandidateApproval} from '../services/agent/runtime/pi/piCandidateApproval';
import {inspectPiCandidateReview} from '../services/agent/runtime/pi/piCandidateReviewState';
import {preparePiExecutor} from '../services/agent/runtime/pi/piExecutorPreparation';
import {beginRun,finishRun,scopeRunStore,beginSessionTransition,cancelOwnedRun} from '../services/session/sessionOwnership';
import {drainSessionPersistence,queueSessionWrite} from '../services/persistence/currentSessionPersistence';
import type {DatasetCommitMarker} from '../types/datasetCommit';
import type {StorageDatabase} from '../services/storageService';
import {buildTaskExport} from '../services/agent/runtime/pi/piTaskExports';
import {unzipSync,strFromU8} from 'fflate';

const io=vi.hoisted(()=>({records:new Map<string,unknown>(),attempts:0,queryCalls:0,beforeQuery:undefined as undefined|(()=>Promise<void>)}));
vi.mock('../services/persistence/currentSessionPersistence',async original=>({...await original<typeof import('../services/persistence/currentSessionPersistence')>(),persistCurrentAppSessionSnapshot:vi.fn(async()=>true)}));
vi.mock('../services/agent/memory/followUpMemory',()=>({readAppFollowUpMemory:vi.fn(async()=>[])}));
vi.mock('../services/privacy/cloudAiConsent',()=>({ensureCloudAiConsent:vi.fn(async()=>undefined)}));
vi.mock('../services/data/candidateCommit',async original=>{
    const actual=await original<typeof import('../services/data/candidateCommit')>();
    return {...actual,createCandidateCommitService:(store,options)=>actual.createCandidateCommitService(store,{database:async()=>({get:async(_n,key)=>io.records.get(String(key))}) as StorageDatabase,...options})};
});
vi.mock('../services/persistence/datasetCommitStorage',()=>({
    readCommitIntent:async(_db,sid,key)=>io.records.get(JSON.stringify(['intent',sid,key])),
    commitDatasetTransaction:async(_db,marker:DatasetCommitMarker,_baseline,check,admit)=>{
        check();admit();io.attempts++;io.records.set(marker.recordId,structuredClone(marker));io.records.set(JSON.stringify(['head',marker.sessionId]),{kind:'head',commitId:marker.commitId});return {marker,replay:false};
    },
}));
vi.mock('../services/duckdb/queryEngine',async original=>{
    const actual=await original<typeof import('../services/duckdb/queryEngine')>();
    const bind:typeof actual.primeDuckDbDataset=vi.fn(async()=>({engine:'duckdb' as const,tableName:'data',loadVersion:'bound',fallbackReason:null,fallbackStage:null}));
    return {...actual,primeDuckDbDataset:bind,
        // Only the worker I/O is modeled; retain production activation/rollback and query custody.
        prepareOrdinaryDatasetBinding:(...args:Parameters<typeof actual.prepareOrdinaryDatasetBinding>)=>actual.prepareOrdinaryDatasetBinding(args[0],args[1],args[2],args[3]??bind),
        executeManagedDataQuery:async(data,plan,allowedColumns)=>{
            io.queryCalls++;await io.beforeQuery?.();
            const {executeDataQuery}=await import('../services/agent/execution/dataOperationRunner');
            return {result:executeDataQuery(data.data,plan,{allowedColumns,maxRows:500,maxColumns:50,maxOrderBy:3}),engine:'native',tableName:null,loadVersion:null,sqlPreview:null,fallbackReason:null};
        }};
});
const wasm=newQuickJSWASMModuleFromVariant(variant);
const guest={run:(code,inputJson,options)=>executeQuickJsGuest({generation:1,code,inputJson,limits:resolveGuestLimits(options.limits)},()=>wasm,options.onStarted),cancel(){},dispose(){}} satisfies NonNullable<Parameters<typeof prepareCandidateCommitFixture>[0]>['guest'];
const usage={input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
const scripted=(next:(context:Parameters<StreamFn>[1])=>AssistantMessage['content']):StreamFn=>(model,context)=>{
    const content=next(context),reason=content.some(c=>c.type==='toolCall')?'toolUse':'stop';
    const message:AssistantMessage={role:'assistant',content,api:model.api,provider:model.provider,model:model.id,usage,stopReason:reason,timestamp:Date.now()};
    const stream=createAssistantMessageEventStream();stream.push({type:'start',partial:message});stream.push({type:'done',reason,message});return stream;
};
const call=(name:string,args:Record<string,unknown>):AssistantMessage['content']=>[{type:'toolCall',name,id:crypto.randomUUID(),arguments:args as import('@earendil-works/pi-ai').JsonObject}];
const lie:AssistantMessage['content']=[{type:'text',text:'999, completed.'}];
const setup=async(options:{exhaustAttempts?:boolean;onSuspended?:()=>void;artifact?:Parameters<typeof prepareCandidateCommitFixture>[0]['queryUnderstandingArtifact'];artifactDependency?:boolean;weightedMedian?:boolean}={})=>{
    const f=await prepareCandidateCommitFixture({guest,queryUnderstandingArtifact:options.artifact,weightedMedian:options.weightedMedian});
    if(options.artifactDependency){
        f.store.candidateStaging!.abandon(f.candidate.candidateId);
        const rules=await f.store.codeExecution!.workspace.write('/workspace/rules.json','{"detailRows":2}',0);
        f.program=await f.store.codeExecution!.workspace.write(f.program.path,
            `if(JSON.parse(input.rules.content).detailRows!==2)throw new Error('Unexpected rules');${f.program.content}`,f.program.revision);
        const request={...f.execution.runRequest!,program:{path:f.program.path,revision:f.program.revision,sha256:f.program.sha256},
            inputs:[{name:'rules',path:rules.path,revision:rules.revision,sha256:rules.sha256}],
            output:{...f.execution.runRequest!.output,expectedRevision:1}};
        const context={lease:f.lease,toolCallId:'export-dependency-code',stepId:'export-dependency-code'};
        await f.prep.task.beforeTool('code.run',request,context.toolCallId);
        f.execution=await f.store.codeExecution!.run(request,context);
        f.prep.task.afterTool('code.run',{status:'success',toolName:'code.run',message:f.execution.reasonCode,shouldStop:false,artifacts:{codeExecution:f.execution}},context);
        expect(f.execution.status).toBe('succeeded');
        const stageContext={lease:f.lease,toolCallId:'export-dependency-stage',stepId:'export-dependency-stage'};
        await f.prep.task.beforeTool('candidate.stage',{jobId:f.execution.jobId},stageContext.toolCallId);
        f.candidate=await f.store.candidateStaging!.stage(f.execution.jobId,stageContext);
        f.prep.task.afterTool('candidate.stage',{status:'success',toolName:'candidate.stage',message:'Staged candidate.',shouldStop:false,artifacts:{candidate:f.candidate}},stageContext);
        const validationContext={lease:f.lease,toolCallId:'export-dependency-validate',stepId:'export-dependency-validate'};
        await f.prep.task.beforeTool('candidate.validate',{candidateId:f.candidate.candidateId},validationContext.toolCallId);
        f.validation=await f.store.candidateStaging!.validate(f.candidate.candidateId,validationContext);
        f.prep.task.afterTool('candidate.validate',{status:'success',toolName:'candidate.validate',message:'Validated candidate.',shouldStop:false,artifacts:{candidateValidation:f.validation}},validationContext);
        expect(f.validation.decision).toBe('validated');
    }
    f.root.setState({settings:{...f.root.getState().settings,provider:'default',complexModel:'mock'},logAgentToolUsage:vi.fn(),addProgress:vi.fn(),clearActiveTurnCancellation:vi.fn(),setStreamingMessage:vi.fn(),chatHistory:[],agentEvents:[],agentToolLogs:[],runtimeEvents:[],dataQualityIssues:[],telemetryEvents:[],queryHistory:[]});
    if(options.exhaustAttempts){await f.prep.task.beforeTool('code.run',{},'budget-a');await f.prep.task.beforeTool('code.run',{},'budget-b');}
    const visibleReviewLeases:Array<string|null>=[],set=f.root.setState;
    f.root.setState=patch=>{set(patch);const state=f.root.getState();if(state.pendingClarification?.resumeContext?.piCandidateApproval
        ||state.activeTurn?.pendingClarificationRequest?.resumeContext?.piCandidateApproval)visibleReviewLeases.push(state.activeExecution?.runId??null);};
    const errors:string[]=[];
    const result=await runPiFollowUpTurn({message:f.prep.task.snapshot.goal,queryUnderstandingArtifact:options.artifact},f.store,
        scripted(context=>{errors.push(...context.messages.filter(m=>m.role==='toolResult').flatMap(m=>m.content.filter(c=>c.type==='text').map(c=>c.text)));return call('candidate_request_approval',{candidateId:f.candidate.candidateId,primaryTable:'facts'});}));
    expect(result.status,result.text).toBe('blocked');
    const pending=f.root.getState().pendingClarification!;
    expect(pending, result.text+' '+JSON.stringify(f.prep.task.snapshot.scope)+' original revision '+f.candidate.taskRevision+' '+errors.slice(0,1).join(' ')).not.toBeNull();
    expect(pending.resumeContext?.piCandidateApproval).toBeDefined();expect(f.root.getState().activeExecution).toBeNull();expect(f.lease.closed).toBe(true);expect(visibleReviewLeases.length).toBeGreaterThan(0);expect(visibleReviewLeases.every(id=>id===null)).toBe(true);
    f.root.setState=set;
    const saved=f.root.getState().activeAgentTask!;
    expect(inspectPiCandidateReview(f.root,pending)).toMatchObject({available:true,review:{candidateId:f.candidate.candidateId}});
    expect(inspectPiCandidateReview(f.root,{...pending,resumeContext:{...pending.resumeContext,piCandidateApproval:{...pending.resumeContext!.piCandidateApproval!,reviewId:'copied-other-review'}}}).available).toBe(false);
    expect(f.root.getState().taskInspection?.candidate?.validation?.decision).toBe('validated');
    options.onSuspended?.();
    const fresh=beginRun(f.root,'follow_up',crypto.randomUUID(),crypto.randomUUID()),store=scopeRunStore(f.root,fresh);
    const prep=await preparePiExecutor(store,{entryPoint:'follow_up',goal:saved.goal,continuation:pending.resumeContext!.piTaskContinuation,guest});
    const cleanup=()=>{prep.task.close('cancelled');finishRun(f.root,fresh);f.cleanup();};
    return {...f,pending,saved,fresh,resumed:store,task:prep.task,cleanup};
};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
describe('actual Pi exact candidate approval continuation',()=>{
    beforeEach(async()=>{await drainSessionPersistence();io.records.clear();io.attempts=0;io.queryCalls=0;io.beforeQuery=undefined;});
    it('exports named artifact dependencies after exact approval under a fresh lease',async()=>{
        const f=await setup({artifactDependency:true});try{let step=0;
            const result=await resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,
                scripted(()=>step++===0?call('data_query',{explanation:'Verify committed rows.',plan:{aggregates:[{function:'count',as:'RowCount'}]}}):lie));
            expect(result.status,result.text).toBe('completed');expect(f.fresh.runId).not.toBe(f.lease.runId);
            finishRun(f.root,f.fresh);
            const exported=await buildTaskExport(f.root,f.saved.taskId,{database:async()=>({getAllFromIndex:async()=>[...io.records.values()].filter((r:any)=>r.kind==='commit')}) as unknown as StorageDatabase});
            const files=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
            expect(strFromU8(files['accepted/inputs/0.txt'])).toBe('{"detailRows":2}');
            expect(manifest.acceptedDataset.inputs).toEqual([{name:'rules',path:'/workspace/rules.json',revision:1,
                sha256:f.execution.inputs![0].sha256,exportPath:'accepted/inputs/0.txt'}]);
            expect(JSON.parse(strFromU8(files['accepted/tables/0.json']))).toHaveLength(2);
            expect(manifest.evidence.selectedIds).toContain(f.root.getState().activeDataQuery?.queryId);
        }finally{f.cleanup();}
    });
    it('continues once on the committed binding, preserves counters/history and rejects the old value',async()=>{
        const f=await setup();try{
            let step=0,sawHistory=false;
            const result=await resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,scripted(context=>{
                sawHistory=context.messages.some(m=>m.role==='toolResult'&&m.toolName==='candidate_request_approval');
                return step++===0?call('data_query',{explanation:'Verify committed row count.',plan:{aggregates:[{function:'count',as:'RowCount'}]}}):lie;
            }));
            expect(result.status,result.text).toBe('completed');expect(result.text).not.toContain('999, completed.');expect(result.text).toContain('Evidence: query-');
            expect(f.root.getState().activeDataQuery?.result.rows).toEqual([{RowCount:2}]);expect(f.root.getState().activeDataQuery?.runId).toBe(f.fresh.runId);
            expect(inspectPiCandidateReview(f.root,f.pending).available).toBe(false);
            expect(f.root.getState().taskInspection?.grounding?.queryIds).toContain(f.root.getState().activeDataQuery?.queryId);
            expect(f.task.snapshot.taskId).toBe(f.saved.taskId);expect(f.task.snapshot.budget.used.transformationAttempts).toBe(1);
            expect(f.task.snapshot.budget.used.toolCalls).toBeGreaterThan(f.saved.budget.used.toolCalls);expect(sawHistory).toBe(true);expect(io.attempts).toBe(1);expect(io.queryCalls).toBe(1);
            f.prep.task.close('cancelled');finishRun(f.root,f.lease);expect(f.root.getState().activeExecution?.runId).toBe(f.fresh.runId);
            await expect(resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed)).rejects.toThrow('approval_invalid');expect(io.attempts).toBe(1);
            finishRun(f.root,f.fresh);
            const exported=await buildTaskExport(f.root,f.saved.taskId,{database:async()=>({getAllFromIndex:async()=>[...io.records.values()].filter((r:any)=>r.kind==='commit')}) as unknown as StorageDatabase});
            const files=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
            const rows=JSON.parse(strFromU8(files['accepted/tables/0.json']));
            expect(rows).toHaveLength(2);expect(rows.reduce((n:number,r:{Amount:number})=>n+r.Amount,0)).toBe(-5);
            expect(manifest.acceptedDataset.status).toBe('independently_validated');expect(manifest.acceptedDataset.validation.decision).toBe('validated');
            expect(manifest.acceptedDataset.inputCoverage[0].complete).toBe(true);
            expect(Object.hasOwn(files,'accepted/program.js')).toBe(true);
        }finally{f.cleanup();}
    });
    it.each(['stop','suspension_error'] as const)('releases ownership without publishing an unusable review after %s',async mode=>{
        const f=await prepareCandidateCommitFixture({guest});try{
            f.root.setState({settings:{...f.root.getState().settings,provider:'default',complexModel:'mock'},chatHistory:[],agentEvents:[],agentToolLogs:[],runtimeEvents:[],dataQualityIssues:[],
                logAgentToolUsage:vi.fn(),addProgress:vi.fn(),clearActiveTurnCancellation:vi.fn(),setStreamingMessage:vi.fn()});
            if(mode==='stop'){
                const after=f.prep.task.afterTool;f.prep.task.afterTool=(name,result,context)=>{after(name,result,context);if(name==='candidate.request_approval')cancelOwnedRun(f.root);};
            }else f.prep.task.suspend=()=>{throw new Error('injected_suspension_error');};
            const result=await runPiFollowUpTurn({message:f.prep.task.snapshot.goal},f.store,scripted(()=>call('candidate_request_approval',{candidateId:f.candidate.candidateId,primaryTable:'facts'})));
            expect(result.status).toBe(mode==='stop'?'cancelled':'blocked');finishRun(f.root,f.lease);
            expect(f.root.getState().activeExecution).toBeNull();expect(f.root.getState().pendingClarification).toBeNull();expect(io.attempts).toBe(0);
            expect(f.root.getState().chatHistory?.some(m=>m.clarificationRequest?.resumeContext?.piCandidateApproval)).toBe(false);
        }finally{f.cleanup();}
    });
    it('blocks completion when the resumed query has the wrong metric scope',async()=>{
        const f=await setup();try{let step=0;
            const result=await resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,scripted(()=>step++===0?call('data_query',{explanation:'Wrong metric.',plan:{aggregates:[{function:'sum',column:'Amount',as:'Total'}]}}):lie));
            expect(result.status).toBe('blocked');expect(result.text).not.toContain('999, completed.');expect(io.queryCalls).toBe(1);
        }finally{f.cleanup();}
    });
    it.each(['deny','expiry','program','input','grant','policy','locator'] as const)('rejects %s before any commit or new query',async mode=>{
        const f=await setup();let clock:ReturnType<typeof vi.spyOn>|undefined;
        try{
            if(mode==='expiry')clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+300001);
            if(mode==='program')await f.resumed.codeExecution!.workspace.write(f.program.path,'return 999;',f.program.revision);
            if(mode==='input')f.root.getState().csvData!.data[0].Amount=7;
            if(mode==='grant')(f.store.codeExecution as any).revoke(f.execution.grant!.id);
            if(mode==='policy')f.root.setState({settings:{...f.root.getState().settings,runtimeAccessControl:{permissionMode:'open',toolOverrides:{'data.mutate':'deny'},workspaceRules:{deniedPathPrefixes:[]}}}});
            if(mode==='locator')f.pending.resumeContext!.piCandidateApproval!.reviewDigest='edited';
            const operation=resumePiCandidateApproval(f.pending,{label:mode==='deny'?'Deny':'Approve',value:mode==='deny'?'deny':'approve'},f.resumed,scripted(()=>lie));
            if(mode==='locator')await expect(operation).rejects.toThrow('approval_invalid');else expect((await operation).status).toBe('blocked');
            expect(io.attempts).toBe(0);expect(io.queryCalls).toBe(0);expect(f.root.getState().datasetBundle?.acceptedCommit).toBeUndefined();
        }finally{clock?.mockRestore();f.cleanup();}
    });
    it('pauses active wall-time accounting during human review',async()=>{
        let clock:ReturnType<typeof vi.spyOn>|undefined;
        const f=await setup({onSuspended:()=>{clock=vi.spyOn(performance,'now').mockReturnValue(performance.now()+600000);}});
        try{
            const before=f.saved.budget.used.activeMs;
            expect(f.saved.budget.pausedForUser).toBe(true);expect(f.task.snapshot.budget.pausedForUser).toBe(false);
            const result=await resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,scripted(()=>lie));
            expect(result.status).toBe('blocked');expect(f.task.snapshot.budget.used.activeMs-before).toBeLessThan(5000);
        }finally{clock?.mockRestore();f.cleanup();}
    });
    it('does not complete without a fresh post-commit query',async()=>{
        const f=await setup();try{const result=await resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,scripted(()=>lie));
            expect(result.status).toBe('blocked');expect(result.text).not.toContain('999, completed.');expect(io.queryCalls).toBe(0);expect(io.attempts).toBe(1);
        }finally{f.cleanup();}
    });
    it.each(['switch','stop'] as const)('fences a deferred resumed query after %s',async mode=>{
        const f=await setup(),gate=deferred(),started=deferred();try{
            io.beforeQuery=()=>{started.resolve();return gate.promise;};
            const running=resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,scripted(()=>call('data_query',{explanation:'Verify rows.',plan:{aggregates:[{function:'count',as:'RowCount'}]}})));
            await started.promise;
            if(mode==='switch'){beginSessionTransition(f.root);f.root.setState({sessionId:'new-session',csvData:{fileName:'new.csv',data:[{Amount:77}]},activeDataQuery:null,isBusy:true});beginRun(f.root,'follow_up','new-run','new-turn');}
            else cancelOwnedRun(f.root);
            const result=await running;expect(result.status).toBe('cancelled');gate.resolve();await Promise.resolve();
            expect(f.root.getState().activeDataQuery).toBeNull();
            if(mode==='switch'){expect(f.root.getState().activeExecution?.runId).toBe('new-run');expect(f.root.getState().isBusy).toBe(true);}
        }finally{gate.resolve();f.cleanup();}
    });
    it('cancels before queued commit admission and preserves accepted data',async()=>{
        const f=await setup(),gate=deferred();try{
            const ahead=queueSessionWrite(()=>gate.promise);
            const running=resumePiCandidateApproval(f.pending,{label:'Approve',value:'approve'},f.resumed,scripted(()=>lie));
            await Promise.resolve();cancelOwnedRun(f.root);await expect(running).rejects.toThrow();gate.resolve();await ahead;await drainSessionPersistence();
            expect(io.attempts).toBe(0);expect(f.root.getState().datasetBundle?.acceptedCommit).toBeUndefined();
        }finally{gate.resolve();f.cleanup();}
    });
});
