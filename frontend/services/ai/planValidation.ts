import type { ColumnProfile, DataPreparationPlan, CsvRow, CsvData, DataOperation, RuntimeTableAssessment } from '../../types';
import { applyDataOperations } from '../agent/execution/dataOperationRunner';
import { normalizeUnpivotHierarchyDepthMappings } from '../agent/execution/unpivotOperationUtils';
import { detectReportShape, isWideReportShape } from '../agent/reportShapeDetector';
import { verifyCleanedDatasetShape } from '../agent/cleaningVerification';
import { isRepeatedAttributeBundleTable } from '../agent/repeatedBundleTableDetector';
import {
    buildDeterministicCleaningFallbackAction,
    buildWideReshapeFallbackAction,
} from '../agent/orchestration/deterministicCleaningFallback';
import { ensureStructuralMetadataOutputColumns } from '../agent/structuralMetadata';
import type { ContextTelemetryTarget } from './contextManager';
import {
    normalizeColumnName,
    MUTATION_CLAIM_PATTERN,
    LABEL_LAYER_RETENTION_SIGNAL,
    emitDataPreparationTelemetry,
} from './dataPreparerConstants';
import { buildDeterministicNormalizationPlan } from './deterministicNormalizer';
import { alignSchemaOnlyOutputColumns, compareSchemaOnlyOutput } from './schemaAlignment';

export const buildHierarchyAnnotationFallbackPlan = (columns: ColumnProfile[]): DataPreparationPlan => ({
    explanation: 'Add hierarchy annotations so hierarchical parent/detail rows remain verifiable in the cleaned output.',
    operations: [
        {
            id: 'annotate_hierarchy_fallback',
            type: 'annotate_hierarchy',
            reason: 'Preserve hierarchy depth, row class, and source row index for hierarchical statements.',
            rowClassColumn: 'RowClass',
            hierarchyDepthColumn: 'HierarchyDepth',
            sourceRowIndexColumn: 'SourceRowIndex',
        },
    ],
    outputColumns: [
        ...ensureStructuralMetadataOutputColumns(columns),
    ],
    planStatus: 'operations',
    consistencyIssues: [],
});

export const ensureHierarchyOutputColumns = (outputColumns: ColumnProfile[]) => {
    return ensureStructuralMetadataOutputColumns(outputColumns);
};

export const appendAnnotateHierarchyOperation = (
    plan: DataPreparationPlan,
    baselineColumns: ColumnProfile[],
): DataPreparationPlan => {
    if (plan.operations.some(operation => operation.type === 'annotate_hierarchy')) {
        return plan;
    }

    const outputColumns = ensureHierarchyOutputColumns(
        plan.outputColumns?.length > 0 ? [...plan.outputColumns] : [...baselineColumns],
    );

    return {
        ...plan,
        explanation: `${plan.explanation} Preserve hierarchy metadata for verification and downstream analysis.`,
        operations: [
            ...plan.operations,
            {
                id: 'append_hierarchy_annotation',
                type: 'annotate_hierarchy',
                reason: 'Preserve hierarchy depth, row class, and source row coordinates for hierarchical rows.',
                rowClassColumn: 'RowClass',
                hierarchyDepthColumn: 'HierarchyDepth',
                sourceRowIndexColumn: 'SourceRowIndex',
            },
        ],
        outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    };
};

export const reorderWideValueCastAfterUnpivot = (operations: DataOperation[]): DataOperation[] | null => {
    const lastUnpivotIndex = operations.reduce((index, operation, currentIndex) => (
        operation.type === 'unpivot_columns' && normalizeColumnName(operation.valueColumn) === 'value'
            ? currentIndex
            : index
    ), -1);

    if (lastUnpivotIndex < 0) {
        return null;
    }

    const valueCastIndexes = operations.reduce<number[]>((indexes, operation, currentIndex) => {
        if (
            currentIndex < lastUnpivotIndex
            && operation.type === 'cast_column'
            && normalizeColumnName(operation.column) === 'value'
        ) {
            indexes.push(currentIndex);
        }
        return indexes;
    }, []);

    if (valueCastIndexes.length === 0) {
        return null;
    }

    const reordered = operations.filter((_operation, index) => !valueCastIndexes.includes(index));
    const castOperations = valueCastIndexes.map(index => operations[index]);
    reordered.splice(lastUnpivotIndex + 1 - valueCastIndexes.filter(index => index <= lastUnpivotIndex).length, 0, ...castOperations);
    return reordered;
};

