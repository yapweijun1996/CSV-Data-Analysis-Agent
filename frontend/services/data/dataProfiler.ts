import { CsvRow, ColumnProfile, ColumnRole } from '../../types';
import { collectOrderedColumnNames } from './columnRegistry';

export const robustParseFloat = (value: any): number | null => {
    if (value === null || value === undefined) return null;

    let s = String(value).trim();
    if (s === '') return null;

    // 0. Strip leading spreadsheet text-format apostrophe (e.g. '-852.81 → -852.81)
    if (s.startsWith("'") || s.startsWith('\u2018') || s.startsWith('\u2019')) {
        s = s.substring(1);
        if (s === '') return null;
    }

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

    // 5. Reject partial parses: parseFloat("08-01-2010") returns 8 but only
    //    consumed "08". Number(s) returns NaN when the full string isn't a
    //    valid numeric literal, catching date strings, codes-with-dashes, etc.
    if (!Number.isFinite(Number(s))) {
        return null;
    }

    // 6. Apply negativity if detected from parentheses
    return isNegative ? -num : num;
};

export const profileData = (data: CsvRow[]): { profiles: ColumnProfile[], issues: string[] } => {
    if (!data || data.length === 0) return { profiles: [], issues: [] };
    const headers = collectOrderedColumnNames(data);
    const profiles: ColumnProfile[] = [];
    const issues: string[] = [];
    const MISSING_VALUE_THRESHOLD = 0.5; // 50%

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
        
        const missingPercentage = (values.filter(v => v === null || String(v).trim() === '').length / data.length);
        if (missingPercentage > MISSING_VALUE_THRESHOLD) {
            issues.push(`Column '${header}' has a high percentage of missing values (${(missingPercentage * 100).toFixed(0)}%).`);
        }

        if (isNumerical && numericCount > 0) {
            const numericValues = values.map(robustParseFloat).filter((v): v is number => v !== null);
            // Detect comma-formatted thousands separators (e.g. "1,234.56") so downstream
            // SQL can be warned to strip commas before CAST.
            const COMMA_THOUSANDS_PATTERN = /\d{1,3}(,\d{3})+/;
            const hasFormattedNumbers = values.some(v => {
                const s = String(v ?? '').trim();
                return s !== '' && COMMA_THOUSANDS_PATTERN.test(s);
            });
            // Detect apostrophe-prefixed numbers (e.g. '-852.81) — Excel text-format artifact.
            const APOSTROPHE_PREFIX_PATTERN = /^['\u2018\u2019]/;
            const hasApostrophePrefixedNumbers = values.some(v => {
                const s = String(v ?? '').trim();
                return s !== '' && APOSTROPHE_PREFIX_PATTERN.test(s);
            });
            profiles.push({
                name: header,
                type: 'numerical',
                valueRange: [Math.min(...numericValues), Math.max(...numericValues)],
                missingPercentage: missingPercentage * 100,
                ...(hasFormattedNumbers ? { hasFormattedNumbers: true } : {}),
                ...(hasApostrophePrefixedNumbers ? { hasApostrophePrefixedNumbers: true } : {}),
            });
            if (hasFormattedNumbers) {
                issues.push(`Column '${header}' contains comma-formatted numbers (e.g. '1,234.56'). Strip commas with replace_values before casting to avoid SQL type errors.`);
            }
            if (hasApostrophePrefixedNumbers) {
                issues.push(`Column '${header}' contains apostrophe-prefixed numbers (e.g. "'-852.81"). Strip leading apostrophes with replace_values before casting to avoid SQL type errors.`);
            }
        } else {
             const uniqueValues = new Set(values.map(String));
             profiles.push({
                name: header,
                type: 'categorical',
                uniqueValues: uniqueValues.size,
                missingPercentage: missingPercentage * 100
             });
        }
    }
    return { profiles, issues };
};

/**
 * Last-resort lightweight profiler used when both the web worker and the
 * full main-thread `profileData` are unavailable or throw.
 *
 * Design constraints:
 *  - Samples at most `maxRows` rows via stratified head/middle/tail split
 *  - Uses simple Number() conversion (not robustParseFloat) — fewer failure modes
 *  - Never throws on any input
 *  - Returns a compatible { profiles, issues } shape
 */
export const LIGHTWEIGHT_PROFILER_ROW_LIMIT = 1000;

/**
 * Returns a stratified sample covering the head (33%), middle (33%), and
 * tail (34%) of `data`. If data.length <= maxRows the full array is returned.
 *
 * This avoids the bias of head-only sampling in time-series or append-only
 * datasets where later rows may have different value distributions.
 */
