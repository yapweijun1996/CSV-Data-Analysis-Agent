import { resolveAnalysisCompletionGate } from '../../analysisCompletionGate';
import { ensureDuckDbSessionSync } from '../../../duckdb/storeSessionSync';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { generateAllSummaries } from '../../execution/summaryManager';
import { enqueueDatasetMemoryDocs } from '../../memory/vectorMemorySync';
import { resolveAnalysisDatasetProfiles } from '../../analysisDatasetProfiles';
import { getPreferredAnalysisDataset } from '../../reportStructureState';
import { applyPreparationPlanToCanonicalDataset } from '../../orchestration/canonicalPreparation';
import { orchestrateAutonomousAiCleaning } from '../../orchestration/autonomousCleaningPipeline';
import { resolveReportStructureArtifactsWithProposal } from '../../orchestration/reportStructureOrchestrator';
import { runDataAnalysisSession } from '../dataAnalysisSessionRunner';
import { requestDataResearchCancellation } from '../dataResearchCancellation';
import { createCleaningRun } from '../../cleaningRunState';
import { createDeterministicEvidenceFallbackCard } from './deterministicEvidenceFallback';
import type {
    InitialAnalysisStageActionResult,
    InitialAnalysisStageDecision,
    InitialAnalysisStageExecutionContext,
    InitialAnalysisStageExecutorMap,
} from './initialAnalysisStageTools';
import type {
    InitialAnalysisPhase,
} from './initialAnalysisTypes';
import type {
    InitialAnalysisStageToolName,
} from '../../tools/manifests/initialAnalysisStageManifests';
import type { StoreApi } from '../../types';

export interface InitialAnalysisStageServiceBindings {
    resolveStructure: typeof resolveReportStructureArtifactsWithProposal;
    runCleaning: typeof orchestrateAutonomousAiCleaning;
    syncQueryEngine: typeof ensureDuckDbSessionSync;
    runEvidence: typeof runDataAnalysisSession;
    generateSummaries: typeof generateAllSummaries;
}

const defaultBindings: InitialAnalysisStageServiceBindings = {
    resolveStructure: resolveReportStructureArtifactsWithProposal,
    runCleaning: orchestrateAutonomousAiCleaning,
    syncQueryEngine: ensureDuckDbSessionSync,
    runEvidence: runDataAnalysisSession,
    generateSummaries: generateAllSummaries,
};

export const INITIAL_EVIDENCE_RESEARCH_BUDGET_MS = 45_000;
export const INITIAL_LARGE_DATASET_EVIDENCE_RESEARCH_BUDGET_MS = 190_000;

export const resolveEvidenceResearchBudgetMs = (state: ReturnType<StoreApi['getState']>) => {
    const dataset = getPreferredAnalysisDataset(state);
    return (dataset?.backing?.rowCount ?? 0) >= 750_000
        || (dataset?.backing?.byteSize ?? 0) >= 75 * 1024 * 1024
        ? INITIAL_LARGE_DATASET_EVIDENCE_RESEARCH_BUDGET_MS
        : INITIAL_EVIDENCE_RESEARCH_BUDGET_MS;
};
export const INITIAL_SUMMARY_FINALIZATION_BUDGET_MS = 45_000;

const assertNotAborted = (signal: AbortSignal) => {
    if (signal.aborted) {
        throw signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Initial analysis was cancelled.', 'AbortError');
    }
};

const currentVersion = (
    context: InitialAnalysisStageExecutionContext,
): string =>
    getCurrentAnalysisDatasetVersion(context.store.getState())
    ?? context.request.datasetVersion;

const canUseReadOnlyEvidenceFallback = (
    state: ReturnType<InitialAnalysisStageExecutionContext['store']['getState']>,
): boolean => {
    const dataset = getPreferredAnalysisDataset(state);
    if (
        dataset?.backing?.mode !== 'duckdb_file'
        || dataset.backing.readOnly !== true
        || state.duckDbSessionStatus?.status !== 'ready'
        || state.reportStructureResolution?.decision.targetShape !== 'row_table'
        || state.pipelineOutcome?.reasonCode !== 'wide_reshape_contract_complete'
    ) {
        return false;
    }
    const profiles = resolveAnalysisDatasetProfiles(
        dataset,
        state.columnProfiles,
    );
    const hasMetric = profiles.some(profile =>
        ['numerical', 'currency', 'percentage'].includes(profile.type));
    const hasDimension = profiles.some(profile =>
        ['categorical', 'date', 'time'].includes(profile.type));
    return hasMetric && hasDimension;
};

