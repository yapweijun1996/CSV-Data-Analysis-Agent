/**
 * Directive Injector — deterministic harness directive → QueryPlan injection.
 *
 * Pure function: takes a QueryPlan + runtime directives, returns an
 * augmented QueryPlan with harness constraints applied automatically.
 *
 * This is the canonical location for SQL-level directive enforcement.
 * All directive-to-SQL logic lives here — not in prompts, not in
 * evidenceQuerySemantics, not in the AI's head.
 */

import type {
    AggregationHint,
    ColumnRegistry,
    FilterPredicate,
    QueryPostAggregateClause,
    QueryPlan,
    QueryWhereClause,
} from '../../types';
import type { DataInvestigationFindings } from '../agent/runtime/investigationTypes';
import {
    resolveColumnReference,
} from '../data/columnRegistry';
import type { DimensionNormalizationConfig } from './dimensionNormalization';
import type { CompileDuckDbQueryOptions } from './queryCompiler';

const LOG_PREFIX = '[DirectiveInjector]';

// --- Types ---

export type RuntimeDirectives = DataInvestigationFindings['runtimeDirectives'];

export interface DirectiveInjectionContext {
    directives: RuntimeDirectives;
    /** Available column names for validation. */
    availableColumns?: string[];
    /** Shared column registry for alias resolution and role enforcement. */
    columnRegistry?: ColumnRegistry | null;
    /** When true, skip detail-row filter (e.g. for summary-row analysis topics). */
    isSummaryRowTopic?: boolean;
    /** Dimension normalization config to apply to GROUP BY columns. */
    dimensionNormalization?: DimensionNormalizationConfig | null;
}

export interface DirectiveInjectionResult {
    plan: QueryPlan;
    injected: string[];
    warnings: string[];
    validationError?: string | null;
    /** Compilation options to forward to compileQueryPlanToDuckDbSql. */
    compilationOverrides?: Partial<CompileDuckDbQueryOptions>;
}

// --- Helpers ---

const getAvailableColumns = (context: Pick<DirectiveInjectionContext, 'availableColumns' | 'columnRegistry'>): string[] => {
    if (Array.isArray(context.availableColumns) && context.availableColumns.length > 0) {
        return context.availableColumns;
    }
    return context.columnRegistry?.columns.map(entry => entry.physicalName) ?? [];
};

/** Find the canonical column name from available columns, matching case-insensitively. */
const resolveColumn = (
    name: string,
    context: Pick<DirectiveInjectionContext, 'availableColumns' | 'columnRegistry'>,
): string | null => {
    const registryResolved = resolveColumnReference(name, context.columnRegistry);
    if (registryResolved) {
        return registryResolved;
    }
    const available = getAvailableColumns(context);
    if (available.length === 0) return name;
    const lower = name.toLowerCase();
    return available.find(c => c.toLowerCase() === lower) ?? null;
};

/**
 * RowRole/RowClass equivalence resolver.
 * The data preparation pipeline may use either column name depending on the
 * stage (profiling vs cleaning vs serialization).  The steering may persist
 * one name while the DuckDB table has the other.  This helper tries the
 * specified name first, then falls back to the known equivalent.
 */
const DETAIL_ROW_COLUMN_EQUIVALENTS: Record<string, string> = {
    rowrole: 'RowClass',
    rowclass: 'RowRole',
};

const resolveDetailRowColumn = (
    column: string,
    context: Pick<DirectiveInjectionContext, 'availableColumns' | 'columnRegistry'>,
): string | null => {
    const resolved = resolveColumn(column, context);
    if (resolved) return resolved;
    // Try the known equivalent
    const equivalent = DETAIL_ROW_COLUMN_EQUIVALENTS[column.toLowerCase()];
    if (equivalent) {
        const fallback = resolveColumn(equivalent, context);
        if (fallback) {
            console.warn(`${LOG_PREFIX} Detail-row column "${column}" not found, resolved to equivalent "${fallback}"`);
            return fallback;
        }
    }
    return null;
};

const appendPredicate = (where: QueryWhereClause | undefined, predicate: FilterPredicate): QueryWhereClause => {
    const existing = where ?? {};
    return {
        ...existing,
        predicates: [...(existing.predicates ?? []), predicate],
    };
};

