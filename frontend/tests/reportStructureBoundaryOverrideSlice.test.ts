// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataSlice } from '../store/slices/dataSlice';
import { createTestSettings } from './testSettings';
import { createMultiHeaderIntakeIr } from './reportShapeFixtures/cases';
import { buildCsvDataFromIntakeIr, rebuildIntakeIrWithBoundary } from '../services/data/reportCsvIntake';
import { DEFAULT_AUTO_ANALYSIS_GOAL } from '../services/agent/analysisDefaults';

const { primeDuckDbDatasetMock } = vi.hoisted(() => ({
    primeDuckDbDatasetMock: vi.fn(),
}));

vi.mock('../services/duckdb/queryEngine', () => ({
    primeDuckDbDataset: primeDuckDbDatasetMock,
    DUCKDB_INIT_TIMEOUT_MS: 5000,
}));

const createSliceHarness = () => {
    const intakeIr = createMultiHeaderIntakeIr();
    const wrongStageIr = rebuildIntakeIrWithBoundary(
        intakeIr,
        {
            headerRowIndex: 3,
            headerLayerIndexes: [],
            bodyStartIndex: 4,
            summaryStartIndex: 11,
            parameterRowIndexes: [],
            repeatedHeaderRowIndexes: [],
        },
        'ai_fallback_deterministic',
    );
    const rawCsvData = buildCsvDataFromIntakeIr(intakeIr);
    const csvData = buildCsvDataFromIntakeIr(wrongStageIr);

    let state: Record<string, any> = {
        sessionId: 'session-test',
        currentDatasetId: 'dataset-test',
        settings: createTestSettings(),
        progressMessages: [],
        csvData,
        rawCsvData,
        rawIntakeIr: intakeIr,
        reportStructureResolution: null,
        canonicalCsvData: null,
        canonicalBuildMeta: null,
        canonicalizationStatus: 'idle',
        pipelineOutcome: null,
        dataPreparationPlan: {
            explanation: 'boundary override regression',
            operations: [],
            outputColumns: [],
            planStatus: 'schema_only',
            consistencyIssues: [],
        },
        cleaningRun: null,
        columnProfiles: [],
        reportContextResolution: null,
        datasetSemanticSnapshot: null,
        semanticStatus: 'idle',
        semanticDatasetVersion: null,
        duckDbSessionStatus: { status: 'idle' },
        currentView: 'analysis_dashboard',
        activeDataQuery: null,
        confirmedAnalysisGoal: null,
        analysisCards: [],
        finalSummary: null,
        addProgress: vi.fn(),
        logAgentToolUsage: vi.fn(),
        recordAgentEvent: vi.fn(),
        setIsReportBoundaryConfirmModalOpen: vi.fn(),
    };

    const setState = (update: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
        const partial = typeof update === 'function' ? update(state) : update;
        state = { ...state, ...partial };
    };
    const getState = () => state;
    const slice = createDataSlice(setState as never, getState as never, {} as never);
    state = { ...state, ...slice };
    state.ensureDatasetSemanticSnapshot = vi.fn().mockResolvedValue(null);
    state.handleInitialAnalysis = vi.fn().mockResolvedValue({ status: 'ready' });
    state.proposeAnalysisGoals = vi.fn().mockResolvedValue(undefined);

    return {
        getState,
        boundary: {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        },
    };
};

describe('report structure boundary override slice integration', () => {
    beforeEach(() => {
        primeDuckDbDatasetMock.mockReset();
        primeDuckDbDatasetMock.mockResolvedValue(null);
    });

    it('refreshes semantics and downstream analysis when a boundary override unlocks canonical data', async () => {
        const { getState, boundary } = createSliceHarness();

        await getState().saveReportStructureBoundaryOverride(boundary);

        expect(getState().pipelineOutcome?.status).toBe('ready');
        expect(getState().canonicalizationStatus).toBe('ready');
        expect(getState().ensureDatasetSemanticSnapshot).toHaveBeenCalledTimes(1);
        expect(getState().columnProfiles.map((profile: { name: string }) => profile.name)).toContain('SeriesKey');
        expect(getState().columnProfiles.map((profile: { name: string }) => profile.name)).toContain('Value');
        expect(getState().handleInitialAnalysis).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.any(Array),
            }),
            DEFAULT_AUTO_ANALYSIS_GOAL,
            { trigger: 'manual' },
        );
        expect(getState().proposeAnalysisGoals).toHaveBeenCalledTimes(1);
        expect(getState().recordAgentEvent).toHaveBeenCalledWith(expect.objectContaining({
            step: 'structure_confirmation_applied',
            status: 'done',
            activity: expect.objectContaining({
                kind: 'approval',
                lifecycle: 'completed',
            }),
        }));
    });

    it('waits for analysis summaries before proposing follow-up goals after a boundary override', async () => {
        const { getState, boundary } = createSliceHarness();
        let resolveSummaries: (() => void) | null = null;
        const summaryPromise = new Promise<void>(resolve => {
            resolveSummaries = resolve;
        });
        getState().handleInitialAnalysis.mockResolvedValue({
            status: 'ready',
            summaryPromise,
        });

        const pending = getState().saveReportStructureBoundaryOverride(boundary);
        await Promise.resolve();

        expect(getState().proposeAnalysisGoals).not.toHaveBeenCalled();

        resolveSummaries?.();
        await pending;

        expect(getState().proposeAnalysisGoals).toHaveBeenCalledTimes(1);
    });
});
