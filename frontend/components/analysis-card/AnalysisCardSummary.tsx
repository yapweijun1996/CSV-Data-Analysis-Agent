
import React, { useEffect, useMemo, useState } from 'react';
import { AnalysisPlan, LocalizedText, Settings } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { getTranslation } from '../../utils/localization';
import { PivotCardQualitySummary, formatAnalysisMeasureValue, formatAnalysisValue, isAdditiveAggregation, normalizeCategoryLabel } from '../../utils/analysisCardPresentation';

interface AnalysisCardSummaryProps {
    cardId: string;
    plan: AnalysisPlan;
    totalValue: number;
    overallTotalValue: number;
    displayedRowCount: number;
    totalRowCount: number;
    displayedMetricLabel: string;
    displayedGroupLabel: string;
    topN: number | null;
    hideOthers: boolean;
    hiddenLabelCount: number;
    filter?: { column: string; values: (string | number)[] };
    language: Settings['language'];
    summary?: LocalizedText | null;
    visualSummary?: LocalizedText | null;
    visuallyGrounded?: boolean;
    pivotQualitySummary?: PivotCardQualitySummary | null;
}

const AnalysisCardSummaryComponent: React.FC<AnalysisCardSummaryProps> = ({
    cardId,
    plan,
    totalValue,
    overallTotalValue,
    displayedRowCount,
    totalRowCount,
    displayedMetricLabel,
    displayedGroupLabel,
    topN,
    hideOthers,
    hiddenLabelCount,
    filter,
    language,
    summary,
    visualSummary,
    visuallyGrounded,
    pivotQualitySummary,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Auto-expand when card.refine updates the summary (dispatched from navigateToCardNarrative)
    useEffect(() => {
        const handler = (e: Event) => {
            if ((e as CustomEvent).detail?.cardId === cardId) {
                setIsExpanded(true);
            }
        };
        window.addEventListener('card:expand-narrative', handler);
        return () => window.removeEventListener('card:expand-narrative', handler);
    }, [cardId]);

    const effectiveSummary = visualSummary ?? summary;
    const primarySummary = useMemo(() => effectiveSummary?.text.trim() || '', [effectiveSummary]);
    const hasExpandableContent = primarySummary.length > 0;
    const showLanguageBadge = Boolean(summary && summary.language !== language);
    const summaryTitle = getTranslation('analysis_card_ai_summary', language);
    const summaryPlaceholder = getTranslation('analysis_card_summary_placeholder', language);
    const hasAdditiveMeasure = isAdditiveAggregation(plan.aggregation);
    const showingLabel = getTranslation('analysis_card_showing_total_label', language);
    const overallLabel = getTranslation('analysis_card_overall_total_label', language);
    const expandLabel = getTranslation('analysis_card_expand', language);
    const collapseLabel = getTranslation('analysis_card_collapse', language);
    const generatedInLabel = showLanguageBadge
        ? getTranslation('summary_generated_in', language, { language: summary?.language ?? 'English' })
        : null;
    const scopeLabel = useMemo(() => {
        if (topN) {
            return getTranslation('analysis_card_scope_top_n', language, { count: String(topN) });
        }
        return getTranslation('analysis_card_scope_full', language);
    }, [language, topN]);
    const filterLabel = useMemo(() => {
        if (!filter || !filter.column || filter.values.length === 0) return null;
        const values = filter.values.map(value => normalizeCategoryLabel(value)).join(', ');
        return getTranslation('analysis_card_scope_filter', language, { column: filter.column, values });
    }, [filter, language]);
    const formatSummaryMeasure = plan.aggregation === 'count'
        ? formatAnalysisValue
        : formatAnalysisMeasureValue;
    const hasFoldedGroups = topN !== null && displayedRowCount < totalRowCount;
    const showsHiddenOthers = hasAdditiveMeasure && hasFoldedGroups && hideOthers;
    const previewLines = useMemo(() => {
        const lines = [
            hasAdditiveMeasure
                ? getTranslation('analysis_card_view_line_scope', language, {
                    visible: displayedRowCount.toLocaleString(),
                    total: totalRowCount.toLocaleString(),
                    shown: formatSummaryMeasure(totalValue),
                    overall: formatSummaryMeasure(overallTotalValue),
                })
                : getTranslation(plan.aggregation
                    ? 'analysis_card_view_line_scope_non_additive'
                    : 'analysis_card_view_line_scope_unknown', language, {
                    visible: displayedRowCount.toLocaleString(),
                    total: totalRowCount.toLocaleString(),
                }),
            getTranslation('analysis_card_view_line_metric', language, {
                metric: displayedMetricLabel,
                dimension: displayedGroupLabel,
            }),
        ];

        if (topN || hiddenLabelCount > 0 || filterLabel) {
            const params = {
                scope: scopeLabel,
                hidden: hiddenLabelCount > 0
                    ? getTranslation('analysis_card_scope_hidden_count', language, { count: String(hiddenLabelCount) })
                    : getTranslation('analysis_card_scope_no_hidden', language),
            };
            lines.push(hasAdditiveMeasure && hasFoldedGroups
                ? getTranslation('analysis_card_view_line_focus', language, {
                    ...params,
                    others: hideOthers ? getTranslation('analysis_card_scope_hide_others', language) : getTranslation('analysis_card_scope_include_others', language),
                })
                : getTranslation('analysis_card_view_line_focus_non_additive', language, params));
        } else {
            lines.push(getTranslation(plan.artifactMetadata?.hideChartByDefault
                ? 'analysis_card_view_line_ready_table_only'
                : hasAdditiveMeasure
                    ? 'analysis_card_view_line_ready'
                    : 'analysis_card_view_line_ready_non_additive', language));
        }

        return lines;
    }, [
        displayedGroupLabel,
        displayedMetricLabel,
        displayedRowCount,
        filterLabel,
        hiddenLabelCount,
        hideOthers,
        hasAdditiveMeasure,
        hasFoldedGroups,
        language,
        overallTotalValue,
        plan.aggregation,
        plan.artifactMetadata?.hideChartByDefault,
        scopeLabel,
        topN,
        totalRowCount,
        totalValue,
        formatSummaryMeasure,
    ]);
    const qualityLines = useMemo(() => {
        if (!pivotQualitySummary) {
            return [];
        }

        const lines: string[] = [];
        if (pivotQualitySummary.labelNormalizationAppliedClusters > 0) {
            lines.push(getTranslation('analysis_card_pivot_quality_label_normalized', language, {
                clusters: pivotQualitySummary.labelNormalizationAppliedClusters.toLocaleString(),
                columns: pivotQualitySummary.labelNormalizationAppliedColumns.toLocaleString(),
                replacements: pivotQualitySummary.labelNormalizationAppliedReplacements.toLocaleString(),
            }));
        }
        if (pivotQualitySummary.labelNormalizationDeferredSuggestions > 0) {
            lines.push(getTranslation('analysis_card_pivot_quality_label_deferred', language, {
                count: pivotQualitySummary.labelNormalizationDeferredSuggestions.toLocaleString(),
            }));
        }
        if (pivotQualitySummary.unknownCount > 0 || pivotQualitySummary.zeroCount > 0 || pivotQualitySummary.negativeCount > 0) {
            lines.push(getTranslation('analysis_card_pivot_quality_counts', language, {
                unknown: pivotQualitySummary.unknownCount.toLocaleString(),
                zero: pivotQualitySummary.zeroCount.toLocaleString(),
                negative: pivotQualitySummary.negativeCount.toLocaleString(),
            }));
        }
        if (pivotQualitySummary.omittedRowCount > 0) {
            lines.push(getTranslation('analysis_card_pivot_quality_focus', language, {
                visible: displayedRowCount.toLocaleString(),
                omitted: pivotQualitySummary.omittedRowCount.toLocaleString(),
            }));
        }
        if (pivotQualitySummary.hiddenZeroRowCount > 0) {
            lines.push(getTranslation('analysis_card_pivot_quality_zero_hidden', language, {
                count: pivotQualitySummary.hiddenZeroRowCount.toLocaleString(),
            }));
        }
        if (
            pivotQualitySummary.defaultCompressedStackedView
            && !pivotQualitySummary.isStackedChartActive
            && pivotQualitySummary.foldedMatrixValueColumnCount > 0
            && pivotQualitySummary.visibleMatrixValueColumnCount > 0
            && pivotQualitySummary.effectiveMatrixValueColumnCount > 0
        ) {
            lines.push(getTranslation('analysis_card_pivot_quality_wide_columns', language, {
                visible: pivotQualitySummary.visibleMatrixValueColumnCount.toLocaleString(),
                folded: pivotQualitySummary.foldedMatrixValueColumnCount.toLocaleString(),
            }));
        }
        if (
            pivotQualitySummary.isStackedChartActive
            && pivotQualitySummary.foldedMatrixValueColumnCount > 0
            && pivotQualitySummary.visibleMatrixValueColumnCount > 0
        ) {
            lines.push(getTranslation('analysis_card_pivot_quality_column_focus', language, {
                visible: pivotQualitySummary.visibleMatrixValueColumnCount.toLocaleString(),
                folded: pivotQualitySummary.foldedMatrixValueColumnCount.toLocaleString(),
            }));
        }

        return lines;
    }, [displayedRowCount, language, pivotQualitySummary]);

    return (
        <div>
            <div className="rounded-card border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{summaryTitle}</p>
                        {visuallyGrounded && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                {getTranslation('analysis_card_visual_badge', language)}
                            </span>
                        )}
                        {generatedInLabel && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {generatedInLabel}
                            </span>
                        )}
                    </div>
                    {plan.aggregation === 'sum' && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <p>
                                {showingLabel}: <span className="font-bold text-base text-slate-800">{formatSummaryMeasure(totalValue)}</span>
                            </p>
                            <p>
                                {overallLabel}: <span className="font-semibold text-slate-700">{formatSummaryMeasure(overallTotalValue)}</span>
                            </p>
                        </div>
                    )}
                </div>
                <div className="mb-2 flex flex-wrap gap-2" data-export-exclude>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                        {scopeLabel}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                        {displayedMetricLabel}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                        {displayedGroupLabel}
                    </span>
                    {showsHiddenOthers && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                            {getTranslation('analysis_card_scope_hide_others', language)}
                        </span>
                    )}
                    {filterLabel && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                            {filterLabel}
                        </span>
                    )}
                </div>

                <div className="space-y-1 text-slate-800">
                    {previewLines.map((line, index) => (
                        <p key={`summary-preview-${index}`} className="leading-relaxed">
                            {line}
                        </p>
                    ))}
                </div>
                {qualityLines.length > 0 && (
                    <div className="mt-3 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <p className="font-semibold">{getTranslation('analysis_card_quality_title', language)}</p>
                        <div className="mt-1 space-y-1">
                            {qualityLines.map((line, index) => (
                                <p key={`quality-line-${index}`} className="leading-relaxed">
                                    {line}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {!primarySummary ? (
                    <p className="mt-3 text-slate-500">{summaryPlaceholder}</p>
                ) : isExpanded ? (
                    <div id={`narrative-${cardId}`} className="mt-4 border-t border-slate-200 pt-4">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {getTranslation('analysis_card_ai_narrative_label', language)}
                        </p>
                        <div className="prose prose-sm text-slate-800 max-w-none">
                            <MarkdownRenderer content={primarySummary} compact={true} />
                        </div>
                    </div>
                ) : null}
                {hasExpandableContent && (
                    <button
                        type="button"
                        className="mt-3 min-h-[44px] text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 md:min-h-0"
                        onClick={() => setIsExpanded(previous => !previous)}
                        aria-expanded={isExpanded}
                        data-export-exclude
                    >
                        {isExpanded ? collapseLabel : expandLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

export const AnalysisCardSummary = React.memo(AnalysisCardSummaryComponent);
