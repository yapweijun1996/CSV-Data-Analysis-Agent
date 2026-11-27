// @vitest-environment node
import { getTranslation } from '../utils/localization';
import { describe, expect, it, vi } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import { createAssistantMessageEventStream, type AssistantMessage, type JsonObject } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { executeQuickJsGuest } from '../services/sandbox/quickJsGuest';
import { resolveGuestLimits } from '../services/sandbox/javascriptGuestProtocol';
import { captureOwnedPiTaskIdentity, isCurrentPiTaskIdentity, preparePiTask } from '../services/agent/runtime/pi/piCodingTask';
import { runPiFollowUpTurn } from '../services/agent/runtime/pi/piFollowUpRuntimeService';
import { createPiAppTools } from '../services/agent/runtime/pi/piAppTools';
import { beginRun, scopeRunStore, finishRun, beginSessionTransition, cancelOwnedRun } from '../services/session/sessionOwnership';
import type { StoreApi } from '../services/agent/types';
import { createSingleTableDatasetBundle } from '../services/data/datasetBundle';
import type { CsvRow } from '../types';
import { buildTaskExport, inspectTaskExport } from '../services/agent/runtime/pi/piTaskExports';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { parse } from 'papaparse';
import {resolveAnswerScope} from '../services/agent/runtime/pi/queryEvidence';
import {resolveComputationScopeRepair} from '../services/agent/runtime/pi/piScopeRepair';
import { PEARSON_QUALIFICATION_PROGRAM } from '../services/agent/execution/evidenceAdmissionQualification';

vi.mock('../services/persistence/currentSessionPersistence', () => ({ persistCurrentAppSessionSnapshot: vi.fn(async () => true) }));
vi.mock('../services/agent/memory/followUpMemory', () => ({ readAppFollowUpMemory: vi.fn(async () => []) }));
vi.mock('../services/privacy/cloudAiConsent', () => ({ ensureCloudAiConsent: vi.fn(async () => undefined) }));

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
type Content = AssistantMessage['content'];
const scripted = (next: (context: Parameters<StreamFn>[1]) => Content): StreamFn => (model, context) => {
    const content = next(context), stopReason = content.some(part => part.type === 'toolCall') ? 'toolUse' as const : 'stop' as const;
    const message: AssistantMessage = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id, usage, stopReason, timestamp: Date.now() };
    const stream = createAssistantMessageEventStream(); stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: stopReason, message }); return stream;
};
let callId = 0;
const tool = (name: string, args: Record<string, unknown>): Content => [{ type: 'toolCall', id: `script-${++callId}`, name, arguments: args as JsonObject }];
const reply = (text = 'Fabricated stdout: 999; everything completed.'): Content => [{ type: 'text', text }];
const observed = (context: Parameters<StreamFn>[1]) => context.messages.filter(message => message.role === 'toolResult').map(message => {
    const text = message.content.filter(part => part.type === 'text').map(part => part.text).join('');
    try { return JSON.parse(text); } catch { return { error: text }; }
});
const artifactRef = (artifact: {path: string; revision: number; sha256: string}) => ({ path: artifact.path, revision: artifact.revision, sha256: artifact.sha256 });
const realGuest = { run: (code, inputJson, options) => executeQuickJsGuest({ generation: 1, code, inputJson, limits: resolveGuestLimits(options.limits) },
    () => newQuickJSWASMModuleFromVariant(variant), options.onStarted), cancel() {}, dispose() {} } satisfies NonNullable<Parameters<typeof preparePiTask>[3]>;
const fixture = async (guest = realGuest, message = 'Write a JavaScript program and stage its output.', completeRows?:CsvRow[]) => {
    let state = { sessionId: `coding-${crypto.randomUUID()}`, settings: { provider: 'default', complexModel: 'mock', language: 'English',
        runtimeAccessControl: { permissionMode: 'open', toolOverrides: {}, workspaceRules: { deniedPathPrefixes: [] } } },
        csvData: { fileName: 'synthetic.csv', data: [{ Amount: 10 }] }, semanticDatasetVersion: 'v1',
        datasetBundle: { primaryTableId: 't', datasetVersion: 'v1', source: {}, relationshipSetId: 'rel', tables: [{ tableId: 't', datasetVersion: 'v1' }] },
        analysisCards: [], columnProfiles: [{name: 'Amount', type: 'number'}], chatHistory: [], dataQualityIssues: [], activeDataQuery: null,
        agentEvents: [], agentToolLogs: [], runtimeEvents: [], progressMessages: [], telemetryEvents: [],
        workspaceFiles: { 'skills/novel/SKILL.md': '---\nname: novel\ndescription: Inspect and repair a program.\n---\nUse real errors, then rerun.' },
        logAgentToolUsage: vi.fn(), addProgress: vi.fn(), clearActiveTurnCancellation: vi.fn(), setStreamingMessage: vi.fn(),
    } as unknown as ReturnType<StoreApi['getState']>;
    if(completeRows){const data={fileName:'synthetic.csv',data:completeRows};state.csvData=data;
        state.datasetBundle=createSingleTableDatasetBundle({datasetId:'synthetic',sourceFingerprint:'synthetic',file:{name:data.fileName,size:0,lastModified:0},data});
        state.semanticDatasetVersion=state.datasetBundle.datasetVersion;}
    const root: StoreApi = { getState: () => state, setState: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; } };
    const lease = beginRun(root, 'follow_up', crypto.randomUUID(), crypto.randomUUID()), store = scopeRunStore(root, lease);
    const task = await preparePiTask(store, message, undefined, guest);
    return { root, store, lease, task, message };
};
const programPath = '/workspace/repair.js', outputPath = '/workspace/output.json';
const runArgs = (program: ReturnType<typeof artifactRef>, inputs: unknown[] = []) => ({ program, inputs, output: { path: outputPath, expectedRevision: 0, format: 'json' } });
const completedExportFixture = async () => {
    const rows:CsvRow[]=[{Name:'甲, "October"\nline',Amount:-5},{Name:'Detail',Amount:12}];
    const s=await fixture(realGuest,undefined,rows);let step=0;
    const result=await runPiFollowUpTurn({message:s.message},s.store,scripted(context=>{
        if(step++===0)return tool('workspace_write',{path:programPath,content:'return input.facts.rows;',expectedRevision:0});
        if(step===2)return tool('code_run',{...runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)),mode:'whole_table',tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}]});
        return reply();
    }));finishRun(s.root,s.lease);expect(result.status,result.text).toBe('completed');return {...s,rows};
};

