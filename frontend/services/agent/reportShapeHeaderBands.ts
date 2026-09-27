import type { CsvRow, HeaderBandCandidate, SummarySeriesCandidate } from '../../types';
import {
    clamp01,
    getNonEmptyValues,
    getRowCells,
    isCodeLike,
    isDescriptorLike,
    isNumericLike,
    isSummaryLike,
    roundRatio,
} from './reportShapeUtils';
import {
    isPeriodScenarioSeries,
    scoreSummarySeriesCandidates,
} from './reportShapeSummary';

export interface HeaderLayoutCandidate {
    rowIndex: number;
    descriptorColumns: string[];
    detailSeriesColumns: string[];
    summarySeriesColumns: string[];
    summarySeriesCandidates: SummarySeriesCandidate[];
    descriptorColumnIndexes: number[];
    detailSeriesIndexes: number[];
    summarySeriesIndexes: number[];
    score: number;
}

const MAX_SERIES_LABEL_LAYERS = 3;

export const isReportTitleRow = (row: CsvRow | undefined) => {
    const values = getNonEmptyValues(row);
    return values.length > 0 && values.length <= 2 && values.join(' ').length >= 20;
};

export const isMetadataRow = (row: CsvRow | undefined) => {
    const values = getNonEmptyValues(row);
    return values.length > 0
        && values.length <= 2
        && (values.join(' ').length >= 30
            || values.some(v => /\d{2}[-/]\d{2}[-/]\d{4}/.test(v))
            || values.some(v => v.includes(':')));
};

const isDetailSeriesHeader = (value: string) =>
    isCodeLike(value)
    || /^[A-Za-z]{1,4}\d{1,4}$/.test(value)
    || isPeriodScenarioSeries(value);

export const detectHeaderLayoutCandidate = (
    rows: CsvRow[],
    rowIndex: number,
): HeaderLayoutCandidate | null => {
    const row = rows[rowIndex];
    const cells = getRowCells(row);
    if (cells.length < 5) return null;

    const descriptorColumns: string[] = [];
    const descriptorColumnIndexes: number[] = [];
    const detailSeriesColumns: string[] = [];
    const detailSeriesIndexes: number[] = [];
    const trailingCandidateIndexes: number[] = [];
    let seenSeries = false;

    for (const cell of cells) {
        if (!cell.value) {
            if (!seenSeries) continue;
            continue;
        }
        if (!seenSeries && (
            (isDescriptorLike(cell.value) && !isDetailSeriesHeader(cell.value))
            || (
                descriptorColumns.length < 3
                && !isDetailSeriesHeader(cell.value)
                && !isNumericLike(cell.value)
                && !isSummaryLike(cell.value)
            )
        )) {
            descriptorColumns.push(cell.value);
            descriptorColumnIndexes.push(cell.columnIndex);
            continue;
        }
        seenSeries = true;
        const codeHeavyDetailBlock = detailSeriesColumns.length >= 3
            && detailSeriesColumns.filter(column => isCodeLike(column)).length / detailSeriesColumns.length >= 0.75;
        if (isPeriodScenarioSeries(cell.value) && codeHeavyDetailBlock) {
            trailingCandidateIndexes.push(cell.columnIndex);
            continue;
        }
        if (isDetailSeriesHeader(cell.value)) {
            detailSeriesColumns.push(cell.value);
            detailSeriesIndexes.push(cell.columnIndex);
            continue;
        }
        if (descriptorColumns.length === 0) {
            return null;
        }
        if (
            (detailSeriesColumns.length >= 2 && isSummaryLike(cell.value))
            || (detailSeriesColumns.length >= 4 && (isDescriptorLike(cell.value) || /\w/.test(cell.value)))
        ) {
            trailingCandidateIndexes.push(cell.columnIndex);
        }
    }

    const minimumDetailSeries = rows.length >= 8 && trailingCandidateIndexes.length === 0 ? 3 : 2;
    if (descriptorColumns.length === 0 || detailSeriesColumns.length < minimumDetailSeries) return null;
    const summarySeriesCandidates = scoreSummarySeriesCandidates({
        rows,
        headerRowIndex: rowIndex,
        detailSeriesIndexes,
        candidateIndexes: trailingCandidateIndexes,
    });
    const summarySeriesColumns = summarySeriesCandidates.map(candidate => candidate.columnName);
    const summarySeriesIndexes = trailingCandidateIndexes.filter(index => summarySeriesColumns.includes(cells[index]?.value ?? ''));
    const descriptorScore = Math.min(1, descriptorColumns.length / 2);
    const detailScore = Math.min(1, detailSeriesColumns.length / 8);
    const summaryScore = summarySeriesColumns.length > 0 ? 0.1 : 0;
    return {
        rowIndex,
        descriptorColumns,
        detailSeriesColumns,
        summarySeriesColumns,
        summarySeriesCandidates,
        descriptorColumnIndexes,
        detailSeriesIndexes,
        summarySeriesIndexes,
        score: roundRatio(0.45 + descriptorScore * 0.2 + detailScore * 0.25 + summaryScore),
    };
};

