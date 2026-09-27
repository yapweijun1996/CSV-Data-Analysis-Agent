import type { AggregationType, AnalysisPlan, ChartType, ColumnProfile, QueryPlan, SqlAnalysisBindings } from '../../../types';

type ComboBindings = Pick<AnalysisPlan, 'groupByColumn' | 'valueColumn' | 'secondaryValueColumn' | 'xValueColumn' | 'yValueColumn'>;

export type ComboResolution = 'unchanged' | 'repaired' | 'downgraded';
export type ComboResolutionReason =
    | 'missing_group_binding'
    | 'missing_primary_metric'
    | 'missing_secondary_metric'
    | 'single_stable_alias'
    | 'temporal_comparison'
    | 'non_temporal_comparison';

export interface ComboResolutionResult {
    chartType: ChartType;
    bindings: SqlAnalysisBindings;
    aggregation?: AggregationType;
    secondaryAggregation?: AggregationType;
    resolution: ComboResolution;
    reason: ComboResolutionReason | null;
}

interface ResolveStructuredComboDecisionParams {
    chartType?: ChartType;
    bindings?: ComboBindings | null;
    aggregation?: AggregationType;
    secondaryAggregation?: AggregationType;
    query?: Pick<QueryPlan, 'groupBy' | 'aggregates'> | null;
    columns: ColumnProfile[];
    isSqlFirst: boolean;
}

const TEMPORAL_COLUMN_TYPES = new Set<ColumnProfile['type']>(['date', 'time']);

const normalizeString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const normalized = value.trim();
    return normalized ? normalized : undefined;
};

const normalizeBindings = (bindings?: ComboBindings | null): SqlAnalysisBindings => ({
    groupByColumn: normalizeString(bindings?.groupByColumn),
    valueColumn: normalizeString(bindings?.valueColumn),
    secondaryValueColumn: normalizeString(bindings?.secondaryValueColumn),
    xValueColumn: normalizeString(bindings?.xValueColumn),
    yValueColumn: normalizeString(bindings?.yValueColumn),
});

const getAggregateAliases = (query?: Pick<QueryPlan, 'groupBy' | 'aggregates'> | null): string[] =>
    Array.from(new Set((query?.aggregates ?? [])
        .map(aggregate => normalizeString(aggregate?.as))
        .filter((alias): alias is string => Boolean(alias))));

const getFirstGroupByColumn = (query?: Pick<QueryPlan, 'groupBy' | 'aggregates'> | null): string | undefined =>
    Array.isArray(query?.groupBy)
        ? normalizeString(query?.groupBy[0])
        : undefined;

const isTemporalGroupByColumn = (groupByColumn: string | undefined, columns: ColumnProfile[]) => {
    if (!groupByColumn) {
        return false;
    }

    const profile = columns.find(column => column.name.toLowerCase() === groupByColumn.toLowerCase());
    return Boolean(profile && TEMPORAL_COLUMN_TYPES.has(profile.type));
};

const bindingsEqual = (left: SqlAnalysisBindings, right: SqlAnalysisBindings) =>
    left.groupByColumn === right.groupByColumn
    && left.valueColumn === right.valueColumn
    && left.secondaryValueColumn === right.secondaryValueColumn
    && left.xValueColumn === right.xValueColumn
    && left.yValueColumn === right.yValueColumn;

const downgradeChartType = (groupByColumn: string | undefined, columns: ColumnProfile[]): ChartType =>
    isTemporalGroupByColumn(groupByColumn, columns) ? 'line' : 'bar';

