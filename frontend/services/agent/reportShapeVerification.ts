import type {
    CsvData,
    DataPreparationPlan,
    ReshapeHypothesis,
    SummarySeriesCandidate,
    VerificationReport,
    VerificationSignal,
    VerificationStatus,
} from '../../types';
import { robustParseFloat } from '../data/dataProfiler';
import { normalizeUnpivotHierarchyDepthMappings, normalizeUnpivotLabelColumns } from './execution/unpivotOperationUtils';
import { detectReportShape, getHeaderBandByRole, getHeaderBandsByRole, getPrimaryShapeCandidate, isWideReportShape } from './reportShapeDetector';
import { buildReshapeHypotheses } from './reportShapeHypothesis';
import { isRepeatedAttributeBundleTable } from './repeatedBundleTableDetector';
import type { CleaningRuntimeState } from './orchestration/cleaningRuntimePolicy';
import {
    SUMMARY_LABEL_PATTERN,
    isSummaryLike,
    buildDistinctCount,
    getColumns,
    getRows,
    getRowValues,
    isBlankRow,
    isFooterLikeRow,
    isNumericLike,
    roundRatio,
} from './reportShapeUtils';

const BLOCKING_SIGNAL_KEYS = [
    'raw_inspection_completed',
    'dominant_block_resolved',
    'label_layer_retention_complete',
    'wide_reshape_contract_complete',
    'header_band_resolved',
    'detail_series_coverage_rate',
    'multi_header_layer_retention_rate',
    'summary_series_exclusion_rate',
    'hierarchy_depth_retention_rate',
    'numeric_parse_rate',
    'noise_leakage_rate',
    'repeated_header_leakage_rate',
    'suspicious_collapse_score',
    'summary_like_series_key_leakage',
    // AGENT-310: wide_crosstab_persistence removed from blocking signals.
    // Wide crosstab format is handled by AI at runtime (data.mutate reshape
    // or direct analysis of available columns). It should not block automatic
    // analysis — trust AI to decide whether reshaping is needed.
    'mixed_report_block_resolution',
];

type CleaningVerificationRuntimeContext = Pick<CleaningRuntimeState, 'inspectedRaw' | 'dominantBlockResolved'>;

const getUnpivotOperationEntry = (plan: DataPreparationPlan | null | undefined) => {
    const operations = plan?.operations ?? [];
    for (let index = operations.length - 1; index >= 0; index -= 1) {
        const operation = operations[index];
        if (operation.type === 'unpivot_columns') {
            return { operation, index };
        }
    }
    return null;
};

const getUnpivotOperation = (plan: DataPreparationPlan | null | undefined) =>
    getUnpivotOperationEntry(plan)?.operation ?? null;

const getUnpivotLabelColumns = (plan: DataPreparationPlan | null | undefined) => {
    const unpivot = getUnpivotOperation(plan);
    return unpivot ? normalizeUnpivotLabelColumns(unpivot) : [];
};

const getValueColumn = (plan: DataPreparationPlan | null | undefined, cleanedData: CsvData | null) => {
    const unpivot = getUnpivotOperation(plan);
    if (unpivot) return unpivot.valueColumn;
    const columns = getColumns(cleanedData);
    return columns.find(column => /^(?:value|amount)$/i.test(column)) ?? null;
};

const getMatchingColumn = (columns: string[], candidate: string | null | undefined) => {
    if (!candidate) return null;
    const exactMatch = columns.find(column => column === candidate);
    if (exactMatch) return exactMatch;
    const normalizedCandidate = candidate.trim().toLowerCase();
    return columns.find(column => column.trim().toLowerCase() === normalizedCandidate) ?? null;
};

const resolveRenamedColumn = (
    plan: DataPreparationPlan | null | undefined,
    startIndex: number,
    originalColumn: string,
    cleanedData: CsvData | null,
) => {
    const operations = plan?.operations ?? [];
    const cleanedColumns = getColumns(cleanedData);
    let currentColumn = originalColumn;

    for (let index = startIndex + 1; index < operations.length; index += 1) {
        const operation = operations[index];
        if (operation.type !== 'rename_columns') continue;
        const mapping = operation.mappings.find(candidate =>
            candidate.from.trim().toLowerCase() === currentColumn.trim().toLowerCase());
        if (mapping) {
            currentColumn = mapping.to;
        }
    }

    return getMatchingColumn(cleanedColumns, currentColumn);
};

const getSeriesKeyColumn = (plan: DataPreparationPlan | null | undefined, cleanedData: CsvData | null) => {
    const columns = getColumns(cleanedData);
    const unpivotEntry = getUnpivotOperationEntry(plan);
    if (unpivotEntry) {
        const directMatch = getMatchingColumn(columns, unpivotEntry.operation.keyColumn);
        if (directMatch) return directMatch;
        const renamedMatch = resolveRenamedColumn(plan, unpivotEntry.index, unpivotEntry.operation.keyColumn, cleanedData);
        if (renamedMatch) return renamedMatch;
    }
    return columns.find(column => /serieskey|project(?:_|\s*)code|projectkey/i.test(column)) ?? null;
};