describe('Pi coding capability admission', () => {
    it('preserves exact write refs and a bounded plan when authored program text exceeds the observation budget',async()=>{
        const s=await fixture(),content=`/*${'x'.repeat(6500)}*/\nreturn {value:1};`;let step=0;
        try {
            const result=await runPiFollowUpTurn({message:s.message},s.store,scripted(context=>{
                if(step++===0)return tool('workspace_write',{path:programPath,expectedRevision:0,content});
                if(step===2){
                    const message=context.messages.filter(m=>m.role==='toolResult').at(-1)!;
                    const text=message.content.filter(c=>c.type==='text').map(c=>c.text).join('');
                    expect(text.length).toBeLessThanOrEqual(6000);
                    const value=JSON.parse(text);
                    expect(value.taskPlan.phase).toBe('compute_program');
                    expect(value.payload.workspace.artifact.sha256).toBe(createHash('sha256').update(content).digest('hex'));
                    return tool('code_run',runArgs(artifactRef(value.payload.workspace.artifact)));
                }
                return reply();
            }));
            expect(result.status,result.text).toBe('completed');
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it('requires a current-task exact repair commit before admitting a combined computation', async () => {
        const s = await fixture(realGuest, 'Repair the fact table, then calculate its lower weighted median.', [{Amount:0,Quantity:1}]);
        const scope = {requiresEvidence:true,queries:[],complete:true,unresolved:[],dataPreparation:'canonical_fact_table' as const,
            computation:{method:'lower_weighted_median' as const,value:'Amount',weight:'Quantity',tableId:s.root.getState().datasetBundle!.primaryTableId,
                missingPolicy:'pairwise_complete' as const,weightPolicy:'nonnegative_integer_frequency' as const,seed:'none' as const}};
        try {
            await s.task.resolveScope(scope);
            expect(s.task.snapshot.requiredOutputs).toContainEqual({id:'repaired-dataset',kind:'dataset',required:true});
            await expect(s.task.beforeTool('computation.validate',{jobId:'historical-job'},'early-computation')).rejects.toThrow('task_repair_commit_required');
        } finally { finishRun(s.root,s.lease); beginSessionTransition(s.root); }
    });
    it('refuses a same-message write/run even when the model predicts the exact program hash', async () => {
        const s = await fixture();
        const content = 'return {value:1};', sha256 = createHash('sha256').update(content).digest('hex');
        let step = 0;
        try {
            const result = await runPiFollowUpTurn({message:s.message},s.store,scripted(context => {
                if (step++ === 0) return [...tool('workspace_write',{path:programPath,expectedRevision:0,content}),
                    ...tool('code_run',runArgs({path:programPath,revision:1,sha256}))];
                expect(JSON.stringify(observed(context))).toContain('task_dependency_requires_receipt');
                return reply();
            }));
            expect(result.status).toBe('blocked');
            expect(s.root.getState().taskInspection?.observations.some(o=>o.jobId)).toBe(false);
        } finally { finishRun(s.root,s.lease); beginSessionTransition(s.root); }
    });
    it.each([false,true])('requires a derived ranking output while accepting a genuinely empty query: empty=%s',async empty=>{
        const s=await fixture(realGuest,'List the lowest 2 customers by profit margin.',[{Customer:'High',Sales:100,Profit:50},{Customer:'Low',Sales:100,Profit:10}]);
        const plan={groupBy:['Customer'],aggregates:[{function:'sum' as const,column:'Sales',as:'total_sales'},{function:'sum' as const,column:'Profit',as:'total_profit'}],limit:500,
            ...(empty?{where:{predicates:[{column:'Sales',operator:'gt' as const,value:1000}]}}:{})};let call=0;
        try{
            const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:{intent:'data_query',taskSignal:'derive_metric',expectedOutput:'table_answer',referencedColumns:['Sales','Profit'],groupingColumns:['Customer'],aggregationFunctions:['sum'],
                timeScope:{kind:'none'},unresolvedReferences:[],requestedQueryScopes:[{role:'result',plan}],resultCompleteness:'complete'} as never},s.store,
                scripted(()=>call++===0?tool('data_query',{explanation:'Current ranking inputs',plan}):reply()));
            expect(result.status,result.text).toBe(empty?'completed':'blocked');
            expect(s.root.getState().runtimeRunHistory!.at(-1)?.taskOutputs?.queryIds).toHaveLength(1);
            expect(s.root.getState().runtimeRunHistory!.at(-1)?.taskOutputs?.acceptedOutputs).toHaveLength(empty?1:0);
            expect(result.text).not.toContain('| Customer | total_sales | total_profit |');
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['Hello','Explain the formula for Pearson correlation.'])('completes ordinary explanation without requiring a data query: %s',async message=>{
        const s=await fixture(realGuest,message);
        try{
            const result=await runPiFollowUpTurn({message},s.store,scripted(()=>reply('A method explanation without dataset values.')));
            expect(result.status,result.text).toBe('completed');expect(s.root.getState().activeDataQuery).toBeNull();
            expect(s.root.getState().runtimeRunHistory!.at(-1)?.taskOutputs).toMatchObject({status:'complete',queryIds:[],computationIds:[],missingRequiredIds:[]});
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['missing', 'denied'] as const)('keeps factual evidence and terminal state honest: %s', async mode => {
        const s = await fixture(realGuest, 'What is the total Amount?', [{Amount:2},{Amount:5}]);
        const plan = {aggregates:[{function:'sum' as const,column:'Amount',as:'Total'}]};
        const artifact = {intent:'data_query',taskSignal:'inspect_data',expectedOutput:'scalar_answer',requestedQueryScopes:[{role:'result',plan}],
            referencedColumns:['Amount'],groupingColumns:[],aggregationFunctions:['sum'],timeScope:{kind:'none'},unresolvedReferences:[]} as never;
        if (mode === 'denied') s.root.setState({settings:{...s.root.getState().settings,runtimeAccessControl:{permissionMode:'open',toolOverrides:{'data.query':'deny'},workspaceRules:{deniedPathPrefixes:[]}}} as never});
        let call = 0;
        try {
            const result = await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact},s.store,scripted(() => {
                if (mode==='missing' || mode==='denied' && call++ > 0) return reply();
                return tool('data_query',{explanation:'Current sum',plan});
            }));
            expect(result.status,result.text).toBe('blocked');
            expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
            const record=s.root.getState().runtimeRunHistory!.at(-1)!;
            expect(record.outcomeKind).toBe('blocked');expect(record.taskOutputs?.status).not.toBe('complete');
            expect(record.taskOutputs?.missingRequiredIds).toContain('reply');
            expect(record.taskOutputs?.queryIds.length).toBe(0);
            expect(s.root.getState().activeAgentTask?.status).toBe('blocked');expect(s.root.getState().isBusy).toBe(false);
        } finally {finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it('does not stop an ordinary request after only three tool calls', async () => {
        // Regression: a trend question needing several queries used to hit the per-request cap of 3 and surface
        // "task_budget_exhausted:toolCalls" while the task budget showed 3/40.
        const s = await fixture(realGuest, 'What is the total Amount?', [{Amount:2},{Amount:5}]);
        const plan = {aggregates:[{function:'sum' as const,column:'Amount',as:'Total'}]};
        const artifact = {intent:'data_query',taskSignal:'inspect_data',expectedOutput:'scalar_answer',requestedQueryScopes:[{role:'result',plan}],
            referencedColumns:['Amount'],groupingColumns:[],aggregationFunctions:['sum'],timeScope:{kind:'none'},unresolvedReferences:[]} as never;
        let call = 0;
        try {
            const result = await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact},s.store,scripted(() => {
                if (call++ < 5) return tool('data_query',{explanation:`Current sum ${call}`,plan});
                return reply();
            }));
            expect(result.text).not.toContain('task_budget_exhausted');
            expect(result.text).not.toBe(getTranslation('task_stop_toolCalls','English'));
            expect(s.task.blockedReason).not.toBe('task_budget_exhausted:toolCalls');
            expect(s.task.snapshot.budget.used.toolCalls).toBeGreaterThan(3);
        } finally {finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['provider-failure','cancelled'] as const)('retains a real artifact without upgrading the terminal: %s', async mode => {
        const s=await fixture();let call=0;let release:()=>void=()=>{};let entered!:()=>void;
        const enteredPromise=new Promise<void>(resolve=>{entered=resolve;});
        const ordinary=scripted(context=>{
            if(call++===0)return tool('workspace_write',{path:programPath,content:'return {total:7};',expectedRevision:0});
            if(call===2)return tool('code_run',runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)));
            if(mode==='provider-failure')throw new Error('Synthetic provider unavailable after accepted output');
            return tool('workspace_read',{path:outputPath});
        });
        const stream:StreamFn=(model,context,options)=>{
            if(mode!=='cancelled'||call<2)return ordinary(model,context,options);
            const out=createAssistantMessageEventStream(),message:AssistantMessage={role:'assistant',content:reply(),api:model.api,provider:model.provider,model:model.id,usage,stopReason:'stop',timestamp:Date.now()};
            out.push({type:'start',partial:message});release=()=>out.push({type:'done',reason:'stop',message});entered();return out;
        };
        try{
            const pending=runPiFollowUpTurn({message:s.message},s.store,stream);
            if(mode==='cancelled'){await enteredPromise;cancelOwnedRun(s.root);}
            const result=await pending;
            expect(result.status,result.text).toBe(mode==='provider-failure'?'failed':mode==='cancelled'?'cancelled':'blocked');
            const record=s.root.getState().runtimeRunHistory!.at(-1)!;
            expect(record.taskOutputs?.status).toBe('partial');expect(record.taskOutputs?.acceptedOutputs[0].kind).toBe('artifact');
            expect(s.root.getState().activeAgentTask?.status).toBe(result.status);expect(s.root.getState().isBusy).toBe(false);
            const terminal=structuredClone(s.root.getState().runtimeRunHistory);release();await Promise.resolve();
            expect(s.root.getState().runtimeRunHistory).toEqual(terminal);expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
            expect(inspectTaskExport(s.root,s.task.snapshot.taskId).available).toBe(false);
        }finally{release();finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['executor','source','artifact'] as const)('does not complete when required execution material is unavailable: %s',async mode=>{
        const guest=mode==='executor'?{run:async()=>{throw new Error('capability_unavailable');},cancel(){},dispose(){}}:realGuest;
        const s=await fixture(guest);let call=0;
        try{
            const result=await runPiFollowUpTurn({message:s.message},s.store,scripted(context=>{
                if(call++===0)return tool('workspace_write',{path:programPath,content:'return 7;',expectedRevision:0});
                if(call===2){const program=artifactRef(observed(context).at(-1).payload.workspace.artifact);
                    return tool('code_run',{...runArgs(mode==='artifact'?{...program,path:'/workspace/missing.js'}:program),
                        ...(mode==='source'?{sources:[{name:'raw',sourceId:'missing-source',sha256:'0'.repeat(64)}]}:{})});}
                return reply();
            }));
            expect(result.status,result.text).toBe('blocked');expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
            const record=s.root.getState().runtimeRunHistory!.at(-1)!;
            expect(record.taskOutputs?.acceptedOutputs).toEqual([]);expect(record.taskOutputs?.missingRequiredIds).toContain('staged-output');
            expect(s.root.getState().isBusy).toBe(false);
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['matched','zero','wrong-filter'] as const)('exports only admitted current query evidence: %s',async mode=>{
        const s=await fixture(realGuest,'List all totals by Town, October 2026 only.',[
            {Town:'A',Amount:12,Date:mode==='zero'?'2026-09-01':'2026-10-01'},
            {Town:'B',Amount:-5,Date:mode==='zero'?'2026-09-02':'2026-10-02'}]);
        s.root.setState({columnProfiles:[{name:'Town',type:'string'},{name:'Amount',type:'number'},{name:'Date',type:'date'}] as never});
        const plan={groupBy:['Town'],aggregates:[{function:'sum',column:'Amount',as:'Total'}],where:{predicates:[{column:'Date',operator:'gte',value:'2026-10-01'},{column:'Date',operator:'lt',value:'2026-11-01'}]},limit:500};
        let step=0;
        try{
            const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:{intent:'data_query',taskSignal:'inspect_data',expectedOutput:'table_answer',timeScope:{kind:'explicit',value:'October 2026'},
                requestedQueryScopes:[{role:'result',plan}],resultCompleteness:'complete',referencedColumns:['Town','Amount','Date'],groupingColumns:['Town'],aggregationFunctions:['sum'],unresolvedReferences:[]} as never},s.store,scripted(()=>step++===0?tool('data_query',{explanation:'Current October scope.',plan:mode==='wrong-filter'?{...plan,where:undefined}:plan}):reply()));
            finishRun(s.root,s.lease);
            if(mode==='wrong-filter') {expect(result.status).toBe('blocked');expect(inspectTaskExport(s.root,s.task.snapshot.taskId).available).toBe(false);return;}
            expect(result.status,result.text).toBe('completed');
            expect(s.root.getState().runtimeRunHistory!.at(-1)?.taskOutputs).toMatchObject({status:'complete',missingRequiredIds:[]});
            const exported=await buildTaskExport(s.root,s.task.snapshot.taskId),files=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
            expect(manifest.evidence.status).toBe('accepted');expect(manifest.answerComplete).toBe(true);
            const rows=JSON.parse(strFromU8(files['evidence/query-0.json'])).rows;
            expect(rows).toHaveLength(mode==='zero'?0:2);
            expect(rows.reduce((total:number,r:{Total:number})=>total+r.Total,0)).toBe(mode==='zero'?0:7);
            expect(manifest.evidence.queries[0].grain).toEqual({kind:'grouped',columns:['Town']});
            expect(Object.hasOwn(files,'evidence/query-0.csv')).toBe(true);
        }finally{beginSessionTransition(s.root);}
    });
    it('exports one admitted query used by multiple answer roles',async()=>{
        const s=await fixture(realGuest,'Compute the ratio of total Amount to the same total Amount.',[{Name:'Alpha',Amount:2},{Name:'Beta',Amount:5}]);
        s.root.setState({columnProfiles:[{name:'Name',type:'string'},{name:'Amount',type:'number'}] as never});
        const plan={aggregates:[{function:'sum' as const,column:'Amount',as:'Total'}]};
        const artifact={intent:'data_query',taskSignal:'derive_metric',expectedOutput:'scalar_answer',referencedColumns:['Amount'],groupingColumns:[],aggregationFunctions:['SUM'],
            timeScope:{kind:'none',value:null},unresolvedReferences:[],requestedQueryScopes:[{role:'numerator',plan},{role:'denominator',plan}],
            queryCalculation:{operation:'ratio',leftRole:'numerator',rightRole:'denominator'},resultCompleteness:'complete'} as never;
        let step=0;
        try{
            const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact},s.store,
                scripted(()=>step++===0?tool('data_query',{explanation:'One current total satisfies both roles.',plan}):reply()));
            expect(result.status,result.text).toBe('completed');
            const ids=s.root.getState().taskInspection!.grounding!.queryIds;
            expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);finishRun(s.root,s.lease);
            const exported=await buildTaskExport(s.root,s.task.snapshot.taskId),files=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
            expect(JSON.parse(strFromU8(files['evidence/query-0.json'])).rows).toEqual([{Total:7}]);
            expect(Object.hasOwn(files,'evidence/query-1.json')).toBe(false);
            expect(manifest.evidence.selectedIds).toEqual([ids[0]]);
            expect(manifest.evidence.queryRoles).toEqual([{role:'numerator',queryId:ids[0]},{role:'denominator',queryId:ids[0]}]);
            expect(manifest.answerComplete).toBe(true);
        }finally{beginSessionTransition(s.root);}
    });
    it('exports independently validated computation with method, coverage and exact execution refs',async()=>{
        const s=await fixture(realGuest,'Calculate Pearson correlation for X and Y, October 2026 only.',[
            {X:1,Y:2,Date:'2026-10-01'},{X:2,Y:4,Date:'2026-10-02'},{X:3,Y:6,Date:'2026-10-03'},{X:4,Y:null,Date:'2026-10-04'},{X:5,Y:-99,Date:'2026-09-30'}]);
        s.root.setState({columnProfiles:[{name:'X',type:'number'},{name:'Y',type:'number'},{name:'Date',type:'date'}] as never});
        const method={method:'pearson_correlation',x:'X',y:'Y',where:{predicates:[{column:'Date',operator:'gte',value:'2026-10-01'},{column:'Date',operator:'lt',value:'2026-11-01'}]},missingPolicy:'pairwise_complete',seed:'none'};
        let step=0;
        try{
            const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:{intent:'data_query',taskSignal:'statistical',expectedOutput:'scalar_answer',referencedColumns:['X','Y'],groupingColumns:[],aggregationFunctions:[],
                timeScope:{kind:'explicit',value:'October 2026'},unresolvedReferences:[],requestedComputationScope:method} as never},s.store,scripted(context=>{
                if(step++===0)return tool('workspace_write',{path:programPath,content:PEARSON_QUALIFICATION_PROGRAM,expectedRevision:0});
                if(step===2)return tool('code_run',{...runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)),mode:'whole_table',tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}]});
                if(step===3)return tool('computation_validate',{jobId:observed(context).at(-1).receipt.jobId});
                return reply();
            }));finishRun(s.root,s.lease);expect(result.status,result.text).toBe('completed');
            const exported=await buildTaskExport(s.root,s.task.snapshot.taskId),files=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
            expect(JSON.parse(strFromU8(files['evidence/computation-0.json']))).toMatchObject({coefficient:1,n:3,scopedRows:4,excluded:1});
            expect(manifest.evidence.computations[0]).toMatchObject({methodVersion:1,seed:'none',reference:'host-centered-pearson-v1',coverage:{scopedRows:4,completePairs:3,excluded:1}});
            expect(manifest.evidence.computations[0].executionId).toBe(manifest.executions[0].jobId);
        }finally{beginSessionTransition(s.root);}
    });
    it('exports typed data, CSV and immutable exact program bytes that reconcile independently',async()=>{
        const s=await completedExportFixture();
        try{
            const result=await buildTaskExport(s.root,s.task.snapshot.taskId),files=unzipSync(result.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
            const json=JSON.parse(strFromU8(files['executions/0/output.json']));
            const csv=parse<Record<string,unknown>>(strFromU8(files['executions/0/table.csv']),{header:true,dynamicTyping:true});
            expect(csv.errors).toEqual([]);expect(csv.data).toEqual(s.rows);expect(json).toEqual(s.rows);
            expect(json.reduce((n:number,r:CsvRow)=>n+Number(r.Amount),0)).toBe(7);
            expect(strFromU8(files['executions/0/program.js'])).toBe('return input.facts.rows;');
            expect(manifest.executions[0].schema).toMatchObject({shape:'array',rowCount:2});
            expect(manifest.executions[0].environmentDigest).toMatch(/^[a-f0-9]{64}$/);
            expect(manifest.executions[0]).not.toHaveProperty('grant');
            expect(manifest.retention.automaticPersistence).toBe(false);
            expect(inspectTaskExport(s.root,s.task.snapshot.taskId).available).toBe(true);
            const copied={...s.root.getState(),activeAgentTask:structuredClone(s.task.snapshot)};
            const copy:StoreApi={getState:()=>copied,setState(){}};
            expect(inspectTaskExport(copy,s.task.snapshot.taskId)).toMatchObject({available:false,reason:'task_export_custody_unavailable'});
            await expect(buildTaskExport(copy,s.task.snapshot.taskId)).rejects.toThrow('task_export_custody_unavailable');
            s.root.setState({activeAgentTask:{...s.task.snapshot,revision:99}});
            await expect(buildTaskExport(s.root,s.task.snapshot.taskId)).rejects.toThrow('task_export_requires_current_completed_task');
        }finally{beginSessionTransition(s.root);}
    });
    it('revokes an in-flight export after a same-ID session replacement during digest verification',async()=>{
        const s=await completedExportFixture();let release!:()=>void;
        const gate=new Promise<void>(resolve=>{release=resolve;}),original=crypto.subtle.digest.bind(crypto.subtle);
        const hash=vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate;return original(...args);});
        try{
            const download=buildTaskExport(s.root,s.task.snapshot.taskId);
            beginSessionTransition(s.root);release();
            await expect(download).rejects.toThrow('task_export_custody_unavailable');
        }finally{hash.mockRestore();beginSessionTransition(s.root);}
    });
    it.each(['whole_table','stateful_stream'] as const)('runs %s through actual Pi discovery, SDK schema and current-table grants',async mode=>{
        const rows=Array.from({length:5001},(_,i)=>({Amount:i===5000?-5:1}));
        const s=await fixture(realGuest,undefined,rows);let step=0,program:ReturnType<typeof artifactRef>;
        try{const result=await runPiFollowUpTurn({message:s.message},s.store,scripted(context=>{
            if(step++===0)return tool('workspace_write',{path:programPath,content:mode==='whole_table'?`return {count:input.facts.rows.length,total:input.facts.rows.reduce((s,r)=>s+r.Amount,0)};`:
                `const state=(input.stream.state||0)+input.facts.rows.reduce((s,r)=>s+r.Amount,0);return {state,rows:input.stream.phase==='finish'?[{total:state}]:[]};`,expectedRevision:0});
            if(step===2){program=artifactRef(observed(context).at(-1).payload.workspace.artifact);return tool('code_run',{...runArgs(program),mode,
                tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}],...(mode==='stateful_stream'?{stream:{table:'facts',batchRows:5000,partitionBy:[],initialState:null}}:{})});}
            return reply();
        }));
        expect(result.status).toBe('completed');expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
        const output=JSON.parse(s.store.codeExecution!.workspace.read(outputPath).content);
        expect(output).toEqual(mode==='whole_table'?{count:5001,total:4995}:[{total:4995}]);
        finishRun(s.root,s.lease);
        const exported=await buildTaskExport(s.root,s.task.snapshot.taskId);
        const files=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
        expect(JSON.parse(strFromU8(files['executions/0/output.json']))).toEqual(output);
        expect(manifest.executions[0].coverage[0]).toMatchObject({complete:true,rowCount:5001,deliveredRows:5001});
        expect(manifest.evidence.status).toBe('unvalidated_artifact');
        expect(manifest.answerComplete).toBe(false);
        expect(manifest.files.some((f:{path:string})=>f.path==='executions/0/program.js')).toBe(true);
        for(const file of manifest.files) expect(createHash('sha256').update(files[file.path]).digest('hex')).toBe(file.sha256);
        expect(manifest.executions[0].output.sha256).toBe(createHash('sha256').update(files['executions/0/output.json']).digest('hex'));
        const now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now+8*24*60*60*1000);
        expect(inspectTaskExport(s.root,s.task.snapshot.taskId)).toMatchObject({available:false,reason:'task_export_expired'});clock.mockRestore();
        const version=s.root.getState().datasetBundle!.datasetVersion;
        s.root.setState({datasetBundle:{...s.root.getState().datasetBundle!,relationshipSetId:'changed'}});
        expect(inspectTaskExport(s.root,s.task.snapshot.taskId).available).toBe(false);
        s.root.setState({datasetBundle:{...s.root.getState().datasetBundle!,relationshipSetId:'rel',datasetVersion:version}});
        beginSessionTransition(s.root);
        expect(inspectTaskExport(s.root,s.task.snapshot.taskId).available).toBe(false);
        expect(s.task.snapshot.budget.used.transformationAttempts).toBe(1);expect(s.root.getState().csvData!.data).toEqual(rows);
        }finally{s.task.close('cancelled');finishRun(s.root,s.lease);}
    });
    it('discovers governed coding tools only with a host logical task', async () => {
        let state = { sessionId: 'coding', settings: { provider: 'default', runtimeAccessControl: { permissionMode: 'open' } },
            csvData: { fileName: 'synthetic.csv', data: [] }, analysisCards: [], columnProfiles: [], chatHistory: [] } as unknown as ReturnType<StoreApi['getState']>;
        const root: StoreApi = { getState: () => state, setState: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; } };
        const lease = beginRun(root, 'follow_up', 'run', 'turn');
        const store = scopeRunStore(root, lease);
        expect(createPiAppTools(store, null).some(tool => tool.name === 'code_run')).toBe(false);
        const { preparePiTask } = await import('../services/agent/runtime/pi/piCodingTask');
        await preparePiTask(store, 'Write a JavaScript program and stage its output.');
        expect(createPiAppTools(store, null).map(tool => tool.name)).toContain('code_run');
        store.piTask?.close('completed'); finishRun(root, lease);
    });
});

