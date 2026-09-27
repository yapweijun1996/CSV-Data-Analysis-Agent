import type { ActiveDataQuery, AiAction, DataOperation, DeriveMetricByLabelOperation, StatisticalAnalysisRequest, ToolExecutionResult } from '../../../types';
import {
    applyDataOperations,
    createQueryPlanFromFilterOperation,
    normalizeDataMutatePayload,
} from './dataOperationRunner';
import { executeDataQueryWithWorker } from '../../workers/dataWorkerClient';
import {
    validateAggregateAliasSemantics,
    validateGroupedQuerySemantics,
} from './querySemanticValidator';
import { createWorkerDiagnosticsTelemetryReporter } from '../../workers/workerDiagnostics';
import type { StoreApi } from '../types';
import { isRuntimeAbortError, throwIfAborted } from '../runtime/runtimeAbort';
import { appendQueryHistory, createQueryTraceEntry } from '../queryTraceState';
import { getToolGovernanceMeta } from './executorGovernance';
import { executeDeterministicMutationPlan } from './deterministicMutationExecutor';
import { getDataQueryRepairGuidance, getDataQueryTraceLabel, normalizeDataQueryPayload } from './dataQueryContract';
import { normalizeQueryWhereClauseLike } from './dataOperationNormalization';
import { runSpreadsheetFilter } from './spreadsheetFilterRuntime';
import { robustParseFloat } from '../../data/dataProfiler';
import { validateMetricDerivationPreflight } from './metricDerivationPreflight';
import { executeStructuredDataQuery } from './dataQueryExecution';
import { executeRawSqlQuery } from '../../duckdb/queryEngine';
import { DEFAULT_DIMENSION_NORMALIZATION, buildColumnTypeGate } from '../../duckdb/dimensionNormalization';
import { createChatMessage } from '../../../utils/messageState';
import { executeStatisticalAnalysis } from './analysisSkillExecutor';
import { injectDirectivesIntoQueryPlan } from '../../duckdb/directiveInjector';
import type { RuntimeDirectives } from '../../duckdb/directiveInjector';
import {
    buildEffectiveColumnRegistryFromState,
    getAllowedColumns,
    resolveColumnReference,
} from '../../data/columnRegistry';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import {
    isDerivedMetricOperation,
    isDerivedMetricWarningExplicitlyConfirmed,
    validateDerivedMetricOperation,
} from './derivedMetricValidation';
import { buildDatasetVersionId } from '../../../utils/datasetId';
import { resolveDatasetScopeBinding } from '../../data/datasetBundle';
import { requiresCompleteAggregateEvidence } from '../derivedMetricIntent';

const LOG_PREFIX = '[ExecutorAgent]';

const summarizeMutationOperation = (operation: DataOperation) => {
    switch (operation.type) {
        case 'derive_column':
            return {
                type: operation.type,
                outputColumn: operation.newColumn,
                expressionKind: operation.expression.kind,
            };
        case 'derive_metric_by_label':
            return {
                type: operation.type,
                outputMetricLabel: operation.outputMetricLabel,
                labelColumn: operation.labelColumn,
                valueColumn: operation.valueColumn,
                groupByColumns: operation.groupByColumns,
                carryForwardColumns: operation.carryForwardColumns ?? [],
                formulaKind: operation.formula.kind,
            };
        default:
            return null;
    }
};

const buildMutationArtifactMetadata = (normalizedPlan: ReturnType<typeof normalizeDataMutatePayload>['plan']) => ({
    artifactType: 'dataset_mutation',
    sourceArtifactIds: [],
    operations: normalizedPlan?.operations
        .map(operation => summarizeMutationOperation(operation))
        .filter((operation): operation is NonNullable<ReturnType<typeof summarizeMutationOperation>> => operation !== null) ?? [],
    derivedMetricValidations: normalizedPlan?.derivedMetricValidations ?? [],
});

const buildDerivedMetricValidationResult = (
    validations: NonNullable<ReturnType<typeof normalizeDataMutatePayload>['plan']>['derivedMetricValidations'],
): ToolExecutionResult | null => {
    const failed = validations?.filter(validation => validation.status === 'fail') ?? [];
    const needsConfirmation = validations?.filter(validation =>
        validation.status === 'warn'
        && validation.requiresConfirmation
    ) ?? [];
    if (failed.length === 0 && needsConfirmation.length === 0) return null;

    const targets = [...failed, ...needsConfirmation]
        .map(validation => validation.declaration.metricName)
        .join(', ');
    const requiresConfirmation = failed.length === 0;
    const summary = requiresConfirmation
        ? `Derived metric validation needs confirmation before committing: ${targets}.`
        : `Derived metric validation failed before commit: ${targets}.`;
    const retryHint = requiresConfirmation
        ? 'Review the validation signals with the user. Retry with validationMode="warn" only after the user explicitly confirms the ambiguity.'
        : 'Repair the formula, source columns, numeric inputs, denominator behavior, or grouping grain before retrying.';
    const artifactMetadata = {
        artifactType: 'dataset_mutation_attempt',
        derivedMetricValidations: validations,
    };

    return {
        status: 'blocked',
        toolName: 'data.mutate',
        message: summary,
        shouldStop: requiresConfirmation,
        retryHint,
        artifactMetadata,
        observation: {
            type: 'tool_result',
            status: 'blocked',
            summary,
            toolName: 'data.mutate',
            code: requiresConfirmation ? 'confirmation_required' : 'validation_failed',
            retryHint,
            detail: {
                derivedMetricValidations: validations,
                artifactMetadata,
            },
        },
    };
};

