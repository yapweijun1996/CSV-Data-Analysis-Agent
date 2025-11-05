import { CsvData, CsvRow, AnalysisPlan, ColumnProfile, AggregationType } from '../types';

declare const Papa: any;

// CSV formula injection prevention
const sanitizeValue = (value: string): string => {
    if (typeof value === 'string' && value.startsWith('=')) {
        return `'${value}`;
    }
    return value;
};

const robustParseFloat = (value: any): number | null => {
    if (value === null || value === undefined) return null;

    let s = String(value).trim();
    if (s === '') return null;

    // 1. Handle parentheses for negative values, e.g., (1,234.56)
    let isNegative = false;
    if (s.startsWith('(') && s.endsWith(')')) {
        s = s.substring(1, s.length - 1);
        isNegative = true;
    }
    
    // 2. Remove common currency symbols and percentage signs
    s = s.replace(/[$\s€£¥%]/g, '');

    // 3. Standardize decimal separator
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    
    if (lastComma > lastDot) {
        // European format: 1.234,56 -> 1234.56
        s = s.replace(/\./g, '').replace(',', '.');
    } else {
        // US format: 1,234.56 -> 1234.56
        s = s.replace(/,/g, '');
    }

    // 4. Parse the cleaned string
    const num = parseFloat(s);

    if (isNaN(num)) {
        return null;
    }

    // 5. Apply negativity if detected from parentheses
    return isNegative ? -num : num;
};


const looksLikeDate = (value: any): boolean => {
    if (typeof value !== 'string' || !value) return false;
    // Simple check for common date formats like YYYY-MM-DD, MM/DD/YYYY etc.
    // And ensure it's a valid date parsable by Date constructor.
    return !isNaN(new Date(value).getTime()) && /[0-9]{1,4}[-/][0-9]{1,2}[-/][0-9]{1,4}/.test(value);
};


