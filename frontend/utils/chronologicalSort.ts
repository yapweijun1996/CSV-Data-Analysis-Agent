import { CsvRow } from '../types';
import { getOrdinalSortKey } from './ordinalSortOrder';

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


export const tryChronologicalSort = (data: CsvRow[], key: string): CsvRow[] | null => {
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

    // "MONTH YEAR" period values (e.g. "JAN 2010", "FEB 2010") — uses the
    // canonical ordinal sort key from ordinalSortOrder.ts which handles all
    // known ordinal vocabularies including compound period formats.
    // Checked after bare month/quarter/day to let more-specific branches win.
    const ordinalMatches = sampleValues.filter(v => getOrdinalSortKey(v) !== null).length;
    if (!sorter && ordinalMatches / sampleValues.length >= 0.5) {
        return [...data].sort((a, b) => {
            const keyA = getOrdinalSortKey(String(a[key])) ?? Infinity;
            const keyB = getOrdinalSortKey(String(b[key])) ?? Infinity;
            return keyA - keyB;
        });
    }

    // Numeric string fallback — covers day-of-month, year, or any integer/decimal grouping key.
    const numericMatches = sampleValues.filter(v => v !== '' && isFinite(Number(v))).length;
    if (numericMatches / sampleValues.length >= 0.5) {
        return [...data].sort((a, b) => Number(a[key]) - Number(b[key]));
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
