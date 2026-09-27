import type { AnalysisPlan, CsvRow } from '../../../types';
import { parseNumericValue } from '../../../utils/dataHelpers';

export type AggregationQualityDropReason = 'flat_metric' | 'no_total' | 'low_value';
export type AggregationQualityVerdict = 'useful' | 'flat_metric' | 'no_data' | 'noisy';

export interface AggregationQualityMetrics {
    groups: number;
    valueKey: string;
    total: number;
    topRows: number;
    topShare: number | null;
    uniqueValues: number;
}

export interface AggregationQualityAssessment {
    tablePreview: CsvRow[];
    columns: string[];
    metrics: AggregationQualityMetrics;
    description: string;
    commentary: string;
    qualityWarning: AggregationQualityDropReason | null;
    verdict: AggregationQualityVerdict;
}

/**
 * Detect the best value column from the plan and sample data.
 * Rules (no hardcoding — purely data-driven):
 *   1. Never pick groupByColumn as valueKey
 *   2. Trust plan.valueColumn / yValueColumn if they exist in sample and are not groupBy
 *   3. Fallback: pick the first column with actual numeric data (not the dimension)
 */
const detectValueKey = (plan: AnalysisPlan, sample?: CsvRow) => {
    const groupKey = plan.groupByColumn;
    const isNotGroupBy = (col: string) => !groupKey || col !== groupKey;

    // Trust plan-specified value columns if valid
    const planCandidates = [plan.valueColumn, plan.yValueColumn, 'value', 'count'];
    for (const candidate of planCandidates) {
        if (candidate && isNotGroupBy(candidate) && sample && Object.prototype.hasOwnProperty.call(sample, candidate)) {
            return candidate;
        }
    }

    if (sample) {
        const keys = Object.keys(sample).filter(isNotGroupBy);
        // Prefer columns that have actual numeric data in the sample
        const numericKey = keys.find(key => {
            const val = sample[key];
            return typeof val === 'number' || (typeof val === 'string' && toNumber(val) !== 0);
        });
        if (numericKey) return numericKey;
        // Last resort: first non-groupBy column
        if (keys.length > 0) return keys[0];
    }
    return plan.valueColumn || 'value';
};

/**
 * Detect all numeric (non-dimension) columns in the sample row.
 * Used for multi-column total computation when single valueKey is insufficient.
 */
const detectNumericColumns = (sample: CsvRow | undefined, groupKey: string): string[] => {
    if (!sample) return [];
    return Object.keys(sample).filter(key => {
        if (key === groupKey) return false;
        const val = sample[key];
        return typeof val === 'number' || (typeof val === 'string' && toNumber(val) !== 0);
    });
};

const toNumber = parseNumericValue;

