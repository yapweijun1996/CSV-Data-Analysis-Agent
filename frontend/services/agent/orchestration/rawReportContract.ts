import type {
    CsvData,
    DataOperation,
    DataPreparationPlan,
    ReportIntakeIr,
    ReportShapeProfile,
    UnpivotColumnsOperation,
} from '../../../types';
import { normalizeUnpivotLabelColumns } from '../execution/unpivotOperationUtils';
import { detectReportShape, getPrimaryShapeCandidate, isWideReportShape } from '../reportShapeDetector';
import { buildReshapeHypotheses } from '../reportShapeHypothesis';

const RAW_FIRST_SHAPES = new Set<ReportShapeProfile['primaryKind']>([
    'wide_crosstab',
    'multi_header_matrix',
    'mixed_report',
    'hierarchical_statement',
]);

const isMeaningfulHeaderLayer = (row: unknown[] | null | undefined) =>
    Array.isArray(row) && row.some(value => String(value ?? '').trim().length > 0);

const hasHierarchicalRowSemantics = (profile: ReportShapeProfile) =>
    profile.rowRoles.some(candidate =>
        ['group_header', 'subtotal', 'total'].includes(candidate.role) || (candidate.depth ?? 0) > 0,
    );

const getExpectedSeriesLabelLayerCount = (rawData: CsvData | null | undefined) => {
    if (!rawData) return 0;
    const profile = detectReportShape(rawData);
    const hypothesis = buildReshapeHypotheses(profile, rawData)[0] ?? null;
    if (!hypothesis) return 0;
    const inferredCount = hypothesis.seriesLabelColumns.length;
    const parserLayerCount = (rawData.headerLayers ?? []).filter(isMeaningfulHeaderLayer).length;
    return Math.max(inferredCount, parserLayerCount);
};

const getLatestUnpivotOperation = (operations: DataOperation[]): UnpivotColumnsOperation | null => {
    const operation = [...operations]
        .reverse()
        .find(candidate => candidate.type === 'unpivot_columns');
    return operation?.type === 'unpivot_columns' ? operation : null;
};

const getDroppedRawRowIndexesBeforeOperation = (
    operations: DataOperation[],
    stopOperationId: string | null,
) => {
    const dropped = new Set<number>();
    for (const operation of operations) {
        if (stopOperationId && operation.id === stopOperationId) {
            break;
        }
        if (operation.type !== 'drop_rows_by_index') {
            continue;
        }
        operation.indices.forEach(index => {
            if (Number.isInteger(index) && index >= 0) {
                dropped.add(index);
            }
        });
    }
    return [...dropped].sort((left, right) => left - right);
};

const getAdjustedPromoteHeaderRowIndexes = (
    rawHeaderRowIndexes: number[],
    operations: DataOperation[],
    promoteHeaderOperation: Extract<DataOperation, { type: 'promote_header_row' }>,
) => {
    const droppedBeforePromote = getDroppedRawRowIndexesBeforeOperation(
        operations,
        promoteHeaderOperation.id,
    );
    return rawHeaderRowIndexes
        .map(rawIndex => rawIndex - droppedBeforePromote.filter(index => index < rawIndex).length)
        .filter(index => index >= 0);
};

export const shouldRequireRawFirstInspection = (
    rawData: CsvData | null | undefined,
    rawIntakeIr?: ReportIntakeIr | null,
) => {
    if (!rawData) return false;
    const rawProfile = detectReportShape(rawData);
    const intakeSignalsRequireRaw = Boolean(rawIntakeIr?.provisionalTable) && (
        (rawIntakeIr.provisionalTable.metadataRowIndexes.length ?? 0) > 0
        || (rawIntakeIr.provisionalTable.parameterRowIndexes.length ?? 0) > 0
        || (rawIntakeIr.provisionalTable.repeatedHeaderRowIndexes.length ?? 0) > 0
        || rawIntakeIr.provisionalTable.headerLayerRowIndexes.length > 0
    );
    return (rawData.metadataRows?.length ?? 0) > 0
        || intakeSignalsRequireRaw
        || (rawData.headerLayers ?? []).some(isMeaningfulHeaderLayer)
        || RAW_FIRST_SHAPES.has(rawProfile.primaryKind);
};

