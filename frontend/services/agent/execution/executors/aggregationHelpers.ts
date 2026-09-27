import { CsvRow, AggregationType } from '../../../../types';
import { robustParseFloat } from '../../../data/dataProfiler';

/**
 * Gets a value from an object using a case-insensitive key.
 * @param obj The CsvRow object.
 * @param key The key to look for.
 * @returns The found value or undefined.
 */
export const getValueCaseInsensitive = (obj: CsvRow, key: string | undefined): string | number | undefined => {
    if (!key || !obj) return undefined;
    const keyLower = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === keyLower);
    if (!foundKey) return undefined;
    const value = obj[foundKey];
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
};

/**
 * Calculates the aggregated result for a given set of values.
 * @param values The array of numbers.
 * @param aggregation The type of aggregation to perform.
 * @returns The aggregated result.
 */
export const calculateAggregation = (values: number[], aggregation: AggregationType): number => {
    if (values.length === 0) return 0;
    switch (aggregation) {
        case 'sum':
            return values.reduce((acc, val) => acc + val, 0);
        case 'count':
            return values.length;
        case 'avg': {
            const sum = values.reduce((acc, val) => acc + val, 0);
            return sum / values.length;
        }
        case 'min':
            return Math.min(...values);
        case 'max':
            return Math.max(...values);
        case 'median':
        case 'percentile': {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        case 'count_distinct':
            return new Set(values).size;
    }
};
