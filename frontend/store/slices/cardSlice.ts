import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { ChartType, LocalizedText } from '../../types';
import { navigateToCard } from '../../utils/cardNavigation';
import { createChatMessage } from '../../utils/messageState';
import { invalidateChart } from '../../utils/chartCache';

export interface ICardSlice {
    handleChartTypeChange: (cardId: string, newType: ChartType) => void;
    updateCardVisualSummary: (cardId: string, visualSummary: LocalizedText) => void;
    handleToggleDataVisibility: (cardId: string) => void;
    handleTopNChange: (cardId: string, topN: number | null) => void;
    handleHideOthersChange: (cardId: string, hide: boolean) => void;
    handleHideZeroValueRowsChange: (cardId: string, hide: boolean) => void;
    handlePivotColumnTopNChange: (cardId: string, topN: number | null) => void;
    handlePivotHideOtherColumnsChange: (cardId: string, hide: boolean) => void;
    handleTogglePivotSeriesLabel: (cardId: string, label: string) => void;
    handleResetPivotSeriesLabels: (cardId: string) => void;
    handleToggleLegendLabel: (cardId: string, label: string) => void;
    handleToggleDataLabels: (cardId: string) => void;
    handleTableSortChange: (cardId: string, sort: { column: string; direction: 'asc' | 'desc' } | null) => void;
    handleShowCardFromChat: (cardId: string) => void;
    deleteAnalysisCard: (cardId: string) => void;
    addCalculatedColumnToCard: (cardId: string, newColumnName: string, formula: string, updateChart?: { useAs: 'primaryY' | 'secondaryY'; newChartType?: ChartType }) => void;
    updateCardVisualEvaluation: (cardId: string, evaluation: { quality: 'good' | 'acceptable' | 'poor'; suggestedChartType?: ChartType; reason?: string }, correctedChartType?: ChartType) => void;
}

