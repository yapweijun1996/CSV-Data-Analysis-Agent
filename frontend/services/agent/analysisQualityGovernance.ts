import type {
    AnalysisQualityGovernanceResult,
    ColumnProfile,
    CsvData,
    DatasetQualitySignal,
    DimensionQualityDecision,
    MetricQualityDecision,
} from '../../types';
import type { AnalysisDatasetContext } from '../prompts/analysisPrompts';

const NULL_LIKE_LABEL = /^(null|n\/a|na|unknown|unclassified|undefined|none|\s*)$/i;
const DIMENSION_BLOCK_MISSING_RATE = 0.98;
const DIMENSION_AVOID_MISSING_RATE = 0.5;
const DIMENSION_AVOID_NULL_SHARE = 0.25;
const METRIC_AVOID_MISSING_RATE = 0.5;
const DATASET_UNCLASSIFIED_WARNING_SHARE = 0.2;
const DATASET_UNCLASSIFIED_CRITICAL_SHARE = 0.35;
const DATASET_ROW_EXPANSION_INFO = 5;
const DATASET_ROW_EXPANSION_WARNING = 20;

const clampRate = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;

const isNullLikeLabel = (value: unknown): boolean =>
    NULL_LIKE_LABEL.test(String(value ?? '').trim());

const computeNullLikeShare = (data: CsvData, column: string): number => {
    const rows = data.data ?? [];
    if (rows.length === 0) {
        return 0;
    }

    let nullLikeCount = 0;
    let observed = 0;

    for (const row of rows) {
        observed += 1;
        if (isNullLikeLabel(row[column])) {
            nullLikeCount += 1;
        }
    }

    return observed > 0 ? nullLikeCount / observed : 0;
};

const summarizeSignals = (
    dimensionDecisions: DimensionQualityDecision[],
    metricDecisions: MetricQualityDecision[],
    datasetSignals: DatasetQualitySignal[],
): string => {
    const parts: string[] = [];
    const blockedDimensions = dimensionDecisions.filter(decision => decision.action === 'block').map(decision => decision.column);
    const avoidedDimensions = dimensionDecisions.filter(decision => decision.action === 'avoid').map(decision => decision.column);
    const avoidedMetrics = metricDecisions.filter(decision => decision.action === 'avoid').map(decision => decision.column);

    if (blockedDimensions.length > 0) {
        parts.push(`Block these groupBy dimensions: ${blockedDimensions.join(', ')}.`);
    }
    if (avoidedDimensions.length > 0) {
        parts.push(`Avoid low-quality dimensions unless explicitly requested: ${avoidedDimensions.join(', ')}.`);
    }
    if (avoidedMetrics.length > 0) {
        parts.push(`Avoid risky metrics for automatic topics: ${avoidedMetrics.join(', ')}.`);
    }
    if (datasetSignals.length > 0) {
        parts.push(datasetSignals.map(signal => signal.message).join(' '));
    }

    return parts.join(' ').trim();
};

export interface AnalysisQualityGovernanceOptions {
    rowExpansionRatio?: number | null;
    totalCardCount?: number | null;
    trustedCardCount?: number | null;
}

