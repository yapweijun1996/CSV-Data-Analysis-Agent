import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import type { CsvData, DataPreparationPlan } from '../types';
import type { StoreApi } from '../services/agent/types';

const {
    processAndCleanFileMock,
    orchestrateAutonomousAiCleaningMock,
    getAgentMemoryRunsMock,
    vectorInitMock,
    enqueueDatasetMemoryDocsMock,
    resolveReportStructureArtifactsWithProposalMock,
    saveOriginalDataMock,
} = vi.hoisted(() => ({
    processAndCleanFileMock: vi.fn(),
    orchestrateAutonomousAiCleaningMock: vi.fn(),
    getAgentMemoryRunsMock: vi.fn(),
    vectorInitMock: vi.fn(),
    enqueueDatasetMemoryDocsMock: vi.fn(),
    resolveReportStructureArtifactsWithProposalMock: vi.fn(),
    saveOriginalDataMock: vi.fn(),
}));

vi.mock('../services/agent/fileProcessor', () => ({
    processAndCleanFile: processAndCleanFileMock,
}));

vi.mock('../services/agent/orchestration/autonomousCleaningPipeline', () => ({
    orchestrateAutonomousAiCleaning: orchestrateAutonomousAiCleaningMock,
}));

vi.mock('../services/storageService', () => ({
    deleteReport: vi.fn().mockResolvedValue(undefined),
    getReport: vi.fn().mockResolvedValue(null),
    saveReport: vi.fn().mockResolvedValue(undefined),
    getAgentMemoryRuns: getAgentMemoryRunsMock,
    saveOriginalData: saveOriginalDataMock,
    CURRENT_SESSION_KEY: 'current-session',
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        clear: vi.fn(),
        init: vectorInitMock,
        getDocuments: vi.fn(() => []),
    },
}));

vi.mock('../services/agent/memory/vectorMemorySync', () => ({
    enqueueDatasetMemoryDocs: enqueueDatasetMemoryDocsMock,
}));

