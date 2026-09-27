import { streamGenerateText } from './streamGenerateText';
import type {
    AnalysisCardData,
    ChatMessage,
    DatasetKnowledge,
    Settings,
} from '../../types';
import { createProviderModel, createFallbackProviderModel, isProviderConfigured } from './providerConfig';
import { isTransientProviderError, withTransientRetry } from './transientRetry';
import { runWithOverflowCompaction } from './overflowRetry';
import type {
    ContextCallType,
    ContextSection,
    ContextDiagnostics,
    ContextTelemetryTarget,
} from './contextManager';
import {
    CONTEXT_COMPACTION_SUMMARY_MAX_PARTS as COMPACTION_SUMMARY_MAX_PARTS,
    CONTEXT_COMPACTION_SUMMARY_OVERHEAD_TOKENS as COMPACTION_SUMMARY_OVERHEAD_TOKENS,
    CONTEXT_COMPACTION_SAFETY_MARGIN as COMPACTION_SAFETY_MARGIN,
    CONTEXT_SUMMARY_TRIGGER_LENGTH as SUMMARY_TRIGGER_LENGTH,
    CONTEXT_SUMMARY_REFRESH_DELTA as SUMMARY_REFRESH_DELTA,
} from '../../config/agentDefaults';
import {
    estimateTokens,
    getSoftPromptBudget,
    createContextSection,
    buildFallbackContextDiagnostics,
} from './contextBudget';
import {
    formatCardTitles,
    formatCollapsedChatHistory,
    formatDatasetKnowledge,
} from './contextFormatting';

const lastCompactedMessageCountBySession = new Map<string, number>();

export const canTriggerSummaryRefresh = (callType: ContextCallType) =>
    callType !== 'summary' && callType !== 'runtime_eval';

export const shouldRefreshContextualSummary = (sessionId: string, chatMessageCount: number): boolean => {
    const lastCount = lastCompactedMessageCountBySession.get(sessionId) ?? 0;
    if (lastCount === 0) {
        return chatMessageCount > SUMMARY_TRIGGER_LENGTH;
    }
    return chatMessageCount - lastCount >= SUMMARY_REFRESH_DELTA;
};

export const markContextualSummaryRefreshed = (sessionId: string, chatMessageCount: number) => {
    lastCompactedMessageCountBySession.set(sessionId, chatMessageCount);
};

const buildRecentTail = (text: string, keepRecentTokens: number) => {
    const keepChars = Math.max(400, keepRecentTokens * 4);
    if (text.length <= keepChars) {
        return text.trim();
    }
    const tail = text.slice(-keepChars).trim();
    return `Earlier content compacted. Keep the most recent details below.\n...\n${tail}`;
};

export const buildDeterministicCompactionSummary = (sections: ContextSection[]): string =>
    sections
        .slice(-6)
        .map(section => {
            const compacted = buildRecentTail(section.text, 600);
            return `${section.key}:\n${compacted}`;
        })
        .join('\n\n')
        .slice(0, 2200);

export const splitCompactionSectionsIntoChunks = (
    sections: ContextSection[],
    maxChunkTokens: number,
): ContextSection[][] => {
    if (sections.length === 0) {
        return [];
    }

    const chunks: ContextSection[][] = [];
    let currentChunk: ContextSection[] = [];
    let currentTokens = 0;

    for (const section of sections) {
        const sectionTokens = estimateTokens(section.text);
        if (
            currentChunk.length > 0
            && currentTokens + sectionTokens > maxChunkTokens
            && chunks.length < COMPACTION_SUMMARY_MAX_PARTS - 1
        ) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentTokens = 0;
        }

        currentChunk.push(section);
        currentTokens += sectionTokens;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
};

export const summarizeCompactionChunk = async ({
    settings,
    modelId,
    chunkText,
    previousSummary,
}: {
    settings: Settings;
    modelId: string;
    chunkText: string;
    previousSummary?: string;
}) => {
    const { model } = createProviderModel(settings, modelId);
    const messages = [
        {
            role: 'system' as const,
            content: `You compact prompt context for future AI calls. Preserve user goals, current work, visible evidence, tool failures, explicit identifiers, dataset columns, and the latest requested follow-up. Return concise Markdown in ${settings.language}.`,
        },
        {
            role: 'user' as const,
            content: [
                previousSummary ? `Previous compacted summary:\n${previousSummary}` : '',
                'Condense the following context while preserving recent facts and explicit identifiers.',
                chunkText,
            ].filter(Boolean).join('\n\n'),
        },
    ];
    const result = await withTransientRetry(
        (fb) => streamGenerateText({ model: fb ?? model, messages }),
        { settings, primaryModelId: modelId, label: 'compactionChunk' },
    );

    return result.text.trim();
};

