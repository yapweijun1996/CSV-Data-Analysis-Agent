import type {
    ActiveDataQuery,
    ColumnRegistry,
    CsvData,
    FilterRowsOperation,
    QueryPlan,
    QueryTraceEntry,
    QueryTraceOrigin,
    ToolCategory,
    WorkspaceDataQueryRequest,
    WorkspaceQueryTemplateId,
} from '../../../types';
import { executeManagedDataQuery } from '../../duckdb/queryEngine';
import type { DimensionNormalizationConfig } from '../../duckdb/dimensionNormalization';
import { getTranslation } from '../../../utils/localization';
import {
    createDuckDbSessionErrorStatus,
    createDuckDbSessionStatusFromExecution,
} from '../../duckdb/sessionStatus';
import { appendQueryHistory, createQueryTraceEntry } from '../queryTraceState';
import { appendCleaningRunStep } from '../cleaningRunState';
import { WORKSPACE_DATASET_CLEAN_CSV } from '../workspaceFileUtils';
import { isRuntimeAbortError, throwIfAborted } from '../runtime/runtimeAbort';
import { getDataQueryTraceLabel } from './dataQueryContract';
import { normalizeQueryWhereClauseLike } from './dataOperationNormalization';
import type { StoreApi } from '../types';
import { createChatMessage } from '../../../utils/messageState';
import {
    createWorkerDiagnosticsTelemetryReporter,
    estimateSerializableBytes,
    getNowMs,
    logQueryStoreCommitDiagnostics,
} from '../../workers/workerDiagnostics';
import { buildEffectiveColumnRegistryFromState, getAllowedColumns, resolveColumnReference } from '../../data/columnRegistry';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { resolveDatasetScopeBinding } from '../../data/datasetBundle';

const normalizeColumnIdentifier = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

const resolveSourceColumnReference = (
    column: string,
    columnRegistry: ColumnRegistry | null | undefined,
) => resolveColumnReference(column, columnRegistry) ?? column;

const buildAggregateAliasSet = (plan: QueryPlan): Set<string> =>
    new Set(
        (plan.aggregates ?? [])
            .map(aggregate => normalizeColumnIdentifier(aggregate.as))
            .filter(Boolean),
    );

const resolveAggregateOutputReference = (
    column: string,
    columnRegistry: ColumnRegistry | null | undefined,
    aggregateAliases: Set<string>,
) => aggregateAliases.has(normalizeColumnIdentifier(column))
    ? column
    : resolveSourceColumnReference(column, columnRegistry);

const canonicalizeWhereClause = (
    where: QueryPlan['where'],
    columnRegistry: ColumnRegistry | null | undefined,
): QueryPlan['where'] => {
    if (!where) {
        return where;
    }
    return {
        ...(where.predicates
            ? {
                predicates: where.predicates.map(predicate => ({
                    ...predicate,
                    column: resolveSourceColumnReference(predicate.column, columnRegistry),
                })),
            }
            : {}),
        ...(where.groups
            ? {
                groups: where.groups.map(group => ({
                    predicates: group.predicates.map(predicate => ({
                        ...predicate,
                        column: resolveSourceColumnReference(predicate.column, columnRegistry),
                    })),
                })),
            }
            : {}),
    };
};

