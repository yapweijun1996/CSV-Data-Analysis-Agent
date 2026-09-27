import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../store/useAppStore';
import type { AiCleaningProgram, AiCleaningProgramResult, ColumnProfile, CsvData, DataPreparationPlan } from '../types';
import type { StoreApi } from '../services/agent/types';
import { orchestrateAutonomousAiCleaning } from '../services/agent/orchestration/autonomousCleaningPipeline';
import { createAlreadyTabularWithReportNoiseCase, createMultiHeaderProjectMatrixCase, createMultiHeaderIntakeIr } from './reportShapeFixtures/cases';
import { getTranslation } from '../utils/localization';

const {
    generateAiCleaningProgramMock,
    executeAiCleaningProgramWithWorkerMock,
    profileDataWithWorkerMock,
    ensureDuckDbSessionSyncMock,
    runSqlPrecheckMock,
    buildCleaningVerificationReportMock,
    verifyCleanedDatasetShapeMock,
    trySandboxCleaningFallbackMock,
} = vi.hoisted(() => ({
    generateAiCleaningProgramMock: vi.fn(),
    executeAiCleaningProgramWithWorkerMock: vi.fn(),
    profileDataWithWorkerMock: vi.fn(),
    ensureDuckDbSessionSyncMock: vi.fn(),
    runSqlPrecheckMock: vi.fn(),
    buildCleaningVerificationReportMock: vi.fn(),
    verifyCleanedDatasetShapeMock: vi.fn(),
    trySandboxCleaningFallbackMock: vi.fn(),
}));

vi.mock('../services/ai/cleaningProgramGenerator', () => ({
    generateAiCleaningProgram: generateAiCleaningProgramMock,
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    executeAiCleaningProgramWithWorker: executeAiCleaningProgramWithWorkerMock,
    profileDataWithWorker: profileDataWithWorkerMock,
}));

vi.mock('../services/duckdb/storeSessionSync', () => ({
    ensureDuckDbSessionSync: ensureDuckDbSessionSyncMock,
}));

vi.mock('../services/agent/execution/sqlPrecheck', () => ({
    runSqlPrecheck: runSqlPrecheckMock,
}));

vi.mock('../services/agent/cleaningVerification', () => ({
    buildCleaningVerificationReport: buildCleaningVerificationReportMock,
    getVerificationSignalValue: (report: { signals?: Array<{ key: string; value: unknown }> }, key: string) =>
        report.signals?.find(signal => signal.key === key)?.value ?? null,
    isRecoverableCleaningSignalKey: (signalKey: string | null | undefined) =>
        ['noise_leakage_rate', 'repeated_header_leakage_rate', 'summary_like_series_key_leakage'].includes(signalKey ?? ''),
    verifyCleanedDatasetShape: verifyCleanedDatasetShapeMock,
}));

vi.mock('../services/agent/orchestration/sandboxCleaningFallback', () => ({
    trySandboxCleaningFallback: trySandboxCleaningFallbackMock,
}));

const createStore = (): { store: StoreApi; state: AppStore } => {
    const rawData: CsvData = {
        fileName: 'sample.csv',
        data: [{ Project: 'A', Amount: '100' }],
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
        csvData: rawData,
        rawCsvData: rawData,
        columnProfiles: [
            { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [100, 100], missingPercentage: 0 },
        ],
        dataPreparationPlan: null,
        workspaceFiles: {},
        chatHistory: [],
        cleaningRun: null,
        datasetSemanticSnapshot: null,
        semanticDatasetVersion: null,
        ensureDatasetSemanticSnapshot: vi.fn(async () => null),
        addProgress: vi.fn(),
    } as unknown as AppStore;

    const store: StoreApi = {
        getState: () => state,
        setState: partial => {
            Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
        },
    };

    return { store, state };
};

const program: AiCleaningProgram = {
    programId: 'program-1',
    explanation: 'No-op numeric verification pass.',
    source: 'llm_generated',
    outputColumns: [
        { name: 'Project', type: 'categorical' },
        { name: 'Amount', type: 'currency' },
    ],
    steps: [],
};

