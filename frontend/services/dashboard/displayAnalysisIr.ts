import type {
    AnalysisCardData,
    ColumnProfile,
    DisplayAnalysisIr,
    DisplayAnalysisIrHelperExposureLevel,
    DisplayAnalysisIrNarrativeEligibility,
    DisplayAnalysisIrSemanticRole,
} from '../../types';
import { resolveDisplayPlanLabels } from './displayLabelContext';
import { resolvePlanGroupLabel, resolvePlanMetricLabel } from './businessLabelResolver';
import { buildMetricLabel, isNeutralHelperDisplayLabel } from './executiveKpiUtils';
import { classifyAnalysisColumnRole, isTimeLikeDimensionColumn } from '../agent/analysisColumnRoles';

const CURRENCY_LIKE_PATTERN = /amount|revenue|sales|cost|spend|budget|actual|price|profit|expense|value|total/i;
const HELPER_ROW_INDEX_PATTERN = /^(sourcerowindex|source row)$/i;
const HELPER_CLASSIFICATION_PATTERN = /^(rowclass|row class|hierarchydepth|hierarchy depth)$/i;
const HELPER_DIMENSION_PATTERN = /^(rowlabel|row label|sourcecolumnname|source column|serieskey|series key|serieslabel|series label \d+|serieslabell\d+)$/i;
const NULL_LIKE_LABEL_PATTERN = /^(null|n\/a|na|none|unknown)$/i;

const normalizeKey = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const clampConfidence = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const toFiniteNumbers = (card: AnalysisCardData) => {
    const valueColumn = card.plan.valueColumn;
    if (!valueColumn) return [];

    return card.aggregatedData
        .map(row => {
            const raw = row[valueColumn];
            if (typeof raw === 'number') return raw;
            if (typeof raw !== 'string') return Number.NaN;
            const normalized = raw.replace(/,/g, '').trim();
            return Number(normalized);
        })
        .filter(value => Number.isFinite(value));
};

const hasNullLikeGroupValues = (card: AnalysisCardData) => {
    const groupByColumn = card.plan.groupByColumn;
    if (!groupByColumn) return false;

    return card.aggregatedData.some(row => {
        const raw = row[groupByColumn];
        if (raw === null || raw === undefined) return true;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            return trimmed.length === 0 || NULL_LIKE_LABEL_PATTERN.test(trimmed);
        }
        return false;
    });
};

const classifySemanticRole = (
    card: AnalysisCardData,
    displayGroupLabel: string,
    columnProfiles: ColumnProfile[],
): DisplayAnalysisIrSemanticRole => {
    if (card.plan.isFallback) {
        return 'fallback';
    }

    if (!card.plan.groupByColumn) {
        return 'metric_only';
    }

    const rawGroupKey = normalizeKey(card.plan.groupByColumn);
    const displayKey = displayGroupLabel.toLowerCase();
    const displayIsNeutralHelper = isNeutralHelperDisplayLabel(displayGroupLabel);

    if (HELPER_ROW_INDEX_PATTERN.test(rawGroupKey) || HELPER_ROW_INDEX_PATTERN.test(displayKey)) {
        return 'helper_row_index';
    }

    if (HELPER_CLASSIFICATION_PATTERN.test(rawGroupKey) || HELPER_CLASSIFICATION_PATTERN.test(displayKey)) {
        return 'helper_classification';
    }

    if (
        (HELPER_DIMENSION_PATTERN.test(rawGroupKey) && displayIsNeutralHelper)
        || HELPER_DIMENSION_PATTERN.test(displayKey)
        || displayIsNeutralHelper
    ) {
        return 'helper_dimension';
    }

    const groupColumn = columnProfiles.find(column => column.name === card.plan.groupByColumn);
    if (groupColumn) {
        const sharedRole = classifyAnalysisColumnRole(groupColumn, columnProfiles);
        if (sharedRole === 'repeated_bundle_member') {
            return 'repeated_bundle_member';
        }
        if (sharedRole === 'helper_dimension') {
            return 'helper_dimension';
        }
    }

    return 'business_dimension';
};

const buildAggregationQualityFlags = (
    card: AnalysisCardData,
    semanticRole: DisplayAnalysisIrSemanticRole,
    displayGroupLabel: string,
): string[] => {
    const flags = new Set<string>();
    const numericValues = toFiniteNumbers(card);
    const neutralHelperLabel = isNeutralHelperDisplayLabel(displayGroupLabel);

    if (card.plan.isFallback) {
        flags.add('fallback_view');
    }

    if (semanticRole === 'helper_row_index' || semanticRole === 'helper_classification') {
        flags.add('helper_dimension_heavy');
    }

    if (semanticRole === 'helper_dimension' && neutralHelperLabel) {
        flags.add('helper_dimension_heavy');
        flags.add('neutral_only_labels');
    }

    if (semanticRole === 'repeated_bundle_member') {
        flags.add('helper_dimension_heavy');
        flags.add('repeated_bundle_dimension');
    }

    if (semanticRole === 'metric_only') {
        flags.add('metric_only_view');
    }

    if (card.plan.aggregation === 'count') {
        flags.add('count_only_view');
    }

    const isTemporalSeries = Boolean(
        card.plan.groupByColumn
        && isTimeLikeDimensionColumn(card.plan.groupByColumn)
        && ['line', 'area', 'multi_line'].includes(card.plan.chartType),
    );
    if (card.aggregatedData.length >= 30 && !isTemporalSeries) {
        flags.add('fragmented_groups');
    }

    if (hasNullLikeGroupValues(card)) {
        flags.add('null_group_labels');
    }

    if (numericValues.length >= 2) {
        const max = Math.max(...numericValues);
        const min = Math.min(...numericValues);
        const uniqueRounded = new Set(numericValues.map(value => value.toFixed(2)));
        if (uniqueRounded.size <= 1 || Math.abs(max - min) < 1e-9 || (max !== 0 && min !== 0 && Math.abs(max - min) / Math.abs(max) < 0.01)) {
            flags.add('low_signal_distribution');
        }
    }

    return [...flags];
};

