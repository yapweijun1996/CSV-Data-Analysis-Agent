// @vitest-environment node

/**
 * Tests for detectValueConcentration (Pareto / 80-20 phase in the harness).
 *
 * The function is a pure computation over leaf totals — no SQL or mocks needed.
 * It returns null when there are fewer than 3 items.
 */

import { describe, expect, it } from 'vitest';
import { detectValueConcentration } from '../services/agent/runtime/dataInvestigationHarness';

// Helper: build a DescriptionTotal-compatible array
const makeTotals = (values: number[]) =>
    values.map((v, i) => ({ description: `Item${i + 1}`, total: v, rowCount: 1 }));

describe('detectValueConcentration', () => {
    it('returns null when fewer than 3 items', () => {
        expect(detectValueConcentration([])).toBeNull();
        expect(detectValueConcentration(makeTotals([100]))).toBeNull();
        expect(detectValueConcentration(makeTotals([100, 200]))).toBeNull();
    });

    it('returns null when total absolute value is 0', () => {
        // All zeros — can't compute concentration
        expect(detectValueConcentration(makeTotals([0, 0, 0, 0]))).toBeNull();
    });

    it('detects Pareto when top 20% of items dominate (classic 80/20)', () => {
        // 5 items: top 1 (20%) = 850 out of 1000 total = 85% → Pareto
        const totals = makeTotals([850, 50, 50, 30, 20]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.isPareto).toBe(true);
        expect(result!.top20Pct).toBeGreaterThanOrEqual(0.8);
        expect(result!.recommendedTopN).toBe(5);
    });

    it('does NOT flag Pareto when value is evenly distributed', () => {
        // 10 items, all equal — top 20% (2 items) = 20% of value
        const totals = makeTotals([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.isPareto).toBe(false);
        expect(result!.recommendedTopN).toBeNull();
        expect(result!.top20Pct).toBeCloseTo(0.2, 2);
    });

    it('handles negative values using absolute value for concentration', () => {
        // 5 items: top 1 by abs = 900 (negative), rest are small positives → Pareto
        const totals = makeTotals([-900, 40, 30, 20, 10]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.isPareto).toBe(true);
        expect(result!.top20Pct).toBeGreaterThanOrEqual(0.8);
    });

    it('uses ceil for top-20% count so single-item datasets are handled', () => {
        // 3 items: ceil(3 * 0.2) = 1 → top 1 = 900 out of 1000 = 90% → Pareto
        const totals = makeTotals([900, 60, 40]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.isPareto).toBe(true);
    });

    it('boundary: exactly 80% concentration is Pareto', () => {
        // 5 items: top 1 = 800 out of 1000 = exactly 80% → Pareto (≥ threshold)
        const totals = makeTotals([800, 50, 50, 50, 50]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.isPareto).toBe(true);
        expect(result!.top20Pct).toBeCloseTo(0.8, 5);
    });

    it('boundary: 79% concentration is NOT Pareto', () => {
        // 5 items: top 1 = 790 out of 1010 ≈ 78.2% → not Pareto
        const totals = makeTotals([790, 60, 60, 60, 40]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.isPareto).toBe(false);
    });

    it('recommendedTopN is null when not Pareto', () => {
        const totals = makeTotals([200, 200, 200, 200, 200]);
        const result = detectValueConcentration(totals);
        expect(result!.recommendedTopN).toBeNull();
    });

    it('returns correct top20Pct value', () => {
        // 10 items: top 2 (20%) = 600+200 = 800 out of 1000 = 80% → Pareto
        const totals = makeTotals([600, 200, 50, 40, 30, 25, 20, 15, 10, 10]);
        const result = detectValueConcentration(totals);
        expect(result).not.toBeNull();
        expect(result!.top20Pct).toBeCloseTo(0.8, 3);
        expect(result!.isPareto).toBe(true);
    });
});