const getRepeatedHeaderLeakageRate = (cleanedData: CsvData | null) => {
    const rows = getRows(cleanedData);
    if (rows.length === 0) return 0;
    const columns = getColumns(cleanedData);
    const normalizedColumns = columns.map(column => column.trim().toLowerCase());
    // Require positional alignment: a value must match the column name at the same
    // index, not just appear anywhere in the column name set. This avoids false
    // positives when generic column names (e.g., "UNITS", "INVOICE") appear as
    // ordinary data values in unrelated positions.
    const leakedCount = rows.filter(row => {
        const values = getRowValues(row).map(value => value.trim().toLowerCase());
        const nonBlankValues = values.filter(Boolean);
        if (nonBlankValues.length === 0) return false;
        let positionalMatches = 0;
        for (let i = 0; i < Math.min(values.length, normalizedColumns.length); i++) {
            if (values[i] && normalizedColumns[i] && values[i] === normalizedColumns[i]) {
                positionalMatches++;
            }
        }
        return positionalMatches >= Math.max(2, Math.floor(normalizedColumns.length * 0.5));
    }).length;
    return roundRatio(leakedCount / rows.length);
};

const getNoiseLeakageRate = (cleanedData: CsvData | null) => {
    const rows = getRows(cleanedData);
    if (rows.length === 0) return 1;
    const noiseCount = rows.filter(row => {
        const values = getRowValues(row);
        if (isBlankRow(row) || isFooterLikeRow(row)) return true;
        return values.filter(Boolean).length === 1 && values.join(' ').length >= 24;
    }).length;
    return roundRatio(noiseCount / rows.length);
};

const getNumericParseRate = (cleanedData: CsvData | null, valueColumn: string | null) => {
    if (!valueColumn) return 1;
    const rows = getRows(cleanedData).filter(row => String(row[valueColumn] ?? '').trim().length > 0);
    if (rows.length === 0) return 1;
    const parsed = rows.filter(row => robustParseFloat(row[valueColumn]) !== null).length;
    return roundRatio(parsed / rows.length);
};

// --- Aggregate Integrity Check ---
// Compares SUM of each numeric column before and after cleaning.
// Deviation is expected when rows are intentionally dropped (metadata, footers),
// so this is a non-blocking warning signal, not a hard fail.

const AGGREGATE_INTEGRITY_WARN_THRESHOLD = 0.001;  // > 0.1% deviation → warn
const AGGREGATE_INTEGRITY_FAIL_THRESHOLD = 0.05;   // > 5% deviation → fail

/**
 * Returns the maximum relative SUM deviation across all numeric columns.
 * 0 = perfect match, 1 = 100% deviation. Returns null when no numeric columns exist.
 */
