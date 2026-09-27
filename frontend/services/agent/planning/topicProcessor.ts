import type { AppStore } from '../../../store/useAppStore';
import type {
    CsvData,
    DataAnalysisStep,
    DataAnalysisNextStepDecision,
    DataAnalysisStepStatus,
    DataAnalysisStepType,
    EvidenceHarnessContext,
    EvidenceLoopState,
    EvidenceValueGateResult,
    RuntimeSemanticUnderstanding,
} from '../../../types';
import { emitAgentEvent } from '../monitoring/agentMonitor';
import {
    buildEvidenceResultSummary,
    executeEvidenceQuery,
    executePresentationPlanAndCreateCard,
} from '../execution/sqlCardExecutor';
import { buildDatasetContext } from '../contextBuilder';
import { evaluateEvidenceValue, buildEvidenceSignature, buildPlanOnlySemanticSignature, type ExistingAcceptedEvidence } from '../evidenceValueGate';
import { generateEvidenceQueryPlanWithRetry, generateEvidenceQueryPlanStepped } from './planGenerator';
import { buildAnalysisIntentBrief } from '../analysisBrief';
import { buildRuntimeSemanticUnderstanding } from '../runtimeSemanticUnderstanding';
import { SqlAutoAnalysisError, isSqlAutoAnalysisError } from './planGenerator';
import { buildDeterministicSqlPresentationPlan } from './sqlPresentationPlanner';
import type { AnalysisDatasetContext, PlannerSemanticIntent } from './planGenerator';
import { vectorStore } from '../../vectorStore';
import { recordRuntimeEvent } from '../runtime/runtimeHelpers';
import { detectTemporalGrainCollapse, buildTemporalPlanningGuardrail, normalizeTemporalTopic } from './temporalGrainGuards';
import { MAX_EXECUTION_ATTEMPTS, RETRYABLE_EXECUTION_CODES, SOFT_SKIP_CODES, getExecutionRetryLimit, buildExecutionReplanReasonCode, buildTypedExecutionReasonCode, buildPlannerFeedbackForExecutionError, classifyTopicFailure } from './topicRetryStrategy';
import { buildLearningHintsFromHistory } from './topicLearningHints';
import { isRuntimeAbortError, throwIfAborted } from '../runtime/runtimeAbort';

type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

interface DuckDbAnalysisBinding {
    tableName: string;
    loadVersion: string;
}

type TopicProcessingResult =
    | {
        status: 'completed';
        cardCreated: boolean;
        tableFirst: boolean;
        accepted: boolean;
        valueDecision: EvidenceValueGateResult['decision'];
        evidenceLoopState: EvidenceLoopState | null;
        acceptedEvidence?: ExistingAcceptedEvidence;
        sourceStepIds: string[];
        cardId?: string | null;
        rejectionReason?: string | null;
        valueReasonCodes?: string[];
        evidenceDetail?: string | null;
      }
    | { status: 'aborted' };

export interface TopicProcessingStepRecord {
    type: DataAnalysisStepType;
    status: DataAnalysisStepStatus;
    inputSummary: string;
    outputSummary: string;
    inputSummaryI18n?: DataAnalysisStep['inputSummaryI18n'];
    outputSummaryI18n?: DataAnalysisStep['outputSummaryI18n'];
    labelI18n?: DataAnalysisStep['labelI18n'];
    whyI18n?: DataAnalysisStep['whyI18n'];
    decision?: DataAnalysisNextStepDecision | null;
    hypothesisId?: string | null;
    queryRef?: string | null;
    reasonCodes?: string[];
    querySignature?: string | null;
    semanticSignature?: string | null;
    queryTitle?: string | null;
    queryMode?: 'aggregate' | 'rowset';
}

interface TopicProcessingOptions {
    datasetContext?: AnalysisDatasetContext;
    semanticUnderstanding?: RuntimeSemanticUnderstanding;
    hypothesisId?: string | null;
    analysisSessionRunId?: string | null;
    explorationContext?: string | null;
    harnessSummary?: string | null;
    harnessContext?: EvidenceHarnessContext | null;
    planningIntent?: PlannerSemanticIntent | null;
    recordAnalysisStep?: (record: TopicProcessingStepRecord) => string;
    /** PERF-201 strategy D: pre-generated evidence plan from parallel batch. */
    preGeneratedPlan?: Awaited<ReturnType<typeof generateEvidenceQueryPlanStepped>>;
    abortSignal?: AbortSignal;
}

export interface TopicProcessingFailure {
    topic: string;
    code: SqlAutoAnalysisError['code'];
    message: string;
}

export interface TopicProcessingSummary {
    completedTopics: number;
    cardTopics: number;
    tableFirstTopics: number;
    tableOnlyTopics: number;
    rejectedTopics: number;
    dedupedTopics: number;
    failedTopics: TopicProcessingFailure[];
    hadWarnings: boolean;
}

const LOG_PREFIX = '[TopicProcessor]';