const logDerivedMetricValidationBoundary = (
    store: StoreApi,
    result: ToolExecutionResult,
) => {
    const validations = Array.isArray(result.artifactMetadata?.derivedMetricValidations)
        ? result.artifactMetadata.derivedMetricValidations
        : [];
    store.getState().logAgentToolUsage?.({
        tool: 'data.mutate',
        description: result.message,
        detail: {
            status: result.observation?.code ?? result.status,
            derivedMetricValidations: validations,
            retryHint: result.retryHint ?? null,
        },
    });
};

const getWhereColumns = (whereClause: unknown): string[] => {
    const normalizedWhere = normalizeQueryWhereClauseLike(whereClause);
    if (!normalizedWhere) {
        return [];
    }
    return Array.from(new Set(
        [
            ...(normalizedWhere.predicates ?? []),
            ...(normalizedWhere.groups ?? []).flatMap(group => group.predicates),
        ]
            .map(predicate => predicate.column)
            .filter((column): column is string => typeof column === 'string' && column.trim().length > 0),
    ));
};

const compareOrderValues = (left: unknown, right: unknown) => {
    const leftNumber = robustParseFloat(left);
    const rightNumber = robustParseFloat(right);
    if (leftNumber !== null && rightNumber !== null) {
        return leftNumber - rightNumber;
    }

    const leftText = left === null || left === undefined ? '' : String(left).trim().toLowerCase();
    const rightText = right === null || right === undefined ? '' : String(right).trim().toLowerCase();
    return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' });
};

const summarizeOrderVerification = (
    rows: ActiveDataQuery['result']['rows'],
    orderBy: ActiveDataQuery['result']['appliedOrderBy'],
) => {
    if (!Array.isArray(orderBy) || orderBy.length === 0) {
        return [];
    }

    return orderBy.map(orderClause => {
        const sampleValues = rows.slice(0, 5).map(row => row[orderClause.column] ?? null);
        let appearsSorted = true;

        for (let index = 1; index < sampleValues.length; index += 1) {
            const comparison = compareOrderValues(sampleValues[index - 1], sampleValues[index]);
            if ((orderClause.direction === 'desc' && comparison < 0)
                || (orderClause.direction === 'asc' && comparison > 0)) {
                appearsSorted = false;
                break;
            }
        }

        return {
            column: orderClause.column,
            direction: orderClause.direction,
            sampleValues,
            appearsSorted,
        };
    });
};

