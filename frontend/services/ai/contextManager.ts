import type { Settings } from '../../types';
import type { AgentStage } from '../agent/types';
import { debugLog } from './llmLogger';
import {
    buildManagedContext,
    createContextSection,
    buildContextDetail,
    buildContextMeta,
    buildFallbackContextDiagnostics,
} from './contextBudget';
import {
    canTriggerSummaryRefresh,
    generateCompactionSummary,
} from './contextSummary';

// ── Types ──────────────────────────────────────────────────────────────

export type ContextCallType =
    | 'chat'
    | 'planner'
    | 'tool'
    | 'summary'
    | 'goal'
    | 'insight'
    | 'next_step'
    | 'runtime_eval'
    | 'data_prep';

export type ContextPriority = 'required' | 'high' | 'medium' | 'low';
export type ContextBucket = 'sticky' | 'prunable' | 'ephemeral';
export type CompactionMode = 'normal' | 'overflow_retry';

export interface PromptBudgetProfile {
    softBudget: number;
    historyBudget: number;
    historyShare: number;
}

export interface ContextSection {
    key: string;
    text: string;
    priority: ContextPriority;
    bucket: ContextBucket;
    estimatedTokens: number;
}

export interface ManagedContext {
    systemText: string;
    userText: string;
    includedSections: ContextSection[];
    droppedSections: { key: string; reason: 'budget' | 'empty' | 'duplicate' }[];
    estimatedPromptTokens: number;
    diagnostics: ContextDiagnostics;
}

export interface ContextDiagnostics {
    callType: ContextCallType;
    estimatedPromptTokens: number;
    systemPromptChars: number;
    userPromptChars: number;
    budget: number;
    softBudget: number;
    historyBudget: number;
    contextWindow: number | null;
    budgetStrategy: import('./providerConfig').ModelContextStrategy;
    reserveTokens: number;
    keepRecentTokens: number;
    includedSectionKeys: string[];
    droppedSectionKeys: string[];
    droppedSections: { key: string; reason: 'budget' | 'empty' | 'duplicate' }[];
    usedCollapsedSections: string[];
    collapsedSectionKeys: string[];
    historyPruneApplied: boolean;
    compactionMode: CompactionMode;
    overflowRetryTriggered: boolean;
    summaryRefreshTriggered: boolean;
    stagedSummaryParts: number;
    compactionTriggered: boolean;
}

export interface ContextTelemetryTarget {
    sessionId?: string;
    currentDatasetId?: string | null;
    logTelemetryEvent?: (event: {
        stage: AgentStage;
        responseType: string;
        detail?: string;
        chunkSize?: number;
        meta?: Record<string, unknown>;
    }) => void;
    logAgentToolUsage?: (entry: {
        tool: 'context_manager';
        description: string;
        detail?: Record<string, any>;
        id?: string;
        timestamp?: Date;
    }) => void;
    recordAgentEvent?: (event: {
        phase: 'chat';
        step: string;
        status: 'pending' | 'in_progress' | 'done' | 'error';
        message: string;
        detail?: Record<string, any>;
        id?: string;
        timestamp?: Date;
    }) => unknown;
}

// ── Constants ──────────────────────────────────────────────────────────

export const FALLBACK_SOFT_PROMPT_BUDGETS: Record<ContextCallType, number> = {
    chat: 7000,
    planner: 5000,
    tool: 5000,
    data_prep: 5000,
    next_step: 5000,
    runtime_eval: 2500,
    summary: 3500,
    goal: 3500,
    insight: 3500,
};

export const HISTORY_SHARE_BY_CALL_TYPE: Record<ContextCallType, number> = {
    chat: 0.45,
    planner: 0.45,
    tool: 0.45,
    data_prep: 0.45,
    next_step: 0.45,
    runtime_eval: 0.2,
    summary: 0.35,
    goal: 0.35,
    insight: 0.35,
};

export const HISTORY_SECTION_KEYS = new Set([
    'workspace_actions',
    'long_term_memory',
    'related_cards',
    'card_context',
    'recent_query_trace',
    'recent_history',
]);

// ── Shared utility ─────────────────────────────────────────────────────

export const truncateContextText = (text: string, maxChars: number): string =>
    text.length <= maxChars ? text : `${text.slice(0, maxChars)}... [truncated]`;

// ── Orchestrators ──────────────────────────────────────────────────────

