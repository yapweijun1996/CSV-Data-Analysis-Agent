/**
 * dataQueryValidation.ts
 *
 * Deep structural validation of data query payloads.
 * Catches malformed plans before execution with detailed error paths.
 */

import type {
    FilterPredicate,
    QueryPlan,
} from '../../../types';
import {
    isRecordLike,
    normalizeFilterPredicate,
    normalizeFilterPredicateGroup,
    normalizeQueryWhereClauseLike,
} from './dataOperationNormalization';
import { hasSemanticQueryPlan } from './dataQueryDetection';
import {
    normalizeQueryAggregateFunction,
    normalizeDataQueryPlanLike,
    normalizePostAggregatePredicate,
} from './dataQueryNormalization';

const SQLISH_SELECT_PATTERN = /^\s*(count|sum|avg|min|max|median|percentile)\s*\(|\s+as\s+/i;
const FILTER_VALUE_REQUIRED_OPERATORS = new Set<FilterPredicate['operator']>([
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
]);

const pushDuplicateError = (
    values: string[],
    path: string,
    errors: string[],
) => {
    const seen = new Set<string>();
    values.forEach(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) {
            errors.push(`${path} must not contain duplicate column names or aliases. Duplicate: ${value}.`);
            return;
        }
        seen.add(key);
    });
};

const validateColumnArray = (
    value: unknown,
    path: string,
    errors: string[],
    options?: { allowSqlExpressions?: boolean },
) => {
    if (value === undefined) {
        return;
    }
    if (!Array.isArray(value) || value.length === 0) {
        errors.push(`${path} must be a non-empty array.`);
        return;
    }

    value.forEach((column, index) => {
        const itemPath = path.startsWith('"')
            ? `${path.slice(0, -1)}[${index}]"`
            : `${path}[${index}]`;
        if (typeof column !== 'string' || !column.trim()) {
            errors.push(`${itemPath} must be a non-empty string column name.`);
            return;
        }
        if (!options?.allowSqlExpressions && SQLISH_SELECT_PATTERN.test(column)) {
            errors.push('"plan.select" must list plain output column names only. Use plan.aggregates for count/sum/avg instead of SQL expressions like COUNT(*) AS total_rows.');
        }
    });
};

const getResolvedPredicateValue = (value: Record<string, any>) =>
    value.value
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

const validatePredicateValue = (
    predicate: unknown,
    path: string,
    errors: string[],
) => {
    if (!isRecordLike(predicate)) {
        errors.push(`${path} must be an object.`);
        return;
    }

    const normalizedPredicate = normalizeFilterPredicate(predicate);
    if (!normalizedPredicate) {
        errors.push(`${path} must include a non-empty column name and a valid operator.`);
        return;
    }

    if (!normalizedPredicate.column.trim()) {
        errors.push(`${path}.column is required.`);
    }

    const resolvedValue = getResolvedPredicateValue(predicate);
    if (FILTER_VALUE_REQUIRED_OPERATORS.has(normalizedPredicate.operator) && resolvedValue === undefined) {
        errors.push(`${path}.value is required for operator "${normalizedPredicate.operator}".`);
    }

    if (normalizedPredicate.operator === 'between') {
        const values = Array.isArray(resolvedValue) ? resolvedValue : [];
        if (values.length < 2) {
            errors.push(`${path}.value must provide two values for operator "between".`);
        }
    }
};

const validatePredicateGroupValue = (
    group: unknown,
    path: string,
    errors: string[],
) => {
    if (!isRecordLike(group)) {
        errors.push(`${path} must be an object.`);
        return;
    }
    if (!Array.isArray(group.predicates) || group.predicates.length === 0) {
        errors.push(`${path}.predicates must be a non-empty array.`);
        return;
    }

    group.predicates.forEach((predicate, index) => {
        validatePredicateValue(predicate, `${path}.predicates[${index}]`, errors);
    });
};

const validateWhereClause = (
    value: unknown,
    errors: string[],
    path = '"plan.where"',
) => {
    const appendWherePath = (suffix: string) =>
        path.startsWith('"') && path.endsWith('"')
            ? `"${path.slice(1, -1)}.${suffix}"`
            : `${path}.${suffix}`;

    if (value === undefined) {
        return;
    }

    if (typeof value === 'string') {
        if (!normalizeQueryWhereClauseLike(value)) {
            errors.push(`${path} must contain a valid structured predicate or a parseable legacy filter string.`);
        }
        return;
    }

    if (!isRecordLike(value)) {
        errors.push(`${path} must be an object.`);
        return;
    }

    const hasPredicates = 'predicates' in value;
    const hasGroups = 'groups' in value;
    if (hasPredicates) {
        if (!Array.isArray(value.predicates) || value.predicates.length === 0) {
            errors.push(`${appendWherePath('predicates')} must be a non-empty array when provided.`);
        } else {
            value.predicates.forEach((predicate, index) => {
                validatePredicateValue(predicate, appendWherePath(`predicates[${index}]`), errors);
            });
        }
    }

    if (hasGroups) {
        if (!Array.isArray(value.groups) || value.groups.length === 0) {
            errors.push(`${appendWherePath('groups')} must be a non-empty array when provided.`);
        } else {
            value.groups.forEach((group, index) => {
                validatePredicateGroupValue(group, appendWherePath(`groups[${index}]`), errors);
            });
        }
    }

    if (!hasPredicates && !hasGroups) {
        errors.push(`${path} must include predicates or groups.`);
    } else if (!normalizeQueryWhereClauseLike(value)) {
        errors.push(`${path} must contain at least one valid predicate or group.`);
    }
};