const determineFailureReason = (
    params: {
        groupByColumn?: string;
        valueColumn?: string;
        secondaryValueColumn?: string;
        aggregateAliases: string[];
        columns: ColumnProfile[];
    },
): ComboResolutionReason => {
    const { groupByColumn, valueColumn, secondaryValueColumn, aggregateAliases, columns } = params;
    if (!groupByColumn) {
        return 'missing_group_binding';
    }
    if (!valueColumn) {
        return aggregateAliases.length === 1 ? 'single_stable_alias' : 'missing_primary_metric';
    }
    if (!secondaryValueColumn) {
        if (aggregateAliases.length === 1) {
            return 'single_stable_alias';
        }
        return isTemporalGroupByColumn(groupByColumn, columns)
            ? 'temporal_comparison'
            : 'non_temporal_comparison';
    }
    if (valueColumn.toLowerCase() === secondaryValueColumn.toLowerCase()) {
        return isTemporalGroupByColumn(groupByColumn, columns)
            ? 'temporal_comparison'
            : 'non_temporal_comparison';
    }
    return 'missing_secondary_metric';
};

export const resolveStructuredComboDecision = ({
    chartType,
    bindings,
    aggregation,
    secondaryAggregation,
    query,
    columns,
    isSqlFirst,
}: ResolveStructuredComboDecisionParams): ComboResolutionResult => {
    const normalizedBindings = normalizeBindings(bindings);
    if (chartType !== 'combo') {
        return {
            chartType: chartType ?? 'bar',
            bindings: normalizedBindings,
            aggregation,
            secondaryAggregation,
            resolution: 'unchanged',
            reason: null,
        };
    }

    const aggregateAliases = isSqlFirst ? getAggregateAliases(query) : [];
    const firstGroupByColumn = isSqlFirst ? getFirstGroupByColumn(query) : undefined;
    const repairedBindings: SqlAnalysisBindings = {
        groupByColumn: normalizedBindings.groupByColumn || firstGroupByColumn,
        valueColumn: normalizedBindings.valueColumn,
        secondaryValueColumn: normalizedBindings.secondaryValueColumn,
        xValueColumn: undefined,
        yValueColumn: undefined,
    };

    if (isSqlFirst && !repairedBindings.valueColumn) {
        repairedBindings.valueColumn = aggregateAliases[0];
    }
    if (isSqlFirst && !repairedBindings.secondaryValueColumn) {
        repairedBindings.secondaryValueColumn = aggregateAliases.find(alias =>
            alias.toLowerCase() !== repairedBindings.valueColumn?.toLowerCase(),
        );
    }

    const repairedSecondaryAggregation = repairedBindings.secondaryValueColumn
        ? (secondaryAggregation ?? aggregation)
        : undefined;
    const hasStableCombo =
        Boolean(repairedBindings.groupByColumn)
        && Boolean(repairedBindings.valueColumn)
        && Boolean(repairedBindings.secondaryValueColumn)
        && repairedBindings.valueColumn?.toLowerCase() !== repairedBindings.secondaryValueColumn?.toLowerCase();

    const originalBindings = normalizeBindings(bindings);
    const repaired =
        !bindingsEqual(originalBindings, repairedBindings)
        || repairedSecondaryAggregation !== secondaryAggregation;

    if (hasStableCombo) {
        return {
            chartType: 'combo',
            bindings: repairedBindings,
            aggregation,
            secondaryAggregation: repairedSecondaryAggregation,
            resolution: repaired ? 'repaired' : 'unchanged',
            reason: null,
        };
    }

    const reason = determineFailureReason({
        groupByColumn: repairedBindings.groupByColumn,
        valueColumn: repairedBindings.valueColumn,
        secondaryValueColumn: repairedBindings.secondaryValueColumn,
        aggregateAliases,
        columns,
    });

    return {
        chartType: downgradeChartType(repairedBindings.groupByColumn, columns),
        bindings: {
            groupByColumn: repairedBindings.groupByColumn,
            valueColumn: repairedBindings.valueColumn,
            secondaryValueColumn: undefined,
            xValueColumn: undefined,
            yValueColumn: undefined,
        },
        aggregation,
        secondaryAggregation: undefined,
        resolution: 'downgraded',
        reason,
    };
};
