import { describe, expect, it } from 'vitest';
import { buildPivotStackedChartState, PIVOT_FOLDED_OTHERS_KEY } from '../utils/pivotMatrixCharting';

describe('pivotMatrixCharting', () => {
    const plan = {
        chartType: 'stacked_bar',
        artifactType: 'pivot_matrix',
        aggregation: 'sum',
        groupByColumn: 'row_label',
        valueColumn: 'row_total',
        title: 'Wide Pivot',
        description: 'Wide pivot chart',
        artifactMetadata: {
            artifactType: 'pivot_matrix',
            matrixColumns: ['row_label', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'row_total'],
            matrixValueColumns: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'],
        },
    } as any;

    const rows = [
        { row_label: 'North', C1: 12, C2: 11, C3: 10, C4: 9, C5: 8, C6: 7, C7: 6, C8: 5, C9: 4, row_total: 72 },
        { row_label: 'South', C1: 3, C2: 2, C3: 1, C4: null, C5: null, C6: null, C7: null, C8: null, C9: null, row_total: 6 },
    ];

    it('keeps the top eight columns and folds the remainder into Others by row', () => {
        const result = buildPivotStackedChartState(plan, rows, 8, false);

        expect(result.visibleMatrixValueColumns).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
        expect(result.foldedMatrixValueColumns).toEqual(['C9']);
        expect(result.chartPlanMetadata?.matrixValueColumns).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', PIVOT_FOLDED_OTHERS_KEY]);
        expect(result.chartRows).toEqual([
            { ...rows[0], [PIVOT_FOLDED_OTHERS_KEY]: 4 },
            { ...rows[1], [PIVOT_FOLDED_OTHERS_KEY]: null },
        ]);
    });

    it('drops the synthetic Others column when the user hides folded columns', () => {
        const result = buildPivotStackedChartState(plan, rows, 8, true);

        expect(result.chartPlanMetadata?.matrixValueColumns).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
        expect(result.chartRows[0][PIVOT_FOLDED_OTHERS_KEY]).toBeUndefined();
    });

    it('restores all effective columns when column top N is set to all', () => {
        const result = buildPivotStackedChartState(plan, rows, null, false);

        expect(result.visibleMatrixValueColumns).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']);
        expect(result.foldedMatrixValueColumns).toEqual([]);
        expect(result.chartPlanMetadata?.matrixValueColumns).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']);
    });
});