const canonicalizeQueryPlan = (
    plan: QueryPlan,
    columnRegistry: ColumnRegistry | null | undefined,
): QueryPlan => {
    const aggregateAliases = buildAggregateAliasSet(plan);
    return {
        ...plan,
        ...(plan.select
            ? {
                select: plan.select.map(column => resolveAggregateOutputReference(column, columnRegistry, aggregateAliases)),
            }
            : {}),
        ...(plan.where ? { where: canonicalizeWhereClause(plan.where, columnRegistry) } : {}),
        ...(plan.groupBy
            ? {
                groupBy: plan.groupBy.map(column => resolveSourceColumnReference(column, columnRegistry)),
            }
            : {}),
        ...(plan.aggregates
            ? {
                aggregates: plan.aggregates.map(aggregate => ({
                    ...aggregate,
                    ...(aggregate.column ? { column: resolveSourceColumnReference(aggregate.column, columnRegistry) } : {}),
                    ...(aggregate.where ? { where: canonicalizeWhereClause(aggregate.where, columnRegistry) } : {}),
                })),
            }
            : {}),
        ...(plan.postAggregateFilter
            ? {
                postAggregateFilter: {
                    ...(plan.postAggregateFilter.predicates
                        ? {
                            predicates: plan.postAggregateFilter.predicates.map(predicate => ({
                                ...predicate,
                                column: resolveAggregateOutputReference(predicate.column, columnRegistry, aggregateAliases),
                            })),
                        }
                        : {}),
                    ...(plan.postAggregateFilter.groups
                        ? {
                            groups: plan.postAggregateFilter.groups.map(group => ({
                                predicates: group.predicates.map(predicate => ({
                                    ...predicate,
                                    column: resolveAggregateOutputReference(predicate.column, columnRegistry, aggregateAliases),
                                })),
                            })),
                        }
                        : {}),
                },
            }
            : {}),
        ...(plan.orderBy
            ? {
                orderBy: plan.orderBy.map(order => ({
                    ...order,
                    column: resolveAggregateOutputReference(order.column, columnRegistry, aggregateAliases),
                })),
            }
            : {}),
    };
};

interface ExecuteStructuredDataQueryOptions {
    datasetOverride?: CsvData;
    explanation: string;
    plan: QueryPlan;
    phase: QueryTraceEntry['phase'];
    origin: QueryTraceOrigin;
    fallbackFilterOperation?: FilterRowsOperation | null;
    templateId?: WorkspaceQueryTemplateId;
    formSnapshot?: WorkspaceDataQueryRequest;
    policyReason?: string | null;
    /** Override column names for query compilation validation.
     *  When provided, used instead of columnProfiles.map(p => p.name).
     *  Use actual data row keys to match DuckDB table columns. */
    allowedColumnsOverride?: string[];
    columnRegistryOverride?: ColumnRegistry | null;
    toolCategory?: ToolCategory | 'unknown';
    appendChatTrace?: boolean;
    appendCleaningRunTrace?: boolean;
    scrollToRawDataExplorer?: boolean;
    allowNativeFallback?: boolean;
    progressMessage?: string;
    abortSignal?: AbortSignal;
    /** Dimension normalization config for GROUP BY columns. */
    dimensionNormalization?: DimensionNormalizationConfig | null;
    onTraceCommitted?: (entry: QueryTraceEntry) => void;
}

const appendQueryTraceMessage = (
    store: StoreApi,
    query: ActiveDataQuery,
    options: Pick<ExecuteStructuredDataQueryOptions, 'phase' | 'origin' | 'templateId' | 'formSnapshot' | 'policyReason' | 'toolCategory' | 'appendChatTrace'>,
): QueryTraceEntry => {
    const entry = createQueryTraceEntry(query, options.phase, {
        origin: options.origin,
        templateId: options.templateId,
        formSnapshot: options.formSnapshot,
        policyReason: options.policyReason ?? null,
        toolCategory: options.toolCategory ?? 'data',
    });

    store.setState(prev => ({
        ...(options.appendChatTrace
            ? {
                chatHistory: [
                    ...prev.chatHistory,
                    createChatMessage({
                        sender: 'ai',
                        text: `**${getDataQueryTraceLabel(options.phase, query.plan, query.fallbackFilterOperation)}**\n${query.explanation}\nRows: ${query.result.returnedRows}/${query.result.totalMatchedRows} | Duration: ${query.result.durationMs}ms${query.fallbackReason ? '\nThe query ran in degraded mode; review technical details if needed.' : ''}`,
                        timestamp: new Date(),
                        type: 'ai_query_trace',
                        queryTrace: {
                            sessionId: entry.sessionId,
                            runId: entry.runId,
                            turnId: entry.turnId,
                            stepId: entry.stepId,
                            toolCallId: entry.toolCallId,
                            phase: options.phase,
                            engine: query.engine,
                            sqlPreview: query.sqlPreview,
                            returnedRows: query.result.returnedRows,
                            totalMatchedRows: query.result.totalMatchedRows,
                            durationMs: query.result.durationMs,
                            fallbackReason: query.fallbackReason ?? null,
                        },
                    }),
                ],
            }
            : {}),
        queryHistory: appendQueryHistory(prev.queryHistory ?? [], entry),
    }));
    return entry;
};

