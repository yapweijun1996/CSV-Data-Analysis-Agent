import type {
    CsvData,
    CsvRow,
    ReportIntakeIr,
    RuntimeTableAssessment,
    ToolCallEnvelope,
    UnpivotHierarchyDepthMapping,
    UnpivotLabelColumn,
    UnpivotLabelMapping,
    UnpivotRowClassMapping,
} from '../../../types';
import { detectReportShape, getHeaderBandByRole, getHeaderBandsByRole, getPrimaryShapeCandidate, isWideReportShape } from '../reportShapeDetector';
import { getPrimaryReshapeHypothesis } from '../reportShapeHypothesis';
import { isRepeatedAttributeBundleTable } from '../repeatedBundleTableDetector';
import { getColumns, getRowCells, getRowValues, getRows, isBlankRow, isFooterLikeRow, isNumericLike, isSummaryLike } from '../reportShapeUtils';
import { evaluateCleaningIrGate } from './cleaningIrGate';

const isDefined = <T,>(value: T | null): value is T => value !== null;

const getLabelMappings = (
    rows: CsvRow[],
    detailSeriesColumns: string[],
    headerRowIndex: number,
    labelRowIndex: number | null,
): UnpivotLabelMapping[] => {
    if (labelRowIndex === null || labelRowIndex < 0 || labelRowIndex >= rows.length) return [];
    const headerCells = getRowCells(rows[headerRowIndex]);
    const labelCells = getRowCells(rows[labelRowIndex]);
    const columnIndexByHeader = new Map(headerCells.map(cell => [cell.value, cell.columnIndex]));
    return detailSeriesColumns
        .map(sourceColumn => {
            const columnIndex = columnIndexByHeader.get(sourceColumn);
            if (columnIndex === undefined) return null;
            return {
                sourceColumn,
                label: String(labelCells[columnIndex]?.value ?? '').trim() || null,
            } as UnpivotLabelMapping;
        })
        .filter(isDefined);
};

const getLabelColumns = (
    rows: CsvRow[],
    detailSeriesColumns: string[],
    headerRowIndex: number,
    labelRowIndexes: number[],
): UnpivotLabelColumn[] =>
    labelRowIndexes
        .map((rowIndex, index) => {
            const mappings = getLabelMappings(rows, detailSeriesColumns, headerRowIndex, rowIndex);
            if (mappings.length === 0) return null;
            return {
                outputColumn: `SeriesLabelL${index + 1}`,
                mappings,
            };
        })
        .filter(isDefined);

const inferAdditionalLabelRowIndexes = (
    rows: CsvRow[],
    detailSeriesColumns: string[],
    descriptorColumns: string[],
    headerRowIndex: number,
    detectedLabelRowIndexes: number[],
) => {
    const detected = new Set(detectedLabelRowIndexes);
    const headerCells = getRowCells(rows[headerRowIndex]);
    const columnIndexByHeader = new Map(headerCells.map(cell => [cell.value, cell.columnIndex]));
    const detailIndexes = detailSeriesColumns
        .map(column => columnIndexByHeader.get(column))
        .filter((index): index is number => Number.isInteger(index));
    const descriptorIndexes = descriptorColumns
        .map(column => columnIndexByHeader.get(column))
        .filter((index): index is number => Number.isInteger(index));

    if (detailIndexes.length === 0) return detectedLabelRowIndexes;

    const inferred: number[] = [];
    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        if (detected.has(rowIndex)) {
            inferred.push(rowIndex);
            continue;
        }

        const cells = getRowCells(rows[rowIndex]);
        const detailValues = detailIndexes.map(index => String(cells[index]?.value ?? '').trim());
        const nonEmptyDetailValues = detailValues.filter(Boolean);
        const numericDetailCount = nonEmptyDetailValues.filter(isNumericLike).length;
        const textDetailCount = nonEmptyDetailValues.filter(value => !isNumericLike(value)).length;
        const descriptorFilledCount = descriptorIndexes.filter(index => String(cells[index]?.value ?? '').trim().length > 0).length;

        if (numericDetailCount >= Math.max(2, Math.floor(detailIndexes.length * 0.25))) {
            break;
        }
        if (descriptorFilledCount > 1) {
            break;
        }
        if (textDetailCount >= 1) {
            inferred.push(rowIndex);
            continue;
        }
        if (nonEmptyDetailValues.length === 0 && descriptorFilledCount === 0) {
            continue;
        }
        break;
    }

    return Array.from(new Set([...detectedLabelRowIndexes, ...inferred])).sort((left, right) => left - right);
};