export const sampleStratified = (data: CsvRow[], maxRows: number): CsvRow[] => {
    const n = data.length;
    if (n <= maxRows) return data;

    const headCount = Math.floor(maxRows * 0.33);
    const midCount = Math.floor(maxRows * 0.33);
    const tailCount = maxRows - headCount - midCount; // always sums to maxRows

    const midStart = Math.floor((n - midCount) / 2);

    return [
        ...data.slice(0, headCount),
        ...data.slice(midStart, midStart + midCount),
        ...data.slice(n - tailCount),
    ];
};

export const profileDataLightweight = (
    data: CsvRow[],
    maxRows: number = LIGHTWEIGHT_PROFILER_ROW_LIMIT,
): { profiles: ColumnProfile[]; issues: string[] } => {
    try {
        if (!data || data.length === 0) return { profiles: [], issues: [] };

        const sample = sampleStratified(data, maxRows);
        const headers = collectOrderedColumnNames(data, collectOrderedColumnNames(sample));
        const issues: string[] = [];

        if (data.length > maxRows) {
            issues.push(`Lightweight profiler used a stratified sample of ${maxRows} rows (head/middle/tail) from ${data.length} total rows.`);
        }

        const COMMA_THOUSANDS_PATTERN_LW = /\d{1,3}(,\d{3})+/;
        const APOSTROPHE_PREFIX_PATTERN_LW = /^['\u2018\u2019]/;
        const profiles: ColumnProfile[] = headers.map(header => {
            let nullCount = 0;
            let numericCount = 0;
            let commaFormattedCount = 0;
            let apostrophePrefixedCount = 0;
            const seen = new Set<string>();

            for (const row of sample) {
                const val = row[header];
                const str = val === null || val === undefined ? '' : String(val).trim();
                if (str === '') {
                    nullCount += 1;
                } else {
                    seen.add(str);
                    const stripped = str.replace(/^['\u2018\u2019]/, '').replace(/[$,%\s]/g, '');
                    if (stripped !== '' && !isNaN(Number(stripped))) {
                        numericCount += 1;
                        if (COMMA_THOUSANDS_PATTERN_LW.test(str)) {
                            commaFormattedCount += 1;
                        }
                        if (APOSTROPHE_PREFIX_PATTERN_LW.test(str)) {
                            apostrophePrefixedCount += 1;
                        }
                    }
                }
            }

            const nonNullCount = sample.length - nullCount;
            const isNumeric = nonNullCount > 0 && numericCount / nonNullCount > 0.8;
            const hasFormattedNumbers = isNumeric && commaFormattedCount > 0;
            const hasApostrophePrefixedNumbers = isNumeric && apostrophePrefixedCount > 0;
            const missingPercentage = (nullCount / sample.length) * 100;

            return {
                name: header,
                type: isNumeric ? ('numerical' as const) : ('categorical' as const),
                uniqueValues: seen.size,
                missingPercentage,
                ...(hasFormattedNumbers ? { hasFormattedNumbers: true } : {}),
                ...(hasApostrophePrefixedNumbers ? { hasApostrophePrefixedNumbers: true } : {}),
            } satisfies ColumnProfile;
        });

        return { profiles, issues };
    } catch {
        // Absolute last resort: return empty profiles so the pipeline can continue
        return { profiles: [], issues: ['Lightweight profiling failed; column profiles unavailable.'] };
    }
};

const HIGH_MISSING_VALUE_PATTERN = /^Column '(.+)' has a high percentage of missing values \((\d+)%\)\.$/;
const COMMA_FORMATTED_PATTERN = /^Column '(.+)' contains comma-formatted numbers/;

export const summarizeDataQualityIssues = (issues: string[]): string | null => {
    if (!Array.isArray(issues) || issues.length === 0) return null;

    const parsedMissingWarnings = issues
        .map(issue => issue.match(HIGH_MISSING_VALUE_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map(match => ({
            column: match[1],
            percentage: Number(match[2]),
        }));

    const parsedFormattedWarnings = issues
        .map(issue => issue.match(COMMA_FORMATTED_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map(match => match[1]);

    const knownIssueCount = parsedMissingWarnings.length + parsedFormattedWarnings.length;

    if (knownIssueCount === issues.length) {
        const parts: string[] = [];
        if (parsedMissingWarnings.length > 0) {
            const examples = parsedMissingWarnings.slice(0, 3).map(entry => entry.column).join(', ');
            const remainder = parsedMissingWarnings.length - Math.min(parsedMissingWarnings.length, 3);
            const maxMissing = Math.max(...parsedMissingWarnings.map(entry => entry.percentage));
            const exampleText = examples ? ` Example columns: ${examples}${remainder > 0 ? `, and ${remainder} more` : ''}.` : '';
            parts.push(`${parsedMissingWarnings.length} columns are mostly empty (${maxMissing}% missing at worst). AI will treat them as low-priority unless they become relevant.${exampleText}`);
        }
        if (parsedFormattedWarnings.length > 0) {
            const examples = parsedFormattedWarnings.slice(0, 3).join(', ');
            const remainder = parsedFormattedWarnings.length - Math.min(parsedFormattedWarnings.length, 3);
            parts.push(`${parsedFormattedWarnings.length} column${parsedFormattedWarnings.length > 1 ? 's' : ''} contain comma-formatted numbers (e.g. "1,234.56"): ${examples}${remainder > 0 ? `, and ${remainder} more` : ''}. Use replace_values to strip commas, then cast_column to numeric before running SQL aggregations.`);
        }
        return parts.join(' ');
    }

    return `Detected ${issues.length} data quality warning${issues.length > 1 ? 's' : ''}. AI will account for them during analysis.`;
};

/**
 * User-friendly version of summarizeDataQualityIssues.
 * Returns { userSummary, technicalDetail } so the UI can show user-facing text
 * and optionally reveal agent-facing instructions behind a toggle.
 */
export const summarizeDataQualityForEndUser = (issues: string[]): { userSummary: string; technicalDetail: string | null } | null => {
    if (!Array.isArray(issues) || issues.length === 0) return null;

    const parsedMissingWarnings = issues
        .map(issue => issue.match(HIGH_MISSING_VALUE_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map(match => ({ column: match[1], percentage: Number(match[2]) }));

    const parsedFormattedWarnings = issues
        .map(issue => issue.match(COMMA_FORMATTED_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map(match => match[1]);

    const knownIssueCount = parsedMissingWarnings.length + parsedFormattedWarnings.length;

    if (knownIssueCount === issues.length) {
        const userParts: string[] = [];
        const techParts: string[] = [];

        if (parsedMissingWarnings.length > 0) {
            const examples = parsedMissingWarnings.slice(0, 3).map(e => e.column).join(', ');
            const remainder = parsedMissingWarnings.length - Math.min(parsedMissingWarnings.length, 3);
            const maxMissing = Math.max(...parsedMissingWarnings.map(e => e.percentage));
            const exampleText = examples ? ` (${examples}${remainder > 0 ? ` +${remainder}` : ''})` : '';
            userParts.push(`${parsedMissingWarnings.length} columns have mostly empty values (up to ${maxMissing}% missing)${exampleText}. These are treated as low-priority by the AI.`);
            techParts.push(`Missing-value columns: ${parsedMissingWarnings.map(e => `${e.column} (${e.percentage}%)`).join(', ')}`);
        }
        if (parsedFormattedWarnings.length > 0) {
            const examples = parsedFormattedWarnings.slice(0, 3).join(', ');
            const remainder = parsedFormattedWarnings.length - Math.min(parsedFormattedWarnings.length, 3);
            userParts.push(`${parsedFormattedWarnings.length} numeric column${parsedFormattedWarnings.length > 1 ? 's' : ''} contained formatting (e.g. "1,234.56") that was auto-corrected during cleaning${examples ? `: ${examples}` : ''}${remainder > 0 ? ` +${remainder}` : ''}.`);
            techParts.push(`Comma-formatted columns (auto-corrected): ${parsedFormattedWarnings.join(', ')}. Commas were stripped and values cast to numeric during cleaning.`);
        }

        return {
            userSummary: userParts.join(' '),
            technicalDetail: techParts.length > 0 ? techParts.join(' | ') : null,
        };
    }

    return {
        userSummary: `Detected ${issues.length} data quality issue${issues.length > 1 ? 's' : ''} that the AI will account for during analysis.`,
        technicalDetail: issues.join(' | '),
    };
};

export type SchemaSnapshot = ReturnType<typeof buildSchemaSnapshot>;

export const buildSchemaSnapshot = (profiles: ColumnProfile[]) => {
    return profiles.map(profile => ({
        name: profile.name,
        type: profile.type,
        uniqueValues: profile.uniqueValues,
        missingPercentage: profile.missingPercentage,
        valueRange: profile.valueRange,
    }));
};

export const diffSchemas = (before: SchemaSnapshot, after: SchemaSnapshot) => {
    const beforeMap = new Map(before.map(col => [col.name.toLowerCase(), col]));
    const afterMap = new Map(after.map(col => [col.name.toLowerCase(), col]));

    const addedColumns = after
        .filter(col => !beforeMap.has(col.name.toLowerCase()))
        .map(col => ({ name: col.name, type: col.type }));
    const removedColumns = before
        .filter(col => !afterMap.has(col.name.toLowerCase()))
        .map(col => ({ name: col.name, type: col.type }));
    const changedColumns = after
        .filter(col => {
            const previous = beforeMap.get(col.name.toLowerCase());
            return previous && previous.type !== col.type;
        })
        .map(col => ({ name: col.name, before: beforeMap.get(col.name.toLowerCase())?.type, after: col.type }));

    return { addedColumns, removedColumns, changedColumns };
};

export const summarizeSchemaChanges = (
    before: SchemaSnapshot,
    after: SchemaSnapshot,
) => {
    const diff = diffSchemas(before, after);
    const removed = diff.removedColumns.length;
    const added = diff.addedColumns.length;
    const changed = diff.changedColumns.length;
    return `Schema updated: ${after.length} columns retained. Added ${added}, removed ${removed}, type changes ${changed}.`;
};


export const buildRowPreview = (rows: CsvRow[], limit: number) => {
    const preview = rows.slice(0, Math.min(limit, rows.length));
    const columns = collectOrderedColumnNames(preview);
    return {
        columns,
        tablePreview: preview,
    };
};

export const mergeProfilesWithActual = (declared: ColumnProfile[] | undefined, actual: ColumnProfile[]): ColumnProfile[] => {
    if (!declared || declared.length === 0) return actual;
    const actualMap = new Map(actual.map(profile => [profile.name.toLowerCase(), profile]));
    return declared.map(profile => {
        const detected = actualMap.get(profile.name.toLowerCase());
        if (!detected) return profile;
        if (profile.type !== detected.type) {
            console.warn(`[FileProcessor] Declared type for "${profile.name}" (${profile.type}) differs from detected type (${detected.type}).`);
        }
        return { ...detected, ...profile, missingPercentage: detected.missingPercentage };
    });
};

export type ColumnDecision = {
    name: string;
    reason: string;
    role: ColumnRole;
    isConstant: boolean;
    removeFromDataset: boolean;
};

const determineColumnRole = (name: string, type: ColumnProfile['type']): ColumnRole => {
    const normalized = name.toLowerCase();
    if (/id$|code$|_id|_code|key$/i.test(name)) {
        return 'technical_key';
    }
    if (['numerical', 'currency', 'percentage'].includes(type)) {
        return 'metric';
    }
    if (['categorical', 'date', 'time'].includes(type)) {
        return 'dimension';
    }
    if (/memo|note|total/i.test(normalized)) {
        return 'noise';
    }
    return 'dimension';
};

export const evaluateColumns = (schema: SchemaSnapshot, rowCount: number) => {
    const dropColumns: ColumnDecision[] = [];
    const keepColumns: { name: string; role: ColumnRole }[] = [];

    schema.forEach(column => {
        const missingRatio = (column.missingPercentage ?? 0) / 100;
        const inferredRole = determineColumnRole(column.name, column.type);
        const isConstant = (column.uniqueValues ?? Infinity) <= 1;
        const looksLikeMetadata = /memo|note|header|total/i.test(column.name);
        if (isConstant) {
            dropColumns.push({
                name: column.name,
                reason: 'constant values',
                role: 'noise',
                isConstant: true,
                removeFromDataset: true,
            });
        } else if (missingRatio >= 1) {
            dropColumns.push({
                name: column.name,
                reason: 'completely empty',
                role: 'noise',
                isConstant: false,
                removeFromDataset: true,
            });
        } else if (missingRatio > 0.9) {
            dropColumns.push({
                name: column.name,
                reason: 'mostly empty',
                role: 'noise',
                isConstant: false,
                removeFromDataset: false,
            });
        } else if (looksLikeMetadata) {
            dropColumns.push({
                name: column.name,
                reason: 'metadata/sum column',
                role: 'noise',
                isConstant,
                removeFromDataset: true,
            });
        } else {
            keepColumns.push({ name: column.name, role: inferredRole });
        }
    });

    return {
        rowCount,
        keepColumns,
        dropColumns,
    };
};
