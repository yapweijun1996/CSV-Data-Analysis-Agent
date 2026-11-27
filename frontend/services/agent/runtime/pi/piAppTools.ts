import { scopeRunStore, assertRunActive } from '../../../session/sessionOwnership';
import { modelExecutionReceipt } from '../../../sandbox/evaluationFaults';
import { createQueryReceipt, type QueryExecutionReceipt } from './queryEvidence';
import { type AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import type { ToolManifest } from '../../../../types';
import { handleAiAction } from '../../actionHandler';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { getPreferredAnalysisDataset } from '../../reportStructureState';
import type { StoreApi } from '../../types';
import { getQueryableColumnProfiles } from '../analysisContextBuilder';
import { buildBuiltinToolRegistry } from '../../tools/toolRegistry';
import {createPiScopeRepairTool} from './piScopeRepairTool';
import {canRepairComputationScope,type ScopeRepairContext} from './piScopeRepair';
import { createPiSkillTool } from './piSkillTool';
import { buildToolAvailabilityContext } from '../../tools/toolGovernance';
import { resolveAllowedTools } from '../../tools/toolRegistry';

export const PI_MAX_TOOL_CALLS_PER_TURN = 3;

const MAX_TOOL_RESULT_CHARS = 6_000;

const isCardCreatingTool = (manifest: ToolManifest): boolean =>
    manifest.name === 'analysis.create_plan' || manifest.capabilities?.piFollowUpCardCreation === true;

export const createPiAppTools = (
    store: StoreApi,
    _datasetVersion: string | null,
    options: { scopeRepair?:{context:ScopeRepairContext;onResolved:(scope:import('./queryEvidence').ResolvedAnswerScope)=>void}; allowCardCreation?: boolean; maxToolCalls?: number; onCardCreated?: (cardId: string) => void; onQueryExecuted?: (receipt: QueryExecutionReceipt) => void; onComputationValidated?: (receipt: import('../../execution/computationEvidence').ComputationEvidenceReceipt) => void; onMcpObserved?: (receipt: import('../../connectors/httpMcpContract').McpObservationReceipt) => void; includeSkills?: boolean } = {},
): AgentTool[] => {
    let calls = 0;
    const maxToolCalls = options.maxToolCalls ?? PI_MAX_TOOL_CALLS_PER_TURN;
    const state = store.getState();
    const dataset = getPreferredAnalysisDataset(state);
    const columnNames = dataset
        ? getQueryableColumnProfiles(dataset, state.columnProfiles ?? [], state.rawCsvData)
            .map(profile => profile.name)
        : [];
    const registry = buildBuiltinToolRegistry(columnNames, store.mcpTools?.manifests);
    const allowed = store.piTask ? resolveAllowedTools(registry, buildToolAvailabilityContext(state, { hasCodeExecution: Boolean(store.codeExecution), externalToolManifests: store.mcpTools?.manifests, toolStage: 'analysis' })).decisions : {};
    const manifests = registry.manifests.filter(manifest =>
        (manifest.risk === 'low'
            && manifest.capabilities?.readOnly === true
            && manifest.capabilities?.piFollowUpReadOnly === true)
        || (options.allowCardCreation
            && (manifest.name === 'analysis.create_plan' || manifest.capabilities?.piFollowUpCardCreation === true))
        || (manifest.name === 'data.mutate'
            && manifest.capabilities?.piFollowUpMutation === true)
        || (Boolean(store.piTask) && allowed[manifest.name]?.allowed && (manifest.name.startsWith('mcp.') || manifest.name.startsWith('code.') || manifest.name === 'computation.validate' || manifest.name.startsWith('candidate.')
            || manifest.groups?.includes('workspace.edit') || manifest.name === 'conversation.request_clarification')));
    const manifestTools = manifests.map((manifest: ToolManifest): AgentTool => ({
        name: manifest.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
        label: manifest.name,
        description: [manifest.description, ...(manifest.promptHints ?? [])].join(' ').slice(0, 4_000),
        parameters: Type.Unsafe<Record<string, unknown>>(manifest.inputSchema),
        executionMode: 'sequential',
        replay: manifest.capabilities?.mutatesState || isCardCreatingTool(manifest) || manifest.name === 'candidate.stage' || manifest.name === 'candidate.abandon' || manifest.name === 'candidate.validate' || manifest.name === 'computation.validate'
            || manifest.name.startsWith('mcp.') ? 'never' : 'safe',
        execute: async (_toolCallId, args, signal) => {
            const context = store.executionContext;
            const toolStore = context ? scopeRunStore(store, context.lease) : store;
            store.piTask?.attach(toolStore);
            toolStore.executorPreparation = store.executorPreparation;
            if (context) {
                assertRunActive(store, context.lease);
                toolStore.executionContext = { ...context, toolCallId: _toolCallId, stepId: `step-${context.lease.turnId}-${_toolCallId}` };
            }
            if (manifest.capabilities?.mutatesState) {
                throw new Error('This mutation requires app approval before execution.');
            }
            const executionVersion = getCurrentAnalysisDatasetVersion(store.getState());
            if (!store.piTask?.coding && !manifest.name.startsWith('code.') && !manifest.groups?.includes('workspace.edit')
                && (calls >= maxToolCalls || (store.piTask?.snapshot.budget.used.toolCalls ?? 0) >= maxToolCalls)) {
                throw new Error(`The limit of ${maxToolCalls} app tools was reached.`);
            }
            calls += 1;
            await store.piTask?.beforeTool(manifest.name, args, _toolCallId);
            const result = await handleAiAction({
                type: 'tool_call',
                thought: `Execute ${manifest.name} for the current request.`,
                toolName: manifest.name,
                args,
            }, toolStore, {
                toolStage: 'analysis',
                abortSignal: signal,
                requireRowDeleteConfirmation: true,
            });
            if (context) assertRunActive(store, context.lease);
            if (toolStore.executionContext) store.piTask?.afterTool(manifest.name, result, toolStore.executionContext);
            if (getCurrentAnalysisDatasetVersion(store.getState()) !== executionVersion) {
                throw new Error('The dataset changed during tool execution. Run the query again.');
            }
            if (manifest.name === 'computation.validate' && result.status === 'success') {
                const receipt = result.artifacts?.computationEvidence as import('../../execution/computationEvidence').ComputationEvidenceReceipt | undefined;
                if (receipt) options.onComputationValidated?.(receipt);
            }
            if (manifest.name.startsWith('mcp.') && result.status === 'success' && toolStore.executionContext) {
                const receipt = result.artifacts?.mcpObservation;
                if (!store.mcpTools?.owns(receipt, toolStore.executionContext)) throw new Error('mcp_unverified_receipt');
                options.onMcpObserved?.(receipt as import('../../connectors/httpMcpContract').McpObservationReceipt);
            }
            if (manifest.name === 'data.query' && result.status === 'success') {
                const query = result.artifacts?.activeDataQuery;
                if (query && query === store.getState().activeDataQuery) {
                    const receipt = createQueryReceipt(toolStore, query as import('../../../../types').ActiveDataQuery);
                    if (receipt) options.onQueryExecuted?.(receipt);
                }
            }
            if (isCardCreatingTool(manifest) && result.status === 'success') {
                // analysis.create_plan reports `createdCardId`; the other analysis tools report `cardId`.
                const cardId = result.artifacts?.createdCardId ?? result.artifacts?.cardId;
                if (typeof cardId === 'string'
                    && store.getState().analysisCards.some(card => card.id === cardId)) {
                    options.onCardCreated?.(cardId);
                }
            }
            // A workspace observation only repeats its payload. Dropping it keeps listings, matches and file
            // content inside the result budget as valid JSON, with the result ahead of any preview cut.
            const payload = JSON.stringify({
                status: result.status,
                message: result.message,
                ...(manifest.name.startsWith('workspace.') ? {} : { observation: result.observation }),
                payload: result.payload,
                artifacts: result.artifacts,
                retryHint: result.retryHint,
            });
            // Code errors/logs must reach the model intact. Do not turn a structured receipt into invalid JSON.
            const summary = { status: result.status, message: result.message.slice(0, 500),
                preview: payload.slice(0, MAX_TOOL_RESULT_CHARS), truncated: true, retryHint: 'Read a smaller range for complete structured evidence.' };
            while (JSON.stringify(summary).length > MAX_TOOL_RESULT_CHARS) summary.preview = summary.preview.slice(0, Math.floor(summary.preview.length * 0.75));
            const computation = result.artifacts?.computationEvidence as import('../../execution/computationEvidence').ComputationEvidenceReceipt | undefined;
            const bounded = manifest.name === 'computation.validate' ? JSON.stringify({status:result.status,message:result.message,retryHint:result.retryHint,
                artifacts:computation?{computationEvidence:{evidenceId:computation.evidenceId,taskId:computation.taskId,taskRevision:computation.taskRevision,
                    method:computation.method,methodVersion:computation.methodVersion,seed:computation.seed,result:computation.result,
                    reference:computation.reference,tolerance:computation.tolerance,inputSha256:computation.inputSha256,
                    execution:{jobId:computation.execution.jobId,mode:computation.execution.mode,program:computation.execution.program,output:computation.execution.output,
                        environmentDigest:computation.execution.environmentDigest,inputDigest:computation.execution.inputDigest,requestDigest:computation.execution.requestDigest}}}:undefined})
                : manifest.name.startsWith('code.') ? JSON.stringify({ status: result.status, message: result.message,
                receipt: modelExecutionReceipt(result.artifacts?.codeExecution as Parameters<typeof modelExecutionReceipt>[0]), retryHint: result.retryHint })
                : payload.length <= MAX_TOOL_RESULT_CHARS ? payload : JSON.stringify(summary);
            let feedback = bounded;
            if (store.piTask) {
                const taskPlan=store.piTask.plan;
                let value={...JSON.parse(bounded),taskPlan};
                // Keep immutable write refs available even when authored content fills the observation budget.
                const artifact=(result.payload as {workspace?:{artifact?:{path:string;revision:number;sha256:string;byteSize:number}}}|undefined)?.workspace?.artifact;
                if (artifact&&['workspace.write','workspace.replace','workspace.append'].includes(manifest.name)) {
                    const {path,revision,sha256,byteSize}=artifact;
                    value={status:result.status,message:result.message,payload:{workspace:{artifact:{path,revision,sha256,byteSize}}},taskPlan};
                }
                if (!manifest.name.startsWith('code.')&&manifest.name!=='computation.validate') {
                    let preview=bounded;
                    while (preview.length&&JSON.stringify(value).length>MAX_TOOL_RESULT_CHARS) {
                        preview=preview.slice(0,Math.floor(preview.length*0.75));
                        value={status:result.status,message:result.message.slice(0,500),preview,truncated:true,
                            retryHint:result.retryHint??'Read a smaller range for complete structured evidence.',taskPlan};
                    }
                }
                feedback=JSON.stringify(value);
            }
            if (result.status === 'error') throw new Error(feedback);
            return { details: undefined, content: [{ type: 'text', text: feedback }] };
        },
    }));
    if(options.scopeRepair&&store.piTask&&canRepairComputationScope(store.piTask.snapshot.scope.answer))
        manifestTools.push(createPiScopeRepairTool(store,options.scopeRepair.context,options.scopeRepair.onResolved));
    // Skills are guidance, not data tools, so loading one does not use the app-tool budget.
    return options.includeSkills === false ? manifestTools : [...manifestTools, createPiSkillTool(store, store.piTask
        ? { maxReads: store.piTask.snapshot.budget.limits.skillReads, onRead: id => store.piTask!.skillRead(id) } : {})];
};
