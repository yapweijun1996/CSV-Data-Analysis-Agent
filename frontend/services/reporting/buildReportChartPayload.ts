import type {
    ReportCardEvidence,
    ReportChartPayload,
    ReportVisualChartType,
} from '../../types';
import type { CsvRow } from '../../types';
import { getOrdinalSortKey, resolveOrdinalIndices } from '../../utils/ordinalSortOrder';
import { formatTemporalDisplayValue, getTemporalSortTimestamp } from '../../utils/temporalDisplay';
import { normalizeReportNarrative } from './normalizeReportNarrative';
import { validateReportChartPayload } from './validateReportChartPayload';

const MAX_BAR_POINTS = 6;
const MAX_LINE_POINTS = 8;
const OTHER_LABEL = 'Other';

const SUPPORTED_CHART_TYPES: ReportVisualChartType[] = ['bar', 'line', 'pie', 'doughnut'];

const numberFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

const trimText = (value: unknown): string => String(value ?? '').trim();

const toNumericValue = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.replace(/,/g, '').trim();
        if (!normalized) {
            return null;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const getRowLabel = (row: CsvRow, groupByColumn: string | null, _index: number): string => {
    if (groupByColumn) {
        const value = trimText(row[groupByColumn]);
        if (value && !/^(null|n\/a|undefined)$/i.test(value)) {
            return value;
        }
    }

    return 'Unclassified';
};

const cleanupLabel = (value: string, title: string): string => {
    const titleTokens = new Set(
        title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 2),
    );

    const normalized = value
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const cleaned = normalized
        .split(/\s+/)
        .filter(token => !titleTokens.has(token.toLowerCase()))
        .join(' ')
        .trim();
    const candidate = cleaned || normalized;

    if (!candidate) {
        return 'Untitled';
    }

    const lower = candidate.toLowerCase();
    if (candidate === candidate.toUpperCase() && /[A-Z]/.test(candidate)) {
        return lower.replace(/\b\w/g, letter => letter.toUpperCase());
    }

    return candidate;
};

const disambiguateLabels = (labels: string[]): string[] => {
    const seen = new Map<string, number>();

    return labels.map(label => {
        const key = label.toLowerCase();
        const count = seen.get(key) ?? 0;
        seen.set(key, count + 1);
        return count === 0 ? label : `${label} (${count + 1})`;
    });
};

type ChartEntry = {
    row: CsvRow;
    rawLabel: string;
    displayLabel: string;
    numericValue: number;
    originalIndex: number;
};

const resolveValueDomain = (values: number[]): ReportChartPayload['valueDomain'] => {
    const hasPositive = values.some(value => value > 0);
    const hasNegative = values.some(value => value < 0);

    if (hasPositive && hasNegative) {
        return 'mixed';
    }

    if (hasNegative) {
        return 'negative';
    }

    return 'positive';
};

const buildRankedEntries = (card: ReportCardEvidence): ChartEntry[] =>
    card.reportChartRows
        .map((row, index) => {
            const numericValue = toNumericValue(row[card.valueColumn as string]);
            if (numericValue === null) {
                return null;
            }

            return {
                row,
                rawLabel: getRowLabel(row, card.groupByColumn, index),
                displayLabel: cleanupLabel(
                    formatTemporalDisplayValue(card.groupByColumn, row[card.groupByColumn as string]) ?? getRowLabel(row, card.groupByColumn, index),
                    card.displayTitle,
                ),
                numericValue,
                originalIndex: index,
            };
        })
        .filter((value): value is ChartEntry => Boolean(value));

const aggregateRankedEntries = (entries: ChartEntry[], limit: number): {
    rows: ChartEntry[];
    aggregationApplied: boolean;
    aggregatedOtherValue: number | null;
} => {
    const ranked = [...entries].sort((left, right) => Math.abs(right.numericValue) - Math.abs(left.numericValue));
    if (ranked.length <= limit + 2) {
        return {
            rows: ranked.slice(0, limit),
            aggregationApplied: false,
            aggregatedOtherValue: null,
        };
    }

    const topRows = ranked.slice(0, limit - 1);
    const remaining = ranked.slice(limit - 1);
    const aggregatedOtherValue = remaining.reduce((sum, entry) => sum + entry.numericValue, 0);

    return {
        rows: [
            ...topRows,
            {
                row: { label: OTHER_LABEL, value: aggregatedOtherValue } as CsvRow,
                rawLabel: OTHER_LABEL,
                displayLabel: OTHER_LABEL,
                numericValue: aggregatedOtherValue,
                originalIndex: Number.MAX_SAFE_INTEGER,
            },
        ],
        aggregationApplied: true,
        aggregatedOtherValue,
    };
};

