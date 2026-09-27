import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistorySlice } from '../store/slices/historySlice';
import { UNFINISHED_CLEANING_HISTORY_LOAD_TEXT } from '../utils/messageState';

const storageMocks = vi.hoisted(() => ({
    getReportsList: vi.fn(async () => []),
    saveReport: vi.fn(async () => undefined),
    getReport: vi.fn(),
    deleteReport: vi.fn(async () => undefined),
    deleteOriginalData: vi.fn(async () => undefined),
    currentSessionKey: 'current_session',
}));

const vectorMemoryMocks = vi.hoisted(() => ({
    rebuildVectorMemoryFromState: vi.fn<
        (
            store: Record<string, unknown>,
            options?: { reset?: boolean; includeDatasetDocs?: boolean; progressMessage?: string },
        ) => Promise<void>
    >(async () => undefined),
}));

vi.mock('../services/storageService', () => ({
    getReportsList: storageMocks.getReportsList,
    saveReport: storageMocks.saveReport,
    getReport: storageMocks.getReport,
    deleteReport: storageMocks.deleteReport,
    deleteOriginalData: storageMocks.deleteOriginalData,
    CURRENT_SESSION_KEY: storageMocks.currentSessionKey,
}));

const vectorStoreMock = vi.hoisted(() => ({
    clear: vi.fn(),
    rehydrate: vi.fn(),
    schedulePersist: vi.fn(),
    loadFromStorage: vi.fn(async () => false),
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: vectorStoreMock,
}));

vi.mock('../services/agent/memory/vectorMemorySync', () => ({
    rebuildVectorMemoryFromState: vectorMemoryMocks.rebuildVectorMemoryFromState,
}));

vi.mock('../services/agent/execution/dataOperationRunner', () => ({
    normalizeDataPreparationPlan: (plan: unknown) => plan,
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    disposeDuckDbQueryEngine: vi.fn(async () => undefined),
}));

vi.mock('../services/agent/cleaningRunState', () => ({
    updateCleaningRun: (run: Record<string, unknown> | null, updates: Record<string, unknown>) => ({ ...(run ?? {}), ...updates }),
}));

