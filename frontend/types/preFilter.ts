export const PRE_FILTER_OPERATORS = [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'contains',
    'starts_with',
    'ends_with',
    'in',
    'not_in',
] as const;

export type PreFilterOperator = typeof PRE_FILTER_OPERATORS[number];

export type PreFilterScalarValue = string | number;

export type PreFilterValue = PreFilterScalarValue | PreFilterScalarValue[];

export interface PreFilterClause {
    column: string;
    value: PreFilterValue;
    operator?: PreFilterOperator;
}