const isSeriesLabelBandRow = (row: CsvRow | undefined, layout: HeaderLayoutCandidate) => {
    const cells = getRowCells(row);
    if (cells.length === 0) return false;
    const descriptorBlankCount = layout.descriptorColumnIndexes.filter(index => !cells[index]?.value).length;
    const detailNonEmptyCount = layout.detailSeriesIndexes.filter(index => Boolean(cells[index]?.value)).length;
    const detailLabelLikeCount = layout.detailSeriesIndexes.filter(index => {
        const value = cells[index]?.value ?? '';
        return Boolean(value) && !isNumericLike(value);
    }).length;
    const numericCount = layout.detailSeriesIndexes.filter(index => isNumericLike(cells[index]?.value ?? '')).length;
    if (numericCount >= Math.max(2, Math.floor(layout.detailSeriesIndexes.length * 0.3))) return false;
    return descriptorBlankCount >= Math.max(1, layout.descriptorColumnIndexes.length - 1)
        && detailNonEmptyCount >= Math.max(3, Math.floor(layout.detailSeriesIndexes.length * 0.35))
        && detailLabelLikeCount >= Math.max(3, Math.floor(layout.detailSeriesIndexes.length * 0.35));
};

export const detectSeriesLabelBands = (
    rows: CsvRow[],
    layout: HeaderLayoutCandidate | null,
): HeaderBandCandidate[] => {
    if (!layout) return [];
    const candidates: HeaderBandCandidate[] = [];
    for (let offset = 1; offset <= MAX_SERIES_LABEL_LAYERS; offset += 1) {
        const rowIndex = layout.rowIndex + offset;
        if (!rows[rowIndex] || !isSeriesLabelBandRow(rows[rowIndex], layout)) break;
        candidates.push({
            rowIndexes: [rowIndex],
            role: 'series_label_header',
            confidence: roundRatio(clamp01(0.55 + offset * 0.08)),
            layerIndex: offset,
        });
    }
    return candidates;
};

export const buildHeaderBands = (
    rows: CsvRow[],
    layout: HeaderLayoutCandidate | null,
    maxTopScanRows = 12,
): HeaderBandCandidate[] => {
    const headerBands: HeaderBandCandidate[] = [];
    const topRows = rows.slice(0, Math.min(maxTopScanRows, rows.length));
    topRows.forEach((row, index) => {
        if (index === layout?.rowIndex) return;
        if (isReportTitleRow(row)) {
            headerBands.push({ rowIndexes: [index], role: 'report_title', confidence: 0.7 });
        } else if (isMetadataRow(row)) {
            headerBands.push({ rowIndexes: [index], role: 'report_metadata', confidence: 0.7 });
        }
    });
    if (layout) {
        headerBands.push({
            rowIndexes: [layout.rowIndex],
            role: 'column_header',
            confidence: layout.score,
            layerIndex: 0,
        });
        headerBands.push(...detectSeriesLabelBands(rows, layout));
    }
    return headerBands;
};