describe('history slice load guards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    it('blocks load when an AI turn is actively running', async () => {
        const addProgress = vi.fn();
        let state: Record<string, unknown> = {
            addProgress,
            activeTurn: { turnId: 'turn-1', status: 'running' },
            chatHistory: [],
        };
        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-1');

        // Should show error and NOT call getReport
        expect(addProgress).toHaveBeenCalledWith(
            expect.stringContaining('Cannot load a report while an AI turn is running'),
            'error',
        );
        expect(storageMocks.getReport).not.toHaveBeenCalled();
    });

    it('allows load when activeTurn is null', async () => {
        storageMocks.getReport.mockResolvedValue({
            id: 'report-ok',
            filename: 'OK Report',
            createdAt: new Date(),
            updatedAt: new Date(),
            appState: {
                sessionId: 'report-ok',
                currentView: 'file_upload',
                csvData: null,
                columnProfiles: [],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: null,
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
            },
        });
        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            activeTurn: null,
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: false,
            isDataPreparationModalOpen: false,
            isDebugLogsModalOpen: false,
            chatHistory: [],
        };
        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-ok');

        expect(storageMocks.getReport).toHaveBeenCalledWith('report-ok');
    });

    it('allows load when activeTurn exists but is not running', async () => {
        storageMocks.getReport.mockResolvedValue({
            id: 'report-ok2',
            filename: 'OK Report 2',
            createdAt: new Date(),
            updatedAt: new Date(),
            appState: {
                sessionId: 'report-ok2',
                currentView: 'file_upload',
                csvData: null,
                columnProfiles: [],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: null,
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
            },
        });
        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            activeTurn: { turnId: 'turn-done', status: 'completed' },
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: false,
            isDataPreparationModalOpen: false,
            isDebugLogsModalOpen: false,
            chatHistory: [],
        };
        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-ok2');

        expect(storageMocks.getReport).toHaveBeenCalledWith('report-ok2');
    });

    it('clears persisted transient busy indicators when loading a completed report', async () => {
        storageMocks.getReport.mockResolvedValue({
            id: 'report-transient-busy',
            filename: 'Completed Report',
            createdAt: new Date(),
            updatedAt: new Date(),
            appState: {
                sessionId: 'report-transient-busy',
                currentView: 'analysis_dashboard',
                csvData: {
                    fileName: 'completed.csv',
                    data: [{ Region: 'East', Revenue: 1 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                columnProfiles: [{ name: 'Revenue', type: 'numerical' }],
                analysisCards: [{ id: 'card-1' }],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: {
                    runId: 'cleaning-complete',
                    status: 'completed',
                    currentStep: 1,
                    steps: [],
                    startedAt: new Date(),
                    updatedAt: new Date(),
                    targetPath: '/dataset/cleaned.csv',
                    shouldAutoResume: false,
                },
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
                isBusy: true,
                chatLifecycleState: 'running',
                isGeneratingReport: true,
                isSummaryGenerating: true,
                reportGenerationProgress: { current: 1, total: 2, label: 'Generating' },
                isCardReviewInProgress: true,
                aiTaskStatus: { status: 'thinking', message: 'Stale task' },
            },
        });
        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            activeTurn: null,
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: false,
            isDataPreparationModalOpen: false,
            isDebugLogsModalOpen: false,
            chatHistory: [],
        };
        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-transient-busy');

        expect(state.isBusy).toBe(false);
        expect(state.chatLifecycleState).toBe('idle');
        expect(state.isGeneratingReport).toBe(false);
        expect(state.isSummaryGenerating).toBe(false);
        expect(state.reportGenerationProgress).toBeNull();
        expect(state.isCardReviewInProgress).toBe(false);
        expect(state.aiTaskStatus).toBeNull();
    });
});