export const patchHierarchyUnpivotFromFallback = (
    operations: DataOperation[],
    fallbackPlan: DataPreparationPlan | null,
): DataOperation[] | null => {
    if (!fallbackPlan) {
        return null;
    }

    const fallbackUnpivot = [...fallbackPlan.operations]
        .reverse()
        .find(operation => operation.type === 'unpivot_columns');
    const targetIndex = [...operations]
        .map((operation, index) => ({ operation, index }))
        .reverse()
        .find(candidate => candidate.operation.type === 'unpivot_columns')?.index ?? -1;

    if (!fallbackUnpivot || fallbackUnpivot.type !== 'unpivot_columns' || targetIndex < 0) {
        return null;
    }

    const targetOperation = operations[targetIndex];
    if (targetOperation.type !== 'unpivot_columns') {
        return null;
    }

    const nextOperation: typeof targetOperation = {
        ...targetOperation,
        sourceRowIndexColumn: targetOperation.sourceRowIndexColumn ?? fallbackUnpivot.sourceRowIndexColumn,
        rowClassColumn: targetOperation.rowClassColumn ?? fallbackUnpivot.rowClassColumn,
        rowClassMappings: (targetOperation.rowClassMappings?.length ?? 0) > 0
            ? targetOperation.rowClassMappings
            : fallbackUnpivot.rowClassMappings,
        hierarchyDepthColumn: targetOperation.hierarchyDepthColumn ?? fallbackUnpivot.hierarchyDepthColumn,
        hierarchyDepthMappings: (targetOperation.hierarchyDepthMappings?.length ?? 0) > 0
            ? targetOperation.hierarchyDepthMappings
            : fallbackUnpivot.hierarchyDepthMappings,
    };

    const nextOperations = [...operations];
    nextOperations[targetIndex] = nextOperation;
    return nextOperations;
};

export const simulatePlanOnRows = (
    sourceData: CsvData,
    plan: DataPreparationPlan,
): CsvData => {
    if (plan.operations.length === 0) {
        return {
            ...sourceData,
            data: [...sourceData.data],
        };
    }

    const result = applyDataOperations(sourceData.data, plan.operations);
    if (!Array.isArray(result.data)) {
        throw new Error('Generated operations did not return an array.');
    }

    return {
        ...sourceData,
        data: result.data,
    };
};

export const getHierarchyWidePlanIssue = (
    operations: DataOperation[],
    shouldForceHierarchyFallback: boolean,
    requireHierarchyDepth: boolean,
): { message: string; canUseAnnotationFallback: boolean } | null => {
    if (!shouldForceHierarchyFallback) {
        return null;
    }

    if (operations.some(operation => operation.type === 'annotate_hierarchy')) {
        return null;
    }

    const latestUnpivot = [...operations]
        .reverse()
        .find(operation => operation.type === 'unpivot_columns');

    if (!latestUnpivot || latestUnpivot.type !== 'unpivot_columns') {
        return {
            message: 'Hierarchical wide plans must either add annotate_hierarchy or reshape with unpivot_columns that preserves hierarchy fields.',
            canUseAnnotationFallback: true,
        };
    }

    if (!latestUnpivot.rowClassColumn) {
        return {
            message: 'Hierarchical wide unpivot plans must preserve rowClassColumn.',
            canUseAnnotationFallback: false,
        };
    }

    if (requireHierarchyDepth && !latestUnpivot.hierarchyDepthColumn) {
        return {
            message: 'Hierarchical wide unpivot plans must preserve hierarchyDepthColumn.',
            canUseAnnotationFallback: false,
        };
    }

    if (!latestUnpivot.sourceRowIndexColumn) {
        return {
            message: 'Hierarchical wide unpivot plans must preserve sourceRowIndexColumn.',
            canUseAnnotationFallback: true,
        };
    }

    if (requireHierarchyDepth && normalizeUnpivotHierarchyDepthMappings(latestUnpivot).length === 0) {
        return {
            message: 'Hierarchical wide unpivot plans must preserve hierarchyDepthMappings.',
            canUseAnnotationFallback: true,
        };
    }

    return null;
};

