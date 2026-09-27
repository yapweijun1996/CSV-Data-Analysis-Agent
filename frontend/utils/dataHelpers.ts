import { CsvRow } from '../types';

/**
 * Parse a value as a number, stripping thousand-separator commas and trimming whitespace.
 * Handles formatted numbers like "84,267.50", " 1,276,638.48 ", etc.
 * Returns 0 for non-numeric values (null, undefined, empty string, text).
 */
export const parseNumericValue = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '') return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const applyTopNWithOthers = (data: CsvRow[], groupByKey: string, valueKey: string, topN: number): CsvRow[] => {
    if (data.length <= topN) {
        return data;
    }

    const sortedData = [...data].sort((a, b) => parseNumericValue(b[valueKey]) - parseNumericValue(a[valueKey]));

    const topData = sortedData.slice(0, topN);
    const otherData = sortedData.slice(topN);

    if (otherData.length > 0) {
        const otherSum = otherData.reduce((acc, row) => acc + parseNumericValue(row[valueKey]), 0);
        const othersRow: CsvRow = {
            [groupByKey]: 'Others',
            [valueKey]: otherSum,
        };
        return [...topData, othersRow];
    }
    
    return topData;
};


export const buildDiverseSample = (rows: CsvRow[], size: number): CsvRow[] => {
    if (rows.length <= size) return rows.map(row => ({ ...row }));
    const sample: CsvRow[] = [];
    const used = new Set<number>();

    const takeRange = (indices: number[]) => {
        indices.forEach(index => {
            if (sample.length >= size) return;
            if (index >= 0 && index < rows.length && !used.has(index)) {
                used.add(index);
                sample.push({ ...rows[index] });
            }
        });
    };

    // Take from the beginning and end to capture headers/footers
    takeRange(Array.from({ length: Math.min(8, size) }, (_, i) => i));
    takeRange(Array.from({ length: Math.min(6, size) }, (_, i) => rows.length - 1 - i));

    // Fill the rest with random samples
    while (sample.length < size) {
        const index = Math.floor(Math.random() * rows.length);
        if (!used.has(index)) {
            used.add(index);
            sample.push({ ...rows[index] });
        }
    }

    return sample;
};
