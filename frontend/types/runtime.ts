import type { AiAction, AgentObservation, PivotMatrixRequest, ToolExecutionResult, ToolName } from './ai';
import type { AnalystCapabilitySelection, MetricDerivationTemplate } from './agent';
import type { ClarificationRequest } from './chat';
import type { PivotDecision, PivotPreference } from './analysis';

export type RuntimeOutcomeKind = 'accepted' | 'retry' | 'blocked' | 'failed' | 'cancelled' | 'queued';

export type RuntimeFailureClass =
    | 'parse'
    | 'tool_policy'
    | 'tool_contract'
    | 'tool_execution'
    | 'provider'
    | 'evaluator'
    | 'budget'
    | 'cancelled';

export type RuntimeRetryClass =
    | 'parse_recovery'
    | 'tool_policy_recovery'
    | 'tool_contract_recovery'
    | 'tool_execution_recovery'
    | 'provider_recovery'
    | 'provider_timeout_recovery'
    | 'evaluator_recovery'
    | 'semantic_recovery'
    | 'queue_backpressure'
    | 'budget_terminal'
    | 'cancelled_terminal';

export type RuntimeTimeoutReason = 'model_call_timeout';

export type RuntimeAbortMode = 'checkpoint_abort' | 'transport_abort';
export type RuntimeAbortPropagationStatus = 'propagated' | 'checkpoint_only' | 'not_supported';
export type RuntimeAbortSource =
    | 'runtime_turn_loop'
    | 'runtime_cancellation'
    | 'provider_chat_completion'
    | 'runtime_evaluator'
    | 'data_preparation_planner'
    | 'analysis_planner'
    | 'tool_execution'
    | 'query_execution';

export interface RuntimeEventContractDetail {
    contractVersion: 'runtime_v1';
    reasonCode?: string;
    failureClass?: RuntimeFailureClass;
    retryClass?: RuntimeRetryClass;
    timeoutReason?: RuntimeTimeoutReason;
    timeoutMs?: number;
    abortMode?: RuntimeAbortMode;
    abortSource?: RuntimeAbortSource | string;
    abortPropagationStatus?: RuntimeAbortPropagationStatus;
    source?: string;
    [key: string]: unknown;
}

export type RuntimeLifecycleState =
    | 'queued'
    | 'selecting'
    | 'executing'
    | 'evaluating'
    | 'retrying'
    | 'waiting_for_clarification'
    | 'completed'
    | 'failed'
    | 'cancelled';

// --- Chat-level lifecycle (drives composer busy state) ---

export type ChatLifecycleState =
    | 'idle'
    | 'running'
    | 'waiting_tool'
    | 'retrying'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'cancelled';

export const TERMINAL_CHAT_LIFECYCLE_STATES = new Set<ChatLifecycleState>([
    'idle', 'completed', 'failed', 'cancelled',
]);

export type RuntimeStage = 'queued' | 'selecting' | 'executing' | 'evaluating' | 'retrying' | 'finalizing';

export type RuntimeOodaePhase = 'observe' | 'orient' | 'decide' | 'act' | 'evaluate' | 'append';

export type RuntimeMustPreserveOutcome = 'answer' | 'table' | 'card' | 'derived_metric';

export interface RuntimeTaskCommitment {
    originalUserRequest: string;
    committedObjective: string;
    selectedPath: string;
    successOutcome: string;
    mustPreserveOutcome: RuntimeMustPreserveOutcome;
    assumptionMode: 'none' | 'best_effort';
}

export interface RuntimeFallbackPolicy {
    blockedToolStrategy: 'fallback_answer' | 'fallback_plan' | 'clarify_once';
    deniedToolStrategy: 'switch_tool_family' | 'fallback_answer' | 'clarify_once' | 'terminal_answer';
    maxClarificationRounds: number;
    allowToolFamilySwitch: boolean;
}

export interface RuntimeDoneCriteria {
    isDoneWhen: string[];
    isDoneWithPartial: string | null;
    mustNotDo: string[];
}

