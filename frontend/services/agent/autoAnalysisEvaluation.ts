import type { AnalysisCardData, AnalysisQualityGovernanceResult, ColumnProfile, CsvRow } from '../../types';
import { buildDisplayAnalysisIr } from '../dashboard/displayAnalysisIr';

export type AutoAnalysisEvaluationReasonCode =
    | 'helper_exposure'
    | 'narrative_ineligible'
    | 'low_business_confidence'
    | 'aggregation_quality_warning'
    | 'fallback_plan'
    | 'value_gate_table_only'
    | 'value_gate_reject'
    | 'duplicate_semantic'
    | 'unsafe_business_narrative'
    | 'dimension_quality_warning'
    | 'metric_quality_warning'
    | 'unclassified_share_warning';

export type AutoAnalysisCardVerdict = 'trusted' | 'caveated' | 'weak';

export interface AutoAnalysisCardEvaluation {
    cardId: string;
    title: string;
    verdict: AutoAnalysisCardVerdict;
    reasonCodes: AutoAnalysisEvaluationReasonCode[];
    detail: string;
}

export interface AutoAnalysisEvaluationSummary {
    cards: AutoAnalysisCardEvaluation[];
    trustedCount: number;
    caveatedCount: number;
    weakCount: number;
    overallVerdict: AutoAnalysisCardVerdict;
}

const formatReasonDetail = (
    reasonCodes: AutoAnalysisEvaluationReasonCode[],
    detailParts: string[],
) => {
    if (reasonCodes.length === 0) {
        return 'trusted';
    }

    return detailParts.join(' | ');
};

const NULL_LIKE_LABEL = /^(null|n\/a|na|unknown|unclassified|undefined|none|\s*)$/i;
const TOLERABLE_BUSINESS_NULL_SHARE = 0.12;