const ensureOutputLabelColumns = (
    outputColumns: Array<{ name: string; type: 'string' | 'number' | 'date' | 'boolean'; required: boolean }>,
    labelColumns: UnpivotLabelColumn[],
) => {
    const ensured = [...outputColumns];
    labelColumns.forEach(labelColumn => {
        if (ensured.some(column => column.name === labelColumn.outputColumn)) return;
        const valueColumnIndex = ensured.findIndex(column => column.name === 'Value');
        const insertIndex = valueColumnIndex >= 0 ? valueColumnIndex : ensured.length;
        ensured.splice(insertIndex, 0, {
            name: labelColumn.outputColumn,
            type: 'string',
            required: false,
        });
    });
    return ensured;
};

const getParserResolvedLabelColumns = (
    data: CsvData | null,
    detailSeriesColumns: string[],
): UnpivotLabelColumn[] => {
    if (!data?.headerLayers?.length) return [];
    const columns = getColumns(data);
    const columnIndexByName = new Map(columns.map((column, index) => [column, index]));
    return data.headerLayers
        .map((row, index) => {
            const mappings = detailSeriesColumns
                .map(sourceColumn => {
                    const columnIndex = columnIndexByName.get(sourceColumn);
                    if (columnIndex === undefined) return null;
                    return {
                        sourceColumn,
                        label: String(row[columnIndex] ?? '').trim() || null,
                    } as UnpivotLabelMapping;
                })
                .filter(isDefined);
            if (mappings.length === 0) return null;
            return {
                outputColumn: `SeriesLabelL${index + 1}`,
                mappings,
            };
        })
        .filter(isDefined);
};

type ParserResolvedWideSeriesSelection = {
    sourceColumns: string[];
    keepColumns: string[];
    labelColumns: UnpivotLabelColumn[];
};

const normalizeBaseColumnName = (value: string) => value.replace(/_\d+$/u, '').trim();

const getGroupedParserHeaderSelection = (
    data: CsvData | null,
    detailSeriesColumns: string[],
    descriptorColumns: string[],
): ParserResolvedWideSeriesSelection | null => {
    if (!data?.headerLayers?.length) return null;

    const columns = getColumns(data);
    if (columns.length === 0 || detailSeriesColumns.length < 4) return null;

    const currentDetailBaseNames = new Set(
        detailSeriesColumns.map(column => normalizeBaseColumnName(column).toLowerCase()),
    );
    if (currentDetailBaseNames.size > 2) {
        return null;
    }

    const baseNameCounts = columns.reduce<Map<string, number>>((counts, column) => {
        const key = normalizeBaseColumnName(column).toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
    }, new Map());
    const repeatedColumnIndexes = columns.reduce<number[]>((indexes, column, index) => {
        const baseName = normalizeBaseColumnName(column).toLowerCase();
        if (isSummaryLike(baseName)) {
            return indexes;
        }
        if ((baseNameCounts.get(baseName) ?? 0) < 2) {
            return indexes;
        }
        if (/_\d+$/u.test(column) || columns.slice(0, index).some(candidate => normalizeBaseColumnName(candidate).toLowerCase() === baseName)) {
            indexes.push(index);
        }
        return indexes;
    }, []);
    const repeatedBoundary = repeatedColumnIndexes[0] ?? -1;
    if (repeatedBoundary < 0) {
        return null;
    }

    const expandedSourceColumns = columns.slice(repeatedBoundary).filter(column => {
        const baseName = normalizeBaseColumnName(column).toLowerCase();
        return !isSummaryLike(baseName)
            && (baseNameCounts.get(baseName) ?? 0) >= 2;
    });
    const sourceColumns = Array.from(new Set([
        ...detailSeriesColumns,
        ...expandedSourceColumns,
    ]));
    if (sourceColumns.length < detailSeriesColumns.length + 4) {
        return null;
    }

    const keepColumns = Array.from(new Set([
        ...descriptorColumns,
        ...columns
            .slice(0, repeatedBoundary)
            .filter(column => !sourceColumns.includes(column) && !isSummaryLike(normalizeBaseColumnName(column))),
    ]));
    const labelColumns = getParserResolvedLabelColumns(data, sourceColumns);
    if (labelColumns.length === 0) {
        return null;
    }

    return {
        sourceColumns,
        keepColumns,
        labelColumns,
    };
};

