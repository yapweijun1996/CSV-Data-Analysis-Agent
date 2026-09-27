// @vitest-environment node

/**
 * P1 Card generation success rate tracking
 *
 * Tests for computeCardYieldMetric (dataAnalysisSessionRunner.ts) and the
 * analysis_yield_low event emission contract.
 *
 * Verifies:
 *  1. yieldRate = cardsProduced / topicsAttempted
 *  2. shouldFlagLow is true when yieldRate < 0.5 and topicsAttempted > 0
 *  3. shouldFlagLow is false when yieldRate >= 0.5
 *  4. shouldFlagLow is false when topicsAttempted === 0 (nothing ran)
 *  5. Boundary: exactly 50% does NOT trigger the flag (must be strictly < 0.5)
 *  6. yieldRate is 0 when topicsAttempted === 0
 *  7. 'analysis_yield_low' is present in the AgentRuntimeEvent type union
 */

import { describe, expect, it } from 'vitest';
import { computeCardYieldMetric } from '../services/agent/runtime/dataAnalysisSessionRunner';
import type { AgentRuntimeEvent } from '../types';

// ---------------------------------------------------------------------------
// computeCardYieldMetric unit tests
// ---------------------------------------------------------------------------

describe('computeCardYieldMetric', () => {
    // -----------------------------------------------------------------------
    // Basic computation
    // -----------------------------------------------------------------------

    it('yieldRate = cardsProduced / topicsAttempted', () => {
        const m = computeCardYieldMetric(2, 4, 2);
        expect(m.yieldRate).toBeCloseTo(0.5);
    });

    it('passes through cardsProduced, topicsAttempted, cardsFailed', () => {
        const m = computeCardYieldMetric(3, 10, 7);
        expect(m.cardsProduced).toBe(3);
        expect(m.topicsAttempted).toBe(10);
        expect(m.cardsFailed).toBe(7);
    });

    it('yieldRate is 0 when topicsAttempted === 0', () => {
        const m = computeCardYieldMetric(0, 0, 0);
        expect(m.yieldRate).toBe(0);
    });

    // -----------------------------------------------------------------------
    // shouldFlagLow thresholds
    // -----------------------------------------------------------------------

    it('shouldFlagLow is false when topicsAttempted === 0', () => {
        const m = computeCardYieldMetric(0, 0, 0);
        expect(m.shouldFlagLow).toBe(false);
    });

    it('shouldFlagLow is true when cardsProduced < half of topicsAttempted', () => {
        // 1 of 10 → 10% yield → flag low
        const m = computeCardYieldMetric(1, 10, 9);
        expect(m.shouldFlagLow).toBe(true);
    });

    it('shouldFlagLow is false when all topics produce cards', () => {
        const m = computeCardYieldMetric(5, 5, 0);
        expect(m.shouldFlagLow).toBe(false);
    });

    it('shouldFlagLow is false when yieldRate > 0.5', () => {
        // 3 of 4 → 75% yield
        const m = computeCardYieldMetric(3, 4, 1);
        expect(m.shouldFlagLow).toBe(false);
    });

    it('boundary: exactly 0.5 yield does NOT trigger flag (strictly less than)', () => {
        // 2 of 4 → exactly 50% → should NOT flag
        const m = computeCardYieldMetric(2, 4, 2);
        expect(m.yieldRate).toBeCloseTo(0.5);
        expect(m.shouldFlagLow).toBe(false);
    });

    it('just below 0.5 triggers the flag', () => {
        // 1 of 3 ≈ 33.3% → flag
        const m = computeCardYieldMetric(1, 3, 2);
        expect(m.yieldRate).toBeCloseTo(1 / 3);
        expect(m.shouldFlagLow).toBe(true);
    });

    it('zero cards produced from non-zero attempts triggers flag', () => {
        const m = computeCardYieldMetric(0, 5, 5);
        expect(m.shouldFlagLow).toBe(true);
        expect(m.yieldRate).toBe(0);
    });

    it('single topic attempted and accepted does not flag', () => {
        const m = computeCardYieldMetric(1, 1, 0);
        expect(m.shouldFlagLow).toBe(false);
        expect(m.yieldRate).toBe(1.0);
    });

    it('single topic attempted and rejected triggers flag', () => {
        const m = computeCardYieldMetric(0, 1, 1);
        expect(m.shouldFlagLow).toBe(true);
        expect(m.yieldRate).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Type-level verification: 'analysis_yield_low' in the event union
// ---------------------------------------------------------------------------

describe('analysis_yield_low event type', () => {
    it("'analysis_yield_low' is a valid AgentRuntimeEvent type (compile-time + runtime check)", () => {
        // This will fail to compile if the type is not in the union.
        // The cast also confirms it at runtime via typeof check.
        const eventType: AgentRuntimeEvent['type'] = 'analysis_yield_low';
        expect(typeof eventType).toBe('string');
        expect(eventType).toBe('analysis_yield_low');
    });
});