export const executeDataOperationsAction = async (
    action: AiAction,
    store: StoreApi,
    abortSignal?: AbortSignal,
): Promise<ToolExecutionResult> => {
    const { getState } = store;
    if (action.type !== 'tool_call' || !getState().csvData) {
        return {
            status: 'error',
            toolName: 'data.mutate',
            message: 'No dataset available for data mutation.',
            shouldStop: false,
            retryHint: 'Load a dataset before using data.mutate.',
        };
    }
    const mutationDataset = getPreferredAnalysisDataset(getState());
    if (mutationDataset?.backing?.readOnly) {
        return {
            status: 'blocked',
            toolName: 'data.mutate',
            message: 'This large dataset is open in read-only mode, so source rows cannot be changed.',
            shouldStop: false,
            retryHint: 'Use data.query for full-dataset analysis, or import a smaller CSV to enable governed cleaning and mutation.',
            observation: {
                type: 'tool_result',
                status: 'blocked',
                summary: 'Large-file read-only mode blocks data mutation.',
                toolName: 'data.mutate',
                code: 'blocked_tool',
                detail: { reason: 'large_dataset_read_only' },
            },
        };
    }
    const normalizedPayload = normalizeDataMutatePayload({
        explanation: action.args?.explanation,
        operations: Array.isArray(action.args?.operations)
            ? action.args.operations
            : (action.args && 'operation' in action.args && action.args.operation !== undefined ? [action.args.operation] : undefined),
        outputColumns: action.args?.outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    });
    const normalizedPlan = normalizedPayload.plan;
    if (!normalizedPlan) {
        throw new Error('data.mutate payload is invalid after pre-validation.');
    }
    const deriveMetricOperations = normalizedPlan.operations.filter(isDerivedMetricOperation);
    const deriveMetricByLabelOperations = deriveMetricOperations.filter(
        (operation): operation is DeriveMetricByLabelOperation => operation.type === 'derive_metric_by_label',
    );
    for (const deriveMetricOperation of deriveMetricByLabelOperations) {
        const state = getState();
        const preflightFailure = validateMetricDerivationPreflight({
            columnProfiles: state.columnProfiles,
            csvData: state.csvData ?? null,
            dataPreparationPlan: state.dataPreparationPlan ?? null,
            operation: deriveMetricOperation,
        });
        if (preflightFailure) {
            return preflightFailure;
        }
    }
    if (deriveMetricOperations.length > 0) {
        const currentData = getState().csvData;
        const inputVersionId = buildDatasetVersionId(currentData.fileName, currentData.data);
        const warningConfirmed = isDerivedMetricWarningExplicitlyConfirmed(
            getState().activeTurn?.userMessage,
        );
        let previewRows = currentData.data;
        const postflightValidations = [];
        for (const operation of normalizedPlan.operations) {
            const operationInputRows = previewRows;
            if (isDerivedMetricOperation(operation)) {
                const preflightValidation = validateDerivedMetricOperation({
                    inputRows: operationInputRows,
                    operation,
                    inputVersionId,
                });
                const preflightBlock = buildDerivedMetricValidationResult([{
                    ...preflightValidation,
                    requiresConfirmation: preflightValidation.requiresConfirmation
                        && !(operation.validationMode === 'warn' && warningConfirmed),
                }]);
                if (preflightBlock) {
                    logDerivedMetricValidationBoundary(store, preflightBlock);
                    return preflightBlock;
                }
            }

            previewRows = applyDataOperations(previewRows, [operation]).data;
            if (isDerivedMetricOperation(operation)) {
                const postflightValidation = validateDerivedMetricOperation({
                    inputRows: operationInputRows,
                    outputRows: previewRows,
                    operation,
                    inputVersionId,
                });
                const postflightBlock = buildDerivedMetricValidationResult([{
                    ...postflightValidation,
                    requiresConfirmation: postflightValidation.requiresConfirmation
                        && !(operation.validationMode === 'warn' && warningConfirmed),
                }]);
                if (postflightBlock) {
                    logDerivedMetricValidationBoundary(store, postflightBlock);
                    return postflightBlock;
                }
                postflightValidations.push(postflightValidation);
            }
        }
        const outputVersionId = buildDatasetVersionId(currentData.fileName, previewRows);
        normalizedPlan.derivedMetricValidations = postflightValidations.map(validation => ({
            ...validation,
            evidenceReferences: [
                ...validation.evidenceReferences,
                {
                    kind: 'dataset_version',
                    id: outputVersionId,
                    label: 'Output dataset version',
                },
            ],
        }));
    }
    console.log(`${LOG_PREFIX} Running deterministic data operations: ${normalizedPlan.explanation}`);
    throwIfAborted(abortSignal);
    await executeDeterministicMutationPlan(normalizedPlan, store, abortSignal);
    const artifactMetadata = buildMutationArtifactMetadata(normalizedPlan);
    return {
        status: 'success',
        toolName: 'data.mutate',
        message: normalizedPlan.explanation,
        shouldStop: false,
        artifactMetadata,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: normalizedPlan.explanation,
            toolName: 'data.mutate',
            detail: {
                operationCount: normalizedPlan.operations.length,
                derivedMetrics: normalizedPlan.operations
                    .map(summarizeMutationOperation)
                    .filter((operation): operation is NonNullable<ReturnType<typeof summarizeMutationOperation>> => operation !== null),
                artifactMetadata,
            },
        },
    };
};