describe('history slice vector memory rebuild', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        storageMocks.getReport.mockResolvedValue({
            id: 'report-1',
            filename: 'Loaded Report',
            createdAt: new Date('2026-03-12T00:00:00.000Z'),
            updatedAt: new Date('2026-03-12T00:00:00.000Z'),
            appState: {
                sessionId: 'report-1',
                currentView: 'analysis_dashboard',
                csvData: {
                    fileName: 'sales.csv',
                    data: [{ Region: 'East', Revenue: 1 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                columnProfiles: [{ name: 'Region', type: 'categorical' }],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: null,
                dataPreparationPlan: null,
                vectorStoreDocuments: [
                    {
                        id: 'legacy-card',
                        text: 'old memory',
                        embedding: [0.1, 0.2],
                    },
                ],
            },
        });
    });

    it('rehydrates vector store from saved embeddings when available', async () => {
        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: true,
            isDataPreparationModalOpen: true,
            isDebugLogsModalOpen: true,
            chatHistory: [],
        };

        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-1');
        // Rehydration runs in a fire-and-forget async task — flush microtasks
        // so the background state update completes before assertions.
        await new Promise(resolve => setTimeout(resolve, 0));

        // With saved embeddings, rehydrate is used instead of rebuild
        expect(vectorStoreMock.rehydrate).toHaveBeenCalledWith([
            expect.objectContaining({
                id: expect.stringMatching(/^memory:report-1:dataset-[^:]+:version-[^:]+:legacy-card$/),
                text: 'old memory',
                embedding: [0.1, 0.2],
                metadata: expect.objectContaining({
                    scope: expect.objectContaining({
                        reportId: 'report-1',
                    }),
                    origin: expect.objectContaining({
                        kind: 'legacy_report',
                        sourceId: 'legacy-card',
                    }),
                }),
            }),
        ]);
        expect(vectorMemoryMocks.rebuildVectorMemoryFromState).not.toHaveBeenCalled();
        expect(state.vectorStoreDocuments).toEqual([
            expect.objectContaining({
                id: expect.stringContaining(':legacy-card'),
                text: 'old memory',
                embedding: [0.1, 0.2],
            }),
        ]);
        expect(state.reportMemoryScope).toEqual(expect.objectContaining({
            reportId: 'report-1',
        }));
        expect(state.vectorMemoryState).toBe('queued');
        expect(state.sessionId).toMatch(/^session-/);
        expect(state.sessionId).not.toBe('report-1');
        expect(sessionStorage.getItem('csv_agent_tab_session_id')).toBe(state.sessionId);
        expect(state.sessionCreatedAt).toBeInstanceOf(Date);
        expect(state.runtimeEvents).toEqual([]);
        expect(state.runtimeRunHistory).toEqual([]);
        expect(state.queuedChatTurns).toEqual([]);
        expect(state.queuedAgentRuns).toEqual([]);
        expect(state.cancelRequestedTurnId).toBeNull();
    });

    it('falls back to rebuild when saved embeddings are missing', async () => {
        // Override mock to return report without embeddings
        storageMocks.getReport.mockResolvedValue({
            id: 'report-2',
            filename: 'Legacy Report',
            createdAt: new Date('2026-03-12T00:00:00.000Z'),
            updatedAt: new Date('2026-03-12T00:00:00.000Z'),
            appState: {
                sessionId: 'report-2',
                currentView: 'analysis_dashboard',
                csvData: {
                    fileName: 'sales.csv',
                    data: [{ Region: 'East', Revenue: 1 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                columnProfiles: [{ name: 'Region', type: 'categorical' }],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: null,
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
            },
        });

        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: true,
            isDataPreparationModalOpen: true,
            isDebugLogsModalOpen: true,
            chatHistory: [],
        };

        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-2');
        // The rebuild runs via a fire-and-forget dynamic import — flush microtasks
        // so the background task completes before assertions.
        await new Promise(resolve => setTimeout(resolve, 0));

        // Without saved embeddings, falls back to rebuild
        expect(vectorStoreMock.rehydrate).not.toHaveBeenCalled();
        expect(vectorMemoryMocks.rebuildVectorMemoryFromState).toHaveBeenCalledTimes(1);
        expect(vectorMemoryMocks.rebuildVectorMemoryFromState.mock.calls[0]?.[1]).toMatchObject({
            reset: true,
            includeDatasetDocs: true,
        });
    });

    it('does not append duplicate unfinished-cleaning history notices when one is already present', async () => {
        storageMocks.getReport.mockResolvedValue({
            id: 'report-3',
            filename: 'Paused Cleaning Report',
            createdAt: new Date('2026-03-12T00:00:00.000Z'),
            updatedAt: new Date('2026-03-12T00:00:00.000Z'),
            appState: {
                sessionId: 'report-3',
                currentView: 'analysis_dashboard',
                csvData: {
                    fileName: 'sales.csv',
                    data: [{ Region: 'East', Revenue: 1 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                chatHistory: [
                    {
                        sender: 'ai',
                        text: UNFINISHED_CLEANING_HISTORY_LOAD_TEXT,
                        timestamp: new Date('2026-03-12T00:00:02.000Z'),
                        type: 'ai_message',
                    },
                    {
                        sender: 'ai',
                        text: UNFINISHED_CLEANING_HISTORY_LOAD_TEXT,
                        timestamp: new Date('2026-03-12T00:00:03.000Z'),
                        type: 'ai_message',
                    },
                ],
                columnProfiles: [{ name: 'Region', type: 'categorical' }],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: {
                    runId: 'run-3',
                    status: 'paused',
                    currentStep: 1,
                    steps: [],
                    startedAt: new Date('2026-03-12T00:00:00.000Z'),
                    updatedAt: new Date('2026-03-12T00:00:00.000Z'),
                    targetPath: '/dataset/cleaned.csv',
                    shouldAutoResume: false,
                },
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
            },
        });

        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: true,
            isDataPreparationModalOpen: true,
            isDebugLogsModalOpen: true,
            chatHistory: [],
        };

        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-3');

        const historyNoticeCount = (state.chatHistory as Array<{ text?: string }>).filter(message => (
            message.text === UNFINISHED_CLEANING_HISTORY_LOAD_TEXT
        ));
        expect(historyNoticeCount).toHaveLength(1);
    });

    it('normalizes pending goal generation state back to idle when loading from history', async () => {
        storageMocks.getReport.mockResolvedValue({
            id: 'report-goal-pending',
            filename: 'Pending Goal Report',
            createdAt: new Date('2026-03-12T00:00:00.000Z'),
            updatedAt: new Date('2026-03-12T00:00:00.000Z'),
            appState: {
                sessionId: 'report-goal-pending',
                currentView: 'analysis_dashboard',
                goalState: 'pending_ai',
                csvData: {
                    fileName: 'sales.csv',
                    data: [{ Region: 'East', Revenue: 1 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                columnProfiles: [{ name: 'Region', type: 'categorical' }],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: null,
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
            },
        });

        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: true,
            isDataPreparationModalOpen: true,
            isDebugLogsModalOpen: true,
            chatHistory: [],
        };

        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-goal-pending');

        expect(state.goalState).toBe('idle');
    });

    it('preserves awaiting goal confirmation when loading from history', async () => {
        storageMocks.getReport.mockResolvedValue({
            id: 'report-goal-confirm',
            filename: 'Goal Confirmation Report',
            createdAt: new Date('2026-03-12T00:00:00.000Z'),
            updatedAt: new Date('2026-03-12T00:00:00.000Z'),
            appState: {
                sessionId: 'report-goal-confirm',
                currentView: 'analysis_dashboard',
                goalState: 'awaiting_user_confirmation',
                csvData: {
                    fileName: 'sales.csv',
                    data: [{ Region: 'East', Revenue: 1 }],
                    metadataRows: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                columnProfiles: [{ name: 'Region', type: 'categorical' }],
                analysisCards: [],
                cardEnhancementSuggestions: [],
                workspaceFiles: {},
                workspaceActionHistory: [],
                queryHistory: [],
                agentEvents: [],
                agentToolLogs: [],
                cleaningRun: null,
                dataPreparationPlan: null,
                vectorStoreDocuments: [],
            },
        });

        let state: Record<string, unknown> = {
            addProgress: vi.fn(),
            refreshDuckDbSession: vi.fn(async () => undefined),
            loadReportsList: vi.fn(async () => undefined),
            isHistoryPanelOpen: true,
            isWorkspaceModalOpen: true,
            isDataPreparationModalOpen: true,
            isDebugLogsModalOpen: true,
            chatHistory: [],
        };

        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleLoadReport('report-goal-confirm');

        expect(state.goalState).toBe('awaiting_user_confirmation');
    });

    it('starts a new working session when resetting the current session', async () => {
        const currentSessionCreatedAt = new Date('2026-03-10T00:00:00.000Z');
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== storageMocks.currentSessionKey) {
                return undefined;
            }
            return {
                id,
                filename: 'Current Session',
                createdAt: currentSessionCreatedAt,
                updatedAt: currentSessionCreatedAt,
                appState: {
                    sessionId: 'session-old',
                    csvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                },
            };
        });

        let state: Record<string, unknown> = {
            sessionId: 'session-old',
            settings: { provider: 'google' },
            isApiKeySet: true,
            csvData: {
                fileName: 'sales.csv',
                data: [{ Region: 'East', Revenue: 1 }],
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            },
            activeTurn: { id: 'turn-1', status: 'running' },
            queuedChatTurns: [{ id: 'queued-1' }],
            queuedAgentRuns: [{ id: 'run-1' }],
            cancelRequestedTurnId: 'turn-1',
            runtimeEvents: [{ id: 'event-1' }],
            runtimeRunHistory: [{ runId: 'runtime-1' }],
            addProgress: vi.fn(),
            loadReportsList: vi.fn(async () => undefined),
        };

        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        await slice.handleNewSession();

        expect(state.sessionId).toMatch(/^session-/);
        expect(state.sessionId).not.toBe('session-old');
        expect(sessionStorage.getItem('csv_agent_tab_session_id')).toBe(state.sessionId);
        expect(state.currentView).toBe('file_upload');
        expect(state.csvData).toBeNull();
        expect(state.activeTurn).toBeNull();
        expect(state.queuedChatTurns).toEqual([]);
        expect(state.queuedAgentRuns).toEqual([]);
        expect(state.cancelRequestedTurnId).toBeNull();
        expect(state.runtimeEvents).toEqual([]);
        expect(state.runtimeRunHistory).toEqual([]);
        expect(storageMocks.saveReport).toHaveBeenCalledWith(expect.objectContaining({
            id: `report-${currentSessionCreatedAt.getTime()}`,
        }));
        expect(storageMocks.deleteReport).toHaveBeenCalledWith(storageMocks.currentSessionKey);
    });

    it('shows the new upload session before a large history archive finishes saving', async () => {
        let finishArchive: (() => void) | null = null;
        const archivePending = new Promise<void>(resolve => {
            finishArchive = resolve;
        });
        storageMocks.getReport.mockResolvedValue({
            id: storageMocks.currentSessionKey,
            filename: 'Large report.csv',
            createdAt: new Date('2026-03-10T00:00:00.000Z'),
            updatedAt: new Date('2026-03-10T00:00:00.000Z'),
            appState: { sessionId: 'session-old' },
        });
        storageMocks.saveReport.mockReturnValueOnce(archivePending);

        let state: Record<string, unknown> = {
            sessionId: 'session-old',
            settings: { provider: 'google' },
            isApiKeySet: true,
            csvData: { fileName: 'large.csv', data: [{ Value: 1 }] },
            addProgress: vi.fn(),
            loadReportsList: vi.fn(async () => undefined),
        };
        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        const resetPromise = slice.handleNewSession();
        await vi.waitFor(() => {
            expect(state.currentView).toBe('file_upload');
            expect(state.csvData).toBeNull();
        });
        expect(storageMocks.saveReport).toHaveBeenCalled();

        finishArchive?.();
        await resetPromise;
    });

    it('blocks a new upload while outgoing session cleanup is still running', async () => {
        let finishVectorClear: (() => void) | null = null;
        vectorStoreMock.clear.mockReturnValueOnce(new Promise<void>(resolve => {
            finishVectorClear = resolve;
        }));
        storageMocks.getReport.mockResolvedValue(undefined);

        let state: Record<string, unknown> = {
            sessionId: 'session-old',
            settings: { provider: 'google' },
            isApiKeySet: true,
            currentView: 'results',
            isBusy: false,
            chatLifecycleState: 'idle',
            datasetBundle: { bundleId: 'bundle-old' },
            csvData: { fileName: 'old.csv', data: [{ Value: 1 }] },
            addProgress: vi.fn(),
            loadReportsList: vi.fn(async () => undefined),
        };
        const set = vi.fn((partial: any) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        });
        const get = () => state as any;
        const slice = createHistorySlice(set as never, get as never, {} as never);
        state = { ...state, ...slice };

        const resetPromise = slice.handleNewSession();

        expect(state.currentView).toBe('file_upload');
        expect(state.isBusy).toBe(true);
        expect(state.chatLifecycleState).toBe('running');

        finishVectorClear?.();
        await resetPromise;

        expect(state.isBusy).toBe(false);
        expect(state.chatLifecycleState).toBe('idle');
        expect(state.datasetBundle).toBeNull();
        expect(state.csvData).toBeNull();
    });
});
