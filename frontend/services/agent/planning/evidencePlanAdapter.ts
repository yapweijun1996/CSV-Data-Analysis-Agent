/**
 * Evidence plan to SQL analysis plan adapter.
 *
 * Converts SqlEvidenceQueryPlan (AI-generated evidence structure) into
 * SqlAnalysisPlan (chart-ready presentation structure) with chart type
 * recommendation, binding resolution, and aggregation mapping.
 */

import type {
    AggregationType,
    ColumnProfile,
    SqlAnalysisPlan,
    SqlEvidenceQueryPlan,
} from '../../../types';
import { SqlAutoAnalysisError } from './planGenerator';
import { recommendChartType } from '../../../utils/chartTypeUtils';
import { isTimeLikeDimensionColumn } from '../analysisColumnRoles';
import type { AnalysisDatasetContext } from '../../prompts/analysisPrompts';
import { TIME_INTENT_PATTERN } from './semanticTextMatching';

// ─── Result shape inference ────────────────────────────────────

export const inferPreferredResultShape = (
    topic: string,
    datasetContext?: AnalysisDatasetContext,
): SqlEvidenceQueryPlan['preferredResultShape'] => {
    if ((datasetContext?.preferredTimeColumns?.length ?? 0) > 0 && TIME_INTENT_PATTERN.test(topic)) {
        return 'time_series';
    }
    if (/scatter|relationship|correlation/i.test(topic)) {
        return 'rowset_scatter_candidate';
    }
    return 'ranked_aggregate';
};

// ─── Aggregate helpers ─────────────────────────────────────────

export const findFirstAggregateAlias = (plan: SqlEvidenceQueryPlan) =>
    plan.query.aggregates?.find(aggregate => aggregate.as.trim())?.as?.trim() || null;

export const mapEvidenceAggregation = (plan: SqlEvidenceQueryPlan): AggregationType | undefined => {
    const fn = plan.query.aggregates?.[0]?.function;
    if (fn === 'sum' || fn === 'count' || fn === 'avg') {
        return fn;
    }
    return undefined;
};

// ─── Plan adaptation ───────────────────────────────────────────

export const adaptEvidencePlanToSqlAnalysisPlan = (
    plan: SqlEvidenceQueryPlan,
    columns: ColumnProfile[],
): SqlAnalysisPlan => {
    const title = plan.title.trim();
    const description = `${plan.intentSummary.trim() || `SQL-first evidence view for ${title}.`} Review the aggregate table before drawing conclusions.`;

    if (plan.queryMode === 'rowset') {
        const numericDatasetColumns = columns
            .filter(column => column.type === 'numerical' || column.type === 'currency' || column.type === 'percentage')
            .map(column => column.name)
            .filter(column => (plan.query.select ?? []).includes(column));

        if (numericDatasetColumns.length < 2) {
            throw new SqlAutoAnalysisError(
                'planning_invalid',
                `Evidence rowset plan "${title}" did not expose two numeric dataset columns for a scatter-safe presentation.`,
            );
        }

        return {
            chartType: 'scatter',
            title,
            description,
            queryMode: 'rowset',
            query: plan.query,
            preFilter: plan.preFilter,
            bindings: {
                xValueColumn: numericDatasetColumns[0],
                yValueColumn: numericDatasetColumns[1],
            },
        };
    }

    const groupByColumn = plan.query.groupBy?.[0];
    const valueColumn = findFirstAggregateAlias(plan)
        ?? (plan.query.select ?? []).find(column => column !== groupByColumn)
        ?? undefined;

    if (!groupByColumn || !valueColumn) {
        throw new SqlAutoAnalysisError(
            'planning_invalid',
            `Evidence aggregate plan "${title}" could not be adapted into a safe grouped presentation.`,
        );
    }

    // Recognize time-like groupBy: either a typed date/time column or a
    // column whose name signals temporal semantics (e.g. "Period" after unpivot).
    const timeLikeGroup = columns.find(column => column.name === groupByColumn && (column.type === 'date' || column.type === 'time'))
        || (groupByColumn && isTimeLikeDimensionColumn(groupByColumn));
    const isTimeSeries = Boolean(plan.preferredResultShape === 'time_series' && timeLikeGroup);

    // Use shared recommendation engine — at plan time row count is unknown,
    // so we use a conservative estimate. The actual chart can be refined at execution.
    const estimatedRowCount = 10;
    const chartType = recommendChartType({
        rowCount: estimatedRowCount,
        distinctGroupCount: estimatedRowCount,
        hasNegativeValues: false,
        isTimeSeries,
        metricCount: 1,
    });
    const needsTopN = chartType === 'bar' || chartType === 'doughnut';

    return {
        chartType,
        title,
        description,
        queryMode: 'aggregate',
        query: plan.query,
        preFilter: plan.preFilter,
        bindings: {
            groupByColumn,
            valueColumn,
        },
        aggregation: mapEvidenceAggregation(plan),
        defaultTopN: needsTopN ? 8 : undefined,
        defaultHideOthers: needsTopN ? true : undefined,
    };
};