export const hasExecutableHierarchyShape = (
    sampleData: CsvRow[],
    sourceData?: CsvData | null,
) => {
    const probeData: CsvData = {
        fileName: sourceData?.fileName ?? 'hierarchy-probe.csv',
        data: (sourceData?.data?.length ?? 0) > 0 ? sourceData!.data : sampleData,
        // Match annotate_hierarchy mutator semantics exactly so preflight checks
        // do not accept shapes that the executor would later reject.
        metadataRows: [],
        headerLayers: [],
        summaryRows: [],
        headerDepth: 1,
    };
    const profile = detectReportShape(probeData);
    return profile.primaryKind === 'hierarchical_statement'
        || profile.rowRoles.some(candidate =>
            ['group_header', 'subtotal', 'total'].includes(candidate.role),
        );
};

export const canAppendAnnotateHierarchyOperation = (
    plan: DataPreparationPlan,
    sampleData: CsvRow[],
    sourceData?: CsvData | null,
) => {
    if (plan.operations.some(operation => operation.type === 'annotate_hierarchy')) {
        return true;
    }

    try {
        const simulatedSample: CsvData = {
            fileName: 'hierarchy-append-probe.csv',
            data: applyDataOperations(sampleData, plan.operations).data,
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
        };
        if (!hasExecutableHierarchyShape(simulatedSample.data, simulatedSample)) {
            return false;
        }
        if (!sourceData) {
            return true;
        }
        const simulatedSource = simulatePlanOnRows(sourceData, plan);
        return hasExecutableHierarchyShape(simulatedSource.data, simulatedSource);
    } catch {
        return false;
    }
};

export const canAppendSourceOnlyAnnotateHierarchyOperation = (
    plan: DataPreparationPlan,
    sourceData?: CsvData | null,
) => {
    if (!sourceData) {
        return false;
    }

    if (plan.operations.some(operation => operation.type === 'annotate_hierarchy')) {
        return true;
    }

    try {
        const simulatedSource = simulatePlanOnRows(sourceData, plan);
        return hasExecutableHierarchyShape(simulatedSource.data, simulatedSource);
    } catch {
        return false;
    }
};

export const canBypassSampleExecutionForSourceOnlyHierarchyPlan = (
    plan: DataPreparationPlan,
    sampleData: CsvRow[],
    sourceData?: CsvData | null,
) => {
    if (!sourceData || plan.operations.every(operation => operation.type !== 'annotate_hierarchy')) {
        return false;
    }

    const annotateIndex = plan.operations.findIndex(operation => operation.type === 'annotate_hierarchy');
    const preAnnotateOperations = annotateIndex > 0 ? plan.operations.slice(0, annotateIndex) : [];

    try {
        const sampleRowsBeforeAnnotate = preAnnotateOperations.length > 0
            ? applyDataOperations(sampleData, preAnnotateOperations).data
            : sampleData;
        if (hasExecutableHierarchyShape(sampleRowsBeforeAnnotate, null)) {
            return false;
        }

        const sourceRowsBeforeAnnotate = preAnnotateOperations.length > 0
            ? applyDataOperations(sourceData.data, preAnnotateOperations).data
            : sourceData.data;
        return hasExecutableHierarchyShape(sourceRowsBeforeAnnotate, {
            ...sourceData,
            data: sourceRowsBeforeAnnotate,
        });
    } catch {
        return false;
    }
};

