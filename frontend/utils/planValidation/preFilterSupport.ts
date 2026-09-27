import { robustParseFloat } from '../../services/data/dataProfiler';
import type { PreFilterOperator, PreFilterValue } from '../../types';
import { PRE_FILTER_OPERATORS } from '../../types';

const PRE_FILTER_OPERATOR_SET = new Set<string>(PRE_FILTER_OPERATORS);

const PRE_FILTER_OPERATOR_ALIASES: Record<string, PreFilterOperator> = {
    '=': 'eq',
    '==': 'eq',
    equals: 'eq',
    equal: 'eq',
    '!=': 'neq',
    '<>': 'neq',
    not_equal: 'neq',
    not_equals: 'neq',
    greater_than: 'gt',
    '>': 'gt',
    greater_than_or_equal: 'gte',
    greater_than_or_equals: 'gte',
    '>=': 'gte',
    less_than: 'lt',
    '<': 'lt',
    less_than_or_equal: 'lte',
    less_than_or_equals: 'lte',
    '<=': 'lte',
};

const normalizeOperatorKey = (operator: string) => operator
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();

const toLowerText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const compareNumeric = (rowValue: unknown, value: unknown, comparator: (actual: number, expected: number) => boolean) => {
    const actual = robustParseFloat(rowValue);
    const expected = robustParseFloat(value);
    if (actual === null || expected === null) {
        return false;
    }
    return comparator(actual, expected);
};

export const normalizePreFilterOperator = (operator?: string): {
    normalized: PreFilterOperator;
    wasAliased: boolean;
    original?: string;
} => {
    if (!operator) {
        return { normalized: 'eq', wasAliased: false };
    }

    const normalizedKey = normalizeOperatorKey(operator);
    if (PRE_FILTER_OPERATOR_SET.has(normalizedKey)) {
        return {
            normalized: normalizedKey as PreFilterOperator,
            wasAliased: normalizedKey !== operator,
            original: normalizedKey !== operator ? operator : undefined,
        };
    }

    const alias = PRE_FILTER_OPERATOR_ALIASES[normalizedKey];
    if (alias) {
        return { normalized: alias, wasAliased: true, original: operator };
    }

    return { normalized: normalizedKey as PreFilterOperator, wasAliased: false, original: operator };
};

export const isSupportedPreFilterOperator = (operator: string): operator is PreFilterOperator =>
    PRE_FILTER_OPERATOR_SET.has(operator);

export const applyPreFilter = (rowValue: unknown, operator: PreFilterOperator, value: PreFilterValue) => {
    const actual = toLowerText(rowValue);
    const expected = Array.isArray(value) ? value.map(toLowerText) : [toLowerText(value)];

    switch (operator) {
        case 'in':
            return expected.includes(actual);
        case 'not_in':
            return !expected.includes(actual);
        case 'contains':
            return actual.includes(expected[0] ?? '');
        case 'starts_with':
            return actual.startsWith(expected[0] ?? '');
        case 'ends_with':
            return actual.endsWith(expected[0] ?? '');
        case 'neq':
            return actual !== (expected[0] ?? '');
        case 'gt':
            return compareNumeric(rowValue, Array.isArray(value) ? value[0] : value, (left, right) => left > right);
        case 'gte':
            return compareNumeric(rowValue, Array.isArray(value) ? value[0] : value, (left, right) => left >= right);
        case 'lt':
            return compareNumeric(rowValue, Array.isArray(value) ? value[0] : value, (left, right) => left < right);
        case 'lte':
            return compareNumeric(rowValue, Array.isArray(value) ? value[0] : value, (left, right) => left <= right);
        case 'between': {
            const [lower, upper] = Array.isArray(value) ? value : [];
            const actualNumber = robustParseFloat(rowValue);
            const lowerNumber = robustParseFloat(lower);
            const upperNumber = robustParseFloat(upper);
            if (actualNumber === null || lowerNumber === null || upperNumber === null) {
                return false;
            }
            return actualNumber >= lowerNumber && actualNumber <= upperNumber;
        }
        case 'eq':
        default:
            return actual === (expected[0] ?? '');
    }
};