const generateAggregationCommentary = (
    groupKey: string,
    metrics: Pick<AggregationQualityMetrics, 'groups' | 'topRows' | 'topShare' | 'uniqueValues' | 'valueKey'>,
) => {
    if (metrics.topShare === null) {
        return {
            commentary: `Quality warning: The aggregate total for '${groupKey}' is zero — distribution percentages are unavailable.`,
            qualityWarning: 'no_total' as const,
            verdict: 'no_data' as const,
        };
    }

    if (metrics.groups <= 1) {
        return {
            commentary: `Quality warning: The grouped result only contains ${metrics.groups} bucket — there is no distribution to compare.`,
            qualityWarning: 'flat_metric' as const,
            verdict: 'flat_metric' as const,
        };
    }

    if (metrics.uniqueValues <= 1) {
        return {
            commentary: `Quality warning: Aggregated metric '${metrics.valueKey}' has only ${metrics.uniqueValues} distinct value — no variance to analyze.`,
            qualityWarning: 'flat_metric' as const,
            verdict: 'flat_metric' as const,
        };
    }

    const concentration = metrics.topShare;
    const concentrationPercent = (concentration * 100).toFixed(1);

    if (metrics.groups > 100 && concentration < 0.2) {
        // Graceful degradation: do NOT warn the card. High-cardinality groupBy
        // with uniform distribution is expected for time-series (daily dates).
        // Per design: "Never skip generating output due to data volume — use
        // topN/LIMIT to control presentation quality instead."
        return {
            commentary: `'${groupKey}' has ${metrics.groups} categories with a relatively flat distribution (top ${metrics.topRows} = ${concentrationPercent}%). Consider applying topN to focus on the most significant entries.`,
            qualityWarning: null,
            verdict: 'useful' as const,
        };
    }

    if (concentration >= 0.7) {
        return {
            commentary: `Key Insight: The top ${metrics.topRows} '${groupKey}' categories are dominant, capturing ${concentrationPercent}% of the total.`,
            qualityWarning: null,
            verdict: 'useful' as const,
        };
    }

    if (concentration >= 0.4) {
        return {
            commentary: `The top ${metrics.topRows} '${groupKey}' categories represent ${concentrationPercent}% of the total, showing a moderate distribution.`,
            qualityWarning: null,
            verdict: 'useful' as const,
        };
    }

    return {
        commentary: `The top ${metrics.topRows} '${groupKey}' categories cover ${concentrationPercent}% of the total. The distribution is relatively flat.`,
        qualityWarning: null,
        verdict: 'useful' as const,
    };
};

export const evaluateAggregationQuality = (plan: AnalysisPlan, rows: CsvRow[]): AggregationQualityAssessment => {
    const tablePreview = rows.slice(0, Math.min(5, rows.length));
    const columns = tablePreview.length > 0 ? Object.keys(tablePreview[0]) : [];
    const groupKey = plan.groupByColumn || columns[0] || 'group';
    const valueKey = detectValueKey(plan, tablePreview[0]);

    // Multi-column awareness: when data has multiple numeric columns (e.g. monthly
    // sales columns), compute total across ALL numeric columns instead of just one.
    // This prevents false no_total drops when the single-valueKey column is sparse.
    const numericCols = detectNumericColumns(tablePreview[0], groupKey);
    const useMultiColumnTotal = numericCols.length >= 3;

    const total = useMultiColumnTotal
        ? rows.reduce((acc, row) => acc + numericCols.reduce((s, col) => s + toNumber(row[col]), 0), 0)
        : rows.reduce((acc, row) => acc + toNumber(row[valueKey]), 0);

    const topRows = rows.slice(0, Math.min(5, rows.length));
    const topValue = useMultiColumnTotal
        ? topRows.reduce((acc, row) => acc + numericCols.reduce((s, col) => s + toNumber(row[col]), 0), 0)
        : topRows.reduce((acc, row) => acc + toNumber(row[valueKey]), 0);

    const share = total !== 0 ? topValue / total : null;
    const uniqueValueCount = useMultiColumnTotal
        ? new Set(rows.flatMap(row => numericCols.map(col => toNumber(row[col])))).size
        : new Set(rows.map(row => toNumber(row[valueKey]))).size;

    // Effective group count: for single-row multi-column data, count numeric
    // columns as "groups" to prevent false flat_metric drops.
    const effectiveGroups = (rows.length === 1 && numericCols.length >= 3)
        ? numericCols.length
        : rows.length;

    const metrics: AggregationQualityMetrics = {
        groups: effectiveGroups,
        valueKey,
        total,
        topRows: topRows.length,
        topShare: share,
        uniqueValues: uniqueValueCount,
    };
    const description = share !== null
        ? `Grouped by ${groupKey} (${rows.length} buckets). Top ${topRows.length} cover ${(share * 100).toFixed(1)}% of ${valueKey}.`
        : `Grouped by ${groupKey} (${rows.length} buckets).`;

    const evaluation = generateAggregationCommentary(groupKey, metrics);

    return {
        tablePreview,
        columns,
        metrics,
        description,
        commentary: evaluation.commentary,
        qualityWarning: evaluation.qualityWarning,
        verdict: evaluation.verdict,
    };
};