export const buildDeterministicWideFallbackPlan = (
    columns: ColumnProfile[],
    sourceData?: CsvData | null,
): DataPreparationPlan | null => {
    if (!sourceData) {
        return null;
    }

    const action = buildWideReshapeFallbackAction(sourceData)
        ?? buildDeterministicCleaningFallbackAction(
            sourceData,
            undefined,
            {
                source: 'raw_inspect',
                status: 'confirmed',
                headerRowIndex: 0,
                headerLayerRowIndexes: [],
                bodyStartIndex: 0,
                summaryStartIndex: sourceData.data.length,
                repeatedHeaderRowIndexes: [],
                parameterRowIndexes: [],
                noiseRowIndexes: [],
                requiresReshape: true,
                requiresCleanupOnly: false,
                reason: 'deterministic wide fallback for AI planning recovery',
            } satisfies RuntimeTableAssessment,
        );
    if (!action) {
        return null;
    }

    const explanation = typeof action.args?.explanation === 'string'
        ? action.args.explanation
        : 'Apply deterministic fallback cleaning for a wide report.';
    const operations = Array.isArray(action.args?.operations)
        ? action.args.operations as DataOperation[]
        : [];
    const outputColumns = Array.isArray(action.args?.outputColumns) && action.args.outputColumns.length > 0
        ? action.args.outputColumns as ColumnProfile[]
        : columns;

    if (operations.length === 0) {
        return null;
    }

    return {
        explanation,
        operations,
        outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    };
};

export const buildDeterministicCleanupFallbackPlan = (
    columns: ColumnProfile[],
    sourceData?: CsvData | null,
    runtimeTableAssessment?: RuntimeTableAssessment | null,
): DataPreparationPlan | null => {
    if (!sourceData) {
        return null;
    }

    const action = buildDeterministicCleaningFallbackAction(sourceData, undefined, runtimeTableAssessment);
    if (!action) {
        return null;
    }

    const explanation = typeof action.args?.explanation === 'string'
        ? action.args.explanation
        : 'Apply deterministic fallback cleaning for a tabular report.';
    const operations = Array.isArray(action.args?.operations)
        ? action.args.operations as DataOperation[]
        : [];
    const outputColumns = Array.isArray(action.args?.outputColumns) && action.args.outputColumns.length > 0
        ? action.args.outputColumns as ColumnProfile[]
        : columns;

    if (operations.length === 0) {
        return null;
    }

    return {
        explanation,
        operations,
        outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    };
};

export const buildConfirmedCleanupOnlyAssessment = (
    sourceData: CsvData,
    reason: string,
): RuntimeTableAssessment => ({
    source: 'raw_inspect',
    status: 'confirmed',
    headerRowIndex: 0,
    headerLayerRowIndexes: (sourceData.headerLayers ?? []).map((_, index) => index),
    bodyStartIndex: 0,
    summaryStartIndex: sourceData.data.length,
    repeatedHeaderRowIndexes: [],
    parameterRowIndexes: [],
    noiseRowIndexes: [],
    requiresReshape: false,
    requiresCleanupOnly: true,
    reason,
});

