import type { Settings } from '../../types';
import * as providerConfig from './providerConfig';
import type { ModelContextProfile, ModelContextStrategy } from './providerConfig';
import type { AgentStage } from '../agent/types';
import {
    type ContextCallType,
    type ContextPriority,
    type ContextBucket,
    type CompactionMode,
    type PromptBudgetProfile,
    type ContextSection,
    type ManagedContext,
    type ContextDiagnostics,
    FALLBACK_SOFT_PROMPT_BUDGETS,
    HISTORY_SHARE_BY_CALL_TYPE,
    HISTORY_SECTION_KEYS,
    truncateContextText,
} from './contextManager';
import {
    CONTEXT_CHAT_SOFT_BUDGET_CAP as CHAT_SOFT_BUDGET_CAP,
    CONTEXT_PLANNER_SOFT_BUDGET_CAP as PLANNER_SOFT_BUDGET_CAP,
    CONTEXT_SUMMARY_SOFT_BUDGET_CAP as SUMMARY_SOFT_BUDGET_CAP,
    CONTEXT_RUNTIME_EVAL_SOFT_BUDGET_CAP as RUNTIME_EVAL_SOFT_BUDGET_CAP,
    CONTEXT_HARD_BUDGET_RATIO,
} from '../../config/agentDefaults';
import { normalizeText } from './contextFormatting';

const getFallbackSoftPromptBudget = (callType: ContextCallType): number => FALLBACK_SOFT_PROMPT_BUDGETS[callType];

export const resolveModelContextProfileSafely = (
    settings: Settings,
    modelId: string,
): ModelContextProfile => {
    if (typeof providerConfig.resolveModelContextProfile === 'function') {
        return providerConfig.resolveModelContextProfile(settings, modelId);
    }

    return {
        contextWindow: null,
        reserveTokens: 0,
        keepRecentTokens: 0,
        strategy: 'fallback_static',
    };
};

export const resolvePromptBudgetProfile = (
    callType: ContextCallType,
    modelProfile?: ModelContextProfile,
    compactionMode: CompactionMode = 'normal',
): PromptBudgetProfile => {
    let softBudget = getFallbackSoftPromptBudget(callType);
    const historyShare = HISTORY_SHARE_BY_CALL_TYPE[callType];

    if (modelProfile?.strategy === 'model_aware' && modelProfile.contextWindow !== null) {
        const availableTokens = Math.max(1, modelProfile.contextWindow - modelProfile.reserveTokens);
        if (callType === 'chat') {
            softBudget = Math.min(CHAT_SOFT_BUDGET_CAP, Math.max(12000, Math.floor(availableTokens * 0.12)));
        } else if (callType === 'planner' || callType === 'tool' || callType === 'data_prep' || callType === 'next_step') {
            softBudget = Math.min(PLANNER_SOFT_BUDGET_CAP, Math.max(8000, Math.floor(availableTokens * 0.08)));
        } else if (callType === 'summary' || callType === 'goal' || callType === 'insight') {
            softBudget = Math.min(SUMMARY_SOFT_BUDGET_CAP, Math.max(4000, Math.floor(availableTokens * 0.03)));
        } else {
            softBudget = Math.min(RUNTIME_EVAL_SOFT_BUDGET_CAP, Math.max(2500, Math.floor(availableTokens * 0.02)));
        }
    }

    if (compactionMode === 'overflow_retry') {
        softBudget = Math.max(2000, Math.floor(softBudget * 0.6));
    }

    return {
        softBudget,
        historyShare,
        historyBudget: Math.max(500, Math.floor(softBudget * historyShare)),
    };
};

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const getSoftPromptBudget = (
    callType: ContextCallType,
    settings?: Settings,
    modelId?: string,
    compactionMode: CompactionMode = 'normal',
): number =>
    resolvePromptBudgetProfile(
        callType,
        settings && modelId ? resolveModelContextProfileSafely(settings, modelId) : undefined,
        compactionMode,
    ).softBudget;

