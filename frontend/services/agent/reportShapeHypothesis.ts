import type {
    CsvData,
    OutputColumnSpec,
    ReportShapeProfile,
    ReshapeHypothesis,
    SeriesLabelColumnSpec,
    SummaryColumnPolicy,
} from '../../types';
import { getHeaderBandByRole, getHeaderBandsByRole, getPrimaryShapeCandidate } from './reportShapeDetector';
import { sortDescriptorColumns } from './reportShapeUtils';

const buildEmittedColumns = (
    descriptorColumns: string[],
    seriesLabelColumns: SeriesLabelColumnSpec[],
    includeRowClass: boolean,
    includeHierarchyDepth: boolean,
): OutputColumnSpec[] => ([
    ...descriptorColumns.map(name => ({ name, type: 'string' as const, required: true })),
    { name: 'SeriesKey', type: 'string' as const, required: true },
    ...seriesLabelColumns.map(column => ({ name: column.outputColumn, type: 'string' as const, required: false })),
    { name: 'Value', type: 'number' as const, required: true },
    ...(includeRowClass ? [{ name: 'RowClass', type: 'string' as const, required: false }] : []),
    ...(includeHierarchyDepth ? [{ name: 'HierarchyDepth', type: 'number' as const, required: false }] : []),
    { name: 'SourceRowIndex', type: 'number' as const, required: false },
    { name: 'SourceColumnName', type: 'string' as const, required: false },
]);

const buildLogicalSteps = (
    hypothesis: Pick<ReshapeHypothesis, 'headerRowIndexes' | 'descriptorColumns' | 'detailSeriesColumns' | 'summarySeriesColumns' | 'summaryColumnPolicy'>,
    options: { seriesLabelColumns: SeriesLabelColumnSpec[]; includeRowClass: boolean; includeHierarchyDepth: boolean; headerAlreadyResolved: boolean },
) => ([
    ...(options.headerAlreadyResolved ? [] : [{
        type: 'select_header_bands' as const,
        params: { headerRowIndexes: hypothesis.headerRowIndexes },
    }]),
    {
        type: 'assign_column_roles' as const,
        params: {
            descriptorColumns: hypothesis.descriptorColumns,
            detailSeriesColumns: hypothesis.detailSeriesColumns,
            summarySeriesColumns: hypothesis.summarySeriesColumns,
        },
    },
    {
        type: 'drop_row_roles' as const,
        params: { roles: ['noise', 'comment'] },
    },
    ...(options.headerAlreadyResolved ? [] : [{
        type: 'promote_headers' as const,
        params: { rowIndex: hypothesis.headerRowIndexes[0] ?? 0 },
    }]),
    {
        type: 'unpivot_detail_series' as const,
        params: {
            sourceColumns: hypothesis.detailSeriesColumns,
            keyColumn: 'SeriesKey',
            valueColumn: 'Value',
            summaryColumnPolicy: hypothesis.summaryColumnPolicy,
        },
    },
    ...(options.seriesLabelColumns.length > 0 ? [{
        type: 'emit_series_label' as const,
        params: { columns: options.seriesLabelColumns },
    }] : []),
    ...(options.includeRowClass ? [{
        type: 'emit_row_class' as const,
        params: { column: 'RowClass' },
    }] : []),
    {
        type: 'cast_value_column' as const,
        params: { column: 'Value', targetType: 'number' },
    },
    {
        type: 'preserve_source_coordinates' as const,
        params: {
            sourceRowIndexColumn: 'SourceRowIndex',
            sourceColumnNameColumn: 'SourceColumnName',
        },
    },
]);

const buildStructuredTabularColumns = (
    descriptorColumns: string[],
    valueColumns: string[],
    options: { includeRowClass: boolean; includeHierarchyDepth: boolean },
): OutputColumnSpec[] => ([
    ...sortDescriptorColumns(descriptorColumns).map(name => ({ name, type: 'string' as const, required: true })),
    ...valueColumns.map(name => ({ name, type: 'number' as const, required: true })),
    ...(options.includeRowClass ? [{ name: 'RowClass', type: 'string' as const, required: false }] : []),
    ...(options.includeHierarchyDepth ? [{ name: 'HierarchyDepth', type: 'number' as const, required: false }] : []),
    { name: 'SourceRowIndex', type: 'number' as const, required: false },
]);

const buildStructuredTabularSteps = (
    hypothesis: Pick<ReshapeHypothesis, 'descriptorColumns' | 'detailSeriesColumns' | 'summarySeriesColumns'>,
    options: { includeRowClass: boolean },
) => ([
    {
        type: 'assign_column_roles' as const,
        params: {
            descriptorColumns: hypothesis.descriptorColumns,
            detailSeriesColumns: hypothesis.detailSeriesColumns,
            summarySeriesColumns: hypothesis.summarySeriesColumns,
        },
    },
    {
        type: 'drop_row_roles' as const,
        params: { roles: ['noise', 'comment'] },
    },
    ...(options.includeRowClass ? [{
        type: 'emit_row_class' as const,
        params: { column: 'RowClass' },
    }] : []),
    {
        type: 'preserve_source_coordinates' as const,
        params: { sourceRowIndexColumn: 'SourceRowIndex' },
    },
]);

