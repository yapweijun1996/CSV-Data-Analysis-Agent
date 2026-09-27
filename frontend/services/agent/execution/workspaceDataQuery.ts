import type {
    FilterPredicate,
    QueryOrderByClause,
    QueryPlan,
    WorkspaceAggregateBreakdownQueryRequest,
    WorkspaceDataQueryRequest,
    WorkspaceDuplicateCandidatesQueryRequest,
    WorkspaceFilterLookupQueryRequest,
    WorkspaceNullBlankScanQueryRequest,
    WorkspacePreviewRowsQueryRequest,
    WorkspaceQueryTemplateId,
} from '../../../types';

const MAX_WORKSPACE_QUERY_LIMIT = 250;
export const DEFAULT_WORKSPACE_QUERY_LIMIT = 25;
export const WORKSPACE_QUERY_LIMIT_OPTIONS = [10, 25, 50, 100, 250] as const;

export interface WorkspaceQueryColumnCapabilities {
    selectableColumns: string[];
    groupableColumns: string[];
}

export const WORKSPACE_QUERY_TEMPLATE_OPTIONS: Array<{
    id: WorkspaceQueryTemplateId;
    title: string;
    description: string;
}> = [
    {
        id: 'preview_rows',
        title: 'Preview Rows',
        description: 'Inspect selected columns with a bounded row preview.',
    },
    {
        id: 'filter_lookup',
        title: 'Filter Lookup',
        description: 'Apply explicit predicates and OR groups without freeform SQL.',
    },
    {
        id: 'aggregate_breakdown',
        title: 'Aggregate Breakdown',
        description: 'Group rows, aggregate a metric, and sort the result.',
    },
    {
        id: 'duplicate_candidates',
        title: 'Duplicate Candidates',
        description: 'Group on key columns and rank likely duplicates by count.',
    },
    {
        id: 'null_blank_scan',
        title: 'Null / Blank Scan',
        description: 'Inspect or count null / blank values in a target column.',
    },
];

const buildColumnLookup = (allowedColumns: string[]) => {
    const lookup = new Map<string, string>();
    allowedColumns.forEach(column => lookup.set(column.toLowerCase(), column));
    return lookup;
};

const normalizeColumnCapabilities = (
    capabilities: WorkspaceQueryColumnCapabilities,
): WorkspaceQueryColumnCapabilities => ({
    selectableColumns: Array.from(new Set(capabilities.selectableColumns)),
    groupableColumns: Array.from(new Set(capabilities.groupableColumns)),
});

const resolveColumn = (column: string | null | undefined, lookup: Map<string, string>, context: string) => {
    if (!column?.trim()) {
        throw new Error(`${context} requires a selected column.`);
    }
    const resolved = lookup.get(column.trim().toLowerCase());
    if (!resolved) {
        throw new Error(`${context} references a missing column: ${column}`);
    }
    return resolved;
};

const resolveUniqueColumns = (columns: string[], lookup: Map<string, string>, context: string) => {
    const resolved = columns.map(column => resolveColumn(column, lookup, context));
    return Array.from(new Set(resolved));
};

const normalizeLimit = (limit: number | null | undefined) => {
    if (!Number.isFinite(limit)) {
        return DEFAULT_WORKSPACE_QUERY_LIMIT;
    }
    return Math.min(MAX_WORKSPACE_QUERY_LIMIT, Math.max(1, Math.floor(limit as number)));
};

const parseCommaSeparatedValues = (value: string | undefined, context: string) => {
    const values = (value ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    if (values.length === 0) {
        throw new Error(`${context} requires at least one value.`);
    }
    return values;
};

const parseRequiredNumber = (value: string | undefined, context: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`${context} requires a numeric value.`);
    }
    return numeric;
};

const parseRequiredText = (value: string | undefined, context: string) => {
    const normalized = value?.trim();
    if (!normalized) {
        throw new Error(`${context} requires a value.`);
    }
    return normalized;
};

