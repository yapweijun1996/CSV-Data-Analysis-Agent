import {createAssistantMessageEventStream, type AssistantMessage} from '@earendil-works/pi-ai';
import type {StreamFn} from '@earendil-works/pi-agent-core';
// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {executeQuickJsGuest} from '../services/sandbox/quickJsGuest';
import {resolveGuestLimits} from '../services/sandbox/javascriptGuestProtocol';
import {prepareBridgeFixture} from './helpers/headerRepairBridgeFixture';
import {prepareStructureRepairReview,confirmStructureRepairMeaning,continueStructureRepairAnalysis} from '../services/agent/structureRepairConfirmation';
import {handleClarificationResponse} from '../services/agent/orchestration/chatOrchestrator';
import {beginSessionTransition} from '../services/session/sessionOwnership';
import type {StoreApi} from '../services/agent/types';
import {repairReservationStorage} from './helpers/repairReservationStorage';
const controls=vi.hoisted(()=>({stream:null as unknown,guest:null as unknown,db:null as unknown}));
vi.mock('../services/storageService',async original=>({...await original<typeof import('../services/storageService')>(),getStorageDatabase:async()=>controls.db}));
vi.mock('../services/persistence/currentSessionPersistence',()=>({persistCurrentAppSessionSnapshot:vi.fn(async()=>true)}));
vi.mock('../services/agent/memory/memoryManager',()=>({finalizeAndSaveRun:vi.fn(async()=>{})}));
vi.mock('../services/agent/runtime/pi/piProvider',async original=>({...await original<typeof import('../services/agent/runtime/pi/piProvider')>(),createPiProviderStream:()=>controls.stream}));
vi.mock('../services/agent/runtime/pi/piExecutorPreparation',async original=>{const real=await original<typeof import('../services/agent/runtime/pi/piExecutorPreparation')>();return {...real,preparePiExecutor:(store:StoreApi,options:Parameters<typeof real.preparePiExecutor>[1])=>real.preparePiExecutor(store,{...options,guest:controls.guest as never})};});
const wasm=newQuickJSWASMModuleFromVariant(variant),roots:StoreApi[]=[];
beforeEach(()=>{
    for(const name of ['localStorage','sessionStorage']){const v=new Map<string,string>();vi.stubGlobal(name,{getItem:(k:string)=>v.get(k)??null,setItem:(k:string,x:string)=>v.set(k,x),removeItem:(k:string)=>v.delete(k)});}
    controls.db=repairReservationStorage().db;
    controls.guest={run:(code:string,inputJson:string,o:{limits?:Parameters<typeof resolveGuestLimits>[0];onStarted?:()=>void})=>executeQuickJsGuest({generation:1,code,inputJson,limits:resolveGuestLimits(o?.limits)},()=>wasm,o?.onStarted),cancel(){},dispose(){}};
});
afterEach(()=>{roots.splice(0).forEach(beginSessionTransition);vi.unstubAllGlobals();});
const setup=()=>{let state={sessionId:crypto.randomUUID(),settings:{},workspaceFiles:{},analysisCards:[],columnProfiles:[],chatHistory:[],agentEvents:[],agentToolLogs:[],runtimeEvents:[],telemetryEvents:[],progressMessages:[],queryHistory:[],logAgentToolUsage(){},addProgress(){},clearActiveTurnCancellation(){},ensureDatasetSemanticSnapshot:async()=>null} as unknown as ReturnType<StoreApi['getState']>;
    const store:StoreApi={getState:()=>state,setState:p=>{state={...state,...(typeof p==='function'?p(state):p)};}};roots.push(store);return store;};
it('allows legitimate source range reads before normal full meaning approval',async()=>{
 const store=setup(),f=await prepareBridgeFixture(store);let calls=0;
 const stream:StreamFn=(model,context,options)=>{
  calls++;if(calls>3)return f.stream(model,context,options);
  const msg:AssistantMessage={role:'assistant',content:[{type:'toolCall',id:crypto.randomUUID(),name:'workspace_read',arguments:{path:'/intake/source-records.json',startRow:calls-1,rowCount:1}}],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'toolUse',timestamp:Date.now()};
  const events=createAssistantMessageEventStream();events.push({type:'start',partial:msg});events.push({type:'done',reason:'toolUse',message:msg});return events;
 };controls.stream=stream;const review=(await prepareStructureRepairReview(store))!;
 await confirmStructureRepairMeaning(store,review.reviewId,review.choices[0].candidateDigest);await continueStructureRepairAnalysis(store,review.reviewId);
 expect(calls).toBeGreaterThan(3);expect(store.getState().structureRepairReview?.status).toBe('awaiting_repair');
 expect(store.getState().pendingClarification?.resumeContext?.piSpillMeaningChoice).toBeTruthy();
 expect(store.getState().datasetBundle?.acceptedCommit).toBeUndefined();
},30000);
