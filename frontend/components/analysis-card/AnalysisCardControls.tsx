
import React from 'react';
import { AnalysisPlan, ChartType, CsvRow } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

interface AnalysisCardControlsProps {
    cardId: string;
    isDataVisible: boolean;
    plan: AnalysisPlan;
    aggregatedData: CsvRow[];
    availableChartTypes: ChartType[];
    displayChartType: ChartType;
    topN: number | null;
    hideOthers: boolean;
    hideZeroValueRows: boolean;
    zeroValueRowCount: number;
    pivotColumnTopN: number | null;
    pivotHideOtherColumns: boolean;
    pivotFoldedColumnCount: number;
    showPivotColumnControls: boolean;
    onToggleDataVisibility: () => void;
    onChartTypeSelect: (type: ChartType) => void;
    onTopNChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onHideOthersChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onHideZeroValueRowsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onPivotColumnTopNChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onPivotHideOtherColumnsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    showDataLabels?: boolean;
    onToggleDataLabels?: () => void;
}

const AnalysisCardControlsComponent: React.FC<AnalysisCardControlsProps> = ({
    cardId,
    isDataVisible,
    plan,
    aggregatedData,
    availableChartTypes,
    displayChartType,
    topN,
    hideOthers,
    hideZeroValueRows,
    zeroValueRowCount,
    pivotColumnTopN,
    pivotHideOtherColumns,
    pivotFoldedColumnCount,
    showPivotColumnControls,
    onToggleDataVisibility,
    onChartTypeSelect,
    onTopNChange,
    onHideOthersChange,
    onHideZeroValueRowsChange,
    onPivotColumnTopNChange,
    onPivotHideOtherColumnsChange,
    showDataLabels,
    onToggleDataLabels,
}) => {
    const language = useAppStore(state => state.settings.language);
    const t = (key: string, params?: Record<string, string | number>) => getTranslation(key, language, params);

    return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-slate-200 bg-slate-50/80 px-3 py-2" data-export-exclude>
        <div>
            <button onClick={onToggleDataVisibility} className="min-h-[44px] text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline md:min-h-0">
                {isDataVisible ? t('card_controls_hide_table') : t('card_controls_show_table')}
            </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
            {plan.artifactType === 'pivot_matrix' && availableChartTypes.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">{t('card_controls_pivot_chart')}</span>
                    {availableChartTypes.map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => onChartTypeSelect(type)}
                            aria-pressed={displayChartType === type}
                            className={`min-h-[44px] min-w-[44px] rounded-full px-2.5 py-1 text-xs font-medium transition-colors md:min-h-0 md:min-w-0 ${
                                displayChartType === type
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                            }`}
                        >
                            {t(`chart_type_${type}`)}
                        </button>
                    ))}
                </div>
            )}
            {!plan.disableTopNControls && plan.chartType !== 'scatter' && aggregatedData.length > 5 && (
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`top-n-${cardId}`} className="text-xs font-semibold text-slate-500">{t('card_controls_show_label')}</label>
                    <select
                        id={`top-n-${cardId}`}
                        value={topN || 'all'}
                        onChange={onTopNChange}
                        className="min-h-[44px] bg-white border border-slate-300 text-slate-800 text-xs rounded-card py-1.5 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-h-0"
                        aria-label={t('card_controls_visible_categories')}
                    >
                        <option value="all">{t('card_controls_all')}</option>
                        <option value="5">{t('card_controls_top_n', { n: 5 })}</option>
                        <option value="8">{t('card_controls_top_n', { n: 8 })}</option>
                        <option value="10">{t('card_controls_top_n', { n: 10 })}</option>
                        <option value="15">{t('card_controls_top_n', { n: 15 })}</option>
                        <option value="20">{t('card_controls_top_n', { n: 20 })}</option>
                    </select>
                    {topN && (
                        <div className="flex items-center">
                            <label htmlFor={`hide-others-${cardId}`} className="flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0">
                                <input
                                    type="checkbox"
                                    id={`hide-others-${cardId}`}
                                    checked={hideOthers}
                                    onChange={onHideOthersChange}
                                    className="bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
                                />
                                <span>{t('card_controls_hide_others')}</span>
                            </label>
                        </div>
                    )}
                </div>
            )}
            {showPivotColumnControls && (
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`pivot-column-top-n-${cardId}`} className="text-xs font-semibold text-slate-500">{t('card_controls_show_columns')}</label>
                    <select
                        id={`pivot-column-top-n-${cardId}`}
                        value={pivotColumnTopN || 'all'}
                        onChange={onPivotColumnTopNChange}
                        className="min-h-[44px] bg-white border border-slate-300 text-slate-800 text-xs rounded-card py-1.5 px-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-h-0"
                        aria-label={t('card_controls_visible_pivot_columns')}
                    >
                        <option value="all">{t('card_controls_all')}</option>
                        <option value="5">{t('card_controls_top_n', { n: 5 })}</option>
                        <option value="8">{t('card_controls_top_n', { n: 8 })}</option>
                        <option value="10">{t('card_controls_top_n', { n: 10 })}</option>
                    </select>
                    {pivotColumnTopN && (pivotFoldedColumnCount > 0 || pivotHideOtherColumns) && (
                        <div className="flex items-center">
                            <label htmlFor={`hide-pivot-column-others-${cardId}`} className="flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0">
                                <input
                                    type="checkbox"
                                    id={`hide-pivot-column-others-${cardId}`}
                                    checked={pivotHideOtherColumns}
                                    onChange={onPivotHideOtherColumnsChange}
                                    className="bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
                                />
                                <span>{t('card_controls_hide_column_others')}</span>
                            </label>
                        </div>
                    )}
                </div>
            )}
            {plan.artifactType === 'pivot_matrix' && (zeroValueRowCount > 0 || hideZeroValueRows) && (
                <div className="flex items-center">
                    <label htmlFor={`hide-zero-rows-${cardId}`} className="flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0">
                        <input
                            type="checkbox"
                            id={`hide-zero-rows-${cardId}`}
                            checked={hideZeroValueRows}
                            onChange={onHideZeroValueRowsChange}
                            className="bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
                        />
                        <span>{t('card_controls_hide_zero_rows')}</span>
                    </label>
                </div>
            )}
            {onToggleDataLabels && (
                <div className="flex items-center">
                    <label htmlFor={`data-labels-${cardId}`} className="flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-slate-500 md:min-h-0">
                        <input
                            type="checkbox"
                            id={`data-labels-${cardId}`}
                            checked={Boolean(showDataLabels)}
                            onChange={onToggleDataLabels}
                            className="bg-slate-100 border-slate-300 rounded focus:ring-blue-500 text-blue-600 h-4 w-4"
                        />
                        <span>{t('card_controls_labels')}</span>
                    </label>
                </div>
            )}
            </div>
    </div>
    );
};

export const AnalysisCardControls = React.memo(AnalysisCardControlsComponent);