export const executeStructuredDataQuery = async (
    store: StoreApi,
    options: ExecuteStructuredDataQueryOptions,
): Promise<ActiveDataQuery> => {
    const { getState, setState } = store;
    const dataset = options.datasetOverride ?? getPreferredAnalysisDataset(getState());
    const abortSignal = options.abortSignal;
    const activeTurn = getState().activeTurn;
    const activeStep = activeTurn?.steps.at(-1);
    if (!dataset) {
        throw new Error('No dataset is available for read-only data querying.');
    }

    const columnRegistry = options.columnRegistryOverride ?? buildEffectiveColumnRegistryFromState(getState(), {
        datasetOverride: dataset,
    });
    const canonicalPlan = canonicalizeQueryPlan(options.plan, columnRegistry);
    const normalizedWhere = normalizeQueryWhereClauseLike(canonicalPlan.where);
    const allowedColumns = options.allowedColumnsOverride && options.allowedColumnsOverride.length > 0
        ? options.allowedColumnsOverride
        : getAllowedColumns(columnRegistry, 'select').length > 0
            ? getAllowedColumns(columnRegistry, 'select')
            : getState().columnProfiles.map(profile => profile.name);
    const executionPlan = {
        ...canonicalPlan,
        ...(normalizedWhere ? { where: normalizedWhere } : {}),
    };
    if (!normalizedWhere) {
        delete executionPlan.where;
    }

    if (options.progressMessage) {
        getState().addProgress(options.progressMessage);
    }

    let execution;
    const reportDiagnostics = createWorkerDiagnosticsTelemetryReporter(store);
    const language = getState().settings.language;
    const onSlowLoad = () => {
        const message = getTranslation('duckdb_load_slow', language);
        if (typeof getState().addProgress === 'function') {
            getState().addProgress(message, 'warning');
        }
    };
    try {
        throwIfAborted(abortSignal);
        execution = await executeManagedDataQuery(
            dataset,
            executionPlan,
            allowedColumns,
            {
                allowNativeFallback: options.allowNativeFallback,
                abortSignal,
                reportDiagnostics,
                columnRegistry,
                onSlowLoad,
                ...(options.dimensionNormalization ? { dimensionNormalization: options.dimensionNormalization } : {}),
            },
        );
        throwIfAborted(abortSignal);
    } catch (error) {
        if (isRuntimeAbortError(error, abortSignal)) {
            throw error;
        }
        setState({
            duckDbSessionStatus: createDuckDbSessionErrorStatus(error, getState().duckDbSessionStatus, new Date(), 'query_failed'),
        });
        throw error;
    }

    const normalizedPlan = {
        select: execution.result.selectedColumns,
        ...(executionPlan.where ? { where: executionPlan.where } : {}),
        orderBy: execution.result.appliedOrderBy,
        limit: execution.result.appliedLimit,
        ...(Array.isArray(executionPlan.groupBy) && executionPlan.groupBy.length > 0
            ? { groupBy: executionPlan.groupBy }
            : {}),
        ...(Array.isArray(executionPlan.aggregates) && executionPlan.aggregates.length > 0
            ? { aggregates: executionPlan.aggregates }
            : {}),
    };

    const activeDataQuery: ActiveDataQuery = {
        ...resolveDatasetScopeBinding(getState().datasetBundle),
        sessionId: getState().sessionId,
        runId: activeTurn?.runId,
        turnId: activeTurn?.turnId,
        stepId: activeStep?.stepId,
        toolCallId: activeStep?.toolCallId ?? activeStep?.stepId,
        explanation: options.explanation,
        plan: normalizedPlan,
        result: execution.result,
        appliedAt: new Date(),
        source: 'execute_data_query',
        engine: execution.engine,
        sqlPreview: execution.sqlPreview,
        tableName: execution.tableName,
        loadVersion: execution.loadVersion,
        fallbackReason: execution.fallbackReason,
        fallbackStage: execution.fallbackStage,
        fallbackFilterOperation: options.fallbackFilterOperation ?? null,
    };

    throwIfAborted(abortSignal);
    const storeCommitStartedAt = getNowMs();
    setState({
        activeDataQuery,
        activeSpreadsheetFilter: null,
        spreadsheetFilterFunction: null,
        aiFilterExplanation: null,
        isSpreadsheetVisible: true,
        duckDbSessionStatus: createDuckDbSessionStatusFromExecution(execution),
    });

    throwIfAborted(abortSignal);
    const committedTrace = appendQueryTraceMessage(store, activeDataQuery, options);
    options.onTraceCommitted?.(committedTrace);
    const storeCommitMs = getNowMs() - storeCommitStartedAt;
    logQueryStoreCommitDiagnostics(store, {
        engine: execution.engine,
        storeCommitMs,
        returnedRows: execution.result.returnedRows,
        totalMatchedRows: execution.result.totalMatchedRows,
        selectedColumnCount: execution.result.selectedColumns.length,
        truncated: execution.result.truncated,
        // estimateSerializableBytes is expensive (JSON.stringify); skip in production.
        resultBytes: import.meta.env.DEV ? estimateSerializableBytes(execution.result) : 0,
        fallbackReason: execution.fallbackReason,
        fallbackStage: execution.fallbackStage,
    });

    throwIfAborted(abortSignal);
    getState().logAgentToolUsage({
        tool: 'data.query',
        description: options.explanation,
        detail: {
            runId: activeTurn?.runId ?? null,
            toolCallId: activeStep?.toolCallId ?? activeStep?.stepId ?? null,
            plan: normalizedPlan,
            engine: execution.engine,
            sqlPreview: execution.sqlPreview,
            tableName: execution.tableName,
            loadVersion: execution.loadVersion,
            fallbackReason: execution.fallbackReason,
            fallbackStage: execution.fallbackStage,
            totalMatchedRows: execution.result.totalMatchedRows,
            returnedRows: execution.result.returnedRows,
            truncated: execution.result.truncated,
            selectedColumns: execution.result.selectedColumns,
            appliedOrderBy: execution.result.appliedOrderBy,
            durationMs: execution.result.durationMs,
            origin: options.origin,
            templateId: options.templateId ?? null,
            fallbackAvailable: Boolean(options.fallbackFilterOperation),
        },
    });

    if (options.appendCleaningRunTrace) {
        throwIfAborted(abortSignal);
        setState(prev => ({
            cleaningRun: prev.cleaningRun
                ? appendCleaningRunStep(prev.cleaningRun, {
                    kind: 'verify',
                    toolName: 'data.query',
                    path: WORKSPACE_DATASET_CLEAN_CSV,
                    diffSummary: `Verified cleaned dataset with ${execution.engine} query.`,
                    status: 'done',
                })
                : prev.cleaningRun,
        }));
    }

    if (execution.fallbackStage === 'bind_failed' || execution.fallbackStage === 'query_failed') {
        throwIfAborted(abortSignal);
        getState().logAgentToolUsage({
            tool: 'duckdb_query_engine',
            description: 'DuckDB query execution fell back to native executor.',
            detail: {
                fallbackStage: execution.fallbackStage,
                error: execution.fallbackReason,
                sqlPreview: execution.sqlPreview,
                tableName: execution.tableName,
                loadVersion: execution.loadVersion,
            },
        });
    }

    if (options.scrollToRawDataExplorer && typeof window !== 'undefined' && typeof document !== 'undefined') {
        throwIfAborted(abortSignal);
        window.setTimeout(() => document.getElementById('raw-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }

    return activeDataQuery;
};