export const computeAggregateIntegrityDeviation = (
    rawData: CsvData | null,
    cleanedData: CsvData | null,
): { maxDeviation: number; column: string | null } | null => {
    const rawRows = rawData?.data ?? [];
    const cleanedRows = cleanedData?.data ?? [];
    if (rawRows.length === 0 || cleanedRows.length === 0) return null;

    const columns = getColumns(cleanedData);
    if (columns.length === 0) return null;

    // Find numeric columns: those where ≥50% of cleaned values parse as numbers
    const numericCols = columns.filter(col => {
        const values = cleanedRows.map(r => r[col]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        if (values.length === 0) return false;
        const parsedCount = values.filter(v => robustParseFloat(v) !== null).length;
        return parsedCount / values.length >= 0.5;
    });

    if (numericCols.length === 0) return null;

    // Only compare columns that actually exist in both raw and cleaned data.
    // After reshaping (e.g. unpivot), cleaned columns like "Value" won't exist
    // in raw rows, so comparing their sums is meaningless.
    const rawColumns = new Set(getColumns(rawData));
    const sharedNumericCols = numericCols.filter(col => rawColumns.has(col));
    if (sharedNumericCols.length === 0) return null;

    let maxDeviation = 0;
    let maxDeviationCol: string | null = null;

    for (const col of sharedNumericCols) {
        const rawSum = rawRows.reduce((sum, row) => {
            const v = robustParseFloat(row[col]);
            return sum + (v ?? 0);
        }, 0);
        const cleanedSum = cleanedRows.reduce((sum, row) => {
            const v = robustParseFloat(row[col]);
            return sum + (v ?? 0);
        }, 0);

        const denominator = Math.abs(rawSum) || 1;
        const deviation = Math.abs(rawSum - cleanedSum) / denominator;

        if (deviation > maxDeviation) {
            maxDeviation = deviation;
            maxDeviationCol = col;
        }
    }

    return { maxDeviation: roundRatio(maxDeviation), column: maxDeviationCol };
};

const getStatus = (value: number, passThreshold: number, warnThreshold: number): VerificationStatus => {
    if (value >= passThreshold) return 'pass';
    if (value >= warnThreshold) return 'warn';
    return 'fail';
};

const buildSignal = (
    key: string,
    value: boolean | number | string,
    status: VerificationStatus,
    threshold?: string,
    detail?: Record<string, unknown>,
): VerificationSignal => ({
    key,
    value,
    status,
    ...(threshold ? { threshold } : {}),
    ...(detail ? { detail } : {}),
});

const getDescriptorPreservationRate = (descriptorColumns: string[], cleanedData: CsvData | null) => {
    if (descriptorColumns.length === 0) return 1;
    const cleanedColumns = new Set(getColumns(cleanedData).map(column => column.toLowerCase()));
    const preserved = descriptorColumns.filter(column => cleanedColumns.has(column.toLowerCase())).length;
    return roundRatio(preserved / descriptorColumns.length);
};

const getFactKeyUniquenessRate = (cleanedData: CsvData | null, descriptorColumns: string[], seriesKeyColumn: string | null) => {
    if (!cleanedData?.data?.length || !seriesKeyColumn) return 1;
    const sourceRowIndexColumn = getColumns(cleanedData).find(column => /^sourcerowindex$/i.test(column));
    const keyColumns = [...descriptorColumns, seriesKeyColumn, ...(sourceRowIndexColumn ? [sourceRowIndexColumn] : [])]
        .filter(column => getColumns(cleanedData).includes(column));
    if (keyColumns.length === 0) return 1;
    const distinctCount = buildDistinctCount(cleanedData.data, keyColumns);
    return roundRatio(distinctCount / cleanedData.data.length);
};

const getSuspiciousCollapseScore = (
    rawData: CsvData | null,
    cleanedData: CsvData | null,
    descriptorColumns: string[],
    seriesKeyColumn: string | null,
) => {
    const rawRows = getRows(rawData);
    const cleanedRows = getRows(cleanedData);
    if (rawRows.length === 0 || cleanedRows.length === 0 || descriptorColumns.length === 0 || !seriesKeyColumn) return 0;
    const rawBusinessRows = rawRows.filter(row => {
        const values = getRowValues(row);
        return values.length >= 2 && values.some(isNumericLike);
    }).length;
    const descriptorDistinct = buildDistinctCount(cleanedRows, descriptorColumns.filter(column => getColumns(cleanedData).includes(column)));
    const seriesDistinct = buildDistinctCount(cleanedRows, [seriesKeyColumn]);
    if (rawBusinessRows < 8 || cleanedRows.length < 8 || seriesDistinct < 6) return 0;
    const retention = descriptorDistinct / rawBusinessRows;
    return roundRatio(Math.max(0, 1 - retention));
};

const getMultiHeaderLayerRetentionRate = (
    rawProfileHypothesis: ReshapeHypothesis | null,
    plan: DataPreparationPlan | null | undefined,
    requiresReshape: boolean,
) => {
    if (!requiresReshape) return 1;
    if (!rawProfileHypothesis) return 1;
    if (rawProfileHypothesis.seriesLabelColumns.length === 0) return 1;
    const labelColumns = getUnpivotLabelColumns(plan);
    if (labelColumns.length === 0) return 0;
    const expectedColumns = rawProfileHypothesis.seriesLabelColumns.map(column => column.outputColumn);
    const retainedColumns = labelColumns.filter(column => expectedColumns.includes(column.outputColumn)).length;
    return roundRatio(retainedColumns / expectedColumns.length);
};

const getMultiHeaderLayerRetentionDetail = (
    rawProfileHypothesis: ReshapeHypothesis | null,
    plan: DataPreparationPlan | null | undefined,
    requiresReshape: boolean,
) => {
    if (!requiresReshape || !rawProfileHypothesis || rawProfileHypothesis.seriesLabelColumns.length === 0) {
        return undefined;
    }

    const labelColumns = getUnpivotLabelColumns(plan);
    const expectedLabelColumns = rawProfileHypothesis.seriesLabelColumns.map(column => column.outputColumn);
    const actualLabelColumns = labelColumns.map(column => column.outputColumn);

    return {
        expectedLabelLayerCount: expectedLabelColumns.length,
        actualLabelLayerCount: actualLabelColumns.length,
        expectedLabelColumns,
        actualLabelColumns,
    };
};

/** Signal keys that are non-blocking and advisory-only — they should not be surfaced as failure signals. */
const NON_BLOCKING_ADVISORY_SIGNAL_KEYS = [
    'aggregate_integrity',
    'summary_total_consistency_delta',
    // AGENT-310: wide crosstab is advisory — AI handles reshape at runtime
    'wide_crosstab_persistence',
];
export const RECOVERABLE_CLEANING_SIGNAL_KEYS = [
    'noise_leakage_rate',
    'repeated_header_leakage_rate',
    'summary_like_series_key_leakage',
] as const;
export type RecoverableCleaningSignalKey = typeof RECOVERABLE_CLEANING_SIGNAL_KEYS[number];

export const isRecoverableCleaningSignalKey = (
    signalKey: string | null | undefined,
): signalKey is RecoverableCleaningSignalKey =>
    typeof signalKey === 'string' && RECOVERABLE_CLEANING_SIGNAL_KEYS.includes(signalKey as RecoverableCleaningSignalKey);

export const getVerificationSignalValue = (
    report: VerificationReport,
    key: string,
): number | boolean | string | null => report.signals.find(signal => signal.key === key)?.value ?? null;

export const getVerificationFailureSignal = (report: VerificationReport): VerificationSignal | null =>
    [
        'empty_dataset_guard',
        'raw_inspection_completed',
        'dominant_block_resolved',
        'label_layer_retention_complete',
        'mixed_report_block_resolution',
        // AGENT-310: wide_crosstab_persistence removed — AI handles at runtime
        'wide_reshape_contract_complete',
        'summary_like_series_key_leakage',
        'multi_header_layer_retention_rate',
        'summary_series_exclusion_rate',
        'suspicious_collapse_score',
        'hierarchy_depth_retention_rate',
        'noise_leakage_rate',
        'repeated_header_leakage_rate',
        'numeric_parse_rate',
        'detail_series_coverage_rate',
        'descriptor_preservation_rate',
        'header_band_resolved',
    ]
        .map(key => report.signals.find(candidate => candidate.key === key && candidate.status === 'fail'))
        .find(Boolean)
        ?? report.signals.find(candidate =>
            candidate.status === 'fail' && !NON_BLOCKING_ADVISORY_SIGNAL_KEYS.includes(candidate.key),
        )
        ?? null;

export const getVerificationFailureDetail = (report: VerificationReport): string | null => {
    const signal = getVerificationFailureSignal(report);
    if (!signal?.detail) return null;

    const expected = typeof signal.detail.expectedLabelLayerCount === 'number'
        ? signal.detail.expectedLabelLayerCount
        : null;
    const actual = typeof signal.detail.actualLabelLayerCount === 'number'
        ? signal.detail.actualLabelLayerCount
        : null;

    if (expected !== null && actual !== null) {
        return `signal=${signal.key}; expected_label_layers=${expected}; actual_label_layers=${actual}`;
    }

    return `signal=${signal.key}`;
};

const getSummarySeriesExclusionRate = (
    summarySeriesCandidates: SummarySeriesCandidate[],
    plan: DataPreparationPlan | null | undefined,
    requiresReshape: boolean,
) => {
    if (!requiresReshape) return 1;
    if (summarySeriesCandidates.length === 0) return 1;
    const unpivot = getUnpivotOperation(plan);
    if (!unpivot) return 1;
    const excluded = summarySeriesCandidates.filter(candidate => !unpivot.sourceColumns.includes(candidate.columnName)).length;
    return roundRatio(excluded / summarySeriesCandidates.length);
};

const shouldRequireRawInspection = (rawData: CsvData | null, rawProfile: ReturnType<typeof detectReportShape>) =>
    (rawData?.metadataRows?.length ?? 0) > 0
    || (rawData?.headerLayers ?? []).some(row => row.some(value => String(value ?? '').trim().length > 0))
    || ['wide_crosstab', 'multi_header_matrix', 'mixed_report', 'hierarchical_statement'].includes(rawProfile.primaryKind);

const getDetailSeriesCoverageRate = (
    detailSeriesColumns: string[],
    plan: DataPreparationPlan | null | undefined,
    requiresReshape: boolean,
) => {
    if (!requiresReshape) return 1;
    if (detailSeriesColumns.length === 0) return 1;
    const unpivot = getUnpivotOperation(plan);
    if (!unpivot) return 0;
    const covered = detailSeriesColumns.filter(column => unpivot.sourceColumns.includes(column)).length;
    return roundRatio(covered / detailSeriesColumns.length);
};

const getSummaryTotalConsistencyDelta = (
    cleanedData: CsvData | null,
    plan: DataPreparationPlan | null | undefined,
) => {
    const unpivot = getUnpivotOperation(plan);
    const labelColumns = getUnpivotLabelColumns(plan);
    const summaryKeys = labelColumns
        .flatMap(column => column.mappings)
        .filter(mapping => SUMMARY_LABEL_PATTERN.test(String(mapping.label ?? '')))
        .map(mapping => mapping.sourceColumn);
    if (!unpivot || summaryKeys.length === 0 || !cleanedData?.data?.length) return null;
    if (summaryKeys.length === 0) return null;
    const seriesKeyColumn = unpivot.keyColumn;
    const valueColumn = unpivot.valueColumn;
    const summaryRows = cleanedData.data.filter(row => summaryKeys.includes(String(row[seriesKeyColumn] ?? '')));
    if (summaryRows.length === 0) return null;
    const absoluteSummary = summaryRows.reduce((sum, row) => sum + Math.abs(robustParseFloat(row[valueColumn]) ?? 0), 0);
    const absoluteAll = cleanedData.data.reduce((sum, row) => sum + Math.abs(robustParseFloat(row[valueColumn]) ?? 0), 0);
    if (absoluteAll === 0) return 0;
    return roundRatio(absoluteSummary / absoluteAll);
};

const getHeaderBandResolved = (hypothesis: ReshapeHypothesis | null, rawProfile: ReturnType<typeof detectReportShape>) => {
    const columnHeaderBand = getHeaderBandByRole(rawProfile, 'column_header');
    if (!columnHeaderBand) return true;
    if (!hypothesis) return false;
    if (columnHeaderBand.rowIndexes.every(index => index < 0)) {
        return true;
    }
    return columnHeaderBand.rowIndexes.some(index => hypothesis.headerRowIndexes.includes(index));
};

const getHierarchyDepthRetentionRate = (
    hypothesis: ReshapeHypothesis | null,
    cleanedData: CsvData | null,
    plan: DataPreparationPlan | null | undefined,
) => {
    if (!hypothesis?.hierarchyDepthColumn) return 1;
    const cleanedColumns = getColumns(cleanedData);
    const unpivot = getUnpivotOperation(plan);
    if (cleanedColumns.includes(hypothesis.hierarchyDepthColumn)) return 1;
    if (!unpivot?.hierarchyDepthColumn || unpivot.hierarchyDepthColumn !== hypothesis.hierarchyDepthColumn) return 0;
    const mappings = normalizeUnpivotHierarchyDepthMappings(unpivot);
    return mappings.length > 0 ? 1 : 0;
};

const getMixedReportBlockResolution = (
    rawProfile: ReturnType<typeof detectReportShape>,
    hypothesis: ReshapeHypothesis | null,
    cleanedShape: ReturnType<typeof detectReportShape>,
    plan: DataPreparationPlan | null | undefined,
) => {
    if (rawProfile.primaryKind !== 'mixed_report') return 1;
    const columnHeaderBands = getHeaderBandsByRole(rawProfile, 'column_header');
    if (columnHeaderBands.length === 0) return 1;
    if (!hypothesis) return 0;
    if (!getUnpivotOperation(plan)) return 0;
    const dominantHeaderResolved = columnHeaderBands[0].rowIndexes.some(index => hypothesis.headerRowIndexes.includes(index));
    if (!dominantHeaderResolved) return 0;
    return cleanedShape.primaryKind === 'mixed_report' && isWideReportShape(cleanedShape) ? 0 : 1;
};

const getSourceCoordinateRetention = (plan: DataPreparationPlan | null | undefined, cleanedData: CsvData | null) => {
    const unpivot = getUnpivotOperation(plan);
    if (unpivot) {
        return Boolean(unpivot.sourceColumnNameColumn && unpivot.sourceRowIndexColumn);
    }

    const cleanedColumns = getColumns(cleanedData).map(column => column.toLowerCase());
    return cleanedColumns.includes('sourcecolumnname') && cleanedColumns.includes('sourcerowindex');
};

const getWideReshapeContractComplete = (
    rawRequiresReshape: boolean,
    plan: DataPreparationPlan | null | undefined,
    cleanedData: CsvData | null,
    detailSeriesCoverageRate: number,
    summarySeriesExclusionRate: number,
) => {
    if (!rawRequiresReshape) return true;
    const unpivot = getUnpivotOperation(plan);
    const cleanedShape = detectReportShape(cleanedData);
    const cleanedStillWide = isWideSchemaTable(cleanedData)
        || (isWideReportShape(cleanedShape) && cleanedShape.candidates[0]?.detailSeriesColumns.length >= 4);
    if (!unpivot) {
        return cleanedStillWide;
    }
    if (detailSeriesCoverageRate < 1 || summarySeriesExclusionRate < 1) {
        return false;
    }
    if (!unpivot.keyColumn || !unpivot.valueColumn) {
        return false;
    }
    return getSourceCoordinateRetention(plan, cleanedData);
};

// Domain-specific fallback — financial/period vocabulary for wide schema detection.
const WIDE_STRONG_HEADER_PATTERN = /^(?:\d{4,8}|FY\d{2,4}|Q[1-4](?:[-_/ ]?\d{2,4})?|actual|budget|variance|forecast|plan)$/i;
const WIDE_WEAK_HEADER_PATTERN = /^[A-Z]{2,}(?:[_-][A-Z0-9]+)*$/;

const isWideSchemaTable = (data: CsvData | null) => {
    const columns = getColumns(data);
    if (columns.length < 8) return false;
    const rows = getRows(data);
    const descriptorColumns = columns.filter(column => /\b(?:code|description|name|category|type|account|item|label|id)\b/i.test(column));
    const metricColumns = columns.filter(column =>
        !descriptorColumns.includes(column) && !isSummaryLike(column),
    );
    if (descriptorColumns.length < 1 || metricColumns.length < 4) return false;

    const getNumericRatio = (column: string) => {
        const nonEmptyValues = rows
            .map(row => String(row[column] ?? '').trim())
            .filter(Boolean);
        if (nonEmptyValues.length === 0) return 0;
        const numericValues = nonEmptyValues.filter(value => robustParseFloat(value) !== null).length;
        return roundRatio(numericValues / nonEmptyValues.length);
    };

    const strongWideColumns = metricColumns.filter(column =>
        WIDE_STRONG_HEADER_PATTERN.test(column) && getNumericRatio(column) >= 0.75,
    );
    const weakWideColumns = metricColumns.filter(column =>
        !WIDE_STRONG_HEADER_PATTERN.test(column)
        && WIDE_WEAK_HEADER_PATTERN.test(column)
        && getNumericRatio(column) >= 0.9,
    );
    const wideMetricHeaders = strongWideColumns.length + weakWideColumns.length;

    return strongWideColumns.length >= 2
        && wideMetricHeaders >= Math.max(4, Math.floor(metricColumns.length * 0.45));
};

const hasSummaryLikeSeriesKeyLeakage = (
    cleanedData: CsvData | null,
    seriesKeyColumn: string | null,
    summarySeriesCandidates: SummarySeriesCandidate[],
) => {
    if (!seriesKeyColumn) return false;
    const knownSummaryColumns = new Set(summarySeriesCandidates.map(candidate => candidate.columnName.toLowerCase()));
    return getRows(cleanedData).some(row => {
        const value = String(row[seriesKeyColumn] ?? '').trim();
        return knownSummaryColumns.has(value.toLowerCase())
            || SUMMARY_LABEL_PATTERN.test(value)
            || /reporting date|reporting currency/i.test(value);
    });
};

export const buildCleaningVerificationReport = (
    rawData: CsvData | null,
    cleanedData: CsvData | null,
    plan?: DataPreparationPlan | null,
    runtimeState?: CleaningVerificationRuntimeContext | null,
): VerificationReport => {
    const rawProfile = detectReportShape(rawData);
    const hypotheses = buildReshapeHypotheses(rawProfile, rawData);
    const primaryHypothesis = hypotheses[0] ?? null;
    const primaryCandidate = getPrimaryShapeCandidate(rawProfile);
    const detailSeriesColumns = primaryCandidate?.detailSeriesColumns ?? [];
    const summarySeriesColumns = primaryCandidate?.summarySeriesColumns ?? [];
    const summarySeriesCandidates = primaryCandidate?.summarySeriesCandidates ?? [];
    const descriptorColumns = primaryCandidate?.descriptorColumns ?? [];
    const valueColumn = getValueColumn(plan ?? null, cleanedData);
    const seriesKeyColumn = getSeriesKeyColumn(plan ?? null, cleanedData);
    const hasLongTableReshape = Boolean(getUnpivotOperation(plan ?? null));
    const repeatedBundleTable = isRepeatedAttributeBundleTable(rawData);
    const rawRequiresReshape = !repeatedBundleTable && (
        isWideReportShape(rawProfile)
        || Boolean(getHeaderBandByRole(rawProfile, 'series_label_header'))
        || (
            rawProfile.primaryKind !== 'already_tabular'
            && Boolean(getHeaderBandByRole(rawProfile, 'column_header'))
            && detailSeriesColumns.length >= 4
        )
    );
    const requiresRawInspection = shouldRequireRawInspection(rawData, rawProfile);

    const detailSeriesCoverageRate = getDetailSeriesCoverageRate(detailSeriesColumns, plan, rawRequiresReshape);
    const multiHeaderLayerRetentionRate = getMultiHeaderLayerRetentionRate(primaryHypothesis, plan, rawRequiresReshape);
    const multiHeaderLayerRetentionDetail = getMultiHeaderLayerRetentionDetail(primaryHypothesis, plan, rawRequiresReshape);
    const labelLayerRetentionComplete = multiHeaderLayerRetentionRate === 1;
    const summarySeriesExclusionRate = getSummarySeriesExclusionRate(summarySeriesCandidates, plan, rawRequiresReshape);
    const hierarchyDepthRetentionRate = repeatedBundleTable
        ? 1
        : getHierarchyDepthRetentionRate(primaryHypothesis, cleanedData, plan);
    const numericParseRate = getNumericParseRate(cleanedData, valueColumn);
    const noiseLeakageRate = getNoiseLeakageRate(cleanedData);
    const repeatedHeaderLeakageRate = getRepeatedHeaderLeakageRate(cleanedData);
    const descriptorPreservationRate = repeatedBundleTable
        ? 1
        : getDescriptorPreservationRate(descriptorColumns, cleanedData);
    const factKeyUniquenessRate = rawRequiresReshape || hasLongTableReshape
        ? getFactKeyUniquenessRate(cleanedData, descriptorColumns, seriesKeyColumn)
        : 1;
    const suspiciousCollapseScore = rawRequiresReshape || hasLongTableReshape
        ? getSuspiciousCollapseScore(rawData, cleanedData, descriptorColumns, seriesKeyColumn)
        : 0;
    const summaryTotalConsistencyDelta = getSummaryTotalConsistencyDelta(cleanedData, plan);
    const cleanedShape = detectReportShape(cleanedData);
    const headerBandResolved = getHeaderBandResolved(primaryHypothesis, rawProfile);
    const summaryLikeSeriesKeyLeakage = rawRequiresReshape || hasLongTableReshape
        ? hasSummaryLikeSeriesKeyLeakage(cleanedData, seriesKeyColumn, summarySeriesCandidates)
        : false;
    const wideCrosstabPersistence = !repeatedBundleTable && (
        isWideSchemaTable(cleanedData)
        || (isWideReportShape(cleanedShape) && cleanedShape.candidates[0]?.detailSeriesColumns.length >= 4)
    );
    const mixedReportBlockResolution = getMixedReportBlockResolution(rawProfile, primaryHypothesis, cleanedShape, plan);
    const dominantBlockResolved = rawProfile.primaryKind !== 'mixed_report'
        ? true
        : runtimeState?.dominantBlockResolved ?? mixedReportBlockResolution === 1;
    const rawInspectionCompleted = !requiresRawInspection
        || runtimeState == null
        || Boolean(runtimeState.inspectedRaw)
        || (plan?.operations?.length ?? 0) > 0;
    const wideReshapeContractComplete = getWideReshapeContractComplete(
        rawRequiresReshape,
        plan,
        cleanedData,
        detailSeriesCoverageRate,
        summarySeriesExclusionRate,
    );

    const signals: VerificationSignal[] = [
        buildSignal(
            'raw_inspection_completed',
            rawInspectionCompleted,
            rawInspectionCompleted ? 'pass' : 'fail',
        ),
        buildSignal(
            'dominant_block_resolved',
            dominantBlockResolved,
            dominantBlockResolved ? 'pass' : 'fail',
        ),
        buildSignal(
            'label_layer_retention_complete',
            labelLayerRetentionComplete,
            labelLayerRetentionComplete ? 'pass' : 'fail',
            undefined,
            multiHeaderLayerRetentionDetail,
        ),
        buildSignal(
            'wide_reshape_contract_complete',
            wideReshapeContractComplete,
            wideReshapeContractComplete ? 'pass' : 'fail',
        ),
        buildSignal(
            'header_band_resolved',
            headerBandResolved,
            headerBandResolved ? 'pass' : 'fail',
        ),
        buildSignal(
            'detail_series_coverage_rate',
            detailSeriesCoverageRate,
            detailSeriesCoverageRate === 1 ? 'pass' : 'fail',
            'pass = 1.00',
        ),
        buildSignal(
            'multi_header_layer_retention_rate',
            multiHeaderLayerRetentionRate,
            multiHeaderLayerRetentionRate === 1 ? 'pass' : 'fail',
            'pass = 1.00',
            multiHeaderLayerRetentionDetail,
        ),
        buildSignal(
            'summary_series_exclusion_rate',
            summarySeriesExclusionRate,
            summarySeriesExclusionRate === 1 ? 'pass' : 'fail',
            'pass = 1.00',
        ),
        buildSignal(
            'hierarchy_depth_retention_rate',
            hierarchyDepthRetentionRate,
            getStatus(hierarchyDepthRetentionRate, 1, 0.9),
            'pass = 1.00, warn >= 0.90',
        ),
        buildSignal(
            'numeric_parse_rate',
            numericParseRate,
            getStatus(numericParseRate, 0.98, 0.9),
            'pass >= 0.98, warn >= 0.90',
        ),
        buildSignal(
            'noise_leakage_rate',
            noiseLeakageRate,
            noiseLeakageRate <= 0.02 ? 'pass' : 'fail',
            'pass <= 0.02',
        ),
        buildSignal(
            'repeated_header_leakage_rate',
            repeatedHeaderLeakageRate,
            repeatedHeaderLeakageRate <= 0.02 ? 'pass' : repeatedHeaderLeakageRate <= 0.05 ? 'warn' : 'fail',
            'pass <= 0.02, warn <= 0.05',
        ),
        buildSignal(
            'descriptor_preservation_rate',
            descriptorPreservationRate,
            getStatus(descriptorPreservationRate, 1, 0.8),
            'pass = 1.00, warn >= 0.80',
        ),
        buildSignal(
            'fact_key_uniqueness_rate',
            factKeyUniquenessRate,
            getStatus(factKeyUniquenessRate, 0.99, 0.95),
            'pass >= 0.99, warn >= 0.95',
        ),
        buildSignal(
            'suspicious_collapse_score',
            suspiciousCollapseScore,
            suspiciousCollapseScore <= 0.2 ? 'pass' : suspiciousCollapseScore <= 0.5 ? 'warn' : 'fail',
            'pass <= 0.20, warn <= 0.50',
        ),
        buildSignal(
            'summary_like_series_key_leakage',
            summaryLikeSeriesKeyLeakage,
            summaryLikeSeriesKeyLeakage ? 'fail' : 'pass',
        ),
        buildSignal(
            'mixed_report_block_resolution',
            mixedReportBlockResolution,
            mixedReportBlockResolution === 1 ? 'pass' : 'fail',
            'dominant block must be selected',
        ),
    ];

    if (summaryTotalConsistencyDelta !== null) {
        signals.push(buildSignal(
            'summary_total_consistency_delta',
            summaryTotalConsistencyDelta,
            summaryTotalConsistencyDelta <= 0.01 ? 'pass' : summaryTotalConsistencyDelta <= 0.05 ? 'warn' : 'fail',
            'pass <= 0.01, warn <= 0.05',
        ));
    }

    // Aggregate integrity: compare numeric column SUMs before vs after cleaning.
    // Non-blocking — deviation is expected when metadata/footer rows are dropped.
    const aggregateIntegrity = computeAggregateIntegrityDeviation(rawData, cleanedData);
    if (aggregateIntegrity !== null) {
        const dev = aggregateIntegrity.maxDeviation;
        signals.push(buildSignal(
            'aggregate_integrity',
            dev,
            dev <= AGGREGATE_INTEGRITY_WARN_THRESHOLD ? 'pass' : dev <= AGGREGATE_INTEGRITY_FAIL_THRESHOLD ? 'warn' : 'fail',
            `pass <= ${AGGREGATE_INTEGRITY_WARN_THRESHOLD}, warn <= ${AGGREGATE_INTEGRITY_FAIL_THRESHOLD}`,
            aggregateIntegrity.column ? { column: aggregateIntegrity.column } : undefined,
        ));
    }

    if (cleanedData?.data?.length === 0 || getColumns(cleanedData).length === 0) {
        signals.unshift(buildSignal('empty_dataset_guard', 'empty', 'fail'));
    } else if (wideCrosstabPersistence) {
        signals.push(buildSignal('wide_crosstab_persistence', cleanedShape.primaryKind || 'wide_schema', 'fail'));
    }

    const blockingFailures = signals.filter(signal =>
        BLOCKING_SIGNAL_KEYS.includes(signal.key) && signal.status === 'fail',
    );
    const overallStatus: VerificationStatus = blockingFailures.length > 0
        ? 'fail'
        : signals.some(signal => signal.status === 'warn')
            ? 'warn'
            : 'pass';

    return {
        overallStatus,
        signals,
        blockingSignalKeys: BLOCKING_SIGNAL_KEYS,
    };
};

export const getVerificationFailureReason = (report: VerificationReport): string | null => {
    const signal = getVerificationFailureSignal(report);
    if (!signal) return null;
    switch (signal.key) {
        case 'empty_dataset_guard':
            return 'Dataset is empty after cleaning.';
        case 'raw_inspection_completed':
            return 'The runtime did not inspect raw.csv before verifying this report-shaped dataset.';
        case 'dominant_block_resolved':
            return 'The mixed report was not resolved to its dominant tabular block.';
        case 'label_layer_retention_complete':
            return 'Multi-header label layers were not preserved during reshaping.';
        case 'wide_reshape_contract_complete':
            return 'The reshaped long-table output is missing required source coordinates or core key/value fields.';
        case 'summary_like_series_key_leakage':
            return 'Project-like key columns still contain Total, Subtotal, or footer values.';
        case 'mixed_report_block_resolution':
            return 'The mixed report was not resolved to its dominant tabular block.';
        case 'multi_header_layer_retention_rate':
            return 'Multi-header label layers were not preserved during reshaping.';
        case 'summary_series_exclusion_rate':
            return 'Summary columns were incorrectly treated as detail series during reshaping.';
        case 'hierarchy_depth_retention_rate':
            return 'Hierarchy depth was not preserved in the cleaned output.';
        case 'detail_series_coverage_rate':
            return 'The cleaned dataset still looks like a wide crosstab.';
        case 'numeric_parse_rate':
            return 'The cleaned dataset still contains non-numeric measure values after reshaping.';
        case 'noise_leakage_rate':
            return 'Dataset still contains header, footer, or blank noise rows after cleaning.';
        case 'repeated_header_leakage_rate':
            return 'Dataset still contains repeated header rows after cleaning.';
        case 'descriptor_preservation_rate':
            return 'Descriptor columns were not preserved during cleaning.';
        case 'suspicious_collapse_score':
            return 'The cleaned dataset appears to have collapsed to a single descriptor group after unpivot.';
        case 'wide_crosstab_persistence':
            return 'The cleaned dataset still looks like a wide crosstab.';
        case 'aggregate_integrity':
            return 'Numeric column totals deviated significantly after cleaning — some data rows may have been unintentionally dropped or truncated.';
        default:
            return `Cleaning verification failed on ${signal.key}.`;
    }
};

export const getWideCrosstabReasonFromVerification = (rawData: CsvData | null, cleanedData: CsvData | null) => {
    const rawProfile = detectReportShape(rawData);
    const cleanedProfile = detectReportShape(cleanedData);
    if (!isWideReportShape(rawProfile) && !isWideReportShape(cleanedProfile) && !isWideSchemaTable(cleanedData)) return null;
    if (!cleanedData?.data?.length) return null;
    if (isWideSchemaTable(cleanedData) || (isWideReportShape(cleanedProfile) && cleanedProfile.candidates[0]?.detailSeriesColumns.length >= 4)) {
        return 'The cleaned dataset still looks like a wide crosstab. Convert it into a long, query-friendly table before analysis.';
    }
    return null;
};