describe('actual Pi coding loop', () => {
    it('keeps failed meaning repairable before code execution locks the contract',async()=>{
        const s=await fixture(realGuest,undefined,[{Name:'Fact',Amount:1}]);let step=0,candidateId='';
        const proposal={input:{kind:'table',name:'input',tableId:s.root.getState().datasetBundle!.primaryTableId},table:{name:'facts',grain:['Name'],groupBy:[],
            columns:[{name:'Name',sourceColumn:'Name',dataType:'string',nullable:false,conversion:'identity'},
                {name:'Amount',sourceColumn:'Amount',dataType:'number',nullable:false,conversion:'identity'}],detailRanges:[{start:0,end:0}]},exclusions:[],assumptions:['Each named source row is one fact.']};
        const program="const rows=input.input.rows;return {schemaVersion:1,complete:true,tables:[{name:'facts',role:'fact',schema:[{name:'Name',dataType:'string',nullable:false},{name:'Amount',dataType:'number',nullable:false}],rowCount:rows.length,rows,lineage:rows.flatMap((r,row)=>Object.keys(r).map(column=>({row,column,origins:[{kind:'table',name:'input',row,column}]})))}],relationships:[],excludedRows:[]};";
        try{
            const result=await runPiFollowUpTurn({message:s.message},s.store,scripted(context=>{
                const last=observed(context).at(-1);
                switch(step++){
                    case 0:return tool('candidate_infer_meaning',{...proposal,table:{...proposal.table,detailRanges:[{start:1,end:1}]}});
                    case 1:return tool('workspace_write',{path:programPath,expectedRevision:0,content:'return {ok:true};'});
                    case 2:return tool('code_run',{...runArgs(artifactRef(last.payload.workspace.artifact)),tables:[{name:'input',tableId:proposal.input.tableId}]});
                    case 3:expect(JSON.stringify(last)).toContain('candidate_meaning_required_before_execution');return tool('candidate_infer_meaning',proposal);
                    case 4:expect(last.status).toBe('success');expect(last.payload.requirements.inference.input).toEqual(proposal.input);return tool('workspace_write',{path:programPath,expectedRevision:1,content:program});
                    case 5:return tool('code_run',{...runArgs(artifactRef(last.payload.workspace.artifact)),tables:[{name:'input',tableId:proposal.input.tableId}]});
                    case 6:expect(last.receipt.status).toBe('succeeded');return tool('candidate_stage',{jobId:last.receipt.jobId});
                    case 7:candidateId=last.payload.candidate.candidateId;return tool('candidate_validate',{candidateId});
                    case 8:expect(last.payload.candidateValidation.decision).toBe('validated');return tool('candidate_request_approval',{candidateId,primaryTable:'facts'});
                    default:throw new Error('Unexpected extra provider turn');
                }
            }));
            expect(result.status,result.text).toBe('blocked');expect(s.root.getState().pendingClarification?.resumeContext?.piCandidateApproval).toBeDefined();
            expect(s.task.snapshot.budget.used.transformationAttempts).toBe(2);expect(s.root.getState().csvData!.data).toEqual([{Name:'Fact',Amount:1}]);
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['validated','inspection','count-revision','wrong-value','wrong-total','wrong-filter','unvalidated','zero','zero-weights','mixed-units','negative-weight','fractional-weight','untyped-weight','stateful','boundary','stale-version'] as const)
        ('admits lower weighted median from the current full scope only: %s',async mode=>{
        const rows:CsvRow[]=mode==='boundary'?[...Array.from({length:5000},()=>({Amount:0,Quantity:1,Unit:'SGD',Date:'2026-10-01'})),{Amount:99,Quantity:5001,Unit:'SGD',Date:'2026-10-31'}]
            :[{Amount:-5,Quantity:2,Unit:'SGD',Date:mode==='zero'?'2026-09-01':'2026-10-01'},
                {Amount:0,Quantity:2,Unit:mode==='mixed-units'?'USD':'SGD',Date:mode==='zero'?'2026-09-01':'2026-10-31'},
                {Amount:99,Quantity:100,Unit:'SGD',Date:'2026-09-30'},
                {Amount:null,Quantity:1,Unit:'SGD',Date:'2026-10-02'},
                {Amount:42,Quantity:0,Unit:'SGD',Date:'2026-10-03'}];
        if(mode==='zero-weights')rows.forEach(r=>r.Quantity=0);
        if(mode==='negative-weight')rows[0].Quantity=-1;if(mode==='fractional-weight')rows[0].Quantity=0.5;
        if(mode==='untyped-weight')rows[0].Quantity='2';
        if(mode==='count-revision')rows.push({Amount:7,Quantity:1,Unit:'SGD',Date:'2026-09-29'});
        const s=await fixture(realGuest,'Calculate the lower weighted median Amount weighted by Quantity for October 2026 only.',rows);
        s.root.setState({columnProfiles:[{name:'Amount',type:'number'},{name:'Quantity',type:'number'},{name:'Unit',type:'string'},{name:'Date',type:'date'}] as never});
        const artifact={taskSignal:'statistical',expectedOutput:'scalar_answer',timeScope:{kind:'explicit',value:'October 2026'},referencedColumns:['Amount','Quantity'],unresolvedReferences:[],
            groupingColumns:[],aggregationFunctions:[],subjectRefs:[],comparisonScope:{kind:'none'},
            requestedComputationScope:{method:'lower_weighted_median',value:'Amount',weight:'Quantity',unitColumn:'Unit',missingPolicy:'pairwise_complete',weightPolicy:'nonnegative_integer_frequency',seed:'none',
                where:{predicates:[{column:'Date',operator:'gte',value:'2026-10-01'},{column:'Date',operator:'lt',value:'2026-11-01'}]}}};
        const body=`const all=ROWS;const rows=all.filter(r=>${mode==='wrong-filter'?'true':"r.Date>='2026-10-01'&&r.Date<'2026-11-01'"});
            const missing=v=>v===null||v===undefined||v==='';const complete=rows.filter(r=>!missing(r.Amount)&&!missing(r.Quantity));
            const positive=complete.filter(r=>r.Quantity>0).sort((a,b)=>a.Amount-b.Amount);const totalWeight=positive.reduce((s,r)=>s+r.Quantity,0);
            let cumulative=0,median=null;for(const row of positive){cumulative+=row.Quantity;if(2*cumulative>=totalWeight){median=row.Amount;break;}}
            const result={method:'lower_weighted_median',methodVersion:1,seed:'none',scopedRows:rows.length,n:positive.length,excluded:rows.length-complete.length,
                zeroWeightRows:complete.filter(r=>r.Quantity===0).length,totalWeight:${mode==='wrong-total'?'1':'totalWeight'},median:${mode==='wrong-value'?'999':'median'},unit:positive.length?positive[0].Unit:null};`;
        const program=mode==='stateful'?`const state=input.stream.state||{all:[]};state.all.push(...input.facts.rows);if(input.stream.phase!=='finish')return {state,rows:[]};${body.replace('ROWS','state.all')}return {state,rows:[result]};`
            :`${body.replace('ROWS','input.facts.rows')}return result;`;
        let step=0,job='';
        try{
            const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact as never,intentFindings:{intent:'precise_card'} as never},s.store,scripted(context=>{
                if(mode==='inspection'&&step<4){step++;return tool('workspace_list',{path:'/intake',recursive:true});}
                const stage=step++-(mode==='inspection'?4:0);
                if(stage===0)return tool('workspace_write',{path:programPath,expectedRevision:0,content:mode==='count-revision'
                    ?program.replace('return result;','result.scopedRows=rows;result.excluded=all.length-rows.length;return result;'):program});
                if(stage===1)return tool('code_run',{...runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)),tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}],
                    mode:mode==='stateful'?'stateful_stream':'whole_table',...(mode==='stateful'?{stream:{table:'facts',batchRows:2,partitionBy:[],initialState:null}}:{})});
                if(stage===2&&mode!=='unvalidated'){job=observed(context).at(-1).receipt.jobId;return tool('computation_validate',{jobId:job});}
                if(mode==='count-revision'&&stage===3){
                    const failure=observed(context).at(-1);expect(failure.message).toContain('[scopedRows, excluded]');
                    expect(failure.taskPlan.phase).toBe('compute_program');expect(failure.taskPlan.remainingTransformations).toBeGreaterThan(2);
                    return tool('workspace_write',{path:programPath,expectedRevision:1,content:program});
                }
                if(mode==='count-revision'&&stage===4){const args=runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact));
                    return tool('code_run',{...args,output:{...args.output,expectedRevision:1},tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}]});}
                if(mode==='count-revision'&&stage===5){job=observed(context).at(-1).receipt.jobId;return tool('computation_validate',{jobId:job});}
                if(mode==='untyped-weight'){expect(observed(context).at(-1).retryHint).toContain('Converting local computation variables does not repair');expect(s.root.getState().csvData!.data[0].Quantity).toBe('2');}
                if(mode==='stale-version')s.root.setState({datasetBundle:{...s.root.getState().datasetBundle!,relationshipSetId:'replaced-after-validation'}});
                return reply();
            }));
            const accepted=['validated','inspection','count-revision','zero','zero-weights','stateful','boundary'].includes(mode);
            expect(result.status,result.text).toBe(accepted?'completed':'blocked');expect(result.text).not.toContain('Fabricated stdout');
            if(accepted){
                if(mode==='inspection')expect(s.task.snapshot.budget).toMatchObject({used:{toolCalls:7,providerTurns:8,transformationAttempts:1}});
                expect(result.text).toContain(`execution ${job}`);
                if(['validated','stateful'].includes(mode)){expect(result.text).toContain('Lower weighted median (Amount): -5');expect(result.text).toContain('Unit label: SGD');}
                if(mode==='boundary')expect(result.text).toContain('Lower weighted median (Amount): 99');
                finishRun(s.root,s.lease);
                const exported=await buildTaskExport(s.root,s.task.snapshot.taskId),zip=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(zip['manifest.json']));
                expect(manifest.answerComplete).toBe(true);expect(manifest.evidence.computations[0].reference).toBe('host-lower-frequency-median-v1');
                expect(manifest.evidence.computations[0].grain).toBe('positive_frequency_value_pairs');
            }
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['complete','scope-only','bad-then-good'] as const)('repairs the typed filter scope under the same task budget: %s',async mode=>{
        const message='Calculate quantity-weighted mean Amount over the entire input.',rows:CsvRow[]=[{Amount:0,Quantity:1,Unit:'SGD'},{Amount:-5,Quantity:2,Unit:'SGD'},{Amount:10,Quantity:3,Unit:'SGD'}];
        const s=await fixture(realGuest,message,rows);
        s.root.setState({columnProfiles:[{name:'Amount',type:'number'},{name:'Quantity',type:'number'},{name:'Unit',type:'string'}] as never});
        const artifact={taskSignal:'statistical',expectedOutput:'scalar_answer',timeScope:{kind:'none'},referencedColumns:['Amount','Quantity'],unresolvedReferences:[],
            groupingColumns:[],aggregationFunctions:[],subjectRefs:[],comparisonScope:{kind:'none'},filterDescription:'Entire input after repair and preservation of all records.',
            requestedComputationScope:{method:'weighted_mean',value:'Amount',weight:'Quantity',unitColumn:'Unit',missingPolicy:'pairwise_complete',weightPolicy:'nonnegative_integer_frequency',seed:'none',where:{predicates:[]}}};
        let step=0,revision=0;
        try{
            const result=await runPiFollowUpTurn({message,queryUnderstandingArtifact:artifact as never},s.store,scripted(context=>{
                if(mode==='bad-then-good'&&step++===0)return tool('task_scope_repair',{population:'filtered',goalQuote:'entire input',where:{predicates:[{column:'Missing',operator:'eq',value:1}]}});
                const stage=mode==='bad-then-good'?step-2:step++;
                if(stage===0)return tool('task_scope_repair',{population:'entire_input',goalQuote:'entire input'});
                if(mode==='scope-only')return reply();
                if(stage===1){const last=observed(context).at(-1);expect(last.status).toBe('success');expect(last.payload.answerEvidence).toBe(false);
                    expect(last.taskPlan.phase).toBe('compute_program');revision=last.taskPlan.taskRevision;
                    return tool('workspace_write',{path:programPath,expectedRevision:0,content:"const rows=input.facts.rows;let num=0n,den=0n;for(const r of rows){num+=BigInt(r.Amount)*BigInt(r.Quantity);den+=BigInt(r.Quantity);}return {method:'weighted_mean',methodVersion:1,seed:'none',scopedRows:rows.length,n:rows.length,excluded:0,zeroWeightRows:0,numerator:String(num),denominator:String(den),mean:Number(num)/Number(den),unit:'SGD'};"});}
                if(stage===2)return tool('code_run',{...runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)),tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}],mode:'whole_table'});
                if(stage===3)return tool('computation_validate',{jobId:observed(context).at(-1).receipt.jobId});
                return reply();
            }));
            expect(result.status,result.text).toBe(mode==='scope-only'?'blocked':'completed');
            if(mode!=='scope-only'){expect(result.text).toContain('Exact numerator: 20; denominator: 6');expect(s.task.snapshot.revision).toBe(revision);
                expect(s.task.snapshot.budget.used).toMatchObject({toolCalls:mode==='bad-then-good'?5:4,transformationAttempts:1});}
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it('retains the two-proposal limit across a fresh lease and refuses stale input publication',async()=>{
        const s=await fixture(realGuest,'Calculate weighted mean Amount over the entire input.',[{Amount:1,Quantity:1}]);
        const artifact={taskSignal:'statistical',expectedOutput:'scalar_answer',timeScope:{kind:'none'},referencedColumns:['Amount','Quantity'],unresolvedReferences:[],groupingColumns:[],aggregationFunctions:[],subjectRefs:[],comparisonScope:{kind:'none'},
            filterDescription:'Entire input',requestedComputationScope:{method:'weighted_mean',value:'Amount',weight:'Quantity',missingPolicy:'pairwise_complete',weightPolicy:'nonnegative_integer_frequency',seed:'none'}};
        const original=resolveAnswerScope(s.message,artifact as never,undefined,s.store);await s.task.resolveScope(original);
        const fail=()=>{throw new Error('scope_repair_proposal_invalid');};
        let fresh:ReturnType<typeof beginRun>|undefined;
        try{
            await s.task.beforeTool('task.scope.repair',{},'attempt-1');await expect(s.task.repairScope(fail)).rejects.toThrow('scope_repair_proposal_invalid');
            expect(s.task.plan.scopeRepair?.remainingProposals).toBe(1);
            const scopeDigest=s.task.snapshot.scope.digest;
            let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),originalHash=crypto.subtle.digest.bind(crypto.subtle);
            const hash=vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{await gate;return originalHash(...args);});
            const valid=resolveComputationScopeRepair({message:s.message,artifact:artifact as never},{population:'entire_input',goalQuote:'entire input'},s.store);
            const pending=s.task.repairScope(()=>valid);s.root.setState({datasetBundle:{...s.root.getState().datasetBundle!,relationshipSetId:'stale'}});release();
            await expect(pending).rejects.toThrow('input_version_changed');hash.mockRestore();expect(s.task.snapshot.scope.digest).toBe(scopeDigest);
            // Scope attempts survive continuation; the original task budget never resets.
            const request=s.task.suspend({question:'Review the unresolved scope.',options:[{label:'Review',value:'review'}]} as never);
            finishRun(s.root,s.lease);fresh=beginRun(s.root,'follow_up',crypto.randomUUID(),crypto.randomUUID());const resumed=scopeRunStore(s.root,fresh);
            const task=await preparePiTask(resumed,s.message,request.resumeContext!.piTaskContinuation,realGuest);
            await expect(task.repairScope(fail)).rejects.toThrow('scope_repair_attempts_exhausted');expect(task.snapshot.taskId).toBe(s.task.snapshot.taskId);
            expect(task.snapshot.budget.used.toolCalls).toBe(1);expect(task.plan.scopeRepair?.remainingProposals).toBe(0);
        }finally{if(fresh)finishRun(s.root,fresh);else finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it('blocks writes/guest execution while scope is unresolved without spending a transformation',async()=>{
        const s=await fixture(realGuest,'Calculate weighted mean Amount over the entire input.',[{Amount:1,Quantity:1}]);
        const artifact={taskSignal:'statistical',expectedOutput:'scalar_answer',timeScope:{kind:'none'},referencedColumns:['Amount','Quantity'],unresolvedReferences:[],groupingColumns:[],aggregationFunctions:[],subjectRefs:[],comparisonScope:{kind:'none'},
            filterDescription:'Entire input',requestedComputationScope:{method:'weighted_mean',value:'Amount',weight:'Quantity',missingPolicy:'pairwise_complete',weightPolicy:'nonnegative_integer_frequency',seed:'none'}};
        let step=0;
        try{const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact as never},s.store,scripted(()=>step++===0
            ?tool('workspace_write',{path:programPath,expectedRevision:0,content:'return 999;'}):reply()));
            expect(result.status).toBe('blocked');expect(s.task.snapshot.budget.used).toMatchObject({toolCalls:1,transformationAttempts:0});
            expect(()=>s.store.codeExecution!.workspace.read(programPath)).toThrow();
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['valid','numeric-sums','reduced','wrong-filter','fractional-value','unvalidated','stateful','stale-version'] as const)('admits exact integer weighted mean through real QuickJS: %s',async mode=>{
        const rows:CsvRow[]=[{Amount:-5,Quantity:2,Unit:'SGD',Date:'2026-10-01'},{Amount:0,Quantity:2,Unit:'SGD',Date:'2026-10-31'},
            {Amount:99,Quantity:100,Unit:'SGD',Date:'2026-09-30'},{Amount:null,Quantity:1,Unit:'SGD',Date:'2026-10-02'},{Amount:42,Quantity:0,Unit:'SGD',Date:'2026-10-03'}];
        if(mode==='fractional-value')rows[0].Amount=0.5;
        const s=await fixture(realGuest,'Calculate the quantity-weighted mean Amount for October 2026 only.',rows);
        s.root.setState({columnProfiles:[{name:'Amount',type:'number'},{name:'Quantity',type:'number'},{name:'Unit',type:'string'},{name:'Date',type:'date'}] as never});
        const artifact={taskSignal:'statistical',expectedOutput:'scalar_answer',timeScope:{kind:'explicit',value:'October 2026'},referencedColumns:['Amount','Quantity'],unresolvedReferences:[],
            groupingColumns:[],aggregationFunctions:[],subjectRefs:[],comparisonScope:{kind:'none'},requestedComputationScope:{method:'weighted_mean',value:'Amount',weight:'Quantity',unitColumn:'Unit',
                missingPolicy:'pairwise_complete',weightPolicy:'nonnegative_integer_frequency',seed:'none',where:{predicates:[{column:'Date',operator:'gte',value:'2026-10-01'},{column:'Date',operator:'lt',value:'2026-11-01'}]}}};
        const body=`const rows=ROWS.filter(r=>${mode==='wrong-filter'?'true':"r.Date>='2026-10-01'&&r.Date<'2026-11-01'"});
            const missing=v=>v===null||v===undefined||v==='';let n=0,excluded=0,zeroWeightRows=0,num=0n,den=0n,unit=null;
            for(const r of rows){if(missing(r.Amount)||missing(r.Quantity)){excluded++;continue;}if(r.Quantity===0){zeroWeightRows++;continue;}num+=BigInt(r.Amount)*BigInt(r.Quantity);den+=BigInt(r.Quantity);n++;unit=r.Unit;}
            const result={method:'weighted_mean',methodVersion:1,seed:'none',scopedRows:rows.length,n,excluded,zeroWeightRows,
                numerator:${mode==='numeric-sums'?'Number(num)':mode==='reduced'?"'-5'":'String(num)'},denominator:${mode==='reduced'?"'2'":'String(den)'},mean:den===0n?null:Number(num)/Number(den),unit};`;
        const program=mode==='stateful'?`const state=input.stream.state||{all:[]};state.all.push(...input.facts.rows);if(input.stream.phase!=='finish')return {state,rows:[]};${body.replace('ROWS','state.all')}return {state,rows:[result]};`
            :`${body.replace('ROWS','input.facts.rows')}return result;`;
        let step=0;
        try{
            const result=await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact as never},s.store,scripted(context=>{
                if(step++===0)return tool('workspace_write',{path:programPath,expectedRevision:0,content:program});
                if(step===2)return tool('code_run',{...runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)),tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}],
                    mode:mode==='stateful'?'stateful_stream':'whole_table',...(mode==='stateful'?{stream:{table:'facts',batchRows:2,partitionBy:[],initialState:null}}:{})});
                if(step===3&&mode!=='unvalidated')return tool('computation_validate',{jobId:observed(context).at(-1).receipt.jobId});
                if(mode==='stale-version')s.root.setState({datasetBundle:{...s.root.getState().datasetBundle!,relationshipSetId:'changed'}});
                return reply();
            }));
            const accepted=mode==='valid'||mode==='stateful';expect(result.status,result.text).toBe(accepted?'completed':'blocked');
            if(accepted){
                expect(result.text).toContain('Exact numerator: -10; denominator: 4 (unreduced)');expect(result.text).toContain('Unit label: SGD');
                finishRun(s.root,s.lease);
                const exported=await buildTaskExport(s.root,s.task.snapshot.taskId),zip=unzipSync(exported.bytes),manifest=JSON.parse(strFromU8(zip['manifest.json']));
                expect(manifest.answerComplete).toBe(true);expect(manifest.evidence.computations[0]).toMatchObject({reference:'host-integer-frequency-mean-v1',coverage:{numerator:'-10',denominator:'4',completePairs:2,excluded:1,zeroWeightRows:1}});
                expect(JSON.parse(strFromU8(zip['evidence/computation-0.json']))).toMatchObject({numerator:'-10',denominator:'4',mean:-2.5});
            }
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
    });
    it.each(['validated','wrong-value','unvalidated'] as const)('admits computation only after independent reference: %s', async mode => {
        const s = await fixture(realGuest, 'Calculate Pearson correlation between Amount and Other in this dataset.',
            [{Amount:1,Other:2},{Amount:2,Other:4},{Amount:3,Other:6},{Amount:4,Other:null}]);
        s.root.setState({columnProfiles:[{name:'Amount',type:'number'},{name:'Other',type:'number'}] as never});
        const artifact = {referencedColumns:['Amount','Other'],groupingColumns:[],aggregationFunctions:[],subjectRefs:[],comparisonScope:{kind:'none'},taskSignal:'statistical',expectedOutput:'scalar_answer',timeScope:{kind:'none'},unresolvedReferences:[],
            requestedComputationScope:{method:'pearson_correlation',x:'Amount',y:'Other',missingPolicy:'pairwise_complete',seed:'none'}};
        let step=0,job='';
        const result = await runPiFollowUpTurn({message:s.message,queryUnderstandingArtifact:artifact as never},s.store,scripted(context=>{
            if(step++===0)return tool('workspace_write',{path:programPath,expectedRevision:0,
                content:`console.log('fake stdout 999');return {method:'pearson_correlation',methodVersion:1,seed:'none',scopedRows:4,n:3,excluded:1,coefficient:${mode==='wrong-value'?0:1}};`});
            if(step===2)return tool('code_run',{...runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)),tables:[{name:'facts',tableId:s.root.getState().datasetBundle!.primaryTableId}],mode:'whole_table'});
            if(step===3&&mode!=='unvalidated'){job=observed(context).at(-1).receipt.jobId;return tool('computation_validate',{jobId:job});}
            return reply();
        }));
        expect(result.status,result.text).toBe(mode==='validated'?'completed':'blocked');
        expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
        expect(result.text).not.toContain('fake stdout 999');
        if(mode==='validated'){expect(result.text).toContain('1.000000');expect(result.text).toContain('Complete pairs: 3');expect(result.text).toContain(`execution ${job}`);}
        finishRun(s.root,s.lease);
    });
    it('loads a skill, inspects, writes, receives a real failure, patches and reruns without trusting provider claims', async () => {
        const s = await fixture(); let step = 0; let program!: ReturnType<typeof artifactRef>; let failure: any, output: any;
        const stream = scripted(context => {
            const results = observed(context);
            switch (step++) {
                case 0: return tool('read_skill', {name: 'novel'});
                case 1: return tool('workspace_list', {path: '/', recursive: true});
                case 2: return tool('workspace_write', {path: programPath, content: 'throw new TypeError("missing column");', expectedRevision: 0});
                case 3: program = artifactRef(results.at(-1).payload.workspace.artifact); return tool('code_run', runArgs(program));
                case 4: failure = results.at(-1).receipt; return tool('workspace_replace', {path: programPath,
                    oldText: 'throw new TypeError("missing column");', newText: 'console.log("repaired"); return {ok: true};', expectedRevision: 1});
                case 5: program = artifactRef(results.at(-1).payload.workspace.artifact); return tool('code_run', runArgs(program));
                case 6: output = results.at(-1).receipt; return reply();
                default: throw new Error('Unexpected extra provider turn');
            }
        });
        const result = await runPiFollowUpTurn({message: s.message}, s.store, stream); finishRun(s.root, s.lease);
        expect(failure, JSON.stringify(result)).toMatchObject({status: 'failed', error: {name: 'TypeError', message: 'missing column'}});
        expect(output).toMatchObject({status: 'succeeded', stdout: 'repaired\n', program: {revision: 2}, output: {revision: 1}});
        expect(output.toolCallId).not.toBe(failure.toolCallId);
        expect(result.status).toBe('completed'); expect(result.text).toContain(output.jobId); expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
        expect(s.task.snapshot.budget.used).toMatchObject({skillReads: 1, toolCalls: 5, transformationAttempts: 2, providerTurns: 7});
        const references = Object.entries(s.root.getState().workspaceFiles).find(([path]) => path.startsWith('/workspace/task-artifacts/'))![1];
        expect(JSON.parse(references).execution).toMatchObject({jobId: output.jobId, output: {path: outputPath, revision: 1}});
        expect(references).not.toContain('stdout'); expect(references).not.toContain('"content"');
        expect(s.root.getState().csvData!.data).toEqual([{ Amount: 10 }]); expect(s.root.getState().isBusy).toBe(false);
    });
    it('blocks fabricated success after real execution failure', async () => {
        const s = await fixture(); let step = 0;
        const result = await runPiFollowUpTurn({message: s.message}, s.store, scripted(context => {
            if (step++ === 0) return tool('workspace_write', {path: programPath, content: 'throw new Error("bad input");', expectedRevision: 0});
            if (step === 2) return tool('code_run', runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)));
            return reply();
        })); finishRun(s.root, s.lease);
        expect(result.status, result.text).toBe('blocked'); expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
        expect(inspectTaskExport(s.root,s.task.snapshot.taskId).available).toBe(false);
        expect(s.task.snapshot.budget.used.transformationAttempts).toBe(1);
    });
    it('does not use successful code stdout as October query evidence', async () => {
        const s = await fixture(realGuest, 'What is the October total?'); let step = 0;
        const result = await runPiFollowUpTurn({message: s.message}, s.store, scripted(context => {
            if (step++ === 0) return tool('workspace_write', {path: programPath, content: 'console.log("999"); return 999;', expectedRevision: 0});
            if (step === 2) return tool('code_run', runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)));
            return reply();
        })); finishRun(s.root, s.lease);
        expect(result.status, result.text).toBe('blocked'); expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.'); expect(s.root.getState().activeDataQuery).toBeNull();
    });
    it('retains failure history, namespace and counters through actual clarification suspension and a fresh lease', async () => {
        const s = await fixture(); let step = 0; let program!: ReturnType<typeof artifactRef>;
        const first = await runPiFollowUpTurn({message: s.message}, s.store, scripted(context => {
            if (step++ === 0) return tool('workspace_write', {path: programPath, content: 'throw new Error("same error");', expectedRevision: 0});
            if (step === 2) { program = artifactRef(observed(context).at(-1).payload.workspace.artifact); return tool('code_run', runArgs(program)); }
            return tool('conversation_request_clarification', {question: 'Which replacement should the program use?', options: [{label: 'Zero', value: '0'}, {label: 'One', value: '1'}]});
        })); finishRun(s.root, s.lease);
        expect(first.status, first.text).toBe('blocked'); expect(s.task.snapshot.status).toBe('awaiting_clarification');
        const prior = s.task.snapshot.budget.used, continuation = s.root.getState().pendingClarification!.resumeContext!.piTaskContinuation!;
        const lease = beginRun(s.root, 'follow_up', 'resume-run', 'resume-turn'), store = scopeRunStore(s.root, lease);
        const resumed = await preparePiTask(store, s.message, continuation, realGuest);
        expect(resumed.snapshot.taskId).toBe(s.task.snapshot.taskId); expect(resumed.snapshot.budget.used).toEqual(prior);
        expect(store.codeExecution!.workspace.read(programPath).sha256).toBe(program.sha256);
        finishRun(s.root, lease);
    });
    it('rejects output after editing a successfully executed program without rerunning', async () => {
        const s = await fixture(); let step = 0;
        const result = await runPiFollowUpTurn({message: s.message}, s.store, scripted(context => {
            if (step++ === 0) return tool('workspace_write', {path: programPath, content: 'return 42;', expectedRevision: 0});
            if (step === 2) return tool('code_run', runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)));
            if (step === 3) return tool('workspace_write', {path: programPath, content: 'return 999;', expectedRevision: 1});
            return reply();
        })); finishRun(s.root, s.lease);
        expect(result.status).toBe('blocked'); expect(result.text).not.toContain('Fabricated stdout: 999; everything completed.');
    });
    it('allows ordinary conversation without a query or program', async () => {
        const s = await fixture(realGuest, 'Hello, explain how the app works.');
        const result = await runPiFollowUpTurn({message: s.message}, s.store, scripted(() => reply('Use workspace tools to inspect a file.')));
        finishRun(s.root, s.lease);
        expect(result.status).toBe('completed'); expect(s.task.snapshot.budget.used.transformationAttempts).toBe(0);
    });
});

