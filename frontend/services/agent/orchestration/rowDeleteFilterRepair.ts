import type {
    CsvData,
    FilterPredicate,
    FilterPredicateGroup,
    FilterRowsOperation,
} from '../../../types';

const INTERNAL_WHITESPACE_PATTERN = /\s+/g;
const LOOSE_KEY_PATTERN = /[^a-z0-9]+/g;
const EXPLICIT_COMPARATOR_PATTERN = '(?:=|is)';

type DeleteEqualityHint = {
    column: string;
    values: string[];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeWhitespace = (value: string) => value.trim().replace(INTERNAL_WHITESPACE_PATTERN, ' ');

const toLooseKey = (value: string) =>
    normalizeWhitespace(value)
        .toLowerCase()
        .replace(LOOSE_KEY_PATTERN, '');

const normalizeValueToken = (value: string) =>
    value
        .trim()
        .replace(/^['"`]+|['"`]+$/g, '')
        .replace(/^[([{]+|[)\]}]+$/g, '')
        .trim();

const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const extractExplicitDeleteEqualityHints = (
    request: string,
    columns: string[],
): DeleteEqualityHint[] => {
    const normalizedRequest = normalizeWhitespace(request);

    return columns
        .sort((left, right) => right.length - left.length)
        .map(column => {
            const pattern = new RegExp(
                `(?:\\bwhere\\b|\\bwhen\\b)?\\s*${escapeRegExp(column)}\\s*${EXPLICIT_COMPARATOR_PATTERN}\\s*(.+?)(?=$|\\b(?:and|but|except)\\b)`,
                'i',
            );
            const match = normalizedRequest.match(pattern);
            if (!match?.[1]) {
                return null;
            }

            const rawValues = match[1]
                .split(/\s+\bor\b\s+|,/i)
                .map(normalizeValueToken)
                .filter(Boolean);
            if (rawValues.length === 0) {
                return null;
            }

            return {
                column,
                values: uniqueStrings(rawValues),
            } satisfies DeleteEqualityHint;
        })
        .filter((hint): hint is DeleteEqualityHint => Boolean(hint));
};

const collectDistinctStringValues = (data: CsvData, column: string): string[] =>
    uniqueStrings(data.data
        .map(row => row[column])
        .filter((value): value is string => typeof value === 'string')
        .map(value => normalizeWhitespace(value))
        .filter(Boolean));

const expandValuesAgainstDataset = (
    requestedValues: string[],
    actualValues: string[],
): string[] => {
    const exactLookup = new Map(actualValues.map(value => [value.toLowerCase(), value]));
    const looseBuckets = new Map<string, string[]>();

    actualValues.forEach(value => {
        const looseKey = toLooseKey(value);
        if (!looseKey) {
            return;
        }
        const bucket = looseBuckets.get(looseKey) ?? [];
        bucket.push(value);
        looseBuckets.set(looseKey, bucket);
    });

    const expanded = requestedValues.flatMap(rawValue => {
        const normalized = normalizeWhitespace(rawValue);
        const exact = exactLookup.get(normalized.toLowerCase());
        if (exact) {
            return [exact];
        }
        const looseMatches = looseBuckets.get(toLooseKey(normalized)) ?? [];
        return looseMatches.length > 0 ? looseMatches : [normalized];
    });

    return uniqueStrings(expanded);
};

const rebuildPredicateWithExpandedValues = (
    predicate: FilterPredicate,
    data: CsvData,
): FilterPredicate => {
    if ((predicate.operator !== 'eq' && predicate.operator !== 'in') || predicate.value === undefined) {
        return predicate;
    }

    const requestedValues = (Array.isArray(predicate.value) ? predicate.value : [predicate.value])
        .filter((value): value is string => typeof value === 'string')
        .map(normalizeWhitespace)
        .filter(Boolean);

    if (requestedValues.length === 0) {
        return predicate;
    }

    const actualValues = collectDistinctStringValues(data, predicate.column);
    if (actualValues.length === 0) {
        return predicate;
    }

    const expandedValues = expandValuesAgainstDataset(requestedValues, actualValues);
    if (expandedValues.length === 0) {
        return predicate;
    }

    if (expandedValues.length === 1) {
        return {
            ...predicate,
            operator: 'eq',
            value: expandedValues[0],
        };
    }

    return {
        ...predicate,
        operator: 'in',
        value: expandedValues,
    };
};

const mapPredicates = (
    predicates: FilterPredicate[] | undefined,
    mapper: (predicate: FilterPredicate) => FilterPredicate,
) => predicates?.map(mapper);

const mapGroups = (
    groups: FilterPredicateGroup[] | undefined,
    mapper: (predicate: FilterPredicate) => FilterPredicate,
) => groups?.map(group => ({
    predicates: group.predicates.map(mapper),
}));

const operationMentionsColumn = (operation: FilterRowsOperation, column: string) => {
    const normalized = column.toLowerCase();
    return (operation.predicates ?? []).some(predicate => predicate.column.toLowerCase() === normalized)
        || (operation.groups ?? []).some(group => group.predicates.some(predicate => predicate.column.toLowerCase() === normalized));
};

const hasNegativePredicateForColumn = (operation: FilterRowsOperation, column: string) => {
    const normalized = column.toLowerCase();
    const isNegative = (predicate: FilterPredicate) =>
        predicate.column.toLowerCase() === normalized
        && (predicate.operator === 'neq' || predicate.operator === 'not_null');

    return (operation.predicates ?? []).some(isNegative)
        || (operation.groups ?? []).some(group => group.predicates.some(isNegative));
};

const buildFilterFromHint = (
    baseOperation: FilterRowsOperation,
    hint: DeleteEqualityHint,
    data: CsvData,
): FilterRowsOperation => {
    const actualValues = expandValuesAgainstDataset(hint.values, collectDistinctStringValues(data, hint.column));
    const predicate: FilterPredicate = actualValues.length <= 1
        ? {
            column: hint.column,
            operator: 'eq',
            value: actualValues[0] ?? hint.values[0] ?? '',
        }
        : {
            column: hint.column,
            operator: 'in',
            value: actualValues,
        };

    return {
        ...baseOperation,
        id: baseOperation.id || `delete_${hint.column.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        reason: `Delete rows where ${hint.column} matches the requested target value${actualValues.length === 1 ? '' : 's'}.`,
        predicates: [predicate],
        groups: undefined,
    };
};

export const repairRowDeleteFilterOperation = (
    operation: FilterRowsOperation,
    request: string,
    data: CsvData,
    availableColumns: string[],
): FilterRowsOperation => {
    const hints = extractExplicitDeleteEqualityHints(request, availableColumns);
    const singleHint = hints.length === 1 ? hints[0] : null;

    if (singleHint && (!operationMentionsColumn(operation, singleHint.column) || hasNegativePredicateForColumn(operation, singleHint.column))) {
        return buildFilterFromHint(operation, singleHint, data);
    }

    return {
        ...operation,
        predicates: mapPredicates(operation.predicates, predicate => rebuildPredicateWithExpandedValues(predicate, data)),
        groups: mapGroups(operation.groups, predicate => rebuildPredicateWithExpandedValues(predicate, data)),
    };
};