const compilePredicate = (
    predicate: WorkspaceFilterLookupQueryRequest['predicates'][number],
    lookup: Map<string, string>,
    context: string,
): FilterPredicate => {
    const column = resolveColumn(predicate.column, lookup, context);
    switch (predicate.operator) {
        case 'is_null':
        case 'not_null':
            return {
                column,
                operator: predicate.operator,
            };
        case 'between':
            return {
                column,
                operator: 'between',
                value: [
                    parseRequiredNumber(predicate.value, `${context} lower bound`),
                    parseRequiredNumber(predicate.secondaryValue, `${context} upper bound`),
                ],
            };
        case 'in':
            return {
                column,
                operator: 'in',
                value: parseCommaSeparatedValues(predicate.value, context),
            };
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            return {
                column,
                operator: predicate.operator,
                value: parseRequiredNumber(predicate.value, context),
            };
        case 'eq':
        case 'neq':
        case 'contains':
        case 'starts_with':
        case 'ends_with':
            return {
                column,
                operator: predicate.operator,
                value: parseRequiredText(predicate.value, context),
            };
        default:
            throw new Error(`${context} uses an unsupported operator.`);
    }
};

const buildOrderBy = (
    orderBy: QueryOrderByClause | null | undefined,
    lookup: Map<string, string>,
    selectableColumns: string[],
    context: string,
): QueryOrderByClause[] | undefined => {
    if (!orderBy?.column?.trim()) {
        return undefined;
    }

    const resolvedColumn = resolveColumn(orderBy.column, lookup, `${context} sort`);
    if (!selectableColumns.some(column => column.toLowerCase() === resolvedColumn.toLowerCase())) {
        throw new Error(`${context} sort column "${resolvedColumn}" must also appear in the result columns.`);
    }

    return [{
        column: resolvedColumn,
        direction: orderBy.direction === 'desc' ? 'desc' : 'asc',
    }];
};

const compilePreviewRowsPlan = (
    request: WorkspacePreviewRowsQueryRequest,
    lookup: Map<string, string>,
): { explanation: string; plan: QueryPlan } => {
    const selectedColumns = resolveUniqueColumns(request.columns, lookup, 'Preview rows');
    const orderBy = buildOrderBy(request.orderBy, lookup, selectedColumns, 'Preview rows');
    return {
        explanation: `Preview ${normalizeLimit(request.limit)} row(s) from ${selectedColumns.length} selected column(s).`,
        plan: {
            select: selectedColumns,
            ...(orderBy ? { orderBy } : {}),
            limit: normalizeLimit(request.limit),
        },
    };
};

const compileFilterLookupPlan = (
    request: WorkspaceFilterLookupQueryRequest,
    lookup: Map<string, string>,
): { explanation: string; plan: QueryPlan } => {
    const selectedColumns = resolveUniqueColumns(request.columns, lookup, 'Filter lookup');
    const predicates = request.predicates.map((predicate, index) =>
        compilePredicate(predicate, lookup, `Filter lookup predicate ${index + 1}`),
    );
    const groups = (request.groups ?? [])
        .map((group, groupIndex) => ({
            predicates: group.predicates.map((predicate, predicateIndex) =>
                compilePredicate(predicate, lookup, `Filter lookup OR group ${groupIndex + 1} predicate ${predicateIndex + 1}`),
            ),
        }))
        .filter(group => group.predicates.length > 0);

    if (predicates.length === 0 && groups.length === 0) {
        throw new Error('Filter lookup requires at least one predicate or OR group.');
    }

    const orderBy = buildOrderBy(request.orderBy, lookup, selectedColumns, 'Filter lookup');
    return {
        explanation: `Filter rows with ${predicates.length + groups.length} structured condition block(s).`,
        plan: {
            select: selectedColumns,
            where: {
                ...(predicates.length > 0 ? { predicates } : {}),
                ...(groups.length > 0 ? { groups } : {}),
            },
            ...(orderBy ? { orderBy } : {}),
            limit: normalizeLimit(request.limit),
        },
    };
};

