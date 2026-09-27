import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types';
import { handleChatAction } from '../services/agent/chatAgent';

describe('chatAgent', () => {
    it('persists up to three assistant suggested actions into chat history', () => {
        let chatHistory: ChatMessage[] = [];
        const store = {
            setState: (updater: (current: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] }) => {
                chatHistory = updater({ chatHistory }).chatHistory;
            },
        } as never;

        handleChatAction({
            type: 'assistant_message',
            message: 'The analysis is ready.',
            cardId: 'card-1',
            suggestedActions: [
                { label: ' Show top outliers ', action: ' show top outliers ' },
                { label: 'Drill into variance', action: 'drill into variance' },
                { label: 'Inspect nulls', action: 'inspect nulls' },
                { label: 'Extra action', action: 'extra action' },
            ],
        }, store);

        expect(chatHistory).toHaveLength(1);
        expect(chatHistory[0]?.cardId).toBe('card-1');
        expect(chatHistory[0]?.suggestedActions).toEqual([
            { label: 'Show top outliers', action: 'show top outliers' },
            { label: 'Drill into variance', action: 'drill into variance' },
            { label: 'Inspect nulls', action: 'inspect nulls' },
        ]);
    });

    it('replaces internal tool names in suggested actions with the user-facing label', () => {
        let chatHistory: ChatMessage[] = [];
        const store = {
            setState: (updater: (current: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] }) => {
                chatHistory = updater({ chatHistory }).chatHistory;
            },
        } as never;

        handleChatAction({
            type: 'assistant_message',
            message: 'The metric mapping needs confirmation.',
            suggestedActions: [
                { label: '验证利润与毛利率映射逻辑', action: 'analysis.validate_metric_mapping' },
            ],
        }, store);

        expect(chatHistory[0]?.suggestedActions).toEqual([
            { label: '验证利润与毛利率映射逻辑', action: '验证利润与毛利率映射逻辑' },
        ]);
    });
});