const QUARTER_REGEX = /^Q([1-4])(?:\s*\/?\s*('?\d{2,4}))?$/i; // E.g., Q1, Q2 2023, Q3/23, Q4'24

// Case-insensitive month names for robust matching
const MONTHS: { [key: string]: number } = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12
};

const DAYS: { [key: string]: number } = {
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
    'sunday': 7, 'sun': 7
};


const getChronologicalSortValue = (value: string, sorter: 'quarter' | 'month' | 'day'): number => {
    const lowerValue = String(value).toLowerCase().trim();
    switch (sorter) {
        case 'quarter':
            const match = lowerValue.match(QUARTER_REGEX);
            if (match) {
                const quarter = parseInt(match[1], 10);
                let year = 0;
                if (match[2]) {
                    const yearStr = match[2].replace("'", '');
                    year = parseInt(yearStr, 10);
                    if (yearStr.length === 2) {
                        year += (year > 50 ? 1900 : 2000); // Handle '23 -> 2023
                    }
                }
                return year * 10 + quarter;
            }
            return Infinity;
        case 'month':
            return MONTHS[lowerValue] || Infinity;
        case 'day':
            return DAYS[lowerValue] || Infinity;
    }
    return Infinity;
};


const tryChronologicalSort = (data: CsvRow[], key: string): CsvRow[] | null => {
    if (data.length < 2) return data;

    const sampleValues = data.slice(0, 10).map(r => String(r[key]).toLowerCase().trim());
    
    let sorter: 'quarter' | 'month' | 'day' | null = null;

    const quarterMatches = sampleValues.filter(v => QUARTER_REGEX.test(v)).length;
    const monthMatches = sampleValues.filter(v => MONTHS[v] !== undefined).length;
    const dayMatches = sampleValues.filter(v => DAYS[v] !== undefined).length;
    const dateMatches = sampleValues.filter(looksLikeDate).length;

    // Use a simple majority rule on the sample to decide the sort type
    if (quarterMatches / sampleValues.length >= 0.5) sorter = 'quarter';
    else if (monthMatches / sampleValues.length >= 0.5) sorter = 'month';
    else if (dayMatches / sampleValues.length >= 0.5) sorter = 'day';
    else if (dateMatches / sampleValues.length >= 0.5) {
        // Handle standard dates
        return [...data].sort((a, b) => new Date(String(a[key])).getTime() - new Date(String(b[key])).getTime());
    }

    if (sorter) {
        return [...data].sort((a, b) => {
            const valA = getChronologicalSortValue(String(a[key]), sorter as 'quarter'|'month'|'day');
            const valB = getChronologicalSortValue(String(b[key]), sorter as 'quarter'|'month'|'day');
            return valA - valB;
        });
    }

    return null;
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
            header: false, // CRITICAL FIX: Do not assume the first row is a header.
            skipEmptyLines: true,
            worker: true,
            complete: (results: { data: string[][] }) => {
                if (results.data.length === 0) {
                    resolve({ fileName: file.name, data: [] });
                    return;
                }
                
                // Find the maximum number of columns across all rows to create a consistent object structure.
                const maxCols = results.data.reduce((max, row) => Math.max(max, row.length), 0);
                // Create generic headers (e.g., column_1, column_2) for the AI to reference.
                const genericHeaders = Array.from({ length: maxCols }, (_, i) => `column_${i + 1}`);
                
                // Convert the array of arrays into an array of objects with generic keys.
                // This provides a stable structure for the AI to analyze, regardless of the file's header position.
                const objectData = results.data.map(rowArray => {
                    const newRow: CsvRow = {};
                    genericHeaders.forEach((header, index) => {
                        const value = rowArray[index] !== undefined ? rowArray[index] : ''; // Handle jagged rows
                        newRow[header] = sanitizeValue(String(value));
                    });
                    return newRow;
                });

                resolve({ fileName: file.name, data: objectData });
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
            const parsedNum = robustParseFloat(value);
            if (value !== null && String(value).trim() !== '') {
                if (parsedNum === null) {
                    isNumerical = false;
                    break;
                }
                numericCount++;
            }
        }

        if (isNumerical && numericCount > 0) {
            const numericValues = values.map(robustParseFloat).filter((v): v is number => v !== null);
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

/**
 * Splits a string containing multiple numbers, where the numbers themselves may contain commas.
 * E.g., "10,000.00,0.00,-1,234.56" -> ["10,000.00", "0.00", "-1,234.56"]
 * @param input The string to split.
 * @returns An array of strings, where each string is a single number.
 */
const splitNumericString = (input: string | null | undefined): string[] => {
    if (!input) return [];
    // Replace commas that are delimiters with a pipe character.
    // A comma is a delimiter if it is followed by a digit, or a minus sign then a digit.
    // This reliably distinguishes it from a thousands-separator comma.
    const parsableString = String(input).replace(/,(?=-?\d)/g, '|');
    return parsableString.split('|');
};

export const executeJavaScriptDataTransform = (data: CsvRow[], jsFunctionBody: string): CsvRow[] => {
    try {
        // Create a utility object to be exposed to the AI's code.
        const _util = {
            /**
             * Safely parses a string into a number, handling currency symbols, commas, and percentages.
             * Returns null if parsing is not possible.
             * @param value The value to parse.
             * @returns A number or null.
             */
            parseNumber: robustParseFloat,
            /**
             * Safely splits a string containing multiple comma-separated numbers, where the numbers themselves may also contain commas as thousand separators.
             * @param value The string to split.
             * @returns An array of strings, each representing one number.
             */
            splitNumericString: splitNumericString,
        };

        const transformFunction = new Function('data', '_util', jsFunctionBody);
        const result = transformFunction(data, _util);
        
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
                [xValueColumn]: robustParseFloat(row[xValueColumn]),
                [yValueColumn]: robustParseFloat(row[yValueColumn]),
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
            const value = robustParseFloat(row[valueColumn]);
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
    
    // Intelligent Sorting:
    // 1. Try to sort chronologically for time-based categories (Quarters, Months, Dates).
    // 2. If not a time-based category, sort by value descending.
    const chronologicallySorted = tryChronologicalSort(aggregatedResult, groupByColumn);

    if (chronologicallySorted) {
        return chronologicallySorted;
    } else {
        const finalValueColumn = valueColumn || 'count';
        return aggregatedResult.sort((a, b) => (Number(b[finalValueColumn]) || 0) - (Number(a[finalValueColumn]) || 0));
    }
};
