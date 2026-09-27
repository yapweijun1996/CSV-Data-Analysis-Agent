/**
 * Query plan repair utilities for SQL plan validation.
 *
 * Auto-repairs structural issues in SQL query plans before validation:
 * duplicate alias merging, select alignment, and query normalization.
 */

import type {
    QueryAggregateClause,
    QueryPlan,
    SqlAnalysisPlan,
    SqlEvidenceQueryPlan,
} from '../../../types';
import { normalizeString } from './semanticTextMatching';

// ─── Type guard ────────────────────────────────────────────────

export const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ─── Aggregate helpers ─────────────────────────────────────────

export const normalizeAggregateAliases = (aggregates: QueryAggregateClause[] | undefined) =>
    new Set((aggregates ?? []).map(aggregate => aggregate.as.trim().toLowerCase()));

export const normalizeOutputKey = (value: string) => value.trim().toLowerCase();

export const splitAggregateSourceExpression = (value: string): string[] | null => {
    const parts = value
        .split(/\s*\+\s*/)
        .map(part => part.trim())
        .filter(Boolean);
    return parts.length >= 2 ? parts : null;
};

export const buildUniqueAggregateAlias = (baseAlias: string, takenKeys: Set<string>) => {
    let suffix = 2;
    let candidate = `${baseAlias}_Part${suffix}`;
    while (takenKeys.has(normalizeOutputKey(candidate))) {
        suffix += 1;
        candidate = `${baseAlias}_Part${suffix}`;
    }
    return candidate;
};

// ─── Aggregate alias conflict repair ───────────────────────────

export const repairAggregateAliasConflicts = (query: QueryPlan): { repaired: boolean; repairs: string[] } => {
    const repairs: string[] = [];
    const aggregates = [...(query.aggregates ?? [])];
    const aggregatesByAlias = new Map<string, QueryAggregateClause[]>();

    for (const aggregate of aggregates) {
        const alias = normalizeString(aggregate.as);
        if (!alias) {
            continue;
        }
        const aliasKey = normalizeOutputKey(alias);
        const group = aggregatesByAlias.get(aliasKey) ?? [];
        group.push(aggregate);
        aggregatesByAlias.set(aliasKey, group);
    }

    for (const [aliasKey, group] of aggregatesByAlias.entries()) {
        if (group.length < 2) {
            continue;
        }
        const alias = normalizeString(group[0]?.as);
        const canMergeIntoExpression = group.every(aggregate =>
            normalizeString(aggregate.as).toLowerCase() === aliasKey
            && aggregate.function === 'sum'
            && !aggregate.where
            && !('percentile' in aggregate && aggregate.percentile !== undefined)
            && Boolean(normalizeString(aggregate.column)),
        );
        if (!alias || !canMergeIntoExpression) {
            continue;
        }

        const mergedColumns = [...new Set(
            group
                .map(aggregate => normalizeString(aggregate.column))
                .filter(Boolean),
        )];
        if (mergedColumns.length < 2) {
            continue;
        }

        const leader = group[0];
        leader.column = mergedColumns.join(' + ');
        const mergedGroup = new Set(group.slice(1));
        query.aggregates = (query.aggregates ?? []).filter(aggregate => !mergedGroup.has(aggregate));
        repairs.push(`Merged duplicate aggregate alias "${alias}" into combined source columns "${mergedColumns.join(' + ')}"`);
    }

    const takenKeys = new Set((query.groupBy ?? []).map(normalizeOutputKey));
    query.aggregates = (query.aggregates ?? []).map(aggregate => {
        const alias = normalizeString(aggregate.as);
        if (!alias) {
            return aggregate;
        }

        const aliasKey = normalizeOutputKey(alias);
        if (!takenKeys.has(aliasKey)) {
            takenKeys.add(aliasKey);
            return aggregate;
        }

        const repairedAlias = buildUniqueAggregateAlias(alias, takenKeys);
        takenKeys.add(normalizeOutputKey(repairedAlias));
        repairs.push(`Renamed conflicting aggregate alias "${alias}" to "${repairedAlias}"`);
        return { ...aggregate, as: repairedAlias };
    });

    return { repaired: repairs.length > 0, repairs };
};