export const validateOperationsAgainstRawReportContract = (
    rawData: CsvData | null | undefined,
    operations: DataOperation[],
    rawIntakeIr?: ReportIntakeIr | null,
): string | null => {
    if (!rawData) {
        return null;
    }

    const rawProfile = detectReportShape(rawData);
    const primaryCandidate = getPrimaryShapeCandidate(rawProfile);
    const primaryHypothesis = buildReshapeHypotheses(rawProfile, rawData)[0] ?? null;
    const unpivotOperation = getLatestUnpivotOperation(operations);
    const promoteHeaderOperation = operations.find(
        operation => operation.type === 'promote_header_row',
    );
    const intakeSignals = rawIntakeIr?.provisionalTable;
    const requiresWideReshape = Boolean(unpivotOperation) && (
        isWideReportShape(rawProfile)
        || Boolean(primaryHypothesis?.seriesLabelColumns.length)
        || rawProfile.primaryKind === 'mixed_report'
        || primaryHypothesis?.targetShape === 'long_statement_table'
        || Boolean(intakeSignals?.repeatedHeaderRowIndexes.length)
    );

    // Data-driven guard: reject standalone promote_header_row (without an
    // accompanying structural reshape like unpivot_columns) when the current
    // headers are already meaningful text. Promoting a data row as the header
    // on a dataset with valid column names would replace them with data values,
    // corrupting all downstream column references (planner, DuckDB, SQL).
    // When promote_header_row is paired with unpivot_columns, it is part of a
    // legitimate wide-report reshape and is validated by the shape-specific
    // rules below instead.
    const isStandalonePromote = promoteHeaderOperation?.type === 'promote_header_row'
        && !unpivotOperation
        && rawProfile.primaryKind !== 'mixed_report';
    if (isStandalonePromote) {
        const currentColumns = Object.keys(rawData.data[0] ?? {});
        const meaningfulCount = currentColumns.filter(column =>
            column.trim().length > 0
            && !/^_?unnamed_column_/i.test(column)
            && !/^\d+(\.\d+)?$/.test(column.trim()),
        ).length;
        if (meaningfulCount >= Math.max(2, Math.floor(currentColumns.length * 0.5))) {
            return 'The current dataset already has meaningful column headers. promote_header_row would replace valid headers with data values. Use drop_rows_by_index, drop_blank_rows, replace_values, or cast_column instead.';
        }
    }

    if (rawProfile.primaryKind === 'mixed_report' && primaryHypothesis) {
        const rawHeaderRows = primaryHypothesis.headerRowIndexes.filter(index => index >= 0);
        const allowedHeaderRows = new Set(rawHeaderRows);
        if (allowedHeaderRows.size > 0) {
            const adjustedHeaderRows = promoteHeaderOperation?.type === 'promote_header_row'
                ? new Set(
                    getAdjustedPromoteHeaderRowIndexes(rawHeaderRows, operations, promoteHeaderOperation),
                )
                : new Set<number>();
            if (
                promoteHeaderOperation?.type !== 'promote_header_row'
                || (!allowedHeaderRows.has(promoteHeaderOperation.rowIndex) && !adjustedHeaderRows.has(promoteHeaderOperation.rowIndex))
            ) {
                return `Mixed reports must promote a header row inside the dominant tabular block. Use promote_header_row with one of the detected header rows: ${[...allowedHeaderRows].join(', ')}.`;
            }
        }
    }

    if (!requiresWideReshape || !unpivotOperation) {
        return null;
    }

    const detailSeriesColumns = primaryCandidate?.detailSeriesColumns ?? [];
    const summarySeriesColumns = new Set((primaryCandidate?.summarySeriesColumns ?? []).map(column => column.toLowerCase()));
    const expectedSeriesLabelLayerCount = getExpectedSeriesLabelLayerCount(rawData);
    const labelColumns = normalizeUnpivotLabelColumns(unpivotOperation);
    const missingDetailSeries = detailSeriesColumns.filter(column => !unpivotOperation.sourceColumns.includes(column));
    const leakedSummaryColumns = unpivotOperation.sourceColumns.filter(column => summarySeriesColumns.has(column.toLowerCase()));
    const requiresHierarchicalColumns = hasHierarchicalRowSemantics(rawProfile)
        || primaryHypothesis?.targetShape === 'long_statement_table'
        || rawProfile.primaryKind === 'hierarchical_statement';

    if (!unpivotOperation.sourceColumnNameColumn || !unpivotOperation.sourceRowIndexColumn) {
        return 'Wide-report unpivot_columns must preserve sourceColumnNameColumn and sourceRowIndexColumn.';
    }
    if (missingDetailSeries.length > 0) {
        return `Wide-report unpivot_columns must cover every detected detail series column. Missing: ${missingDetailSeries.join(', ')}.`;
    }
    if (leakedSummaryColumns.length > 0) {
        return `Wide-report unpivot_columns must exclude summary or total columns from detail reshaping. Remove: ${leakedSummaryColumns.join(', ')}.`;
    }
    if (expectedSeriesLabelLayerCount > 0 && labelColumns.length < expectedSeriesLabelLayerCount) {
        return `Wide-report unpivot_columns must preserve all detected header label layers. Expected ${expectedSeriesLabelLayerCount} labelColumns entries.`;
    }
    if (requiresHierarchicalColumns && !unpivotOperation.rowClassColumn) {
        return 'Hierarchical wide reports must preserve rowClassColumn during unpivot_columns.';
    }
    if (requiresHierarchicalColumns && !unpivotOperation.hierarchyDepthColumn) {
        return 'Hierarchical wide reports must preserve hierarchyDepthColumn during unpivot_columns.';
    }

    return null;
};

export const validateDataPreparationPlanAgainstRawReportContract = (
    rawData: CsvData | null | undefined,
    plan: Pick<DataPreparationPlan, 'operations'> | null | undefined,
    rawIntakeIr?: ReportIntakeIr | null,
): string | null => validateOperationsAgainstRawReportContract(rawData, plan?.operations ?? [], rawIntakeIr);
