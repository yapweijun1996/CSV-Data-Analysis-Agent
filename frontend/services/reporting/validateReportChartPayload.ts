import type { ReportChartPayload, ReportVisualChartType } from '../../types';
import {
    hasDuplicateNormalizedBuckets,
    isMonotonicSequence,
    isSequentialDimensionName,
    isSortableSequence,
    resolveOrdinalIndices,
} from '../../utils/ordinalSortOrder';
import { getTemporalSortTimestamp } from '../../utils/temporalDisplay';

const MAX_CIRCULAR_CATEGORIES = 8;

const hasLongLabels = (labels: string[]): boolean => labels.some(label => label.length > 42);

export interface ReportChartPayloadValidationInput {
    chartType: ReportChartPayload['chartType'];
    valueDomain: ReportChartPayload['valueDomain'];
    groupByColumn: ReportChartPayload['groupByColumn'];
    displayLabels: ReportChartPayload['displayLabels'];
    labels?: ReportChartPayload['labels'];
    numericValues?: ReportChartPayload['numericValues'];
    /** Original category count before aggregation / truncation. */
    originalLabelCount?: number;
}

export interface ReportChartPayloadValidationResult {
    chartType: ReportVisualChartType;
    chartWarnings: string[];
}

export const validateReportChartPayload = (
    payload: ReportChartPayloadValidationInput,
): ReportChartPayloadValidationResult => {
    let chartType = payload.chartType;
    const chartWarnings: string[] = [];
    const labels = payload.labels ?? payload.displayLabels;
    const timeLabelTimestamps = labels.map(label => getTemporalSortTimestamp(label, payload.groupByColumn) ?? NaN);
    const hasTemporalSequence = !timeLabelTimestamps.some(Number.isNaN);

    // --- Circular chart (pie / doughnut) validation ---
    if (chartType === 'pie' || chartType === 'doughnut') {
        if (payload.valueDomain !== 'positive') {
            chartType = 'bar';
            chartWarnings.push('Circular charts were downgraded because the values are not strictly positive.');
        }

        const effectiveLabelCount = payload.originalLabelCount ?? labels.length;
        if ((chartType === 'pie' || chartType === 'doughnut') && effectiveLabelCount > MAX_CIRCULAR_CATEGORIES) {
            chartType = 'bar';
            chartWarnings.push(`Circular charts were downgraded because the category count (${effectiveLabelCount}) exceeds ${MAX_CIRCULAR_CATEGORIES}.`);
        }

        if ((chartType === 'pie' || chartType === 'doughnut') && hasDuplicateNormalizedBuckets(labels)) {
            chartType = 'bar';
            chartWarnings.push('Circular charts were downgraded because duplicate category labels were detected.');
        }

        // Downgrade when a single segment dominates (>95%) — pie becomes visually useless
        if (chartType === 'pie' || chartType === 'doughnut') {
            const total = payload.numericValues.reduce((sum, v) => sum + Math.abs(v), 0);
            if (total > 0) {
                const maxShare = Math.max(...payload.numericValues.map(v => Math.abs(v))) / total;
                if (maxShare > 0.95) {
                    chartType = 'bar';
                    chartWarnings.push('Circular charts were downgraded because a single category accounts for over 95% of the total.');
                }
            }
        }
    }

    // --- Line chart validation ---
    if (chartType === 'line') {
        const isSeqName = isSequentialDimensionName(payload.groupByColumn);
        const sortable = isSortableSequence(labels) || hasTemporalSequence;

        if (!isSeqName && !sortable) {
            chartType = 'bar';
            chartWarnings.push('Line chart was downgraded because the grouping dimension is not a clear sequence.');
        }

        // Duplicate x buckets make a line chart misleading.
        if (chartType === 'line' && hasDuplicateNormalizedBuckets(labels)) {
            chartType = 'bar';
            chartWarnings.push('Line chart was downgraded because duplicate x-axis labels were detected.');
        }

        // Monotonicity check for ordinal / date labels.
        if (chartType === 'line' && labels.length >= 2) {
            const ordinalIndices = resolveOrdinalIndices(labels);
            if (ordinalIndices) {
                if (!isMonotonicSequence(ordinalIndices)) {
                    chartType = 'bar';
                    chartWarnings.push('Line chart was downgraded because the ordinal labels are not in monotonic order.');
                }
            } else {
                if (hasTemporalSequence && !isMonotonicSequence(timeLabelTimestamps)) {
                    chartType = 'bar';
                    chartWarnings.push('Line chart was downgraded because the time labels are not in monotonic order.');
                }
            }
        }

        // Too few points for a meaningful line.
        if (chartType === 'line' && labels.length < 2) {
            chartType = 'bar';
            chartWarnings.push('Line chart was downgraded because fewer than 2 data points are available.');
        }
    }

    // --- Long label warning (all chart types) ---
    if ((chartType === 'pie' || chartType === 'doughnut') && hasLongLabels(payload.displayLabels)) {
        chartWarnings.push('Long labels were moved into the legend to preserve chart readability.');
    }

    return {
        chartType,
        chartWarnings,
    };
};