export const createContextSection = (
    key: string,
    text: string,
    priority: ContextPriority,
    bucket: ContextBucket,
): ContextSection => ({
    key,
    text,
    priority,
    bucket,
    estimatedTokens: estimateTokens(text),
});

const getPruneRank = (key: string): number => {
    if (key === 'workspace_actions') return 1;
    if (key === 'long_term_memory') return 2;
    if (key === 'related_cards') return 3;
    if (key === 'card_context') return 4;
    if (key === 'recent_query_trace') return 5;
    if (key === 'observe_data_sample') return 6; // AGENT-108: prunable observe section
    if (key === 'recent_history') return 7;
    if (key === 'raw_data_sample') return 8;
    if (key === 'data_prep_code') return 9;
    return 10;
};

const recalculateTokens = (systemText: string, baseUserText: string, sections: ContextSection[]) =>
    estimateTokens(systemText) + estimateTokens(baseUserText) + sections.reduce((sum, section) => sum + section.estimatedTokens, 0);

const isHistorySection = (key: string) => HISTORY_SECTION_KEYS.has(key);

const buildRecentTail = (text: string, keepRecentTokens: number) => {
    const keepChars = Math.max(400, keepRecentTokens * 4);
    if (text.length <= keepChars) {
        return text.trim();
    }
    const tail = text.slice(-keepChars).trim();
    return `Earlier content compacted. Keep the most recent details below.\n...\n${tail}`;
};

const buildSectionCollapsedText = (
    section: ContextSection,
    collapsedSections: Record<string, string> | undefined,
    keepRecentTokens: number,
): string | null => {
    const explicit = collapsedSections?.[section.key]?.trim();
    if (explicit && normalizeText(explicit) !== normalizeText(section.text)) {
        return explicit;
    }

    if (section.key === 'recent_history' || section.key === 'recent_query_trace') {
        const compacted = buildRecentTail(section.text, keepRecentTokens);
        return normalizeText(compacted) === normalizeText(section.text) ? null : compacted;
    }

    if (isHistorySection(section.key)) {
        const compacted = buildRecentTail(section.text, Math.max(300, Math.floor(keepRecentTokens / 2)));
        return normalizeText(compacted) === normalizeText(section.text) ? null : compacted;
    }

    return null;
};

const collapseSectionAtIndex = (
    includedSections: ContextSection[],
    index: number,
    usedCollapsedSections: string[],
    collapsedSections: Record<string, string> | undefined,
    keepRecentTokens: number,
) => {
    const section = includedSections[index];
    const collapsedText = buildSectionCollapsedText(section, collapsedSections, keepRecentTokens);
    if (!collapsedText) {
        return false;
    }

    includedSections[index] = createContextSection(
        section.key,
        collapsedText,
        section.priority,
        section.bucket,
    );
    if (!usedCollapsedSections.includes(section.key)) {
        usedCollapsedSections.push(section.key);
    }
    return true;
};

