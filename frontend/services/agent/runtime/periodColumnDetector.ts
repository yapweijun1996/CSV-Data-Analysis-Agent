/**
 * periodColumnDetector.ts
 *
 * Pure-function module that detects period column families (e.g. monthly columns
 * like "JAN 2010", "FEB 2010") in wide-pivot datasets and maps business period
 * intents (Q1, Q4, YTD) to their constituent columns.
 *
 * Follows the harness engineering pattern: detect → structured findings →
 * runtime directives. No SQL, no side effects.
 */

export interface PeriodColumnFamily {
    /** Detection pattern kind */
    pattern: 'monthly' | 'quarterly';
    /** Year suffix if present (e.g. "2010"), or null for year-less columns */
    year: string | null;
    /** Matched columns sorted by calendar order */
    columns: string[];
    /** Quarter-to-column mapping: Q1→[JAN,FEB,MAR], Q2→[APR,MAY,JUN], etc. */
    quarterMap: Record<string, string[]>;
    /** All matched columns in calendar order (same as columns, semantic alias) */
    ytdColumns: string[];
}

const MONTH_ABBREVS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

const MONTH_FULL_NAMES: Record<string, number> = {
    JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
    JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};

const MONTH_ABBREV_INDEX = new Map<string, number>(
    MONTH_ABBREVS.map((abbrev, index) => [abbrev, index]),
);

const QUARTER_MONTHS: Record<string, number[]> = {
    Q1: [0, 1, 2],
    Q2: [3, 4, 5],
    Q3: [6, 7, 8],
    Q4: [9, 10, 11],
};

/** Display-friendly short month names (title-case). */
const MONTH_SHORT_DISPLAY = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Minimum number of matched month columns to confirm a family */
const MIN_COLUMNS_FOR_FAMILY = 3;

interface MonthMatch {
    originalName: string;
    monthIndex: number;
    year: string | null;
}

const MONTH_ABBREV_PATTERN = new RegExp(
    `^(${MONTH_ABBREVS.join('|')})\\s+(\\d{4})$`, 'i',
);

const MONTH_ABBREV_NO_YEAR_PATTERN = new RegExp(
    `^(${MONTH_ABBREVS.join('|')})$`, 'i',
);

const MONTH_FULL_PATTERN = new RegExp(
    `^(${Object.keys(MONTH_FULL_NAMES).join('|')})\\s+(\\d{4})$`, 'i',
);

const MONTH_FULL_NO_YEAR_PATTERN = new RegExp(
    `^(${Object.keys(MONTH_FULL_NAMES).join('|')})$`, 'i',
);

const parseMonthColumn = (columnName: string): MonthMatch | null => {
    const trimmed = columnName.trim();

    // Try abbreviated with year: "JAN 2010"
    let match = MONTH_ABBREV_PATTERN.exec(trimmed);
    if (match) {
        const monthIndex = MONTH_ABBREV_INDEX.get(match[1].toUpperCase());
        if (monthIndex !== undefined) {
            return { originalName: columnName, monthIndex, year: match[2] };
        }
    }

    // Try abbreviated without year: "JAN"
    match = MONTH_ABBREV_NO_YEAR_PATTERN.exec(trimmed);
    if (match) {
        const monthIndex = MONTH_ABBREV_INDEX.get(match[1].toUpperCase());
        if (monthIndex !== undefined) {
            return { originalName: columnName, monthIndex, year: null };
        }
    }

    // Try full name with year: "JANUARY 2010"
    match = MONTH_FULL_PATTERN.exec(trimmed);
    if (match) {
        const monthIndex = MONTH_FULL_NAMES[match[1].toUpperCase()];
        if (monthIndex !== undefined) {
            return { originalName: columnName, monthIndex, year: match[2] };
        }
    }

    // Try full name without year: "JANUARY"
    match = MONTH_FULL_NO_YEAR_PATTERN.exec(trimmed);
    if (match) {
        const monthIndex = MONTH_FULL_NAMES[match[1].toUpperCase()];
        if (monthIndex !== undefined) {
            return { originalName: columnName, monthIndex, year: null };
        }
    }

    // Try ISO year-month: "2010-01", "2010-12"
    match = /^(\d{4})-(\d{2})$/.exec(trimmed);
    if (match) {
        const monthNum = parseInt(match[2], 10);
        if (monthNum >= 1 && monthNum <= 12) {
            return { originalName: columnName, monthIndex: monthNum - 1, year: match[1] };
        }
    }

    return null;
};

/**
 * Detects period column families from a list of column names.
 * Groups month-like columns by year and builds quarter mappings.
 * Requires at least MIN_COLUMNS_FOR_FAMILY columns per family.
 */
