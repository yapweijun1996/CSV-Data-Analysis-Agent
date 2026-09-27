// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { prepareAgrunClarificationCompatibilityRequest } from '../services/agent/runtime/agrun/clarificationCompatibility';

const createStore = () => {
    let state = {
        pendingClarification: {
            question: 'Which metric should be used?',
            options: [
                { label: 'Revenue', value: 'Revenue' },
                { label: 'Cost', value: 'Cost' },
            ],
            resumeContext: {
                resumeOriginalUserMessage: 'Compare the selected metric by region.',
                selectedPath: 'data_query',
                mustPreserveOutcome: 'table' as const,
            },
        },
        activeTurn: {
            userMessage: 'Compare the selected metric by region.',
        },
        columnProfiles: [
            { name: 'Region' },
            { name: 'Revenue' },
            { name: 'Cost' },
        ],
        settings: {
            language: 'English',
        },
        chatHistory: [] as Array<Record<string, unknown>>,
    };

    return {
        getState: () => state,
        setState: (
            update:
                | Partial<typeof state>
                | ((current: typeof state) => Partial<typeof state>),
        ) => {
            const partial =
                typeof update === 'function' ? update(state) : update;
            state = { ...state, ...partial } as typeof state;
        },
    };
};

describe('AGRUN-012 clarification compatibility', () => {
    it('converts a persisted legacy clarification into a fresh Agrun request', async () => {
        const store = createStore();

        const request = await prepareAgrunClarificationCompatibilityRequest(
            { label: 'Revenue', value: 'Revenue' },
            store as never,
        );

        expect(request?.message).toContain(
            'Original user request: Compare the selected metric by region.',
        );
        expect(request?.message).toContain('Selected option: Revenue');
        expect(request?.message).toContain('Must preserve outcome: table');
        expect(store.getState().pendingClarification).toBeNull();
        expect(store.getState().activeTurn).toBeNull();
        expect(store.getState().chatHistory).toEqual([
            expect.objectContaining({
                sender: 'user',
                text: 'Clarification selected: Revenue',
            }),
        ]);
    });
});