const pruneHistorySectionsToBudget = ({
    systemText,
    baseUserText,
    includedSections,
    droppedSections,
    usedCollapsedSections,
    historyBudget,
    collapsedSections,
    keepRecentTokens,
    compactionMode,
    deferHistoryDrop = false,
}: {
    systemText: string;
    baseUserText: string;
    includedSections: ContextSection[];
    droppedSections: ManagedContext['droppedSections'];
    usedCollapsedSections: string[];
    historyBudget: number;
    collapsedSections?: Record<string, string>;
    keepRecentTokens: number;
    compactionMode: CompactionMode;
    deferHistoryDrop?: boolean;
}) => {
    let historyPruneApplied = false;
    const shouldForceHistoryDrop = compactionMode === 'overflow_retry';
    const historyDropCutoff = 3;

    const calculateHistoryTokens = () =>
        includedSections
            .filter(section => isHistorySection(section.key))
            .reduce((sum, section) => sum + section.estimatedTokens, 0);

    let historyTokens = calculateHistoryTokens();
    while (historyTokens > historyBudget) {
        const candidates = includedSections
            .map((section, index) => ({ index, section }))
            .filter(({ section }) => isHistorySection(section.key))
            .sort((a, b) => getPruneRank(a.section.key) - getPruneRank(b.section.key));

        if (candidates.length === 0) {
            break;
        }

        historyPruneApplied = true;
        const candidate = candidates[0];
        const collapsed = collapseSectionAtIndex(
            includedSections,
            candidate.index,
            usedCollapsedSections,
            collapsedSections,
            keepRecentTokens,
        );

        if (!collapsed) {
            if (deferHistoryDrop && !shouldForceHistoryDrop) {
                break;
            }
            includedSections.splice(candidate.index, 1);
            droppedSections.push({ key: candidate.section.key, reason: 'budget' });
        } else if (shouldForceHistoryDrop && getPruneRank(candidate.section.key) <= historyDropCutoff) {
            includedSections.splice(candidate.index, 1);
            droppedSections.push({ key: candidate.section.key, reason: 'budget' });
        }

        historyTokens = calculateHistoryTokens();
    }

    return {
        historyPruneApplied,
        promptTokens: recalculateTokens(systemText, baseUserText, includedSections),
    };
};

const applyCollapsedSubstitutionsToBudget = ({
    systemText,
    baseUserText,
    includedSections,
    droppedSections,
    usedCollapsedSections,
    softBudget,
    collapsedSections,
    keepRecentTokens,
}: {
    systemText: string;
    baseUserText: string;
    includedSections: ContextSection[];
    droppedSections: ManagedContext['droppedSections'];
    usedCollapsedSections: string[];
    softBudget: number;
    collapsedSections?: Record<string, string>;
    keepRecentTokens: number;
}) => {
    let promptTokens = recalculateTokens(systemText, baseUserText, includedSections);

    while (promptTokens > softBudget) {
        const candidate = includedSections
            .map((section, index) => ({ index, section }))
            .filter(({ section }) => section.bucket === 'prunable')
            .sort((a, b) => getPruneRank(a.section.key) - getPruneRank(b.section.key))
            .find(({ index }) => collapseSectionAtIndex(
                includedSections,
                index,
                usedCollapsedSections,
                collapsedSections,
                keepRecentTokens,
            ));

        if (!candidate) {
            break;
        }

        promptTokens = recalculateTokens(systemText, baseUserText, includedSections);
    }

    return promptTokens;
};

const dropSectionsToBudget = ({
    systemText,
    baseUserText,
    includedSections,
    droppedSections,
    softBudget,
}: {
    systemText: string;
    baseUserText: string;
    includedSections: ContextSection[];
    droppedSections: ManagedContext['droppedSections'];
    softBudget: number;
}) => {
    let promptTokens = recalculateTokens(systemText, baseUserText, includedSections);

    while (promptTokens > softBudget) {
        const candidates = includedSections
            .map((section, index) => ({ index, section }))
            .filter(({ section }) => section.bucket === 'prunable')
            .sort((a, b) => getPruneRank(a.section.key) - getPruneRank(b.section.key));

        if (candidates.length === 0) {
            break;
        }

        const candidate = candidates[0];
        includedSections.splice(candidate.index, 1);
        droppedSections.push({ key: candidate.section.key, reason: 'budget' });
        promptTokens = recalculateTokens(systemText, baseUserText, includedSections);
    }

    return promptTokens;
};

