import React, { useMemo, useState } from 'react';
import type { AnalysisPlan, CsvRow } from '../../types';
import { formatAnalysisValue } from '../../utils/analysisCardPresentation';
import { COLORS } from '../../utils/chartConfigs/common';
import { PIVOT_FOLDED_OTHERS_KEY } from '../../utils/pivotMatrixCharting';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

interface PivotStackedLegendProps {
    data: CsvRow[];
    plan: AnalysisPlan;
    hiddenSeriesLabels: string[];
    onSeriesToggle: (label: string) => void;
    onResetHiddenSeries: () => void;
}

const COLLAPSED_LEGEND_ITEMS = 6;

const PivotStackedLegendComponent: React.FC<PivotStackedLegendProps> = ({ data, plan, hiddenSeriesLabels, onSeriesToggle, onResetHiddenSeries }) => {
    const language = useAppStore(state => state.settings.language);
    const t = (key: string, params?: Record<string, string | number>) =>
        getTranslation(key, language, params);
    const [isExpanded, setIsExpanded] = useState(false);
    const [query, setQuery] = useState('');
    const totalKey = plan.valueColumn || 'row_total';
    const matrixValueColumns = plan.artifactMetadata?.matrixValueColumns ?? [];

    const legendItems = useMemo(() => {
        const denominator = matrixValueColumns.reduce((sum, column) => {
            const contribution = data.reduce((columnSum, row) => columnSum + Math.abs(Number(row[column]) || 0), 0);
            return sum + contribution;
        }, 0);

        return matrixValueColumns.map((column, index) => {
            const signedContribution = data.reduce((sum, row) => sum + (Number(row[column]) || 0), 0);
            const absoluteContribution = data.reduce((sum, row) => sum + Math.abs(Number(row[column]) || 0), 0);
            const share = denominator > 0 ? (absoluteContribution / denominator) * 100 : 0;

            return {
                column,
                label: column === PIVOT_FOLDED_OTHERS_KEY
                    ? getTranslation('card_others', language)
                    : column,
                signedContribution,
                absoluteContribution,
                share,
                color: COLORS[index % COLORS.length],
            };
        }).sort((left, right) => {
            if (left.column === PIVOT_FOLDED_OTHERS_KEY) return 1;
            if (right.column === PIVOT_FOLDED_OTHERS_KEY) return -1;
            return right.absoluteContribution - left.absoluteContribution;
        });
    }, [data, language, matrixValueColumns]);

    const filteredLegendItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return legendItems;
        }
        return legendItems.filter(item => item.label.toLowerCase().includes(normalizedQuery));
    }, [legendItems, query]);

    if (legendItems.length === 0) {
        return null;
    }

    const visibleItems = isExpanded ? filteredLegendItems : filteredLegendItems.slice(0, COLLAPSED_LEGEND_ITEMS);
    const totalValue = data.reduce((sum, row) => sum + (Number(row[totalKey]) || 0), 0);

    return (
        <div className="rounded-card border border-slate-200 bg-slate-50/80 p-3" data-export-exclude>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-slate-800">{t('card_series_legend')}</p>
                    <p className="text-xs text-slate-500">{t('card_series_legend_hint')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {hiddenSeriesLabels.length > 0 && (
                        <button
                            type="button"
                            className="min-h-[44px] text-xs font-semibold text-slate-600 transition-colors hover:text-slate-800 md:min-h-0"
                            onClick={onResetHiddenSeries}
                        >
                            {t('card_reset_hidden_series')}
                        </button>
                    )}
                    {filteredLegendItems.length > COLLAPSED_LEGEND_ITEMS && (
                        <button
                            type="button"
                            className="min-h-[44px] text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 md:min-h-0"
                            onClick={() => setIsExpanded(previous => !previous)}
                            aria-expanded={isExpanded}
                        >
                            {isExpanded
                                ? t('card_collapse_legend')
                                : t('card_show_all_legend_items', { count: filteredLegendItems.length })}
                        </button>
                    )}
                </div>
            </div>
            <div className="mb-2">
                <input
                    type="search"
                    name="stacked-legend-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('card_search_legend')}
                    aria-label={t('card_search_legend')}
                    className="min-h-[44px] w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-h-0"
                />
            </div>
            <div className="space-y-1">
                {visibleItems.map(item => (
                    <button
                        key={item.column}
                        type="button"
                        onClick={() => onSeriesToggle(item.column)}
                        className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-card bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-200 transition-colors md:min-h-0 ${
                            hiddenSeriesLabels.includes(item.column) ? 'opacity-50 hover:bg-slate-100' : 'hover:bg-slate-100'
                        }`}
                        title={t('card_toggle_legend_item', {
                            action: t(hiddenSeriesLabels.includes(item.column) ? 'card_action_show' : 'card_action_hide'),
                            label: item.label,
                        })}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ backgroundColor: hiddenSeriesLabels.includes(item.column) ? '#94a3b8' : item.color }} />
                            <span className={`truncate text-xs font-medium ${hiddenSeriesLabels.includes(item.column) ? 'text-slate-400 line-through' : 'text-slate-700'}`} title={item.label}>{item.label}</span>
                        </div>
                        <div className="flex flex-shrink-0 items-baseline gap-2">
                            <span className={`text-xs font-semibold ${hiddenSeriesLabels.includes(item.column) ? 'text-slate-400' : 'text-slate-800'}`}>{formatAnalysisValue(item.signedContribution)}</span>
                            <span className="w-12 text-right text-[11px] text-slate-500">({item.share.toFixed(1)}%)</span>
                        </div>
                    </button>
                ))}
            </div>
            {filteredLegendItems.length === 0 && (
                <div className="rounded-card bg-white px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                    {t('card_no_legend_matches')}
                </div>
            )}
            <div className="mt-2 text-[11px] text-slate-500">
                {t('card_legend_total')} <span className="font-semibold text-slate-700">{formatAnalysisValue(totalValue)}</span>
            </div>
        </div>
    );
};

export const PivotStackedLegend = React.memo(PivotStackedLegendComponent);