// ─── Query normalization ───────────────────────────────────────

const buildBindingSelect = (plan: SqlAnalysisPlan) => {
    const columns = [
        plan.bindings.groupByColumn,
        plan.bindings.valueColumn,
        plan.bindings.secondaryValueColumn,
        plan.bindings.xValueColumn,
        plan.bindings.yValueColumn,
    ].filter((value): value is string => Boolean(value && value.trim()));
    return [...new Set(columns)];
};

export const normalizeQuery = (plan: SqlAnalysisPlan): QueryPlan => {
    const normalizedQuery: QueryPlan = {
        ...plan.query,
        groupBy: Array.isArray(plan.query.groupBy) ? plan.query.groupBy.filter(Boolean) : [],
        aggregates: Array.isArray(plan.query.aggregates) ? plan.query.aggregates : [],
        orderBy: Array.isArray(plan.query.orderBy) ? plan.query.orderBy : [],
        select: Array.isArray(plan.query.select) && plan.query.select.length > 0
            ? plan.query.select
            : buildBindingSelect(plan),
        limit: Number.isInteger(plan.query.limit) ? Number(plan.query.limit) : undefined,
    };

    if (!normalizedQuery.limit) {
        normalizedQuery.limit = plan.queryMode === 'rowset' ? 150 : 50;
    }

    return normalizedQuery;
};

export const normalizeEvidenceQuery = (plan: SqlEvidenceQueryPlan): QueryPlan => {
    const normalizedQuery: QueryPlan = {
        ...plan.query,
        groupBy: Array.isArray(plan.query.groupBy) ? plan.query.groupBy.filter(Boolean) : [],
        aggregates: Array.isArray(plan.query.aggregates) ? plan.query.aggregates : [],
        orderBy: Array.isArray(plan.query.orderBy) ? plan.query.orderBy : [],
        select: Array.isArray(plan.query.select) ? plan.query.select.filter(Boolean) : [],
        limit: Number.isInteger(plan.query.limit) ? Number(plan.query.limit) : undefined,
    };

    if (!normalizedQuery.limit) {
        normalizedQuery.limit = plan.queryMode === 'rowset' ? 150 : 50;
    }

    return normalizedQuery;
};

// ─── Select alignment repair ───────────────────────────────────

/**
 * Deterministic auto-repair for select/aggregate/groupBy alignment.
 *
 * The #1 cause of multi-aggregate plan failures is the AI omitting aggregate
 * aliases or groupBy columns from `query.select`. This is a purely structural
 * gap — the AI's business intent is correct but the SQL shape is incomplete.
 * Rather than burning retry budget on the same structural mistake, repair it
 * deterministically before validation.
 */
export const repairEvidenceQuerySelectAlignment = (query: QueryPlan): { repaired: boolean; repairs: string[] } => {
    const repairs: string[] = [];
    const selectSet = new Set((query.select ?? []).map(s => s.trim().toLowerCase()));

    // Ensure all groupBy columns appear in select.
    for (const col of query.groupBy ?? []) {
        const key = col.trim().toLowerCase();
        if (key && !selectSet.has(key)) {
            query.select = [...(query.select ?? []), col];
            selectSet.add(key);
            repairs.push(`Added missing groupBy column "${col}" to select`);
        }
    }

    // Ensure all aggregate aliases appear in select.
    for (const agg of query.aggregates ?? []) {
        if (!agg.as) continue;
        const key = agg.as.trim().toLowerCase();
        if (key && !selectSet.has(key)) {
            query.select = [...(query.select ?? []), agg.as];
            selectSet.add(key);
            repairs.push(`Added missing aggregate alias "${agg.as}" to select`);
        }
    }

    return { repaired: repairs.length > 0, repairs };
};
