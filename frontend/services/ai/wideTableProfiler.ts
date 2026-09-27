import type { ColumnProfile, CsvRow, CsvData } from '../../types';
import { formatColumnProfiles } from './contextManager';
import { isRepeatedAttributeBundleTable } from '../agent/repeatedBundleTableDetector';
import {
    normalizeColumnName,
    normalizeCellValue,
    isFilledValue,
    isNumericType,
    isMeaningfulHeaderLayer,
    WIDE_TABLE_NUMERIC_COLUMN_THRESHOLD,
    WIDE_TABLE_NUMERIC_SHARE_THRESHOLD,
    MULTI_HEADER_NUMERIC_COLUMN_THRESHOLD,
    MULTI_HEADER_NUMERIC_SHARE_THRESHOLD,
    WIDE_TABLE_SAMPLE_ROW_LIMIT,
    WIDE_TABLE_SAMPLE_MATRIX_COLUMNS,
    WIDE_TABLE_SAMPLE_BUSINESS_METRIC_COLUMNS,
    DIGIT_HEAVY_COLUMN_PATTERN,
    IDENTIFIER_COLUMN_PATTERN,
    BUSINESS_METRIC_COLUMN_PATTERN,
    WideTableProfile,
} from './dataPreparerConstants';

export const buildWideTableProfile = (columns: ColumnProfile[], sourceData?: CsvData | null): WideTableProfile => {
    const numericColumns = columns.filter(column => isNumericType(column.type));
    const identifierColumns = columns.filter(column =>
        IDENTIFIER_COLUMN_PATTERN.test(column.name) || column.type === 'categorical' || column.type === 'date' || column.type === 'time',
    );
    const repeatedMatrixColumns = numericColumns.filter(column => DIGIT_HEAVY_COLUMN_PATTERN.test(column.name));
    const businessMetricColumns = numericColumns.filter(column =>
        !DIGIT_HEAVY_COLUMN_PATTERN.test(column.name) && BUSINESS_METRIC_COLUMN_PATTERN.test(column.name),
    );
    const numericShare = columns.length > 0 ? numericColumns.length / columns.length : 0;
    const preservedHeaderLayers = (sourceData?.headerLayers ?? []).filter(isMeaningfulHeaderLayer).length;
    const repeatedBundleTable = isRepeatedAttributeBundleTable(sourceData ?? null);
    const hasMatrixSignal = repeatedMatrixColumns.length >= WIDE_TABLE_SAMPLE_MATRIX_COLUMNS || preservedHeaderLayers > 0;
    const meetsNumericDensity = preservedHeaderLayers > 0
        ? numericColumns.length >= MULTI_HEADER_NUMERIC_COLUMN_THRESHOLD && numericShare >= MULTI_HEADER_NUMERIC_SHARE_THRESHOLD
        : numericColumns.length >= WIDE_TABLE_NUMERIC_COLUMN_THRESHOLD && numericShare >= WIDE_TABLE_NUMERIC_SHARE_THRESHOLD;

    return {
        isWide: !repeatedBundleTable && meetsNumericDensity && hasMatrixSignal,
        identifierColumns,
        repeatedMatrixColumns,
        businessMetricColumns,
    };
};

export const getWideTableValueCastOrderIssue = (
    operations: import('../../types').DataOperation[],
    wideProfile: WideTableProfile,
): string | null => {
    if (!wideProfile.isWide) {
        return null;
    }

    let valueColumnEmitted = false;
    for (const operation of operations) {
        if (operation.type === 'unpivot_columns' && normalizeColumnName(operation.valueColumn) === 'value') {
            valueColumnEmitted = true;
        }

        if (operation.type === 'cast_column' && normalizeColumnName(operation.column) === 'value' && !valueColumnEmitted) {
            return 'Wide-table plans may cast "Value" only after an unpivot_columns step emits valueColumn "Value".';
        }
    }

    return null;
};

const formatCompactColumnProfiles = (columns: ColumnProfile[]) =>
    columns.length === 0 ? 'None' : formatColumnProfiles(columns);

