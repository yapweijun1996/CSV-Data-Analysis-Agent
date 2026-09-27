import type { DescriptionTotal, ValueConcentrationResult } from './investigationTypes';

const PARETO_THRESHOLD = 0.8;          // 80% of value in top 20% of items = Pareto
const PARETO_TOP_FRACTION = 0.2;       // The "20%" in the 80/20 rule
const PARETO_RECOMMENDED_TOP_N = 5;    // Show top 5 items when Pareto is detected

/**
 * Measures how concentrated value is across categories (80/20 / Pareto principle).
 * Input should be leaf-only totals (parents excluded to avoid double-counting).
 * Returns null when there are fewer than 3 items (not enough to detect concentration).
 */
export const detectValueConcentration = (leafTotals: DescriptionTotal[]): ValueConcentrationResult | null => {
    if (leafTotals.length < 3) return null;

    // Sort by absolute value descending to compute concentration of dominant items
    const sorted = [...leafTotals].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    const totalAbsValue = sorted.reduce((sum, t) => sum + Math.abs(t.total), 0);
    if (totalAbsValue === 0) return null;

    // Top 20% of categories (at least 1)
    const top20Count = Math.max(1, Math.ceil(sorted.length * PARETO_TOP_FRACTION));
    const top20Sum = sorted.slice(0, top20Count).reduce((sum, t) => sum + Math.abs(t.total), 0);

    const top20Pct = top20Sum / totalAbsValue;
    const isPareto = top20Pct >= PARETO_THRESHOLD;

    return {
        top20Pct,
        isPareto,
        recommendedTopN: isPareto ? PARETO_RECOMMENDED_TOP_N : null,
    };
};