export interface RuntimeClarificationBudget {
    roundsUsed: number;
    sameQuestionFingerprint: string | null;
    bestEffortConsumed: boolean;
}

export interface RuntimeRecoveryDirective {
    nextMode: 'answer' | 'clarify' | 'repair' | 'replan' | 'derive';
    forbiddenToolNames: ToolName[];
    preferredToolNames: ToolName[];
    reason: string;
}

export interface RuntimeObservationSnapshot {
    latestUserMessage: string;
    originalUserRequest: string;
    selectedPath: string;
    clarificationQuestion: string | null;
    clarificationAssessment: 'resolved' | 'best_effort_continue' | 'still_ambiguous' | null;
    assumptionSummary: string | null;
    hasVisibleEvidence: boolean;
    hasUsableEvidence: boolean;
    availableToolNames: ToolName[];
}

export interface RuntimeRecoveryState {
    clarificationBudget: RuntimeClarificationBudget;
    recoveryDirective: RuntimeRecoveryDirective | null;
    lastBlockedReason: string | null;
    lastDeniedToolName: ToolName | null;
}

export interface AgentBudgetStatus {
    maxSteps: number;
    stepsUsed: number;
    retryCounts: Record<string, number>;
    exhausted: boolean;
}

export interface AgentStep {
    stepId: string;
    turnId: string;
    toolCallId?: string;
    index: number;
    action: AiAction;
    status: 'in_progress' | 'completed' | 'blocked' | 'error';
    startedAt: Date;
    completedAt?: Date;
    result?: ToolExecutionResult;
    observation?: AgentObservation;
}

export interface AgentTurn {
    turnId: string;
    runId?: string;
    userMessage: string;
    status: 'running' | 'waiting_for_clarification' | 'completed' | 'failed' | 'cancelled';
    lifecycleState?: RuntimeLifecycleState;
    startedAt: Date;
    completedAt?: Date;
    finalMessage?: string | null;
    pendingClarificationRequest?: ClarificationRequest | null;
    lastObservation?: AgentObservation | null;
    runtimeCommitment?: RuntimeTaskCommitment | null;
    runtimeStepContract?: RuntimeStepContract | null;
    recoveryState?: RuntimeRecoveryState | null;
    budgetStatus: AgentBudgetStatus;
    steps: AgentStep[];
}

export interface AgentRuntimeDecision {
    action: AiAction;
}

export type RuntimeCompletionMode =
    | 'respond_or_act'
    | 'final_response'
    | 'direct_completion'
    | 'clarification';

export type RuntimeTaskMode =
    | 'inspect'
    | 'reconciliation'
    | 'derive_metric'
    | 'validate_metric'
    | 'visualize'
    | 'explain'
    | 'pivot_matrix'
    | 'period_compare'
    | 'cohort_retention'
    | 'root_cause_breakdown'
    | 'statistical_analysis';

export type RuntimeExpectedOutcome =
    | 'answer'
    | 'table'
    | 'card'
    | 'derived_metric'
    | 'clarification';

export interface PlannedToolCall {
    toolName: ToolName;
    thought: string;
    args: Record<string, unknown>;
    pivotPreference?: PivotPreference;
    pivotDecision?: PivotDecision;
}

export interface RuntimeReconciliationContract {
    leftScope: {
        label: string;
        sourceCardId: string | null;
        total: number | null;
        datasetVersion: string | null;
    };
    rightScope: {
        label: string;
        sourceCardId: string | null;
        total: number | null;
        datasetVersion: string | null;
    };
    targetDifference: number | null;
    expectedOutput: Array<'record_table' | 'reason_breakdown' | 'scope_explanation'>;
    inheritPriorFilters: boolean;
    maxDataQueryCalls: number;
    maxSemanticRepairs: number;
}

