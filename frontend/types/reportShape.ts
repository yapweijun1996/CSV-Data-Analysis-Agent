import type { CsvCellValue } from './intake';

export type ReportShapeKind =
    | 'already_tabular'
    | 'wide_crosstab'
    | 'multi_header_matrix'
    | 'hierarchical_statement'
    | 'mixed_report'
    | 'unknown';

export type HeaderBandRole =
    | 'report_title'
    | 'report_metadata'
    | 'column_header'
    | 'series_label_header'
    | 'repeated_header'
    | 'unknown';

export type ReportShapeColumnRole =
    | 'descriptor'
    | 'detail_series'
    | 'summary_series'
    | 'placeholder'
    | 'metadata'
    | 'unknown';

export type RowRole =
    | 'fact'
    | 'group_header'
    | 'subtotal'
    | 'total'
    | 'comment'
    | 'noise'
    | 'unknown';

export interface ShapeEvidence {
    rowIndexes?: number[];
    columnIndexes?: number[];
    columnNames?: string[];
    sampleValues?: CsvCellValue[];
}

export interface ShapeSignal {
    key: string;
    kind: 'boolean' | 'count' | 'ratio' | 'class';
    value: boolean | number | string | string[];
    confidence: number;
    evidence?: ShapeEvidence;
}

export interface HeaderBandCandidate {
    rowIndexes: number[];
    role: HeaderBandRole;
    confidence: number;
    layerIndex?: number;
}

export interface ColumnRoleCandidate {
    columnName: string;
    role: ReportShapeColumnRole;
    confidence: number;
}

export interface RowRoleCandidate {
    rowIndex: number;
    role: RowRole;
    confidence: number;
    depth?: number;
}

export type SummarySeriesKind =
    | 'total'
    | 'derived_metric'
    | 'comparison'
    | 'allocation'
    | 'rollup'
    | 'unknown';

export interface SummarySeriesCandidate {
    columnName: string;
    summaryKind: SummarySeriesKind;
    confidence: number;
}

export interface ReportShapeCandidate {
    id: string;
    kind: ReportShapeKind;
    score: number;
    headerBands: HeaderBandCandidate[];
    descriptorColumns: string[];
    detailSeriesColumns: string[];
    summarySeriesColumns: string[];
    summarySeriesCandidates: SummarySeriesCandidate[];
    requiredSignalKeys: string[];
}

export interface ReportShapeProfile {
    primaryKind: ReportShapeKind;
    confidence: number;
    candidates: ReportShapeCandidate[];
    signals: ShapeSignal[];
    headerBands: HeaderBandCandidate[];
    columnRoles: ColumnRoleCandidate[];
    rowRoles: RowRoleCandidate[];
}

export type ReshapeTargetShape =
    | 'row_table'
    | 'long_fact_table'
    | 'long_statement_table';

export type SummaryColumnPolicy =
    | 'exclude_from_detail_unpivot'
    | 'preserve_as_separate_columns'
    | 'emit_as_row_class';

export interface LogicalReshapeStep {
    type:
        | 'select_header_bands'
        | 'drop_row_roles'
        | 'assign_column_roles'
        | 'promote_headers'
        | 'unpivot_detail_series'
        | 'emit_series_label'
        | 'emit_row_class'
        | 'cast_value_column'
        | 'preserve_source_coordinates';
    params: Record<string, unknown>;
}

export interface OutputColumnSpec {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    required: boolean;
}

export interface SeriesLabelColumnSpec {
    outputColumn: string;
    sourceHeaderRowIndex: number;
    layerIndex: number;
}

export interface ReshapeHypothesis {
    id: string;
    sourceCandidateId: string;
    confidence: number;
    targetShape: ReshapeTargetShape;
    headerRowIndexes: number[];
    descriptorColumns: string[];
    detailSeriesColumns: string[];
    summarySeriesColumns: string[];
    summaryColumnPolicy: SummaryColumnPolicy;
    seriesLabelColumns: SeriesLabelColumnSpec[];
    hierarchyDepthColumn?: string;
    emittedColumns: OutputColumnSpec[];
    logicalSteps: LogicalReshapeStep[];
}

export type VerificationStatus = 'pass' | 'warn' | 'fail';

export interface VerificationSignal {
    key: string;
    status: VerificationStatus;
    value: boolean | number | string;
    threshold?: string;
    evidence?: ShapeEvidence;
    detail?: Record<string, unknown>;
}

export interface VerificationReport {
    overallStatus: VerificationStatus;
    signals: VerificationSignal[];
    blockingSignalKeys: string[];
}
