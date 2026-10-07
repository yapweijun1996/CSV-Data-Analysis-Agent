// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_ANALYSIS_MAX_STEPS } from '../config/agentDefaults';

const {
    generateAnalysisTopicsMock,
    callSmallAiStepMock,
    processSingleTopicMock,
    buildDatasetContextMock,
    buildAnalysisIntentBriefMock,
    buildRuntimeSemanticUnderstandingMock,
    emitAgentEventMock,
    resolveDatasetBindingTargetMock,
    ensureDuckDbSessionSyncMock,
    createWorkerDiagnosticsTelemetryReporterMock,
    getSemanticHiddenRowCountMock,
    runDataInvestigationHarnessMock,
    buildAndRunExplorationQueriesMock,
    handleAiActionMock,
} = vi.hoisted(() => ({
    generateAnalysisTopicsMock: vi.fn(),
    callSmallAiStepMock: vi.fn(),
    processSingleTopicMock: vi.fn(),
    buildDatasetContextMock: vi.fn(),
    buildAnalysisIntentBriefMock: vi.fn(),
    buildRuntimeSemanticUnderstandingMock: vi.fn(),
    emitAgentEventMock: vi.fn(),
    resolveDatasetBindingTargetMock: vi.fn(),
    ensureDuckDbSessionSyncMock: vi.fn(),
    createWorkerDiagnosticsTelemetryReporterMock: vi.fn(),
    getSemanticHiddenRowCountMock: vi.fn(),
    runDataInvestigationHarnessMock: vi.fn(),
    buildAndRunExplorationQueriesMock: vi.fn(),
    handleAiActionMock: vi.fn(),
}));

vi.mock('../services/agent/planning/planGenerator', () => ({
    generateAnalysisTopics: generateAnalysisTopicsMock,
    callSmallAiStep: callSmallAiStepMock,
}));

vi.mock('../services/agent/planning/topicProcessor', () => ({
    processSingleTopic: processSingleTopicMock,
}));

vi.mock('../services/agent/contextBuilder', () => ({
    buildDatasetContext: buildDatasetContextMock,
}));

vi.mock('../services/agent/analysisBrief', () => ({
    buildAnalysisIntentBrief: buildAnalysisIntentBriefMock,
}));

vi.mock('../services/agent/runtimeSemanticUnderstanding', () => ({
    buildRuntimeSemanticUnderstanding: buildRuntimeSemanticUnderstandingMock,
}));

vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: emitAgentEventMock,
    updateAgentTaskStatus: vi.fn(),
}));

vi.mock('../services/agent/datasetBinding', () => ({
    resolveDatasetBindingTarget: resolveDatasetBindingTargetMock,
}));

vi.mock('../services/agent/runtime/dataInvestigationHarness', () => ({
    runDataInvestigationHarness: runDataInvestigationHarnessMock,
}));

vi.mock('../services/agent/runtime/dataExplorationQueries', () => ({
    buildAndRunExplorationQueries: buildAndRunExplorationQueriesMock,
}));

vi.mock('../services/duckdb/storeSessionSync', () => ({
    ensureDuckDbSessionSync: ensureDuckDbSessionSyncMock,
}));

vi.mock('../services/workers/workerDiagnostics', () => ({
    createWorkerDiagnosticsTelemetryReporter: createWorkerDiagnosticsTelemetryReporterMock,
    estimateSerializableBytes: () => 0,
    getNowMs: () => 0,
    shouldReportWorkerDiagnostics: () => false,
    reportWorkerDiagnostics: () => undefined,
    buildWorkerDiagnosticsEntry: () => ({}),
    getWorkerDiagnosticsLabel: (family: string, task: string) => `${family}.${task}`,
}));

vi.mock('../services/agent/datasetSemantics', async () => {
    const actual = await vi.importActual('../services/agent/datasetSemantics');
    return {
        ...actual,
        getSemanticHiddenRowCount: getSemanticHiddenRowCountMock,
    };
});

vi.mock('../services/agent/actionHandler', () => ({
    handleAiAction: handleAiActionMock,
}));

