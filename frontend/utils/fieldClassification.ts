/**
 * Field Classification Utilities
 *
 * Provides composable field type predicates for semantic classification of CSV columns.
 * Supports Revenue/Cost/Profit/Temporal/Categorical/Identifier patterns based on
 * data-formulator conventions.
 *
 * Pattern: Each predicate is a pure function (fieldValue, columnName?) => boolean
 * that can be composed to build complex field classification rules.
 */

import type { ColumnProfile } from '../types';

/**
 * Predicate type: a function that classifies a field value or column metadata
 */
export type FieldClassifier = (value: unknown, columnName?: string) => boolean;

/**
 * Revenue field patterns: column names and values indicating revenue/sales metrics
 */
const REVENUE_PATTERNS = [
    /\brevenue/i,    // Allow trailing digits/underscores
    /\bsales/i,
    /\bincome/i,
    /\bturnover/i,
    /\bnet\s+sales/i,
    /\bgross\s+sales/i,
    /\breceipts?/i,
];

/**
 * Cost field patterns: column names and values indicating cost/expense metrics
 */
const COST_PATTERNS = [
    /\bcost\b/i,
    /\bexpense/i,  // Matches "expense", "expenses", etc.
    /\bcogs\b/i,
    /\bcost\s+of\s+sales\b/i,
    /\bcost\s+of\s+goods\b/i,
    /\bspend\b/i,
    /\bexpenditure\b/i,
];

/**
 * Profit field patterns: column names and values indicating profit/profitability metrics
 */
const PROFIT_PATTERNS = [
    /\bprofit\b/i,
    /\bprofitability\b/i,
    /\bgross\s+profit\b/i,
    /\bnet\s+profit\b/i,
    /\bebit\b/i,
    /\bebitda\b/i,
    /\boperating\s+profit\b/i,
];

/**
 * Margin field patterns: column names and values indicating margin metrics
 */
const MARGIN_PATTERNS = [
    /\bmargin\b/i,
    /\bgross\s+margin\b/i,
    /\bnet\s+margin\b/i,
    /\boperating\s+margin\b/i,
];

/**
 * Temporal field patterns: column names indicating date/time dimensions
 */
const TEMPORAL_PATTERNS = [
    /\bdate/i,       // Allow trailing digits/underscores
    /\btime/i,
    /\byear/i,
    /\bquarter/i,
    /\bmonth/i,
    /\bweek/i,
    /\bday/i,
    /\bperiod/i,
    /\bfiscal\s+year/i,
    /\bfiscal\s+quarter/i,
];

/**
 * Categorical field patterns: column names indicating category/dimension fields
 */
const CATEGORICAL_PATTERNS = [
    /\bcategory\b/i,
    /\bgroup\b/i,
    /\btype\b/i,
    /\bclass\b/i,
    /\bregion\b/i,
    /\bterritory\b/i,
    /\bsegment\b/i,
    /\bdepartment\b/i,
    /\bdivision\b/i,
    /\bproduct\b/i,
    /\bcustomer\b/i,
    /\bstatus\b/i,
];

/**
 * Identifier field patterns: column names indicating ID/code fields
 */
const IDENTIFIER_PATTERNS = [
    /^id$/i,           // Exact "id"
    /^id_/i,           // "id_..." prefix
    /_id$/i,           // "..._id" suffix
    /\bid\b/i,         // Word boundary "id"
    /\bcode\b/i,
    /\bnumber\b/i,
    /\bsymbols?\b/i,
    /\bkey\b/i,
    /\bsku\b/i,
    /\bposting_number\b/i,
];

/**
 * Helper: normalize text for pattern matching
 */
const normalizeText = (value: unknown): string => {
    return String(value ?? '').trim().toLowerCase();
};

/**
 * Helper: test value against pattern array
 */
const testPatterns = (value: string, patterns: RegExp[]): boolean => {
    return patterns.some(pattern => pattern.test(value));
};

/**
 * Predicate: field is classified as a revenue metric
 *
 * Checks column name against revenue patterns.
 * Does not validate actual numeric values.
 *
 * @example
 * isRevenue(undefined, 'Annual Revenue') // true
 * isRevenue(undefined, 'Sales') // true
 * isRevenue(undefined, 'cost') // false
 */
export const isRevenue: FieldClassifier = (_, columnName = '') => {
    return testPatterns(normalizeText(columnName), REVENUE_PATTERNS);
};

/**
 * Predicate: field is classified as a cost metric
 *
 * Checks column name against cost patterns.
 *
 * @example
 * isCost(undefined, 'Total Cost') // true
 * isCost(undefined, 'Expenses') // true
 * isCost(undefined, 'revenue') // false
 */
