import { normalizeEvidenceQueryPlan } from '../services/agent/execution/queryEvidencePolicy';
import { beginSessionTransition, cancelOwnedRun, beginRun, finishRun } from '../services/session/sessionOwnership';
import { captureQueryIdentity } from '../services/agent/runtime/pi/queryEvidence';
import { rootStore } from '../services/session/sessionOwnership';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { resolvePiModel, resolvePiThinkingLevel } from '../services/agent/runtime/pi/piProvider';

const { persistMock, memoryMock, consentMock, finalizeMock, stageMock, actionMock, gateMock } = vi.hoisted(() => ({
    gateMock: vi.fn(),
    persistMock: vi.fn(async () => true),
    memoryMock: vi.fn(async () => []),
    consentMock: vi.fn(async () => undefined),
    finalizeMock: vi.fn(),
    stageMock: vi.fn(),
    actionMock: vi.fn(),
}));

vi.mock('../services/persistence/currentSessionPersistence', () => ({
    persistCurrentAppSessionSnapshot: persistMock,
}));
vi.mock('../services/agent/memory/followUpMemory', () => ({
    readAppFollowUpMemory: memoryMock,
}));
vi.mock('../services/privacy/cloudAiConsent', () => ({
    ensureCloudAiConsent: consentMock,
}));
vi.mock('../services/agent/runtime/runtimeFinalize', () => ({
    finalizeRuntimeOutcome: finalizeMock,
}));
vi.mock('../services/agent/runtime/pi/initialAnalysisStageTools', () => ({
    executeInitialAnalysisStageTool: stageMock,
}));
vi.mock('../services/agent/runtime/pi/piCardEvidenceGate', () => ({
    gatePiCreatedCards: gateMock,
}));
vi.mock('../services/agent/actionHandler', () => ({
    handleAiAction: actionMock,
}));
vi.mock('../services/agent/analysisCompletionGate', () => ({
    resolveAnalysisCompletionGate: () => ({ trustedBusinessCardIds: ['card-1'] }),
}));
vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: vi.fn(),
    updateAgentTaskStatus: vi.fn(),
}));

import { updateAgentTaskStatus } from '../services/agent/monitoring/agentMonitor';
import { runPiFollowUpTurn } from '../services/agent/runtime/pi/piFollowUpRuntimeService';
import { runPiInitialAnalysis } from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import { cancelPiInitialAnalysis, recoverPiInitialAnalysisIfNeeded } from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';
import { createSingleTableDatasetBundle } from '../services/data/datasetBundle';
import { buildDatasetFingerprint } from '../utils/datasetId';
import { ensureGoogleHistoryEndsWithUserTurn, createPiProviderContextTransform, resolvePiProviderFetch } from '../services/agent/runtime/pi/piProvider';
import { createPiAppTools } from '../services/agent/runtime/pi/piAppTools';

const usage = {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const answerStream = (answer: string): StreamFn => (model) => {
    const stream = createAssistantMessageEventStream();
    const message: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: answer }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage,
        stopReason: 'stop',
        timestamp: Date.now(),
    };
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
    return stream;
};

const createStore = () => {
    let state = {
        sessionId: 'session-1',
        settings: {
            provider: 'openai',
            openAIApiKey: 'test-only-key',
            complexModel: 'gpt-5.4-mini',
            reasoningEffort: 'medium',
            language: 'English',
        },
        csvData: { fileName: 'sample.csv', data: [{ Town: 'A', Amount: 10 }] },
        canonicalCsvData: null,
        semanticDatasetVersion: 'version-1',
        columnProfiles: [{ name: 'Town' }, { name: 'Amount' }],
        analysisCards: [],
        chatHistory: [],
        dataQualityIssues: [],
        activeDataQuery: null,
        contextualSummary: null,
        aiCoreAnalysisSummary: null,
        finalSummary: null,
        confirmedAnalysisGoal: null,
        currentDatasetId: 'dataset-1',
        cleaningRun: null,
        cardEnhancementSuggestions: [],
        isBusy: false,
        isGeneratingReport: false,
        initialAnalysisStatus: 'idle',
        clearActiveTurnCancellation: vi.fn(),
        setStreamingMessage: vi.fn(),
        setResultsViewMode: vi.fn((mode: 'simple' | 'explore') => {
            state.resultsViewMode = mode;
        }),
        resultsViewMode: 'simple',
    } as any;
    return {
        getState: () => state,
        setState: (patch: any) => {
            state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
        },
    };
};