const buildNarrativeSignals = (
    card: AnalysisCardData,
    semanticRole: DisplayAnalysisIrSemanticRole,
    displayTitle: string,
    displayGroupLabel: string,
    displayMetricLabel: string | null,
    aggregationQualityFlags: string[],
): {
    helperExposureLevel: DisplayAnalysisIrHelperExposureLevel;
    businessMeaningConfidence: number;
    narrativeEligibility: DisplayAnalysisIrNarrativeEligibility;
} => {
    const neutralHelperLabel = isNeutralHelperDisplayLabel(displayGroupLabel);
    const titleLooksBusinessLike = !/source row|source column|row class|series key|series label|row label|row total/i.test(displayTitle);

    let helperExposureLevel: DisplayAnalysisIrHelperExposureLevel = 'medium';
    let businessMeaningConfidence = 0.4;
    let narrativeEligibility: DisplayAnalysisIrNarrativeEligibility = 'allowed_neutral';

    switch (semanticRole) {
        case 'fallback':
            helperExposureLevel = 'high';
            businessMeaningConfidence = 0.3;
            narrativeEligibility = 'allowed_neutral';
            break;
        case 'helper_row_index':
        case 'helper_classification':
            helperExposureLevel = 'high';
            businessMeaningConfidence = 0.15;
            narrativeEligibility = 'avoid_if_possible';
            break;
        case 'helper_dimension':
            helperExposureLevel = neutralHelperLabel ? 'high' : 'medium';
            businessMeaningConfidence = neutralHelperLabel ? 0.3 : 0.5;
            narrativeEligibility = 'allowed_neutral';
            break;
        case 'repeated_bundle_member':
            helperExposureLevel = 'high';
            businessMeaningConfidence = 0.22;
            narrativeEligibility = 'avoid_if_possible';
            break;
        case 'metric_only':
            helperExposureLevel = 'medium';
            businessMeaningConfidence = 0.4;
            narrativeEligibility = 'allowed_neutral';
            break;
        case 'business_dimension':
            helperExposureLevel = neutralHelperLabel ? 'low' : 'none';
            businessMeaningConfidence = titleLooksBusinessLike && displayMetricLabel ? 0.84 : 0.74;
            narrativeEligibility = 'preferred';
            break;
        default:
            break;
    }

    if (aggregationQualityFlags.includes('count_only_view')) {
        businessMeaningConfidence -= semanticRole === 'business_dimension' ? 0.12 : 0.05;
        if (semanticRole === 'business_dimension') {
            narrativeEligibility = 'allowed_neutral';
        }
    }

    if (aggregationQualityFlags.includes('fragmented_groups')) {
        businessMeaningConfidence -= 0.1;
        if (semanticRole === 'business_dimension') {
            narrativeEligibility = 'allowed_neutral';
        }
    }

    if (aggregationQualityFlags.includes('low_signal_distribution')) {
        businessMeaningConfidence -= 0.08;
        if (semanticRole === 'business_dimension') {
            narrativeEligibility = 'allowed_neutral';
        }
    }

    if (aggregationQualityFlags.includes('null_group_labels')) {
        businessMeaningConfidence -= 0.05;
    }

    if (aggregationQualityFlags.includes('helper_dimension_heavy')) {
        helperExposureLevel = 'high';
    }

    const autoAnalysisVerdict = card.autoAnalysisEvaluation?.verdict ?? null;
    if (autoAnalysisVerdict === 'caveated') {
        businessMeaningConfidence -= 0.18;
        if (narrativeEligibility === 'preferred') {
            narrativeEligibility = 'allowed_neutral';
        }
    } else if (autoAnalysisVerdict === 'weak') {
        helperExposureLevel = 'high';
        businessMeaningConfidence = Math.min(businessMeaningConfidence, 0.2);
        narrativeEligibility = 'avoid_if_possible';
    }

    return {
        helperExposureLevel,
        businessMeaningConfidence: clampConfidence(businessMeaningConfidence),
        narrativeEligibility,
    };
};