export const resolveDeterministicFastPathPlan = (params: {
    columns: ColumnProfile[];
    sourceData?: CsvData | null;
    sourceShapeProfile: ReturnType<typeof detectReportShape> | null;
    hierarchyPreservationRequired: boolean;
    shouldForceHierarchyFallback: boolean;
    boundedHierarchyAnnotationAvailable: boolean;
    deterministicCleanupFallback: DataPreparationPlan | null;
    telemetryTarget?: ContextTelemetryTarget;
}) => {
    if (!params.sourceData) {
        return null;
    }

    const evaluate = (plan: DataPreparationPlan) => {
        try {
            const cleanedData = simulatePlanOnRows(params.sourceData!, plan);
            return verifyCleanedDatasetShape(params.sourceData!, cleanedData, plan);
        } catch (error) {
            return {
                passed: false,
                reason: error instanceof Error ? error.message : String(error),
                signalKey: null,
                detail: null,
            };
        }
    };

    const isStructuredHierarchyNormalizationCandidate = params.sourceShapeProfile?.primaryKind === 'already_tabular'
        && params.hierarchyPreservationRequired;
    if (isStructuredHierarchyNormalizationCandidate && params.boundedHierarchyAnnotationAvailable) {
        const hierarchyNormalizationPlan = buildDeterministicNormalizationPlan(
            buildHierarchyAnnotationFallbackPlan(params.columns),
            params.columns,
            params.sourceData.data,
        ).plan;
        const verification = evaluate(hierarchyNormalizationPlan);
        if (verification.passed) {
            emitDataPreparationTelemetry(
                params.telemetryTarget,
                'data_prep_hierarchy_annotation_normalized',
                'Skipped provider planning because hierarchy annotation already satisfied the cleaning contract for a grouped tabular report.',
                {
                    reasonCode: 'hierarchy_annotation_fast_path',
                    fastPath: true,
                    reportShapeKind: params.sourceShapeProfile?.primaryKind ?? 'unknown',
                },
            );
            return hierarchyNormalizationPlan;
        }
    }

    const isHierarchyHeavy = params.sourceShapeProfile?.primaryKind === 'mixed_report'
        || isRepeatedAttributeBundleTable(params.sourceData);

    if (isHierarchyHeavy && params.boundedHierarchyAnnotationAvailable) {
        const hierarchyFallbackPlan = buildHierarchyAnnotationFallbackPlan(params.columns);
        const verification = evaluate(hierarchyFallbackPlan);
        if (verification.passed) {
            emitDataPreparationTelemetry(
                params.telemetryTarget,
                'data_prep_hierarchy_annotation_normalized',
                'Skipped provider planning because annotate_hierarchy already satisfied the cleaning contract for a hierarchy-heavy report.',
                {
                    reasonCode: 'hierarchy_annotation_fast_path',
                    fastPath: true,
                    reportShapeKind: params.sourceShapeProfile?.primaryKind ?? 'unknown',
                },
            );
            return hierarchyFallbackPlan;
        }
    }

    if (isHierarchyHeavy && params.deterministicCleanupFallback) {
        const verification = evaluate(params.deterministicCleanupFallback);
        if (verification.passed) {
            emitDataPreparationTelemetry(
                params.telemetryTarget,
                'data_prep_deterministic_fallback_used',
                'Skipped provider planning because deterministic cleanup already satisfied the cleaning contract for a hierarchy-heavy report.',
                {
                    reasonCode: 'shape_mismatch',
                    fastPath: true,
                    reportShapeKind: params.sourceShapeProfile?.primaryKind ?? 'unknown',
                },
            );
            return params.deterministicCleanupFallback;
        }
    }

    return null;
};

export const buildBlankRowCleanupFallbackPlan = (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    sourceData?: CsvData | null,
): DataPreparationPlan | null => {
    const rows = (sourceData?.data?.length ?? 0) > 0 ? sourceData!.data : sampleData;
    const hasBlankRows = rows.some(row => Object.values(row).every(value => String(value ?? '').trim().length === 0));
    if (!hasBlankRows) {
        return null;
    }

    return {
        explanation: 'Remove fully blank rows while preserving the existing tabular schema.',
        operations: [
            {
                id: 'drop_blank_rows_fallback',
                type: 'drop_blank_rows',
                reason: 'Remove fully blank rows that would otherwise leak into verification.',
            },
        ],
        outputColumns: columns,
        planStatus: 'operations',
        consistencyIssues: [],
    };
};

export const validateDataPreparationPlan = (
    plan: DataPreparationPlan,
    baselineColumns: ColumnProfile[],
): DataPreparationPlan => {
    if (plan.operations.length > 0) {
        return {
            ...plan,
            planStatus: 'operations',
            consistencyIssues: [],
        };
    }

    const issues: string[] = [];
    const explanationClaimsMutation = MUTATION_CLAIM_PATTERN.test(plan.explanation);
    const schemaIssues = compareSchemaOnlyOutput(baselineColumns, plan.outputColumns);

    if (!explanationClaimsMutation && schemaIssues.length > 0) {
        return {
            ...plan,
            outputColumns: alignSchemaOnlyOutputColumns(baselineColumns, plan.outputColumns),
            planStatus: 'schema_only',
            consistencyIssues: [],
        };
    }

    issues.push(...schemaIssues);
    if (explanationClaimsMutation) {
        issues.push('Schema-only plan explanation claims executed mutations despite having zero operations.');
    }

    return {
        ...plan,
        planStatus: issues.length > 0 ? 'inconsistent' : 'schema_only',
        consistencyIssues: issues,
    };
};