describe('Pi production runtime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gateMock.mockReturnValue({ rejected: [], tableOnlyIds: [] });
    });

    it('clears its own streaming bubble when cancelled before the transport finishes', async () => {
        const store = createStore();
        store.setState({ streamingMessage: 'Old partial answer' });
        let entered!: () => void, release!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: 'Old partial answer' }],
                api: model.api, provider: model.provider, model: model.id, usage, stopReason: 'stop', timestamp: Date.now() };
            output.push({ type: 'start', partial: message });
            release = () => output.push({ type: 'done', reason: 'stop', message });
            entered();
            return output;
        };
        const pending = runPiFollowUpTurn({ message: 'Hello' }, store as never, stream);
        await started;
        cancelOwnedRun(store as never);
        expect((await pending).status).toBe('cancelled');
        expect(store.getState().streamingMessage).toBeNull();
        release();
        expect(finalizeMock).toHaveBeenCalledOnce();
    });

    it('uses the app-selected OpenAI, Google, and shared gateway models', () => {
        const settings = createStore().getState().settings;
        expect(resolvePiModel(settings).id).toBe('gpt-5.4-mini');
        expect(resolvePiModel(settings).contextWindow).toBe(200_000);
        expect(resolvePiThinkingLevel(settings)).toBe('medium');
        expect(resolvePiModel({ ...settings, provider: 'google', complexModel: 'gemini-2.5-flash' }).provider).toBe('google');
        const gatewayModel = resolvePiModel({ ...settings, provider: 'default' });
        expect(gatewayModel.baseUrl).toBe('https://gpt.yapweijun1996.com/demo/v1');
        expect(gatewayModel.contextWindow).toBe(200_000);
        expect(gatewayModel.compat).toMatchObject({ supportsMaxOutputTokens: false });
        expect(resolvePiModel(settings).compat).not.toMatchObject({ supportsMaxOutputTokens: false });
    });

    it('gives Google no custom fetch, because the Google adapter rejects one', async () => {
        const base = createStore().getState().settings;
        expect(resolvePiProviderFetch({ ...base, provider: 'google' })).toBeUndefined();
        expect(resolvePiProviderFetch({ ...base, provider: 'openai' })).toBeTypeOf('function');
        expect(resolvePiProviderFetch({ ...base, provider: 'default' })).toBeTypeOf('function');
    });

    it('ends a Google history with a user turn but leaves other histories alone', async () => {
        const user = { role: 'user', content: [{ type: 'text', text: 'go' }], timestamp: 1 } as never;
        const model = { role: 'assistant', content: [{ type: 'text', text: 'thinking' }], timestamp: 2 } as never;
        const fixed = ensureGoogleHistoryEndsWithUserTurn([user, model]);
        expect(fixed).toHaveLength(3);
        expect(fixed.at(-1)?.role).toBe('user');
        expect(ensureGoogleHistoryEndsWithUserTurn([user])).toHaveLength(1);
        const base = createStore().getState().settings;
        const system = { role: 'system', content: 'sys', timestamp: 0 } as never;
        const google = createPiProviderContextTransform({ ...base, provider: 'google', geminiApiKey: 'k', complexModel: 'gemini-2.5-flash' } as never);
        expect((await google([system, user, model])).at(-1)?.role).toBe('user');
        const openai = createPiProviderContextTransform(base as never);
        expect((await openai([system, user, model])).at(-1)?.role).toBe('assistant');
    });

    it('completes a keyless Pi follow-up and projects the answer into the app contract', async () => {
        const store = createStore();
        const result = await runPiFollowUpTurn(
            { message: 'Hello, explain how this app works.' },
            store as never,
            answerStream('Use a CSV to begin an analysis.'),
        );

        expect(result).toMatchObject({ status: 'completed', text: 'Use a CSV to begin an analysis.' });
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({
                outcomeKind: 'accepted',
                assistantMessage: 'Use a CSV to begin an analysis.',
                eventDetail: { runtimeOwner: 'pi' },
            }),
        }));
        expect(consentMock).not.toHaveBeenCalled();
    });

    it('exposes card creation only for an explicit card turn', () => {
        const store = createStore();
        const version = getCurrentAnalysisDatasetVersion(store.getState());
        expect(createPiAppTools(store as never, version).map(tool => tool.name))
            .not.toContain('analysis_create_plan');
        expect(createPiAppTools(store as never, version, { allowCardCreation: true })
            .map(tool => tool.name)).toContain('analysis_create_plan');
    });

    it('offers the other card-creating analysis tools only with card creation', () => {
        const store = createStore();
        const version = getCurrentAnalysisDatasetVersion(store.getState());
        const cardTools = ['analysis_pivot_matrix', 'analysis_period_compare', 'analysis_cohort_retention',
            'analysis_root_cause_breakdown', 'analysis_correlation'];
        const withoutCards = createPiAppTools(store as never, version).map(tool => tool.name);
        const withCards = createPiAppTools(store as never, version, { allowCardCreation: true }).map(tool => tool.name);
        cardTools.forEach(name => {
            expect(withoutCards).not.toContain(name);
            expect(withCards).toContain(name);
        });
    });


    it('links a card created by Pi and reveals it in the dashboard', async () => {
        const store = createStore();
        const plan = {
            title: 'Average Amount by Town',
            description: 'Average amount per town.',
            chartType: 'bar',
            groupByColumn: 'Town',
            valueColumn: 'Amount',
            aggregation: 'avg',
        };
        actionMock.mockImplementationOnce(async () => {
            store.setState({ analysisCards: [{
                id: 'created-card', plan, aggregatedData: [{ Town: 'A', Amount: 10 }],
            }] });
            return {
                status: 'success',
                message: 'Created analysis card.',
                artifacts: { createdCardId: 'created-card' },
            };
        });
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant',
                content: [{ type: 'toolCall', id: 'create-card-1', name: 'analysis_create_plan', arguments: { plan } }],
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        const result = await runPiFollowUpTurn({
            message: 'Add a dashboard card by Town.',
            intentFindings: { intent: 'precise_card' } as never,
        }, store as never, stream);

        expect(actionMock).toHaveBeenCalledWith(expect.objectContaining({
            toolName: 'analysis.create_plan',
        }), expect.objectContaining({ executionContext: expect.objectContaining({ toolCallId: 'create-card-1' }) }), expect.any(Object));
        expect(rootStore(actionMock.mock.calls[0][1])).toBe(store);
        expect(result.status).toBe('completed');
        expect(store.getState().resultsViewMode).toBe('explore');
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({
                outcomeKind: 'accepted',
                assistantCardId: 'created-card',
                assistantMessage: 'Created dashboard card "Average Amount by Town" with 1 result row.',
            }),
        }));
    });



    it('preserves a saved batch card without turning a later provider failure into completion', async () => {
        const store = createStore();
        const plan = { title: 'Amount by Town', description: 'Amount', chartType: 'bar', groupByColumn: 'Town', valueColumn: 'Amount', aggregation: 'sum' };
        actionMock.mockImplementationOnce(async () => {
            store.setState({ analysisCards: [{ id: 'partial-card', plan, aggregatedData: [{ Town: 'A', Amount: 10 }] }] });
            return { status: 'success', message: 'Created card.', artifacts: { createdCardId: 'partial-card' } };
        });
        let call = 0;
        const stream: StreamFn = model => {
            if (call++) throw new Error('Synthetic provider unavailable');
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = { role: 'assistant', content: [{ type: 'toolCall', id: 'partial', name: 'analysis_create_plan', arguments: { plan } }],
                api: model.api, provider: model.provider, model: model.id, usage, stopReason: 'toolUse', timestamp: Date.now() };
            output.push({ type: 'start', partial: message }); output.push({ type: 'done', reason: 'toolUse', message }); return output;
        };
        const result = await runPiFollowUpTurn({ message: 'Explore several angles.', intentFindings: { intent: 'batch_analysis' } as never }, store as never, stream);
        expect(result.status).toBe('failed');
        expect(store.getState().analysisCards.map((c: any) => c.id)).toEqual(['partial-card']);
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ outcomeKind: 'failed' }) }));
        actionMock.mockReset();
    });





    it('does not complete with a card produced for an invalidated dataset binding', async () => {
        const store = createStore();
        const plan = {
            title: 'Average Amount by Town',
            description: 'Average amount per town.',
            chartType: 'bar',
            groupByColumn: 'Town',
            valueColumn: 'Amount',
            aggregation: 'avg',
        };
        actionMock.mockImplementationOnce(async () => {
            store.setState({
                analysisCards: [{ id: 'created-card', plan, aggregatedData: [{ Town: 'A', Amount: 10 }] }],
                // Changing the dataset after the card exists makes the post-run version check throw.
                csvData: { fileName: 'sample.csv', data: [{ Town: 'B', Amount: 99 }, { Town: 'C', Amount: 1 }] },
            });
            return { status: 'success', message: 'Created analysis card.', artifacts: { createdCardId: 'created-card' } };
        });
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant',
                content: [{ type: 'toolCall', id: 'create-card-1', name: 'analysis_create_plan', arguments: { plan } }],
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        const result = await runPiFollowUpTurn({
            message: 'Add a dashboard card by Town.',
            intentFindings: { intent: 'precise_card' } as never,
        }, store as never, stream);

        expect(result.status).toBe('failed');
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({
                outcomeKind: 'failed',
                retryable: true,
                assistantCardId: null,
            }),
        }));
    });


    it('does not replay an interrupted stage with uncertain side effects', async () => {
        const store = createStore();
        store.setState({ confirmedAnalysisGoal: 'Find patterns.' });
        const version = getCurrentAnalysisDatasetVersion(store.getState());
        localStorage.setItem('pi-initial-analysis-v1:session-1', JSON.stringify({
            schemaVersion: 1,
            sessionId: 'session-1',
            datasetVersion: version,
            researchGoal: 'Find patterns.',
            nextStageIndex: 3,
            pendingStageIndex: 3,
            committedTransformationIds: [],
            cardFingerprints: [],
            warnings: [],
        }));
        expect(await recoverPiInitialAnalysisIfNeeded(store as never)).toBeNull();
        expect(localStorage.getItem('pi-initial-analysis-v1:session-1')).toBeNull();
        expect(stageMock).not.toHaveBeenCalled();
    });

    const stageToolStream = (): StreamFn => model => {
        const output = createAssistantMessageEventStream();
        const message: AssistantMessage = {
            role: 'assistant',
            content: [{ type: 'toolCall', id: `stage-${Math.random()}`, name: 'run_next_analysis_stage', arguments: {} }],
            api: model.api, provider: model.provider, model: model.id,
            usage, stopReason: 'toolUse', timestamp: Date.now(),
        };
        output.push({ type: 'start', partial: message });
        output.push({ type: 'done', reason: 'toolUse', message });
        return output;
    };

    const scriptedStageStream = (argsList: Array<Record<string, unknown>>): StreamFn => {
        let call = 0;
        return model => {
            const output = createAssistantMessageEventStream();
            const args = argsList[Math.min(call, argsList.length - 1)];
            const message: AssistantMessage = {
                role: 'assistant',
                content: [{ type: 'toolCall', id: `stage-${call++}`, name: 'run_next_analysis_stage', arguments: args as never }],
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
    };
    const passingStages = (names: string[]) => stageMock.mockImplementation(async ({ toolName, phase, context }) => {
        names.push(toolName);
        return {
            decision: 'pass', phase, toolName, datasetVersion: context.request.datasetVersion,
            summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [],
        };
    });
    const runStages = (stream: StreamFn) => runPiInitialAnalysis({
        appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
        researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
    }, createStore() as never, stream);

    it.each([false,true])('keeps nine ordered stages with shared initial preparation enabled=%s',async enabled=>{
        const names: string[]=[];const contexts: any[]=[];
        stageMock.mockImplementation(async ({toolName,phase,context})=>{names.push(toolName);contexts.push(context.store);
            return {decision:'pass',phase,toolName,datasetVersion:context.request.datasetVersion,summary:'ok',warningCodes:[],artifactRefs:[],transformationIds:[],cardIds:[]};});
        const store=createStore();
        const result=await runPiInitialAnalysis({appSessionId:'session-1',datasetId:'dataset-1',datasetVersion:'version-1',researchGoal:'Find patterns.',provider:{provider:'openai',modelId:'mock'}},
            store as never,stageToolStream(),enabled?{codingPreparation:{enabled:true}}:{});
        expect(result.status).toBe('completed');expect(names).toEqual(['dataset.profileStructure','dataset.detectNoiseRows','dataset.suggestCleaningPlan','dataset.applyTransform',
            'dataset.validatePreparedData','dataset.bindQueryEngine','analysis.researchQuestions','analysis.executeEvidence','analysis.finalizeArtifacts']);
        contexts.forEach((context,index)=>{
            expect(context.executionContext).toMatchObject({stepId:expect.stringContaining(`stage-${index}-`),toolCallId:expect.any(String)});
            if(enabled)expect(context.executorPreparation).toMatchObject({mode:'staging_only',entryPoint:'initial_analysis',stage:{stageIndex:index,pendingStageIndex:index}});
            else {expect(context.piTask).toBeUndefined();expect(context.codeExecution).toBeUndefined();}
        });
        expect(store.getState().csvData.data).toEqual([{Town:'A',Amount:10}]);
    });
    it('leaves an earlier failed cleaning run and its text untouched when a new run starts', async () => {
        const seen: Array<{ status?: string; lastError?: string | null }> = [];
        stageMock.mockImplementation(async ({ toolName, phase, context }) => {
            const run = context.store.getState().cleaningRun;
            seen.push({ status: run?.status, lastError: run?.lastError });
            return {
                decision: 'pass', phase, toolName, datasetVersion: context.request.datasetVersion,
                summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [],
            };
        });
        const store = createStore();
        store.setState({ cleaningRun: { runId: 'old', status: 'failed', lastError: 'Numeric reconciliation failed.', steps: [], currentStep: 0 } });
        await runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'mock' } }, store as never, stageToolStream());
        expect(seen[0]).toEqual({ status: 'failed', lastError: 'Numeric reconciliation failed.' });
        expect(store.getState().cleaningRun.lastError).toBe('Numeric reconciliation failed.');
    });
    it.each([
        ['an idle run', { runId: 'r', status: 'running', steps: [], currentStep: 0 }, 'initial_analysis'],
        ['a failure the cleaning loop wrote', { runId: 'r', status: 'failed', lastError: 'Numeric reconciliation failed.', steps: [], currentStep: 0 }, null],
    ])('marks only an analysis-caused failure as such in a qualified run: %s', async (_name, cleaningRun, expectedOrigin) => {
        const store = createStore();
        // This test exercises a post-structure host failure, not unresolved-source blocking.
        store.setState({ canonicalCsvData: store.getState().csvData, cleaningRun, confirmedAnalysisGoal: 'Find patterns.', datasetBundle: createSingleTableDatasetBundle({
            datasetId: 'synthetic', sourceFingerprint: 'synthetic', file: { name: 'synthetic.csv', size: 20, lastModified: 1 }, data: store.getState().csvData,
        }) });
        stageMock.mockImplementation(async ({ toolName, phase, context }) => ({
            decision: 'fail', phase, toolName, datasetVersion: context.request.datasetVersion,
            summary: 'Independent host meaning is unavailable.', warningCodes: ['validation_host_contract_required'],
            artifactRefs: [], transformationIds: [], cardIds: [],
        }));
        await runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'synthetic', datasetVersion: getCurrentAnalysisDatasetVersion(store.getState())!,
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'mock' } }, store as never, stageToolStream(),
            { codingPreparation: { enabled: true, qualified: true } });
        expect(store.getState().cleaningRun.status).toBe('failed');
        expect(store.getState().cleaningRun.failureOrigin ?? null).toBe(expectedOrigin);
        localStorage.removeItem('pi-initial-analysis-v1:session-1');
    });
    it('preserves optional skips with preparation enabled',async()=>{
        const names:string[]=[];passingStages(names);
        const result=await runPiInitialAnalysis({appSessionId:'session-1',datasetId:'dataset-1',datasetVersion:'version-1',researchGoal:'Find patterns.',provider:{provider:'openai',modelId:'mock'}},
            createStore() as never,scriptedStageStream([{}, {stage:'dataset.validatePreparedData'}]),{codingPreparation:{enabled:true}});
        expect(result.status).toBe('completed');expect(names).toHaveLength(7);expect(names).not.toContain('dataset.applyTransform');
    });
    it('does not complete or advance a shared initial task past a failed mandatory stage', async () => {
        const store = createStore();
        store.setState({ confirmedAnalysisGoal: 'Find patterns.', datasetBundle: createSingleTableDatasetBundle({
            datasetId: 'synthetic', sourceFingerprint: 'synthetic', file: { name: 'synthetic.csv', size: 20, lastModified: 1 }, data: store.getState().csvData,
        }) });
        const before = JSON.stringify(store.getState().datasetBundle);
        stageMock.mockImplementation(async ({ toolName, phase, context }) => ({
            decision: 'fail', phase, toolName, datasetVersion: context.request.datasetVersion,
            summary: 'Independent host meaning is unavailable.', warningCodes: ['validation_host_contract_required'],
            artifactRefs: [], transformationIds: [], cardIds: [],
        }));
        const outcome = await runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'synthetic', datasetVersion: getCurrentAnalysisDatasetVersion(store.getState())!,
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'mock' } }, store as never, stageToolStream(), { codingPreparation: { enabled: true } });
        expect(outcome.status).toBe('failed');
        expect(store.getState().activeAgentTask.status).toBe('blocked');
        expect(stageMock).toHaveBeenCalledOnce();
        expect(JSON.stringify(store.getState().datasetBundle)).toBe(before);
        const checkpoint = JSON.parse(localStorage.getItem('pi-initial-analysis-v1:session-1')!);
        expect(checkpoint).toMatchObject({ nextStageIndex: 0, pendingStageIndex: 0, stageReceipts: [{ decision: 'fail', stageIndex: 0 }] });
        localStorage.removeItem('pi-initial-analysis-v1:session-1');
    });
    it('preserves provider failure after partial work in a shared initial task', async () => {
        const store = createStore();
        const names: string[] = []; passingStages(names);
        let calls = 0;
        const stream: StreamFn = (...args) => {
            if (++calls === 1) return stageToolStream()(...args);
            const model = args[0], output = createAssistantMessageEventStream();
            const message: AssistantMessage = { role: 'assistant', content: [], api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'error', errorMessage: 'Upstream request failed', timestamp: Date.now() };
            output.push({ type: 'start', partial: message }); output.push({ type: 'error', reason: 'error', error: message });
            return output;
        };
        const result = await runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'mock' } }, store as never, stream, { codingPreparation: { enabled: true } });
        expect(names).toEqual(['dataset.profileStructure', 'dataset.detectNoiseRows']);
        expect(result.status).toBe('failed');
        expect(store.getState().activeAgentTask.status).toBe('failed');
        expect(store.getState().initialAnalysisFailureKind).toBe('provider');
        localStorage.removeItem('pi-initial-analysis-v1:session-1');
    });
    it('records a declined cloud AI consent instead of a provider failure', async () => {
        const store = createStore();
        consentMock.mockRejectedValueOnce(Object.assign(
            new Error('Cloud AI processing was not authorized for this dataset and provider.'),
            { code: 'cloud_ai_consent_declined' },
        ));
        const result = await runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'mock' } }, store as never);
        expect(consentMock).toHaveBeenCalledOnce();
        expect(result.status).toBe('failed');
        expect(store.getState().initialAnalysisFailureKind).toBe('cloud_consent_declined');
        localStorage.removeItem('pi-initial-analysis-v1:session-1');
    });
    it.each(['stop','switch'] as const)('fences prepared stage wait after %s and protects a newer run',async action=>{
        const store=createStore();let enter!:()=>void,release!:()=>void,late!:()=>void;
        const entered=new Promise<void>(resolve=>{enter=resolve;}),wait=new Promise<void>(resolve=>{release=resolve;}),settled=new Promise<void>(resolve=>{late=resolve;});
        const pending=runPiInitialAnalysis({appSessionId:'session-1',datasetId:'dataset-1',datasetVersion:'version-1',researchGoal:'Find patterns.',provider:{provider:'openai',modelId:'mock'}},
            store as never,stageToolStream(),{codingPreparation:{enabled:true,prepareStage:async owned=>{enter();await wait;owned.setState({finalSummary:{language:'English',text:'stale'}});late();}}});
        await entered;
        if(action==='stop')cancelPiInitialAnalysis('session-1');else beginSessionTransition(store as never);
        const result=await pending;expect(result.status).toBe('cancelled');
        const next=beginRun(store as never,'follow_up','new-run','new-turn');store.setState({finalSummary:'current',isBusy:true});
        release();await settled;
        expect(store.getState()).toMatchObject({finalSummary:'current',isBusy:true,activeExecution:{runId:'new-run'}});
        expect(stageMock).not.toHaveBeenCalled();finishRun(store as never,next);
    });
    it('stores preparation metadata without restoring task/grant authority',async()=>{
        const store=createStore();store.setState({confirmedAnalysisGoal:'Find patterns.'});const names:string[]=[];passingStages(names);
        let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});let calls=0,saved='';
        const stream:StreamFn=(...args)=>{if(++calls===2){saved=localStorage.getItem('pi-initial-analysis-v1:session-1')!;enter();return createAssistantMessageEventStream();}return stageToolStream()(...args);};
        const pending=runPiInitialAnalysis({appSessionId:'session-1',datasetId:'dataset-1',datasetVersion:getCurrentAnalysisDatasetVersion(store.getState())!,researchGoal:'Find patterns.',provider:{provider:'openai',modelId:'mock'}},
            store as never,stream,{codingPreparation:{enabled:true}});
        await entered;const checkpoint=JSON.parse(saved);
        expect(checkpoint.executorPreparation).toMatchObject({mode:'staging_only',entryPoint:'initial_analysis',taskId:expect.any(String)});
        expect(checkpoint.stageReceipts[0].execution).toMatchObject({toolCallId:expect.any(String),stepId:expect.any(String)});
        expect(saved).not.toContain('capabilityGrants');expect(saved).not.toContain('controller');
        cancelPiInitialAnalysis('session-1');await pending;localStorage.setItem('pi-initial-analysis-v1:session-1',saved);
        stageMock.mockImplementation(async({toolName,phase,context})=>{
            expect(context.store.piTask).toBeUndefined();expect(context.store.codeExecution).toBeUndefined();
            return {decision:'pass',phase,toolName,datasetVersion:context.request.datasetVersion,summary:'ok',warningCodes:[],artifactRefs:[],transformationIds:[],cardIds:[]};});
        expect((await recoverPiInitialAnalysisIfNeeded(store as never,stageToolStream()))?.status).toBe('completed');
    });

    it('resumes after a committed transformation using the latest material version without repeating the mutation', async () => {
        const store = createStore();
        store.setState({ rawCsvData: store.getState().csvData, confirmedAnalysisGoal: 'Find patterns.' });
        const initialVersion = getCurrentAnalysisDatasetVersion(store.getState())!;
        const names: string[] = [];
        let stable!: () => void;
        const captured = new Promise<void>(resolve => { stable = resolve; });
        let saved = '';
        stageMock.mockImplementation(async ({ toolName, phase, context }) => {
            names.push(toolName);
            if (toolName === 'dataset.applyTransform') context.store.setState({
                csvData: { fileName: 'sample.csv', data: [{ Town: 'A', Amount: 20 }] },
                dataPreparationPlan: { operations: [{ id: 'clean-1', type: 'trim_whitespace', columns: '*', reason: 'Trim' }] },
            });
            return { decision: 'pass', phase, toolName, datasetVersion: getCurrentAnalysisDatasetVersion(context.store.getState()),
                summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: toolName === 'dataset.applyTransform' ? ['clean-1'] : [], cardIds: [] };
        });
        // Batching removes the provider turn at this boundary, but the durable
        // per-stage checkpoint must still allow recovery without replaying mutation.
        const setItem = Storage.prototype.setItem;
        const checkpointWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            setItem.call(this, key, value);
            if (key === 'pi-initial-analysis-v1:session-1') {
                const checkpoint = JSON.parse(value);
                if (checkpoint.nextStageIndex === 4 && checkpoint.pendingStageIndex === null) {
                    saved = value;
                    stable();
                }
            }
        });
        const stream = stageToolStream();
        const running = runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: initialVersion,
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' } }, store as never, stream);
        await captured;
        // The captured stable boundary represents browser termination before the next tool starts.
        cancelPiInitialAnalysis('session-1');
        await running;
        checkpointWrite.mockRestore();
        localStorage.setItem('pi-initial-analysis-v1:session-1', saved);
        expect(JSON.parse(saved).datasetVersion).toBe(getCurrentAnalysisDatasetVersion(store.getState()));
        names.length = 0;
        const outcome = await recoverPiInitialAnalysisIfNeeded(store as never, stageToolStream());
        expect(outcome?.status).toBe('completed');
        expect(names[0]).toBe('dataset.validatePreparedData');
        expect(names).not.toContain('dataset.applyTransform');
        expect(store.getState().csvData.data[0].Amount).toBe(20);
    });

    it('projects awaiting_source after metadata-only reload without deleting the stable checkpoint or starting a tool', async () => {
        const store = createStore();
        const source = store.getState().csvData;
        store.setState({ confirmedAnalysisGoal: 'Find patterns.', rawCsvData: source,
            datasetBundle: createSingleTableDatasetBundle({ datasetId: 'dataset-1', sourceFingerprint: buildDatasetFingerprint(source.fileName, source.data),
                file: { name: source.fileName, size: 20, lastModified: 1 }, data: source }) });
        let entered!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const stream: StreamFn = () => { entered(); return createAssistantMessageEventStream(); };
        const running = runPiInitialAnalysis({ appSessionId: 'session-1', datasetId: 'dataset-1',
            datasetVersion: getCurrentAnalysisDatasetVersion(store.getState())!, researchGoal: 'Find patterns.',
            provider: { provider: 'openai', modelId: 'gpt-5.4-mini' } }, store as never, stream);
        await started;
        const saved = localStorage.getItem('pi-initial-analysis-v1:session-1')!;
        cancelPiInitialAnalysis('session-1');
        await running;
        localStorage.setItem('pi-initial-analysis-v1:session-1', saved);
        store.setState({ csvData: null, rawCsvData: null });
        stageMock.mockClear();
        expect(await recoverPiInitialAnalysisIfNeeded(store as never, stageToolStream())).toBeNull();
        expect(store.getState().initialAnalysisRecovery.status).toBe('awaiting_source');
        expect(localStorage.getItem('pi-initial-analysis-v1:session-1')).toBe(saved);
        expect(stageMock).not.toHaveBeenCalled();
        expect(store.getState().isBusy).toBe(false);
        const legacy = JSON.stringify({ ...JSON.parse(saved), schemaVersion: 1 });
        localStorage.setItem('pi-initial-analysis-v1:session-1', legacy);
        expect(await recoverPiInitialAnalysisIfNeeded(store as never, stageToolStream())).toBeNull();
        expect(store.getState().initialAnalysisRecovery.reason).toBe('legacy_checkpoint_requires_prepared_rows');
        expect(localStorage.getItem('pi-initial-analysis-v1:session-1')).toBe(legacy);
        expect(stageMock).not.toHaveBeenCalled();
    });

    it('does not commit a suspended initial stage or its finalizer into a replacement session', async () => {
        let release!: () => void;
        let started!: () => void;
        const entered = new Promise<void>(resolve => { started = resolve; });
        const suspended = new Promise<void>(resolve => { release = resolve; });
        stageMock.mockImplementation(async ({ toolName, phase, context }) => {
            started();
            await suspended;
            context.store.setState({ finalSummary: 'Old session result' });
            return { decision: 'pass', phase, toolName, datasetVersion: context.request.datasetVersion,
                summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [] };
        });
        const store = createStore();
        const pending = runPiInitialAnalysis({
            appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
        }, store as never, stageToolStream());
        await entered;
        store.setState({ sessionId: 'session-2', finalSummary: 'New session',
            initialAnalysisStatus: 'idle', isBusy: false, isGeneratingReport: false });
        release();
        const result = await pending;
        expect(result.status).toBe('cancelled');
        expect(stageMock).toHaveBeenCalledTimes(1);
        expect(store.getState()).toMatchObject({ sessionId: 'session-2', finalSummary: 'New session',
            initialAnalysisStatus: 'idle', isBusy: false, isGeneratingReport: false });
    });


    it('lets Pi skip the optional cleaning stages and still completes the run', async () => {
        const names: string[] = [];
        passingStages(names);
        let calls = 0;
        const scripted = scriptedStageStream([
            {}, { stage: 'dataset.validatePreparedData', reason: 'No noise rows and no notes.' },
        ]);
        const outcome = await runStages((...args) => { calls += 1; return scripted(...args); });

        expect(outcome.status).toBe('completed');
        expect(calls).toBe(2);
        expect(names).not.toContain('dataset.suggestCleaningPlan');
        expect(names).not.toContain('dataset.applyTransform');
        expect(names.at(-1)).toBe('analysis.finalizeArtifacts');
    });

    it('never lets Pi skip a required stage and runs the next one after repeated bad requests', async () => {
        const names: string[] = [];
        passingStages(names);
        const outcome = await runStages(scriptedStageStream([
            { stage: 'analysis.executeEvidence' }, { stage: 'analysis.executeEvidence' },
            { stage: 'analysis.executeEvidence' }, {},
        ]));

        expect(names.slice(0, 2)).toEqual(['dataset.profileStructure', 'dataset.detectNoiseRows'].slice(0, 2));
        expect(names.indexOf('analysis.executeEvidence')).toBeGreaterThan(names.indexOf('dataset.validatePreparedData'));
        expect(names.indexOf('dataset.bindQueryEngine')).toBeLessThan(names.indexOf('analysis.executeEvidence'));
        expect(['completed', 'degraded']).toContain(outcome.status);
    });

    it('does not enter another required stage after cancellation inside a batched turn', async () => {
        const names: string[] = [];
        stageMock.mockImplementation(async ({ toolName, phase, context }) => {
            names.push(toolName);
            cancelPiInitialAnalysis('session-1');
            return { decision: 'pass', phase, toolName, datasetVersion: context.request.datasetVersion,
                summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [] };
        });
        const outcome = await runStages(stageToolStream());
        expect(outcome.status).toBe('cancelled');
        expect(names).toEqual(['dataset.profileStructure']);
    });

    it('stops the whole initial analysis when the user cancels', async () => {
        stageMock.mockImplementation(({ context }) => new Promise((_resolve, reject) => {
            context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
            setTimeout(() => cancelPiInitialAnalysis('session-1'), 0);
        }));
        const store = createStore();
        const outcome = await runPiInitialAnalysis({
            appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
        }, store as never, stageToolStream());

        expect(outcome.status).toBe('cancelled');
        expect(store.getState().initialAnalysisStatus).toBe('paused');
        expect(cancelPiInitialAnalysis('session-1')).toBe(false);
    });

    it('reports the real row count of the working dataset with each stage', async () => {
        stageMock.mockImplementation(async ({ toolName, phase, context }) => ({
            decision: 'pass', phase, toolName, datasetVersion: context.request.datasetVersion,
            summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [],
        }));
        const store = createStore();
        await runPiInitialAnalysis({
            appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
        }, store as never, stageToolStream());

        expect(updateAgentTaskStatus).toHaveBeenCalledWith(expect.anything(),
            expect.objectContaining({ currentStep: 1, rowCount: 1 }));
    });

    it('restores a saved research plan when a run resumes from its checkpoint', async () => {
        stageMock.mockImplementation(async ({ toolName, phase, context }) => ({
            decision: 'pass', phase, toolName, datasetVersion: context.request.datasetVersion,
            summary: 'ok', warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [],
        }));
        const store = createStore();
        store.setState({ confirmedAnalysisGoal: 'Find patterns.' });
        const version = getCurrentAnalysisDatasetVersion(store.getState());
        const plan = {
            datasetVersion: version, consumed: false, rejected: [],
            questions: [{ title: 'Q', rationale: '', dimension: 'Town', metric: 'Amount', aggregation: 'avg', comparison: null }],
        };
        localStorage.setItem('pi-initial-analysis-v1:session-1', JSON.stringify({
            schemaVersion: 1, sessionId: 'session-1', datasetVersion: version, researchGoal: 'Find patterns.',
            nextStageIndex: 8, pendingStageIndex: null, committedTransformationIds: [], cardFingerprints: [],
            warnings: [], researchPlan: plan,
        }));
        // Recovery needs a stream; the production stream is not reachable offline, so a failure is fine here.
        await recoverPiInitialAnalysisIfNeeded(store as never).catch(() => null);

        expect(store.getState().initialAnalysisPlan).toEqual(plan);
    });

    it('runs all governed initial-analysis stages in order through the Pi tool loop', async () => {
        const stageNames: string[] = [];
        stageMock.mockImplementation(async ({ toolName, phase, context }) => {
            stageNames.push(toolName);
            return {
                decision: 'pass', phase, toolName,
                datasetVersion: context.request.datasetVersion,
                summary: `${toolName} completed`,
                warningCodes: [], artifactRefs: [], transformationIds: [], cardIds: [],
            };
        });
        let calls = 0;
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            calls += 1;
            const message: AssistantMessage = {
                role: 'assistant',
                content: [{ type: 'toolCall', id: `stage-${calls}`, name: 'run_next_analysis_stage', arguments: {} }],
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        const store = createStore();
        const outcome = await runPiInitialAnalysis({
            appSessionId: 'session-1',
            datasetId: 'dataset-1',
            datasetVersion: 'version-1',
            researchGoal: 'Find patterns.',
            provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
        }, store as never, stream);

        expect(outcome.status).toBe('completed');
        expect(stageNames).toEqual([
            'dataset.profileStructure',
            'dataset.detectNoiseRows',
            'dataset.suggestCleaningPlan',
            'dataset.applyTransform',
            'dataset.validatePreparedData',
            'dataset.bindQueryEngine',
            'analysis.researchQuestions',
            'analysis.executeEvidence',
            'analysis.finalizeArtifacts',
        ]);
        expect(calls).toBe(3);
        expect(store.getState().initialAnalysisStatus).toBe('ready');
    });

    it('retains a premature Responses stream as a failed provider run without automatic retry', async () => {
        const stream = vi.fn(() => {
            throw new Error('OpenAI Responses stream ended before a terminal response event');
        });
        const store = createStore();
        const outcome = await runPiInitialAnalysis({
            appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'mock' },
        }, store as never, stream);
        expect(outcome.status).toBe('failed');
        expect(store.getState().initialAnalysisStatus).toBe('error');
        expect(store.getState().initialAnalysisFailureKind).toBe('provider');
        expect(stream).toHaveBeenCalledOnce();
        expect(stageMock).not.toHaveBeenCalled();
    });

    it('records a provider failure when Pi returns an assistant stream error', async () => {
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant', content: [], api: model.api, provider: model.provider,
                model: model.id, usage, stopReason: 'error', errorMessage: 'Upstream request failed',
                timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'error', reason: 'error', error: message });
            return output;
        };
        const store = createStore();
        const outcome = await runPiInitialAnalysis({
            appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
        }, store as never, stream);

        expect(outcome.status).toBe('failed');
        expect(store.getState().initialAnalysisStatus).toBe('error');
        expect(store.getState().initialAnalysisFailureKind).toBe('provider');
    });

    it('shows a plain-language message with the gateway code when the shared service rejects a request', async () => {
        const rawError = 'OpenAI API error (400): {"message":"content is not allowed in reasoning items","code":"DEMO_FIELD_DISABLED"}';
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant', content: [], api: model.api, provider: model.provider,
                model: model.id, usage, stopReason: 'error', errorMessage: rawError,
                timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'error', reason: 'error', error: message });
            return output;
        };
        const store = createStore();
        const outcome = await runPiInitialAnalysis({
            appSessionId: 'session-1', datasetId: 'dataset-1', datasetVersion: 'version-1',
            researchGoal: 'Find patterns.', provider: { provider: 'openai', modelId: 'gpt-5.4-mini' },
        }, store as never, stream);

        const statusCall = vi.mocked(updateAgentTaskStatus).mock.calls.at(-1)?.[1] as { subtitle?: string };
        expect(statusCall.subtitle).toContain('The shared AI service rejected this request.');
        expect(statusCall.subtitle).toContain('(DEMO_FIELD_DISABLED)');
        expect(statusCall.subtitle).not.toContain('reasoning items');
        // Diagnostics keep the raw text.
        expect(outcome.error?.message).toContain('content is not allowed in reasoning items');
    });


    it('fences late follow-up tools and finalizers while a replacement run is streaming', async () => {
        const store = createStore();
        let entered!: () => void;
        let release!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const pending = new Promise<void>(resolve => { release = resolve; });
        actionMock.mockImplementationOnce(async (_action, owned) => {
            entered(); await pending;
            owned.setState({ analysisCards: [{ id: 'stale-card' }] });
            return { status: 'success', message: 'old query' };
        });
        const oldStream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = { role: 'assistant', content: [{ type: 'toolCall', id: 'old-query', name: 'data_query', arguments: { explanation: 'Old', plan: { select: ['Amount'] } } }],
                api: model.api, provider: model.provider, model: model.id, usage, stopReason: 'toolUse', timestamp: Date.now() };
            output.push({ type: 'start', partial: message }); output.push({ type: 'done', reason: 'toolUse', message }); return output;
        };
        const old = runPiFollowUpTurn({ message: 'old data' }, store as never, oldStream);
        await started;
        beginSessionTransition(store as never);
        store.setState({ sessionId: 'replacement', analysisCards: [{ id: 'kept', plan: { title: 'Kept card', chartType: 'bar', groupByColumn: 'Town', valueColumn: 'Amount', aggregation: 'sum' }, aggregatedData: [{ Town: 'A', Amount: 10 }] }], isBusy: false });
        let finish!: () => void;
        let streaming!: () => void;
        const streamingStarted = new Promise<void>(resolve => { streaming = resolve; });
        const newStream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: 'Hello' }], api: model.api, provider: model.provider,
                model: model.id, usage, stopReason: 'stop', timestamp: Date.now() };
            output.push({ type: 'start', partial: message });
            finish = () => output.push({ type: 'done', reason: 'stop', message });
            streaming(); return output;
        };
        const current = runPiFollowUpTurn({ message: 'Hello' }, store as never, newStream);
        await Promise.race([streamingStarted, current.then(result => { throw new Error(`Replacement ended before streaming: ${result.text}`); })]);
        const runId = store.getState().activeExecution.runId;
        release();
        expect((await old).status).toBe('cancelled');
        expect(store.getState().analysisCards).toEqual([{ id: 'kept', plan: { title: 'Kept card', chartType: 'bar', groupByColumn: 'Town', valueColumn: 'Amount', aggregation: 'sum' }, aggregatedData: [{ Town: 'A', Amount: 10 }] }]);
        expect(store.getState().isBusy).toBe(true);
        expect(store.getState().activeExecution.runId).toBe(runId);
        finish();
        expect((await current).status).toBe('completed');
        expect(finalizeMock).toHaveBeenCalledTimes(1);
    });

});
