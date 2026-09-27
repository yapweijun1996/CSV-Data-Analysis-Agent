import React from 'react';
import { formatAnalysisValue } from '../../utils/analysisCardPresentation';
import type { CsvCellValue } from '../../types';

interface CompactCardSummaryProps {
    displayedTotalValue: CsvCellValue;
    displayedRowCount: number;
    totalRowCount: number;
    summaryText: string | null;
    aggregation?: string;
    valueColumn?: string;
    onExpand: () => void;
    language: string;
}

const stripMarkdown = (text: string): string =>
    text.replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim();

export const CompactCardSummary: React.FC<CompactCardSummaryProps> = ({
    displayedTotalValue,
    displayedRowCount,
    totalRowCount,
    summaryText,
    aggregation,
    valueColumn,
    onExpand,
}) => {
    const showMetric = aggregation && (aggregation === 'sum' || aggregation === 'count' || aggregation === 'average');
    const metricLabel = showMetric
        ? `${aggregation === 'count' ? 'COUNT' : aggregation === 'average' ? 'AVG' : 'SUM'}${valueColumn ? ` ${valueColumn}` : ''}`
        : null;
    const truncatedSummary = summaryText
        ? (() => { const clean = stripMarkdown(summaryText); return clean.length > 80 ? clean.slice(0, 80) + '…' : clean; })()
        : null;

    return (
        <div
            onClick={onExpand}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(); } }}
            className="flex cursor-pointer items-center gap-3 rounded-md border-t border-slate-100 px-1 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50"
        >
            {showMetric && (
                <>
                    <span className="shrink-0 font-semibold text-slate-700" title={metricLabel ?? undefined}>
                        {formatAnalysisValue(displayedTotalValue)}
                    </span>
                    <span className="text-slate-200">|</span>
                </>
            )}
            <span className="shrink-0 text-xs">
                {displayedRowCount} / {totalRowCount} rows
            </span>
            {truncatedSummary && (
                <>
                    <span className="text-slate-200">|</span>
                    <span className="min-w-0 truncate text-xs text-slate-400">
                        {truncatedSummary}
                    </span>
                </>
            )}
        </div>
    );
};