const validateOrderBy = (value: unknown, errors: string[]) => {
    if (value === undefined) {
        return;
    }
    if (!Array.isArray(value) || value.length === 0) {
        errors.push('"plan.orderBy" must be a non-empty array.');
        return;
    }

    value.forEach((clause, index) => {
        if (!isRecordLike(clause)) {
            errors.push(`"plan.orderBy[${index}]" must be an object.`);
            return;
        }
        if (typeof clause.column !== 'string' || !clause.column.trim()) {
            errors.push(`"plan.orderBy[${index}].column" must be a non-empty string column name.`);
        }
        if (typeof clause.direction !== 'string' || !clause.direction.trim()) {
            errors.push(`"plan.orderBy[${index}].direction" must be "asc" or "desc".`);
            return;
        }
        const normalizedDirection = clause.direction.trim().toLowerCase();
        if (normalizedDirection !== 'asc' && normalizedDirection !== 'desc') {
            errors.push(`"plan.orderBy[${index}].direction" must be "asc" or "desc".`);
        }
    });
};

const validatePostAggregateClause = (
    value: unknown,
    errors: string[],
) => {
    if (value === undefined) {
        return;
    }
    if (!isRecordLike(value)) {
        errors.push('"plan.postAggregateFilter" must be an object.');
        return;
    }

    const validatePredicate = (predicate: unknown, path: string) => {
        if (!isRecordLike(predicate)) {
            errors.push(`${path} must be an object.`);
            return;
        }
        const normalizedPredicate = normalizePostAggregatePredicate(predicate);
        if (!normalizedPredicate) {
            errors.push(`${path} must include a valid aggregate output column and operator.`);
            return;
        }
        if (FILTER_VALUE_REQUIRED_OPERATORS.has(normalizedPredicate.operator as FilterPredicate['operator']) && predicate.value === undefined) {
            errors.push(`${path}.value is required for operator "${normalizedPredicate.operator}".`);
        }
    };

    const hasPredicates = Array.isArray(value.predicates) && value.predicates.length > 0;
    const hasGroups = Array.isArray(value.groups) && value.groups.length > 0;
    if (!hasPredicates && !hasGroups) {
        errors.push('"plan.postAggregateFilter" must include predicates or groups.');
        return;
    }
    (value.predicates ?? []).forEach((predicate, index) => validatePredicate(predicate, `"plan.postAggregateFilter.predicates[${index}]"`));
    (value.groups ?? []).forEach((group, index) => {
        if (!isRecordLike(group) || !Array.isArray(group.predicates) || group.predicates.length === 0) {
            errors.push(`"plan.postAggregateFilter.groups[${index}].predicates" must be a non-empty array.`);
            return;
        }
        group.predicates.forEach((predicate, predicateIndex) =>
            validatePredicate(predicate, `"plan.postAggregateFilter.groups[${index}].predicates[${predicateIndex}]"`));
    });
};