const createResult = (params: {
    context: InitialAnalysisStageExecutionContext;
    phase: InitialAnalysisPhase;
    toolName: InitialAnalysisStageToolName;
    decision: InitialAnalysisStageDecision;
    summary: string;
    warningCodes?: string[];
    artifactRefs?: string[];
    transformationIds?: string[];
    cardIds?: string[];
}): InitialAnalysisStageActionResult => ({
    decision: params.decision,
    phase: params.phase,
    toolName: params.toolName,
    datasetVersion: currentVersion(params.context),
    summary: params.summary,
    warningCodes: params.warningCodes ?? [],
    artifactRefs: params.artifactRefs ?? [],
    transformationIds: params.transformationIds ?? [],
    cardIds: params.cardIds ?? [],
});

const resolveAndCommitStructure = async (
    context: InitialAnalysisStageExecutionContext,
    bindings: InitialAnalysisStageServiceBindings,
) => {
    assertNotAborted(context.signal);
    const state = context.store.getState();
    const artifacts = await bindings.resolveStructure({
        rawCsvData: state.rawCsvData,
        csvData: state.csvData,
        rawIntakeIr: state.rawIntakeIr,
        cleaningRun: state.cleaningRun,
        dataPreparationPlan: state.dataPreparationPlan,
        columnProfiles: state.columnProfiles,
        humanBoundary:
            state.reportStructureResolution?.source === 'human_confirmed'
                ? state.reportStructureResolution.humanBoundary
                : null,
        settings: state.settings,
        telemetryTarget: {
            sessionId: state.sessionId,
            currentDatasetId: state.currentDatasetId,
        },
    });
    assertNotAborted(context.signal);
    const canonicalCsvData = applyPreparationPlanToCanonicalDataset(
        artifacts.canonicalCsvData,
        state.dataPreparationPlan,
    );
    context.store.setState({
        reportStructureResolution: artifacts.reportStructureResolution,
        canonicalCsvData,
        canonicalBuildMeta: artifacts.canonicalBuildMeta,
        canonicalizationStatus: artifacts.canonicalizationStatus,
        pipelineOutcome: artifacts.pipelineOutcome,
    });
    return {
        ...artifacts,
        canonicalCsvData,
    };
};

