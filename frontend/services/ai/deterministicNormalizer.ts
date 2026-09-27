import type { ColumnProfile, DataPreparationPlan, CsvRow, DataOperation } from '../../types';
import { applyDataOperations } from '../agent/execution/dataOperationRunner';
import { reconcileAiCleaningStep } from '../agent/execution/numericReconciliation';
import {
    normalizeColumnName,
    normalizeCellValue,
    normalizeMarker,
    isNumericType,
    PLACEHOLDER_MARKERS,
    CODE_LIKE_COLUMN_PATTERN,
    DIMENSION_HINT_PATTERN,
    LOSSLESS_STABILIZER_PRUNABLE_OPERATION_TYPES,
    inferOperationMode,
} from './dataPreparerConstants';

export const buildColumnTypeLookup = (columns: ColumnProfile[]) => {
    const lookup = new Map<string, ColumnProfile['type']>();
    columns.forEach(column => {
        lookup.set(normalizeColumnName(column.name), column.type);
    });
    return lookup;
};

export const hasColumnOperation = (
    operations: DataOperation[],
    columnName: string,
    operationTypes: DataOperation['type'][],
) => {
    const normalizedColumn = normalizeColumnName(columnName);
    return operations.some(operation => {
        if (!operationTypes.includes(operation.type)) {
            return false;
        }
        if (operation.type === 'normalize_empty_values') {
            return operation.columns === '*'
                || operation.columns.some(column => normalizeColumnName(column) === normalizedColumn);
        }
        if ('column' in operation && typeof operation.column === 'string') {
            return normalizeColumnName(operation.column) === normalizedColumn;
        }
        return false;
    });
};

export const operationTargetsColumn = (operation: DataOperation, columnName: string) => {
    const normalizedColumn = normalizeColumnName(columnName);
    if (operation.type === 'normalize_empty_values') {
        return operation.columns === '*'
            || operation.columns.some(column => normalizeColumnName(column) === normalizedColumn);
    }
    if ('column' in operation && typeof operation.column === 'string') {
        return normalizeColumnName(operation.column) === normalizedColumn;
    }
    return false;
};

export const buildDeterministicNormalizationPlan = (
    candidatePlan: DataPreparationPlan,
    columns: ColumnProfile[],
    sourceRows: CsvRow[],
) => {
    if (sourceRows.length === 0) {
        return {
            plan: candidatePlan,
            normalizedPlaceholderColumns: [] as string[],
            numericStringNormalizedColumns: [] as string[],
        };
    }

    const placeholderMarkerSet = new Set(PLACEHOLDER_MARKERS.map(normalizeMarker));
    const placeholderColumns = columns
        .filter(column => !isNumericType(column.type))
        .filter(column => {
            if (hasColumnOperation(candidatePlan.operations, column.name, ['replace_values', 'fill_missing'])) {
                return false;
            }
            if (CODE_LIKE_COLUMN_PATTERN.test(column.name) && !DIMENSION_HINT_PATTERN.test(column.name)) {
                return false;
            }

            const nonEmptyValues = sourceRows
                .map(row => normalizeCellValue(row[column.name]))
                .filter(Boolean);
            if (nonEmptyValues.length < 3) {
                return false;
            }

            const placeholderCount = nonEmptyValues.filter(value => placeholderMarkerSet.has(value.toLowerCase())).length;
            if (placeholderCount === 0) {
                return false;
            }

            const placeholderRatio = placeholderCount / nonEmptyValues.length;
            if (DIMENSION_HINT_PATTERN.test(column.name)) {
                return placeholderRatio <= 0.5;
            }

            return placeholderRatio <= 0.2 && (nonEmptyValues.length - placeholderCount) >= 3;
        })
        .map(column => column.name);

    const numericStringColumns = columns
        .filter(column => Boolean(column.hasFormattedNumbers))
        .filter(column => isNumericType(column.type))
        .filter(column => !hasColumnOperation(candidatePlan.operations, column.name, ['cast_column']))
        .map(column => column.name);

    if (placeholderColumns.length === 0 && numericStringColumns.length === 0) {
        return {
            plan: candidatePlan,
            normalizedPlaceholderColumns: [] as string[],
            numericStringNormalizedColumns: [] as string[],
        };
    }

    const updatedOperations = candidatePlan.operations.map(operation => {
        if (operation.type !== 'normalize_empty_values') {
            return operation;
        }

        const targetsDetectedPlaceholder = placeholderColumns.some(columnName => operationTargetsColumn(operation, columnName));
        if (!targetsDetectedPlaceholder) {
            return operation;
        }

        const mergedMarkers = [...new Set([...(operation.emptyMarkers ?? []), ...PLACEHOLDER_MARKERS])];
        return {
            ...operation,
            emptyMarkers: mergedMarkers,
        };
    });

    const coveredPlaceholderColumns = new Set(
        placeholderColumns.filter(columnName => updatedOperations.some(operation =>
            operation.type === 'normalize_empty_values' && operationTargetsColumn(operation, columnName),
        )),
    );

    const normalizationOperations: DataOperation[] = [];
    const pendingPlaceholderColumns = placeholderColumns.filter(columnName => !coveredPlaceholderColumns.has(columnName));
    if (pendingPlaceholderColumns.length > 0) {
        normalizationOperations.push({
            id: 'normalize_placeholder_dimensions',
            type: 'normalize_empty_values',
            reason: 'Normalize placeholder dimension values into null so they do not pollute grouping.',
            columns: pendingPlaceholderColumns,
            emptyMarkers: PLACEHOLDER_MARKERS,
        });
    }

    numericStringColumns.forEach(columnName => {
        const profile = columns.find(column => column.name === columnName);
        const targetType = profile?.type === 'currency'
            ? 'currency'
            : profile?.type === 'percentage'
                ? 'percentage'
                : 'number';
        normalizationOperations.push({
            id: `cast_numeric_string_${normalizeColumnName(columnName).replace(/[^a-z0-9]+/g, '_')}`,
            type: 'cast_column',
            reason: 'Cast numeric-looking text into a queryable numeric type before SQL precheck.',
            column: columnName,
            targetType,
        });
    });

    return {
        plan: {
            ...candidatePlan,
            operations: [...normalizationOperations, ...updatedOperations],
            normalizedPlaceholderColumns: [
                ...(candidatePlan.normalizedPlaceholderColumns ?? []),
                ...placeholderColumns,
            ],
            numericStringNormalizedColumns: [
                ...(candidatePlan.numericStringNormalizedColumns ?? []),
                ...numericStringColumns,
            ],
        },
        normalizedPlaceholderColumns: placeholderColumns,
        numericStringNormalizedColumns: numericStringColumns,
    };
};