const createProgramResult = (
    candidateProgram: AiCleaningProgram = program,
    source: 'agent_primary' | 'agent_retry' | 'hierarchy_annotation' = 'agent_primary',
): AiCleaningProgramResult => ({
    primary: {
        strategyId: `strategy-${source}`,
        source,
        program: candidateProgram,
        plan: {
            explanation: candidateProgram.explanation,
            operations: candidateProgram.steps.flatMap(step => step.operations),
            outputColumns: profiles,
            planStatus: candidateProgram.steps.length > 0 ? 'operations' : 'schema_only',
            consistencyIssues: [],
        },
        intentSummary: candidateProgram.explanation,
        requires: candidateProgram.steps.flatMap(step => step.operations).some(operation => operation.type === 'annotate_hierarchy')
            ? ['hierarchical_shape']
            : [],
        priority: 1,
    },
    candidates: [{
        strategyId: `strategy-${source}`,
        source,
        program: candidateProgram,
        plan: {
            explanation: candidateProgram.explanation,
            operations: candidateProgram.steps.flatMap(step => step.operations),
            outputColumns: profiles,
            planStatus: candidateProgram.steps.length > 0 ? 'operations' : 'schema_only',
            consistencyIssues: [],
        },
        intentSummary: candidateProgram.explanation,
        requires: candidateProgram.steps.flatMap(step => step.operations).some(operation => operation.type === 'annotate_hierarchy')
            ? ['hierarchical_shape']
            : [],
        priority: 1,
    }],
});