const buildDropIndices = (
    rows: CsvRow[],
    headerRowIndex: number,
    labelRowIndexes: number[],
): number[] => {
    const indices = new Set<number>();
    const labelIndexSet = new Set(labelRowIndexes);
    rows.forEach((row, index) => {
        if (index === headerRowIndex) return;
        if (labelIndexSet.has(index)) {
            indices.add(index);
            return;
        }
        if (isBlankRow(row) || isFooterLikeRow(row)) {
            indices.add(index);
            return;
        }
        if (index < headerRowIndex) {
            indices.add(index);
        }
    });
    return [...indices].sort((left, right) => left - right);
};

const buildRowClassMappings = (
    profile: ReturnType<typeof detectReportShape>,
    dropIndices: number[],
    rowOffset: number,
): UnpivotRowClassMapping[] => {
    const dropped = new Set(dropIndices);
    return profile.rowRoles
        .filter(candidate =>
            !dropped.has(candidate.rowIndex)
            && ['fact', 'group_header', 'subtotal', 'total'].includes(candidate.role),
        )
        .map(candidate => ({
            sourceRowIndex: candidate.rowIndex - dropIndices.filter(index => index < candidate.rowIndex).length - rowOffset,
            rowClass: candidate.role,
        }))
        .filter(mapping => mapping.sourceRowIndex >= 0);
};

const buildHierarchyDepthMappings = (
    profile: ReturnType<typeof detectReportShape>,
    dropIndices: number[],
    rowOffset: number,
): UnpivotHierarchyDepthMapping[] => {
    const hierarchyRows = profile.rowRoles.filter(candidate => ['group_header', 'subtotal', 'total'].includes(candidate.role));
    if (hierarchyRows.length === 0 && !profile.rowRoles.some(candidate => (candidate.depth ?? 0) > 0)) {
        return [];
    }
    const dropped = new Set(dropIndices);
    return profile.rowRoles
        .filter(candidate =>
            !dropped.has(candidate.rowIndex)
            && Number.isInteger(candidate.depth)
            && ['fact', 'group_header', 'subtotal', 'total'].includes(candidate.role),
        )
        .map(candidate => ({
            sourceRowIndex: candidate.rowIndex - dropIndices.filter(index => index < candidate.rowIndex).length - rowOffset,
            depth: candidate.depth ?? 0,
        }))
        .filter(mapping => mapping.sourceRowIndex >= 0);
};

const toOutputType = (type: 'string' | 'number' | 'date' | 'boolean') =>
    type === 'number'
        ? 'numerical' as const
        : type === 'date'
            ? 'date' as const
            : 'categorical' as const;

const normalizeCell = (value: unknown) => String(value ?? '').trim().toLowerCase();

const isRepeatedHeaderRow = (row: CsvRow, columns: string[]) => {
    const normalizedColumns = new Set(columns.map(column => column.trim().toLowerCase()));
    const values = getRowValues(row)
        .map(normalizeCell)
        .filter(Boolean);
    if (values.length === 0) return false;
    const overlap = values.filter(value => normalizedColumns.has(value)).length;
    return overlap >= Math.max(2, Math.min(values.length, Math.floor(columns.length * 0.5)));
};

const isSubstantiveTabularRow = (row: CsvRow, columns: string[]) => {
    const normalizedColumns = new Set(columns.map(column => column.trim().toLowerCase()));
    const values = getRowValues(row)
        .map(value => String(value ?? '').trim())
        .filter(Boolean);
    if (values.length < 2) return false;
    if (values.every(value => normalizedColumns.has(value.toLowerCase()))) {
        return false;
    }
    return values.some(isNumericLike);
};

