import type { ColumnProfile } from '../../../types';
import type { DuckDbAnalysisBinding, TemporalProfile } from './investigationTypes';
import { QUERY_TIMEOUT_MS } from './investigationTypes';
import { executeUnifiedQuery } from '../../duckdb/unifiedQueryExecutor';
import type { QueryIntent } from '../../duckdb/queryIntent';

const MS_PER_DAY = 86_400_000;

// Map modal gap in days to a human-readable granularity label.
const inferGranularity = (modalGapDays: number): TemporalProfile['granularity'] => {
    if (modalGapDays <= 2) return 'daily';
    if (modalGapDays >= 5 && modalGapDays <= 9) return 'weekly';
    if (modalGapDays >= 25 && modalGapDays <= 35) return 'monthly';
    if (modalGapDays >= 80 && modalGapDays <= 100) return 'quarterly';
    if (modalGapDays >= 350 && modalGapDays <= 380) return 'yearly';
    return 'unknown';
};

/**
 * Pure function: given a column name and an already-sorted list of ISO date strings,
 * computes the temporal continuity profile. Exported for unit testing.
 * Returns null when fewer than 3 distinct dates are available.
 */
export const analyzeTemporalContinuity = (
    column: string,
    sortedDateStrings: string[],
): TemporalProfile | null => {
    if (sortedDateStrings.length < 3) return null;

    const parsedMs = sortedDateStrings
        .map(s => new Date(s).getTime())
        .filter(ms => !isNaN(ms));
    if (parsedMs.length < 3) return null;

    // Compute consecutive gaps in days
    const gapDays: number[] = [];
    for (let i = 1; i < parsedMs.length; i++) {
        const dayGap = (parsedMs[i] - parsedMs[i - 1]) / MS_PER_DAY;
        if (dayGap > 0) gapDays.push(Math.round(dayGap));
    }
    if (gapDays.length === 0) return null;

    // Find modal gap (most frequently occurring gap size)
    const gapFreq = new Map<number, number>();
    for (const g of gapDays) gapFreq.set(g, (gapFreq.get(g) ?? 0) + 1);
    const modalGap = [...gapFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const granularity = inferGranularity(modalGap);

    // spanPeriods: total span divided by expected period length
    const spanDays = (parsedMs[parsedMs.length - 1] - parsedMs[0]) / MS_PER_DAY;
    const spanPeriods = modalGap > 0 ? Math.max(1, Math.round(spanDays / modalGap)) + 1 : parsedMs.length;

    // gapCount: total missing periods across all consecutive jumps > 1 expected period
    let gapCount = 0;
    for (const g of gapDays) {
        const expectedPeriods = modalGap > 0 ? Math.round(g / modalGap) : 1;
        if (expectedPeriods > 1) gapCount += expectedPeriods - 1;
    }

    const isContinuous = spanPeriods > 0 && gapCount / spanPeriods <= 0.1;

    return { column, granularity, gapCount, spanPeriods, isContinuous };
};

/** Fetches up to 500 distinct sorted date strings from a DuckDB table. */
export const fetchTemporalDateStrings = async (
    binding: DuckDbAnalysisBinding,
    dateColName: string,
): Promise<string[]> => {
    const intent: QueryIntent = {
        kind: 'temporal_dates',
        purpose: `Fetch distinct dates from "${dateColName}"`,
        params: { column: dateColName, limit: 500 },
        options: { timeout: QUERY_TIMEOUT_MS, skipDirectiveInjection: true },
    };
    const result = await executeUnifiedQuery(intent, { binding });
    return result.rows.map(r => String(r['dt'] ?? '')).filter(Boolean);
};

/** Phase 2f: Detect temporal profile from the first date column in the dataset. */
export const detectTemporalProfile = async (
    columns: ColumnProfile[],
    binding: DuckDbAnalysisBinding,
): Promise<TemporalProfile | null> => {
    const dateCol = columns.find(col => col.type === 'date');
    if (!dateCol) return null;
    try {
        const dateStrings = await fetchTemporalDateStrings(binding, dateCol.name);
        return analyzeTemporalContinuity(dateCol.name, dateStrings);
    } catch {
        return null;
    }
};
