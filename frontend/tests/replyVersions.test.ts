import { describe, expect, it } from 'vitest';
import { appendReplyVersion, getReplyVersionIndex, getReplyVersions, selectReplyVersion } from '../utils/replyVersions';
import type { ChatMessage } from '../types/chat';

const base: ChatMessage = { id: 'a1', sender: 'ai', type: 'ai_message', text: 'first', timestamp: new Date(1), telemetry: { durationMs: 10 } };

describe('reply versions', () => {
    it('treats a plain message as a single version', () => {
        expect(getReplyVersions(base)).toHaveLength(1);
        expect(getReplyVersionIndex(base)).toBe(0);
    });

    it('appends a retry as the active version and swaps content back and forth', () => {
        const retried = appendReplyVersion(base, { text: 'second', timestamp: new Date(2), cardId: 'c2', telemetry: { durationMs: 20 } });
        expect(retried).toMatchObject({ text: 'second', cardId: 'c2', versionIndex: 1 });
        expect(retried.versions).toHaveLength(2);
        const back = selectReplyVersion(retried, 0);
        expect(back).toMatchObject({ text: 'first', versionIndex: 0, telemetry: { durationMs: 10 } });
        expect(back.cardId).toBeUndefined();
        expect(selectReplyVersion(back, 5)).toBe(back);
    });
});

import { excludeRetriedTurn } from '../utils/replyVersions';
describe('excludeRetriedTurn', () => {
    const u1: ChatMessage = { id: 'u1', sender: 'user', type: 'user_message', text: 'q1', timestamp: new Date(0) };
    const a1: ChatMessage = { ...base, id: 'a1' };
    const u2: ChatMessage = { id: 'u2', sender: 'user', type: 'user_message', text: 'q2', timestamp: new Date(0) };
    const a2: ChatMessage = { ...base, id: 'a2', text: 'second' };
    it('drops only the retried question and its answer', () => {
        expect(excludeRetriedTurn([u1, a1, u2, a2], 'a2').map(m => m.id)).toEqual(['u1', 'a1']);
    });
    it('is a no-op without a retry target', () => {
        const history = [u1, a1];
        expect(excludeRetriedTurn(history, null)).toBe(history);
        expect(excludeRetriedTurn(history, 'missing')).toBe(history);
    });
});