const compileAggregateBreakdownPlan = (
    request: WorkspaceAggregateBreakdownQueryRequest,
    capabilities: WorkspaceQueryColumnCapabilities,
): { explanation: string; plan: QueryPlan } => {
    const selectableLookup = buildColumnLookup(capabilities.selectableColumns);
    const groupableLookup = buildColumnLookup(capabilities.groupableColumns);
    const groupBy = resolveUniqueColumns(request.groupBy, groupableLookup, 'Aggregate breakdown');
    if (groupBy.length === 0) {
        throw new Error('Aggregate breakdown requires at least one group-by column.');
    }

    const alias = parseRequiredText(request.aggregate.as, 'Aggregate breakdown alias');
    const aggregateColumn = request.aggregate.column
        ? resolveColumn(request.aggregate.column, selectableLookup, 'Aggregate breakdown aggregate')
        : undefined;

    if (request.aggregate.function !== 'count' && !aggregateColumn) {
        throw new Error(`Aggregate breakdown requires a source column for ${request.aggregate.function}.`);
    }

    const selectedColumns = [...groupBy, alias];
    const aggregateOrder = buildOrderBy(request.orderBy, buildColumnLookup(selectedColumns), selectedColumns, 'Aggregate breakdown')
        ?? [{ column: alias, direction: 'desc' as const }];

    return {
        explanation: `Aggregate ${request.aggregate.function} by ${groupBy.join(', ')}.`,
        plan: {
            select: selectedColumns,
            groupBy,
            aggregates: [{
                function: request.aggregate.function,
                as: alias,
                ...(aggregateColumn ? { column: aggregateColumn } : {}),
            }],
            orderBy: aggregateOrder,
            limit: normalizeLimit(request.limit),
        },
    };
};

const compileDuplicateCandidatesPlan = (
    request: WorkspaceDuplicateCandidatesQueryRequest,
    capabilities: WorkspaceQueryColumnCapabilities,
): { explanation: string; plan: QueryPlan } => {
    const groupableLookup = buildColumnLookup(capabilities.groupableColumns);
    const keyColumns = resolveUniqueColumns(request.keyColumns, groupableLookup, 'Duplicate candidates');
    if (keyColumns.length === 0) {
        throw new Error('Duplicate candidates requires at least one key column.');
    }
    const countAlias = request.countAlias?.trim() || 'duplicate_count';
    return {
        explanation: `Rank duplicate candidates across ${keyColumns.join(', ')}.`,
        plan: {
            select: [...keyColumns, countAlias],
            groupBy: keyColumns,
            aggregates: [{
                function: 'count',
                as: countAlias,
            }],
            orderBy: [{
                column: countAlias,
                direction: 'desc',
            }],
            limit: normalizeLimit(request.limit),
        },
    };
};

const compileNullBlankScanPlan = (
    request: WorkspaceNullBlankScanQueryRequest,
    lookup: Map<string, string>,
): { explanation: string; plan: QueryPlan } => {
    const column = resolveColumn(request.column, lookup, 'Null / blank scan');
    const limit = request.resultMode === 'count' ? 1 : normalizeLimit(request.limit);
    if (request.resultMode === 'count') {
        return {
            explanation: `Count null / blank records for ${column}.`,
            plan: {
                select: ['null_blank_count'],
                where: {
                    predicates: [{
                        column,
                        operator: 'is_null',
                    }],
                },
                aggregates: [{
                    function: 'count',
                    as: 'null_blank_count',
                }],
                limit,
            },
        };
    }

    return {
        explanation: `Preview null / blank records for ${column}.`,
        plan: {
            select: [column],
            where: {
                predicates: [{
                    column,
                    operator: 'is_null',
                }],
            },
            limit,
        },
    };
};

