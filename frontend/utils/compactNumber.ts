/**
 * Compact display for large numbers (297,838,107,220 → 297.8B). Only for
 * summaries such as KPI tiles and chart axes; tables and tooltips keep the
 * exact value so nothing is hidden.
 */
const compactFormatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

export const formatCompactNumber = (value: number): string => compactFormatter.format(value);

/** Returns the compact form for large magnitudes, otherwise null so callers keep their own format. */
export const compactIfLarge = (value: number, minAbs: number): string | null =>
    Number.isFinite(value) && Math.abs(value) >= minAbs ? formatCompactNumber(value) : null;