const hasHierarchicalRowSemantics = (profile: ReturnType<typeof detectReportShape>) => {
    const hierarchyRows = profile.rowRoles.filter(candidate => ['group_header', 'subtotal', 'total'].includes(candidate.role));
    return hierarchyRows.some(candidate => candidate.role === 'group_header' || candidate.role === 'subtotal')
        || hierarchyRows.length >= 2;
};

const buildHierarchicalStatementCleanupFallbackAction = (data: CsvData | null): ToolCallEnvelope | null => {
    const rows = getRows(data);
    if (rows.length === 0) return null;

    const profile = detectReportShape(data);
    if (!hasHierarchicalRowSemantics(profile)) {
        return null;
    }

    const columns = getColumns(data);
    const noiseRoleIndices = new Set(
        profile.rowRoles
            .filter(candidate => candidate.role === 'comment' || candidate.role === 'noise')
            .map(candidate => candidate.rowIndex),
    );
    // Also drop any rows whose values positionally match the column headers —
    // these are repeated header rows that the shape-detector may not classify
    // as comment/noise but that the verification will flag via repeated_header_leakage_rate.
    const dropIndices = Array.from(
        rows.reduce<Set<number>>((indices, row, index) => {
            if (noiseRoleIndices.has(index) || isRepeatedHeaderRow(row, columns)) {
                indices.add(index);
            }
            return indices;
        }, new Set()),
    ).sort((a, b) => a - b);
    const outputColumns = columns;

    return {
        type: 'tool_call',
        thought: 'Apply deterministic cleanup for a hierarchical statement and preserve its row semantics.',
        toolName: 'data.mutate',
        args: {
            explanation: 'Detected a hierarchical statement with report-noise rows. Remove non-tabular lines, then annotate row class, hierarchy depth, and source row coordinates for verification and downstream analysis.',
            operations: [
                ...(dropIndices.length > 0 ? [{
                    id: 'drop-report-noise',
                    type: 'drop_rows_by_index',
                    reason: 'Remove leading metadata, repeated headers, and footer rows before hierarchy annotation.',
                    indices: dropIndices,
                }] : []),
                {
                    id: 'drop-remaining-blanks',
                    type: 'drop_blank_rows',
                    reason: 'Remove any remaining blank rows after structural cleanup.',
                },
                {
                    id: 'annotate-hierarchy',
                    type: 'annotate_hierarchy',
                    reason: 'Add row class, hierarchy depth, and source row coordinates for the hierarchical statement.',
                    rowClassColumn: 'RowClass',
                    hierarchyDepthColumn: 'HierarchyDepth',
                    sourceRowIndexColumn: 'SourceRowIndex',
                },
            ],
            outputColumns: [
                ...outputColumns.map(name => ({
                    name,
                    type: 'categorical',
                })),
                ...(outputColumns.includes('RowClass') ? [] : [{ name: 'RowClass', type: 'categorical' }]),
                ...(outputColumns.includes('HierarchyDepth') ? [] : [{ name: 'HierarchyDepth', type: 'numerical' }]),
                ...(outputColumns.includes('SourceRowIndex') ? [] : [{ name: 'SourceRowIndex', type: 'numerical' }]),
            ],
        },
    };
};

const buildTabularNoiseCleanupFallbackAction = (data: CsvData | null): ToolCallEnvelope | null => {
    const rows = getRows(data);
    const columns = getColumns(data);
    if (rows.length === 0 || columns.length === 0) return null;
    const profile = detectReportShape(data);
    if (profile.primaryKind !== 'already_tabular' || hasHierarchicalRowSemantics(profile)) {
        return null;
    }

    const firstDataRowIndex = rows.findIndex(row => isSubstantiveTabularRow(row, columns));
    const dropIndices = rows.reduce<number[]>((indices, row, index) => {
        if (isBlankRow(row) || isFooterLikeRow(row) || isRepeatedHeaderRow(row, columns)) {
            indices.push(index);
            return indices;
        }
        if (firstDataRowIndex > 0 && index < firstDataRowIndex) {
            indices.push(index);
        }
        return indices;
    }, []);

    if (dropIndices.length === 0) {
        return null;
    }

    return {
        type: 'tool_call',
        thought: 'Apply deterministic cleanup for an already tabular dataset with report-noise rows.',
        toolName: 'data.mutate',
        args: {
            explanation: 'Detected an already tabular dataset with report-noise rows. Remove leading metadata, repeated header rows, footer rows, and blanks without reshaping the table.',
            operations: [
                {
                    id: 'drop-report-noise',
                    type: 'drop_rows_by_index',
                    reason: 'Remove top report metadata, repeated header rows, and footer lines from the staged table.',
                    indices: dropIndices,
                },
                {
                    id: 'drop-remaining-blanks',
                    type: 'drop_blank_rows',
                    reason: 'Remove any remaining blank rows after structural cleanup.',
                },
            ],
            outputColumns: [],
        },
    };
};

