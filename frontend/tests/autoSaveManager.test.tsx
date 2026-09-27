import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSaveManager } from '../components/AutoSaveManager';

type StoreState = Record<string, any>;
type StoreListener = (state: StoreState) => void;

const { useAppStoreMock, emitStateChange, resetStoreState, saveReportMock, getDocumentsMock } = vi.hoisted(() => {
    const listeners = new Set<StoreListener>();
    const createState = (): StoreState => ({
        sessionId: 'session-1',
        sessionCreatedAt: new Date('2026-03-12T00:00:00.000Z'),
        currentView: 'analysis_dashboard',
        settings: {
            provider: 'google',
            geminiApiKey: 'key',
            openAIApiKey: '',
            simpleModel: 'fast-model',
            complexModel: 'smart-model',
            language: 'English',
            autoConfirmGoal: true,
        },
        isAppInitializing: false,
        isBusy: false,
        progressMessages: [],
        csvData: {
            fileName: 'sales.csv',
            data: [{ Region: 'East', Revenue: 1 }],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 1,
        },
        rawCsvData: null,
        reportContextResolution: {
            aiExtracted: null,
            fallback: {
                sourceFile: 'sales.csv',
                reportTitle: 'Sales Report',
                parameterLines: [],
                footerLines: [],
                candidateHeaderLine: ['Region', 'Revenue'],
                notes: [],
                source: 'fallback',
                confidence: null,
            },
            effective: {
                sourceFile: 'sales.csv',
                reportTitle: 'Sales Report',
                parameterLines: [],
                footerLines: [],
                candidateHeaderLine: ['Region', 'Revenue'],
                notes: [],
                source: 'fallback',
                confidence: null,
            },
            verification: {
                passed: true,
                usedFallback: false,
                reason: null,
                aiConfidence: null,
                issues: [],
            },
            generatedAt: '2026-03-12T00:00:00.000Z',
        },
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        columnProfiles: [],
        analysisCards: [],
        chatHistory: [],
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        dataPreparationPlan: null,
        initialDataSample: [],
        spreadsheetFilterFunction: null,
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        aiFilterExplanation: null,
        pendingClarification: null,
        pendingMutationConfirmation: null,
        runtimeEvents: [],
        aiTaskStatus: null,
        telemetryEvents: [],
        agentEvents: [],
        agentToolLogs: [],
        addProgress: vi.fn(),
        confirmedAnalysisGoal: null,
        goalState: 'idle',
        agentMemoryRun: null,
        liveAgentMemoryRun: null,
        agentMemoryHistory: [],
        selectedMemoryRunId: null,
        currentDatasetId: 'dataset-1',
        dataQualityIssues: [],
        isChangingGoal: false,
        planQueue: [],
        contextualSummary: null,
        isGeneratingReport: false,
        reportGenerationProgress: null,
        cardEnhancementSuggestions: [],
        isCardReviewInProgress: false,
        workspaceFiles: {},
        workspaceActionHistory: [],
        cleaningRun: null,
        queryHistory: [],
        duckDbSessionStatus: {
            status: 'ready',
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: 'load-1',
            fallbackReason: null,
            lastSyncedAt: new Date('2026-03-12T00:00:00.000Z'),
        },
    });

    let state = createState();

    const useAppStore = Object.assign(vi.fn(), {
        getState: vi.fn(() => state),
        setState: vi.fn((partial: Record<string, unknown>) => {
            state = { ...state, ...partial };
            listeners.forEach(listener => listener(state));
        }),
        subscribe: vi.fn((listener: StoreListener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }),
    });

    return {
        useAppStoreMock: useAppStore,
        emitStateChange: (partial: Record<string, unknown>) => {
            state = { ...state, ...partial };
            listeners.forEach(listener => listener(state));
        },
        resetStoreState: () => {
            state = createState();
            listeners.clear();
            useAppStore.getState.mockImplementation(() => state);
            useAppStore.setState.mockClear();
            useAppStore.subscribe.mockClear();
            useAppStore.mockClear();
        },
        saveReportMock: vi.fn<(report: Record<string, unknown>) => Promise<void>>(async () => undefined),
        getDocumentsMock: vi.fn(() => []),
    };
});