export const executeDataQueryAction = async (
    action: AiAction,
    store: StoreApi,
    abortSignal?: AbortSignal,
): Promise<ToolExecutionResult> => {
    const { getState, setState } = store;
    const state = getState();
    const preferredDataset = getPreferredAnalysisDataset(state);
    if (action.type !== 'tool_call' || !action.args?.plan || !preferredDataset) {
        return {
            status: 'error',
            toolName: 'data.query',
            message: 'data.query requires a structured plan and a loaded dataset.',
            shouldStop: false,
            retryHint: 'Return data.query with a valid plan object.',
        };
    }

    const normalizedPayload = normalizeDataQueryPayload(action.args);
    const queryInput = preferredDataset.data;
    const fallbackOperation = normalizedPayload.fallbackFilterOperation;
    const phase = state.cleaningRun && state.cleaningRun.status !== 'completed' ? 'verify' : 'analysis';
    const governance = getToolGovernanceMeta(store, 'data.query');
    const activeTurn = state.activeTurn;
    const activeStep = activeTurn?.steps.at(-1);
    const columnRegistry = buildEffectiveColumnRegistryFromState(state, {
        datasetOverride: preferredDataset,
    });

    // Inject harness directives (detail-row filter, hierarchy exclusion)
    // into the query plan deterministically — same as auto-analysis path.
    // This ensures the AI does not need to manually add RowRole filters.
    const steering = state.latestAnalysisSession?.analysisSteering;
    let augmentedPlan = normalizedPayload.plan;
    const actualDataColumns = getAllowedColumns(columnRegistry, 'select').length > 0
        ? getAllowedColumns(columnRegistry, 'select')
        : state.columnProfiles.map(profile => profile.name);
    const canonicalizeColumns = (columns?: string[]) =>
        columns?.map(column => resolveColumnReference(column, columnRegistry) ?? column);
    augmentedPlan = {
        ...augmentedPlan,
        ...(augmentedPlan.select ? { select: canonicalizeColumns(augmentedPlan.select) ?? augmentedPlan.select } : {}),
        ...(augmentedPlan.groupBy ? { groupBy: canonicalizeColumns(augmentedPlan.groupBy) ?? augmentedPlan.groupBy } : {}),
        ...(augmentedPlan.orderBy
            ? {
                orderBy: augmentedPlan.orderBy.map(order => ({
                    ...order,
                    column: resolveColumnReference(order.column, columnRegistry) ?? order.column,
                })),
            }
            : {}),
    };
    if (steering) {
        const steeringFilter = steering.detailRowFilter ?? null;
        const shouldInheritAnalysisScopeFilters = state.activeTurn?.runtimeStepContract?.taskMode === 'reconciliation'
            && state.activeTurn.runtimeStepContract.reconciliation?.inheritPriorFilters === true;
        if (steeringFilter) {
            console.log(
                `${LOG_PREFIX} Directive injection: detailRowFilter="${steeringFilter.column}" = "${steeringFilter.value}", `
                + `hierarchyColumn="${steering.hierarchyColumn ?? 'none'}", `
                + `excludeFromAggregation=[${(steering.excludeFromAggregation ?? []).length}], `
                + `preferGroupBy=[${(steering.preferGroupBy ?? []).join(', ')}], `
                + `blockGroupBy=[${(steering.blockGroupBy ?? []).join(', ')}], `
                + `actualDataColumns=[${actualDataColumns.length}]: ${actualDataColumns.slice(0, 8).join(', ')}${actualDataColumns.length > 8 ? '...' : ''}`,
            );
        }
        const injectionResult = injectDirectivesIntoQueryPlan(augmentedPlan, {
            directives: {
                detailRowColumn: steering.detailRowColumn ?? null,
                detailRowValue: steering.detailRowValue ?? null,
                detailRowFilter: steeringFilter,
                hierarchyColumn: shouldInheritAnalysisScopeFilters ? steering.hierarchyColumn ?? null : null,
                excludeFromAggregation: shouldInheritAnalysisScopeFilters ? steering.excludeFromAggregation ?? [] : [],
                preferGroupBy: steering.preferGroupBy ?? [],
                blockGroupBy: steering.blockGroupBy ?? [],
                recommendedTopN: null, // Do not enforce topN for user-initiated queries
            } as RuntimeDirectives,
            availableColumns: actualDataColumns,
            columnRegistry,
        });
        augmentedPlan = injectionResult.plan;
        if (injectionResult.warnings.length > 0) {
            console.warn(`${LOG_PREFIX} Directive injection warnings:`, injectionResult.warnings);
        }
        if (injectionResult.validationError) {
            throw new Error(injectionResult.validationError);
        }
    }

    const needsCompleteDerivedEvidence = requiresCompleteAggregateEvidence(
        activeTurn?.userMessage ?? '',
    )
        && (augmentedPlan.groupBy?.length ?? 0) > 0
        && (augmentedPlan.aggregates?.length ?? 0) >= 1;
    if (needsCompleteDerivedEvidence && (augmentedPlan.limit ?? 0) < 500) {
        augmentedPlan = {
            ...augmentedPlan,
            limit: 500,
        };
    }

    const aggregateAliasMismatch = validateAggregateAliasSemantics(augmentedPlan);
    if (aggregateAliasMismatch) {
        return {
            status: 'error',
            toolName: 'data.query',
            message: aggregateAliasMismatch.message,
            shouldStop: false,
            retryHint: aggregateAliasMismatch.message,
            observation: {
                type: 'tool_result',
                status: 'error',
                summary: aggregateAliasMismatch.message,
                toolName: 'data.query',
                code: 'validation_failed',
                detail: {
                    semanticCode: aggregateAliasMismatch.code,
                    column: aggregateAliasMismatch.column,
                    alternativeColumn: aggregateAliasMismatch.alternativeColumn,
                },
            },
        };
    }

    try {
        throwIfAborted(abortSignal);

        // --- Raw SQL passthrough: when the AI provides valid SQL (e.g., UNPIVOT/UNION ALL) ---
        if (augmentedPlan.rawSql) {
            console.log(`${LOG_PREFIX} Raw SQL passthrough detected, bypassing structured compilation.`);
            const rawExecution = await executeRawSqlQuery(
                preferredDataset,
                augmentedPlan.rawSql,
                augmentedPlan.select ?? [],
                {
                    limit: augmentedPlan.limit ?? 500,
                    abortSignal,
                    reportDiagnostics: createWorkerDiagnosticsTelemetryReporter(store),
                    columnRegistry,
                },
            );
            throwIfAborted(abortSignal);

            // Store as activeDataQuery so subsequent create_plan can bind to these columns
            const rawActiveDataQuery: ActiveDataQuery = {
                ...resolveDatasetScopeBinding(getState().datasetBundle),
                explanation: normalizedPayload.explanation,
                plan: augmentedPlan,
                result: rawExecution.result,
                appliedAt: new Date(),
                source: 'execute_data_query',
                engine: rawExecution.engine,
                sqlPreview: rawExecution.sqlPreview ?? augmentedPlan.rawSql,
                tableName: rawExecution.tableName ?? 'session_clean_dataset',
                loadVersion: rawExecution.loadVersion ?? null,
            };
            setState({ activeDataQuery: rawActiveDataQuery });

            return {
                status: 'success',
                toolName: 'data.query',
                message: normalizedPayload.explanation,
                shouldStop: false,
                artifactMetadata: {
                    type: 'data_query',
                    engine: rawExecution.engine,
                    queryMode: 'raw_sql',
                    rowCount: rawExecution.result.returnedRows,
                    columnCount: rawExecution.result.selectedColumns.length,
                    selectedColumns: rawExecution.result.selectedColumns,
                    truncated: rawExecution.result.truncated,
                    sqlPreview: rawExecution.sqlPreview ?? null,
                },
                artifacts: { activeDataQuery: rawActiveDataQuery },
            };
        }

        // --- Structured UNPIVOT: when the AI provides unpivotParams ---
        if (normalizedPayload.unpivotParams) {
            console.log(`${LOG_PREFIX} Structured unpivot detected.`);
            const { executeUnifiedQuery } = await import('../../duckdb/unifiedQueryExecutor');
            const { primeDuckDbDataset } = await import('../../duckdb/queryEngine');
            const prime = await primeDuckDbDataset(preferredDataset, abortSignal);
            if (prime.engine !== 'duckdb') {
                throw new Error('UNPIVOT requires DuckDB to be available.');
            }
            const unpivotResult = await executeUnifiedQuery(
                {
                    kind: 'unpivot',
                    purpose: normalizedPayload.explanation,
                    unpivotParams: normalizedPayload.unpivotParams,
                },
                {
                    binding: { tableName: prime.tableName!, loadVersion: prime.loadVersion! },
                    allowedColumns: actualDataColumns,
                    columnRegistry,
                    directives: steering ? {
                        detailRowColumn: steering.detailRowColumn ?? null,
                        detailRowValue: steering.detailRowValue ?? null,
                        detailRowFilter: steering.detailRowFilter ?? null,
                        hierarchyColumn: steering.hierarchyColumn ?? null,
                        excludeFromAggregation: steering.excludeFromAggregation ?? [],
                        preferGroupBy: steering.preferGroupBy ?? [],
                        blockGroupBy: steering.blockGroupBy ?? [],
                        recommendedTopN: null,
                    } as import('../../duckdb/directiveInjector').RuntimeDirectives : null,
                },
            );
            throwIfAborted(abortSignal);

            const unpivotActiveDataQuery: ActiveDataQuery = {
                ...resolveDatasetScopeBinding(getState().datasetBundle),
                explanation: normalizedPayload.explanation,
                plan: augmentedPlan,
                result: {
                    rows: unpivotResult.rows as import('../../../types').CsvRow[],
                    totalMatchedRows: unpivotResult.totalMatchedRows,
                    returnedRows: unpivotResult.returnedRows,
                    truncated: false,
                    selectedColumns: unpivotResult.selectedColumns,
                    appliedOrderBy: [],
                    appliedLimit: normalizedPayload.unpivotParams.limit ?? 500,
                    durationMs: unpivotResult.durationMs,
                },
                appliedAt: new Date(),
                source: 'execute_data_query',
                engine: unpivotResult.engine,
                sqlPreview: unpivotResult.sqlPreview,
                tableName: prime.tableName!,
                loadVersion: prime.loadVersion!,
            };
            setState({ activeDataQuery: unpivotActiveDataQuery });

            return {
                status: 'success',
                toolName: 'data.query',
                message: normalizedPayload.explanation,
                shouldStop: false,
                artifactMetadata: {
                    type: 'data_query',
                    engine: unpivotResult.engine,
                    queryMode: 'unpivot',
                    rowCount: unpivotResult.returnedRows,
                    columnCount: unpivotResult.selectedColumns.length,
                    selectedColumns: unpivotResult.selectedColumns,
                    truncated: false,
                    sqlPreview: unpivotResult.sqlPreview ?? null,
                },
                artifacts: { activeDataQuery: unpivotActiveDataQuery },
            };
        }

        const activeDataQuery = await executeStructuredDataQuery(store, {
            datasetOverride: preferredDataset,
            explanation: normalizedPayload.explanation,
            plan: augmentedPlan,
            phase,
            origin: 'chat',
            fallbackFilterOperation: fallbackOperation ?? null,
            allowedColumnsOverride: actualDataColumns,
            columnRegistryOverride: columnRegistry,
            policyReason: governance.decision?.reason ?? null,
            toolCategory: governance.descriptor?.category ?? 'data',
            appendChatTrace: true,
            appendCleaningRunTrace: true,
            scrollToRawDataExplorer: true,
            allowNativeFallback: true,
            progressMessage: `AI is running a read-only data query: ${normalizedPayload.explanation}`,
            abortSignal,
            dimensionNormalization: {
                ...DEFAULT_DIMENSION_NORMALIZATION,
                shouldNormalize: buildColumnTypeGate(state.columnProfiles),
            },
        });
        throwIfAborted(abortSignal);

        const semanticMismatch = validateGroupedQuerySemantics({
            plan: activeDataQuery.plan,
            resultRows: activeDataQuery.result.rows,
            datasetRows: preferredDataset.data,
        });
        if (semanticMismatch) {
            setState({ activeDataQuery: null });
            return {
                status: 'error',
                toolName: 'data.query',
                message: semanticMismatch.message,
                shouldStop: false,
                retryHint: semanticMismatch.message,
                observation: {
                    type: 'tool_result',
                    status: 'error',
                    summary: semanticMismatch.message,
                    toolName: 'data.query',
                    code: 'validation_failed',
                    detail: {
                        semanticCode: semanticMismatch.code,
                        column: semanticMismatch.column,
                        alternativeColumn: semanticMismatch.alternativeColumn,
                    },
                },
            };
        }

        const queryMode = activeDataQuery.plan.groupBy?.length || activeDataQuery.plan.aggregates?.length
            ? 'aggregate'
            : activeDataQuery.plan.where
                ? 'filtered'
                : 'preview';
        const orderVerification = summarizeOrderVerification(
            activeDataQuery.result.rows,
            activeDataQuery.result.appliedOrderBy,
        );
        return {
            status: 'success',
            toolName: 'data.query',
            message: activeDataQuery.explanation,
            shouldStop: false,
            artifactMetadata: {
                artifactType: 'data_query',
                metricDefinition: normalizedPayload.plan.aggregates?.map(aggregate => aggregate.as) ?? [],
                grain: normalizedPayload.plan.groupBy ?? [],
                sourceArtifactIds: [],
            },
            observation: {
                type: 'tool_result',
                status: 'success',
                summary: `${queryMode} data.query returned ${activeDataQuery.result.returnedRows} of ${activeDataQuery.result.totalMatchedRows} rows.`,
                toolName: 'data.query',
                queryMode,
                detail: {
                    engine: activeDataQuery.engine,
                    sqlPreview: activeDataQuery.sqlPreview,
                    queryMode,
                    returnedRows: activeDataQuery.result.returnedRows,
                    totalMatchedRows: activeDataQuery.result.totalMatchedRows,
                    selectedColumns: activeDataQuery.result.selectedColumns,
                    truncated: activeDataQuery.result.truncated,
                    whereColumns: getWhereColumns(activeDataQuery.plan.where),
                    orderVerification,
                    artifactMetadata: {
                        artifactType: 'data_query',
                        metricDefinition: normalizedPayload.plan.aggregates?.map(aggregate => aggregate.as) ?? [],
                        grain: normalizedPayload.plan.groupBy ?? [],
                        sourceArtifactIds: [],
                    },
                },
            },
            artifacts: {
                activeDataQuery,
            },
        };
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (fallbackOperation && !preferredDataset.backing?.readOnly) {
            const fallbackPlan = createQueryPlanFromFilterOperation(fallbackOperation, { limit: action.args.plan.limit });
            throwIfAborted(abortSignal);
            const fallbackResult = await executeDataQueryWithWorker(queryInput, fallbackPlan, {
                allowedColumns: actualDataColumns,
                maxRows: 500,
                maxColumns: 50,
                maxOrderBy: 3,
                timeoutMs: 1500,
                abortSignal,
                reportDiagnostics: createWorkerDiagnosticsTelemetryReporter(store),
            });
            throwIfAborted(abortSignal);
            const activeDataQuery: ActiveDataQuery = {
                ...resolveDatasetScopeBinding(getState().datasetBundle),
                sessionId: getState().sessionId,
                turnId: activeTurn?.turnId,
                stepId: activeStep?.stepId,
                explanation: `${action.args.explanation} (fallback filter)`,
                plan: {
                    select: fallbackResult.selectedColumns,
                    where: fallbackPlan.where,
                    orderBy: fallbackResult.appliedOrderBy,
                    limit: fallbackResult.appliedLimit,
                },
                result: fallbackResult,
                appliedAt: new Date(),
                source: 'execute_data_query',
                engine: 'native',
                sqlPreview: null,
                tableName: null,
                loadVersion: null,
                fallbackReason: errorMessage,
                fallbackFilterOperation: fallbackOperation,
            };
            throwIfAborted(abortSignal);
            setState({
                activeDataQuery,
                activeSpreadsheetFilter: null,
                spreadsheetFilterFunction: null,
                aiFilterExplanation: null,
                isSpreadsheetVisible: true,
            });
            throwIfAborted(abortSignal);
            setState(prev => ({
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: `**${getDataQueryTraceLabel(phase, activeDataQuery.plan, activeDataQuery.fallbackFilterOperation)}**\n${activeDataQuery.explanation}\nEngine: \`${activeDataQuery.engine}\` | Rows: ${activeDataQuery.result.returnedRows}/${activeDataQuery.result.totalMatchedRows} | Duration: ${activeDataQuery.result.durationMs}ms${activeDataQuery.fallbackReason ? `\nFallback: ${activeDataQuery.fallbackReason}` : ''}`,
                        timestamp: new Date(),
                        type: 'ai_query_trace',
                        queryTrace: {
                            sessionId: activeDataQuery.sessionId,
                            turnId: activeDataQuery.turnId,
                            stepId: activeDataQuery.stepId,
                            phase,
                            engine: activeDataQuery.engine,
                            sqlPreview: activeDataQuery.sqlPreview,
                            returnedRows: activeDataQuery.result.returnedRows,
                            totalMatchedRows: activeDataQuery.result.totalMatchedRows,
                            durationMs: activeDataQuery.result.durationMs,
                            fallbackReason: activeDataQuery.fallbackReason ?? null,
                        },
                    }),
                ],
                queryHistory: appendQueryHistory(prev.queryHistory ?? [], createQueryTraceEntry(activeDataQuery, phase, {
                    origin: 'chat',
                    policyReason: governance.decision?.reason ?? null,
                    toolCategory: governance.descriptor?.category ?? 'data',
                })),
            }));
            throwIfAborted(abortSignal);
            getState().logAgentToolUsage({
                tool: 'data.query',
                description: `${action.args.explanation} (fallback filter)`,
                detail: {
                    error: errorMessage,
                    fallbackOperation,
                    totalMatchedRows: fallbackResult.totalMatchedRows,
                    returnedRows: fallbackResult.returnedRows,
                    truncated: fallbackResult.truncated,
                },
            });
            throwIfAborted(abortSignal);
            getState().addProgress(`Read-only query fell back to compatibility filter: ${errorMessage}`, 'system');
            return {
                status: 'success',
                toolName: 'data.query',
                message: `${normalizedPayload.explanation} (fallback filter)`,
                shouldStop: false,
                observation: {
                    type: 'tool_result',
                    status: 'success',
                    summary: `filtered data.query fallback returned ${fallbackResult.returnedRows} of ${fallbackResult.totalMatchedRows} rows.`,
                    toolName: 'data.query',
                    queryMode: 'filtered',
                    detail: {
                        fallbackReason: errorMessage,
                        queryMode: 'filtered',
                        returnedRows: fallbackResult.returnedRows,
                        totalMatchedRows: fallbackResult.totalMatchedRows,
                        selectedColumns: fallbackResult.selectedColumns,
                        truncated: fallbackResult.truncated,
                        whereColumns: getWhereColumns(fallbackPlan.where),
                        orderVerification: summarizeOrderVerification(
                            fallbackResult.rows,
                            fallbackResult.appliedOrderBy,
                        ),
                    },
                },
            };
        }

        getState().logAgentToolUsage({
            tool: 'data.query',
            description: normalizedPayload.explanation,
            detail: {
                error: errorMessage,
                plan: normalizedPayload.plan,
            },
        });
        const repairGuidance = getDataQueryRepairGuidance(errorMessage, {
            availableColumns: getState().columnProfiles?.map(p => p.name),
        });
        const isRecoverableQueryShapeError = repairGuidance.repairHintCategories.length > 0;
        getState().addProgress(
            `AI data query failed: ${errorMessage}`,
            isRecoverableQueryShapeError ? 'system' : 'error',
        );
        return {
            status: isRecoverableQueryShapeError ? 'blocked' : 'error',
            toolName: 'data.query',
            message: errorMessage,
            shouldStop: false,
            retryHint: isRecoverableQueryShapeError ? repairGuidance.repairHint : errorMessage,
            observation: {
                type: isRecoverableQueryShapeError ? 'runtime_error' : 'tool_result',
                status: isRecoverableQueryShapeError ? 'blocked' : 'error',
                summary: errorMessage,
                toolName: 'data.query',
                code: isRecoverableQueryShapeError ? 'validation_failed' : undefined,
                retryHint: isRecoverableQueryShapeError ? repairGuidance.repairHint : errorMessage,
                detail: isRecoverableQueryShapeError
                    ? {
                        repairHint: repairGuidance.repairHint,
                        repairHintCategory: repairGuidance.repairHintCategory,
                        repairHintCategories: repairGuidance.repairHintCategories,
                    }
                    : undefined,
            },
        };
    }
};

