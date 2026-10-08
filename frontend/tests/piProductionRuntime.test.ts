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

    it('does not report success when Pi answers a card request without creating one', async () => {
        const store = createStore();
        const result = await runPiFollowUpTurn({
            message: 'Add a dashboard card by Town.',
            intentFindings: { intent: 'precise_card' } as never,
        }, store as never, answerStream('Here are the values; I cannot save a card.'));

        expect(result.status).toBe('failed');
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({
                outcomeKind: 'failed',
                failureClass: 'tool_execution',
                assistantCardId: null,
            }),
        }));
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
        }), store, expect.any(Object));
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

    it('creates several distinct cards for an open-ended batch analysis request', async () => {
        const store = createStore();
        const makePlan = (title: string, groupByColumn: string) => ({
            title, description: title, chartType: 'bar', groupByColumn, valueColumn: 'Amount', aggregation: 'sum',
        });
        const plans = [makePlan('Amount by Town', 'Town'), makePlan('Amount by Flat', 'Flat'), makePlan('Amount by Year', 'Year')];
        let created = 0;
        actionMock.mockImplementation(async () => {
            const index = created;
            created += 1;
            store.setState((prev: any) => ({ analysisCards: [...prev.analysisCards, {
                id: `batch-card-${index}`, plan: plans[index], aggregatedData: [{ Town: 'A', Amount: 10 }],
            }] }));
            return { status: 'success', message: 'Created analysis card.', artifacts: { createdCardId: `batch-card-${index}` } };
        });
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant',
                content: plans.map((plan, index) => ({
                    type: 'toolCall' as const, id: `create-card-${index}`, name: 'analysis_create_plan', arguments: { plan },
                })),
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        const result = await runPiFollowUpTurn({
            message: 'Analyze this dataset from several angles.',
            intentFindings: { intent: 'batch_analysis' } as never,
        }, store as never, stream);

        expect(result.status).toBe('completed');
        expect(result.text).toContain('Created 3 dashboard cards');
        expect(actionMock).toHaveBeenCalledTimes(3);
        expect(store.getState().analysisCards.map((card: any) => card.autoAnalysisEvaluation?.source))
            .toEqual(Array(3).fill('auto_analysis_evaluator_v1'));
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ outcomeKind: 'accepted', assistantCardId: 'batch-card-2' }),
        }));
        actionMock.mockReset();
    });

    it('reports batch cards removed by the evidence gate and keeps the survivors', async () => {
        const store = createStore();
        const makePlan = (title: string) => ({
            title, description: title, chartType: 'bar', groupByColumn: 'Town', valueColumn: 'Amount', aggregation: 'sum',
        });
        const plans = [makePlan('Amount by Town'), makePlan('Amount by Town again'), makePlan('Amount by Flat')];
        let created = 0;
        actionMock.mockImplementation(async () => {
            const index = created;
            created += 1;
            store.setState((prev: any) => ({ analysisCards: [...prev.analysisCards, {
                id: `gate-card-${index}`, plan: plans[index], aggregatedData: [{ Town: 'A', Amount: 10 }],
            }] }));
            return { status: 'success', message: 'Created analysis card.', artifacts: { createdCardId: `gate-card-${index}` } };
        });
        gateMock.mockImplementation((_store: unknown, ids: string[]) => {
            store.setState((prev: any) => ({ analysisCards: prev.analysisCards.filter((card: any) => card.id !== 'gate-card-1') }));
            return {
                rejected: ids.includes('gate-card-1')
                    ? [{ cardId: 'gate-card-1', title: 'Amount by Town again', detail: 'duplicate_semantic' }] : [],
                tableOnlyIds: ['gate-card-0'],
            };
        });
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant',
                content: plans.map((plan, index) => ({
                    type: 'toolCall' as const, id: `create-card-${index}`, name: 'analysis_create_plan', arguments: { plan },
                })),
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        const result = await runPiFollowUpTurn({
            message: 'Analyze this dataset from several angles.',
            intentFindings: { intent: 'batch_analysis' } as never,
        }, store as never, stream);

        expect(result.status).toBe('completed');
        expect(result.text).toContain('table presentation only');
        expect(result.text).toContain('"Amount by Town again": duplicate_semantic');
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({ assistantCardId: 'gate-card-2' }),
        }));
        actionMock.mockReset();
    });

    it('does not apply the evidence gate to an explicit card request', async () => {
        const store = createStore();
        const plan = { title: 'T', description: 'T', chartType: 'bar', groupByColumn: 'Town', valueColumn: 'Amount', aggregation: 'sum' };
        actionMock.mockImplementationOnce(async () => {
            store.setState({ analysisCards: [{ id: 'explicit-card', plan, aggregatedData: [{ Town: 'A', Amount: 1 }] }] });
            return { status: 'success', message: 'ok', artifacts: { createdCardId: 'explicit-card' } };
        });
        const stream: StreamFn = model => {
            const output = createAssistantMessageEventStream();
            const message: AssistantMessage = {
                role: 'assistant',
                content: [{ type: 'toolCall', id: 'c1', name: 'analysis_create_plan', arguments: { plan } }],
                api: model.api, provider: model.provider, model: model.id,
                usage, stopReason: 'toolUse', timestamp: Date.now(),
            };
            output.push({ type: 'start', partial: message });
            output.push({ type: 'done', reason: 'toolUse', message });
            return output;
        };
        await runPiFollowUpTurn({
            message: 'Add a dashboard card by Town.',
            intentFindings: { intent: 'precise_card' } as never,
        }, store as never, stream);

        expect(gateMock).not.toHaveBeenCalled();
    });

    it('accepts a text answer for batch analysis when Pi finds no card worth saving', async () => {
        const store = createStore();
        const result = await runPiFollowUpTurn({
            message: 'Analyze this dataset from several angles.',
            intentFindings: { intent: 'batch_analysis' } as never,
        }, store as never, answerStream('The data has a single row, so no angle is meaningful.'));

        expect(result).toMatchObject({ status: 'completed' });
        expect(actionMock).not.toHaveBeenCalled();
    });

    it('keeps a saved card as completed when the turn fails after card creation', async () => {
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

        expect(result.status).toBe('completed');
        expect(finalizeMock).toHaveBeenCalledWith(expect.objectContaining({
            outcome: expect.objectContaining({
                outcomeKind: 'accepted',
                retryable: false,
                assistantCardId: 'created-card',
            }),
        }));
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

    it('lets Pi skip the optional cleaning stages and still completes the run', async () => {
        const names: string[] = [];
        passingStages(names);
        const outcome = await runStages(scriptedStageStream([
            {}, {}, { stage: 'dataset.validatePreparedData', reason: 'No noise rows and no notes.' }, {},
        ]));

        expect(outcome.status).toBe('completed');
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
        expect(calls).toBe(9);
        expect(store.getState().initialAnalysisStatus).toBe('ready');
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
});