export const createInitialAnalysisStageExecutors = (
    overrides: Partial<InitialAnalysisStageServiceBindings> = {},
): InitialAnalysisStageExecutorMap => {
    const bindings = { ...defaultBindings, ...overrides };

    return {
        'dataset.profileStructure': async context => {
            const artifacts = await resolveAndCommitStructure(context, bindings);
            const resolution = artifacts.reportStructureResolution;
            if (!resolution || !artifacts.canonicalCsvData) {
                return createResult({
                    context,
                    phase: 'inspect_structure',
                    toolName: 'dataset.profileStructure',
                    decision: 'fail',
                    summary: 'No usable report structure could be resolved.',
                    warningCodes: ['report_structure_unavailable'],
                });
            }
            const needsReview = resolution.requiresHumanReview;
            return createResult({
                context,
                phase: 'inspect_structure',
                toolName: 'dataset.profileStructure',
                decision: needsReview ? 'warn' : 'pass',
                summary: needsReview
                    ? 'Report structure was resolved with review caveats.'
                    : 'Report structure was resolved for the current dataset version.',
                warningCodes: needsReview ? ['report_structure_review_recommended'] : [],
                artifactRefs: [
                    `report-structure:${resolution.source}`,
                    `canonical-shape:${resolution.decision.targetShape}`,
                ],
            });
        },

        'dataset.detectNoiseRows': async context => {
            assertNotAborted(context.signal);
            const inspection = context.store.getState()
                .reportStructureResolution?.rowInspection;
            if (!inspection) {
                return createResult({
                    context,
                    phase: 'inspect_structure',
                    toolName: 'dataset.detectNoiseRows',
                    decision: 'warn',
                    summary: 'No row-inspection artifact was available.',
                    warningCodes: ['row_inspection_unavailable'],
                });
            }
            const residualCount = inspection.residualUnknownRowIndexes.length
                + inspection.residualSummaryLikeRowIndexes.length;
            return createResult({
                context,
                phase: 'inspect_structure',
                toolName: 'dataset.detectNoiseRows',
                decision: residualCount > 0 ? 'warn' : 'pass',
                summary: residualCount > 0
                    ? `${residualCount} residual report-noise row candidate(s) remain.`
                    : 'No residual report-noise row candidates were detected.',
                warningCodes: residualCount > 0 ? ['residual_noise_candidates'] : [],
                artifactRefs: [`row-inspection:${inspection.generatedAt}`],
            });
        },

        'dataset.suggestCleaningPlan': async context => {
            assertNotAborted(context.signal);
            const plan = context.store.getState().dataPreparationPlan;
            if (!plan) {
                return createResult({
                    context,
                    phase: 'propose_cleaning',
                    toolName: 'dataset.suggestCleaningPlan',
                    decision: 'warn',
                    summary: 'No cleaning plan exists yet; the cleaning service will inspect before mutation.',
                    warningCodes: ['cleaning_plan_pending'],
                });
            }
            return createResult({
                context,
                phase: 'propose_cleaning',
                toolName: 'dataset.suggestCleaningPlan',
                decision: plan.planStatus === 'inconsistent' ? 'warn' : 'pass',
                summary: `Prepared ${plan.operations.length} governed cleaning operation(s).`,
                warningCodes: plan.planStatus === 'inconsistent'
                    ? ['cleaning_plan_inconsistent']
                    : [],
                artifactRefs: plan.operations.map(operation =>
                    `cleaning-operation:${operation.id}`),
            });
        },

        'dataset.applyTransform': async context => {
            assertNotAborted(context.signal);
            const sourceDataset = getPreferredAnalysisDataset(context.store.getState());
            if (sourceDataset?.backing?.mode === 'duckdb_file') {
                const existingRun = context.store.getState().cleaningRun ?? createCleaningRun();
                context.store.setState({
                    cleaningRun: {
                        ...existingRun,
                        status: 'completed',
                        strategyKind: 'already_valid',
                        shouldAutoResume: false,
                        lastError: null,
                        updatedAt: new Date(),
                        userFacingMessage: 'The original large CSV is preserved in read-only mode; no cleaning changes were applied.',
                        actionTakenMessage: 'Skipped mutation and kept the source rows unchanged.',
                        dataSafetyMessage: 'Full-dataset SQL queries run locally. Quality profiling is based on the visible preview sample.',
                        nextStateMessage: 'Continue with read-only evidence queries against the complete dataset.',
                    },
                });
                return createResult({
                    context,
                    phase: 'apply_safe_cleaning',
                    toolName: 'dataset.applyTransform',
                    decision: 'warn',
                    summary: 'Your original file was not changed. The full dataset is analysed as it is.',
                    warningCodes: ['large_dataset_read_only'],
                    artifactRefs: [`cleaning-run:${existingRun.runId}`],
                });
            }
            await bindings.runCleaning(context.store, { abortSignal: context.signal });
            assertNotAborted(context.signal);
            const state = context.store.getState();
            const operations = state.dataPreparationPlan?.operations ?? [];
            const completed = state.cleaningRun?.status === 'completed';
            return createResult({
                context,
                phase: 'apply_safe_cleaning',
                toolName: 'dataset.applyTransform',
                decision: completed ? 'pass' : 'fail',
                summary: completed
                    ? `Committed ${operations.length} safe cleaning operation(s).`
                    : state.cleaningRun?.userFacingMessage
                        ?? 'The cleaning run did not reach a stable completed state.',
                warningCodes: completed ? [] : ['cleaning_not_completed'],
                transformationIds: operations.map(operation => operation.id),
                artifactRefs: state.cleaningRun?.runId
                    ? [`cleaning-run:${state.cleaningRun.runId}`]
                    : [],
            });
        },

        'dataset.validatePreparedData': async context => {
            const artifacts = await resolveAndCommitStructure(context, bindings);
            const outcome = artifacts.pipelineOutcome;
            const analysisDataset = getPreferredAnalysisDataset(context.store.getState());
            const canAnalyze = outcome?.canAutoAnalyze === true
                && Boolean(
                    analysisDataset?.backing?.rowCount
                    ?? analysisDataset?.data.length,
                );
            const decision: InitialAnalysisStageDecision = !canAnalyze
                ? 'fail'
                : outcome?.severity === 'warning'
                    ? 'warn'
                    : 'pass';
            return createResult({
                context,
                phase: 'verify_prepared_data',
                toolName: 'dataset.validatePreparedData',
                decision,
                summary: outcome?.message
                    ?? (canAnalyze
                        ? 'Prepared data passed structure and analysis-readiness verification.'
                        : 'Prepared data is not safe for automatic analysis.'),
                warningCodes: decision === 'pass'
                    ? []
                    : [outcome?.reasonCode ?? 'prepared_data_not_ready'],
                artifactRefs: outcome ? [`pipeline-outcome:${outcome.status}`] : [],
            });
        },

        'dataset.bindQueryEngine': async context => {
            assertNotAborted(context.signal);
            const dataset = getPreferredAnalysisDataset(context.store.getState());
            if (!dataset) {
                return createResult({
                    context,
                    phase: 'bind_query_engine',
                    toolName: 'dataset.bindQueryEngine',
                    decision: 'fail',
                    summary: 'No prepared dataset is available for query binding.',
                    warningCodes: ['query_dataset_unavailable'],
                });
            }
            const status = await bindings.syncQueryEngine(context.store, dataset);
            assertNotAborted(context.signal);
            const decision: InitialAnalysisStageDecision = status.status === 'ready'
                ? 'pass'
                : status.status === 'degraded'
                    ? 'warn'
                    : 'fail';
            return createResult({
                context,
                phase: 'bind_query_engine',
                toolName: 'dataset.bindQueryEngine',
                decision,
                summary: status.status === 'ready'
                    ? 'The prepared dataset is bound to the query engine.'
                    : status.fallbackReason
                        ?? `Query-engine binding ended in ${status.status} state.`,
                warningCodes: decision === 'pass'
                    ? []
                    : [`query_engine_${status.status}`],
                artifactRefs: status.tableName
                    ? [`query-table:${status.tableName}`, `query-load:${status.loadVersion ?? 'unknown'}`]
                    : [],
            });
        },

        'analysis.researchQuestions': async context => {
            assertNotAborted(context.signal);
            const state = context.store.getState();
            const dataset = getPreferredAnalysisDataset(state);
            if (!dataset) {
                return createResult({
                    context,
                    phase: 'research_questions',
                    toolName: 'analysis.researchQuestions',
                    decision: 'fail',
                    summary: 'No prepared dataset is available for semantic research planning.',
                    warningCodes: ['research_dataset_unavailable'],
                });
            }
            const columnProfiles = resolveAnalysisDatasetProfiles(
                dataset,
                state.columnProfiles,
            );
            context.store.setState({ columnProfiles });
            await context.store.getState().ensureDatasetSemanticSnapshot(dataset);
            assertNotAborted(context.signal);
            enqueueDatasetMemoryDocs(context.store as never);
            context.store.setState({ vectorMemoryState: 'queued' });
            return createResult({
                context,
                phase: 'research_questions',
                toolName: 'analysis.researchQuestions',
                decision: 'pass',
                summary: 'The semantic dataset view is ready and the bounded research goal was handed to the existing question planner.',
                artifactRefs: [
                    `research-goal:${context.request.appSessionId}`,
                    `semantic-dataset:${currentVersion(context)}`,
                ],
            });
        },

        'analysis.executeEvidence': async (context, args) => {
            assertNotAborted(context.signal);
            const state = context.store.getState();
            const dataset = getPreferredAnalysisDataset(state);
            const readOnlyEvidenceFallback = canUseReadOnlyEvidenceFallback(state);
            if (
                !dataset
                || (
                    state.pipelineOutcome?.canAutoAnalyze === false
                    && !readOnlyEvidenceFallback
                )
            ) {
                return createResult({
                    context,
                    phase: 'execute_evidence',
                    toolName: 'analysis.executeEvidence',
                    decision: 'fail',
                    summary: state.pipelineOutcome?.message
                        ?? 'Evidence execution was skipped because prepared data is unavailable.',
                    warningCodes: [state.pipelineOutcome?.reasonCode ?? 'evidence_dataset_unavailable'],
                });
            }
            const researchRunId = typeof args.runtimeRunId === 'string'
                ? args.runtimeRunId
                : context.request.appSessionId;
            const evidenceController = new AbortController();
            const evidenceResearchBudgetMs = resolveEvidenceResearchBudgetMs(state);
            const forwardRuntimeAbort = () => {
                if (!evidenceController.signal.aborted) {
                    evidenceController.abort(context.signal.reason);
                }
            };
            context.signal.addEventListener('abort', forwardRuntimeAbort, { once: true });
            let evidenceBudgetExpired = false;
            const budgetTimer = setTimeout(() => {
                evidenceBudgetExpired = true;
                requestDataResearchCancellation(researchRunId);
                if (!evidenceController.signal.aborted) {
                    evidenceController.abort(new DOMException(
                        'Initial evidence research budget expired.',
                        'AbortError',
                    ));
                }
            }, evidenceResearchBudgetMs);
            let run: Awaited<ReturnType<InitialAnalysisStageServiceBindings['runEvidence']>> | null = null;
            try {
                run = await bindings.runEvidence({
                    origin: 'auto_analysis',
                    goal: context.request.researchGoal,
                    store: context.store,
                    dataForAnalysis: dataset,
                    runId: researchRunId,
                    abortSignal: evidenceController.signal,
                });
            } catch (error) {
                assertNotAborted(context.signal);
                if (!evidenceBudgetExpired) throw error;
            } finally {
                clearTimeout(budgetTimer);
                context.signal.removeEventListener('abort', forwardRuntimeAbort);
            }
            assertNotAborted(context.signal);
            const cardIds = (run?.session.acceptedOutputs ?? [])
                .map(output => output.cardId)
                .filter((value): value is string => typeof value === 'string');
            let acceptedCardCount = run?.acceptedCardCount ?? 0;
            if (acceptedCardCount === 0 && !context.signal.aborted) {
                try {
                    const fallbackCard = await createDeterministicEvidenceFallbackCard(context.store);
                    if (fallbackCard) {
                        cardIds.push(fallbackCard.id);
                        acceptedCardCount = 1;
                    }
                } catch (error) {
                    console.warn('[InitialAnalysis] Deterministic evidence fallback failed:', error);
                }
            }
            const usedDeterministicFallback = (run?.acceptedCardCount ?? 0) === 0 && acceptedCardCount > 0;
            const decision: InitialAnalysisStageDecision = acceptedCardCount === 0
                ? 'fail'
                : run?.session.status === 'completed' && !readOnlyEvidenceFallback && !usedDeterministicFallback
                    ? 'pass'
                    : 'warn';
            return createResult({
                context,
                phase: 'execute_evidence',
                toolName: 'analysis.executeEvidence',
                decision,
                summary: acceptedCardCount > 0
                    ? usedDeterministicFallback
                        ? 'Created one deterministic aggregate for review after the governed research run produced no accepted card.'
                        : readOnlyEvidenceFallback
                            ? `Created ${acceptedCardCount} evidence-backed analysis card(s) from the complete read-only dataset with a visible structure caveat.`
                            : `Created ${acceptedCardCount} evidence-backed analysis card(s).`
                    : evidenceBudgetExpired
                        ? 'The evidence research budget expired and no safe deterministic aggregate could be created.'
                        : 'The bounded evidence run did not produce an accepted card.',
                warningCodes: evidenceBudgetExpired
                    ? [
                        'evidence_research_budget_expired',
                        ...(usedDeterministicFallback ? ['deterministic_evidence_fallback'] : []),
                    ]
                    : usedDeterministicFallback
                    ? ['deterministic_evidence_fallback']
                    : readOnlyEvidenceFallback && acceptedCardCount > 0
                    ? ['read_only_structure_review_bypassed']
                    : decision === 'pass'
                        ? []
                        : [`evidence_run_${run?.session.status ?? 'failed'}`],
                artifactRefs: [`research-run:${run?.session.runId ?? researchRunId}`],
                cardIds,
            });
        },

        'analysis.finalizeArtifacts': async context => {
            assertNotAborted(context.signal);
            const initialState = context.store.getState();
            const cards = initialState.analysisCards;
            if (cards.length === 0) {
                return createResult({
                    context,
                    phase: 'finalize_artifacts',
                    toolName: 'analysis.finalizeArtifacts',
                    decision: 'fail',
                    summary: 'No analysis cards are available to finalize.',
                    warningCodes: ['analysis_cards_unavailable'],
                });
            }
            const initialVersion = getCurrentAnalysisDatasetVersion(initialState);
            const initialCompletionGate = resolveAnalysisCompletionGate({
                cards,
                currentDatasetVersion: initialVersion,
                columnProfiles: initialState.columnProfiles,
            });
            if (initialCompletionGate.trustedBusinessCardIds.length === 0) {
                context.store.setState({
                    aiCoreAnalysisSummary: null,
                    finalSummary: null,
                    aiCoreAnalysisSummaryProvenance: null,
                    finalSummaryProvenance: null,
                });
                return createResult({
                    context,
                    phase: 'finalize_artifacts',
                    toolName: 'analysis.finalizeArtifacts',
                    decision: 'warn',
                    summary: 'Analysis cards remain available for review, but no trusted business conclusion is eligible for headline synthesis.',
                    warningCodes: ['no_verified_analysis_cards'],
                    cardIds: [],
                });
            }
            const summaryController = new AbortController();
            const forwardRuntimeAbort = () => summaryController.abort(context.signal.reason);
            context.signal.addEventListener('abort', forwardRuntimeAbort, { once: true });
            let budgetTimer: ReturnType<typeof setTimeout> | null = null;
            const budgetBoundary = new Promise<'timed_out' | 'aborted'>(resolve => {
                budgetTimer = setTimeout(() => {
                    summaryController.abort(new DOMException('Initial summary finalization budget expired.', 'TimeoutError'));
                    resolve('timed_out');
                }, INITIAL_SUMMARY_FINALIZATION_BUDGET_MS);
                context.signal.addEventListener('abort', () => resolve('aborted'), { once: true });
            });
            const summaryWork = bindings.generateSummaries(context.store, {
                signal: summaryController.signal,
            }).then(() => 'completed' as const);
            const summaryOutcome = await Promise.race([summaryWork, budgetBoundary]);
            if (budgetTimer) clearTimeout(budgetTimer);
            context.signal.removeEventListener('abort', forwardRuntimeAbort);
            if (summaryOutcome === 'aborted') assertNotAborted(context.signal);
            const state = context.store.getState();
            const version = getCurrentAnalysisDatasetVersion(state);
            const completionGate = resolveAnalysisCompletionGate({
                cards: state.analysisCards,
                currentDatasetVersion: version,
                columnProfiles: state.columnProfiles,
            });
            const verifiedCards = state.analysisCards.filter(card =>
                completionGate.trustedBusinessCardIds.includes(card.id));
            return createResult({
                context,
                phase: 'finalize_artifacts',
                toolName: 'analysis.finalizeArtifacts',
                decision: verifiedCards.length > 0 && summaryOutcome === 'completed' ? 'pass' : 'warn',
                summary: summaryOutcome === 'timed_out'
                    ? 'Analysis cards were finalized, but AI summary synthesis exceeded its time budget.'
                    : verifiedCards.length > 0
                    ? `Finalized ${verifiedCards.length} verified analysis card(s).`
                    : 'Artifacts were finalized with trust caveats.',
                warningCodes: summaryOutcome === 'timed_out'
                    ? ['summary_finalization_budget_expired']
                    : verifiedCards.length > 0
                    ? []
                    : ['no_verified_analysis_cards'],
                artifactRefs: [
                    ...(state.finalSummary ? ['report-summary:final'] : []),
                    ...(state.aiCoreAnalysisSummary ? ['report-summary:core'] : []),
                ],
                cardIds: verifiedCards.map(card => card.id),
            });
        },
    };
};