const deferredGuest = () => {
    let enter!: () => void, resolve!: (value: Awaited<ReturnType<typeof realGuest.run>>) => void;
    const started = new Promise<void>(done => { enter = done; });
    const guest: typeof realGuest = { run: (_code, _json, options) => { options.onStarted?.(); enter(); return new Promise(done => { resolve = done; }); }, cancel() {}, dispose() {} };
    return { guest, started, complete: () => resolve({generation: 1, status: 'completed', code: 'guest_completed', outputJson: '999'}) };
};
describe('coding ownership and budgets', () => {
    it.each(['stop', 'session'] as const)('fences deferred execution after %s while allowing a new Pi run', async change => {
        const d = deferredGuest(), s = await fixture(d.guest); let step = 0;
        const old = runPiFollowUpTurn({message: s.message}, s.store, scripted(context => {
            if (step++ === 0) return tool('workspace_write', {path: programPath, content: 'return 999;', expectedRevision: 0});
            return tool('code_run', runArgs(artifactRef(observed(context).at(-1).payload.workspace.artifact)));
        })); await d.started;
        if (change === 'session') { beginSessionTransition(s.root); s.root.setState({sessionId: 'replacement', isBusy: false, workspaceFiles: {}}); }
        else cancelOwnedRun(s.root);
        expect((await old).status).toBe('cancelled'); finishRun(s.root, s.lease);
        let release!: () => void, entered!: () => void;
        const started = new Promise<void>(done => { entered = done; });
        const next = runPiFollowUpTurn({message: 'Hello'}, s.root, (model) => {
            const stream = createAssistantMessageEventStream();
            const message: AssistantMessage = { role: 'assistant', content: reply('Ready'), api: model.api, provider: model.provider, model: model.id, usage, stopReason: 'stop', timestamp: Date.now() };
            stream.push({type: 'start', partial: message}); entered(); release = () => stream.push({type: 'done', reason: 'stop', message}); return stream;
        }); await started;
        const active = s.root.getState().activeExecution; d.complete(); await Promise.resolve(); await Promise.resolve();
        expect(s.root.getState().isBusy).toBe(true); expect(s.root.getState().activeExecution).toEqual(active);
        expect(s.root.getState().workspaceFiles).not.toHaveProperty(outputPath);
        release(); expect((await next).status).toBe('completed');
    });
    it('refuses a restored metadata-only continuation before invoking the provider', async () => {
        const s = await fixture(); const pending = s.task.suspend({question: 'Which value?', options: []});
        s.task.close('blocked'); finishRun(s.root, s.lease);
        const restored: StoreApi = { getState: () => s.root.getState(), setState: s.root.setState };
        const provider = vi.fn(scripted(() => reply()));
        const result = await runPiFollowUpTurn({message: s.message, taskContinuation: pending.resumeContext!.piTaskContinuation}, restored, provider);
        expect(result.status).toBe('failed'); expect(result.text).toContain('task_continuation_unavailable'); expect(provider).not.toHaveBeenCalled();
    });
    it('pauses active charging and retains attempt counters across an approval suspension', async () => {
        const s = await fixture(); await s.task.beforeTool('workspace.write', {});
        const prior = s.task.snapshot.budget.used;
        const pending = s.task.suspend({question: 'Approve?', options: [], interactionKind: 'approval'});
        s.task.close('blocked'); finishRun(s.root, s.lease);
        const lease = beginRun(s.root, 'follow_up', 'approval-resume', 'approval-turn'), store = scopeRunStore(s.root, lease);
        const resumed = await preparePiTask(store, s.message, pending.resumeContext!.piTaskContinuation, realGuest);
        expect(resumed.snapshot.budget.used.toolCalls).toBe(prior.toolCalls);
        expect(resumed.snapshot.budget.pausedForUser).toBe(false); expect(resumed.snapshot.taskId).toBe(s.task.snapshot.taskId);
        resumed.close('blocked'); finishRun(s.root, lease);
    });
});