export const isCost: FieldClassifier = (_, columnName = '') => {
    return testPatterns(normalizeText(columnName), COST_PATTERNS);
};

/**
 * Predicate: field is classified as a profit metric
 *
 * Checks column name against profit patterns.
 * Note: Profit typically implies both revenue and cost components.
 *
 * @example
 * isProfit(undefined, 'Net Profit') // true
 * isProfit(undefined, 'Profitability') // true
 * isProfit(undefined, 'cost') // false
 */
export const isProfit: FieldClassifier = (_, columnName = '') => {
    return testPatterns(normalizeText(columnName), PROFIT_PATTERNS);
};

/**
 * Predicate: field is classified as a margin metric
 *
 * Checks column name against margin patterns.
 * Margins are typically ratios (profit/revenue or gross/net comparisons).
 *
 * @example
 * isMargin(undefined, 'Gross Margin') // true
 * isMargin(undefined, 'Net Margin %') // true
 */
export const isMargin: FieldClassifier = (_, columnName = '') => {
    return testPatterns(normalizeText(columnName), MARGIN_PATTERNS);
};

/**
 * Predicate: field is classified as a temporal/date dimension
 *
 * Checks column name against temporal patterns.
 * Uses both ColumnProfile type hints and pattern matching.
 *
 * @example
 * isTemporal(undefined, 'Report Date') // true
 * isTemporal(undefined, 'Fiscal Year') // true
 * isTemporal({type: 'date'}) // true
 */
export const isTemporal: FieldClassifier = (columnOrProfile, columnName = '') => {
    // Check column name patterns
    if (testPatterns(normalizeText(columnName), TEMPORAL_PATTERNS)) {
        return true;
    }

    // Check ColumnProfile type hints if provided
    if (typeof columnOrProfile === 'object' && columnOrProfile !== null) {
        const profile = columnOrProfile as any;
        if (profile.type && typeof profile.type === 'string') {
            const type = profile.type.toLowerCase();
            return type === 'date' || type === 'time';
        }
    }

    return false;
};

/**
 * Predicate: field is classified as a categorical dimension
 *
 * Checks column name against categorical patterns.
 * Categorical fields typically have limited cardinality and represent grouping dimensions.
 *
 * @example
 * isCategorical(undefined, 'Product Category') // true
 * isCategorical(undefined, 'Region') // true
 * isCategorical({type: 'categorical'}) // true
 */
export const isCategorical: FieldClassifier = (columnOrProfile, columnName = '') => {
    // Check column name patterns
    if (testPatterns(normalizeText(columnName), CATEGORICAL_PATTERNS)) {
        return true;
    }

    // Check ColumnProfile type hints if provided
    if (typeof columnOrProfile === 'object' && columnOrProfile !== null) {
        const profile = columnOrProfile as any;
        if (profile.type && typeof profile.type === 'string') {
            return profile.type.toLowerCase() === 'categorical';
        }
    }

    return false;
};

/**
 * Predicate: field is classified as an identifier/code
 *
 * Checks column name against identifier patterns.
 * Identifiers typically have very high cardinality and unique values.
 *
 * @example
 * isIdentifier(undefined, 'Customer ID') // true
 * isIdentifier(undefined, 'Product Code') // true
 * isIdentifier(undefined, 'SKU') // true
 */
export const isIdentifier: FieldClassifier = (_, columnName = '') => {
    return testPatterns(normalizeText(columnName), IDENTIFIER_PATTERNS);
};

/**
 * Predicate: field is classified as numeric (but not a specific financial metric)
 *
 * Checks ColumnProfile type hints for numeric types.
 *
 * @example
 * isNumeric({type: 'numerical'}) // true
 * isNumeric({type: 'currency'}) // true
 * isNumeric({type: 'percentage'}) // true
 * isNumeric({type: 'categorical'}) // false
 */
export const isNumeric: FieldClassifier = (columnOrProfile) => {
    if (typeof columnOrProfile === 'object' && columnOrProfile !== null) {
        const profile = columnOrProfile as any;
        if (profile.type && typeof profile.type === 'string') {
            const type = profile.type.toLowerCase();
            return type === 'numerical' || type === 'currency' || type === 'percentage';
        }
    }
    return false;
};

/**
 * Predicate combinator: field matches ANY of the given predicates
 *
 * Useful for checking "is this field revenue OR cost OR profit?"
 *
 * @example
 * const isFinancialMetric = anyOf(isRevenue, isCost, isProfit);
 * isFinancialMetric(undefined, 'Total Sales') // true
 * isFinancialMetric(undefined, 'Department') // false
 */
export const anyOf = (...predicates: FieldClassifier[]): FieldClassifier => {
    return (value, columnName) => {
        return predicates.some(predicate => predicate(value, columnName));
    };
};

