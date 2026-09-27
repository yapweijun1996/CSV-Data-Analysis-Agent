import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { resolvePiModel, resolvePiThinkingLevel } from '../services/agent/runtime/pi/piProvider';

const { persistMock, memoryMock, consentMock, finalizeMock, stageMock } = vi.hoisted(() => ({
    persistMock: vi.fn(async () => true),
    memoryMock: vi.fn(async () => []),
    consentMock: vi.fn(async () => undefined),
    finalizeMock: vi.fn(),
    stageMock: vi.fn(),
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
vi.mock('../services/agent/analysisCompletionGate', () => ({
    resolveAnalysisCompletionGate: () => ({ trustedBusinessCardIds: ['card-1'] }),
}));
vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: vi.fn(),
    updateAgentTaskStatus: vi.fn(),
}));

import { runPiFollowUpTurn } from '../services/agent/runtime/pi/piFollowUpRuntimeService';
import { runPiInitialAnalysis } from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import { recoverPiInitialAnalysisIfNeeded } from '../services/agent/runtime/pi/piInitialAnalysisRuntimeService';
import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';

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
        columnProfiles: [],
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
    } as any;
    return {
        getState: () => state,
        setState: (patch: any) => {
            state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
        },
    };
};

describe('Pi production runtime', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses the app-selected OpenAI, Google, and shared gateway models', () => {
        const settings = createStore().getState().settings;
        expect(resolvePiModel(settings).id).toBe('gpt-5.4-mini');
        expect(resolvePiModel(settings).contextWindow).toBe(200_000);
        expect(resolvePiThinkingLevel(settings)).toBe('medium');
        expect(resolvePiModel({ ...settings, provider: 'google', complexModel: 'gemini-2.5-flash' }).provider).toBe('google');
        const gatewayModel = resolvePiModel({ ...settings, provider: 'default' });
        expect(gatewayModel.baseUrl).toBe('https://gpt.yapweijun1996.com/v1');
        expect(gatewayModel.contextWindow).toBe(200_000);
        expect(gatewayModel.compat).toMatchObject({ supportsMaxOutputTokens: false });
        expect(resolvePiModel(settings).compat).not.toMatchObject({ supportsMaxOutputTokens: false });
    });

    it('completes a keyless Pi follow-up and projects the answer into the app contract', async () => {
        const store = createStore();
        const result = await runPiFollowUpTurn(
            { message: 'Summarize the current data.' },
            store as never,
            answerStream('The dataset has one row.'),
        );

        expect(result).toMatchObject({ status: 'completed', text: 'The dataset has one row.' });
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({
                outcomeKind: 'accepted',
                assistantMessage: 'The dataset has one row.',
                eventDetail: { runtimeOwner: 'pi' },
            }),
        }));
        expect(consentMock).not.toHaveBeenCalled();
    });

    it('stops a proposed mutation at the app approval boundary', async () => {
        const args = {
            explanation: 'Normalize region labels.',
            outputColumns: [],
            operations: [{ type: 'replace_values', id: 'normalize-region', reason: 'Normalize labels',
                column: 'Town', replacements: [{ from: 'A', to: 'Alpha' }] }],
        };
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant',
                content: [{ type: 'toolCall', id: 'mutation-1', name: 'data_mutate', arguments: args }],
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        const store = createStore();
        const result = await runPiFollowUpTurn({ message: 'Normalize the Town values.' }, store as never, stream);
        expect(result.status).toBe('blocked');
        expect(store.getState().pendingClarification?.resumeContext?.piMutationApproval?.args).toEqual(args);
        expect(store.getState().pendingClarification?.interactionKind).toBe('approval');
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
        expect(calls).toBe(9);
        expect(store.getState().initialAnalysisStatus).toBe('ready');
    });
});
