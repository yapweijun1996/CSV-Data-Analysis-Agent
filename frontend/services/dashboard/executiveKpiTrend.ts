import type { AnalysisCardData, ColumnProfile, CsvData, CsvRow, PreFilterClause, Settings } from '../../types';
import { applyPreFilter, normalizePreFilterOperator } from '../../utils/planValidation/preFilterSupport';
import { buildDistributionDeltaLabel, buildPeriodDeltaLabel } from './executiveKpiCopy';
import type { ExecutiveKpiDelta } from './executiveKpiTypes';
import { formatShareValue, getRowValue, toNumericValue } from './executiveKpiUtils';

const DATE_SAMPLE_LIMIT = 50;
const DATE_MATCH_THRESHOLD = 0.6;
const FLAT_DELTA_THRESHOLD = 0.005;
const DATE_TEXT_PATTERN = /\d{4}-\d{1,2}(?:-\d{1,2})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{2,4})?/i;
const TIME_TEXT_PATTERN = /\d{1,2}:\d{2}/;

type ExecutiveMetricRow = { row: CsvRow; value: number };
type ScopedDateRow = { row: CsvRow; date: Date };

const isDateLikeProfile = (profile: ColumnProfile | undefined): boolean =>
    profile?.type === 'date' || profile?.type === 'time';

const parseDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) return null;
    const stringValue = String(value).trim();
    if (!stringValue) return null;

    const parsed = new Date(stringValue);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const isDateLikeSampleValue = (value: unknown): boolean => {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime());
    }

    if (typeof value !== 'string') {
        return false;
    }

    const stringValue = value.trim();
    if (!stringValue) return false;
    if (!DATE_TEXT_PATTERN.test(stringValue) && !TIME_TEXT_PATTERN.test(stringValue)) {
        return false;
    }

    return parseDate(stringValue) !== null;
};

const toDayKey = (date: Date): string => date.toISOString().slice(0, 10);
const toMonthKey = (date: Date): string => date.toISOString().slice(0, 7);

const toComparableText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const matchesPreFilters = (row: CsvRow, filters: PreFilterClause[] | undefined): boolean => {
    if (!filters?.length) return true;

    return filters.every(filter => {
        const operator = normalizePreFilterOperator(filter.operator).normalized;
        return applyPreFilter(getRowValue(row, filter.column), operator, filter.value);
    });
};

const matchesCardFilter = (
    row: CsvRow,
    filter: AnalysisCardData['filter'],
): boolean => {
    if (!filter?.column || !filter.values?.length) return true;
    const actualValue = toComparableText(getRowValue(row, filter.column));
    return filter.values.some(value => toComparableText(value) === actualValue);
};

const applyCardScope = (rows: CsvRow[], card: AnalysisCardData): CsvRow[] =>
    rows.filter(row => matchesPreFilters(row, card.plan.preFilter) && matchesCardFilter(row, card.filter));

const detectDateColumn = (columnProfiles: ColumnProfile[], rows: CsvRow[]): string | null => {
    const firstProfileMatch = columnProfiles.find(isDateLikeProfile);
    if (firstProfileMatch) {
        return firstProfileMatch.name;
    }

    const sampleRow = rows[0];
    if (!sampleRow) return null;

    return Object.keys(sampleRow).find(columnName => {
        const sampleValues = rows
            .map(row => getRowValue(row, columnName))
            .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
            .slice(0, DATE_SAMPLE_LIMIT);

        if (sampleValues.length === 0) return false;

        const validDates = sampleValues.filter(isDateLikeSampleValue).length;
        return validDates / sampleValues.length >= DATE_MATCH_THRESHOLD;
    }) ?? null;
};

const getAggregationMode = (card: AnalysisCardData): 'sum' | 'avg' | 'count' => {
    if (card.plan.aggregation === 'avg') return 'avg';
    if (card.plan.aggregation === 'count') return 'count';
    if (!card.plan.valueColumn) return 'count';
    return 'sum';
};

const aggregateRows = (rows: CsvRow[], card: AnalysisCardData): number | null => {
    const aggregationMode = getAggregationMode(card);
    if (aggregationMode === 'count') {
        return rows.length;
    }

    const numericValues = rows
        .map(row => toNumericValue(getRowValue(row, card.plan.valueColumn)))
        .filter((value): value is number => value !== null && Number.isFinite(value));

    if (numericValues.length === 0) {
        return null;
    }

    if (aggregationMode === 'avg') {
        return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    }

    return numericValues.reduce((sum, value) => sum + value, 0);
};