const hasSameColumnPredicate = (where: QueryWhereClause | undefined, column: string, operator: string): boolean => {
    const lower = column.toLowerCase();
    const predicates = where?.predicates ?? [];
    return predicates.some(p =>
        p.column.toLowerCase() === lower && p.operator === operator,
    );
};

// --- Injection rules ---

/**
 * Rule 1: Hierarchy exclusion.
 * When the harness detected parent subtotal rows, inject WHERE "hierarchyColumn" NOT IN (...).
 */
const injectHierarchyExclusion = (
    plan: QueryPlan,
    directives: RuntimeDirectives,
    context: Pick<DirectiveInjectionContext, 'availableColumns' | 'columnRegistry'>,
): { plan: QueryPlan; injected: string | null; warning: string | null } => {
    const { excludeFromAggregation, hierarchyColumn } = directives;
    if (!hierarchyColumn || !excludeFromAggregation || excludeFromAggregation.length === 0) {
        return { plan, injected: null, warning: null };
    }
    const resolvedHierarchyColumn = resolveColumn(hierarchyColumn, context);
    if (!resolvedHierarchyColumn) {
        return {
            plan,
            injected: null,
            warning: `Hierarchy column "${hierarchyColumn}" not found in available columns — skipping exclusion`,
        };
    }
    // Don't inject if caller already has a not_in predicate on this column
    if (hasSameColumnPredicate(plan.where, resolvedHierarchyColumn, 'not_in')) {
        return { plan, injected: null, warning: null };
    }
    const predicate: FilterPredicate = {
        column: resolvedHierarchyColumn,
        operator: 'not_in',
        value: [...excludeFromAggregation],
    };
    return {
        plan: { ...plan, where: appendPredicate(plan.where, predicate) },
        injected: `hierarchy_exclusion: "${resolvedHierarchyColumn}" NOT IN [${excludeFromAggregation.length} values]`,
        warning: null,
    };
};

/**
 * Rule 2: Detail-row filter.
 * When a RowClass/detail-row contract exists, inject WHERE "column" = 'value'
 * to filter to fact/detail rows only.
 */
const injectDetailRowFilter = (
    plan: QueryPlan,
    directives: RuntimeDirectives,
    context: Pick<DirectiveInjectionContext, 'availableColumns' | 'columnRegistry'>,
    isSummaryRowTopic?: boolean,
): { plan: QueryPlan; injected: string | null; warning: string | null } => {
    if (isSummaryRowTopic) {
        return { plan, injected: null, warning: null };
    }
    const filter = directives.detailRowFilter
        ?? (directives.detailRowColumn && directives.detailRowValue
            ? { column: directives.detailRowColumn, value: directives.detailRowValue }
            : null);
    if (!filter || !filter.column || !filter.value) {
        return { plan, injected: null, warning: null };
    }
    // When available columns are not provided, the detail-row column may be
    // stale (from a different dataset version, e.g. RowRole vs RowClass).
    // Skip injection to prevent SQL "column not found" errors.
    const available = getAvailableColumns(context);
    if (available.length === 0 && !context.columnRegistry) {
        return {
            plan,
            injected: null,
            warning: `Detail-row filter skipped: available columns not provided for validation of "${filter.column}"`,
        };
    }
    // Resolve the actual column name from available columns.
    // The steering may persist "RowRole" while the DuckDB table has "RowClass"
    // (or vice versa) due to column name changes across preparation stages.
    const resolvedColumn = resolveDetailRowColumn(filter.column, context);
    if (!resolvedColumn) {
        return {
            plan,
            injected: null,
            warning: `Detail-row column "${filter.column}" not found in available columns [${available.slice(0, 5).join(', ')}${available.length > 5 ? '...' : ''}] — skipping filter`,
        };
    }
    // Don't inject if caller already filters on this column (or its equivalent)
    if (hasSameColumnPredicate(plan.where, resolvedColumn, 'eq')
        || hasSameColumnPredicate(plan.where, filter.column, 'eq')) {
        return { plan, injected: null, warning: null };
    }
    const predicate: FilterPredicate = {
        column: resolvedColumn,
        operator: 'eq',
        value: filter.value,
    };
    return {
        plan: { ...plan, where: appendPredicate(plan.where, predicate) },
        injected: `detail_row_filter: "${resolvedColumn}" = "${filter.value}"${resolvedColumn !== filter.column ? ` (resolved from "${filter.column}")` : ''}`,
        warning: null,
    };
};

