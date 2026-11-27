import { describe, expect, it } from 'vitest';
import { buildReplyMetricItems, createReplyTelemetryTracker } from '../utils/replyTelemetry';

describe('createReplyTelemetryTracker', () => {
    it('measures TTFT, TPS, tokens and cost across rounds', () => {
        let t = 1000;
        const tracker = createReplyTelemetryTracker(() => t);
        t = 1700;
        tracker.observe({ type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } });
        t = 3700;
        tracker.observe({ type: 'message_end', message: { role: 'assistant', model: 'm1', usage: { input: 100, output: 400, totalTokens: 500, cost: { total: 0.002 } } } });
        t = 4000;
        const snap = tracker.snapshot('high');
        expect(snap).toMatchObject({ model: 'm1', reasoningEffort: 'high', ttftMs: 700, durationMs: 3000, totalTokens: 500, costUsd: 0.002 });
        expect(snap.tps).toBeCloseTo(200, 5);
        expect(buildReplyMetricItems(snap).map(([k]) => k)).toEqual(['TPS', 'TTFT', 'Duration', 'Tokens', 'Cost']);
    });

    it('omits metrics the provider did not report', () => {
        const tracker = createReplyTelemetryTracker(() => 0);
        const snap = tracker.snapshot();
        expect(snap.tps).toBeUndefined();
        expect(buildReplyMetricItems(snap).map(([k]) => k)).toEqual(['Duration']);
    });
});