export const buildManagedContext = ({
    callType,
    systemText,
    baseUserText,
    sections,
    collapsedSections,
    settings,
    modelId,
    compactionMode = 'normal',
    deferPrunableDrop = false,
}: {
    callType: ContextCallType;
    systemText: string;
    baseUserText: string;
    sections: ContextSection[];
    collapsedSections?: Record<string, string>;
    settings?: Settings;
    modelId?: string;
    compactionMode?: CompactionMode;
    deferPrunableDrop?: boolean;
}): ManagedContext => {
    const droppedSections: ManagedContext['droppedSections'] = [];
    const seen = [normalizeText(systemText), normalizeText(baseUserText)];
    const includedSections: ContextSection[] = [];
    const usedCollapsedSections: string[] = [];

    for (const section of sections) {
        const trimmed = section.text.trim();
        const normalized = normalizeText(trimmed);
        if (!normalized) {
            droppedSections.push({ key: section.key, reason: 'empty' });
            continue;
        }

        const isDuplicate = normalized.length > 24 && seen.some(previous => previous.includes(normalized) || normalized.includes(previous));
        if (isDuplicate) {
            droppedSections.push({ key: section.key, reason: 'duplicate' });
            continue;
        }

        seen.push(normalized);
        includedSections.push({
            ...section,
            text: trimmed,
            estimatedTokens: estimateTokens(trimmed),
        });
    }

    const modelProfile = settings && modelId
        ? resolveModelContextProfileSafely(settings, modelId)
        : {
            contextWindow: null,
            reserveTokens: 0,
            keepRecentTokens: 0,
            strategy: 'fallback_static' as const,
        };
    const budgetProfile = resolvePromptBudgetProfile(callType, modelProfile, compactionMode);
    const keepRecentTokens = modelProfile.keepRecentTokens || 4000;
    const historyResult = pruneHistorySectionsToBudget({
        systemText,
        baseUserText,
        includedSections,
        droppedSections,
        usedCollapsedSections,
        historyBudget: budgetProfile.historyBudget,
        collapsedSections,
        keepRecentTokens,
        compactionMode,
        deferHistoryDrop: deferPrunableDrop,
    });

    let promptTokens = applyCollapsedSubstitutionsToBudget({
        systemText,
        baseUserText,
        includedSections,
        droppedSections,
        usedCollapsedSections,
        softBudget: budgetProfile.softBudget,
        collapsedSections,
        keepRecentTokens,
    });

    if (!deferPrunableDrop) {
        promptTokens = dropSectionsToBudget({
            systemText,
            baseUserText,
            includedSections,
            droppedSections,
            softBudget: budgetProfile.softBudget,
        });
    }

    const diagnostics: ContextDiagnostics = {
        callType,
        estimatedPromptTokens: promptTokens,
        systemPromptChars: systemText.length,
        userPromptChars: [baseUserText, ...includedSections.map(section => section.text)].join('\n\n').length,
        budget: budgetProfile.softBudget,
        softBudget: budgetProfile.softBudget,
        historyBudget: budgetProfile.historyBudget,
        contextWindow: modelProfile.contextWindow,
        budgetStrategy: modelProfile.strategy,
        reserveTokens: modelProfile.reserveTokens,
        keepRecentTokens,
        includedSectionKeys: includedSections.map(section => section.key),
        droppedSectionKeys: droppedSections.map(section => section.key),
        droppedSections,
        usedCollapsedSections,
        collapsedSectionKeys: [...usedCollapsedSections],
        historyPruneApplied: historyResult.historyPruneApplied,
        compactionMode,
        overflowRetryTriggered: compactionMode === 'overflow_retry',
        summaryRefreshTriggered: false,
        stagedSummaryParts: 0,
        compactionTriggered: historyResult.historyPruneApplied
            || usedCollapsedSections.length > 0
            || droppedSections.some(section => section.reason === 'budget'),
    };

    return {
        systemText,
        userText: [baseUserText, ...includedSections.map(section => section.text)].join('\n\n'),
        includedSections,
        droppedSections,
        estimatedPromptTokens: diagnostics.estimatedPromptTokens,
        diagnostics,
    };
};

export const buildContextDetail = (diagnostics: ContextDiagnostics, stage: AgentStage) =>
    `${stage} | ${diagnostics.callType} | ${diagnostics.estimatedPromptTokens}/${diagnostics.softBudget} tokens`;