/**
 * Sort entries by ordinal (month/quarter/weekday) or date order.
 * If entries don't match any ordinal vocabulary, try date parse.
 * Falls back to original order when neither applies.
 */
const sortEntriesBySequentialOrder = (entries: ChartEntry[]): ChartEntry[] => {
    if (entries.length < 2) return entries;

    const rawLabels = entries.map(e => e.rawLabel);
    const displayLabels = entries.map(e => e.displayLabel);
    const ordinalIndices = resolveOrdinalIndices(rawLabels);
    if (ordinalIndices) {
        const paired = entries.map((entry, i) => ({ entry, key: ordinalIndices[i] }));
        return paired.sort((a, b) => a.key - b.key).map(p => p.entry);
    }

    // Try ordinal sort by individual value (handles mixed label sets with
    // partial matches, e.g. entries that include non-ordinal labels).
    const allHaveOrdinalKey = rawLabels.every(l => getOrdinalSortKey(l) !== null);
    if (allHaveOrdinalKey) {
        return [...entries].sort((a, b) => (getOrdinalSortKey(a.rawLabel) ?? 0) - (getOrdinalSortKey(b.rawLabel) ?? 0));
    }

    // Try date parse
    const timestamps = rawLabels.map(label => getTemporalSortTimestamp(label) ?? NaN);
    if (!timestamps.some(Number.isNaN)) {
        const paired = entries.map((entry, i) => ({ entry, key: timestamps[i] }));
        return paired.sort((a, b) => a.key - b.key).map(p => p.entry);
    }

    const displayTimestamps = displayLabels.map(label => getTemporalSortTimestamp(label) ?? NaN);
    if (!displayTimestamps.some(Number.isNaN)) {
        const paired = entries.map((entry, i) => ({ entry, key: displayTimestamps[i] }));
        return paired.sort((a, b) => a.key - b.key).map(p => p.entry);
    }

    // Neither ordinal nor date — keep original order.
    return entries;
};

const resolveChartEntries = (card: ReportCardEvidence, entries: ChartEntry[]) => {
    if (card.chartType === 'line') {
        const sorted = sortEntriesBySequentialOrder(entries);
        return {
            rows: sorted.slice(0, MAX_LINE_POINTS),
            aggregationApplied: false,
            aggregatedOtherValue: null,
        };
    }

    return aggregateRankedEntries(entries, MAX_BAR_POINTS);
};

export const isSupportedReportChartType = (value: string | null | undefined): value is ReportVisualChartType =>
    SUPPORTED_CHART_TYPES.includes(value as ReportVisualChartType);

export const buildReportChartPayload = (card: ReportCardEvidence): ReportChartPayload | null => {
    if (!isSupportedReportChartType(card.chartType) || !card.valueColumn) {
        return null;
    }

    const entries = buildRankedEntries(card);
    if (entries.length === 0) {
        return null;
    }

    const { rows, aggregationApplied, aggregatedOtherValue } = resolveChartEntries(card, entries);
    const displayLabels = disambiguateLabels(rows.map(entry => entry.displayLabel));
    const numericValues = rows.map(entry => entry.numericValue);
    const valueDomain = resolveValueDomain(numericValues);
    const validation = validateReportChartPayload({
        chartType: card.chartType,
        valueDomain,
        groupByColumn: card.groupByColumn,
        displayLabels,
        labels: rows.map(entry => entry.rawLabel),
        numericValues,
        originalLabelCount: entries.length,
    });

    return {
        chartType: validation.chartType,
        title: card.displayTitle,
        groupByColumn: card.groupByColumn,
        valueColumn: card.valueColumn,
        rows: rows.map(entry => entry.row),
        sortedRows: [...entries]
            .sort((left, right) => Math.abs(right.numericValue) - Math.abs(left.numericValue))
            .map(entry => entry.row),
        labels: rows.map(entry => entry.rawLabel),
        displayLabels,
        numericValues,
        formattedValues: numericValues.map(value => numberFormatter.format(value)),
        chartNarrative: normalizeReportNarrative(card.summary?.text || card.description || card.displayTitle, {
            maxSentences: 2,
            fallback: card.displayTitle,
        }),
        valueDomain,
        aggregationApplied,
        aggregatedOtherValue,
        chartWarnings: validation.chartWarnings,
    };
};