export const processSingleTopic = async (
    topic: string,
    data: CsvData,
    store: StoreApi,
    binding: DuckDbAnalysisBinding,
    existingAcceptedOutputs: ExistingAcceptedEvidence[] = [],
    options?: TopicProcessingOptions,
) : Promise<TopicProcessingResult> => {
    const { getState } = store;
    if (options?.abortSignal?.aborted) {
        return { status: 'aborted' };
    }
    const _t0 = performance.now();
    const _elapsed = (label: string) => `[Perf:Topic] "${topic.slice(0, 30)}" ${label}: ${Math.round(performance.now() - _t0)}ms`;
    if (getState().isChangingGoal) {
        return { status: 'aborted' };
    }

    const sourceStepIds: string[] = [];
    const recordStep = (record: TopicProcessingStepRecord) => {
        const stepId = options?.recordAnalysisStep?.(record);
        if (stepId) {
            sourceStepIds.push(stepId);
        }
        return stepId;
    };

    emitAgentEvent(store, {
        phase: 'planning',
        step: 'plan_topic',
        status: 'in_progress',
        message: `Planning SQL-first analysis for topic "${topic}".`,
        detail: { analysisEngine: 'duckdb', duckDbRequired: true },
    });

    try {
        const learningHints = buildLearningHintsFromHistory(
            getState().agentMemoryHistory,
            options?.semanticUnderstanding?.blockedDimensions,
        );
        let plannerFeedback: string | undefined;
        let completedResult: TopicProcessingResult | null = null;
        const datasetContext = options?.datasetContext ?? buildDatasetContext(
            data,
            getState().columnProfiles,
            getState().reportContextResolution,
            getState().datasetSemanticSnapshot,
            getState().semanticDatasetVersion,
            getState().dataPreparationPlan,
            getState().rawCsvData ?? data,
        );
        const semanticUnderstanding = options?.semanticUnderstanding ?? buildRuntimeSemanticUnderstanding({
            columns: getState().columnProfiles,
            analysisBrief: buildAnalysisIntentBrief({
                columns: getState().columnProfiles,
                csvData: data,
                dataPreparationPlan: getState().dataPreparationPlan ?? null,
                datasetSemanticSnapshot: getState().datasetSemanticSnapshot,
                semanticDatasetVersion: getState().semanticDatasetVersion,
            }),
            reportContextResolution: getState().reportContextResolution,
            datasetSemanticSnapshot: getState().datasetSemanticSnapshot,
        });
        const temporalPlanningGuardrail = buildTemporalPlanningGuardrail(
            data,
            semanticUnderstanding,
            getState().columnProfiles,
        );
        const temporalTopicNormalization = normalizeTemporalTopic(
            topic,
            data,
            semanticUnderstanding,
            getState().columnProfiles,
        );
        const planningTopic = temporalTopicNormalization?.topic ?? topic;
        if (temporalTopicNormalization) {
            recordStep({
                type: 'refine_hypothesis',
                status: 'succeeded',
                inputSummary: `Normalize temporal topic "${topic}" to preserve full-date grain.`,
                inputSummaryI18n: {
                    key: 'analysis_trace_refine_hypothesis_input',
                    vars: { topic },
                },
                outputSummary: `Rewrote temporal topic to "${planningTopic}" so "${temporalTopicNormalization.column}" keeps full-date grain.`,
                outputSummaryI18n: {
                    key: 'analysis_trace_refine_hypothesis_output_feedback',
                    vars: { message: `Rewrote temporal topic to preserve "${temporalTopicNormalization.column}" full-date grain.` },
                },
                decision: 'plan_probe_query',
                hypothesisId: options?.hypothesisId ?? null,
                reasonCodes: ['temporal_topic_normalized'],
            });
        }
        if (!datasetContext.analysisSteering && options?.harnessContext) {
            const currentColNames = getState().columnProfiles.map(p => p.name);
            const harness = options.harnessContext;
            const detailCol = harness.detailRowColumn;
            // Reconcile detailRowColumn: the harness may have run on a dataset version
            // that had "RowClass" but the current clean dataset only has "RowRole" (or vice
            // versa). If the detected column no longer exists, fall back to the closest
            // structural equivalent so the AI does not generate SQL with a missing column.
            if (detailCol && !currentColNames.some(c => c.toLowerCase() === detailCol.toLowerCase())) {
                const fallbackName = currentColNames.find(c => /^(rowrole|resolvedrowrole|rowclass)$/i.test(c)) ?? null;
                datasetContext.analysisSteering = {
                    ...harness,
                    detailRowColumn: fallbackName,
                    detailRowValue: fallbackName ? harness.detailRowValue : null,
                    detailRowFilter: fallbackName && harness.detailRowValue
                        ? { column: fallbackName, value: harness.detailRowValue }
                        : null,
                };
            } else {
                datasetContext.analysisSteering = harness;
            }
        }
        let escalatedToFull = false;
        const emitPlannerEscalation = (reason: string, attempt: number, detail?: Record<string, unknown>) => {
            if (escalatedToFull) {
                return;
            }
            escalatedToFull = true;
            recordRuntimeEvent(store, {
                type: 'planner_escalated_to_full',
                stage: 'executing',
                message: `Escalated planner to full mode for topic "${topic}" after ${reason}.`,
                detail: {
                    topic,
                    attempt,
                    reason,
                    ...(detail ?? {}),
                },
            });
        };

        const mergePlannerFeedback = (feedback?: string) =>
            [temporalPlanningGuardrail, feedback]
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                .join('\n\n') || undefined;

        console.log(_elapsed('context_built'));
        for (let attempt = 1; attempt <= MAX_EXECUTION_ATTEMPTS; attempt += 1) {
            throwIfAborted(options?.abortSignal);
            const shouldUseSteppedPlanner = attempt === 1 && !escalatedToFull;
            let evidencePlan: Awaited<ReturnType<typeof generateEvidenceQueryPlanStepped>>;
            if (shouldUseSteppedPlanner) {
                // PERF-201 strategy D: use pre-generated plan from parallel batch when available.
                if (options?.preGeneratedPlan && attempt === 1 && !plannerFeedback) {
                    evidencePlan = options.preGeneratedPlan;
                } else try {
                    evidencePlan = await generateEvidenceQueryPlanStepped(
                        planningTopic,
                        getState().columnProfiles,
                        getState().settings,
                        options?.harnessSummary,
                        datasetContext,
                        options?.planningIntent,
                        mergePlannerFeedback(plannerFeedback),
                        { abortSignal: options?.abortSignal },
                    );
                } catch (error) {
                    emitPlannerEscalation(
                        isSqlAutoAnalysisError(error) ? error.code : 'stepped_planner_failure',
                        attempt,
                        { plannerFeedback: plannerFeedback ?? null },
                    );
                    evidencePlan = await generateEvidenceQueryPlanWithRetry(
                        planningTopic,
                        getState().columnProfiles,
                        getState().settings,
                        learningHints,
                        getState(),
                        mergePlannerFeedback(plannerFeedback),
                        datasetContext,
                        data.data,
                        options?.explorationContext,
                        options?.harnessSummary,
                        options?.planningIntent,
                        { abortSignal: options?.abortSignal },
                    );
                }
            } else {
                evidencePlan = await generateEvidenceQueryPlanWithRetry(
                    planningTopic,
                    getState().columnProfiles,
                    getState().settings,
                    learningHints,
                    getState(),
                    mergePlannerFeedback(plannerFeedback),
                    datasetContext,
                    data.data,
                    options?.explorationContext,
                    options?.harnessSummary,
                    options?.planningIntent,
                    { abortSignal: options?.abortSignal },
                );
            }
            console.log(_elapsed('plan_generated'));
            // PERF-307: Yield after AI plan generation callback — break the
            // continuous chain between plan JSON parse and dedup/SQL execution.
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            recordStep({
                type: 'plan_probe_query',
                status: 'succeeded',
                inputSummary: `Plan ${attempt} evidence query for topic "${topic}".`,
                inputSummaryI18n: {
                    key: 'analysis_trace_plan_probe_query_input',
                    vars: {
                        topic,
                        attempt,
                    },
                },
                outputSummary: `Generated ${evidencePlan.queryMode === 'aggregate' ? 'aggregate' : 'detail'} query plan "${evidencePlan.title}".`,
                outputSummaryI18n: {
                    key: 'analysis_trace_plan_probe_query_output',
                    vars: {
                        queryMode: evidencePlan.queryMode === 'aggregate' ? 'aggregate' : 'detail',
                        title: evidencePlan.title,
                    },
                },
                decision: 'execute_probe_query',
                hypothesisId: options?.hypothesisId ?? null,
                queryRef: null,
            });

            if (getState().isChangingGoal) {
                return { status: 'aborted' };
            }

            // Early guard: if the planner produced an aggregate groupBy that is a
            // blocked dimension (and not a promoted business grain), retry with feedback
            // instead of executing the query.  Only reject after all attempts are exhausted.
            if (evidencePlan.queryMode === 'aggregate' && semanticUnderstanding) {
                const planGroupBys = evidencePlan.query.groupBy ?? [];
                const blockedDims = semanticUnderstanding.blockedDimensions ?? [];
                const businessGrains = semanticUnderstanding.businessGrains ?? [];
                const blockedGroupBy = planGroupBys.find(
                    col => blockedDims.includes(col) && !businessGrains.includes(col),
                );
                if (blockedGroupBy) {
                    if (attempt < MAX_EXECUTION_ATTEMPTS) {
                        emitPlannerEscalation('blocked_dimension_replan', attempt, { blockedGroupBy });
                        // Retry: give the planner explicit feedback to avoid the blocked column.
                        // Include dimension columns from the dataset context as fallback suggestions
                        // so the planner doesn't pick meaningless columns like SourceRowIndex.
                        // Use promoted business grains if available, otherwise fall back to
                        // non-blocked dimension columns from the dataset context.
                        const allowedDims = businessGrains.length > 0
                            ? businessGrains
                            : (options?.datasetContext?.dimensionColumns ?? []).filter(d => !blockedDims.includes(d));
                        // Exclude the detail-row column from the "do not use" list — it is blocked
                        // for groupBy but may be useful as a WHERE filter (e.g. WHERE RowRole='fact').
                        // Use the actual detected column name from steering (not the hardcoded "RowClass").
                        const steeringDetailCol = datasetContext.analysisSteering?.detailRowColumn ?? null;
                        const steeringDetailVal = datasetContext.analysisSteering?.detailRowValue ?? 'fact';
                        const isDetailRowDim = (col: string) =>
                            steeringDetailCol
                                ? col.toLowerCase() === steeringDetailCol.toLowerCase()
                                : /^rowclass$/i.test(col);
                        const blockedForGroupByOnly = blockedDims.filter(d => !isDetailRowDim(d));
                        const detailRowNote = steeringDetailCol
                            ? `Note: "${steeringDetailCol}" can still be used in a WHERE clause (e.g. WHERE "${steeringDetailCol}"='${steeringDetailVal}') — it is only blocked as a groupBy.`
                            : 'Note: RowClass can still be used in a WHERE clause (e.g. WHERE RowClass=\'fact\') — it is only blocked as a groupBy.';
                        plannerFeedback = `The previous query plan grouped by "${blockedGroupBy}", which is a blocked/metadata dimension and must not be used as a groupBy column. Rewrite the plan for "${topic}" using only these allowed groupBy dimensions: ${allowedDims.join(', ') || 'none identified'}. Do NOT use any of these as groupBy: ${blockedForGroupByOnly.join(', ')}. Do NOT use row index or row number columns as groupBy. ${detailRowNote}`;
                        recordStep({
                            type: 'refine_hypothesis',
                            status: 'succeeded',
                            inputSummary: `Evidence plan for "${topic}" used blocked dimension "${blockedGroupBy}"; retrying with corrected guidance.`,
                            inputSummaryI18n: {
                                key: 'analysis_trace_refine_hypothesis_input',
                                vars: { topic },
                            },
                            outputSummary: `Blocked dimension "${blockedGroupBy}" detected in groupBy — replanning with explicit dimension constraints.`,
                            outputSummaryI18n: {
                                key: 'analysis_trace_refine_hypothesis_output_feedback',
                                vars: { message: `Blocked dimension "${blockedGroupBy}" — replanning.` },
                            },
                            decision: 'plan_probe_query',
                            hypothesisId: options?.hypothesisId ?? null,
                            reasonCodes: ['blocked_dimension_replan', 'blocked_dimension'],
                        });
                        continue;
                    }
                    // Final attempt still used a blocked dimension — reject.
                    recordStep({
                        type: 'evaluate_evidence',
                        status: 'rejected',
                        inputSummary: `Assess whether evidence query "${evidencePlan.title}" is worth presenting.`,
                        inputSummaryI18n: {
                            key: 'analysis_trace_evaluate_evidence_input',
                            vars: { title: evidencePlan.title },
                        },
                        outputSummary: `Evidence gate decision: reject (groupBy "${blockedGroupBy}" is a blocked dimension after ${attempt} attempts).`,
                        outputSummaryI18n: {
                            key: 'analysis_trace_evaluate_evidence_output',
                            vars: { decision: 'reject' },
                        },
                        decision: 'reject_hypothesis',
                        hypothesisId: options?.hypothesisId ?? null,
                        reasonCodes: ['blocked_dimension'],
                    });
                    completedResult = {
                        status: 'completed',
                        cardCreated: false,
                        tableFirst: false,
                        accepted: false,
                        valueDecision: 'reject',
                        evidenceLoopState: null,
                        sourceStepIds,
                        rejectionReason: `groupBy "${blockedGroupBy}" is a blocked dimension`,
                    };
                    break;
                }
            }

            // Pre-execution duplicate check: reject plans whose query or semantic
            // signature already matches an accepted output, saving the cost of SQL
            // execution + AI evaluation that would be wasted on a duplicate.
            {
                const preExecQuerySig = buildEvidenceSignature(evidencePlan);
                    const preExecSemanticSig = buildPlanOnlySemanticSignature(evidencePlan, semanticUnderstanding);
                const isDuplicateQuery = existingAcceptedOutputs.some(o => o.querySignature === preExecQuerySig);
                const isDuplicateSemantic = existingAcceptedOutputs.some(o => o.semanticSignature === preExecSemanticSig);
                if (isDuplicateQuery || isDuplicateSemantic) {
                    const dupReasonCodes: string[] = [];
                    if (isDuplicateQuery) dupReasonCodes.push('duplicate_query');
                    if (isDuplicateSemantic) dupReasonCodes.push('duplicate_semantic');
                    recordStep({
                        type: 'evaluate_evidence',
                        status: 'rejected',
                        inputSummary: `Pre-execution duplicate check for "${evidencePlan.title}".`,
                        inputSummaryI18n: {
                            key: 'analysis_trace_evaluate_evidence_input',
                            vars: { title: evidencePlan.title },
                        },
                        outputSummary: `Plan rejected before execution: ${dupReasonCodes.join(', ')}.`,
                        outputSummaryI18n: {
                            key: 'analysis_trace_evaluate_evidence_output',
                            vars: { decision: 'reject' },
                        },
                        decision: 'reject_hypothesis',
                        hypothesisId: options?.hypothesisId ?? null,
                        reasonCodes: dupReasonCodes,
                        querySignature: preExecQuerySig,
                        semanticSignature: preExecSemanticSig,
                        queryTitle: evidencePlan.title,
                        queryMode: evidencePlan.queryMode,
                    });
                    completedResult = {
                        status: 'completed',
                        cardCreated: false,
                        tableFirst: false,
                        accepted: false,
                        valueDecision: 'reject',
                        evidenceLoopState: null,
                        sourceStepIds,
                        rejectionReason: `pre-execution duplicate: ${dupReasonCodes.join(', ')}`,
                    };
                    break;
                }

                // Semantic fuzzy dedup: catch near-duplicate topics that use different
                // phrasing but answer the same question (e.g. "Revenue by Region" vs
                // "Total Sales by Area"). Two complementary signals are checked:
                //
                // 1. Word-overlap Jaccard against in-session accepted titles (sync, no deps).
                //    Threshold 0.6 catches rephrasing like "by Region" ↔ "across Regions".
                //
                // 2. Embedding cosine similarity via vectorStore (async, best-effort ML).
                //    Threshold 0.85 catches semantically equivalent but lexically different
                //    titles. Falls back gracefully if the model is not yet loaded.
                const titleTokens = (t: string) => new Set(t.toLowerCase().match(/\w+/g) ?? []);
                const jaccardScore = (a: Set<string>, b: Set<string>): number => {
                    if (a.size === 0 && b.size === 0) return 1;
                    const intersection = [...a].filter(w => b.has(w)).length;
                    const union = new Set([...a, ...b]).size;
                    return union === 0 ? 0 : intersection / union;
                };
                const newTitleTokens = titleTokens(evidencePlan.title);
                const highJaccardMatch = existingAcceptedOutputs.find(o => {
                    const score = jaccardScore(newTitleTokens, titleTokens(o.title));
                    return score >= 0.6;
                });

                console.log(_elapsed('jaccard_done'));
                // PERF-302: Skip vectorStore semantic dedup during hypothesis loop.
                // Jaccard (threshold 0.6) catches >90% of duplicates. vectorStore
                // triggers ONNX embedding (~5s/call) adding ~20s across 4 hypotheses.
                const highEmbeddingMatch: { title: string } | null = null;
                console.log(_elapsed('vectorStore_done'));

                if (highJaccardMatch ?? highEmbeddingMatch) {
                    const matchedTitle = highJaccardMatch?.title ?? highEmbeddingMatch?.title ?? '';
                    recordStep({
                        type: 'evaluate_evidence',
                        status: 'rejected',
                        inputSummary: `Semantic fuzzy duplicate check for "${evidencePlan.title}".`,
                        inputSummaryI18n: {
                            key: 'analysis_trace_evaluate_evidence_input',
                            vars: { title: evidencePlan.title },
                        },
                        outputSummary: `Plan rejected: semantically similar to "${matchedTitle}".`,
                        outputSummaryI18n: {
                            key: 'analysis_trace_evaluate_evidence_output',
                            vars: { decision: 'reject' },
                        },
                        decision: 'reject_hypothesis',
                        hypothesisId: options?.hypothesisId ?? null,
                        reasonCodes: ['duplicate_semantic_fuzzy'],
                        querySignature: preExecQuerySig,
                        semanticSignature: preExecSemanticSig,
                        queryTitle: evidencePlan.title,
                        queryMode: evidencePlan.queryMode,
                    });
                    completedResult = {
                        status: 'completed',
                        cardCreated: false,
                        tableFirst: false,
                        accepted: false,
                        valueDecision: 'reject',
                        evidenceLoopState: null,
                        sourceStepIds,
                        rejectionReason: `pre-execution semantic fuzzy duplicate of "${matchedTitle}"`,
                    };
                    break;
                }
            }

            try {
                console.log(_elapsed('dedup_done→executing_sql'));
                const evidenceExecution = await executeEvidenceQuery(evidencePlan, store, binding, {
                    topic,
                    dataset: data,
                    suppressQueryStateUpdates: true,
                    abortSignal: options?.abortSignal,
                });
                console.log(_elapsed('sql_executed'));
                // PERF-307: Yield after DuckDB query callback — break the chain
                // between SQL result processing and value gate evaluation.
                await new Promise<void>(resolve => setTimeout(resolve, 0));
                recordStep({
                    type: 'execute_probe_query',
                    status: 'succeeded',
                    inputSummary: `Execute evidence query "${evidencePlan.title}".`,
                    inputSummaryI18n: {
                        key: 'analysis_trace_execute_probe_query_input',
                        vars: {
                            title: evidencePlan.title,
                        },
                    },
                    outputSummary: `Query returned ${evidenceExecution.result.rows.length} rows and ${evidenceExecution.result.selectedColumns?.length ?? 0} columns.`,
                    outputSummaryI18n: {
                        key: 'analysis_trace_execute_probe_query_output',
                        vars: {
                            rows: evidenceExecution.result.rows.length,
                            columns: evidenceExecution.result.selectedColumns?.length ?? 0,
                        },
                    },
                    decision: 'evaluate_evidence',
                    hypothesisId: options?.hypothesisId ?? null,
                    queryRef: evidenceExecution.execution.sqlPreview ?? null,
                    queryTitle: evidencePlan.title,
                    queryMode: evidencePlan.queryMode,
                });
                const evidenceSummary = buildEvidenceResultSummary(
                    evidencePlan,
                    evidenceExecution.result,
                    getState().columnProfiles,
                );
                const temporalCollapse = detectTemporalGrainCollapse(
                    data,
                    evidencePlan.query.groupBy ?? [],
                    semanticUnderstanding,
                    evidenceSummary,
                    getState().columnProfiles,
                );
                if (temporalCollapse) {
                    const temporalFeedback = `The previous SQL evidence query collapsed full dates in "${temporalCollapse.column}" into day-of-month values like "${temporalCollapse.previewExample}". Rewrite the plan for "${topic}" so "${temporalCollapse.column}" preserves full-date grain such as "${temporalCollapse.sourceExample}" instead of extracting only the day number.`;
                    if (attempt < MAX_EXECUTION_ATTEMPTS) {
                        emitPlannerEscalation('temporal_grain_collapse', attempt, {
                            column: temporalCollapse.column,
                            previewExample: temporalCollapse.previewExample,
                            sourceExample: temporalCollapse.sourceExample,
                        });
                        plannerFeedback = temporalFeedback;
                        recordStep({
                            type: 'refine_hypothesis',
                            status: 'succeeded',
                            inputSummary: `Evidence for "${topic}" collapsed "${temporalCollapse.column}" to day-of-month values; retrying with full-date guidance.`,
                            inputSummaryI18n: {
                                key: 'analysis_trace_refine_hypothesis_input',
                                vars: { topic },
                            },
                            outputSummary: `Detected temporal grain collapse in "${temporalCollapse.column}" — replanning with full-date preservation guidance.`,
                            outputSummaryI18n: {
                                key: 'analysis_trace_refine_hypothesis_output_feedback',
                                vars: { message: `Temporal grain collapse in "${temporalCollapse.column}" — replanning.` },
                            },
                            decision: 'plan_probe_query',
                            hypothesisId: options?.hypothesisId ?? null,
                            reasonCodes: ['replan_after_temporal_grain_collapse', 'temporal_grain_collapse'],
                            queryTitle: evidencePlan.title,
                            queryMode: evidencePlan.queryMode,
                        });
                        continue;
                    }
                    throw new SqlAutoAnalysisError(
                        'planning_invalid',
                        `Evidence query "${evidencePlan.title}" collapsed "${temporalCollapse.column}" to day-of-month values.`,
                        {
                            topic,
                            column: temporalCollapse.column,
                            previewExample: temporalCollapse.previewExample,
                            sourceExample: temporalCollapse.sourceExample,
                        },
                    );
                }
                // AI evidence evaluation — runs in parallel with nothing, but
                // gracefully falls back to deterministic if the call fails.
                const harnessContext = options?.harnessContext ?? null;
                // PERF-201 Step 3: deterministic safety floor + quality gate is sufficient.
                // Skipping AI evidence evaluation saves 5 calls + ~1000 tokens/run.
                const aiEvaluation = null;
                const valueGate = evaluateEvidenceValue({
                    semanticUnderstanding,
                    evidencePlan,
                    evidenceSummary,
                    existingAcceptedOutputs,
                    aiEvaluation,
                    harnessContext,
                });
                console.log(_elapsed(`value_gate=${valueGate.decision}`));
                // PERF-307: Yield after value gate — break the chain between
                // evaluation logic and card creation (which includes setState 2.2s).
                await new Promise<void>(resolve => setTimeout(resolve, 0));
                recordStep({
                    type: 'evaluate_evidence',
                    status: valueGate.decision === 'reject' ? 'rejected' : 'succeeded',
                    inputSummary: `Assess whether evidence query "${evidencePlan.title}" is worth presenting.`,
                    inputSummaryI18n: {
                        key: 'analysis_trace_evaluate_evidence_input',
                        vars: {
                            title: evidencePlan.title,
                        },
                    },
                    outputSummary: `Evidence gate decision: ${valueGate.decision}.`,
                    outputSummaryI18n: {
                        key: 'analysis_trace_evaluate_evidence_output',
                        vars: {
                            decision: valueGate.decision,
                        },
                    },
                    decision: valueGate.decision === 'reject'
                        ? 'reject_hypothesis'
                        : 'plan_presentation',
                    hypothesisId: options?.hypothesisId ?? null,
                    reasonCodes: valueGate.reasonCodes,
                    querySignature: valueGate.querySignature,
                    semanticSignature: valueGate.semanticSignature,
                    queryRef: evidenceExecution.execution.sqlPreview ?? null,
                    queryTitle: evidencePlan.title,
                    queryMode: evidencePlan.queryMode,
                });
                const evidenceLoopState: EvidenceLoopState = {
                    queryPlan: evidencePlan,
                    resultSummary: evidenceSummary,
                    semanticRisk: valueGate.semanticRisk,
                    nextBestAction: valueGate.decision === 'pass'
                        ? 'promote_to_presentation'
                        : valueGate.decision === 'table_only'
                            ? 'accept_table'
                            : 'stop_low_value',
                };
                if (valueGate.decision === 'reject') {
                    completedResult = {
                        status: 'completed',
                        cardCreated: false,
                        tableFirst: false,
                        accepted: false,
                        valueDecision: valueGate.decision,
                        evidenceLoopState,
                        sourceStepIds,
                        rejectionReason: valueGate.detail,
                        valueReasonCodes: valueGate.reasonCodes,
                        evidenceDetail: valueGate.detail,
                    };
                    break;
                }
                // PERF-201 Step 4: deterministic presentation planner is sufficient.
                // Skipping AI presentation planning saves 4-5 calls + ~900 tokens/run.
                const presentationPlan = buildDeterministicSqlPresentationPlan(
                    evidencePlan,
                    evidenceSummary,
                    getState().columnProfiles,
                    {
                        semanticUnderstanding,
                        valueGate,
                        harnessContext,
                    },
                );
                console.log(_elapsed(`presentation=${presentationPlan.presentationMode}`));
                recordStep({
                    type: 'plan_presentation',
                    status: presentationPlan.presentationMode === 'hidden'
                        ? 'rejected'
                        : 'succeeded',
                    inputSummary: `Decide presentation mode for topic "${topic}" based on evidence shape.`,
                    inputSummaryI18n: {
                        key: 'analysis_trace_plan_presentation_input',
                        vars: {
                            topic,
                        },
                    },
                    outputSummary: `Presentation mode = ${presentationPlan.presentationMode}${presentationPlan.chartType ? `, chart = ${presentationPlan.chartType}` : ''}.`,
                    outputSummaryI18n: {
                        key: 'analysis_trace_plan_presentation_output',
                        vars: {
                            presentationMode: presentationPlan.presentationMode,
                            chartTypeSuffix: presentationPlan.chartType ? `, chart = ${presentationPlan.chartType}` : '',
                        },
                    },
                    decision: presentationPlan.presentationMode === 'hidden'
                        ? 'reject_hypothesis'
                        : 'emit_standard_card',
                    hypothesisId: options?.hypothesisId ?? null,
                    reasonCodes: valueGate.reasonCodes,
                });
                console.log(_elapsed('creating_card→executePresentationPlan'));
                const presentation = await executePresentationPlanAndCreateCard(
                    evidencePlan,
                    presentationPlan,
                    store,
                    evidenceSummary,
                    evidenceExecution,
                    {
                        topic: planningTopic,
                        valueGate,
                        sourceStepIds,
                        analysisSessionRunId: options?.analysisSessionRunId ?? null,
                        existingAcceptedOutputs,
                    },
                );
                console.log(_elapsed('card_created'));
                if (presentation.card) {
                    recordStep({
                        type: 'emit_standard_card',
                        status: 'succeeded',
                        inputSummary: `Generate standard card for topic "${topic}".`,
                        inputSummaryI18n: {
                            key: 'analysis_trace_emit_standard_card_input',
                            vars: {
                                topic,
                            },
                        },
                        outputSummary: `Created card "${presentation.card.plan?.title ?? presentationPlan.title}".`,
                        outputSummaryI18n: {
                            key: 'analysis_trace_emit_standard_card_output',
                            vars: {
                                title: presentation.card.plan?.title ?? presentationPlan.title,
                            },
                        },
                        decision: 'dedupe_candidate',
                        hypothesisId: options?.hypothesisId ?? null,
                    });
                }
                completedResult = {
                    status: 'completed',
                    cardCreated: Boolean(presentation.card),
                    tableFirst: presentation.presentationPlan.presentationMode !== 'chart',
                    accepted: Boolean(presentation.card),
                    valueDecision: valueGate.decision,
                    evidenceLoopState,
                    sourceStepIds,
                    cardId: presentation.card?.id ?? null,
                    acceptedEvidence: {
                        querySignature: valueGate.querySignature,
                        semanticSignature: valueGate.semanticSignature,
                        decision: valueGate.decision,
                        title: evidencePlan.title,
                    },
                    valueReasonCodes: valueGate.reasonCodes,
                    evidenceDetail: valueGate.detail,
                };
                break;
            } catch (error) {
                if (!(error instanceof SqlAutoAnalysisError) || !RETRYABLE_EXECUTION_CODES.has(error.code)) {
                    throw error;
                }
                const retryLimit = getExecutionRetryLimit(error.code);
                if (attempt >= retryLimit) {
                    throw error;
                }
                emitPlannerEscalation(error.code, attempt, { retryFeedback: plannerFeedback ?? null });
                plannerFeedback = buildPlannerFeedbackForExecutionError(topic, error);
                recordStep({
                    type: 'refine_hypothesis',
                    status: 'succeeded',
                    inputSummary: `First-pass evidence for topic "${topic}" was weak; applying controlled refinement.`,
                    inputSummaryI18n: {
                        key: 'analysis_trace_refine_hypothesis_input',
                        vars: {
                            topic,
                        },
                    },
                    outputSummary: plannerFeedback ?? `Retrying after ${error.code}.`,
                    outputSummaryI18n: plannerFeedback
                        ? {
                            key: 'analysis_trace_refine_hypothesis_output_feedback',
                            vars: {
                                message: plannerFeedback,
                            },
                        }
                        : {
                            key: 'analysis_trace_refine_hypothesis_output_retry',
                            vars: {
                                errorCode: error.code,
                            },
                        },
                    decision: 'plan_probe_query',
                    hypothesisId: options?.hypothesisId ?? null,
                    reasonCodes: [...new Set([buildExecutionReplanReasonCode(error.code), buildTypedExecutionReasonCode(error.code), error.code])],
                });
            }
        }

        if (!completedResult || completedResult.status !== 'completed') {
            throw new SqlAutoAnalysisError('planning_invalid', `SQL-first planning did not produce a usable plan for "${topic}".`, { topic });
        }

        emitAgentEvent(store, {
            phase: 'planning',
            step: 'plan_topic',
            status: 'done',
            message: `Completed SQL-first topic "${topic}".`,
            detail: {
                analysisEngine: 'duckdb',
                duckDbRequired: true,
                cardCreated: completedResult.cardCreated,
                tableFirst: completedResult.tableFirst,
                valueDecision: completedResult.valueDecision,
            },
        });
        return completedResult;
    } catch (error) {
        if (isRuntimeAbortError(error, options?.abortSignal)) {
            return { status: 'aborted' };
        }
        const failure = classifyTopicFailure(error);
        const isSoftSkip = SOFT_SKIP_CODES.has(failure.code);
        console[isSoftSkip ? 'warn' : 'error'](`${LOG_PREFIX} Topic "${topic}" ${isSoftSkip ? 'skipped' : 'failed'}.`, error);
        emitAgentEvent(store, {
            phase: 'planning',
            step: 'plan_topic',
            status: isSoftSkip ? 'done' : 'error',
            message: isSoftSkip
                ? `SQL-first planning skipped topic "${topic}": ${failure.message}`
                : `SQL-first planning failed for topic "${topic}": ${failure.message}`,
            detail: {
                failureStage: failure.code,
                outcome: isSoftSkip ? 'skipped_topic' : 'failed_topic',
                analysisEngine: 'duckdb',
                duckDbRequired: true,
            },
        });
        recordStep({
            type: 'stop_session',
            status: isSoftSkip ? 'skipped' : 'failed',
            inputSummary: `Topic "${topic}" could not complete evidence analysis.`,
            inputSummaryI18n: {
                key: 'analysis_trace_topic_failed_input',
                vars: {
                    topic,
                },
            },
            outputSummary: failure.message,
            outputSummaryI18n: {
                key: 'analysis_trace_topic_failed_output',
                vars: {
                    reason: failure.message,
                },
            },
            decision: 'stop_session',
            hypothesisId: options?.hypothesisId ?? null,
            reasonCodes: [failure.code],
        });
        throw error instanceof SqlAutoAnalysisError
            ? error
            : new SqlAutoAnalysisError(failure.code, failure.message, { topic, rowCount: data.data.length });
    }
};