export const createCardSlice: StateCreator<AppStore, [], [], ICardSlice> = (set, get) => ({
    updateCardVisualSummary: (cardId, visualSummary) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? { ...c, visualSummary, visuallyGrounded: true } : c) })),
    handleChartTypeChange: (cardId, newType) => { invalidateChart(cardId); set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, displayChartType: newType} : c) })); },
    updateCardVisualEvaluation: (cardId, evaluation, correctedChartType) => set(state => ({
        analysisCards: state.analysisCards.map(c => {
            if (c.id !== cardId) return c;
            if (correctedChartType) {
                return {
                    ...c,
                    visualEvaluation: evaluation,
                    visuallyEvaluated: true,
                    displayChartType: correctedChartType,
                    plan: { ...c.plan, chartType: correctedChartType },
                    visuallyGrounded: false, // reset so visual summary re-fires for corrected chart
                };
            }
            return { ...c, visualEvaluation: evaluation, visuallyEvaluated: true };
        }),
    })),
    handleToggleDataVisibility: (cardId) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, isDataVisible: !c.isDataVisible} : c) })),
    handleTopNChange: (cardId, topN) => { invalidateChart(cardId); set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, topN: topN} : c) })); },
    handleHideOthersChange: (cardId, hide) => { invalidateChart(cardId); set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, hideOthers: hide} : c) })); },
    handleHideZeroValueRowsChange: (cardId, hide) => { invalidateChart(cardId); set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, hideZeroValueRows: hide} : c) })); },
    handlePivotColumnTopNChange: (cardId, topN) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, pivotColumnTopN: topN} : c) })),
    handlePivotHideOtherColumnsChange: (cardId, hide) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, pivotHideOtherColumns: hide} : c) })),
    handleTogglePivotSeriesLabel: (cardId, label) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => {
                if (c.id === cardId) {
                    const currentHidden = c.hiddenPivotSeriesLabels || [];
                    const newHidden = currentHidden.includes(label) ? currentHidden.filter(l => l !== label) : [...currentHidden, label];
                    return { ...c, hiddenPivotSeriesLabels: newHidden };
                }
                return c;
            })
        }));
    },
    handleResetPivotSeriesLabels: (cardId) => set(state => ({
        analysisCards: state.analysisCards.map(c => c.id === cardId ? { ...c, hiddenPivotSeriesLabels: [] } : c),
    })),
    handleToggleLegendLabel: (cardId, label) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => {
                if (c.id === cardId) {
                    const currentHidden = c.hiddenLabels || [];
                    const newHidden = currentHidden.includes(label) ? currentHidden.filter(l => l !== label) : [...currentHidden, label];
                    return { ...c, hiddenLabels: newHidden };
                }
                return c;
            })
        }));
    },
    handleToggleDataLabels: (cardId) => { invalidateChart(cardId); set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, showDataLabels: !c.showDataLabels} : c) })); },
    handleTableSortChange: (cardId, sort) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? { ...c, tableSort: sort } : c) })),
    handleShowCardFromChat: (cardId) => {
        navigateToCard(cardId);
    },
    deleteAnalysisCard: (cardId) => {
        const card = get().analysisCards.find(item => item.id === cardId);
        if (!card) return;
        invalidateChart(cardId);
        void import('../../services/agent/memory/vectorMemorySync').then(m =>
            m.removeCardMemoryDocument({ getState: get as never, setState: set as never }, cardId),
        );
        get().addProgress?.(`Removed card "${card.plan.title}".`);
        get().logAgentToolUsage?.({
            tool: 'card.delete',
            description: `Removed card "${card.plan.title}"`,
            detail: { cardId: card.id, title: card.plan.title },
        });
        set(state => ({
            analysisCards: state.analysisCards.filter(item => item.id !== cardId),
            finalSummary: null,
            finalSummaryProvenance: null,
            aiCoreAnalysisSummary: null,
            aiCoreAnalysisSummaryProvenance: null,
            cardEnhancementSuggestions: state.cardEnhancementSuggestions.filter(suggestion => suggestion.cardId !== cardId),
            chatHistory: [
                ...state.chatHistory,
                createChatMessage({
                    sender: 'ai',
                    text: `Deleted card **${card.plan.title}**.`,
                    timestamp: new Date(),
                    type: 'ai_message',
                }),
            ],
        }));
    },
    addCalculatedColumnToCard: (cardId, newColumnName, formula, updateChart) => {
        let didUpdate = false;
        set(state => {
        const cardIndex = state.analysisCards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) {
            console.error(`addCalculatedColumnToCard: Card with ID "${cardId}" not found.`);
            return {};
        }

        const card = state.analysisCards[cardIndex];
        const { aggregatedData } = card;
        if (!aggregatedData || aggregatedData.length === 0) {
            console.error(`addCalculatedColumnToCard: Card with ID "${cardId}" has no data.`);
            return {};
        }

        try {
            const columnNames = Object.keys(aggregatedData[0]);
            const columnSet = new Set(columnNames);

            // Replace column references in the formula with safe row accessors, keeping operators untouched.
            const tokens = formula.split(/([+\-*/\(\)\s])/).filter(t => t.trim() !== '');

            const safeTokens = tokens.map(token => {
                const cleanToken = token.replace(/^['"]|['"]$/g, '');
                if (columnSet.has(cleanToken)) {
                    return `row['${cleanToken}']`;
                }
                return token;
            });

            const code = `return ${safeTokens.join('')}`;
            const calcFunction = new Function('row', code);

            const newData = aggregatedData.map(row => {
                try {
                    const value = calcFunction(row);
                    const finalValue = typeof value === 'number' && isFinite(value) ? value : null;
                    return { ...row, [newColumnName]: finalValue };
                } catch (e) {
                    console.error(`Error calculating column '${newColumnName}' for row:`, row, e);
                    return { ...row, [newColumnName]: null };
                }
            });

            const numericCount = newData.filter(row => typeof row[newColumnName] === 'number' && isFinite(row[newColumnName] as number)).length;
            if (numericCount === 0) {
                console.warn(`addCalculatedColumnToCard: Formula "${formula}" for "${newColumnName}" produced no numeric values.`);
                get().addProgress?.(`Skipped "${newColumnName}" because the formula produced no numeric values.`, 'error');
                return {};
            }

            const newCards = [...state.analysisCards];
            const newCard = { ...card, aggregatedData: newData };

            if (updateChart) {
                const newPlan = { ...newCard.plan };
                if (updateChart.useAs === 'primaryY') {
                    newPlan.valueColumn = newColumnName;
                } else if (updateChart.useAs === 'secondaryY') {
                    newPlan.secondaryValueColumn = newColumnName;
                    if (updateChart.newChartType === 'combo' && !newPlan.secondaryAggregation) {
                        newPlan.secondaryAggregation = 'sum';
                    }
                }
                if (updateChart.newChartType) {
                    newCard.displayChartType = updateChart.newChartType;
                }
                newCard.plan = newPlan;
            } else {
                const newPlan = { ...newCard.plan, valueColumn: newColumnName };
                if (newPlan.chartType === 'scatter') {
                    newPlan.chartType = 'bar';
                    newCard.displayChartType = 'bar';
                }
                newCard.plan = newPlan;
            }

            newCards[cardIndex] = newCard;
            didUpdate = true;
            return {
                analysisCards: newCards,
                finalSummary: null,
                finalSummaryProvenance: null,
                aiCoreAnalysisSummary: null,
                aiCoreAnalysisSummaryProvenance: null,
            };
        } catch (e) {
            console.error(`Failed to create calculation function for formula: "${formula}"`, e);
            return {};
        }
        });

        if (didUpdate) {
            void import('../../services/agent/memory/vectorMemorySync').then(m =>
                m.upsertCardMemoryDocument({ getState: get as never, setState: set as never }, cardId),
            );
        }
    },
});
