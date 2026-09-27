import type {
    CastColumnOperation,
    FilterPredicate,
    FilterPredicateGroup,
    QueryWhereClause,
    RenameColumnsOperation,
    ReplaceValuesOperation,
} from '../../../types';

const isRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const OPERATION_WRAPPER_KEYS = ['args', 'params', 'payload', 'config', 'operation'] as const;

export const normalizeString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const flattenOperationRecord = (value: unknown): Record<string, any> | null => {
    if (!isRecord(value)) return null;

    let flattened: Record<string, any> = { ...value };
    for (let depth = 0; depth < 3; depth += 1) {
        let changed = false;

        for (const key of OPERATION_WRAPPER_KEYS) {
            const nested = isRecord(flattened[key]) ? flattened[key] : null;
            if (!nested) {
                continue;
            }

            const { [key]: _ignored, ...rest } = flattened;
            flattened = { ...nested, ...rest };
            changed = true;
        }

        if (!changed) {
            break;
        }
    }

    return flattened;
};

const normalizeFilterOperator = (value: unknown): FilterPredicate['operator'] | '' => {
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized) return '';
    if (['eq', '=', '==', '===', 'equals', 'equal', 'is', 'match'].includes(normalized)) return 'eq';
    if (['neq', '!=', '!==', 'not_equals', 'not_equal', 'is_not'].includes(normalized)) return 'neq';
    if (['gt', '>'].includes(normalized)) return 'gt';
    if (['gte', '>='].includes(normalized)) return 'gte';
    if (['lt', '<'].includes(normalized)) return 'lt';
    if (['lte', '<='].includes(normalized)) return 'lte';
    if (normalized === 'between') return 'between';
    if (['contains', 'includes'].includes(normalized)) return 'contains';
    if (['starts_with', 'startswith', 'startswith'].includes(normalized)) return 'starts_with';
    if (['ends_with', 'endswith'].includes(normalized)) return 'ends_with';
    if (normalized === 'in') return 'in';
    if (['not_in', 'notin', 'not in'].includes(normalized)) return 'not_in';
    if (['is_null', 'null', 'empty'].includes(normalized)) return 'is_null';
    if (['not_null', 'notnull', 'not_empty'].includes(normalized)) return 'not_null';
    return '';
};

const normalizeLooseFilterPredicate = (value: unknown): FilterPredicate | null => {
    if (!isRecord(value)) return null;
    const column = normalizeString(value.column ?? value.columnName ?? value.field ?? value.key ?? value.name);
    const inferredOperator = normalizeFilterOperator(
        value.operator
        ?? value.op
        ?? value.comparator
        ?? value.matchType
        ?? ('equals' in value ? 'eq' : undefined)
        ?? ('is' in value ? 'eq' : undefined)
        ?? ('match' in value ? 'eq' : undefined)
        ?? ('notEquals' in value ? 'neq' : undefined)
        ?? ('not' in value ? 'neq' : undefined)
        ?? ('gt' in value ? 'gt' : undefined)
        ?? ('gte' in value ? 'gte' : undefined)
        ?? ('lt' in value ? 'lt' : undefined)
        ?? ('lte' in value ? 'lte' : undefined),
    );
    if (!column || !inferredOperator) return null;

    const next: FilterPredicate = {
        column,
        operator: inferredOperator,
    };

    const resolvedValue = value.value
        ?? value.values
        ?? value.targetValue
        ?? value.expectedValue
        ?? value.equals
        ?? value.is
        ?? value.match
        ?? value.notEquals
        ?? value.not
        ?? value.gt
        ?? value.gte
        ?? value.lt
        ?? value.lte;

    if (resolvedValue !== undefined && inferredOperator !== 'is_null' && inferredOperator !== 'not_null') {
        if ((inferredOperator === 'in' || inferredOperator === 'not_in') && !Array.isArray(resolvedValue)) {
            const listValues = typeof resolvedValue === 'string'
                ? resolvedValue.split(',').map(item => item.trim()).filter(Boolean)
                : [resolvedValue];
            next.value = listValues;
        } else {
            next.value = resolvedValue;
        }
    }

    return next;
};

export const normalizeFilterPredicate = (value: unknown): FilterPredicate | null => {
    return normalizeLooseFilterPredicate(value);
};

