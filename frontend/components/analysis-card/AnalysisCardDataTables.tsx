
import React, { useState } from 'react';
import { AnalysisPlan, CsvRow } from '../../types';
import { DataTable, TableSortState } from '../DataTable';

interface AnalysisCardDataTablesProps {
    isDataVisible: boolean;
    dataForDisplay: CsvRow[];
    selectedIndices: number[];
    plan?: Pick<AnalysisPlan, 'title' | 'description' | 'groupByColumn' | 'valueColumn'>;
    maxHeightClass?: string;
    sort?: TableSortState | null;
    onSortChange?: (sort: TableSortState | null) => void;
}

const AnalysisCardDataTablesComponent: React.FC<AnalysisCardDataTablesProps> = ({
    isDataVisible,
    dataForDisplay,
    selectedIndices,
    plan,
    maxHeightClass = 'max-h-48',
    sort,
    onSortChange,
}) => {
    const [showSelectionDetails, setShowSelectionDetails] = useState(true);
    const selectedData = selectedIndices.map(index => dataForDisplay[index]);

    return (
        <>
            {selectedIndices.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                    <button
                        onClick={() => setShowSelectionDetails(!showSelectionDetails)}
                        className="mb-1 w-full text-left font-semibold text-blue-600"
                        aria-expanded={showSelectionDetails}
                    >
                        {showSelectionDetails ? '▾' : '▸'} Selection Details ({selectedIndices.length} items)
                    </button>
                    {showSelectionDetails && <DataTable data={selectedData} plan={plan} />}
                </div>
            )}

            {isDataVisible && (
                <div className={`overflow-auto border border-slate-200 rounded-card bg-white ${maxHeightClass}`}>
                    <DataTable data={dataForDisplay} plan={plan} sort={sort} onSortChange={onSortChange} />
                </div>
            )}
        </>
    );
};

export const AnalysisCardDataTables = React.memo(AnalysisCardDataTablesComponent);
