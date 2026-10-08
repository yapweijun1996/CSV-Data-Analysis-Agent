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

/** Reported when compaction was needed but could not shrink the history. */
export interface PiCompactionDegradation {
    reason: 'summary_failed' | 'summary_unusable' | 'compaction_ineffective';
    error: unknown;
    estimatedTokens: number;
}

type OnCompactionDegraded = (degradation: PiCompactionDegradation) => void;

const estimateVisibleTokens = (value: unknown): number => {
    const serialized = JSON.stringify(value);
    let nonAsciiUnits = 0;
    for (let index = 0; index < serialized.length; index += 1) {
        if (serialized.charCodeAt(index) > 127) nonAsciiUnits += 1;
    }
    return Math.ceil((serialized.length - nonAsciiUnits) / 3 + nonAsciiUnits * 2);
};

const projectedTokens = (messages: AgentMessage[], hasSummary: boolean): number => {
    const visibleTokens = estimateVisibleTokens(messages);
    return hasSummary ? visibleTokens : Math.max(visibleTokens, estimateContextTokens(messages).tokens);
};

/** Compact only completed history; keep the system instruction and recent tool-call pairs. */
export const createPiContextCompactor = (
    contextWindow: number,
    summarize: SummarizeHistory,
    onDegraded?: OnCompactionDegraded,
) => {
    if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
        throw new Error('Pi requires a known context window for automatic compaction.');
    }
    const triggerTokens = Math.floor(contextWindow * PI_CONTEXT_COMPACTION_TRIGGER_RATIO);
    let summary = '';
    let summarizedThrough = 1;
    let summaryTimestamp = 0;
    // After a failed or ineffective attempt, retrying on every provider turn only
    // repeats a slow summary call. Wait until the history has grown noticeably.
    let retryAboveTokens = 0;
    const retryGrowthTokens = Math.floor(contextWindow * 0.05);
    const degrade = (
        reason: PiCompactionDegradation['reason'],
        error: unknown,
        estimatedTokens: number,
    ) => {
        retryAboveTokens = estimatedTokens + retryGrowthTokens;
        try {
            onDegraded?.({ reason, error, estimatedTokens });
        } catch {
            // Telemetry must never break the Pi turn.
        }
    };

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
        if (estimated < triggerTokens || estimated <= retryAboveTokens) return projected;

        let cut = projected.length;
        let recentTokens = 0;
        while (cut > 1 && recentTokens < PI_CONTEXT_COMPACTION_KEEP_RECENT_TOKENS) {
            const nextTokens = Math.max(
                estimateTokens(projected[cut - 1]),
                estimateVisibleTokens(projected[cut - 1]),
            );
            if (recentTokens > 0 && recentTokens + nextTokens > PI_CONTEXT_COMPACTION_KEEP_RECENT_TOKENS) break;
            cut -= 1;
            recentTokens += nextTokens;
        }
        while (cut > 1 && projected[cut].role === 'toolResult') cut -= 1;
        if (cut <= (summary ? 2 : 1)) return projected;

        try {
            const nextSummary = (await summarize(projected.slice(1, cut), signal)).trim();
            if (signal?.aborted) return projected;
            if (!nextSummary || nextSummary.length > 20_000) {
                degrade('summary_unusable', new Error(nextSummary ? 'Pi summary exceeded the size limit.' : 'Pi summary was empty.'), estimated);
                return projected;
            }
            const nextSummarizedThrough = summarizedThrough + cut - 1 - (summary ? 1 : 0);
            const nextTimestamp = Date.now();
            const compacted: AgentMessage[] = [
                messages[0],
                { role: 'user', content: [{ type: 'text', text: `Earlier conversation summary:\n${nextSummary}` }], timestamp: nextTimestamp },
                ...messages.slice(nextSummarizedThrough),
            ];
            if (projectedTokens(compacted, true) >= triggerTokens) {
                degrade('compaction_ineffective', new Error('Compaction did not bring the history under the trigger.'), estimated);
                return projected;
            }
            retryAboveTokens = 0;
            summary = nextSummary;
            summarizedThrough = nextSummarizedThrough;
            summaryTimestamp = nextTimestamp;
            return compacted;
        } catch (error) {
            // Pi's transformContext contract requires a safe fallback on summary failure.
            if (!signal?.aborted) degrade('summary_failed', error, estimated);
            return projected;
        }
    };
};

export const createPiProviderContextCompactor = (
    model: Model<Api>,
    models: Models,
    apiKey: string,
    providerFetch: typeof fetch | undefined,
    onDegraded?: OnCompactionDegraded,
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
}, onDegraded);
