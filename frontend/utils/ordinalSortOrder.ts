/**
 * Unified ordinal / sequential dimension utilities.
 *
 * This is the single source of truth for month, quarter, and weekday
 * canonical order.  Both the planner layer (sqlPresentationPlanner) and
 * the report layer (buildReportChartPayload, validateReportChartPayload)
 * consume these helpers instead of maintaining their own lookup tables.
 */

// ---------------------------------------------------------------------------
// Ordinal lookup tables
// ---------------------------------------------------------------------------

const MONTH_ORDINAL: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
};

// Pattern for "MONTH YEAR" period values (e.g. "JAN 2010", "February 2023").
// Returns { month: number (1-12), year: number } or null.
const PERIOD_VALUE_PATTERN = /^([a-z]+)\s+(\d{4})$/i;

const parsePeriodValue = (value: string): { month: number; year: number } | null => {
    const match = PERIOD_VALUE_PATTERN.exec(value.trim());
    if (!match) return null;
    const monthKey = match[1].toLowerCase();
    const month = MONTH_ORDINAL[monthKey];
    if (month === undefined) return null;
    return { month, year: parseInt(match[2], 10) };
};

const QUARTER_ORDINAL: Record<string, number> = { q1: 1, q2: 2, q3: 3, q4: 4 };

const WEEKDAY_ORDINAL: Record<string, number> = {
    mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3,
    thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
    sun: 7, sunday: 7,
};

// ---------------------------------------------------------------------------
// Column-name heuristic for sequential / time-like dimensions
// ---------------------------------------------------------------------------

const SEQUENTIAL_TOKENS = [
    'month', 'date', 'day', 'week', 'quarter', 'year',
    'period', 'reporting date', 'time',
];

/**
 * Returns `true` when a column name looks like a sequential / temporal
 * dimension (e.g. "ReportingMonth", "Quarter", "Date").
 */
export const isSequentialDimensionName = (columnName: string | null | undefined): boolean => {
    const normalized = String(columnName ?? '').trim().toLowerCase();
    if (!normalized) return false;
    return SEQUENTIAL_TOKENS.some(token => normalized.includes(token));
};

// ---------------------------------------------------------------------------
// Value-level ordinal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an array of label values to ordinal indices if they all belong to
 * the same known ordinal vocabulary (month / quarter / weekday).
 * Returns `null` when the values do not match any vocabulary.
 */
export const resolveOrdinalIndices = (values: string[]): number[] | null => {
    if (values.length === 0) return null;
    const lower = values.map(v => v.toLowerCase().trim());

    if (lower.every(v => MONTH_ORDINAL[v] !== undefined)) {
        return lower.map(v => MONTH_ORDINAL[v]);
    }
    if (lower.every(v => QUARTER_ORDINAL[v] !== undefined)) {
        return lower.map(v => QUARTER_ORDINAL[v]);
    }
    if (lower.every(v => WEEKDAY_ORDINAL[v] !== undefined)) {
        return lower.map(v => WEEKDAY_ORDINAL[v]);
    }
    // "MONTH YEAR" period values: "JAN 2010", "FEB 2010" → year*12+month
    const periodParsed = lower.map(parsePeriodValue);
    if (periodParsed.every((p): p is { month: number; year: number } => p !== null)) {
        return periodParsed.map(p => p.year * 12 + p.month);
    }
    return null;
};

/**
 * Returns the ordinal sort key for a single string value, or `null` if it
 * does not belong to any known ordinal vocabulary.
 *
 * Handles both bare ordinals ("JAN" → 1) and period values with year
 * ("JAN 2010" → 2010 * 12 + 1 = 24121) for natural month ordering.
 */
export const getOrdinalSortKey = (value: string): number | null => {
    const lower = value.toLowerCase().trim();
    const bare = MONTH_ORDINAL[lower] ?? QUARTER_ORDINAL[lower] ?? WEEKDAY_ORDINAL[lower] ?? null;
    if (bare !== null) return bare;
    // "MONTH YEAR" period values: sort key = year * 12 + month
    const period = parsePeriodValue(lower);
    if (period) return period.year * 12 + period.month;
    return null;
};

/**
 * Returns `true` when the value belongs to any recognised ordinal vocabulary.
 */
export const isOrdinalValue = (value: string): boolean => getOrdinalSortKey(value) !== null;

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a numeric sequence is monotonically ascending or
 * descending.  Sequences with fewer than 2 elements are trivially monotonic.
 */
export const isMonotonicSequence = (values: number[]): boolean => {
    if (values.length < 2) return true;
    let ascending = true;
    let descending = true;
    for (let i = 1; i < values.length; i++) {
        if (values[i] < values[i - 1]) ascending = false;
        if (values[i] > values[i - 1]) descending = false;
    }
    return ascending || descending;
};

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort string labels by ordinal order (month / quarter / weekday).
 * Non-ordinal values are pushed to the end in their original order.
 *
 * Returns a new sorted array — the input is not mutated.
 */
export const sortByOrdinal = (labels: string[]): string[] => {
    const withKeys = labels.map((label, i) => ({
        label,
        key: getOrdinalSortKey(label),
        originalIndex: i,
    }));

    return withKeys
        .sort((a, b) => {
            if (a.key !== null && b.key !== null) return a.key - b.key;
            if (a.key !== null) return -1;
            if (b.key !== null) return 1;
            return a.originalIndex - b.originalIndex;
        })
        .map(entry => entry.label);
};

// ---------------------------------------------------------------------------
// Duplicate bucket detection
// ---------------------------------------------------------------------------

/**
 * Normalise a label for deduplication: lowercase, collapse whitespace,
 * strip trailing punctuation.
 */
const normalizeBucket = (value: string): string =>
    value.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');

/**
 * Returns `true` when the labels contain at least one pair of values that
 * normalise to the same bucket key.
 */
export const hasDuplicateNormalizedBuckets = (labels: string[]): boolean => {
    const seen = new Set<string>();
    for (const label of labels) {
        const key = normalizeBucket(label);
        if (!key) continue;
        if (seen.has(key)) return true;
        seen.add(key);
    }
    return false;
};

// ---------------------------------------------------------------------------
// Sortability assessment
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a set of labels can be meaningfully sorted for a
 * sequential chart (either recognised ordinals or parseable dates).
 */
export const isSortableSequence = (labels: string[]): boolean => {
    if (labels.length < 2) return true;

    // Ordinal match
    const ordinalIndices = resolveOrdinalIndices(labels);
    if (ordinalIndices) return true;

    // Date parse attempt
    const timestamps = labels.map(v => new Date(v).getTime());
    return !timestamps.some(isNaN);
};