export const prepareManagedContext = async ({
    callType,
    systemText,
    baseUserText,
    sections,
    collapsedSections,
    settings,
    modelId,
    compactionMode = 'normal',
}: {
    callType: ContextCallType;
    systemText: string;
    baseUserText: string;
    sections: ContextSection[];
    collapsedSections?: Record<string, string>;
    settings: Settings;
    modelId: string;
    compactionMode?: CompactionMode;
}): Promise<ManagedContext> => {
    const initial = buildManagedContext({
        callType,
        systemText,
        baseUserText,
        sections,
        collapsedSections,
        settings,
        modelId,
        compactionMode,
        deferPrunableDrop: canTriggerSummaryRefresh(callType),
    });

    if (
        !canTriggerSummaryRefresh(callType)
        || initial.estimatedPromptTokens <= initial.diagnostics.softBudget
    ) {
        return canTriggerSummaryRefresh(callType)
            ? buildManagedContext({
                callType,
                systemText,
                baseUserText,
                sections,
                collapsedSections,
                settings,
                modelId,
                compactionMode,
            })
            : initial;
    }

    const isHistorySection = (key: string) => HISTORY_SECTION_KEYS.has(key);

    const historySections = initial.includedSections.filter(section => isHistorySection(section.key));
    if (historySections.length === 0) {
        return buildManagedContext({
            callType,
            systemText,
            baseUserText,
            sections,
            collapsedSections,
            settings,
            modelId,
            compactionMode,
        });
    }

    const compactionSummary = await generateCompactionSummary({
        settings,
        modelId,
        sections: historySections,
    });
    const rebuilt = buildManagedContext({
        callType,
        systemText,
        baseUserText,
        sections: [
            ...sections.filter(section => !isHistorySection(section.key)),
            createContextSection(
                'compacted_history_summary',
                `Compacted history summary:\n${compactionSummary.summary}`,
                'high',
                'sticky',
            ),
        ],
        collapsedSections,
        settings,
        modelId,
        compactionMode,
    });

    rebuilt.diagnostics.summaryRefreshTriggered = true;
    rebuilt.diagnostics.stagedSummaryParts = compactionSummary.stagedSummaryParts;
    rebuilt.diagnostics.compactionTriggered = true;
    rebuilt.estimatedPromptTokens = rebuilt.diagnostics.estimatedPromptTokens;

    return rebuilt;
};

export const reportContextDiagnostics = (
    target: ContextTelemetryTarget | undefined,
    diagnostics: ContextDiagnostics,
): void => {
    const stage: AgentStage = 'context_prepared';
    const detail = buildContextDetail(diagnostics, stage);
    const meta = buildContextMeta(diagnostics);

    debugLog(stage, meta);
    target?.logTelemetryEvent?.({
        stage,
        responseType: diagnostics.callType,
        detail,
        meta,
    });
    target?.logAgentToolUsage?.({
        tool: 'context_manager',
        description: `Prepared ${diagnostics.callType} context`,
        detail: meta,
    });
};

export const reportContextCompaction = (
    target: ContextTelemetryTarget | undefined,
    diagnostics: ContextDiagnostics,
    options: {
        usedFallback: boolean;
        reason: 'ai' | 'fallback_no_api_key' | 'fallback_empty_response' | 'fallback_error';
        summaryLength: number;
    },
): void => {
    const stage: AgentStage = 'context_compacted';
    const diagnosticPayload: ContextDiagnostics = {
        ...diagnostics,
        compactionTriggered: true,
    };
    const meta = {
        ...buildContextMeta(diagnosticPayload),
        usedFallback: options.usedFallback,
        compactionReason: options.reason,
        summaryLength: options.summaryLength,
    };
    const detail = `${stage} | ${diagnosticPayload.callType} | ${options.usedFallback ? 'fallback' : 'ai'} | ${options.summaryLength} chars`;

    debugLog(stage, meta);
    target?.logTelemetryEvent?.({
        stage,
        responseType: diagnosticPayload.callType,
        detail,
        meta,
    });
    target?.logAgentToolUsage?.({
        tool: 'context_manager',
        description: `Compacted ${diagnosticPayload.callType} context`,
        detail: meta,
    });
    target?.recordAgentEvent?.({
        phase: 'chat',
        step: stage,
        status: 'done',
        message: options.usedFallback
            ? 'Contextual summary refreshed with deterministic fallback.'
            : 'Contextual summary refreshed with AI compaction.',
        detail: meta,
    });
};

// ── Barrel re-exports for backward compatibility ───────────────────────

export {
    estimateTokens,
    getSoftPromptBudget,
    createContextSection,
    buildManagedContext,
    buildFallbackContextDiagnostics,
    buildContextDetail,
    buildContextMeta,
} from './contextBudget';

export {
    trimChatHistory,
    trimRelatedCards,
    trimMemoryHits,
    trimRawDataSample,
    trimCardContext,
    trimAnalysisCards,
    sanitizeChatHistoryForModel,
    inferContextVisibility,
    formatSanitizedTranscript,
    trimSanitizedTranscript,
    formatChatHistory,
    formatCollapsedChatHistory,
    formatColumnProfiles,
    formatColumnQualitySummary,
    formatColumnNames,
    formatRows,
    formatRelatedCards,
    formatCardContext,
    formatCardTitles,
    formatLongTermMemory,
    formatVisibleEvidenceSummary,
    formatVisibleTrace,
    formatGroundedArtifacts,
    formatCompactVisibleEvidenceSummary,
    formatDetailedRecentQueryTrace,
    formatRecentWorkspaceActionEvidence,
    formatDatasetKnowledge,
    formatDataPreparationExplanation,
    formatDataPreparationOperations,
    formatDataPreparationCode,
} from './contextFormatting';
export type { SanitizedTranscriptEntry } from './contextFormatting';

export {
    shouldRefreshContextualSummary,
    markContextualSummaryRefreshed,
    buildDeterministicContextualSummary,
    generateContextualSummary,
} from './contextSummary';
