import type { ActiveDataQuery, AggregationType, AnalysisPlan, AppState, ChartType, QueryAggregateFunction, SqlAnalysisPlan } from '../../../types';
import { isSqlAnalysisPlanLike } from './executorAgent';

type LooseCreatePlan = Record<string, unknown>;

type LooseSqlBindings = {
    groupByColumn?: unknown;
    valueColumn?: unknown;
    secondaryValueColumn?: unknown;
};

const CHART_TYPE_MAP: Record<string, ChartType> = {
    bar: 'bar',
    line: 'line',
    pie: 'pie',
    doughnut: 'doughnut',
    donut: 'doughnut',
    scatter: 'scatter',
    combo: 'combo',
    radar: 'radar',
    bubble: 'bubble',
    stacked_bar: 'stacked_bar',
    stacked_column: 'stacked_column',
};

const AGGREGATION_MAP: Partial<Record<QueryAggregateFunction, AggregationType>> = {
    sum: 'sum',
    count: 'count',
    avg: 'avg',
};

const normalizeString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizeChartType = (value: unknown): ChartType | undefined => {
    const normalized = normalizeString(value)?.toLowerCase();
    return normalized ? CHART_TYPE_MAP[normalized] : undefined;
};

const normalizeStringList = (value: unknown): string[] => Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map(entry => entry.trim())
    : [];

const dedupeStrings = (values: string[]) => Array.from(new Set(values));

const getLooseBindings = (plan: LooseCreatePlan): LooseSqlBindings =>
    plan.bindings && typeof plan.bindings === 'object' && !Array.isArray(plan.bindings)
        ? plan.bindings as LooseSqlBindings
        : {};

const getQuerySelectColumns = (plan: LooseCreatePlan): string[] => {
    const query = plan.query;
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
        return [];
    }
    return normalizeStringList((query as { select?: unknown }).select);
};

const buildMetricAliases = (plan: LooseCreatePlan, groupByColumn?: string): string[] => {
    const bindings = getLooseBindings(plan);
    const aliases = dedupeStrings([
        normalizeString(bindings.valueColumn),
        normalizeString(bindings.secondaryValueColumn),
        ...normalizeStringList(plan.valueColumns),
        ...normalizeStringList(plan.values),
        ...normalizeStringList(plan.metrics),
        ...normalizeStringList(plan.yAxis),
        ...normalizeStringList(plan.columns).filter(column => column !== groupByColumn),
        ...getQuerySelectColumns(plan).filter(column => column !== groupByColumn),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0));
    return aliases;
};

const resolveAggregationForAlias = (
    activeDataQuery: ActiveDataQuery,
    alias?: string,
): AggregationType | undefined => {
    if (!alias) {
        return undefined;
    }

    const aggregate = (activeDataQuery.plan.aggregates ?? []).find(candidate =>
        normalizeString(candidate.as)?.toLowerCase() === alias.toLowerCase(),
    );
    if (!aggregate) {
        return undefined;
    }
    return AGGREGATION_MAP[aggregate.function];
};

const resolveGroupByColumn = (
    plan: LooseCreatePlan,
    activeDataQuery: ActiveDataQuery | null,
): string | undefined => {
    const bindings = getLooseBindings(plan);
    const direct = normalizeString(plan.groupByColumn)
        ?? normalizeString(bindings.groupByColumn)
        ?? normalizeString(plan.xAxis)
        ?? (() => {
            const groupBy = plan.groupBy;
            if (typeof groupBy === 'string' && groupBy.trim()) {
                return groupBy.trim();
            }
            if (Array.isArray(groupBy)) {
                return normalizeString(groupBy[0]);
            }
            return undefined;
        })();

    if (direct) {
        return direct;
    }

    return normalizeString(activeDataQuery?.plan.groupBy?.[0]);
};

const canBindToActiveQuery = (
    activeDataQuery: ActiveDataQuery | null,
    groupByColumn: string | undefined,
    metricAliases: string[],
): boolean => {
    if (!activeDataQuery || !groupByColumn || metricAliases.length === 0) {
        return false;
    }
    const selectedColumns = new Set((activeDataQuery.result.selectedColumns ?? []).map(column => column.toLowerCase()));
    if (!selectedColumns.has(groupByColumn.toLowerCase())) {
        return false;
    }
    return metricAliases.every(alias => selectedColumns.has(alias.toLowerCase()));
};

