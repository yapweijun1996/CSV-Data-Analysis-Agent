import type {
    CsvData,
    DataAnalysisSessionState,
    PivotMatrixConfig,
} from '../../../types';
import {
    buildDeterministicTopics,
    generateAnalysisTopics,
    generateEvidenceQueryPlanStepped,
} from '../planning/planGenerator';
import {
    processSingleTopic,
} from '../planning/topicProcessor';
import { emitAgentEvent, updateAgentTaskStatus } from '../monitoring/agentMonitor';
import { keepInitialAnalysisStageFrame } from '../monitoring/analysisStageFrame';
import { emitSilentFailure } from '../monitoring/silentFailureTracker';
import { recordRuntimeEvent } from './runtimeHelpers';
import { upsertCardMemoryDocument } from '../memory/vectorMemorySync';
import { SqlAutoAnalysisError } from '../planning/planGenerator';
import { runDataInvestigationHarness } from './dataInvestigationHarness';
import {
    appendAcceptedAnalysisOutput,
    appendDataAnalysisStep,
    appendRejectedAnalysisOutput,
    createDataAnalysisSessionState,
    finalizeDataAnalysisSession,
    setDataAnalysisHypotheses,
    updateDataAnalysisHypothesis,
} from './dataAnalysisSessionState';
import {
    canStartNextHypothesis,
    computeFinalSessionStatus,
    DATA_ANALYSIS_FINALIZE_RESERVE_STEPS,
    DATA_ANALYSIS_MIN_TARGET_CARDS,
    getNextPendingHypothesis,
    shouldStopDataAnalysisSession,
} from './dataAnalysisPolicy';
import { buildAndRunExplorationQueries } from './dataExplorationQueries';
import { shouldBypassBusinessHypotheses, buildHypotheses } from './hypothesisBuilder';
import { handleAiAction } from '../actionHandler';
import { cloneAnalysisSteering } from '../analysisSteering';
import {
    buildPivotToolQuerySignature,
    buildPivotToolSemanticSignature,
} from '../evidenceValueGate';
import type { DataInvestigationFindings } from './dataInvestigationHarness';

import type { StoreApi } from './analysisSessionHelpers';
import {
    computeCardYieldMetric,
    syncSessionState,
    buildHarnessCoverageState,
    resolveAnalysisMode,
    resolveTopicRoundLimit,
    resolveSuggestedPivotsForDataset,
    buildSessionTraceRecorder,
} from './analysisSessionHelpers';
import { runPostInvestigationQualityCheck } from './analysisQualityCheck';
import { reshapeWidePivotBeforeAnalysis } from './reshapeBeforeAnalysis';
import { getCsvDataRowCount } from '../../../utils/datasetId';
import {
    applyInvestigationSteering,
    refreshAnalysisContext,
} from './analysisContextBuilder';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { buildEffectiveColumnRegistryFromState } from '../../data/columnRegistry';
import { findReplicatedUnpivotMetricColumns } from '../analysisColumnRoles';
import {
    buildDataResearchBrief,
    buildDataResearchFindings,
    syncDataResearchBrief,
} from './dataResearchContract';
import {
    clearDataResearchCancellation,
    isDataResearchCancellationRequested,
} from './dataResearchCancellation';
import { attachAutoAnalysisEvaluationToCards } from '../autoAnalysisEvaluation';

export const INITIAL_ANALYSIS_HARNESS_BUDGET_MS = 20_000;

export type { DataAnalysisSessionRunResult } from './analysisSessionHelpers';
export { computeCardYieldMetric } from './analysisSessionHelpers';

const isPivotMatrixConfig = (args: unknown): args is PivotMatrixConfig => {
    if (typeof args !== 'object' || args === null) {
        return false;
    }
    const candidate = args as Record<string, unknown>;
    return (
        Array.isArray(candidate.rows) &&
        typeof candidate.aggregate === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.description === 'string'
    );
};

type RunDataAnalysisSessionParams = {
    origin: 'auto_analysis' | 'chat_follow_up';
    goal: string;
    store: StoreApi;
    dataForAnalysis?: CsvData | null;
    runId?: string;
    abortSignal?: AbortSignal;
};

