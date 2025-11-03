import React from 'react';

interface FinalSummaryProps {
    summary: string;
}

export const FinalSummary: React.FC<FinalSummaryProps> = ({ summary }) => {
    return (
        <div className="bg-white border border-blue-200 rounded-lg shadow-lg p-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">📊 Overall Insights</h2>
            <p className="text-slate-700 whitespace-pre-wrap">{summary}</p>
        </div>
    );
};