export interface RuntimeStepContract {
    oodaePhase?: RuntimeOodaePhase;
    goalSummary: string;
    taskMode: RuntimeTaskMode;
    completionMode: RuntimeCompletionMode;
    expectedOutcome: RuntimeExpectedOutcome;
    clarificationState?: 'required' | 'best_effort' | 'resolved';
    allowOverrides?: ToolName[];
    denyOverrides?: ToolName[];
    allowedToolNames?: ToolName[];
    allowAssistantResponse: boolean;
    preferClarification: boolean;
    antiRepeatHint: string;
    visibleEvidenceSummary?: string | null;
    /** Layer 1: Session history trace — past queries, contextual summary (AGENT-104). */
    visibleTraceSummary?: string | null;
    /** Layer 2: Concrete on-screen artifacts — active query, cards, validation (AGENT-104). */
    groundedArtifactSummary?: string | null;
    /** Layer 3: Grounded artifacts that address the current question (AGENT-104). */
    answerableEvidenceSummary?: string | null;
    analysisBriefSummary?: string | null;
    /** AGENT-105: Which policy phase produced the tool set (for traceability). */
    toolPhase?: string | null;
    knownBlockers?: string[];
    metricBlockers?: string[];
    metricDerivationTemplate?: MetricDerivationTemplate | null;
    pivotPreference?: PivotPreference;
    pivotDecision?: PivotDecision | null;
    analystCapabilitySelection?: AnalystCapabilitySelection | null;
    instruction?: string | null;
    observationSnapshot?: RuntimeObservationSnapshot | null;
    taskCommitment?: RuntimeTaskCommitment | null;
    fallbackPolicy?: RuntimeFallbackPolicy | null;
    doneCriteria?: RuntimeDoneCriteria | null;
    clarificationBudget?: RuntimeClarificationBudget | null;
    recoveryDirective?: RuntimeRecoveryDirective | null;
    reconciliation?: RuntimeReconciliationContract | null;
    /** Set by contract retry when the outcome expectation is downgraded. */
    degradedFrom?: {
        originalExpectedOutcome: RuntimeExpectedOutcome;
        reason: string;
    } | null;
}

export type RuntimeRequestPolicy = RuntimeStepContract;

export interface RuntimeEvaluationScorecard {
    goalMatch: 'low' | 'medium' | 'high';
    evidenceQuality: 'low' | 'medium' | 'high';
    toolFit: 'poor' | 'adequate' | 'strong';
    repeatRisk: 'low' | 'medium' | 'high';
    completionReadiness: 'low' | 'medium' | 'high';
    failurePattern:
        | 'none'
        | 'semantic_miss'
        | 'tool_mismatch'
        | 'tool_contract'
        | 'tool_policy'
        | 'weak_evidence'
        | 'premature_answer'
        | 'parse_failure'
        | 'unknown';
    /** Business insight value of the result. low = flat/all-same values, medium = some variation, high = clear pattern or outlier. */
    insightValue?: 'low' | 'medium' | 'high';
}

export interface RuntimeEvaluationDecision {
    decision: 'accept' | 'retry' | 'clarify';
    reason: string;
    retryHint?: string | null;
    isFinalEnough?: boolean | null;
    needsExplanation?: boolean | null;
    scorecard?: RuntimeEvaluationScorecard | null;
    finalReadiness?: 'ready' | 'needs_response' | 'partial_only' | 'not_ready' | null;
    recommendedNextMode?: 'accept' | 'retry' | 'clarify' | 'fallback_answer' | 'repair' | 'replan' | 'stop' | null;
}

