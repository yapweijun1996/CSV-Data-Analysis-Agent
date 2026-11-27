// @vitest-environment node
import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {AssistantMessage,JsonObject} from '@earendil-works/pi-ai';
import type {StreamFn} from '@earendil-works/pi-agent-core';
import {createAssistantMessageEventStream,getCurrentTools} from '@earendil-works/pi-ai';
import {createSingleTableDatasetBundle} from '../services/data/datasetBundle';
import {captureCsvSource,registerScannedCsvBlob,bindRecoverySource} from '../services/data/immutableCsvSource';
import {runPiInitialAnalysis} from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import type {StoreApi} from '../services/agent/types';
import {beginSessionTransition} from '../services/session/sessionOwnership';
import {preparePiInitialCodingUiSmoke} from '../services/agent/runtime/pi/piInitialCodingQualification';
import {handleClarificationResponse} from '../services/agent/orchestration/chatOrchestrator';
import type {StorageDatabase} from '../services/storageService';
import type {DatasetCommitMarker} from '../types/datasetCommit';
import {commitHeadKey} from '../types/datasetCommit';
import {readPiInitialCheckpoint} from '../services/agent/runtime/pi/piInitialCheckpoint';
import {cancelOwnedRun,beginRun} from '../services/session/sessionOwnership';
import {writePiInitialCheckpoint,type PiInitialCheckpointV2} from '../services/agent/runtime/pi/piInitialCheckpoint';
import {recoverPiInitialAnalysisIfNeeded} from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import {reattachPiInitialCheckpointSource} from '../services/agent/runtime/pi/piInitialCheckpointRecovery';
import {reconcileInitialCodingCheckpoint,verifyInitialCodingCommit} from '../services/agent/runtime/pi/piInitialCodingCheckpoint';
import {inspectPiCandidateReview} from '../services/agent/runtime/pi/piCandidateReviewState';
import {recoverCandidateReview,commitRecoveredCandidate} from '../services/data/candidateRecovery';
import {scopeRunStore,finishRun} from '../services/session/sessionOwnership';
import {createCleaningRun} from '../services/agent/cleaningRunState';
import {prepareStructureRepair,STRUCTURE_REPAIR_LEDGER_TARGETS} from '../services/agent/runtime/pi/piStructureRepair';
import * as sourceScan from '../services/data/csvSourceScan';
import * as meaningInference from '../services/data/inferCandidateMeaning';
import {preparePiStructureRepairSmoke,queryPiStructureRepairSmoke} from '../services/agent/runtime/pi/piStructureRepairQualification';
import {executeDataQuery} from '../services/agent/execution/dataOperationRunner';
import {repairReservationStorage} from './helpers/repairReservationStorage';
const io=vi.hoisted(()=>({records:new Map<string,unknown>(),commits:0,queryCalls:0,beforeQuery:undefined as undefined|(()=>Promise<void>),beforeGuest:undefined as undefined|(()=>Promise<void>)}));
vi.mock('../services/storageService',async original=>({...await original<typeof import('../services/storageService')>(),
    getStorageDatabase:async()=>({...repairReservationStorage(io.records).db,getAllFromIndex:async()=>[...io.records.values()].filter(r=>(r as DatasetCommitMarker).kind==='commit')}) as unknown as StorageDatabase}));
vi.mock('../services/persistence/datasetCommitStorage',()=>({
    readCommitIntent:async()=>undefined,
    commitDatasetTransaction:async(_db:unknown,marker:DatasetCommitMarker,_baseline:unknown,check:()=>void,admit:()=>void)=>{
        check();admit();io.commits++;io.records.set(marker.recordId,structuredClone(marker));
        io.records.set(commitHeadKey(marker.sessionId),{kind:'head',sessionId:marker.sessionId,commitId:marker.commitId,revision:marker.revision,markerKey:marker.recordId});
        return {marker,replay:false};
    },
}));
vi.mock('../services/duckdb/queryEngine',async original=>{
    const actual=await original<typeof import('../services/duckdb/queryEngine')>();
    const bind:typeof actual.primeDuckDbDataset=vi.fn(async()=>({engine:'duckdb' as const,tableName:'data',loadVersion:'bound',fallbackReason:null,fallbackStage:null}));
    return {...actual,primeDuckDbDataset:bind,
    // Keep the existing modeled worker boundary while exercising the real atomic routing switch.
    prepareOrdinaryDatasetBinding:(...args:Parameters<typeof actual.prepareOrdinaryDatasetBinding>)=>actual.prepareOrdinaryDatasetBinding(args[0],args[1],args[2],args[3]??bind),
    executeManagedDataQuery:async(data:import('../types').CsvData,plan:import('../types').QueryPlan,allowedColumns:string[])=>{
        io.queryCalls++;await io.beforeQuery?.();
        const {executeDataQuery}=await import('../services/agent/execution/dataOperationRunner');
        return {result:executeDataQuery(data.data,plan,{allowedColumns,maxRows:500,maxColumns:50,maxOrderBy:3}),
            engine:'native',tableName:null,loadVersion:null,sqlPreview:null,fallbackReason:null};
    }};});
vi.mock('../services/persistence/currentSessionPersistence',async original=>({...await original<typeof import('../services/persistence/currentSessionPersistence')>(),persistCurrentAppSessionSnapshot:vi.fn(async()=>true)}));
vi.mock('../services/sandbox/javascriptGuestClient',async()=>{
    const {newQuickJSWASMModuleFromVariant}=await import('quickjs-emscripten-core');
    const {default:variant}=await import('@jitl/quickjs-wasmfile-release-sync');
    const {executeQuickJsGuest}=await import('../services/sandbox/quickJsGuest');
    const {resolveGuestLimits}=await import('../services/sandbox/javascriptGuestProtocol');
    const wasm=newQuickJSWASMModuleFromVariant(variant);
    return {createJavaScriptGuest:()=>({run:async(code:string,inputJson:string,options:{limits?:Parameters<typeof resolveGuestLimits>[0];onStarted?:()=>void})=>{await io.beforeGuest?.();return executeQuickJsGuest({generation:1,code,inputJson,limits:resolveGuestLimits(options?.limits)},()=>wasm,options?.onStarted);},cancel(){},dispose(){}})};
});

