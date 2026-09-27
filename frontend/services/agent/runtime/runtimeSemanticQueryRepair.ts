import type {
    AgentObservation,
    AgentTurn,
    AiAction,
    FilterPredicate,
    QueryAggregateClause,
    QueryOrderByClause,
    QueryPlan,
    QueryWhereClause,
} from '../../../types';
import type { DataQueryRepairHintCategory } from '../execution/dataQueryContract';
import {
    getDataQueryRepairHintCategoryFromText,
    isOrGroupsRepairIssue,
    normalizeDataQueryPayload,
} from '../execution/dataQueryContract';
import { isStructuralMetadataColumn, STRUCTURAL_METADATA_COLUMNS } from '../structuralMetadata';

type StructuralMetadataRepairHintCategory =
    | 'structural_metadata_leak'
    | 'bridge_missing_column'
    | 'duckdb_missing_column';

type SupportedSemanticRepairHintCategory =
    | 'or_groups_required'
    | StructuralMetadataRepairHintCategory;

export type SemanticQueryRepairResult =
    | { status: 'not_applicable' }
    | {
        status: 'applied';
        action: AiAction;
        reason: string;
        repairHintCategory: SupportedSemanticRepairHintCategory;
        beforeWhereShape: ReturnType<typeof summarizeWhereShape>;
        afterWhereShape: ReturnType<typeof summarizeWhereShape>;
    }
    | {
        status: 'ineligible';
        reason: string;
        repairHintCategory: SupportedSemanticRepairHintCategory;
        beforeWhereShape: ReturnType<typeof summarizeWhereShape>;
    };

const QUERY_MISSING_COLUMN_PATTERN = /Query [^:]+ references missing column:\s*([^.!?\n]+)/i;
const QUERY_MISSING_COLUMNS_PATTERN = /Query [^:]+ references missing columns:\s*([^.!?\n]+)/i;
const OPERATION_MISSING_COLUMNS_PATTERN = /Operation "[^"]+" references missing columns:\s*([^.!?\n]+)/i;
const DUCKDB_MISSING_COLUMN_PATTERN = /Referenced column "([^"]+)" not found in FROM clause/i;

const getRepairHintCategoriesFromObservation = (observation?: AgentObservation): DataQueryRepairHintCategory[] => {
    if (!observation) {
        return [];
    }

    const explicitCategories = Array.isArray(observation.detail?.repairHintCategories)
        ? observation.detail.repairHintCategories.filter((value): value is DataQueryRepairHintCategory => typeof value === 'string')
        : [];
    if (explicitCategories.length > 0) {
        return explicitCategories;
    }

    if (typeof observation.detail?.repairHintCategory === 'string') {
        return [observation.detail.repairHintCategory as DataQueryRepairHintCategory];
    }

    const derived = getDataQueryRepairHintCategoryFromText(
        [observation.summary, observation.retryHint].filter(Boolean).join(' '),
    );
    return derived ? [derived] : [];
};

export const getRepairHintCategoryFromObservation = (observation?: AgentObservation): string | null =>
    getRepairHintCategoriesFromObservation(observation)[0]
    ?? (isOrGroupsRepairIssue([observation?.summary, observation?.retryHint].filter(Boolean).join(' '))
        ? 'or_groups_required'
        : null);

export const stillUsesTopLevelAndPredicates = (action: AiAction): boolean => {
    if (action.type !== 'tool_call' || action.toolName !== 'data.query') {
        return false;
    }

    const normalizedQuery = normalizeDataQueryPayload(action.args ?? {});
    const predicateCount = normalizedQuery.plan.where?.predicates?.length ?? 0;
    const groupCount = normalizedQuery.plan.where?.groups?.length ?? 0;
    return predicateCount > 1 && groupCount === 0;
};

const summarizeWhereShape = (where: QueryWhereClause | null | undefined) => ({
    predicateCount: where?.predicates?.length ?? 0,
    groupCount: where?.groups?.length ?? 0,
    columns: [
        ...(where?.predicates ?? []).map(predicate => predicate.column),
        ...(where?.groups ?? []).flatMap(group => (group?.predicates ?? []).map(predicate => predicate.column)),
    ],
    operators: [
        ...(where?.predicates ?? []).map(predicate => predicate.operator),
        ...(where?.groups ?? []).flatMap(group => (group?.predicates ?? []).map(predicate => predicate.operator)),
    ],
});

const hasSameColumnAndOperator = (predicates: FilterPredicate[]) => {
    const [first] = predicates;
    if (!first) return false;
    return predicates.every(predicate => predicate.column === first.column && predicate.operator === first.operator);
};

const canSafelyConvertPredicatesToGroups = (predicates: FilterPredicate[], where: QueryWhereClause | undefined) => {
    if (!where || (where.groups?.length ?? 0) > 0) {
        return false;
    }
    if (predicates.length < 2) {
        return false;
    }
    return hasSameColumnAndOperator(predicates);
};

