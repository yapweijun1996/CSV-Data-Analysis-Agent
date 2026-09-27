import type { ColumnProfile, Settings, DataPreparationPlan, CsvRow, CsvData, DataPreparationRuntimeContext, DataPreparationPlanGenerationOptions } from '../../types';
import { Output, jsonSchema } from 'ai';
import { streamGenerateText } from './streamGenerateText';
import { getDataPreparationProviderSchema } from './schemas/dataSchemas';
import { createDataPreparationPrompt, dataPreparationSystemPrompt } from '../prompts/dataPrompts';
import { createProviderModel } from './providerConfig';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { withTransientRetry } from './transientRetry';
import {
    ContextTelemetryTarget,
    createContextSection,
    formatRows,
    prepareManagedContext,
    reportContextDiagnostics,
} from './contextManager';
import { applyDataOperations, normalizeDataPreparationPlan } from '../agent/execution/dataOperationRunner';
import { detectReportShape, isWideReportShape } from '../agent/reportShapeDetector';
import { buildReshapeHypotheses } from '../agent/reportShapeHypothesis';
import { isRepeatedAttributeBundleTable } from '../agent/repeatedBundleTableDetector';
import { runWithOverflowCompaction } from './overflowRetry';
import { isRuntimeAbortError, throwIfAborted } from '../agent/runtime/runtimeAbort';
import { verifyCleanedDatasetShape } from '../agent/cleaningVerification';
import {
    isMeaningfulHeaderLayer,
    WIDE_TABLE_VALUE_CAST_ORDER_ERROR,
    LABEL_LAYER_RETENTION_SIGNAL,
    LABEL_LAYER_RETENTION_REASON,
    resolveDataPreparationOptions,
    emitDataPreparationTelemetry,
    classifyDataPreparationFailureReason,
    emitDataPreparationStageTiming,
} from './dataPreparerConstants';
import { buildDeterministicNormalizationPlan } from './deterministicNormalizer';
import { stabilizeLosslessOnlyPlan } from './deterministicNormalizer';
import {
    rewritePlanColumnAliasesFromHeaderLayers,
    stabilizeZeroOperationSchemaOnlyPlan,
    buildRetryFeedback,
    alignSchemaOnlyOutputColumns,
} from './schemaAlignment';
import {
    buildDataPreparationSchemaContext,
    buildDataPreparationSampleRows,
    buildHeaderLayerContext,
    getWideTableValueCastOrderIssue,
} from './wideTableProfiler';
import {
    validateDataPreparationPlan,
    buildHierarchyAnnotationFallbackPlan,
    appendAnnotateHierarchyOperation,
    ensureHierarchyOutputColumns,
    reorderWideValueCastAfterUnpivot,
    patchHierarchyUnpivotFromFallback,
    simulatePlanOnRows,
    getHierarchyWidePlanIssue,
    hasExecutableHierarchyShape,
    canAppendAnnotateHierarchyOperation,
    canAppendSourceOnlyAnnotateHierarchyOperation,
    canBypassSampleExecutionForSourceOnlyHierarchyPlan,
    buildDeterministicWideFallbackPlan,
    buildDeterministicCleanupFallbackPlan,
    buildConfirmedCleanupOnlyAssessment,
    resolveDeterministicFastPathPlan,
    buildBlankRowCleanupFallbackPlan,
} from './planValidation';

export { buildDeterministicNormalizationPlan } from './deterministicNormalizer';
export { validateDataPreparationPlan } from './planValidation';

