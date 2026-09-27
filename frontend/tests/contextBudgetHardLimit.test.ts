// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { isHardBudgetExceeded } from '../services/ai/contextBudget';
import { CONTEXT_HARD_BUDGET_RATIO } from '../config/agentDefaults';

describe('isHardBudgetExceeded', () => {
    it('returns exceeded when estimated tokens exceed hard budget ratio', () => {
        const contextWindow = 128_000;
        const limit = Math.floor(contextWindow * CONTEXT_HARD_BUDGET_RATIO);
        const result = isHardBudgetExceeded(contextWindow, limit + 1);

        expect(result.exceeded).toBe(true);
        expect(result.limit).toBe(limit);
        expect(result.current).toBe(limit + 1);
    });

    it('returns not exceeded when estimated tokens are within hard budget', () => {
        const contextWindow = 128_000;
        const limit = Math.floor(contextWindow * CONTEXT_HARD_BUDGET_RATIO);
        const result = isHardBudgetExceeded(contextWindow, limit - 1000);

        expect(result.exceeded).toBe(false);
        expect(result.limit).toBe(limit);
    });

    it('returns not exceeded at exactly the limit boundary', () => {
        const contextWindow = 128_000;
        const limit = Math.floor(contextWindow * CONTEXT_HARD_BUDGET_RATIO);
        const result = isHardBudgetExceeded(contextWindow, limit);

        expect(result.exceeded).toBe(false);
    });

    it('returns not exceeded when context window is null (unknown model)', () => {
        const result = isHardBudgetExceeded(null, 999_999);

        expect(result.exceeded).toBe(false);
        expect(result.limit).toBe(0);
    });

    it('returns not exceeded when context window is zero', () => {
        const result = isHardBudgetExceeded(0, 100);

        expect(result.exceeded).toBe(false);
    });

    it('works with Gemini-scale context windows', () => {
        const contextWindow = 250_000;
        const limit = Math.floor(contextWindow * CONTEXT_HARD_BUDGET_RATIO); // 230,000
        const result = isHardBudgetExceeded(contextWindow, 240_000);

        expect(result.exceeded).toBe(true);
        expect(result.limit).toBe(limit);
    });

    it('CONTEXT_HARD_BUDGET_RATIO is between 0.8 and 0.99', () => {
        expect(CONTEXT_HARD_BUDGET_RATIO).toBeGreaterThanOrEqual(0.8);
        expect(CONTEXT_HARD_BUDGET_RATIO).toBeLessThan(1.0);
    });
});