const toNumeric = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().replace(/[,$%()]/g, '');
    if (!normalized) {
        return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const computeUnclassifiedShare = (
    rows: CsvRow[],
    groupByColumn: string | undefined,
    valueColumn: string | undefined,
): number => {
    if (!groupByColumn || rows.length === 0) {
        return 0;
    }

    let unknownWeight = 0;
    let totalWeight = 0;

    for (const row of rows) {
        const weight = valueColumn ? Math.abs(toNumeric(row[valueColumn]) ?? 0) : 1;
        totalWeight += weight;
        if (NULL_LIKE_LABEL.test(String(row[groupByColumn] ?? '').trim())) {
            unknownWeight += weight;
        }
    }

    if (totalWeight <= 0) {
        return 0;
    }

    return unknownWeight / totalWeight;
};

const isTolerableBusinessNullLeakage = (params: {
    semanticRole: string | null | undefined;
    aggregationQualityFlags: string[];
    unclassifiedShare: number;
}): boolean => {
    const { semanticRole, aggregationQualityFlags, unclassifiedShare } = params;
    return semanticRole === 'business_dimension'
        && aggregationQualityFlags.length > 0
        && aggregationQualityFlags.every(flag => flag === 'null_group_labels')
        && unclassifiedShare < TOLERABLE_BUSINESS_NULL_SHARE;
};

const formatPreFilterContract = (card: AnalysisCardData): string | null => {
    const clauses = card.plan.preFilter ?? [];
    if (clauses.length === 0) {
        return null;
    }
    return clauses
        .map(clause => `${clause.column}:${clause.operator ?? 'eq'}:${Array.isArray(clause.value) ? clause.value.join(',') : clause.value}`)
        .join(';');
};

const AGGREGATION_QUALITY_WARNING_FLAGS = new Set([
    'fallback_view',
    'fragmented_groups',
    'helper_dimension_heavy',
    'low_signal_distribution',
    'neutral_only_labels',
    'null_group_labels',
    'repeated_bundle_dimension',
]);

export const evaluateAutoAnalysisCards = (
    cards: AnalysisCardData[],
    options?: {
        qualityGovernance?: AnalysisQualityGovernanceResult | null;
        columnProfiles?: ColumnProfile[] | null;
    },
): AutoAnalysisEvaluationSummary => {
    const qualityGovernance = options?.qualityGovernance ?? null;
    const columnProfiles = options?.columnProfiles ?? [];
    const evaluations = cards.map(card => {
        const isEvaluable = Boolean(card?.plan?.chartType) && Array.isArray(card?.aggregatedData);
        if (!isEvaluable) {
            return {
                cardId: card.id,
                title: card?.plan?.title ?? 'Untitled card',
                verdict: 'trusted',
                reasonCodes: [],
                detail: 'evaluation_unavailable',
            } satisfies AutoAnalysisCardEvaluation;
        }

        // Per-card resilience guard: if any part of evaluation throws (IR build,
        // property access on malformed card data, etc.), mark as evaluation_error
        // and continue evaluating remaining cards — one bad card must not kill the pass.
        try {
            const ir = buildDisplayAnalysisIr(card, cards, columnProfiles);
            const aggregationQualityWarnings = ir.aggregationQualityFlags.filter(flag =>
                AGGREGATION_QUALITY_WARNING_FLAGS.has(flag));
            const isCountView = ir.aggregationQualityFlags.includes('count_only_view');
            const unclassifiedShare = qualityGovernance
                ? computeUnclassifiedShare(
                    Array.isArray(card.aggregatedData) ? card.aggregatedData : [],
                    card.plan.groupByColumn,
                    card.plan.valueColumn,
                )
                : 0;
            const tolerableBusinessNullLeakage = !isCountView
                && isTolerableBusinessNullLeakage({
                    semanticRole: ir.semanticRole,
                    aggregationQualityFlags: aggregationQualityWarnings,
                    unclassifiedShare,
                });

            const reasonCodes: AutoAnalysisEvaluationReasonCode[] = [];
            const detailParts: string[] = [];
            const gateDecision = card.evidenceValueGate?.decision;

            if (gateDecision === 'table_only') {
                reasonCodes.push('value_gate_table_only');
                detailParts.push(`valueGate=${gateDecision}`);
            }
            if (gateDecision === 'reject') {
                reasonCodes.push('value_gate_reject');
                detailParts.push(`valueGate=${gateDecision}`);
            }
            if (card.evidenceValueGate?.reasonCodes?.includes('duplicate_semantic')) {
                reasonCodes.push('duplicate_semantic');
                detailParts.push('duplicateSemantic=true');
            }
            if (card.evidenceValueGate?.reasonCodes?.includes('unsafe_business_narrative')) {
                reasonCodes.push('unsafe_business_narrative');
                detailParts.push('unsafeBusinessNarrative=true');
            }

            if (ir.helperExposureLevel !== 'none') {
                reasonCodes.push('helper_exposure');
                detailParts.push(`helperExposure=${ir.helperExposureLevel}`);
            }
            if (
                ir.semanticRole === 'helper_dimension'
                || ir.semanticRole === 'helper_row_index'
                || ir.semanticRole === 'helper_classification'
            ) {
                reasonCodes.push('narrative_ineligible');
                detailParts.push(`semanticRole=${ir.semanticRole}`);
            }
            if ((ir.businessMeaningConfidence ?? 0) < 0.50) {
                reasonCodes.push('low_business_confidence');
                detailParts.push(`businessMeaningConfidence=${ir.businessMeaningConfidence.toFixed(2)}`);
            }
            if (aggregationQualityWarnings.length > 0 && !tolerableBusinessNullLeakage) {
                reasonCodes.push('aggregation_quality_warning');
                detailParts.push(`aggregationFlags=${aggregationQualityWarnings.join(', ')}`);
            }
            if (ir.isFallback) {
                reasonCodes.push('fallback_plan');
                detailParts.push('fallbackPlan=true');
            }
            if (qualityGovernance) {
                const preFilterContract = formatPreFilterContract(card);
                if (preFilterContract) {
                    detailParts.push(`preFilter=${preFilterContract}`);
                }
                const dimensionDecision = qualityGovernance.dimensionDecisions.find(decision => decision.column === card.plan.groupByColumn);
                if (dimensionDecision && dimensionDecision.action !== 'allow') {
                    reasonCodes.push('dimension_quality_warning');
                    detailParts.push(`dimensionQuality=${card.plan.groupByColumn}:${dimensionDecision.action}`);
                }
                const metricDecision = qualityGovernance.metricDecisions.find(decision => decision.column === card.plan.valueColumn);
                if (metricDecision && metricDecision.action !== 'allow') {
                    // formatted_number_risk alone is mitigated by SQL TRY_CAST —
                    // DuckDB already strips commas during aggregation.  Only flag
                    // when there are other metric-quality concerns (e.g. high missing rate).
                    const hasNonFormattingRisk = metricDecision.reasonCodes.some(
                        code => code !== 'formatted_number_risk',
                    );
                    if (hasNonFormattingRisk) {
                        reasonCodes.push('metric_quality_warning');
                        detailParts.push(`metricQuality=${card.plan.valueColumn}:${metricDecision.action}`);
                    }
                }

                if (unclassifiedShare >= 0.1 && !tolerableBusinessNullLeakage) {
                    reasonCodes.push('unclassified_share_warning');
                    detailParts.push(`unclassifiedShare=${Math.round(unclassifiedShare * 100)}%`);
                }
            }

            // Determine verdict.  table_only cards are intentionally table-first,
            // so unsafe_business_narrative alone should NOT push them to 'weak' —
            // the table presentation is itself the safe fallback.
            //
            // Design note (apparent circularity): unsafeForBusinessNarrative causes
            // the evidence gate to choose table_only → but then we exempt table_only
            // cards from the unsafe penalty.  This is intentional: the gate's job is
            // to PREVENT a chart (which would mislead), and the verdict's job is to
            // evaluate what WAS produced.  A table that correctly avoids a misleading
            // chart should not be penalized for the reason that caused the safe choice.
            const isTableOnlyCard = gateDecision === 'table_only';
            const hasWeakSignal = reasonCodes.some(code =>
                code === 'fallback_plan'
                || code === 'narrative_ineligible'
                || code === 'helper_exposure'
                || code === 'value_gate_reject',
            );
            // unsafe_business_narrative on a table_only card is caveated, not weak —
            // the chart would be misleading, but the data table itself is fine.
            const hasUnsafeNarrative = reasonCodes.includes('unsafe_business_narrative');
            const verdict: AutoAnalysisCardVerdict = reasonCodes.length === 0
                ? 'trusted'
                : hasWeakSignal
                    ? 'weak'
                    : (hasUnsafeNarrative && !isTableOnlyCard)
                        ? 'weak'
                        : 'caveated';

            return {
                cardId: ir.cardId,
                title: ir.displayTitle,
                verdict,
                reasonCodes,
                detail: formatReasonDetail(reasonCodes, detailParts),
            } satisfies AutoAnalysisCardEvaluation;
        } catch {
            return {
                cardId: card.id,
                title: card?.plan?.title ?? 'Untitled card',
                verdict: 'trusted',
                reasonCodes: [],
                detail: 'evaluation_error',
            } satisfies AutoAnalysisCardEvaluation;
        }
    });

    const trustedCount = evaluations.filter(card => card.verdict === 'trusted').length;
    const caveatedCount = evaluations.filter(card => card.verdict === 'caveated').length;
    const weakCount = evaluations.filter(card => card.verdict === 'weak').length;
    // A caveated-only run (no trusted, no weak) still provides useful informational
    // cards (e.g. table-only views).  Only mark overall as 'weak' when there are
    // explicitly weak cards or no cards at all.
    const overallVerdict: AutoAnalysisCardVerdict = trustedCount > 0
        ? (caveatedCount > 0 || weakCount > 0 ? 'caveated' : 'trusted')
        : caveatedCount > 0 && weakCount === 0
            ? 'caveated'
            : 'weak';

    return {
        cards: evaluations,
        trustedCount,
        caveatedCount,
        weakCount,
        overallVerdict,
    };
};

export const formatAutoAnalysisEvaluationSummary = (
    summary: AutoAnalysisEvaluationSummary,
): string => {
    const counts = `${summary.trustedCount} trusted, ${summary.caveatedCount} caveated, ${summary.weakCount} weak`;
    if (summary.cards.length === 0) {
        return 'No automatic analysis cards were produced.';
    }
    if (summary.overallVerdict === 'trusted') {
        return `Automatic analysis evidence is trusted (${counts}).`;
    }
    if (summary.trustedCount === 0 && summary.caveatedCount > 0 && summary.weakCount === 0) {
        return `Automatic analysis produced informational cards, but none are fully trusted (${counts}).`;
    }
    if (summary.trustedCount === 0) {
        return `Automatic analysis produced cards, but none are trusted enough for a definitive answer (${counts}).`;
    }
    return `Automatic analysis produced mixed-quality evidence (${counts}).`;
};

export const attachAutoAnalysisEvaluationToCards = (
    cards: AnalysisCardData[],
    options?: {
        qualityGovernance?: AnalysisQualityGovernanceResult | null;
        columnProfiles?: ColumnProfile[] | null;
    },
): AnalysisCardData[] => {
    const evaluatedAt = new Date().toISOString();
    const evaluationByCardId = new Map(
        evaluateAutoAnalysisCards(cards, options).cards.map(card => [card.cardId, card]),
    );

    return cards.map(card => {
        const evaluation = evaluationByCardId.get(card.id);
        if (!evaluation) {
            return card;
        }

        return {
            ...card,
            autoAnalysisEvaluation: {
                verdict: evaluation.verdict,
                reasonCodes: evaluation.reasonCodes,
                detail: evaluation.detail,
                evaluatedAt,
                source: 'auto_analysis_evaluator_v1',
            },
        };
    });
};