// Infer the series dimension business name from report metadata.
// Looks for "By X" pattern in parameter/metadata lines
// (e.g. "Income Statement By Project" → "Project").
const inferSeriesDimensionName = (data: CsvData | null): string | null => {
    const candidates = [
        ...(data?.metadataRows?.flat() ?? []),
        ...(data?.fileName ? [data.fileName] : []),
    ];
    for (const text of candidates) {
        const match = /\bby\s+([A-Z][a-zA-Z]+)/i.exec(String(text ?? ''));
        if (match) {
            const name = match[1].trim();
            // Skip generic words that aren't dimension names
            if (/^(date|the|all|each|every|reporting|report)$/i.test(name)) continue;
            return name;
        }
    }
    return null;
};

const buildPostUnpivotRename = (
    data: CsvData | null,
    hasLabelColumns: boolean,
): Array<{ id: string; type: string; reason: string; mappings: Array<{ from: string; to: string }> }> => {
    const dimensionName = inferSeriesDimensionName(data);
    if (!dimensionName) return [];

    const mappings: Array<{ from: string; to: string }> = [];
    if (hasLabelColumns) {
        mappings.push({ from: 'SeriesLabelL1', to: dimensionName });
        mappings.push({ from: 'SeriesKey', to: `${dimensionName}Code` });
    } else {
        mappings.push({ from: 'SeriesKey', to: dimensionName });
    }
    mappings.push({ from: 'SourceColumnName', to: `Source${dimensionName}Code` });

    return [{
        id: 'rename-unpivot-columns',
        type: 'rename_columns',
        reason: `Rename technical unpivot column names to business terms based on report scope ("By ${dimensionName}").`,
        mappings,
    }];
};

const applyRenamesToOutputColumns = <T extends { name: string }>(
    outputColumns: T[],
    renameOps: Array<{ mappings: Array<{ from: string; to: string }> }>,
): T[] => {
    if (renameOps.length === 0) return outputColumns;
    const renameMap = new Map(renameOps.flatMap(op => op.mappings.map(m => [m.from.toLowerCase(), m.to])));
    return outputColumns.map(col => {
        const renamed = renameMap.get(col.name.toLowerCase());
        return renamed ? { ...col, name: renamed } : col;
    });
};