export type LosslessStabilizationResult = {
    plan: DataPreparationPlan;
    prunedOperations: Array<{ operation: DataOperation; reason: string }>;
    abortedReason: string | null;
};

export const cloneRows = (rows: CsvRow[]) => rows.map(row => ({ ...row }));

export const stabilizeLosslessOnlyPlan = (
    candidatePlan: DataPreparationPlan,
    columns: ColumnProfile[],
    sampleRows: CsvRow[],
): LosslessStabilizationResult => {
    if (
        candidatePlan.operations.length === 0
        || inferOperationMode(candidatePlan.operations) !== 'lossless'
    ) {
        return {
            plan: candidatePlan,
            prunedOperations: [],
            abortedReason: null,
        };
    }

    let currentRows = cloneRows(sampleRows);
    const keptOperations: DataOperation[] = [];
    const prunedOperations: Array<{ operation: DataOperation; reason: string }> = [];

    for (const operation of candidatePlan.operations) {
        if (!LOSSLESS_STABILIZER_PRUNABLE_OPERATION_TYPES.has(operation.type)) {
            try {
                currentRows = applyDataOperations(currentRows, [operation], { allowEmptyResult: false }).data;
                keptOperations.push(operation);
                continue;
            } catch (error) {
                return {
                    plan: candidatePlan,
                    prunedOperations: [],
                    abortedReason: error instanceof Error ? error.message : String(error),
                };
            }
        }

        try {
            const beforeRows = cloneRows(currentRows);
            const execution = applyDataOperations(beforeRows, [operation], { allowEmptyResult: false });
            const stepReport = reconcileAiCleaningStep(
                {
                    id: `lossless_stabilizer_${operation.id}`,
                    mode: 'lossless',
                    reason: operation.reason,
                    operations: [operation],
                },
                beforeRows,
                execution.data,
                columns,
            );

            if (!stepReport.passed) {
                prunedOperations.push({
                    operation,
                    reason: stepReport.failures[0]?.detail ?? `Pruned ${operation.type} after bounded lossless stabilization.`,
                });
                continue;
            }

            currentRows = execution.data;
            keptOperations.push(operation);
        } catch (error) {
            return {
                plan: candidatePlan,
                prunedOperations: [],
                abortedReason: error instanceof Error ? error.message : String(error),
            };
        }
    }

    return {
        plan: {
            ...candidatePlan,
            operations: keptOperations,
            planStatus: keptOperations.length > 0 ? 'operations' : 'schema_only',
            consistencyIssues: keptOperations.length > 0 ? candidatePlan.consistencyIssues : [],
        },
        prunedOperations,
        abortedReason: null,
    };
};
