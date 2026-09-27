import type { CsvData, CsvRow } from '../../types';

// Structural format patterns (kept — not domain-specific).
export const CODE_LIKE_PATTERN = /^(?:\d{4,8}|[A-Z]{2,}(?:[_-][A-Z0-9]+)*)$/;
export const PLACEHOLDER_PATTERN = /^_?unnamed(?:_column)?(?:_\d+)?$/i;
// Domain patterns demoted to fallback — structural signals take priority.
// FOOTER_PATTERN: date format (\d{2}-\d{2}-\d{4}@) is structural; domain tokens are fallback.
// Primary detection is isStructuralFooterRow — this regex is last-resort for edge cases.
export const FOOTER_PATTERN = /\b(?:reporting date|reporting currency|printed by|generated on)\b|\d{2}-\d{2}-\d{4}@/i;
export const SUMMARY_LABEL_PATTERN = /^(?:total|subtotal|grand[ _-]?total|net[ _-]?total)$/i;
// Row-role detection patterns — regex fallback, structural signals take priority.
// GAP-3 fix (2026-07-24): real report subtotal labels carry prefixes/suffixes —
// ">> SUB-TOTAL: <customer>" (Ageing), "SUB-TOTAL :  <name>", "Sub-Total" — so
// the patterns anchor on the label WORD, not the whole cell. Total labels may
// carry trailing qualifiers ("TOTAL (NETT AMOUNT)", "NET TOTAL (AR-AP)",
// "Total Value:").
export const SUBTOTAL_ROW_PATTERN = /^(?:>+\s*)?sub[\s_-]?total\b/i;
// A bare "total" token at the beginning of a business name is not a summary
// label (for example, "Total Facility Engineering"). Accept standalone total
// labels, parenthesized/colon-qualified totals, and labels whose final colon
// makes their aggregate-label grammar explicit. Structural sum verification
// remains the authority for free-form labels such as "Total Commission".
export const TOTAL_ROW_PATTERN = /^(?:>+\s*)?(?:(?:grand|net)[\s_-]+)?total(?:$|\s*[:(]|\s+\S+$|\s+.*:\s*$)|^net$|^balance\b/i;
export const SUMMARY_TOKEN_PATTERN = /(?:^|[\s>_:-])(sub\s*total|subtotal|grand\s*total|total|balance|summary|net\s*total)(?:$|[\s>_:-])/i;

export type IndexedCell = {
    columnKey: string;
    columnIndex: number;
    value: string;
};

export const getRows = (data: CsvData | null) => data?.data ?? [];

export const getColumns = (data: CsvData | null) =>
    data?.data?.[0] ? Object.keys(data.data[0]) : [];

export const getRowCells = (row: CsvRow | undefined): IndexedCell[] =>
    Object.entries(row ?? {}).map(([columnKey, rawValue], columnIndex) => ({
        columnKey,
        columnIndex,
        value: String(rawValue ?? '').trim(),
    }));

export const getRowValues = (row: CsvRow | undefined) =>
    getRowCells(row).map(cell => cell.value);

export const getNonEmptyValues = (row: CsvRow | undefined) =>
    getRowValues(row).filter(Boolean);

export const normalizeText = (value: string) => value.trim().toLowerCase();

export const isNumericLike = (value: string) => /^-?\d[\d,]*(?:\.\d+)?$/.test(value.trim());

export const isCodeLike = (value: string) => CODE_LIKE_PATTERN.test(value.trim());

export const isSummaryLike = (value: string) => SUMMARY_LABEL_PATTERN.test(value.trim());

export const isSubtotalLike = (value: string) => SUBTOTAL_ROW_PATTERN.test(value.trim());

export const isTotalLike = (value: string) => TOTAL_ROW_PATTERN.test(value.trim());

export const hasSummaryToken = (text: string) => SUMMARY_TOKEN_PATTERN.test(text);

export const isDescriptorLike = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length >= 2
        && /[A-Za-z]/.test(trimmed)
        && !isCodeLike(trimmed)
        && !isSummaryLike(trimmed)
        && !isNumericLike(trimmed);
};

export const countNumericValues = (rows: CsvRow[], columnNames: string[]) =>
    rows.reduce((count, row) => (
        count + columnNames.filter(column => isNumericLike(String(row[column] ?? ''))).length
    ), 0);

export const buildDistinctCount = (rows: CsvRow[], columns: string[]) => {
    if (columns.length === 0) return 0;
    return new Set(rows.map(row => columns.map(column => String(row[column] ?? '')).join('||'))).size;
};

export const isBlankRow = (row: CsvRow | undefined) => getNonEmptyValues(row).length === 0;

// Structural footer detection: singleton long text or sparse date-like row.
const isStructuralFooterRow = (row: CsvRow | undefined): boolean => {
    const values = getNonEmptyValues(row);
    if (values.length === 0) return false;
    // Singleton long text → likely a printed/generated footer line.
    if (values.length === 1 && values[0].length >= 24) return true;
    // Very sparse row with a date-format value → likely a reporting date footer.
    if (values.length <= 2 && values.some(v => /\d{2}[-/]\d{2}[-/]\d{4}/.test(v))) return true;
    return false;
};

export const isFooterLikeRow = (row: CsvRow | undefined) =>
    isStructuralFooterRow(row) || FOOTER_PATTERN.test(getNonEmptyValues(row).join(' | '));

// Structural descriptor sort priority (positional convention, not domain vocabulary).
export const getDescriptorPriority = (column: string) => {
    const normalized = column.trim().toLowerCase();
    if (/\b(?:code|id)\b/.test(normalized)) return 0;
    if (/\b(?:description|name|label)\b/.test(normalized)) return 1;
    return 2;
};

export const sortDescriptorColumns = (columns: string[]) =>
    [...columns].sort((left, right) =>
        getDescriptorPriority(left) - getDescriptorPriority(right) || left.localeCompare(right),
    );

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const roundRatio = (value: number) => Number(clamp01(value).toFixed(4));