export const buildWideReshapeFallbackAction = (data: CsvData | null): ToolCallEnvelope | null => {
    const rows = getRows(data);
    if (rows.length === 0) return null;
    if (isRepeatedAttributeBundleTable(data)) {
        return null;
    }

    const profile = detectReportShape(data);
    const primaryCandidate = getPrimaryShapeCandidate(profile);
    const hypothesis = getPrimaryReshapeHypothesis(profile, data);
    const columnHeaderBand = getHeaderBandByRole(profile, 'column_header');
    const seriesLabelBands = getHeaderBandsByRole(profile, 'series_label_header');
    const headerRowIndex = columnHeaderBand?.rowIndexes[0] ?? -1;
    const labelRowIndexes = seriesLabelBands.flatMap(band => band.rowIndexes);
    const parserResolvedHeader = headerRowIndex < 0 && (data?.headerLayers?.length ?? 0) > 0;

    if (!primaryCandidate || !hypothesis) {
        return null;
    }
    if (!isWideReportShape(profile) && !columnHeaderBand) {
        return null;
    }
    if (primaryCandidate.detailSeriesColumns.length < 2 || hypothesis.targetShape === 'row_table') {
        return null;
    }

    if (parserResolvedHeader) {
        const columns = getColumns(data);
        const dropIndices = rows.reduce<number[]>((indices, row, index) => {
            if (isBlankRow(row) || isFooterLikeRow(row) || isRepeatedHeaderRow(row, columns)) {
                indices.push(index);
            }
            return indices;
        }, []);
        const groupedHeaderSelection = getGroupedParserHeaderSelection(
            data,
            primaryCandidate.detailSeriesColumns,
            primaryCandidate.descriptorColumns,
        );
        const sourceColumns = groupedHeaderSelection?.sourceColumns ?? primaryCandidate.detailSeriesColumns;
        const keepColumns = groupedHeaderSelection?.keepColumns ?? primaryCandidate.descriptorColumns;
        const labelColumns = groupedHeaderSelection?.labelColumns ?? getParserResolvedLabelColumns(data, sourceColumns);
        const rowClassMappings = buildRowClassMappings(profile, dropIndices, 0);
        const hierarchyDepthMappings = buildHierarchyDepthMappings(profile, dropIndices, 0);
        const outputColumns = groupedHeaderSelection
            ? ensureOutputLabelColumns(
                [
                    ...keepColumns.map(name => ({ name, type: 'string' as const, required: true })),
                    { name: 'SeriesKey', type: 'string' as const, required: true },
                    { name: 'Value', type: 'number' as const, required: true },
                    { name: 'SourceRowIndex', type: 'number' as const, required: false },
                    { name: 'SourceColumnName', type: 'string' as const, required: false },
                ],
                labelColumns,
            )
            : [...hypothesis.emittedColumns];
        if (rowClassMappings.length > 0 && !outputColumns.some(column => column.name === 'RowClass')) {
            outputColumns.push({ name: 'RowClass', type: 'string', required: false });
        }
        if (hierarchyDepthMappings.length > 0 && !outputColumns.some(column => column.name === 'HierarchyDepth')) {
            outputColumns.push({ name: 'HierarchyDepth', type: 'number', required: false });
        }

        return {
            type: 'tool_call',
            thought: 'Apply deterministic fallback cleaning for a parser-resolved wide report.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Detected a wide report with parser-resolved headers. Drop residual noise rows and unpivot detail series into a long query-friendly table while preserving header-layer labels and source coordinates.',
                operations: [
                    ...(dropIndices.length > 0 ? [{
                        id: 'drop-report-noise',
                        type: 'drop_rows_by_index',
                        reason: 'Remove repeated headers, footer rows, and blanks from the body region before reshaping.',
                        indices: dropIndices,
                    }] : []),
                    {
                        id: 'drop-remaining-blanks',
                        type: 'drop_blank_rows',
                        reason: 'Remove any remaining blank rows before reshaping.',
                    },
                    {
                        id: 'unpivot-detail-series',
                        type: 'unpivot_columns',
                        reason: 'Convert detected detail-series columns into a long query-friendly table and preserve parser-resolved label layers.',
                        sourceColumns,
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        keepColumns,
                        ...(labelColumns.length > 0 ? { labelColumns } : {}),
                        sourceColumnNameColumn: 'SourceColumnName',
                        sourceRowIndexColumn: 'SourceRowIndex',
                        ...(rowClassMappings.length > 0 ? { rowClassColumn: 'RowClass', rowClassMappings } : {}),
                        ...(hierarchyDepthMappings.length > 0 ? { hierarchyDepthColumn: 'HierarchyDepth', hierarchyDepthMappings } : {}),
                    },
                    ...buildPostUnpivotRename(data, labelColumns.length > 0),
                ],
                outputColumns: applyRenamesToOutputColumns(outputColumns, buildPostUnpivotRename(data, labelColumns.length > 0)).map(column => ({
                    name: column.name,
                    type: toOutputType(column.type),
                })),
            },
        };
    }

    const effectiveLabelRowIndexes = inferAdditionalLabelRowIndexes(
        rows,
        primaryCandidate.detailSeriesColumns,
        primaryCandidate.descriptorColumns,
        headerRowIndex,
        labelRowIndexes,
    );
    const dropIndices = buildDropIndices(rows, headerRowIndex, effectiveLabelRowIndexes);
    const adjustedHeaderRowIndex = headerRowIndex - dropIndices.filter(index => index < headerRowIndex).length;
    if (adjustedHeaderRowIndex < 0) return null;

    const labelColumns = getLabelColumns(rows, primaryCandidate.detailSeriesColumns, headerRowIndex, effectiveLabelRowIndexes);
    const rowClassMappings = buildRowClassMappings(profile, dropIndices, 1);
    const hierarchyDepthMappings = buildHierarchyDepthMappings(profile, dropIndices, 1);
    const outputColumns = ensureOutputLabelColumns([...hypothesis.emittedColumns], labelColumns);
    if (rowClassMappings.length > 0 && !outputColumns.some(column => column.name === 'RowClass')) {
        outputColumns.push({ name: 'RowClass', type: 'string', required: false });
    }
    if (hierarchyDepthMappings.length > 0 && !outputColumns.some(column => column.name === 'HierarchyDepth')) {
        outputColumns.push({ name: 'HierarchyDepth', type: 'number', required: false });
    }

    return {
        type: 'tool_call',
        thought: 'Apply deterministic fallback cleaning for a detected report-shaped wide matrix.',
        toolName: 'data.mutate',
        args: {
            explanation: 'Detected a report-shaped wide matrix. Remove non-tabular bands, promote the real header row, and reshape detail series into a long table while preserving secondary labels and source coordinates.',
            operations: [
                ...(dropIndices.length > 0 ? [{
                    id: 'drop-report-noise',
                    type: 'drop_rows_by_index',
                    reason: 'Remove title, metadata, footer, blank, and secondary header rows before promoting the real header.',
                    indices: dropIndices,
                }] : []),
                {
                    id: 'promote-report-header',
                    type: 'promote_header_row',
                    reason: 'Promote the detected column header row.',
                    rowIndex: adjustedHeaderRowIndex,
                },
                {
                    id: 'drop-remaining-blanks',
                    type: 'drop_blank_rows',
                    reason: 'Remove any remaining blank rows after structural cleanup.',
                },
                {
                    id: 'unpivot-detail-series',
                    type: 'unpivot_columns',
                    reason: 'Convert detected detail-series columns into a long query-friendly table and preserve secondary series labels.',
                    sourceColumns: primaryCandidate.detailSeriesColumns,
                    keyColumn: 'SeriesKey',
                    valueColumn: 'Value',
                    keepColumns: primaryCandidate.descriptorColumns,
                    ...(labelColumns.length > 0 ? { labelColumns } : {}),
                    sourceColumnNameColumn: 'SourceColumnName',
                    sourceRowIndexColumn: 'SourceRowIndex',
                    ...(rowClassMappings.length > 0 ? { rowClassColumn: 'RowClass', rowClassMappings } : {}),
                    ...(hierarchyDepthMappings.length > 0 ? { hierarchyDepthColumn: 'HierarchyDepth', hierarchyDepthMappings } : {}),
                },
                ...buildPostUnpivotRename(data, labelColumns.length > 0),
            ],
            outputColumns: applyRenamesToOutputColumns(outputColumns, buildPostUnpivotRename(data, labelColumns.length > 0)).map(column => ({
                name: column.name,
                type: toOutputType(column.type),
            })),
        },
    };
};