const buildSelectionScore = (
    card: AnalysisCardData,
    semanticRole: DisplayAnalysisIrSemanticRole,
): { score: number; reasons: string[] } => {
    const reasons: string[] = [];
    if (card.plan.isFallback) {
        return { score: Number.NEGATIVE_INFINITY, reasons: ['fallback_card_excluded'] };
    }

    if (!card.plan.groupByColumn) {
        return { score: Number.NEGATIVE_INFINITY, reasons: ['missing_group_by'] };
    }

    if (card.aggregatedData.length === 0) {
        return { score: Number.NEGATIVE_INFINITY, reasons: ['missing_aggregated_rows'] };
    }

    let score = 0;

    if (!card.plan.preFilter?.length) {
        score += 20;
        reasons.push('no_prefilter');
    }
    if (!card.filter?.values?.length) {
        score += 12;
        reasons.push('no_card_filter');
    }
    if (card.plan.aggregation === 'sum') {
        score += 40;
        reasons.push('sum_aggregation');
    } else if (card.plan.aggregation === 'count') {
        score += 24;
        reasons.push('count_aggregation');
    } else if (card.plan.aggregation === 'avg') {
        score += 12;
        reasons.push('avg_aggregation');
    }
    if (card.plan.valueColumn) {
        score += 8;
        reasons.push('has_value_column');
    }
    if (card.aggregatedData.length >= 2) {
        score += 6;
        reasons.push('multi_row_result');
    }
    if (card.aggregatedData.length <= 30) {
        score += 4;
        reasons.push('manageable_row_count');
    }
    if (CURRENCY_LIKE_PATTERN.test(card.plan.valueColumn ?? '')) {
        score += 10;
        reasons.push('currency_like_metric');
    }

    switch (semanticRole) {
        case 'business_dimension':
            score += 24;
            reasons.push('business_dimension');
            break;
        case 'repeated_bundle_member':
            score -= 95;
            reasons.push('repeated_bundle_penalty');
            break;
        case 'helper_dimension':
            score -= 80;
            reasons.push('helper_dimension_penalty');
            break;
        case 'helper_row_index':
            score -= 120;
            reasons.push('helper_row_penalty');
            break;
        case 'helper_classification':
            score -= 110;
            reasons.push('helper_classification_penalty');
            break;
        case 'metric_only':
            score -= 140;
            reasons.push('metric_only_penalty');
            break;
        default:
            break;
    }

    const autoAnalysisVerdict = card.autoAnalysisEvaluation?.verdict ?? null;
    if (autoAnalysisVerdict === 'caveated') {
        score -= 30;
        reasons.push('caveated_verdict_penalty');
    } else if (autoAnalysisVerdict === 'weak') {
        score -= 140;
        reasons.push('weak_verdict_penalty');
    }

    return { score, reasons };
};

export const buildDisplayAnalysisIr = (
    card: AnalysisCardData,
    allCards: AnalysisCardData[] = [card],
    columnProfiles: ColumnProfile[] = [],
): DisplayAnalysisIr => {
    const plans = allCards.map(candidate => candidate.plan);
    const displayPlan = resolveDisplayPlanLabels(card.plan, plans);
    const displayGroupLabel = resolvePlanGroupLabel(card.plan);
    const displayMetricLabel = resolvePlanMetricLabel(card.plan) ?? buildMetricLabel(card.plan.valueColumn);
    const semanticRole = classifySemanticRole(card, displayGroupLabel, columnProfiles);
    const aggregationQualityFlags = buildAggregationQualityFlags(card, semanticRole, displayGroupLabel);
    const narrativeSignals = buildNarrativeSignals(
        card,
        semanticRole,
        displayPlan.title,
        displayGroupLabel,
        displayMetricLabel,
        aggregationQualityFlags,
    );
    const selection = buildSelectionScore(card, semanticRole);

    return {
        cardId: card.id,
        sourcePlan: card.plan,
        displayTitle: displayPlan.title,
        displayDescription: displayPlan.description,
        displayGroupLabel,
        displayMetricLabel,
        groupByColumn: card.plan.groupByColumn,
        valueColumn: card.plan.valueColumn,
        aggregation: card.plan.aggregation,
        aggregatedData: card.aggregatedData,
        aggregatedRows: card.aggregatedData.length,
        isFallback: Boolean(card.plan.isFallback),
        semanticRole,
        autoAnalysisVerdict: card.autoAnalysisEvaluation?.verdict ?? null,
        helperExposureLevel: narrativeSignals.helperExposureLevel,
        businessMeaningConfidence: narrativeSignals.businessMeaningConfidence,
        aggregationQualityFlags,
        safeNarrativeLabels: {
            title: displayPlan.title,
            dimension: card.plan.groupByColumn ? displayGroupLabel : null,
            metric: displayMetricLabel,
        },
        narrativeEligibility: narrativeSignals.narrativeEligibility,
        selectionScore: selection.score,
        selectionReasons: selection.reasons,
    };
};

export const buildDisplayAnalysisIrList = (
    cards: AnalysisCardData[],
    columnProfiles: ColumnProfile[] = [],
): DisplayAnalysisIr[] =>
    cards.map(card => buildDisplayAnalysisIr(card, cards, columnProfiles));