const profiles: ColumnProfile[] = [
    { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
    { name: 'Amount', type: 'currency', valueRange: [100, 100], missingPercentage: 0 },
];

const semanticSnapshot = {
    datasetRole: 'mixed_report' as const,
    rowAnnotations: [],
    columnAnnotations: [
        { columnName: 'Code', semanticRole: 'code' as const, confidence: 0.9, reason: 'Detected code-like key.' },
        { columnName: 'Description', semanticRole: 'entity' as const, confidence: 0.92, reason: 'Detected descriptor label.' },
    ],
    recommendedAnalysisView: {
        mode: 'soft_exclude' as const,
        includedRowIndices: [0, 1],
        excludedRowIndices: [],
        includedRowCount: 2,
        excludedRowCount: 0,
        reason: 'No exclusions.',
    },
    summary: 'Detected a multi-header financial report that needs long-table reshaping.',
    generatedAt: '2026-03-13T00:00:00.000Z',
    modelId: 'gemini-test',
    sourceDatasetVersion: 'dataset-version',
};

const passedPlan = {
    passed: true,
    baselineFingerprints: [],
    finalFingerprints: [],
    steps: [],
    failures: [],
    destructiveImpacts: [],
};

const createProgramWithOperations = (
    programId: string,
    explanation: string,
    operations: NonNullable<DataPreparationPlan['operations']>,
): AiCleaningProgram => ({
    ...program,
    programId,
    explanation,
    steps: operations.length > 0
        ? [{
            id: `step_1_${operations[0].type}`,
            mode: 'reshape',
            reason: explanation,
            operations,
        }]
        : [],
});

describe('orchestrateAutonomousAiCleaning', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateAiCleaningProgramMock.mockResolvedValue(createProgramResult(program));
        executeAiCleaningProgramWithWorkerMock.mockResolvedValue({
            data: [{ Project: 'A', Amount: 100 }],
            logs: [],
            program,
            numericReconciliation: passedPlan,
            schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
        });
        profileDataWithWorkerMock.mockResolvedValue({ profiles, issues: [] });
        verifyCleanedDatasetShapeMock.mockReturnValue({ passed: true, reason: null });
        buildCleaningVerificationReportMock.mockReturnValue({
            overallStatus: 'pass',
            signals: [
                { key: 'noise_leakage_rate', value: 0, status: 'pass' },
                { key: 'repeated_header_leakage_rate', value: 0, status: 'pass' },
            ],
            blockingSignalKeys: [],
        });
        ensureDuckDbSessionSyncMock.mockResolvedValue({ engine: 'duckdb' });
        trySandboxCleaningFallbackMock.mockResolvedValue({
            status: 'retry',
            error: new Error('sandbox_verification_failed'),
        });
    });

    it('completes cleaning when numeric reconciliation and SQL precheck both pass', async () => {
        const { store, state } = createStore();
        state.datasetSemanticSnapshot = semanticSnapshot as AppStore['datasetSemanticSnapshot'];
        state.semanticDatasetVersion = semanticSnapshot.sourceDatasetVersion;
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.numericReconciliationStatus).toBe('passed');
        expect(state.cleaningRun?.sqlPrecheckStatus).toBe('passed');
        expect(state.cleaningRun?.loopCount).toBe(1);
        expect(state.datasetSemanticSnapshot).toBeNull();
        expect(state.semanticDatasetVersion).toBeNull();
        expect((state.dataPreparationPlan as DataPreparationPlan | null)?.sqlPrecheck?.status).toBe('passed');
        expect(generateAiCleaningProgramMock).not.toHaveBeenCalled();
        expect(state.addProgress).toHaveBeenCalledWith(
            getTranslation('autonomous_cleaning_attempt_progress', state.settings.language, { attempt: 1, maxAttempts: 3 }),
            'system',
            state.settings.complexModel,
        );
    });

    it('profiles the preferred canonical dataset before the cleaning loop starts', async () => {
        const { store, state } = createStore();
        const canonicalData: CsvData = {
            fileName: 'sample-canonical.csv',
            data: [
                { SeriesKey: 'Q1', Value: '100' },
                { SeriesKey: 'Q2', Value: '240' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = {
            ...state.csvData,
            fileName: 'sample-prepared.csv',
            data: [{ Project: 'stale-row', Amount: '999' }],
        };
        state.canonicalCsvData = canonicalData as AppStore['canonicalCsvData'];
        state.columnProfiles = [
            { name: 'Project', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [999, 999], missingPercentage: 0 },
        ];
        profileDataWithWorkerMock.mockResolvedValueOnce({
            profiles: [
                { name: 'SeriesKey', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Value', type: 'currency', valueRange: [100, 240], missingPercentage: 0 },
            ],
            issues: [],
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(profileDataWithWorkerMock.mock.calls[0]?.[0]).toEqual(canonicalData.data);
        expect(state.csvData?.data).toEqual(canonicalData.data);
        expect(state.columnProfiles.map(profile => profile.name)).toEqual(['SeriesKey', 'Value']);
        expect(generateAiCleaningProgramMock).not.toHaveBeenCalled();
    });

    it('uses the canonical dataset rows and refreshed profiles when AI cleaning is required', async () => {
        const { store, state } = createStore();
        const rawPreparedData: CsvData = {
            fileName: 'raw-prepared.csv',
            data: [
                { Project: 'North', Amount: '999' },
                { Project: 'South', Amount: '888' },
                { Project: 'West', Amount: '777' },
                { Project: 'East', Amount: '666' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        const canonicalData: CsvData = {
            fileName: 'canonical.csv',
            data: [
                { Customer: 'North', Note: '', Amount: '100' },
                { Customer: '', Note: '>> SUB-TOTAL', Amount: '100' },
                { Customer: 'South', Note: '', Amount: '200' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        const canonicalProfiles: ColumnProfile[] = [
            { name: 'Customer', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Note', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [100, 200], missingPercentage: 0 },
        ];
        state.rawCsvData = rawPreparedData;
        state.csvData = rawPreparedData;
        state.canonicalCsvData = canonicalData as AppStore['canonicalCsvData'];
        state.columnProfiles = [
            { name: 'Project', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [666, 999], missingPercentage: 0 },
        ];
        profileDataWithWorkerMock
            .mockResolvedValueOnce({
                profiles: canonicalProfiles,
                issues: [],
            })
            .mockResolvedValueOnce({
                profiles: canonicalProfiles,
                issues: [],
            });
        executeAiCleaningProgramWithWorkerMock.mockResolvedValueOnce({
            data: [
                { Customer: 'North', Note: '', Amount: '100' },
                { Customer: 'South', Note: '', Amount: '200' },
            ],
            logs: [{ operationType: 'drop_rows_by_index', status: 'done' }],
            program,
            numericReconciliation: passedPlan,
            schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(profileDataWithWorkerMock.mock.calls[0]?.[0]).toEqual(canonicalData.data);
        expect(generateAiCleaningProgramMock.mock.calls[0]?.[0]).toEqual(canonicalProfiles);
        expect(executeAiCleaningProgramWithWorkerMock.mock.calls[0]?.[0]).toEqual(canonicalData.data);
        expect(executeAiCleaningProgramWithWorkerMock.mock.calls[0]?.[0]).toHaveLength(3);
        expect(state.cleaningRun?.status).toBe('completed');
    });

    it('prefers agent-first cleaning and still completes when report-noise rows are high confidence', async () => {
        const { store, state } = createStore();
        const fixture = createMultiHeaderProjectMatrixCase();
        state.csvData = fixture.rawLike;
        state.rawCsvData = fixture.rawLike;
        (state as any).rawIntakeIr = createMultiHeaderIntakeIr();
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ...fixture.expectedShape.detailSeriesColumns.map(name => ({
                name,
                type: 'currency' as const,
                missingPercentage: 0,
            })),
        ];
        await orchestrateAutonomousAiCleaning(store);

        expect(generateAiCleaningProgramMock).toHaveBeenCalledTimes(1);
        expect(executeAiCleaningProgramWithWorkerMock).toHaveBeenCalledTimes(1);
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.rollbackReason).toBeNull();
        expect(state.cleaningRun?.loopCount).toBe(1);
        expect(state.cleaningRun?.iterationArtifacts?.[0]).toMatchObject({
            recoveryPath: 'ai_retry',
            verificationPassed: true,
        });
        expect(state.addProgress).toHaveBeenCalledWith(
            getTranslation('autonomous_cleaning_attempt_progress', state.settings.language, { attempt: 1, maxAttempts: 3 }),
            'system',
            state.settings.complexModel,
        );
    });

    it('keeps the verified cleaned snapshot when SQL precheck only warns on degraded SQL readiness', async () => {
        const { store, state } = createStore();
        runSqlPrecheckMock.mockResolvedValue({
            status: 'warning',
            summary: 'SQL precheck could not confirm a stable preferred SQL path after AI cleaning.',
            findings: [
                {
                    kind: 'constant_metric',
                    severity: 'warn',
                    message: 'Metric "Amount" is constant.',
                },
                {
                    kind: 'zero_total_metric',
                    severity: 'warn',
                    message: 'Metric "Amount" sums to zero after cleaning.',
                },
            ],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.sqlPrecheckStatus).toBe('warning');
        expect(state.cleaningRun?.lastError).toBeNull();
        expect(generateAiCleaningProgramMock).not.toHaveBeenCalled();
        expect(runSqlPrecheckMock).toHaveBeenCalledTimes(1);
        expect((state.dataPreparationPlan as DataPreparationPlan | null)?.sqlPrecheck?.status).toBe('warning');
        expect(state.chatHistory.at(-1)?.type).toBe('ai_cleaning_step');
        expect(state.chatHistory.at(-1)?.text).toContain('Metric "Amount" is constant.');
        expect(state.chatHistory.at(-1)?.cleaningStep?.status).toBe('warning');
    });

    it('routes complex reports through inspect-first LLM loop (no direct deterministic reshape)', async () => {
        const { store, state } = createStore();
        const fixture = createMultiHeaderProjectMatrixCase();
        state.csvData = fixture.rawLike;
        state.rawCsvData = fixture.rawLike;
        (state as any).rawIntakeIr = createMultiHeaderIntakeIr();
        state.ensureDatasetSemanticSnapshot = vi.fn(async () => semanticSnapshot as AppStore['datasetSemanticSnapshot']);
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ...fixture.expectedShape.detailSeriesColumns.map(name => ({
                name,
                type: 'currency' as const,
                missingPercentage: 0,
            })),
        ];
        // LLM loop: generateAiCleaningProgram is called since all paths go through inspect-first
        generateAiCleaningProgramMock.mockResolvedValueOnce(createProgramResult(program));
        executeAiCleaningProgramWithWorkerMock
            .mockResolvedValueOnce({
                data: fixture.cleanedGood.data,
                logs: [],
                program,
                numericReconciliation: passedPlan,
                schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
            });
        verifyCleanedDatasetShapeMock.mockReturnValue({ passed: true, reason: null });
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [
                { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'SeriesKey', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'Value', type: 'currency', missingPercentage: 0 },
                { name: 'SourceColumnName', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'SourceRowIndex', type: 'numerical', missingPercentage: 0 },
            ],
            issues: [],
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        // All paths go through inspect-first LLM loop, even complex reports
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.strategy).toBe('simple_detail_strategy');
        expect(state.cleaningRun?.strategyKind).toBe('llm_guided');
    });

    it('routes already-tabular datasets with report-noise through inspect-first LLM loop', async () => {
        const { store, state } = createStore();
        const fixture = createAlreadyTabularWithReportNoiseCase();
        state.csvData = fixture.rawLike;
        state.rawCsvData = fixture.rawLike;
        state.columnProfiles = [
            { name: 'Region', type: 'categorical', uniqueValues: 5, missingPercentage: 0 },
            { name: 'Segment', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            { name: 'Revenue', type: 'currency', missingPercentage: 0 },
        ];
        generateAiCleaningProgramMock.mockResolvedValueOnce(createProgramResult(program));
        executeAiCleaningProgramWithWorkerMock.mockResolvedValueOnce({
            data: fixture.cleanedGood.data,
            logs: [],
            program,
            numericReconciliation: passedPlan,
            schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
        });
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [
                { name: 'Region', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'Segment', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'Revenue', type: 'currency', missingPercentage: 0 },
            ],
            issues: [],
        });
        verifyCleanedDatasetShapeMock.mockReturnValue({ passed: true });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        // All paths now go through inspect-first LLM loop
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.strategy).toBe('simple_detail_strategy');
        expect(state.cleaningRun?.strategyKind).toBe('llm_guided');
        expect(generateAiCleaningProgramMock).not.toHaveBeenCalled();
    });

    it('uses English cleaning messages when English is selected', async () => {
        const { store, state } = createStore();
        state.settings.language = 'English';
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(state.chatHistory[0]?.text).toBe(getTranslation('autonomous_cleaning_running', 'English'));
        expect(state.chatHistory.at(-1)?.text).toBe(
            getTranslation('autonomous_cleaning_completed_chat', 'English', { rowCount: 1 }),
        );
        expect(state.addProgress).toHaveBeenCalledWith(
            getTranslation('autonomous_cleaning_attempt_progress', 'English', { attempt: 1, maxAttempts: 3 }),
            'system',
            state.settings.complexModel,
        );
    });

    it('routes complex reports through LLM loop even when semantic snapshot is unavailable', async () => {
        const { store, state } = createStore();
        const fixture = createMultiHeaderProjectMatrixCase();
        state.csvData = fixture.rawLike;
        state.rawCsvData = fixture.rawLike;
        (state as any).rawIntakeIr = createMultiHeaderIntakeIr();
        state.ensureDatasetSemanticSnapshot = vi.fn(async () => null);
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ...fixture.expectedShape.detailSeriesColumns.map(name => ({
                name,
                type: 'currency' as const,
                missingPercentage: 0,
            })),
        ];
        // LLM loop will try to generate a cleaning program
        generateAiCleaningProgramMock.mockRejectedValue(new Error('LLM budget exhausted'));

        await orchestrateAutonomousAiCleaning(store);

        // With inspect-first, complex reports go through LLM loop
        expect(state.cleaningRun?.strategyKind).toBe('llm_guided');
    });

    it('falls back to deterministic recovery when label-layer verification fails after program execution', async () => {
        const { store, state } = createStore();
        const fixture = createMultiHeaderProjectMatrixCase();
        state.csvData = fixture.rawLike;
        state.rawCsvData = fixture.rawLike;
        (state as any).rawIntakeIr = createMultiHeaderIntakeIr();
        state.ensureDatasetSemanticSnapshot = vi.fn(async () => semanticSnapshot as AppStore['datasetSemanticSnapshot']);
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ...fixture.expectedShape.detailSeriesColumns.map(name => ({
                name,
                type: 'currency' as const,
                missingPercentage: 0,
            })),
        ];
        generateAiCleaningProgramMock.mockResolvedValue(createProgramResult(program));
        executeAiCleaningProgramWithWorkerMock
            .mockResolvedValueOnce({
                data: fixture.cleanedBroken.missingSeriesLabel?.cleanedData.data ?? [],
                logs: [],
                program,
                numericReconciliation: passedPlan,
                schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
            })
            .mockResolvedValueOnce({
                data: fixture.cleanedGood.data,
                logs: [],
                program: createProgramWithOperations(
                    'recovery-program',
                    'Recover from structural verification failure with deterministic cleanup.',
                    [],
                ),
                numericReconciliation: passedPlan,
                schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
            });
        verifyCleanedDatasetShapeMock
            .mockReturnValueOnce({
                passed: false,
                reason: 'Multi-header label layers were not preserved during reshaping.',
                signalKey: 'label_layer_retention_complete',
            })
            .mockReturnValueOnce({ passed: true, reason: null, signalKey: null });
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [
                { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'SeriesKey', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'Value', type: 'currency', missingPercentage: 0 },
                { name: 'SourceColumnName', type: 'categorical', uniqueValues: 8, missingPercentage: 0 },
                { name: 'SourceRowIndex', type: 'numerical', missingPercentage: 0 },
            ],
            issues: [],
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(executeAiCleaningProgramWithWorkerMock).toHaveBeenCalledTimes(2);
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.rollbackReason).toBeNull();
        expect(state.cleaningRun?.strategyKind).toBe('deterministic_reshape');
        expect(state.cleaningRun?.iterationArtifacts?.[0]).toMatchObject({
            failureSignalKey: 'label_layer_retention_complete',
            recoveryPath: 'deterministic_reshape',
        });
    });

    it('retries from the latest cleaned candidate instead of the original snapshot after residual noise verification fails', async () => {
        const { store, state } = createStore();
        const rawLike: CsvData = {
            fileName: 'so-outstanding-mini.csv',
            data: [
                { Project: 'North', Region: 'APAC', Note: '', Amount: '100', Currency: 'SGD' },
                { Project: '', Region: '', Note: '>> SUB-TOTAL', Amount: '100', Currency: 'SGD' },
                { Project: 'South', Region: 'APAC', Note: '', Amount: '200', Currency: 'SGD' },
                { Project: '', Region: '', Note: '', Amount: '', Currency: '' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = rawLike;
        state.rawCsvData = rawLike;
        state.columnProfiles = [
            { name: 'Project', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
            { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Note', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [100, 200], missingPercentage: 0 },
            { name: 'Currency', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
        ];
        executeAiCleaningProgramWithWorkerMock
            .mockResolvedValueOnce({
                data: [
                    { Project: 'North', Region: 'APAC', Note: '', Amount: '100', Currency: 'SGD' },
                    { Project: '', Region: '', Note: '>> SUB-TOTAL', Amount: '100', Currency: 'SGD' },
                    { Project: 'South', Region: 'APAC', Note: '', Amount: '200', Currency: 'SGD' },
                ],
                logs: [{ operationType: 'drop_rows_by_index', status: 'done' }],
                program,
                numericReconciliation: passedPlan,
                schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
            });
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Note', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'currency', valueRange: [100, 200], missingPercentage: 0 },
                { name: 'Currency', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            ],
            issues: [],
        });
        verifyCleanedDatasetShapeMock.mockReturnValue({ passed: true, reason: null });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });
        trySandboxCleaningFallbackMock.mockImplementationOnce(async ({ store: sandboxStore, workingData, round }) => {
            expect(workingData.data).toHaveLength(3);
            sandboxStore.setState((previous: AppStore) => ({
                cleaningRun: {
                    ...previous.cleaningRun!,
                    status: 'completed',
                    iterationArtifacts: (previous.cleaningRun?.iterationArtifacts ?? []).map(record =>
                        record.round === round
                            ? { ...record, verificationPassed: true, recoveryPath: 'sandbox_js', failureSignalKey: null }
                            : record),
                },
            }));
            return { status: 'committed', error: null };
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(executeAiCleaningProgramWithWorkerMock).toHaveBeenCalledTimes(1);
        expect(executeAiCleaningProgramWithWorkerMock.mock.calls[0][0]).toHaveLength(4);
        expect(trySandboxCleaningFallbackMock).toHaveBeenCalledTimes(1);
        expect(state.cleaningRun?.iterationArtifacts.map(artifact => artifact.rowCountBefore)).toEqual([4, 3]);
        expect(state.cleaningRun?.iterationArtifacts?.[0]).toMatchObject({
            recoveryPath: 'deterministic_cleanup',
            failureSignalKey: 'noise_leakage_rate',
        });
        expect(state.cleaningRun?.iterationArtifacts?.[1]).toMatchObject({
            verificationPassed: true,
            failureSignalKey: null,
            recoveryPath: 'sandbox_js',
        });
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.loopCount).toBe(2);
    });

    it('falls back to deterministic cleanup when AI program generation fails and deterministic operations are available', async () => {
        const { store, state } = createStore();
        state.csvData = {
            fileName: 'noise-report.csv',
            data: [
                { Project: 'North', Region: 'APAC', Note: '', Amount: '100', Currency: 'SGD' },
                { Project: '', Region: '', Note: '>> SUB-TOTAL', Amount: '100', Currency: 'SGD' },
                { Project: 'South', Region: 'APAC', Note: '', Amount: '200', Currency: 'SGD' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.rawCsvData = state.csvData;
        state.columnProfiles = [
            { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Note', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [100, 200], missingPercentage: 0 },
            { name: 'Currency', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
        ];
        generateAiCleaningProgramMock.mockRejectedValueOnce(new Error('AI planner timeout'));
        executeAiCleaningProgramWithWorkerMock.mockResolvedValueOnce({
            data: [
                { Project: 'North', Region: 'APAC', Note: '', Amount: '100', Currency: 'SGD' },
                { Project: 'South', Region: 'APAC', Note: '', Amount: '200', Currency: 'SGD' },
            ],
            logs: [{ operationType: 'drop_rows_by_index', status: 'done' }],
            program: createProgramWithOperations(
                'deterministic-fallback-program',
                'Runtime deterministic cleanup removed subtotal rows.',
                [{
                    id: 'drop_rows_1',
                    type: 'drop_rows_by_index',
                    reason: 'Drop subtotal noise rows.',
                    indices: [1],
                }],
            ),
            numericReconciliation: passedPlan,
            schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
        });
        profileDataWithWorkerMock.mockResolvedValue({
            profiles: [
                { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Region', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Note', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                { name: 'Amount', type: 'currency', valueRange: [100, 200], missingPercentage: 0 },
                { name: 'Currency', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            ],
            issues: [],
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(generateAiCleaningProgramMock).toHaveBeenCalledTimes(1);
        expect(executeAiCleaningProgramWithWorkerMock).toHaveBeenCalledTimes(1);
        expect(executeAiCleaningProgramWithWorkerMock.mock.calls[0]?.[1]?.source).toBe('semantic_deterministic');
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.recoveryState?.recoveredBy).toBe('deterministic_cleanup');
        expect(state.cleaningRun?.recoveryState?.analysisMode).toBe('degraded_safe');
        expect(state.cleaningRun?.iterationArtifacts?.[0]).toMatchObject({
            recoveryPath: 'deterministic_cleanup',
            usedAi: false,
            verificationPassed: true,
        });
        expect(state.addProgress).toHaveBeenCalledWith(
            'AI 清洗方案生成失败，系统已切换到安全的确定性清洗方案。',
            'warning',
            state.settings.complexModel,
        );
    });

    it('skips hierarchy-only AI strategies at preflight and continues with the safe retry candidate', async () => {
        const { store, state } = createStore();
        const fixture = createMultiHeaderProjectMatrixCase();
        state.csvData = fixture.rawLike;
        state.rawCsvData = fixture.rawLike;
        (state as any).rawIntakeIr = createMultiHeaderIntakeIr();
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Description', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            ...fixture.expectedShape.detailSeriesColumns.map(name => ({
                name,
                type: 'currency' as const,
                missingPercentage: 0,
            })),
        ];
        const hierarchyProgram = createProgramWithOperations(
            'hierarchy-program',
            'Preserve hierarchy before analysis.',
            [{
                id: 'annotate_hierarchy_fallback',
                type: 'annotate_hierarchy',
                reason: 'Preserve hierarchy.',
                rowClassColumn: 'RowClass',
                hierarchyDepthColumn: 'HierarchyDepth',
                sourceRowIndexColumn: 'SourceRowIndex',
            }],
        );
        const safeRetryProgram = createProgramWithOperations(
            'safe-retry-program',
            'Use safe numeric cleanup only.',
            [],
        );
        generateAiCleaningProgramMock.mockResolvedValueOnce({
            primary: createProgramResult(hierarchyProgram).primary,
            candidates: [
                createProgramResult(hierarchyProgram).primary,
                createProgramResult(safeRetryProgram, 'agent_retry').primary,
            ],
        });
        executeAiCleaningProgramWithWorkerMock.mockResolvedValueOnce({
            data: [{ Project: 'A', Amount: 100 }],
            logs: [],
            program: safeRetryProgram,
            numericReconciliation: passedPlan,
            schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(executeAiCleaningProgramWithWorkerMock).toHaveBeenCalledTimes(1);
        expect(executeAiCleaningProgramWithWorkerMock.mock.calls[0]?.[1]?.programId).toBe('safe-retry-program');
        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.recoveryState?.recoveredBy).toBe('agent_retry');
        expect(state.cleaningRun?.recoveryState?.analysisMode).toBe('degraded_safe');
        expect(state.cleaningRun?.technicalDetail).toBeNull();
    });

    it('completes normally when the terminal aggregate row can be safely classified and cleaned', async () => {
        const { store, state } = createStore();
        const noisyData: CsvData = {
            fileName: 'subtotal-noise.csv',
            data: [
                { Project: 'North', Amount: '100' },
                { Project: 'South', Amount: '200' },
                { Project: '', Amount: '300' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        state.csvData = noisyData;
        state.rawCsvData = noisyData;
        state.columnProfiles = [
            { name: 'Project', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Amount', type: 'currency', valueRange: [100, 300], missingPercentage: 0 },
        ];
        executeAiCleaningProgramWithWorkerMock.mockResolvedValue({
            data: noisyData.data,
            logs: [],
            program,
            numericReconciliation: passedPlan,
            schemaDiff: { addedColumns: [], removedColumns: [], changedColumns: [] },
        });
        runSqlPrecheckMock.mockResolvedValue({
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        });

        await orchestrateAutonomousAiCleaning(store);

        expect(state.cleaningRun?.status).toBe('completed');
        expect(state.cleaningRun?.lastError).toBeNull();
        expect(state.cleaningRun?.recoveryState.analysisMode).toBe('normal');
        expect(state.cleaningRun?.userFacingMessage).toBeNull();
        expect(state.cleaningRun?.technicalDetail).toBeNull();
    });
});