export interface AgentRuntimeEvent {
    id: string;
    sessionId?: string;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
    type:
        | 'turn_started'
        | 'turn_queued'
        | 'turn_blocked'
        | 'turn_cancellation_requested'
        | 'decision_received'
        | 'action_executed'
        | 'observation_recorded'
        | 'evaluation_started'
        | 'evaluation_completed'
        | 'retry_scheduled'
        | 'decision_rejected'
        | 'repetition_detected'
        | 'final_response_required'
        | 'capability_selected'
        | 'clarification_requested'
        | 'turn_completed'
        | 'turn_cancelled'
        | 'turn_failed'
        | 'tool_recovered'
        | 'tool_degraded'
        | 'session_early_stop'
        | 'diagnostic_mode_recommended'
        | 'action_execution_error'
        | 'evaluator_degraded'
        | 'provider_timeout'
        | 'silent_failure'
        | 'harness_degraded'
        | 'context_refreshed_after_quality_repair'
        | 'quality_repair_contract_rejected'
        | 'planner_escalated_to_full'
        | 'harness_pairing_soft_deprioritized'
        | 'turn_health_summary'
        | 'analysis_yield_low'
        | 'reshape_before_analysis'
        | 'reshape_before_analysis_succeeded'
        | 'reshape_before_analysis_failed'
        | 'context_refreshed_after_reshape'
        | 'presentation_self_corrected'
        | 'answerability_override'
        | 'decide_harness_warn'
        | 'contract_downgrade'
        | 'fallback_model_used';
    stage?: RuntimeStage;
    reason?: string;
    retryable?: boolean;
    failureClass?: RuntimeFailureClass;
    message: string;
    detail?: Record<string, unknown>;
    timestamp: Date;
}

export interface QueuedAgentRun {
    queueId: string;
    sessionId: string;
    message: string;
    enqueuedAt: Date;
    source: 'chat';
}

/**
 * Recovery status for a runtime turn.
 * - `ideal`: the turn achieved its original goal on the first attempt.
 * - `recovered`: the turn failed initially but recovered to the original goal.
 * - `degraded`: the turn could not achieve its original goal and fell back to a weaker outcome.
 * - `failed`: the turn could not produce any useful outcome.
 */
export type RuntimeRecoveryStatus = 'ideal' | 'recovered' | 'degraded' | 'failed';

/**
 * Describes the outcome shape actually delivered by the runtime turn,
 * allowing comparison against the original expected outcome.
 */
export type RuntimeActualOutcomeShape = 'card' | 'table' | 'prose' | 'clarification' | 'hidden' | null;

/**
 * Structured trace of how a turn recovered (or failed to recover)
 * from errors during execution.
 */
export interface RuntimeRecoveryTrace {
    recoveryStatus: RuntimeRecoveryStatus;
    originalExpectedOutcome: RuntimeExpectedOutcome | null;
    actualOutcomeShape: RuntimeActualOutcomeShape;
    degradationReason: string | null;
    /** Step-by-step recovery chain, e.g. ['blocked:analysis.create_plan', 'retry:data.query', 'fallback:assistant_message'] */
    recoveryChain: string[];
    /** How many times the runtime step contract was re-derived during recovery. */
    contractChanges: number;
}

export interface RuntimeRunRecord {
    runId: string;
    turnId: string | null;
    sessionId: string;
    userMessage: string;
    lifecycleState: RuntimeLifecycleState;
    outcomeKind: RuntimeOutcomeKind;
    failureClass?: RuntimeFailureClass;
    reason?: string;
    retryCount: number;
    toolSequence: string[];
    finalObservationSummary: string | null;
    createdAt: Date;
    finalDecision?: 'accept' | 'retry' | 'clarify' | null;
    finalReadiness?: 'ready' | 'needs_response' | 'partial_only' | 'not_ready' | null;
    recommendedNextMode?: 'accept' | 'retry' | 'clarify' | 'fallback_answer' | 'repair' | 'replan' | 'stop' | null;
    scorecard?: RuntimeEvaluationScorecard | null;
    recoveryTrace?: RuntimeRecoveryTrace | null;
}

export interface RuntimeOutcomeEnvelope {
    runId: string;
    turnId?: string | null;
    stepId?: string;
    sessionId: string;
    outcomeKind: RuntimeOutcomeKind;
    lifecycleState: RuntimeLifecycleState;
    stage: RuntimeStage;
    reason: string;
    retryable: boolean;
    failureClass?: RuntimeFailureClass;
    eventType: AgentRuntimeEvent['type'];
    eventMessage: string;
    eventDetail?: Record<string, unknown>;
    assistantMessage?: string | null;
    assistantMessageIsError?: boolean;
    assistantCardId?: string | null;
    shouldDrainQueue?: boolean;
}