/**
 * Rule 4: blocked dimension enforcement.
 * Remove blocked groupBy columns and replace them with a preferred business grain.
 */
const injectBlockedDimensionEnforcement = (
    plan: QueryPlan,
    context: DirectiveInjectionContext,
): {
    plan: QueryPlan;
    injected: string | null;
    warning: string | null;
    validationError: string | null;
} => {
    const originalGroupBy = Array.isArray(plan.groupBy) ? [...plan.groupBy] : [];
    if (originalGroupBy.length === 0 || !context.columnRegistry) {
        return { plan, injected: null, warning: null, validationError: null };
    }

    const registry = context.columnRegistry;
    const physicalGroupBy = originalGroupBy
        .map(column => resolveColumn(column, context) ?? column)
        .filter((column, index, array) => array.findIndex(candidate => candidate.toLowerCase() === column.toLowerCase()) === index);

    const blockedColumns = physicalGroupBy.filter(column => {
        const entry = registry.columns.find(candidate => candidate.physicalName.toLowerCase() === column.toLowerCase());
        return entry ? !entry.allowedUsages.groupBy : false;
    });
    if (blockedColumns.length === 0) {
        return { plan, injected: null, warning: null, validationError: null };
    }

    const replacementCandidates = [
        ...(context.directives.preferGroupBy ?? []),
        ...registry.columns
            .filter(entry => entry.allowedUsages.groupBy && entry.analysisRole === 'business_dimension')
            .map(entry => entry.physicalName),
    ]
        .map(column => resolveColumn(column, context))
        .filter((column): column is string => typeof column === 'string' && column.trim().length > 0);

    const nextGroupBy: string[] = [];
    const consumedBlocked: string[] = [];
    const replacementByBlocked = new Map<string, string>();
    const used = new Set<string>();

    const pushUnique = (column: string) => {
        const key = column.toLowerCase();
        if (used.has(key)) {
            return;
        }
        used.add(key);
        nextGroupBy.push(column);
    };

    physicalGroupBy.forEach(column => {
        const entry = registry.columns.find(candidate => candidate.physicalName.toLowerCase() === column.toLowerCase());
        if (!entry || entry.allowedUsages.groupBy) {
            pushUnique(column);
            return;
        }

        const replacement = replacementCandidates.find(candidate => {
            if (candidate.toLowerCase() === column.toLowerCase()) {
                return false;
            }
            const candidateEntry = registry.columns.find(registryColumn =>
                registryColumn.physicalName.toLowerCase() === candidate.toLowerCase(),
            );
            return Boolean(candidateEntry?.allowedUsages.groupBy);
        });

        if (!replacement) {
            return;
        }

        const normalizedReplacement = replacement.toLowerCase();
        if (used.has(normalizedReplacement)) {
            consumedBlocked.push(`${column} -> ${replacement}`);
            replacementByBlocked.set(column.toLowerCase(), replacement);
            return;
        }

        pushUnique(replacement);
        consumedBlocked.push(`${column} -> ${replacement}`);
        replacementByBlocked.set(column.toLowerCase(), replacement);
    });

    const unresolvedBlocked = blockedColumns.filter(column =>
        !consumedBlocked.some(rewrite => rewrite.toLowerCase().startsWith(`${column.toLowerCase()} ->`)),
    );
    if (unresolvedBlocked.length > 0) {
        return {
            plan,
            injected: null,
            warning: null,
            validationError: `blocked_group_by_unresolved:${unresolvedBlocked.join(',')}`,
        };
    }

    const aggregateAliases = new Set(
        (plan.aggregates ?? [])
            .map(aggregate => aggregate.as?.trim().toLowerCase())
            .filter((alias): alias is string => Boolean(alias)),
    );
    const rewritePostAggregateColumn = (column: string) => {
        const normalized = column.trim().toLowerCase();
        if (aggregateAliases.has(normalized)) {
            return column;
        }
        const directReplacement = replacementByBlocked.get(normalized);
        if (directReplacement) {
            return directReplacement;
        }
        const resolvedColumn = resolveColumn(column, context);
        if (!resolvedColumn) {
            return column;
        }
        return replacementByBlocked.get(resolvedColumn.toLowerCase()) ?? column;
    };

    const nextSelect = Array.isArray(plan.select)
        ? plan.select.reduce<string[]>((selected, column) => {
            const resolvedColumn = resolveColumn(column, context);
            const replacement = resolvedColumn
                ? replacementByBlocked.get(resolvedColumn.toLowerCase())
                : null;
            const nextColumn = replacement ?? column;
            if (!selected.some(candidate => candidate.toLowerCase() === nextColumn.toLowerCase())) {
                selected.push(nextColumn);
            }
            return selected;
        }, [])
        : plan.select;
    const nextOrderBy = Array.isArray(plan.orderBy)
        ? plan.orderBy.reduce<QueryPlan['orderBy']>((ordered, clause) => {
            const resolvedColumn = resolveColumn(clause.column, context);
            const replacement = resolvedColumn
                ? replacementByBlocked.get(resolvedColumn.toLowerCase())
                : null;
            const nextColumn = replacement ?? clause.column;
            if (!ordered.some(candidate => candidate.column.toLowerCase() === nextColumn.toLowerCase())) {
                ordered.push({
                    ...clause,
                    column: nextColumn,
                });
            }
            return ordered;
        }, [])
        : plan.orderBy;
    const nextPostAggregateFilter = plan.postAggregateFilter
        ? {
            ...(plan.postAggregateFilter.predicates
                ? {
                    predicates: plan.postAggregateFilter.predicates.map(predicate => ({
                        ...predicate,
                        column: rewritePostAggregateColumn(predicate.column),
                    })),
                }
                : {}),
            ...(plan.postAggregateFilter.groups
                ? {
                    groups: plan.postAggregateFilter.groups.map(group => ({
                        predicates: group.predicates.map(predicate => ({
                            ...predicate,
                            column: rewritePostAggregateColumn(predicate.column),
                        })),
                    })),
                }
                : {}),
        } satisfies QueryPostAggregateClause
        : plan.postAggregateFilter;

    return {
        plan: {
            ...plan,
            groupBy: nextGroupBy,
            ...(nextSelect ? { select: nextSelect } : {}),
            ...(nextOrderBy ? { orderBy: nextOrderBy } : {}),
            ...(nextPostAggregateFilter ? { postAggregateFilter: nextPostAggregateFilter } : {}),
        },
        injected: `blocked_dimension_enforcement: ${consumedBlocked.join(', ')}`,
        warning: null,
        validationError: null,
    };
};

