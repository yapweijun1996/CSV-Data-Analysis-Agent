import type { CsvRow, SummarySeriesCandidate, SummarySeriesKind } from '../../types';
import { robustParseFloat } from '../data/dataProfiler';
import { getRowCells, isCodeLike, isNumericLike, roundRatio } from './reportShapeUtils';

// Domain-specific fallback — financial vocabulary for column scoring. Not consolidated because
// these serve a unique scoring/classification role beyond summary detection.
const SUMMARY_TEXT_HINT_PATTERN = /\b(?:grand total|subtotal|total|net|balance|variance|delta|allocated|allocation|consolidated|rollup|shared cost|ytd|mtd|qtd)\b/i;
const PERIOD_SCENARIO_SERIES_PATTERN = /^(?:fy\d{2,4}|q[1-4](?:[-_ ]?\d{2,4})?|\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|actual|budget|forecast|plan|target|variance)$/i;

export const isPeriodScenarioSeries = (value: string) => PERIOD_SCENARIO_SERIES_PATTERN.test(value.trim());
export const isSummaryTextLike = (value: string) => SUMMARY_TEXT_HINT_PATTERN.test(value.trim());

export const classifySummaryKind = (value: string): SummarySeriesKind => {
    const normalized = value.trim().toLowerCase();
    if (/total|subtotal|grand total/.test(normalized)) return 'total';
    if (/variance|delta/.test(normalized)) return 'comparison';
    if (/allocated|allocation|shared/.test(normalized)) return 'allocation';
    if (/consolidated|rollup|balance/.test(normalized)) return 'rollup';
    if (/net|margin/.test(normalized)) return 'derived_metric';
    return 'unknown';
};

const getNumericValue = (value: unknown) => robustParseFloat(value);

const getAggregateConsistencyScore = (
    rows: CsvRow[],
    detailSeriesIndexes: number[],
    candidateIndex: number,
) => {
    const scoredRows = rows
        .map(row => {
            const cells = getRowCells(row);
            const candidateValue = getNumericValue(cells[candidateIndex]?.value ?? null);
            if (candidateValue === null) return null;
            const detailValues = detailSeriesIndexes
                .map(index => getNumericValue(cells[index]?.value ?? null))
                .filter((value): value is number => value !== null);
            if (detailValues.length < 3) return null;
            const absoluteDetailTotal = detailValues.reduce((sum, value) => sum + Math.abs(value), 0);
            if (absoluteDetailTotal === 0) return null;
            const ratio = Math.abs(candidateValue) / absoluteDetailTotal;
            return ratio >= 0.2 && ratio <= 1.25 ? 1 as number : ratio <= 1.75 ? 0.6 as number : 0 as number;
        })
        .filter((value): value is number => value !== null);
    if (scoredRows.length === 0) return 0;
    return roundRatio(scoredRows.reduce((sum, value) => sum + value, 0) / scoredRows.length);
};

type SummaryCandidateInput = {
    rows: CsvRow[];
    headerRowIndex: number;
    detailSeriesIndexes: number[];
    candidateIndexes: number[];
};

export const scoreSummarySeriesCandidates = ({
    rows,
    headerRowIndex,
    detailSeriesIndexes,
    candidateIndexes,
}: SummaryCandidateInput): SummarySeriesCandidate[] => {
    if (candidateIndexes.length === 0) return [];
    const headerCells = getRowCells(rows[headerRowIndex]);
    const bodyRows = rows
        .slice(headerRowIndex + 1)
        .filter(row => getRowCells(row).some(cell => isNumericLike(cell.value)));

    return candidateIndexes
        .map(index => {
            const columnName = headerCells[index]?.value ?? '';
            if (!columnName) return null;
            const textScore = isSummaryTextLike(columnName) ? 0.58 : 0;
            const positionScore = index > Math.max(...detailSeriesIndexes, -1) ? 0.14 : 0;
            const codePenalty = isCodeLike(columnName) ? -0.25 : 0;
            const aggregateConsistency = getAggregateConsistencyScore(bodyRows, detailSeriesIndexes, index);
            const confidence = roundRatio(Math.max(0, textScore + positionScore + aggregateConsistency * 0.34 + codePenalty));
            if (confidence < 0.42) return null;
            return {
                columnName,
                summaryKind: classifySummaryKind(columnName),
                confidence,
            };
        })
        .filter((candidate): candidate is SummarySeriesCandidate => Boolean(candidate));
};
