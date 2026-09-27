import type { CsvRow, QueryPlan } from '../../../types';

const TEMPORAL_COLUMN_PATTERN = /(?:^|[\s_])(date|time|day|week|month|quarter|year|period)(?:$|[\s_])/i;
const DERIVED_RATIO_ALIAS_PATTERN = /(?:^|[\s_])(margin|rate|ratio|percent|percentage|pct)(?:$|[\s_])|%/i;
const RATIO_SOURCE_COLUMN_PATTERN = /(?:^|[\s_])(margin|rate|ratio|percent|percentage|pct)(?:$|[\s_])|%/i;
const DATE_LIKE_VALUE_PATTERNS = [
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s].*)?$/,
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:[T\s].*)?$/,
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4}$/i,
];

const normalize = (value: unknown): string => String(value ?? '').trim();
const isDateLike = (value: unknown): boolean => {
    const normalized = normalize(value);
    return Boolean(normalized) && DATE_LIKE_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
};

export interface QuerySemanticMismatch {
    code: 'group_dimension_value_type_mismatch' | 'derived_ratio_alias_mismatch';
    column: string;
    alternativeColumn: string | null;
    message: string;
}

export const validateAggregateAliasSemantics = (
    plan: QueryPlan,
): QuerySemanticMismatch | null => {
    const misleadingAggregate = plan.aggregates?.find(aggregate => (
        DERIVED_RATIO_ALIAS_PATTERN.test(aggregate.as)
        && !RATIO_SOURCE_COLUMN_PATTERN.test(aggregate.column ?? '')
    ));
    if (!misleadingAggregate) return null;

    return {
        code: 'derived_ratio_alias_mismatch',
        column: misleadingAggregate.as,
        alternativeColumn: misleadingAggregate.column ?? null,
        message: `The aggregate alias "${misleadingAggregate.as}" implies a derived ratio, but it only applies ${misleadingAggregate.function} to "${misleadingAggregate.column ?? 'rows'}". Query the numerator and denominator as separate totals using honest aliases, return the complete grouped result, and calculate or rank the ratio from those totals.`,
    };
};

export const validateGroupedQuerySemantics = (params: {
    plan: QueryPlan;
    resultRows: CsvRow[];
    datasetRows: CsvRow[];
}): QuerySemanticMismatch | null => {
    const groupByColumn = params.plan.groupBy?.[0];
    if (!groupByColumn || TEMPORAL_COLUMN_PATTERN.test(groupByColumn)) return null;

    const values = params.resultRows
        .map(row => row[groupByColumn])
        .filter(value => normalize(value).length > 0);
    if (values.length < 3 || values.filter(isDateLike).length / values.length < 0.8) return null;

    const sectionLabels = params.datasetRows
        .map(row => normalize(row.SectionLabel))
        .filter(Boolean);
    const alternativeColumn = sectionLabels.length >= Math.min(5, params.datasetRows.length)
        && sectionLabels.filter(value => !isDateLike(value)).length / sectionLabels.length >= 0.8
        ? 'SectionLabel'
        : null;

    return {
        code: 'group_dimension_value_type_mismatch',
        column: groupByColumn,
        alternativeColumn,
        message: `The grouped values for "${groupByColumn}" look like dates, so they cannot support a trustworthy ${groupByColumn} analysis.${alternativeColumn ? ` Use "${alternativeColumn}" for the preserved report group labels instead.` : ' Choose a different validated grouping field.'}`,
    };
};