export const normalizeFilterPredicateGroup = (value: unknown): FilterPredicateGroup | null => {
    if (!isRecord(value)) return null;
    const sourcePredicates = Array.isArray(value.predicates)
        ? value.predicates
        : (Array.isArray(value.conditions) ? value.conditions : []);
    const predicates = sourcePredicates
        .map(normalizeFilterPredicate)
        .filter((predicate): predicate is FilterPredicate => Boolean(predicate));
    return predicates.length > 0 ? { predicates } : null;
};

const extractFilterPredicates = (value: unknown): FilterPredicate[] | undefined => {
    if (!isRecord(value)) return undefined;
    if (Array.isArray(value.predicates)) {
        const predicates = value.predicates
            .map(normalizeFilterPredicate)
            .filter((predicate): predicate is FilterPredicate => Boolean(predicate));
        return predicates.length > 0 ? predicates : undefined;
    }
    if (Array.isArray(value.filters)) {
        const predicates = value.filters
            .map(normalizeFilterPredicate)
            .filter((predicate): predicate is FilterPredicate => Boolean(predicate));
        return predicates.length > 0 ? predicates : undefined;
    }
    if (isRecord(value.predicate)) {
        const predicate = normalizeFilterPredicate(value.predicate);
        return predicate ? [predicate] : undefined;
    }
    if (isRecord(value.where)) {
        const wherePredicates = extractFilterPredicates(value.where);
        if (wherePredicates?.length) return wherePredicates;
        const directWherePredicate = normalizeFilterPredicate(value.where);
        return directWherePredicate ? [directWherePredicate] : undefined;
    }
    const directPredicate = normalizeFilterPredicate(value);
    return directPredicate ? [directPredicate] : undefined;
};

const extractFilterPredicateGroups = (value: unknown): FilterPredicateGroup[] | undefined => {
    if (!isRecord(value)) return undefined;
    if (Array.isArray(value.groups)) {
        const groups = value.groups
            .map(normalizeFilterPredicateGroup)
            .filter((group): group is FilterPredicateGroup => Boolean(group));
        return groups.length > 0 ? groups : undefined;
    }
    if (Array.isArray(value.or)) {
        const groups = value.or
            .map(item => {
                if (isRecord(item) && (Array.isArray(item.predicates) || Array.isArray(item.conditions))) {
                    return normalizeFilterPredicateGroup(item);
                }
                const predicate = normalizeFilterPredicate(item);
                return predicate ? { predicates: [predicate] } : null;
            })
            .filter((group): group is FilterPredicateGroup => Boolean(group));
        return groups.length > 0 ? groups : undefined;
    }
    if (isRecord(value.where)) {
        return extractFilterPredicateGroups(value.where);
    }
    return undefined;
};

