import React from 'react';
import { AnalysisCardData, ChartType } from '../types';
import { AnalysisCard } from './AnalysisCard';
import { FinalSummary } from './FinalSummary';


interface AnalysisPanelProps {
    cards: AnalysisCardData[];
    finalSummary: string | null;
    onChartTypeChange: (cardId: string, newType: ChartType) => void;
    onToggleDataVisibility: (cardId: string) => void;
    onTopNChange: (cardId: string, topN: number | null) => void;
    onHideOthersChange: (cardId: string, hide: boolean) => void;
    onToggleLegendLabel: (cardId: string, label: string) => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ cards, finalSummary, onChartTypeChange, onToggleDataVisibility, onTopNChange, onHideOthersChange, onToggleLegendLabel }) => {
    if (cards.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                 <div className="text-center p-4">
                    <p className="text-slate-500">Your analysis results will appear here.</p>
                    <p className="text-slate-400 text-sm mt-2">The AI is generating the initial analysis...</p>
                 </div>
            </div>
        );
    }

    return (
        <div className="p-1">
            {finalSummary && <FinalSummary summary={finalSummary} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 mt-6">
                {cards.map((card) => (
                    <AnalysisCard 
                        key={card.id} 
                        cardData={card} 
                        onChartTypeChange={onChartTypeChange}
                        onToggleDataVisibility={onToggleDataVisibility}
                        onTopNChange={onTopNChange}
                        onHideOthersChange={onHideOthersChange}
                        onToggleLegendLabel={onToggleLegendLabel}
                    />
                ))}
            </div>
        </div>
    );
};