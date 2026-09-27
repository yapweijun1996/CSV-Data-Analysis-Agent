import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppLanguage } from '../types';
import { UNFINISHED_CLEANING_SESSION_RESTORE_TEXT } from '../utils/messageState';

const storageMocks = vi.hoisted(() => {
    const defaultSettings = {
        provider: 'google' as const,
        geminiApiKey: '',
        openAIApiKey: '',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English' as AppLanguage,
        reportTemplate: 'management_review' as const,
        autoConfirmGoal: true,
        runtimeAccessControl: {
            permissionMode: 'open' as const,
            toolOverrides: {},
            workspaceRules: { deniedPathPrefixes: [] },
        },
    };

    const persistedSettings = {
        ...defaultSettings,
        simpleModel: 'gemini-3.1-pro-preview',
        complexModel: 'gemini-3.1-flash-lite-preview',
        reportTemplate: 'audit_appendix' as const,
        runtimeAccessControl: {
            permissionMode: 'balanced' as const,
            toolOverrides: { 'workspace.write': 'deny' as const },
            workspaceRules: { deniedPathPrefixes: ['/workspace/private'] },
        },
    };

    return {
        defaultSettings,
        persistedSettings,
        getDefaultSettings: vi.fn(() => defaultSettings),
        getSettings: vi.fn(async () => persistedSettings),
        getReport: vi.fn(),
        getReportsList: vi.fn(async () => []),
        saveReport: vi.fn(),
        deleteReport: vi.fn(),
        getAgentMemoryRuns: vi.fn(async () => []),
        saveAgentMemoryRun: vi.fn(),
        getLatestAgentMemoryRun: vi.fn(async () => null),
        currentSessionKey: 'current_session',
    };
});

const vectorMemoryMocks = vi.hoisted(() => ({
    rebuildVectorMemoryFromState: vi.fn(async () => undefined),
}));

vi.mock('../services/storageService', () => ({
    CURRENT_SESSION_KEY: storageMocks.currentSessionKey,
    getDefaultSettings: storageMocks.getDefaultSettings,
    getSettings: storageMocks.getSettings,
    getReport: storageMocks.getReport,
    getReportsList: storageMocks.getReportsList,
    saveReport: storageMocks.saveReport,
    deleteReport: storageMocks.deleteReport,
    getAgentMemoryRuns: storageMocks.getAgentMemoryRuns,
    saveAgentMemoryRun: storageMocks.saveAgentMemoryRun,
    getLatestAgentMemoryRun: storageMocks.getLatestAgentMemoryRun,
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: vi.fn().mockResolvedValue([]),
        clear: vi.fn(),
        schedulePersist: vi.fn(),
        loadFromStorage: vi.fn(async () => false),
    },
}));

vi.mock('../services/agent/memory/vectorMemorySync', () => ({
    rebuildVectorMemoryFromState: vectorMemoryMocks.rebuildVectorMemoryFromState,
}));

vi.mock('../services/agent/execution/dataOperationRunner', () => ({
    normalizeDataPreparationPlan: (plan: unknown) => plan,
}));

vi.mock('../services/agent/cleaningRunState', () => ({
    updateCleaningRun: (run: Record<string, unknown> | null, updates: Record<string, unknown>) => ({ ...(run ?? {}), ...updates }),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    disposeDuckDbQueryEngine: vi.fn(async () => undefined),
    primeDuckDbDataset: vi.fn(async () => ({
        engine: 'duckdb',
        tableName: 'session_clean_dataset',
        loadVersion: 'load-1',
        fallbackReason: null,
    })),
}));