export const executeFilterAction = async (
    query: string,
    store: StoreApi,
    origin: 'chat' | 'spreadsheet_panel' = 'chat',
    abortSignal?: AbortSignal,
) : Promise<ToolExecutionResult> => {
    const { getState, setState } = store;
    console.log(`${LOG_PREFIX} Filtering spreadsheet with query: ${query}`);
    getState().addProgress('AI is filtering data explorer.');
    throwIfAborted(abortSignal);
    const activeSpreadsheetFilter = await runSpreadsheetFilter(query, store, { origin }, abortSignal);
    throwIfAborted(abortSignal);
    setState({ isSpreadsheetVisible: true });
    if (typeof document !== 'undefined') {
        setTimeout(() => document.getElementById('raw-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    return {
        status: 'success',
        toolName: 'spreadsheet.filter',
        message: activeSpreadsheetFilter.finalReply,
        shouldStop: false,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: activeSpreadsheetFilter.finalReply,
            toolName: 'spreadsheet.filter',
            queryMode: 'filtered',
            detail: {
                matchedRowCount: activeSpreadsheetFilter.observation.matchedRowCount,
                selectedColumn: activeSpreadsheetFilter.observation.selectedColumn,
                operator: activeSpreadsheetFilter.observation.operator,
                value: activeSpreadsheetFilter.observation.value,
            },
        },
        artifacts: {
            activeSpreadsheetFilter,
        },
    };
};

export const executeCorrelationAction = async (action: AiAction, store: StoreApi): Promise<ToolExecutionResult> => {
    if (action.type !== 'tool_call' || !action.args) {
        return {
            status: 'error',
            toolName: 'analysis.correlation',
            message: 'Correlation analysis payload is missing.',
            shouldStop: false,
        };
    }
    if (getPreferredAnalysisDataset(store.getState())?.backing?.readOnly) {
        return {
            status: 'blocked',
            toolName: 'analysis.correlation',
            message: 'Correlation is unavailable in large-file read-only mode because it would otherwise run only on the preview sample.',
            shouldStop: false,
            retryHint: 'Use governed SQL aggregations on the complete dataset, or import a smaller CSV for row-level statistical analysis.',
        };
    }
    return executeStatisticalAnalysis(action.args as StatisticalAnalysisRequest, store);
};

// ─── Reshape Tools ────────────────────────────────────────────────────

export const executeReshapeAction = async (
    action: AiAction,
    store: StoreApi,
    abortSignal?: AbortSignal,
): Promise<ToolExecutionResult> => {
    const { getState } = store;
    const csvData = getState().csvData;
    if (!csvData) {
        return {
            status: 'error',
            toolName: 'data.reshape',
            message: 'No dataset available for reshape.',
            shouldStop: false,
        };
    }

    const args = (action.type === 'tool_call' ? action.args : null) ?? {};
    const sourceColumns: string[] = args.sourceColumns ?? [];
    const keepColumns: string[] = args.keepColumns ?? [];
    const keyColumn: string = args.keyColumn ?? 'Period';
    const valueColumn: string = args.valueColumn ?? 'Value';
    const reason: string = args.reason ?? '';

    const rowCountBefore = csvData.data.length;

    // Build an unpivot_columns operation and delegate to data.mutate
    const reshapeAction: AiAction = {
        type: 'tool_call',
        toolName: 'data.mutate',
        thought: `Reshape: ${reason}`,
        args: {
            explanation: `Reshape wide-format dataset into long format: ${reason}`,
            operations: [{
                id: 'agent_reshape_wide_pivot',
                type: 'unpivot_columns',
                reason,
                sourceColumns,
                keyColumn,
                valueColumn,
                keepColumns,
                sourceColumnNameColumn: 'SourceColumnName',
            }],
        },
    };

    const result = await executeDataOperationsAction(reshapeAction, store, abortSignal);

    // Capture row count after reshape for quality check
    const rowCountAfter = getState().csvData?.data.length ?? 0;
    const retentionRatio = rowCountBefore > 0 ? rowCountAfter / rowCountBefore : 1;

    console.log(
        `${LOG_PREFIX} data.reshape: ${rowCountBefore} → ${rowCountAfter} rows (${(retentionRatio * 100).toFixed(1)}% retention)`,
    );

    // Enrich the observation with reshape-specific metadata
    return {
        ...result,
        toolName: 'data.reshape',
        observation: {
            type: 'tool_result',
            status: result.status === 'success' ? 'success' : result.status,
            summary: `Reshaped dataset from ${rowCountBefore} to ${rowCountAfter} rows (${sourceColumns.length} columns unpivoted). Retention: ${(retentionRatio * 100).toFixed(1)}%.`,
            toolName: 'data.reshape',
            detail: {
                rowCountBefore,
                rowCountAfter,
                retentionRatio,
                sourceColumns,
                keepColumns,
                keyColumn,
                valueColumn,
                reshapeQuality: retentionRatio < 0.01 ? 'catastrophic_loss' : retentionRatio < 0.1 ? 'severe_loss' : 'normal',
            },
        },
    };
};

export const executeKeepWideAction = (
    action: AiAction,
    store: StoreApi,
): ToolExecutionResult => {
    const reason = (action.type === 'tool_call' ? action.args?.reason : null) ?? 'Agent decided to keep wide format.';
    console.log(`${LOG_PREFIX} data.keep_wide: ${reason}`);

    // Record the decision in the agent's analysis session
    const state = store.getState();
    const session = state.latestAnalysisSession;
    if (session?.analysisSteering) {
        // Mark that reshape was explicitly skipped by agent decision
        store.setState(prev => {
            const updatedSession = prev.latestAnalysisSession;
            if (!updatedSession?.analysisSteering) return {};
            return {
                latestAnalysisSession: {
                    ...updatedSession,
                    analysisSteering: {
                        ...updatedSession.analysisSteering,
                        reshapeDecision: null,
                        reshapeDecisionReasons: [
                            ...(updatedSession.analysisSteering.reshapeDecisionReasons ?? []),
                            'agent_decided_keep_wide',
                            reason,
                        ],
                    },
                },
            };
        });
    }

    return {
        status: 'success',
        toolName: 'data.keep_wide',
        message: `Dataset kept in wide format: ${reason}`,
        shouldStop: false,
        observation: {
            type: 'tool_result',
            status: 'success',
            summary: `Agent decided to keep dataset in wide format. Reason: ${reason}. Analysis will use existing columns directly.`,
            toolName: 'data.keep_wide',
            detail: { reason },
        },
    };
};
