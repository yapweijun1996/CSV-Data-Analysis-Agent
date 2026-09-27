import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import type { ColumnProfile, CsvData, DataPreparationPlan } from '../types';
import type { StoreApi } from '../services/agent/types';
import { persistSuccessfulCleaning } from '../services/agent/orchestration/cleaningPipelinePersistence';
import { buildColumnRegistry } from '../services/data/columnRegistry';

const {
    profileDataWithWorkerMock,
    ensureDuckDbSessionSyncMock,
    runSqlPrecheckMock,
} = vi.hoisted(() => ({
    profileDataWithWorkerMock: vi.fn(),
    ensureDuckDbSessionSyncMock: vi.fn(),
    runSqlPrecheckMock: vi.fn(),
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    profileDataWithWorker: profileDataWithWorkerMock,
}));

vi.mock('../services/duckdb/storeSessionSync', () => ({
    ensureDuckDbSessionSync: ensureDuckDbSessionSyncMock,
}));

vi.mock('../services/agent/execution/sqlPrecheck', () => ({
    runSqlPrecheck: runSqlPrecheckMock,
}));

const baseProfiles: ColumnProfile[] = [
    { name: 'BRAND', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
    { name: 'QTY SOLD', type: 'numerical', hasFormattedNumbers: true, missingPercentage: 0 },
    { name: 'AMOUNT (SGD)', type: 'currency', hasFormattedNumbers: true, missingPercentage: 0 },
    { name: 'AVG UNIT PRICE', type: 'numerical', hasFormattedNumbers: true, missingPercentage: 0 },
];

const normalizedProfiles: ColumnProfile[] = [
    { name: 'BRAND', type: 'categorical', uniqueValues: 3, missingPercentage: 25 },
    { name: 'QTY SOLD', type: 'numerical', missingPercentage: 0 },
    { name: 'AMOUNT (SGD)', type: 'currency', missingPercentage: 0 },
    { name: 'AVG UNIT PRICE', type: 'numerical', missingPercentage: 0 },
];

const createStore = () => {
    const rawData: CsvData = {
        fileName: 'sales-report.csv',
        data: [
            { BRAND: "'-", 'QTY SOLD': '1,200.00', 'AMOUNT (SGD)': '7,278.00', 'AVG UNIT PRICE': '4.0143' },
            { BRAND: 'Bosch', 'QTY SOLD': '840.00', 'AMOUNT (SGD)': '99,286.60', 'AVG UNIT PRICE': '118.1983' },
            { BRAND: 'Denso', 'QTY SOLD': '4.00', 'AMOUNT (SGD)': '15.36', 'AVG UNIT PRICE': '3.8400' },
            { BRAND: "'-", 'QTY SOLD': '20.00', 'AMOUNT (SGD)': '700.00', 'AVG UNIT PRICE': '35.0000' },
        ],
        metadataRows: [],
        headerLayers: [],
        summaryRows: [],
        headerDepth: 1,
    };

    const state = {
        sessionId: 'session-test',
        currentDatasetId: 'dataset-test',
        settings: {
            provider: 'google',
            geminiApiKey: 'test-key',
            openAIApiKey: '',
            simpleModel: 'gemini-3.1-flash-lite-preview',
            complexModel: 'gemini-3.1-flash-lite-preview',
            language: 'English',
            autoConfirmGoal: true,
        },
        csvData: rawData,
        rawCsvData: rawData,
        columnProfiles: baseProfiles,
        dataPreparationPlan: null,
        workspaceFiles: {},
        columnRegistry: null,
        userColumnAnnotations: {},
        latestAnalysisSession: null,
        cleaningRun: null,
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        chatHistory: [],
        logTelemetryEvent: vi.fn(),
        addProgress: vi.fn(),
    } as unknown as AppStore;

    const store: StoreApi = {
        getState: () => state,
        setState: partial => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
        },
    };

    return { store, state, rawData };
};