const buildRepeatedBundleCleanupFallbackAction = (data: CsvData | null): ToolCallEnvelope | null => {
    const rows = getRows(data);
    const columns = getColumns(data);
    if (rows.length === 0 || columns.length === 0) return null;

    const profile = detectReportShape(data);
    const hasHierarchySignals = profile.rowRoles.some(candidate =>
        ['group_header', 'subtotal', 'total'].includes(candidate.role),
    );
    const hasUnsafeNoiseClassification = profile.rowRoles.some(candidate =>
        ['comment', 'noise'].includes(candidate.role),
    );
    if (!hasHierarchySignals || hasUnsafeNoiseClassification) {
        return null;
    }

    return {
        type: 'tool_call',
        thought: 'Preserve a grouped repeated-attribute bundle without reshaping its lifecycle columns.',
        toolName: 'data.mutate',
        args: {
            explanation: 'Keep repeated lifecycle attribute bundles row-oriented, remove blank rows, and annotate verified group/subtotal structure for downstream analysis.',
            operations: [
                {
                    id: 'drop-remaining-blanks',
                    type: 'drop_blank_rows',
                    reason: 'Remove blank rows without changing lifecycle attribute columns.',
                },
                {
                    id: 'annotate-hierarchy',
                    type: 'annotate_hierarchy',
                    reason: 'Preserve verified group and subtotal row roles without unpivoting lifecycle stages.',
                    rowClassColumn: 'RowClass',
                    hierarchyDepthColumn: 'HierarchyDepth',
                    sourceRowIndexColumn: 'SourceRowIndex',
                },
            ],
            outputColumns: [
                ...columns.map(name => ({ name, type: 'categorical' as const })),
                ...(columns.includes('RowClass') ? [] : [{ name: 'RowClass', type: 'categorical' as const }]),
                ...(columns.includes('HierarchyDepth') ? [] : [{ name: 'HierarchyDepth', type: 'numerical' as const }]),
                ...(columns.includes('SourceRowIndex') ? [] : [{ name: 'SourceRowIndex', type: 'numerical' as const }]),
            ],
        },
    };
};

