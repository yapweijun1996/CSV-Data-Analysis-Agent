import type { ReplyTelemetry } from '../types/chat';

/** Minimal structural view of the Pi agent events this tracker reads. */
interface TelemetryEvent {
    type: string;
    message?: {
        role?: string;
        model?: string;
        content?: string | Array<{ type: string; text?: string; thinking?: string }>;
        usage?: {
            input?: number;
            output?: number;
            totalTokens?: number;
            cost?: { total?: number };
        };
    };
}

const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Measures one reply across every provider round of a Pi turn.
 * TTFT = first streamed assistant content; TPS = output tokens over the
 * first-token to last-token window, so tool execution time is not blamed on the model.
 */
export const createReplyTelemetryTracker = (now: () => number = Date.now) => {
    const startedAt = now();
    let firstTokenAt: number | undefined;
    let lastTokenAt: number | undefined;
    let input = 0;
    let output = 0;
    let total = 0;
    let cost = 0;
    let sawUsage = false;
    let sawCost = false;
    let model: string | undefined;

    return {
        observe(event: TelemetryEvent): void {
            const message = event.message;
            if (!message || message.role !== 'assistant') return;
            if (event.type === 'message_update') {
                const hasContent = Array.isArray(message.content) && message.content.some(part =>
                    (part.type === 'text' && part.text) || (part.type === 'thinking' && part.thinking));
                if (hasContent) {
                    const t = now();
                    firstTokenAt ??= t;
                    lastTokenAt = t;
                }
            } else if (event.type === 'message_end') {
                lastTokenAt = now();
                if (message.model) model = message.model;
                const usage = message.usage;
                if (usage) {
                    if (finite(usage.input)) { input += usage.input; sawUsage = true; }
                    if (finite(usage.output)) { output += usage.output; sawUsage = true; }
                    if (finite(usage.totalTokens)) { total += usage.totalTokens; sawUsage = true; }
                    if (finite(usage.cost?.total)) { cost += usage.cost.total; sawCost = true; }
                }
            }
        },
        snapshot(reasoningEffort?: string): ReplyTelemetry {
            const end = now();
            const generationMs = firstTokenAt !== undefined && lastTokenAt !== undefined ? lastTokenAt - firstTokenAt : 0;
            return {
                model,
                reasoningEffort,
                ttftMs: firstTokenAt !== undefined ? firstTokenAt - startedAt : undefined,
                durationMs: end - startedAt,
                ...(sawUsage ? { inputTokens: input, outputTokens: output, totalTokens: total || input + output } : {}),
                ...(sawCost ? { costUsd: cost } : {}),
                ...(output > 0 && generationMs > 0 ? { tps: output / (generationMs / 1000) } : {}),
            };
        },
    };
};

export const formatReplyDuration = (ms: number | undefined): string =>
    ms === undefined ? 'N/A' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

export const formatReplyCost = (usd: number | undefined): string => {
    if (usd === undefined) return 'N/A';
    if (usd === 0) return '$0.00';
    return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(4)}`;
};

export const buildReplyMetricItems = (t: ReplyTelemetry): Array<[label: string, value: string]> => {
    const items: Array<[string, string]> = [];
    if (t.tps !== undefined) items.push(['TPS', t.tps.toFixed(1)]);
    if (t.ttftMs !== undefined) items.push(['TTFT', formatReplyDuration(t.ttftMs)]);
    items.push(['Duration', formatReplyDuration(t.durationMs)]);
    if (t.totalTokens !== undefined) items.push(['Tokens', t.totalTokens.toLocaleString('en-US')]);
    if (t.costUsd !== undefined) items.push(['Cost', formatReplyCost(t.costUsd)]);
    return items;
};