export const buildDataPreparationSchemaContext = (columns: ColumnProfile[], sourceData?: CsvData | null) => {
    const wideProfile = buildWideTableProfile(columns, sourceData);
    if (!wideProfile.isWide) {
        return {
            schemaText: formatColumnProfiles(columns),
            wideTableSummary: null,
            wideProfile,
        };
    }

    const remainingColumns = columns.filter(column =>
        !wideProfile.identifierColumns.includes(column)
        && !wideProfile.repeatedMatrixColumns.includes(column)
        && !wideProfile.businessMetricColumns.includes(column),
    );

    return {
        schemaText: [
            `Wide-table hint: many repeated numeric matrix columns plus descriptor columns.`,
            `Identifier-like columns:\n${formatCompactColumnProfiles(wideProfile.identifierColumns.slice(0, 6))}`,
            `Repeated numeric matrix columns: ${wideProfile.repeatedMatrixColumns.length} column(s); examples:\n${formatCompactColumnProfiles(wideProfile.repeatedMatrixColumns.slice(0, 8))}`,
            `Business metric columns:\n${formatCompactColumnProfiles(wideProfile.businessMetricColumns.slice(0, 6))}`,
            remainingColumns.length > 0
                ? `Other columns not expanded individually: ${remainingColumns.length}`
                : null,
        ].filter(Boolean).join('\n\n'),
        wideTableSummary: [
            `identifier_like_columns=${wideProfile.identifierColumns.map(column => column.name).slice(0, 6).join(', ') || 'none'}`,
            `repeated_numeric_matrix_columns_count=${wideProfile.repeatedMatrixColumns.length}`,
            `repeated_numeric_matrix_examples=${wideProfile.repeatedMatrixColumns.map(column => column.name).slice(0, 6).join(', ') || 'none'}`,
            `business_metric_columns=${wideProfile.businessMetricColumns.map(column => column.name).slice(0, 6).join(', ') || 'none'}`,
        ].join('\n'),
        wideProfile,
    };
};

const uniqueIndices = (indices: number[]) => Array.from(new Set(indices.filter(index => index >= 0)));

const findHierarchyParentRowIndex = (sampleData: CsvRow[], identifierColumnName: string | null) => {
    if (!identifierColumnName) return null;
    const values = sampleData
        .map((row, index) => ({ index, value: normalizeCellValue(row[identifierColumnName]) }))
        .filter(entry => entry.value.length > 0);

    for (const candidate of values) {
        const hasChild = values.some(other =>
            other.index !== candidate.index
            && other.value.length > candidate.value.length
            && other.value.startsWith(candidate.value),
        );
        if (hasChild) {
            return candidate.index;
        }
    }
    return null;
};

const buildWideTableSampleColumns = (
    columns: ColumnProfile[],
    wideProfile: WideTableProfile,
): { selectedColumns: string[]; omittedColumnCount: number } => {
    const selected: string[] = [];
    const pushColumn = (columnName: string) => {
        if (!selected.includes(columnName)) {
            selected.push(columnName);
        }
    };

    wideProfile.identifierColumns.slice(0, 4).forEach(column => pushColumn(column.name));
    wideProfile.repeatedMatrixColumns.slice(0, WIDE_TABLE_SAMPLE_MATRIX_COLUMNS).forEach(column => pushColumn(column.name));
    wideProfile.businessMetricColumns.slice(0, WIDE_TABLE_SAMPLE_BUSINESS_METRIC_COLUMNS).forEach(column => pushColumn(column.name));

    const totalColumn = columns.find(column => /total/i.test(column.name));
    if (totalColumn) {
        pushColumn(totalColumn.name);
    }

    columns.slice(0, 2).forEach(column => pushColumn(column.name));

    return {
        selectedColumns: selected,
        omittedColumnCount: Math.max(columns.length - selected.length, 0),
    };
};

