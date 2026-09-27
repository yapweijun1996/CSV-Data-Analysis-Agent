// @vitest-environment node

/**
 * Tests for analyzeTemporalContinuity (Temporal Continuity phase in the harness).
 *
 * The function is a pure computation over sorted date strings — no SQL or mocks needed.
 * Returns null when fewer than 3 distinct dates are provided.
 */

import { describe, expect, it } from 'vitest';
import { analyzeTemporalContinuity } from '../services/agent/runtime/dataInvestigationHarness';

// Helper: generate ISO date strings for N consecutive months starting from a base date
const monthDates = (startYear: number, startMonth: number, count: number): string[] => {
    const dates: string[] = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(startYear, startMonth - 1 + i, 1);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
};

// Helper: generate ISO date strings for N consecutive days starting from a base date
const dayDates = (start: string, count: number): string[] => {
    const dates: string[] = [];
    const base = new Date(start).getTime();
    for (let i = 0; i < count; i++) {
        dates.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
    }
    return dates;
};

describe('analyzeTemporalContinuity', () => {
    // -----------------------------------------------------------------------
    // Null / guard cases
    // -----------------------------------------------------------------------

    it('returns null when fewer than 3 dates', () => {
        expect(analyzeTemporalContinuity('dt', [])).toBeNull();
        expect(analyzeTemporalContinuity('dt', ['2024-01-01'])).toBeNull();
        expect(analyzeTemporalContinuity('dt', ['2024-01-01', '2024-02-01'])).toBeNull();
    });

    it('returns null when fewer than 3 parseable dates (invalid strings filtered out)', () => {
        expect(analyzeTemporalContinuity('dt', ['not-a-date', 'also-invalid', 'bad'])).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Granularity detection
    // -----------------------------------------------------------------------

    it('detects monthly granularity for consecutive months', () => {
        const dates = monthDates(2024, 1, 12); // Jan–Dec 2024
        const result = analyzeTemporalContinuity('ReportDate', dates);
        expect(result).not.toBeNull();
        expect(result!.granularity).toBe('monthly');
        expect(result!.column).toBe('ReportDate');
    });

    it('detects daily granularity for consecutive days', () => {
        const dates = dayDates('2024-01-01', 30);
        const result = analyzeTemporalContinuity('Date', dates);
        expect(result).not.toBeNull();
        expect(result!.granularity).toBe('daily');
    });

    it('detects weekly granularity for every-7-day series', () => {
        const base = new Date('2024-01-01').getTime();
        const dates = Array.from({ length: 10 }, (_, i) =>
            new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10),
        );
        const result = analyzeTemporalContinuity('WeekStart', dates);
        expect(result).not.toBeNull();
        expect(result!.granularity).toBe('weekly');
    });

    it('detects quarterly granularity (approx 91-day gaps)', () => {
        const base = new Date('2020-01-01').getTime();
        const dates = Array.from({ length: 8 }, (_, i) =>
            new Date(base + i * 91 * 86_400_000).toISOString().slice(0, 10),
        );
        const result = analyzeTemporalContinuity('Quarter', dates);
        expect(result).not.toBeNull();
        expect(result!.granularity).toBe('quarterly');
    });

    it('returns unknown granularity for irregular gaps', () => {
        // Gaps of 50, 50, 50 — doesn't fit any known window
        const base = new Date('2022-01-01').getTime();
        const dates = Array.from({ length: 5 }, (_, i) =>
            new Date(base + i * 50 * 86_400_000).toISOString().slice(0, 10),
        );
        const result = analyzeTemporalContinuity('IrregularDate', dates);
        expect(result).not.toBeNull();
        expect(result!.granularity).toBe('unknown');
    });

    // -----------------------------------------------------------------------
    // Continuity detection
    // -----------------------------------------------------------------------

    it('marks isContinuous true for a complete monthly series (no gaps)', () => {
        const dates = monthDates(2023, 1, 12);
        const result = analyzeTemporalContinuity('Month', dates);
        expect(result).not.toBeNull();
        expect(result!.gapCount).toBe(0);
        expect(result!.isContinuous).toBe(true);
    });

    it('detects missing months and reflects in gapCount', () => {
        // Jan, Feb, [skip Mar], Apr, May = 1 missing period
        const dates = ['2024-01-01', '2024-02-01', '2024-04-01', '2024-05-01', '2024-06-01'];
        const result = analyzeTemporalContinuity('Month', dates);
        expect(result).not.toBeNull();
        expect(result!.gapCount).toBeGreaterThan(0);
    });

    it('marks isContinuous false when gap rate exceeds 10%', () => {
        // Daily series but with a 30-day jump buried in the middle
        // Days 1, 2, 3 → jump 30 days → days 33, 34, 35
        // Modal gap = 1 day; 29 missing periods out of ~35 span → >> 10%
        const base = new Date('2024-01-01').getTime();
        const MS = 86_400_000;
        const dates = [
            new Date(base + 0 * MS).toISOString().slice(0, 10),
            new Date(base + 1 * MS).toISOString().slice(0, 10),
            new Date(base + 2 * MS).toISOString().slice(0, 10),
            new Date(base + 32 * MS).toISOString().slice(0, 10),
            new Date(base + 33 * MS).toISOString().slice(0, 10),
            new Date(base + 34 * MS).toISOString().slice(0, 10),
        ];
        const result = analyzeTemporalContinuity('Date', dates);
        expect(result).not.toBeNull();
        expect(result!.isContinuous).toBe(false);
        expect(result!.gapCount).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // spanPeriods and runtime directives
    // -----------------------------------------------------------------------

    it('spanPeriods >= 6 for a 12-month series', () => {
        const dates = monthDates(2024, 1, 12);
        const result = analyzeTemporalContinuity('Month', dates);
        expect(result).not.toBeNull();
        expect(result!.spanPeriods).toBeGreaterThanOrEqual(6);
    });

    it('spanPeriods is small for a short 3-month series', () => {
        const dates = monthDates(2024, 1, 3);
        const result = analyzeTemporalContinuity('Month', dates);
        expect(result).not.toBeNull();
        expect(result!.spanPeriods).toBeLessThan(6);
    });

    // -----------------------------------------------------------------------
    // Column name is preserved
    // -----------------------------------------------------------------------

    it('preserves the column name in the result', () => {
        const dates = monthDates(2024, 1, 6);
        const result = analyzeTemporalContinuity('TransactionDate', dates);
        expect(result!.column).toBe('TransactionDate');
    });
});