/** Hard timeout for the entire compaction pipeline to prevent unbounded blocking. */
const COMPACTION_TIMEOUT_MS = 30_000;

const generateCompactionSummaryCore = async ({
    settings,
    modelId,
    sections,
}: {
    settings: Settings;
    modelId: string;
    sections: ContextSection[];
}): Promise<{ summary: string; usedFallback: boolean; stagedSummaryParts: number }> => {
    const fallback = buildDeterministicCompactionSummary(sections);

    const summaryBudget = getSoftPromptBudget('summary', settings, modelId);
    const maxChunkTokens = Math.max(
        600,
        Math.floor((summaryBudget - COMPACTION_SUMMARY_OVERHEAD_TOKENS) / COMPACTION_SAFETY_MARGIN),
    );
    const chunks = splitCompactionSectionsIntoChunks(sections, maxChunkTokens);
    if (chunks.length === 0) {
        return {
            summary: fallback,
            usedFallback: true,
            stagedSummaryParts: 0,
        };
    }

    const partialSummaries: string[] = [];
    for (const chunk of chunks) {
        const chunkText = chunk.map(section => `${section.key}:\n${section.text}`).join('\n\n');
        const partial = await summarizeCompactionChunk({
            settings,
            modelId,
            chunkText,
        });
        partialSummaries.push(partial || buildDeterministicCompactionSummary(chunk));
    }

    if (partialSummaries.length === 1) {
        return {
            summary: partialSummaries[0],
            usedFallback: false,
            stagedSummaryParts: 1,
        };
    }

    const merged = await summarizeCompactionChunk({
        settings,
        modelId,
        chunkText: partialSummaries.map((summary, index) => `Part ${index + 1}:\n${summary}`).join('\n\n'),
    });

    return {
        summary: merged || partialSummaries.join('\n\n'),
        usedFallback: false,
        stagedSummaryParts: partialSummaries.length,
    };
};

export const generateCompactionSummary = async ({
    settings,
    modelId,
    sections,
}: {
    settings: Settings;
    modelId: string;
    sections: ContextSection[];
}): Promise<{ summary: string; usedFallback: boolean; stagedSummaryParts: number }> => {
    const fallback = buildDeterministicCompactionSummary(sections);
    if (!isProviderConfigured(settings)) {
        return { summary: fallback, usedFallback: true, stagedSummaryParts: 0 };
    }

    try {
        const result = await Promise.race([
            generateCompactionSummaryCore({ settings, modelId, sections }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Compaction timeout')), COMPACTION_TIMEOUT_MS),
            ),
        ]);
        return result;
    } catch (error) {
        console.warn('[ContextSummary] Compaction failed or timed out, using deterministic fallback:', error);
        return { summary: fallback, usedFallback: true, stagedSummaryParts: 0 };
    }
};

export const buildDeterministicContextualSummary = ({
    confirmedGoal,
    aiCoreAnalysisSummary,
    datasetKnowledge,
    chatHistory,
    analysisCards,
}: {
    confirmedGoal: string | null;
    aiCoreAnalysisSummary: string | null;
    datasetKnowledge?: DatasetKnowledge;
    chatHistory: ChatMessage[];
    analysisCards: AnalysisCardData[];
}): string => {
    const latestMessages = chatHistory.slice(-4).map(message => `${message.sender === 'ai' ? 'Assistant' : 'User'}: ${message.text}`).join(' | ') || 'No recent messages.';
    return [
        `Goal: ${confirmedGoal || 'No confirmed goal yet.'}`,
        `Dataset: ${datasetKnowledge?.summary || aiCoreAnalysisSummary || 'No dataset summary available.'}`,
        `Cards: ${formatCardTitles(analysisCards)}`,
        `Recent messages: ${latestMessages}`,
    ].join('\n');
};