export type DataAnalysisSessionOrigin = 'auto_analysis' | 'chat_follow_up';

export type DataAnalysisSessionStatus =
    | 'queued'
    | 'running'
    | 'completed'
    | 'degraded'
    | 'failed'
    | 'cancelled';

export type DataAnalysisStepType =
    | 'observe_dataset'
    | 'build_semantic_understanding'
    | 'screen_row_quality'
    | 'explore_data_with_sql'
    | 'propose_hypotheses'
    | 'select_hypothesis'
    | 'plan_probe_query'
    | 'execute_probe_query'
    | 'evaluate_evidence'
    | 'refine_hypothesis'
    | 'dedupe_candidate'
    | 'plan_presentation'
    | 'emit_standard_card'
    | 'finalize_session'
    | 'stop_session';

export type DataAnalysisStepStatus =
    | 'running'
    | 'succeeded'
    | 'rejected'
    | 'failed'
    | 'skipped';

export type DataAnalysisHypothesisStatus =
    | 'pending'
    | 'active'
    | 'accepted'
    | 'rejected'
    | 'exhausted';

export type DataAnalysisNextStepDecision =
    | 'build_semantic_understanding'
    | 'screen_row_quality'
    | 'explore_data_with_sql'
    | 'propose_hypotheses'
    | 'select_hypothesis'
    | 'plan_probe_query'
    | 'execute_probe_query'
    | 'evaluate_evidence'
    | 'refine_query'
    | 'plan_presentation'
    | 'promote_to_presentation'
    | 'reject_hypothesis'
    | 'dedupe_candidate'
    | 'emit_standard_card'
    | 'finalize_session'
    | 'stop_session';

export interface DataAnalysisHypothesis {
    id: string;
    topic: string;
    grain: string | null;
    metric: string | null;
    filterIntent: string | null;
    comparisonIntent: string | null;
    priority: number;
    attemptsUsed: number;
    status: DataAnalysisHypothesisStatus;
    plannedToolCall?: PlannedToolCall | null;
    /** Deprecated compatibility path. New runtime logic should use plannedToolCall. */
    executionMode?: 'sql_evidence' | 'pivot_matrix';
    /** Deprecated compatibility path. New runtime logic should use plannedToolCall. */
    pivotRequest?: PivotMatrixRequest;
}

export type DataResearchQuestionStatus =
    | 'pending'
    | 'investigating'
    | 'supported'
    | 'unsupported'
    | 'cancelled';

export interface DataResearchQuestion {
    id: string;
    hypothesisId: string;
    question: string;
    priority: number;
    status: DataResearchQuestionStatus;
}

export interface DataResearchClarification {
    reason: string;
    question: string;
}

export interface DataResearchBrief {
    goal: string;
    datasetVersionId: string | null;
    questions: DataResearchQuestion[];
    stopConditions: string[];
    clarification: DataResearchClarification | null;
    createdAt: Date;
}

export type DataResearchFindingStatus = 'supported' | 'hypothesis' | 'rejected';

export interface DataResearchEvidenceRef {
    kind: 'query' | 'card' | 'step' | 'transformation';
    ref: string;
}

export interface DataResearchFinding {
    id: string;
    questionId: string;
    hypothesisId: string;
    claim: string;
    status: DataResearchFindingStatus;
    evidenceRefs: DataResearchEvidenceRef[];
    reasonCodes: string[];
}

export interface AcceptedAnalysisOutput {
    cardId: string;
    querySignature: string;
    semanticSignature: string;
    sourceHypothesisId: string;
    sourceStepIds: string[];
    valueDecision: 'pass' | 'table_only';
    presentationMode: 'chart' | 'table_then_chart';
    valueReasonCodes?: string[];
    evidenceDetail?: string | null;
}