const validateAggregates = (
    value: unknown,
    normalizedPlan: QueryPlan,
    errors: string[],
) => {
    if (value === undefined) {
        return;
    }
    if (!Array.isArray(value) || value.length === 0) {
        errors.push('"plan.aggregates" must be a non-empty array.');
        return;
    }

    value.forEach((aggregate, index) => {
        if (!isRecordLike(aggregate)) {
            errors.push(`"plan.aggregates[${index}]" must be an object.`);
            return;
        }
        const functionName = normalizeQueryAggregateFunction(aggregate.function);
        if (!functionName) {
            errors.push(`"plan.aggregates[${index}].function" must be one of count, count_distinct, sum, avg, min, max, median, or percentile.`);
        }
        if (typeof aggregate.as !== 'string' || !aggregate.as.trim()) {
            errors.push(`"plan.aggregates[${index}].as" must be a non-empty string alias.`);
        }
        if (functionName === 'count') {
            if (aggregate.column !== undefined && (typeof aggregate.column !== 'string' || !aggregate.column.trim())) {
                errors.push(`"plan.aggregates[${index}].column" must be a non-empty string when provided.`);
            }
        } else if (typeof aggregate.column !== 'string' || !aggregate.column.trim()) {
            errors.push(`"plan.aggregates[${index}].column" is required for ${functionName ?? 'this aggregate'} queries.`);
        }
        if (functionName === 'percentile') {
            const percentile = typeof aggregate.percentile === 'number' ? aggregate.percentile : Number.NaN;
            if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
                errors.push(`"plan.aggregates[${index}].percentile" must be a number between 0 and 1 for percentile queries.`);
            }
        }
        validateWhereClause(aggregate.where, errors, `"plan.aggregates[${index}].where"`);
    });

    const groupByColumns = normalizedPlan.groupBy ?? [];
    const aggregateAliases = (normalizedPlan.aggregates ?? []).map(aggregate => aggregate.as);
    if (groupByColumns.length > 0 || aggregateAliases.length > 0) {
        pushDuplicateError([...groupByColumns, ...aggregateAliases], 'Aggregate query outputs', errors);
    }
};

export const validateDataQueryPayload = (args: Record<string, any>) => {
    const errors: string[] = [];
    if (!args?.explanation || typeof args.explanation !== 'string' || !args.explanation.trim()) {
        errors.push('"explanation" is required.');
    }
    if (!args?.plan || typeof args.plan !== 'object' || Array.isArray(args.plan)) {
        errors.push('"plan" must be an object.');
        return errors;
    }
    validateColumnArray(args.plan.select, '"plan.select"', errors);
    validateWhereClause(args.plan.where, errors);
    validateColumnArray(args.plan.groupBy, '"plan.groupBy"', errors, { allowSqlExpressions: true });
    validateOrderBy(args.plan.orderBy, errors);
    validatePostAggregateClause(args.plan.postAggregateFilter, errors);

    if (args.plan.limit !== undefined && (!Number.isInteger(args.plan.limit) || args.plan.limit < 0)) {
        errors.push('"plan.limit" must be a non-negative integer.');
    }

    const normalizedPlan = normalizeDataQueryPlanLike(args.plan) ?? {};
    validateAggregates(args.plan.aggregates, normalizedPlan, errors);
    if (!hasSemanticQueryPlan(normalizedPlan)) {
        errors.push('"plan" must include at least one structured query clause: select, where, orderBy, limit, groupBy, or aggregates.');
    }

    if ((normalizedPlan.groupBy?.length ?? 0) > 0 && (normalizedPlan.aggregates?.length ?? 0) === 0) {
        errors.push('"plan.groupBy" requires at least one aggregate in "plan.aggregates".');
    }

    if (normalizedPlan.postAggregateFilter) {
        if ((normalizedPlan.aggregates?.length ?? 0) === 0) {
            errors.push('"plan.postAggregateFilter" requires aggregate query output from "plan.aggregates".');
        } else {
            const validOutputColumns = new Set<string>([
                ...(normalizedPlan.groupBy ?? []).map(column => column.toLowerCase()),
                ...(normalizedPlan.aggregates ?? []).map(aggregate => aggregate.as.toLowerCase()),
            ]);
            const predicates = [
                ...(normalizedPlan.postAggregateFilter.predicates ?? []),
                ...((normalizedPlan.postAggregateFilter.groups ?? []).flatMap(group => group.predicates)),
            ];
            predicates.forEach((predicate, index) => {
                if (!validOutputColumns.has(predicate.column.toLowerCase())) {
                    errors.push(`"plan.postAggregateFilter" predicate ${index + 1} must reference a groupBy column or aggregate alias from the aggregate output.`);
                }
            });
        }
    }

    if ((normalizedPlan.aggregates?.length ?? 0) > 0) {
        const validOutputColumns = new Set<string>([
            ...(normalizedPlan.groupBy ?? []).map(column => column.toLowerCase()),
            ...(normalizedPlan.aggregates ?? []).map(aggregate => aggregate.as.toLowerCase()),
        ]);

        (normalizedPlan.select ?? []).forEach((column, index) => {
            if (!validOutputColumns.has(column.toLowerCase())) {
                errors.push(`"plan.select[${index}]" must reference a groupBy column or aggregate alias in aggregate queries.`);
            }
        });
    }

    if (normalizedPlan.select && normalizedPlan.orderBy) {
        normalizedPlan.orderBy.forEach((clause, index) => {
            const isSelected = normalizedPlan.select?.some(column => column.toLowerCase() === clause.column.toLowerCase());
            if (!isSelected) {
                errors.push(`"plan.orderBy[${index}].column" must also appear in "plan.select" for bounded read-only queries.`);
            }
        });
    }

    return [...new Set(errors)];
};