describe('persistSuccessfulCleaning', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        profileDataWithWorkerMock.mockResolvedValue({ profiles: normalizedProfiles, issues: [] });
        ensureDuckDbSessionSyncMock.mockResolvedValue({ engine: 'duckdb' });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });
    });

    it('applies deterministic placeholder and numeric normalization before SQL precheck when the plan omitted them', async () => {
        const { store, state, rawData } = createStore();
        const plan: DataPreparationPlan = {
            explanation: 'Removed report-noise rows only.',
            operations: [
                {
                    id: 'drop-inspected-noise-rows',
                    type: 'drop_rows_by_index',
                    reason: 'Remove inspected report noise rows.',
                    indices: [],
                },
            ],
            outputColumns: baseProfiles,
            planStatus: 'operations',
            consistencyIssues: [],
        };

        await persistSuccessfulCleaning({
            store,
            rawData,
            latestState: state,
            workingData: rawData,
            workingProfiles: baseProfiles,
            plan,
        });

        expect(state.csvData?.data.some(row => row.BRAND === "'-")).toBe(false);
        expect(state.csvData?.data.filter(row => row.BRAND == null)).toHaveLength(2);
        expect(state.dataPreparationPlan?.operations.map(operation => operation.type)).toEqual([
            'drop_rows_by_index',
            'normalize_empty_values',
            'cast_column',
            'cast_column',
            'cast_column',
        ]);
        expect(state.dataPreparationPlan?.normalizedPlaceholderColumns).toEqual(['BRAND']);
        expect(state.dataPreparationPlan?.numericStringNormalizedColumns).toEqual([
            'QTY SOLD',
            'AMOUNT (SGD)',
            'AVG UNIT PRICE',
        ]);
        expect(state.logTelemetryEvent).toHaveBeenCalledWith(expect.objectContaining({
            responseType: 'data_prep_placeholder_normalized',
        }));
        expect(state.logTelemetryEvent).toHaveBeenCalledWith(expect.objectContaining({
            responseType: 'data_prep_numeric_string_casted',
        }));
    });

    it('rebuilds the column registry from the final committed cleaning dataset', async () => {
        const { store, state, rawData } = createStore();
        const workingData: CsvData = {
            ...rawData,
            data: [
                { RegionCode: 'N', Revenue: 1000, Margin: 0.2 },
                { RegionCode: 'S', Revenue: 900, Margin: 0.15 },
            ],
        };
        const workingProfiles: ColumnProfile[] = [
            { name: 'RegionCode', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Revenue', type: 'currency', missingPercentage: 0 },
            { name: 'Margin', type: 'percentage', missingPercentage: 0 },
        ];
        const plan: DataPreparationPlan = {
            explanation: 'Committed cleaned business dataset.',
            operations: [],
            outputColumns: workingProfiles,
            planStatus: 'schema_only',
            consistencyIssues: [],
        };

        state.columnRegistry = buildColumnRegistry({
            data: rawData,
            columnProfiles: baseProfiles,
            existingRegistry: null,
        });
        state.userColumnAnnotations = {
            revenue: {
                columnName: 'Revenue',
                businessLabel: 'Net Revenue',
                description: '',
            },
        };
        state.latestAnalysisSession = {
            analysisSteering: {
                inferredColumnLabels: {
                    RegionCode: 'Region',
                },
            },
        } as unknown as AppStore['latestAnalysisSession'];

        await persistSuccessfulCleaning({
            store,
            rawData,
            latestState: state,
            workingData,
            workingProfiles,
            plan,
        });

        expect(state.csvData?.data).toEqual(workingData.data);
        expect(state.columnProfiles.map(profile => profile.name)).toEqual(['RegionCode', 'Revenue', 'Margin']);
        expect(state.columnRegistry?.columns.map(column => column.physicalName)).toEqual(['RegionCode', 'Revenue', 'Margin']);
        expect(state.columnRegistry?.columns.map(column => column.displayLabel)).toEqual(['Region', 'Net Revenue', 'Margin']);
        expect(state.columnRegistry?.columns.some(column => column.physicalName === 'BRAND')).toBe(false);
        expect(runSqlPrecheckMock.mock.calls.at(-1)?.[1]?.map((profile: ColumnProfile) => profile.name))
            .toEqual(['RegionCode', 'Revenue', 'Margin']);
    });
});