/**
 * Rule 3: TopN enforcement.
 * When the harness recommends a topN and the plan has no explicit limit
 * or a limit larger than topN, apply the recommendation.
 */
const injectTopN = (
    plan: QueryPlan,
    directives: RuntimeDirectives,
): { plan: QueryPlan; injected: string | null } => {
    const topN = directives.recommendedTopN;
    if (!topN || topN <= 0) {
        return { plan, injected: null };
    }
    if (plan.limit !== undefined && plan.limit <= topN) {
        return { plan, injected: null };
    }
    return {
        plan: { ...plan, limit: topN },
        injected: `topN: LIMIT ${topN}`,
    };
};

// --- Rule 6: Aggregation Governance ---

/** Aggregation functions that are semantically invalid per hint category. */
const BLOCKED_AGGREGATIONS: Record<AggregationHint, ReadonlySet<string>> = {
    additive: new Set(),
    non_additive: new Set(['sum']),
    dimension_only: new Set(['sum', 'avg', 'median', 'percentile', 'min', 'max']),
    unrestricted: new Set(),
};

/** Suggested replacement for each violation — included in the error message so AI can self-repair. */
const AGGREGATION_SUGGESTION: Record<string, string> = {
    'non_additive:sum': 'AVG',
    'dimension_only:sum': 'COUNT',
    'dimension_only:avg': 'COUNT',
    'dimension_only:median': 'COUNT',
    'dimension_only:percentile': 'COUNT',
    'dimension_only:min': 'COUNT',
    'dimension_only:max': 'COUNT',
};