const memory=new Map<string,string>();
// Preserve exact stage decisions even when a terminal batch needs no later model turn.
const checkpointWrites: PiInitialCheckpointV2[] = [];
const recordedStageReceipts = (sessionId: string) => checkpointWrites.filter(checkpoint => checkpoint.sessionId === sessionId).at(-1)?.stageReceipts ?? [];
const tool=(name:string,args:unknown):AssistantMessage['content']=>[{type:'toolCall',id:crypto.randomUUID(),name,arguments:args as JsonObject}];
const scripted=(next:(context:Parameters<StreamFn>[1])=>AssistantMessage['content']):StreamFn=>(model,context)=>{
    const content=next(context),message:AssistantMessage={role:'assistant',content,api:model.api,provider:model.provider,model:model.id,
        usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
        stopReason:content.some(p=>p.type==='toolCall')?'toolUse':'stop',timestamp:Date.now()};
    const s=createAssistantMessageEventStream();s.push({type:'start',partial:message});s.push({type:'done',reason:content.some(p=>p.type==='toolCall')?'toolUse':'stop',message});return s;
};
const fixture=async()=>{
    const data={fileName:'synthetic-initial.csv',data:[{Name:'Total Solutions',Amount:0},{Name:'Detail',Amount:-5},{Name:'Subtotal',Amount:-5}]};
    const file=new File(['Name,Amount\nTotal Solutions,0\nDetail,-5\nSubtotal,-5\n'],data.fileName);
    const bundle=createSingleTableDatasetBundle({datasetId:'initial-synthetic',sourceFingerprint:'synthetic',file,data});
    let state={sessionId:'initial-'+crypto.randomUUID(),csvData:data,canonicalCsvData:data,rawCsvData:structuredClone(data),datasetBundle:bundle,
        confirmedAnalysisGoal:'Remove the reconciled subtotal and analyse detail values.',settings:{provider:'default',simpleModel:'mock',complexModel:'mock',language:'English',
            runtimeAccessControl:{permissionMode:'open',toolOverrides:{},workspaceRules:{deniedPathPrefixes:[]}}},
        analysisCards:[],columnProfiles:[],chatHistory:[],dataQualityIssues:[],agentEvents:[],agentToolLogs:[],runtimeEvents:[],progressMessages:[],telemetryEvents:[],workspaceFiles:{},
        activeDataQuery:null,logAgentToolUsage(){},addProgress(){},ensureDatasetSemanticSnapshot:async()=>null,
    } as unknown as ReturnType<StoreApi['getState']>;
    const root:StoreApi={getState:()=>state,setState:p=>{state={...state,...(typeof p==='function'?p(state):p)};}};
    const source=await captureCsvSource(root,file);root.setState({datasetBundle:{...bundle,source:{...bundle.source,inspection:source}}});
    return {root,data,file,source,request:{appSessionId:state.sessionId,datasetId:'initial-synthetic',datasetVersion:bundle.datasetVersion,
        researchGoal:state.confirmedAnalysisGoal!,provider:{provider:'default' as const,modelId:'mock'}}};
};
const bareStore=():StoreApi=>{
    let state={sessionId:'unseeded',settings:{},analysisCards:[],columnProfiles:[],chatHistory:[],agentEvents:[],agentToolLogs:[],runtimeEvents:[],
        progressMessages:[],telemetryEvents:[],dataQualityIssues:[],workspaceFiles:{},queryHistory:[],
        recordAgentEvent(event: ReturnType<StoreApi['getState']>['agentEvents'][number]) { state.agentEvents.push(event); },
        logAgentToolUsage(){},addProgress(){},clearActiveTurnCancellation(){},setStreamingMessage(){},ensureDatasetSemanticSnapshot:async()=>null,
    } as unknown as ReturnType<StoreApi['getState']>;
    return {getState:()=>state,setState:p=>{state={...state,...(typeof p==='function'?p(state):p)};}};
};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};

