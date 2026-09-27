
import { CsvData, CsvRow, AnalysisPlan } from '../../../../types';
import { robustParseFloat } from '../../../data/dataProfiler';
import { getValueCaseInsensitive } from './aggregationHelpers';

/**
 * Handles non-aggregating "plans", such as scatter plots.
 * @param data The source CsvData.
 * @param plan The plan describing the view to create.
 * @returns The processed data as an array of CsvRow.
 */
export const executeNonAggregatingPlan = (data: CsvData, plan: AnalysisPlan): CsvRow[] => {
    let dataToProcess = data.data;

    if (plan.chartType === 'scatter') {
        const { xValueColumn, yValueColumn } = plan;
        if (!xValueColumn || !yValueColumn) throw new Error("Scatter plot plan is missing x/y columns.");
        return dataToProcess
            .map(row => ({
                [xValueColumn]: robustParseFloat(getValueCaseInsensitive(row, xValueColumn)),
                [yValueColumn]: robustParseFloat(getValueCaseInsensitive(row, yValueColumn)),
            }))
            .filter(p => getValueCaseInsensitive(p, xValueColumn) !== null && getValueCaseInsensitive(p, yValueColumn) !== null) as CsvRow[];
    }
    
    if (plan.chartType === 'bubble') {
        const { xValueColumn, yValueColumn, valueColumn } = plan;
        if (!xValueColumn || !yValueColumn || !valueColumn) throw new Error("Bubble chart plan is missing x, y, or value columns for radius.");
        
        // FIX: Wrapped the chained expression in parentheses to resolve a TypeScript parsing error
        // where the 'as' keyword on a new line was causing an issue with automatic semicolon insertion.
        // Also added a type predicate to the filter to ensure type safety.
        return (dataToProcess
            .map(row => ({
                x: robustParseFloat(getValueCaseInsensitive(row, xValueColumn)),
                y: robustParseFloat(getValueCaseInsensitive(row, yValueColumn)),
                r: robustParseFloat(getValueCaseInsensitive(row, valueColumn)),
            }))
            .filter((p): p is { x: number; y: number; r: number } => p.x !== null && p.y !== null && p.r !== null && p.r > 0)
            .map(p => ({...p, r: Math.max(3, Math.min(50, p.r / 10))})) // Normalize radius for better visualization
        ) as CsvRow[];
    }
    
    return [];
}