const createStore = () => {
    const state: any = {
        sessionId: 'session-1',
        csvData: {
            fileName: 'report.csv',
            data: [{ Code: 'A', Value: 10 }],
        },
        canonicalCsvData: null,
        analysisCards: [],
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        visibleAnalysisTrace: [],
        latestAnalysisSession: null,
        activeAnalysisSession: null,
        columnProfiles: [
            { name: 'Code', type: 'categorical', uniqueValues: 99, missingPercentage: 0 },
            { name: 'Value', type: 'numerical', missingPercentage: 0 },
        ],
        settings: {
            provider: 'google',
            geminiApiKey: 'test-key',
            openAIApiKey: '',
            simpleModel: 'gemini-3-flash-preview',
            complexModel: 'gemini-3-flash-preview',
            language: 'Mandarin',
            autoConfirmGoal: true,
        },
        reportContextResolution: null,
        datasetSemanticSnapshot: null,
        semanticDatasetVersion: null,
        dataPreparationPlan: null,
        duckDbSessionStatus: { status: 'idle', fallbackReason: null },
        reportGenerationProgress: { completed: 0, total: 0, mode: 'analysis' },
        ensureDatasetSemanticSnapshot: vi.fn(async () => null),
        addProgress: vi.fn(),
        logTelemetryEvent: vi.fn(),
    };

    return {
        state,
        store: {
            getState: () => state,
            setState: (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial),
        },
    };
};