const buildBuckets = (rows: ScopedDateRow[], keyBuilder: (date: Date) => string): Map<string, CsvRow[]> => {
    const buckets = new Map<string, CsvRow[]>();

    rows.forEach(({ row, date }) => {
        const key = keyBuilder(date);
        const bucketRows = buckets.get(key) ?? [];
        bucketRows.push(row);
        buckets.set(key, bucketRows);
    });

    return buckets;
};

const getDirection = (ratio: number): ExecutiveKpiDelta['direction'] => {
    if (Math.abs(ratio) < FLAT_DELTA_THRESHOLD) {
        return 'flat';
    }
    return ratio > 0 ? 'up' : 'down';
};

const formatDeltaValue = (ratio: number): string => {
    const percentValue = ratio * 100;
    const sign = percentValue > 0 ? '+' : '';
    const maximumFractionDigits = Math.abs(percentValue) >= 10 ? 0 : 1;
    return `${sign}${percentValue.toLocaleString(undefined, { maximumFractionDigits })}%`;
};

const buildPeriodDelta = (
    bucketMap: Map<string, CsvRow[]>,
    card: AnalysisCardData,
    label: string,
): ExecutiveKpiDelta | null => {
    const orderedKeys = [...bucketMap.keys()].sort();
    if (orderedKeys.length < 2) return null;

    const currentRows = bucketMap.get(orderedKeys[orderedKeys.length - 1] ?? '');
    const previousRows = bucketMap.get(orderedKeys[orderedKeys.length - 2] ?? '');
    if (!currentRows?.length || !previousRows?.length) return null;

    const currentValue = aggregateRows(currentRows, card);
    const previousValue = aggregateRows(previousRows, card);

    if (
        currentValue === null
        || previousValue === null
        || previousValue <= 0
        || !Number.isFinite(currentValue)
        || !Number.isFinite(previousValue)
    ) {
        return null;
    }

    const ratio = (currentValue - previousValue) / Math.abs(previousValue);
    if (!Number.isFinite(ratio)) return null;

    return {
        kind: 'period',
        direction: getDirection(ratio),
        value: formatDeltaValue(ratio),
        label,
    };
};

const buildDistributionDelta = (
    metricRows: ExecutiveMetricRow[],
    totalValue: number,
    groupLabel: string,
    language?: Settings['language'],
): ExecutiveKpiDelta | undefined => {
    if (!metricRows.length || totalValue === 0 || !Number.isFinite(totalValue)) {
        return undefined;
    }

    const topShare = metricRows[0].value / totalValue;
    if (!Number.isFinite(topShare)) {
        return undefined;
    }

    return {
        kind: 'distribution',
        direction: 'flat',
        value: formatShareValue(topShare),
        label: buildDistributionDeltaLabel(groupLabel, language),
    };
};

export const buildExecutiveKpiDelta = ({
    card,
    columnProfiles,
    csvData,
    metricRows,
    totalValue,
    groupLabel,
    language,
}: {
    card: AnalysisCardData;
    columnProfiles: ColumnProfile[];
    csvData: CsvData | null | undefined;
    metricRows: ExecutiveMetricRow[];
    totalValue: number;
    groupLabel: string;
    language?: Settings['language'];
}): ExecutiveKpiDelta | undefined => {
    const previewOnly = csvData?.backing?.mode === 'duckdb_file';
    const scopedRows = previewOnly ? [] : applyCardScope(csvData?.data ?? [], card);
    const dateColumn = previewOnly ? null : detectDateColumn(columnProfiles, csvData?.data ?? []);

    if (dateColumn && scopedRows.length > 0) {
        const datedRows = scopedRows
            .map(row => {
                const parsedDate = parseDate(getRowValue(row, dateColumn));
                return parsedDate ? { row, date: parsedDate } : null;
            })
            .filter((entry): entry is ScopedDateRow => Boolean(entry));

        if (datedRows.length > 0) {
            const monthDelta = buildPeriodDelta(buildBuckets(datedRows, toMonthKey), card, buildPeriodDeltaLabel('month', language));
            if (monthDelta && new Set(datedRows.map(({ date }) => toMonthKey(date))).size >= 3) {
                return monthDelta;
            }

            const dayDelta = buildPeriodDelta(buildBuckets(datedRows, toDayKey), card, buildPeriodDeltaLabel('day', language));
            if (dayDelta && new Set(datedRows.map(({ date }) => toDayKey(date))).size >= 2) {
                return dayDelta;
            }
        }
    }

    return buildDistributionDelta(metricRows, totalValue, groupLabel, language);
};
