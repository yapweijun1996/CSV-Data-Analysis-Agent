import type { CsvRow } from '../../types';
import { getNonEmptyValues, getRowCells, isBlankRow, isFooterLikeRow, isNumericLike, roundRatio } from './reportShapeUtils';
import type { HeaderLayoutCandidate } from './reportShapeHeaderBands';

export interface ReportSegmentCandidate {
    headerLayout: HeaderLayoutCandidate;
    startRowIndex: number;
    endRowIndex: number;
    businessRowCount: number;
    confidence: number;
    mixedSignal: boolean;
}

const countBusinessRows = (
    rows: CsvRow[],
    layout: HeaderLayoutCandidate,
    startRowIndex: number,
    endRowIndex: number,
) => rows
    .slice(startRowIndex, endRowIndex + 1)
    .filter(row => {
        if (isBlankRow(row) || isFooterLikeRow(row)) return false;
        const cells = getRowCells(row);
        const descriptorValues = layout.descriptorColumnIndexes.map(index => cells[index]?.value ?? '').filter(Boolean);
        const numericHits = layout.detailSeriesIndexes.filter(index => isNumericLike(cells[index]?.value ?? '')).length;
        return descriptorValues.length > 0 && numericHits >= 1;
    }).length;

const findSegmentEnd = (
    rows: CsvRow[],
    layout: HeaderLayoutCandidate,
    layoutIndexes: number[],
): number => {
    const nextHeaderIndex = layoutIndexes.find(index => index > layout.rowIndex) ?? rows.length;
    let endRowIndex = rows.length - 1;
    for (let index = layout.rowIndex + 1; index < nextHeaderIndex; index += 1) {
        const row = rows[index];
        const values = getNonEmptyValues(row);
        if (isFooterLikeRow(row)) {
            endRowIndex = index - 1;
            break;
        }
        if (values.length === 0) {
            const remainingNonEmpty = rows.slice(index + 1, nextHeaderIndex).some(candidate => getNonEmptyValues(candidate).length > 0);
            if (!remainingNonEmpty) {
                endRowIndex = index - 1;
                break;
            }
        }
    }
    return Math.max(layout.rowIndex, endRowIndex);
};

export const findDominantTabularSegment = (
    rows: CsvRow[],
    layouts: HeaderLayoutCandidate[],
): ReportSegmentCandidate | null => {
    if (layouts.length === 0) return null;
    const layoutIndexes = layouts.map(layout => layout.rowIndex).sort((left, right) => left - right);
    const candidates = layouts.map(layout => {
        const startRowIndex = layout.rowIndex;
        const endRowIndex = findSegmentEnd(rows, layout, layoutIndexes);
        const businessRowCount = countBusinessRows(rows, layout, startRowIndex + 1, endRowIndex);
        const preambleRows = rows.slice(0, layout.rowIndex).filter(row => getNonEmptyValues(row).length > 0).length;
        const trailingRows = rows.slice(endRowIndex + 1).filter(row => getNonEmptyValues(row).length > 0).length;
        const confidence = roundRatio(
            layout.score
            + Math.min(0.35, businessRowCount / 20)
            + (preambleRows > 0 || trailingRows > 0 ? 0.08 : 0),
        );
        return {
            headerLayout: layout,
            startRowIndex,
            endRowIndex,
            businessRowCount,
            confidence,
            mixedSignal: preambleRows > 0 || trailingRows > 0 || layout.rowIndex > 2,
        };
    });
    return candidates.sort((left, right) => right.confidence - left.confidence)[0] ?? null;
};