const runDataAnalysisSessionInternal = async (
    params: RunDataAnalysisSessionParams,
): Promise<import('./analysisSessionHelpers').DataAnalysisSessionRunResult> => {
    const { origin, goal, store } = params;
    const state = store.getState();
    const inputData = params.dataForAnalysis ?? getPreferredAnalysisDataset(state);
    if (!inputData) {
        throw new SqlAutoAnalysisError('duckdb_unavailable', 'No dataset is loaded for data analysis.');
    }

    if (origin === 'auto_analysis') {
        store.setState({
            analysisCards: [],
            finalSummary: null,
            aiCoreAnalysisSummary: null,
        });
    }

    let session = createDataAnalysisSessionState({
        sessionId: state.sessionId,
        origin,
        runId: params.runId,
    });
    syncSessionState(store, session, true);
    emitAgentEvent(store, {
        runId: session.runId,
        phase: 'execution',
        step: 'research_run_started',
        status: 'in_progress',
        message: `Started a bounded research run for "${goal}".`,
        activity: {
            kind: 'research',
            lifecycle: 'running',
            source: 'app',
            eventType: 'research_run_started',
            title: 'Research run started',
            explanation: 'The agent is building a finite question plan and will keep only evidence-backed findings.',
        },
    });

    const cancelAtCheckpoint = () => {
        if (
            !isDataResearchCancellationRequested(session.runId)
            && !params.abortSignal?.aborted
        ) return false;
        session = finalizeDataAnalysisSession({
            ...session,
            cancellationRequestedAt: session.cancellationRequestedAt ?? new Date(),
        }, 'cancelled', 'user_cancelled');
        return true;
    };
    const raceWithResearchAbort = async <T,>(
        work: Promise<T>,
        fallback: T,
    ): Promise<T> => {
        const signal = params.abortSignal;
        if (!signal) return work;
        if (signal.aborted) return fallback;

        let handleAbort: (() => void) | null = null;
        const aborted = new Promise<T>(resolve => {
            handleAbort = () => resolve(fallback);
            signal.addEventListener('abort', handleAbort, { once: true });
        });
        try {
            return await Promise.race([work, aborted]);
        } finally {
            if (handleAbort) {
                signal.removeEventListener('abort', handleAbort);
            }
        }
    };

    const persistSession = (nextSession: DataAnalysisSessionState) => {
        session = nextSession;
    };
    const recordStep = buildSessionTraceRecorder(store, () => session, persistSession);
    // PERF-301: During the hypothesis loop, accumulate trace steps locally without
    // triggering store.setState (~2.3s each). The main loop's per-hypothesis
    // setState flushes all accumulated session state once per hypothesis.
    const recordStepSuppressed = buildSessionTraceRecorder(
        store, () => session, persistSession, { suppressSync: true },
    );

    const observe = appendDataAnalysisStep(session, {
        type: 'observe_dataset',
        status: 'succeeded',
        inputSummary: `Prepare and run ${origin === 'auto_analysis' ? 'automatic' : 'chat-follow-up'} analysis for the current dataset.`,
        inputSummaryI18n: {
            key: 'analysis_trace_observe_dataset_input',
            vars: {
                mode: origin === 'auto_analysis' ? 'automatic' : 'chat_follow_up',
            },
        },
        outputSummary: `Goal is "${goal}", current dataset has ${getCsvDataRowCount(inputData)} rows.`,
        outputSummaryI18n: {
            key: 'analysis_trace_observe_dataset_output',
            vars: {
                goal,
                rows: getCsvDataRowCount(inputData),
            },
        },
        decision: 'build_semantic_understanding',
        reasonCodes: [],
    });
    session = observe.session;
    syncSessionState(store, session, true);

    const { addProgress } = store.getState();
    let {
        inputData: workingInputData,
        semanticDataForAnalysis,
        binding,
        columnProfiles,
        datasetContext,
        semanticUnderstanding,
        qualityGovernance,
    } = await refreshAnalysisContext(store, origin, inputData, addProgress);
    const buildInvestigationOptions = () => ({
        store,
        settings: store.getState().settings,
        ...(origin === 'auto_analysis'
            ? { harnessTimeoutMs: INITIAL_ANALYSIS_HARNESS_BUDGET_MS }
            : {}),
        replicatedMetricColumns: findReplicatedUnpivotMetricColumns(
            columnProfiles,
            store.getState().dataPreparationPlan,
        ),
    });
    const cancelledAfterContext = cancelAtCheckpoint();
    if (cancelledAfterContext) {
        syncSessionState(store, session, true);
    }
    updateAgentTaskStatus(store, {
        status: 'thinking',
        title: 'Starting analysis session',
        titleKey: 'ai_task_starting_analysis',
        subtitle: 'Dataset loaded into analysis engine, building semantic understanding',
        subtitleKey: 'ai_task_session_building_semantic',
        totalSteps: 4,
        currentStep: 1,
    });

    const semanticStep = appendDataAnalysisStep(session, {
        type: 'build_semantic_understanding',
        status: 'succeeded',
        inputSummary: 'Identify business grains, candidate metrics, and helper fields.',
        inputSummaryI18n: {
            key: 'analysis_trace_build_semantic_understanding_input',
        },
        outputSummary: `business grains: ${semanticUnderstanding.businessGrains.join(', ') || 'none'}; helper: ${semanticUnderstanding.helperDimensions.join(', ') || 'none'}; blocked: ${semanticUnderstanding.blockedDimensions.join(', ') || 'none'}${qualityGovernance?.qualityHintsSummary ? `; quality: ${qualityGovernance.qualityHintsSummary}` : ''}.`,
        outputSummaryI18n: {
            key: 'analysis_trace_build_semantic_understanding_output',
            vars: {
                businessGrains: semanticUnderstanding.businessGrains.join(', ') || 'none',
                helperDimensions: semanticUnderstanding.helperDimensions.join(', ') || 'none',
                blockedDimensions: semanticUnderstanding.blockedDimensions.join(', ') || 'none',
            },
        },
        decision: 'screen_row_quality',
        reasonCodes: semanticUnderstanding.unsafeForBusinessNarrative ? ['unsafe_business_narrative'] : [],
    });
    session = {
        ...semanticStep.session,
        semanticUnderstanding,
    };
    syncSessionState(store, session, true);

    const rowQualityStep = appendDataAnalysisStep(session, {
        type: 'screen_row_quality',
        status: semanticUnderstanding.detailRowPolicy === 'uncertain' ? 'rejected' : 'succeeded',
        inputSummary: 'Check whether the semantic view excludes subtotal/footer-like non-detail rows.',
        inputSummaryI18n: {
            key: 'analysis_trace_screen_row_quality_input',
        },
        outputSummary: `detail row policy = ${semanticUnderstanding.detailRowPolicy}; unsafe narrative = ${semanticUnderstanding.unsafeForBusinessNarrative ? 'yes' : 'no'}.`,
        outputSummaryI18n: {
            key: 'analysis_trace_screen_row_quality_output',
            vars: {
                detailRowPolicy: semanticUnderstanding.detailRowPolicy,
                unsafeForBusinessNarrative: semanticUnderstanding.unsafeForBusinessNarrative ? 'yes' : 'no',
            },
        },
        decision: 'propose_hypotheses',
        reasonCodes: semanticUnderstanding.detailRowPolicy === 'uncertain' ? ['uncertain_detail_rows'] : [],
    });
    session = rowQualityStep.session;
    syncSessionState(store, session, true);

    let semanticDiagnosticMode = shouldBypassBusinessHypotheses(semanticUnderstanding, datasetContext);
    let harnessCoverage = null as DataAnalysisSessionState['harnessCoverage'];
    let { analysisMode, analysisModeReason, effectiveDiagnosticMode } = resolveAnalysisMode({
        semanticDiagnosticMode,
        harnessCoverage,
    });
    let explorationContext = null;
    let investigationFindings: DataInvestigationFindings | null = null;
    let harnessSummary: string | null = null;

    if (!semanticDiagnosticMode && !cancelledAfterContext) {
        updateAgentTaskStatus(store, {
            status: 'acting',
            title: 'Starting analysis session',
            titleKey: 'ai_task_starting_analysis',
            subtitle: 'Exploring data & running investigation diagnostics',
            subtitleKey: 'ai_task_session_exploring_and_investigating',
            totalSteps: 4,
            currentStep: 2,
        });

        // Both functions are read-only on DuckDB and share no mutable state.
        // Running them in parallel saves 3-5s of serial AI/SQL wait time (PERF-201 Step 1).
        const [explorationResult, investigationResult] = await raceWithResearchAbort(
            Promise.all([
                buildAndRunExplorationQueries(columnProfiles, binding, store),
                runDataInvestigationHarness(
                    columnProfiles,
                    binding,
                    semanticUnderstanding,
                    buildInvestigationOptions(),
                ),
            ]),
            [null, null] as const,
        );
        explorationContext = explorationResult;
        investigationFindings = investigationResult;

        const explorationStep = appendDataAnalysisStep(session, {
            type: 'explore_data_with_sql',
            status: explorationContext ? 'succeeded' : 'skipped',
            inputSummary: 'Run SQL queries to learn actual data distribution.',
            inputSummaryI18n: { key: 'analysis_trace_explore_data_input' },
            outputSummary: explorationContext
                ? 'Data distribution context collected for hypothesis generation.'
                : 'Exploration skipped; proceeding with column profiles only.',
            outputSummaryI18n: {
                key: explorationContext
                    ? 'analysis_trace_explore_data_output'
                    : 'analysis_trace_explore_data_output_skipped',
            },
            decision: 'propose_hypotheses',
            reasonCodes: [],
        });
        session = explorationStep.session;
        syncSessionState(store, session, true);

        // Keep exploration context and harness summary separate:
        // - explorationContext → 'data_exploration_results' section (prunable, may be dropped)
        // - harnessSummary → 'harness_investigation' section (sticky, never dropped)
        harnessSummary = investigationFindings?.investigationSummary ?? null;
    } else {
        const explorationStep = appendDataAnalysisStep(session, {
            type: 'explore_data_with_sql',
            status: 'skipped',
            inputSummary: 'Run SQL queries to learn actual data distribution.',
            inputSummaryI18n: { key: 'analysis_trace_explore_data_input' },
            outputSummary: 'Exploration skipped because there are no safe business grains or candidate metrics to analyze.',
            outputSummaryI18n: { key: 'analysis_trace_explore_data_output_skipped' },
            decision: 'propose_hypotheses',
            reasonCodes: ['diagnostic_mode'],
        });
        session = explorationStep.session;

        const investigationStep = appendDataAnalysisStep(session, {
            type: 'explore_data_with_sql',
            status: 'skipped',
            inputSummary: 'Run data investigation harness to detect value hierarchies, duplicates, outliers, and missing data.',
            inputSummaryI18n: { key: 'analysis_trace_explore_data_input' },
            outputSummary: 'Investigation harness skipped because the session is already in diagnostic mode.',
            outputSummaryI18n: { key: 'analysis_trace_explore_data_output_skipped' },
            decision: 'propose_hypotheses',
            reasonCodes: ['diagnostic_mode'],
        });
        session = investigationStep.session;
        syncSessionState(store, session, true);
    }

    cancelAtCheckpoint();

    // P1: Harness coverage metric — emit harness_degraded when most core investigations failed.
    // "<50% succeeded" means the analysis is running partially blind (survivorship bias risk).
    if (investigationFindings && session.status !== 'cancelled') {
        const cov = investigationFindings.coverageMetric;
        if (cov.attempted > 0 && cov.successRate < 0.5) {
            const recorder = store.getState().recordRuntimeEvent;
            if (typeof recorder === 'function') {
                recorder({
                    type: 'harness_degraded',
                    stage: 'executing',
                    message: `Data investigation harness degraded: only ${cov.succeeded}/${cov.attempted} core phases succeeded (${Math.round(cov.successRate * 100)}%). Analysis may be partially blind.`,
                    detail: {
                        planned: cov.planned,
                        attempted: cov.attempted,
                        succeeded: cov.succeeded,
                        skipped: cov.skipped,
                        successRate: cov.successRate,
                    },
                });
            }
            emitSilentFailure(store, new Error(`Harness degraded: ${cov.succeeded}/${cov.attempted} phases succeeded`), {
                component: 'DataInvestigationHarness',
                recoveryAction: 'partial_findings_used',
                userNotified: false,
                detail: { successRate: cov.successRate },
            });
        }
    }

    harnessCoverage = buildHarnessCoverageState(investigationFindings?.coverageMetric);
    ({ analysisMode, analysisModeReason, effectiveDiagnosticMode } = resolveAnalysisMode({
        semanticDiagnosticMode,
        harnessCoverage,
    }));
    if (harnessCoverage?.forcedDiagnostic) {
        addProgress(harnessCoverage.reason ?? 'Harness coverage degraded; switching to diagnostic mode.', 'warning');
    }

    let harnessContext = applyInvestigationSteering(datasetContext, semanticUnderstanding, investigationFindings);
    if (harnessContext?.softDeprioritizeGroupBy?.length) {
        recordRuntimeEvent(store, {
            type: 'harness_pairing_soft_deprioritized',
            stage: 'executing',
            message: `Harness soft-deprioritized ${harnessContext.softDeprioritizeGroupBy.length} dimension(s) due to medium-confidence code/label pairing.`,
            detail: {
                columns: harnessContext.softDeprioritizeGroupBy,
                pairingSignals: harnessContext.pairingSignals ?? [],
            },
        });
    }

    const investigationStep = appendDataAnalysisStep(session, {
        type: 'explore_data_with_sql',
        status: investigationFindings ? 'succeeded' : 'skipped',
        inputSummary: 'Run data investigation harness to detect value hierarchies, duplicates, outliers, and missing data.',
        inputSummaryI18n: { key: 'analysis_trace_explore_data_input' },
        outputSummary: investigationFindings
            ? `Found ${investigationFindings.hierarchyGroups.length} hierarchy(s), ${investigationFindings.duplicateLabels.length} duplicate(s), ${investigationFindings.metricRelationships.length} relationship(s), ${investigationFindings.outlierDescriptions.length} outlier(s), ${investigationFindings.missingDataPatterns.length} missing pattern(s), ${investigationFindings.leafDescriptions.length} leaves.`
            : 'Investigation harness skipped — no suitable description+value columns found.',
        outputSummaryI18n: {
            key: investigationFindings
                ? 'analysis_trace_explore_data_output'
                : 'analysis_trace_explore_data_output_skipped',
        },
        decision: 'propose_hypotheses',
        reasonCodes: [],
    });
    session = investigationStep.session;
    session = {
        ...session,
        analysisMode,
        analysisModeReason,
        harnessSummary,
        harnessCoverage,
        analysisSteering: cloneAnalysisSteering(harnessContext),
        semanticUnderstanding,
    };
    syncSessionState(store, session, true);

    // Post-investigation quality check: AI reviews harness findings and
    // decides if data mutations are needed before analysis starts.
    if (investigationFindings && session.status !== 'cancelled') {
        const qualityCheck = await runPostInvestigationQualityCheck(
            investigationFindings, store, store.getState().settings,
        );
        if (qualityCheck.applied) {
            addProgress(`Quality check: applied ${qualityCheck.fixCount} fix(es) to improve data before analysis.`);
            const previousLoadVersion = binding.loadVersion;
            const refreshed = await refreshAnalysisContext(
                store,
                origin,
                store.getState().csvData ?? workingInputData,
                addProgress,
            );
            workingInputData = refreshed.inputData;
            semanticDataForAnalysis = refreshed.semanticDataForAnalysis;
            binding = refreshed.binding;
            columnProfiles = refreshed.columnProfiles;
            datasetContext = refreshed.datasetContext;
            semanticUnderstanding = refreshed.semanticUnderstanding;
            qualityGovernance = refreshed.qualityGovernance;
            semanticDiagnosticMode = shouldBypassBusinessHypotheses(semanticUnderstanding, datasetContext);
            explorationContext = await buildAndRunExplorationQueries(
                columnProfiles,
                binding,
                store,
            );
            investigationFindings = await runDataInvestigationHarness(
                columnProfiles,
                binding,
                semanticUnderstanding,
                buildInvestigationOptions(),
            );
            harnessSummary = investigationFindings?.investigationSummary ?? null;
            harnessContext = applyInvestigationSteering(datasetContext, semanticUnderstanding, investigationFindings);
            harnessCoverage = buildHarnessCoverageState(investigationFindings?.coverageMetric);
            ({ analysisMode, analysisModeReason, effectiveDiagnosticMode } = resolveAnalysisMode({
                semanticDiagnosticMode,
                harnessCoverage,
            }));
            session = {
                ...session,
                analysisMode,
                analysisModeReason,
                harnessSummary,
                harnessCoverage,
                analysisSteering: cloneAnalysisSteering(harnessContext),
                semanticUnderstanding,
            };
            recordRuntimeEvent(store, {
                type: 'context_refreshed_after_quality_repair',
                stage: 'executing',
                message: 'Analysis context was rebuilt after a successful pre-analysis quality repair.',
                detail: {
                    previousLoadVersion,
                    nextLoadVersion: binding.loadVersion,
                },
            });
        }
        const qualityStep = appendDataAnalysisStep(session, {
            type: 'explore_data_with_sql',
            status: qualityCheck.applied ? 'succeeded' : 'skipped',
            inputSummary: 'Post-investigation quality check — AI reviews findings and decides if data fixes are needed.',
            inputSummaryI18n: { key: 'analysis_trace_quality_check_input' },
            outputSummary: qualityCheck.applied
                ? `Applied ${qualityCheck.fixCount} quality fix(es) before analysis.`
                : 'No quality fixes needed — data is clean enough for analysis.',
            outputSummaryI18n: { key: qualityCheck.applied ? 'analysis_trace_quality_check_applied' : 'analysis_trace_quality_check_skipped' },
            decision: 'propose_hypotheses',
            reasonCodes: [],
        });
        session = qualityStep.session;
        syncSessionState(store, session, true);
    }

    // Reshape continuation: when the harness detects a wide pivot with period
    // column families, unpivot the dataset into long format before topic
    // planning starts.  After reshape succeeds, the full analysis context is
    // rebuilt so that downstream decisions (chart type, groupBy, pivot vs
    // normal card) reflect the reshaped schema — this is the "redecide" half
    // of "reshape then redecide".
    if (
        session.status !== 'cancelled'
        && !effectiveDiagnosticMode
        && !workingInputData.backing?.readOnly
        && harnessContext?.widePivotMode === 'reshape_required'
    ) {
        updateAgentTaskStatus(store, {
            status: 'acting',
            title: 'Reshaping wide-pivot dataset',
            titleKey: 'ai_task_starting_analysis',
            subtitle: 'Unpivoting period columns into long format for better analysis',
            subtitleKey: 'ai_task_session_investigation',
            totalSteps: 4,
            currentStep: 2,
        });

        const reshapeResult = await reshapeWidePivotBeforeAnalysis(
            harnessContext,
            columnProfiles,
            store,
            investigationFindings?.runtimeDirectives.suggestedUnpivotPlan ?? null,
        );

        const reshapeStep = appendDataAnalysisStep(session, {
            type: 'explore_data_with_sql',
            status: reshapeResult.applied ? 'succeeded' : 'skipped',
            inputSummary: 'Reshape wide-pivot dataset (unpivot period columns) before topic planning.',
            inputSummaryI18n: { key: 'analysis_trace_reshape_before_analysis_input' },
            outputSummary: reshapeResult.applied
                ? `Reshaped: ${reshapeResult.sourceColumns.length} period columns unpivoted into long format. Re-running harness and planning on the reshaped schema.`
                : `Reshape skipped: ${reshapeResult.reason}`,
            outputSummaryI18n: {
                key: reshapeResult.applied
                    ? 'analysis_trace_reshape_before_analysis_applied'
                    : 'analysis_trace_reshape_before_analysis_skipped',
            },
            decision: 'propose_hypotheses',
            reasonCodes: reshapeResult.applied ? ['reshape_then_redecide'] : [],
        });
        session = reshapeStep.session;
        syncSessionState(store, session, true);

        if (reshapeResult.applied) {
            // Promote the reshaped long table to canonical so that the
            // spreadsheet "Prepared Data" view, semantic snapshot, DuckDB
            // session, and persistence all align on a single source of truth.
            const reshapedData = store.getState().csvData;
            const reshapedRowCount = reshapedData?.data.length ?? 0;
            store.getState().promoteToCanonicalDataset({
                reason: `Analysis-stage reshape: ${reshapeResult.sourceColumns.length} wide-pivot columns unpivoted into long format.`,
                reshapeProvenance: {
                    reshapedFromWidePivot: true,
                    reshapeOperationId: 'reshape_wide_pivot',
                    reshapeAppliedAt: new Date().toISOString(),
                    sourceColumnCountBefore: reshapeResult.sourceColumns.length,
                    rowCountBefore: workingInputData.data.length,
                    rowCountAfter: reshapedRowCount,
                },
            });

            // Full context refresh — same pattern as post-quality-check refresh.
            const previousLoadVersion = binding.loadVersion;
            const refreshed = await refreshAnalysisContext(
                store,
                origin,
                store.getState().csvData ?? workingInputData,
                addProgress,
            );
            workingInputData = refreshed.inputData;
            semanticDataForAnalysis = refreshed.semanticDataForAnalysis;
            binding = refreshed.binding;
            columnProfiles = refreshed.columnProfiles;
            datasetContext = refreshed.datasetContext;
            semanticUnderstanding = refreshed.semanticUnderstanding;
            qualityGovernance = refreshed.qualityGovernance;
            semanticDiagnosticMode = shouldBypassBusinessHypotheses(semanticUnderstanding, datasetContext);

            // Re-run exploration and investigation harness on the reshaped data.
            explorationContext = await buildAndRunExplorationQueries(
                columnProfiles,
                binding,
                store,
            );
            investigationFindings = await runDataInvestigationHarness(
                columnProfiles,
                binding,
                semanticUnderstanding,
                buildInvestigationOptions(),
            );
            harnessSummary = investigationFindings?.investigationSummary ?? null;
            harnessContext = applyInvestigationSteering(datasetContext, semanticUnderstanding, investigationFindings);
            harnessCoverage = buildHarnessCoverageState(investigationFindings?.coverageMetric);
            ({ analysisMode, analysisModeReason, effectiveDiagnosticMode } = resolveAnalysisMode({
                semanticDiagnosticMode,
                harnessCoverage,
            }));

            session = {
                ...session,
                analysisMode,
                analysisModeReason,
                harnessSummary,
                harnessCoverage,
                analysisSteering: cloneAnalysisSteering(harnessContext),
                semanticUnderstanding,
            };

            recordRuntimeEvent(store, {
                type: 'context_refreshed_after_reshape',
                stage: 'executing',
                message: 'Analysis context was rebuilt after pre-analysis wide-pivot reshape.',
                detail: {
                    previousLoadVersion,
                    nextLoadVersion: binding.loadVersion,
                    reshapedColumns: reshapeResult.sourceColumns.length,
                    keptColumns: reshapeResult.keepColumns.length,
                },
            });
            syncSessionState(store, session, true);
        }
    }

    // ── All-zero metric detection ──
    // When the SQL precheck found that ALL numeric metrics are zero, inject
    // a steering hint so the AI focuses on categorical analysis (item counts,
    // category distributions, inventory composition) instead of wasting steps
    // on numeric aggregations that will always be zero.
    const precheckFindings = store.getState().dataPreparationPlan?.sqlPrecheck?.findings ?? [];
    const allMetricsZero = precheckFindings.length > 0
        && precheckFindings.every(f => f.kind === 'zero_total_metric' || f.kind === 'flat_grouped_metric');
    if (allMetricsZero && datasetContext.analysisSteering) {
        console.log('[DataAnalysisSession] All numeric metrics are zero — steering toward categorical analysis.');
        datasetContext.qualityHintsSummary = [
            datasetContext.qualityHintsSummary ?? '',
            'ALL NUMERIC METRICS ARE ZERO in this dataset. Do NOT generate topics that aggregate numeric columns (SUM, AVG, etc.) — they will all return 0.',
            'Instead, focus on: item counts by category, inventory composition breakdown, catalog coverage analysis, cross-tabulation of categorical dimensions.',
            'If no meaningful categorical analysis is possible, generate a single summary card explaining that all values are zero in this reporting period.',
        ].filter(Boolean).join('\n');
    }

    let topics: string[] = [];
    if (!effectiveDiagnosticMode && session.status !== 'cancelled') {
        updateAgentTaskStatus(store, {
            status: 'thinking',
            title: 'Starting analysis session',
            titleKey: 'ai_task_starting_analysis',
            subtitle: 'Generating analysis topics from data patterns',
            subtitleKey: 'ai_task_session_generating_topics',
            totalSteps: 4,
            currentStep: 3,
        });
        try {
            const priorCardTitles = (store.getState().analysisCards ?? []).map(c => c.plan.title);
            topics = workingInputData.backing?.readOnly
                ? buildDeterministicTopics(columnProfiles, datasetContext)
                : await generateAnalysisTopics(
                    columnProfiles,
                    semanticDataForAnalysis.data.slice(0, 20),
                    store.getState().settings,
                    goal,
                    datasetContext,
                    store.getState(),
                    explorationContext,
                    harnessSummary,
                    priorCardTitles.length > 0 ? priorCardTitles : undefined,
                    { abortSignal: params.abortSignal },
                );
        } catch (topicError) {
            console.error('[DataAnalysisSession] Topic generation failed, proceeding with empty topics:', topicError);
        }
    }
    cancelAtCheckpoint();
    const suggestedPivots = resolveSuggestedPivotsForDataset(workingInputData, investigationFindings);
    // Compute dimension-aware card target: when only 1 groupBy dimension exists,
    // the topic prompt limits to 2 topics. Align the gap-fill target so the
    // session runner doesn't force a redundant 3rd card on the same dimension.
    const availableDimCount = datasetContext.dimensionColumns.filter(
        d => !(datasetContext.blockedDimensions ?? []).includes(d),
    ).length;
    const effectiveMinTargetCards = availableDimCount <= 1
        ? Math.min(2, DATA_ANALYSIS_MIN_TARGET_CARDS)
        : availableDimCount <= 2
            ? Math.min(4, DATA_ANALYSIS_MIN_TARGET_CARDS)
            : DATA_ANALYSIS_MIN_TARGET_CARDS;
    const hypotheses = effectiveDiagnosticMode ? [] : buildHypotheses(topics, semanticUnderstanding, datasetContext, suggestedPivots);
    session = setDataAnalysisHypotheses(session, hypotheses);
    session = {
        ...session,
        researchBrief: buildDataResearchBrief({
            goal,
            datasetVersionId: store.getState().semanticDatasetVersion ?? binding.loadVersion,
            hypotheses,
            clarificationReason: hypotheses.length === 0
                ? analysisModeReason ?? 'No safe executable research question was available.'
                : null,
        }),
    };
    const hypothesisStep = appendDataAnalysisStep(session, {
        type: 'propose_hypotheses',
        status: hypotheses.length > 0 ? 'succeeded' : 'rejected',
        inputSummary: 'Generate a finite set of high-priority analysis hypotheses.',
        inputSummaryI18n: {
            key: 'analysis_trace_propose_hypotheses_input',
        },
        outputSummary: hypotheses.length > 0
            ? `Proposed ${hypotheses.length} hypotheses.`
            : effectiveDiagnosticMode
                ? analysisModeReason ?? 'Diagnostic mode is active, so default business hypothesis analysis was skipped.'
                : 'No executable analysis hypothesis was proposed.',
        outputSummaryI18n: hypotheses.length > 0
            ? {
                key: 'analysis_trace_propose_hypotheses_output_success',
                vars: {
                    count: hypotheses.length,
                },
            }
            : effectiveDiagnosticMode
                ? {
                    key: 'analysis_trace_propose_hypotheses_output_no_business_grains',
                }
                : {
                    key: 'analysis_trace_propose_hypotheses_output_none',
                },
        decision: hypotheses.length > 0 ? 'select_hypothesis' : 'stop_session',
        reasonCodes: hypotheses.length > 0
            ? []
            : effectiveDiagnosticMode
                ? (harnessCoverage?.forcedDiagnostic
                    ? ['harness_degraded', 'partial_harness_coverage']
                    : ['no_business_grains', 'unsafe_business_narrative'])
                : ['no_hypotheses'],
    });
    session = hypothesisStep.session;
    syncSessionState(store, session, true);
    if (session.status !== 'cancelled') emitAgentEvent(store, {
        runId: session.runId,
        phase: 'planning',
        step: hypotheses.length > 0 ? 'research_brief_ready' : 'research_clarification_needed',
        status: hypotheses.length > 0 ? 'done' : 'in_progress',
        message: hypotheses.length > 0
            ? `Research brief prepared with ${hypotheses.length} prioritized question(s).`
            : session.researchBrief?.clarification?.question ?? 'Research needs clarification before business claims can be made.',
        activity: {
            kind: hypotheses.length > 0 ? 'research' : 'approval',
            lifecycle: hypotheses.length > 0 ? 'completed' : 'waiting',
            source: hypotheses.length > 0 ? 'app' : 'approval',
            eventType: hypotheses.length > 0 ? 'research_brief_ready' : 'research_clarification_needed',
            title: hypotheses.length > 0 ? 'Research brief ready' : 'Research needs clarification',
            explanation: session.researchBrief?.clarification?.reason,
        },
    });

    // Initialize both progress signals together so the AiTaskStatusBubble and the
    // skeleton card count start from the same source of truth.
    store.setState({
        reportGenerationProgress: {
            completed: 0,
            total: hypotheses.length || 1,
            mode: 'analysis',
        },
        aiTaskStatus: hypotheses.length > 0 ? keepInitialAnalysisStageFrame(store.getState().aiTaskStatus, {
            status: 'thinking',
            title: 'Verifying analysis hypotheses',
            titleKey: 'ai_task_verifying_hypotheses',
            subtitle: `${hypotheses.length} hypotheses to verify`,
            subtitleKey: 'ai_task_verifying_hypotheses_init',
            subtitleParams: { total: hypotheses.length },
            totalSteps: hypotheses.length,
            currentStep: 0,
        }) : null,
    });

    // Seed dedup list from existing cards so follow-up sessions don't
    // duplicate cards produced by the initial analysis.
    const existingCards = store.getState().analysisCards ?? [];
    const acceptedEvidenceForDedupe: Array<{
        querySignature: string;
        semanticSignature: string;
        decision: 'pass' | 'table_only' | 'reject';
        title: string;
    }> = existingCards
        .filter(card => card.evidenceValueGate?.querySignature)
        .map(card => ({
            querySignature: card.evidenceValueGate!.querySignature,
            semanticSignature: card.evidenceValueGate!.semanticSignature,
            decision: card.evidenceValueGate!.decision,
            title: card.plan.title,
        }));

    // ── PERF-201 strategy D: Pre-generate evidence plans in parallel ──
    // Plan generation uses complexModel (~30s each). Running all in parallel
    // saves ~120s of serial AI wait time. Stepped planner failures fall back
    // to serial full planner inside the loop.
    const preGeneratedPlans = new Map<string, Awaited<ReturnType<typeof generateEvidenceQueryPlanStepped>>>();
    {
        const plannable = hypotheses.filter(h => !h.plannedToolCall && h.status === 'pending');
        if (plannable.length > 0 && session.status !== 'cancelled') {
            const preGenStart = performance.now();
            console.log(`[Perf:PlanD] Pre-generating ${plannable.length} evidence plans in parallel...`);
            const planResults = await Promise.all(
                plannable.map(async h => {
                    const t0 = performance.now();
                    try {
                        const plan = await generateEvidenceQueryPlanStepped(
                            h.topic,
                            columnProfiles,
                            store.getState().settings,
                            harnessSummary,
                            datasetContext,
                            { preferredGroupBy: h.grain, preferredMetric: h.metric, preferredFilterIntent: h.filterIntent },
                            undefined,
                            {
                                abortSignal: params.abortSignal,
                                deterministicOnly: workingInputData.backing?.readOnly === true,
                            },
                        );
                        console.log(`[Perf:PlanD] Plan "${h.topic.slice(0, 40)}" OK in ${Math.round(performance.now() - t0)}ms`);
                        return { id: h.id, plan };
                    } catch {
                        console.log(`[Perf:PlanD] Plan "${h.topic.slice(0, 40)}" FAILED in ${Math.round(performance.now() - t0)}ms`);
                        return null;
                    }
                }),
            );
            for (const r of planResults) {
                if (r) preGeneratedPlans.set(r.id, r.plan);
            }
            const preGenTotal = Math.round(performance.now() - preGenStart);
            console.log(`[Perf:PlanD] Pre-generated ${preGeneratedPlans.size}/${plannable.length} plans in ${preGenTotal}ms (parallel). Serial estimate: ${plannable.length} × avg = ~${Math.round(preGenTotal * plannable.length / Math.max(preGeneratedPlans.size, 1))}ms`);
        }
    }

    let processedHypotheses = 0;
    let topicRound = 1;
    // When all metrics are zero, limit to 1 topic round — additional rounds
    // will just retry the same zero-value aggregations and waste steps.
    const topicRoundLimit = allMetricsZero || workingInputData.backing?.readOnly
        ? 1
        : resolveTopicRoundLimit(harnessContext);
    while (session.stepsUsed < session.maxSteps - DATA_ANALYSIS_FINALIZE_RESERVE_STEPS) {
        // PERF-304: Macrotask yield so browser can paint + respond to user input.
        // Promise.resolve() was a microtask — does NOT release main thread.
        // setTimeout(0) enters the macrotask queue, giving the browser at least
        // one opportunity to run rendering and input handlers.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (cancelAtCheckpoint()) {
            break;
        }
        const stopReason = shouldStopDataAnalysisSession(session);
        if (stopReason) {
            // Multi-round continuation: when hypotheses exhausted but below
            // the minimum card target, generate a new batch of diverse topics.
            if (
                stopReason === 'all_hypotheses_exhausted'
                && !effectiveDiagnosticMode
                && topicRound < topicRoundLimit
                && session.acceptedOutputs.length < effectiveMinTargetCards
                && canStartNextHypothesis(session)
            ) {
                topicRound += 1;
                const needed = effectiveMinTargetCards - session.acceptedOutputs.length;
                console.log(`[DataAnalysisSession] Round ${topicRound}: ${session.acceptedOutputs.length} accepted cards < ${effectiveMinTargetCards} target, generating more topics (need ${needed} more)`);

                updateAgentTaskStatus(store, {
                    status: 'thinking',
                    title: 'Generating additional analysis topics',
                    titleKey: 'ai_task_starting_analysis',
                    subtitle: `Round ${topicRound} — seeking ${needed} more card(s)`,
                    subtitleKey: 'ai_task_session_investigation',
                    totalSteps: session.hypotheses.length,
                    currentStep: processedHypotheses,
                });

                let gapTopics: string[] = [];
                try {
                    // Collect both accepted card titles and rejected semantic
                    // signatures so the AI avoids re-generating tried topics.
                    const currentCardTitles = [
                        ...(store.getState().analysisCards ?? []).map(c => c.plan.title),
                        ...session.rejectedOutputs.map(o => o.semanticSignature),
                    ];
                    gapTopics = await generateAnalysisTopics(
                        columnProfiles,
                        semanticDataForAnalysis.data.slice(0, 20),
                        store.getState().settings,
                        goal,
                        datasetContext,
                        store.getState(),
                        explorationContext,
                        harnessSummary,
                        currentCardTitles.length > 0 ? currentCardTitles : undefined,
                        { abortSignal: params.abortSignal },
                    );
                } catch (topicError) {
                    console.warn(`[DataAnalysisSession] Round ${topicRound} topic generation failed:`, topicError);
                }

                if (gapTopics.length > 0) {
                    const suggestedPivots = resolveSuggestedPivotsForDataset(workingInputData, investigationFindings);
                    const gapHypotheses = buildHypotheses(gapTopics, semanticUnderstanding, datasetContext, suggestedPivots);
                    if (gapHypotheses.length > 0) {
                        session = setDataAnalysisHypotheses(session, [...session.hypotheses, ...gapHypotheses]);
                        const gapStep = appendDataAnalysisStep(session, {
                            type: 'propose_hypotheses',
                            status: 'succeeded',
                            inputSummary: `Round ${topicRound}: generate additional hypotheses to reach minimum card target.`,
                            inputSummaryI18n: { key: 'analysis_trace_propose_hypotheses_input' },
                            outputSummary: `Round ${topicRound}: proposed ${gapHypotheses.length} additional hypothesis candidate(s).`,
                            outputSummaryI18n: {
                                key: 'analysis_trace_propose_hypotheses_output',
                                vars: { count: gapHypotheses.length },
                            },
                            decision: 'select_hypothesis',
                            reasonCodes: [`topic_round_${topicRound}`],
                        });
                        session = gapStep.session;
                        syncSessionState(store, session, true);
                        continue; // Re-enter loop — new pending hypotheses will be picked up
                    }
                }

                // Gap generation produced nothing usable — fall through to finalize
                console.log(`[DataAnalysisSession] Round ${topicRound}: no additional viable hypotheses generated`);
            }

            session = finalizeDataAnalysisSession(session, computeFinalSessionStatus(session), stopReason);
            break;
        }

        const nextHypothesis = getNextPendingHypothesis(session);
        if (!nextHypothesis) {
            session = finalizeDataAnalysisSession(session, computeFinalSessionStatus(session), 'all_hypotheses_exhausted');
            break;
        }
        if (!canStartNextHypothesis(session)) {
            session = finalizeDataAnalysisSession(session, computeFinalSessionStatus(session), 'insufficient_step_budget');
            break;
        }

        session = updateDataAnalysisHypothesis(session, nextHypothesis.id, hypothesis => ({
            ...hypothesis,
            status: 'active',
        }));
        const selected = appendDataAnalysisStep(session, {
            type: 'select_hypothesis',
            status: 'succeeded',
            inputSummary: 'Pick the next highest-priority hypothesis and continue verification.',
            inputSummaryI18n: {
                key: 'analysis_trace_select_hypothesis_input',
            },
            outputSummary: `Selected hypothesis "${nextHypothesis.topic}".`,
            outputSummaryI18n: {
                key: 'analysis_trace_select_hypothesis_output',
                vars: {
                    topic: nextHypothesis.topic,
                },
            },
            decision: 'plan_probe_query',
            hypothesisId: nextHypothesis.id,
            reasonCodes: [],
        });
        session = selected.session;
        session = syncDataResearchBrief(session);
        syncSessionState(store, session, true);

        const plannedToolCall = nextHypothesis.plannedToolCall ?? (
            nextHypothesis.executionMode === 'pivot_matrix' && nextHypothesis.pivotRequest
                ? {
                    toolName: 'analysis.pivot_matrix' as const,
                    thought: `Create a pivot matrix for hypothesis "${nextHypothesis.topic}".`,
                    args: nextHypothesis.pivotRequest,
                    pivotPreference: 'none' as const,
                    pivotDecision: 'prefer_pivot' as const,
                }
                : null
        );

        // --- Planned tool-call branch: execute through the normal tool chain ---
        if (plannedToolCall) {
            if (!isPivotMatrixConfig(plannedToolCall.args)) {
                const invalidArgsReason = 'invalid_planned_tool_args';
                recordStep({
                    type: 'plan_probe_query',
                    status: 'rejected',
                    inputSummary: `Execute planned tool: ${plannedToolCall.toolName}`,
                    outputSummary: `Planned tool rejected before execution: ${invalidArgsReason}.`,
                    hypothesisId: nextHypothesis.id,
                    reasonCodes: [invalidArgsReason],
                });
                session = appendRejectedAnalysisOutput(session, {
                    querySignature: `${nextHypothesis.id}:invalid_planned_tool_args`,
                    semanticSignature: `${nextHypothesis.id}:invalid_planned_tool_args`,
                    reason: invalidArgsReason,
                    sourceHypothesisId: nextHypothesis.id,
                    sourceStepIds: [],
                    valueReasonCodes: [invalidArgsReason],
                    evidenceDetail: null,
                });
                session = updateDataAnalysisHypothesis(session, nextHypothesis.id, h => ({
                    ...h,
                    attemptsUsed: h.attemptsUsed + 1,
                    status: 'exhausted',
                }));
                syncSessionState(store, session, true);
                processedHypotheses += 1;
                continue;
            }
            const pivotArgs = plannedToolCall.args;
            const pivotQuerySignature = buildPivotToolQuerySignature(pivotArgs);
            const pivotSemanticSignature = buildPivotToolSemanticSignature(pivotArgs, datasetContext.analysisSteering ?? null);
            const duplicateReasonCodes: string[] = [];
            if (acceptedEvidenceForDedupe.some(output => output.querySignature === pivotQuerySignature)) {
                duplicateReasonCodes.push('duplicate_query');
            }
            if (acceptedEvidenceForDedupe.some(output => output.semanticSignature === pivotSemanticSignature)) {
                duplicateReasonCodes.push('duplicate_semantic');
            }
            if (duplicateReasonCodes.length > 0) {
                recordStep({
                    type: 'evaluate_evidence',
                    status: 'rejected',
                    inputSummary: `Pre-execution duplicate check for planned tool "${plannedToolCall.toolName}".`,
                    outputSummary: `Planned tool rejected before execution: ${duplicateReasonCodes.join(', ')}.`,
                    hypothesisId: nextHypothesis.id,
                    reasonCodes: duplicateReasonCodes,
                    querySignature: pivotQuerySignature,
                    semanticSignature: pivotSemanticSignature,
                    queryTitle: pivotArgs.title,
                });
                session = appendRejectedAnalysisOutput(session, {
                    querySignature: pivotQuerySignature,
                    semanticSignature: pivotSemanticSignature,
                    reason: `pre-execution duplicate: ${duplicateReasonCodes.join(', ')}`,
                    sourceHypothesisId: nextHypothesis.id,
                    sourceStepIds: [],
                    valueReasonCodes: duplicateReasonCodes,
                    evidenceDetail: null,
                });
                session = updateDataAnalysisHypothesis(session, nextHypothesis.id, h => ({
                    ...h,
                    attemptsUsed: h.attemptsUsed + 1,
                    status: 'exhausted',
                }));
                processedHypotheses += 1;
                continue;
            }
            const pivotStepId = recordStep({
                type: 'plan_probe_query',
                status: 'running',
                inputSummary: `Execute planned tool: ${plannedToolCall.toolName}`,
                outputSummary: '',
                hypothesisId: nextHypothesis.id,
            });

            try {
                const pivotResult = await handleAiAction({
                    type: 'tool_call',
                    toolName: plannedToolCall.toolName,
                    thought: plannedToolCall.thought,
                    args: plannedToolCall.args,
                }, store, { toolStage: 'analysis' });
                const pivotCardId = pivotResult.artifacts?.cardId as string | undefined;

                if (pivotResult.status === 'success' && pivotCardId) {
                    // Update the trace step
                    recordStep({
                        type: 'emit_standard_card',
                        status: 'succeeded',
                        inputSummary: `Created planned-tool card: ${nextHypothesis.topic}`,
                        outputSummary: `Pivot card ${pivotCardId} accepted.`,
                        hypothesisId: nextHypothesis.id,
                    });

                    session = appendAcceptedAnalysisOutput(session, {
                        cardId: pivotCardId,
                        querySignature: pivotQuerySignature,
                        semanticSignature: pivotSemanticSignature,
                        sourceHypothesisId: nextHypothesis.id,
                        sourceStepIds: [pivotStepId],
                        valueDecision: 'pass',
                        presentationMode: 'table_then_chart',
                        valueReasonCodes: [],
                        evidenceDetail: null,
                    });
                    acceptedEvidenceForDedupe.push({
                        querySignature: pivotQuerySignature,
                        semanticSignature: pivotSemanticSignature,
                        decision: 'pass',
                        title: pivotArgs.title,
                    });
                    session = updateDataAnalysisHypothesis(session, nextHypothesis.id, h => ({
                        ...h,
                        attemptsUsed: h.attemptsUsed + 1,
                        status: 'accepted',
                    }));
                } else {
                    recordStep({
                        type: 'emit_standard_card',
                        status: 'rejected',
                        inputSummary: `Planned tool failed: ${plannedToolCall.toolName}`,
                        outputSummary: pivotResult.message ?? 'Pivot creation failed.',
                        hypothesisId: nextHypothesis.id,
                    });

                    session = appendRejectedAnalysisOutput(session, {
                        querySignature: pivotQuerySignature,
                        semanticSignature: pivotSemanticSignature,
                        reason: pivotResult.message ?? 'pivot_execution_failed',
                        sourceHypothesisId: nextHypothesis.id,
                        sourceStepIds: [pivotStepId],
                        valueReasonCodes: [],
                        evidenceDetail: null,
                    });
                    session = updateDataAnalysisHypothesis(session, nextHypothesis.id, h => ({
                        ...h,
                        attemptsUsed: h.attemptsUsed + 1,
                        status: 'exhausted',
                    }));
                }
            } catch (pivotError) {
                console.warn(`[DataAnalysisSession] Pivot hypothesis failed:`, pivotError);
                session = appendRejectedAnalysisOutput(session, {
                    querySignature: pivotQuerySignature,
                    semanticSignature: pivotSemanticSignature,
                    reason: 'pivot_execution_error',
                    sourceHypothesisId: nextHypothesis.id,
                    sourceStepIds: [pivotStepId],
                    valueReasonCodes: [],
                    evidenceDetail: null,
                });
                session = updateDataAnalysisHypothesis(session, nextHypothesis.id, h => ({
                    ...h,
                    attemptsUsed: h.attemptsUsed + 1,
                    status: 'exhausted',
                }));
            }

            processedHypotheses += 1;

        // --- Standard SQL evidence path (unchanged) ---
        } else {
            const hypothesisStart = performance.now();
            const hasPreGen = preGeneratedPlans.has(nextHypothesis.id);
            const result = await processSingleTopic(
                nextHypothesis.topic,
                semanticDataForAnalysis,
                store,
                binding,
                acceptedEvidenceForDedupe,
                {
                    datasetContext,
                    semanticUnderstanding,
                    hypothesisId: nextHypothesis.id,
                    analysisSessionRunId: session.runId,
                    explorationContext,
                    harnessSummary,
                    harnessContext,
                    planningIntent: {
                        preferredGroupBy: nextHypothesis.grain,
                        preferredMetric: nextHypothesis.metric,
                        preferredFilterIntent: nextHypothesis.filterIntent,
                    },
                    preGeneratedPlan: preGeneratedPlans.get(nextHypothesis.id),
                    abortSignal: params.abortSignal,
                    recordAnalysisStep: recordStepSuppressed,
                },
            );

            console.log(`[Perf:PlanD] Hypothesis "${nextHypothesis.topic.slice(0, 40)}" completed in ${Math.round(performance.now() - hypothesisStart)}ms (preGen=${hasPreGen}, status=${result.status})`);

            if (result.status === 'aborted') {
                session = finalizeDataAnalysisSession(session, 'cancelled', 'analysis_aborted');
                break;
            }

            processedHypotheses += 1;
            if (result.acceptedEvidence) {
                acceptedEvidenceForDedupe.push(result.acceptedEvidence);
            }

            if (result.cardCreated && result.cardId
                && (result.acceptedEvidence?.decision === 'pass' || result.acceptedEvidence?.decision === 'table_only')) {
                session = appendAcceptedAnalysisOutput(session, {
                    cardId: result.cardId,
                    querySignature: result.acceptedEvidence.querySignature,
                    semanticSignature: result.acceptedEvidence.semanticSignature,
                    sourceHypothesisId: nextHypothesis.id,
                    sourceStepIds: result.sourceStepIds,
                    valueDecision: result.acceptedEvidence.decision,
                    presentationMode: result.tableFirst ? 'table_then_chart' : 'chart',
                    valueReasonCodes: result.valueReasonCodes ?? [],
                    evidenceDetail: result.evidenceDetail ?? null,
                });
                session = updateDataAnalysisHypothesis(session, nextHypothesis.id, hypothesis => ({
                    ...hypothesis,
                    attemptsUsed: hypothesis.attemptsUsed + 1,
                    status: 'accepted',
                }));
                const dedupeStep = appendDataAnalysisStep(session, {
                    type: 'dedupe_candidate',
                    status: 'succeeded',
                    inputSummary: `Run deduplication for accepted result of hypothesis "${nextHypothesis.topic}".`,
                    inputSummaryI18n: {
                        key: 'analysis_trace_dedupe_candidate_input',
                        vars: {
                            topic: nextHypothesis.topic,
                        },
                    },
                    outputSummary: 'The result passed deduplication and is kept as a formal output.',
                    outputSummaryI18n: {
                        key: 'analysis_trace_dedupe_candidate_output',
                        vars: {
                            topic: nextHypothesis.topic,
                        },
                    },
                    decision: 'select_hypothesis',
                    hypothesisId: nextHypothesis.id,
                    reasonCodes: [],
                });
                session = dedupeStep.session;
            } else {
                session = appendRejectedAnalysisOutput(session, {
                    querySignature: result.acceptedEvidence?.querySignature ?? `${nextHypothesis.id}:none`,
                    semanticSignature: result.acceptedEvidence?.semanticSignature ?? `${nextHypothesis.id}:none`,
                    reason: result.rejectionReason ?? result.valueDecision,
                    sourceHypothesisId: nextHypothesis.id,
                    sourceStepIds: result.sourceStepIds,
                    valueReasonCodes: result.valueReasonCodes ?? [],
                    evidenceDetail: result.evidenceDetail ?? null,
                });
                session = updateDataAnalysisHypothesis(session, nextHypothesis.id, hypothesis => ({
                    ...hypothesis,
                    attemptsUsed: hypothesis.attemptsUsed + 1,
                    status: hypothesis.attemptsUsed + 1 >= 2 ? 'exhausted' : 'rejected',
                }));
            }
        }

        // Batch the session sync, progress, and task status into one setState so
        // both the AiTaskStatusBubble and the skeleton card count stay in sync —
        // users see a single "X/N" counter instead of two disconnected signals.
        // PERF-301: columnRegistry is NOT rebuilt per-hypothesis — it doesn't change
        // during the loop (no columns added/removed). Rebuilt once after loop ends.
        store.setState({
            activeAnalysisSession: session,
            latestAnalysisSession: session,
            visibleAnalysisTrace: session.trace,
            reportGenerationProgress: {
                completed: processedHypotheses,
                total: session.hypotheses.length || 1,
                mode: 'analysis',
            },
            aiTaskStatus: keepInitialAnalysisStageFrame(store.getState().aiTaskStatus, {
                status: 'thinking',
                title: 'Verifying analysis hypotheses',
                titleKey: 'ai_task_verifying_hypotheses',
                subtitle: topicRound > 1
                    ? `Round ${topicRound}: completed ${processedHypotheses} / ${session.hypotheses.length} hypotheses`
                    : `Completed ${processedHypotheses} / ${session.hypotheses.length} hypotheses`,
                subtitleKey: 'ai_task_verifying_hypotheses_progress',
                subtitleParams: { completed: processedHypotheses, total: session.hypotheses.length },
                totalSteps: session.hypotheses.length,
                currentStep: processedHypotheses,
            }),
        });
        // PERF-304: Yield after main loop setState so browser can paint the
        // updated progress counter before next hypothesis starts.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    // Trust decisions require a persisted automatic quality verdict. Card
    // executors evaluate cards for telemetry, but the lifecycle owner must
    // attach the final cross-card verdicts after the bounded run is complete.
    store.setState(state => ({
        analysisCards: attachAutoAnalysisEvaluationToCards(state.analysisCards, {
            qualityGovernance,
            columnProfiles,
        }),
    }));

    // PERF-301: Rebuild columnRegistry once now that the hypothesis loop is done.
    store.setState(state => ({
        columnRegistry: buildEffectiveColumnRegistryFromState({
            ...state,
            latestAnalysisSession: session,
        }),
    }));

    if (!session.summary) {
        session = finalizeDataAnalysisSession(
            session,
            session.status === 'cancelled' ? 'cancelled' : computeFinalSessionStatus(session),
            session.stopReason ?? 'analysis_completed',
        );
    }

    if (session.stepsUsed < session.maxSteps) {
        const finalized = appendDataAnalysisStep(session, {
            type: 'finalize_session',
            status: session.status === 'failed' ? 'failed' : 'succeeded',
            inputSummary: 'Finalize the analysis session and summarize accepted outputs and rejections.',
            inputSummaryI18n: {
                key: 'analysis_trace_finalize_session_input',
            },
            outputSummary: `Accepted cards = ${session.acceptedOutputs.length}; rejected outputs = ${session.rejectedOutputs.length}; status = ${session.status}.`,
            outputSummaryI18n: {
                key: 'analysis_trace_finalize_session_output',
                vars: {
                    acceptedCards: session.acceptedOutputs.length,
                    rejectedOutputs: session.rejectedOutputs.length,
                    status: session.status,
                },
            },
            decision: null,
            reasonCodes: session.stopReason ? [session.stopReason] : [],
        });
        session = finalizeDataAnalysisSession(
            finalized.session,
            session.status === 'cancelled' ? 'cancelled' : computeFinalSessionStatus(finalized.session),
            finalized.session.stopReason ?? 'analysis_completed',
        );
    } else {
        session = finalizeDataAnalysisSession(
            session,
            session.status === 'cancelled' ? 'cancelled' : computeFinalSessionStatus(session),
            session.stopReason ?? 'analysis_completed',
        );
    }

    session = syncDataResearchBrief({
        ...session,
        researchFindings: buildDataResearchFindings(session),
    });
    syncSessionState(store, session, false);

    emitAgentEvent(store, {
        runId: session.runId,
        phase: 'execution',
        step: 'analysis_session',
        status: session.status === 'failed' ? 'error' : 'done',
        message: session.status === 'cancelled'
            ? 'Research run cancelled. No later questions were executed.'
            : session.acceptedOutputs.length > 0
                ? `Research run completed with ${session.acceptedOutputs.length} evidence-backed finding(s).`
                : 'Research run completed without a supported business finding.',
        detail: {
            runId: session.runId,
            origin,
            acceptedOutputs: session.acceptedOutputs.length,
            rejectedOutputs: session.rejectedOutputs.length,
            traceCount: session.trace.length,
            stopReason: session.stopReason,
            topicRoundsUsed: topicRound,
            findingCount: session.researchFindings?.length ?? 0,
        },
        activity: {
            kind: 'research',
            lifecycle: session.status === 'cancelled'
                ? 'cancelled'
                : session.status === 'completed'
                    ? 'completed'
                    : session.status === 'failed'
                        ? 'failed'
                        : 'degraded',
            source: 'app',
            eventType: 'research_run_terminal',
            title: session.status === 'cancelled'
                ? 'Research run cancelled'
                : session.status === 'completed'
                    ? 'Research run completed'
                    : session.status === 'failed'
                        ? 'Research run failed'
                        : 'Research run completed with limitations',
            explanation: session.stopReason ?? undefined,
        },
    });
    clearDataResearchCancellation(session.runId);

    // P1 Card generation success rate tracking.
    // If <50% of attempted hypotheses produced accepted cards, the pipeline
    // "succeeded" but is nearly empty — emit analysis_yield_low so we can
    // distinguish "low-yield dataset" from "healthy run" in telemetry.
    const yieldMetric = computeCardYieldMetric(
        session.acceptedOutputs.length,
        processedHypotheses,
        session.rejectedOutputs.length,
    );
    if (yieldMetric.shouldFlagLow) {
        recordRuntimeEvent(store, {
            type: 'analysis_yield_low',
            stage: 'finalizing',
            reason: 'card_success_rate_below_threshold',
            message: `Analysis yield low: ${yieldMetric.cardsProduced}/${yieldMetric.topicsAttempted} hypotheses produced cards (${Math.round(yieldMetric.yieldRate * 100)}%). ${yieldMetric.cardsFailed} rejected.`,
            detail: {
                topicsAttempted: yieldMetric.topicsAttempted,
                cardsProduced: yieldMetric.cardsProduced,
                cardsFailed: yieldMetric.cardsFailed,
                yieldRate: yieldMetric.yieldRate,
                topicRoundsUsed: topicRound,
                sessionRunId: session.runId,
            },
        });
    }

    // ── PERF-201: Deferred memory upsert — batch after hypothesis loop ──
    // upsertCardMemoryDocument triggers ONNX embedding (8-18s/card) which blocks
    // the vector Worker. Running during the loop causes vectorStore.searchIfReady
    // to queue behind embedding work. Deferring here avoids that contention.
    const cardsToUpsert = store.getState().analysisCards.filter(c =>
        c.analysisSessionRunId === session.runId,
    );
    if (cardsToUpsert.length > 0) {
        // PERF-302: Fire-and-forget — don't block return so generateAllSummaries
        // can start immediately in the orchestrator. Memory upsert uses the ONNX
        // vector Worker which is independent of AI summary generation.
        // PERF-308: Serial + yield between upserts. Promise.all fires all ONNX
        // callbacks near-simultaneously → they queue on main thread as one 48s
        // long task. Serial execution + yield gives the browser idle time between
        // each card's ONNX embedding callback.
        const memStart = performance.now();
        console.log(`[Perf:Memory] Batch upserting ${cardsToUpsert.length} card memory documents (background)...`);
        (async () => {
            for (const card of cardsToUpsert) {
                try {
                    await upsertCardMemoryDocument(store as never, card.id);
                } catch { /* non-blocking */ }
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
            console.log(`[Perf:Memory] Batch upsert complete: ${Math.round(performance.now() - memStart)}ms`);
        })();
    }

    syncSessionState(store, session, false);
    return {
        session,
        semanticData: semanticDataForAnalysis,
        binding,
        acceptedCardCount: session.acceptedOutputs.length,
    };
};

/**
 * Lifecycle boundary for the research runner. Individual planning/query stages
 * may throw, but the shared store must never retain a false running session.
 */
export const runDataAnalysisSession = async (
    params: RunDataAnalysisSessionParams,
): Promise<import('./analysisSessionHelpers').DataAnalysisSessionRunResult> => {
    try {
        return await runDataAnalysisSessionInternal(params);
    } catch (error) {
        const activeSession = params.store.getState().activeAnalysisSession;
        const ownsActiveSession = activeSession
            && activeSession.sessionId === params.store.getState().sessionId
            && (!params.runId || activeSession.runId === params.runId);

        if (ownsActiveSession && activeSession.status === 'running') {
            const cancelled = Boolean(params.abortSignal?.aborted);
            const stopReason = cancelled
                ? 'analysis_aborted'
                : 'analysis_execution_failed';
            const terminalSession = syncDataResearchBrief({
                ...finalizeDataAnalysisSession(
                    activeSession,
                    cancelled ? 'cancelled' : 'failed',
                    stopReason,
                ),
                researchFindings: buildDataResearchFindings(activeSession),
            });
            syncSessionState(params.store, terminalSession, false);
            clearDataResearchCancellation(activeSession.runId);
            emitAgentEvent(params.store, {
                runId: activeSession.runId,
                phase: 'execution',
                step: 'analysis_session',
                status: cancelled ? 'done' : 'error',
                message: cancelled
                    ? 'Research run cancelled. No later questions were executed.'
                    : 'Research run stopped after an execution failure. No running state was retained.',
                detail: {
                    runId: activeSession.runId,
                    origin: params.origin,
                    stopReason,
                    error: error instanceof Error ? error.message : String(error),
                },
                activity: {
                    kind: 'research',
                    lifecycle: cancelled ? 'cancelled' : 'failed',
                    source: 'app',
                    eventType: 'research_run_terminal',
                    title: cancelled ? 'Research run cancelled' : 'Research run failed',
                    explanation: stopReason,
                },
            });
        }
        throw error;
    }
};