export const buildContextMeta = (diagnostics: ContextDiagnostics): Record<string, unknown> => ({
    callType: diagnostics.callType,
    estimatedPromptTokens: diagnostics.estimatedPromptTokens,
    systemPromptChars: diagnostics.systemPromptChars,
    userPromptChars: diagnostics.userPromptChars,
    budget: diagnostics.budget,
    softBudget: diagnostics.softBudget,
    historyBudget: diagnostics.historyBudget,
    contextWindow: diagnostics.contextWindow,
    budgetStrategy: diagnostics.budgetStrategy,
    reserveTokens: diagnostics.reserveTokens,
    keepRecentTokens: diagnostics.keepRecentTokens,
    includedSectionKeys: diagnostics.includedSectionKeys,
    droppedSectionKeys: diagnostics.droppedSectionKeys,
    droppedSections: diagnostics.droppedSections,
    usedCollapsedSections: diagnostics.usedCollapsedSections,
    collapsedSectionKeys: diagnostics.collapsedSectionKeys,
    historyPruneApplied: diagnostics.historyPruneApplied,
    compactionMode: diagnostics.compactionMode,
    overflowRetryTriggered: diagnostics.overflowRetryTriggered,
    summaryRefreshTriggered: diagnostics.summaryRefreshTriggered,
    stagedSummaryParts: diagnostics.stagedSummaryParts,
    compactionTriggered: diagnostics.compactionTriggered,
});

/**
 * Hard budget gate — returns `exceeded: true` when the estimated prompt
 * token count exceeds CONTEXT_HARD_BUDGET_RATIO of the model context window.
 *
 * When the context window is unknown (fallback_static strategy), the check
 * is skipped and `exceeded` is always `false`.
 */
export const isHardBudgetExceeded = (
    contextWindow: number | null,
    estimatedTokens: number,
): { exceeded: boolean; limit: number; current: number } => {
    if (contextWindow === null || contextWindow <= 0) {
        return { exceeded: false, limit: 0, current: estimatedTokens };
    }
    const limit = Math.floor(contextWindow * CONTEXT_HARD_BUDGET_RATIO);
    return { exceeded: estimatedTokens > limit, limit, current: estimatedTokens };
};

export const buildFallbackContextDiagnostics = ({
    callType,
    text,
    settings,
    modelId,
    compactionMode = 'normal',
}: {
    callType: ContextCallType;
    text: string;
    settings?: Settings;
    modelId?: string;
    compactionMode?: CompactionMode;
}): ContextDiagnostics => {
    const modelProfile = settings && modelId
        ? resolveModelContextProfileSafely(settings, modelId)
        : {
            contextWindow: null,
            reserveTokens: 0,
            keepRecentTokens: 0,
            strategy: 'fallback_static' as const,
        };
    const budgetProfile = resolvePromptBudgetProfile(callType, modelProfile, compactionMode);
    const keepRecentTokens = modelProfile.keepRecentTokens || 4000;

    return {
        callType,
        estimatedPromptTokens: estimateTokens(text),
        systemPromptChars: 0,
        userPromptChars: text.length,
        budget: budgetProfile.softBudget,
        softBudget: budgetProfile.softBudget,
        historyBudget: budgetProfile.historyBudget,
        contextWindow: modelProfile.contextWindow,
        budgetStrategy: modelProfile.strategy,
        reserveTokens: modelProfile.reserveTokens,
        keepRecentTokens,
        includedSectionKeys: [],
        droppedSectionKeys: [],
        droppedSections: [],
        usedCollapsedSections: [],
        collapsedSectionKeys: [],
        historyPruneApplied: false,
        compactionMode,
        overflowRetryTriggered: compactionMode === 'overflow_retry',
        summaryRefreshTriggered: false,
        stagedSummaryParts: 0,
        compactionTriggered: true,
    };
};
