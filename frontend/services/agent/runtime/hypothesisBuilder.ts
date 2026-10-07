/**
 * hypothesisBuilder.ts
 *
 * Constructs DataAnalysisHypothesis objects from AI-generated topic strings.
 * Filters blocked dimensions, caps hypothesis count by usable dimension count,
 * and infers grain/metric/filter intent from topic text.
 */

import { createId } from '../../../utils/createId';
import type {
    DataAnalysisHypothesis,
    RuntimeSemanticUnderstanding,
} from '../../../types';
import type { PivotCandidate } from './dataInvestigationHarness';
import { buildDatasetContext } from '../contextBuilder';
import { DATA_ANALYSIS_MAX_HYPOTHESES } from './dataAnalysisPolicy';

const createCorrelationId = (prefix: string) => createId(prefix);

const normalizeTopicText = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/\bno\.\b/g, 'number ')
        .replace(/[%()[\]{}]/g, ' ')
        .replace(/[_/.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

// Split a camelCase/PascalCase identifier into lowercase words.
// e.g. "SeriesLabelL1" → "series label l 1"
const normalizeColumnToWords = (column: string): string =>
    column
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-zA-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const inferMentionedValue = (topic: string, candidates: string[]) => {
    const normalizedTopic = normalizeTopicText(topic);
    const matches = candidates
        .map(candidate => {
            const trimmed = candidate.trim();
            const raw = trimmed.toLowerCase();
            const normalizedCandidate = normalizeTopicText(normalizeColumnToWords(trimmed));
            const tokenCount = normalizedCandidate.split(' ').filter(word => word.length >= 2).length;
            if (!normalizedCandidate) {
                return null;
            }

            let score = -1;
            if (raw && normalizedTopic.includes(raw)) {
                score = tokenCount * 1000 + 200 + raw.length;
            } else if (normalizedTopic.includes(normalizedCandidate)) {
                score = tokenCount * 1000 + 150 + normalizedCandidate.length;
            } else {
                const words = normalizedCandidate.split(' ').filter(word => word.length >= 2);
                if (words.length >= 2 && words.every(word => normalizedTopic.includes(word))) {
                    score = words.length * 1000 + 100 + words.join(' ').length;
                }
            }

            return score < 0 ? null : { candidate, score };
        })
        .filter((entry): entry is { candidate: string; score: number } => Boolean(entry))
        .sort((left, right) => right.score - left.score);

    return matches[0]?.candidate ?? null;
};

// Short column names like "Code", "Value", "EC" appear naturally in topic
// text without referencing the actual column (e.g. "account code distribution"
// does not reference a column named "Code").  Require longer identifiers for
// direct substring matching to avoid false positives.
const MIN_DIRECT_MATCH_LENGTH = 8;

const topicMentionsColumn = (topic: string, column: string): boolean => {
    const normalizedTopic = topic.trim().toLowerCase();
    const rawCol = column.trim().toLowerCase();
    // 1. Direct substring match — only for sufficiently distinctive names.
    if (rawCol.length >= MIN_DIRECT_MATCH_LENGTH && normalizedTopic.includes(rawCol)) return true;
    // 2. Normalized match (camelCase → words, e.g. "SeriesLabelL1" → "series label l 1").
    const normalizedCol = normalizeColumnToWords(column);
    if (normalizedCol.length >= MIN_DIRECT_MATCH_LENGTH && normalizedTopic.includes(normalizedCol)) return true;
    // 3. For compound identifiers: all significant words (len >= 2) present in topic.
    const significantWords = normalizedCol.split(' ').filter(w => w.length >= 2);
    return significantWords.length >= 2
        && significantWords.every(word => normalizedTopic.includes(word));
};

// Only bypass hypothesis generation when there are truly no usable dimensions at all.
// businessGrains may be empty due to AI annotation inconsistency (e.g. Description
// sometimes classified as helper instead of grain for melted P&L datasets), so we
// still attempt analysis if candidate metrics exist — the evidence gate handles
// quality control on individual queries.
export const shouldBypassBusinessHypotheses = (
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    datasetContext?: ReturnType<typeof buildDatasetContext>,
) => {
    const semanticHasUsableGrain = semanticUnderstanding.businessGrains.some(
        grain => !semanticUnderstanding.blockedDimensions.includes(grain),
    );
    const contextHasUsableDimension = datasetContext?.dimensionColumns.some(
        dimension => !(datasetContext.blockedDimensions ?? []).includes(dimension)
            && !semanticUnderstanding.blockedDimensions.includes(dimension),
    ) ?? false;

    return !semanticHasUsableGrain
        && !contextHasUsableDimension
        && semanticUnderstanding.candidateMetrics.length === 0;
};

// Cap the number of hypotheses based on how many non-blocked dimensions are
// actually available.  With only 1 usable dimension all topics collapse to the
// same groupBy, wasting budget on duplicates that will be rejected later.
export const computeHypothesisCap = (datasetContext: ReturnType<typeof buildDatasetContext>): number => {
    const usableDims = datasetContext.dimensionColumns.filter(
        d => !(datasetContext.blockedDimensions ?? []).includes(d),
    ).length;
    const steeringConfidence = (datasetContext as { analysisSteering?: { signalConfidence?: 'high' | 'medium' | 'low' } | null })
        .analysisSteering?.signalConfidence ?? 'medium';
    const baseCap = usableDims <= 1
        ? Math.min(2, DATA_ANALYSIS_MAX_HYPOTHESES)
        : usableDims <= 2
            ? Math.min(4, DATA_ANALYSIS_MAX_HYPOTHESES)
            : DATA_ANALYSIS_MAX_HYPOTHESES;

    if (steeringConfidence === 'low') {
        return Math.max(1, Math.min(3, usableDims <= 1 ? 1 : baseCap - 1));
    }
    if (steeringConfidence === 'high' && usableDims >= 3) {
        return Math.min(DATA_ANALYSIS_MAX_HYPOTHESES, baseCap + 1);
    }
    return baseCap;
};

const mentionsRelationshipTerm = (topic: string, metricRelTerms: string[]) =>
    metricRelTerms.some(term => topic.toLowerCase().includes(term.toLowerCase()));

/** Maximum number of pivot hypotheses to append from harness candidates. */
const MAX_PIVOT_HYPOTHESES = 1;

const isAllowedPivotCandidate = (
    candidate: PivotCandidate,
    datasetContext: ReturnType<typeof buildDatasetContext>,
) => {
    const steering = (datasetContext as {
        analysisSteering?: {
            blockGroupBy?: string[];
            blockedDimensions?: string[];
            softDeprioritizeGroupBy?: string[];
            blockedMetrics?: string[];
            columnRoles?: Record<string, string>;
        } | null;
    }).analysisSteering ?? null;

    const blockedDimensions = new Set([
        ...(datasetContext.blockedDimensions ?? []),
        // Automatic pivots amplify sparse dimensions because missing labels can
        // collapse many unrelated rows into one dominant "Unknown" group. Treat
        // extreme quality-governance blocks as hard exclusions for auto-generated
        // pivots while keeping them available for explicit user exploration.
        ...(datasetContext.qualityBlockedDimensions ?? []),
        ...(steering?.blockGroupBy ?? []),
        ...(steering?.blockedDimensions ?? []),
        ...(steering?.softDeprioritizeGroupBy ?? []),
    ]);
    const blockedMetrics = new Set([
        ...(datasetContext.avoidMetricColumns ?? []),
        ...(steering?.blockedMetrics ?? []),
    ]);
    const columnRoles = steering?.columnRoles ?? {};

    if (blockedDimensions.has(candidate.rowDimension) || blockedDimensions.has(candidate.columnDimension)) {
        return false;
    }
    if (blockedMetrics.has(candidate.metric)) {
        return false;
    }

    const rowRole = columnRoles[candidate.rowDimension];
    const columnRole = columnRoles[candidate.columnDimension];
    const metricRole = columnRoles[candidate.metric];

    if (rowRole && rowRole !== 'business_dimension') {
        return false;
    }
    if (columnRole && columnRole !== 'business_dimension') {
        return false;
    }
    if (metricRole && metricRole !== 'business_metric') {
        return false;
    }

    return true;
};

export const buildHypotheses = (
    topics: string[],
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    datasetContext: ReturnType<typeof buildDatasetContext>,
    suggestedPivots: PivotCandidate[] = [],
): DataAnalysisHypothesis[] => {
    const relTerms = (datasetContext as { metricRelationshipTerms?: string[] }).metricRelationshipTerms ?? [];
    const steering = (datasetContext as {
        analysisSteering?: {
            preferGroupBy?: string[];
            softDeprioritizeGroupBy?: string[];
            blockGroupBy?: string[];
        } | null;
    }).analysisSteering ?? null;
    const blockedGroupBy = new Set([
        ...(datasetContext.blockedDimensions ?? []),
        ...(steering?.blockGroupBy ?? []),
    ]);
    const preferredGroupBy = new Set(steering?.preferGroupBy ?? []);
    const softDeprioritizedGroupBy = new Set(steering?.softDeprioritizeGroupBy ?? []);

    const scoreTopic = (topic: string, index: number) => {
        const preferredMatch = inferMentionedValue(topic, [...preferredGroupBy]);
        const softMatch = inferMentionedValue(topic, [...softDeprioritizedGroupBy]);
        let score = Math.max(1, topics.length - index);
        if (relTerms.length > 0 && mentionsRelationshipTerm(topic, relTerms)) {
            score += 2;
        }
        if (preferredMatch) {
            score += 3;
        }
        if (softMatch) {
            score -= 2;
        }
        return score;
    };

    const sqlHypotheses: DataAnalysisHypothesis[] = topics
        .filter(topic => ![...blockedGroupBy].some(column => topicMentionsColumn(topic, column)))
        .map((topic, index) => ({
            topic,
            index,
            priority: scoreTopic(topic, index),
        }))
        .sort((left, right) => right.priority - left.priority || left.index - right.index)
        .slice(0, computeHypothesisCap(datasetContext))
        .map((topic, index) => ({
            id: createCorrelationId('hypothesis'),
            topic: topic.topic,
            grain: inferMentionedValue(topic.topic, datasetContext.preferredGrainColumns ?? semanticUnderstanding.businessGrains) ?? inferMentionedValue(topic.topic, datasetContext.dimensionColumns),
            metric: inferMentionedValue(topic.topic, datasetContext.preferredMetricTerms ?? semanticUnderstanding.candidateMetrics) ?? inferMentionedValue(topic.topic, datasetContext.metricColumns),
            filterIntent: inferMentionedValue(topic.topic, datasetContext.preferredBusinessTerms ?? []),
            // Set from a Pi research plan question when one exists; no keyword guess from the topic text.
            comparisonIntent: null,
            priority: topic.priority,
            attemptsUsed: 0,
            status: 'pending',
        }));

    // Append pivot hypotheses from harness-detected candidates (lowest priority, runs last).
    // Accept both high and medium confidence — the pivot executor handles readability
    // via topN, so we don't need to be as strict at the hypothesis level.
    const pivotHypotheses: DataAnalysisHypothesis[] = suggestedPivots
        .filter(candidate => isAllowedPivotCandidate(candidate, datasetContext))
        .slice(0, MAX_PIVOT_HYPOTHESES)
        .map(candidate => {
            // Auto-set topN for readability: high-cardinality row dims get capped.
            // The pivot executor will sort by row_total DESC and take the top rows,
            // so this is equivalent to "show me the most important rows".
            const topN = candidate.rowCardinality <= 10 ? undefined
                : candidate.rowCardinality <= 20 ? 15
                : 10;
            const pivotArgs = {
                rows: [candidate.rowDimension],
                columns: [candidate.columnDimension],
                metric: candidate.metric,
                aggregate: candidate.aggregate,
                title: `${candidate.metric} by ${candidate.rowDimension} and ${candidate.columnDimension}`,
                description: `Cross-tabulation of ${candidate.metric} across ${candidate.rowDimension} (rows) and ${candidate.columnDimension} (columns).`,
                topN,
                sort: { by: 'row_total' as const, direction: 'desc' as const },
            };

            return {
                id: createCorrelationId('hypothesis'),
                topic: `Cross-tabulation: ${candidate.metric} by ${candidate.rowDimension} × ${candidate.columnDimension}`,
                grain: candidate.rowDimension,
                metric: candidate.metric,
                filterIntent: null,
                comparisonIntent: 'cross-tabulation',
                priority: 1, // lowest priority — runs last, after all SQL topics
                attemptsUsed: 0,
                status: 'pending' as const,
                executionMode: 'pivot_matrix' as const,
                pivotRequest: pivotArgs,
                plannedToolCall: {
                    toolName: 'analysis.pivot_matrix',
                    thought: `Create a pivot matrix for ${candidate.metric} across ${candidate.rowDimension} and ${candidate.columnDimension}.`,
                    pivotPreference: 'none',
                    pivotDecision: 'prefer_pivot',
                    args: pivotArgs,
                },
            };
        });

    return [...sqlHypotheses, ...pivotHypotheses];
};