vi.mock('../services/agent/orchestration/reportStructureOrchestrator', () => ({
    resolveReportStructureArtifactsWithProposal: resolveReportStructureArtifactsWithProposalMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    isProviderConfigured: vi.fn(() => true),
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

const importReadyData: CsvData = {
    fileName: 'fr_fin_pl_prj.csv',
    data: [{ Project: 'A', Amount: '100' }],
    metadataRows: [],
    summaryRows: [],
    headerDepth: 1,
};

const importReadyPlan: DataPreparationPlan = {
    explanation: 'Ready for AI cleaning.',
    operations: [],
    outputColumns: [
        { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
        { name: 'Amount', type: 'currency', missingPercentage: 0, valueRange: [100, 100] },
    ],
    planStatus: 'schema_only',
    consistencyIssues: [],
};

const createStore = () => {
    const callOrder: string[] = [];
    const state = {
        settings: {
            provider: 'google',
            geminiApiKey: 'key',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'Mandarin',
            autoConfirmGoal: false,
            runtimeAccessControl: {
                permissionMode: 'balanced',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        },
        csvData: null,
        rawCsvData: null,
        reportContextResolution: null,
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        initialDataSample: null,
        columnProfiles: [],
        dataPreparationPlan: null,
        dataQualityIssues: [],
        activeDataQuery: null,
        activeAnalysisSession: {
            runId: 'stale-run',
            status: 'completed',
        },
        latestAnalysisSession: {
            runId: 'stale-run',
            status: 'completed',
        },
        visibleAnalysisTrace: [{ stepIndex: 1, label: 'Stale trace' }],
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        queryHistory: [],
        agentMemoryRun: null,
        liveAgentMemoryRun: null,
        agentMemoryHistory: [],
        selectedMemoryRunId: null,
        currentDatasetId: null,
        workspaceFiles: {},
        isBusy: false,
        currentView: 'upload',
        cleaningRun: null,
        duckDbSessionStatus: { status: 'idle' },
        chatHistory: [],
        agentEvents: [],
        vectorStoreDocuments: [],
        vectorMemoryState: 'cold',
        pendingVectorMemoryDocs: [],
        reportStructureResolution: null,
        canonicalCsvData: null,
        canonicalBuildMeta: null,
        canonicalizationStatus: 'idle',
        pipelineOutcome: null,
        clearAgentEvents: vi.fn(),
        clearTelemetry: vi.fn(),
        recordAgentEvent: vi.fn((payload: any) => {
            state.agentEvents.push(payload);
        }),
        addProgress: vi.fn(),
        setIsReportBoundaryConfirmModalOpen: vi.fn(),
        saveReportStructureBoundaryOverride: vi.fn(),
        refreshDuckDbSession: vi.fn(async () => {
            callOrder.push('refresh_duckdb');
        }),
        ensureDatasetSemanticSnapshot: vi.fn(async () => {
            callOrder.push('semantic_annotation');
            return null;
        }),
        handleInitialAnalysis: vi.fn(async () => {
            callOrder.push('initial_analysis');
            return { status: 'ready' };
        }),
        proposeAnalysisGoals: vi.fn(async () => {
            callOrder.push('goal_proposal');
        }),
    } as unknown as AppStore & { agentEvents: any[] };

    const store: StoreApi = {
        getState: () => state,
        setState: partial => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
        },
    };

    return { store, state, callOrder };
};

const createProcessGeneratorResult = () => ({
    dataForAnalysis: importReadyData,
    rawData: importReadyData,
    initialDataSample: importReadyData.data,
    columnProfiles: importReadyPlan.outputColumns,
    dataPrepPlan: importReadyPlan,
    dataQualityIssues: [],
    datasetId: 'dataset-1',
    workspaceFiles: {},
    reportContextResolution: null,
});

const flushPostImportPipeline = async () => {
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await Promise.resolve();
};

const drainFileOrchestrator = async (
    generator: AsyncGenerator<import('../services/agent/orchestration/fileOrchestrator').FileOrchestrationUpdate, void, unknown>,
    store: StoreApi,
) => {
    let next = await generator.next();
    while (!next.done) {
        const update = next.value as import('../services/agent/orchestration/fileOrchestrator').FileOrchestrationUpdate;
        if (update.type === 'state') {
            store.setState(update.payload);
        }
        next = await generator.next();
    }
};

describe('orchestrateFileUpload post-import pipeline timing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        getAgentMemoryRunsMock.mockResolvedValue([]);
        saveOriginalDataMock.mockResolvedValue(undefined);
        vectorInitMock.mockImplementation(async () => undefined);
        enqueueDatasetMemoryDocsMock.mockImplementation(() => undefined);
        processAndCleanFileMock.mockImplementation(() => (async function* () {
            return createProcessGeneratorResult();
        })());
        resolveReportStructureArtifactsWithProposalMock.mockResolvedValue({
            reportStructureResolution: null,
            canonicalCsvData: importReadyData,
            canonicalBuildMeta: null,
            canonicalizationStatus: 'ready',
            pipelineOutcome: {
                status: 'ready',
                canAutoAnalyze: true,
                severity: 'info',
                reasonCode: 'ready',
                message: 'Ready.',
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not call vectorStore.init during the import pipeline (PERF-101)', async () => {
        const { store, state, callOrder } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async (activeStore: StoreApi) => {
            callOrder.push('cleaning');
            activeStore.setState(prev => ({
                cleaningRun: {
                    ...prev.cleaningRun,
                    status: 'completed',
                    sqlPrecheckStatus: 'passed',
                },
                csvData: importReadyData,
            }));
        });

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        await flushPostImportPipeline();

        // Vector init must NOT be called during the import pipeline.
        expect(vectorInitMock).not.toHaveBeenCalled();
        // Import orchestration no longer owns governed stage work.
        expect(enqueueDatasetMemoryDocsMock).not.toHaveBeenCalled();
        expect(state.ensureDatasetSemanticSnapshot).not.toHaveBeenCalled();
        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
        expect(state.proposeAnalysisGoals).toHaveBeenCalledTimes(1);
    });

    it('does not block import completion when optional memory history remains pending', async () => {
        const { store, state } = createStore();
        getAgentMemoryRunsMock.mockImplementation(() => new Promise(() => undefined));

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        expect(state.currentView).toBe('analysis_dashboard');
        expect(state.csvData).toEqual(importReadyData);
        expect(state.isBusy).toBe(false);
        expect(state.agentMemoryHistory).toEqual([]);
        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
    });

    it('continues degraded analysis after cleaning completes even when sql precheck is blocked', async () => {
        const { store, state, callOrder } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async (activeStore: StoreApi) => {
            callOrder.push('cleaning');
            activeStore.setState(prev => ({
                cleaningRun: {
                    ...prev.cleaningRun,
                    status: 'completed',
                    sqlPrecheckStatus: 'blocked',
                    lastError: 'SQL precheck blocked.',
                },
                csvData: importReadyData,
            }));
        });

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        await flushPostImportPipeline();

        // No vector init during pipeline.
        expect(vectorInitMock).not.toHaveBeenCalled();
        expect(enqueueDatasetMemoryDocsMock).not.toHaveBeenCalled();
        expect(state.ensureDatasetSemanticSnapshot).not.toHaveBeenCalled();
        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
        expect(state.proposeAnalysisGoals).toHaveBeenCalledTimes(1);
    });

    it('delegates cleaning outcomes to the single Pi lifecycle owner', async () => {
        const { store, state, callOrder } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async (activeStore: StoreApi) => {
            callOrder.push('cleaning');
            activeStore.setState(prev => ({
                cleaningRun: {
                    ...prev.cleaningRun,
                    status: 'failed',
                    lastError: 'Cleaning failed.',
                },
            }));
        });

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        await flushPostImportPipeline();

        expect(vectorInitMock).not.toHaveBeenCalled();
        expect(enqueueDatasetMemoryDocsMock).not.toHaveBeenCalled();
        expect(state.ensureDatasetSemanticSnapshot).not.toHaveBeenCalled();
        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
        expect(state.proposeAnalysisGoals).toHaveBeenCalledTimes(1);
    });

    it('records the Pi lifecycle owner at the import boundary', async () => {
        const { store, state, callOrder } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async (activeStore: StoreApi) => {
            callOrder.push('cleaning');
            activeStore.setState(prev => ({
                cleaningRun: {
                    ...prev.cleaningRun,
                    status: 'completed',
                    sqlPrecheckStatus: 'warning',
                },
                csvData: importReadyData,
            }));
        });

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);
        await flushPostImportPipeline();

        expect(state.agentEvents.some(event =>
            event.step === 'pipeline_import_ready'
            && event.status === 'done'
            && event.detail?.runtimeOwner === 'pi',
        )).toBe(true);
        expect(state.ensureDatasetSemanticSnapshot).not.toHaveBeenCalled();
        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
        expect(state.proposeAnalysisGoals).toHaveBeenCalledTimes(1);
    });

    it('clears stale analysis session state when a new file upload starts', async () => {
        const { store, state } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async () => undefined);

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        expect(state.activeAnalysisSession).toBeNull();
        expect(state.latestAnalysisSession).toBeNull();
        expect(state.visibleAnalysisTrace).toEqual([]);
    });

    it('clears chat and follow-up runtime state at a fresh dataset boundary', async () => {
        const { store, state } = createStore();
        (state as any).chatHistory = [{ id: 'old-chat', sender: 'ai', text: 'Old dataset result', timestamp: new Date() }];
        (state as any).pendingClarification = { id: 'old-question' };
        (state as any).activeTurn = { id: 'old-turn', status: 'running' };
        (state as any).queuedChatTurns = [{ id: 'queued-old-turn' }];
        orchestrateAutonomousAiCleaningMock.mockImplementation(async () => undefined);

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        expect(state.chatHistory).toEqual([]);
        expect((state as any).pendingClarification).toBeNull();
        expect((state as any).activeTurn).toBeNull();
        expect((state as any).queuedChatTurns).toEqual([]);
    });

    it('resets vectorMemoryState and pendingVectorMemoryDocs on new upload', async () => {
        const { store, state } = createStore();
        // Pre-populate to simulate stale state
        (state as any).vectorMemoryState = 'ready';
        (state as any).pendingVectorMemoryDocs = [{ id: 'stale', text: 'stale' }];

        orchestrateAutonomousAiCleaningMock.mockImplementation(async () => undefined);

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        expect(state.vectorMemoryState).toBe('cold');
        expect(state.pendingVectorMemoryDocs).toEqual([]);
    });

    it('stops before goal proposals when automatic analysis is paused by intake diagnostics', async () => {
        const { store, state, callOrder } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async (activeStore: StoreApi) => {
            callOrder.push('cleaning');
            activeStore.setState(prev => ({
                cleaningRun: {
                    ...prev.cleaningRun,
                    status: 'completed',
                    sqlPrecheckStatus: 'passed',
                },
                csvData: importReadyData,
            }));
        });
        state.handleInitialAnalysis = vi.fn(async () => {
            callOrder.push('initial_analysis');
            return {
                status: 'paused' as const,
                reasonCode: 'parse_errors' as const,
                message: 'Automatic analysis is paused pending import review.',
            };
        });

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );

        await drainFileOrchestrator(generator, store);

        await flushPostImportPipeline();

        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
        expect(state.proposeAnalysisGoals).not.toHaveBeenCalled();
        expect(state.agentEvents.some(event =>
            event.step === 'pipeline_cleaning'
            && event.status === 'done'
            && /goal proposal can continue/i.test(event.message),
        )).toBe(false);
    });

    it('does not block low-confidence imports on a boundary confirmation modal', async () => {
        const { store, state, callOrder } = createStore();
        orchestrateAutonomousAiCleaningMock.mockImplementation(async (activeStore: StoreApi) => {
            callOrder.push('cleaning');
            activeStore.setState(prev => ({
                cleaningRun: {
                    ...prev.cleaningRun,
                    status: 'completed',
                    sqlPrecheckStatus: 'passed',
                },
                csvData: importReadyData,
            }));
        });
        resolveReportStructureArtifactsWithProposalMock.mockResolvedValueOnce({
            reportStructureResolution: {
                requiresHumanReview: true,
                blockingReasons: ['complex_report_requires_confirmation'],
                decision: {
                    targetShape: 'long_fact_table',
                    shouldCanonicalize: false,
                    reason: 'Low-confidence reshape requires confirmation.',
                },
            },
            canonicalCsvData: importReadyData,
            canonicalBuildMeta: null,
            canonicalizationStatus: 'needs_review',
            pipelineOutcome: {
                status: 'needs_structure_review',
                canAutoAnalyze: false,
                severity: 'warning',
                reasonCode: 'complex_report_requires_confirmation',
                message: 'Structure review is required.',
            },
        });

        const generator = (await import('../services/agent/orchestration/fileOrchestrator')).orchestrateFileUpload(
            { name: 'fr_fin_pl_prj.csv', size: 1 } as File,
            store,
        );
        await drainFileOrchestrator(generator, store);
        await flushPostImportPipeline();

        expect(state.setIsReportBoundaryConfirmModalOpen).not.toHaveBeenCalled();
        expect(state.saveReportStructureBoundaryOverride).not.toHaveBeenCalled();
        expect(state.ensureDatasetSemanticSnapshot).not.toHaveBeenCalled();
        expect(state.handleInitialAnalysis).toHaveBeenCalledTimes(1);
        expect(state.agentEvents.some(event =>
            event.step === 'structure_confirmation_required',
        )).toBe(false);
    });
});
