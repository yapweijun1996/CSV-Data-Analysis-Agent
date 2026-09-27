/**
 * Dimension Value Normalization — shared constants and expression builders.
 *
 * Ensures NULL, empty, whitespace-only, and placeholder tokens are collapsed
 * into a single canonical label in GROUP BY results. Used by both the SQL
 * query compiler and the JS fallback aggregation path so that initial
 * analysis cards and follow-up chat queries produce identical grouping.
 *
 * Type gating: normalization only applies to text/categorical dimensions.
 * Numeric, date, time, currency, and percentage columns are left as-is
 * to preserve their native types in GROUP BY.
 */

import type { ColumnProfile } from '../../types';

// --- Constants ---

/** Placeholder tokens treated as missing/unknown in dimension columns. */
export const DEFAULT_DIMENSION_PLACEHOLDERS = ['n/a', 'na', 'null', 'none', '-', '--'];

/** Canonical label used to replace missing/placeholder dimension values. */
export const UNKNOWN_LABEL = 'Unknown';

/** Column types that should NOT be text-normalized in GROUP BY. */
const NON_TEXT_COLUMN_TYPES = new Set<ColumnProfile['type']>([
    'numerical', 'date', 'time', 'currency', 'percentage',
]);

// --- Config ---

export interface DimensionNormalizationConfig {
    /** Normalize NULL / empty / whitespace-only → label. */
    normalizeEmpty: boolean;
    /** Also normalize placeholder tokens → label. */
    normalizePlaceholders: boolean;
    /** Placeholder tokens (compared case-insensitively after trim). */
    placeholders: string[];
    /** Replacement label for normalized values. */
    label: string;
    /**
     * Per-column gate: only columns for which this returns true get
     * CASE-based text normalization. When omitted, all columns are eligible.
     * Use `buildColumnTypeGate()` to create a gate from ColumnProfile[].
     */
    shouldNormalize?: (columnName: string) => boolean;
}

export const DEFAULT_DIMENSION_NORMALIZATION: DimensionNormalizationConfig = {
    normalizeEmpty: true,
    normalizePlaceholders: true,
    placeholders: DEFAULT_DIMENSION_PLACEHOLDERS,
    label: UNKNOWN_LABEL,
};

// --- Type gating helpers ---

/**
 * Build a `shouldNormalize` gate from column profiles.
 * Only 'categorical' columns pass; numeric/date/time/currency/percentage are skipped.
 */
export const buildColumnTypeGate = (
    profiles: ColumnProfile[],
): ((columnName: string) => boolean) => {
    const typeByColumn = new Map<string, ColumnProfile['type']>();
    for (const profile of profiles) {
        typeByColumn.set(profile.name.toLowerCase(), profile.type);
    }
    return (columnName: string) => {
        const type = typeByColumn.get(columnName.toLowerCase());
        // If no profile found, default to normalizing (conservative: assume text)
        if (!type) return true;
        return !NON_TEXT_COLUMN_TYPES.has(type);
    };
};

/**
 * Check if a specific column should be normalized given the config.
 * Used by both GROUP BY and filter compilation to stay consistent.
 */
export const isColumnNormalized = (
    columnName: string,
    config: DimensionNormalizationConfig | null | undefined,
): boolean => {
    if (!config) return false;
    if (!config.shouldNormalize) return true;
    return config.shouldNormalize(columnName);
};

// --- SQL Expression Builder ---

/**
 * Build a DuckDB CASE expression that normalizes a dimension column value.
 *
 * Output example (with default config):
 * ```sql
 * CASE
 *   WHEN TRIM(COALESCE(CAST("BRAND" AS VARCHAR), '')) = '' THEN 'Unknown'
 *   WHEN LOWER(TRIM(COALESCE(CAST("BRAND" AS VARCHAR), ''))) IN ('n/a','na','null','none','-','--') THEN 'Unknown'
 *   ELSE TRIM(COALESCE(CAST("BRAND" AS VARCHAR), ''))
 * END
 * ```
 *
 * @param quotedColumn - Already-quoted column identifier (e.g. `"BRAND"`)
 */
export const buildDimensionNormExpr = (
    quotedColumn: string,
    config: DimensionNormalizationConfig = DEFAULT_DIMENSION_NORMALIZATION,
): string => {
    const trimmed = `TRIM(COALESCE(CAST(${quotedColumn} AS VARCHAR), ''))`;
    const lowered = `LOWER(${trimmed})`;
    const label = escapeSqlLiteral(config.label);

    const branches: string[] = [];

    if (config.normalizeEmpty) {
        branches.push(`WHEN ${trimmed} = '' THEN '${label}'`);
    }

    if (config.normalizePlaceholders && config.placeholders.length > 0) {
        const tokens = config.placeholders
            .map(t => `'${escapeSqlLiteral(t.toLowerCase().trim())}'`)
            .join(', ');
        branches.push(`WHEN ${lowered} IN (${tokens}) THEN '${label}'`);
    }

    if (branches.length === 0) {
        // No normalization rules — return raw trimmed expression
        return trimmed;
    }

    return `CASE ${branches.join(' ')} ELSE ${trimmed} END`;
};

// --- JS Counterpart ---

/**
 * Normalize a dimension value in JavaScript — mirrors the SQL CASE logic
 * exactly so that JS fallback aggregation produces the same buckets.
 */
export const normalizeDimensionValue = (
    value: unknown,
    config: DimensionNormalizationConfig = DEFAULT_DIMENSION_NORMALIZATION,
): string => {
    const text = String(value ?? '').trim();

    if (config.normalizeEmpty && text === '') {
        return config.label;
    }

    if (config.normalizePlaceholders && config.placeholders.length > 0) {
        const lower = text.toLowerCase();
        if (config.placeholders.some(p => p.toLowerCase().trim() === lower)) {
            return config.label;
        }
    }

    return text;
};

// --- Helpers ---

/** Escape single quotes for SQL string literals. */
const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");