vi.mock('../store/useAppStore', () => ({
    useAppStore: useAppStoreMock,
}));

vi.mock('../services/storageService', () => ({
    CURRENT_SESSION_KEY: 'current_session',
    saveReport: saveReportMock,
    checkStorageHealth: vi.fn(async () => ({ evictedReports: 0 })),
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        getDocuments: getDocumentsMock,
    },
}));

describe('AutoSaveManager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        saveReportMock.mockClear();
        getDocumentsMock.mockClear();
        resetStoreState();
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
    });

    afterEach(() => {
        cleanup();
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('debounces autosave by 1500ms after relevant store changes', async () => {
        render(<AutoSaveManager />);

        act(() => {
            emitStateChange({
                chatHistory: [
                    {
                        id: 'chat-1',
                        sender: 'user',
                        text: 'hello',
                        timestamp: new Date('2026-03-12T00:00:01.000Z'),
                        type: 'user_message',
                    },
                ],
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(1499);
        });
        expect(saveReportMock).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
        });
        expect(saveReportMock).toHaveBeenCalledTimes(2);
    });

    it('coalesces rapid successive changes into one autosave flush', async () => {
        render(<AutoSaveManager />);

        act(() => {
            emitStateChange({
                progressMessages: [
                    {
                        id: 'progress-1',
                        text: 'AI is thinking...',
                        type: 'system',
                        timestamp: new Date('2026-03-12T00:00:01.000Z'),
                    },
                ],
            });
            emitStateChange({
                progressMessages: [
                    {
                        id: 'progress-1',
                        text: 'AI is thinking...',
                        type: 'system',
                        timestamp: new Date('2026-03-12T00:00:01.000Z'),
                    },
                    {
                        id: 'progress-2',
                        text: 'Still working...',
                        type: 'system',
                        timestamp: new Date('2026-03-12T00:00:02.000Z'),
                    },
                ],
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(saveReportMock).toHaveBeenCalledTimes(2);
    });

    it('does not re-save when workspace file content changes without changing persisted signature counts', async () => {
        render(<AutoSaveManager />);

        act(() => {
            emitStateChange({
                workspaceFiles: {
                    '/workspace/notes.md': 'first draft',
                },
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(saveReportMock).toHaveBeenCalledTimes(2);

        act(() => {
            emitStateChange({
                workspaceFiles: {
                    '/workspace/notes.md': 'updated draft',
                },
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(saveReportMock).toHaveBeenCalledTimes(2);
    });

    it('flushes immediately when the page becomes hidden', async () => {
        render(<AutoSaveManager />);

        act(() => {
            emitStateChange({
                chatHistory: [
                    {
                        id: 'chat-1',
                        sender: 'user',
                        text: 'hello',
                        timestamp: new Date('2026-03-12T00:00:01.000Z'),
                        type: 'user_message',
                    },
                ],
            });
        });

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(saveReportMock).toHaveBeenCalledTimes(2);
    });

    it('persists report context resolution in the autosaved app state', async () => {
        render(<AutoSaveManager />);

        act(() => {
            emitStateChange({
                chatHistory: [
                    {
                        id: 'chat-1',
                        sender: 'user',
                        text: 'hello',
                        timestamp: new Date('2026-03-12T00:00:01.000Z'),
                        type: 'user_message',
                    },
                ],
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        const savedCurrentSession = saveReportMock.mock.calls.at(0)?.[0] as
            | { appState?: { reportContextResolution?: { effective?: { reportTitle?: string } } } }
            | undefined;
        expect(savedCurrentSession?.appState?.reportContextResolution?.effective?.reportTitle).toBe('Sales Report');
    });

    it('reports autosave failures through progress state instead of swallowing them', async () => {
        saveReportMock.mockRejectedValueOnce(new Error('IndexedDB quota exceeded'));
        render(<AutoSaveManager />);

        act(() => {
            emitStateChange({
                chatHistory: [
                    {
                        id: 'chat-1',
                        sender: 'user',
                        text: 'hello',
                        timestamp: new Date('2026-03-12T00:00:01.000Z'),
                        type: 'user_message',
                    },
                ],
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(useAppStoreMock.getState().addProgress).toHaveBeenCalledWith(
            'Autosave failed: IndexedDB quota exceeded',
            'error',
        );
    });
});
