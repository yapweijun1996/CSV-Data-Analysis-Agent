
import { CsvData, CsvRow, AnalysisPlan, ColumnProfile, AggregationType } from '../types';

declare const Papa: any;

// CSV formula injection prevention
const sanitizeValue = (value: string): string => {
    if (typeof value === 'string' && value.startsWith('=')) {
        return `'${value}`;
    }
    return value;
};

const parseNumericValue = (value: any): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') {
        return null;
    }
    const cleanedString = String(value)
        .replace(/[$€,]/g, '')
        .trim();
    
    const num = Number(cleanedString);
    return isNaN(num) ? null : num;
};

const looksLikeDate = (value: any): boolean => {
    if (typeof value !== 'string' || !value) return false;
    // Simple check for common date formats like YYYY-MM-DD, MM/DD/YYYY etc.
    // And ensure it's a valid date parsable by Date constructor.
    return !isNaN(new Date(value).getTime()) && /[0-9]{1,4}[-/][0-9]{1,2}[-/][0-9]{1,4}/.test(value);
};

export const applyTopNWithOthers = (data: CsvRow[], groupByKey: string, valueKey: string, topN: number): CsvRow[] => {
    if (data.length <= topN) {
        return data;
    }

    const sortedData = [...data].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));
    
    const topData = sortedData.slice(0, topN -1);
    const otherData = sortedData.slice(topN -1);

    if (otherData.length > 0) {
        const otherSum = otherData.reduce((acc, row) => acc + (Number(row[valueKey]) || 0), 0);
        const othersRow: CsvRow = {
            [groupByKey]: 'Others',
            [valueKey]: otherSum,
        };
        return [...topData, othersRow];
    }
    
    return topData;
};


// Fix: Changed return type to Promise<CsvData> to include filename along with parsed data.
export const processCsv = (file: File): Promise<CsvData> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            complete: (results: { data: CsvRow[] }) => {
                const sanitizedData = results.data.map(row => {
                    const newRow: CsvRow = {};
                    for (const key in row) {
                        newRow[key] = sanitizeValue(String(row[key]));
                    }
                    return newRow;
                });
                // Fix: Resolve with a CsvData object instead of just the array of rows.
                resolve({ fileName: file.name, data: sanitizedData });
            },
            error: (error: Error) => {
                reject(error);
            },
        });
    });
};

export const profileData = (data: CsvRow[]): ColumnProfile[] => {
    if (!data || data.length === 0) return [];
    const headers = Object.keys(data[0]);
    const profiles: ColumnProfile[] = [];

    for (const header of headers) {
        let isNumerical = true;
        const values = data.map(row => row[header]);
        let numericCount = 0;
        
        for (const value of values) {
            const parsedNum = parseNumericValue(value);
            if (value !== null && String(value).trim() !== '') {
                if (parsedNum === null) {
                    isNumerical = false;
                    break;
                }
                numericCount++;
            }
        }

        if (isNumerical && numericCount > 0) {
            const numericValues = values.map(parseNumericValue).filter((v): v is number => v !== null);
            profiles.push({
                name: header,
                type: 'numerical',
                valueRange: [Math.min(...numericValues), Math.max(...numericValues)],
                missingPercentage: (1 - (numericValues.length / data.length)) * 100,
            });
        } else {
             const uniqueValues = new Set(values.map(String));
             profiles.push({
                name: header,
                type: 'categorical',
                uniqueValues: uniqueValues.size,
                missingPercentage: (values.filter(v => v === null || String(v).trim() === '').length / data.length) * 100
             });
        }
    }
    return profiles;
};

export const executeJavaScriptDataTransform = (data: CsvRow[], jsFunctionBody: string): CsvRow[] => {
    try {
        const transformFunction = new Function('data', jsFunctionBody);
        const result = transformFunction(data);
        
        if (!Array.isArray(result)) {
            console.error("AI-generated transform function returned a non-array value. This is likely due to a missing 'return' statement in the generated code.", {
                returnedValue: result,
                generatedCode: jsFunctionBody
            });
            throw new Error('AI-generated transform function did not return an array.');
        }
        
        if (result.length > 0 && typeof result[0] !== 'object') {
             throw new Error('AI-generated transform function did not return an array of objects.');
        }

        return result as CsvRow[];
    } catch (error) {
        console.error("Error executing AI-generated JavaScript:", error);
        throw new Error(`AI-generated data transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export const executePlan = (data: CsvData, plan: AnalysisPlan): CsvRow[] => {
    // Handle scatter plots separately as they don't aggregate data
    if (plan.chartType === 'scatter') {
        const { xValueColumn, yValueColumn } = plan;
        if (!xValueColumn || !yValueColumn) {
            throw new Error("Scatter plot plan is missing xValueColumn or yValueColumn.");
        }
        return data.data
            .map(row => ({
                [xValueColumn]: parseNumericValue(row[xValueColumn]),
                [yValueColumn]: parseNumericValue(row[yValueColumn]),
            }))
            .filter(p => p[xValueColumn] !== null && p[yValueColumn] !== null) as CsvRow[];
    }

    const { groupByColumn, valueColumn, aggregation } = plan;
    if (!groupByColumn || !aggregation) {
        throw new Error("Analysis plan is missing groupByColumn or aggregation type for non-scatter chart.");
    }


    const groups: { [key: string]: number[] } = {};

    data.data.forEach(row => {
        const groupKey = String(row[groupByColumn]);
        if (groupKey === 'undefined' || groupKey === 'null') return;
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }

        if (valueColumn) {
            const value = parseNumericValue(row[valueColumn]);
            if (value !== null) {
                groups[groupKey].push(value);
            }
        } else if (aggregation === 'count') {
            groups[groupKey].push(1);
        }
    });

    const aggregatedResult: CsvRow[] = [];

    for (const key in groups) {
        const values = groups[key];
        let resultValue: number;

        switch (aggregation) {
            case 'sum':
                resultValue = values.reduce((acc, val) => acc + val, 0);
                break;
            case 'count':
                resultValue = values.length;
                break;
            case 'avg':
                const sum = values.reduce((acc, val) => acc + val, 0);
                resultValue = values.length > 0 ? sum / values.length : 0;
                break;
            default:
                throw new Error(`Unsupported aggregation type: ${aggregation}`);
        }
        
        const finalValueColumn = valueColumn || 'count';

        aggregatedResult.push({
            [groupByColumn]: key,
            [finalValueColumn]: resultValue,
        });
    }
    
    // Intelligent Sorting: If it's a line chart with a date axis, sort chronologically. Otherwise, sort by value.
    if (plan.chartType === 'line' && aggregatedResult.length > 0 && looksLikeDate(aggregatedResult[0][groupByColumn])) {
        return aggregatedResult.sort((a, b) => new Date(String(a[groupByColumn])).getTime() - new Date(String(b[groupByColumn])).getTime());
    } else {
        const finalValueColumn = valueColumn || 'count';
        return aggregatedResult.sort((a, b) => (Number(b[finalValueColumn]) || 0) - (Number(a[finalValueColumn]) || 0));
    }
};