export const buildDataPreparationSampleRows = (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    sourceData?: CsvData | null,
) => {
    const wideProfile = buildWideTableProfile(columns, sourceData);
    if (!wideProfile.isWide) {
        return {
            rows: sampleData.slice(0, 8),
            sampleSummary: null,
            hasHierarchySignal: false,
        };
    }

    const { selectedColumns, omittedColumnCount } = buildWideTableSampleColumns(columns, wideProfile);
    const primaryIdentifierColumn = wideProfile.identifierColumns.find(column =>
        /code|account|acct|id|document|project/i.test(column.name),
    )?.name ?? wideProfile.identifierColumns[0]?.name ?? null;
    const descriptionColumn = wideProfile.identifierColumns.find(column =>
        /description|name|label/i.test(column.name),
    )?.name ?? wideProfile.identifierColumns[1]?.name ?? null;

    const detailIndex = sampleData.findIndex(row =>
        (primaryIdentifierColumn ? isFilledValue(row[primaryIdentifierColumn]) : true)
        && (descriptionColumn ? isFilledValue(row[descriptionColumn]) : true),
    );
    const hierarchyIndex = findHierarchyParentRowIndex(sampleData, primaryIdentifierColumn);
    const hierarchyChildIndex = hierarchyIndex != null
        ? sampleData.findIndex((row, index) =>
            index !== hierarchyIndex
            && primaryIdentifierColumn
            && isFilledValue(row[primaryIdentifierColumn])
            && normalizeCellValue(row[primaryIdentifierColumn]).startsWith(
                normalizeCellValue(sampleData[hierarchyIndex]?.[primaryIdentifierColumn]),
            )
            && normalizeCellValue(row[primaryIdentifierColumn]).length > normalizeCellValue(sampleData[hierarchyIndex]?.[primaryIdentifierColumn]).length,
        )
        : null;
    const summaryIndex = sampleData.findIndex(row =>
        primaryIdentifierColumn
            ? !isFilledValue(row[primaryIdentifierColumn]) && (descriptionColumn ? isFilledValue(row[descriptionColumn]) : true)
            : false,
    );
    const anomalyIndex = sampleData.findIndex(row =>
        selectedColumns.some(columnName => normalizeCellValue(row[columnName]).startsWith('-')),
    );

    const chosenIndices = uniqueIndices([
        detailIndex,
        hierarchyIndex ?? -1,
        summaryIndex,
        anomalyIndex,
        ...sampleData.map((_row, index) => index),
    ]).slice(0, WIDE_TABLE_SAMPLE_ROW_LIMIT);

    const rows = chosenIndices.map(index => {
        const sourceRow = sampleData[index];
        const projected = selectedColumns.reduce<CsvRow>((accumulator, columnName) => {
            accumulator[columnName] = sourceRow[columnName] ?? null;
            return accumulator;
        }, {});

        const role = index === detailIndex
            ? 'detail_candidate'
            : index === hierarchyIndex
                ? 'hierarchy_parent_candidate'
                : index === summaryIndex
                    ? 'summary_or_metadata_candidate'
                    : index === anomalyIndex
                        ? 'anomaly_candidate'
                        : 'sample_candidate';

        return {
            SampleRole: role,
            SourceSampleIndex: index,
            ...projected,
        };
    });

    return {
        rows,
        sampleSummary: [
            `wide_table_hint=many repeated numeric matrix columns plus descriptor columns`,
            `sample_columns=${selectedColumns.join(', ')}`,
            `omitted_repeated_or_secondary_columns=${omittedColumnCount}`,
            hierarchyIndex != null && primaryIdentifierColumn
                ? `hierarchy_signal=identifier prefix hierarchy detected in ${primaryIdentifierColumn}`
                : null,
            hierarchyIndex != null && primaryIdentifierColumn
                ? `hierarchy_parent_example=${normalizeCellValue(sampleData[hierarchyIndex]?.[primaryIdentifierColumn])}`
                : null,
            hierarchyChildIndex != null && primaryIdentifierColumn
                ? `hierarchy_child_example=${normalizeCellValue(sampleData[hierarchyChildIndex]?.[primaryIdentifierColumn])}`
                : null,
        ].filter(Boolean).join('\n'),
        hasHierarchySignal: hierarchyIndex != null,
    };
};

export const buildHeaderLayerContext = (sourceData?: CsvData | null) => {
    const headerLayers = (sourceData?.headerLayers ?? []).filter(isMeaningfulHeaderLayer);
    if (headerLayers.length === 0) {
        return {
            summary: null,
            requiredLabelLayers: 0,
        };
    }

    return {
        summary: [
            `Preserved header label layers: ${headerLayers.length}`,
            ...headerLayers.map((row, index) => `Layer ${index + 1}: ${row.map(value => String(value ?? '').trim() || '∅').join(' | ')}`),
        ].join('\n'),
        requiredLabelLayers: headerLayers.length,
    };
};