const extractMissingColumnReferences = (text: string): string[] => {
    const trimmed = text.trim();
    if (!trimmed) {
        return [];
    }

    const operationMatch = trimmed.match(OPERATION_MISSING_COLUMNS_PATTERN);
    if (operationMatch?.[1]) {
        return operationMatch[1]
            .split(',')
            .map(token => token.trim())
            .filter(Boolean);
    }

    const queryManyMatch = trimmed.match(QUERY_MISSING_COLUMNS_PATTERN);
    if (queryManyMatch?.[1]) {
        return queryManyMatch[1]
            .split(',')
            .map(token => token.trim())
            .filter(Boolean);
    }

    const queryOneMatch = trimmed.match(QUERY_MISSING_COLUMN_PATTERN);
    if (queryOneMatch?.[1]) {
        return [queryOneMatch[1].trim()];
    }

    const duckDbMatch = trimmed.match(DUCKDB_MISSING_COLUMN_PATTERN);
    if (duckDbMatch?.[1]) {
        return [duckDbMatch[1].trim()];
    }

    return [];
};

const isStructuralMetadataRepairCategory = (
    category: DataQueryRepairHintCategory,
): category is StructuralMetadataRepairHintCategory =>
    category === 'structural_metadata_leak'
    || category === 'bridge_missing_column'
    || category === 'duckdb_missing_column';

const stripMissingColumnsFromWhere = (
    where: QueryWhereClause | undefined,
    missingColumns: Set<string>,
): QueryWhereClause | undefined => {
    if (!where) {
        return undefined;
    }

    const predicates = (where.predicates ?? []).filter(
        predicate => !missingColumns.has(predicate.column.toLowerCase()),
    );
    const groups = (where.groups ?? [])
        .map(group => ({
            predicates: (group.predicates ?? []).filter(
                predicate => !missingColumns.has(predicate.column.toLowerCase()),
            ),
        }))
        .filter(group => group.predicates.length > 0);

    if (predicates.length === 0 && groups.length === 0) {
        return undefined;
    }

    return {
        ...(predicates.length > 0 ? { predicates } : {}),
        ...(groups.length > 0 ? { groups } : {}),
    };
};

const stripMissingColumnsFromAggregates = (
    aggregates: QueryAggregateClause[] | undefined,
    missingColumns: Set<string>,
): QueryAggregateClause[] | undefined => {
    if (!aggregates || aggregates.length === 0) {
        return undefined;
    }

    const nextAggregates = aggregates
        .filter(aggregate => !aggregate.column || !missingColumns.has(aggregate.column.toLowerCase()))
        .map(aggregate => {
            const nextWhere = stripMissingColumnsFromWhere(aggregate.where, missingColumns);
            const { where: _ignoredWhere, ...aggregateWithoutWhere } = aggregate;
            return {
                ...aggregateWithoutWhere,
                ...(nextWhere ? { where: nextWhere } : {}),
            };
        });

    return nextAggregates.length > 0 ? nextAggregates : undefined;
};

const stripMissingColumnsFromOrderBy = (
    orderBy: QueryOrderByClause[] | undefined,
    missingColumns: Set<string>,
): QueryOrderByClause[] | undefined => {
    if (!orderBy || orderBy.length === 0) {
        return undefined;
    }
    const nextOrderBy = orderBy.filter(clause => !missingColumns.has(clause.column.toLowerCase()));
    return nextOrderBy.length > 0 ? nextOrderBy : undefined;
};

const stripMissingColumnsFromPlan = (
    plan: QueryPlan,
    missingColumns: Set<string>,
): QueryPlan => {
    const nextGroupBy = (plan.groupBy ?? []).filter(column => !missingColumns.has(column.toLowerCase()));
    const nextSelect = (plan.select ?? []).filter(column => !missingColumns.has(column.toLowerCase()));
    const nextAggregates = stripMissingColumnsFromAggregates(plan.aggregates, missingColumns);
    const nextWhere = stripMissingColumnsFromWhere(plan.where, missingColumns);
    const nextOrderBy = stripMissingColumnsFromOrderBy(plan.orderBy, missingColumns);
    const remainingAggregateAliases = new Set((nextAggregates ?? []).map(aggregate => aggregate.as.toLowerCase()));
    const filteredSelect = nextSelect.filter(column => {
        const lowered = column.toLowerCase();
        return !missingColumns.has(lowered) || remainingAggregateAliases.has(lowered);
    });

    return {
        ...(filteredSelect.length > 0 ? { select: filteredSelect } : {}),
        ...(nextGroupBy.length > 0 ? { groupBy: nextGroupBy } : {}),
        ...(nextWhere ? { where: nextWhere } : {}),
        ...(nextAggregates ? { aggregates: nextAggregates } : {}),
        ...(nextOrderBy ? { orderBy: nextOrderBy } : {}),
        ...(plan.postAggregateFilter ? { postAggregateFilter: plan.postAggregateFilter } : {}),
        ...(Number.isInteger(plan.limit) ? { limit: plan.limit } : {}),
    };
};

