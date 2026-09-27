import type {
    AiAction,
    DataOperation,
    DropRowsByConditionOperation,
    DropRowsByIndexOperation,
    FilterPredicate,
    FilterPredicateGroup,
} from '../../../types';
import { normalizeDataMutatePayload } from './dataOperationRunner';

type RowDeleteOperation = DropRowsByConditionOperation | DropRowsByIndexOperation;

const ROW_DELETE_TYPES = new Set<DataOperation['type']>([
    'drop_rows_by_condition',
    'drop_rows_by_index',
]);

const isRowDeleteOperation = (operation: DataOperation | null | undefined): operation is RowDeleteOperation =>
    Boolean(operation) && ROW_DELETE_TYPES.has(operation.type);

const normalizeMutateOperations = (action: AiAction): DataOperation[] => {
    if (action.type !== 'tool_call' || action.toolName !== 'data.mutate') {
        return [];
    }

    const normalizedPayload = normalizeDataMutatePayload({
        explanation: action.args?.explanation,
        operations: Array.isArray(action.args?.operations)
            ? action.args.operations
            : (action.args && 'operation' in action.args && action.args.operation !== undefined ? [action.args.operation] : undefined),
        outputColumns: action.args?.outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    });

    return normalizedPayload.plan?.operations ?? [];
};

const canonicalizePrimitive = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(item => canonicalizePrimitive(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, canonicalizePrimitive(item)]),
    );
};

const stableSort = <T>(items: T[], mapItem: (item: T) => unknown): unknown[] =>
    items
        .map(item => canonicalizePrimitive(mapItem(item)))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

const canonicalizePredicate = (predicate: FilterPredicate) => ({
    column: predicate.column,
    operator: predicate.operator,
    ...(predicate.value !== undefined ? { value: canonicalizePrimitive(predicate.value) } : {}),
});

const canonicalizeGroup = (group: FilterPredicateGroup) => ({
    predicates: stableSort(group.predicates, canonicalizePredicate),
});

const canonicalizeRowDeleteOperation = (operation: RowDeleteOperation) => {
    if (operation.type === 'drop_rows_by_index') {
        return {
            type: operation.type,
            indices: [...operation.indices].sort((left, right) => left - right),
        };
    }

    return {
        type: operation.type,
        ...(operation.predicates?.length ? { predicates: stableSort(operation.predicates, canonicalizePredicate) } : {}),
        ...(operation.groups?.length ? { groups: stableSort(operation.groups, canonicalizeGroup) } : {}),
    };
};

export const getDestructiveRowDeleteSignature = (action: AiAction): string | null => {
    const operations = normalizeMutateOperations(action);
    if (operations.length === 0) {
        return null;
    }

    const primaryOperation = operations[0];
    const allRowDeletes = operations.every(isRowDeleteOperation);
    if (!isRowDeleteOperation(primaryOperation) && !allRowDeletes) {
        return null;
    }

    const rowDeleteOperations = operations.filter(isRowDeleteOperation);
    if (rowDeleteOperations.length === 0) {
        return null;
    }

    return JSON.stringify(rowDeleteOperations.map(canonicalizeRowDeleteOperation));
};

export const isDestructiveRowDeleteAction = (action: AiAction): boolean =>
    getDestructiveRowDeleteSignature(action) !== null;