const buildSqlPlanFromActiveQuery = (
    plan: LooseCreatePlan,
    activeDataQuery: ActiveDataQuery,
    groupByColumn: string,
    metricAliases: string[],
): SqlAnalysisPlan => {
    const requestedChartType = normalizeChartType(plan.chartType) ?? normalizeChartType(plan.chart) ?? 'bar';
    const chartType = metricAliases.length > 1 && (requestedChartType === 'bar' || requestedChartType === 'line')
        ? 'combo'
        : requestedChartType;

    return {
        chartType,
        title: normalizeString(plan.title) ?? 'AI Generated Analysis',
        description: normalizeString(plan.description) ?? 'Analysis of the active query result.',
        queryMode: (activeDataQuery.plan.groupBy?.length ?? 0) > 0 || (activeDataQuery.plan.aggregates?.length ?? 0) > 0
            ? 'aggregate'
            : 'rowset',
        query: activeDataQuery.plan,
        bindings: {
            groupByColumn,
            valueColumn: metricAliases[0],
            secondaryValueColumn: metricAliases[1],
        },
        aggregation: resolveAggregationForAlias(activeDataQuery, metricAliases[0]),
        secondaryAggregation: resolveAggregationForAlias(activeDataQuery, metricAliases[1]),
        defaultTopN: typeof plan.defaultTopN === 'number' ? plan.defaultTopN : undefined,
        defaultHideOthers: typeof plan.defaultHideOthers === 'boolean' ? plan.defaultHideOthers : undefined,
    };
};

export const adaptCreatePlanFromContext = (
    rawPlan: AnalysisPlan | SqlAnalysisPlan | Record<string, unknown>,
    state: Pick<AppState, 'activeDataQuery' | 'columnProfiles'>,
): AnalysisPlan | SqlAnalysisPlan => {
    if (isSqlAnalysisPlanLike(rawPlan)) {
        return rawPlan;
    }

    const loosePlan = rawPlan as LooseCreatePlan;
    const activeDataQuery = state.activeDataQuery ?? null;
    const groupByColumn = resolveGroupByColumn(loosePlan, activeDataQuery);
    const metricAliases = buildMetricAliases(loosePlan, groupByColumn);
    const datasetColumns = new Set((state.columnProfiles ?? []).map(profile => profile.name.toLowerCase()));

    if (canBindToActiveQuery(activeDataQuery, groupByColumn, metricAliases)) {
        return buildSqlPlanFromActiveQuery(loosePlan, activeDataQuery!, groupByColumn!, metricAliases);
    }

    // AGENT-203B: When the AI's column bindings don't match but activeDataQuery has
    // wide-format results (multiple numeric columns from aggregates), build a SQL plan
    // using the active query's actual columns. This handles the case where the AI
    // references "Month"/"Sales" but the active query has "Jan","Feb",...,"Dec".
    // Also trigger when groupByColumn exists but is not a real column (e.g., "Month")
    const groupByIsPhantom = groupByColumn
        && !datasetColumns.has(groupByColumn.toLowerCase())
        && !(activeDataQuery?.result.selectedColumns ?? []).some(c => c.toLowerCase() === groupByColumn!.toLowerCase());
    if (activeDataQuery && (!groupByColumn || groupByIsPhantom)) {
        const queryColumns = activeDataQuery.result.selectedColumns ?? [];
        const hasAggregates = (activeDataQuery.plan.aggregates?.length ?? 0) > 0;
        if (hasAggregates && queryColumns.length >= 3) {
            // Wide-format: all columns are metrics from the query (no groupBy needed).
            // Build a SQL plan that uses the first column as groupBy and rest as metrics,
            // or if no groupBy exists, use all columns as a single-row multi-metric chart.
            const requestedChartType = normalizeChartType(loosePlan.chartType)
                ?? normalizeChartType(loosePlan.chart) ?? 'bar';
            return {
                chartType: queryColumns.length > 2 ? 'combo' : requestedChartType,
                title: normalizeString(loosePlan.title) ?? 'AI Generated Analysis',
                description: normalizeString(loosePlan.description) ?? 'Analysis of query result.',
                queryMode: 'aggregate' as const,
                query: activeDataQuery.plan,
                bindings: {
                    groupByColumn: queryColumns[0],
                    valueColumn: queryColumns[1],
                    secondaryValueColumn: queryColumns[2],
                },
                aggregation: resolveAggregationForAlias(activeDataQuery, queryColumns[1]),
                secondaryAggregation: resolveAggregationForAlias(activeDataQuery, queryColumns[2]),
            } as SqlAnalysisPlan;
        }
    }

    const valueColumn = normalizeString(loosePlan.valueColumn)
        ?? metricAliases.find(alias => datasetColumns.has(alias.toLowerCase()));
    const secondaryValueColumn = normalizeString(loosePlan.secondaryValueColumn)
        ?? metricAliases.find(alias => alias !== valueColumn && datasetColumns.has(alias.toLowerCase()));

    const requestedChartType = normalizeChartType(loosePlan.chartType) ?? normalizeChartType(loosePlan.chart) ?? 'bar';
    return {
        ...(rawPlan as AnalysisPlan),
        chartType: secondaryValueColumn && (requestedChartType === 'bar' || requestedChartType === 'line')
            ? 'combo'
            : requestedChartType,
        title: normalizeString(loosePlan.title) ?? 'AI Generated Analysis',
        description: normalizeString(loosePlan.description) ?? 'Analysis of AI generated chart.',
        groupByColumn,
        valueColumn,
        secondaryValueColumn,
        secondaryAggregation: secondaryValueColumn ? 'sum' : undefined,
    };
};