describe('settings persistence during init', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        sessionStorage.clear();
        vectorMemoryMocks.rebuildVectorMemoryFromState.mockResolvedValue(undefined);

        storageMocks.getDefaultSettings.mockReturnValue(storageMocks.defaultSettings);
        storageMocks.getSettings.mockResolvedValue(storageMocks.persistedSettings);
        storageMocks.getReportsList.mockResolvedValue([]);
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: {
                        ...storageMocks.defaultSettings,
                        simpleModel: 'gemini-2.5-flash-lite',
                        complexModel: 'gemini-2.5-pro',
                    },
                    csvData: null,
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    cleaningRun: null,
                    dataPreparationPlan: null,
                },
            };
        });
    });

    it('keeps the latest persisted settings after a refresh restore', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().settings).toEqual(storageMocks.persistedSettings);
        expect(useAppStore.getState().settings.simpleModel).toBe('gemini-3.1-pro-preview');
        expect(useAppStore.getState().settings.complexModel).toBe('gemini-3.1-flash-lite-preview');
        expect(useAppStore.getState().settings.runtimeAccessControl).toEqual(storageMocks.persistedSettings.runtimeAccessControl);
        // vectorMemorySync is now dynamically imported — wait for the microtask
        await vi.waitFor(() => expect(vectorMemoryMocks.rebuildVectorMemoryFromState).toHaveBeenCalledTimes(1));
    }, 45000);

    it('creates a fresh tab-local session when no tab session key exists', async () => {
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id === storageMocks.currentSessionKey) {
                return {
                    id,
                    filename: 'Current Session',
                    createdAt: new Date('2026-03-11T00:00:00.000Z'),
                    updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                    appState: {
                        sessionId: 'session-1',
                        currentView: 'analysis_dashboard',
                        csvData: {
                            fileName: 'sales.csv',
                            data: [{ Region: 'East', Revenue: 1 }],
                            metadataRows: [],
                            summaryRows: [],
                            headerDepth: 1,
                        },
                        cardEnhancementSuggestions: [],
                        workspaceFiles: {},
                        workspaceActionHistory: [],
                        queryHistory: [],
                        agentEvents: [],
                        agentToolLogs: [],
                        cleaningRun: null,
                        dataPreparationPlan: null,
                    },
                };
            }
            return undefined;
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        const sessionId = useAppStore.getState().sessionId;
        expect(sessionId).toMatch(/^session-/);
        expect(sessionId).not.toBe('session-1');
        expect(sessionStorage.getItem('csv_agent_tab_session_id')).toBe(sessionId);
        expect(useAppStore.getState().currentView).toBe('file_upload');
        expect(useAppStore.getState().csvData).toBeNull();
        expect(vectorMemoryMocks.rebuildVectorMemoryFromState).not.toHaveBeenCalled();
        expect(storageMocks.getReport).not.toHaveBeenCalledWith(storageMocks.currentSessionKey);
    }, 45000);

    it('normalizes legacy Spanish and French settings back to English during restore', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getSettings.mockResolvedValue({
            ...storageMocks.persistedSettings,
            language: 'Spanish' as unknown as AppLanguage,
        });
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: {
                        ...storageMocks.defaultSettings,
                        language: 'French',
                    },
                    csvData: null,
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    cleaningRun: null,
                    dataPreparationPlan: null,
                },
            };
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().settings.language).toBe('English');
    }, 45000);

    it.each(['Malay', 'Japanese'] as const)('restores supported language %s without downgrading it', async (language) => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getSettings.mockResolvedValue({
            ...storageMocks.persistedSettings,
            language,
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().settings.language).toBe(language);
    }, 45000);

    it('restores unfinished cleaning runs in paused state after refresh', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: storageMocks.defaultSettings,
                    csvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                    rawCsvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                    cleaningRun: {
                        runId: 'run-1',
                        status: 'running',
                        currentStep: 2,
                        steps: [],
                        lastModelResponse: null,
                        startedAt: new Date('2026-03-11T00:00:00.000Z'),
                        updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                        targetPath: '/dataset/cleaned.csv',
                        lastError: null,
                        shouldAutoResume: true,
                    },
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    dataPreparationPlan: null,
                },
            };
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().cleaningRun?.status).toBe('paused');
        expect(useAppStore.getState().cleaningRun?.shouldAutoResume).toBe(false);
        expect(useAppStore.getState().duckDbSessionStatus.status).toBe('ready');
    }, 45000);

    it('does not duplicate unfinished cleaning restore notices that already exist in persisted chat history', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: storageMocks.defaultSettings,
                    csvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                    rawCsvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                    chatHistory: [
                        {
                            sender: 'ai',
                            text: UNFINISHED_CLEANING_SESSION_RESTORE_TEXT,
                            timestamp: new Date('2026-03-11T00:00:02.000Z'),
                            type: 'ai_message',
                        },
                        {
                            sender: 'ai',
                            text: UNFINISHED_CLEANING_SESSION_RESTORE_TEXT,
                            timestamp: new Date('2026-03-11T00:00:03.000Z'),
                            type: 'ai_message',
                        },
                    ],
                    cleaningRun: {
                        runId: 'run-1',
                        status: 'paused',
                        currentStep: 2,
                        steps: [],
                        lastModelResponse: null,
                        startedAt: new Date('2026-03-11T00:00:00.000Z'),
                        updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                        targetPath: '/dataset/cleaned.csv',
                        lastError: null,
                        shouldAutoResume: false,
                    },
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    dataPreparationPlan: null,
                },
            };
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        const restoreMessages = useAppStore.getState().chatHistory.filter(message => (
            message.text === UNFINISHED_CLEANING_SESSION_RESTORE_TEXT
        ));
        expect(restoreMessages).toHaveLength(1);
    }, 45000);

    it('backfills missing chat and progress ids when restoring an older session snapshot', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: storageMocks.defaultSettings,
                    currentView: 'analysis_dashboard',
                    csvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                    progressMessages: [
                        {
                            text: 'AI is thinking...',
                            type: 'system',
                            timestamp: new Date('2026-03-11T00:00:01.000Z'),
                        },
                    ],
                    chatHistory: [
                        {
                            sender: 'user',
                            text: 'show me revenue by region',
                            timestamp: new Date('2026-03-11T00:00:02.000Z'),
                            type: 'user_message',
                        },
                    ],
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    cleaningRun: null,
                    dataPreparationPlan: null,
                },
            };
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().progressMessages[0]?.id).toMatch(/^progress-restored-/);
        expect(useAppStore.getState().chatHistory[0]?.id).toMatch(/^chat-restored-/);
        expect(useAppStore.getState().duckDbSessionStatus.status).toBe('ready');
    }, 45000);

    it('preserves awaiting goal confirmation state during session restore', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: storageMocks.defaultSettings,
                    currentView: 'analysis_dashboard',
                    confirmedAnalysisGoal: null,
                    goalState: 'awaiting_user_confirmation',
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
                            text: 'Please confirm the goal.',
                            timestamp: new Date('2026-03-11T00:00:02.000Z'),
                            type: 'ai_goal_clarification',
                        },
                    ],
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    cleaningRun: null,
                    dataPreparationPlan: null,
                },
            };
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().goalState).toBe('awaiting_user_confirmation');
        expect(useAppStore.getState().currentView).toBe('analysis_dashboard');
    }, 45000);

    it('normalizes pending goal generation state back to idle during session restore', async () => {
        sessionStorage.setItem('csv_agent_tab_session_id', 'session-1');
        storageMocks.getReport.mockImplementation(async (id: string) => {
            if (id !== 'session-1') {
                return undefined;
            }

            return {
                id,
                filename: 'Current Session',
                createdAt: new Date('2026-03-11T00:00:00.000Z'),
                updatedAt: new Date('2026-03-11T00:00:00.000Z'),
                appState: {
                    sessionId: id,
                    settings: storageMocks.defaultSettings,
                    currentView: 'analysis_dashboard',
                    goalState: 'pending_ai',
                    csvData: {
                        fileName: 'sales.csv',
                        data: [{ Region: 'East', Revenue: 1 }],
                        metadataRows: [],
                        summaryRows: [],
                        headerDepth: 1,
                    },
                    cardEnhancementSuggestions: [],
                    workspaceFiles: {},
                    workspaceActionHistory: [],
                    queryHistory: [],
                    agentEvents: [],
                    agentToolLogs: [],
                    cleaningRun: null,
                    dataPreparationPlan: null,
                },
            };
        });

        const { useAppStore } = await import('../store/useAppStore');
        await useAppStore.getState().init();

        expect(useAppStore.getState().goalState).toBe('idle');
    }, 45000);
});