export const parseLegacyFilterCondition = (condition: string): FilterPredicate[] | null => {
    const trimmed = condition.trim();
    const segments = trimmed.split(/\s*&&\s*/g);
    const predicates = segments
        .map(segment => segment.trim())
        .map(segment => {
            const rowMatch = segment.match(/^row\[['"](.+?)['"]\]\s*(===|==|=|!==|!=|>=|<=|>|<)\s*(.+)$/);
            const directMatch = segment.match(/^([A-Za-z0-9_ .-]+)\s*(===|==|=|!==|!=|>=|<=|>|<)\s*(.+)$/);
            const match = rowMatch ?? directMatch;
            if (!match) return null;
            const [, rawColumn, operator, rawValue] = match;
            const column = rawColumn.trim();
            const valueText = rawValue.trim();
            const quotedValue = valueText.match(/^['"](.*)['"]$/);
            const parsedValue = quotedValue
                ? quotedValue[1]
                : (valueText === 'null' ? null : (Number.isNaN(Number(valueText)) ? valueText : Number(valueText)));
            switch (operator) {
                case '===':
                case '==':
                case '=':
                    return { column, operator: parsedValue === null ? 'is_null' : 'eq', value: parsedValue === null ? undefined : parsedValue } as FilterPredicate;
                case '!==':
                case '!=':
                    return { column, operator: parsedValue === null ? 'not_null' : 'neq', value: parsedValue === null ? undefined : parsedValue } as FilterPredicate;
                case '>':
                    return { column, operator: 'gt', value: parsedValue } as FilterPredicate;
                case '>=':
                    return { column, operator: 'gte', value: parsedValue } as FilterPredicate;
                case '<':
                    return { column, operator: 'lt', value: parsedValue } as FilterPredicate;
                case '<=':
                    return { column, operator: 'lte', value: parsedValue } as FilterPredicate;
                default:
                    return null;
            }
        })
        .filter((predicate): predicate is FilterPredicate => Boolean(predicate))
        .filter(predicate => !(predicate.operator === 'neq' && predicate.value === ''));
    return predicates.length > 0 ? predicates : null;
};

export const normalizeQueryWhereClauseLike = (value: unknown): QueryWhereClause | undefined => {
    if (value === null || value === undefined) {
        return undefined;
    }

    if (typeof value === 'string') {
        const predicates = parseLegacyFilterCondition(value);
        return predicates?.length ? { predicates } : undefined;
    }

    if (Array.isArray(value)) {
        const predicates = value
            .map(normalizeFilterPredicate)
            .filter((predicate): predicate is FilterPredicate => Boolean(predicate));
        return predicates.length > 0 ? { predicates } : undefined;
    }

    if (!isRecord(value)) {
        return undefined;
    }

    const predicates = extractFilterPredicates(value);
    const groups = extractFilterPredicateGroups(value);
    if ((!predicates || predicates.length === 0) && (!groups || groups.length === 0)) {
        return undefined;
    }

    return {
        ...(predicates && predicates.length > 0 ? { predicates } : {}),
        ...(groups && groups.length > 0 ? { groups } : {}),
    };
};

export const normalizeRenameMappings = (value: unknown): RenameColumnsOperation['mappings'] => {
    if (isRecord(value)) {
        return Object.entries(value)
            .map(([from, to]) => ({ from: normalizeString(from), to: normalizeString(to) }))
            .filter(mapping => Boolean(mapping.from && mapping.to));
    }
    if (!Array.isArray(value)) return [];
    return value
        .map(item => isRecord(item) ? { from: normalizeString(item.from), to: normalizeString(item.to) } : null)
        .filter((mapping): mapping is RenameColumnsOperation['mappings'][number] => Boolean(mapping?.from && mapping.to));
};

const normalizeReplacementEntry = (
    value: unknown,
): (ReplaceValuesOperation['replacements'][number] & { column?: string }) | null => {
    if (!isRecord(value)) {
        return null;
    }

    const from = normalizeString(
        value.from
        ?? value.search
        ?? value.find
        ?? value.match
        ?? value.oldValue
        ?? value.sourceValue,
    );
    const hasToValue = ['to', 'replaceWith', 'replacement', 'newValue', 'normalizedValue', 'targetValue']
        .some(key => key in value);
    const to = value.to
        ?? value.replaceWith
        ?? value.replacement
        ?? value.newValue
        ?? value.normalizedValue
        ?? value.targetValue;
    if (!from || !hasToValue) {
        return null;
    }

    const column = normalizeString(value.column ?? value.columnName ?? value.field ?? value.targetColumn);
    return column ? { from, to, column } : { from, to };
};

export const normalizeReplaceValueReplacements = (
    value: unknown,
): Array<ReplaceValuesOperation['replacements'][number] & { column?: string }> => {
    if (isRecord(value)) {
        const directEntry = normalizeReplacementEntry(value);
        if (directEntry) {
            return [directEntry];
        }
        return Object.entries(value)
            .map(([from, to]) => ({ from: normalizeString(from), to }))
            .filter((entry): entry is ReplaceValuesOperation['replacements'][number] => Boolean(entry.from));
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(normalizeReplacementEntry)
        .filter((entry): entry is ReplaceValuesOperation['replacements'][number] & { column?: string } => Boolean(entry));
};

export const inferReplaceValueColumn = (value: unknown): string => {
    const columns = Array.from(new Set(
        normalizeReplaceValueReplacements(value)
            .map(entry => normalizeString((entry as { column?: unknown }).column))
            .filter(Boolean),
    ));

    return columns.length === 1 ? columns[0] : '';
};

export const normalizeCastTargetType = (value: unknown): CastColumnOperation['targetType'] | null => {
    const raw = normalizeString(value);
    const normalized = (
        raw === 'numerical'
        || raw === 'numeric'
        || raw === 'float'
        || raw === 'double'
        || raw === 'decimal'
        || raw === 'int'
        || raw === 'integer'
            ? 'number'
            : raw
    ) as CastColumnOperation['targetType'];
    return ['number', 'currency', 'percentage', 'date', 'boolean', 'string'].includes(normalized) ? normalized : null;
};

export const isRecordLike = isRecord;