/**
 * Rule 6: Aggregation governance (AI-first).
 * Detects semantically invalid aggregate functions and returns a
 * validationError that triggers the retry loop — AI receives the
 * violation details and repairs its own SQL plan.
 * Does NOT silently replace; surfaces the contradiction to AI.
 */
const checkAggregationGovernance = (
    plan: QueryPlan,
    context: DirectiveInjectionContext,
): { validationError: string | null; warning: string | null } => {
    const registry = context.columnRegistry;
    if (!registry || !Array.isArray(plan.aggregates) || plan.aggregates.length === 0) {
        return { validationError: null, warning: null };
    }

    const violations: string[] = [];
    for (const agg of plan.aggregates) {
        if (!agg.column) continue;

        const entry = registry.columns.find(
            c => c.physicalName.toLowerCase() === agg.column!.toLowerCase(),
        );
        if (!entry) continue;

        const hint = entry.allowedUsages.aggregationHint;
        const blocked = BLOCKED_AGGREGATIONS[hint];
        if (!blocked.has(agg.function)) continue;

        const suggestion = AGGREGATION_SUGGESTION[`${hint}:${agg.function}`] ?? 'COUNT';
        violations.push(
            `${agg.function.toUpperCase()}(${agg.column}) is invalid — "${agg.column}" is ${hint}, use ${suggestion} instead`,
        );
    }

    if (violations.length === 0) {
        return { validationError: null, warning: null };
    }

    return {
        validationError: `aggregation_governance_violation: ${violations.join('; ')}`,
        warning: `Aggregation governance: ${violations.join('; ')}`,
    };
};

// --- Public API ---

/**
 * Inject harness directives into a QueryPlan deterministically.
 *
 * Returns a new QueryPlan (no mutation) with directives applied,
 * plus a list of what was injected and any warnings.
 */
export const injectDirectivesIntoQueryPlan = (
    plan: QueryPlan,
    context: DirectiveInjectionContext,
): DirectiveInjectionResult => {
    const injected: string[] = [];
    const warnings: string[] = [];
    let current = { ...plan };
    let validationError: string | null = null;

    // Rule 1: hierarchy exclusion
    const r1 = injectHierarchyExclusion(current, context.directives, context);
    current = r1.plan;
    if (r1.injected) injected.push(r1.injected);
    if (r1.warning) warnings.push(r1.warning);

    // Rule 2: detail-row filter
    const r2 = injectDetailRowFilter(current, context.directives, context, context.isSummaryRowTopic);
    current = r2.plan;
    if (r2.injected) injected.push(r2.injected);
    if (r2.warning) warnings.push(r2.warning);

    // Rule 3: topN enforcement
    const r3 = injectTopN(current, context.directives);
    current = r3.plan;
    if (r3.injected) injected.push(r3.injected);

    // Rule 4: blocked dimension enforcement
    const r4 = injectBlockedDimensionEnforcement(current, context);
    current = r4.plan;
    if (r4.injected) injected.push(r4.injected);
    if (r4.warning) warnings.push(r4.warning);
    if (r4.validationError) {
        validationError = r4.validationError;
    }

    // Rule 6: aggregation governance (AI-first — detect + reject, let AI self-repair)
    const r6 = checkAggregationGovernance(current, context);
    if (r6.validationError) {
        validationError = validationError ?? r6.validationError;
    }
    if (r6.warning) warnings.push(r6.warning);

    // Rule 5: dimension normalization (compilation override, not a plan mutation)
    const compilationOverrides: Partial<CompileDuckDbQueryOptions> = {};
    if (context.dimensionNormalization && Array.isArray(current.groupBy) && current.groupBy.length > 0) {
        compilationOverrides.dimensionNormalization = context.dimensionNormalization;
        injected.push('dimension_normalization: groupBy columns normalized');
    }

    if (injected.length > 0) {
        console.log(`${LOG_PREFIX} Injected ${injected.length} directive(s): ${injected.join('; ')}`);
    }
    if (warnings.length > 0) {
        warnings.forEach(w => console.warn(`${LOG_PREFIX} ${w}`));
    }

    return {
        plan: current,
        injected,
        warnings,
        validationError,
        ...(Object.keys(compilationOverrides).length > 0 ? { compilationOverrides } : {}),
    };
};