const materiallyChangedPlan = (beforePlan: QueryPlan, afterPlan: QueryPlan) =>
    JSON.stringify(beforePlan) !== JSON.stringify(afterPlan);

export const attemptSemanticQueryRepair = (
    turn: AgentTurn,
    action: AiAction,
): SemanticQueryRepairResult => {
    const previousStep = turn.steps.at(-1);
    if (
        action.type !== 'tool_call'
        || action.toolName !== 'data.query'
        || previousStep?.action.type !== 'tool_call'
        || previousStep.action.toolName !== 'data.query'
        || (previousStep.observation?.code !== 'validation_failed' && previousStep.observation?.code !== 'semantic_miss')
    ) {
        return { status: 'not_applicable' };
    }

    const repairHintCategories = getRepairHintCategoriesFromObservation(previousStep.observation);
    const primaryRepairHintCategory = repairHintCategories.find(
        category => category === 'or_groups_required' || isStructuralMetadataRepairCategory(category),
    );
    if (!primaryRepairHintCategory) {
        return { status: 'not_applicable' };
    }

    const normalizedPayload = normalizeDataQueryPayload(action.args ?? {});
    const beforeWhereShape = summarizeWhereShape(normalizedPayload.plan.where);

    if (primaryRepairHintCategory === 'or_groups_required') {
        const where = normalizedPayload.plan.where;
        const predicates = where?.predicates ?? [];

        if (!stillUsesTopLevelAndPredicates(action)) {
            return { status: 'not_applicable' };
        }

        if (!canSafelyConvertPredicatesToGroups(predicates, where)) {
            return {
                status: 'ineligible',
                reason: 'The repeated data.query still requires OR groups, but runtime auto-repair only rewrites same-column, same-operator top-level predicates without existing groups.',
                repairHintCategory: primaryRepairHintCategory,
                beforeWhereShape,
            };
        }

        const repairedWhere: QueryWhereClause = {
            groups: predicates.map(predicate => ({
                predicates: [predicate],
            })),
        };

        const repairedAction: AiAction = {
            ...action,
            args: {
                ...(action.args ?? {}),
                plan: {
                    ...normalizedPayload.plan,
                    where: repairedWhere,
                },
                ...(normalizedPayload.fallbackFilterOperation
                    ? { fallbackFilterOperation: normalizedPayload.fallbackFilterOperation }
                    : {}),
            },
        };

        return {
            status: 'applied',
            action: repairedAction,
            reason: 'Runtime automatically rewrote repeated top-level AND predicates into OR groups after an or_groups_required retry hint.',
            repairHintCategory: primaryRepairHintCategory,
            beforeWhereShape,
            afterWhereShape: summarizeWhereShape(repairedWhere),
        };
    }

    const missingStructuralColumns = [
        ...extractMissingColumnReferences(previousStep.observation?.summary ?? ''),
        ...extractMissingColumnReferences(previousStep.observation?.retryHint ?? ''),
    ].filter(column => isStructuralMetadataColumn(column));

    if (missingStructuralColumns.length === 0) {
        return {
            status: 'ineligible',
            reason: 'The previous query referenced a missing column, but runtime auto-repair only strips structural metadata columns such as RowRole or RowClass.',
            repairHintCategory: primaryRepairHintCategory,
            beforeWhereShape,
        };
    }

    const missingColumnSet = new Set(missingStructuralColumns.map(column => column.toLowerCase()));
    STRUCTURAL_METADATA_COLUMNS.forEach(column => {
        missingColumnSet.add(column.toLowerCase());
    });
    const repairedPlan = stripMissingColumnsFromPlan(normalizedPayload.plan, missingColumnSet);
    if (!materiallyChangedPlan(normalizedPayload.plan, repairedPlan)) {
        return {
            status: 'ineligible',
            reason: 'The previous query hit a structural metadata leak, but the retried data.query no longer contains those missing structural metadata columns.',
            repairHintCategory: primaryRepairHintCategory,
            beforeWhereShape,
        };
    }

    const repairedAction: AiAction = {
        ...action,
        args: {
            ...(action.args ?? {}),
            plan: repairedPlan,
            ...(normalizedPayload.fallbackFilterOperation
                ? { fallbackFilterOperation: normalizedPayload.fallbackFilterOperation }
                : {}),
        },
    };

    return {
        status: 'applied',
        action: repairedAction,
        reason: `Runtime removed missing structural metadata columns from the retried data.query: ${missingStructuralColumns.join(', ')}.`,
        repairHintCategory: primaryRepairHintCategory,
        beforeWhereShape,
        afterWhereShape: summarizeWhereShape(repairedPlan.where),
    };
};