it('opaque task ownership survives only a validated private continuation, not a public snapshot wrapper', async () => {
    const s=await fixture();
    const token=captureOwnedPiTaskIdentity(s.store);expect(Object.isFrozen(token)).toBe(true);
    s.store.piTask={...s.task};
    expect(()=>captureOwnedPiTaskIdentity(s.store)).toThrow('task_owner_unavailable');
    s.store.piTask=s.task;
    const pending=s.task.suspend({question:'Choose the exact meaning',options:[]});s.task.close('blocked');finishRun(s.root,s.lease);
    const resumedLease=beginRun(s.root,'follow_up','identity-resume'),resumedStore=scopeRunStore(s.root,resumedLease);
    const resumed=await preparePiTask(resumedStore,s.message,pending.resumeContext!.piTaskContinuation,realGuest);
    expect(captureOwnedPiTaskIdentity(resumedStore)).toBe(token);expect(isCurrentPiTaskIdentity(s.root,token)).toBe(true);
    resumed.close('blocked');finishRun(s.root,resumedLease);
    const nextLease=beginRun(s.root,'follow_up','identity-new'),nextStore=scopeRunStore(s.root,nextLease);
    const next=await preparePiTask(nextStore,s.message,undefined,realGuest);
    expect(captureOwnedPiTaskIdentity(nextStore)).not.toBe(token);expect(isCurrentPiTaskIdentity(s.root,token)).toBe(false);
    next.close('blocked');finishRun(s.root,nextLease);
});
