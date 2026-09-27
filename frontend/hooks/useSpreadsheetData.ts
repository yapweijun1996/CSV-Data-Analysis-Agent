import { useMemo } from 'react';
import { CsvData, CsvRow, DataOperation } from '../types';
import { applySpreadsheetFilterOperation } from '../services/agent/execution/dataOperationRunner';

export const useSpreadsheetData = (
    csvData: CsvData | null,
    filterText: string,
    spreadsheetFilterFunction: DataOperation | null
) => {
    return useMemo(() => {
        if (!csvData) return [];

        // PERF-103: Avoid copying the entire array when no filter is active.
        // Only allocate a new array when filtering actually runs.
        if (spreadsheetFilterFunction) {
            try {
                return applySpreadsheetFilterOperation([...csvData.data], spreadsheetFilterFunction).data;
            } catch (error) {
                console.error("AI filter execution failed:", error);
                return csvData.data;
            }
        }

        if (filterText) {
            const lowercasedFilter = filterText.toLowerCase();
            return csvData.data.filter(row =>
                Object.values(row).some(value =>
                    String(value).toLowerCase().includes(lowercasedFilter)
                )
            );
        }

        return csvData.data;
    }, [csvData, filterText, spreadsheetFilterFunction]);
};