export const generateDataPreparationPlan = async (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    lastError?: Error,
    telemetryTarget?: ContextTelemetryTarget,
    sourceData?: CsvData | null,
    runtimeContext?: DataPreparationRuntimeContext,
    options?: DataPreparationPlanGenerationOptions,
): Promise<DataPreparationPlan> => {
    const resolvedOptions = resolveDataPreparationOptions(options);
    const abortSignal = resolvedOptions.abortSignal;
    const schemaContext = buildDataPreparationSchemaContext(columns, sourceData);
    const sampleContext = buildDataPreparationSampleRows(columns, sampleData, sourceData);
    const headerLayerContext = buildHeaderLayerContext(sourceData);
    const sourceShapeProfile = sourceData ? detectReportShape(sourceData) : null;
    const sourcePrimaryHypothesis = sourceData && sourceShapeProfile
        ? buildReshapeHypotheses(sourceShapeProfile, sourceData)[0] ?? null
        : null;
    const useCompactWideTableSchema = settings.provider === 'google' && schemaContext.wideProfile.isWide;
    const responseSchema = getDataPreparationProviderSchema({ compactWideTable: useCompactWideTableSchema });
    const hierarchyPreservationRequired = sampleContext.hasHierarchySignal
        || sourceShapeProfile?.primaryKind === 'hierarchical_statement'
        || (sourceShapeProfile?.primaryKind === 'mixed_report' && Boolean(sourcePrimaryHypothesis?.hierarchyDepthColumn))
        || Boolean(sourcePrimaryHypothesis?.hierarchyDepthColumn);
    const hierarchyDepthPreservationRequired = Boolean(sourcePrimaryHypothesis?.hierarchyDepthColumn)
        || Boolean(sourceShapeProfile?.rowRoles.some(candidate => (candidate.depth ?? 0) > 0));
    const shouldForceHierarchyFallback = schemaContext.wideProfile.isWide && hierarchyPreservationRequired;
    const sampleHierarchyAnnotationAvailable = hasExecutableHierarchyShape(sampleData, null);
    const sourceHierarchyAnnotationAvailable = hasExecutableHierarchyShape(sampleData, sourceData);
    const boundedHierarchyAnnotationAvailable = sourceHierarchyAnnotationAvailable;
    const canUseHierarchyAnnotationFallback = resolvedOptions.allowHierarchyAnnotationFallback
        && shouldForceHierarchyFallback
        && boundedHierarchyAnnotationAvailable;
    const repeatedBundleCleanupAssessment = sourceData && isRepeatedAttributeBundleTable(sourceData)
        ? buildConfirmedCleanupOnlyAssessment(
            sourceData,
            'Repeated attribute bundle reports should prefer deterministic cleanup and hierarchy preservation over reshape.',
        )
        : null;
    const treatHierarchyAnnotationAsPrimaryNormalization = hierarchyPreservationRequired && (
        sourceShapeProfile?.primaryKind === 'hierarchical_statement'
        || sourceShapeProfile?.primaryKind === 'mixed_report'
        || Boolean(repeatedBundleCleanupAssessment)
    );
    const treatWideFallbackAsPrimaryNormalization = schemaContext.wideProfile.isWide
        && !hierarchyDepthPreservationRequired
        && (sourceData?.headerLayers?.some(isMeaningfulHeaderLayer) ?? false);
    const strictMode = resolvedOptions.maxAttempts === 1 && !resolvedOptions.allowInternalRetry;
    const salvageWideFallback = buildDeterministicWideFallbackPlan(columns, sourceData);
    const salvageStagingCleanupFallback = sourceData
        ? buildDeterministicCleanupFallbackPlan(columns, sourceData, repeatedBundleCleanupAssessment)
        : null;
    const deterministicCleanupFallback = resolvedOptions.allowDeterministicFallback
        ? schemaContext.wideProfile.isWide
            ? shouldForceHierarchyFallback
                ? salvageStagingCleanupFallback ?? salvageWideFallback
                : salvageWideFallback ?? salvageStagingCleanupFallback
            : buildDeterministicCleanupFallbackPlan(columns, sourceData, repeatedBundleCleanupAssessment)
        : null;
    let selfCorrectionTelemetryEmitted = false;

    const fastPathStartedAt = Date.now();
    const deterministicFastPathPlan = resolveDeterministicFastPathPlan({
        columns,
        sourceData,
        sourceShapeProfile,
        hierarchyPreservationRequired,
        shouldForceHierarchyFallback,
        boundedHierarchyAnnotationAvailable,
        deterministicCleanupFallback,
        telemetryTarget,
    });
    if (deterministicFastPathPlan) {
        emitDataPreparationStageTiming(
            telemetryTarget,
            'fast_path_verification',
            Date.now() - fastPathStartedAt,
            { fastPath: true },
        );
        return deterministicFastPathPlan;
    }

    for(let i=0; i < resolvedOptions.maxAttempts; i++) {
        try {
            throwIfAborted(abortSignal);
            const systemPrompt = dataPreparationSystemPrompt;
            const { model, modelId } = createProviderModel(settings, settings.complexModel);
            const providerCallStartedAt = Date.now();
            const result = await runWithOverflowCompaction({
                provider: settings.provider,
                abortSignal,
                execute: async compactionMode => {
                    throwIfAborted(abortSignal);
                    const managed = await prepareManagedContext({
                        callType: 'data_prep',
                        systemText: systemPrompt,
                        baseUserText: 'Dataset context for planning:',
                        sections: [
                            createContextSection('dataset_schema', `Dataset columns (initial schema):\n${schemaContext.schemaText}`, 'required', 'sticky'),
                            createContextSection('wide_table_summary', `Wide-table structure summary:\n${schemaContext.wideTableSummary ?? 'No wide-table compression applied.'}`, 'high', 'sticky'),
                            createContextSection('header_layers', `Preserved raw header layers:\n${headerLayerContext.summary ?? 'No preserved header label layers.'}`, 'high', 'sticky'),
                            createContextSection('sample_data', `Sample data:\n${formatRows(sampleContext.rows)}`, 'high', 'prunable'),
                            createContextSection('sample_summary', `Sample summary:\n${sampleContext.sampleSummary ?? 'Using standard row preview without wide-table compression.'}`, 'medium', 'prunable'),
                        ],
                        settings,
                        modelId,
                        compactionMode,
                    });
                    reportContextDiagnostics(telemetryTarget, managed.diagnostics);
                    const promptContent = createDataPreparationPrompt(
                        managed.userText,
                        buildRetryFeedback(lastError),
                        {
                            wideTable: schemaContext.wideProfile.isWide,
                            requiredLabelLayers: headerLayerContext.requiredLabelLayers,
                            hierarchySignal: sampleContext.hasHierarchySignal,
                            inspectionSummary: runtimeContext?.iterationContext?.inspectionSummary
                                ?? (runtimeContext?.rowInspection
                                    ? `unknown=${runtimeContext.rowInspection.residualUnknownRowIndexes.length}, summary_like=${runtimeContext.rowInspection.residualSummaryLikeRowIndexes.length}`
                                    : null),
                            priorVerificationFailures: runtimeContext?.priorVerificationFailures,
                            residualRowsPreview: runtimeContext?.residualRowsPreview?.length
                                ? formatRows(runtimeContext.residualRowsPreview.slice(0, 8))
                                : null,
                            allowedOperationTypes: runtimeContext?.allowedOperationTypes,
                            iterationContext: runtimeContext?.iterationContext
                                ? {
                                    round: runtimeContext.iterationContext.round,
                                    maxRounds: runtimeContext.iterationContext.maxRounds,
                                }
                                : undefined,
                        },
                    );

                    return withTransientRetry(
                        (fb) => streamGenerateText({
                            model: fb ?? model,
                            messages: [
                                { role: 'system', content: managed.systemText },
                                { role: 'user', content: promptContent },
                            ],
                            abortSignal,
                            output: Output.object({
                                schema: jsonSchema(prepareSchemaForProvider(responseSchema, settings.provider)),
                            }),
                        }),
                        { settings, primaryModelId: modelId, label: 'dataPreparer', abortSignal },
                    );
                },
            });
            emitDataPreparationStageTiming(
                telemetryTarget,
                'provider_generation',
                Date.now() - providerCallStartedAt,
                { attempt: i + 1, strictMode },
            );

            const plan = normalizeDataPreparationPlan(result.output as DataPreparationPlan);
            if (!plan) {
                throw new Error('AI returned an invalid data preparation plan.');
            }

            const telemetryMetaBase = {
                strictMode,
            };

            const emitPlanSalvage = (
                responseType:
                    | 'data_prep_plan_salvaged_hierarchy'
                    | 'data_prep_plan_salvaged_wide_cast_order'
                    | 'data_prep_plan_salvaged_wide_fallback',
                detail: string,
                meta?: Record<string, unknown>,
            ) => emitDataPreparationTelemetry(
                telemetryTarget,
                responseType,
                detail,
                {
                    ...telemetryMetaBase,
                    ...(meta ?? {}),
                },
            );

            const emitHierarchyAnnotationNormalization = (
                detail: string,
                meta?: Record<string, unknown>,
            ) => emitDataPreparationTelemetry(
                telemetryTarget,
                'data_prep_hierarchy_annotation_normalized',
                detail,
                {
                    ...telemetryMetaBase,
                    reasonCode: 'hierarchy_annotation_normalized',
                    ...(meta ?? {}),
                },
            );

            const emitWideReshapeNormalization = (
                detail: string,
                meta?: Record<string, unknown>,
            ) => emitDataPreparationTelemetry(
                telemetryTarget,
                'data_prep_wide_reshape_normalized',
                detail,
                {
                    ...telemetryMetaBase,
                    reasonCode: 'wide_reshape_normalized',
                    ...(meta ?? {}),
                },
            );

            const emitHierarchyNormalizationOrSalvage = (
                detail: string,
                meta?: Record<string, unknown>,
            ) => {
                if (treatHierarchyAnnotationAsPrimaryNormalization) {
                    emitHierarchyAnnotationNormalization(detail, meta);
                    return;
                }

                emitPlanSalvage(
                    'data_prep_plan_salvaged_hierarchy',
                    detail,
                    meta,
                );
            };

            const emitWideFallbackNormalizationOrSalvage = (
                detail: string,
                meta?: Record<string, unknown>,
            ) => {
                if (treatWideFallbackAsPrimaryNormalization) {
                    emitWideReshapeNormalization(detail, meta);
                    return;
                }

                emitPlanSalvage(
                    'data_prep_plan_salvaged_wide_fallback',
                    detail,
                    meta,
                );
            };

            const headerAliasRewrite = rewritePlanColumnAliasesFromHeaderLayers(plan, columns, sourceData);
            let candidatePlan = headerAliasRewrite.plan;
            if (headerAliasRewrite.rewrites.length > 0) {
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_slow_path_diagnostic',
                    `Rewrote header-layer alias columns before execution: ${headerAliasRewrite.rewrites.map(rewrite => `${rewrite.from} -> ${rewrite.to}`).join(', ')}.`,
                    {
                        ...telemetryMetaBase,
                        reasonCode: 'header_layer_alias_rewrite',
                        rewrites: headerAliasRewrite.rewrites,
                    },
                );
            }
            const deterministicNormalization = buildDeterministicNormalizationPlan(
                candidatePlan,
                columns,
                sourceData?.data ?? sampleData,
            );
            if (
                deterministicNormalization.normalizedPlaceholderColumns.length > 0
                || deterministicNormalization.numericStringNormalizedColumns.length > 0
            ) {
                candidatePlan = deterministicNormalization.plan;
                if (deterministicNormalization.normalizedPlaceholderColumns.length > 0) {
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_placeholder_normalized',
                        `Normalized placeholder values in ${deterministicNormalization.normalizedPlaceholderColumns.join(', ')} before SQL readiness checks.`,
                        {
                            ...telemetryMetaBase,
                            normalizedPlaceholderColumns: deterministicNormalization.normalizedPlaceholderColumns,
                        },
                    );
                }
                if (deterministicNormalization.numericStringNormalizedColumns.length > 0) {
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_numeric_string_casted',
                        `Cast numeric-looking string columns before SQL readiness checks: ${deterministicNormalization.numericStringNormalizedColumns.join(', ')}.`,
                        {
                            ...telemetryMetaBase,
                            numericStringNormalizedColumns: deterministicNormalization.numericStringNormalizedColumns,
                        },
                    );
                }
            }
            const reorderedWideOperations = getWideTableValueCastOrderIssue(candidatePlan.operations, schemaContext.wideProfile)
                ? reorderWideValueCastAfterUnpivot(candidatePlan.operations)
                : null;
            if (reorderedWideOperations) {
                candidatePlan = {
                    ...candidatePlan,
                    operations: reorderedWideOperations,
                    planStatus: 'operations',
                    consistencyIssues: [],
                };
                emitPlanSalvage(
                    'data_prep_plan_salvaged_wide_cast_order',
                    'Moved cast_column(Value) after unpivot_columns to keep the plan executable.',
                    { salvageType: 'wide_cast_order', originalFailureReason: WIDE_TABLE_VALUE_CAST_ORDER_ERROR },
                );
            } else if (
                getWideTableValueCastOrderIssue(candidatePlan.operations, schemaContext.wideProfile)
                && schemaContext.wideProfile.isWide
            ) {
                if (hierarchyPreservationRequired && boundedHierarchyAnnotationAvailable) {
                    candidatePlan = buildHierarchyAnnotationFallbackPlan(columns);
                    emitHierarchyNormalizationOrSalvage(
                        'Replaced a hierarchy-losing wide-table plan with annotate_hierarchy.',
                        { salvageType: 'hierarchy', originalFailureReason: WIDE_TABLE_VALUE_CAST_ORDER_ERROR },
                    );
                } else if (strictMode) {
                    const wideFallbackPlan = salvageWideFallback;
                    if (wideFallbackPlan) {
                        candidatePlan = wideFallbackPlan;
                        emitPlanSalvage(
                            'data_prep_plan_salvaged_wide_fallback',
                            'Replaced a wide-table plan that referenced Value before unpivot with deterministic wide fallback.',
                            { salvageType: 'wide_fallback', originalFailureReason: WIDE_TABLE_VALUE_CAST_ORDER_ERROR },
                        );
                    } else if (salvageStagingCleanupFallback) {
                        candidatePlan = salvageStagingCleanupFallback;
                        emitPlanSalvage(
                            'data_prep_plan_salvaged_wide_fallback',
                            'Replaced a wide-table plan that referenced Value before unpivot with deterministic cleanup fallback.',
                            { salvageType: 'wide_fallback', originalFailureReason: WIDE_TABLE_VALUE_CAST_ORDER_ERROR },
                        );
                    }
                }
            }

            if (schemaContext.wideProfile.isWide && candidatePlan.operations.length === 0) {
                if (hierarchyPreservationRequired && boundedHierarchyAnnotationAvailable) {
                    candidatePlan = buildHierarchyAnnotationFallbackPlan(columns);
                    emitHierarchyNormalizationOrSalvage(
                        'Replaced a zero-op hierarchical plan with annotate_hierarchy.',
                        { salvageType: 'hierarchy', originalFailureReason: 'Hierarchical datasets must not return a zero-op or schema-only plan.' },
                    );
                } else if (strictMode) {
                    const wideFallbackPlan = salvageWideFallback;
                    if (wideFallbackPlan) {
                        candidatePlan = wideFallbackPlan;
                        emitPlanSalvage(
                            'data_prep_plan_salvaged_wide_fallback',
                            'Replaced a zero-op wide-table plan with deterministic wide fallback.',
                            { salvageType: 'wide_fallback', originalFailureReason: 'Wide datasets must not return a zero-op or schema-only plan.' },
                        );
                    } else if (salvageStagingCleanupFallback) {
                        candidatePlan = salvageStagingCleanupFallback;
                        emitPlanSalvage(
                            'data_prep_plan_salvaged_wide_fallback',
                            'Replaced a zero-op wide-table plan with deterministic cleanup fallback.',
                            { salvageType: 'wide_fallback', originalFailureReason: 'Wide datasets must not return a zero-op or schema-only plan.' },
                        );
                    }
                }
            }

            if (hierarchyPreservationRequired && !candidatePlan.operations.some(operation => operation.type === 'annotate_hierarchy')) {
                const hierarchyIssue = getHierarchyWidePlanIssue(
                    candidatePlan.operations,
                    shouldForceHierarchyFallback,
                    hierarchyDepthPreservationRequired,
                );

                if (hierarchyIssue) {
                    const patchedHierarchyOperations = patchHierarchyUnpivotFromFallback(
                        candidatePlan.operations,
                        salvageWideFallback,
                    );
                    if (patchedHierarchyOperations) {
                        const patchedPlan: DataPreparationPlan = {
                            ...candidatePlan,
                            operations: patchedHierarchyOperations,
                            outputColumns: ensureHierarchyOutputColumns(
                                candidatePlan.outputColumns?.length > 0 ? [...candidatePlan.outputColumns] : [...columns],
                            ),
                            planStatus: 'operations',
                            consistencyIssues: [],
                        };
                        if (!getHierarchyWidePlanIssue(
                            patchedPlan.operations,
                            shouldForceHierarchyFallback,
                            hierarchyDepthPreservationRequired,
                        )) {
                            candidatePlan = patchedPlan;
                            emitPlanSalvage(
                                'data_prep_plan_salvaged_hierarchy',
                                'Patched missing hierarchy-preserving metadata onto unpivot_columns from the deterministic fallback template.',
                                { salvageType: 'hierarchy', originalFailureReason: hierarchyIssue.message },
                            );
                            continue;
                        }
                    }

                    if (
                        salvageWideFallback
                        && !getHierarchyWidePlanIssue(
                            salvageWideFallback.operations,
                            shouldForceHierarchyFallback,
                            hierarchyDepthPreservationRequired,
                        )
                    ) {
                        candidatePlan = salvageWideFallback;
                        emitWideFallbackNormalizationOrSalvage(
                            'Replaced an incomplete hierarchical reshape with deterministic wide fallback.',
                            { salvageType: 'wide_fallback', originalFailureReason: hierarchyIssue.message },
                        );
                    } else if (sampleHierarchyAnnotationAvailable) {
                        candidatePlan = buildHierarchyAnnotationFallbackPlan(columns);
                        emitPlanSalvage(
                            'data_prep_plan_salvaged_hierarchy',
                            'Replaced an incomplete hierarchical reshape with annotate_hierarchy.',
                            { salvageType: 'hierarchy', originalFailureReason: hierarchyIssue.message },
                        );
                    } else if (strictMode) {
                        const wideFallbackPlan = salvageWideFallback;
                        if (wideFallbackPlan) {
                            candidatePlan = wideFallbackPlan;
                            emitWideFallbackNormalizationOrSalvage(
                                'Replaced an incomplete hierarchical reshape with deterministic wide fallback.',
                                { salvageType: 'wide_fallback', originalFailureReason: hierarchyIssue.message },
                            );
                        } else if (salvageStagingCleanupFallback) {
                            candidatePlan = salvageStagingCleanupFallback;
                            emitPlanSalvage(
                                'data_prep_plan_salvaged_wide_fallback',
                                'Replaced an incomplete hierarchical reshape with deterministic cleanup fallback.',
                                { salvageType: 'wide_fallback', originalFailureReason: hierarchyIssue.message },
                            );
                        }
                    }
                } else {
                    const canAppendHierarchy = !schemaContext.wideProfile.isWide && (
                        canAppendAnnotateHierarchyOperation(candidatePlan, sampleData, sourceData)
                        || canAppendSourceOnlyAnnotateHierarchyOperation(candidatePlan, sourceData)
                    );
                    if (canAppendHierarchy) {
                        candidatePlan = appendAnnotateHierarchyOperation(candidatePlan, columns);
                        emitHierarchyAnnotationNormalization(
                            'Appended annotate_hierarchy so hierarchical rows remain verifiable.',
                            {
                                normalizationType: 'append_hierarchy_annotation',
                                originalFailureReason: 'Hierarchy-preserving columns were missing from the candidate plan.',
                            },
                        );
                    }
                }
            }

            const losslessStabilization = stabilizeLosslessOnlyPlan(candidatePlan, columns, sampleData);
            if (losslessStabilization.prunedOperations.length > 0) {
                candidatePlan = losslessStabilization.plan;
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_lossless_op_pruned',
                    `Pruned ${losslessStabilization.prunedOperations.length} lossless operation(s) that changed stable numeric fingerprints before first-attempt execution.`,
                    {
                        ...telemetryMetaBase,
                        prunedOperations: losslessStabilization.prunedOperations.map(entry => ({
                            type: entry.operation.type,
                            reason: entry.reason,
                            column: 'column' in entry.operation ? entry.operation.column : undefined,
                        })),
                    },
                );
            } else if (losslessStabilization.abortedReason) {
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_slow_path_diagnostic',
                    `Skipped bounded lossless stabilization because simulation could not complete: ${losslessStabilization.abortedReason}`,
                    {
                        ...telemetryMetaBase,
                        reasonCode: 'lossless_stabilization_skipped',
                    },
                );
            }

            // Test execution before returning
            if (candidatePlan.operations.length > 0) {
                try {
                    const wideTableValueCastIssue = getWideTableValueCastOrderIssue(candidatePlan.operations, schemaContext.wideProfile);
                    if (wideTableValueCastIssue) {
                        throw new Error(wideTableValueCastIssue);
                    }
                    const hierarchyWidePlanIssue = getHierarchyWidePlanIssue(
                        candidatePlan.operations,
                        shouldForceHierarchyFallback,
                        hierarchyDepthPreservationRequired,
                    );
                    if (hierarchyWidePlanIssue) {
                        if (hierarchyWidePlanIssue.canUseAnnotationFallback && canUseHierarchyAnnotationFallback && i >= resolvedOptions.maxAttempts - 1) {
                            console.warn('[DataPreparer] Replacing hierarchy-incomplete plan with hierarchy annotation fallback for hierarchical wide statement.');
                            emitDataPreparationTelemetry(
                                telemetryTarget,
                                'data_prep_hierarchy_fallback_used',
                                'Hierarchy-incomplete wide-table plan was replaced with annotate_hierarchy fallback.',
                                { reason: hierarchyWidePlanIssue.message },
                            );
                            return buildHierarchyAnnotationFallbackPlan(columns);
                        }
                        if (i >= resolvedOptions.maxAttempts - 1) {
                            if (deterministicCleanupFallback) {
                                console.warn('[DataPreparer] Replacing hierarchy-incomplete plan with deterministic cleanup fallback.');
                                emitDataPreparationTelemetry(
                                    telemetryTarget,
                                    'data_prep_deterministic_fallback_used',
                                    'Hierarchy-incomplete wide-table plan was replaced with deterministic cleanup fallback.',
                                    { reason: hierarchyWidePlanIssue.message },
                                );
                                return deterministicCleanupFallback;
                            }
                        }
                        throw new Error(hierarchyWidePlanIssue.message);
                    }
                    const bypassSampleExecutionForSourceOnlyHierarchyPlan = canBypassSampleExecutionForSourceOnlyHierarchyPlan(
                        candidatePlan,
                        sampleData,
                        sourceData,
                    );
                    const sampleResult = bypassSampleExecutionForSourceOnlyHierarchyPlan
                        ? { data: sampleData, logs: [] }
                        : applyDataOperations(sampleData, candidatePlan.operations);
                    if (!Array.isArray(sampleResult.data)) throw new Error('Generated operations did not return an array.');
                    if (!candidatePlan.outputColumns || candidatePlan.outputColumns.length === 0) {
                        candidatePlan.outputColumns = columns;
                    }
                    let verifiedCandidatePlan = validateDataPreparationPlan(candidatePlan, columns);

                    const shouldRunFullSourceVerification = Boolean(
                        sourceData
                        && (
                            schemaContext.wideProfile.isWide
                            || hierarchyPreservationRequired
                            || (sourceShapeProfile && isWideReportShape(sourceShapeProfile))
                            || sourceShapeProfile?.primaryKind === 'mixed_report'
                        ),
                    );

                    if (shouldRunFullSourceVerification && sourceData) {
                        const verificationStartedAt = Date.now();
                        const evaluateCandidate = (planToEvaluate: DataPreparationPlan) => {
                            const cleanedData = simulatePlanOnRows(sourceData, planToEvaluate);
                            return {
                                cleanedData,
                                verification: verifyCleanedDatasetShape(sourceData, cleanedData, planToEvaluate),
                            };
                        };

                        let verificationResult = evaluateCandidate(verifiedCandidatePlan);
                        if (!verificationResult.verification.passed) {
                            emitDataPreparationTelemetry(
                                telemetryTarget,
                                'data_prep_pre_return_verification_failed',
                                verificationResult.verification.reason ?? 'Pre-return verification failed.',
                                {
                                    ...telemetryMetaBase,
                                    verificationReason: verificationResult.verification.reason,
                                    signalKey: verificationResult.verification.signalKey,
                                },
                            );

                            if (verificationResult.verification.reason === 'Hierarchy depth was not preserved in the cleaned output.') {
                                const canAppendHierarchy = canAppendAnnotateHierarchyOperation(
                                    verifiedCandidatePlan,
                                    sampleData,
                                    sourceData,
                                ) || canAppendSourceOnlyAnnotateHierarchyOperation(
                                    verifiedCandidatePlan,
                                    sourceData,
                                );
                                if (canAppendHierarchy) {
                                    const hierarchyCandidate = appendAnnotateHierarchyOperation(verifiedCandidatePlan, columns);
                                    const hierarchyVerification = evaluateCandidate(hierarchyCandidate);
                                    if (hierarchyVerification.verification.passed) {
                                        verifiedCandidatePlan = hierarchyCandidate;
                                        emitHierarchyAnnotationNormalization(
                                            'Appended annotate_hierarchy after full-source verification detected lost hierarchy depth.',
                                            {
                                                normalizationType: 'verify_append_hierarchy_annotation',
                                                originalFailureReason: verificationResult.verification.reason,
                                            },
                                        );
                                        verificationResult = hierarchyVerification;
                                    } else if (boundedHierarchyAnnotationAvailable) {
                                        const hierarchyFallbackPlan = buildHierarchyAnnotationFallbackPlan(columns);
                                        const fallbackVerification = evaluateCandidate(hierarchyFallbackPlan);
                                        if (fallbackVerification.verification.passed) {
                                            verifiedCandidatePlan = hierarchyFallbackPlan;
                                            emitHierarchyNormalizationOrSalvage(
                                                'Replaced the candidate plan with annotate_hierarchy after full-source verification detected lost hierarchy depth.',
                                                { salvageType: 'hierarchy', originalFailureReason: verificationResult.verification.reason },
                                            );
                                            verificationResult = fallbackVerification;
                                        }
                                    }
                                } else if (boundedHierarchyAnnotationAvailable) {
                                    const hierarchyFallbackPlan = buildHierarchyAnnotationFallbackPlan(columns);
                                    const fallbackVerification = evaluateCandidate(hierarchyFallbackPlan);
                                    if (fallbackVerification.verification.passed) {
                                        verifiedCandidatePlan = hierarchyFallbackPlan;
                                        emitHierarchyNormalizationOrSalvage(
                                            'Replaced the candidate plan with annotate_hierarchy after full-source verification detected lost hierarchy depth.',
                                            { salvageType: 'hierarchy', originalFailureReason: verificationResult.verification.reason },
                                        );
                                        verificationResult = fallbackVerification;
                                    }
                                }
                            } else if (
                                verificationResult.verification.reason === 'The cleaned dataset appears to have collapsed to a single descriptor group after unpivot.'
                                || verificationResult.verification.reason === 'Summary columns were incorrectly treated as detail series during reshaping.'
                            ) {
                                if (boundedHierarchyAnnotationAvailable) {
                                    const hierarchyFallbackPlan = buildHierarchyAnnotationFallbackPlan(columns);
                                    const fallbackVerification = evaluateCandidate(hierarchyFallbackPlan);
                                    if (fallbackVerification.verification.passed) {
                                        verifiedCandidatePlan = hierarchyFallbackPlan;
                                        emitHierarchyNormalizationOrSalvage(
                                            'Replaced a collapsing reshape with annotate_hierarchy after pre-return verification failed.',
                                            { salvageType: 'hierarchy', originalFailureReason: verificationResult.verification.reason },
                                        );
                                        verificationResult = fallbackVerification;
                                    }
                                }

                                if (!verificationResult.verification.passed) {
                                    const wideFallbackPlan = salvageWideFallback ?? salvageStagingCleanupFallback;
                                    if (wideFallbackPlan) {
                                        const fallbackVerification = evaluateCandidate(wideFallbackPlan);
                                        if (fallbackVerification.verification.passed) {
                                            verifiedCandidatePlan = wideFallbackPlan;
                                            emitPlanSalvage(
                                                'data_prep_plan_salvaged_wide_fallback',
                                                'Replaced a collapsing reshape with deterministic fallback after pre-return verification failed.',
                                                { salvageType: 'wide_fallback', originalFailureReason: verificationResult.verification.reason },
                                            );
                                            verificationResult = fallbackVerification;
                                        }
                                    }
                                }
                            } else if (
                                verificationResult.verification.reason === 'The cleaned dataset still looks like a wide crosstab.'
                                || verificationResult.verification.signalKey === LABEL_LAYER_RETENTION_SIGNAL
                            ) {
                                if (
                                    verificationResult.verification.signalKey === LABEL_LAYER_RETENTION_SIGNAL
                                    && boundedHierarchyAnnotationAvailable
                                ) {
                                    const hierarchyFallbackPlan = buildHierarchyAnnotationFallbackPlan(columns);
                                    const fallbackVerification = evaluateCandidate(hierarchyFallbackPlan);
                                    if (fallbackVerification.verification.passed) {
                                        verifiedCandidatePlan = hierarchyFallbackPlan;
                                        emitHierarchyNormalizationOrSalvage(
                                            'Replaced a label-losing reshape with annotate_hierarchy after pre-return verification failed.',
                                            { salvageType: 'hierarchy', originalFailureReason: verificationResult.verification.reason },
                                        );
                                        verificationResult = fallbackVerification;
                                    }
                                }

                                const wideFallbackPlan = salvageWideFallback ?? salvageStagingCleanupFallback;
                                if (wideFallbackPlan && !verificationResult.verification.passed) {
                                    const fallbackVerification = evaluateCandidate(wideFallbackPlan);
                                    if (fallbackVerification.verification.passed) {
                                        verifiedCandidatePlan = wideFallbackPlan;
                                        emitPlanSalvage(
                                            'data_prep_plan_salvaged_wide_fallback',
                                            'Replaced the candidate plan with deterministic wide fallback after pre-return verification failed.',
                                            { salvageType: 'wide_fallback', originalFailureReason: verificationResult.verification.reason },
                                        );
                                        verificationResult = fallbackVerification;
                                    }
                                }

                                if (
                                    verificationResult.verification.signalKey === LABEL_LAYER_RETENTION_SIGNAL
                                    && !verificationResult.verification.passed
                                    && deterministicCleanupFallback
                                ) {
                                    const fallbackVerification = evaluateCandidate(deterministicCleanupFallback);
                                    if (fallbackVerification.verification.passed) {
                                        verifiedCandidatePlan = deterministicCleanupFallback;
                                        emitDataPreparationTelemetry(
                                            telemetryTarget,
                                            'data_prep_deterministic_fallback_used',
                                            'Label-layer verification failed, so the plan switched directly to deterministic cleanup fallback.',
                                            { reason: verificationResult.verification.reason ?? LABEL_LAYER_RETENTION_REASON },
                                        );
                                        verificationResult = fallbackVerification;
                                    }
                                }
                            }

                            if (!verificationResult.verification.passed) {
                                throw new Error(verificationResult.verification.reason ?? 'Pre-return verification failed.');
                            }
                        }
                        emitDataPreparationStageTiming(
                            telemetryTarget,
                            'full_source_verification',
                            Date.now() - verificationStartedAt,
                            { attempt: i + 1, strictMode },
                        );
                    }

                    const postOperationCleanupFallback = !schemaContext.wideProfile.isWide
                        && sourceData
                        && !verifiedCandidatePlan.operations.some(operation => operation.type === 'annotate_hierarchy')
                        ? buildDeterministicCleanupFallbackPlan(
                            verifiedCandidatePlan.outputColumns,
                            { ...sourceData, data: sampleResult.data },
                        )
                        : null;
                    if (postOperationCleanupFallback) {
                        const canUseBoundedCleanupSalvage = i >= resolvedOptions.maxAttempts - 1
                            && (resolvedOptions.allowDeterministicFallback || strictMode);
                        if (canUseBoundedCleanupSalvage) {
                            console.warn('[DataPreparer] Replacing operation plan that left report noise in place with deterministic cleanup fallback.');
                            emitDataPreparationTelemetry(
                                telemetryTarget,
                                'data_prep_deterministic_fallback_used',
                                'Operation plan that leaked report noise was replaced with deterministic cleanup fallback.',
                                { reason: 'Generated operations left header, footer, or blank noise rows in the staged table.' },
                            );
                            return postOperationCleanupFallback;
                        }
                        throw new Error('Generated operations left header, footer, or blank noise rows in the staged table.');
                    }
                    return verifiedCandidatePlan; // Success
                } catch (e) {
                    if (isRuntimeAbortError(e, abortSignal)) {
                        throw e;
                    }
                    lastError = e as Error;
                    const typedFailureReason = classifyDataPreparationFailureReason(lastError);
                    if (i === 0) {
                        emitDataPreparationTelemetry(
                            telemetryTarget,
                            'data_prep_first_attempt_failed',
                            lastError.message,
                            { failureClass: 'operation_execution', reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                        );
                    }
                    if (resolvedOptions.allowInternalRetry && !selfCorrectionTelemetryEmitted && i < resolvedOptions.maxAttempts - 1) {
                        emitDataPreparationTelemetry(
                            telemetryTarget,
                            'data_prep_self_correction_used',
                            'Data preparation used internal self-correction after the first failed attempt.',
                            { failedAttempt: i + 1, failureReason: lastError.message, reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                        );
                        selfCorrectionTelemetryEmitted = true;
                    }
                    if (typedFailureReason === 'provider_no_output' || typedFailureReason === 'timeout_model_call') {
                        emitDataPreparationTelemetry(
                            telemetryTarget,
                            'data_prep_slow_path_diagnostic',
                            'Provider-driven planning entered a slow path and required bounded recovery.',
                            { attempt: i + 1, reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                        );
                    }
                    if (
                        deterministicCleanupFallback
                        && lastError.message.includes(LABEL_LAYER_RETENTION_REASON)
                    ) {
                        console.warn('[DataPreparer] Replacing label-layer verification failure with deterministic cleanup fallback.');
                        emitDataPreparationTelemetry(
                            telemetryTarget,
                            'data_prep_deterministic_fallback_used',
                            'Label-layer verification failure was replaced with deterministic cleanup fallback instead of retrying the same reshape prompt.',
                            { reason: lastError.message },
                        );
                        return deterministicCleanupFallback;
                    }
                    if (i >= resolvedOptions.maxAttempts - 1 && deterministicCleanupFallback) {
                        console.warn('[DataPreparer] Replacing final failed AI operation plan with deterministic cleanup fallback.');
                        emitDataPreparationTelemetry(
                            telemetryTarget,
                            'data_prep_deterministic_fallback_used',
                            'Final failed AI operation plan was replaced with deterministic cleanup fallback.',
                            { reason: lastError.message },
                        );
                        return deterministicCleanupFallback;
                    }
                    if (!resolvedOptions.allowInternalRetry || i >= resolvedOptions.maxAttempts - 1) {
                        throw lastError;
                    }
                    console.warn(`AI self-correction attempt ${i + 1} failed due to operation execution error. Retrying...`, lastError);
                    continue; // Go to next iteration of the loop to ask AI to fix the plan
                }
            }
            // If no operations, ensure output columns match input columns if AI forgot.
            if (!plan.outputColumns || plan.outputColumns.length === 0) {
                plan.outputColumns = columns;
            }
            const stabilizedPlan = stabilizeZeroOperationSchemaOnlyPlan(candidatePlan, columns);
            const validated = validateDataPreparationPlan(stabilizedPlan, columns);
            if (validated.planStatus === 'inconsistent' && i < resolvedOptions.maxAttempts - 1 && resolvedOptions.allowInternalRetry) {
                lastError = new Error(`The previous data preparation plan failed consistency validation: ${validated.consistencyIssues.join(' ')}`);
                const typedFailureReason = classifyDataPreparationFailureReason(lastError);
                if (i === 0) {
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_first_attempt_failed',
                        lastError.message,
                        { failureClass: 'consistency_validation', reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                    );
                }
                if (!selfCorrectionTelemetryEmitted) {
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_self_correction_used',
                        'Data preparation used internal self-correction after an inconsistent first attempt.',
                        { failedAttempt: i + 1, failureReason: lastError.message, reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                    );
                    selfCorrectionTelemetryEmitted = true;
                }
                console.warn(`AI self-correction attempt ${i + 1} failed due to plan consistency validation. Retrying...`, lastError);
                continue;
            }
            // Auto-heal: if still inconsistent after all retries, reset outputColumns to baseline
            // and treat as schema_only. The AI hallucinated schema changes without operations — discard them.
            if (validated.planStatus === 'inconsistent') {
                const typedFailureReason = classifyDataPreparationFailureReason(validated.consistencyIssues.join(' '));
                if (i === 0) {
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_first_attempt_failed',
                        validated.consistencyIssues.join(' '),
                        { failureClass: 'consistency_validation', reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                    );
                }
                console.warn(
                    `[DataPreparer] Auto-healing inconsistent schema-only plan after ${resolvedOptions.maxAttempts} attempts. ` +
                    `Issues: ${validated.consistencyIssues.join(' ')} — resetting outputColumns to baseline.`,
                );
                const healedPlan: DataPreparationPlan = {
                    ...validated,
                    outputColumns: columns,
                    planStatus: 'schema_only',
                    consistencyIssues: [],
                };
                if (canUseHierarchyAnnotationFallback) {
                    console.warn('[DataPreparer] Replacing schema-only plan with hierarchy annotation fallback for hierarchical wide statement.');
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_hierarchy_fallback_used',
                        'Inconsistent schema-only plan was replaced with hierarchy annotation fallback.',
                        { reason: validated.consistencyIssues },
                    );
                    return buildHierarchyAnnotationFallbackPlan(columns);
                }
                if (deterministicCleanupFallback) {
                    console.warn('[DataPreparer] Replacing schema-only plan with deterministic cleanup fallback.');
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_deterministic_fallback_used',
                        'Inconsistent schema-only plan was replaced with deterministic cleanup fallback.',
                        { reason: validated.consistencyIssues },
                    );
                    return deterministicCleanupFallback;
                }
                const blankRowCleanupFallback = buildBlankRowCleanupFallbackPlan(columns, sampleData, sourceData);
                if (blankRowCleanupFallback) {
                    console.warn('[DataPreparer] Replacing auto-healed schema-only plan with blank-row cleanup fallback.');
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_deterministic_fallback_used',
                        'Inconsistent schema-only plan was replaced with blank-row cleanup fallback.',
                        { reason: validated.consistencyIssues },
                    );
                    return blankRowCleanupFallback;
                }
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_schema_only_auto_healed',
                    'Inconsistent schema-only plan was auto-healed to the baseline schema.',
                    { reason: validated.consistencyIssues },
                );
                return healedPlan;
            }
            if (validated.planStatus === 'schema_only' && canUseHierarchyAnnotationFallback) {
                console.warn('[DataPreparer] Replacing zero-op schema-only plan with hierarchy annotation fallback for hierarchical wide statement.');
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_hierarchy_fallback_used',
                    'Zero-op schema-only plan was replaced with hierarchy annotation fallback.',
                );
                return buildHierarchyAnnotationFallbackPlan(columns);
            }
            if (validated.planStatus === 'schema_only' && deterministicCleanupFallback) {
                console.warn('[DataPreparer] Replacing zero-op schema-only plan with deterministic cleanup fallback.');
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_deterministic_fallback_used',
                    'Zero-op schema-only plan was replaced with deterministic cleanup fallback.',
                );
                return deterministicCleanupFallback;
            }
            if (validated.planStatus === 'schema_only') {
                const blankRowCleanupFallback = buildBlankRowCleanupFallbackPlan(columns, sampleData, sourceData);
                if (blankRowCleanupFallback) {
                    console.warn('[DataPreparer] Replacing zero-op schema-only plan with blank-row cleanup fallback.');
                    emitDataPreparationTelemetry(
                        telemetryTarget,
                        'data_prep_deterministic_fallback_used',
                        'Zero-op schema-only plan was replaced with blank-row cleanup fallback.',
                    );
                    return blankRowCleanupFallback;
                }
            }
            return validated; // No operations remain after retries; return the honest final state.

        } catch (error) {
            if (isRuntimeAbortError(error, abortSignal)) {
                throw error;
            }
            console.error(`Error in data preparation plan generation (Attempt ${i+1}):`, error);
            lastError = error as Error;
            const typedFailureReason = classifyDataPreparationFailureReason(lastError);
            if (i === 0) {
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_first_attempt_failed',
                    lastError.message,
                    { failureClass: 'provider_generation', reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                );
            }
            if (resolvedOptions.allowInternalRetry && !selfCorrectionTelemetryEmitted && i < resolvedOptions.maxAttempts - 1) {
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_self_correction_used',
                    'Data preparation used internal self-correction after a provider-generation failure.',
                    { failedAttempt: i + 1, failureReason: lastError.message, reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                );
                selfCorrectionTelemetryEmitted = true;
            }
            if (typedFailureReason === 'provider_no_output' || typedFailureReason === 'timeout_model_call') {
                emitDataPreparationTelemetry(
                    telemetryTarget,
                    'data_prep_slow_path_diagnostic',
                    'Provider-driven planning entered a slow path and required bounded recovery.',
                    { attempt: i + 1, reasonCode: typedFailureReason, typedReasonCode: typedFailureReason },
                );
            }
        }
    }

    throw new Error(`AI failed to generate a valid data preparation plan after multiple attempts. Last error: ${lastError?.message}`);
};
