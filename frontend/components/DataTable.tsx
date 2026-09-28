
import React from 'react';
import { AnalysisPlan, CsvRow } from '../types';
import { coerceNumericValue, formatAnalysisCellValue, formatAnalysisMeasureValue, getAnalysisColumnLabels, getNumericColumns, normalizeCategoryLabel } from '../utils/analysisCardPresentation';
import { collectOrderedColumnNames } from '../services/data/columnRegistry';
import { getTranslation } from '../utils/localization';
import { useAppStore } from '../store/useAppStore';

export interface TableSortState {
    column: string;
    direction: 'asc' | 'desc';
}

interface DataTableProps {
    data: CsvRow[];
    plan?: Pick<AnalysisPlan, 'title' | 'description' | 'groupByColumn' | 'valueColumn'>;
    displayColumnLabels?: Record<string, string>;
    sort?: TableSortState | null;
    onSortChange?: (sort: TableSortState | null) => void;
}

const SortIndicator: React.FC<{ column: string; sort: TableSortState | null }> = ({ column, sort }) => {
    if (!sort || sort.column !== column) {
        return <span className="ml-1 text-slate-300 opacity-0 group-hover/th:opacity-100 transition-opacity">⇅</span>;
    }
    return <span className="ml-1 text-blue-500">{sort.direction === 'asc' ? '▲' : '▼'}</span>;
};

const DataTableComponent: React.FC<DataTableProps> = ({ data, plan, displayColumnLabels, sort, onSortChange }) => {
    const language = useAppStore(state => state.settings.language);
    if (!data || data.length === 0) {
        return <p className="text-slate-500">{getTranslation('table_no_data', language)}</p>;
    }

    const headers = collectOrderedColumnNames(data);
    const rawNumericColumns = getNumericColumns(data, headers);
    // Exclude GROUP BY columns from numeric formatting — they are identifiers, not measures
    const groupByCol = plan?.groupByColumn;
    const numericColumns = new Set(
        groupByCol ? rawNumericColumns.filter(c => c !== groupByCol) : rawNumericColumns,
    );
    const columnLabels = {
        ...getAnalysisColumnLabels(headers, plan),
        ...(displayColumnLabels ?? {}),
    };

    const handleHeaderClick = (header: string) => {
        if (!onSortChange) return;
        if (sort?.column === header) {
            // Cycle: asc → desc → clear
            if (sort.direction === 'asc') {
                onSortChange({ column: header, direction: 'desc' });
            } else {
                onSortChange(null);
            }
        } else {
            onSortChange({ column: header, direction: 'asc' });
        }
    };

    return (
        <div className="w-full min-w-max text-sm">
            <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                    <tr>
                        {headers.map(header => (
                            <th
                                key={header}
                                className={`p-2 font-semibold select-none ${numericColumns.has(header) ? 'text-right tabular-nums' : 'min-w-[14rem]'} ${onSortChange ? 'cursor-pointer hover:bg-slate-200/70 group/th transition-colors' : ''}`}
                                onClick={() => handleHeaderClick(header)}
                                title={onSortChange ? getTranslation('table_sort_column', language, { column: columnLabels[header] ?? header }) : undefined}
                            >
                                <span className="inline-flex items-center gap-0.5">
                                    {columnLabels[header] ?? header}
                                    {onSortChange && <SortIndicator column={header} sort={sort ?? null} />}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {data.map((row, rowIndex) => {
                        // Special rendering for separator rows in diagnostic cards
                        if (row.Column === '---SEPARATOR---') {
                            return (
                                <tr key={`sep-${rowIndex}`}>
                                    <td colSpan={headers.length} className="py-2 px-2">
                                        <div className="w-full h-px bg-slate-200" />
                                    </td>
                                </tr>
                            );
                        }

                        return (
                            <tr key={rowIndex} className="border-b border-slate-200 last:border-b-0">
                                {headers.map(header => {
                                    const displayValue = numericColumns.has(header)
                                        ? formatAnalysisMeasureValue(
                                            row[header],
                                            /(^|_)count($|_)/i.test(header) && Number.isInteger(coerceNumericValue(row[header])) ? 0 : 2,
                                        )
                                        : formatAnalysisCellValue(header, row[header]);

                                    return (
                                        <td
                                            key={`${rowIndex}-${header}`}
                                            className={`p-2 text-slate-700 align-top ${numericColumns.has(header) ? 'text-right tabular-nums whitespace-nowrap' : 'max-w-[24rem] break-words'}`}
                                            title={displayValue || normalizeCategoryLabel(row[header])}
                                        >
                                            {displayValue || normalizeCategoryLabel(row[header])}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export const DataTable = React.memo(DataTableComponent);
