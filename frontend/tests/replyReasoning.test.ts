import { describe, expect, it } from 'vitest';
import { createReplyTelemetryTracker } from '../utils/replyTelemetry';

const update = (content: Array<{ type: string; text?: string; thinking?: string }>) =>
    ({ type: 'message_update', message: { role: 'assistant', content } });
const end = (content: Array<{ type: string; text?: string; thinking?: string }>) =>
    ({ type: 'message_end', message: { role: 'assistant', content } });

describe('reply reasoning capture', () => {
    it('streams thinking live and keeps it across provider rounds', () => {
        const tracker = createReplyTelemetryTracker();
        tracker.observe(update([{ type: 'thinking', thinking: 'Plan the query' }]));
        expect(tracker.reasoning()).toBe('Plan the query');
        tracker.observe(end([{ type: 'thinking', thinking: 'Plan the query' }, { type: 'toolCall' }]));
        tracker.observe(update([{ type: 'thinking', thinking: 'Read the result' }, { type: 'text', text: 'Done' }]));
        expect(tracker.reasoning()).toBe('Plan the query\n\nRead the result');
        tracker.observe(end([{ type: 'thinking', thinking: 'Read the result' }, { type: 'text', text: 'Done' }]));
        expect(tracker.snapshot('medium').reasoningText).toBe('Plan the query\n\nRead the result');
    });
    it('omits reasoningText when the model returned no thinking', () => {
        const tracker = createReplyTelemetryTracker();
        tracker.observe(update([{ type: 'text', text: 'Hi' }]));
        tracker.observe(end([{ type: 'text', text: 'Hi' }]));
        expect(tracker.snapshot().reasoningText).toBeUndefined();
    });
});