const buildHypothesis = (
    id: string,
    profile: ReportShapeProfile,
    data: CsvData | null,
    summaryColumnPolicy: SummaryColumnPolicy,
    options: { includeSeriesLabel: boolean; includeRowClass: boolean; preserveHierarchyDepth: boolean },
): ReshapeHypothesis | null => {
    const primary = getPrimaryShapeCandidate(profile);
    if (!primary) return null;
    const descriptorColumns = sortDescriptorColumns(primary.descriptorColumns);

    const columnHeaderBand = getHeaderBandByRole(profile, 'column_header');
    const seriesLabelBands = options.includeSeriesLabel ? getHeaderBandsByRole(profile, 'series_label_header') : [];
    const headerAlreadyResolved = Boolean(
        data
        && ((data.headerLayers?.length ?? 0) > 0 || (data.headerDepth ?? 1) > 1)
        && (columnHeaderBand?.rowIndexes ?? []).some(index => index < 0),
    );
    const hierarchyRows = profile.rowRoles.filter(candidate => ['group_header', 'subtotal', 'total'].includes(candidate.role));
    const rowHierarchyPresent = hierarchyRows.some(candidate => candidate.role === 'group_header' || candidate.role === 'subtotal')
        || hierarchyRows.length >= 2;
    const isStructuredTabular = !columnHeaderBand && ['already_tabular', 'hierarchical_statement'].includes(profile.primaryKind);
    const targetShape = profile.primaryKind === 'already_tabular'
        ? 'row_table'
        : rowHierarchyPresent
            ? 'long_statement_table'
            : 'long_fact_table';
    const seriesLabelColumns: SeriesLabelColumnSpec[] = seriesLabelBands.map((band, index) => ({
        outputColumn: `SeriesLabelL${index + 1}`,
        sourceHeaderRowIndex: band.rowIndexes[0] ?? -1,
        layerIndex: band.layerIndex ?? index + 1,
    }));
    const headerRowIndexes = [
        ...(columnHeaderBand?.rowIndexes ?? []),
        ...seriesLabelBands.flatMap(band => band.rowIndexes),
    ];
    const emittedColumns = isStructuredTabular
        ? buildStructuredTabularColumns(
            descriptorColumns,
            primary.detailSeriesColumns,
            {
                includeRowClass: options.includeRowClass && rowHierarchyPresent,
                includeHierarchyDepth: options.preserveHierarchyDepth && rowHierarchyPresent,
            },
        )
        : buildEmittedColumns(
            descriptorColumns,
            seriesLabelColumns,
            options.includeRowClass && rowHierarchyPresent,
            options.preserveHierarchyDepth && rowHierarchyPresent,
        );

    const hypothesis: ReshapeHypothesis = {
        id,
        sourceCandidateId: primary.id,
        confidence: primary.score,
        targetShape,
        headerRowIndexes,
        descriptorColumns,
        detailSeriesColumns: primary.detailSeriesColumns,
        summarySeriesColumns: primary.summarySeriesColumns,
        summaryColumnPolicy,
        seriesLabelColumns,
        ...(options.preserveHierarchyDepth && rowHierarchyPresent ? { hierarchyDepthColumn: 'HierarchyDepth' } : {}),
        emittedColumns,
        logicalSteps: [],
    };
    hypothesis.logicalSteps = isStructuredTabular
        ? buildStructuredTabularSteps(hypothesis, {
            includeRowClass: options.includeRowClass && rowHierarchyPresent,
        })
        : buildLogicalSteps(hypothesis, {
            seriesLabelColumns,
            includeRowClass: options.includeRowClass && rowHierarchyPresent,
            includeHierarchyDepth: options.preserveHierarchyDepth && rowHierarchyPresent,
            headerAlreadyResolved,
        });
    return hypothesis;
};

export const buildReshapeHypotheses = (profile: ReportShapeProfile, data: CsvData | null = null): ReshapeHypothesis[] => {
    const primary = buildHypothesis('reshape-primary', profile, data, 'exclude_from_detail_unpivot', {
        includeSeriesLabel: true,
        includeRowClass: true,
        preserveHierarchyDepth: true,
    });
    const fallback = buildHypothesis('reshape-fallback', profile, data, 'preserve_as_separate_columns', {
        includeSeriesLabel: false,
        includeRowClass: true,
        preserveHierarchyDepth: false,
    });

    return [primary, fallback].filter((candidate): candidate is ReshapeHypothesis => Boolean(candidate));
};

export const getPrimaryReshapeHypothesis = (profile: ReportShapeProfile, data: CsvData | null = null) =>
    buildReshapeHypotheses(profile, data)[0] ?? null;
