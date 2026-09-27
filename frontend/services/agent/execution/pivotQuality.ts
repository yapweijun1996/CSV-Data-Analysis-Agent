import type { AnalysisPlan, CsvRow } from '../../../types';
import { evaluateAggregationQuality } from './aggregationQuality';

export type PivotQualityCode =
    | 'empty_result'
    | 'flat_metric'
    | 'no_total'
    | 'low_signal';

export interface PivotQualityAssessment {
    status: 'useful' | 'blocked';
    code?: PivotQualityCode;
    message?: string;
    detail?: Record<string, unknown>;
}

const countNumericMatrixColumns = (rows: CsvRow[], matrixValueColumns: string[]) =>
    matrixValueColumns.filter(column =>
        rows.some(row => typeof row[column] === 'number' && Number.isFinite(row[column] as number)),
    ).length;

export const evaluatePivotQuality = ({
    rows,
    matrixValueColumns,
    requestedColumnDimensions,
}: {
    rows: CsvRow[];
    matrixValueColumns: string[];
    requestedColumnDimensions: string[];
}): PivotQualityAssessment => {
    if (rows.length === 0) {
        return {
            status: 'blocked',
            code: 'empty_result',
            message: 'The pivot request did not produce any rows.',
            detail: {
                rowCount: 0,
                matrixValueColumns,
            },
        };
    }

    if (requestedColumnDimensions.length > 0) {
        const numericMatrixColumns = countNumericMatrixColumns(rows, matrixValueColumns);
        if (numericMatrixColumns <= 1) {
            return {
                status: 'blocked',
                code: 'flat_metric',
                message: 'The pivot request only produced one effective matrix column, so a normal grouped card is a better fit.',
                detail: {
                    matrixValueColumns,
                    numericMatrixColumns,
                    requestedColumnDimensions,
                },
            };
        }
    }

    const qualityPlan: AnalysisPlan = {
        chartType: 'bar',
        title: 'Pivot Quality',
        description: 'Pivot quality check',
        groupByColumn: 'row_label',
        valueColumn: 'row_total',
        aggregation: 'sum',
    };
    const quality = evaluateAggregationQuality(qualityPlan, rows);
    if (quality.qualityWarning) {
        const numericMatrixColumns = requestedColumnDimensions.length > 0
            ? countNumericMatrixColumns(rows, matrixValueColumns)
            : 0;
        const isTrueMatrix = requestedColumnDimensions.length > 0 && numericMatrixColumns > 1;
        if (isTrueMatrix && quality.qualityWarning === 'flat_metric' && quality.metrics.groups <= 1) {
            return { status: 'useful' };
        }

        return {
            status: 'blocked',
            code: quality.qualityWarning === 'low_value'
                ? 'low_signal'
                : quality.qualityWarning === 'no_total'
                    ? 'no_total'
                    : 'flat_metric',
            message: quality.commentary,
            detail: {
                matrixValueColumns,
                metrics: quality.metrics,
            },
        };
    }

    return { status: 'useful' };
};