export const processTopicsInParallel = async (
    topics: string[],
    data: CsvData,
    store: StoreApi,
    binding: DuckDbAnalysisBinding,
) : Promise<TopicProcessingSummary> => {
    const { getState, setState } = store;
    const failedTopics: TopicProcessingFailure[] = [];
    let completedTopics = 0;
    let cardTopics = 0;
    let tableFirstTopics = 0;
    let tableOnlyTopics = 0;
    let rejectedTopics = 0;
    let dedupedTopics = 0;
    const acceptedOutputs: ExistingAcceptedEvidence[] = [];

    for (let index = 0; index < topics.length; index += 1) {
        try {
            const result = await processSingleTopic(topics[index], data, store, binding, acceptedOutputs);
            if (result.status === 'completed') {
                completedTopics += 1;
                if (!result.accepted) {
                    rejectedTopics += 1;
                }
                if (result.cardCreated) {
                    cardTopics += 1;
                }
                if (result.tableFirst) {
                    tableFirstTopics += 1;
                }
                if (result.valueDecision === 'table_only') {
                    tableOnlyTopics += 1;
                }
                if (result.acceptedEvidence) {
                    if (acceptedOutputs.some(output =>
                        output.querySignature === result.acceptedEvidence!.querySignature
                        || output.semanticSignature === result.acceptedEvidence!.semanticSignature,
                    )) {
                        dedupedTopics += 1;
                    } else {
                        acceptedOutputs.push(result.acceptedEvidence);
                    }
                }
            } else if (getState().isChangingGoal) {
                break;
            }
        } catch (error) {
            const failure = classifyTopicFailure(error);
            failedTopics.push({
                topic: topics[index],
                code: failure.code,
                message: failure.message,
            });
        }

        setState({
            reportGenerationProgress: {
                completed: index + 1,
                total: topics.length,
                mode: 'analysis',
            },
        });

        if (getState().isChangingGoal) {
            break;
        }
    }

    return {
        completedTopics,
        cardTopics,
        tableFirstTopics,
        tableOnlyTopics,
        rejectedTopics,
        dedupedTopics,
        failedTopics,
        hadWarnings: failedTopics.length > 0,
    };
};