export interface RejectedAnalysisOutput {
    querySignature: string;
    semanticSignature: string;
    reason: string;
    sourceHypothesisId: string;
    sourceStepIds: string[];
    valueReasonCodes?: string[];
    evidenceDetail?: string | null;
}

export interface DataAnalysisQueryHistoryEntry {
    stepId: string;
    hypothesisId: string | null;
    title: string;
    queryMode: 'aggregate' | 'rowset';
    sqlPreview: string | null;
    querySignature: string | null;
    semanticSignature: string | null;
    traceContract?: RuntimeEventContractDetail;
}

export type TraceI18nVars = Record<string, string | number | boolean>;

export interface TraceLocalizationMessage {
    key: string;
    vars?: TraceI18nVars;
}

export interface VisibleAnalysisTraceEntry {
    stepId: string;
    stepIndex: number;
    label: string;
    labelI18n?: TraceLocalizationMessage;
    status: DataAnalysisStepStatus;
    summary: string;
    summaryI18n?: TraceLocalizationMessage;
    whyThisStep: string;
    whyI18n?: TraceLocalizationMessage;
    result: string;
    resultI18n?: TraceLocalizationMessage;
    nextDecision: DataAnalysisNextStepDecision | null;
    queryPreview?: string | null;
    reasonCodes: string[];
    hypothesisId?: string | null;
    traceContract?: RuntimeEventContractDetail;
}

export interface DataAnalysisStep {
    id: string;
    index: number;
    type: DataAnalysisStepType;
    status: DataAnalysisStepStatus;
    inputSummary: string;
    outputSummary: string;
    decision: DataAnalysisNextStepDecision | null;
    queryRef: string | null;
    hypothesisId: string | null;
    reasonCodes: string[];
    inputSummaryI18n?: TraceLocalizationMessage;
    outputSummaryI18n?: TraceLocalizationMessage;
    labelI18n?: TraceLocalizationMessage;
    whyI18n?: TraceLocalizationMessage;
    startedAt: Date;
    endedAt?: Date;
    traceContract?: RuntimeEventContractDetail;
}

export interface DataAnalysisSessionSummary {
    acceptedCardCount: number;
    rejectedHypothesisCount: number;
    exhaustedHypothesisCount: number;
    traceCount: number;
}

export interface DataAnalysisSessionState {
    sessionId: string;
    runId: string;
    origin: DataAnalysisSessionOrigin;
    status: DataAnalysisSessionStatus;
    maxSteps: number;
    stepsUsed: number;
    currentStepId: string | null;
    stopReason: string | null;
    semanticUnderstanding: import('./analysis').RuntimeSemanticUnderstanding | null;
    analysisMode: 'business' | 'diagnostic';
    analysisModeReason: string | null;
    /**
     * Human-readable harness investigation summary from DataInvestigationFindings.investigationSummary.
     * Persisted here so the runtime evaluator can include it in evidence quality judgement
     * without requiring the full DataInvestigationFindings object at evaluation time.
     */
    harnessSummary: string | null;
    harnessCoverage: {
        planned: number;
        attempted: number;
        succeeded: number;
        skipped: number;
        successRate: number;
        forcedDiagnostic: boolean;
        reason: string | null;
    } | null;
    /** Structured steering rules shared across planning, evaluation, and runtime prompts. */
    analysisSteering?: import('./analysis').EvidenceHarnessContext | null;
    /** Present for AGENT-402 runs; omitted by legacy persisted sessions. */
    researchBrief?: DataResearchBrief | null;
    /** Evidence-linked findings derived at research-run finalization. */
    researchFindings?: DataResearchFinding[];
    /** Checkpoint cancellation request; omitted by legacy persisted sessions. */
    cancellationRequestedAt?: Date | null;
    hypotheses: DataAnalysisHypothesis[];
    acceptedOutputs: AcceptedAnalysisOutput[];
    rejectedOutputs: RejectedAnalysisOutput[];
    queryHistory: DataAnalysisQueryHistoryEntry[];
    trace: VisibleAnalysisTraceEntry[];
    summary: DataAnalysisSessionSummary | null;
}