export const detectPeriodColumnFamilies = (columnNames: string[]): PeriodColumnFamily[] => {
    // Parse all columns for month matches
    const matches: MonthMatch[] = [];
    for (const name of columnNames) {
        const parsed = parseMonthColumn(name);
        if (parsed) {
            matches.push(parsed);
        }
    }

    if (matches.length < MIN_COLUMNS_FOR_FAMILY) {
        return [];
    }

    // Group by year
    const byYear = new Map<string, MonthMatch[]>();
    for (const m of matches) {
        const key = m.year ?? '__no_year__';
        const group = byYear.get(key) ?? [];
        group.push(m);
        byYear.set(key, group);
    }

    const families: PeriodColumnFamily[] = [];

    for (const [yearKey, yearMatches] of byYear.entries()) {
        if (yearMatches.length < MIN_COLUMNS_FOR_FAMILY) {
            continue;
        }

        // Sort by month order
        const sorted = [...yearMatches].sort((a, b) => a.monthIndex - b.monthIndex);

        // Deduplicate by month index (keep first occurrence)
        const seen = new Set<number>();
        const deduped: MonthMatch[] = [];
        for (const m of sorted) {
            if (!seen.has(m.monthIndex)) {
                seen.add(m.monthIndex);
                deduped.push(m);
            }
        }

        if (deduped.length < MIN_COLUMNS_FOR_FAMILY) {
            continue;
        }

        const columns = deduped.map(m => m.originalName);

        // Build quarter map
        const quarterMap: Record<string, string[]> = {};
        for (const [quarter, monthIndices] of Object.entries(QUARTER_MONTHS)) {
            quarterMap[quarter] = deduped
                .filter(m => monthIndices.includes(m.monthIndex))
                .map(m => m.originalName);
        }

        families.push({
            pattern: 'monthly',
            year: yearKey === '__no_year__' ? null : yearKey,
            columns,
            quarterMap,
            ytdColumns: columns,
        });
    }

    // Sort families by year (null last, then ascending)
    families.sort((a, b) => {
        if (a.year === null && b.year === null) return 0;
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return a.year.localeCompare(b.year);
    });

    return families;
};

/**
 * Expands a period expression to its constituent column names.
 *
 * Handles:
 * - Arithmetic expressions: "OCT 2010 + NOV 2010 + DEC 2010" → ['OCT 2010', 'NOV 2010', 'DEC 2010']
 * - Quarter shorthand: "Q4 2010" → ['OCT 2010', 'NOV 2010', 'DEC 2010']
 * - Quarter shorthand without year: "Q4" → columns from year-less family or first family
 *
 * Returns null if the expression cannot be resolved.
 */
/** Structured quarter intent extracted from topic text. */
export interface QuarterIntent {
    /** Quarter key: Q1, Q2, Q3, or Q4 */
    quarter: string;
    /** Year if mentioned in the topic, or null */
    year: string | null;
    /** Resolved constituent month columns from the period family */
    monthColumns: string[];
}

const ORDINAL_QUARTER_NAMES: Record<string, string> = {
    first: 'Q1', '1st': 'Q1',
    second: 'Q2', '2nd': 'Q2',
    third: 'Q3', '3rd': 'Q3',
    fourth: 'Q4', '4th': 'Q4',
};

// Maps month names to their indices for range-based detection.
const MONTH_NAME_TO_INDEX: Record<string, number> = {
    ...Object.fromEntries(MONTH_ABBREVS.map((a, i) => [a.toLowerCase(), i])),
    ...Object.fromEntries(Object.entries(MONTH_FULL_NAMES).map(([name, idx]) => [name.toLowerCase(), idx])),
};

// Maps month-index ranges to quarters for "Month to Month" patterns.
const RANGE_TO_QUARTER: Record<string, string> = {
    '0-2': 'Q1',   // Jan–Mar
    '3-5': 'Q2',   // Apr–Jun
    '6-8': 'Q3',   // Jul–Sep
    '9-11': 'Q4',  // Oct–Dec
};

/**
 * Detects quarter intent from a topic string and resolves it against
 * known period column families.
 *
 * Recognizes:
 * - "Q4", "Q4 2010", "q1"
 * - "fourth quarter", "4th quarter", "first quarter 2010"
 * - "October to December 2010", "January to March"
 */
export const detectQuarterIntent = (
    topic: string,
    families: PeriodColumnFamily[],
): QuarterIntent | null => {
    if (families.length === 0) return null;

    const text = topic.trim();

    // Pattern 1: "Q4", "Q4 2010", "q1 2023"
    const shorthandMatch = /\bQ([1-4])\s*(\d{4})?\b/i.exec(text);
    if (shorthandMatch) {
        const quarter = `Q${shorthandMatch[1]}`;
        const year = shorthandMatch[2] ?? null;
        return resolveQuarterFromFamily(quarter, year, families);
    }

    // Pattern 2: "fourth quarter", "4th quarter 2010", "first quarter"
    const ordinalMatch = /\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s*(\d{4})?\b/i.exec(text);
    if (ordinalMatch) {
        const quarter = ORDINAL_QUARTER_NAMES[ordinalMatch[1].toLowerCase()];
        const year = ordinalMatch[2] ?? null;
        if (quarter) {
            return resolveQuarterFromFamily(quarter, year, families);
        }
    }

    // Pattern 3: "October to December 2010", "January to March"
    const rangeMatch = /\b([A-Za-z]+)\s+to\s+([A-Za-z]+)\s*(\d{4})?\b/i.exec(text);
    if (rangeMatch) {
        const startMonth = MONTH_NAME_TO_INDEX[rangeMatch[1].toLowerCase()];
        const endMonth = MONTH_NAME_TO_INDEX[rangeMatch[2].toLowerCase()];
        const year = rangeMatch[3] ?? null;
        if (startMonth !== undefined && endMonth !== undefined) {
            const rangeKey = `${startMonth}-${endMonth}`;
            const quarter = RANGE_TO_QUARTER[rangeKey];
            if (quarter) {
                return resolveQuarterFromFamily(quarter, year, families);
            }
        }
    }

    return null;
};