/**
 * Predicate combinator: field matches ALL of the given predicates
 *
 * Useful for checking "is this field temporal AND categorical?"
 *
 * @example
 * const isTemporalCategory = allOf(isTemporal, isCategorical);
 */
export const allOf = (...predicates: FieldClassifier[]): FieldClassifier => {
    return (value, columnName) => {
        return predicates.every(predicate => predicate(value, columnName));
    };
};

/**
 * Predicate combinator: field does NOT match the given predicate
 *
 * Useful for excluding certain fields.
 *
 * @example
 * const notIdentifier = not(isIdentifier);
 * notIdentifier(undefined, 'Customer ID') // false
 * notIdentifier(undefined, 'Revenue') // true
 */
export const not = (predicate: FieldClassifier): FieldClassifier => {
    return (value, columnName) => {
        return !predicate(value, columnName);
    };
};

/**
 * Predicate: field is classified as a financial metric
 *
 * Composed predicate: isRevenue OR isCost OR isProfit OR isMargin
 * Used to identify columns that contain financial/business metrics.
 */
export const isFinancialMetric = anyOf(isRevenue, isCost, isProfit, isMargin);

/**
 * Predicate: field is suitable for use as a grouping dimension (not an identifier)
 *
 * Composed predicate: isCategorical OR isTemporal, but NOT isIdentifier
 * Filters out ID/code fields which have too high cardinality for meaningful grouping.
 */
export const isDimensionField = allOf(
    anyOf(isCategorical, isTemporal),
    not(isIdentifier),
);

/**
 * Predicate: field is a business-meaningful numeric metric
 *
 * Composed predicate: isNumeric AND (isFinancialMetric OR not identifier/temporal)
 * Identifies columns suitable for aggregation in analysis cards.
 */
export const isMetricField = allOf(
    isNumeric,
    not(isIdentifier),
);

/**
 * Classify a column based on ColumnProfile metadata
 *
 * Returns the most specific semantic classification for a given column.
 * Used internally to assign role types in analysis pipelines.
 *
 * @param profile - ColumnProfile with name and type information
 * @returns semantic role: 'metric', 'dimension', 'temporal', 'identifier', or 'unknown'
 *
 * @example
 * classifyColumn({name: 'Total Revenue', type: 'currency'})
 * // => 'metric'
 *
 * classifyColumn({name: 'Report Month', type: 'date'})
 * // => 'temporal'
 */
export const classifyColumn = (profile: ColumnProfile): string => {
    const { name, type } = profile;

    // Financial metrics take precedence
    if (isFinancialMetric(profile, name)) {
        return 'metric';
    }

    // Identifiers
    if (isIdentifier(undefined, name)) {
        return 'identifier';
    }

    // Temporal fields
    if (isTemporal(profile, name)) {
        return 'temporal';
    }

    // Categorical dimensions
    if (isCategorical(profile, name)) {
        return 'dimension';
    }

    // Numeric (but not financial/metric)
    if (isNumeric(profile)) {
        return 'metric';
    }

    return 'unknown';
};

/**
 * Build a filter function for columns matching multiple classification criteria
 *
 * Useful for pipelines that need to select columns for specific roles.
 *
 * @param criteria - object with boolean flags for field types to include
 * @returns function that accepts (columnName, profile) and returns boolean
 *
 * @example
 * const metricFilter = buildColumnFilter({
 *   financial: true,
 *   numeric: true,
 * });
 * columns.filter(col => metricFilter(col.name, col))
 */
export interface ColumnFilterCriteria {
    financial?: boolean;
    revenue?: boolean;
    cost?: boolean;
    profit?: boolean;
    margin?: boolean;
    temporal?: boolean;
    categorical?: boolean;
    identifier?: boolean;
    numeric?: boolean;
    dimension?: boolean;
    metric?: boolean;
}

export const buildColumnFilter = (criteria: ColumnFilterCriteria): FieldClassifier => {
    const predicates: FieldClassifier[] = [];

    if (criteria.financial) predicates.push(isFinancialMetric);
    if (criteria.revenue) predicates.push(isRevenue);
    if (criteria.cost) predicates.push(isCost);
    if (criteria.profit) predicates.push(isProfit);
    if (criteria.margin) predicates.push(isMargin);
    if (criteria.temporal) predicates.push(isTemporal);
    if (criteria.categorical) predicates.push(isCategorical);
    if (criteria.identifier) predicates.push(isIdentifier);
    if (criteria.numeric) predicates.push(isNumeric);
    if (criteria.dimension) predicates.push(isDimensionField);
    if (criteria.metric) predicates.push(isMetricField);

    // OR logic: match if ANY criteria matches
    return anyOf(...predicates);
};
