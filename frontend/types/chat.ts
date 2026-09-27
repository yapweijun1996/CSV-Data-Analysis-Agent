import { AnalysisGoalCandidate, PendingPlan, AnalysisPlan } from './analysis';
import type { CsvRow } from './intake';
import type { DropRowsByConditionOperation, FilterRowsOperation } from './operations';
import type { AnalysisEngine, QueryPlan } from './querying';
import type { QueryUnderstandingArtifact, GroundingResult } from '../services/agent/runtime/intentClassificationTypes';

export interface ClarificationOption {
    label: string;
    value: string;
}

export interface ClarificationRequest {
    question: string;
    options: ClarificationOption[];
    allowFreeText?: boolean;
    clarificationMode?: 'options' | 'free_text';
    interactionKind?: 'clarification' | 'approval';
    pendingPlan?: PendingPlan;
    targetProperty?: keyof AnalysisPlan | 'merge';
    resumeContext?: {
        turnId?: string;
        resumeMessagePrefix?: string;
        optionLabel?: string;
        originalUserRequest?: string;
        selectedPath?: string;
        mustPreserveOutcome?: 'answer' | 'table' | 'card' | 'derived_metric';
        clarificationQuestionFingerprint?: string;
        blockedReason?: string;
        resumeTargetRunId?: string;
        resumeTargetTurnId?: string;
        resumeOriginalUserMessage?: string;
        followUpRuntimeInteraction?: {
            owner: 'agrun';
            kind: 'clarification' | 'approval';
            sessionId: string;
            turnId: string;
            runtimeRunId?: string;
            resumeToken?: unknown;
        };
        /** AGENT-209: Artifact/grounding context captured at clarification time for resume continuity. */
        queryUnderstandingArtifact?: QueryUnderstandingArtifact;
        groundingResult?: GroundingResult;
        /** AGENT-107: Structured evidence captured at clarification time. */
        priorEvidence?: {
            queryExplanation?: string | null;
            queryColumns?: string[] | null;
            sampleRows?: CsvRow[] | null;
            queryTraceSummary?: string | null;
            qualityContext?: string | null;
        } | null;
    };
}

/**
 * A clarification that the user has already answered. Stored so subsequent
 * chat turns can reference it without re-asking the same question.
 * Expires after CLARIFICATION_TTL_TURNS (10) chat turns.
 */
export interface ResolvedClarification {
    /** Stable key: `targetProperty` if set, otherwise first 60 chars of the question */
    key: string;
    /** The original question text */
    question: string;
    /** The user's resolved answer */
    value: string;
    /** `chatHistory.length` at the time the clarification was resolved */
    resolvedAtTurn: number;
}

export interface CleaningStepDetail {
    stepId: string;
    kind: 'inspect' | 'edit' | 'verify' | 'commit';
    toolName?: string;
    path?: string;
    diffSummary?: string;
    status: 'in_progress' | 'done' | 'warning' | 'error' | 'blocked';
}

export interface CleaningFailureDetail {
    summary: string;
    actionTaken?: string | null;
    dataSafety?: string | null;
    nextState?: string | null;
    technicalDetail?: string | null;
}

export interface QueryTraceDetail {
    sessionId?: string;
    runId?: string;
    turnId?: string;
    stepId?: string;
    toolCallId?: string;
    phase: 'verify' | 'analysis';
    engine: AnalysisEngine;
    sqlPreview?: string | null;
    returnedRows: number;
    totalMatchedRows: number;
    durationMs: number;
    fallbackReason?: string | null;
}

export interface PendingMutationConfirmation {
    request: string;
    filterRows: FilterRowsOperation;
    mutationOperation: DropRowsByConditionOperation;
    queryPlan: QueryPlan;
    matchedRowCount: number;
    previewRows: CsvRow[];
    engine: AnalysisEngine;
    fallbackReason?: string | null;
    createdAt: Date;
}

export interface QueuedChatTurn {
    id: string;
    message: string;
    enqueuedAt: Date;
}

export type TranscriptVisibility = 'full' | 'summarized' | 'hidden';

export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
    suggestedActions?: { label: string; action: string }[];
    type?: 'user_message' | 'ai_message' | 'ai_thinking' | 'ai_proactive_insight' | 'ai_plan_start' | 'ai_clarification' | 'ai_thought' | 'ai_goal_clarification' | 'ai_enhancement_suggestion' | 'ai_cleaning_step' | 'ai_query_trace' | 'ai_cleaning_failure' | 'ai_mutation_confirmation';
    isError?: boolean;
    cardId?: string;
    referencedCardIds?: string[];
    clarificationRequest?: ClarificationRequest;
    clarificationSelection?: ClarificationOption;
    mutationConfirmation?: PendingMutationConfirmation;
    goalCandidates?: AnalysisGoalCandidate[];
    enhancementSuggestionId?: string;
    cleaningStep?: CleaningStepDetail;
    cleaningFailure?: CleaningFailureDetail;
    queryTrace?: QueryTraceDetail;
    cleaningRunId?: string;
    resolved?: boolean;
    contextVisibility?: TranscriptVisibility;
    modelText?: string | null;
}

export interface StreamingMessage {
    /** Accumulated partial text from the AI response stream */
    text: string;
    /** True while tokens are still arriving */
    isStreaming: boolean;
    /** When the stream started */
    startedAt: Date;
}

export interface ClarificationResponseAssessment {
    status: 'resolved' | 'best_effort_continue' | 'still_ambiguous';
    normalizedReply: string;
    assumptionSummary?: string;
    missingInfoSummary?: string;
}