const resolveQuarterFromFamily = (
    quarter: string,
    year: string | null,
    families: PeriodColumnFamily[],
): QuarterIntent | null => {
    const targetFamily = year
        ? families.find(f => f.year === year)
        : families.find(f => f.year === null) ?? families[0];

    if (!targetFamily) return null;

    const monthColumns = targetFamily.quarterMap[quarter];
    if (!monthColumns || monthColumns.length === 0) return null;

    return {
        quarter,
        year: year ?? targetFamily.year,
        monthColumns,
    };
};

/**
 * Checks whether an aggregate column expression covers all month columns
 * required by the quarter intent. Returns the missing columns, or an empty
 * array if coverage is complete.
 */
export const findMissingQuarterColumns = (
    aggregateColumn: string,
    intent: QuarterIntent,
): string[] => {
    const parts = aggregateColumn
        .split(/\s*\+\s*/)
        .map(p => p.trim().toLowerCase())
        .filter(Boolean);

    const partSet = new Set(parts);
    return intent.monthColumns.filter(col => !partSet.has(col.toLowerCase()));
};

/**
 * Returns a numeric sort key for a period value like "JAN 2010" or "FEB 2010".
 * Enables natural month ordering: year * 12 + monthIndex.
 * Returns null if the value doesn't match a known period pattern.
 */
export const periodValueSortKey = (value: string): number | null => {
    const parsed = parseMonthColumn(value);
    if (!parsed) return null;
    const yearNum = parsed.year ? parseInt(parsed.year, 10) : 0;
    return yearNum * 12 + parsed.monthIndex;
};

/**
 * Returns true when a set of string values all look like period values
 * (e.g. "JAN 2010", "FEB 2010"). Used to detect whether a groupBy column
 * after unpivot contains sortable period data.
 */
export const isPeriodValueSet = (values: string[]): boolean => {
    if (values.length < 2) return false;
    return values.every(v => periodValueSortKey(v) !== null);
};

/**
 * Converts a period column name (e.g. "2010-01", "JAN 2010", "JANUARY")
 * to a human-readable display label (e.g. "Jan 2010", "Jan 2010", "Jan").
 * Returns the original string if it cannot be parsed as a period.
 */
export const formatPeriodDisplayLabel = (columnName: string): string => {
    const parsed = parseMonthColumn(columnName);
    if (!parsed) return columnName;
    const monthLabel = MONTH_SHORT_DISPLAY[parsed.monthIndex];
    return parsed.year ? `${monthLabel} ${parsed.year}` : monthLabel;
};

export const expandPeriodExpression = (
    expression: string,
    families: PeriodColumnFamily[],
): string[] | null => {
    if (families.length === 0) {
        return null;
    }

    const trimmed = expression.trim();

    // Try arithmetic expression: "COL_A + COL_B + COL_C"
    if (trimmed.includes('+')) {
        const tokens = trimmed.split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean);
        if (tokens.length < 2) {
            return null;
        }

        // Build a lookup of all column names across families (case-insensitive)
        const columnLookup = new Map<string, string>();
        for (const family of families) {
            for (const col of family.columns) {
                columnLookup.set(col.toLowerCase(), col);
            }
        }

        const resolved = tokens.map(token => columnLookup.get(token.toLowerCase()));
        if (resolved.every((r): r is string => r !== undefined)) {
            return resolved;
        }
        return null;
    }

    // Try quarter shorthand: "Q1", "Q4 2010", "Q2 2023"
    const quarterMatch = /^Q([1-4])\s*(\d{4})?$/i.exec(trimmed);
    if (quarterMatch) {
        const quarter = `Q${quarterMatch[1]}`;
        const year = quarterMatch[2] ?? null;

        // Find matching family
        const targetFamily = year
            ? families.find(f => f.year === year)
            : families.find(f => f.year === null) ?? families[0];

        if (!targetFamily) {
            return null;
        }

        const quarterColumns = targetFamily.quarterMap[quarter];
        if (quarterColumns && quarterColumns.length > 0) {
            return quarterColumns;
        }
        return null;
    }

    return null;
};