export const compileWorkspaceDataQuery = (
    request: WorkspaceDataQueryRequest,
    capabilities: WorkspaceQueryColumnCapabilities,
): { explanation: string; plan: QueryPlan; templateId: WorkspaceQueryTemplateId; formSnapshot: WorkspaceDataQueryRequest } => {
    const normalizedCapabilities = normalizeColumnCapabilities(capabilities);
    const lookup = buildColumnLookup(normalizedCapabilities.selectableColumns);
    if (lookup.size === 0) {
        throw new Error('No dataset columns are available for analyst workspace queries.');
    }

    const compiled = (() => {
        switch (request.templateId) {
            case 'preview_rows':
                return compilePreviewRowsPlan(request, lookup);
            case 'filter_lookup':
                return compileFilterLookupPlan(request, lookup);
            case 'aggregate_breakdown':
                return compileAggregateBreakdownPlan(request, normalizedCapabilities);
            case 'duplicate_candidates':
                return compileDuplicateCandidatesPlan(request, normalizedCapabilities);
            case 'null_blank_scan':
                return compileNullBlankScanPlan(request, lookup);
            default:
                throw new Error('Unsupported workspace query template.');
        }
    })();

    return {
        ...compiled,
        templateId: request.templateId,
        formSnapshot: request,
    };
};

const getDefaultColumns = (columns: string[], count = 4) => columns.slice(0, Math.min(columns.length, count));

export const createDefaultWorkspaceQueryDrafts = (
    capabilities: WorkspaceQueryColumnCapabilities,
): Record<WorkspaceQueryTemplateId, WorkspaceDataQueryRequest> => {
    const normalizedCapabilities = normalizeColumnCapabilities(capabilities);
    const previewColumns = getDefaultColumns(normalizedCapabilities.selectableColumns);
    const firstSelectableColumn = normalizedCapabilities.selectableColumns[0] ?? '';
    const firstGroupableColumn = normalizedCapabilities.groupableColumns[0] ?? '';
    const secondGroupableColumn = normalizedCapabilities.groupableColumns[1] ?? firstGroupableColumn;

    return {
        preview_rows: {
            templateId: 'preview_rows',
            columns: previewColumns,
            orderBy: firstSelectableColumn ? { column: firstSelectableColumn, direction: 'asc' } : null,
            limit: DEFAULT_WORKSPACE_QUERY_LIMIT,
        },
        filter_lookup: {
            templateId: 'filter_lookup',
            columns: previewColumns.length > 0 ? previewColumns : (firstSelectableColumn ? [firstSelectableColumn] : []),
            predicates: firstSelectableColumn
                ? [{ column: firstSelectableColumn, operator: 'eq', value: '' }]
                : [],
            groups: [],
            orderBy: firstSelectableColumn ? { column: firstSelectableColumn, direction: 'asc' } : null,
            limit: DEFAULT_WORKSPACE_QUERY_LIMIT,
        },
        aggregate_breakdown: {
            templateId: 'aggregate_breakdown',
            groupBy: firstGroupableColumn ? [firstGroupableColumn] : [],
            aggregate: {
                function: 'count',
                column: null,
                as: 'row_count',
            },
            orderBy: { column: 'row_count', direction: 'desc' },
            limit: DEFAULT_WORKSPACE_QUERY_LIMIT,
        },
        duplicate_candidates: {
            templateId: 'duplicate_candidates',
            keyColumns: secondGroupableColumn && secondGroupableColumn !== firstGroupableColumn
                ? [firstGroupableColumn, secondGroupableColumn].filter(Boolean)
                : (firstGroupableColumn ? [firstGroupableColumn] : []),
            countAlias: 'duplicate_count',
            limit: DEFAULT_WORKSPACE_QUERY_LIMIT,
        },
        null_blank_scan: {
            templateId: 'null_blank_scan',
            column: '',
            resultMode: 'preview',
            limit: DEFAULT_WORKSPACE_QUERY_LIMIT,
        },
    };
};