export const buildDeterministicCleaningFallbackAction = (
    data: CsvData | null,
    rawIntakeIr?: ReportIntakeIr | null,
    runtimeTableAssessment?: RuntimeTableAssessment | null,
): ToolCallEnvelope | null => {
    // If runtime assessment exists but is not confirmed, return null —
    // deterministic fallback must not run on unconfirmed structure.
    if (runtimeTableAssessment && runtimeTableAssessment.status !== 'confirmed') {
        return null;
    }

    // Always evaluate the IR gate — even when rawIntakeIr is omitted.
    // The gate's no-IR fallback is conservative (reshape blocked),
    // which prevents shape-detector false-positives from triggering reshape.
    const irGate = evaluateCleaningIrGate({
        rawCsvData: data,
        rawIntakeIr: rawIntakeIr ?? null,
        reportShapeProfile: null, // shape profile is auxiliary only here
    });

    // Repeated lifecycle/attribute bundles are already row-oriented business
    // records. Their Date/Number/Qty/UOM families describe process stages,
    // not a metric axis, so unpivot is never safe. Hierarchy annotation is
    // allowed only when the row-role profile has verified group/subtotal
    // signals and no rows were classified as noise/comment.
    if (isRepeatedAttributeBundleTable(data)) {
        return buildRepeatedBundleCleanupFallbackAction(data);
    }

    // When runtime assessment is confirmed, use its signals directly
    if (runtimeTableAssessment?.status === 'confirmed') {
        if (runtimeTableAssessment.requiresReshape && irGate.allowsDeterministicReshape) {
            const reshapeAction = buildWideReshapeFallbackAction(data);
            if (reshapeAction) return reshapeAction;
        }
        if (runtimeTableAssessment.requiresCleanupOnly) {
            const hierarchicalAction = buildHierarchicalStatementCleanupFallbackAction(data);
            if (hierarchicalAction) return hierarchicalAction;
            const tabularAction = buildTabularNoiseCleanupFallbackAction(data);
            if (tabularAction) return tabularAction;
        }
        // Confirmed assessment but neither reshape nor cleanup needed
        if (!runtimeTableAssessment.requiresReshape && !runtimeTableAssessment.requiresCleanupOnly) {
            return null;
        }
    }

    // Fallback: no runtime assessment yet — use IR gate as before
    // Try reshape first — but only if IR gate allows it.
    if (irGate.allowsDeterministicReshape) {
        const reshapeAction = buildWideReshapeFallbackAction(data);
        if (reshapeAction) return reshapeAction;
    }

    // Hierarchical statement cleanup (not reshape — preserves tabular structure).
    const hierarchicalAction = buildHierarchicalStatementCleanupFallbackAction(data);
    if (hierarchicalAction) return hierarchicalAction;

    // Tabular noise cleanup (drop-only, no reshape).
    const tabularAction = buildTabularNoiseCleanupFallbackAction(data);
    if (tabularAction) return tabularAction;

    return null;
};
