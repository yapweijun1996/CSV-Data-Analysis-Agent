import { describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import type { ChatMessage } from '../types/chat';

const user: ChatMessage = { id: 'u1', sender: 'user', type: 'user_message', text: 'avg price?', timestamp: new Date(0) };
const ai: ChatMessage = { id: 'a1', sender: 'ai', type: 'ai_message', text: 'first', timestamp: new Date(1) };

describe('reply actions in the chat store', () => {
    it('retry targets the newest answer and re-sends the original prompt without a new user bubble', async () => {
        const handle = vi.fn(async () => { /* turn finalization would clear the target */ });
        useAppStore.setState({ chatHistory: [user, ai], isBusy: false, activeTurn: null, pendingReplyRetryId: null, handleChatMessage: handle } as never);
        const pending = useAppStore.getState().retryAssistantReply('a1');
        expect(useAppStore.getState().pendingReplyRetryId).toBe('a1');
        await pending;
        expect(handle).toHaveBeenCalledWith('avg price?', { source: 'retry' });
        expect(useAppStore.getState().chatHistory).toHaveLength(2);
        expect(useAppStore.getState().pendingReplyRetryId).toBeNull();
    });

    it('does not retry an older answer', async () => {
        const handle = vi.fn(async () => {});
        const newer: ChatMessage = { ...ai, id: 'a2', text: 'second' };
        useAppStore.setState({ chatHistory: [user, ai, newer], isBusy: false, activeTurn: null, pendingReplyRetryId: null, handleChatMessage: handle } as never);
        await useAppStore.getState().retryAssistantReply('a1');
        expect(handle).not.toHaveBeenCalled();
    });

    it('deletes only the chosen reply and refuses while busy', () => {
        useAppStore.setState({ chatHistory: [user, ai], isBusy: true } as never);
        useAppStore.getState().deleteChatMessage('a1');
        expect(useAppStore.getState().chatHistory).toHaveLength(2);
        useAppStore.setState({ isBusy: false } as never);
        useAppStore.getState().deleteChatMessage('a1');
        expect(useAppStore.getState().chatHistory.map(m => m.id)).toEqual(['u1']);
    });
});
