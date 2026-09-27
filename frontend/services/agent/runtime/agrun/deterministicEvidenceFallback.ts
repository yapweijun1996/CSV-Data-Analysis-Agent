import type { AnalysisCardData, ColumnProfile, SqlAnalysisPlan } from '../../../../types';
import type { StoreApi } from '../../types';
import { buildDatasetContext } from '../../contextBuilder';
import { getPreferredAnalysisDataset } from '../../reportStructureState';
import { resolveAnalysisDatasetProfiles } from '../../analysisDatasetProfiles';
import { executeSqlPlanAndCreateCard } from '../../execution/sqlCardExecutor';

const BUSINESS_MEASURE_PATTERN = /(?:^|[\s_\-.])(amount|balance|revenue|sales|profit|cost|value|spend|income|expense)(?:$|[\s_\-.])/i;
const UNIT_MEASURE_PATTERN = /(?:^|[\s_\-.])(qty|quantity|count|rate|ratio|percent|price|id|number|no)(?:$|[\s_\-.])/i;
const BUSINESS_DIMENSION_PATTERN = /(?:^|[\s_\-.])(country|region|customer|client|product|item|project|category|brand|type|status|town|department|channel)(?:$|[\s_\-.])/i;

const rankMetric = (profile: ColumnProfile): number => {
    let score = profile.type === 'currency' ? 5 : 0;
    if (BUSINESS_MEASURE_PATTERN.test(profile.name)) score += 8;
    if (UNIT_MEASURE_PATTERN.test(profile.name)) score -= 4;
    if ((profile.missingPercentage ?? 0) <= 20) score += 1;
    return score;
};

const rankDimension = (profile: ColumnProfile, preferred: Set<string>): number => {
    let score = preferred.has(profile.name) ? 5 : 0;
    if (BUSINESS_DIMENSION_PATTERN.test(profile.name)) score += 5;
    if (profile.type === 'date' || profile.type === 'time') score -= 6;
    if ((profile.uniqueValues ?? 0) >= 2 && (profile.uniqueValues ?? 0) <= 30) score += 3;
    if ((profile.missingPercentage ?? 0) <= 20) score += 1;
    return score;
};

export const buildDeterministicEvidenceFallbackPlan = (
    profiles: ColumnProfile[],
    context: ReturnType<typeof buildDatasetContext>,
): SqlAnalysisPlan | null => {
    const blockedDimensions = new Set([
        ...(context.blockedDimensions ?? []),
        ...(context.avoidGrainColumns ?? []),
        ...(context.helperDimensions ?? []),
    ]);
    const avoidedMetrics = new Set(context.avoidMetricColumns ?? []);
    const preferredDimensions = new Set([
        ...(context.preferredGrainColumns ?? []),
        ...(context.businessGrains ?? []),
    ]);
    const profileByName = new Map(profiles.map(profile => [profile.name, profile]));
    const dimension = context.dimensionColumns
        .filter(name => !blockedDimensions.has(name))
        .map(name => profileByName.get(name))
        .filter((profile): profile is ColumnProfile => Boolean(profile))
        .sort((left, right) => rankDimension(right, preferredDimensions) - rankDimension(left, preferredDimensions))[0];
    const metric = context.metricColumns
        .filter(name => !avoidedMetrics.has(name))
        .map(name => profileByName.get(name))
        .filter((profile): profile is ColumnProfile => Boolean(profile))
        .sort((left, right) => rankMetric(right) - rankMetric(left))[0];
    if (!dimension || !metric) return null;

    const aggregation = metric.type === 'percentage' || UNIT_MEASURE_PATTERN.test(metric.name)
        ? 'avg'
        : 'sum';
    const aggregateLabel = `${aggregation === 'sum' ? 'Total' : 'Average'} ${metric.name}`;
    return {
        chartType: 'bar',
        title: `${aggregateLabel} by ${dimension.name}`,
        description: `${aggregateLabel} grouped by ${dimension.name}. This deterministic fallback is provided for review because the governed research run produced no accepted card.`,
        queryMode: 'aggregate',
        query: {
            select: [dimension.name, aggregateLabel],
            groupBy: [dimension.name],
            aggregates: [{
                function: aggregation,
                column: metric.name,
                as: aggregateLabel,
            }],
            orderBy: [{ column: aggregateLabel, direction: 'desc' }],
            limit: 12,
        },
        bindings: {
            groupByColumn: dimension.name,
            valueColumn: aggregateLabel,
        },
        aggregation,
        defaultTopN: 8,
        defaultHideOthers: true,
    };
};

export const createDeterministicEvidenceFallbackCard = async (
    store: StoreApi,
): Promise<AnalysisCardData | null> => {
    const state = store.getState();
    const dataset = getPreferredAnalysisDataset(state);
    if (!dataset) return null;
    const profiles = resolveAnalysisDatasetProfiles(dataset, state.columnProfiles);
    const context = buildDatasetContext(
        dataset,
        profiles,
        state.reportContextResolution,
        state.datasetSemanticSnapshot,
        state.semanticDatasetVersion,
        state.dataPreparationPlan,
        state.rawCsvData,
    );
    const plan = buildDeterministicEvidenceFallbackPlan(profiles, context);
    if (!plan) return null;

    const card = await executeSqlPlanAndCreateCard(plan, store, undefined, {
        topic: 'Deterministic evidence fallback',
    });
    const warning = 'Automatic research produced no accepted card; this deterministic aggregate is available for review.';
    const caveatedCard: AnalysisCardData = {
        ...card,
        plan: { ...card.plan, isFallback: true },
        qualityWarnings: Array.from(new Set([...(card.qualityWarnings ?? []), warning])),
    };
    store.setState(previous => ({
        analysisCards: previous.analysisCards.map(candidate =>
            candidate.id === caveatedCard.id ? caveatedCard : candidate),
    }));
    return caveatedCard;
};