export const generateContextualSummary = async ({
    settings,
    confirmedGoal,
    aiCoreAnalysisSummary,
    contextualSummary,
    datasetKnowledge,
    chatHistory,
    analysisCards,
    telemetryTarget,
}: {
    settings: Settings;
    confirmedGoal: string | null;
    aiCoreAnalysisSummary: string | null;
    contextualSummary: string | null;
    datasetKnowledge?: DatasetKnowledge;
    chatHistory: ChatMessage[];
    analysisCards: AnalysisCardData[];
    telemetryTarget?: ContextTelemetryTarget;
}): Promise<{ summary: string; usedFallback: boolean; diagnostics: ContextDiagnostics | null }> => {
    // Import these lazily to avoid circular dependency issues at module init
    const { prepareManagedContext, reportContextDiagnostics, reportContextCompaction } = await import('./contextManager');

    const fallback = buildDeterministicContextualSummary({
        confirmedGoal,
        aiCoreAnalysisSummary,
        datasetKnowledge,
        chatHistory,
        analysisCards,
    });
    let diagnostics: ContextDiagnostics | null = null;

    if (!isProviderConfigured(settings)) {
        reportContextCompaction(
            telemetryTarget,
            diagnostics ?? buildFallbackContextDiagnostics({
                callType: 'summary',
                text: fallback,
                settings,
                modelId: settings.simpleModel,
            }),
            {
                usedFallback: true,
                reason: 'fallback_no_api_key',
                summaryLength: fallback.length,
            },
        );
        return { summary: fallback, usedFallback: true, diagnostics };
    }

    try {
        const systemText = `You create a short working-memory summary for future AI calls. Return concise Markdown with only these fields: Goal, Dataset, Decisions, Cards, Open Questions. Keep it under 220 words and in ${settings.language}. Tool execution failures, tool restriction messages, and blocked-tool errors from previous turns are transient operational details — do not carry them forward as current-session constraints. Focus on what the user wants, what data is available, and what analysis has been completed.`;
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);
        const result = await runWithOverflowCompaction({
            provider: settings.provider,
            execute: async compactionMode => {
                const managed = await prepareManagedContext({
                    callType: 'summary',
                    systemText,
                    baseUserText: 'Create a compact session summary for reuse in future prompts.',
                    sections: [
                        createContextSection('current_goal', `Current goal:\n${confirmedGoal || 'No confirmed goal yet.'}`, 'required', 'sticky'),
                        createContextSection('dataset_knowledge', `Dataset knowledge:\n${formatDatasetKnowledge(datasetKnowledge)}`, 'high', 'sticky'),
                        createContextSection('core_analysis', `Core analysis briefing:\n${aiCoreAnalysisSummary || 'No core analysis summary.'}`, 'high', 'sticky'),
                        createContextSection('existing_contextual_summary', `Existing contextual summary:\n${contextualSummary || 'None yet.'}`, 'medium', 'sticky'),
                        createContextSection('card_titles', `Cards on screen:\n${formatCardTitles(analysisCards)}`, 'medium', 'prunable'),
                        createContextSection('recent_history', `Recent conversation:\n${formatCollapsedChatHistory(chatHistory, settings)}`, 'high', 'prunable'),
                    ],
                    settings,
                    modelId,
                    compactionMode,
                });
                diagnostics = managed.diagnostics;
                reportContextDiagnostics(telemetryTarget, diagnostics);

                const msgs = [
                    { role: 'system' as const, content: managed.systemText },
                    { role: 'user' as const, content: managed.userText },
                ];
                try {
                    return await streamGenerateText({ model, messages: msgs });
                } catch (primaryErr) {
                    if (isTransientProviderError(primaryErr)) {
                        const fb = createFallbackProviderModel(settings, modelId);
                        if (fb) {
                            console.warn(`[ContextSummary] Primary model "${modelId}" transient error, retrying with fallback "${fb.modelId}"`);
                            return streamGenerateText({ model: fb.model, messages: msgs });
                        }
                    }
                    throw primaryErr;
                }
            },
        });
        const summary = result.text || fallback;
        const usedFallback = !result.text;
        reportContextCompaction(telemetryTarget, diagnostics, {
            usedFallback,
            reason: usedFallback ? 'fallback_empty_response' : 'ai',
            summaryLength: summary.length,
        });
        return { summary, usedFallback, diagnostics };
    } catch (error) {
        console.error('Failed to generate contextual summary:', error);
        reportContextCompaction(
            telemetryTarget,
            diagnostics ?? buildFallbackContextDiagnostics({
                callType: 'summary',
                text: fallback,
                settings,
                modelId: settings.simpleModel,
            }),
            {
                usedFallback: true,
                reason: 'fallback_error',
                summaryLength: fallback.length,
            },
        );
        return { summary: fallback, usedFallback: true, diagnostics };
    }
};
