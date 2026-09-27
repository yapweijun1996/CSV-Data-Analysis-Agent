import { contentText, type Api, type Model, type Models } from '@earendil-works/pi-ai';
import {
    convertToLlm, estimateContextTokens, estimateTokens, serializeConversation,
    type AgentMessage,
} from '@earendil-works/pi-agent-core';
import {
    PI_CONTEXT_COMPACTION_KEEP_RECENT_TOKENS,
    PI_CONTEXT_COMPACTION_TRIGGER_RATIO,
} from '../../../../config/agentDefaults';

type SummarizeHistory = (messages: AgentMessage[], signal?: AbortSignal) => Promise<string>;

const projectedTokens = (messages: AgentMessage[], hasSummary: boolean): number => {
    const visibleTokens = Math.ceil(JSON.stringify(messages).length / 3);
    return hasSummary ? visibleTokens : Math.max(visibleTokens, estimateContextTokens(messages).tokens);
};

/** Compact only completed history; keep the system instruction and recent tool-call pairs. */
export const createPiContextCompactor = (
    contextWindow: number,
    summarize: SummarizeHistory,
) => {
    if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
        throw new Error('Pi requires a known context window for automatic compaction.');
    }
    const triggerTokens = Math.floor(contextWindow * PI_CONTEXT_COMPACTION_TRIGGER_RATIO);
    let summary = '';
    let summarizedThrough = 1;
    let summaryTimestamp = 0;

    return async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
        if (messages[0]?.role !== 'system') return messages;
        // Agent's default convertToLlm retains user messages but drops custom summary roles.
        const summaryMessage = (): AgentMessage => ({
            role: 'user', content: [{ type: 'text', text: `Earlier conversation summary:\n${summary}` }],
            timestamp: summaryTimestamp,
        });
        const projected = [
            messages[0],
            ...(summary ? [summaryMessage()] : []),
            ...messages.slice(summarizedThrough),
        ];
        const estimated = projectedTokens(projected, Boolean(summary));
        if (estimated < triggerTokens) return projected;

        let cut = projected.length;
        let recentTokens = 0;
        while (cut > 1 && recentTokens < PI_CONTEXT_COMPACTION_KEEP_RECENT_TOKENS) {
            cut -= 1;
            recentTokens += estimateTokens(projected[cut]);
        }
        while (cut > 1 && projected[cut].role === 'toolResult') cut -= 1;
        if (cut <= (summary ? 2 : 1)) return projected;

        try {
            const nextSummary = (await summarize(projected.slice(1, cut), signal)).trim();
            if (!nextSummary || nextSummary.length > 20_000 || signal?.aborted) return projected;
            const nextSummarizedThrough = summarizedThrough + cut - 1 - (summary ? 1 : 0);
            const nextTimestamp = Date.now();
            const compacted: AgentMessage[] = [
                messages[0],
                { role: 'user', content: [{ type: 'text', text: `Earlier conversation summary:\n${nextSummary}` }], timestamp: nextTimestamp },
                ...messages.slice(nextSummarizedThrough),
            ];
            if (projectedTokens(compacted, true) >= triggerTokens) return projected;
            summary = nextSummary;
            summarizedThrough = nextSummarizedThrough;
            summaryTimestamp = nextTimestamp;
            return compacted;
        } catch {
            // Pi's transformContext contract requires a safe fallback on summary failure.
            return projected;
        }
    };
};

export const createPiProviderContextCompactor = (
    model: Model<Api>,
    models: Models,
    apiKey: string,
    providerFetch: typeof fetch,
) => createPiContextCompactor(model.contextWindow, async (messages, signal) => {
    const history = serializeConversation(convertToLlm(messages));
    const response = await models.completeSimple(model, {
        systemPrompt: 'Summarize earlier Pi agent history for continuation. Preserve the user goal, dataset identity, completed tool results, decisions, and outstanding work. Never invent evidence or include credentials. Keep the summary concise.',
        messages: [{
            role: 'user',
            content: [{ type: 'text', text: history }],
            timestamp: Date.now(),
        }],
    }, {
        apiKey,
        fetch: providerFetch,
        signal,
        timeoutMs: 45_000,
        maxRetries: 0,
    });
    if (response.stopReason === 'error' || response.stopReason === 'aborted') {
        throw new Error('Pi context summarization failed.');
    }
    return contentText(response.content);
});