describe('dataAnalysisSessionRunner', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.resetAllMocks();

        buildDatasetContextMock.mockReturnValue({
            title: 'Dataset',
            dimensionColumns: ['Code'],
            metricColumns: ['Value'],
            preferredGrainColumns: [],
            preferredMetricTerms: ['Value'],
            blockedDimensions: [],
            helperDimensions: [],
            businessGrains: ['Project'],
            businessGrainConfidence: 'medium',
            unsafeForBusinessNarrative: false,
        });
        buildAnalysisIntentBriefMock.mockReturnValue({
            datasetShape: 'generic_table',
            recommendedPath: 'direct_plan',
            targetMetrics: ['Value'],
            expectedArtifact: 'card',
            comparisonMode: 'none',
            semanticMetrics: [],
            metricDefinitions: [],
            supportedDerivedMetrics: [],
            grainCandidates: [],
            blockers: [],
            validationIssues: [],
            notes: [],
        });
        buildRuntimeSemanticUnderstandingMock.mockReturnValue({
            businessGrains: ['Project'],
            candidateMetrics: ['Value'],
            timeGrains: [],
            helperDimensions: [],
            blockedDimensions: [],
            detailRowPolicy: 'exclude_non_detail_rows',
            businessGlossary: ['Value'],
            businessGrainConfidence: 'medium',
            unsafeForBusinessNarrative: false,
        });
        resolveDatasetBindingTargetMock.mockReturnValue(null);
        ensureDuckDbSessionSyncMock.mockResolvedValue({
            engine: 'duckdb',
            tableName: 'session_clean_dataset',
            loadVersion: 'dataset-1',
            fallbackReason: null,
        });
        buildAndRunExplorationQueriesMock.mockResolvedValue('Exploration summary');
        runDataInvestigationHarnessMock.mockResolvedValue(null);
        callSmallAiStepMock.mockResolvedValue('{"decision":"skip","reason":"no safe repair"}');
        handleAiActionMock.mockResolvedValue({
            status: 'success',
            toolName: 'data.mutate',
            message: 'Applied mutation.',
            shouldStop: false,
        });
        createWorkerDiagnosticsTelemetryReporterMock.mockReturnValue(() => {});
        getSemanticHiddenRowCountMock.mockReturnValue(0);
        // Return topics only on the first call; subsequent calls (multi-round
        // gap generation) return empty to prevent unintended extra hypotheses.
        generateAnalysisTopicsMock.mockResolvedValueOnce(['Topic A', 'Topic B']).mockResolvedValue([]);
        processSingleTopicMock.mockResolvedValue({
            status: 'completed',
            cardCreated: false,
            tableFirst: false,
            accepted: false,
            valueDecision: 'reject',
            evidenceLoopState: null,
            sourceStepIds: [],
            rejectionReason: 'reject',
        });
    });

    it('uses a Pi research plan once instead of generating topics', async () => {
        const { getCurrentAnalysisDatasetVersion } = await import('../services/agent/artifactProvenance');
        const { store, state } = createStore();
        state.initialAnalysisPlan = {
            datasetVersion: getCurrentAnalysisDatasetVersion(state as never),
            consumed: false,
            rejected: [],
            questions: [
                { title: 'Typical value by code', rationale: 'r', dimension: 'Code', metric: 'Value', aggregation: 'median', comparison: null },
                { title: 'Total value', rationale: 'r', dimension: null, metric: 'Value', aggregation: 'sum', comparison: null },
            ],
        };
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        await runDataAnalysisSession({ origin: 'auto_analysis', goal: 'Summarize key patterns', store: store as never });

        // Later gap rounds may still ask for topics; the first round must come from the plan.
        expect(JSON.stringify(processSingleTopicMock.mock.calls[0])).toContain('Typical value by code (median of Value by Code)');
        expect(state.initialAnalysisPlan.consumed).toBe(true);
    });

    it('degrades early without generating business hypotheses when no safe business grain and no candidate metrics exist', async () => {
        buildDatasetContextMock.mockReturnValue({
            title: 'Dataset',
            dimensionColumns: [],
            metricColumns: [],
            preferredGrainColumns: [],
            preferredMetricTerms: [],
            blockedDimensions: [],
            helperDimensions: [],
            businessGrains: [],
            businessGrainConfidence: 'low',
            unsafeForBusinessNarrative: true,
        });
        buildRuntimeSemanticUnderstandingMock.mockReturnValue({
            businessGrains: [],
            candidateMetrics: [],
            timeGrains: [],
            helperDimensions: ['Description', 'SeriesKey'],
            blockedDimensions: ['SeriesKey', 'RowClass'],
            detailRowPolicy: 'exclude_non_detail_rows',
            businessGlossary: [],
            businessGrainConfidence: 'low',
            unsafeForBusinessNarrative: true,
        });

        const { store } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(generateAnalysisTopicsMock).not.toHaveBeenCalled();
        expect(processSingleTopicMock).not.toHaveBeenCalled();
        expect(result.acceptedCardCount).toBe(0);
        expect(result.session.status).toBe('degraded');
        expect(result.session.researchBrief).toMatchObject({
            goal: 'Summarize key patterns',
            questions: [],
            clarification: {
                question: 'Which business grain or metric should the research run prioritize?',
            },
        });
        expect(result.session.stepsUsed).toBeLessThanOrEqual(DATA_ANALYSIS_MAX_STEPS);
        expect(result.session.trace).toEqual(expect.arrayContaining([
            expect.objectContaining({
                label: 'Propose Hypotheses',
                status: 'rejected',
                nextDecision: 'stop_session',
                reasonCodes: ['no_business_grains', 'unsafe_business_narrative'],
            }),
        ]));
    });

    it('honors checkpoint cancellation before starting later research actions', async () => {
        const { store } = createStore();
        const [{ runDataAnalysisSession }, { requestDataResearchCancellation }] = await Promise.all([
            import('../services/agent/runtime/dataAnalysisSessionRunner'),
            import('../services/agent/runtime/dataResearchCancellation'),
        ]);
        requestDataResearchCancellation('research-cancelled');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            runId: 'research-cancelled',
            store: store as never,
        });

        expect(result.session.status).toBe('cancelled');
        expect(result.session.stopReason).toBe('user_cancelled');
        expect(result.session.cancellationRequestedAt).toBeInstanceOf(Date);
        expect(buildAndRunExplorationQueriesMock).not.toHaveBeenCalled();
        expect(runDataInvestigationHarnessMock).not.toHaveBeenCalled();
        expect(generateAnalysisTopicsMock).not.toHaveBeenCalled();
        expect(processSingleTopicMock).not.toHaveBeenCalled();
        expect(emitAgentEventMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                step: 'analysis_session',
                activity: expect.objectContaining({
                    lifecycle: 'cancelled',
                }),
            }),
        );
    });

    it('stops after investigation when cancellation arrives during the harness', async () => {
        const { requestDataResearchCancellation } = await import(
            '../services/agent/runtime/dataResearchCancellation'
        );
        runDataInvestigationHarnessMock.mockImplementation(async () => {
            requestDataResearchCancellation('research-budget-expired');
            return {
                hierarchyGroups: [],
                duplicateLabels: [],
                metricRelationships: [],
                outlierDescriptions: [],
                missingDataPatterns: [{
                    column: 'Description',
                    nullRate: 0.2,
                    blankRate: 0,
                }],
                semanticCategories: {},
                leafDescriptions: [],
                parentDescriptions: [],
                investigationSummary: 'Bounded investigation completed.',
                topicConstraints: [],
                suggestedDerivedTopics: [],
                valueConcentration: null,
                temporalProfile: null,
                crossDimensionCardinality: [],
                dimensionCompleteness: [],
                coverageMetric: {
                    planned: 6,
                    attempted: 6,
                    succeeded: 6,
                    skipped: 0,
                    successRate: 1,
                },
                runtimeDirectives: {
                    preferGroupBy: ['Code'],
                    blockGroupBy: [],
                    softDeprioritizeGroupBy: [],
                    recommendedTopN: null,
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    detailRowColumn: null,
                    detailRowValue: null,
                    suggestedPivots: [],
                    suggestedHideOthers: false,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    widePivotShape: false,
                    formattedNumberColumns: [],
                    pairingSignals: [],
                },
            };
        });
        const { store } = createStore();
        const { runDataAnalysisSession } = await import(
            '../services/agent/runtime/dataAnalysisSessionRunner'
        );

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            runId: 'research-budget-expired',
            store: store as never,
        });

        expect(result.session.status).toBe('cancelled');
        expect(result.session.stopReason).toBe('user_cancelled');
        expect(runDataInvestigationHarnessMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ harnessTimeoutMs: 20_000 }),
        );
        expect(callSmallAiStepMock).not.toHaveBeenCalled();
        expect(generateAnalysisTopicsMock).not.toHaveBeenCalled();
        expect(processSingleTopicMock).not.toHaveBeenCalled();
    });

    it('returns a cancelled session when the evidence abort signal wins a long read-only exploration', async () => {
        const controller = new AbortController();
        buildAndRunExplorationQueriesMock.mockReturnValue(new Promise(() => undefined));
        runDataInvestigationHarnessMock.mockImplementation(() => {
            controller.abort(new DOMException('Evidence budget expired.', 'AbortError'));
            return new Promise(() => undefined);
        });
        const { store } = createStore();
        const { runDataAnalysisSession } = await import(
            '../services/agent/runtime/dataAnalysisSessionRunner'
        );

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            runId: 'research-abort-budget',
            abortSignal: controller.signal,
            store: store as never,
        });

        expect(result.session.status).toBe('cancelled');
        expect(result.session.stopReason).toBe('user_cancelled');
        expect(generateAnalysisTopicsMock).not.toHaveBeenCalled();
        expect(processSingleTopicMock).not.toHaveBeenCalled();
    });

    it('forces diagnostic mode when harness coverage is degraded and skips business hypothesis generation', async () => {
        runDataInvestigationHarnessMock.mockResolvedValue({
            hierarchyGroups: [],
            duplicateLabels: [],
            metricRelationships: [],
            outlierDescriptions: [],
            missingDataPatterns: [],
            semanticCategories: {},
            leafDescriptions: [],
            parentDescriptions: [],
            investigationSummary: 'Harness only partially completed.',
            topicConstraints: [],
            suggestedDerivedTopics: [],
            valueConcentration: null,
            temporalProfile: null,
            crossDimensionCardinality: [],
            dimensionCompleteness: [],
            coverageMetric: { planned: 6, attempted: 6, succeeded: 2, skipped: 0, successRate: 2 / 6 },
            runtimeDirectives: {
                preferGroupBy: ['Code'],
                blockGroupBy: [],
                softDeprioritizeGroupBy: [],
                recommendedTopN: null,
                excludeFromAggregation: [],
                hierarchyColumn: null,
                detailRowColumn: 'RowClass',
                detailRowValue: 'fact',
                suggestedPivots: [],
                suggestedHideOthers: false,
                promotedChartType: null,
                blockedChartTypes: [],
                widePivotShape: false,
                formattedNumberColumns: [],
                pairingSignals: [],
            },
        });

        const { store } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(generateAnalysisTopicsMock).not.toHaveBeenCalled();
        expect(processSingleTopicMock).not.toHaveBeenCalled();
        expect(result.session.analysisMode).toBe('diagnostic');
        expect(result.session.analysisModeReason).toContain('Harness coverage degraded');
        expect(result.session.harnessCoverage).toMatchObject({
            succeeded: 2,
            attempted: 6,
            forcedDiagnostic: true,
        });
        expect(result.session.trace).toEqual(expect.arrayContaining([
            expect.objectContaining({
                label: 'Propose Hypotheses',
                status: 'rejected',
                nextDecision: 'stop_session',
                reasonCodes: ['harness_degraded', 'partial_harness_coverage'],
            }),
        ]));
    });

    it('passes valueReasonCodes and evidenceDetail into accepted and rejected outputs', async () => {
        processSingleTopicMock
            .mockResolvedValueOnce({
                status: 'completed',
                cardCreated: true,
                tableFirst: false,
                accepted: true,
                valueDecision: 'pass',
                evidenceLoopState: null,
                sourceStepIds: ['step-1'],
                cardId: 'card-accepted',
                acceptedEvidence: {
                    querySignature: 'qs-1',
                    semanticSignature: 'ss-1',
                    decision: 'pass',
                },
                valueReasonCodes: [],
                evidenceDetail: 'Evidence is strong.',
            })
            .mockResolvedValueOnce({
                status: 'completed',
                cardCreated: false,
                tableFirst: false,
                accepted: false,
                valueDecision: 'reject',
                evidenceLoopState: null,
                sourceStepIds: ['step-2'],
                rejectionReason: 'Too few rows.',
                valueReasonCodes: ['too_few_rows', 'single_group_result'],
                evidenceDetail: 'Only 1 row returned.',
            });

        const { store } = createStore();
        store.getState().analysisCards = [{
            id: 'card-accepted',
            plan: { chartType: 'bar', title: 'Test', description: 'desc' },
            aggregatedData: [{ Code: 'A', Value: 10 }],
            summary: { language: 'English', text: 'summary' },
            displayChartType: 'bar',
            isDataVisible: true,
            topN: null,
            hideOthers: false,
        }] as any;
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        const accepted = result.session.acceptedOutputs;
        expect(accepted).toHaveLength(1);
        expect(accepted[0]?.valueReasonCodes).toEqual([]);
        expect(accepted[0]?.evidenceDetail).toBe('Evidence is strong.');

        const rejected = result.session.rejectedOutputs;
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.valueReasonCodes).toEqual(['too_few_rows', 'single_group_result']);
        expect(rejected[0]?.evidenceDetail).toBe('Only 1 row returned.');
    });

    it('finalizes and clears the active research session when evidence execution throws', async () => {
        processSingleTopicMock.mockRejectedValueOnce(
            new Error('DuckDB worker task "executeCompiledQuery" timed out.'),
        );
        const { store, state } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        await expect(runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            runId: 'research-query-failure',
            store: store as never,
        })).rejects.toThrow('executeCompiledQuery');

        expect(state.activeAnalysisSession).toBeNull();
        expect(state.latestAnalysisSession).toMatchObject({
            runId: 'research-query-failure',
            status: 'failed',
            stopReason: 'analysis_execution_failed',
        });
        expect(emitAgentEventMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                step: 'analysis_session',
                status: 'error',
                activity: expect.objectContaining({ lifecycle: 'failed' }),
            }),
        );
    });

    it('reserves budget for finalization instead of starting a hypothesis it cannot finish', async () => {
        processSingleTopicMock.mockImplementation(async (_topic: string, _data: unknown, _store: unknown, _binding: unknown, _accepted: unknown, options: any) => {
            for (let index = 0; index < 40; index += 1) {
                options.recordAnalysisStep?.({
                    type: 'plan_probe_query',
                    status: 'succeeded',
                    inputSummary: `Step ${index + 1}`,
                    outputSummary: `Recorded step ${index + 1}`,
                    decision: 'execute_probe_query',
                    hypothesisId: options.hypothesisId,
                });
            }
            return {
                status: 'completed',
                cardCreated: false,
                tableFirst: false,
                accepted: false,
                valueDecision: 'reject',
                evidenceLoopState: null,
                sourceStepIds: [],
                rejectionReason: 'reject',
            };
        });

        const { store } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(processSingleTopicMock).toHaveBeenCalledTimes(2);
        expect(result.session.stopReason).toBe('all_hypotheses_exhausted');
        expect(result.session.stepsUsed).toBeLessThanOrEqual(DATA_ANALYSIS_MAX_STEPS);
        expect(result.session.trace.at(-1)).toEqual(expect.objectContaining({
            label: 'Finalize Session',
        }));
    });

    it('attaches canonical trace contracts to analysis trace and query history entries', async () => {
        processSingleTopicMock.mockImplementationOnce(async (_topic: string, _data: unknown, _store: unknown, _binding: unknown, _accepted: unknown, options: any) => {
            options.recordAnalysisStep?.({
                type: 'plan_probe_query',
                status: 'succeeded',
                inputSummary: 'Plan evidence query',
                outputSummary: 'Generated aggregate query.',
                decision: 'execute_probe_query',
                hypothesisId: options.hypothesisId,
                queryRef: 'SELECT "Code", SUM("Value") FROM session_clean_dataset',
                reasonCodes: ['query_planned'],
                querySignature: 'sig-query-1',
                semanticSignature: 'sig-semantic-1',
                queryTitle: 'Value by Code',
                queryMode: 'aggregate',
            });
            return {
                status: 'completed',
                cardCreated: false,
                tableFirst: true,
                accepted: false,
                valueDecision: 'table_only',
                evidenceLoopState: null,
                sourceStepIds: [],
                valueReasonCodes: ['table_only'],
                evidenceDetail: 'Trace-only test.',
            };
        });

        const { store } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');
        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(result.session.trace.some(entry => entry.traceContract?.contractVersion === 'runtime_v1')).toBe(true);
        expect(result.session.queryHistory[0]?.traceContract).toMatchObject({
            contractVersion: 'runtime_v1',
            reasonCode: 'query_recorded',
            source: 'analysis_query_history',
        });
    });

    it('refreshes analysis context after a successful quality repair and uses the refreshed context for topics', async () => {
        const initialContext = {
            title: 'Dataset v1',
            dimensionColumns: ['Code'],
            metricColumns: ['Value'],
            preferredGrainColumns: [],
            preferredMetricTerms: ['Value'],
            blockedDimensions: [],
            helperDimensions: [],
            businessGrains: ['Code'],
            businessGrainConfidence: 'medium',
            unsafeForBusinessNarrative: false,
            analysisSteering: null,
        };
        const refreshedContext = {
            ...initialContext,
            title: 'Dataset v2',
            dimensionColumns: ['Code', 'Owner'],
            businessGrains: ['Owner'],
            analysisSteering: null,
        };
        buildDatasetContextMock
            .mockReset()
            .mockReturnValueOnce(initialContext)
            .mockReturnValueOnce(refreshedContext);
        ensureDuckDbSessionSyncMock
            .mockResolvedValueOnce({
                engine: 'duckdb',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-1',
                fallbackReason: null,
            })
            .mockResolvedValueOnce({
                engine: 'duckdb',
                tableName: 'session_clean_dataset',
                loadVersion: 'dataset-2',
                fallbackReason: null,
            });
        callSmallAiStepMock.mockResolvedValueOnce('{"decision":"apply","column":"Code","replacementValue":"Unassigned","reason":"Backfill missing code labels"}');
        runDataInvestigationHarnessMock
            .mockResolvedValueOnce({
                hierarchyGroups: [],
                duplicateLabels: [],
                metricRelationships: [],
                outlierDescriptions: [],
                missingDataPatterns: [{ column: 'Code', nullRate: 0.2, blankRate: 0.1, zeroRate: 0, severity: 'moderate' }],
                semanticCategories: {},
                leafDescriptions: [],
                parentDescriptions: [],
                investigationSummary: 'Initial harness summary',
                topicConstraints: [],
                suggestedDerivedTopics: [],
                valueConcentration: null,
                temporalProfile: null,
                crossDimensionCardinality: [],
                dimensionCompleteness: [],
                coverageMetric: { planned: 6, attempted: 6, succeeded: 6, skipped: 0, successRate: 1 },
                runtimeDirectives: {
                    preferGroupBy: ['Code'],
                    blockGroupBy: [],
                    softDeprioritizeGroupBy: [],
                    recommendedTopN: null,
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    detailRowColumn: 'RowClass',
                    detailRowValue: 'fact',
                    suggestedPivots: [],
                    suggestedHideOthers: false,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    widePivotShape: false,
                    formattedNumberColumns: [],
                    pairingSignals: [],
                },
            })
            .mockResolvedValueOnce({
                hierarchyGroups: [],
                duplicateLabels: [],
                metricRelationships: [],
                outlierDescriptions: [],
                missingDataPatterns: [],
                semanticCategories: {},
                leafDescriptions: [],
                parentDescriptions: [],
                investigationSummary: 'Refreshed harness summary',
                topicConstraints: [],
                suggestedDerivedTopics: [],
                valueConcentration: null,
                temporalProfile: null,
                crossDimensionCardinality: [],
                dimensionCompleteness: [],
                coverageMetric: { planned: 6, attempted: 6, succeeded: 6, skipped: 0, successRate: 1 },
                runtimeDirectives: {
                    preferGroupBy: ['Owner'],
                    blockGroupBy: [],
                    softDeprioritizeGroupBy: [],
                    recommendedTopN: 8,
                    excludeFromAggregation: [],
                    hierarchyColumn: null,
                    detailRowColumn: 'RowClass',
                    detailRowValue: 'fact',
                    suggestedPivots: [],
                    suggestedHideOthers: false,
                    promotedChartType: null,
                    blockedChartTypes: [],
                    widePivotShape: false,
                    formattedNumberColumns: [],
                    pairingSignals: [],
                },
            });
        handleAiActionMock.mockImplementation(async (_action: any, storeArg: any) => {
            storeArg.setState({
                csvData: {
                    fileName: 'report.csv',
                    data: [{ Code: 'Unassigned', Value: 10, Owner: 'Ops' }],
                },
                columnProfiles: [
                    { name: 'Code', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                    { name: 'Owner', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
                    { name: 'Value', type: 'numerical', missingPercentage: 0 },
                ],
            });
            return {
                status: 'success',
                toolName: 'data.mutate',
                message: 'Applied mutation.',
                shouldStop: false,
            };
        });

        const { store } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(buildDatasetContextMock).toHaveBeenCalledTimes(2);
        expect(handleAiActionMock).toHaveBeenCalledTimes(1);
        expect(generateAnalysisTopicsMock.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(generateAnalysisTopicsMock.mock.calls.at(-1)?.[4]).toBe(refreshedContext);
        expect(result.binding.loadVersion).toBe('dataset-2');
        expect(result.semanticData.data[0]).toMatchObject({ Code: 'Unassigned', Owner: 'Ops' });
        expect(result.session.harnessSummary).toBe('Refreshed harness summary');
        expect(result.session.analysisSteering).toEqual(expect.objectContaining({
            preferGroupBy: ['Owner'],
            recommendedTopN: 8,
            reportShapeClass: expect.any(String),
            detailRowPolicy: expect.any(String),
            signalSources: expect.arrayContaining(['investigation_harness']),
        }));
        expect(result.session.analysisMode).toBe('business');
        expect(result.session.harnessCoverage).toMatchObject({
            succeeded: 6,
            attempted: 6,
            forcedDiagnostic: false,
        });
    });

    it('deduplicates repeated planned pivot hypotheses using canonical signatures instead of hypothesis ids', async () => {
        generateAnalysisTopicsMock.mockReset();
        generateAnalysisTopicsMock.mockResolvedValue([]);
        processSingleTopicMock.mockReset();
        handleAiActionMock.mockResolvedValue({
            status: 'success',
            toolName: 'analysis.pivot_matrix',
            message: 'Created pivot card.',
            shouldStop: false,
            artifacts: { cardId: 'pivot-card-1' },
        });
        runDataInvestigationHarnessMock.mockResolvedValue({
            hierarchyGroups: [],
            duplicateLabels: [],
            metricRelationships: [],
            outlierDescriptions: [],
            missingDataPatterns: [],
            semanticCategories: {},
            leafDescriptions: [],
            parentDescriptions: [],
            investigationSummary: 'Harness summary',
            topicConstraints: [],
            suggestedDerivedTopics: [],
            valueConcentration: null,
            temporalProfile: null,
            crossDimensionCardinality: [],
            dimensionCompleteness: [],
            coverageMetric: { planned: 6, attempted: 6, succeeded: 6, skipped: 0, successRate: 1 },
            runtimeDirectives: {
                preferGroupBy: ['Stock Code'],
                blockGroupBy: ['UOM_10', 'UOM_3'],
                softDeprioritizeGroupBy: [],
                preferredDimensions: ['Stock Code'],
                blockedDimensions: ['UOM_10', 'UOM_3'],
                preferredMetrics: ['Item Cnt'],
                blockedMetrics: ['_unnamed_column_1'],
                columnRoles: {
                    'Stock Code': 'business_dimension',
                    'UOM_10': 'repeated_bundle_member',
                    'UOM_3': 'repeated_bundle_member',
                    'Item Cnt': 'business_metric',
                    '_unnamed_column_1': 'helper_dimension',
                },
                recommendedTopN: 10,
                excludeFromAggregation: [],
                hierarchyColumn: null,
                detailRowColumn: null,
                detailRowValue: null,
                detailRowFilter: null,
                suggestedPivots: [{
                    rowDimension: 'Stock Code',
                    columnDimension: 'UOM',
                    metric: 'Item Cnt',
                    aggregate: 'sum',
                    crossProductSize: 90,
                    confidence: 'high',
                    rowCardinality: 20,
                    columnCardinality: 4,
                }],
                suggestedHideOthers: false,
                promotedChartType: null,
                blockedChartTypes: [],
                widePivotShape: false,
                formattedNumberColumns: [],
                pairingSignals: [],
                duplicateSignatureHints: ['dimension:Stock Code'],
            },
            analysisSteering: {
                preferGroupBy: ['Stock Code'],
                blockGroupBy: ['UOM_10', 'UOM_3'],
                softDeprioritizeGroupBy: [],
                preferredDimensions: ['Stock Code'],
                blockedDimensions: ['UOM_10', 'UOM_3'],
                preferredMetrics: ['Item Cnt'],
                blockedMetrics: ['_unnamed_column_1'],
                columnRoles: {
                    'Stock Code': 'business_dimension',
                    'UOM_10': 'repeated_bundle_member',
                    'UOM_3': 'repeated_bundle_member',
                    'Item Cnt': 'business_metric',
                    '_unnamed_column_1': 'helper_dimension',
                },
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
                detailRowFilter: null,
                recommendedTopN: 10,
                suggestedHideOthers: false,
                blockedChartTypes: [],
                widePivotShape: false,
                formattedNumberColumns: [],
                pivotOnlyCombinations: [],
                pairingSignals: [],
                duplicateSignatureHints: ['dimension:Stock Code'],
                reportShapeClass: 'detail_table',
                detailRowPolicy: 'uncertain',
                hierarchyMode: 'none',
                widePivotMode: 'none',
                signalSources: ['investigation_harness'],
                signalConfidence: 'medium',
                promotedChartType: null,
            },
        });

        const { store, state } = createStore();
        state.columnProfiles = [
            { name: 'Stock Code', type: 'categorical', uniqueValues: 20, missingPercentage: 0 },
            { name: 'UOM', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            { name: 'UOM_3', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            { name: 'UOM_10', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
            { name: 'Item Cnt', type: 'numerical', missingPercentage: 0 },
            { name: '_unnamed_column_1', type: 'numerical', missingPercentage: 0 },
        ];
        buildDatasetContextMock.mockReturnValue({
            title: 'Dataset',
            dimensionColumns: ['Stock Code', 'UOM', 'UOM_3', 'UOM_10'],
            metricColumns: ['Item Cnt', '_unnamed_column_1'],
            preferredGrainColumns: [],
            preferredMetricTerms: [],
            blockedDimensions: [],
            helperDimensions: [],
            businessGrains: ['Stock Code'],
            businessGrainConfidence: 'medium',
            unsafeForBusinessNarrative: false,
            analysisSteering: null,
        });
        buildRuntimeSemanticUnderstandingMock.mockReturnValue({
            businessGrains: ['Stock Code'],
            candidateMetrics: ['Item Cnt'],
            timeGrains: [],
            helperDimensions: [],
            blockedDimensions: [],
            detailRowPolicy: 'uncertain',
            businessGlossary: [],
            businessGrainConfidence: 'medium',
            unsafeForBusinessNarrative: false,
        });

        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');
        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(handleAiActionMock).toHaveBeenCalledTimes(1);
        expect(result.session.acceptedOutputs).toHaveLength(1);
        expect(result.session.acceptedOutputs[0]?.querySignature).not.toContain('hypothesis');
        expect(result.session.acceptedOutputs[0]?.semanticSignature).not.toContain('hypothesis');
    });

    it('rejects invalid planned pivot args explicitly instead of silently skipping the hypothesis', async () => {
        vi.doMock('../services/agent/runtime/hypothesisBuilder', () => ({
            shouldBypassBusinessHypotheses: () => false,
            buildHypotheses: () => [{
                id: 'hypothesis-invalid-pivot',
                topic: 'Invalid pivot hypothesis',
                grain: 'Code',
                metric: 'Value',
                filterIntent: null,
                comparisonIntent: 'cross-tabulation',
                priority: 1,
                attemptsUsed: 0,
                status: 'pending',
                executionMode: 'pivot_matrix',
                pivotRequest: null,
                plannedToolCall: {
                    toolName: 'analysis.pivot_matrix',
                    thought: 'Attempt invalid pivot call.',
                    pivotPreference: 'none',
                    pivotDecision: 'prefer_pivot',
                    args: {
                        rows: 'Code',
                        aggregate: 'sum',
                    },
                },
            }],
        }));

        const { store } = createStore();
        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        const result = await runDataAnalysisSession({
            origin: 'auto_analysis',
            goal: 'Summarize key patterns',
            store: store as never,
        });

        expect(handleAiActionMock).not.toHaveBeenCalled();
        expect(result.session.rejectedOutputs).toEqual([
            expect.objectContaining({
                reason: 'invalid_planned_tool_args',
                sourceHypothesisId: 'hypothesis-invalid-pivot',
                valueReasonCodes: ['invalid_planned_tool_args'],
            }),
        ]);
        expect(result.session.hypotheses[0]).toEqual(expect.objectContaining({
            id: 'hypothesis-invalid-pivot',
            attemptsUsed: 1,
            status: 'exhausted',
        }));
        expect(result.session.trace).toEqual(expect.arrayContaining([
            expect.objectContaining({
                status: 'rejected',
                reasonCodes: ['invalid_planned_tool_args'],
                hypothesisId: 'hypothesis-invalid-pivot',
                summary: 'Execute planned tool: analysis.pivot_matrix',
            }),
        ]));
    });

    it('uses the preferred canonical dataset for chat follow-up sessions', async () => {
        const { store, state } = createStore();
        state.csvData = {
            fileName: 'raw.csv',
            data: [{ Code: 'A', Value: 10, RowClass: 'fact' }],
        };
        state.canonicalCsvData = {
            fileName: 'canonical.csv',
            data: [{ Code: 'A', Value: 10, RowRole: 'fact', ResolvedRowRole: 'detail' }],
        };
        state.columnProfiles = [
            { name: 'Code', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'Value', type: 'numerical', missingPercentage: 0 },
            { name: 'RowRole', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
            { name: 'ResolvedRowRole', type: 'categorical', uniqueValues: 1, missingPercentage: 0 },
        ];
        resolveDatasetBindingTargetMock.mockImplementation(({ csvData }: { csvData: { fileName: string; data: Array<Record<string, unknown>> } }) => ({
            dataset: csvData,
            datasetVersion: `${csvData.fileName}-${Object.keys(csvData.data[0] ?? {}).join(',')}`,
        }));

        const { runDataAnalysisSession } = await import('../services/agent/runtime/dataAnalysisSessionRunner');

        await runDataAnalysisSession({
            origin: 'chat_follow_up',
            goal: 'Evaluate concentration of credit exposure',
            store: store as never,
        });

        expect(state.ensureDatasetSemanticSnapshot).toHaveBeenCalledWith(state.canonicalCsvData);
        expect(resolveDatasetBindingTargetMock).toHaveBeenCalledWith(expect.objectContaining({
            csvData: state.canonicalCsvData,
        }));
    });
});
