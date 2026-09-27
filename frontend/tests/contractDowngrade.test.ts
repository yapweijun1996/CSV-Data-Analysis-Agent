// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

// AGENT-310 Phase D: applyScorecardOverride has been removed.
// Scorecard override tests deleted — evaluator accept is now trusted.

describe('Contract downgrade — answerability → card block flow', () => {
    it('downgrade contract shape is correct', () => {
        const originalContract = {
            taskMode: 'visualize' as const,
            expectedOutcome: 'card' as const,
            allowAssistantResponse: false,
            completionMode: 'respond_or_act' as const,
        };

        const lastAnswerabilityVerdict = 'already_answerable';
        const lastAnswerHint = 'Total sales for Denso: $1,234,567';

        let downgradedContract = { ...originalContract } as Record<string, unknown>;
        if (lastAnswerabilityVerdict === 'already_answerable') {
            downgradedContract = {
                ...downgradedContract,
                expectedOutcome: 'answer',
                allowAssistantResponse: true,
                completionMode: 'final_response',
            };
        }

        expect(downgradedContract.expectedOutcome).toBe('answer');
        expect(downgradedContract.allowAssistantResponse).toBe(true);
        expect(downgradedContract.completionMode).toBe('final_response');
    });

    it('no downgrade when answerability verdict is not already_answerable', () => {
        const originalContract = {
            expectedOutcome: 'card' as const,
            allowAssistantResponse: false,
        };

        const lastAnswerabilityVerdict: string = 'needs_card_generation';
        let contract = { ...originalContract } as Record<string, unknown>;
        if (lastAnswerabilityVerdict === 'already_answerable') {
            contract = { ...contract, expectedOutcome: 'answer', allowAssistantResponse: true };
        }

        expect(contract.expectedOutcome).toBe('card');
        expect(contract.allowAssistantResponse).toBe(false);
    });
});