describe('initial shared coding phase',()=>{
    beforeEach(()=>{checkpointWrites.length=0;memory.clear();io.records.clear();io.commits=0;io.queryCalls=0;io.beforeQuery=undefined;io.beforeGuest=undefined;vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);if(k.startsWith('pi-initial-analysis-v1:')){const checkpoint=JSON.parse(v);if(checkpoint.schemaVersion===2)checkpointWrites.push(checkpoint);}},removeItem:(k:string)=>memory.delete(k)});});
    it('repairs original ERP source through Pi/QuickJS and independent validation, then exact approval and current queries',async()=>{
        const root=bareStore();try{
            const f=await preparePiStructureRepairSmoke(root);
            expect(f.result.status,f.trace.join('\n')).toBe('blocked');
            expect(f.result.structureRepair).toMatchObject({state:'awaiting_commit_approval',attempts:1,validationFailures:0,commitAllowed:false});
            expect(f.trace[0]).toContain('initial_repair_analysis_locked_until_exact_commit');
            expect(f.trace.join('\n')).toContain('sourceInspection');
            expect(f.trace.join('\n')).toContain('"status":"succeeded"');
            expect(f.trace.find(t=>t.startsWith('candidate_read:'))).toContain('draft_uncommitted');
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
            expect(root.getState().canonicalCsvData).toBeNull();expect(root.getState().rawCsvData).toEqual(f.data);
            expect(root.getState().analysisCards).toEqual([]);expect(inspectPiCandidateReview(root).available).toBe(true);
            await expect(queryPiStructureRepairSmoke(root)).rejects.toThrow('draft_is_not_accepted');
            await handleClarificationResponse({label:'Approve',value:'approve'},root);
            expect(io.commits).toBe(1);expect(io.queryCalls).toBe(1);
            expect(root.getState().datasetCommitBindingStatus).toBe('ready');
            expect(root.getState().csvData?.data).toEqual([
                {Entity:'Atlas',Status:'Open',Cost:250,Sales:-250,Rate:'10%'},
                {Entity:'Birch',Status:'Closed',Cost:30,Sales:-30,Rate:'0%'},
                {Entity:'Cedar',Status:'Open',Cost:120,Sales:-120,Rate:'5%'},
            ]);
            expect(root.getState().rawCsvData).toEqual(f.data);expect(root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(1);
            expect(root.getState().analysisCards[0].provenance?.datasetVersion).toBe(root.getState().datasetBundle?.datasetVersion);
            // Ten independent local query expectations, not ten live model/SQL-worker answers.
            const rows=root.getState().csvData!.data,columns=['Entity','Status','Cost','Sales','Rate'];
            const aggregate=(column:string,fn:'sum'|'min'|'max'|'count')=>executeDataQuery(rows,{groupBy:[],aggregates:[{function:fn,column,as:'Value'}],limit:10},
                {allowedColumns:columns,maxRows:50,maxColumns:10,maxOrderBy:3}).rows;
            expect(rows).toHaveLength(3); // 1: entity count, not metric cells
            expect(rows.map(r=>r.Entity)).toEqual(['Atlas','Birch','Cedar']); // 2
            expect(aggregate('Cost','sum')).toEqual([{Value:400}]); // 3
            expect(aggregate('Sales','sum')).toEqual([{Value:-400}]); // 4
            expect(aggregate('Cost','min')).toEqual([{Value:30}]); // 5
            expect(aggregate('Cost','max')).toEqual([{Value:250}]); // 6
            expect(aggregate('Sales','min')).toEqual([{Value:-250}]); // 7
            expect(rows.filter(r=>r.Status==='Open').length).toBe(2); // 8
            expect(rows.map(r=>r.Rate)).toEqual(['10%','0%','5%']); // 9: not summed
            expect(rows.some(r=>r.Entity==='TOTAL')).toBe(false); // 10
            expect(await queryPiStructureRepairSmoke(root)).toHaveLength(10);expect(io.queryCalls).toBe(11);
        }finally{beginSessionTransition(root);}
    });
    it('feeds independent validation errors back to Pi and repairs automatically without intermediate approval',async()=>{
        const root=bareStore();try{
            const f=await preparePiStructureRepairSmoke(root,{mode:'retry'});
            expect(f.result.structureRepair,f.trace.join('\n')).toMatchObject({state:'awaiting_commit_approval',attempts:2,validationFailures:1});
            expect(f.trace.join('\n')).toContain('validation_');expect(f.trace.filter(t=>t.startsWith('candidate_validate:'))).toHaveLength(2);
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
            expect(root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(2);
            expect(root.getState().taskInspection?.candidate?.validation?.decision).toBe('validated');
            expect(root.getState().taskInspection?.candidate?.candidateId).toBe(inspectPiCandidateReview(root).review?.candidateId);
            await handleClarificationResponse({label:'Deny',value:'deny'},root);
            expect(io.commits).toBe(0);expect(root.getState().rawCsvData).toEqual(f.data);expect(root.getState().canonicalCsvData).toBeNull();
        }finally{beginSessionTransition(root);}
    });
    it('stops repeated validation failure even when the program hash changes',async()=>{
        const root=bareStore();try{
            const f=await preparePiStructureRepairSmoke(root,{mode:'no-progress'});
            expect(f.result.structureRepair,f.trace.join('\n')).toMatchObject({state:'exhausted',attempts:2,validationFailures:2,resumable:false});
            expect(root.getState().pendingClarification).toBeNull();expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
            expect(root.getState().analysisCards).toEqual([]);expect(root.getState().canonicalCsvData).toBeNull();
            expect(f.result.error?.retryable).toBe(false);
        }finally{beginSessionTransition(root);}
    });
    it('preserves exhausted repair and task budgets through real runtime A → B → A',async()=>{
        const root=bareStore();try{
            const f=await preparePiStructureRepairSmoke(root,{mode:'no-progress'});
            const budget=root.getState().activeAgentTask!.budget;
            for(const researchGoal of ['Different goal',root.getState().confirmedAnalysisGoal!]){
                const result=await runPiInitialAnalysis({appSessionId:root.getState().sessionId,datasetId:root.getState().currentDatasetId!,
                    datasetVersion:root.getState().datasetBundle!.datasetVersion,researchGoal,provider:{provider:'default',modelId:'mock'}},root,
                    scripted(()=>{throw new Error('Exhausted repair must not call provider');}),f.runtimeOptions);
                expect(result.structureRepair).toMatchObject({state:'exhausted',attempts:2,validationFailures:2,resumable:false});
                expect(result.error?.retryable).toBe(false);
                const used=root.getState().activeAgentTask!.budget.used;
                expect({...used,activeMs:0}).toEqual({...budget.used,activeMs:0});
                expect(used.activeMs).toBeGreaterThanOrEqual(budget.used.activeMs);
            }
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);expect(root.getState().canonicalCsvData).toBeNull();
        }finally{beginSessionTransition(root);}
    });
    it.each(['missing','retained','sync','oversized'] as const)('returns a structured %s preparation failure with honest retryability',async mode=>{
        const f=await fixture();try{
            f.root.setState({pipelineOutcome:{canAutoAnalyze:false} as never});
            if(mode==='missing')f.root.setState(s=>({datasetBundle:{...s.datasetBundle!,source:{...s.datasetBundle!.source,inspection:undefined}}}));
            if(mode==='retained')f.root.setState(s=>({datasetBundle:{...s.datasetBundle!,source:{...s.datasetBundle!.source,inspection:{...f.source,sourceId:'not-retained'}}}}));
            if(mode==='sync')registerScannedCsvBlob(f.root,f.file,f.source,[]);
            if(mode==='oversized'){
                const source=await captureCsvSource(f.root,new File(['Name,Amount\n'+'a,1\n'.repeat(17000)],'large-synthetic.csv'));
                f.root.setState(s=>({datasetBundle:{...s.datasetBundle!,source:{...s.datasetBundle!.source,inspection:source}}}));
            }
            const result=await runPiInitialAnalysis(f.request,f.root,scripted(()=>{throw new Error('Preparation must fail before provider');}),{codingPreparation:{enabled:true,qualified:true}});
            expect(result.structureRepair).toMatchObject({state:'unavailable',resumable:mode!=='oversized',commitAllowed:false,
                reason:mode==='missing'?'source_required':mode==='retained'?'retained_original_source_required':mode==='sync'?'synchronous_source_capture_required':'source_record_stream_and_spill_required'});
            expect(result.error?.retryable).toBe(mode!=='oversized');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
            if(mode!=='oversized'){
                if(mode==='sync')await bindRecoverySource(f.root,f.file,f.source);
                f.root.setState(s=>({datasetBundle:{...s.datasetBundle!,source:{...s.datasetBundle!.source,inspection:f.source}}}));
                const retry=await runPiInitialAnalysis(f.request,f.root,scripted(()=>{throw new Error('Synthetic provider stopped after preparation.');}),{codingPreparation:{enabled:true,qualified:true}});
                expect(retry.structureRepair?.state).toBe('repairing');
            }
        }finally{beginSessionTransition(f.root);}
    });
    it('returns structured non-retryable exhaustion when target admission throws before returning a coordinator',async()=>{
        const f=await fixture();try{
            const lease=beginRun(f.root,'initial_analysis',crypto.randomUUID()),owned=scopeRunStore(f.root,lease);
            for(let i=0;i<STRUCTURE_REPAIR_LEDGER_TARGETS;i++)await prepareStructureRepair(owned,`target-${i}`);
            finishRun(f.root,lease);f.root.setState({pipelineOutcome:{canAutoAnalyze:false} as never});
            const result=await runPiInitialAnalysis(f.request,f.root,scripted(()=>{throw new Error('Provider must not run');}),{codingPreparation:{enabled:true,qualified:true}});
            expect(result.structureRepair).toMatchObject({state:'exhausted',reason:'source_target_ledger_capacity',resumable:false,commitAllowed:false});
            expect(result.error?.retryable).toBe(false);expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
        }finally{beginSessionTransition(f.root);}
    });
    it.each(['read-error','unsupported-error','stop','source-replace','session-replace'] as const)('preserves a structured thrown preparation outcome across %s',async mode=>{
        const f=await fixture(),entered=deferred(),release=deferred();
        const spy=vi.spyOn(sourceScan,'requireCurrentCsvSourceScan').mockImplementationOnce(async()=>{
            entered.resolve();await release.promise;
            if(mode==='unsupported-error')throw new Error('scan_fixed_width_requires_layout_scanner');
            throw new DOMException('Synthetic original read failed','NotReadableError');
        });
        try{
            f.root.setState({pipelineOutcome:{canAutoAnalyze:false} as never});
            const running=runPiInitialAnalysis(f.request,f.root,scripted(()=>{throw new Error('Provider must not run');}),{codingPreparation:{enabled:true,qualified:true}});
            await entered.promise;
            if(mode==='stop')cancelOwnedRun(f.root);
            if(mode==='source-replace')f.root.setState(s=>({datasetBundle:{...s.datasetBundle!,source:{...s.datasetBundle!.source,inspection:{...f.source,sourceId:'replacement'}}},workspaceFiles:{'/new-owner':'preserve'}}));
            if(mode==='session-replace'){beginSessionTransition(f.root);f.root.setState({sessionId:'replacement',workspaceFiles:{'/new-owner':'preserve'}});}
            const before=f.root.getState().workspaceFiles;
            release.resolve();const result=await running;
            expect(result.structureRepair).toMatchObject({state:mode.endsWith('error')?'unavailable':'cancelled',resumable:mode==='read-error',commitAllowed:false});
            if(mode.endsWith('error'))expect(result.error?.retryable).toBe(mode==='read-error');
            else expect(result.status).toBe('cancelled');
            if(mode.endsWith('replace'))expect(f.root.getState().workspaceFiles).toEqual(before);
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
        }finally{release.resolve();spy.mockRestore();beginSessionTransition(f.root);}
    });
    it('retains the conservative reservation rather than replaying uncertain cancelled execution',async()=>{
        const root=bareStore(),entered=deferred(),release=deferred();
        io.beforeGuest=()=>{entered.resolve();return release.promise;};
        try{
            const running=preparePiStructureRepairSmoke(root);await entered.promise;cancelOwnedRun(root);release.resolve();const f=await running;
            expect(f.result.structureRepair).toMatchObject({state:'cancelled',attempts:1,resumable:false});
            const previous=root.getState().activeAgentTask!.budget.used;
            const result=await runPiInitialAnalysis({appSessionId:root.getState().sessionId,datasetId:root.getState().currentDatasetId!,
                datasetVersion:root.getState().datasetBundle!.datasetVersion,researchGoal:root.getState().confirmedAnalysisGoal!,provider:{provider:'default',modelId:'mock'}},root,
                scripted(()=>{throw new Error('Synthetic provider stopped after resume');}),f.runtimeOptions);
            expect(result.structureRepair).toMatchObject({state:'unavailable',reason:'reservation_pending_uncertain_work',resumable:false});
            const used=root.getState().activeAgentTask!.budget.used;
            expect(used.transformationAttempts).toBe(1);expect(used.toolCalls).toBe(previous.toolCalls);expect(used.providerTurns).toBeGreaterThanOrEqual(previous.providerTurns);
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
        }finally{release.resolve();io.beforeGuest=undefined;beginSessionTransition(root);}
    });
    it.each(['meaning-stop','guest-stop','meaning-replace','guest-replace'] as const)('revokes original-source repair across the %s await',async mode=>{
        const root=bareStore(),entered=deferred(),release=deferred();
        const original=meaningInference.inferCandidateMeaning;
        const spy=mode.startsWith('meaning')?vi.spyOn(meaningInference,'inferCandidateMeaning').mockImplementationOnce(async(...args)=>{
            const result=await original(...args);entered.resolve();await release.promise;return result;
        }):undefined;
        if(mode.startsWith('guest'))io.beforeGuest=()=>{entered.resolve();return release.promise;};
        try{
            const running=preparePiStructureRepairSmoke(root);await entered.promise;
            if(mode.endsWith('stop'))cancelOwnedRun(root);
            else{beginSessionTransition(root);root.setState({sessionId:'replacement',csvData:{fileName:'new.csv',data:[{Value:77}]},canonicalCsvData:null,
                analysisCards:[],finalSummary:null,isBusy:true});beginRun(root,'follow_up','new-run','new-turn');}
            release.resolve();const f=await running;
            expect(f.result.status).toBe('cancelled');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
            expect(root.getState().analysisCards).toEqual([]);expect(root.getState().canonicalCsvData).toBeNull();
            if(mode.endsWith('replace')){expect(root.getState().csvData?.data).toEqual([{Value:77}]);expect(root.getState().activeExecution?.runId).toBe('new-run');expect(root.getState().isBusy).toBe(true);}
        }finally{release.resolve();spy?.mockRestore();io.beforeGuest=undefined;beginSessionTransition(root);}
    });
    it('rejects stale exact ERP approval after source replacement',async()=>{
        const root=bareStore();try{
            await preparePiStructureRepairSmoke(root);
            root.setState(state=>({datasetBundle:{...state.datasetBundle!,source:{...state.datasetBundle!.source,inspection:{...state.datasetBundle!.source.inspection!,sourceId:'replacement'}}}}));
            await handleClarificationResponse({label:'Approve',value:'approve'},root);
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);expect(root.getState().canonicalCsvData).toBeNull();
            expect(root.getState().pendingClarification).toBeNull();
        }finally{beginSessionTransition(root);}
    });
    it('recovers an exact original-source ERP commit from a lost stage-zero acknowledgement without replaying approval',async()=>{
        const root=bareStore(),restored=bareStore();try{
            const f=await preparePiStructureRepairSmoke(root),cp=readPiInitialCheckpoint(root.getState().sessionId) as PiInitialCheckpointV2;
            expect(cp.pendingStageIndex).toBe(0);
            await handleClarificationResponse({label:'Approve',value:'approve'},root);
            const marker=[...io.records.values()].find((r):r is DatasetCommitMarker=>(r as DatasetCommitMarker).kind==='commit')!;
            await expect(verifyInitialCodingCommit({...cp,pendingStageIndex:7},marker)).rejects.toThrow('stage_side_effects_uncertain');
            beginSessionTransition(root);restored.setState({...root.getState(),csvData:null,canonicalCsvData:null,rawCsvData:null,
                activeAgentTask:null,taskInspection:null,activeExecution:null,pendingClarification:null,datasetCommitBindingStatus:undefined,
                analysisCards:[],queryHistory:[],finalSummary:null,finalSummaryProvenance:null});
            writePiInitialCheckpoint(cp);
            await recoverPiInitialAnalysisIfNeeded(restored,f.stream,f.runtimeOptions);
            expect(restored.getState().initialAnalysisRecovery?.status).toBe('awaiting_source');
            const result=await reattachPiInitialCheckpointSource(f.file,restored,f.stream,f.runtimeOptions);
            expect(result?.status,restored.getState().initialAnalysisRecovery?.reason??'').toBe('completed');
            expect(io.commits).toBe(1);expect(io.queryCalls).toBe(2);expect(restored.getState().csvData?.data).toHaveLength(3);
            expect(restored.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(1);
        }finally{beginSessionTransition(root);beginSessionTransition(restored);}
    });
    it('exposes automatic meaning in the same Pi initial Agent after inspection',async()=>{
        const f=await fixture();let calls=0,offered=false;
        try{
            await runPiInitialAnalysis(f.request,f.root,scripted(context=>{
                if(calls++===0){offered=getCurrentTools(context.messages)?.some(t=>t.name==='candidate_infer_meaning')===true;return tool('run_next_analysis_stage',{});}
                return [{type:'text',text:'No unsupported factual answer.'}];
            }),{codingPreparation:{enabled:true,qualified:true},stageServices:{resolveStructure:async()=>({canonicalCsvData:f.data,canonicalBuildMeta:null,
                canonicalizationStatus:'ready',reportStructureResolution:{requiresHumanReview:false,source:'synthetic',decision:{targetShape:'row_table'}},pipelineOutcome:{canAutoAnalyze:true}}) as never}} as never);
            expect(offered).toBe(true);
        }finally{beginSessionTransition(f.root);}
    });
    it('pins the catalog and loads guidance/support through the actual initial Pi loop before any stage',async()=>{
        const f=await fixture();let calls=0,catalog=false;const observations:string[]=[];
        try{
            const result=await runPiInitialAnalysis(f.request,f.root,scripted(context=>{
                catalog ||= JSON.stringify(context.messages).includes('host_pinned_skill_catalog');
                const last=context.messages.filter(m=>m.role==='toolResult').at(-1);
                if(last)observations.push(last.content.filter(p=>p.type==='text').map(p=>p.text).join(''));
                if(calls++===0)return tool('read_skill',{name:'investigate-report-structure'});
                if(calls===2)return tool('read_skill',{name:'investigate-report-structure',file:'scripts/describe-shape.js'});
                throw new Error('Synthetic provider stopped after skill loading.');
            }),{codingPreparation:{enabled:true,qualified:true}});
            expect(catalog).toBe(true);expect(observations[0]).toContain('untrusted_skill_guidance');expect(observations[1]).toContain('/workspace/skill-support/');
            expect(result.status).toBe('failed');expect(f.root.getState().activeAgentTask?.budget.used.skillReads).toBe(2);
            expect(f.root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(0);expect(f.root.getState().activeAgentTask?.capabilityGrants).toEqual([]);
            expect(readPiInitialCheckpoint(f.root.getState().sessionId)?.pendingStageIndex).toBeNull();
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
        }finally{beginSessionTransition(f.root);}
    });
    it('repairs through actual shared tools, releases review and resumes under a fresh initial lease',async()=>{
        const root=bareStore(),visible:Array<string|null|undefined>=[],set=root.setState;
        root.setState=p=>{set(p);if(root.getState().pendingClarification)visible.push(root.getState().activeExecution?.runId);};
        try{
            const trace:string[]=[];
            const f=await preparePiInitialCodingUiSmoke(root,{observe:context=>{const last=context.messages.filter(m=>m.role==='toolResult').at(-1);if(last)trace.push(last.content.filter(p=>p.type==='text').map(p=>p.text).join(''));}});
            expect(f.result.status,trace.slice(0,10).join('\n')).toBe('blocked');
            expect(root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeDefined();
            expect(root.getState().chatHistory.at(-1)?.type).toBe('ai_clarification');
            expect(inspectPiCandidateReview(root).available).toBe(true);
            expect(root.getState().activeAgentTask?.status).toBe('awaiting_approval');
            expect(root.getState().activeAgentTask?.budget.pausedForUser).toBe(true);
            expect(root.getState().activeAgentTask?.requiredOutputs.filter(o=>o.id==='staged-output')).toHaveLength(1);
            expect(visible.length).toBeGreaterThan(0);expect(visible.every(id=>id==null)).toBe(true);
            expect(root.getState().csvData?.data).toHaveLength(3);expect(io.commits).toBe(0);
            expect(readPiInitialCheckpoint(f.sessionId)).toMatchObject({schemaVersion:2,nextStageIndex:2,pendingStageIndex:2,coding:{version:1}});
            await handleClarificationResponse({label:'Approve',value:'approve'},root);
            expect(io.commits).toBe(1);expect(io.queryCalls).toBe(1);expect(root.getState().csvData?.data).toHaveLength(2);
            expect(root.getState().rawCsvData?.data).toHaveLength(3);expect(root.getState().initialAnalysisStatus).toBe('degraded');
            expect(root.getState().activeAgentTask?.status).toBe('completed');expect(root.getState().activeAgentTask?.taskId).toBe(f.taskId);
            expect(root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(1);
            expect(root.getState().activeAgentTask?.budget.used.toolCalls).toBeGreaterThan(f.oldBudget!.used.toolCalls);
            expect(root.getState().analysisCards[0].aggregatedData).toEqual([{Name:'Total Solutions',Total:0},{Name:'Detail',Total:-5}]);
            expect(root.getState().analysisCards[0].provenance?.datasetVersion).toBe(root.getState().finalSummaryProvenance?.datasetVersion);
            expect(root.getState().pendingClarification).toBeNull();expect(root.getState().activeExecution).toBeNull();
            expect(readPiInitialCheckpoint(f.sessionId)).toBeNull();
        }finally{beginSessionTransition(root);}
    });
    it.each(['deny','wrong-output','missing-report'] as const)('does not complete %s',async mode=>{
        const root=bareStore();root.setState({cleaningRun:{...createCleaningRun(),status:'running'}});try{
            await preparePiInitialCodingUiSmoke(root,{mode:mode==='deny'?'repair':mode});
            expect(root.getState().cleaningRun?.status).toBe('paused');
            if(root.getState().pendingClarification)await handleClarificationResponse({label:mode==='deny'?'Deny':'Approve',value:mode==='deny'?'deny':'approve'},root);
            expect(root.getState().activeAgentTask?.status).toBe('blocked');expect(root.getState().initialAnalysisStatus).not.toBe('ready');
            expect(io.commits).toBe(mode==='missing-report'?1:0);expect(io.queryCalls).toBe(mode==='missing-report'?1:0);
            expect(root.getState().cleaningRun?.status).toBe(mode==='missing-report'?'completed':'paused');
            expect(root.getState().chatHistory.map(m=>m.text).join(' ')).not.toContain('Unverified 999 completed.');
        }finally{beginSessionTransition(root);}
    });
    it('skips cleaning before coding while retaining required query/report stages',async()=>{
        const root=bareStore();try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning'});
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(1);
            expect(root.getState().pendingClarification).toBeNull();expect(root.getState().csvData?.data).toHaveLength(2);
        }finally{beginSessionTransition(root);}
    });
    it('names the skip call when qualified cleaning planned 0 operations, and the skip then succeeds',async()=>{
        const root=bareStore();root.setState({dataPreparationPlan:{explanation:'',operations:[],outputColumns:[],planStatus:'operations',consistencyIssues:[]}});
        let step=0,gate='',skipped='',listing:{files?:{path:string}[];totalFiles?:number;truncated?:boolean}|undefined,taskPlan:unknown;const stages:string[]=[];
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const last=context.messages.filter(m=>m.role==='toolResult').at(-1),text=last?.content.filter(p=>p.type==='text').map(p=>p.text).join('')??'';
                if(last?.toolName==='run_next_analysis_stage'&&!last.isError)stages.push((JSON.parse(text) as {stage:string}).stage);
                const index=step++;
                if(index<3)return tool('run_next_analysis_stage',{});
                if(index===3)return tool('run_next_analysis_stage',{stage:'dataset.applyTransform',reason:'a data quality note is present'});
                // A read-only listing inside the cleaning window must show entries and must not forfeit the skip.
                if(index===4){gate=text;return tool('workspace_list',{path:'/dataset'});}
                if(index===5){const parsed=JSON.parse(text);listing=parsed.payload?.workspace?.result;taskPlan=parsed.taskPlan;
                    return tool('run_next_analysis_stage',{stage:'dataset.validatePreparedData',reason:'The cleaning plan produced no operations'});}
                if(index===6)skipped=text;
                return tool('run_next_analysis_stage',{});
            })});
            expect(gate).toMatch(/^initial_cleaning_requires_exact_candidate_approval: /);
            expect(gate).toContain('planned 0 governed cleaning operation(s)');
            expect(gate).toContain('call run_next_analysis_stage with {"stage":"dataset.validatePreparedData"}');
            expect(gate).toContain('candidate_request_approval');
            expect(listing?.files?.map(file=>file.path)).toEqual(expect.arrayContaining(['/dataset/cleaned.csv']));
            expect(listing).toMatchObject({truncated:false});expect(listing?.totalFiles).toBeGreaterThan(0);expect(taskPlan).toBeDefined();
            expect(recordedStageReceipts(f.sessionId).find(receipt=>receipt.toolName==='dataset.validatePreparedData')).toMatchObject({stageIndex:4,toolName:'dataset.validatePreparedData',decision:'pass'});
            expect(recordedStageReceipts(f.sessionId).slice(0,4).map(receipt=>receipt.toolName)).toEqual(['dataset.profileStructure','dataset.detectNoiseRows','dataset.suggestCleaningPlan','dataset.validatePreparedData']);
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(1);
        }finally{beginSessionTransition(root);}
    });
    const rejectedProposal=(root:StoreApi,note='Synthetic rejected proposal.')=>({input:{kind:'table',name:'original',tableId:root.getState().datasetBundle!.primaryTableId},
        table:{name:'facts',grain:['Name'],groupBy:[],columns:[{name:'Name',sourceColumn:'Name',dataType:'string',nullable:false,conversion:'identity'},
            {name:'Amount',sourceColumn:'Amount',dataType:'number',nullable:false,conversion:'identity',scale:2}],detailRanges:[{start:0,end:1}]},
        // Row 2 does not exist in the two-row no-cleaning fixture, so the host rejects the proposal.
        exclusions:[{row:2,role:'subtotal'}],assumptions:[note]});
    // A real 0-operation plan, so dataset.suggestCleaningPlan passes without a pending-plan warning.
    const zeroPlanStore=()=>{const root=bareStore();root.setState({dataPreparationPlan:{explanation:'',operations:[],outputColumns:[],planStatus:'operations',consistencyIssues:[]}});return root;};
    const lastText=(context:Parameters<StreamFn>[1])=>{
        const last=context.messages.filter(m=>m.role==='toolResult').at(-1);
        return {last,text:last?.content.filter(p=>p.type==='text').map(p=>p.text).join('')??''};
    };
    it('keeps the skip open after a rejected meaning proposal, and the skip completes with no commit',async()=>{
        const root=zeroPlanStore();let step=0,gate='',skipped='';
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const {text}=lastText(context),index=step++;
                if(index<3)return tool('run_next_analysis_stage',{});
                if(index===3)return tool('candidate_infer_meaning',rejectedProposal(root));
                if(index===4){expect(JSON.parse(text).status).toBe('blocked');return tool('run_next_analysis_stage',{stage:'dataset.applyTransform'});}
                if(index===5){gate=text;return tool('run_next_analysis_stage',{stage:'dataset.validatePreparedData'});}
                if(index===6)skipped=text;
                return tool('run_next_analysis_stage',{});
            })});
            expect(gate).toMatch(/^initial_cleaning_requires_exact_candidate_approval: /);
            expect(gate).toContain('call run_next_analysis_stage with {"stage":"dataset.validatePreparedData"}');
            expect(gate).toContain('Rejected candidate_infer_meaning proposals do not close the skip');
            expect(recordedStageReceipts(f.sessionId).find(receipt=>receipt.toolName==='dataset.validatePreparedData')).toMatchObject({stageIndex:4,toolName:'dataset.validatePreparedData',decision:'pass'});
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(1);
            expect(root.getState().pendingClarification).toBeNull();
        }finally{beginSessionTransition(root);}
    });
    it('returns skip guidance at the rejection threshold while skipping is permitted, and the skip completes',async()=>{
        const root=zeroPlanStore();let calls=0,guidance='';
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const {text}=lastText(context),index=calls++;
                if(index<3)return tool('run_next_analysis_stage',{});
                // Vary the proposal so identical-failure detection cannot be what changes the flow.
                if(index<7)return tool('candidate_infer_meaning',rejectedProposal(root,`Synthetic rejected proposal ${index}.`));
                if(index===7){guidance=JSON.parse(text).hostGuidance;return tool('run_next_analysis_stage',{stage:'dataset.validatePreparedData'});}
                return tool('run_next_analysis_stage',{});
            })});
            expect(guidance).toMatch(/^initial_cleaning_meaning_skip_required: 4 candidate_infer_meaning proposal\(s\) were rejected/);
            expect(guidance).toContain('Call run_next_analysis_stage with {"stage":"dataset.validatePreparedData"}');
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(1);
        }finally{beginSessionTransition(root);}
    });
    it('returns skip guidance after schema-invalid proposals that never reach the tool',async()=>{
        const root=zeroPlanStore();let calls=0,steered='';
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const index=calls++;
                if(index<3)return tool('run_next_analysis_stage',{});
                if(index<7)return tool('candidate_infer_meaning',{note:`not a proposal ${index}`});
                if(index===7){const last=context.messages.at(-1);steered=last?.role==='user'?JSON.stringify(last.content):'';
                    return tool('run_next_analysis_stage',{stage:'dataset.validatePreparedData'});}
                return tool('run_next_analysis_stage',{});
            })});
            expect(steered).toContain('initial_cleaning_meaning_skip_required: 4 candidate_infer_meaning');
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);
        }finally{beginSessionTransition(root);}
    });
    it('stops blocked when the model ignores the skip guidance for two turns',async()=>{
        const root=bareStore();let calls=0;const refused:string[]=[];
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const {last,text}=lastText(context),index=calls++;
                if(index>7&&last?.isError)refused.push(text);
                if(index<3)return tool('run_next_analysis_stage',{});
                return tool('candidate_infer_meaning',rejectedProposal(root,`Synthetic rejected proposal ${index}.`));
            })});
            expect(f.result.status).toBe('blocked');
            expect(f.result.error?.message).toMatch(/^initial_cleaning_meaning_no_progress: .*not skipped within 2 turns of the skip guidance/);
            expect(calls).toBe(9);expect(refused[0]).toMatch(/^initial_cleaning_meaning_skip_required: /);
            expect(root.getState().analysisCards).toHaveLength(0);expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
        }finally{beginSessionTransition(root);}
    });
    it('neither counts nor blocks on meaning calls refused before the cleaning window opens',async()=>{
        const root=zeroPlanStore();let calls=0;const refusals:string[]=[];
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const {last,text}=lastText(context),index=calls++;
                if(last?.toolName==='candidate_infer_meaning')refusals.push(text);
                if(index<5)return tool('candidate_infer_meaning',rejectedProposal(root,`Early proposal ${index}.`));
                if(index<8)return tool('run_next_analysis_stage',{});
                if(index===8)return tool('run_next_analysis_stage',{stage:'dataset.validatePreparedData'});
                return tool('run_next_analysis_stage',{});
            })});
            expect(refusals).toHaveLength(5);expect(refusals.every(text=>text==='initial_coding_phase_unavailable')).toBe(true);
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);
        }finally{beginSessionTransition(root);}
    });
    it('resets the rejection total when a proposal is accepted and still stops once work started',async()=>{
        const root=bareStore();let calls=0;
        // Row 5 does not exist in the three-row repair fixture; the default proposal (row 2) is accepted.
        const outOfRange=(index:number)=>({...rejectedProposal(root,`Out-of-range proposal ${index}.`),exclusions:[{row:5,role:'subtotal'}]});
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{wrapStream:()=>scripted(()=>{
                const index=calls++;
                if(index<3)return tool('run_next_analysis_stage',{});
                if(index<6)return tool('candidate_infer_meaning',outOfRange(index));
                if(index===6)return tool('candidate_infer_meaning',rejectedProposal(root,'Name identifies one detail fact; the final subtotal covers every detail.'));
                // After acceptance the meaning contract is locked, so later proposals are rejected.
                return tool('candidate_infer_meaning',outOfRange(index));
            })});
            expect(f.result.status).toBe('blocked');
            // Without the reset, the third post-acceptance rejection would reach the total limit of 6.
            expect(f.result.error?.message).toMatch(/^initial_cleaning_meaning_no_progress: 4 candidate_infer_meaning proposal\(s\) were rejected \(4 in a row\) after cleaning work started/);
            expect(calls).toBe(11);expect(io.commits).toBe(0);
        }finally{beginSessionTransition(root);}
    });
    it('does not count scope or lease failures as meaning rejections',async()=>{
        const root=zeroPlanStore();let calls=0;const results:string[]=[];
        const inference=vi.spyOn(meaningInference,'inferCandidateMeaning').mockRejectedValue(new Error('scope_revoked'));
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(context=>{
                const {last,text}=lastText(context),index=calls++;
                if(last?.toolName==='candidate_infer_meaning')results.push(text);
                if(index<3)return tool('run_next_analysis_stage',{});
                if(index<9)return tool('candidate_infer_meaning',rejectedProposal(root,`Scope failure ${index}.`));
                if(index===9)return tool('run_next_analysis_stage',{stage:'dataset.validatePreparedData'});
                return tool('run_next_analysis_stage',{});
            })});
            expect(results).toHaveLength(6);expect(results.every(text=>JSON.parse(text).message==='scope_revoked')).toBe(true);
            expect(results.some(text=>text.includes('initial_cleaning_meaning_skip_required'))).toBe(false);
            expect(f.result.status,f.result.error?.message).toBe('completed');expect(io.commits).toBe(0);
        }finally{inference.mockRestore();beginSessionTransition(root);}
    });
    it('stops blocked at the rejection threshold once cleaning work has started',async()=>{
        const root=bareStore();let calls=0;
        try{
            const f=await preparePiInitialCodingUiSmoke(root,{mode:'no-cleaning',wrapStream:()=>scripted(()=>{
                const index=calls++;
                if(index<3)return tool('run_next_analysis_stage',{});
                if(index===3)return tool('workspace_write',{path:'/workspace/probe.js',expectedRevision:0,content:'return 1;'});
                return tool('candidate_infer_meaning',rejectedProposal(root,`Synthetic rejected proposal ${index}.`));
            })});
            expect(f.result.status).toBe('blocked');
            expect(f.result.error?.message).toMatch(/^initial_cleaning_meaning_no_progress: 4 candidate_infer_meaning proposal\(s\) were rejected \(4 in a row\) after cleaning work started/);
            expect(calls).toBe(8);expect(root.getState().activeAgentTask?.status).toBe('blocked');
            expect(root.getState().analysisCards).toHaveLength(0);expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
        }finally{beginSessionTransition(root);}
    });
    it.each(['switch','stop'] as const)('fences a deferred post-approval query after %s',async mode=>{
        const root=bareStore(),gate=deferred(),started=deferred();try{
            await preparePiInitialCodingUiSmoke(root);io.beforeQuery=()=>{started.resolve();return gate.promise;};
            const running=handleClarificationResponse({label:'Approve',value:'approve'},root);
            await started.promise;
            if(mode==='switch'){beginSessionTransition(root);root.setState({sessionId:'replacement',analysisCards:[],finalSummary:null,csvData:{fileName:'new.csv',data:[{Amount:77}]},isBusy:true});beginRun(root,'follow_up','new-run','new-turn');}
            else cancelOwnedRun(root);
            await running;gate.resolve();await Promise.resolve();
            expect(root.getState().analysisCards).toHaveLength(0);expect(root.getState().finalSummary).toBeNull();
            if(mode==='switch'){expect(root.getState().activeExecution?.runId).toBe('new-run');expect(root.getState().isBusy).toBe(true);}
            else{expect(root.getState().initialAnalysisStatus).toBe('paused');expect(root.getState().csvData?.data).toHaveLength(2);}
        }finally{gate.resolve();beginSessionTransition(root);}
    });
    it('reconciles a lost cleaning acknowledgement from the exact journal, reattaches source and preserves consumed budget',async()=>{
        const root=bareStore(),restored=bareStore();try{
            const f=await preparePiInitialCodingUiSmoke(root),captured=readPiInitialCheckpoint(f.sessionId) as PiInitialCheckpointV2;
            await handleClarificationResponse({label:'Approve',value:'approve'},root);
            const marker=[...io.records.values()].find((r):r is DatasetCommitMarker=>(r as DatasetCommitMarker).kind==='commit')!;
            beginSessionTransition(root);
            restored.setState({...root.getState(),csvData:null,canonicalCsvData:null,rawCsvData:null,activeAgentTask:null,taskInspection:null,activeExecution:null,
                pendingClarification:null,datasetCommitBindingStatus:undefined,analysisCards:[],queryHistory:[],finalSummary:null,finalSummaryProvenance:null});
            writePiInitialCheckpoint(captured);
            await recoverPiInitialAnalysisIfNeeded(restored,f.stream,f.runtimeOptions);
            expect(restored.getState().initialAnalysisRecovery?.status).toBe('awaiting_source');expect(io.commits).toBe(1);
            const result=await reattachPiInitialCheckpointSource(f.file,restored,f.stream,f.runtimeOptions);
            expect(result?.status,restored.getState().initialAnalysisRecovery?.reason ?? '').toBe('degraded');
            expect(io.commits).toBe(1);expect(io.queryCalls).toBe(2);expect(restored.getState().csvData?.data).toHaveLength(2);
            expect(restored.getState().activeAgentTask?.taskId).not.toBe(f.taskId);
            expect(restored.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(marker.taskBudget!.used.transformationAttempts);
            expect(restored.getState().activeAgentTask?.budget.used.providerTurns).toBeGreaterThanOrEqual(marker.taskBudget!.used.providerTurns);
            expect(restored.getState().activeAgentTask?.capabilityGrants).toEqual([]);expect(readPiInitialCheckpoint(f.sessionId)).toBeNull();
        }finally{beginSessionTransition(root);beginSessionTransition(restored);}
    });
    it('blocks uncommitted or unrelated pending stages without replay or restoring approval',async()=>{
        const root=bareStore();try{
            const f=await preparePiInitialCodingUiSmoke(root),captured=readPiInitialCheckpoint(f.sessionId) as PiInitialCheckpointV2;
            beginSessionTransition(root);root.setState({pendingClarification:null,isBusy:false});
            await recoverPiInitialAnalysisIfNeeded(root,f.stream,f.runtimeOptions);
            expect(root.getState().initialAnalysisRecovery?.status).toBe('blocked');expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);
            writePiInitialCheckpoint(captured);await handleClarificationResponse({label:'Approve',value:'approve'},root);
            expect(io.commits).toBe(0);expect(root.getState().pendingClarification).toBeNull();
        }finally{beginSessionTransition(root);}
    });
    it('cannot finish the report by retaining an old headline when summary generation returns without writing',async()=>{
        const root=bareStore();try{
            const f=await preparePiInitialCodingUiSmoke(root),runEvidence=f.runtimeOptions.stageServices!.runEvidence!;
            f.runtimeOptions.stageServices!.runEvidence=async args=>{
                const result=await runEvidence(args),card=args.store.getState().analysisCards.at(-1)!;
                args.store.setState({finalSummary:{language:'English',text:'Old headline 999.'},finalSummaryProvenance:card.provenance});return result;
            };
            f.runtimeOptions.stageServices!.generateSummaries=async()=>undefined;
            await handleClarificationResponse({label:'Approve',value:'approve'},root);
            expect(io.commits).toBe(1);expect(io.queryCalls).toBe(1);expect(root.getState().activeAgentTask?.status).toBe('blocked');
            expect(root.getState().initialAnalysisStatus).toBe('paused');expect(root.getState().analysisCards).toHaveLength(1);
        }finally{beginSessionTransition(root);}
    });
    it('preserves provider failure as failed and does not execute legacy cleaning',async()=>{
        const root=bareStore(),runCleaning=vi.fn();let turns=0;try{
            const f=await preparePiInitialCodingUiSmoke(root,{observe:()=>{if(++turns===3)throw new Error('Synthetic provider failure');},stageServices:{runCleaning}});
            expect(f.result.status).toBe('failed');expect(root.getState().activeAgentTask?.status).toBe('failed');
            expect(readPiInitialCheckpoint(f.sessionId)?.coding?.budget.used.providerTurns).toBe(3);
            expect(io.commits).toBe(0);expect(io.queryCalls).toBe(0);expect(runCleaning).not.toHaveBeenCalled();
        }finally{beginSessionTransition(root);}
    });
    it('continues a separately revalidated interrupted candidate only after new exact approval, with its charged budget',async()=>{
        const root=bareStore();try{
            const f=await preparePiInitialCodingUiSmoke(root);
            beginSessionTransition(root);root.setState({pendingClarification:null,isBusy:false});
            const first=beginRun(root,'follow_up','revalidate'),firstStore=scopeRunStore(root,first);
            const recovered=await recoverCandidateReview(firstStore,{file:f.file});
            expect(recovered.status).toBe('review');expect(io.commits).toBe(0);finishRun(root,first);
            if(recovered.status!=='review')throw new Error('Expected fresh review');
            const approval=beginRun(root,'follow_up','recovery-approve'),approved=scopeRunStore(root,approval);
            const marker=await commitRecoveredCandidate(approved,recovered.review);finishRun(root,approval);
            expect(marker.taskBudget?.used.transformationAttempts).toBe(2);
            expect(marker.taskBudget?.used.toolCalls).toBeGreaterThan(f.oldBudget!.used.toolCalls);
            const result=await recoverPiInitialAnalysisIfNeeded(root,scripted(()=>tool('run_next_analysis_stage',{})),f.runtimeOptions);
            expect(result?.status,result?.error?.message).toBe('degraded');expect(io.commits).toBe(1);expect(io.queryCalls).toBe(1);
            expect(root.getState().activeAgentTask?.budget.used.transformationAttempts).toBe(2);
            expect(root.getState().activeAgentTask?.status).toBe('completed');
        }finally{beginSessionTransition(root);}
    });
});
