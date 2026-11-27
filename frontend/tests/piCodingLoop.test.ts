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
    it.each(['Hello','Explain the formula for Pearson correlation.'])('completes ordinary explanation without requiring a data query: %s',async message=>{
        const s=await fixture(realGuest,message);
        try{
            const result=await runPiFollowUpTurn({message},s.store,scripted(()=>reply('A method explanation without dataset values.')));
            expect(result.status,result.text).toBe('completed');expect(s.root.getState().activeDataQuery).toBeNull();
            expect(s.root.getState().runtimeRunHistory!.at(-1)?.taskOutputs).toMatchObject({status:'complete',queryIds:[],computationIds:[],missingRequiredIds:[]});
        }finally{finishRun(s.root,s.lease);beginSessionTransition(s.root);}
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