export const analyzeDatasetQualityGovernance = (
    columns: ColumnProfile[],
    data: CsvData,
    datasetContext: AnalysisDatasetContext,
    options?: AnalysisQualityGovernanceOptions,
): AnalysisQualityGovernanceResult => {
    const blockedBySemantic = new Set(datasetContext.blockedDimensions ?? []);
    const dimensionDecisions = columns
        .filter(column => ['categorical', 'date', 'time'].includes(column.type))
        .map<DimensionQualityDecision>(column => {
            const missingRate = clampRate((column.missingPercentage ?? 0) / 100);
            const nullLikeShare = computeNullLikeShare(data, column.name);
            const distinctCount = typeof column.uniqueValues === 'number' ? column.uniqueValues : null;
            const reasonCodes: string[] = [];
            let action: DimensionQualityDecision['action'] = 'allow';

            if (blockedBySemantic.has(column.name)) {
                action = 'block';
                reasonCodes.push('semantic_blocked_dimension');
            } else if (missingRate >= DIMENSION_BLOCK_MISSING_RATE || distinctCount === 1) {
                action = 'block';
                if (missingRate >= DIMENSION_BLOCK_MISSING_RATE) {
                    reasonCodes.push('extreme_missing_rate');
                }
                if (distinctCount === 1) {
                    reasonCodes.push('low_distinct_dimension');
                }
            } else if (missingRate >= DIMENSION_AVOID_MISSING_RATE || nullLikeShare >= DIMENSION_AVOID_NULL_SHARE) {
                action = 'avoid';
                if (missingRate >= DIMENSION_AVOID_MISSING_RATE) {
                    reasonCodes.push('high_missing_rate');
                }
                if (nullLikeShare >= DIMENSION_AVOID_NULL_SHARE) {
                    reasonCodes.push('high_null_like_share');
                }
            }

            return {
                column: column.name,
                action,
                reasonCodes,
                detail: action === 'allow'
                    ? 'dimension_quality_ok'
                    : `missing=${Math.round(missingRate * 100)}%, nullLike=${Math.round(nullLikeShare * 100)}%, distinct=${distinctCount ?? 'unknown'}`,
                missingRate,
                nullLikeShare,
                distinctCount,
            };
        });

    const metricDecisions = columns
        .filter(column => ['numerical', 'currency', 'percentage'].includes(column.type))
        .map<MetricQualityDecision>(column => {
            const missingRate = clampRate((column.missingPercentage ?? 0) / 100);
            const reasonCodes: string[] = [];
            let action: MetricQualityDecision['action'] = 'allow';

            // Zero-variance detection: metrics where min === max (e.g. all 0.00)
            // are useless for analysis — they produce flat charts with no insight.
            const range = column.valueRange;
            const isZeroVariance = Array.isArray(range)
                && range.length === 2
                && typeof range[0] === 'number'
                && typeof range[1] === 'number'
                && range[0] === range[1];
            if (isZeroVariance) {
                action = 'avoid';
                reasonCodes.push('zero_variance_metric');
            }

            // Formatted numbers (comma-separated thousands) are only risky when
            // combined with high missing rate — DuckDB TRY_CAST + REPLACE handles
            // them correctly, and the query compiler already strips commas for
            // formattedNumberColumns flagged by the investigation harness.
            if (column.hasFormattedNumbers && missingRate >= METRIC_AVOID_MISSING_RATE) {
                action = 'avoid';
                reasonCodes.push('formatted_number_risk');
            }
            if (missingRate >= METRIC_AVOID_MISSING_RATE) {
                action = 'avoid';
                reasonCodes.push('high_missing_rate');
            }

            return {
                column: column.name,
                action,
                reasonCodes,
                detail: action === 'allow'
                    ? 'metric_quality_ok'
                    : `missing=${Math.round(missingRate * 100)}%, formatted=${column.hasFormattedNumbers ? 'yes' : 'no'}${isZeroVariance ? ', zero_variance' : ''}`,
                missingRate,
                hasFormattedNumbers: Boolean(column.hasFormattedNumbers),
            };
        });

    const datasetSignals: DatasetQualitySignal[] = [];
    const worstUnclassified = dimensionDecisions
        .slice()
        .sort((left, right) => right.nullLikeShare - left.nullLikeShare)[0];

    if (worstUnclassified && worstUnclassified.nullLikeShare >= DATASET_UNCLASSIFIED_WARNING_SHARE) {
        datasetSignals.push({
            code: 'high_unclassified_share',
            severity: worstUnclassified.nullLikeShare >= DATASET_UNCLASSIFIED_CRITICAL_SHARE ? 'critical' : 'warning',
            message: `${Math.round(worstUnclassified.nullLikeShare * 100)}% of "${worstUnclassified.column}" is null-like or unclassified, so automatic analysis should treat that dimension cautiously.`,
        });
    }

    const rowExpansionRatio = options?.rowExpansionRatio;
    if (typeof rowExpansionRatio === 'number' && Number.isFinite(rowExpansionRatio) && rowExpansionRatio > DATASET_ROW_EXPANSION_INFO) {
        datasetSignals.push({
            code: rowExpansionRatio > DATASET_ROW_EXPANSION_WARNING ? 'row_expansion_critical' : 'row_expansion_warning',
            severity: rowExpansionRatio > DATASET_ROW_EXPANSION_WARNING ? 'warning' : 'info',
            message: `Prepared rows expanded the original file by ${rowExpansionRatio.toFixed(1)} times, which suggests residual report structure caveats.`,
        });
    }

    if ((options?.totalCardCount ?? 0) > 0 && (options?.trustedCardCount ?? 0) === 0) {
        datasetSignals.push({
            code: 'zero_trusted_cards',
            severity: 'warning',
            message: 'Automatic analysis produced no fully trusted cards, so downstream reporting should stay caveated.',
        });
    }

    return {
        dimensionDecisions,
        metricDecisions,
        datasetSignals,
        blockedDimensions: dimensionDecisions.filter(decision => decision.action === 'block').map(decision => decision.column),
        avoidDimensions: dimensionDecisions.filter(decision => decision.action === 'avoid').map(decision => decision.column),
        avoidMetrics: metricDecisions.filter(decision => decision.action === 'avoid').map(decision => decision.column),
        qualityHintsSummary: summarizeSignals(dimensionDecisions, metricDecisions, datasetSignals),
    };
};
