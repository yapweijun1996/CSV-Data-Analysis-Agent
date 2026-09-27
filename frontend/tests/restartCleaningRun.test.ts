// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataSlice } from '../store/slices/dataSlice';
import type { CsvData } from '../types';

const {
    profileDataWithWorkerMock,
    primeDuckDbDatasetMock,
    updateAgentTaskStatusMock,
    orchestrateAutonomousAiCleaningMock,
    saveReportMock,
    buildPersistedReportRecordMock,
    getOriginalDataMock,
} = vi.hoisted(() => ({
    profileDataWithWorkerMock: vi.fn(),
    primeDuckDbDatasetMock: vi.fn(),
    updateAgentTaskStatusMock: vi.fn(),
    orchestrateAutonomousAiCleaningMock: vi.fn(),
    saveReportMock: vi.fn(),
    buildPersistedReportRecordMock: vi.fn(),
    getOriginalDataMock: vi.fn(),
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    profileDataWithWorker: profileDataWithWorkerMock,
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    primeDuckDbDataset: primeDuckDbDatasetMock,
    DUCKDB_INIT_TIMEOUT_MS: 5000,
}));

vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    updateAgentTaskStatus: updateAgentTaskStatusMock,
}));

vi.mock('../services/agent/orchestration/autonomousCleaningPipeline', () => ({
    orchestrateAutonomousAiCleaning: orchestrateAutonomousAiCleaningMock,
}));

vi.mock('../services/storageService', () => ({
    CURRENT_SESSION_KEY: 'current_session',
    saveReport: saveReportMock,
    getOriginalData: getOriginalDataMock,
    getDefaultSettings: () => ({
        provider: 'google',
        geminiApiKey: '',
        openAIApiKey: '',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        reportTemplate: 'management_review',
        autoConfirmGoal: true,
        runtimeAccessControl: {
            permissionMode: 'open',
            toolOverrides: {},
            workspaceRules: { deniedPathPrefixes: [] },
        },
    }),
}));

vi.mock('../services/persistence/persistedAppState', () => ({
    buildPersistedReportRecord: buildPersistedReportRecordMock,
}));

const createHarness = () => {
    const rawCsvData: CsvData = {
        fileName: 'raw.csv',
        data: [
            { Project: 'North', Amount: '999' },
            { Project: 'South', Amount: '888' },
        ],
        metadataRows: [],
        headerLayers: [],
        summaryRows: [],
        headerDepth: 1,
    };
    const canonicalCsvData: CsvData = {
        fileName: 'canonical.csv',
        data: [
            { SeriesKey: 'Q1', Value: '100' },
            { SeriesKey: 'Q2', Value: '240' },
        ],
        metadataRows: [],
        headerLayers: [],
        summaryRows: [],
        headerDepth: 1,
    };

    let state: Record<string, any> = {
        sessionId: 'session-test',
        currentDatasetId: 'dataset-test',
        settings: {
            provider: 'google',
            geminiApiKey: '',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'English',
            reportTemplate: 'management_review',
            autoConfirmGoal: true,
            runtimeAccessControl: {
                permissionMode: 'open',
                toolOverrides: {},
                workspaceRules: { deniedPathPrefixes: [] },
            },
        },
        progressMessages: [],
        csvData: rawCsvData,
        rawCsvData,
        rawIntakeIr: null,
        reportStructureResolution: { status: 'resolved' },
        canonicalCsvData,
        canonicalBuildMeta: { summary: 'canonical-ready' },
        canonicalizationStatus: 'ready',
        pipelineOutcome: null,
        dataPreparationPlan: null,
        cleaningRun: null,
        columnProfiles: [
            { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [888, 999], missingPercentage: 0 },
        ],
        columnRegistry: { columns: [] },
        workspaceFiles: {},
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        duckDbSessionStatus: { status: 'idle' },
        activeDataQuery: null,
        activeMetricMappingValidation: null,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        queryHistory: [],
        analysisCards: [],
        activeAnalysisSession: null,
        latestAnalysisSession: null,
        visibleAnalysisTrace: [],
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        reportGenerationProgress: null,
        isGeneratingReport: false,
        confirmedAnalysisGoal: null,
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        ensureDatasetSemanticSnapshot: vi.fn().mockResolvedValue(null),
        handleInitialAnalysis: vi.fn().mockResolvedValue({ status: 'ready' }),
        proposeAnalysisGoals: vi.fn().mockResolvedValue(undefined),
    };

    const setState = (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };
    const getState = () => state;
    const slice = createDataSlice(setState as never, getState as never, {} as never);
    state = { ...state, ...slice };

    return { getState, rawCsvData, canonicalCsvData };
};

describe('restartCleaningRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [
                { name: 'SeriesKey', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'currency', valueRange: [100, 240], missingPercentage: 0 },
            ],
            issues: [],
        });
        primeDuckDbDatasetMock.mockResolvedValue(null);
        getOriginalDataMock.mockResolvedValue(null);
        buildPersistedReportRecordMock.mockImplementation((state: { sessionId: string; csvData: CsvData | null }) => ({
            id: state.sessionId,
            filename: state.csvData?.fileName ?? 'Current Session',
            createdAt: new Date('2026-03-25T12:00:00.000Z'),
            updatedAt: new Date('2026-03-25T12:00:00.000Z'),
            appState: {
                sessionId: state.sessionId,
                csvData: state.csvData,
            },
        }));
        orchestrateAutonomousAiCleaningMock.mockImplementation(async storeApi => {
            storeApi.setState((prev: Record<string, unknown>) => ({
                cleaningRun: {
                    ...(prev.cleaningRun as Record<string, unknown> | null | undefined),
                    status: 'failed',
                    userFacingMessage: 'planned stop',
                    lastError: 'planned stop',
                },
            }));
        });
    });

    it('restarts from the preferred canonical dataset snapshot instead of raw.csv', async () => {
        const { getState, rawCsvData, canonicalCsvData } = createHarness();

        await getState().restartCleaningRun();

        expect(profileDataWithWorkerMock.mock.calls[0]?.[0]).toEqual(canonicalCsvData.data);
        expect(getState().csvData.data).toEqual(canonicalCsvData.data);
        expect(getState().canonicalCsvData?.data).toEqual(canonicalCsvData.data);
        expect(getState().rawCsvData.data).toEqual(rawCsvData.data);
        expect(getState().dataPreparationPlan?.explanation).toContain('current prepared dataset snapshot');
        expect(updateAgentTaskStatusMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                subtitle: 'Restarting cleaning run from the current prepared dataset...',
            }),
        );
        expect(buildPersistedReportRecordMock).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: 'session-test',
                csvData: expect.objectContaining({
                    fileName: canonicalCsvData.fileName,
                    data: canonicalCsvData.data,
                }),
                canonicalCsvData: expect.objectContaining({
                    fileName: canonicalCsvData.fileName,
                    data: canonicalCsvData.data,
                }),
            }),
            expect.objectContaining({
                id: 'session-test',
                filename: canonicalCsvData.fileName,
            }),
        );
        expect(saveReportMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                id: 'session-test',
                appState: expect.objectContaining({
                    csvData: expect.objectContaining({
                        fileName: canonicalCsvData.fileName,
                        data: canonicalCsvData.data,
                    }),
                }),
            }),
        );
        expect(saveReportMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                id: 'current_session',
                appState: expect.objectContaining({
                    csvData: expect.objectContaining({
                        fileName: canonicalCsvData.fileName,
                        data: canonicalCsvData.data,
                    }),
                }),
            }),
        );
    });
});
